@echo off
rem Green - open the desktop panel (ASCII name on purpose: shortcuts stay encoding-safe)
cd /d "%~dp0"
netstat -aon | findstr ":8765" | findstr "LISTENING" >nul 2>nul
if errorlevel 1 (
  start "" /min powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "node server.js"
  timeout /t 2 /nobreak >nul
)
set EDGE=
where msedge >nul 2>nul && set EDGE=msedge
if not defined EDGE if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" set EDGE="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" set EDGE="C:\Program Files\Microsoft\Edge\Application\msedge.exe"
if defined EDGE (
  start "" %EDGE% --app=http://127.0.0.1:8765 --window-size=1180,760 --window-position=680,120 --no-first-run --no-default-browser-check
) else (
  start "" http://127.0.0.1:8765
)
