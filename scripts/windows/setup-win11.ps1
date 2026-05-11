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
    Write-Host 'Python venv を作成します (.venv)...'
    if (Get-Command py -ErrorAction SilentlyContinue) {
      & py -3 -m venv .venv
    }
    elseif (Get-Command python -ErrorAction SilentlyContinue) {
      & python -m venv .venv
    }
    else {
      throw 'Python が見つかりません。Python 3.10+ をインストールしてください。'
    }
  }

  $pythonExe = Resolve-Path '.venv\Scripts\python.exe'
  Write-Host "Python: $pythonExe"
  & $pythonExe -m pip install --upgrade pip
  & $pythonExe -m pip install -r requirements.txt
}

Write-Host 'Node 依存関係をインストールします...'
if (Test-Path 'package-lock.json') {
  & npm ci
}
else {
  & npm install
}

if (-not $SkipPlaywright) {
  Write-Host 'Playwright Chromium をインストールします...'
  & npx playwright install chromium
}

Write-Host ''
Write-Host '✅ セットアップ完了'
Write-Host '次の手順:'
Write-Host '  1) PowerShellで環境変数（SUPABASE_SERVICE_KEY等）を設定'
Write-Host '  2) npm run weekly を手動実行して動作確認'
Write-Host '  3) scripts/windows/register-tasks.ps1 で自動実行を登録'
