"use client";

import { useMsal } from "@azure/msal-react";
import { LoginView } from "@/components/auth/LoginView";
import { MindMapDashboard } from "@/components/mindmap/MindMapDashboard";
import { useEffect, useState } from "react";

export default function Home() {
  const { accounts, inProgress } = useMsal();
  const isAuthenticated = accounts.length > 0;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || inProgress !== "none") {
    // Show a loading screen or nothing to avoid hydration mismatch
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  return <MindMapDashboard />;
}
