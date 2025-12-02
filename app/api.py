from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import FileResponse, JSONResponse
from jose import JWTError, jwt
from passlib.context import CryptContext
import os
router = APIRouter()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
JWT_ALGO = 'HS256'

security = HTTPBearer()

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    token = creds.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail='Invalid or expired token')

async def get_current_admin(user: dict = Depends(get_current_user)):
    if not user or user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin privileges required')
    return user

# ===== List stored procedures and their parameters =====
@router.get('/report/stored-procedures')
async def list_stored_procedures(_admin=Depends(get_current_admin)):
    """Return a list of stored procedures and their parameters from the report DB."""
    conn = _get_report_data_conn()
    if not conn:
        raise HTTPException(status_code=503, detail='Report DB connection unavailable')
    try:
        cur = conn.cursor()
        # List all user stored procedures
        cur.execute("""
            SELECT SPECIFIC_NAME FROM INFORMATION_SCHEMA.ROUTINES
            WHERE ROUTINE_TYPE = 'PROCEDURE' AND ROUTINE_SCHEMA = 'dbo'
            ORDER BY SPECIFIC_NAME
        """)
        sps = [row[0] for row in cur.fetchall()]
        # For each, get parameters
        result = []
        for sp in sps:
            cur.execute("""
                SELECT PARAMETER_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, PARAMETER_MODE
                FROM INFORMATION_SCHEMA.PARAMETERS
                WHERE SPECIFIC_NAME = ?
                ORDER BY ORDINAL_POSITION
            """, (sp,))
            params = [
                {
                    'name': r[0],
                    'type': r[1],
                    'max_length': r[2],
                    'mode': r[3]
                } for r in cur.fetchall()
            ]
            result.append({'name': sp, 'parameters': params})
        cur.close()
        return {'procedures': result}
    finally:
        conn.close()
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
from . import db
import datetime
import json
import pyodbc
from jose import JWTError, jwt
from passlib.context import CryptContext
import os
import re
import urllib.parse
import platform
import csv
from sqlalchemy import func, select
import logging
import traceback
import pandas as pd
import io
import tempfile
import requests
from fastapi.responses import FileResponse, JSONResponse
from . import db_connection as dbc

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('api_errors.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

router = APIRouter()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
JWT_ALGO = 'HS256'

security = HTTPBearer()

def _safe_cell(x):
    if x is None:
        return None
    if isinstance(x, (int, float, str)):
        return x
    # Try datetime conversion
    try:
        import datetime as _dt
        if isinstance(x, (_dt.datetime, _dt.date)):
            return x.isoformat()
    except Exception:
        pass
    return str(x)


async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    token = creds.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail='Invalid or expired token')


async def get_current_admin(user: dict = Depends(get_current_user)):
    if not user or user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin privileges required')
    return user


class LoginIn(BaseModel):
    username: str
    password: str


class SettingsIn(BaseModel):
    driver: Optional[str] = 'ODBC Driver 18 for SQL Server'
    host: str
    port: Optional[int] = 1433
    database: str
    username: Optional[str] = None
    password: Optional[str] = None
    trusted: Optional[bool] = False
    encrypt: Optional[bool] = False
    report_database: Optional[str] = None
    
class ReportDefinitionIn(BaseModel):
    report_name: str
    stored_procedure: str
    # Accept either a list of parameter-names (strings) or parameter objects (dicts)
    parameters: Optional[list] = []
    active: Optional[bool] = True

class ReportDefinitionUpdate(BaseModel):
    report_name: Optional[str] = None
    stored_procedure: Optional[str] = None
    parameters: Optional[list] = None
    active: Optional[bool] = None


class SettingsUpdateIn(SettingsIn):
    adminPassword: Optional[str] = None


def create_token(data: dict):
    to_encode = data.copy()
    to_encode.update({"exp": datetime.datetime.utcnow() + datetime.timedelta(hours=8)})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGO)

# ----- Helpers to ensure required SQL Server tables exist -----
def _ensure_users_table(conn):
    try:
        cur = conn.cursor()
        cur.execute(
            """
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users' AND schema_id = SCHEMA_ID('dbo'))
            BEGIN
                CREATE TABLE dbo.users (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    username NVARCHAR(255) NOT NULL UNIQUE,
                    password_hash NVARCHAR(255) NOT NULL,
                    role NVARCHAR(50) NOT NULL DEFAULT 'user',
                    created_at DATETIME DEFAULT GETDATE(),
                    must_change_password BIT NOT NULL DEFAULT(0)
                )
            END
            """
        )
        # Ensure column exists for existing tables
        cur.execute(
            """
            IF COL_LENGTH('dbo.users','must_change_password') IS NULL
            BEGIN
                ALTER TABLE dbo.users ADD must_change_password BIT NOT NULL DEFAULT(0)
            END
            """
        )
        conn.commit()
        cur.close()
    except Exception:
        try:
            cur.close()
        except Exception:
            pass
        # do not raise; caller will handle normal flow/errors
        pass

def _seed_admin_if_missing(conn):
    """Create a default admin/admin user if no admin exists."""
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM dbo.users WHERE role = 'admin'")
        count = cur.fetchone()[0]
        if not count or int(count) == 0:
            # Create default admin
            admin_hash = pwd_context.hash('admin')
            cur.execute(
                "INSERT INTO dbo.users (username, password_hash, role, created_at, must_change_password) VALUES (?, ?, 'admin', GETDATE(), 1)",
                ('admin', admin_hash)
            )
            conn.commit()
        cur.close()
    except Exception:
        try:
            cur.close()
        except Exception:
            pass
        # don't raise
        pass

# ========== Admin Settings (DB + Report DB) ==========

SETTINGS_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'instance', 'settings.json'))

def _read_settings_file() -> dict:
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception:
        pass
    return {}

def _write_settings_file(data: dict):
    os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
    with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


@router.get('/admin/settings')
async def get_admin_settings(_admin=Depends(get_current_admin)):
    s = _read_settings_file()
    # Do not return password
    safe = {k: v for k, v in s.items() if k != 'password'}
    # Ensure keys exist
    safe.setdefault('driver', 'ODBC Driver 18 for SQL Server')
    safe.setdefault('host', '')
    safe.setdefault('port', 1433)
    safe.setdefault('database', '')
    safe.setdefault('trusted', True)
    safe.setdefault('encrypt', False)
    # Ensure both keys exist and prefer explicit values
    safe.setdefault('report_database', None)
    safe.setdefault('reports_database', None)
    if not safe.get('report_database') and safe.get('reports_database'):
        safe['report_database'] = safe.get('reports_database')
    return safe


class AdminSettingsUpdate(BaseModel):
    driver: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    database: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    trusted: Optional[bool] = None
    encrypt: Optional[bool] = None
    report_database: Optional[str] = None
    reports_database: Optional[str] = None


@router.put('/admin/settings')
async def update_admin_settings(payload: AdminSettingsUpdate, _admin=Depends(get_current_admin)):
    s = _read_settings_file()
    # Merge updates, ignoring None values
    for field, value in payload.dict().items():
        if value is None:
            continue
        if field == 'password':
            # Allow empty string to clear password explicitly
            s['password'] = value
        else:
            s[field] = value
    # Backward compat alias: only set `reports_database` when not explicitly provided
    if 'report_database' in s and s.get('report_database') and not s.get('reports_database'):
        s['reports_database'] = s['report_database']
    _write_settings_file(s)
    return {'success': True}


# ===== Report page and separate DB support =====
def _get_report_db_conn():
    """Return a pyodbc connection to the separate 'report' database if configured.
    Falls back to main SQL Server connection if no separate DB provided.
    """
    try:
        import pyodbc
    except Exception:
        return None

    s = dbc.load_settings()
    # If a separate report database is configured, use it; else fall back
    server = s.get('host')
    report_db = s.get('report_database') or s.get('reports_database')
    main_db = s.get('database')
    if not server or not (report_db or main_db):
        return None

    driver = _pick_odbc_driver(s.get('driver'))
    parts = [f'DRIVER={{{driver}}}', f'SERVER={server}', f'DATABASE={report_db or main_db}']
    if s.get('trusted', True):
        parts.append('Trusted_Connection=yes')
    else:
        uid = s.get('username') or ''
        pwd = s.get('password') or ''
        if uid:
            parts.append(f'UID={uid}')
        if pwd:
            parts.append(f'PWD={pwd}')
    if s.get('encrypt', False):
        parts.append('Encrypt=yes')
    conn_str = ';'.join(parts)
    try:
        return pyodbc.connect(conn_str, timeout=5)
    except Exception:
        return None


@router.get('/report/proc-parameters')
async def get_proc_parameters(name: str, _user=Depends(get_current_user)):
    """Return parameter metadata for a stored procedure from the runtime reports database.

    Query `INFORMATION_SCHEMA.PARAMETERS` on the runtime DB (via `_get_report_data_conn`).
    Returns list of parameters in ordinal order with name (without leading @), mode and data type.
    """
    conn = _get_report_data_conn()
    if not conn:
        raise HTTPException(status_code=503, detail='Report data DB connection unavailable')
    try:
        cur = conn.cursor()
        # Query parameters for the specific procedure name. Prefer dbo schema rows when present.
        cur.execute(
            """
            SELECT PARAMETER_NAME, PARAMETER_MODE, DATA_TYPE
            FROM INFORMATION_SCHEMA.PARAMETERS
            WHERE SPECIFIC_NAME = ?
            ORDER BY ORDINAL_POSITION
            """,
            (name,)
        )
        rows = cur.fetchall()
        params = []
        for r in rows:
            pname = r[0] or ''
            if pname.startswith('@'):
                pname = pname[1:]
            params.append({'name': pname, 'mode': r[1], 'type': r[2]})
        cur.close()
        return {'procedure': name, 'parameters': params}
    finally:
        try:
            conn.close()
        except Exception:
            pass

def _get_definitions_conn():
    """Return connection to the DB that stores report definitions (report setup).
    Uses `report_database` (or `reports_database`) setting; falls back to app main DB.
    """
    try:
        import pyodbc
    except Exception:
        return None
    s = dbc.load_settings()
    server = s.get('host')
    defs_db = s.get('report_database') or s.get('reports_database') or s.get('database')
    if not server or not defs_db:
        return None
    driver = _pick_odbc_driver(s.get('driver'))
    parts = [f'DRIVER={{{driver}}}', f'SERVER={server}', f'DATABASE={defs_db}']
    if s.get('trusted', True):
        parts.append('Trusted_Connection=yes')
    else:
        uid = s.get('username') or ''
        pwd = s.get('password') or ''
        if uid:
            parts.append(f'UID={uid}')
        if pwd:
            parts.append(f'PWD={pwd}')
    if s.get('encrypt', False):
        parts.append('Encrypt=yes')
    try:
        return pyodbc.connect(';'.join(parts), timeout=5)
    except Exception:
        return None

def _get_report_data_conn():
    """Return connection to the DB that contains report runtime data (stored procedures/data).
    Uses `reports_database` (or `report_data_database`) if set; falls back to main DB.
    """
    try:
        import pyodbc
    except Exception:
        return None
    s = dbc.load_settings()
    server = s.get('host')
    data_db = s.get('reports_database') or s.get('report_data_database') or s.get('database')
    if not server or not data_db:
        return None
    driver = _pick_odbc_driver(s.get('driver'))
    parts = [f'DRIVER={{{driver}}}', f'SERVER={server}', f'DATABASE={data_db}']
    if s.get('trusted', True):
        parts.append('Trusted_Connection=yes')
    else:
        uid = s.get('username') or ''
        pwd = s.get('password') or ''
        if uid:
            parts.append(f'UID={uid}')
        if pwd:
            parts.append(f'PWD={pwd}')
    if s.get('encrypt', False):
        parts.append('Encrypt=yes')
    try:
        return pyodbc.connect(';'.join(parts), timeout=5)
    except Exception:
        return None
def _ensure_report_definitions_table(conn):
    """Ensure dbo.report_definitions exists in the report (or main) database."""
    cur = conn.cursor()
    cur.execute("""
        IF OBJECT_ID('dbo.report_definitions', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.report_definitions (
            id INT IDENTITY(1,1) PRIMARY KEY,
            report_name NVARCHAR(255) NOT NULL,
            stored_procedure NVARCHAR(255) NOT NULL,
            parameters NVARCHAR(MAX) NULL,
            active BIT NOT NULL DEFAULT 1,
            created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
            updated_at DATETIME2 NULL
          )
        END
    """)
    conn.commit()
    cur.close()

def _ensure_report_log_table(conn):
    """Ensure dbo.report_log exists (shared by generation and procedure execution)."""
    cur = conn.cursor()
    cur.execute("""
        IF OBJECT_ID('dbo.report_log', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.report_log (
            id INT IDENTITY(1,1) PRIMARY KEY,
            report_name NVARCHAR(200) NOT NULL,
            user_name NVARCHAR(255),
            started_at DATETIME2 DEFAULT SYSDATETIME(),
            finished_at DATETIME2 NULL,
            status NVARCHAR(30) NOT NULL DEFAULT 'running',
            details NVARCHAR(MAX) NULL
          )
        END
    """)
    conn.commit()
    cur.close()

@router.get('/report/definitions')
async def list_report_definitions(_user=Depends(get_current_user)):
    conn = _get_definitions_conn()
    if not conn:
        raise HTTPException(status_code=503, detail='Definitions DB connection unavailable')
    try:
        _ensure_report_definitions_table(conn)
        cur = conn.cursor()
        cur.execute("SELECT id, report_name, stored_procedure, parameters, active FROM dbo.report_definitions ORDER BY report_name")
        rows = cur.fetchall()
        cur.close()
        defs = []
        for r in rows:
            params = []
            if r[3]:
                try:
                    params = json.loads(r[3])
                except Exception:
                    params = []
            defs.append({
                'id': r[0],
                'report_name': r[1],
                'stored_procedure': r[2],
                'parameters': params,
                'active': bool(r[4]),
            })
        return {'items': defs}
    finally:
        conn.close()

@router.post('/report/definitions')
async def create_report_definition(payload: ReportDefinitionIn, _admin=Depends(get_current_admin)):
    conn = _get_definitions_conn()
    if not conn:
        raise HTTPException(status_code=503, detail='Definitions DB connection unavailable')
    try:
        _ensure_report_definitions_table(conn)
        cur = conn.cursor()
        params_json = json.dumps(payload.parameters or [])
        cur.execute("INSERT INTO dbo.report_definitions (report_name, stored_procedure, parameters, active) VALUES (?, ?, ?, ?)",
                    (payload.report_name, payload.stored_procedure, params_json, 1 if payload.active else 0))
        conn.commit()
        cur.execute("SELECT @@IDENTITY")
        new_id_row = cur.fetchone()
        cur.close()
        return {'id': int(new_id_row[0]) if new_id_row and new_id_row[0] else None, 'ok': True}
    finally:
        conn.close()

@router.put('/report/definitions/{def_id}')
async def update_report_definition(def_id: int, payload: ReportDefinitionUpdate, _admin=Depends(get_current_admin)):
    conn = _get_definitions_conn()
    if not conn:
        raise HTTPException(status_code=503, detail='Definitions DB connection unavailable')
    try:
        _ensure_report_definitions_table(conn)
        cur = conn.cursor()
        # Fetch existing to merge
        cur.execute("SELECT report_name, stored_procedure, parameters, active FROM dbo.report_definitions WHERE id = ?", (def_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            raise HTTPException(status_code=404, detail='Report definition not found')
        report_name, stored_procedure, parameters_json, active_val = row
        if payload.report_name is not None:
            report_name = payload.report_name
        if payload.stored_procedure is not None:
            stored_procedure = payload.stored_procedure
        if payload.parameters is not None:
            parameters_json = json.dumps(payload.parameters)
        if payload.active is not None:
            active_val = 1 if payload.active else 0
        cur.execute("UPDATE dbo.report_definitions SET report_name=?, stored_procedure=?, parameters=?, active=?, updated_at=SYSDATETIME() WHERE id=?",
                    (report_name, stored_procedure, parameters_json, active_val, def_id))
        conn.commit()
        cur.close()
        return {'ok': True}
    finally:
        conn.close()

@router.delete('/report/definitions/{def_id}')
async def delete_report_definition(def_id: int, _admin=Depends(get_current_admin)):
    conn = _get_definitions_conn()
    if not conn:
        raise HTTPException(status_code=503, detail='Definitions DB connection unavailable')
    try:
        _ensure_report_definitions_table(conn)
        cur = conn.cursor()
        cur.execute("DELETE FROM dbo.report_definitions WHERE id=?", (def_id,))
        conn.commit()
        cur.close()
        return {'ok': True}
    finally:
        conn.close()


@router.get('/report/definitions/{def_id}')
async def get_report_definition(def_id: int, _user=Depends(get_current_user)):
    """Return a single report definition by id from the definitions DB."""
    conn = _get_definitions_conn()
    if not conn:
        raise HTTPException(status_code=503, detail='Definitions DB connection unavailable')
    try:
        _ensure_report_definitions_table(conn)
        cur = conn.cursor()
        cur.execute("SELECT id, report_name, stored_procedure, parameters, active FROM dbo.report_definitions WHERE id = ?", (def_id,))
        row = cur.fetchone()
        cur.close()
        if not row:
            raise HTTPException(status_code=404, detail='Report definition not found')
        params = []
        if row[3]:
            try:
                params = json.loads(row[3])
            except Exception:
                params = []
        return {
            'id': row[0],
            'report_name': row[1],
            'stored_procedure': row[2],
            'parameters': params,
            'active': bool(row[4])
        }
    finally:
        conn.close()


@router.get('/report/parameter-values/{def_id}/{param_name}')
async def get_parameter_values(def_id: int, param_name: str, _user=Depends(get_current_user)):
    """Return a list of values for a named parameter for a given definition.

    The report definition `parameters` column may contain objects with a
    `values_query` attribute (SQL text) that will be executed against the
    runtime reports database to retrieve possible values for that parameter.

    Example parameters JSON in dbo.report_definitions:
      [
        {"name":"p_city", "values_query":"SELECT DISTINCT city FROM dbo.tenants ORDER BY city"},
        "p_tenant_name"
      ]
    """
    # Load definition
    defs_conn = _get_definitions_conn()
    if not defs_conn:
        raise HTTPException(status_code=503, detail='Definitions DB connection unavailable')
    try:
        _ensure_report_definitions_table(defs_conn)
        cur = defs_conn.cursor()
        cur.execute("SELECT parameters FROM dbo.report_definitions WHERE id = ?", (def_id,))
        row = cur.fetchone()
        cur.close()
        if not row:
            raise HTTPException(status_code=404, detail='Report definition not found')
        params_json = row[0]
        try:
            params = json.loads(params_json) if params_json else []
        except Exception:
            params = []
    finally:
        try:
            defs_conn.close()
        except Exception:
            pass

    # Find a values_query for param_name
    values_query = None
    for p in params:
        if isinstance(p, str):
            if p == param_name:
                # plain string - no values query
                values_query = None
                break
        elif isinstance(p, dict):
            name = p.get('name') or p.get('param') or p.get('parameter')
            if name == param_name:
                values_query = p.get('values_query')
                break

    if not values_query:
        return {'values': []}

    # Execute values_query against runtime DB
    data_conn = _get_report_data_conn()
    if not data_conn:
        raise HTTPException(status_code=503, detail='Report data DB connection unavailable')
    try:
        cur = data_conn.cursor()
        try:
            cur.execute(values_query)
            rows = cur.fetchmany(1000)
            values = [r[0] for r in rows if r and len(r) > 0]
        except Exception as e:
            raise HTTPException(status_code=500, detail=f'Failed to execute values_query: {e}')
        finally:
            try:
                cur.close()
            except Exception:
                pass
    finally:
        try:
            data_conn.close()
        except Exception:
            pass

    return {'values': values}

@router.post('/report/run')
async def run_report(definition_id: int = Form(...), request: Request = None, _user=Depends(get_current_user)):
    """Execute a stored procedure defined in dbo.report_definitions.

    Loads the definition from the definitions DB, then executes the stored procedure
    against the report data DB. Logs execution to `dbo.report_log` in the data DB.
    """
    # Load definition from definitions DB
    defs_conn = _get_definitions_conn()
    if not defs_conn:
        raise HTTPException(status_code=503, detail='Definitions DB connection unavailable')
    try:
        _ensure_report_definitions_table(defs_conn)
        cur = defs_conn.cursor()
        cur.execute("SELECT report_name, stored_procedure, parameters, active FROM dbo.report_definitions WHERE id=?", (definition_id,))
        row = cur.fetchone()
        cur.close()
        if not row:
            raise HTTPException(status_code=404, detail='Definition not found')
        report_name, stored_proc, params_json, active_val = row
        if not active_val:
            raise HTTPException(status_code=400, detail='Definition inactive')
        try:
            param_names = json.loads(params_json) if params_json else []
        except Exception:
            param_names = []
    finally:
        try:
            defs_conn.close()
        except Exception:
            pass

    # Execute stored procedure against the report data DB
    data_conn = _get_report_data_conn()
    if not data_conn:
        raise HTTPException(status_code=503, detail='Report data DB connection unavailable')
    try:
        cur = data_conn.cursor()
        # Extract form values
        values_dict = {}
        try:
            form = await request.form() if request is not None else {}
            for name in param_names:
                key = f'param_{name}'
                values_dict[name] = form.get(key)
        except Exception:
            # fallback empty
            values_dict = {n: None for n in param_names}
        ordered_values = [values_dict.get(n) for n in param_names]

        placeholders = ', '.join(['?'] * len(ordered_values))
        exec_sql = f"EXEC dbo.[{stored_proc}]" + (f" {placeholders}" if placeholders else '')

        # Insert running log
        started_details = json.dumps({'stored_procedure': stored_proc, 'parameters': param_names, 'input_values': values_dict})
        try:
            cur.execute("INSERT INTO dbo.report_log (report_name, user_name, status, details) VALUES (?, ?, 'running', ?)",
                        (report_name, _user.get('sub') if isinstance(_user, dict) else 'unknown', started_details))
            data_conn.commit()
            cur.execute("SELECT @@IDENTITY")
            rid_row = cur.fetchone()
            log_id = int(rid_row[0]) if rid_row and rid_row[0] else None
        except Exception:
            log_id = None

        rows = []
        cols = []
        error_details = None
        try:
            if ordered_values:
                cur.execute(exec_sql, ordered_values)
            else:
                cur.execute(exec_sql)
            try:
                cols = [c[0] for c in cur.description] if cur.description else []
                fetched = cur.fetchall()
                for r in fetched[:100]:
                    rows.append([_safe_cell(x) for x in r])
            except Exception:
                pass
            status = 'success'
        except Exception as e:
            status = 'error'
            error_details = str(e)

        # Update log
        final_details = json.dumps({
            'stored_procedure': stored_proc,
            'parameters': param_names,
            'input_values': values_dict,
            'columns': cols,
            'rows_returned': len(rows),
            'error': error_details
        })
        try:
            if log_id is not None:
                cur.execute("UPDATE dbo.report_log SET finished_at = SYSDATETIME(), status = ?, details = ? WHERE id = ?",
                            (status, final_details, log_id))
                data_conn.commit()
        except Exception:
            pass

        cur.close()
        return {
            'ok': status == 'success',
            'report_log_id': log_id,
            'report_name': report_name,
            'stored_procedure': stored_proc,
            'parameters': param_names,
            'input_values': values_dict,
            'columns': cols,
            'rows': rows,
            'rows_returned': len(rows),
            'status': status,
            'error': error_details
        }
    finally:
        try:
            data_conn.close()
        except Exception:
            pass
    """Return a pyodbc connection to the separate 'report' database if configured.
    Falls back to main SQL Server connection if no separate DB provided.
    """
    try:
        import pyodbc
    except Exception:
        return None

    s = dbc.load_settings()
    # If a separate report database is configured, use it; else fall back
    server = s.get('host')
    report_db = s.get('report_database') or s.get('reports_database')
    main_db = s.get('database')
    if not server or not (report_db or main_db):
        return None

    driver = _pick_odbc_driver(s.get('driver'))
    parts = [f'DRIVER={{{driver}}}', f'SERVER={server}', f'DATABASE={report_db or main_db}']
    if s.get('trusted', True):
        parts.append('Trusted_Connection=yes')
    else:
        uid = s.get('username') or ''
        pwd = s.get('password') or ''
        if uid:
            parts.append(f'UID={uid}')
        if pwd:
            parts.append(f'PWD={pwd}')
    if s.get('encrypt', False):
        parts.append('Encrypt=yes')
    conn_str = ';'.join(parts)
    try:
        return pyodbc.connect(conn_str, timeout=5)
    except Exception:
        return None


@router.get('/report')
async def report_page(_user=Depends(get_current_user)):
    """Serve the report generation page."""
    frontend_dir = os.path.join(os.path.dirname(__file__), '..', 'frontend')
    path = os.path.abspath(os.path.join(frontend_dir, 'report.html'))
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail='report.html not found')
    return FileResponse(path)


@router.get('/report/db/diag')
async def report_db_diag(_user=Depends(get_current_user)):
    """Show which database is used for report feature; detect if DB exists and return details.

    Returns 200 with details if the report DB exists and is reachable.
    Returns 404 if the DB does not exist (includes a list of available DB names).
    Returns 503 if server connectivity fails or auth invalid.
    """
    s = dbc.load_settings()
    server = s.get('host')
    driver = _pick_odbc_driver(s.get('driver'))
    report_db = s.get('report_database') or s.get('reports_database') or s.get('database')
    info = {
        'server': server,
        'report_database': s.get('report_database') or s.get('reports_database'),
        'fallback_database': s.get('database'),
        'using_database': None,
        'tables_count': None,
    }

    if not server:
        raise HTTPException(status_code=503, detail='SQL Server host not configured')

    # Build connection to master to check DB existence
    try:
        import pyodbc
    except Exception:
        raise HTTPException(status_code=503, detail='pyodbc not available on server')

    parts = [f'DRIVER={{{driver}}}', f'SERVER={server}', 'DATABASE=master']
    if s.get('trusted', True):
        parts.append('Trusted_Connection=yes')
    else:
        uid = s.get('username') or ''
        pwd = s.get('password') or ''
        if uid:
            parts.append(f'UID={uid}')
        if pwd:
            parts.append(f'PWD={pwd}')
    if s.get('encrypt', False):
        parts.append('Encrypt=yes')
    master_conn_str = ';'.join(parts)

    # Connect to master and check database existence
    try:
        master_conn = pyodbc.connect(master_conn_str, timeout=5)
    except Exception as e:
        # Include driver hint
        return JSONResponse(status_code=503, content={
            'detail': f"SQL Server connection failed: {e}",
            'hint': 'Ensure Microsoft ODBC Driver for SQL Server is installed (17 or 18).',
            'drivers_available': _available_odbc_drivers()
        })

    try:
        cur = master_conn.cursor()
        cur.execute("SELECT name FROM sys.databases")
        db_names = [row[0] for row in cur.fetchall()]
        target_db = report_db
        exists = target_db in db_names
        if not exists:
            # Database not found; return helpful details
            return JSONResponse(status_code=404, content={
                'server': server,
                'report_database': s.get('report_database') or s.get('reports_database'),
                'fallback_database': s.get('database'),
                'exists': False,
                'available_databases': db_names[:50],
                'detail': f"Database '{target_db}' not found on server."
            })
    finally:
        try:
            master_conn.close()
        except Exception:
            pass

    # If DB exists, connect to it and return details
    try:
        # Reuse same auth options but target specific DB
        parts = [f'DRIVER={{{driver}}}', f'SERVER={server}', f'DATABASE={target_db}']
        if s.get('trusted', True):
            parts.append('Trusted_Connection=yes')
        else:
            uid = s.get('username') or ''
            pwd = s.get('password') or ''
            if uid:
                parts.append(f'UID={uid}')
            if pwd:
                parts.append(f'PWD={pwd}')
        if s.get('encrypt', False):
            parts.append('Encrypt=yes')
        conn = pyodbc.connect(';'.join(parts), timeout=5)
    except Exception as e:
        return JSONResponse(status_code=503, content={
            'detail': f"Failed to connect to database '{target_db}': {e}",
            'hint': 'Verify the ODBC driver name and SQL Server connectivity.',
            'drivers_available': _available_odbc_drivers()
        })

    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'")
        row = cur.fetchone()
        info['tables_count'] = int(row[0] or 0) if row else 0
        cur.execute('SELECT DB_NAME()')
        row = cur.fetchone()
        info['using_database'] = row[0] if row else target_db
        cur.close()
    finally:
        try:
            conn.close()
        except Exception:
            pass
    return info


@router.get('/report/db/diag/runtime')
async def report_runtime_db_diag(_user=Depends(get_current_user)):
    """Diagnose the runtime reports database (uses `reports_database` setting).

    Mirrors `/report/db/diag` but targets the runtime DB setting so the admin
    UI can verify the database that contains stored procedures and report data.
    """
    s = dbc.load_settings()
    server = s.get('host')
    driver = _pick_odbc_driver(s.get('driver'))
    # Prefer explicit runtime DB, then report_database, then fallback
    runtime_db = s.get('reports_database') or s.get('report_database') or s.get('database')
    info = {
        'server': server,
        'reports_database': s.get('reports_database') or s.get('report_database'),
        'fallback_database': s.get('database'),
        'using_database': None,
        'tables_count': None,
    }

    if not server:
        raise HTTPException(status_code=503, detail='SQL Server host not configured')

    try:
        import pyodbc
    except Exception:
        raise HTTPException(status_code=503, detail='pyodbc not available on server')

    parts = [f'DRIVER={{{driver}}}', f'SERVER={server}', 'DATABASE=master']
    if s.get('trusted', True):
        parts.append('Trusted_Connection=yes')
    else:
        uid = s.get('username') or ''
        pwd = s.get('password') or ''
        if uid:
            parts.append(f'UID={uid}')
        if pwd:
            parts.append(f'PWD={pwd}')
    if s.get('encrypt', False):
        parts.append('Encrypt=yes')
    master_conn_str = ';'.join(parts)

    try:
        master_conn = pyodbc.connect(master_conn_str, timeout=5)
    except Exception as e:
        return JSONResponse(status_code=503, content={
            'detail': f"SQL Server connection failed: {e}",
            'hint': 'Ensure Microsoft ODBC Driver for SQL Server is installed (17 or 18).',
            'drivers_available': _available_odbc_drivers()
        })

    try:
        cur = master_conn.cursor()
        cur.execute("SELECT name FROM sys.databases")
        db_names = [row[0] for row in cur.fetchall()]
        target_db = runtime_db
        exists = target_db in db_names
        if not exists:
            return JSONResponse(status_code=404, content={
                'server': server,
                'reports_database': s.get('reports_database') or s.get('report_database'),
                'fallback_database': s.get('database'),
                'exists': False,
                'available_databases': db_names[:50],
                'detail': f"Database '{target_db}' not found on server."
            })
    finally:
        try:
            master_conn.close()
        except Exception:
            pass

    try:
        parts = [f'DRIVER={{{driver}}}', f'SERVER={server}', f'DATABASE={target_db}']
        if s.get('trusted', True):
            parts.append('Trusted_Connection=yes')
        else:
            uid = s.get('username') or ''
            pwd = s.get('password') or ''
            if uid:
                parts.append(f'UID={uid}')
            if pwd:
                parts.append(f'PWD={pwd}')
        if s.get('encrypt', False):
            parts.append('Encrypt=yes')
        conn = pyodbc.connect(';'.join(parts), timeout=5)
    except Exception as e:
        return JSONResponse(status_code=503, content={
            'detail': f"Failed to connect to database '{target_db}': {e}",
            'hint': 'Verify the ODBC driver name and SQL Server connectivity.',
            'drivers_available': _available_odbc_drivers()
        })

    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'")
        row = cur.fetchone()
        info['tables_count'] = int(row[0] or 0) if row else 0
        cur.execute('SELECT DB_NAME()')
        row = cur.fetchone()
        info['using_database'] = row[0] if row else target_db
        cur.close()
    finally:
        try:
            conn.close()
        except Exception:
            pass
    return info


@router.get('/admin/databases')
async def list_databases(_admin=Depends(get_current_admin)):
    """List available SQL Server databases to help configure the report_database setting."""
    s = dbc.load_settings()
    server = s.get('host')
    driver = _pick_odbc_driver(s.get('driver'))
    if not server:
        raise HTTPException(status_code=400, detail='SQL Server host not configured')
    try:
        import pyodbc
    except Exception:
        raise HTTPException(status_code=503, detail='pyodbc not available on server')
    parts = [f'DRIVER={{{driver}}}', f'SERVER={server}', 'DATABASE=master']
    if s.get('trusted', True):
        parts.append('Trusted_Connection=yes')
    else:
        uid = s.get('username') or ''
        pwd = s.get('password') or ''
        if uid:
            parts.append(f'UID={uid}')
        if pwd:
            parts.append(f'PWD={pwd}')
    if s.get('encrypt', False):
        parts.append('Encrypt=yes')
    try:
        conn = pyodbc.connect(';'.join(parts), timeout=5)
        cur = conn.cursor()
        cur.execute("SELECT name FROM sys.databases ORDER BY name")
        names = [row[0] for row in cur.fetchall()]
        cur.close()
        conn.close()
        return {'databases': names}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f'Failed to list databases: {e}')


# ===== ODBC driver detection helpers and endpoint =====
def _available_odbc_drivers():
    try:
        import pyodbc
        return list(pyodbc.drivers())
    except Exception:
        return []


def _pick_odbc_driver(preferred: Optional[str]) -> str:
    drivers = _available_odbc_drivers()
    if preferred and preferred in drivers:
        return preferred
    # Prefer latest Microsoft ODBC Driver for SQL Server
    candidates = [d for d in drivers if 'ODBC Driver' in d and 'SQL Server' in d]
    if candidates:
        # Sort by version number if present (e.g., 18, 17)
        import re
        def ver(d):
            m = re.search(r'(\d+)', d)
            return int(m.group(1)) if m else 0
        candidates.sort(key=ver, reverse=True)
        return candidates[0]
    # Fallback to any SQL Server driver
    legacy = [d for d in drivers if 'SQL Server' in d]
    if legacy:
        return legacy[0]
    # Last resort: keep preferred or default to common latest
    return preferred or 'ODBC Driver 18 for SQL Server'


@router.get('/admin/odbc-drivers')
async def get_odbc_drivers(_admin=Depends(get_current_admin)):
    return {'drivers': _available_odbc_drivers()}


@router.post('/report/generate')
async def report_generate(report_name: Optional[str] = Form(None), _user=Depends(get_current_user)):
    """Generate a report: ensures dbo.report_log exists, inserts a success row, and returns summary info.

    Optionally accepts form field 'report_name'. If not provided, a timestamp-based name is used.
    Also returns counts of existing imported tables and total rows (best-effort) for quick visibility.
    """
    # Use main DB for logging
    from .db_connection import get_sqlserver_connection
    conn = get_sqlserver_connection()
    if not conn:
        raise HTTPException(status_code=503, detail='Main DB connection unavailable')

    import datetime
    name = (report_name or f"report_{datetime.datetime.utcnow().strftime('%Y%m%d_%H%M%S')}")[:200]
    user_name = _user.get('sub') if isinstance(_user, dict) else 'unknown'

    payload = {
        'ok': True,
        'report_name': name,
        'report_log_id': None,
        'tables_inspected': 0,
        'tables': [],
        'rows_total_estimate': None,
    }
    try:
        cur = conn.cursor()
                # Assume report_log table exists in main DB

        # Collect basic table info (exclude internal tables)
        try:
            cur.execute("""
                SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_TYPE='BASE TABLE' AND TABLE_SCHEMA='dbo'
                AND TABLE_NAME NOT IN ('users','import_log','report_log','report_generation_log','sysdiagrams')
                ORDER BY TABLE_NAME
            """)
            table_names = [r[0] for r in cur.fetchall()]
            payload['tables_inspected'] = len(table_names)
            for t in table_names:
                row_count = None
                try:
                    cur.execute(f"SELECT COUNT(*) FROM dbo.[{t}]")
                    rc = cur.fetchone()
                    row_count = int(rc[0]) if rc and rc[0] is not None else 0
                except Exception:
                    row_count = None
                payload['tables'].append({'table': t, 'rows': row_count})
            if payload['tables']:
                payload['rows_total_estimate'] = sum(r['rows'] or 0 for r in payload['tables'])
        except Exception:
            pass

        # Insert report_log row as success
        details_json = json.dumps({
            'tables': payload['tables'],
            'rows_total_estimate': payload['rows_total_estimate']
        })
        cur.execute(
            "INSERT INTO dbo.report_log (report_name, user_name, finished_at, status, details) VALUES (?, ?, SYSDATETIME(), 'success', ?)",
            (name, user_name, details_json)
        )
        conn.commit()
        cur.execute("SELECT @@IDENTITY")
        rid_row = cur.fetchone()
        if rid_row and rid_row[0]:
            payload['report_log_id'] = int(rid_row[0])
        cur.close()
    except HTTPException:
        raise
    except Exception as e:
        try:
            cur.close()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f'Report generation failed: {e}')
    finally:
        conn.close()
    return payload


@router.post('/login')
async def login(payload: LoginIn):
    logger.info(f"Login attempt for user: {payload.username}")
    
    # Check SQL Server first for users (using centralized config)
    sql_server_tried = False
    try:
        conn = db.get_sqlserver_connection()
        if conn:
            logger.info(f"Attempting SQL Server login for {payload.username}")
            # Ensure users table and seed default admin if missing
            _ensure_users_table(conn)
            _seed_admin_if_missing(conn)
            cursor = conn.cursor()
            cursor.execute("SELECT id, username, password_hash, role, must_change_password FROM users WHERE username = ?", (payload.username,))
            row = cursor.fetchone()
            cursor.close()
            conn.close()
            
            sql_server_tried = True
            
            if row:
                user_id, username, password_hash, role, must_change = row
                if pwd_context.verify(payload.password, password_hash):
                    logger.info(f"Login successful (SQL Server): {username} with role {role}")
                    token = create_token({'sub': username, 'role': role})
                    return {'token': token, 'role': role, 'must_change_password': bool(must_change)}
                logger.warning(f"Invalid password for user: {payload.username}")
                raise HTTPException(status_code=401, detail='Invalid credentials')
            else:
                logger.info(f"User not found in SQL Server: {payload.username}")
    except HTTPException:
        raise
    except Exception as e:
        # If SQL Server fails, fallback to SQLite
        logger.warning(f"SQL Server authentication error for {payload.username}: {str(e)}")
        logger.warning(f"Traceback: {traceback.format_exc()}")
        sql_server_tried = True
    
    # Fallback to SQLite (only if database is available)
    if db.database is not None:
        try:
            query = db.users.select().where(db.users.c.username == payload.username)
            user = await db.database.fetch_one(query)
            if not user:
                logger.warning(f"User not found in SQLite: {payload.username}")
                raise HTTPException(status_code=401, detail='Invalid credentials')
            if not pwd_context.verify(payload.password, user['password_hash']):
                logger.warning(f"Invalid password for user: {payload.username}")
                raise HTTPException(status_code=401, detail='Invalid credentials')
            user_role = user['role'] if 'role' in user._mapping else 'user'
            logger.info(f"Login successful (SQLite): {payload.username} with role {user_role}")
            token = create_token({'sub': user['username'], 'role': user_role})
            return {'token': token, 'role': user_role}
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"SQLite login error for {payload.username}: {str(e)}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")
    
    # Last resort: default admin/admin
    if payload.username == 'admin' and payload.password == 'admin':
        logger.info(f"Login successful (default admin): {payload.username}")
        token = create_token({'sub': 'admin', 'role': 'admin'})
        return {'token': token, 'role': 'admin'}
    
    logger.warning(f"Login failed - no database available and not default admin: {payload.username}")
    raise HTTPException(status_code=401, detail='Invalid credentials')


@router.get('/diag')
async def diag():
    info = {'db_url': getattr(db, 'DATABASE_URL', None)}
    try:
        q = select(func.count(db.users.c.id))
        cnt = await db.database.fetch_val(q)
        info['users_count'] = cnt
    except Exception:
        pass
    return info


@router.post('/get-sheet-names')
async def get_sheet_names(file: UploadFile = File(...)):
    """Get list of sheet names from an Excel file."""
    try:
        content = await file.read()
        file_ext = os.path.splitext(file.filename)[1].lower()
        
        if file_ext not in ['.xlsx', '.xls']:
            raise HTTPException(status_code=400, detail="Only Excel files have sheets")
        
        excel_io = io.BytesIO(content)
        excel_file = pd.ExcelFile(excel_io)
        sheet_names = excel_file.sheet_names
        
        return {'sheet_names': sheet_names}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {e}")


@router.post('/import-preview')
async def import_preview(
    file: UploadFile = File(...),
    sheet_name: Optional[str] = Form(None),
    max_rows: int = Form(10)
):
    """Return a lightweight preview of an import file (columns + first rows).

    This does not write anything to SQL Server; it only parses the
    uploaded CSV/Excel file and returns:

    - columns: list of column names
    - rows: list of row dicts (up to max_rows)
    - sheet_name_used: which sheet was actually read (for Excel)
    """
    try:
        content = await file.read()
        file_ext = os.path.splitext(file.filename)[1].lower()

        df = None
        sheet_used = None

        if file_ext in ['.xlsx', '.xls']:
            read_kwargs = {}
            if sheet_name:
                read_kwargs['sheet_name'] = sheet_name
            excel_io = io.BytesIO(content)
            try:
                df = pd.read_excel(excel_io, **read_kwargs)
                sheet_used = sheet_name
            except Exception as e:
                # If a specific sheet was requested and failed, surface a clear error
                if sheet_name:
                    raise HTTPException(status_code=400, detail=f"Failed to read sheet '{sheet_name}': {e}")
                raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {e}")
        elif file_ext == '.csv':
            try:
                df = pd.read_csv(io.BytesIO(content))
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Failed to read CSV file: {e}")
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type. Please upload CSV or Excel.")

        if df is None or df.empty:
            return {
                'columns': list(df.columns) if df is not None else [],
                'rows': [],
                'sheet_name_used': sheet_used,
                'row_count': 0,
            }

        # Clip to max_rows
        max_rows = max(1, min(int(max_rows or 10), 100))
        preview_df = df.head(max_rows)
        
        # Replace NaN/inf values with None for JSON serialization
        preview_df = preview_df.replace({pd.NA: None, pd.NaT: None})
        preview_df = preview_df.where(pd.notna(preview_df), None)
        
        rows = preview_df.to_dict(orient='records')

        return {
            'columns': list(df.columns),
            'rows': rows,
            'sheet_name_used': sheet_used,
            'row_count': len(df),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Import preview failed: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Import preview failed: {e}")


@router.get('/dashboard/summary')
async def dashboard_summary(_admin=Depends(get_current_admin)):
    """Return high-level dashboard metrics from SQL Server only.

    This endpoint assumes your main data lives in SQL Server and
    uses simple aggregate queries against these tables:

    - dbo.users
    - dbo.import_log
    - dbo.report_log

    It does not touch the SQLite app database.
    """
    summary = {
        'users_total': 0,
        'imports_total': 0,
        'imports_last_at': None,
        'reports_total': 0,
        'reports_last_at': None,
        'tables_count': 0,
    }

    conn = db.get_sqlserver_connection()
    if not conn:
        # No SQL Server configured/available
        raise HTTPException(status_code=503, detail="SQL Server not available for dashboard summary")

    try:
        cursor = conn.cursor()

        # Total users
        try:
            cursor.execute("SELECT COUNT(*) FROM dbo.users")
            row = cursor.fetchone()
            summary['users_total'] = int(row[0] or 0) if row else 0
        except Exception:
            logger.warning("Failed to read users_total from SQL Server", exc_info=True)

        # Imported rows: total rows_imported and last finished_at
        try:
            cursor.execute("SELECT ISNULL(SUM(rows_imported), 0), MAX(finished_at) FROM dbo.import_log")
            row = cursor.fetchone()
            if row:
                summary['imports_total'] = int(row[0] or 0)
                if row[1]:
                    summary['imports_last_at'] = row[1].isoformat()
        except Exception:
            logger.warning("Failed to read import_log metrics from SQL Server", exc_info=True)

        # Reports: total count and last finished_at
        try:
            cursor.execute("SELECT COUNT(*), MAX(finished_at) FROM dbo.report_log")
            row = cursor.fetchone()
            if row:
                summary['reports_total'] = int(row[0] or 0)
                if row[1]:
                    summary['reports_last_at'] = row[1].isoformat()
        except Exception:
            logger.warning("Failed to read report_log metrics from SQL Server", exc_info=True)
        
        # Tables count (user-imported tables only)
        try:
            cursor.execute("""
                SELECT COUNT(*) 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_TYPE = 'BASE TABLE' 
                AND TABLE_SCHEMA = 'dbo'
                AND TABLE_NAME NOT IN ('users', 'import_log', 'report_log', 'sysdiagrams')
            """)
            row = cursor.fetchone()
            if row:
                summary['tables_count'] = int(row[0] or 0)
        except Exception:
            logger.warning("Failed to count tables from SQL Server", exc_info=True)

        cursor.close()
        conn.close()
    except Exception as e:
        logger.error(f"Dashboard summary failed: {e}")
        logger.error(traceback.format_exc())
        try:
            cursor.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass
        # Return 503 for common connectivity/driver issues so the UI can show a helpful fallback
        msg = str(e)
        if any(k in msg for k in ("ODBC Driver", "SQLDriverConnect", "IM002", "Login failed", "timeout")):
            raise HTTPException(status_code=503, detail="SQL Server not available for dashboard summary")
        raise HTTPException(status_code=500, detail="Failed to load dashboard summary from SQL Server")

    return summary


@router.get('/recent-activity')
async def recent_activity(_admin=Depends(get_current_admin)):
    """Return recent activity feed from import and report logs"""
    activities = []
    
    conn = db.get_sqlserver_connection()
    if not conn:
        return {'activities': []}
    
    try:
        cursor = conn.cursor()
        
        # Get recent imports
        try:
            cursor.execute("""
                SELECT TOP 10
                    'import' as type,
                    file_name,
                    table_name,
                    user_name,
                    rows_imported,
                    finished_at,
                    status
                FROM dbo.import_log
                WHERE finished_at IS NOT NULL
                ORDER BY finished_at DESC
            """)
            
            for row in cursor.fetchall():
                activity_type, file_name, table_name, user_name, rows, finished_at, status = row
                if status == 'success' and rows and rows > 0:
                    activities.append({
                        'type': 'import',
                        'description': f'Imported {rows:,} rows from {file_name} to {table_name}',
                        'user': user_name,
                        'timestamp': finished_at.isoformat() if finished_at else None,
                        'details': f'{file_name} → {table_name}'
                    })
        except Exception as e:
            logger.warning(f"Failed to fetch import activity: {e}")
        
        # Get recent reports (if report_log exists)
        try:
            cursor.execute("""
                SELECT TOP 5
                    'report' as type,
                    report_name,
                    user_name,
                    finished_at,
                    status
                FROM dbo.report_log
                WHERE finished_at IS NOT NULL
                ORDER BY finished_at DESC
            """)
            
            for row in cursor.fetchall():
                activity_type, report_name, user_name, finished_at, status = row
                if status == 'success':
                    activities.append({
                        'type': 'report',
                        'description': f'Generated report: {report_name}',
                        'user': user_name,
                        'timestamp': finished_at.isoformat() if finished_at else None,
                        'details': report_name
                    })
        except Exception as e:
            logger.debug(f"Report log not available or error: {e}")
        
        cursor.close()
        conn.close()
        
        # Sort by timestamp descending and limit to 10
        activities.sort(key=lambda x: x['timestamp'] or '', reverse=True)
        activities = activities[:10]
        
    except Exception as e:
        logger.error(f"Recent activity failed: {e}")
        try:
            cursor.close()
        except:
            pass
        try:
            conn.close()
        except:
            pass
    
    return {'activities': activities}


@router.post('/import-data')
async def import_data(
    files: Optional[List[UploadFile]] = File(None),
    table_name: Optional[str] = Form(None),
    create_new: Optional[str] = Form(None),
    sheet_name: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user)
):
    """Import CSV files into SQL Server table using PowerShell"""
    try:
        if not files:
            logger.info("Import data called with no files")
            return {'success': True, 'rows_imported': 0}
        
        # Verify SQL Server connection
        conn = db.get_sqlserver_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="SQL Server not available")
        conn.close()
        
        # Load database settings for PowerShell script
        from . import db_connection as dbc
        settings = dbc.load_settings()
        
        import subprocess
        import tempfile
        import re
        
        total_rows = 0
        results = []
        created_table = None
        
        for f in files:
            logger.info(f"Processing file: {f.filename}")
            
            # Determine table name
            if create_new == 'true':
                # Create table from filename (remove .csv extension and sanitize)
                base_name = os.path.splitext(f.filename)[0]
                # Sanitize table name: remove special chars, replace spaces with underscores
                target_table = re.sub(r'[^a-zA-Z0-9_]', '_', base_name)
                # Ensure it starts with a letter
                if target_table and not target_table[0].isalpha():
                    target_table = 'tbl_' + target_table
                logger.info(f"Creating new table: {target_table}")
                created_table = target_table
            else:
                target_table = table_name
                
            if not target_table:
                raise HTTPException(status_code=400, detail="Table name is required")
            
            # Detect file type and convert to CSV if needed
            file_ext = os.path.splitext(f.filename)[1].lower()
            content = await f.read()
            file_size = len(content) if content is not None else 0

            # Duplicate check in SQL Server import_log (by file_name, table_name, file_size, success)
            try:
                conn = db.get_sqlserver_connection()
                if conn:
                    cur = conn.cursor()
                    try:
                        cur.execute(
                            """
                            IF OBJECT_ID('dbo.import_log', 'U') IS NOT NULL
                            SELECT TOP 1 id FROM dbo.import_log
                            WHERE file_name = ? AND table_name = ? AND file_size = ? AND status = 'success'
                            ORDER BY finished_at DESC
                            ELSE SELECT NULL
                            """,
                            (f.filename, target_table, file_size)
                        )
                        dup = cur.fetchone()
                        if dup and dup[0] is not None:
                            logger.info(f"Skipping duplicate import for file {f.filename} into {target_table} (size {file_size} bytes)")
                            results.append({
                                'file': f.filename,
                                'success': False,
                                'error': 'This file was already imported for this table with the same size.',
                                'duplicate': True,
                            })
                            cur.close()
                            conn.close()
                            continue
                    finally:
                        try:
                            cur.close()
                        except Exception:
                            pass
                        try:
                            conn.close()
                        except Exception:
                            pass
            except Exception:
                # Duplicate check failures should not block import; just log
                logger.warning("Duplicate import check failed; proceeding without dedupe", exc_info=True)
            
            if file_ext in ['.xlsx', '.xls']:
                # Convert Excel to CSV
                logger.info(f"Converting Excel file to CSV: {f.filename}")
                try:
                    # If sheet_name provided, try to use it; otherwise pandas default (first sheet)
                    read_kwargs = {}
                    if sheet_name:
                        read_kwargs['sheet_name'] = sheet_name
                    df = pd.read_excel(io.BytesIO(content), **read_kwargs)
                    
                    # Drop columns that are entirely empty
                    df = df.dropna(axis=1, how='all')
                    
                    # Drop rows that are entirely empty
                    df = df.dropna(axis=0, how='all')
                    
                    # Reset index after dropping rows
                    df = df.reset_index(drop=True)
                    
                    # Fix duplicate column names by making them unique
                    new_cols = []
                    col_counts = {}
                    for idx, col in enumerate(df.columns):
                        # Handle empty/unnamed columns
                        if pd.isna(col) or str(col).strip() == '' or str(col).startswith('Unnamed:'):
                            col_str = f"Column_{idx+1}"
                        else:
                            col_str = str(col).strip()
                        
                        # Remove invalid SQL column name characters
                        col_str = col_str.replace('[', '').replace(']', '').replace(',', '_')
                        
                        if col_str in col_counts:
                            col_counts[col_str] += 1
                            new_col = f"{col_str}_{col_counts[col_str]}"
                            new_cols.append(new_col)
                            logger.info(f"Renamed duplicate column '{col_str}' to '{new_col}'")
                        else:
                            col_counts[col_str] = 0
                            new_cols.append(col_str)
                    df.columns = new_cols
                    
                    # Convert all columns to string to avoid type issues
                    for col in df.columns:
                        df[col] = df[col].astype(str).replace('nan', '').replace('None', '').replace('NaT', '')
                    
                    logger.info(f"Final columns ({len(df.columns)} total): {list(df.columns)}")
                    logger.info(f"DataFrame shape: {df.shape} (rows, columns)")
                    
                    # Insert directly to SQL Server using pandas + pyodbc (skip CSV/PowerShell)
                    try:
                        import urllib
                        from sqlalchemy import create_engine, text
                        from .db_connection import get_sqlserver_connection
                        
                        # Get connection info from settings
                        conn_info = get_sqlserver_connection()
                        server = conn_info['server']
                        database = conn_info['database']
                        
                        # Build SQLAlchemy connection string
                        params = urllib.parse.quote_plus(
                            f"DRIVER={{ODBC Driver 17 for SQL Server}};"
                            f"SERVER={server};"
                            f"DATABASE={database};"
                            f"Trusted_Connection=yes"
                        )
                        engine = create_engine(f"mssql+pyodbc:///?odbc_connect={params}", fast_executemany=True)
                        
                        # Insert data using pandas to_sql
                        logger.info(f"Inserting {len(df)} rows into {table_name}...")
                        df.to_sql(
                            name=table_name,
                            con=engine,
                            if_exists='replace',  # Create new table or replace existing
                            index=False,
                            chunksize=1000,
                            method='multi'
                        )
                        
                        rows_imported = len(df)
                        logger.info(f"Successfully inserted {rows_imported} rows into {table_name}")
                        
                        # No need for PowerShell anymore, skip tmp_path creation
                        tmp_path = None
                        
                    except Exception as sql_err:
                        logger.error(f"Direct SQL insert failed: {str(sql_err)}")
                        # Fallback to CSV method if direct insert fails
                        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.csv', newline='', encoding='utf-8') as tmp_file:
                            df.to_csv(tmp_file, index=False, quoting=1)
                            tmp_path = tmp_file.name
                        rows_imported = None  # Will use PowerShell fallback
                except Exception as excel_err:
                    logger.error(f"Failed to convert Excel file: {str(excel_err)}")
                    results.append({
                        'file': f.filename,
                        'success': False,
                        'error': f"Failed to read Excel file: {str(excel_err)}"
                    })
                    continue
            elif file_ext == '.csv':
                # For CSV files, use direct pandas read and SQL insert
                try:
                    df = pd.read_csv(io.BytesIO(content))
                    
                    # Apply same cleaning as Excel
                    df = df.dropna(axis=1, how='all')
                    df = df.dropna(axis=0, how='all')
                    df = df.reset_index(drop=True)
                    
                    # Fix column names
                    new_cols = []
                    col_counts = {}
                    for idx, col in enumerate(df.columns):
                        if pd.isna(col) or str(col).strip() == '' or str(col).startswith('Unnamed:'):
                            col_str = f"Column_{idx+1}"
                        else:
                            col_str = str(col).strip().replace('[', '').replace(']', '').replace(',', '_')
                        
                        if col_str in col_counts:
                            col_counts[col_str] += 1
                            new_cols.append(f"{col_str}_{col_counts[col_str]}")
                        else:
                            col_counts[col_str] = 0
                            new_cols.append(col_str)
                    df.columns = new_cols
                    
                    # Convert to strings
                    for col in df.columns:
                        df[col] = df[col].astype(str).replace('nan', '').replace('None', '').replace('NaT', '')
                    
                    logger.info(f"CSV loaded: {df.shape} (rows, columns)")
                    
                    # Use direct SQL insert
                    try:
                        import urllib
                        from sqlalchemy import create_engine
                        from .db_connection import get_sqlserver_connection
                        
                        conn_info = get_sqlserver_connection()
                        params = urllib.parse.quote_plus(
                            f"DRIVER={{ODBC Driver 17 for SQL Server}};"
                            f"SERVER={conn_info['server']};"
                            f"DATABASE={conn_info['database']};"
                            f"Trusted_Connection=yes"
                        )
                        engine = create_engine(f"mssql+pyodbc:///?odbc_connect={params}", fast_executemany=True)
                        
                        df.to_sql(
                            name=table_name,
                            con=engine,
                            if_exists='replace',
                            index=False,
                            chunksize=1000,
                            method='multi'
                        )
                        
                        rows_imported = len(df)
                        tmp_path = None
                        
                    except Exception as csv_err:
                        logger.error(f"CSV direct insert failed: {str(csv_err)}")
                        results.append({
                            'file': f.filename,
                            'success': False,
                            'error': f"Failed to import CSV: {str(csv_err)}"
                        })
                        continue
                        
                except Exception as csv_read_err:
                    logger.error(f"Failed to read CSV file: {str(csv_read_err)}")
                    results.append({
                        'file': f.filename,
                        'success': False,
                        'error': f"Failed to read CSV file: {str(csv_read_err)}"
                    })
                    continue
            else:
                logger.error(f"Unsupported file type: {file_ext}")
                results.append({
                    'file': f.filename,
                    'success': False,
                    'error': f"Unsupported file type: {file_ext}. Please upload CSV or Excel files."
                })
                continue
            
            # Prepare to log this import attempt in SQL Server
            import_log_id = None
            try:
                conn_log = db.get_sqlserver_connection()
                if conn_log:
                    cur_log = conn_log.cursor()
                    try:
                        cur_log.execute(
                            """
                            INSERT INTO dbo.import_log
                                (file_name, table_name, user_name, file_size, rows_imported, status, started_at, finished_at)
                            OUTPUT INSERTED.id
                            VALUES (?, ?, ?, ?, 0, 'started', GETDATE(), NULL)
                            """,
                            (
                                f.filename,
                                target_table,
                                (current_user or {}).get('sub') or (current_user or {}).get('username') or 'unknown',
                                file_size,
                            )
                        )
                        row = cur_log.fetchone()
                        if row:
                            import_log_id = row[0]
                        conn_log.commit()
                    finally:
                        try:
                            cur_log.close()
                        except Exception:
                            pass
                        try:
                            conn_log.close()
                        except Exception:
                            pass
            except Exception:
                logger.warning("Failed to insert initial import_log row", exc_info=True)

            # If direct insert succeeded, skip PowerShell
            if rows_imported is not None and rows_imported > 0:
                total_rows += rows_imported
                logger.info(f"Successfully imported {rows_imported} rows from {f.filename} using direct insert")
                results.append({
                    'file': f.filename,
                    'success': True,
                    'rows': rows_imported,
                    'table': target_table,
                    'import_log_id': import_log_id
                })
                
                # Update import_log
                try:
                    if import_log_id is not None:
                        conn_upd = db.get_sqlserver_connection()
                        if conn_upd:
                            cur_upd = conn_upd.cursor()
                            try:
                                cur_upd.execute(
                                    """
                                    UPDATE dbo.import_log
                                    SET rows_imported = ?,
                                        status = 'success',
                                        finished_at = GETDATE()
                                    WHERE id = ?
                                    """,
                                    (rows_imported, import_log_id)
                                )
                                conn_upd.commit()
                            finally:
                                try:
                                    cur_upd.close()
                                except Exception:
                                    pass
                                try:
                                    conn_upd.close()
                                except Exception:
                                    pass
                except Exception:
                    logger.warning("Failed to update import_log after direct insert", exc_info=True)
                
                continue  # Skip PowerShell fallback
            
            # Only use PowerShell if tmp_path exists (fallback scenario)
            if tmp_path is None:
                logger.info(f"No fallback needed for {f.filename}, skipping PowerShell")
                continue
                
            try:
                # Build PowerShell script for SQL Server import (fallback only)
                logger.info(f"Using PowerShell fallback for {f.filename}")
                create_new_flag = "$true" if create_new == 'true' else "$false"
                ps_script = f"""
$ErrorActionPreference = "Stop"

$ServerInstance = "{settings.get('host', '')}"
$Database = "{settings.get('database', '')}"
$TableName = "{target_table}"
$CsvPath = "{tmp_path.replace(chr(92), chr(92)+chr(92))}"
$CreateNew = {create_new_flag}

try {{
    # Import CSV
    $data = Import-Csv -Path $CsvPath
    
    if ($data.Count -eq 0) {{
        Write-Output "0"
        exit 0
    }}
    
    # Build connection string
    $connString = "Server=$ServerInstance;Database=$Database;Integrated Security=True;"
    
    $conn = New-Object System.Data.SqlClient.SqlConnection($connString)
    $conn.Open()
    
    # Create table if needed
    if ($CreateNew) {{
        # Get column names from first row
        $columns = $data[0].PSObject.Properties | ForEach-Object {{ $_.Name }}
        
        # Check if table exists
        $checkSql = "IF OBJECT_ID('$TableName', 'U') IS NOT NULL SELECT 1 ELSE SELECT 0"
        $checkCmd = New-Object System.Data.SqlClient.SqlCommand($checkSql, $conn)
        $exists = $checkCmd.ExecuteScalar()
        
        if ($exists -eq 0) {{
            # Create table with NVARCHAR(MAX) for all columns
            $columnDefs = ($columns | ForEach-Object {{ "[$_] NVARCHAR(MAX)" }}) -join ', '
            $createSql = "CREATE TABLE $TableName ($columnDefs)"
            
            $createCmd = New-Object System.Data.SqlClient.SqlCommand($createSql, $conn)
            $createCmd.ExecuteNonQuery() | Out-Null
        }}
    }}
    
    $rowCount = 0
    
    foreach ($row in $data) {{
        # Build INSERT statement dynamically
        $columns = ($row.PSObject.Properties | ForEach-Object {{ "[$($_.Name)]" }}) -join ', '
        $values = ($row.PSObject.Properties | ForEach-Object {{ 
            $val = $_.Value
            if ([string]::IsNullOrEmpty($val)) {{ "NULL" }} 
            else {{ "'" + $val.Replace("'", "''") + "'" }}
        }}) -join ', '
        
        $sql = "INSERT INTO $TableName ($columns) VALUES ($values)"
        
        $cmd = New-Object System.Data.SqlClient.SqlCommand($sql, $conn)
        $cmd.ExecuteNonQuery() | Out-Null
        $rowCount++
    }}
    
    $conn.Close()
    Write-Output $rowCount
}} catch {{
    Write-Error $_.Exception.Message
    exit 1
}}
"""
                
                # Execute PowerShell script
                result = subprocess.run(
                    ['powershell', '-NoProfile', '-Command', ps_script],
                    capture_output=True,
                    text=True,
                    timeout=300
                )
                
                if result.returncode != 0:
                    error_msg = result.stderr.strip() or result.stdout.strip()
                    logger.error(f"PowerShell import failed for {f.filename}: {error_msg}")
                    results.append({
                        'file': f.filename,
                        'success': False,
                        'error': error_msg
                    })
                else:
                    rows_imported = int(result.stdout.strip() or '0')
                    total_rows += rows_imported
                    logger.info(f"Successfully imported {rows_imported} rows from {f.filename}")
                    results.append({
                        'file': f.filename,
                        'success': True,
                        'rows': rows_imported,
                        'table': target_table,
                        'import_log_id': import_log_id
                    })
                # Update import_log entry if we created one
                try:
                    if import_log_id is not None:
                        conn_upd = db.get_sqlserver_connection()
                        if conn_upd:
                            cur_upd = conn_upd.cursor()
                            try:
                                cur_upd.execute(
                                    """
                                    UPDATE dbo.import_log
                                    SET rows_imported = ?,
                                        status = ?,
                                        finished_at = GETDATE()
                                    WHERE id = ?
                                    """,
                                    (
                                        int(result.stdout.strip() or '0') if result.returncode == 0 else 0,
                                        'success' if result.returncode == 0 else 'failed',
                                        import_log_id,
                                    )
                                )
                                conn_upd.commit()
                            finally:
                                try:
                                    cur_upd.close()
                                except Exception:
                                    pass
                                try:
                                    conn_upd.close()
                                except Exception:
                                    pass
                except Exception:
                    logger.warning("Failed to update import_log row after import", exc_info=True)
                
                # Clean up temp file if it was created
                if tmp_path:
                    try:
                        os.unlink(tmp_path)
                    except Exception as cleanup_err:
                        logger.warning(f"Could not delete temp file {tmp_path}: {cleanup_err}")
                        
            except Exception as powershell_err:
                logger.error(f"PowerShell fallback failed for {f.filename}: {str(powershell_err)}")
                results.append({
                    'file': f.filename,
                    'success': False,
                    'error': f"Import failed: {str(powershell_err)}"
                })
        
        logger.info(f"Total rows imported: {total_rows}")
        response = {
            'success': True,
            'rows_imported': total_rows,
            'details': results,
            'import_log_ids': [r['import_log_id'] for r in results if r.get('import_log_id') is not None]
        }
        
        if created_table:
            response['table_created'] = created_table
            
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e)
        logger.error(f"Error importing data: {msg}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        if 'ODBC Driver' in msg or 'SQLDriverConnect' in msg or 'IM002' in msg:
            raise HTTPException(status_code=503, detail="SQL Server not available; please verify driver/server/database settings.")
        raise HTTPException(status_code=500, detail=f"Import failed: {msg}")




@router.post('/run-report')
async def run_report(report_name: str = Form(...)):
    try:
        # Graceful handling when no app database (SQLite) is configured
        if getattr(db, 'database', None) is None:
            logger.warning("Run report aborted: No application database configured")
            raise HTTPException(status_code=503, detail="Report unavailable: no application database configured.")
        logger.info(f"Running report: {report_name}")
        cnt = await db.database.fetch_val(select(func.count(db.report_data.c.id)))
        await db.database.execute(db.report_log.insert().values(report_name=report_name, parameters='', status='success', started_at=datetime.datetime.utcnow(), finished_at=datetime.datetime.utcnow()))
        logger.info(f"Report {report_name} completed successfully with {cnt} rows")
        return {'report': report_name, 'rows': cnt}
    except Exception as e:
        logger.error(f"Error running report {report_name}: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Report failed: {str(e)}")


def _build_connection_url(s: SettingsIn) -> str:
    driver = s.driver or 'ODBC Driver 18 for SQL Server'
    driver_q = urllib.parse.quote_plus(driver)
    userinfo = ''
    if getattr(s, 'trusted', False):
        userinfo = ''
    else:
        if s.username:
            userinfo = urllib.parse.quote_plus(s.username)
            if s.password:
                userinfo += ':' + urllib.parse.quote_plus(s.password)
            userinfo += '@'
    if '\\' in s.host:
        hostport = s.host
    else:
        hostport = f"{s.host}:{s.port or 1433}"
    params = f"driver={driver_q}"
    if s.encrypt:
        params += '&Encrypt=yes'
    if getattr(s, 'trusted', False):
        params += '&trusted_connection=yes'
    return f"mssql+pyodbc://{userinfo}{hostport}/{s.database}?{params}"


SETTINGS_PATH = os.path.join(os.path.dirname(__file__), '..', 'instance', 'settings.json')


@router.get('/settings/info')
async def get_settings_info():
    """Get database connection info (no authentication required for login page)"""
    try:
        if os.path.exists(SETTINGS_PATH):
            with open(SETTINGS_PATH, 'r', encoding='utf-8') as f:
                settings = json.load(f)
            return {
                'configured': True,
                'host': settings.get('host', ''),
                'database': settings.get('database', ''),
                'trusted': settings.get('trusted', True),
                'username': settings.get('username', ''),
                'driver': settings.get('driver', 'ODBC Driver 18 for SQL Server')
            }
        else:
            return {
                'configured': False,
                'host': '',
                'database': '',
                'trusted': True,
                'username': '',
                'driver': 'ODBC Driver 18 for SQL Server'
            }
    except Exception as e:
        logger.error(f"Error loading settings info: {str(e)}")
        return {
            'configured': False,
            'host': '',
            'database': '',
            'trusted': True,
            'username': '',
            'driver': 'ODBC Driver 18 for SQL Server'
        }


ADMIN_SETTINGS_PASSWORD = os.environ.get('ADMIN_SETTINGS_PASSWORD', '1234567890')


@router.post('/settings/save')
async def save_settings(payload: SettingsUpdateIn, request: Request):
    """Save settings. Requires correct adminPassword in request body."""
    try:
        # Allow either: (1) logged-in admin via Bearer token, or (2) adminPassword secret
        is_admin_token = False
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.lower().startswith('bearer '):
            token = auth_header.split(' ', 1)[1]
            try:
                payload_jwt = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
                if payload_jwt.get('role') == 'admin':
                    is_admin_token = True
            except JWTError:
                is_admin_token = False

        if not is_admin_token:
            # Enforce admin password when not using admin token
            if (payload.adminPassword or '').strip() != ADMIN_SETTINGS_PASSWORD:
                logger.warning("Rejected settings update due to invalid admin password")
                raise HTTPException(status_code=403, detail='Invalid admin password')

        logger.info(f"Saving settings for server: {payload.host}, database: {payload.database}")
        os.makedirs(os.path.dirname(SETTINGS_PATH), exist_ok=True)
        with open(SETTINGS_PATH, 'w', encoding='utf-8') as f:
            # Exclude adminPassword from persisted settings
            data = payload.dict()
            data.pop('adminPassword', None)
            json.dump(data, f, indent=2)
        new_url = _build_connection_url(payload)
        
        # Note: We don't actually switch the database here because the 'databases' library
        # doesn't support SQL Server. The settings are saved for the login endpoint to use.
        # The app continues to use SQLite for other operations.
        
        logger.info(f"Settings saved successfully")
        return {'ok': True, 'message': 'Settings saved. SQL Server will be used for user authentication.', 'url': new_url}
    except Exception as e:
        logger.error(f"Error saving settings: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to save settings: {str(e)}")


@router.get('/settings')
async def get_settings(_admin=Depends(get_current_admin)):
    if not os.path.exists(SETTINGS_PATH):
        raise HTTPException(status_code=404, detail='No settings')
    with open(SETTINGS_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


@router.post('/settings/test')
async def test_settings(payload: SettingsIn, _admin=Depends(get_current_admin)):
    logger.info(f"Testing connection to server: {payload.host}, database: {payload.database}")
    url = _build_connection_url(payload)
    try:
        import pyodbc
        available_drivers = [d for d in pyodbc.drivers()]
    except Exception as e:
        logger.error(f"pyodbc not available: {str(e)}")
        return {"ok": False, "message": "pyodbc not installed on the server. Install pyodbc and ODBC driver to test."}
    conn_parts = []
    chosen_driver = payload.driver
    try:
        if payload.driver not in available_drivers:
            fallback = None
            for cand in ["ODBC Driver 18 for SQL Server", "ODBC Driver 17 for SQL Server"]:
                if cand in available_drivers:
                    fallback = cand
                    break
            if fallback:
                chosen_driver = fallback
    except Exception:
        chosen_driver = payload.driver
    conn_parts.append(f"DRIVER={{{chosen_driver}}}")
    if '\\' in payload.host:
        conn_parts.append(f"SERVER={payload.host}")
    else:
        conn_parts.append(f"SERVER={payload.host},{payload.port or 1433}")
    conn_parts.append(f"DATABASE={payload.database}")
    
    # Use Windows Authentication if trusted is True, otherwise use username/password
    if payload.trusted:
        conn_parts.append('Trusted_Connection=yes')
    else:
        if payload.username:
            conn_parts.append(f"UID={payload.username}")
        if payload.password:
            conn_parts.append(f"PWD={payload.password}")
    
    if payload.encrypt:
        conn_parts.append('Encrypt=yes')
    conn_str = ';'.join(conn_parts)
    try:
        logger.info(f"Attempting connection with driver: {chosen_driver}")
        cn = pyodbc.connect(conn_str, timeout=5)
        cn.close()
        logger.info(f"Connection test successful for {payload.host}/{payload.database}")
        return {"ok": True, "message": "Connection successful", "url": url, "used_driver": chosen_driver}
    except Exception as e:
        logger.error(f"Connection test failed for {payload.host}/{payload.database}: {str(e)}")
        # Parse error message to make it more user-friendly
        error_msg = str(e)
        
        # Extract SQL Server error messages
        if "Login failed" in error_msg:
            if "Cannot open database" in error_msg:
                # Extract database name from error
                import re
                db_match = re.search(r'Cannot open database "([^"]+)"', error_msg)
                db_name = db_match.group(1) if db_match else payload.database
                error_msg = f"Database '{db_name}' does not exist or you don't have permission to access it."
            elif payload.trusted:
                error_msg = f"Windows Authentication failed for user '{os.environ.get('USERNAME', 'current user')}'. Make sure this user has access to SQL Server."
            else:
                error_msg = f"Login failed for user '{payload.username}'. Check username and password."
        elif "Data source name not found" in error_msg:
            error_msg = f"ODBC Driver not found. Please install '{chosen_driver}' on this machine."
        elif "SQL Server does not exist" in error_msg or "Named Pipes Provider" in error_msg:
            error_msg = f"Cannot connect to server '{payload.host}'. Make sure SQL Server is running and accessible."
        
        return {"ok": False, "message": error_msg, "url": url, "details": str(e)}


@router.get('/settings/scan-local')
async def scan_local_instances(_admin=Depends(get_current_admin)):
    if platform.system() != 'Windows':
        return {"ok": False, "message": "Local instance scanning is supported on Windows only."}
    instances = []
    try:
        import winreg
        base_key = r"SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL"
        try:
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, base_key) as key:
                i = 0
                while True:
                    try:
                        name, val, _ = winreg.EnumValue(key, i)
                        instances.append(name)
                        i += 1
                    except OSError:
                        break
        except Exception:
            instances = []
        host_variants = []
        local_name = os.getenv('COMPUTERNAME') or 'localhost'
        host_variants.extend(['localhost', '127.0.0.1', '(local)', f'{local_name}'])
        host_variants.append('(localdb)\\MSSQLLocalDB')
        for inst in instances:
            if '\\' in inst:
                host_variants.append(inst)
            else:
                host_variants.append(f"{local_name}\\{inst}")
        host_variants.append(f"{local_name}\\SQLEXPRESS")
        seen = set(); uniq = []
        for v in host_variants:
            if v not in seen:
                seen.add(v); uniq.append(v)
        return {"ok": True, "instances": uniq}
    except Exception as e:
        return {"ok": False, "message": str(e)}


@router.post('/settings/list-databases')
async def list_databases(payload: SettingsIn, _admin=Depends(get_current_admin)):
    try:
        import pyodbc
    except Exception:
        return {"ok": False, "message": "pyodbc not installed on the server."}
    # Build a simple master DB connection string then query sys.databases
    try:
        chosen_driver = payload.driver
        drivers = pyodbc.drivers()
        if chosen_driver not in drivers and drivers:
            for cand in ("ODBC Driver 18 for SQL Server", "ODBC Driver 17 for SQL Server"):
                if cand in drivers:
                    chosen_driver = cand
                    break
            else:
                chosen_driver = drivers[0]
        parts = [f"DRIVER={{{chosen_driver}}}"]
        if '\\' in payload.host:
            parts.append(f"SERVER={payload.host}")
        else:
            parts.append(f"SERVER={payload.host},{payload.port or 1433}")
        parts.append("DATABASE=master")
        if payload.username:
            parts.append(f"UID={payload.username}")
        if payload.password:
            parts.append(f"PWD={payload.password}")
        if payload.encrypt:
            parts.append('Encrypt=yes')
        if getattr(payload, 'trusted', False):
            parts.append('Trusted_Connection=yes')
        conn_str = ';'.join(parts)
        cn = pyodbc.connect(conn_str, timeout=8)
        cur = cn.cursor()
        cur.execute("SELECT name FROM sys.databases ORDER BY name;")
        rows = [r[0] for r in cur.fetchall()]
        cur.close()
        cn.close()
        return {"ok": True, "databases": rows}
    except Exception as e:
        return {"ok": False, "message": str(e)}


@router.post('/create-user')
async def create_user(username: str = Form(...), password: str = Form(...), role: str = Form('user'), _admin=Depends(get_current_admin)):
    try:
        logger.info(f"Creating user: {username} with role: {role}")
        hashed = pwd_context.hash(password)
        
        # Create user in SQL Server
        conn = db.get_sqlserver_connection()
        if not conn:
            logger.warning("Create user aborted: SQL Server not available")
            raise HTTPException(status_code=503, detail="SQL Server not available; configure connection in Settings and try again.")
        
        # Ensure users table exists
        _ensure_users_table(conn)
        cursor = conn.cursor()
        
        # Check if user already exists
        cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
        if cursor.fetchone():
            cursor.close()
            conn.close()
            logger.warning(f"User creation failed: {username} already exists")
            raise HTTPException(status_code=400, detail=f"User '{username}' already exists")
        
        # Insert new user
        cursor.execute(
            "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, GETDATE())",
            (username, hashed, role)
        )
        conn.commit()
        
        # Get the inserted user ID
        cursor.execute("SELECT @@IDENTITY")
        user_id = cursor.fetchone()[0]
        
        cursor.close()
        conn.close()
        
        logger.info(f"User created successfully in SQL Server: {username} (ID: {user_id})")
        return {'message': 'User created successfully', 'user_id': int(user_id)}
    except HTTPException:
        raise
    except Exception as e:
        # Return a graceful 503 when SQL Server connectivity is the likely issue
        msg = str(e)
        logger.error(f"Error creating user {username}: {msg}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        if 'ODBC Driver' in msg or 'SQLDriverConnect' in msg or 'IM002' in msg:
            raise HTTPException(status_code=503, detail="SQL Server not available; please verify driver/server/database settings.")
        raise HTTPException(status_code=500, detail=f"Failed to create user: {msg}")


@router.get('/users')
async def list_users(_admin=Depends(get_current_admin)):
    try:
        logger.info("Fetching user list")
        
        # Try SQL Server first
        try:
            conn = db.get_sqlserver_connection()
            if conn:
                # Ensure users table exists and seed default admin if missing
                _ensure_users_table(conn)
                _seed_admin_if_missing(conn)
                cursor = conn.cursor()
                
                cursor.execute("SELECT id, username, role, created_at FROM users ORDER BY id")
                rows = cursor.fetchall()
                
                users = []
                for row in rows:
                    users.append({
                        'id': row[0],
                        'username': row[1],
                        'role': row[2],
                        'created_at': str(row[3]) if row[3] else None
                    })
                
                cursor.close()
                conn.close()
                
                logger.info(f"Retrieved {len(users)} users from SQL Server")
                return users
        except Exception as sql_err:
            logger.warning(f"SQL Server user list failed: {str(sql_err)}, falling back to SQLite")
        
        # Fallback to SQLite (only if available); otherwise return empty list gracefully
        if getattr(db, 'database', None) is None:
            logger.info("No fallback database configured; returning empty user list")
            return []
        query = db.users.select()
        users = await db.database.fetch_all(query)
        logger.info(f"Retrieved {len(users)} users from SQLite")
        return [{'id': u['id'], 'username': u['username'], 'role': u['role'], 'created_at': str(u['created_at']) if u['created_at'] else None} for u in users]
    except Exception as e:
        logger.error(f"Error fetching users: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch users: {str(e)}")


@router.put('/users/{user_id}')
async def update_user(
    user_id: int,
    username: str = Form(...),
    password: Optional[str] = Form(None),
    role: str = Form(...),
    _admin=Depends(get_current_admin)
):
    try:
        logger.info(f"Updating user ID {user_id}: {username} with role: {role}")
        
        conn = db.get_sqlserver_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="SQL Server not available")
        
        cursor = conn.cursor()
        
        # Check if user exists
        cursor.execute("SELECT id FROM users WHERE id = ?", (user_id,))
        if not cursor.fetchone():
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail=f"User ID {user_id} not found")
        
        # Check if username is taken by another user
        cursor.execute("SELECT id FROM users WHERE username = ? AND id != ?", (username, user_id))
        if cursor.fetchone():
            cursor.close()
            conn.close()
            raise HTTPException(status_code=400, detail=f"Username '{username}' is already taken")
        
        # Update user
        if password:
            hashed = pwd_context.hash(password)
            cursor.execute(
                "UPDATE users SET username = ?, password_hash = ?, role = ?, must_change_password = 0 WHERE id = ?",
                (username, hashed, role, user_id)
            )
        else:
            cursor.execute(
                "UPDATE users SET username = ?, role = ? WHERE id = ?",
                (username, role, user_id)
            )
        
        conn.commit()
        cursor.close()
        conn.close()
        
        logger.info(f"User {user_id} updated successfully")
        return {'message': 'User updated successfully'}
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e)
        logger.error(f"Error updating user {user_id}: {msg}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        if 'ODBC Driver' in msg or 'SQLDriverConnect' in msg or 'IM002' in msg:
            raise HTTPException(status_code=503, detail="SQL Server not available")
        raise HTTPException(status_code=500, detail=f"Failed to update user: {msg}")


@router.delete('/users/{user_id}')
async def delete_user(user_id: int, _admin=Depends(get_current_admin)):
    try:
        logger.info(f"Deleting user ID {user_id}")
        
        conn = db.get_sqlserver_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="SQL Server not available")
        
        cursor = conn.cursor()

        # Check if user exists and role
        cursor.execute("SELECT username, role FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        if not row:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail=f"User ID {user_id} not found")

        username, role = row[0], row[1]

        # Prevent deleting the last admin account
        if role == 'admin':
            cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'")
            admin_count = cursor.fetchone()[0]
            if admin_count <= 1:
                cursor.close()
                conn.close()
                raise HTTPException(status_code=400, detail="Cannot delete the last admin user")

        # Delete user
        cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
        cursor.close()
        conn.close()
        
        logger.info(f"User {user_id} ({username}) deleted successfully")
        return {'message': f'User {username} deleted successfully'}
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e)
        logger.error(f"Error deleting user {user_id}: {msg}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        if 'ODBC Driver' in msg or 'SQLDriverConnect' in msg or 'IM002' in msg:
            raise HTTPException(status_code=503, detail="SQL Server not available")
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {msg}")


@router.post('/me/change-password')
async def me_change_password(new_password: str = Form(...), current_user: dict = Depends(get_current_user)):
    """Allow logged-in user to change their own password and clear must_change_password flag."""
    try:
        conn = db.get_sqlserver_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="SQL Server not available")
        _ensure_users_table(conn)
        cur = conn.cursor()
        hashed = pwd_context.hash(new_password)
        username = current_user.get('sub') if isinstance(current_user, dict) else None
        if not username:
            raise HTTPException(status_code=400, detail="Invalid current user")
        cur.execute(
            "UPDATE dbo.users SET password_hash = ?, must_change_password = 0 WHERE username = ?",
            (hashed, username)
        )
        conn.commit()
        cur.close()
        conn.close()
        return {"ok": True, "message": "Password updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        try:
            cur.close()
            conn.close()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Failed to change password: {e}")


@router.get('/tables')
async def list_tables(_user=Depends(get_current_user)):
    """Get list of tables from import_log (only tables that have been imported)"""
    try:
        logger.info("Fetching table list from import_log")
        
        conn = db.get_sqlserver_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="SQL Server not available")
        
        cursor = conn.cursor()
        
        # Query to get distinct table names from import_log
        cursor.execute("""
            SELECT DISTINCT table_name
            FROM [ReportApp].[dbo].[import_log]
            WHERE table_name IS NOT NULL
            AND status = 'success'
            ORDER BY table_name
        """)
        
        rows = cursor.fetchall()
        tables = [row[0] for row in rows]
        
        cursor.close()
        conn.close()
        
        logger.info(f"Retrieved {len(tables)} imported tables from import_log")
        return {"tables": tables}
        
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e)
        logger.error(f"Error fetching tables: {msg}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        if 'ODBC Driver' in msg or 'SQLDriverConnect' in msg or 'IM002' in msg:
            raise HTTPException(status_code=503, detail="SQL Server not available; please verify driver/server/database settings.")
        raise HTTPException(status_code=500, detail=f"Failed to fetch tables: {msg}")


# Power BI Integration Endpoints
class PowerBISettings(BaseModel):
    embed_url: str
    title: Optional[str] = "Power BI Dashboard"
    enabled: bool = True
    show_filter_pane: Optional[bool] = True
    show_nav_pane: Optional[bool] = True
    allow_fullscreen: Optional[bool] = True


def normalize_powerbi_url(url: str) -> str:
    """Normalize a Power BI Report Server portal or legacy URL for embedding.

    Rules:
    - Trim whitespace.
    - If portal style (/Reports/...) and no query string, append ?rs:embed=true.
    - If portal style and has query but missing rs:embed=true, append &rs:embed=true.
    - If legacy style (/ReportServer?...) and missing rs:embed=true, append &rs:embed=true.
    - Leave cloud (app.powerbi.com) URLs unchanged (not supported here).
    - Ensure we do not duplicate rs:embed=true.
    """
    if not url:
        return url
    u = url.strip()
    # Already contains rs:embed=true
    if 'rs:embed=true' in u:
        return u
    lower = u.lower()
    # Portal style: /reports/ path
    if '/reports/' in lower:
        if '?' not in u:
            return u + '?rs:embed=true'
        else:
            return u + '&rs:embed=true'
    # Legacy style: /ReportServer?
    if '/reportserver?' in lower:
        return u + '&rs:embed=true'
    return u  # Unknown style; leave unchanged


@router.get('/powerbi/reports')
async def get_powerbi_reports(_user=Depends(get_current_user)):
    """Get list of all Power BI reports"""
    try:
        conn = db.get_sqlserver_connection()
        if not conn:
            return {"reports": []}
        cursor = conn.cursor()
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'powerbi_reports')
            CREATE TABLE powerbi_reports (
                id INT IDENTITY(1,1) PRIMARY KEY,
                name NVARCHAR(255) NOT NULL,
                embed_url NVARCHAR(MAX) NOT NULL,
                enabled BIT DEFAULT 1,
                show_filter_pane BIT DEFAULT 1,
                show_nav_pane BIT DEFAULT 1,
                allow_fullscreen BIT DEFAULT 1,
                sort_order INT DEFAULT 0,
                created_at DATETIME DEFAULT GETDATE(),
                updated_at DATETIME DEFAULT GETDATE(),
                updated_by NVARCHAR(100)
            )
        """)
        conn.commit()
        cursor.execute("""SELECT id, name, embed_url, enabled, show_filter_pane, show_nav_pane, allow_fullscreen
            FROM powerbi_reports WHERE enabled = 1 ORDER BY sort_order ASC, id ASC""")
        rows = cursor.fetchall()
        reports = [{
            "id": row[0], "name": row[1], "embed_url": row[2],
            "enabled": bool(row[3]), "show_filter_pane": bool(row[4]),
            "show_nav_pane": bool(row[5]), "allow_fullscreen": bool(row[6])
        } for row in rows]
        cursor.close()
        conn.close()
        return {"reports": reports}
    except Exception as e:
        logger.error(f"Error fetching Power BI reports: {str(e)}")
        return {"reports": []}


@router.get('/powerbi/settings')
async def get_powerbi_settings(_user=Depends(get_current_user)):
    """Get Power BI settings - returns first enabled report"""
    try:
        conn = db.get_sqlserver_connection()
        if not conn:
            return {"enabled": False, "embed_url": "", "title": "Power BI Dashboard"}
        cursor = conn.cursor()
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'powerbi_reports')
            CREATE TABLE powerbi_reports (
                id INT IDENTITY(1,1) PRIMARY KEY,
                name NVARCHAR(255) NOT NULL,
                embed_url NVARCHAR(MAX) NOT NULL,
                enabled BIT DEFAULT 1,
                show_filter_pane BIT DEFAULT 1,
                show_nav_pane BIT DEFAULT 1,
                allow_fullscreen BIT DEFAULT 1,
                sort_order INT DEFAULT 0,
                created_at DATETIME DEFAULT GETDATE(),
                updated_at DATETIME DEFAULT GETDATE(),
                updated_by NVARCHAR(100)
            )
        """)
        conn.commit()
        cursor.execute("""SELECT TOP 1 name, embed_url, enabled, show_filter_pane, show_nav_pane, allow_fullscreen
            FROM powerbi_reports WHERE enabled = 1 ORDER BY sort_order ASC, id ASC""")
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        if row:
            return {"embed_url": row[1] or "", "title": row[0] or "Power BI Report",
                "enabled": bool(row[2]), "show_filter_pane": bool(row[3]),
                "show_nav_pane": bool(row[4]), "allow_fullscreen": bool(row[5])}
        else:
            return {"enabled": False, "embed_url": "", "title": "Power BI Dashboard",
                "show_filter_pane": True, "show_nav_pane": True, "allow_fullscreen": True}
    except Exception as e:
        logger.error(f"Error fetching Power BI settings: {str(e)}")
        return {"enabled": False, "embed_url": "", "title": "Power BI Dashboard"}


@router.post('/powerbi/settings')
async def save_powerbi_settings(settings: PowerBISettings, user=Depends(get_current_admin)):
    """Save Power BI embed settings (admin only)"""
    try:
        conn = db.get_sqlserver_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="SQL Server not available")
        
        cursor = conn.cursor()
        
        # Create table if not exists
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'powerbi_settings')
            CREATE TABLE powerbi_settings (
                id INT IDENTITY(1,1) PRIMARY KEY,
                embed_url NVARCHAR(MAX),
                title NVARCHAR(255),
                enabled BIT DEFAULT 1,
                show_filter_pane BIT DEFAULT 1,
                show_nav_pane BIT DEFAULT 1,
                allow_fullscreen BIT DEFAULT 1,
                updated_at DATETIME DEFAULT GETDATE(),
                updated_by NVARCHAR(100)
            )
        """)
        conn.commit()
        
        username = user.get('sub') or user.get('username') or 'admin'
        
        # Normalize embed URL before saving
        normalized_url = normalize_powerbi_url(settings.embed_url)

        # Insert new settings
        cursor.execute("""
            INSERT INTO powerbi_settings 
            (embed_url, title, enabled, show_filter_pane, show_nav_pane, allow_fullscreen, updated_at, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, GETDATE(), ?)
        """, (
            normalized_url,
            settings.title, 
            settings.enabled,
            settings.show_filter_pane,
            settings.show_nav_pane,
            settings.allow_fullscreen,
            username
        ))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        logger.info(f"Power BI settings saved by {username}. Normalized URL applied.")
        return {"success": True, "message": "Power BI settings saved successfully", "normalized_embed_url": normalized_url}
        
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e)
        logger.error(f"Error saving Power BI settings: {msg}")
        if 'ODBC Driver' in msg or 'SQLDriverConnect' in msg or 'IM002' in msg:
            raise HTTPException(status_code=503, detail="SQL Server not available")
        raise HTTPException(status_code=500, detail=f"Failed to save Power BI settings: {msg}")


@router.post('/powerbi/reports')
async def add_powerbi_report(settings: PowerBISettings, user=Depends(get_current_admin)):
    """Add a new Power BI report to the multi-report collection (admin only)"""
    try:
        conn = db.get_sqlserver_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="SQL Server not available")
        
        cursor = conn.cursor()
        
        # Create table if not exists
        cursor.execute("""
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'powerbi_reports')
            CREATE TABLE powerbi_reports (
                id INT IDENTITY(1,1) PRIMARY KEY,
                name NVARCHAR(255) NOT NULL,
                embed_url NVARCHAR(MAX) NOT NULL,
                enabled BIT DEFAULT 1,
                show_filter_pane BIT DEFAULT 1,
                show_nav_pane BIT DEFAULT 1,
                allow_fullscreen BIT DEFAULT 1,
                sort_order INT DEFAULT 0,
                created_at DATETIME DEFAULT GETDATE(),
                updated_at DATETIME DEFAULT GETDATE(),
                updated_by NVARCHAR(100)
            )
        """)
        conn.commit()
        
        username = user.get('sub') or user.get('username') or 'admin'
        
        # Normalize embed URL before saving
        normalized_url = normalize_powerbi_url(settings.embed_url)
        
        # Get next sort_order
        cursor.execute("SELECT ISNULL(MAX(sort_order), 0) + 1 FROM powerbi_reports")
        next_sort_order = cursor.fetchone()[0]
        
        # Insert new report
        cursor.execute("""
            INSERT INTO powerbi_reports 
            (name, embed_url, enabled, show_filter_pane, show_nav_pane, allow_fullscreen, sort_order, created_at, updated_at, updated_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, GETDATE(), GETDATE(), ?)
        """, (
            settings.title or "Unnamed Report",
            normalized_url,
            settings.enabled,
            settings.show_filter_pane,
            settings.show_nav_pane,
            settings.allow_fullscreen,
            next_sort_order,
            username
        ))
        
        conn.commit()
        
        # Get the inserted report ID
        cursor.execute("SELECT IDENT_CURRENT('powerbi_reports')")
        report_id = cursor.fetchone()[0]
        
        cursor.close()
        conn.close()
        
        logger.info(f"Power BI report '{settings.title}' added by {username} with ID {report_id}. Normalized URL applied.")
        return {
            "success": True,
            "id": report_id,
            "message": f"Power BI report '{settings.title}' added successfully",
            "normalized_embed_url": normalized_url
        }
        
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e)
        logger.error(f"Error adding Power BI report: {msg}")
        if 'ODBC Driver' in msg or 'SQLDriverConnect' in msg or 'IM002' in msg:
            raise HTTPException(status_code=503, detail="SQL Server not available")
        raise HTTPException(status_code=500, detail=f"Failed to add Power BI report: {msg}")


@router.delete('/powerbi/reports/{report_id}')
async def delete_powerbi_report(report_id: int, user=Depends(get_current_admin)):
    """Delete a Power BI report by ID (admin only)"""
    try:
        conn = db.get_sqlserver_connection()
        if not conn:
            raise HTTPException(status_code=503, detail="SQL Server not available")
        
        cursor = conn.cursor()
        
        # Delete the report
        cursor.execute("DELETE FROM powerbi_reports WHERE id = ?", (report_id,))
        conn.commit()
        
        rows_affected = cursor.rowcount
        cursor.close()
        conn.close()
        
        if rows_affected == 0:
            raise HTTPException(status_code=404, detail=f"Power BI report with ID {report_id} not found")
        
        username = user.get('sub') or user.get('username') or 'admin'
        logger.info(f"Power BI report ID {report_id} deleted by {username}")
        
        return {
            "success": True,
            "message": f"Power BI report {report_id} deleted successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e)
        logger.error(f"Error deleting Power BI report {report_id}: {msg}")
        if 'ODBC Driver' in msg or 'SQLDriverConnect' in msg or 'IM002' in msg:
            raise HTTPException(status_code=503, detail="SQL Server not available")
        raise HTTPException(status_code=500, detail=f"Failed to delete Power BI report: {msg}")


@router.post('/powerbi/export-html')
async def export_powerbi_to_html(file_path: str = Form(...), _user=Depends(get_current_user)):
    """Export Power BI report to HTML for web viewing (requires Power BI Desktop installed)"""
    try:
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"Power BI file not found: {file_path}")
        
        if not file_path.lower().endswith('.pbix'):
            raise HTTPException(status_code=400, detail="File must be a .pbix Power BI file")
        
        # Create exports directory
        app_dir = os.path.dirname(os.path.dirname(__file__))
        export_dir = os.path.join(app_dir, 'frontend', 'powerbi_exports')
        os.makedirs(export_dir, exist_ok=True)
        
        # Generate unique export filename
        import hashlib
        file_hash = hashlib.md5(file_path.encode()).hexdigest()[:8]
        base_name = os.path.splitext(os.path.basename(file_path))[0]
        export_name = f"{base_name}_{file_hash}"
        
        # For now, just provide the file info
        # Full HTML export would require Power BI Report Server or Power BI Embedded
        return {
            "success": True,
            "message": "To view this report without publishing, you need one of these options:",
            "options": [
                {
                    "name": "Power BI Desktop",
                    "description": "Open file directly in Power BI Desktop (click 'Open in Desktop' button)",
                    "action": "open_desktop"
                },
                {
                    "name": "Power BI Report Server",
                    "description": "Install Power BI Report Server (free on-premises solution)",
                    "url": "https://www.microsoft.com/en-us/download/details.aspx?id=57270",
                    "action": "install_report_server"
                },
                {
                    "name": "Export to PDF/Images",
                    "description": "Export pages as static PDF or images from Power BI Desktop",
                    "action": "export_static"
                }
            ],
            "file_path": file_path
        }
            
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e)
        logger.error(f"Error processing Power BI file: {msg}")
        raise HTTPException(status_code=500, detail=f"Failed to process Power BI file: {msg}")


@router.post('/powerbi/open-local')
async def open_local_powerbi(file_path: str = Form(...), _user=Depends(get_current_user)):
    """Open a local Power BI Desktop file"""
    try:
        import subprocess
        
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"Power BI file not found: {file_path}")
        
        if not file_path.lower().endswith('.pbix'):
            raise HTTPException(status_code=400, detail="File must be a .pbix Power BI file")
        
        # Open with default application (Power BI Desktop)
        if platform.system() == 'Windows':
            os.startfile(file_path)
            logger.info(f"Opened Power BI file: {file_path}")
            return {"success": True, "message": f"Opening {os.path.basename(file_path)} in Power BI Desktop"}
        else:
            raise HTTPException(status_code=400, detail="Opening local .pbix files is only supported on Windows")
            
    except HTTPException:
        raise
    except Exception as e:
        msg = str(e)
        logger.error(f"Error opening Power BI file: {msg}")
        raise HTTPException(status_code=500, detail=f"Failed to open Power BI file: {msg}")


@router.get('/powerbi/local-files')
async def list_local_powerbi_files(_user=Depends(get_current_user)):
    """List available local Power BI files in the application directory"""
    try:
        app_dir = os.path.dirname(os.path.dirname(__file__))
        pbix_files = []
        
        # Search for .pbix files in the app directory and subdirectories
        for root, dirs, files in os.walk(app_dir):
            for file in files:
                if file.lower().endswith('.pbix'):
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, app_dir)
                    file_size = os.path.getsize(full_path)
                    modified_time = datetime.datetime.fromtimestamp(os.path.getmtime(full_path))
                    
                    pbix_files.append({
                        'name': file,
                        'path': full_path,
                        'relative_path': rel_path,
                        'size': file_size,
                        'size_mb': round(file_size / (1024 * 1024), 2),
                        'modified': modified_time.isoformat()
                    })
        
        # Sort by name
        pbix_files.sort(key=lambda x: x['name'])
        
        logger.info(f"Found {len(pbix_files)} Power BI files")
        return {"files": pbix_files}
        
    except Exception as e:
        msg = str(e)
        logger.error(f"Error listing Power BI files: {msg}")
        raise HTTPException(status_code=500, detail=f"Failed to list Power BI files: {msg}")


@router.get('/powerbi/health')
async def powerbi_health(url: Optional[str] = None, _user=Depends(get_current_user)):
    """Health check and classification for the stored (or provided) Power BI embed URL.

    Returns:
    - input_url: original URL (stored or provided)
    - normalized_url: URL after applying embedding normalization
    - classification: portal | legacy | cloud | unknown | none
    - status_code: HTTP status from probing normalized URL (if probed)
    - ok: boolean (True if status looks usable: 200 or 401)
    - needs_embed_param: True if rs:embed=true was added
    - error: error string if probe failed
    """
    probe_url = url
    classification = 'none'
    stored_url = None

    try:
        if not probe_url:
            # Fetch stored settings
            conn = db.get_sqlserver_connection()
            if conn:
                cursor = conn.cursor()
                cursor.execute("""
                    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'powerbi_settings')
                    CREATE TABLE powerbi_settings (
                        id INT IDENTITY(1,1) PRIMARY KEY,
                        embed_url NVARCHAR(MAX),
                        title NVARCHAR(255),
                        enabled BIT DEFAULT 1,
                        show_filter_pane BIT DEFAULT 1,
                        show_nav_pane BIT DEFAULT 1,
                        allow_fullscreen BIT DEFAULT 1,
                        updated_at DATETIME DEFAULT GETDATE(),
                        updated_by NVARCHAR(100)
                    )
                """)
                conn.commit()
                cursor.execute("""
                    SELECT TOP 1 embed_url FROM powerbi_settings ORDER BY id DESC
                """)
                r = cursor.fetchone()
                if r and r[0]:
                    stored_url = r[0]
                cursor.close()
                conn.close()
            probe_url = stored_url

        if not probe_url:
            return {
                'input_url': None,
                'normalized_url': None,
                'classification': 'none',
                'status_code': None,
                'ok': False,
                'needs_embed_param': False,
                'error': 'No URL configured'
            }

        lower = probe_url.lower()
        if 'app.powerbi.com' in lower:
            classification = 'cloud'
        elif '/reports/' in lower:
            classification = 'portal'
        elif '/reportserver' in lower:
            classification = 'legacy'
        else:
            classification = 'unknown'

        normalized = normalize_powerbi_url(probe_url)
        needs_embed_param = 'rs:embed=true' in normalized and 'rs:embed=true' not in probe_url

        status_code = None
        error = None
        ok = False

        # Only probe non-cloud URLs (cloud would require tokens)
        if classification in ('portal', 'legacy', 'unknown'):
            try:
                # Use GET since HEAD may be blocked; short timeout
                resp = requests.get(normalized, timeout=5, verify=False)
                status_code = resp.status_code
                # 200 OK or 401 Unauthorized (Integrated Auth challenge) both acceptable for existence
                ok = status_code in (200, 401)
            except Exception as e:
                error = str(e)
        else:
            error = 'Cloud URL not supported for on-prem embedding'

        return {
            'input_url': probe_url,
            'normalized_url': normalized,
            'classification': classification,
            'status_code': status_code,
            'ok': ok,
            'needs_embed_param': needs_embed_param,
            'error': error,
        }
    except Exception as e:
        return {
            'input_url': probe_url,
            'normalized_url': None,
            'classification': 'error',
            'status_code': None,
            'ok': False,
            'needs_embed_param': False,
            'error': str(e),
        }


    """Return a pyodbc connection to the separate 'report' database if configured.
    Falls back to main SQL Server connection if no separate DB provided.
    """
    try:
        import pyodbc
    except Exception:
        return None

    s = dbc.load_settings()
    # If a separate report database is configured, use it; else fall back
    server = s.get('host')
    report_db = s.get('report_database') or s.get('reports_database')
    main_db = s.get('database')
    if not server or not (report_db or main_db):
        return None

    driver = _pick_odbc_driver(s.get('driver'))
    parts = [f'DRIVER={{{driver}}}', f'SERVER={server}', f'DATABASE={report_db or main_db}']
    if s.get('trusted', True):
        parts.append('Trusted_Connection=yes')
    else:
        uid = s.get('username') or ''
        pwd = s.get('password') or ''
        if uid:
            parts.append(f'UID={uid}')
        if pwd:
            parts.append(f'PWD={pwd}')
    if s.get('encrypt', False):
        parts.append('Encrypt=yes')
    conn_str = ';'.join(parts)
    try:
        return pyodbc.connect(conn_str, timeout=5)
    except Exception:
        return None


