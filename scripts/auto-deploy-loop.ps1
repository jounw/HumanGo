# Runs deploy-once.ps1 every minute. Started from start-server.ps1 at logon.
$logs = "C:\Users\Owner\humango-logs"
while ($true) {
  try { & "$PSScriptRoot\deploy-once.ps1" }
  catch { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') LOOP ERROR: $($_.Exception.Message)" | Add-Content "$logs\deploy.log" }
  Start-Sleep 60
}
