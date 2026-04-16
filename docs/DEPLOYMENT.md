# Deployment Guide — Azure App Service

This guide covers building and deploying Azure Automation MindMap to **Azure App Service** (Linux, Node.js).

---

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) installed and logged in (`az login`)
- An Azure App Service (Linux, Node.js 20 LTS) — see [Step 1](#step-1--create-azure-app-service) if you need to create one
- `.env.local` configured with your production App Registration values (see [SETUP.md](SETUP.md))

---

## Step 1 — Create Azure App Service

Skip this step if you already have an App Service.

```powershell
# Variables — change these to match your environment
$resourceGroup = "your-resource-group"
$appName       = "your-app-name"
$location      = "eastus"          # Azure region

# Create resource group (skip if it exists)
az group create --name $resourceGroup --location $location

# Create App Service Plan (Linux, free tier)
az appservice plan create `
    --name "$appName-plan" `
    --resource-group $resourceGroup `
    --sku B1 `
    --is-linux

# Create Web App (Node.js 20)
az webapp create `
    --resource-group $resourceGroup `
    --plan "$appName-plan" `
    --name $appName `
    --runtime "NODE:20-lts"

# Set startup command
az webapp config set `
    --resource-group $resourceGroup `
    --name $appName `
    --startup-file "node server.js"
```

---

## Step 2 — Configure Environment Variables

> **Important:** `NEXT_PUBLIC_*` variables are baked into the build. You configure them in `.env.local` **before building**, not in App Service settings.

Update `.env.local` with your **production** App Registration values:

```env
NEXT_PUBLIC_AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
NEXT_PUBLIC_AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
NEXT_PUBLIC_REDIRECT_URI=https://<your-app-name>.azurewebsites.net
```

---

## Step 3 — Build the Application

```bash
npm run build
```

This generates the optimised production output in `.next/standalone/`.

---

## Step 4 — Package the Build

```powershell
# Copy static assets into the standalone output
$standalone = ".next\standalone"
Copy-Item -Path ".next\static" -Destination "$standalone\.next\static" -Recurse -Force
Copy-Item -Path "public"       -Destination "$standalone\public"       -Recurse -Force

# Create deployment zip
Compress-Archive -Path "$standalone\*" -DestinationPath "deploy.zip" -Force
```

---

## Step 5 — Deploy

```powershell
az webapp deploy `
    --resource-group "your-resource-group" `
    --name "your-app-name" `
    --src-path "deploy.zip" `
    --type zip `
    --async true
```

Deployment typically takes 60–90 seconds. The `--async true` flag polls until complete.

---

## Step 6 — Add Redirect URI in Azure Entra ID

After deployment, add your App Service URL as a redirect URI in the App Registration:

1. Azure Portal → **Microsoft Entra ID → App registrations** → your app
2. **Authentication → Single-page application → Add URI**
3. Add: `https://<your-app-name>.azurewebsites.net`
4. Click **Save**

---

## Full One-Liner (Build + Package + Deploy)

```powershell
npm run build; `
$s = ".next\standalone"; `
Copy-Item -Path ".next\static" -Destination "$s\.next\static" -Recurse -Force; `
Copy-Item -Path "public" -Destination "$s\public" -Recurse -Force; `
Compress-Archive -Path "$s\*" -DestinationPath "deploy.zip" -Force; `
az webapp deploy --resource-group "your-resource-group" --name "your-app-name" --src-path "deploy.zip" --type zip --async true
```

---

## App Service Configuration Reference

| Setting | Value |
|---------|-------|
| **Runtime Stack** | Node.js 20 LTS |
| **Operating System** | Linux |
| **Startup Command** | `node server.js` |
| **Always On** | Recommended: Enabled |
| **HTTPS Only** | Recommended: Enabled |

---

## Verify Deployment

```powershell
az webapp show `
    --resource-group "your-resource-group" `
    --name "your-app-name" `
    --query "state" -o tsv
# Expected output: Running
```

Then open `https://<your-app-name>.azurewebsites.net` in your browser.

---

## Updating the Application

To deploy a new version:

1. Make your code changes
2. If you changed `.env.local` → update `NEXT_PUBLIC_*` values accordingly
3. Repeat Steps 3–5 (Build → Package → Deploy)

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| App shows blank page | Verify startup command is `node server.js` |
| Auth redirect loop | Ensure `NEXT_PUBLIC_REDIRECT_URI` exactly matches the URI registered in Azure |
| 500 errors | Check App Service logs: `az webapp log tail --resource-group <rg> --name <app>` |
| `az webapp deploy` fails with 401 | Run `az login` and ensure you have Contributor role on the App Service |
