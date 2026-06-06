$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repoRoot

$logDir = Join-Path $repoRoot 'logs'
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}
$logPath = Join-Path $logDir 'weekly-prepare.log'

Start-Transcript -Path $logPath -Append | Out-Null
try {
  Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Weekly prepare start (scrape + upload + generate Cowork input)"

  & npm run weekly:prepare
  if ($LASTEXITCODE -ne 0) {
    throw "weekly:prepare failed with exit code: $LASTEXITCODE"
  }

  Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Weekly prepare done"
  Write-Host "  -> Claude Desktop Cowork task will run next (scheduled separately)"
}
finally {
  Stop-Transcript | Out-Null
}
