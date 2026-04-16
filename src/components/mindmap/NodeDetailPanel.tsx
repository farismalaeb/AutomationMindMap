"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { X, Clock, BookOpen, Database, Key, Link2, Shield, Server, Cpu, GitBranch, ShieldCheck, BarChart3, Play, ExternalLink, AlertCircle, Code, ChevronDown, ChevronUp, Copy, Check, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Timer, Activity, PieChart, Zap, RefreshCw, FileText, Loader2, GripHorizontal } from "lucide-react";
import { AutomationData, AutomationSchedule, AutomationJob, parseIdentityStatus, JobOutput, JobStream } from "@/services/azureService";
import { JOB_STATUS_VISUAL, getWorkerStatus } from "@/utils/mindmapTransform";
import { JobHistoryChart } from "./JobHistoryChart";
import { ScheduleHealthCard, SchedulesSummaryCard } from "./ScheduleHealth";

export type PanelNodeType =
    | "account" | "runbook" | "variable" | "credential"
    | "connection" | "certificate" | "schedule"
    | "hybridWorkerGroup" | "hybridWorker"
    | "sourceControl"
    | "keyVault" | "kvSecret" | "kvKey" | "kvCertificate"
    | "category" | null;

export interface SelectedNodeInfo {
    nodeType:   PanelNodeType;
    resourceId: string;
    name:       string;
}

interface NodeDetailPanelProps {
    selected: SelectedNodeInfo | null;
    data:     AutomationData;
    onClose:  () => void;
    onRefreshRunbook?: (runbookName: string) => Promise<void>;
    onFetchJobStreams?: (jobId: string) => Promise<JobOutput>;
}

function formatDate(iso: string | null | undefined): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

function formatDuration(startIso: string | null, endIso: string | null): string {
    if (!startIso || !endIso) return "—";
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (ms < 0) return "—";
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

// ── Certificate Expiry Helpers ────────────────────────────────────────────────
interface CertExpiryInfo {
    daysUntilExpiry: number;
    label: string;
    color: string;
    bgColor: string;
    isExpired: boolean;
    isWarning: boolean;
    isCritical: boolean;
}

function getCertificateExpiryInfo(expiryTime: string | null | undefined): CertExpiryInfo | null {
    if (!expiryTime) return null;
    const expiry = new Date(expiryTime);
    const now = new Date();
    const diffMs = expiry.getTime() - now.getTime();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (days < 0) {
        return { daysUntilExpiry: days, label: `Expired ${Math.abs(days)}d ago`, color: "#dc2626", bgColor: "#fee2e2", isExpired: true, isWarning: false, isCritical: true };
    } else if (days === 0) {
        return { daysUntilExpiry: 0, label: "Expires today!", color: "#dc2626", bgColor: "#fee2e2", isExpired: false, isWarning: false, isCritical: true };
    } else if (days <= 7) {
        return { daysUntilExpiry: days, label: `${days}d until expiry`, color: "#dc2626", bgColor: "#fee2e2", isExpired: false, isWarning: false, isCritical: true };
    } else if (days <= 30) {
        return { daysUntilExpiry: days, label: `${days}d until expiry`, color: "#f59e0b", bgColor: "#fef3c7", isExpired: false, isWarning: true, isCritical: false };
    } else if (days <= 90) {
        return { daysUntilExpiry: days, label: `${days}d until expiry`, color: "#16a34a", bgColor: "#dcfce7", isExpired: false, isWarning: false, isCritical: false };
    } else {
        return { daysUntilExpiry: days, label: `${days}d until expiry`, color: "#16a34a", bgColor: "#dcfce7", isExpired: false, isWarning: false, isCritical: false };
    }
}

// ── Azure Portal Deep Links ───────────────────────────────────────────────────
function getAzurePortalUrl(resourceId: string): string {
    // ARM resource ID format: /subscriptions/{sub}/resourceGroups/{rg}/providers/...
    return `https://portal.azure.com/#@/resource${resourceId}`;
}

function getRunbookPortalUrl(accountId: string, runbookName: string): string {
    return `https://portal.azure.com/#@/resource${accountId}/runbooks/${encodeURIComponent(runbookName)}/overview`;
}

function getRunbookStartUrl(accountId: string, runbookName: string): string {
    return `https://portal.azure.com/#@/resource${accountId}/runbooks/${encodeURIComponent(runbookName)}/start`;
}

function AzurePortalLink({ resourceId, label = "Open in Azure Portal" }: { resourceId: string; label?: string }) {
    return (
        <a
            href={getAzurePortalUrl(resourceId)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-colors mt-3"
            style={{ background: "#0078d4", color: "#ffffff" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#106ebe")}
            onMouseLeave={e => (e.currentTarget.style.background = "#0078d4")}
        >
            <ExternalLink className="w-3.5 h-3.5" />
            {label}
        </a>
    );
}

function Row({ label, value, mono = false, badge, link }: {
    label:  string;
    value?: React.ReactNode;
    mono?:  boolean;
    link?:  string;
    badge?: { text: string; color: string };
}) {
    return (
        <div className="flex flex-col gap-0.5 py-2 border-b border-slate-100 last:border-0">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
            {badge ? (
                <span
                    className="inline-block self-start text-xs font-bold px-2 py-0.5 rounded-full mt-0.5"
                    style={{ background: badge.color + "20", color: badge.color, border: `1px solid ${badge.color}40` }}
                >
                    {badge.text}
                </span>
            ) : link ? (
                <a href={link} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-cyan-600 break-all hover:underline">{value}</a>
            ) : (
                <span className={`text-sm text-slate-700 break-words ${mono ? "font-mono text-xs bg-slate-50 px-2 py-1 rounded" : ""}`}>
                    {value ?? "—"}
                </span>
            )}
        </div>
    );
}

function SectionHeader({ icon, title, color }: { icon: React.ReactNode; title: string; color: string }) {
    return (
        <div className="flex items-center gap-2 mb-3 pb-2 border-b-2" style={{ borderColor: color }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: color }}>
                {icon}
            </div>
            <span className="font-bold text-slate-800 text-sm break-words">{title}</span>
        </div>
    );
}

// ── Account detail ─────────────────────────────────────────────────────────────
function AccountDetail({ data }: { data: AutomationData }) {
    const a          = data.account;
    const hwGroups   = data.hybridWorkerGroups ?? [];
    const scCount    = data.sourceControls?.length ?? 0;
    const identity   = parseIdentityStatus(a);

    // Color the identity card based on status
    const idCardColor = identity.hasSystem || identity.hasUser ? "#4f46e5" : "#94a3b8";

    // Extract user-assigned identity display names from their ARM resource IDs
    // Format: /subscriptions/.../providers/Microsoft.ManagedIdentity/userAssignedIdentities/{name}
    const userIdentityEntries = Object.entries(a.identity?.userAssignedIdentities ?? {});
    const userIdentityNames = userIdentityEntries.map(([resourceId]) => {
        const parts = resourceId.split("/");
        return parts[parts.length - 1] || resourceId;
    });

    return (
        <>
            <SectionHeader icon={<Server className="w-4 h-4 text-white" />} title={a.name} color="#4f46e5" />

            {/* ── Managed Identity Card ─────────────────────────────────────── */}
            <div className="rounded-lg px-3 py-3 mb-3 border" style={{ background: idCardColor + "08", borderColor: idCardColor + "30" }}>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Managed Identity</p>

                {/* Overall status badge row */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {/* System-Assigned badge */}
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{
                            background: identity.hasSystem ? "#4f46e520" : "#f1f5f9",
                            color:      identity.hasSystem ? "#4f46e5"   : "#94a3b8",
                            border:     `1px solid ${identity.hasSystem ? "#4f46e540" : "#cbd5e1"}`,
                        }}>
                        {identity.hasSystem ? "✓ System Assigned" : "✗ System Assigned"}
                    </span>

                    {/* User-Assigned badge */}
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{
                            background: identity.hasUser ? "#0891b220" : "#f1f5f9",
                            color:      identity.hasUser ? "#0891b2"   : "#94a3b8",
                            border:     `1px solid ${identity.hasUser ? "#0891b240" : "#cbd5e1"}`,
                        }}>
                        {identity.hasUser ? `✓ User Assigned (${identity.userCount})` : "✗ User Assigned"}
                    </span>
                </div>

                {/* System-Assigned principal ID */}
                {identity.hasSystem && a.identity?.principalId && (
                    <div className="flex flex-col gap-0.5 mt-2">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">System Principal ID</span>
                        <span className="text-xs font-mono bg-indigo-50 text-indigo-700 px-2 py-1 rounded break-all">
                            {a.identity.principalId}
                        </span>
                    </div>
                )}

                {/* Tenant ID (shown when System-Assigned exists) */}
                {identity.hasSystem && a.identity?.tenantId && (
                    <div className="flex flex-col gap-0.5 mt-2">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Tenant ID</span>
                        <span className="text-xs font-mono bg-slate-50 text-slate-600 px-2 py-1 rounded break-all">
                            {a.identity.tenantId}
                        </span>
                    </div>
                )}

                {/* User-Assigned identity names */}
                {identity.hasUser && userIdentityNames.length > 0 && (
                    <div className="flex flex-col gap-1 mt-2">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">User Identities</span>
                        {userIdentityNames.map((name, i) => (
                            <div key={i} className="flex items-center gap-1.5 text-xs bg-cyan-50 rounded px-2 py-1 border border-cyan-100">
                                <span className="text-cyan-600">🪪</span>
                                <span className="font-medium text-cyan-800 break-all">{name}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Neither enabled */}
                {!identity.hasSystem && !identity.hasUser && (
                    <p className="text-xs text-slate-400 mt-1">
                        No managed identity is configured on this Automation Account.
                    </p>
                )}
            </div>

            {/* ── Account properties ────────────────────────────────────────── */}
            <Row label="Location"        value={a.location} />
            <Row label="SKU"             value={a.properties?.sku?.name} />
            <Row label="State"           value={a.properties?.state} />
            <Row label="Runbooks"        value={data.runbooks?.length ?? 0} />
            <Row label="Schedules"       value={data.schedules?.length ?? 0} />
            <Row label="Variables"       value={data.variables?.length ?? 0} />
            <Row label="Credentials"     value={data.credentials?.length ?? 0} />
            <Row label="Connections"     value={data.connections?.length ?? 0} />
            <Row label="Certificates"    value={data.certificates?.length ?? 0} />
            <Row label="HW Groups"       value={hwGroups.length} />
            <Row label="HW Workers"      value={hwGroups.reduce((sum, g) => sum + g.workers.length, 0)} />
            <Row label="Source Controls" value={scCount} />
            <Row label="Resource ID"     value={a.id} mono />

            {/* ── Job Execution History ─────────────────────────────────────── */}
            {(data.jobs?.length ?? 0) > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-200">
                    <div className="flex items-center gap-2 mb-3">
                        <BarChart3 className="w-4 h-4 text-indigo-600" />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Job History (7 Days)</span>
                    </div>
                    <JobHistoryChart jobs={data.jobs} days={7} />
                </div>
            )}

            {/* ── Schedule Health Summary ───────────────────────────────────── */}
            {(data.schedules?.length ?? 0) > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-200">
                    <div className="flex items-center gap-2 mb-3">
                        <Clock className="w-4 h-4 text-orange-600" />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Schedule Health</span>
                    </div>
                    <SchedulesSummaryCard 
                        schedules={data.schedules} 
                        jobs={data.jobs ?? []} 
                        jobSchedules={data.jobSchedules ?? []} 
                    />
                </div>
            )}

            <AzurePortalLink resourceId={a.id} />
        </>
    );
}

// ── Source Control detail ──────────────────────────────────────────────────────
function SourceControlDetail({ scId, data }: { scId: string; data: AutomationData }) {
    const sc = (data.sourceControls ?? []).find(s => s.id === scId);
    if (!sc) return <p className="text-sm text-slate-400">Source control not found.</p>;
    const p = sc.properties;

    const sourceTypeLabel: Record<string, string> = { GitHub: "GitHub", VsoGit: "Azure DevOps (Git)", VsoTfvc: "Azure DevOps (TFVC)" };
    const sourceTypeColor: Record<string, string> = { GitHub: "#1f2937", VsoGit: "#0078d4", VsoTfvc: "#0078d4" };

    return (
        <>
            <SectionHeader icon={<GitBranch className="w-4 h-4 text-white" />} title={sc.name} color="#0891b2" />
            <div className="flex flex-wrap gap-2 mb-3">
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: (sourceTypeColor[p.sourceType] ?? "#6b7280") + "15", color: sourceTypeColor[p.sourceType] ?? "#6b7280", border: `1px solid ${sourceTypeColor[p.sourceType] ?? "#6b7280"}30` }}>
                    {sourceTypeLabel[p.sourceType] ?? p.sourceType}
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: p.autoSync ? "#0891b220" : "#94a3b820", color: p.autoSync ? "#0891b2" : "#94a3b8", border: `1px solid ${p.autoSync ? "#0891b240" : "#94a3b840"}` }}>
                    {p.autoSync ? "Auto-Sync On" : "Manual Sync"}
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: p.publishRunbook ? "#16a34a20" : "#94a3b820", color: p.publishRunbook ? "#16a34a" : "#94a3b8", border: `1px solid ${p.publishRunbook ? "#16a34a40" : "#94a3b840"}` }}>
                    {p.publishRunbook ? "Auto-Publish On" : "Manual Publish"}
                </span>
            </div>
            <Row label="Repository URL" value={p.repoUrl} link={p.repoUrl} />
            {p.branch && <Row label="Branch" value={p.branch} mono />}
            {p.folderPath && <Row label="Folder Path" value={p.folderPath} mono />}
            <Row label="Description"   value={p.description || "No description"} />
            <Row label="Last Modified" value={formatDate(p.lastModifiedTime)} />
            <Row label="Created"       value={formatDate(p.creationTime)} />
            <div className="mt-3 text-xs text-slate-400 bg-slate-50 rounded px-3 py-2 border border-slate-100">
                🔒 Security tokens (PAT / OAuth) are stored encrypted and are not readable via the ARM API.
            </div>
            
            <AzurePortalLink resourceId={sc.id} />
        </>
    );
}

// ── Runbook Job History with 7/30 day toggle ──────────────────────────────────
function RunbookJobHistorySection({ runbookName, jobs }: { runbookName: string; jobs: AutomationJob[] }) {
    const [days, setDays] = useState<7 | 30>(7);

    return (
        <div className="mt-4 pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Job History</span>
                </div>
                <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                    <button
                        onClick={() => setDays(7)}
                        className="text-xs font-medium px-2 py-0.5 rounded-md transition-colors"
                        style={{
                            background: days === 7 ? "#ffffff" : "transparent",
                            color: days === 7 ? "#1e293b" : "#64748b",
                            boxShadow: days === 7 ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
                        }}
                    >
                        7d
                    </button>
                    <button
                        onClick={() => setDays(30)}
                        className="text-xs font-medium px-2 py-0.5 rounded-md transition-colors"
                        style={{
                            background: days === 30 ? "#ffffff" : "transparent",
                            color: days === 30 ? "#1e293b" : "#64748b",
                            boxShadow: days === 30 ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
                        }}
                    >
                        30d
                    </button>
                </div>
            </div>
            <JobHistoryChart jobs={jobs} runbookName={runbookName} days={days} />
        </div>
    );
}

// ── Runbook Charts Component ───────────────────────────────────────────────────
function RunbookCharts({ jobs, runbookName, jobStreamErrorCounts = {} }: { jobs: AutomationJob[]; runbookName: string; jobStreamErrorCounts?: Record<string, number> }) {
    const runbookJobs = jobs.filter(j => j.properties.runbook.name.toLowerCase() === runbookName.toLowerCase());
    const last30Jobs = runbookJobs.slice(0, 30);
    
    // Separate "completed clean" from "completed with errors"
    const completedClean = last30Jobs.filter(j => j.properties.status === "Completed" && !j.properties.exception && !jobStreamErrorCounts[j.properties.jobId]).length;
    const completedWithErrors = last30Jobs.filter(j => j.properties.status === "Completed" && (j.properties.exception || jobStreamErrorCounts[j.properties.jobId])).length;
    const successCount = completedClean; // Only truly clean completions
    const failedCount = last30Jobs.filter(j => j.properties.status === "Failed").length;
    const runningCount = last30Jobs.filter(j => ["Running", "Activating", "Resuming"].includes(j.properties.status)).length;
    const otherCount = last30Jobs.length - completedClean - completedWithErrors - failedCount - runningCount;
    
    const totalRuns = last30Jobs.length;
    const totalIssues = failedCount + completedWithErrors;
    const successRate = totalRuns > 0 ? Math.round((successCount / totalRuns) * 100) : 0;
    const issueRate = totalRuns > 0 ? Math.round((totalIssues / totalRuns) * 100) : 0;
    
    // Calculate average duration for completed jobs
    const completedJobs = last30Jobs.filter(j => j.properties.startTime && j.properties.endTime);
    const avgDurationMs = completedJobs.length > 0 
        ? completedJobs.reduce((sum, j) => sum + (new Date(j.properties.endTime!).getTime() - new Date(j.properties.startTime!).getTime()), 0) / completedJobs.length
        : 0;
    const avgDurationStr = avgDurationMs > 0 
        ? avgDurationMs < 60000 
            ? `${Math.round(avgDurationMs / 1000)}s`
            : avgDurationMs < 3600000
                ? `${Math.round(avgDurationMs / 60000)}m`
                : `${Math.round(avgDurationMs / 3600000)}h ${Math.round((avgDurationMs % 3600000) / 60000)}m`
        : "—";
    
    // Calculate last 7 days trend
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const last7DaysJobs = runbookJobs.filter(j => new Date(j.properties.startTime ?? j.properties.creationTime) >= sevenDaysAgo);
    const last7Success = last7DaysJobs.filter(j => j.properties.status === "Completed" && !j.properties.exception && !jobStreamErrorCounts[j.properties.jobId]).length;
    const last7Failed = last7DaysJobs.filter(j => j.properties.status === "Failed").length;
    const last7WithErrors = last7DaysJobs.filter(j => j.properties.status === "Completed" && (j.properties.exception || jobStreamErrorCounts[j.properties.jobId])).length;
    
    return (
        <div className="flex flex-col gap-3 h-full">
            <div className="flex items-center gap-2 mb-1">
                <PieChart className="w-4 h-4" style={{ color: "#6366f1" }} />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Analytics (Last 30 Runs)</span>
            </div>
            
            {totalRuns === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-sm text-slate-400">No job history available</p>
                </div>
            ) : (
                <>
                    {/* Success Rate Donut */}
                    <div className="rounded-lg p-3 border" style={{ background: "#f0fdf4", borderColor: "#bbf7d0" }}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center relative" 
                                    style={{ 
                                        background: `conic-gradient(#16a34a ${successRate * 3.6}deg, #e5e7eb ${successRate * 3.6}deg)` 
                                    }}>
                                    <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
                                        <TrendingUp className="w-3 h-3" style={{ color: "#16a34a" }} />
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-slate-500">Success Rate</p>
                                    <p className="text-lg font-bold" style={{ color: "#16a34a" }}>{successRate}%</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-slate-400">{successCount} / {totalRuns}</p>
                                <p className="text-xs text-slate-400">clean runs</p>
                            </div>
                        </div>
                    </div>
                    
                    {/* Issue Rate (Failures + Completed with Errors) */}
                    <div className="rounded-lg p-3 border" style={{ background: "#fef2f2", borderColor: "#fecaca" }}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center relative"
                                    style={{ 
                                        background: `conic-gradient(#dc2626 ${issueRate * 3.6}deg, #e5e7eb ${issueRate * 3.6}deg)` 
                                    }}>
                                    <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
                                        <TrendingDown className="w-3 h-3" style={{ color: "#dc2626" }} />
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-slate-500">Issue Rate</p>
                                    <p className="text-lg font-bold" style={{ color: "#dc2626" }}>{issueRate}%</p>
                                </div>
                            </div>
                            <div className="text-right text-xs text-slate-400">
                                <p>{failedCount} failed</p>
                                <p>{completedWithErrors} w/errors</p>
                            </div>
                        </div>
                    </div>
                    
                    {/* Average Duration */}
                    <div className="rounded-lg p-3 border" style={{ background: "#eff6ff", borderColor: "#bfdbfe" }}>
                        <div className="flex items-center gap-2">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#dbeafe" }}>
                                <Timer className="w-4 h-4" style={{ color: "#2563eb" }} />
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-slate-500">Avg Duration</p>
                                <p className="text-lg font-bold" style={{ color: "#2563eb" }}>{avgDurationStr}</p>
                            </div>
                        </div>
                    </div>
                    
                    {/* Last 7 Days Summary */}
                    <div className="rounded-lg p-3 border" style={{ background: "#faf5ff", borderColor: "#e9d5ff" }}>
                        <div className="flex items-center gap-2 mb-2">
                            <Activity className="w-4 h-4" style={{ color: "#7c3aed" }} />
                            <p className="text-xs font-semibold text-slate-500">Last 7 Days</p>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{ background: "#16a34a" }} />
                                <span className="text-xs font-medium text-slate-600">{last7Success} clean</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{ background: "#dc2626" }} />
                                <span className="text-xs font-medium text-slate-600">{last7Failed} failed</span>
                            </div>
                            {last7WithErrors > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full" style={{ background: "#f59e0b" }} />
                                    <span className="text-xs font-medium text-slate-600">{last7WithErrors} w/errors</span>
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{last7DaysJobs.length} total runs</p>
                    </div>
                    
                    {/* Status Distribution Bar */}
                    <div className="rounded-lg p-3 border" style={{ background: "#f8fafc", borderColor: "#e2e8f0" }}>
                        <p className="text-xs font-semibold text-slate-500 mb-2">Status Distribution</p>
                        <div className="flex h-3 rounded-full overflow-hidden" style={{ background: "#e5e7eb" }}>
                            {successCount > 0 && (
                                <div style={{ width: `${(successCount / totalRuns) * 100}%`, background: "#16a34a" }} title={`${successCount} Completed Clean`} />
                            )}
                            {completedWithErrors > 0 && (
                                <div style={{ width: `${(completedWithErrors / totalRuns) * 100}%`, background: "#f59e0b" }} title={`${completedWithErrors} Completed w/Errors`} />
                            )}
                            {failedCount > 0 && (
                                <div style={{ width: `${(failedCount / totalRuns) * 100}%`, background: "#dc2626" }} title={`${failedCount} Failed`} />
                            )}
                            {runningCount > 0 && (
                                <div style={{ width: `${(runningCount / totalRuns) * 100}%`, background: "#3b82f6" }} title={`${runningCount} Running`} />
                            )}
                            {otherCount > 0 && (
                                <div style={{ width: `${(otherCount / totalRuns) * 100}%`, background: "#94a3b8" }} title={`${otherCount} Other`} />
                            )}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-slate-500">
                            {successCount > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#16a34a" }} />Clean: {successCount}</span>}
                            {completedWithErrors > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#f59e0b" }} />w/Errors: {completedWithErrors}</span>}
                            {failedCount > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#dc2626" }} />Failed: {failedCount}</span>}
                            {runningCount > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#3b82f6" }} />Running: {runningCount}</span>}
                            {otherCount > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#94a3b8" }} />Other: {otherCount}</span>}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// ── Job Detail Modal ───────────────────────────────────────────────────────────
function JobDetailModal({ 
    job, 
    jobOutput, 
    loading, 
    onClose 
}: { 
    job: AutomationJob; 
    jobOutput: JobOutput | null; 
    loading: boolean;
    onClose: () => void;
}) {
    const jv = JOB_STATUS_VISUAL[job.properties.status] ?? JOB_STATUS_VISUAL["NeverRun"];
    const [activeTab, setActiveTab] = useState<string>("All Logs");
    
    const getStreamTypeColor = (type: string): string => {
        switch (type) {
            case "Output": return "#16a34a";
            case "Error": return "#dc2626";
            case "Warning": return "#f59e0b";
            case "Verbose": return "#6366f1";
            case "Debug": return "#0ea5e9";
            case "Progress": return "#8b5cf6";
            default: return "#64748b";
        }
    };
    
    // Count streams by type
    const streamCounts = useMemo(() => {
        if (!jobOutput?.streams) return { Output: 0, Error: 0, Warning: 0, Verbose: 0, other: 0 };
        const counts: Record<string, number> = { Output: 0, Error: 0, Warning: 0, Verbose: 0, other: 0 };
        jobOutput.streams.forEach(s => {
            const t = s.properties.streamType;
            if (t in counts) counts[t]++;
            else counts.other++;
        });
        return counts;
    }, [jobOutput]);
    
    const filteredStreams = useMemo(() => {
        if (!jobOutput?.streams) return [];
        if (activeTab === "All Logs") return jobOutput.streams;
        return jobOutput.streams.filter(s => s.properties.streamType === activeTab);
    }, [jobOutput, activeTab]);
    
    const hasErrors = streamCounts.Error > 0 || !!job.properties.exception;
    const hasWarnings = streamCounts.Warning > 0;
    
    return (
        <div 
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={onClose}
        >
            <div 
                className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: jv.dot + "20" }}>
                            <FileText className="w-5 h-5" style={{ color: jv.dot }} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-slate-800">Job Details</h3>
                                {hasErrors && (
                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold" 
                                        style={{ background: "#fee2e2", color: "#dc2626" }}>
                                        <AlertCircle className="w-3 h-3" />
                                        {streamCounts.Error + (job.properties.exception ? 1 : 0)} Error{streamCounts.Error + (job.properties.exception ? 1 : 0) !== 1 ? "s" : ""}
                                    </span>
                                )}
                                {hasWarnings && (
                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold" 
                                        style={{ background: "#fef3c7", color: "#d97706" }}>
                                        {streamCounts.Warning} Warning{streamCounts.Warning !== 1 ? "s" : ""}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                {(() => {
                                    const streamErrCount = jobOutput?.streams?.filter(s => s.properties.streamType === "Error").length ?? 0;
                                    const jobHasErrors   = streamErrCount > 0 || !!job.properties.exception;
                                    const effColor = (jobHasErrors && job.properties.status === "Completed") ? "#f59e0b" : jv.dot;
                                    const effLabel = (jobHasErrors && job.properties.status === "Completed") ? "Completed w/ Errors" : jv.label;
                                    return (
                                        <>
                                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: effColor, display: "inline-block" }} />
                                            <span className="font-semibold" style={{ color: effColor }}>{effLabel}</span>
                                        </>
                                    );
                                })()}
                                <span>•</span>
                                <span>{job.properties.startTime ? formatDate(job.properties.startTime) : "Not started"}</span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                {/* Job Info Bar */}
                <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-4 text-xs shrink-0">
                    <div>
                        <span className="text-slate-400 mr-1">Job ID:</span>
                        <span className="font-mono text-slate-600">{job.properties.jobId}</span>
                    </div>
                    <div>
                        <span className="text-slate-400 mr-1">Duration:</span>
                        <span className="font-medium text-slate-600">
                            {job.properties.startTime && job.properties.endTime 
                                ? formatDuration(job.properties.startTime, job.properties.endTime) 
                                : "—"}
                        </span>
                    </div>
                    <div>
                        <span className="text-slate-400 mr-1">Run On:</span>
                        <span className="font-medium" style={{ color: job.properties.runOn ? "#7c3aed" : "#0ea5e9" }}>
                            {job.properties.runOn ? `⚙ ${job.properties.runOn}` : "☁ Azure Cloud"}
                        </span>
                    </div>
                </div>
                
                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                    {loading ? (
                        <div className="flex items-center justify-center h-48">
                            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                            <span className="ml-3 text-slate-500">Loading job logs...</span>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Tabs - Azure Portal Style */}
                            <div className="flex items-center border-b border-slate-200 -mx-6 px-6">
                                {[
                                    { key: "Output", count: streamCounts.Output, color: "#16a34a" },
                                    { key: "Error", count: streamCounts.Error + (job.properties.exception ? 1 : 0), color: "#dc2626" },
                                    { key: "Warning", count: streamCounts.Warning, color: "#f59e0b" },
                                    { key: "All Logs", count: jobOutput?.streams.length ?? 0, color: "#6366f1" },
                                    ...(job.properties.exception ? [{ key: "Exception", count: 1, color: "#991b1b" }] : []),
                                ].map(tab => (
                                    <button
                                        key={tab.key}
                                        onClick={() => setActiveTab(tab.key)}
                                        className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                                            activeTab === tab.key 
                                                ? "border-current" 
                                                : "border-transparent text-slate-500 hover:text-slate-700"
                                        }`}
                                        style={{ 
                                            color: activeTab === tab.key ? tab.color : undefined,
                                            borderColor: activeTab === tab.key ? tab.color : "transparent"
                                        }}
                                    >
                                        <span className="flex items-center gap-2">
                                            {tab.key}
                                            {tab.count > 0 && (
                                                <span 
                                                    className="px-1.5 py-0.5 rounded-full text-xs font-bold"
                                                    style={{ 
                                                        background: tab.color + "20",
                                                        color: tab.color
                                                    }}
                                                >
                                                    {tab.count}
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            
                            {/* Exception Tab */}
                            {activeTab === "Exception" && job.properties.exception && (
                                <div className="rounded-lg p-4 border-2" style={{ background: "#fef2f2", borderColor: "#fecaca" }}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <AlertCircle className="w-4 h-4" style={{ color: "#dc2626" }} />
                                        <span className="text-sm font-bold" style={{ color: "#991b1b" }}>Exception</span>
                                    </div>
                                    <pre className="text-xs font-mono whitespace-pre-wrap" style={{ color: "#991b1b" }}>
                                        {job.properties.exception}
                                    </pre>
                                </div>
                            )}
                            
                            {/* Job Streams (filtered by tab) */}
                            {activeTab !== "Exception" && filteredStreams.length > 0 && (
                                <div className="space-y-2 max-h-80 overflow-auto">
                                    {filteredStreams.map((stream, i) => (
                                        <div 
                                            key={i} 
                                            className="rounded-lg px-3 py-2 border text-xs"
                                            style={{ 
                                                background: getStreamTypeColor(stream.properties.streamType) + "08",
                                                borderColor: getStreamTypeColor(stream.properties.streamType) + "30"
                                            }}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span 
                                                    className="font-bold px-1.5 py-0.5 rounded"
                                                    style={{ 
                                                        background: getStreamTypeColor(stream.properties.streamType) + "20",
                                                        color: getStreamTypeColor(stream.properties.streamType)
                                                    }}
                                                >
                                                    {stream.properties.streamType}
                                                </span>
                                                <span className="text-slate-400">{formatDate(stream.properties.time)}</span>
                                            </div>
                                            {stream.properties.streamText && (
                                                <pre className="font-mono whitespace-pre-wrap text-slate-700 mt-1">
                                                    {stream.properties.streamText}
                                                </pre>
                                            )}
                                            {!stream.properties.streamText && stream.properties.summary && (
                                                <p className="text-slate-600">{stream.properties.summary}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            {/* Empty state for tabs */}
                            {activeTab !== "Exception" && filteredStreams.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-32 text-slate-400">
                                    <FileText className="w-8 h-8 mb-2 opacity-50" />
                                    <p className="text-sm">No {activeTab === "All Logs" ? "logs" : activeTab.toLowerCase() + " records"}</p>
                                </div>
                            )}
                            
                            {/* Job Output (show at bottom if exists) */}
                            {jobOutput && jobOutput.output && activeTab === "Output" && (
                                <div>
                                    <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                        <Code className="w-4 h-4 text-green-600" />
                                        Return Output
                                    </h4>
                                    <pre 
                                        className="text-xs overflow-auto rounded-lg p-4 max-h-60"
                                        style={{ 
                                            background: "#1e293b", 
                                            color: "#e2e8f0", 
                                            fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
                                            lineHeight: 1.5,
                                        }}
                                    >
                                        <code>{jobOutput.output}</code>
                                    </pre>
                                </div>
                            )}
                            
                            {/* No logs available */}
                            {(!jobOutput || (jobOutput.streams.length === 0 && !jobOutput.output)) && !job.properties.exception && (
                                <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                                    <FileText className="w-12 h-12 mb-3 opacity-50" />
                                    <p>No logs available for this job</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Runbook detail (3-column layout) ───────────────────────────────────────────
function RunbookDetail({ id, data, onRefreshRunbook, onFetchJobStreams }: { 
    id: string; 
    data: AutomationData;
    onRefreshRunbook?: (runbookName: string) => Promise<void>;
    onFetchJobStreams?: (jobId: string) => Promise<JobOutput>;
}) {
    const [copied, setCopied] = useState(false);
    const [visibleCount, setVisibleCount] = useState(10);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedJob, setSelectedJob] = useState<AutomationJob | null>(null);
    const [jobOutput, setJobOutput] = useState<JobOutput | null>(null);
    const [loadingJobOutput, setLoadingJobOutput] = useState(false);
    const [jobStreamErrorCounts, setJobStreamErrorCounts] = useState<Record<string, number>>({});
    const LOAD_MORE_STEP = 10;

    // Merge preloaded error flags (from initial full-load) with individually-clicked job error counts.
    // Preloaded values show "1" (at least one error); clicking a job shows the exact count.
    const mergedErrorCounts = useMemo(() => {
        const merged: Record<string, number> = {};
        Object.entries(data.jobStreamErrors ?? {}).forEach(([jobId, hasErr]) => {
            if (hasErr) merged[jobId] = 1;
        });
        Object.entries(jobStreamErrorCounts).forEach(([jobId, count]) => {
            merged[jobId] = count;
        });
        return merged;
    }, [data.jobStreamErrors, jobStreamErrorCounts]);

    // Auto-refresh when switching to a runbook that has no jobs loaded yet,
    // and reset locally-cached error counts + visible count whenever the selected runbook changes.
    useEffect(() => {
        setJobStreamErrorCounts({});
        setVisibleCount(10);
        const currentRb = data.runbooks.find(r => r.id === id);
        if (onRefreshRunbook && currentRb) {
            const currentJobs = (data.jobs ?? []).filter(
                j => j.properties.runbook.name.toLowerCase() === currentRb.name.toLowerCase()
            );
            if (currentJobs.length === 0) {
                onRefreshRunbook(currentRb.name).catch(() => {});
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);
    
    const rb = data.runbooks.find(r => r.id === id);
    if (!rb) return <p className="text-sm text-slate-400">Runbook not found.</p>;
    const p = rb.properties;
    const stateColor = p.state === "Published" ? "#16a34a" : "#f59e0b";
    const typeColor  = p.runbookType?.includes("Python") ? "#3b82f6" : "#6366f1";

    const lastRun = data.lastRunByRunbook?.[rb.name];
    const visual  = lastRun ? JOB_STATUS_VISUAL[lastRun.status] ?? JOB_STATUS_VISUAL["NeverRun"] : JOB_STATUS_VISUAL["NeverRun"];

    // All jobs for this runbook, sorted newest-first
    const allJobs: AutomationJob[] = (data.jobs ?? [])
        .filter(j => j.properties.runbook.name.toLowerCase() === rb.name.toLowerCase())
        .sort((a, b) => new Date(b.properties.startTime ?? b.properties.creationTime).getTime() - new Date(a.properties.startTime ?? a.properties.creationTime).getTime());

    // Visible slice for load-more pattern
    const visibleJobs = allJobs.slice(0, visibleCount);
    const hasMore = visibleCount < allJobs.length;

    const linked = (data.jobSchedules ?? [])
        .filter(js => js.properties.runbook.name.toLowerCase() === rb.name.toLowerCase())
        .map(js => ({ schedule: (data.schedules ?? []).find(s => s.name === js.properties.schedule.name), runOn: js.properties.runOn }))
        .filter(x => x.schedule) as Array<{ schedule: AutomationSchedule; runOn: string | null }>;

    const handleRefresh = async () => {
        if (!onRefreshRunbook || refreshing) return;
        setRefreshing(true);
        try {
            await onRefreshRunbook(rb.name);
        } finally {
            setRefreshing(false);
        }
    };
    
    const handleJobClick = async (job: AutomationJob) => {
        setSelectedJob(job);
        setJobOutput(null);
        
        if (onFetchJobStreams) {
            setLoadingJobOutput(true);
            try {
                const output = await onFetchJobStreams(job.properties.jobId);
                setJobOutput(output);
                // Cache error stream count for this job
                if (output?.streams) {
                    const errorCount = output.streams.filter(s => s.properties.streamType === "Error").length;
                    if (errorCount > 0) {
                        setJobStreamErrorCounts(prev => ({ ...prev, [job.properties.jobId]: errorCount }));
                    }
                }
            } catch (e) {
                console.error("Failed to fetch job streams:", e);
            } finally {
                setLoadingJobOutput(false);
            }
        }
    };

    return (
        <>
            <div className="flex gap-4 h-full">
                {/* ═══════════════════════════════════════════════════════════════════
                    LEFT COLUMN: Basic Info, Dependencies, Actions
                ═══════════════════════════════════════════════════════════════════ */}
                <div className="w-72 shrink-0 flex flex-col overflow-y-auto pr-3 border-r border-slate-200">
                    {/* Header with Refresh Button */}
                    <div className="flex items-center justify-between mb-2">
                        <SectionHeader icon={<BookOpen className="w-4 h-4 text-white" />} title={rb.name} color="#2563eb" />
                        {onRefreshRunbook && (
                            <button
                                onClick={handleRefresh}
                                disabled={refreshing}
                                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors disabled:opacity-50"
                                style={{ background: "#e0e7ff", color: "#4f46e5" }}
                                title="Refresh runbook data"
                            >
                                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                            </button>
                        )}
                    </div>
                    
                    {/* Last Run Status */}
                    {(() => {
                        const completedWithErr = lastRun?.hasWarnings && lastRun.status === "Completed";
                        const dotColor  = completedWithErr ? "#f59e0b" : visual.dot;
                        const dotLabel  = completedWithErr ? "Completed w/ Errors" : visual.label;
                        return (
                            <div className="rounded-lg px-3 py-2 mb-3 border" style={{ background: dotColor + "15", borderColor: dotColor + "50" }}>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Last Run</p>
                                <div className="flex items-center gap-2">
                                    <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: dotColor, display: "inline-block", flexShrink: 0 }} />
                                    <span className="font-bold text-sm" style={{ color: dotColor }}>{dotLabel}</span>
                                    {lastRun && (
                                        <span className="text-xs px-1.5 py-0.5 rounded font-semibold ml-auto"
                                            style={{ background: lastRun.runOn ? "#7c3aed20" : "#0ea5e920", color: lastRun.runOn ? "#7c3aed" : "#0ea5e9" }}>
                                            {lastRun.runOn ? `⚙` : "☁"}
                                        </span>
                                    )}
                                </div>
                                {completedWithErr && (
                                    <p className="text-xs mt-1 font-medium" style={{ color: "#b45309" }}>⚠ Error streams detected in job output</p>
                                )}
                                {lastRun?.startTime && <p className="text-xs text-slate-500 mt-1">{formatDate(lastRun.startTime)}</p>}
                                {lastRun?.endTime && lastRun.startTime && <p className="text-xs text-slate-400">Duration: {formatDuration(lastRun.startTime, lastRun.endTime)}</p>}
                            </div>
                        );
                    })()}
                    
                    <Row label="State"         badge={{ text: p.state ?? "Unknown", color: stateColor }} />
                    <Row label="Type"          badge={{ text: p.runbookType ?? "Unknown", color: typeColor }} />
                    <Row label="Description"   value={p.description || "No description"} />
                    <Row label="Last Modified" value={formatDate(p.lastModifiedTime)} />
                    <Row label="Created"       value={formatDate(p.creationTime)} />

                    {/* Script Dependencies */}
                    {rb.scriptDependencies && rb.scriptDependencies.length > 0 && (
                        <div className="mt-3">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Dependencies</p>
                            <div className="flex flex-col gap-1">
                                {rb.scriptDependencies.slice(0, 5).map((dep, i) => {
                                    const depColors: Record<string, string> = { Variable: "#eab308", Credential: "#6b7280", Certificate: "#a855f7", Connection: "#3b82f6" };
                                    const c = depColors[dep.resourceType] ?? "#94a3b8";
                                    return (
                                        <div key={i} className="flex items-center gap-1.5 text-xs">
                                            <span className="px-1 py-0.5 rounded text-xs font-bold" style={{ background: c + "20", color: c }}>{dep.action}</span>
                                            <span className="font-medium text-slate-600 truncate">{dep.name}</span>
                                        </div>
                                    );
                                })}
                                {rb.scriptDependencies.length > 5 && (
                                    <p className="text-xs text-slate-400">+{rb.scriptDependencies.length - 5} more</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Linked Schedules */}
                    {linked.length > 0 && (
                        <div className="mt-3">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Linked Schedules</p>
                            <div className="flex flex-col gap-1">
                                {linked.slice(0, 3).map(({ schedule: s, runOn }, i) => (
                                    <div key={i} className="text-xs bg-orange-50 rounded px-2 py-1 border border-orange-100">
                                        <span className="font-medium text-orange-800">🕐 {s.name}</span>
                                    </div>
                                ))}
                                {linked.length > 3 && <p className="text-xs text-slate-400">+{linked.length - 3} more</p>}
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="mt-auto pt-3 border-t border-slate-200 flex flex-col gap-2">
                        <a
                            href={getRunbookStartUrl(data.account.id, rb.name)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                            style={{ background: "#16a34a", color: "#ffffff" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#15803d")}
                            onMouseLeave={e => (e.currentTarget.style.background = "#16a34a")}
                        >
                            <Play className="w-3.5 h-3.5" />
                            Run Now
                        </a>
                        <a
                            href={getRunbookPortalUrl(data.account.id, rb.name)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                            style={{ background: "#0078d4", color: "#ffffff" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#106ebe")}
                            onMouseLeave={e => (e.currentTarget.style.background = "#0078d4")}
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Azure Portal
                        </a>
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════════════
                    MIDDLE COLUMN: Script + Job History
                ═══════════════════════════════════════════════════════════════════ */}
                <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                    {/* Script Viewer */}
                    {rb.scriptContent && (
                        <div className="mb-3">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <Code className="w-4 h-4" style={{ color: "#6366f1" }} />
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Runbook Script</span>
                                    <span className="text-xs text-slate-400">({rb.scriptContent.split('\n').length} lines)</span>
                                </div>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(rb.scriptContent || "");
                                        setCopied(true);
                                        setTimeout(() => setCopied(false), 2000);
                                    }}
                                    className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
                                    style={{ background: copied ? "#16a34a" : "#374151", color: "#ffffff" }}
                                >
                                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                    {copied ? "Copied!" : "Copy"}
                                </button>
                            </div>
                            <pre 
                                className="text-xs overflow-auto rounded-lg p-3 max-h-28"
                                style={{ 
                                    background: "#1e293b", 
                                    color: "#e2e8f0", 
                                    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
                                    lineHeight: 1.4,
                                    tabSize: 4,
                                }}
                            >
                                <code>{rb.scriptContent}</code>
                            </pre>
                        </div>
                    )}

                    {/* Job History Table */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {(() => {
                            const failedJobs   = allJobs.filter(j => j.properties.status === "Failed");
                            const errJobs      = allJobs.filter(j => !!j.properties.exception || mergedErrorCounts[j.properties.jobId] > 0);
                            const uniqueErrIds = new Set(errJobs.map(j => j.properties.jobId));
                            const errCount     = uniqueErrIds.size;
                            return (
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <BarChart3 className="w-4 h-4" style={{ color: "#2563eb" }} />
                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Job History</span>
                                        <span className="text-xs text-slate-400">(showing {Math.min(visibleCount, allJobs.length)} of {allJobs.length})</span>
                                        {failedJobs.length > 0 && (
                                            <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>
                                                ⚠ {failedJobs.length} Failed
                                            </span>
                                        )}
                                        {errCount > 0 && (
                                            <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ background: "#fefce8", color: "#ca8a04", border: "1px solid #fef08a" }}>
                                                ⚠ {errCount} with Errors
                                            </span>
                                        )}
                                        <span className="text-xs text-indigo-500">• Click job for details</span>
                                    </div>
                                </div>
                            );
                        })()}
                        
                        {visibleJobs.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center rounded-lg border border-dashed border-slate-200">
                                <p className="text-sm text-slate-400">No job history available</p>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-auto rounded-lg border border-slate-200">
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            <th className="text-left px-3 py-2 font-semibold text-slate-500">Status</th>
                                            <th className="text-left px-3 py-2 font-semibold text-slate-500">Start Time</th>
                                            <th className="text-left px-3 py-2 font-semibold text-slate-500">Duration</th>
                                            <th className="text-left px-3 py-2 font-semibold text-slate-500">Run On</th>
                                            <th className="text-center px-3 py-2 font-semibold text-slate-500">Logs</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleJobs.map((job, i) => {
                                            const jv = JOB_STATUS_VISUAL[job.properties.status] ?? JOB_STATUS_VISUAL["NeverRun"];
                                            const hasException    = !!job.properties.exception;
                                            const streamErrCount  = mergedErrorCounts[job.properties.jobId] ?? 0;
                                            // completedWithErrors: Completed but has exception OR stream errors (pre-loaded or clicked)
                                            const completedWithErrors = job.properties.status === "Completed" && (hasException || streamErrCount > 0);
                                            const isFailed        = job.properties.status === "Failed";
                                            const hasAnyErrors    = hasException || streamErrCount > 0 || isFailed;
                                            // Row styling: Failed=red bg, Completed w/ errors=amber bg
                                            const rowBg = isFailed ? "#fef2f2" : completedWithErrors ? "#fffbeb" : undefined;
                                            const rowHover = isFailed ? "hover:bg-red-50" : completedWithErrors ? "hover:bg-amber-50" : "hover:bg-indigo-50";
                                            return (
                                                <tr 
                                                    key={job.properties.jobId ?? i} 
                                                    className={`border-b border-slate-100 last:border-0 cursor-pointer transition-colors ${rowHover}`}
                                                    style={rowBg ? { background: rowBg } : undefined}
                                                    onClick={() => handleJobClick(job)}
                                                    title={hasAnyErrors ? "This job has errors — click to view logs" : "Click to view logs"}
                                                >
                                                    <td className="px-3 py-2">
                                                        <div className="flex items-center gap-1.5">
                                                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: completedWithErrors ? "#f59e0b" : jv.dot, display: "inline-block", flexShrink: 0 }} />
                                                            <span className="font-semibold" style={{ color: completedWithErrors ? "#f59e0b" : jv.dot }}>
                                                                {completedWithErrors ? "Completed w/ Errors" : jv.label}
                                                            </span>
                                                            {completedWithErrors && streamErrCount > 0 && (
                                                                <span className="px-1 py-0.5 rounded font-bold" style={{ background: "#fef3c7", color: "#b45309", fontSize: "9px" }}>
                                                                    {streamErrCount} ERR{streamErrCount > 1 ? "S" : ""}
                                                                </span>
                                                            )}
                                                            {completedWithErrors && streamErrCount === 0 && (
                                                                <span className="px-1 py-0.5 rounded font-bold" style={{ background: "#fef3c7", color: "#b45309", fontSize: "9px" }}>ERR</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2 text-slate-600">
                                                        {job.properties.startTime ? formatDate(job.properties.startTime) : "—"}
                                                    </td>
                                                    <td className="px-3 py-2 text-slate-600">
                                                        {job.properties.startTime && job.properties.endTime 
                                                            ? formatDuration(job.properties.startTime, job.properties.endTime) 
                                                            : "—"}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                                                            style={{ 
                                                                background: job.properties.runOn ? "#7c3aed15" : "#0ea5e915", 
                                                                color: job.properties.runOn ? "#7c3aed" : "#0ea5e9" 
                                                            }}>
                                                            {job.properties.runOn ? `⚙ ${job.properties.runOn}` : "☁ Cloud"}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 text-center">
                                                        {hasAnyErrors ? (
                                                            <AlertCircle className="w-4 h-4 inline-block" style={{ color: isFailed ? "#dc2626" : "#f59e0b" }} />
                                                        ) : (
                                                            <FileText className="w-4 h-4 inline-block text-indigo-400 hover:text-indigo-600" />
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                {/* Load More footer */}
                                {hasMore && (
                                    <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 bg-slate-50">
                                        <span className="text-xs text-slate-400">
                                            Showing {visibleCount} of {allJobs.length} jobs &nbsp;·&nbsp; oldest shown: {allJobs[visibleCount - 1]?.properties.startTime ? formatDate(allJobs[visibleCount - 1].properties.startTime!) : "—"}
                                        </span>
                                        <button
                                            onClick={() => setVisibleCount(c => c + LOAD_MORE_STEP)}
                                            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                                            style={{ background: "#e0e7ff", color: "#4f46e5" }}
                                        >
                                            <ChevronDown className="w-3.5 h-3.5" />
                                            Load 10 More
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════════════
                    RIGHT COLUMN: Charts & Analytics
                ═══════════════════════════════════════════════════════════════════ */}
                <div className="w-64 shrink-0 overflow-y-auto pl-3 border-l border-slate-200">
                    <RunbookCharts jobs={data.jobs ?? []} runbookName={rb.name} jobStreamErrorCounts={mergedErrorCounts} />
                </div>
            </div>
            
            {/* Job Detail Modal */}
            {selectedJob && (
                <JobDetailModal 
                    job={selectedJob} 
                    jobOutput={jobOutput} 
                    loading={loadingJobOutput}
                    onClose={() => setSelectedJob(null)} 
                />
            )}
        </>
    );
}

function HybridWorkerGroupDetail({ groupId, data }: { groupId: string; data: AutomationData }) {
    const group = (data.hybridWorkerGroups ?? []).find(g => g.id === groupId);
    if (!group) return <p className="text-sm text-slate-400">Hybrid Worker Group not found.</p>;
    const onlineCount  = group.workers.filter(w => getWorkerStatus(w.properties.lastSeenDateTime) === "online").length;
    const offlineCount = group.workers.filter(w => getWorkerStatus(w.properties.lastSeenDateTime) === "offline").length;
    const unknownCount = group.workers.length - onlineCount - offlineCount;
    const scheduledRunbooks = (data.jobSchedules ?? []).filter(js => js.properties.runOn === group.name).map(js => js.properties.runbook.name).filter((v, i, a) => a.indexOf(v) === i);
    return (
        <>
            <SectionHeader icon={<Cpu className="w-4 h-4 text-white" />} title={group.name} color="#7c3aed" />
            <div className="rounded-lg px-3 py-2 mb-3 border border-violet-200" style={{ background: "#f5f3ff" }}>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Worker Status</p>
                <div className="flex gap-4">
                    <div className="flex items-center gap-1.5 text-xs"><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#16a34a", display: "inline-block" }} /><span className="font-bold text-green-700">{onlineCount} Online</span></div>
                    {offlineCount > 0 && <div className="flex items-center gap-1.5 text-xs"><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#dc2626", display: "inline-block" }} /><span className="font-bold text-red-700">{offlineCount} Offline</span></div>}
                    {unknownCount > 0 && <div className="flex items-center gap-1.5 text-xs"><span style={{ width: 8, height: 8, borderRadius: "50%", background: "#94a3b8", display: "inline-block" }} /><span className="font-bold text-slate-500">{unknownCount} Unknown</span></div>}
                </div>
            </div>
            <Row label="Group Type"    badge={{ text: group.properties.groupType, color: group.properties.groupType === "User" ? "#7c3aed" : "#0ea5e9" }} />
            <Row label="Credential"    value={group.properties.credential?.name || "None (uses Run As)"} />
            <Row label="Total Workers" value={group.workers.length} />
            {group.workers.length > 0 && (
                <div className="mt-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Workers</p>
                    <div className="flex flex-col gap-1.5">
                        {group.workers.map((worker, i) => {
                            const status = getWorkerStatus(worker.properties.lastSeenDateTime);
                            const dotColor = status === "online" ? "#16a34a" : status === "offline" ? "#dc2626" : "#94a3b8";
                            const statusLabel = status === "online" ? "Online" : status === "offline" ? "Offline" : "Unknown";
                            return (
                                <div key={i} className="text-xs rounded px-2 py-2 border" style={{ background: dotColor + "08", borderColor: dotColor + "30" }}>
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, display: "inline-block", flexShrink: 0 }} />
                                            {worker.properties.workerName || worker.name}
                                        </div>
                                        <span className="font-bold" style={{ color: dotColor }}>{statusLabel}</span>
                                    </div>
                                    <div className="text-slate-400 pl-4 flex flex-col gap-0.5">
                                        {worker.properties.workerType && <span>Type: {worker.properties.workerType}</span>}
                                        {worker.properties.ip && <span>IP: {worker.properties.ip}</span>}
                                        <span>Last seen: {formatDate(worker.properties.lastSeenDateTime)}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
            {scheduledRunbooks.length > 0 && (
                <div className="mt-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Scheduled Runbooks</p>
                    <div className="flex flex-col gap-1">
                        {scheduledRunbooks.map((name, i) => <div key={i} className="text-xs bg-blue-50 rounded px-2 py-1 border border-blue-100 font-medium text-blue-800">📜 {name}</div>)}
                    </div>
                </div>
            )}
            
            <AzurePortalLink resourceId={group.id} />
        </>
    );
}

function HybridWorkerDetail({ workerNodeData }: { workerNodeData: any }) {
    const status = workerNodeData.workerStatus as "online" | "offline" | "unknown";
    const dotColor = status === "online" ? "#16a34a" : status === "offline" ? "#dc2626" : "#94a3b8";
    return (
        <>
            <SectionHeader icon={<Cpu className="w-4 h-4 text-white" />} title={workerNodeData.name} color="#7c3aed" />
            <Row label="Status"      badge={{ text: status === "online" ? "Online" : status === "offline" ? "Offline" : "Unknown", color: dotColor }} />
            <Row label="Group"       value={workerNodeData.groupName} />
            <Row label="Type"        value={workerNodeData.workerType} />
            <Row label="IP"          value={workerNodeData.ip} />
            <Row label="Last Seen"   value={formatDate(workerNodeData.lastSeen)} />
            {workerNodeData.vmResourceId && <Row label="VM Resource" value={workerNodeData.vmResourceId} mono />}
        </>
    );
}

// ── Key Vault Detail ───────────────────────────────────────────────────────────
function KeyVaultDetail({ selected }: { selected: SelectedNodeInfo }) {
    const nodeData = selected as any;
    const secrets = nodeData.secrets as { name: string; isPlainText: boolean }[] ?? [];
    const keys = nodeData.keys as { name: string }[] ?? [];
    const certificates = nodeData.certificates as { name: string }[] ?? [];
    
    return (
        <>
            <SectionHeader icon={<Shield className="w-4 h-4 text-white" />} title={selected.name} color="#0ea5e9" />
            <Row label="Type" badge={{ text: "Key Vault", color: "#0ea5e9" }} />
            
            {secrets.length > 0 && (
                <div className="mt-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                        Secrets ({secrets.length})
                    </p>
                    <div className="flex flex-col gap-1.5">
                        {secrets.map((secret, i) => (
                            <div 
                                key={i} 
                                className="flex items-center gap-2 text-xs rounded-lg px-3 py-2 border"
                                style={{ 
                                    background: secret.isPlainText ? "#fee2e2" : "#fef3c7",
                                    borderColor: secret.isPlainText ? "#dc2626" : "#fcd34d",
                                    borderWidth: secret.isPlainText ? "2px" : "1px",
                                }}
                            >
                                <span>🔑</span>
                                <span className="font-medium" style={{ color: secret.isPlainText ? "#991b1b" : "#92400e" }}>
                                    {secret.name}
                                </span>
                                {secret.isPlainText && (
                                    <span 
                                        className="ml-auto text-xs font-bold px-2 py-0.5 rounded"
                                        style={{ background: "#dc2626", color: "#ffffff" }}
                                    >
                                        ⚠️ -AsPlainText
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            {keys.length > 0 && (
                <div className="mt-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                        Keys ({keys.length})
                    </p>
                    <div className="flex flex-col gap-1.5">
                        {keys.map((key, i) => (
                            <div 
                                key={i} 
                                className="flex items-center gap-2 text-xs rounded-lg px-3 py-2 border"
                                style={{ background: "#dbeafe", borderColor: "#93c5fd" }}
                            >
                                <span>🗝️</span>
                                <span className="font-medium" style={{ color: "#1e40af" }}>{key.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            {certificates.length > 0 && (
                <div className="mt-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                        Certificates ({certificates.length})
                    </p>
                    <div className="flex flex-col gap-1.5">
                        {certificates.map((cert, i) => (
                            <div 
                                key={i} 
                                className="flex items-center gap-2 text-xs rounded-lg px-3 py-2 border"
                                style={{ background: "#d1fae5", borderColor: "#6ee7b7" }}
                            >
                                <span>📜</span>
                                <span className="font-medium" style={{ color: "#065f46" }}>{cert.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            <div className="mt-4 pt-3 border-t border-slate-200">
                <p className="text-xs text-slate-400">
                    This Key Vault reference was detected from the runbook&apos;s PowerShell script.
                </p>
            </div>
        </>
    );
}

// ── Key Vault Secret Detail ────────────────────────────────────────────────────
function KvSecretDetail({ selected }: { selected: SelectedNodeInfo }) {
    const nodeData = selected as any;
    const isPlainText = Boolean(nodeData.isPlainText);
    const vaultName = nodeData.vaultName ?? "Unknown";
    
    return (
        <>
            <SectionHeader icon={<Key className="w-4 h-4 text-white" />} title={selected.name} color={isPlainText ? "#dc2626" : "#f59e0b"} />
            <Row label="Type" badge={{ text: "Key Vault Secret", color: "#f59e0b" }} />
            <Row label="Vault Name" value={vaultName} />
            
            {isPlainText && (
                <div 
                    className="mt-3 rounded-lg px-3 py-3 border-2"
                    style={{ background: "#fee2e2", borderColor: "#dc2626" }}
                >
                    <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#dc2626" }} />
                        <div>
                            <p className="text-xs font-bold" style={{ color: "#991b1b" }}>Security Warning</p>
                            <p className="text-xs mt-1" style={{ color: "#991b1b" }}>
                                This secret is retrieved with <code className="px-1 py-0.5 rounded bg-red-100">-AsPlainText</code>, 
                                which stores the value as a plain string in memory. Consider using SecureString instead.
                            </p>
                        </div>
                    </div>
                </div>
            )}
            
            <div className="mt-4 pt-3 border-t border-slate-200">
                <p className="text-xs text-slate-400">
                    Detected via: <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-600">Get-AzKeyVaultSecret</code>
                </p>
            </div>
        </>
    );
}

// ── Key Vault Key Detail ───────────────────────────────────────────────────────
function KvKeyDetail({ selected }: { selected: SelectedNodeInfo }) {
    const nodeData = selected as any;
    const vaultName = nodeData.vaultName ?? "Unknown";
    
    return (
        <>
            <SectionHeader icon={<Key className="w-4 h-4 text-white" />} title={selected.name} color="#3b82f6" />
            <Row label="Type" badge={{ text: "Key Vault Key", color: "#3b82f6" }} />
            <Row label="Vault Name" value={vaultName} />
            
            <div className="mt-4 pt-3 border-t border-slate-200">
                <p className="text-xs text-slate-400">
                    Detected via: <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-600">Get-AzKeyVaultKey</code>
                </p>
            </div>
        </>
    );
}

// ── Key Vault Certificate Detail ───────────────────────────────────────────────
function KvCertificateDetail({ selected }: { selected: SelectedNodeInfo }) {
    const nodeData = selected as any;
    const vaultName = nodeData.vaultName ?? "Unknown";
    
    return (
        <>
            <SectionHeader icon={<Shield className="w-4 h-4 text-white" />} title={selected.name} color="#10b981" />
            <Row label="Type" badge={{ text: "Key Vault Certificate", color: "#10b981" }} />
            <Row label="Vault Name" value={vaultName} />
            
            <div className="mt-4 pt-3 border-t border-slate-200">
                <p className="text-xs text-slate-400">
                    Detected via: <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-600">Get-AzKeyVaultCertificate</code>
                </p>
            </div>
        </>
    );
}

function VariableDetail({ id, data }: { id: string; data: AutomationData }) {
    const v = data.variables.find(r => r.id === id);
    if (!v) return <p className="text-sm text-slate-400">Variable not found.</p>;
    const p = v.properties;
    return (
        <>
            <SectionHeader icon={<Database className="w-4 h-4 text-white" />} title={v.name} color="#ca8a04" />
            <Row label="Encrypted"     badge={{ text: p.isEncrypted ? "Encrypted" : "Plaintext", color: p.isEncrypted ? "#dc2626" : "#16a34a" }} />
            <Row label="Value"         value={p.isEncrypted ? "🔒 Encrypted — not readable via API" : (p.value ?? "null")} mono={!p.isEncrypted} />
            <Row label="Description"   value={p.description || "No description"} />
            <Row label="Last Modified" value={formatDate(p.lastModifiedTime)} />
            <Row label="Created"       value={formatDate(p.creationTime)} />
            
            <AzurePortalLink resourceId={v.id} />
        </>
    );
}

function CredentialDetail({ id, data }: { id: string; data: AutomationData }) {
    const c = data.credentials.find(r => r.id === id);
    if (!c) return <p className="text-sm text-slate-400">Credential not found.</p>;
    const p = c.properties;
    return (
        <>
            <SectionHeader icon={<Key className="w-4 h-4 text-white" />} title={c.name} color="#334155" />
            <Row label="Username"      value={p.userName} />
            <Row label="Password"      value="🔒 Stored securely — not readable via API" />
            <Row label="Description"   value={p.description || "No description"} />
            <Row label="Last Modified" value={formatDate(p.lastModifiedTime)} />
            <Row label="Created"       value={formatDate(p.creationTime)} />
            
            <AzurePortalLink resourceId={c.id} />
        </>
    );
}

function ConnectionDetail({ id, data }: { id: string; data: AutomationData }) {
    const c = data.connections.find(r => r.id === id);
    if (!c) return <p className="text-sm text-slate-400">Connection not found.</p>;
    const p = c.properties;
    const connType = p.connectionType?.name ?? "Unknown";
    const typeColors: Record<string, string> = { AzureServicePrincipal: "#6366f1", Azure: "#0078d4", AzureClassicCertificate: "#16a34a" };
    const fields: Record<string, string> = p.fieldDefinitionValues ?? {};
    return (
        <>
            <SectionHeader icon={<Link2 className="w-4 h-4 text-white" />} title={c.name} color="#000000" />
            <Row label="Connection Type" badge={{ text: connType, color: typeColors[connType] ?? "#6b7280" }} />
            <Row label="Description"     value={p.description || "No description"} />
            <Row label="Last Modified"   value={formatDate(p.lastModifiedTime)} />
            <Row label="Created"         value={formatDate(p.creationTime)} />
            {Object.keys(fields).length > 0 && (
                <div className="mt-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Connection Fields</p>
                    <div className="flex flex-col gap-1">
                        {Object.entries(fields).map(([key, val]) => (
                            <div key={key} className="flex items-start justify-between text-xs gap-2 bg-slate-50 rounded px-2 py-1 border border-slate-100">
                                <span className="font-semibold text-slate-500 shrink-0">{key}</span>
                                <span className="text-slate-700 text-right break-all font-mono">{val || "—"}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            <AzurePortalLink resourceId={c.id} />
        </>
    );
}

function CertificateDetail({ id, data }: { id: string; data: AutomationData }) {
    const c = data.certificates.find(r => r.id === id);
    if (!c) return <p className="text-sm text-slate-400">Certificate not found.</p>;
    const p = c.properties;
    const expiryInfo = getCertificateExpiryInfo(p.expiryTime);

    return (
        <>
            <SectionHeader icon={<Shield className="w-4 h-4 text-white" />} title={c.name} color="#16a34a" />
            
            {/* ── Certificate Expiry Banner ────────────────────────────────── */}
            {expiryInfo && (
                <div 
                    className="rounded-lg px-3 py-3 mb-3 border flex items-center gap-3"
                    style={{ background: expiryInfo.bgColor, borderColor: expiryInfo.color + "40" }}
                >
                    <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: expiryInfo.color + "20" }}
                    >
                        {expiryInfo.isCritical ? (
                            <AlertCircle className="w-5 h-5" style={{ color: expiryInfo.color }} />
                        ) : (
                            <Shield className="w-5 h-5" style={{ color: expiryInfo.color }} />
                        )}
                    </div>
                    <div className="flex flex-col">
                        <span 
                            className="text-sm font-bold"
                            style={{ color: expiryInfo.color }}
                        >
                            {expiryInfo.label}
                        </span>
                        <span className="text-xs text-slate-500">
                            {formatDate(p.expiryTime)}
                        </span>
                    </div>
                </div>
            )}

            <Row label="Thumbprint"    value={p.thumbprint} mono />
            <Row label="Exportable"    value={p.isExportable !== undefined ? (p.isExportable ? "Yes" : "No") : undefined} />
            <Row label="Description"   value={p.description || "No description"} />
            <Row label="Last Modified" value={formatDate(p.lastModifiedTime)} />
            <Row label="Created"       value={formatDate(p.creationTime)} />
            
            <AzurePortalLink resourceId={c.id} />
        </>
    );
}

function ScheduleDetail({ scheduleName, data, runOn }: { scheduleName: string; data: AutomationData; runOn?: string | null }) {
    const s = (data.schedules ?? []).find(sc => sc.name === scheduleName);
    if (!s) return <p className="text-sm text-slate-400">Schedule not found.</p>;
    const p = s.properties;
    const linked = (data.jobSchedules ?? []).filter(js => js.properties.schedule.name === scheduleName).map(js => js.properties.runbook.name);
    return (
        <>
            <SectionHeader icon={<Clock className="w-4 h-4 text-white" />} title={s.name} color="#f97316" />
            
            {/* ── Schedule Health Card ──────────────────────────────────────── */}
            <div className="mb-3">
                <ScheduleHealthCard 
                    schedule={s} 
                    jobs={data.jobs ?? []} 
                    jobSchedules={data.jobSchedules ?? []} 
                    lookbackDays={7}
                />
            </div>

            <Row label="Run On"      badge={{ text: runOn ? `⚙ ${runOn}` : "☁ Azure Cloud", color: runOn ? "#7c3aed" : "#0ea5e9" }} />
            <Row label="Timezone"    value={p.timeZone} />
            <Row label="Start Time"  value={formatDate(p.startTime)} />
            <Row label="Expiry"      value={formatDate(p.expiryTime)} />
            <Row label="Description" value={p.description || "No description"} />
            
            <AzurePortalLink resourceId={s.id} />
        </>
    );
}

export function NodeDetailPanel({ selected, data, onClose, onRefreshRunbook, onFetchJobStreams }: NodeDetailPanelProps) {
    const isOpen = !!selected && selected.nodeType !== "category";
    const workerNodeData = (selected as any)?.workerNodeData ?? null;
    
    // Default heights based on node type
    const defaultHeight = selected?.nodeType === "runbook" ? 420 : 320;
    const minHeight = 200;
    const maxHeight = typeof window !== "undefined" ? window.innerHeight * 0.85 : 700;
    
    // Panel height state with resize functionality
    const [panelHeight, setPanelHeight] = useState(defaultHeight);
    const [isResizing, setIsResizing] = useState(false);
    const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
    
    // Reset height when selection changes
    useEffect(() => {
        setPanelHeight(defaultHeight);
    }, [selected?.resourceId, defaultHeight]);
    
    // Handle resize start
    const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        resizeRef.current = { startY: clientY, startHeight: panelHeight };
        setIsResizing(true);
    }, [panelHeight]);
    
    // Handle resize move and end
    useEffect(() => {
        if (!isResizing) return;
        
        const handleMove = (e: MouseEvent | TouchEvent) => {
            if (!resizeRef.current) return;
            const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
            const deltaY = resizeRef.current.startY - clientY;
            const newHeight = Math.min(maxHeight, Math.max(minHeight, resizeRef.current.startHeight + deltaY));
            setPanelHeight(newHeight);
        };
        
        const handleEnd = () => {
            setIsResizing(false);
            resizeRef.current = null;
        };
        
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);
        document.addEventListener('touchmove', handleMove);
        document.addEventListener('touchend', handleEnd);
        
        return () => {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleEnd);
            document.removeEventListener('touchmove', handleMove);
            document.removeEventListener('touchend', handleEnd);
        };
    }, [isResizing, maxHeight]);

    return (
        <div
            className="absolute bottom-0 left-0 right-0 z-50 pointer-events-none"
            style={{ 
                height: isOpen ? `${panelHeight}px` : "0", 
                transition: isResizing ? "none" : "height 0.3s cubic-bezier(0.4, 0, 0.2, 1)" 
            }}
        >
            {isOpen && (
                <div
                    className="pointer-events-auto h-full bg-white border-t border-slate-200 shadow-2xl flex flex-col overflow-hidden"
                    style={{ boxShadow: "0 -4px 20px rgba(0,0,0,0.1)" }}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Resize handle */}
                    <div 
                        className="flex justify-center py-2 shrink-0 bg-slate-50 border-b border-slate-100 select-none"
                        style={{ cursor: "ns-resize" }}
                        onMouseDown={handleResizeStart}
                        onTouchStart={handleResizeStart}
                    >
                        <div className="flex flex-col items-center gap-0.5 group">
                            <GripHorizontal 
                                className="w-6 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" 
                            />
                            <span className="text-[10px] text-slate-400 group-hover:text-slate-500 transition-colors">
                                Drag to resize
                            </span>
                        </div>
                    </div>
                    
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 shrink-0 bg-white">
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Details</span>
                        <button
                            onClick={onClose}
                            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 transition-colors"
                            style={{ cursor: "pointer" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#f1f5f9")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4">
                        <div className={selected?.nodeType === "runbook" ? "h-full" : "max-w-6xl mx-auto"}>
                            {selected?.nodeType === "account"           && <AccountDetail data={data} />}
                            {selected?.nodeType === "sourceControl"     && <SourceControlDetail scId={selected.resourceId} data={data} />}
                            {selected?.nodeType === "runbook"           && <RunbookDetail id={selected.resourceId} data={data} onRefreshRunbook={onRefreshRunbook} onFetchJobStreams={onFetchJobStreams} />}
                            {selected?.nodeType === "variable"          && <VariableDetail id={selected.resourceId} data={data} />}
                            {selected?.nodeType === "credential"        && <CredentialDetail id={selected.resourceId} data={data} />}
                            {selected?.nodeType === "connection"        && <ConnectionDetail id={selected.resourceId} data={data} />}
                            {selected?.nodeType === "certificate"       && <CertificateDetail id={selected.resourceId} data={data} />}
                            {selected?.nodeType === "schedule"          && <ScheduleDetail scheduleName={selected.name} data={data} runOn={(selected as any).runOn} />}
                            {selected?.nodeType === "hybridWorkerGroup" && <HybridWorkerGroupDetail groupId={selected.resourceId} data={data} />}
                            {selected?.nodeType === "hybridWorker"      && workerNodeData && <HybridWorkerDetail workerNodeData={workerNodeData} />}
                            {selected?.nodeType === "keyVault"          && <KeyVaultDetail selected={selected} />}
                            {selected?.nodeType === "kvSecret"          && <KvSecretDetail selected={selected} />}
                            {selected?.nodeType === "kvKey"             && <KvKeyDetail selected={selected} />}
                            {selected?.nodeType === "kvCertificate"     && <KvCertificateDetail selected={selected} />}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
