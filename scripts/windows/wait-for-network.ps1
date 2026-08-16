# タスクスケジューラ起動直後はネットワーク未確立のことがあるため、
# Supabase ホストの名前解決ができるまで待機する共通関数。
function Wait-ForNetwork {
  param(
    [string]$HostName = 'zzleqjendqkoizbdvblw.supabase.co',
    [int]$TimeoutSeconds = 90,
    [int]$IntervalSeconds = 5
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      Resolve-DnsName -Name $HostName -ErrorAction Stop | Out-Null
      Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Network ready ($HostName resolved)"
      return
    } catch {
      Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Waiting for network... ($HostName not resolvable yet)"
      Start-Sleep -Seconds $IntervalSeconds
    }
  }
  Write-Warning "Network wait timed out after ${TimeoutSeconds}s; proceeding anyway."
}
