$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repoRoot

$logDir = Join-Path $repoRoot 'logs'
if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}
$logPath = Join-Path $logDir 'weekly-scrape-and-regen.log'

Start-Transcript -Path $logPath -Append | Out-Null
try {
  Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Scrape + AI regeneration start"

  & npm run scrape:upload
  if ($LASTEXITCODE -ne 0) {
    throw "scrape:upload failed with exit code: $LASTEXITCODE"
  }

  & npm run ml:regen
  if ($LASTEXITCODE -ne 0) {
    throw "ml:regen failed with exit code: $LASTEXITCODE"
  }

  Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Scrape + AI regeneration done"
}
finally {
  Stop-Transcript | Out-Null
}
