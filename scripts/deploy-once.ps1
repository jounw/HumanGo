# One deploy cycle: if the configured GitHub branch has new commits, update this server.
#   1. back up the database (data is never touched by a code deploy)
#   2. checkout new code, npm ci only when package-lock.json changed
#   3. build; on failure roll back to the previous commit
#   4. apply new supabase/migrations/*.sql (tracked in public._app_migrations)
#   5. restart the app (and the gateway if it changed); health-check; roll back on failure
# Config: C:\Users\Owner\humango-deploy.json  {"branch":"main","distro":"Ubuntu-22.04-hdd"}
# Log: C:\Users\Owner\humango-logs\deploy.log
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$logs = "C:\Users\Owner\humango-logs"
$log = "$logs\deploy.log"
$backupDir = "D:\backups\db"
$env:Path += ";C:\Users\Owner\tools\node;C:\Users\Owner\tools\git\cmd"
New-Item -ItemType Directory $logs -Force | Out-Null

function Log($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m" | Add-Content -Path $log -Encoding UTF8 }

# Run a native command, return its output lines, throw on non-zero exit.
function Run($file, [string[]]$argList) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $out = & $file @argList 2>&1 | ForEach-Object { "$_" }
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -ne 0) { throw "$file $($argList -join ' ') failed ($code): $($out | Select-Object -Last 5 | Out-String)" }
  return $out
}

$cfg = Get-Content "C:\Users\Owner\humango-deploy.json" -Raw | ConvertFrom-Json
$branch = $cfg.branch
$distro = $cfg.distro

# single instance
$lock = "$logs\deploy.lock"
if ((Test-Path $lock) -and ((Get-Date) - (Get-Item $lock).LastWriteTime).TotalMinutes -lt 30) { return }
Set-Content $lock (Get-Date).ToString()

function WslDb($mode, $path) {
  $win = $path
  if ($path -match '^([A-Za-z]):\\(.*)$') { $win = "/mnt/" + $Matches[1].ToLower() + "/" + ($Matches[2] -replace '\\', '/') }
  $script = "/mnt/c/Users/Owner/HumanGo-main/scripts/db.sh"
  # strip CR in case git checked the script out with CRLF
  return Run "wsl" @("-d", $distro, "-u", "root", "--", "bash", "-c", "tr -d '\r' < $script | bash -s -- $mode '$win'")
}

function StopApp {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match 'next.*start' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
}
function StartApp {
  Start-Process -WindowStyle Hidden -FilePath "node" `
    -ArgumentList "node_modules\next\dist\bin\next", "start", "-H", "127.0.0.1", "-p", "3000" `
    -WorkingDirectory $root -RedirectStandardOutput "$logs\app.log" -RedirectStandardError "$logs\app.err.log"
}
function RestartGateway {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match 'gateway\.mjs' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-Sleep 1
  Start-Process -WindowStyle Hidden -FilePath "node" -ArgumentList "scripts\gateway.mjs" `
    -WorkingDirectory $root -RedirectStandardOutput "$logs\gateway.log" -RedirectStandardError "$logs\gateway.err.log"
}
function Healthy {
  for ($i = 0; $i -lt 30; $i++) {
    try {
      $r = Invoke-WebRequest "http://127.0.0.1:3000/login" -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -eq 200) { return $true }
    } catch { }
    Start-Sleep 2
  }
  return $false
}
function Build {
  Run "npm.cmd" @("run", "build") | Out-Null
}

try {
  Set-Location $root
  Run "git" @("fetch", "-q", "origin", $branch) | Out-Null
  $old = @(Run "git" @("rev-parse", "HEAD"))[0].Trim()
  $new = @(Run "git" @("rev-parse", "origin/$branch"))[0].Trim()
  $cur = @(Run "git" @("rev-parse", "--abbrev-ref", "HEAD"))[0].Trim()
  if ($old -eq $new -and $cur -eq $branch) { return }
  # a commit that already failed (build/migration/health) is not retried until a newer commit arrives
  $failedFile = "$logs\deploy.failed"
  if ((Test-Path $failedFile) -and ((Get-Content $failedFile -Raw).Trim() -eq $new)) { return }

  $dirty = Run "git" @("status", "--porcelain", "--untracked-files=no")
  if ($dirty) { Log "SKIP: working tree has local changes, not deploying"; return }

  Log "DEPLOY start $branch $($old.Substring(0,7)) -> $($new.Substring(0,7))"
  $lockBefore = (Get-FileHash package-lock.json).Hash

  # 1. backup (data safety)
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  WslDb "dump" "$backupDir\db-$stamp.sql.gz" | Out-Null
  Get-ChildItem $backupDir -Filter "db-*.sql.gz" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force
  Log "backup ok: db-$stamp.sql.gz"

  # 2. new code
  $changed = Run "git" @("diff", "--name-only", $old, $new)
  Run "git" @("checkout", "-q", "-B", $branch, "origin/$branch") | Out-Null
  if ((Get-FileHash package-lock.json).Hash -ne $lockBefore) {
    Log "package-lock changed: npm ci"
    Run "npm.cmd" @("ci") | Out-Null
  }

  # 3. build (app is stopped while building)
  StopApp
  try { Build } catch {
    Log "BUILD FAILED, rolling back: $($_.Exception.Message)"
    Run "git" @("checkout", "-q", "-B", $branch, $old) | Out-Null
    if ((Get-FileHash package-lock.json).Hash -ne $lockBefore) { Run "npm.cmd" @("ci") | Out-Null }
    Build
    StartApp
    Set-Content $failedFile $new
    Log "ROLLED BACK to $($old.Substring(0,7)); $($new.Substring(0,7)) will not be retried"
    return
  }

  # 4. migrations
  $tmp = "$logs\tmp.sql"
  $q = "select to_regclass('public._app_migrations') is not null;"
  [IO.File]::WriteAllText($tmp, $q)
  $exists = ((WslDb "out" $tmp) -join "").Trim() -eq "t"
  $files = Get-ChildItem "$root\supabase\migrations" -Filter "*.sql" | Sort-Object Name
  if (-not $exists) {
    # first run: everything currently in the repo is already applied on this server
    $names = (Run "git" @("ls-tree", "--name-only", $old, "supabase/migrations/")) | ForEach-Object { Split-Path $_ -Leaf }
    $values = ($names | ForEach-Object { "('$_')" }) -join ","
    $sql = "create table public._app_migrations(name text primary key, applied_at timestamptz not null default now()); alter table public._app_migrations enable row level security;"
    if ($values) { $sql += " insert into public._app_migrations(name) values $values;" }
    [IO.File]::WriteAllText($tmp, $sql)
    WslDb "file" $tmp | Out-Null
    Log "migration tracking initialised ($($names.Count) existing files recorded)"
  }
  [IO.File]::WriteAllText($tmp, "select name from public._app_migrations;")
  $applied = WslDb "out" $tmp
  foreach ($f in $files) {
    if ($applied -contains $f.Name) { continue }
    Log "applying migration $($f.Name)"
    try {
      WslDb "file" $f.FullName | Out-Null
    } catch {
      Log "MIGRATION FAILED ($($f.Name)), rolling back code: $($_.Exception.Message)"
      Run "git" @("checkout", "-q", "-B", $branch, $old) | Out-Null
      if ((Get-FileHash package-lock.json).Hash -ne $lockBefore) { Run "npm.cmd" @("ci") | Out-Null }
      Build
      StartApp
      Set-Content $failedFile $new
    Log "ROLLED BACK to $($old.Substring(0,7)); $($new.Substring(0,7)) will not be retried"
      return
    }
    [IO.File]::WriteAllText($tmp, "insert into public._app_migrations(name) values ('$($f.Name)');")
    WslDb "file" $tmp | Out-Null
  }

  # 5. restart + health check
  if ($changed -contains "scripts/gateway.mjs") { RestartGateway; Log "gateway restarted" }
  StartApp
  if (Healthy) {
    Remove-Item $failedFile -Force -ErrorAction SilentlyContinue
    Log "DEPLOY OK $($new.Substring(0,7))"
  } else {
    Log "HEALTH CHECK FAILED, rolling back code"
    StopApp
    Run "git" @("checkout", "-q", "-B", $branch, $old) | Out-Null
    if ((Get-FileHash package-lock.json).Hash -ne $lockBefore) { Run "npm.cmd" @("ci") | Out-Null }
    Build
    StartApp
    Set-Content $failedFile $new
    Log "ROLLED BACK to $($old.Substring(0,7)) (migrations, if any, stay applied); $($new.Substring(0,7)) will not be retried"
  }
} catch {
  Log "ERROR: $($_.Exception.Message)"
  try { if (-not (Healthy)) { StartApp; Log "app restarted after error" } } catch { }
} finally {
  Remove-Item $lock -Force -ErrorAction SilentlyContinue
}
