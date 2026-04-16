# Cleanup Old Files Runbook
Write-Host "Starting file cleanup process..."

# Get logging preference
$enableLogging = Get-AutomationVariable -Name "EnableLogging"

# Get environment to determine cleanup rules
$env = Get-AutomationVariable -Name "Environment"
Write-Host "Running in $env environment"

# Get credentials if needed
$cred = Get-AutomationPSCredential -Name "AdminCredential"

if ($env -eq "Production") {
    Write-Host "Production mode: Keeping files older than 30 days"
} else {
    Write-Host "Non-production: Keeping files older than 7 days"
}

# Simulate cleanup
$filesDeleted = 42
Write-Host "Deleted $filesDeleted old files"

# This runbook references an invalid/missing variable to test broken dependencies
# $missingVar = Get-AutomationVariable -Name "NonExistentVariable"

Write-Host "Cleanup completed!"
