# ============================================================
#  Green companion watchdog
#
#  Why this exists:
#  The machine lives at a desk and is driven remotely from a tablet.
#  Nobody is sitting next to it, so if any piece dies silently --
#  server, keyboard watcher, or Lively -- it stays dead until someone
#  happens to look. This runs every 10 minutes and repairs whatever
#  is missing.
#
#  Also fixes a real bug in green-autostart.bat:
#    tasklist /fi "IMAGENAME eq powershell.exe" | findstr powershell
#  is ALWAYS true (the bat itself spawns powershell), so every logon
#  added one more _keywatch process. Here we match on command line.
# ============================================================
$ErrorActionPreference = "SilentlyContinue"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir
$log = Join-Path $dir "_watchdog.log"

function Note($m) {
  Add-Content -Path $log -Value ((Get-Date).ToString("yyyy-MM-dd HH:mm:ss") + "  " + $m) -Encoding UTF8
}

# --- 1) pet server on 127.0.0.1:8765 ---
if (-not (Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue)) {
  # Prefer node from PATH; fall back to a common install location.
  $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
  if (-not $node) { $node = "D:\nodejs\node.exe" }
  if (Test-Path $node) {
    Start-Process -FilePath $node -ArgumentList "server.js" -WorkingDirectory $dir -WindowStyle Hidden
    Note "server restarted"
  } else {
    Note "server DOWN and node.exe not found"
  }
}

# --- 2) keyboard watcher: match on command line, never on process name ---
$kw = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
      Where-Object { $_.CommandLine -like "*_keywatch.ps1*" }
if (-not $kw) {
  Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -ArgumentList @(
    "-NoProfile","-NonInteractive","-WindowStyle","Hidden","-ExecutionPolicy","Bypass",
    "-File", (Join-Path $dir "_keywatch.ps1"))
  Note "keywatch restarted"
} elseif (@($kw).Count -gt 1) {
  # clean up duplicates left behind by the old buggy check
  $extra = @($kw) | Sort-Object CreationDate | Select-Object -Skip 1
  foreach ($p in $extra) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
  Note ("removed " + @($extra).Count + " duplicate keywatch")
}

# --- 3) Lively: without it there is no pet on screen ---
if (-not (Get-Process -Name "Lively" -ErrorAction SilentlyContinue)) {
  # Set the LIVELY_EXE env var if Lively lives somewhere else.
  $lively = $env:LIVELY_EXE
  if (-not $lively) {
    $lively = @("D:\Lively Wallpaper\Lively.exe",
                (Join-Path $env:LOCALAPPDATA "Programs\Lively Wallpaper\Lively.exe")) |
              Where-Object { Test-Path $_ } | Select-Object -First 1
  }
  if ($lively) {
    Start-Process -FilePath $lively
    Note "lively restarted"
  } else {
    Note "lively not running and Lively.exe not found"
  }
}

# --- 4) keep the log from growing forever ---
if (Test-Path $log) {
  $c = @(Get-Content $log)
  if ($c.Count -gt 400) { $c | Select-Object -Last 200 | Set-Content $log -Encoding UTF8 }
}
