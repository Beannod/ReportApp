from fastapi import FastAPI, Response, Request, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from . import api, db
from . import db_connection as dbc
import os
from fastapi.responses import FileResponse

app = FastAPI(title="ReportApp")

# Custom StaticFiles class to disable caching
class NoCacheStaticFiles(StaticFiles):
    async def __call__(self, scope, receive, send):
        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                # Remove any existing cache headers and add no-cache headers
                headers = [h for h in headers if h[0].lower() not in (b'cache-control', b'etag', b'expires')]
                headers.append((b'cache-control', b'no-cache, no-store, must-revalidate'))
                headers.append((b'pragma', b'no-cache'))
                headers.append((b'expires', b'0'))
                message["headers"] = headers
            await send(message)
        await super().__call__(scope, receive, send_wrapper)

# Mount frontend static folder
static_dir = os.path.join(os.path.dirname(__file__), '..', 'frontend')
if os.path.isdir(static_dir):
    app.mount('/static', NoCacheStaticFiles(directory=static_dir), name='static')

app.include_router(api.router)


@app.on_event('startup')
async def startup():
    await db.init_db()


@app.on_event('shutdown')
async def shutdown():
    await db.shutdown_db()


@app.get('/')
async def root():
    # Serve the frontend index if present
    index_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'index.html')
    index_path = os.path.normpath(index_path)
    if os.path.exists(index_path):
        return FileResponse(index_path, media_type='text/html')
    return { 'message': 'ReportApp backend running. No frontend index found.' }


@app.get('/login', include_in_schema=False)
async def login_page():
    # Serve the frontend login page if present
    login_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'login.html')
    login_path = os.path.normpath(login_path)
    if os.path.exists(login_path):
        return FileResponse(login_path, media_type='text/html')
    # Fallback: redirect users to root if login page missing
    index_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'index.html')
    index_path = os.path.normpath(index_path)
    if os.path.exists(index_path):
        return FileResponse(index_path, media_type='text/html')
    return Response(status_code=404)


@app.get('/powerbi', include_in_schema=False)
async def powerbi_page():
    # Serve dedicated Power BI dashboard page
    # NOTE: Like /report and /import, the page itself is public so browsers can load the UI.
    # API endpoints used by the page remain protected by authentication.
    # The frontend reads the token from sessionStorage and includes it in API calls.
    pb_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'powerbi.html')
    pb_path = os.path.normpath(pb_path)
    if os.path.exists(pb_path):
        return FileResponse(pb_path, media_type='text/html')
    return { 'message': 'Power BI page not found. Please ensure powerbi.html exists.' }


@app.get('/favicon.ico', include_in_schema=False)
async def favicon():
    # Serve frontend favicon if present; otherwise return 204 to avoid noisy 404s
    fav_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'favicon.ico')
    fav_path = os.path.normpath(fav_path)
    if os.path.exists(fav_path):
        return FileResponse(fav_path)
    return Response(status_code=204)


@app.get('/report', include_in_schema=False)
async def report_page():
    # Serve the report generation page if present. Auth is enforced by API endpoints;
    # the frontend reads the token from sessionStorage and will call protected APIs.
    report_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'report.html')
    report_path = os.path.normpath(report_path)
    # If no report DB/server is configured, show a clear message so users know
    # the reports feature is not yet connected. Do not remove existing logic;
    # this simply returns a friendly page when no DB settings are present.
    try:
        s = dbc.load_settings()
        server = s.get('host')
        report_db = s.get('report_database') or s.get('reports_database') or s.get('database')
        if not server or not report_db:
            # Return a minimal HTML response indicating no DB is configured for reports
            return Response(content="<html><body><h2>No report database configured</h2><p>The reports feature is not connected to a database. Configure the database under Admin Settings to enable reports.</p></body></html>", media_type='text/html')
    except Exception:
        # If settings cannot be read, show the same informative message
        return Response(content="<html><body><h2>No report database configured</h2><p>The reports feature is not connected to a database. Configure the database under Admin Settings to enable reports.</p></body></html>", media_type='text/html')

    if os.path.exists(report_path):
        return FileResponse(report_path, media_type='text/html')
    return Response(status_code=404)


@app.get('/report.html', include_in_schema=False)
async def report_page_html():
    # Direct mapping for clients requesting /report.html. Serve the static page; the
    # frontend will perform authenticated API calls using the stored token.
    report_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'report.html')
    report_path = os.path.normpath(report_path)
    if os.path.exists(report_path):
        return FileResponse(report_path, media_type='text/html')
    return Response(status_code=404)


@app.get('/import', include_in_schema=False)
async def import_page():
    # Serve the enhanced import data page.
    # NOTE: the page itself is deliberately public so browsers can load the UI; API
    # endpoints used by the page remain protected by admin checks. The frontend
    # must include the Authorization header for API calls.
    import_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'import.html')
    import_path = os.path.normpath(import_path)
    if os.path.exists(import_path):
        return FileResponse(import_path, media_type='text/html')
    return Response(status_code=404)


@app.get('/import.html', include_in_schema=False)
async def import_page_html():
    # Direct mapping for clients requesting /import.html. The HTML page is
    # served without authentication; API endpoints used by the page remain
    # protected by `api.get_current_admin` where appropriate.
    import_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'import.html')
    import_path = os.path.normpath(import_path)
    if os.path.exists(import_path):
        return FileResponse(import_path, media_type='text/html')
    return Response(status_code=404)


@app.get('/.well-known/appspecific/com.chrome.devtools.json', include_in_schema=False)
async def chrome_devtools_probe():
    # Some browsers/extensions probe this path; respond with 204 instead of 404
    return Response(status_code=204)
