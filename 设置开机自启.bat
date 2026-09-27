@echo off
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v GreenPet /t REG_SZ /d "\"%~dp0green-autostart.bat\"" /f >nul
echo Done. GreenPet autostart registered (server + ball, silent).
pause