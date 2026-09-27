@echo off
rem Green - close panel and ball
powershell -NoProfile -Command "Get-Process msedge -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq 'Green' } | Stop-Process -Force -ErrorAction SilentlyContinue"
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*GreenBall.ps1*' -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
echo Green closed.
