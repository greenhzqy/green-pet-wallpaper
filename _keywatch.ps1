# Green - keyboard watcher (v1.0)
# Polls GetAsyncKeyState and reports ONLY the virtual-key code of newly pressed keys.
#
# PRIVACY DESIGN (deliberate, do not weaken):
#   - Reports the raw virtual-key NUMBER only, never the resulting character.
#     Shift/CapsLock state is never resolved, so the actual text cannot be reconstructed.
#   - The server keeps only the LAST key + a counter, in MEMORY. Nothing is written to disk.
#   - No history, no log file, no buffering of past keystrokes.
# If you do not want this at all, just do not run this script.

$ErrorActionPreference = "Continue"
$PORT = 8765
$BASE = "http://127.0.0.1:" + $PORT
$URL = $BASE + "/keys"

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class GreenKb {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
}
'@ -ErrorAction SilentlyContinue

# 只关心这些键（避免把鼠标键、系统键也算进来）
# 8=Backspace 9=Tab 13=Enter 16-18=Shift/Ctrl/Alt 20=Caps 27=Esc 32=Space
# 33-40=翻页/方向 45=Insert 46=Delete 48-57=数字 65-90=字母
# 91/92=Win 186-222=标点 219-221=括号
$INTERESTING = @(
  8,9,13,16,17,18,20,27,32,
  33,34,35,36,37,38,39,40,45,46,
  48,49,50,51,52,53,54,55,56,57,
  65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,
  186,187,188,189,190,191,192,219,220,221,222
)

$prev = @{}
foreach ($k in $INTERESTING) { $prev[$k] = $false }
$pending = New-Object System.Collections.ArrayList
$lastFlush = Get-Date
$lastHb = Get-Date
$fails = 0
$firstFail = Get-Date
$seen = 0      # 累计"看见按下"的次数
$sent = 0      # 累计"POST 成功"的次数

function Flush-Keys {
  if ($script:pending.Count -eq 0) { return }
  $body = '{"vks":[' + (($script:pending | Select-Object -Unique) -join ",") + ']}'
  $script:pending.Clear() | Out-Null
  try {
    Invoke-RestMethod -Uri $script:URL -Method POST -Body $body -ContentType "application/json" -TimeoutSec 3 | Out-Null
    $script:fails = 0
    $script:sent++
    $script:firstFail = Get-Date
  } catch {
    $script:fails++
    # ★ 原来是"连续失败 30 次就退出"。服务器每次重启停机约 5 秒，90ms 一次的话 30 次只有 2.7 秒 ——
    #   一重启 keywatch 就自杀了，整条键盘链路静默失效（宠物再也不踩键盘，且没有任何报错）。
    #   改成按"持续失败多久"判断，给足 10 分钟。
    if ($script:fails -eq 0) { $script:firstFail = Get-Date }
    $script:fails++
    if (((Get-Date) - $script:firstFail).TotalMinutes -gt 10) { exit }
  }
}

while ($true) {
  foreach ($k in $INTERESTING) {
    $s = [GreenKb]::GetAsyncKeyState($k)
    $down = (($s -band 0x8000) -ne 0)
    if ($down -and -not $prev[$k]) { [void]$pending.Add($k); $script:seen++ }
    $prev[$k] = $down
  }
  $now = Get-Date
  # 心跳：每 5 秒报一次"看见了多少、发出去了多少"，方便把两个环节分开定位
  if (($now - $script:lastHb).TotalSeconds -gt 5) {
    $script:lastHb = $now
    try { Invoke-RestMethod -Uri ($script:BASE + "/hb") -Method POST -Body ('{"seen":' + $script:seen + ',"sent":' + $script:sent + ',"fails":' + $script:fails + '}') -ContentType "application/json" -TimeoutSec 3 | Out-Null } catch {}
  }
  # 攒 90ms 再发一次，避免每个键一个请求
  if (($now - $lastFlush).TotalMilliseconds -gt 90) {
    Flush-Keys
    $lastFlush = $now
  }
  Start-Sleep -Milliseconds 24
}