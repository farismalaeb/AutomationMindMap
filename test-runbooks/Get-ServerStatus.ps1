# Server Status Check Runbook
param(
    [string]$ServerName = "localhost"
)

Write-Host "Checking server status for: $ServerName"

# Get credentials for connecting
$cred = Get-AutomationPSCredential -Name "AdminCredential"
Write-Host "Using credential: $($cred.UserName)"

# Get connection string
$connStr = Get-AutomationVariable -Name "DatabaseConnectionString"

# Check if logging is enabled
$enableLogging = Get-AutomationVariable -Name "EnableLogging"

if ($enableLogging -eq $true) {
    Write-Host "Verbose logging enabled"
}

# Simulate server check
Write-Host "Server $ServerName is online!"
Write-Host "Connection test successful"

# This will cause a warning in the job output (for testing warning indicator)
Write-Warning "This is a test warning message"

Write-Host "Server status check completed!"
