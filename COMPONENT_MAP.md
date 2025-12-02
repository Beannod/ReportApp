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

If you want this component map expanded into a full architecture diagram or included inside `README.md`, say so and I'll add that next.
