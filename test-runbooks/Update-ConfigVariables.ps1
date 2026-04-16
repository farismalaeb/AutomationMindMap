# ============================================================
# Update-ConfigVariables.ps1
#
# Demonstrates: Direct automation variable references (read)
#               Indirect variable reference ($varName = "X")
#               Set-AutomationVariable (write back)
#               Invoke-RestMethod (health-check ping)
#               No Key Vault, no file writes
#
# Monitoring features shown:
#   - Automation Variable dependency edges (3 direct + 1 indirect)
#   - "HTTP Calls" node: health-check GET endpoint
# ============================================================

Write-Output "Updating configuration variables..."

# -- Direct variable reads --
$environment   = Get-AutomationVariable -Name "Environment"
$apiBaseUrl    = Get-AutomationVariable -Name "ApiBaseUrl"
$retryCount    = Get-AutomationVariable -Name "RetryCount"

Write-Output "Environment: $environment | API: $apiBaseUrl | Retries: $retryCount"

# -- Indirect variable reference (variable name in a variable) --
$lastRunVarName = "LastRunTime"
$lastRun        = Get-AutomationVariable -Name $lastRunVarName

Write-Output "Previous run: $lastRun"

# -- Health-check the target API before updating config (Invoke-RestMethod) --
$healthUri    = "$apiBaseUrl/health"
$healthStatus = Invoke-RestMethod -Method Get -Uri $healthUri

if ($healthStatus.status -ne "healthy") {
    Write-Error "API health check failed: $($healthStatus.status)"
    throw "Config update aborted — API is not healthy."
}

Write-Output "Health check passed."

# -- Update variables --
$newRetryCount = [int]$retryCount + 1
Set-AutomationVariable -Name "RetryCount"  -Value $newRetryCount
Set-AutomationVariable -Name $lastRunVarName -Value (Get-Date -Format "o")

Write-Output "RetryCount updated to $newRetryCount"
Write-Output "LastRunTime updated to $(Get-Date -Format 'o')"
