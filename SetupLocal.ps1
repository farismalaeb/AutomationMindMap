<#
.SYNOPSIS
    Sets up Azure Automation MindMap for local development.

.DESCRIPTION
    This script:
      - Validates prerequisites (Node.js, npm)
      - Creates .env.local from provided parameters
      - Installs npm dependencies
      - Optionally starts the development server

.PARAMETER ClientId
    The Application (client) ID from your Azure Entra ID App Registration.

.PARAMETER TenantId
    The Directory (tenant) ID from your Azure Entra ID App Registration.

.PARAMETER RedirectUri
    The redirect URI registered in your App Registration.
    Defaults to http://localhost:3000 for local development.

.PARAMETER SkipInstall
    Skip running 'npm install'. Useful when dependencies are already installed.

.PARAMETER StartDev
    Start the development server (npm run dev) after setup completes.

.EXAMPLE
    .\SetupLocal.ps1 -ClientId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" -TenantId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

.EXAMPLE
    .\SetupLocal.ps1 -ClientId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" -TenantId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" -StartDev

.EXAMPLE
    .\SetupLocal.ps1 -ClientId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" -TenantId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" -RedirectUri "https://myapp.azurewebsites.net" -SkipInstall

.NOTES
    For App Registration setup instructions, see docs/APP_REGISTRATION.md
    For full setup documentation, see docs/SETUP.md
#>

[CmdletBinding()]
param (
    [Parameter(Mandatory = $true, HelpMessage = "Application (client) ID from your Azure Entra ID App Registration")]
    [ValidatePattern('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')]
    [string]$ClientId,

    [Parameter(Mandatory = $true, HelpMessage = "Directory (tenant) ID from your Azure Entra ID App Registration")]
    [ValidatePattern('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')]
    [string]$TenantId,

    [Parameter(Mandatory = $false, HelpMessage = "Redirect URI (defaults to http://localhost:3000)")]
    [string]$RedirectUri = "http://localhost:3000",

    [Parameter(Mandatory = $false, HelpMessage = "Skip npm install")]
    [switch]$SkipInstall,

    [Parameter(Mandatory = $false, HelpMessage = "Start the dev server after setup")]
    [switch]$StartDev
)

# ─── Helpers ─────────────────────────────────────────────────────────────────

function Write-Step {
    param([string]$Message)
    Write-Host "`n  $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "  [OK] $Message" -ForegroundColor Green
}

function Write-Fail {
    param([string]$Message)
    Write-Host "  [!!] $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "       $Message" -ForegroundColor DarkGray
}

# ─── Banner ───────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "  ║   Azure Automation MindMap — Local Setup     ║" -ForegroundColor Blue
Write-Host "  ╚══════════════════════════════════════════════╝" -ForegroundColor Blue
Write-Host ""

# ─── Step 1: Verify script is run from the project root ──────────────────────

Write-Step "Step 1/4 — Checking project directory..."

if (-not (Test-Path "package.json")) {
    Write-Fail "package.json not found. Please run this script from the project root directory."
    Write-Info "Example:  cd C:\path\to\AutomationMindMap"
    Write-Info "          .\SetupLocal.ps1 -ClientId '...' -TenantId '...'"
    exit 1
}

$packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
Write-Success "Project root confirmed: $($packageJson.name) v$($packageJson.version)"

# ─── Step 2: Check prerequisites ─────────────────────────────────────────────

Write-Step "Step 2/4 — Checking prerequisites..."

# Node.js
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Fail "Node.js is not installed or not in PATH."
    Write-Info "Download from: https://nodejs.org (version 20 LTS or later required)"
    exit 1
}
$nodeVersion = (node --version 2>&1).Trim()
Write-Success "Node.js found: $nodeVersion"

# Version check — require v20+
$nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
if ($nodeMajor -lt 20) {
    Write-Fail "Node.js v20 LTS or later is required (found $nodeVersion)."
    Write-Info "Download from: https://nodejs.org"
    exit 1
}

# npm
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    Write-Fail "npm is not installed or not in PATH."
    exit 1
}
$npmVersion = (npm --version 2>&1).Trim()
Write-Success "npm found: v$npmVersion"

# ─── Step 3: Create .env.local ────────────────────────────────────────────────

Write-Step "Step 3/4 — Creating .env.local..."

if (Test-Path ".env.local") {
    Write-Host "  [!] .env.local already exists." -ForegroundColor Yellow
    $answer = Read-Host "      Overwrite it? (y/N)"
    if ($answer -notmatch '^[Yy]$') {
        Write-Info "Skipped — keeping existing .env.local"
    } else {
        $overwrite = $true
    }
} else {
    $overwrite = $true
}

if ($overwrite) {
    $envContent = @"
# Azure Entra ID App Registration
# Generated by SetupLocal.ps1 on $(Get-Date -Format 'yyyy-MM-dd HH:mm')
# See docs/APP_REGISTRATION.md for how to obtain these values

NEXT_PUBLIC_AZURE_CLIENT_ID=$ClientId
NEXT_PUBLIC_AZURE_TENANT_ID=$TenantId
NEXT_PUBLIC_REDIRECT_URI=$RedirectUri
"@

    Set-Content -Path ".env.local" -Value $envContent -Encoding UTF8
    Write-Success ".env.local created"
    Write-Info "  NEXT_PUBLIC_AZURE_CLIENT_ID = $ClientId"
    Write-Info "  NEXT_PUBLIC_AZURE_TENANT_ID = $TenantId"
    Write-Info "  NEXT_PUBLIC_REDIRECT_URI    = $RedirectUri"
}

# ─── Step 4: npm install ──────────────────────────────────────────────────────

Write-Step "Step 4/4 — Installing dependencies..."

if ($SkipInstall) {
    Write-Info "Skipped (--SkipInstall flag set)"
} else {
    Write-Info "Running: npm install"
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm install failed (exit code $LASTEXITCODE)."
        exit $LASTEXITCODE
    }
    Write-Success "Dependencies installed"
}

# ─── Summary ─────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  ┌─────────────────────────────────────────────┐" -ForegroundColor Green
Write-Host "  │   Setup complete! Ready to run.             │" -ForegroundColor Green
Write-Host "  └─────────────────────────────────────────────┘" -ForegroundColor Green
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "    1. Ensure http://localhost:3000 is a Redirect URI in your App Registration" -ForegroundColor DarkGray
Write-Host "       See: docs/APP_REGISTRATION.md" -ForegroundColor DarkGray
Write-Host "    2. Start the dev server:" -ForegroundColor DarkGray
Write-Host "         npm run dev" -ForegroundColor Yellow
Write-Host "    3. Open: http://localhost:3000" -ForegroundColor DarkGray
Write-Host ""

# ─── Optional: start dev server ───────────────────────────────────────────────

if ($StartDev) {
    Write-Host "  Starting development server..." -ForegroundColor Cyan
    Write-Host ""
    npm run dev
}
