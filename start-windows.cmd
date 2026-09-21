@echo off
setlocal EnableExtensions

REM Run this project from its own folder, even when launched by double-clicking.
cd /d "%~dp0"

echo.
echo ======================================================
echo   XTH-MMG Interactive Studio - Windows Launcher
echo ======================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Install Node.js 20 LTS or newer, then run this file again.
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found. Reinstall Node.js 20 LTS or newer.
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [ERROR] package.json is missing.
  echo Keep this file in the root folder of the extracted project.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing project dependencies. This is only needed the first time.
  call npm ci
  if errorlevel 1 (
    echo.
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
  )
)

echo.
echo Starting web UI and OSC bridge...
echo Close this window or press Ctrl+C to stop the system.
echo.
call npm run start

echo.
echo XTH-MMG has stopped.
pause
