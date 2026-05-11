$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repoRoot

Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Weekly pipeline start"

& npm run weekly

if ($LASTEXITCODE -ne 0) {
  throw "weekly pipeline failed with exit code: $LASTEXITCODE"
}

Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Weekly pipeline done"
