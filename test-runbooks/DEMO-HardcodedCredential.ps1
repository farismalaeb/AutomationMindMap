# ============================================================
# DEMO-HardcodedCredential.ps1
#
# *** FOR DEMONSTRATION PURPOSES ONLY ***
# *** DO NOT USE IN PRODUCTION          ***
#
# Demonstrates: Intentional hardcoded secrets → RED BADGE
#               Well-written variable access alongside bad code
#               Set-Content (file write)
#
# Monitoring features shown:
#   - RED BADGE: $password and $apiKey are hardcoded literals
#   - Automation Variable dependency edges (correct pattern shown too)
#   - "File Writes" node: Set-Content
# ============================================================

Write-Output "--- DEMO: Hardcoded credential detection ---"

# ============================================================
# CORRECT PATTERN — shown for comparison
# ============================================================
$dbConnectionString = Get-AutomationVariable -Name "DbConnectionString"
Write-Output "DB connection string loaded from Automation Variable."

# ============================================================
# BAD PATTERN — triggers RED BADGE in MindMap
# (hardcoded secrets — should use Automation Variables or KV)
# ============================================================
$password = "P@ssw0rd123!"             # <-- HARDCODED: triggers detection
$apiKey   = "sk-prod-abcdef1234567890" # <-- HARDCODED: triggers detection

Write-Output "Using hardcoded credentials (BAD PRACTICE)."

# -- Attempt connection using the hardcoded password --
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("admin:$password"))
$headers = @{
    "Authorization" = "Basic $encoded"
    "X-Api-Key"     = $apiKey
}

$apiBase = Get-AutomationVariable -Name "LegacyApiBaseUrl"
$result  = Invoke-RestMethod -Method Get -Uri "$apiBase/status" -Headers $headers
Write-Output "Legacy API status: $($result.status)"

# -- Write audit log with Set-Content --
$logPath = "C:\Temp\audit-demo.txt"
Set-Content -Path $logPath -Value "$(Get-Date -Format 'o') | DEMO run completed | Status=$($result.status)"
Write-Output "Audit log written to $logPath"

Write-Output ""
Write-Output "REMEDIATION: Replace hardcoded `$password and `$apiKey"
Write-Output "  with: Get-AutomationVariable or Get-AzKeyVaultSecret"
