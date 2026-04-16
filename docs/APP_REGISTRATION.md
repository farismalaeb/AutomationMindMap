# Azure Entra ID App Registration Guide

This guide walks you through creating and configuring the Azure Entra ID App Registration required for Azure Automation MindMap.

---

## Overview

The application uses **OAuth 2.0 Authorization Code Flow with PKCE** (Single-Page Application pattern). Users sign in with their own Azure AD account — the app then uses their delegated permissions to call the Azure Resource Manager (ARM) API. No service principal or client secret is required.

---

## Step 1 — Create the App Registration

1. Open the [Azure Portal](https://portal.azure.com) and navigate to  
   **Microsoft Entra ID → App registrations → New registration**

2. Fill in:
   | Field | Value |
   |-------|-------|
   | **Name** | `AutomationMindMap` (or any name you prefer) |
   | **Supported account types** | *Accounts in this organizational directory only* (Single tenant) |
   | **Redirect URI** | Platform: **Single-page application (SPA)** |
   | | URI: `http://localhost:3000` (for local dev) |

3. Click **Register**.

4. Copy the following values — you will need them in `.env.local`:
   - **Application (client) ID** → `NEXT_PUBLIC_AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → `NEXT_PUBLIC_AZURE_TENANT_ID`

---

## Step 2 — Add Redirect URIs

In your App Registration → **Authentication → Platform configurations → Single-page application**

Add all URIs where the app will be hosted:

| Environment | Redirect URI |
|-------------|--------------|
| Local dev | `http://localhost:3000` |
| Azure App Service | `https://<your-app-name>.azurewebsites.net` |
| Custom domain | `https://<your-domain>` |

> **Important:** The URI must exactly match `NEXT_PUBLIC_REDIRECT_URI` in `.env.local`.

---

## Step 3 — Configure API Permissions

In your App Registration → **API permissions → Add a permission**

### Required Permission

| API | Permission type | Permission name | Description |
|-----|----------------|-----------------|-------------|
| **Azure Service Management** | Delegated | `user_impersonation` | Allows the app to call ARM on behalf of the signed-in user |

### Steps:
1. Click **Add a permission**
2. Select **Azure Service Management**
3. Choose **Delegated permissions**
4. Check **user_impersonation**
5. Click **Add permissions**
6. Click **Grant admin consent for [your tenant]** and confirm

> **Note:** Admin consent is required once per tenant. After consent, any user with appropriate Azure RBAC roles can use the app.

---

## Step 4 — Azure RBAC Roles

The signed-in user needs the following **Azure RBAC roles** assigned:

| Scope | Role | Purpose |
|-------|------|---------|
| Subscription | `Reader` | List subscriptions and automation accounts |
| Automation Account | `Reader` | Read runbooks, variables, credentials, jobs |
| Automation Account | `Automation Operator` | Read job history and output streams *(optional upgrade)* |

### Assign the Reader role (Subscription level)
1. Azure Portal → **Subscriptions** → select your subscription
2. **Access control (IAM) → Add role assignment**
3. Role: **Reader** → assign to the user or a group

### Assign the Reader role (Automation Account level)
1. Azure Portal → **Automation Accounts** → select your account
2. **Access control (IAM) → Add role assignment**
3. Role: **Reader** → assign to the user or a group

---

## Step 5 — Token Configuration (Optional)

For better security, consider adding these optional ID token claims:

In App Registration → **Token configuration → Add optional claim** → Token type: **Access**:
- `upn` — user principal name
- `email` — user email

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `AADSTS50011: The redirect URI does not match` | URI mismatch | Ensure the URI in Azure exactly matches `NEXT_PUBLIC_REDIRECT_URI` |
| `AADSTS65001: No consent for user_impersonation` | Admin consent not granted | Grant admin consent in the App Registration → API permissions |
| `AuthorizationFailed: does not have authorization` | Missing RBAC role | Assign Reader role at subscription or automation account scope |
| `403 Forbidden` on API calls | Insufficient permissions | Verify both API permission consent AND RBAC role assignment |
