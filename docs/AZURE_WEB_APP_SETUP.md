# Azure Web App Setup Guide

This guide walks you through creating and configuring an **Azure App Service (Web App)** to host **Azure Automation MindMap** using the Azure Portal. No Azure CLI knowledge is required.

> For a CLI-based deployment reference, see [DEPLOYMENT.md](DEPLOYMENT.md).  
> For App Registration setup, see [APP_REGISTRATION.md](APP_REGISTRATION.md).

---

## Overview

Azure Automation MindMap runs as a **Node.js 20 server-side rendered app** (Next.js standalone). You need:

| Resource | Purpose |
|----------|---------|
| App Service Plan | The compute tier (B1 or higher recommended) |
| Web App (App Service) | The hosting environment for the application |
| App Registration | Azure Entra ID identity for auth (see [APP_REGISTRATION.md](APP_REGISTRATION.md)) |

---

## Step 1 — Create a Resource Group (Optional)

If you don't have a resource group yet:

1. Go to [portal.azure.com](https://portal.azure.com)
2. Search for **Resource groups** → click **+ Create**
3. Fill in:
   - **Subscription**: your subscription
   - **Resource group name**: e.g. `AutomationMindMap-RG`
   - **Region**: choose the region closest to your users
4. Click **Review + create** → **Create**

---

## Step 2 — Create the Web App

1. In the Azure Portal, search for **App Services** → click **+ Create** → **Web App**

2. Fill in the **Basics** tab:

   | Field | Value |
   |-------|-------|
   | **Subscription** | your subscription |
   | **Resource Group** | the one you created above |
   | **Name** | globally unique, e.g. `my-automationmindmap` |
   | **Publish** | **Code** |
   | **Runtime stack** | **Node 20 LTS** |
   | **Operating System** | **Linux** |
   | **Region** | same region as your resource group |

3. Under **Pricing plans**, click **Create new** or select an existing plan:
   - Minimum recommended: **B1** (Basic)
   - For production use with multiple users: **P1v3** or higher
   - Free (F1) tier is **not supported** — it does not allow custom startup commands

4. Leave the remaining tabs as default → click **Review + create** → **Create**

5. Wait for the deployment to complete (~1 minute), then click **Go to resource**

---

## Step 3 — Configure the Runtime

### 3a — Set the Startup Command

1. In your Web App, go to **Settings → Configuration**
2. Click the **General settings** tab
3. In the **Startup Command** field, enter:
   ```
   node server.js
   ```
4. Click **Save** → **Continue** to confirm

### 3b — Enable Always On (Recommended)

On the same **General settings** tab:

- Set **Always on** to **On**

> Without Always On, the app goes to sleep after idle periods and the first request after wake-up takes 20–30 seconds.

### 3c — Enforce HTTPS

1. Go to **Settings → TLS/SSL settings** (or **Custom domains** on newer portal)
2. Set **HTTPS Only** to **On**
3. Click **Save**

---

## Step 4 — Build the Application Locally

> The `.env.local` values are **baked into the build** at compile time. You must rebuild every time you change environments.

1. Clone the repository:
   ```bash
   git clone https://github.com/farismalaeb/AutomationMindMap.git
   cd AutomationMindMap
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env.local` file in the project root with your App Registration values:
   ```env
   NEXT_PUBLIC_AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   NEXT_PUBLIC_AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   NEXT_PUBLIC_REDIRECT_URI=https://<your-app-name>.azurewebsites.net
   ```
   Replace the values with your actual App Registration client ID and tenant ID (see [APP_REGISTRATION.md](APP_REGISTRATION.md)), and your Web App URL from Step 2.

4. Build the application:
   ```bash
   npm run build
   ```

5. Package the standalone output into a zip file:

   **Windows (PowerShell):**
   ```powershell
   $standalone = ".next\standalone"
   Copy-Item -Path ".next\static" -Destination "$standalone\.next\static" -Recurse -Force
   Copy-Item -Path "public"       -Destination "$standalone\public"       -Recurse -Force
   Compress-Archive -Path "$standalone\*" -DestinationPath "deploy.zip" -Force
   ```

   **macOS / Linux (bash):**
   ```bash
   cp -r .next/static .next/standalone/.next/static
   cp -r public .next/standalone/public
   cd .next/standalone && zip -r ../../deploy.zip . && cd ../..
   ```

---

## Step 5 — Deploy via the Azure Portal (Kudu)

### Method A — Drag & Drop (Simplest)

1. In your Web App, go to **Development Tools → Advanced Tools**
2. Click **Go →** (this opens the Kudu console)
3. In Kudu, click **Tools → Zip Push Deploy**
4. Drag your `deploy.zip` file onto the page
5. Wait for the upload and extraction to complete (green checkmark)

### Method B — ZIP Deploy via REST (Alternative)

You can also deploy using the Kudu REST endpoint directly:

```powershell
$appName      = "your-app-name"
$resourceGroup = "your-resource-group"

# Get the publishing credentials
$creds = az webapp deployment list-publishing-credentials `
    --name $appName `
    --resource-group $resourceGroup `
    --query "{user:publishingUserName, pass:publishingPassword}" `
    -o json | ConvertFrom-Json

$base64 = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($creds.user):$($creds.pass)"))
$kuduUrl = "https://$appName.scm.azurewebsites.net/api/zipdeploy"

Invoke-RestMethod -Uri $kuduUrl `
    -Method POST `
    -Headers @{ Authorization = "Basic $base64" } `
    -InFile "deploy.zip" `
    -ContentType "application/zip"
```

### Method C — Azure CLI (Fastest)

```powershell
az webapp deploy `
    --resource-group "your-resource-group" `
    --name "your-app-name" `
    --src-path "deploy.zip" `
    --type zip
```

---

## Step 6 — Add the Redirect URI in Entra ID

The Web App URL must be registered as a redirect URI in your App Registration:

1. Azure Portal → **Microsoft Entra ID → App registrations** → open your app
2. Click **Authentication** → under **Single-page application**, click **Add URI**
3. Enter: `https://<your-app-name>.azurewebsites.net`
4. Click **Save**

> The redirect URI must match `NEXT_PUBLIC_REDIRECT_URI` in `.env.local` **exactly**, including `https://` and no trailing slash.

---

## Step 7 — Verify the Deployment

1. In your Web App overview, click **Browse** (or navigate to `https://<your-app-name>.azurewebsites.net`)
2. You should see the **Azure Automation MindMap** login screen
3. Sign in with an account that has **Reader** permissions on your Azure Automation Account
4. The Mind Map should load and display your runbooks

### Check Deployment Logs (if the app doesn't load)

1. In your Web App, go to **Deployment Center → Logs**
2. Click the latest deployment to see the output log
3. Alternatively, go to **Development Tools → Advanced Tools → Kudu → Deployments** for detailed build logs

### Check Application Logs

1. Go to **Monitoring → Log stream**
2. Errors from Node.js will appear here in real time

---

## App Service Configuration Reference

| Setting | Recommended Value |
|---------|------------------|
| **Runtime stack** | Node.js 20 LTS |
| **Operating system** | Linux |
| **Startup command** | `node server.js` |
| **Always On** | On |
| **HTTPS Only** | On |
| **Minimum TLS Version** | 1.2 |
| **HTTP/2** | On |
| **ARR Affinity** | Off (stateless app — no benefit) |

---

## Scaling (Optional)

For production environments with many concurrent users, consider scaling the App Service Plan:

| Plan | vCPU | RAM | Recommended for |
|------|------|-----|-----------------|
| B1 | 1 | 1.75 GB | Dev / small teams (<10 users) |
| B2 | 2 | 3.5 GB | Small teams (10–25 users) |
| P1v3 | 2 | 8 GB | Medium teams (25–100 users) |
| P2v3 | 4 | 16 GB | Large organisations |

To change the plan: **Settings → Scale up (App Service plan)** → select the new tier.

---

## Custom Domain (Optional)

To use your own domain instead of `*.azurewebsites.net`:

1. Go to **Settings → Custom domains** → click **Add custom domain**
2. Enter your domain and follow the DNS validation steps (TXT + CNAME records)
3. Under **TLS/SSL settings**, add a managed certificate (free) or upload your own
4. Update `NEXT_PUBLIC_REDIRECT_URI` in `.env.local` to your custom domain, rebuild, and redeploy
5. Add the custom domain as a redirect URI in your App Registration (Step 6)

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| App loads but shows white screen | Startup command not set | Set startup command to `node server.js` in General settings |
| Login redirects to wrong URL | Redirect URI mismatch | Ensure `.env.local` URI and App Registration URI are identical |
| `AADSTS50011` error on login | Redirect URI not registered | Add the URL in Entra ID App Registration → Authentication |
| 503 / App not available | App still starting up | Wait 30–60 seconds; check Log stream for errors |
| Old version shown after redeploy | Browser cache | Hard-refresh (Ctrl+Shift+R) or use incognito mode |
| Runbooks not loading | Missing RBAC permissions | Assign **Reader** role on the Automation Account (see [APP_REGISTRATION.md](APP_REGISTRATION.md)) |
| Free (F1) tier — app crashes | F1 doesn't allow startup commands | Upgrade to at minimum **B1** |
