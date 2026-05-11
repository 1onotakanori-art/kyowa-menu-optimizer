param(
  [string]$TaskName = 'KyowaMenuWeekly',
  [string]$Day = 'MON',
  [string]$StartTime = '05:00'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$runner = Resolve-Path (Join-Path $PSScriptRoot 'run-weekly.ps1')
$logDir = Join-Path $repoRoot 'logs'

if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

$escapedRunner = $runner.Path.Replace('"', '""')
$logFile = (Join-Path $logDir 'weekly-task.log').Replace('"', '""')
$command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$escapedRunner`" *> `"$logFile`""

Write-Host 'Task Scheduler に週次ジョブを登録します...'

schtasks /Create /TN $TaskName /SC WEEKLY /D $Day /ST $StartTime /TR $command /RL HIGHEST /F | Out-Null

Write-Host '✅ 登録完了'
Write-Host "TaskName : $TaskName"
Write-Host "Day      : $Day"
Write-Host "Time     : $StartTime"
Write-Host "Command  : $command"
Write-Host ''
Write-Host '確認コマンド:'
Write-Host "  schtasks /Query /TN $TaskName /V /FO LIST"
Write-Host '手動実行:'
Write-Host "  schtasks /Run /TN $TaskName"
