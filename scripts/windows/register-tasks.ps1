param(
  [string]$TaskPrefix = 'KyowaMenu',
  [string]$Day = 'SUN',
  [string]$PrepareStartTime = '06:00',
  [string]$FinishStartTime = '08:00',
  [switch]$HighestPrivileges
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$prepareRunner = Resolve-Path (Join-Path $PSScriptRoot 'run-scrape-and-regen.ps1')
$finishRunner  = Resolve-Path (Join-Path $PSScriptRoot 'run-claude-analyze.ps1')

$taskPrepare = "${TaskPrefix}WeeklyPrepare"
$taskFinish  = "${TaskPrefix}WeeklyFinish"

function New-TaskCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RunnerPath
  )

  $escapedRunner = $RunnerPath.Replace('"', '""')
  return "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$escapedRunner`""
}

function Invoke-Schtasks {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  & schtasks @Arguments | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "schtasks failed: $($Arguments -join ' ') (exit=$LASTEXITCODE)"
  }
}

$prepareCommand = New-TaskCommand -RunnerPath $prepareRunner.Path
$finishCommand  = New-TaskCommand -RunnerPath $finishRunner.Path

Write-Host 'Registering Cowork workflow tasks in Task Scheduler...'

# 旧タスクのクリーンアップ
foreach ($old in @('KyowaMenuWeekly','KyowaMenuScrapeWeekly','KyowaMenuClaudeAnalyzeBiweekly','KyowaMenuModelRetrainWeekly')) {
  cmd.exe /c "schtasks /Delete /TN $old /F >nul 2>&1" | Out-Null
}

$runLevel = if ($HighestPrivileges) { 'HIGHEST' } else { 'LIMITED' }

# Step 1: スクレイプ + Supabase アップロード + pending_menus.md 生成
Invoke-Schtasks -Arguments @('/Create', '/TN', $taskPrepare, '/SC', 'WEEKLY', '/MO', '1', '/D', $Day, '/ST', $PrepareStartTime, '/TR', $prepareCommand, '/RL', $runLevel, '/F')

# Step 3: Cowork 出力インポート + 再学習 + AI 推薦再生成
# (Step 2 は Claude Desktop Cowork タスクで別途スケジュール)
Invoke-Schtasks -Arguments @('/Create', '/TN', $taskFinish,  '/SC', 'WEEKLY', '/MO', '1', '/D', $Day, '/ST', $FinishStartTime,  '/TR', $finishCommand,  '/RL', $runLevel, '/F')

Write-Host ''
Write-Host '[OK] Registration complete'
Write-Host "  Task (Step1 - Prepare): $taskPrepare @ $Day $PrepareStartTime"
Write-Host "  Task (Step3 - Finish):  $taskFinish  @ $Day $FinishStartTime"
Write-Host ''
Write-Host '*** Step 2 (Claude Desktop Cowork) must be scheduled separately ***'
Write-Host "    Recommended: $Day 07:00 (between Prepare and Finish)"
Write-Host ''
Write-Host 'Verification commands:'
Write-Host "  schtasks /Query /TN $taskPrepare /V /FO LIST"
Write-Host "  schtasks /Query /TN $taskFinish  /V /FO LIST"
Write-Host 'Manual run:'
Write-Host "  schtasks /Run /TN $taskPrepare"
Write-Host "  schtasks /Run /TN $taskFinish"
