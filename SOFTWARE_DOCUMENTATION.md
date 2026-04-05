**Overview**
- **Project:** ReportApp — lightweight FastAPI backend with a static frontend for importing data, managing report definitions, and running reports against SQL Server or SQLite.
- **Purpose:** Import CSV/Excel, store import logs, define stored-procedure-based reports, and surface Power BI embeds.

**Architecture**
- **Backend:** `app` (FastAPI) — serves API and static frontend; main entry `app/main.py`.
- **Frontend:** `frontend` — static HTML/CSS/JS served under `/static` and root routes.
- **Data:** Supports SQL Server (pyodbc) as primary operational DB and SQLite fallback for application state.
- **Config:** Persistent admin settings in `instance/settings.json`.

**Key Backend Modules**
- **`app/main.py`**: FastAPI app, static mounting, startup/shutdown hooks, routes to serve frontend pages (`/`, `/report`, `/import`, `/powerbi`).
- **`app/api.py`**: Main API router with authentication, admin helpers, import endpoints, report definition management, report execution, Power BI endpoints, ODBC helpers, and admin settings.
- **`app/db.py`**: Database schema for SQLite fallback, initialization, and helper to switch DB.
- **`app/db_connection.py`**: Loads `instance/settings.json`, builds connection strings, and returns live pyodbc connections.
- **`app/config.py`**: Base directory constants.

**Major API Endpoints (high-level)**
- Authentication
  - `POST /login` — returns JWT token (8h expiry). Default fallback admin/admin when no DB available.
  - `GET /api/me` — current user profile.
- Admin / Settings
  - `GET/PUT /admin/settings` — read/update admin UI settings (admin-only).
  - `POST /settings/test` — test ODBC connection (pyodbc required).
  - `POST /settings/list-databases` — list DBs on server.
- Importing
  - `POST /import-data` — upload CSV/XLSX, handles duplicates (append/overwrite/skip), logs to `import_log`, supports large imports via pandas/SQLAlchemy or PowerShell fallback.
  - `POST /get-sheet-names`, `POST /import-preview` — helper import UX endpoints.
- Reports
  - `GET /report/definitions`, `POST /report/definitions` — manage stored-procedure based report definitions.
  - `POST /report/run` — execute stored procedure against the reports DB and return tabular results.
  - `GET /report/parameter-values/{def_id}/{param_name}` — lookup values for parameter dropdowns.
- Power BI
  - `/powerbi/*` endpoints to manage embeds and list local `.pbix` files.
- Diagnostics & Admin
  - `GET /diag`, `GET /api/summary/details/{metric}`, `GET /admin/databases`, etc.

**Authentication & Security**
- JWT-based Bearer tokens signed with `JWT_SECRET` (env var) using HS256. Tokens expire in 8 hours.
- Admin checks via `get_current_admin` (JWT role == 'admin') or special `ADMIN_SETTINGS_PASSWORD` for saving settings in some flows.
- Default seeded admin: `admin`/`admin` (only if no users exist and SQLite fallback used). Change immediately in production.

**Database & Settings**
- Settings file path: `instance/settings.json` (used by `app/db_connection.py` and `app/api.py`).
- SQL Server (preferred): built via ODBC connection string; requires Microsoft ODBC Driver (17/18) and `pyodbc` installed.
- SQLite fallback: file `reportapp.db` (default) used by `databases` and SQLAlchemy for app-local state and seeds.
- Tables created/ensured at runtime for SQL Server (many helper functions create tables if missing).

**Frontend Structure**
- `frontend/index.html` — main entry (served at `/`).
- `frontend/login.html` — login page.
- `frontend/report.html` — report generation UI; logic in `frontend/report.js`.
- `frontend/import.html` — import UI and uses import helper APIs.
- `frontend/app.js` — admin UI, user management, settings, and report definitions flows.
- `frontend/powerbi.js` — Power BI embed handling.

**Logs & Debugging**
- API errors logged to `d:\Software\ReportApp\api_errors.log` (see `logging` config in `app/api.py`).
- Common runtime issues:
  - Missing `pyodbc` or ODBC driver: import/test endpoints return helpful messages; install driver and `pyodbc`.
  - SQL Server connectivity: verify `instance/settings.json` and ODBC driver.
  - Port conflicts for dev server: default `uvicorn` uses `127.0.0.1:8000`.

**Setup & Run (development)**
- Create virtualenv and install deps:

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

- Set environment variables (recommended):
  - `JWT_SECRET` — strong secret for JWT signing.
  - `ADMIN_SETTINGS_PASSWORD` — secret to protect admin settings updates (optional).

- Run the app:

```powershell
.\.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

- To enable SQL Server features, install ODBC Driver 17/18 for SQL Server and `pyodbc` in the Python environment.

**Notes & Recommendations**
- Replace default secrets immediately (`JWT_SECRET`, default admin password).
- Add a `.gitignore` to exclude `instance/settings.json`, `*.db`, `__pycache__`, and any temporary files.
- Consider extracting large import logic into a background job/worker for resilience and progress reporting.
- Generate a minimal API reference (OpenAPI) by visiting `/docs` when the server is running.

**Next Steps I can take**
- Add `SOFTWARE_DOCUMENTATION.md` to the repo (done).
- Create a `.gitignore` and protect `instance/settings.json` (ask to proceed).
- Produce a separate API reference (markdown) or OpenAPI export.

---
Generated from code under `app` and `frontend`. If you'd like more detail for any section (full endpoint list, sequence diagrams, or README-style quickstart), tell me which part to expand.