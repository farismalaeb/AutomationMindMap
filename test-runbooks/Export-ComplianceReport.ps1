# ============================================================
# Export-ComplianceReport.ps1
#
# Demonstrates: Invoke-WebRequest (web call)
#               Invoke-RestMethod (additional web call)
#               Out-File (file write)
#               Set-Content (file write)
#               Get-AutomationVariable (direct)
#               Get-AzKeyVaultSecret  (Key Vault)
#               Get-AutomationConnection (asset dependency)
#
# Monitoring features shown:
#   - "HTTP Calls" node: GET requests to Graph + internal API
#   - "File Writes" node: two output files
#   - Automation Variable dependency edges
#   - Key Vault node: reads bearer token from vault
# ============================================================

Write-Output "Starting compliance report export..."

# -- Automation variables (direct references) --
$reportOutputPath  = Get-AutomationVariable -Name "ReportOutputPath"
$complianceApiBase = Get-AutomationVariable -Name "ComplianceApiBaseUrl"

# -- Connection asset for AAD context --
$conn = Get-AutomationConnection -Name "AzureRunAsConnection"
Write-Output "Using connection: $($conn.ApplicationId)"

# -- Bearer token from Key Vault --
$vaultName     = "kv-automation-prod"
$bearerSecret  = Get-AzKeyVaultSecret -VaultName $vaultName -Name "ComplianceBearerToken"
$bearerToken   = $bearerSecret.SecretValue | ConvertFrom-SecureString -AsPlainText

$authHeaders = @{ "Authorization" = "Bearer $bearerToken" }

# -- Fetch data from Graph API using Invoke-WebRequest --
Write-Output "Fetching conditional access policies..."
$graphUri     = "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies"
$graphResponse = Invoke-WebRequest -Uri $graphUri -Headers $authHeaders -Method Get
$policies      = ($graphResponse.Content | ConvertFrom-Json).value
Write-Output "Retrieved $($policies.Count) conditional access policies."

# -- Fetch internal compliance status using Invoke-RestMethod --
$internalUri       = "$complianceApiBase/api/v1/compliance/status"
$complianceStatus  = Invoke-RestMethod -Method Get -Uri $internalUri -Headers $authHeaders

Write-Output "Compliance status: $($complianceStatus.status)"

# -- Build report content --
$reportLines = @()
$reportLines += "=== Compliance Report ==="
$reportLines += "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$reportLines += ""
$reportLines += "-- Conditional Access Policies --"
foreach ($policy in $policies) {
    $reportLines += "  [$($policy.state)] $($policy.displayName)"
}
$reportLines += ""
$reportLines += "-- Overall Status --"
$reportLines += "  $($complianceStatus.status)"

# -- Write full report to file (Out-File) --
$fullReportFile = "$reportOutputPath\compliance-report-$(Get-Date -Format 'yyyyMMdd').txt"
$reportLines | Out-File -FilePath $fullReportFile -Encoding utf8
Write-Output "Full report written to: $fullReportFile"

# -- Write one-line summary (Set-Content) --
$summaryFile = "$reportOutputPath\latest-status.txt"
Set-Content -Path $summaryFile -Value "[$((Get-Date).ToString('o'))] $($complianceStatus.status)"
Write-Output "Summary written to: $summaryFile"
