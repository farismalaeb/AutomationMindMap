# Local Development Setup

This guide covers installing, configuring, and running Azure Automation MindMap on your local machine.

---

## Prerequisites

| Tool | Version | Download |
|------|---------|----------|
| Node.js | 20 LTS or later | https://nodejs.org |
| npm | 9+ (bundled with Node.js) | — |
| Azure CLI *(optional, for deployment only)* | Latest | https://learn.microsoft.com/cli/azure/install-azure-cli |
| An Azure Entra ID App Registration | — | See [APP_REGISTRATION.md](APP_REGISTRATION.md) |

---

## 1 — Clone / Download

```bash
git clone https://github.com/farismalaeb/AutomationMindMap.git AutomationMindMap
cd AutomationMindMap
```

Or download and extract the ZIP archive.

---

## 2 — Install Dependencies

```bash
npm install
```

This installs all packages listed in `package.json`. The `node_modules` folder is created locally and is not checked into source control.

---

## 3 — Configure Environment Variables

```bash
cp .env.example .env.local
```

Then open `.env.local` in a text editor and fill in your values:

```env
# Application (client) ID from your Entra ID App Registration
NEXT_PUBLIC_AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Directory (tenant) ID from your Entra ID
NEXT_PUBLIC_AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Redirect URI — must match what is registered in Azure
# Leave commented out for localhost (defaults to http://localhost:3000 automatically)
# NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000
```

> **Where to find these values:**  
> Azure Portal → Microsoft Entra ID → App registrations → *your app* → Overview

---

## 4 — Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The dev server uses **Turbopack** for fast hot-reloading. Changes to source files reload the page automatically.

---

## 5 — Sign In

1. Click **Sign in with Microsoft** on the app's login screen
2. Authenticate with your Azure account
3. Select a **Subscription** from the dropdown
4. Select an **Automation Account**
5. The mind map generates automatically

---

## Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_AZURE_CLIENT_ID` | ✅ Yes | App Registration Client ID |
| `NEXT_PUBLIC_AZURE_TENANT_ID` | ✅ Yes | Azure Entra ID Tenant ID |
| `NEXT_PUBLIC_REDIRECT_URI` | ❌ Optional | Defaults to `window.location.origin` if omitted |

> `NEXT_PUBLIC_*` variables are **baked into the JavaScript bundle at build time**. You must rebuild and redeploy the app whenever you change these values.

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Create optimised production build |
| `npm run start` | Start production server (requires `npm run build` first) |
| `npm run lint` | Run ESLint checks |

---

## Project Structure

```
├── src/
│   ├── app/                    # Next.js App Router (layout, page, globals)
│   ├── components/
│   │   ├── auth/               # MSAL login/logout components
│   │   └── mindmap/            # All UI components
│   │       ├── MindMapDashboard.tsx    # Main page — layout and view switching
│   │       ├── MindMap.tsx             # React Flow canvas (Runbooks / Objects views)
│   │       ├── NodeDetailPanel.tsx     # Right-panel detail view on node click
│   │       ├── TableView.tsx           # Table view component
│   │       ├── JobHistoryChart.tsx     # Charts for job history
│   │       └── ScheduleHealth.tsx      # Schedule health summary cards
│   ├── config/
│   │   └── authConfig.ts       # MSAL configuration (reads from .env.local)
│   ├── services/
│   │   └── azureService.ts     # All Azure ARM REST API calls (100% read-only)
│   └── utils/
│       ├── mindmapTransform.ts  # Transforms AutomationData → React Flow nodes/edges
│       └── scriptParser.ts     # PowerShell script parser (dependency extraction)
├── public/                     # Static assets
├── test-runbooks/              # Sample PowerShell runbooks for testing
├── .env.example                # Environment variables template
└── docs/                       # Documentation
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `npm install` fails | Ensure Node.js 20+ is installed: `node --version` |
| Blank page / auth loop | Check `.env.local` values match your App Registration |
| `No subscriptions found` | Ensure the signed-in user has Reader role on the subscription |
| `No automation accounts found` | Ensure Reader role is assigned on the Automation Account |
| CORS errors in browser console | Verify redirect URI in Azure matches the app URL exactly |
