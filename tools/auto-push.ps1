<#
  อัปโหลดโปรเจกต์ขึ้น GitHub อัตโนมัติ
  - โหมดปกติ: เฝ้าดูโฟลเดอร์ เมื่อไฟล์เปลี่ยนแล้วนิ่งไป 15 วินาที จะ commit + push ให้เอง
  - โหมด -Once: push ครั้งเดียวแล้วจบ

  ต้องมี Git for Windows (https://git-scm.com/download/win)
  ครั้งแรกที่ push จะมีหน้าต่างให้ล็อกอิน GitHub (Git Credential Manager)
#>
param(
  [string]$RepoUrl = "https://github.com/kanatip200x-cyber/stock_MA.git",  # repo ปลายทาง (ใช้ตอนตั้งค่าครั้งแรก)
  [switch]$Once,
  [int]$QuietSeconds = 15
)

# ใช้ Continue: ถ้าเป็น Stop, PowerShell จะหยุดทันทีเมื่อ git พิมพ์ข้อความเตือน (เช่น "No such remote")
# ความผิดพลาดจริงยังถูกจับโดย Invoke-Git ที่เช็ค exit code
$ErrorActionPreference = "Continue"
$ProjectDir = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectDir
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Log($msg) { Write-Host ("[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $msg) }
function Invoke-Git { & git.exe @args; if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') ล้มเหลว" } }

if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
  throw "ไม่พบ git กรุณาติดตั้ง Git for Windows ก่อน: https://git-scm.com/download/win"
}

# เตรียม repo ครั้งแรก
if (-not (Test-Path (Join-Path $ProjectDir ".git"))) {
  Log "สร้าง git repo ในโฟลเดอร์นี้"
  Invoke-Git init -b main
}
$remote = (& git.exe remote get-url origin 2>$null)
if ($LASTEXITCODE -ne 0) { $remote = $null }
if (-not $remote) {
  if (-not $RepoUrl) { $RepoUrl = Read-Host "วาง URL ของ GitHub repo (เช่น https://github.com/user/repo.git)" }
  if (-not $RepoUrl) { throw "ยังไม่ได้ใส่ URL ของ repo" }
  Invoke-Git remote add origin $RepoUrl
  Log "ผูกกับ $RepoUrl แล้ว"
}

# ถ้าบน GitHub มีไฟล์อยู่แล้ว (เช่น เคยอัปโหลดผ่านหน้าเว็บ) ให้ต่อประวัติจากของเดิม
# โดยยึดไฟล์ในเครื่องนี้เป็นฉบับล่าสุด (ไฟล์ในโฟลเดอร์ไม่ถูกแก้หรือลบ)
# ทำเมื่อในเครื่องยังไม่มี commit เลย (ครั้งแรก)
& git.exe rev-parse --verify HEAD *> $null
if ($LASTEXITCODE -ne 0) {
  & git.exe ls-remote --exit-code --heads origin main *> $null
  if ($LASTEXITCODE -eq 0) {
    Invoke-Git fetch origin main
    Invoke-Git reset origin/main
    Log "เชื่อมกับประวัติเดิมบน GitHub แล้ว"
  }
}

# ตั้งชื่อผู้ commit ถ้ายังไม่เคยตั้ง (ใช้อีเมล noreply ของ GitHub ไม่เปิดเผยอีเมลจริง)
if (-not (& git.exe config user.name)) { Invoke-Git config user.name "kanatip200x-cyber" }
if (-not (& git.exe config user.email)) { Invoke-Git config user.email "235220843+kanatip200x-cyber@users.noreply.github.com" }

function Sync-Now {
  Invoke-Git add -A
  & git.exe diff --cached --quiet
  if ($LASTEXITCODE -eq 0) { Log "ไม่มีไฟล์เปลี่ยน"; return }
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Invoke-Git commit -m "Auto update $stamp"
  # ดึงของใหม่จาก GitHub ก่อน (ถ้ามี) เพื่อไม่ให้ push ชน
  & git.exe ls-remote --exit-code --heads origin main *> $null
  if ($LASTEXITCODE -eq 0) { Invoke-Git pull --rebase origin main }
  Invoke-Git push -u origin main
  Log "อัปขึ้น GitHub แล้ว ($stamp)"
}

if ($Once) { Sync-Now; exit 0 }

# โหมดเฝ้าดูไฟล์
$watcher = New-Object System.IO.FileSystemWatcher $ProjectDir, "*"
$watcher.IncludeSubdirectories = $true
$watcher.EnableRaisingEvents = $true
$global:lastChange = $null
$action = {
  $p = $Event.SourceEventArgs.FullPath
  if ($p -notmatch '[\\/]\.git([\\/]|$)') { $global:lastChange = Get-Date }
}
"Changed","Created","Deleted","Renamed" | ForEach-Object {
  Register-ObjectEvent $watcher $_ -Action $action | Out-Null
}

Log "เริ่มเฝ้าดู $ProjectDir (กด Ctrl+C เพื่อหยุด)"
Sync-Now
while ($true) {
  Start-Sleep -Seconds 3
  if ($global:lastChange -and ((Get-Date) - $global:lastChange).TotalSeconds -ge $QuietSeconds) {
    $global:lastChange = $null
    try { Sync-Now } catch { Log "ผิดพลาด: $($_.Exception.Message) (จะลองใหม่เมื่อมีไฟล์เปลี่ยนครั้งถัดไป)" }
  }
}
