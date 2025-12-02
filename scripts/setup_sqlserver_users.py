# Script to create users table in SQL Server and sync admin user
import pyodbc
from passlib.context import CryptContext
import datetime

# Connection settings
server = r'DESKTOP-LB9B6I4\SQLEXPRESS'
database = 'ReportApp'
conn_str = f'DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={server};DATABASE={database};Trusted_Connection=yes;'

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

try:
    # Connect to SQL Server
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()
    
    # Create users table if not exists
    create_table_sql = """
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users')
    BEGIN
        CREATE TABLE users (
            id INT IDENTITY(1,1) PRIMARY KEY,
            username NVARCHAR(255) NOT NULL UNIQUE,
            password_hash NVARCHAR(255) NOT NULL,
            role NVARCHAR(50) NOT NULL DEFAULT 'user',
            created_at DATETIME DEFAULT GETDATE()
        )
    END
    """
    cursor.execute(create_table_sql)
    conn.commit()
    print("✓ Users table created/verified in SQL Server")
    
    # Check if admin user exists
    cursor.execute("SELECT id FROM users WHERE username = 'admin'")
    admin_exists = cursor.fetchone()
    
    if not admin_exists:
        # Create admin user
        admin_hash = pwd_context.hash('admin')
        cursor.execute(
            "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
            ('admin', admin_hash, 'admin', datetime.datetime.now())
        )
        conn.commit()
        print("✓ Admin user created in SQL Server (username: admin, password: admin)")
    else:
        print("✓ Admin user already exists in SQL Server")
    
    # List all users
    cursor.execute("SELECT id, username, role, created_at FROM users")
    users = cursor.fetchall()
    print(f"\n✓ Users in SQL Server ({len(users)} total):")
    for user in users:
        print(f"  ID: {user[0]}, Username: {user[1]}, Role: {user[2]}, Created: {user[3]}")
    
    cursor.close()
    conn.close()
    print("\n✓ SQL Server users table is ready!")
    
except Exception as e:
    print(f"✗ Error: {e}")
