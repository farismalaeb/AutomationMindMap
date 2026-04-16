# ============================================================
# Invoke-RunbookOrchestrator.ps1
# 
# Demonstrates: Start-AzAutomationRunbook (runbook-to-runbook calls)
#               Direct variable reference
#               Direct connection reference
# 
# Monitoring features shown:
#   - "Calls Runbooks" node group with 3 child nodes
#   - Direct automation variable dependency edges
#   - Direct automation connection dependency edges
# ============================================================

Write-Output "Starting orchestration pipeline..."

# -- Automation Account context (read from variables) --
$automationAccountName = Get-AutomationVariable -Name "AutomationAccountName"
$resourceGroupName     = Get-AutomationVariable -Name "ResourceGroupName"

# -- Auth connection for Azure --
$azureConn = Get-AutomationConnection -Name "AzureRunAsConnection"
Connect-AzAccount -ServicePrincipal `
    -Tenant     $azureConn.TenantId `
    -ApplicationId $azureConn.ApplicationId `
    -CertificateThumbprint $azureConn.CertificateThumbprint

Write-Output "Connected to Azure. Launching child runbooks..."

# -- Launch child: token fetch (fire and forget) --
$tokenJob = Start-AzAutomationRunbook `
    -AutomationAccountName $automationAccountName `
    -ResourceGroupName     $resourceGroupName `
    -Name                  "Get-EntraGraphToken"

Write-Output "Get-EntraGraphToken launched (async). Job ID: $($tokenJob.JobId)"

# -- Launch child: compliance report (wait for completion) --
$reportJob = Start-AzAutomationRunbook `
    -AutomationAccountName $automationAccountName `
    -ResourceGroupName     $resourceGroupName `
    -Name                  "Export-ComplianceReport" `
    -Wait

Write-Output "Export-ComplianceReport completed. Status: $($reportJob.Status)"

# -- Launch child: config update (fire and forget) --
$configJob = Start-AzAutomationRunbook `
    -AutomationAccountName $automationAccountName `
    -ResourceGroupName     $resourceGroupName `
    -Name                  "Update-ConfigVariables"

Write-Output "Update-ConfigVariables launched (async). Job ID: $($configJob.JobId)"

Write-Output "Orchestration complete. All child runbooks dispatched."
