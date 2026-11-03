# 현재 공개 주소(임시 터널)를 출력한다.
$o = "C:\Users\Owner\humango-logs"
Get-Content "$o\tunnel.err.log", "$o\tunnel.log" -ErrorAction SilentlyContinue |
  Select-String -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' -AllMatches |
  ForEach-Object { $_.Matches.Value } | Select-Object -Last 1
