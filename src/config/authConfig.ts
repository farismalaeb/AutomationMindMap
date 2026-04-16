import { Configuration, PublicClientApplication } from "@azure/msal-browser";

// Environment variables for Entra ID authentication
const clientId = process.env.NEXT_PUBLIC_AZURE_CLIENT_ID;
const tenantId = process.env.NEXT_PUBLIC_AZURE_TENANT_ID;
const redirectUri = process.env.NEXT_PUBLIC_REDIRECT_URI;

if (!clientId || !tenantId) {
  console.error(
    "Missing required environment variables: NEXT_PUBLIC_AZURE_CLIENT_ID and/or NEXT_PUBLIC_AZURE_TENANT_ID. " +
    "Please create a .env.local file with these values."
  );
}

export const msalConfig: Configuration = {
  auth: {
    clientId: clientId || "",
    authority: `https://login.microsoftonline.com/${tenantId || ""}`,
    redirectUri: redirectUri || (typeof window !== "undefined" ? window.location.origin : "/"),
  },
  cache: {
    cacheLocation: "sessionStorage", // This configures where your cache will be stored
  },
};

// Add scopes for Azure Resource Manager API to read automation accounts
export const loginRequest = {
  scopes: ["https://management.azure.com/user_impersonation"],
};

export const msalInstance = new PublicClientApplication(msalConfig);
