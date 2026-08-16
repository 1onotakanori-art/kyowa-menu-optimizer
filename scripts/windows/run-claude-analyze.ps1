$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repoRoot
. (Join-Path $PSScriptRoot 'wait-for-network.ps1')

$logDir = Join-Path $repoRoot 'logs'
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}
$logPath = Join-Path $logDir 'weekly-finish.log'

Start-Transcript -Path $logPath -Append | Out-Null
try {
  Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Weekly finish start (import Cowork output + retrain + regen)"
  Wait-ForNetwork

  & npm run weekly:finish
  if ($LASTEXITCODE -ne 0) {
    throw "weekly:finish failed with exit code: $LASTEXITCODE"
  }

  Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Weekly finish done"
}
finally {
  Stop-Transcript | Out-Null
}
