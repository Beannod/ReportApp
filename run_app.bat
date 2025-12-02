@echo off
REM Convenience wrapper to start the app on Windows
SETLOCAL
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_dev.ps1" %*
ENDLOCAL
@echo off
REM run_app.bat — check for active server, stop if running, then create venv if missing, install requirements, and start the app
SETLOCAL ENABLEDELAYEDEXPANSION

echo Checking for active server on port 8001 (only LISTENING)...
REM Only treat sockets in LISTENING state as an active server. This avoids false-positives
REM like TIME_WAIT which can show PID 0 on some systems.
netstat -ano | findstr :8001 | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo Active listening server found on port 8001. Stopping it...
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8001 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
    echo Server stopped PID: %%a
  )
) else (
  echo No active listening server found on port 8001.
)

echo DEBUG: after netstat check


REM If first arg is 'noinstall' skip venv activation and pip install
SET SKIP_INSTALL=
if /I "%1"=="noinstall" (
  SET SKIP_INSTALL=1
)

if NOT DEFINED SKIP_INSTALL (
  if not exist ".venv\Scripts\python.exe" (
    echo Creating virtual environment...
    py -3 -m venv .venv
  )

  echo Activating virtual environment and installing requirements (if needed)...
  call .venv\Scripts\Activate.bat
  pip install --upgrade pip
  pip install -r requirements.txt
) else (
  echo Skipping virtual environment activation and package installation (-- noinstall) ...
  if exist ".venv\Scripts\Activate.bat" (
    call .venv\Scripts\Activate.bat
  )
)

echo Starting uvicorn...
REM Start uvicorn without the auto-reloader by default to avoid repeated file reading.
REM Pass the word "reload" as the first argument to enable auto-reload for development.
SET RELOAD_FLAG=
REM Handle optional flags: 'noinstall' optionally followed by 'reload'
if /I "%1"=="reload" (
  SET RELOAD_FLAG=--reload
) else (
  if /I "%2"=="reload" (
    SET RELOAD_FLAG=--reload
  )
)

py -m uvicorn app.main:app %RELOAD_FLAG%

REM Wait a moment for the server to start
timeout /t 3 /nobreak >nul

REM Open the browser to the app
start http://127.0.0.1:8001

ENDLOCAL
pause
