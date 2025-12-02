import os
import sqlalchemy
from databases import Database
from sqlalchemy import MetaData, Table, Column, Integer, String, DateTime, Text
import datetime
from passlib.context import CryptContext
from . import db_connection as dbc

SETTINGS_PATH = os.path.join(os.path.dirname(__file__), '..', 'instance', 'settings.json')

def _default_db_url():
    return os.environ.get('DATABASE_URL') or 'sqlite:///./reportapp.db'


def get_database_url_from_settings():
    # Delegate to centralized module
    try:
        return dbc.get_database_url_from_settings()
    except Exception:
        return _default_db_url()


DATABASE_URL = get_database_url_from_settings()

# Check if SQL Server connection is configured (delegated)
use_sqlserver = DATABASE_URL.startswith('mssql')

if use_sqlserver:
    # For SQL Server, use None for database (we'll use pyodbc directly)
    database = None
else:
    # For SQLite, use databases library
    database = Database(DATABASE_URL)

metadata = MetaData()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_odbc_connection_string():
    # Delegate to centralized module
    return dbc.get_odbc_connection_string()

def get_sqlserver_connection():
    """Get a direct pyodbc connection to SQL Server using settings.json"""
    if use_sqlserver:
        return dbc.get_sqlserver_connection()
    return None

users = Table(
    'users', metadata,
    Column('id', Integer, primary_key=True),
    Column('username', String(100), unique=True, nullable=False),
    Column('password_hash', String(255), nullable=False),
    Column('role', String(50), default='user'),
    Column('created_at', DateTime)
)

report_data = Table(
    'report_data', metadata,
    Column('id', Integer, primary_key=True),
    Column('source_file', String(255)),
    Column('json_payload', Text),
    Column('created_at', DateTime)
)

import_log = Table(
    'import_log', metadata,
    Column('id', Integer, primary_key=True),
    Column('file_name', String(255)),
    Column('rows_imported', Integer),
    Column('status', String(50)),
    Column('started_at', DateTime),
    Column('finished_at', DateTime)
)

report_log = Table(
    'report_log', metadata,
    Column('id', Integer, primary_key=True),
    Column('report_name', String(255)),
    Column('parameters', Text),
    Column('status', String(50)),
    Column('started_at', DateTime),
    Column('finished_at', DateTime)
)


def _create_engine(url):
    if url.startswith('sqlite'):
        return sqlalchemy.create_engine(url, connect_args={"check_same_thread": False})
    return sqlalchemy.create_engine(url)


engine = _create_engine(DATABASE_URL)


async def init_db():
    if use_sqlserver:
        # For SQL Server, tables are already created by setup script
        # Just verify connection
        try:
            conn = get_sqlserver_connection()
            conn.close()
        except Exception as e:
            print(f"SQL Server connection warning: {e}")
    else:
        # For SQLite, create tables and connect
        metadata.create_all(engine)
        try:
            await database.connect()
        except Exception:
            pass
    # seed admin user if not present (SQLite only, SQL Server has it already)
    if not use_sqlserver:
        try:
            query = users.select().where(users.c.username == 'admin')
            existing = await database.fetch_one(query)
            if not existing:
                hashed = pwd_context.hash('admin')
                await database.execute(users.insert().values(username='admin', password_hash=hashed, role='admin', created_at=datetime.datetime.utcnow()))
        except Exception:
            pass


async def shutdown_db():
    if not use_sqlserver and database:
        try:
            await database.disconnect()
        except Exception:
            pass


async def switch_database(new_url: str):
    global DATABASE_URL, engine, database
    try:
        await database.disconnect()
    except Exception:
        pass
    DATABASE_URL = new_url
    engine = _create_engine(DATABASE_URL)
    metadata.create_all(engine)
    database = Database(DATABASE_URL)
    try:
        await database.connect()
    except Exception:
        pass
