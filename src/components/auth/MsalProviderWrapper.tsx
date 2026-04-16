"use client";

import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "@/config/authConfig";

export function MsalProviderWrapper({ children }: { children: React.ReactNode }) {
    return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}
