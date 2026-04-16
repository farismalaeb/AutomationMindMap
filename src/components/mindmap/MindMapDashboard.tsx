"use client";

import { useMsal } from "@azure/msal-react";
import { LogOut, Map, Loader2, ChevronDown, Table2, Boxes, Focus } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import {
    fetchSubscriptions,
    fetchAutomationAccounts,
    fetchAllAutomationData,
    fetchJobStreams,
    refreshRunbookData,
    Subscription,
    AutomationAccount,
    AutomationData,
    JobOutput
} from "@/services/azureService";
import { MindMap } from "./MindMap";
import { TableView } from "./TableView";

type ViewMode = "mindmap" | "objectmap" | "table";

export function MindMapDashboard() {
    const { instance, accounts } = useMsal();

    const [subs, setSubs] = useState<Subscription[]>([]);
    const [selectedSub, setSelectedSub] = useState<string>("");

    const [autoAccounts, setAutoAccounts] = useState<AutomationAccount[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<string>("");

    const [automationData, setAutomationData] = useState<AutomationData | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>("mindmap");
    const [selectedRunbookId, setSelectedRunbookId] = useState<string>("");
    const [selectedRunbookIdMindmap, setSelectedRunbookIdMindmap] = useState<string>("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Helper to get token
    const getToken = async () => {
        const request = {
            scopes: ["https://management.azure.com/user_impersonation"],
            account: accounts[0],
        };
        try {
            const response = await instance.acquireTokenSilent(request);
            return response.accessToken;
        } catch (e) {
            // Fallback to interaction if silent fails
            await instance.acquireTokenRedirect(request);
            return ""; // The redirect will reload the page
        }
    };

    // ── Callback: Refresh a single runbook's data ─────────────────────────────
    const handleRefreshRunbook = useCallback(async (runbookName: string) => {
        if (!automationData || !selectedAccount) return;
        try {
            const token = await getToken();
            const result = await refreshRunbookData(token, selectedAccount, runbookName);
            
            if (result.runbook) {
                // Update the runbook in the data
                setAutomationData(prev => {
                    if (!prev) return prev;
                    const updatedRunbooks = prev.runbooks.map(rb => 
                        rb.name.toLowerCase() === runbookName.toLowerCase() ? result.runbook! : rb
                    );
                    // Update jobs and lastRunByRunbook
                    const allJobs = [...prev.jobs.filter(j => j.properties.runbook.name.toLowerCase() !== runbookName.toLowerCase()), ...result.jobs];
                    const updatedLastRun = { ...prev.lastRunByRunbook };
                    if (result.lastRun) {
                        updatedLastRun[runbookName] = result.lastRun;
                    }
                    return {
                        ...prev,
                        runbooks: updatedRunbooks,
                        jobs: allJobs,
                        lastRunByRunbook: updatedLastRun,
                        jobStreamErrors: { ...prev.jobStreamErrors, ...result.jobStreamErrors },
                    };
                });
            }
        } catch (err) {
            console.error("Failed to refresh runbook:", err);
        }
    }, [automationData, selectedAccount, accounts, instance]);

    // ── Callback: Fetch job streams/logs ──────────────────────────────────────
    const handleFetchJobStreams = useCallback(async (jobId: string): Promise<JobOutput> => {
        if (!selectedAccount) return { streams: [], output: null };
        try {
            const token = await getToken();
            return await fetchJobStreams(token, selectedAccount, jobId);
        } catch (err) {
            console.error("Failed to fetch job streams:", err);
            return { streams: [], output: null };
        }
    }, [selectedAccount, accounts, instance]);

    // Initial load: Fetch Subscriptions
    useEffect(() => {
        const loadSubs = async () => {
            try {
                setLoading(true);
                const token = await getToken();
                const data = await fetchSubscriptions(token);
                setSubs(data);
                if (data.length > 0) setSelectedSub(data[0].subscriptionId);
            } catch (err: any) {
                setError(err.message || "Failed to load subscriptions");
            } finally {
                setLoading(false);
            }
        };
        if (accounts[0]) {
            loadSubs();
        }
    }, [accounts]);

    // When Sub changes: Fetch Automation Accounts
    useEffect(() => {
        const loadAccounts = async () => {
            if (!selectedSub) return;
            try {
                setLoading(true);
                const token = await getToken();
                const data = await fetchAutomationAccounts(token, selectedSub);
                setAutoAccounts(data);
                if (data.length > 0) setSelectedAccount(data[0].id);
                else setSelectedAccount("");
            } catch (err: any) {
                setError(err.message || "Failed to load automation accounts");
            } finally {
                setLoading(false);
            }
        };
        loadAccounts();
    }, [selectedSub]);

    // When Account checks: Fetch deep graph data
    useEffect(() => {
        const loadData = async () => {
            if (!selectedAccount) {
                setAutomationData(null);
                return;
            }
            try {
                setLoading(true);
                const token = await getToken();
                const accObj = autoAccounts.find(a => a.id === selectedAccount);
                if (accObj) {
                    const data = await fetchAllAutomationData(token, accObj);
                    setAutomationData(data);
                }
            } catch (err: any) {
                setError(err.message || "Failed to load runbooks and variables");
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [selectedAccount, autoAccounts]);

    const handleLogout = () => {
        instance.logoutRedirect().catch(console.error);
    };

    return (
        <div className="flex flex-col h-screen bg-slate-50 text-slate-900">
            {/* HEADER */}
            <header className="flex items-center justify-between p-4 bg-white border-b border-slate-200 shadow-sm z-10 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-xl text-white shadow-md shadow-indigo-500/20">
                        <Map className="w-5 h-5" />
                    </div>
                    <h1 className="font-extrabold text-xl tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-slate-600">
                        Azure Automation Mindmap
                    </h1>
                </div>

                {/* SELECTORS */}
                <div className="flex flex-1 max-w-2xl px-8 gap-4 items-center">
                    <div className="relative flex-1">
                        <select
                            value={selectedSub}
                            onChange={(e) => setSelectedSub(e.target.value)}
                            className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-700 py-2 pl-4 pr-10 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                            disabled={loading || subs.length === 0}
                        >
                            <option value="" disabled>Select Subscription</option>
                            {subs.map(s => <option key={s.subscriptionId} value={s.subscriptionId}>{s.displayName}</option>)}
                        </select>
                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>

                    <div className="relative flex-1">
                        <select
                            value={selectedAccount}
                            onChange={(e) => setSelectedAccount(e.target.value)}
                            className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-700 py-2 pl-4 pr-10 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                            disabled={loading || autoAccounts.length === 0}
                        >
                            <option value="" disabled>Select Automation Account</option>
                            {autoAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>

                    {loading && <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />}
                </div>

                {/* View Toggle + User Info */}
                <div className="flex items-center gap-4">
                    {/* View Mode Toggle */}
                    <div className="flex items-center bg-slate-100 rounded-lg p-1">
                        <button
                            onClick={() => setViewMode("mindmap")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                                viewMode === "mindmap"
                                    ? "bg-white text-indigo-600 shadow-sm"
                                    : "text-slate-600 hover:text-slate-800"
                            }`}
                            title="Runbook-centric view: Runbooks → Dependencies"
                        >
                            <Map className="w-4 h-4" />
                            <span className="hidden sm:inline">Runbooks</span>
                        </button>
                        <button
                            onClick={() => setViewMode("objectmap")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                                viewMode === "objectmap"
                                    ? "bg-white text-indigo-600 shadow-sm"
                                    : "text-slate-600 hover:text-slate-800"
                            }`}
                            title="Object-centric view: Assets → Runbooks using them"
                        >
                            <Boxes className="w-4 h-4" />
                            <span className="hidden sm:inline">Objects</span>
                        </button>
                        <button
                            onClick={() => setViewMode("table")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                                viewMode === "table"
                                    ? "bg-white text-indigo-600 shadow-sm"
                                    : "text-slate-600 hover:text-slate-800"
                            }`}
                        >
                            <Table2 className="w-4 h-4" />
                            <span className="hidden sm:inline">Table</span>
                        </button>
                    </div>

                    {/* Runbook selector for Runbooks tab */}
                    {viewMode === "mindmap" && automationData && (
                        <div className="relative">
                            <select
                                value={selectedRunbookIdMindmap}
                                onChange={(e) => setSelectedRunbookIdMindmap(e.target.value)}
                                className="appearance-none bg-indigo-50 border border-indigo-200 text-indigo-700 py-1.5 pl-3 pr-8 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all max-w-[200px]"
                            >
                                <option value="">Select Runbook...</option>
                                {automationData.runbooks.map(rb => (
                                    <option key={rb.id} value={rb.id}>{rb.name}</option>
                                ))}
                            </select>
                            <ChevronDown className="w-4 h-4 text-indigo-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                    )}

                    <span className="text-sm font-medium text-slate-600 px-3 py-1 bg-slate-100 rounded-full">
                        {accounts[0]?.name || accounts[0]?.username}
                    </span>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium"
                    >
                        <LogOut className="w-4 h-4" />
                        <span className="hidden sm:inline">Sign Out</span>
                    </button>
                </div>
            </header>

            {error && (
                <div className="bg-red-50 text-red-600 p-3 text-sm text-center font-medium border-b border-red-100 shrink-0">
                    ⚠️ {error}
                </div>
            )}

            {/* Main Content Area: React Flow Canvas */}
            <main className="flex-1 relative overflow-hidden bg-slate-50">
                {loading && !automationData ? (
                    // Loading skeleton
                    <div className="absolute inset-0 flex items-center justify-center custom-grid-pattern">
                        <div className="flex flex-col items-center gap-6">
                            {/* Central skeleton node */}
                            <div className="relative">
                                <div className="w-48 h-14 rounded-2xl animate-pulse" style={{ backgroundColor: "#e2e8f0" }} />
                                {/* Branch lines */}
                                <div className="absolute left-1/2 top-full w-0.5 h-8 animate-pulse" style={{ backgroundColor: "#cbd5e1" }} />
                            </div>
                            {/* Child skeleton nodes */}
                            <div className="flex gap-8">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="flex flex-col items-center gap-3">
                                        <div className="w-32 h-10 rounded-xl animate-pulse" style={{ backgroundColor: "#e2e8f0", animationDelay: `${i * 150}ms` }} />
                                        <div className="flex gap-2">
                                            <div className="w-20 h-8 rounded-lg animate-pulse" style={{ backgroundColor: "#f1f5f9", animationDelay: `${i * 150 + 75}ms` }} />
                                            <div className="w-20 h-8 rounded-lg animate-pulse" style={{ backgroundColor: "#f1f5f9", animationDelay: `${i * 150 + 100}ms` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {/* Loading text */}
                            <div className="flex items-center gap-2 mt-4 text-slate-500">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span className="text-sm font-medium">Loading mindmap data...</span>
                            </div>
                        </div>
                    </div>
                ) : !automationData ? (
                    <div className="absolute inset-0 flex items-center justify-center custom-grid-pattern opacity-60">
                        <div className="bg-white/80 backdrop-blur-md p-8 rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 text-center max-w-sm">
                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Map className="w-8 h-8 text-slate-400" />
                            </div>
                            <h2 className="text-xl font-bold text-slate-700 mb-2">Ready to Map</h2>
                            <p className="text-slate-500 text-sm">
                                Select a Subscription and an Automation Account from the dropdowns above to generate your interactive mindmap.
                            </p>
                        </div>
                    </div>
                ) : (
                    viewMode === "mindmap" ? (
                        selectedRunbookIdMindmap ? (
                            <MindMap
                                key={`runbook-view-${selectedRunbookIdMindmap}`}
                                data={automationData}
                                viewType="single"
                                singleRunbookId={selectedRunbookIdMindmap}
                                onRefreshRunbook={handleRefreshRunbook}
                                onFetchJobStreams={handleFetchJobStreams}
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center custom-grid-pattern opacity-60">
                                <div className="bg-white/80 backdrop-blur-md p-8 rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 text-center max-w-sm">
                                    <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Map className="w-8 h-8 text-indigo-500" />
                                    </div>
                                    <h2 className="text-xl font-bold text-slate-700 mb-2">Runbooks View</h2>
                                    <p className="text-slate-500 text-sm">
                                        Select a runbook from the dropdown above to view its dependency tree.
                                    </p>
                                </div>
                            </div>
                        )
                    ) : viewMode === "objectmap" ? (
                        <MindMap 
                            key="object-view"
                            data={automationData}
                            viewType="object"
                            onRefreshRunbook={handleRefreshRunbook}
                            onFetchJobStreams={handleFetchJobStreams}
                        />
                    ) : (
                        <TableView 
                            data={automationData}
                            onRefreshRunbook={handleRefreshRunbook}
                            onFetchJobStreams={handleFetchJobStreams}
                        />
                    )
                )}
            </main>

            <style jsx>{`
        .custom-grid-pattern {
          background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
          background-size: 24px 24px;
        }
      `}</style>
        </div>
    );
}
