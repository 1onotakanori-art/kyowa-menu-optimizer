param(
  [switch]$SkipPlaywright,
  [switch]$SkipVenv
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repoRoot

Write-Host '========================================'
Write-Host 'Kyowa Menu Optimizer - Win11 Setup'
Write-Host '========================================'
Write-Host "Repo: $repoRoot"

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

Require-Command git
Require-Command node
Require-Command npm

if (-not $SkipVenv) {
  if (-not (Test-Path '.venv\Scripts\python.exe')) {
    Write-Host 'Creating Python venv (.venv)...'
    if (Get-Command py -ErrorAction SilentlyContinue) {
      & py -3 -m venv .venv
    }
    elseif (Get-Command python -ErrorAction SilentlyContinue) {
      & python -m venv .venv
    }
    else {
      throw 'Python was not found. Install Python 3.10+ and try again.'
    }
  }

  $pythonExe = Resolve-Path '.venv\Scripts\python.exe'
  Write-Host "Python: $pythonExe"
  & $pythonExe -m pip install --upgrade pip
  & $pythonExe -m pip install -r requirements.txt
}

Write-Host 'Installing Node dependencies...'
if (Test-Path 'package-lock.json') {
  & npm ci
}
else {
  & npm install
}

if (-not $SkipPlaywright) {
  Write-Host 'Installing Playwright Chromium...'
  & npx playwright install chromium
}

Write-Host ''
Write-Host '[OK] Setup completed'
Write-Host 'Next steps:'
Write-Host '  1) Set env vars in PowerShell (SUPABASE_SERVICE_KEY, etc.)'
Write-Host '  2) Run npm run weekly for a manual check'
Write-Host '  3) Register automation via scripts/windows/register-tasks.ps1'
