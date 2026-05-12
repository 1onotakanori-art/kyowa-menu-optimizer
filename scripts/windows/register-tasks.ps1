param(
  [string]$TaskPrefix = 'KyowaMenu',
  [string]$Day = 'MON',
  [string]$ScrapeStartTime = '05:00',
  [string]$ClaudeStartTime = '06:00',
  [string]$RetrainStartTime = '07:00',
  [switch]$HighestPrivileges
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$scrapeRunner = Resolve-Path (Join-Path $PSScriptRoot 'run-scrape-and-regen.ps1')
$claudeRunner = Resolve-Path (Join-Path $PSScriptRoot 'run-claude-analyze.ps1')
$retrainRunner = Resolve-Path (Join-Path $PSScriptRoot 'run-model-retrain.ps1')

$taskScrape = "${TaskPrefix}ScrapeWeekly"
$taskClaude = "${TaskPrefix}ClaudeAnalyzeBiweekly"
$taskRetrain = "${TaskPrefix}ModelRetrainWeekly"

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

$scrapeCommand = New-TaskCommand -RunnerPath $scrapeRunner.Path
$claudeCommand = New-TaskCommand -RunnerPath $claudeRunner.Path
$retrainCommand = New-TaskCommand -RunnerPath $retrainRunner.Path

Write-Host 'Registering scheduled jobs in Task Scheduler...'

# Backward compatibility cleanup for old single-task setup.
cmd.exe /c "schtasks /Delete /TN KyowaMenuWeekly /F >nul 2>&1" | Out-Null

$runLevel = if ($HighestPrivileges) { 'HIGHEST' } else { 'LIMITED' }

Invoke-Schtasks -Arguments @('/Create', '/TN', $taskScrape, '/SC', 'WEEKLY', '/MO', '1', '/D', $Day, '/ST', $ScrapeStartTime, '/TR', $scrapeCommand, '/RL', $runLevel, '/F')
Invoke-Schtasks -Arguments @('/Create', '/TN', $taskClaude, '/SC', 'WEEKLY', '/MO', '2', '/D', $Day, '/ST', $ClaudeStartTime, '/TR', $claudeCommand, '/RL', $runLevel, '/F')
Invoke-Schtasks -Arguments @('/Create', '/TN', $taskRetrain, '/SC', 'WEEKLY', '/MO', '1', '/D', $Day, '/ST', $RetrainStartTime, '/TR', $retrainCommand, '/RL', $runLevel, '/F')

Write-Host '[OK] Registration complete'
Write-Host "Task (weekly):   $taskScrape @ $Day $ScrapeStartTime"
Write-Host "Task (biweekly): $taskClaude @ $Day $ClaudeStartTime"
Write-Host "Task (weekly):   $taskRetrain @ $Day $RetrainStartTime"
Write-Host ''
Write-Host 'Verification commands:'
Write-Host "  schtasks /Query /TN $taskScrape /V /FO LIST"
Write-Host "  schtasks /Query /TN $taskClaude /V /FO LIST"
Write-Host "  schtasks /Query /TN $taskRetrain /V /FO LIST"
Write-Host 'Manual run:'
Write-Host "  schtasks /Run /TN $taskScrape"
Write-Host "  schtasks /Run /TN $taskClaude"
Write-Host "  schtasks /Run /TN $taskRetrain"
