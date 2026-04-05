@echo off
setlocal ENABLEDELAYEDEXPANSION
cd /d "%~dp0"

:menu
cls
echo ========================================
echo        ReportApp Server Control
echo ========================================
echo [1] Start Server
echo [2] Restart Server
echo [3] Stop Server
echo [4] Exit
echo.
set /p CHOICE=Select an option (1-4): 

if "%CHOICE%"=="1" goto start_server
if "%CHOICE%"=="2" goto restart_server
if "%CHOICE%"=="3" goto stop_server
if "%CHOICE%"=="4" goto end

echo Invalid choice. Please try again.
timeout /t 2 /nobreak >nul
goto menu

:start_server
echo.
echo Starting server in a new window...
start "ReportApp Server" cmd /k "cd /d "%~dp0" ^& call run_app.bat noinstall"
timeout /t 2 /nobreak >nul
goto menu

:stop_server
echo.
echo Stopping server on port 8001...
set FOUND=
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :8001 ^| findstr LISTENING') do (
  set FOUND=1
  taskkill /PID %%P /F >nul 2>&1
  echo Stopped PID %%P
)
if not defined FOUND echo No active listening server found on port 8001.
timeout /t 2 /nobreak >nul
goto menu

:restart_server
echo.
echo Restarting server...
set FOUND=
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :8001 ^| findstr LISTENING') do (
  set FOUND=1
  taskkill /PID %%P /F >nul 2>&1
  echo Stopped PID %%P
)
if not defined FOUND echo No existing server found. Starting fresh...
start "ReportApp Server" cmd /k "cd /d "%~dp0" ^& call run_app.bat noinstall"
timeout /t 2 /nobreak >nul
goto menu

:end
echo Exiting...
endlocal
exit /b 0
