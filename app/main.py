from fastapi import FastAPI, Response, Request
from fastapi.staticfiles import StaticFiles
from . import api, db
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
    # Serve the report generation page if present
    report_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'report.html')
    report_path = os.path.normpath(report_path)
    if os.path.exists(report_path):
        return FileResponse(report_path, media_type='text/html')
    return Response(status_code=404)


@app.get('/report.html', include_in_schema=False)
async def report_page_html():
    # Direct mapping for clients requesting /report.html
    report_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'report.html')
    report_path = os.path.normpath(report_path)
    if os.path.exists(report_path):
        return FileResponse(report_path, media_type='text/html')
    return Response(status_code=404)


@app.get('/.well-known/appspecific/com.chrome.devtools.json', include_in_schema=False)
async def chrome_devtools_probe():
    # Some browsers/extensions probe this path; respond with 204 instead of 404
    return Response(status_code=204)
