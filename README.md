# README

## Architecture
... existing content ...

## Database flow
Settings are stored in instance/settings.json; app prefers SQL Server via ODBC/pyodbc; SQLite fallback is used for app-local state when SQL Server isn't available; importing writes uploaded CSV/XLSX into target tables and records an import_log; reports are executed as stored procedures against the reports DB and returned as tabular results.

## Setup Instructions

To run the application, make sure you have uvicorn installed. Use the following command:

```bash
uvicorn app.main:app --reload
```

... rest of the README content ...