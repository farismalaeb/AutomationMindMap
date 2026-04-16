# Send Alert Email Runbook
param(
    [string]$AlertMessage = "Default alert message",
    [string]$Severity = "Warning"
)

Write-Host "Sending alert email..."
Write-Host "Severity: $Severity"
Write-Host "Message: $AlertMessage"

# Get service account credential
$svcCred = Get-AutomationPSCredential -Name "ServiceAccountCred"
Write-Host "Sending as: $($svcCred.UserName)"

# Get environment
$env = Get-AutomationVariable -Name "Environment"
Write-Host "Environment: $env"

# Simulate sending email
Write-Host "Connecting to SMTP server..."
Write-Host "Email sent successfully!"

# Generate an error for testing (commented out)
# throw "Test exception for error indicator"

Write-Host "Alert notification completed!"
