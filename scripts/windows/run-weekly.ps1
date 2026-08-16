$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repoRoot
. (Join-Path $PSScriptRoot 'wait-for-network.ps1')

Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Weekly pipeline start"
Wait-ForNetwork

& npm run weekly

if ($LASTEXITCODE -ne 0) {
  throw "weekly pipeline failed with exit code: $LASTEXITCODE"
}

Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Weekly pipeline done"
