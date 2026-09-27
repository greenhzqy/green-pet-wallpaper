' Run the Green watchdog with a fully hidden window.
' A scheduled task launching powershell.exe directly flashes a console
' window every 10 minutes -- wscript with Run(...,0,...) does not.
' The script path is derived from this file's own location, so the folder
' can live anywhere -- nothing here is machine-specific.
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
Set s = CreateObject("WScript.Shell")
s.Run "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & here & "\_watchdog.ps1""", 0, False
