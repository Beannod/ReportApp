@echo off
SETLOCAL ENABLEDELAYEDEXPANSION
echo step 1
SET SKIP_INSTALL=
echo step 2
if /I "%1"=="noinstall" (
  SET SKIP_INSTALL=1
)
echo step 3 SKIP=[%SKIP_INSTALL%]
if NOT DEFINED SKIP_INSTALL (
  echo step 4 inside block
  echo Activating virtual environment and installing requirements (if needed)...
  echo step 5
) else (
  echo step 4 else
)
echo step 6
