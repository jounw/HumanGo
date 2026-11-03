# HumanGo 서버 시작: WSL 의 Supabase(Docker) -> 앱 -> 게이트웨이 -> Cloudflare Tunnel
# 로그온 시 자동 실행되도록 작업 스케줄러에 등록해 사용한다. 로그: C:\Users\Owner\humango-logs
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$logs = "C:\Users\Owner\humango-logs"
New-Item -ItemType Directory $logs -Force | Out-Null
$env:Path += ";C:\Users\Owner\tools\node;C:\Program Files (x86)\cloudflared"

# 1) WSL 안의 Docker 와 Supabase
$distro = "Ubuntu-22.04-hdd"   # D: 드라이브(HDD)로 옮긴 WSL
wsl -d $distro -u root -- bash -c "service docker start >/dev/null 2>&1; cd /opt/supabase-project && sh run.sh start" *> "$logs\supabase.log"

# 2) 앱 (내부 전용 포트)
Start-Process -WindowStyle Hidden -FilePath "node" `
  -ArgumentList "node_modules\next\dist\bin\next","start","-H","127.0.0.1","-p","3000" `
  -WorkingDirectory $root -RedirectStandardOutput "$logs\app.log" -RedirectStandardError "$logs\app.err.log"

# 3) 게이트웨이 (공개 포트 8080)
Start-Process -WindowStyle Hidden -FilePath "node" -ArgumentList "scripts\gateway.mjs" `
  -WorkingDirectory $root -RedirectStandardOutput "$logs\gateway.log" -RedirectStandardError "$logs\gateway.err.log"

# 4) 터널. 이름 있는 터널 토큰이 있으면 그것을, 없으면 임시 주소(trycloudflare.com)를 쓴다.
$tokenFile = "C:\Users\Owner\.cloudflared\tunnel-token.txt"
if (Test-Path $tokenFile) {
  $token = (Get-Content $tokenFile -Raw).Trim()
  Start-Process -WindowStyle Hidden -FilePath "cloudflared" `
    -ArgumentList "tunnel","--no-autoupdate","run","--token",$token `
    -RedirectStandardOutput "$logs\tunnel.log" -RedirectStandardError "$logs\tunnel.err.log"
} else {
  Start-Process -WindowStyle Hidden -FilePath "cloudflared" `
    -ArgumentList "tunnel","--no-autoupdate","--url","http://127.0.0.1:8080" `
    -RedirectStandardOutput "$logs\tunnel.log" -RedirectStandardError "$logs\tunnel.err.log"
}

# 5) auto deploy: every minute, pull new commits of the branch in C:\Users\Owner\humango-deploy.json
Start-Process -WindowStyle Hidden -FilePath powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'auto-deploy-loop.ps1')
