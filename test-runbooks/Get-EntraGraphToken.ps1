# ============================================================
# Get-EntraGraphToken.ps1
#
# Demonstrates: Indirect variable reference ($varName = "X")
#               Invoke-RestMethod (web call)
#               Get-AzKeyVaultSecret (Key Vault usage)
#               Direct automation variable references
#
# Monitoring features shown:
#   - Automation Variable dependency edges (3 vars via indirect ref)
#   - "HTTP Calls" node: POST to login.microsoftonline.com + GET to graph
#   - Key Vault node: reads ClientSecret from vault
# ============================================================

Write-Output "Fetching Entra ID access token..."

# -- Indirect variable references (variable name stored in a variable) --
$tenantVarName       = "TenantId"
$clientIdVarName     = "ClientId"
$subscriptionVarName = "SubscriptionId"

$tenantId       = Get-AutomationVariable -Name $tenantVarName
$clientId       = Get-AutomationVariable -Name $clientIdVarName
$subscriptionId = Get-AutomationVariable -Name $subscriptionVarName

# -- Client secret fetched from Key Vault (not hardcoded) --
$vaultName    = "kv-automation-prod"
$secretName   = "EntraClientSecret"
$secretObject = Get-AzKeyVaultSecret -VaultName $vaultName -Name $secretName
$clientSecret = $secretObject.SecretValue | ConvertFrom-SecureString -AsPlainText

Write-Output "Tenant: $tenantId | Client: $clientId"

# -- OAuth2 token request (Invoke-RestMethod POST) --
$tokenUri = "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token"
$body = @{
    grant_type    = "client_credentials"
    scope         = "https://graph.microsoft.com/.default"
    client_id     = $clientId
    client_secret = $clientSecret
}

$tokenResponse = Invoke-RestMethod -Method Post -Uri $tokenUri `
    -ContentType "application/x-www-form-urlencoded" -Body $body

$accessToken = $tokenResponse.access_token
Write-Output "Access token acquired."

# -- Validate token by calling Graph (Invoke-RestMethod GET) --
$headers = @{ "Authorization" = "Bearer $accessToken" }
$meResponse = Invoke-RestMethod -Method Get `
    -Uri "https://graph.microsoft.com/v1.0/organization" `
    -Headers $headers

Write-Output "Tenant display name: $($meResponse.value[0].displayName)"

# -- Store the token expiry time back as a variable --
$expiresAt = (Get-Date).AddSeconds($tokenResponse.expires_in).ToString("o")
Set-AutomationVariable -Name "GraphTokenExpiresAt" -Value $expiresAt

Write-Output "Token expiry stored: $expiresAt"
