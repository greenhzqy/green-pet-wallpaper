@echo off
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v GreenPet /f >nul 2>nul
echo Done. GreenPet autostart removed.
