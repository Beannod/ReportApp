import os
import json
import urllib.parse
from typing import Optional

SETTINGS_PATH = os.path.join(os.path.dirname(__file__), '..', 'instance', 'settings.json')


def load_settings() -> dict:
    """Load DB settings from instance/settings.json if present, else {}."""
    try:
        if os.path.exists(SETTINGS_PATH):
            with open(SETTINGS_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def get_database_url_from_settings() -> str:
    """Return SQLAlchemy-style URL from settings or fallback to sqlite file."""
    s = load_settings()
    if s.get('sqlite'):
        return s['sqlite']
    host = s.get('host')
    database = s.get('database')
    if host and database:
        # Build a robust ODBC connection string and return as an odbc_connect URL
        driver = s.get('driver', 'ODBC Driver 18 for SQL Server')
        # Build the raw ODBC connection string pieces
        parts = [f"DRIVER={{{driver}}}"]
        # SERVER must include instance when present
        if '\\' in host:
            parts.append(f"SERVER={host}")
        else:
            parts.append(f"SERVER={host},{s.get('port', 1433)}")
        parts.append(f"DATABASE={database}")
        if s.get('trusted', True):
            parts.append('Trusted_Connection=yes')
        else:
            uid = s.get('username', '')
            pwd = s.get('password', '')
            if uid:
                parts.append(f'UID={uid}')
            if pwd:
                parts.append(f'PWD={pwd}')
        if s.get('encrypt', False):
            parts.append('Encrypt=yes')
        parts.append('TrustServerCertificate=yes')
        raw = ';'.join(parts)
        return f"mssql+pyodbc:///?odbc_connect={urllib.parse.quote_plus(raw)}"
    # default sqlite
    return os.environ.get('DATABASE_URL') or 'sqlite:///./reportapp.db'


def get_odbc_connection_string() -> Optional[str]:
    """Build a pyodbc connection string from settings; None if insufficient."""
    s = load_settings()
    server = s.get('host')
    database = s.get('database')
    if not server or not database:
        return None
    driver = s.get('driver', 'ODBC Driver 17 for SQL Server')
    parts = [f'DRIVER={{{driver}}}', f'SERVER={server}', f'DATABASE={database}']
    if s.get('trusted', True):
        parts.append('Trusted_Connection=yes')
    else:
        uid = s.get('username', '')
        pwd = s.get('password', '')
        if uid:
            parts.append(f'UID={uid}')
        if pwd:
            parts.append(f'PWD={pwd}')
    if s.get('encrypt', False):
        parts.append('Encrypt=yes')
    # Add TrustServerCertificate if present in settings
    parts.append('TrustServerCertificate=yes')
    return ';'.join(parts)


def get_sqlserver_connection(timeout: int = 5):
    """Return a live pyodbc connection using current settings, or None."""
    try:
        import pyodbc
    except Exception:
        return None
    conn_str = get_odbc_connection_string()
    if not conn_str:
        return None
    return pyodbc.connect(conn_str, timeout=timeout)


def use_sqlserver() -> bool:
    """True if settings indicate MSSQL should be used for primary DB."""
    return get_database_url_from_settings().startswith('mssql')
