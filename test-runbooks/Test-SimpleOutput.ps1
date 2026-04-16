# Simple test runbook
Write-Host "Hello from Test-SimpleOutput runbook!"
Write-Host "Current time: $(Get-Date)"

# Get a variable
$env = Get-AutomationVariable -Name "Environment"
Write-Host "Current Environment: $env"

# Get max retries
$maxRetries = Get-AutomationVariable -Name "MaxRetries"
Write-Host "Max retries configured: $maxRetries"

Write-Host "Runbook completed successfully!"
