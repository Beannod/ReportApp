# ReportApp — minimal FastAPI reporting scaffold

This repository contains a small FastAPI backend and a static frontend used for development and simple CSV imports + reporting.

Quick start (Windows PowerShell)

1. Create virtual environment and install deps

```powershell
py -3 -m venv .venv
. .venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
```

2. Start the app (foreground)

```powershell
. .venv\\Scripts\\Activate.ps1
.\\run_dev.ps1
# or (no reload)
.venv\\Scripts\\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

3. Start the app (background, logs -> uvicorn.log)

```powershell
. .venv\\Scripts\\Activate.ps1
.\\run_dev.ps1 -Detach
# or use the wrapper batch file from cmd.exe
cmd /C "run_app.bat -Detach"
```

Open a browser at http://127.0.0.1:8001/ for the frontend and http://127.0.0.1:8001/docs for the interactive OpenAPI docs.

Developer notes
- `run_dev.ps1` is a convenience script that creates/activates `.venv`, optionally installs requirements, and starts uvicorn either in the foreground or as a detached job.
- `run_app.bat` calls `run_dev.ps1` and is handy from cmd.exe.
- If you see a passlib/bcrypt message about `bcrypt.__about__` during startup it's usually harmless; upgrading/downgrading `bcrypt` may silence it.

File layout
- `app/` — FastAPI application code
- `frontend/` — static files (index.html, app.js, styles.css)
- `requirements.txt` — Python dependencies
- `run_dev.ps1` — developer helper (create venv, install, start uvicorn)
- `run_app.bat` — Windows batch wrapper for convenience

API summary (short)
- POST /login — expects JSON {username, password}. Returns token/role in the scaffold.
- POST /import-data — multipart/form-data file upload field name `files`. Accepts CSVs and saves rows to the DB.
- POST /run-report — form field `report_name`. Returns a very small JSON report (row counts).
- GET /diag — diagnostic info about DB and settings.
- GET /docs — FastAPI interactive docs (OpenAPI UI).

---

# Component map & responsibilities

This file documents the major components of the ReportApp project and the files that implement them.

---

## Frontend (static)

Files:
- `frontend/index.html`
- `frontend/login.html`
- `frontend/app.js`
- `frontend/styles.css`

Responsibility:
- UI for login, DB settings, import CSV, run reports, and user management.
- Communicates with backend REST API endpoints using JSON and multipart for file uploads.
- `index.html` serves the SPA; `app.js` contains client logic, fetch wrappers, DOM handlers, and flows.

---

## Backend (FastAPI)

Files:
- `app/main.py`
- `app/api.py`
- `app/db.py`
- `app/config.py` (if present)

Responsibility:
- Expose REST API used by the frontend.
- Mount the frontend static folder at `/static` and serve `index.html` at `/`.
- Manage database connection, metadata, and tables.
- Implement business logic endpoints (login, import-data, run-report, settings/test, settings/create-db, settings/list-databases, settings/save, create-user).

Important behaviors:
- `app.main` mounts `/static` and returns `index.html` at `/`.
- Startup event `@app.on_event("startup")` calls `db.init_db()` which creates tables and seeds an admin user.
- `app.api` implements the router with the endpoints listed above.

---

## Database abstraction

Files:
- `app/db.py`

Responsibility:
- Build the SQLAlchemy engine and return a `Database` instance from the `databases` package.
- Define metadata and tables: `users`, `report_data`, `import_log`, `report_log`.
- Determine the active DB URL: use `instance/settings.json` (mssql+pyodbc) when available; otherwise default to `sqlite:///./reportapp.db` for local dev.

---

## Scripts & Operations

Files/Scripts:
- `run_app.bat` — developer helper that checks port 8001, stops an existing server, creates/activates `.venv`, installs requirements, and starts uvicorn (optionally with `reload`).
- `tools/*` — helper scripts (tests, debug scripts) used for development and diagnostics.

Responsibility:
- Provide convenient developer commands to start the app, prepare environment, and run diagnostics.

---

Next improvements
- Add proper JWT-based dependency and protect admin endpoints.
- Consolidate `app/api.py` (there are duplicate/overlapping handlers that should be cleaned).
- Add pytest-based tests and CI workflow.

Images to PowerPoint
--------------------

If you have a folder of images and want a single PowerPoint file with one image per slide, use the included script:

```powershell
# from the repo root
py -3 .venv\Scripts\python.exe scripts\images_to_pptx.py -i path\to\images -o output.pptx
```

The script adds each image file (png/jpg/gif/...) as its own slide and scales it to fit while preserving aspect ratio.

License
- MIT
