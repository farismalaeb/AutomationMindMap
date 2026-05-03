"use client";

import { RefreshCw, ShieldAlert, ShieldCheck, ShieldX, CheckCircle2, XCircle, Clock, BarChart2 } from "lucide-react";
import { AutomationData } from "@/services/azureService";
import { getCertificateExpiryStatus } from "@/utils/mindmapTransform";

interface AccountSummaryProps {
    data: AutomationData;
    loading: boolean;
    onRefresh: () => void;
    onNavigateToRunbook: (runbookId: string) => void;
}

function formatExpiryDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function AccountSummary({ data, loading, onRefresh, onNavigateToRunbook }: AccountSummaryProps) {
    // ── Per-runbook job stats ─────────────────────────────────────────────────
    const runbookStats = data.runbooks.map((rb) => {
        const allJobs = data.jobs
            .filter((j) => j.properties.runbook.name.toLowerCase() === rb.name.toLowerCase())
            .sort((a, b) => {
                const aTime = a.properties.startTime ?? a.properties.creationTime;
                const bTime = b.properties.startTime ?? b.properties.creationTime;
                return new Date(bTime).getTime() - new Date(aTime).getTime();
            });

        const last30 = allJobs.slice(0, 30);
        const successCount = last30.filter((j) => j.properties.status === "Completed" && !j.properties.exception).length;
        const failedCount = last30.filter((j) => j.properties.status === "Failed").length;
        const otherCount = last30.length - successCount - failedCount;
        const total = last30.length;

        const successPct = total > 0 ? (successCount / total) * 100 : 0;
        const failedPct = total > 0 ? (failedCount / total) * 100 : 0;
        const otherPct = total > 0 ? (otherCount / total) * 100 : 0;

        // conic-gradient degree values
        const successDeg = (successPct / 100) * 360;
        const failedDeg = (failedPct / 100) * 360;

        const gradient =
            total === 0
                ? "conic-gradient(#e2e8f0 0deg 360deg)"
                : `conic-gradient(#22c55e 0deg ${successDeg}deg, #ef4444 ${successDeg}deg ${successDeg + failedDeg}deg, #94a3b8 ${successDeg + failedDeg}deg 360deg)`;

        const displayPct = total > 0 ? Math.round(successPct) : null;

        return { rb, successCount, failedCount, otherCount, total, gradient, displayPct };
    });

    // ── Certificate expiry data ───────────────────────────────────────────────
    const certData = data.certificates.map((cert) => {
        const expiryStatus = getCertificateExpiryStatus(cert.properties?.expiryTime);
        return { cert, expiryStatus };
    });

    const expiredCerts = certData.filter((c) => c.expiryStatus.status === "expired");
    const warningCerts = certData.filter((c) => c.expiryStatus.status === "warning");
    const allHealthy = expiredCerts.length === 0 && warningCerts.length === 0;

    // ── Summary counts ────────────────────────────────────────────────────────
    const totalRunbooks = data.runbooks.length;
    const totalRuns = runbookStats.reduce((s, r) => s + r.total, 0);
    const totalSuccess = runbookStats.reduce((s, r) => s + r.successCount, 0);
    const totalFailed = runbookStats.reduce((s, r) => s + r.failedCount, 0);
    const overallPct = totalRuns > 0 ? Math.round((totalSuccess / totalRuns) * 100) : null;

    return (
        <div className="flex flex-col h-full overflow-hidden bg-slate-50">
            {/* Header bar */}
            <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 shrink-0">
                <div className="flex items-center gap-3">
                    <BarChart2 className="w-5 h-5 text-indigo-500" />
                    <h2 className="text-base font-bold text-slate-800">Account Summary</h2>
                    <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        {totalRunbooks} runbook{totalRunbooks !== 1 ? "s" : ""}
                    </span>
                    {overallPct !== null && (
                        <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{
                                background: overallPct >= 80 ? "#dcfce7" : overallPct >= 50 ? "#fef9c3" : "#fee2e2",
                                color: overallPct >= 80 ? "#15803d" : overallPct >= 50 ? "#a16207" : "#b91c1c",
                            }}
                        >
                            {overallPct}% overall success (last 30 runs each)
                        </span>
                    )}
                </div>
                <button
                    onClick={onRefresh}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    title="Refresh all data"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                    {loading ? "Refreshing…" : "Refresh"}
                </button>
            </div>

            {/* Body: two-column layout */}
            <div className="flex flex-1 overflow-hidden">
                {/* ── Main: Runbook Donut Grid ─────────────────────────────── */}
                <div className="flex-1 overflow-y-auto p-6">
                    {totalRunbooks === 0 ? (
                        <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                            No runbooks found in this Automation Account.
                        </div>
                    ) : (
                        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
                            {runbookStats.map(({ rb, successCount, failedCount, otherCount, total, gradient, displayPct }) => (
                                <button
                                    key={rb.id}
                                    onClick={() => onNavigateToRunbook(rb.id)}
                                    className="group flex flex-col items-center gap-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-indigo-300 hover:ring-2 hover:ring-indigo-100 transition-all text-left cursor-pointer"
                                    title={`View ${rb.name} dependency map`}
                                >
                                    {/* Donut */}
                                    <div className="relative flex items-center justify-center" style={{ width: 80, height: 80 }}>
                                        {/* Outer donut ring */}
                                        <div
                                            className="rounded-full"
                                            style={{
                                                width: 80,
                                                height: 80,
                                                background: gradient,
                                                position: "absolute",
                                                inset: 0,
                                            }}
                                        />
                                        {/* Inner white hole */}
                                        <div
                                            className="rounded-full bg-white flex items-center justify-center z-10"
                                            style={{ width: 54, height: 54 }}
                                        >
                                            {displayPct !== null ? (
                                                <span
                                                    className="text-sm font-bold leading-none"
                                                    style={{
                                                        color:
                                                            displayPct >= 80
                                                                ? "#16a34a"
                                                                : displayPct >= 50
                                                                ? "#d97706"
                                                                : "#dc2626",
                                                    }}
                                                >
                                                    {displayPct}%
                                                </span>
                                            ) : (
                                                <span className="text-xs text-slate-400 font-medium">—</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Runbook name */}
                                    <p
                                        className="text-xs font-semibold text-slate-700 text-center leading-tight group-hover:text-indigo-700 transition-colors w-full"
                                        style={{
                                            display: "-webkit-box",
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: "vertical",
                                            overflow: "hidden",
                                        }}
                                        title={rb.name}
                                    >
                                        {rb.name}
                                    </p>

                                    {/* Stats row */}
                                    {total > 0 ? (
                                        <div className="flex items-center justify-center gap-2 flex-wrap">
                                            <span className="flex items-center gap-0.5 text-xs font-semibold text-emerald-600">
                                                <CheckCircle2 className="w-3 h-3" />
                                                {successCount}
                                            </span>
                                            <span className="flex items-center gap-0.5 text-xs font-semibold text-red-500">
                                                <XCircle className="w-3 h-3" />
                                                {failedCount}
                                            </span>
                                            {otherCount > 0 && (
                                                <span className="flex items-center gap-0.5 text-xs font-medium text-slate-400">
                                                    <Clock className="w-3 h-3" />
                                                    {otherCount}
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-slate-400">No runs</span>
                                    )}

                                    {/* Run count label */}
                                    <span className="text-[10px] text-slate-400 font-medium">
                                        {total > 0 ? `${total} run${total !== 1 ? "s" : ""}` : "No data"}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Overall stats bar */}
                    {totalRuns > 0 && (
                        <div className="mt-6 grid grid-cols-3 gap-4">
                            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-center">
                                <p className="text-2xl font-bold text-emerald-600">{totalSuccess}</p>
                                <p className="text-xs text-slate-500 font-medium mt-1">Total Successful Runs</p>
                            </div>
                            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-center">
                                <p className="text-2xl font-bold text-red-500">{totalFailed}</p>
                                <p className="text-xs text-slate-500 font-medium mt-1">Total Failed Runs</p>
                            </div>
                            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-center">
                                <p className="text-2xl font-bold text-slate-700">{totalRuns}</p>
                                <p className="text-xs text-slate-500 font-medium mt-1">Total Runs (last 30 each)</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Sidebar: Certificate Expiry ──────────────────────────── */}
                <div className="w-72 shrink-0 border-l border-slate-200 overflow-y-auto bg-white p-4 flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-slate-600" />
                        <h3 className="text-sm font-bold text-slate-700">Certificate Status</h3>
                    </div>

                    {allHealthy ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
                            <ShieldCheck className="w-8 h-8 text-emerald-500" />
                            <p className="text-sm font-semibold text-emerald-700">All certificates are healthy</p>
                            <p className="text-xs text-slate-400">
                                {data.certificates.length} certificate{data.certificates.length !== 1 ? "s" : ""} — none expiring within 30 days
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Expired */}
                            {expiredCerts.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <ShieldX className="w-3.5 h-3.5 text-red-600" />
                                        <span className="text-xs font-bold text-red-700 uppercase tracking-wide">
                                            Expired ({expiredCerts.length})
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        {expiredCerts.map(({ cert, expiryStatus }) => (
                                            <div
                                                key={cert.id}
                                                className="rounded-lg border p-3"
                                                style={{ background: "#fff1f2", borderColor: "#fecaca" }}
                                            >
                                                <p className="text-xs font-semibold text-slate-800 truncate" title={cert.name}>
                                                    {cert.name}
                                                </p>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    {formatExpiryDate(cert.properties?.expiryTime)}
                                                </p>
                                                <span
                                                    className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
                                                    style={{ background: "#dc2626", color: "#fff" }}
                                                >
                                                    {Math.abs(expiryStatus.daysUntilExpiry)}d ago
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Expiring within 30 days */}
                            {warningCerts.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                                        <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">
                                            Expiring Soon ({warningCerts.length})
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        {warningCerts
                                            .sort((a, b) => a.expiryStatus.daysUntilExpiry - b.expiryStatus.daysUntilExpiry)
                                            .map(({ cert, expiryStatus }) => (
                                                <div
                                                    key={cert.id}
                                                    className="rounded-lg border p-3"
                                                    style={{ background: "#fffbeb", borderColor: "#fde68a" }}
                                                >
                                                    <p className="text-xs font-semibold text-slate-800 truncate" title={cert.name}>
                                                        {cert.name}
                                                    </p>
                                                    <p className="text-xs text-slate-500 mt-0.5">
                                                        {formatExpiryDate(cert.properties?.expiryTime)}
                                                    </p>
                                                    <span
                                                        className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
                                                        style={{ background: "#f59e0b", color: "#fff" }}
                                                    >
                                                        {expiryStatus.daysUntilExpiry}d left
                                                    </span>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* All certs list (healthy ones shown as minimal rows) */}
                    {data.certificates.length > 0 && !allHealthy && (
                        <div>
                            <div className="flex items-center gap-1.5 mb-2">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">
                                    Healthy ({data.certificates.length - expiredCerts.length - warningCerts.length})
                                </span>
                            </div>
                            <div className="flex flex-col gap-1">
                                {certData
                                    .filter((c) => c.expiryStatus.status === "ok")
                                    .map(({ cert, expiryStatus }) => (
                                        <div
                                            key={cert.id}
                                            className="flex items-center justify-between rounded-lg px-3 py-2 bg-slate-50 border border-slate-100"
                                        >
                                            <p className="text-xs text-slate-600 truncate flex-1 pr-2" title={cert.name}>
                                                {cert.name}
                                            </p>
                                            <span className="text-[10px] text-slate-400 shrink-0">
                                                {expiryStatus.daysUntilExpiry < 999
                                                    ? `${expiryStatus.daysUntilExpiry}d`
                                                    : "—"}
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    )}

                    {data.certificates.length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-4">
                            No certificates configured in this Automation Account.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
