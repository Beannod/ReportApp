import sqlite3
import os
from passlib.context import CryptContext

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'reportapp.db')
DB_PATH = os.path.abspath(DB_PATH)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

password = 'admin'

print(f"Using database: {DB_PATH}")
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# Ensure users table exists
cur.execute("""
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    created_at DATETIME
);
""")

# Upsert admin user
hashed = pwd_context.hash(password)
cur.execute("SELECT id FROM users WHERE username=?", ("admin",))
row = cur.fetchone()
if row:
    cur.execute("UPDATE users SET password_hash=?, role='admin' WHERE id=?", (hashed, row[0]))
    print("Updated existing admin password to 'admin'.")
else:
    cur.execute(
        "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'admin', datetime('now'))",
        ("admin", hashed),
    )
    print("Inserted admin user with password 'admin'.")

conn.commit()
conn.close()
print("Done.")
