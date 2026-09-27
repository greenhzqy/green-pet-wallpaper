@echo off
rem ============================================================
rem  Green companion - silent autostart (ASCII only, safe for cmd)
rem  The desktop WALLPAPER is the pet now, so there is no floating ball.
rem  Two things must be alive:
rem    1) the local pet server  (data for the wallpaper)
rem    2) Lively               (renders the wallpaper = the pet itself)
rem  Retired 2026-09-20: the floating ball (GreenBall.ps1).
rem  Files are kept in _retired\ if you ever want it back.
rem
rem  NOTE: this only runs at LOGON (HKCU\...\Run). The machine sits at a
rem  desk and is driven remotely, so a reboot with nobody logging in leaves
rem  everything stopped. That is what _watchdog.ps1 is for.
rem ============================================================
cd /d "%~dp0"

rem --- 1) pet server on 127.0.0.1:8765 ---
netstat -aon | findstr ":8765" | findstr "LISTENING" >nul 2>nul
if errorlevel 1 (
  start "" /min powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "node server.js"
  timeout /t 2 /nobreak >nul
)

rem --- 2) Lively: without it there is no pet on screen ---
tasklist /fi "IMAGENAME eq Lively.exe" 2>nul | findstr /i "Lively.exe" >nul
if errorlevel 1 (
  if exist "D:\Lively Wallpaper\Lively.exe" start "" "D:\Lively Wallpaper\Lively.exe"
  if exist "%LOCALAPPDATA%\Programs\Lively Wallpaper\Lively.exe" start "" "%LOCALAPPDATA%\Programs\Lively Wallpaper\Lively.exe"
)

rem --- 3) watchdog ---
rem  This used to start _keywatch.ps1 directly, guarded by
rem     tasklist /fi "IMAGENAME eq powershell.exe" | findstr powershell
rem  which is ALWAYS true (this bat spawns powershell itself), so every
rem  logon added one more watcher process. The watchdog now owns that job:
rem  it matches on the command line AND kills any duplicates it finds.
start "" /min wscript.exe "%~dp0_watchdog.vbs"

exit /b 0
