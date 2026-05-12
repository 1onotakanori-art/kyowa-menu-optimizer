$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repoRoot

$logDir = Join-Path $repoRoot 'logs'
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}
$logPath = Join-Path $logDir 'weekly-model-retrain.log'

Start-Transcript -Path $logPath -Append | Out-Null
try {
  Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Weekly model retrain start"

  & npm run ml:retrain
  if ($LASTEXITCODE -ne 0) {
    throw "ml:retrain failed with exit code: $LASTEXITCODE"
  }

  Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Weekly model retrain done"
}
finally {
  Stop-Transcript | Out-Null
}
