# Azure Automation MindMap

> **An interactive visual explorer for Azure Automation Accounts** — runbooks, assets, job history, and dependencies — powered by your own Azure credentials.

![Views](https://img.shields.io/badge/views-Runbooks%20%7C%20Objects%20%7C%20Table-blue)
![Auth](https://img.shields.io/badge/auth-MSAL%20%2F%20Azure%20Entra%20ID-0078d4)
![Read-only](https://img.shields.io/badge/operations-100%25%20read--only-brightgreen)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![License](https://img.shields.io/badge/license-MIT-green)

---

## What is this?

Azure Automation MindMap connects to your Azure tenant using your own credentials (MSAL / Azure Entra ID) and renders your **Automation Account** as a live interactive graph — no service principal, no stored secrets.

It helps Systems Engineers and Automation Architects answer questions like:
- *Which runbooks use this credential / variable / connection?*
- *Which runbooks have failed recently or have hidden errors?*
- *Are there hardcoded secrets or deprecated RunAs accounts in my scripts?*
- *What external systems does this runbook call — VMs, storage, databases, email?*

---

## Features

| Feature | Description |
|---------|-------------|
| 🗺 **Runbooks View** | Dependency tree — each runbook and all its linked assets |
| 📦 **Objects View** | Asset-centric — see which runbooks consume each variable/credential/connection |
| 📋 **Table View** | Sortable list with expandable detail cards |
| 📜 **Job History** | Latest 10 jobs per runbook, load-more, pre-loaded error/warning status |
| 🔴 **Security Scanner** | Detects hardcoded secrets, deprecated RunAs accounts |
| 📡 **Dependency Parsing** | HTTP requests, VM usage, child runbook calls, storage, SQL, email |
| 🔒 **100% Read-only** | Every API call is a GET — nothing is ever written or deleted |
| 🔑 **MSAL Auth** | Sign in with your existing Azure account — no service principal needed |

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/farismalaeb/AutomationMindMap.git
cd AutomationMindMap

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local — add your Azure App Registration Client ID and Tenant ID

# 4. Start the dev server
npm run dev
# → Open http://localhost:3000
```

Full setup guide: [docs/SETUP.md](docs/SETUP.md)

---

## Prerequisites

### Software
| Tool | Version |
|------|---------|
| Node.js | 20 LTS or later |
| npm | 9+ |

### Azure
| Requirement | Details |
|-------------|---------|
| Azure Subscription | Signed-in user must have **Reader** role |
| Azure Automation Account | Signed-in user must have **Reader** role |
| Azure Entra ID App Registration | **Single-page application (SPA)** with `user_impersonation` permission on Azure Service Management |

Step-by-step guide: [docs/APP_REGISTRATION.md](docs/APP_REGISTRATION.md)

---

## Environment Variables

Create `.env.local` from the template:

```bash
cp .env.example .env.local
```

```env
# Required — from your Azure Entra ID App Registration
NEXT_PUBLIC_AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
NEXT_PUBLIC_AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# Optional — defaults to window.location.origin if omitted
# NEXT_PUBLIC_REDIRECT_URI=http://localhost:3000
```

> ⚠️ `NEXT_PUBLIC_*` variables are **baked into the build at compile time**. Rebuild after any change.

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/SETUP.md](docs/SETUP.md) | Local development setup, project structure, troubleshooting |
| [docs/APP_REGISTRATION.md](docs/APP_REGISTRATION.md) | Create App Registration, configure API permissions and RBAC |
| [docs/AZURE_WEB_APP_SETUP.md](docs/AZURE_WEB_APP_SETUP.md) | Create and configure an Azure Web App via the Portal |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Build, package, and deploy to Azure App Service |

---

## Project Structure

```
├── src/
│   ├── app/                        # Next.js App Router
│   ├── components/
│   │   ├── auth/                   # MSAL login/logout
│   │   └── mindmap/                # All UI components
│   │       ├── MindMapDashboard    # Main layout + view switching
│   │       ├── MindMap             # React Flow canvas
│   │       ├── NodeDetailPanel     # Right-panel detail view
│   │       ├── TableView           # Table view
│   │       ├── JobHistoryChart     # Job history charts
│   │       └── ScheduleHealth      # Schedule health cards
│   ├── config/
│   │   └── authConfig.ts           # MSAL configuration
│   ├── services/
│   │   └── azureService.ts         # Azure ARM REST API (read-only)
│   └── utils/
│       ├── mindmapTransform.ts     # Data → React Flow nodes/edges
│       └── scriptParser.ts         # PowerShell dependency parser
├── public/                         # Static assets
├── test-runbooks/                  # Sample PowerShell runbooks for testing
├── docs/                           # Documentation
├── .env.example                    # Environment template
└── README.md
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, standalone output) |
| Language | TypeScript |
| Auth | MSAL.js (`@azure/msal-browser`, `@azure/msal-react`) |
| Graph / Canvas | React Flow + Dagre layout |
| Styling | Tailwind CSS |
| Icons | Lucide React |

---

## Security

- **Zero write operations** — all API calls are HTTP GET
- **No stored credentials** — MSAL handles token lifecycle in the browser
- **No backend** — static Next.js SPA; Azure ARM is called directly from the browser using the user's delegated token
- **Secret scanning** — detects hardcoded passwords/tokens in runbook scripts and flags them in the UI

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first.

---

## License

MIT — free to use, modify, and distribute.