@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required to run this app.
  echo Please install Node.js from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo Starting turning-envelope-simulator local server...
start "turning-envelope-simulator server" /min node dev-server.js

timeout /t 1 >nul
start "" "http://127.0.0.1:4173/"

echo.
echo The app should now be open in your browser.
echo URL: http://127.0.0.1:4173/
echo Close the "turning-envelope-simulator server" window to stop the server.
echo.
pause
