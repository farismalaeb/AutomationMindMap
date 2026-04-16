import { Node, Edge, Position } from "@xyflow/react";
import { AutomationData, AutomationResource, AutomationSchedule, HybridWorkerGroup, SourceControl, parseIdentityStatus } from "@/services/azureService";
import dagre from "dagre";

const nodeWidth  = 220;
const nodeHeight = 70;

// ── Color palette ─────────────────────────────────────────────────────────────
const COLORS = {
    account:             { bg: "#4f46e5", text: "#ffffff", border: "#4338ca" },
    runbooks:            { bg: "#2563eb", text: "#ffffff", border: "#1d4ed8" },
    variables:           { bg: "#facc15", text: "#1e293b", border: "#eab308" },
    credentials:         { bg: "#334155", text: "#ffffff", border: "#475569" },
    connections:         { bg: "#000000", text: "#ffffff", border: "#334155" },
    certificates:        { bg: "#16a34a", text: "#ffffff", border: "#15803d" },
    hybridWorkers:       { bg: "#7c3aed", text: "#ffffff", border: "#6d28d9" },
    sourceControl:       { bg: "#0891b2", text: "#ffffff", border: "#0e7490" },

    runbookItem:         { bg: "#eff6ff", text: "#1e3a5f", border: "#93c5fd" },
    variableItem:        { bg: "#fefce8", text: "#713f12", border: "#fde047" },
    credentialItem:      { bg: "#f1f5f9", text: "#1e293b", border: "#94a3b8" },
    connectionItem:      { bg: "#f1f5f9", text: "#1e293b", border: "#94a3b8" },
    certificateItem:     { bg: "#f0fdf4", text: "#14532d", border: "#86efac" },
    hybridGroupItem:     { bg: "#f5f3ff", text: "#4c1d95", border: "#c4b5fd" },
    sourceControlItem:   { bg: "#ecfeff", text: "#164e63", border: "#67e8f9" },

    scheduleEnabled:     { bg: "#fff7ed", text: "#9a3412", border: "#fb923c" },
    scheduleDisabled:    { bg: "#f8fafc", text: "#94a3b8", border: "#cbd5e1" },

    workerOnline:        { bg: "#f0fdf4", text: "#14532d", border: "#4ade80", dot: "#16a34a" },
    workerOffline:       { bg: "#fef2f2", text: "#7f1d1d", border: "#fca5a5", dot: "#dc2626" },
    workerUnknown:       { bg: "#f8fafc", text: "#475569", border: "#cbd5e1", dot: "#94a3b8" },

    // Key Vault colors
    keyVault:            { bg: "#0ea5e9", text: "#ffffff", border: "#0284c7" },
    keyVaultItem:        { bg: "#e0f2fe", text: "#0c4a6e", border: "#7dd3fc" },
    kvSecret:            { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" },
    kvSecretDanger:      { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" },
    kvKey:               { bg: "#dbeafe", text: "#1e40af", border: "#93c5fd" },
    kvCertificate:       { bg: "#d1fae5", text: "#065f46", border: "#6ee7b7" },
};

export interface JobStatusVisual {
    dot:    string;
    border: string;
    label:  string;
    icon:   string;
}

export const JOB_STATUS_VISUAL: Record<string, JobStatusVisual> = {
    Completed:    { dot: "#16a34a", border: "#16a34a", label: "Succeeded",   icon: "✓" },
    Failed:       { dot: "#dc2626", border: "#dc2626", label: "Failed",      icon: "✕" },
    Running:      { dot: "#f59e0b", border: "#f59e0b", label: "Running",     icon: "▶" },
    Activating:   { dot: "#f59e0b", border: "#f59e0b", label: "Starting",    icon: "▶" },
    Stopping:     { dot: "#f59e0b", border: "#f59e0b", label: "Stopping",    icon: "⏹" },
    Stopped:      { dot: "#6b7280", border: "#6b7280", label: "Stopped",     icon: "⏹" },
    Suspended:    { dot: "#a855f7", border: "#a855f7", label: "Suspended",   icon: "⏸" },
    Suspending:   { dot: "#a855f7", border: "#a855f7", label: "Suspending",  icon: "⏸" },
    Blocked:      { dot: "#dc2626", border: "#dc2626", label: "Blocked",     icon: "⛔" },
    Disconnected: { dot: "#dc2626", border: "#dc2626", label: "Disconnected",icon: "⚡" },
    New:          { dot: "#6b7280", border: "#6b7280", label: "Queued",      icon: "⌛" },
    Resuming:     { dot: "#f59e0b", border: "#f59e0b", label: "Resuming",    icon: "▶" },
    NeverRun:     { dot: "#cbd5e1", border: "#94a3b8", label: "Never Run",   icon: "—" },
};

const ONLINE_THRESHOLD_MS = 30 * 60 * 1000;

export function getWorkerStatus(lastSeenDateTime: string | null): "online" | "offline" | "unknown" {
    if (!lastSeenDateTime) return "unknown";
    const lastSeen = new Date(lastSeenDateTime).getTime();
    return (Date.now() - lastSeen) <= ONLINE_THRESHOLD_MS ? "online" : "offline";
}

function getSourceTypeIcon(sourceType: string): string {
    switch (sourceType) {
        case "GitHub":  return "🐙";
        case "VsoGit":  return "🔷";
        case "VsoTfvc": return "🔷";
        default:        return "📂";
    }
}

function getSourceTypeLabel(sourceType: string): string {
    switch (sourceType) {
        case "GitHub":  return "GitHub";
        case "VsoGit":  return "Azure DevOps (Git)";
        case "VsoTfvc": return "Azure DevOps (TFVC)";
        default:        return sourceType;
    }
}

const DEP_COLORS: Record<string, string> = {
    "Variable-Get":    "#10b981",
    "Variable-Set":    "#ef4444",
    "Credential-Get":  "#eab308",
    "Certificate-Get": "#a855f7",
    "Connection-Get":  "#3b82f6",
};

const RESOURCE_TYPE_TO_CATEGORY: Record<string, string> = {
    Variable:    "variables",
    Credential:  "credentials",
    Certificate: "certificates",
    Connection:  "connections",
};

// ── Certificate Expiry Status ─────────────────────────────────────────────────
export interface CertExpiryStatus {
    daysUntilExpiry: number;
    status: "expired" | "warning" | "ok";
    badgeLabel: string | null;  // null = no badge needed
    badgeColor: string | null;
    borderColor: string | null;
}

export function getCertificateExpiryStatus(expiryTime: string | null | undefined): CertExpiryStatus {
    if (!expiryTime) {
        return { daysUntilExpiry: 999, status: "ok", badgeLabel: null, badgeColor: null, borderColor: null };
    }
    const expiry = new Date(expiryTime);
    const now = new Date();
    const diffMs = expiry.getTime() - now.getTime();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (days < 0) {
        return { 
            daysUntilExpiry: days, 
            status: "expired", 
            badgeLabel: "EXPIRED", 
            badgeColor: "#dc2626",  // red
            borderColor: "#dc2626"
        };
    } else if (days <= 30) {
        return { 
            daysUntilExpiry: days, 
            status: "warning", 
            badgeLabel: `${days}d`, 
            badgeColor: "#f59e0b",  // yellow/amber
            borderColor: "#f59e0b"
        };
    } else {
        return { 
            daysUntilExpiry: days, 
            status: "ok", 
            badgeLabel: null, 
            badgeColor: null, 
            borderColor: null 
        };
    }
}

function formatFrequency(schedule: AutomationSchedule): string {
    const { frequency, interval } = schedule.properties;
    const n = interval && interval > 1 ? `Every ${interval} ` : "";
    switch (frequency) {
        case "Minute":  return `${n}Minute${interval && interval > 1 ? "s" : ""}`;
        case "Hour":    return `${n}Hour${interval && interval > 1 ? "s" : ""}`;
        case "Day":     return interval && interval > 1 ? `Every ${interval} Days` : "Daily";
        case "Week":    return interval && interval > 1 ? `Every ${interval} Weeks` : "Weekly";
        case "Month":   return interval && interval > 1 ? `Every ${interval} Months` : "Monthly";
        case "OneTime": return "One-Time";
        default:        return frequency;
    }
}

function formatNextRun(schedule: AutomationSchedule): string {
    if (!schedule.properties.isEnabled) return "Disabled";
    const nextRun = schedule.properties.nextRun;
    if (!nextRun) return "Expired";
    const d = new Date(nextRun);
    return `Next: ${d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}`;
}

export const transformAzureDataToGraph = (data: AutomationData) => {
    const nodes: Node[] = [];
    const structuralEdges: Edge[] = [];
    const dependencyEdges: Edge[] = [];

    const rootId = data.account.id;

    const scheduleMap = new Map<string, AutomationSchedule>();
    (data.schedules ?? []).forEach(s => scheduleMap.set(s.name, s));

    const runbookScheduleLinks = new Map<string, Array<{ scheduleName: string; runOn: string | null }>>();
    (data.jobSchedules ?? []).forEach(js => {
        const rbName = js.properties.runbook.name;
        if (!runbookScheduleLinks.has(rbName)) runbookScheduleLinks.set(rbName, []);
        runbookScheduleLinks.get(rbName)!.push({
            scheduleName: js.properties.schedule.name,
            runOn:        js.properties.runOn ?? null,
        });
    });

    const lastRunMap     = data.lastRunByRunbook ?? {};
    const sourceControls = data.sourceControls ?? [];

    // ── RANK -1 — Source Control nodes ───────────────────────────────────────
    if (sourceControls.length > 0) {
        sourceControls.forEach((sc: SourceControl) => {
            const icon      = getSourceTypeIcon(sc.properties.sourceType);
            const typeLabel = getSourceTypeLabel(sc.properties.sourceType);
            const autoSync  = sc.properties.autoSync ? "Auto-Sync ✓" : "Manual Sync";
            const publish   = sc.properties.publishRunbook ? "· Auto-Publish" : "";
            const branch    = sc.properties.branch ? `Branch: ${sc.properties.branch}` : "";
            const nodeLabel = `${icon} ${sc.name}\n${typeLabel}\n${branch ? `${branch} · ` : ""}${autoSync}${publish}`;

            nodes.push({
                id: `sc-${sc.id}`,
                type: "default",
                data: { label: nodeLabel, nodeType: "sourceControl", resourceId: sc.id, name: sc.name },
                position: { x: 0, y: 0 },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                draggable: true,
                className: "rounded-lg border-2 text-xs px-3 py-2 cursor-grab whitespace-pre-line text-center leading-tight font-medium",
                style: { background: COLORS.sourceControlItem.bg, color: COLORS.sourceControlItem.text, borderColor: COLORS.sourceControl.bg, minWidth: "180px" },
            });

            structuralEdges.push({
                id: `e-sc-${sc.id}-${rootId}`, source: `sc-${sc.id}`, target: rootId,
                animated: sc.properties.autoSync,
                style: { stroke: COLORS.sourceControl.bg, strokeWidth: 2, strokeDasharray: sc.properties.autoSync ? undefined : "5 3" },
                label: sc.properties.autoSync ? "auto-sync" : "manual",
                labelStyle: { fill: COLORS.sourceControl.bg, fontSize: 10, fontWeight: 700 },
            });
        });
    }

    // ── RANK 0 — Automation Account ───────────────────────────────────────────
    // Parse managed identity from the top-level `identity` field returned by ARM.
    // The label shows the account name on line 1 and identity status on line 2.
    // Node data carries identityStatus so NodeDetailPanel can render full detail.
    const identityStatus = parseIdentityStatus(data.account);
    const accountLabel   = `⚡ ${data.account.name}\n${identityStatus.icon} ${identityStatus.label}`;

    nodes.push({
        id: rootId,
        type: "default",
        data: {
            label:          accountLabel,
            nodeType:       "account",
            resourceId:     rootId,
            name:           data.account.name,
            identityStatus,             // ← consumed by NodeDetailPanel AccountDetail
        },
        position: { x: 0, y: 0 },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        draggable: false,
        className: "font-bold rounded-xl shadow-xl cursor-default border-2 px-4 py-2 whitespace-pre-line text-center leading-snug",
        style: { background: COLORS.account.bg, color: COLORS.account.text, borderColor: COLORS.account.border, minWidth: "200px" },
    });

    // ── Category definitions ──────────────────────────────────────────────────
    const categories = [
        { id: `${rootId}-runbooks`,     label: "📜 Runbooks",     nodeType: "runbook",     items: data.runbooks,     tileColor: COLORS.runbooks,     itemColor: COLORS.runbookItem },
        { id: `${rootId}-variables`,    label: "𝑥 Variables",    nodeType: "variable",    items: data.variables,    tileColor: COLORS.variables,    itemColor: COLORS.variableItem },
        { id: `${rootId}-credentials`,  label: "🔑 Credentials",  nodeType: "credential",  items: data.credentials,  tileColor: COLORS.credentials,  itemColor: COLORS.credentialItem },
        { id: `${rootId}-connections`,  label: "🔌 Connections",  nodeType: "connection",  items: data.connections,  tileColor: COLORS.connections,  itemColor: COLORS.connectionItem },
        { id: `${rootId}-certificates`, label: "🛡️ Certificates", nodeType: "certificate", items: data.certificates, tileColor: COLORS.certificates, itemColor: COLORS.certificateItem },
    ];

    categories.forEach((cat) => {
        if (!cat.items || cat.items.length === 0) return;

        nodes.push({
            id: cat.id,
            type: "default",
            data: { label: cat.label, nodeType: "category", resourceId: cat.id, name: cat.label },
            position: { x: 0, y: 0 },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            draggable: false,
            className: "font-semibold rounded-lg border-2 shadow-lg px-3 py-2 cursor-default",
            style: { background: cat.tileColor.bg, color: cat.tileColor.text, borderColor: cat.tileColor.border },
        });

        structuralEdges.push({
            id: `e-${rootId}-${cat.id}`, source: rootId, target: cat.id,
            animated: true, style: { stroke: "#6366f1", strokeWidth: 2 },
        });

        cat.items.forEach((item: AutomationResource) => {
            let extraData: Record<string, any> = {};
            let borderColor = cat.itemColor.border;
            let nodeLabel = item.name;
            let borderWidth = "1px";

            if (cat.nodeType === "runbook") {
                const lastRun   = lastRunMap[item.name];
                const statusKey = lastRun?.status ?? "NeverRun";
                const visual    = JOB_STATUS_VISUAL[statusKey] ?? JOB_STATUS_VISUAL["NeverRun"];
                
                // Calculate child count for this runbook
                const linkedSchedules = runbookScheduleLinks.get(item.name) ?? [];
                const kvUsage = item.keyVaultUsage ?? [];
                const kvChildrenCount = kvUsage.reduce((sum, kv) => sum + 1 + kv.secrets.length + kv.keys.length + kv.certificates.length, 0);
                const childCount = linkedSchedules.length + kvChildrenCount;
                const hasChildren = childCount > 0;
                
                // Check if job succeeded but had warnings/exceptions
                const hasWarnings = lastRun?.hasWarnings ?? false;
                
                extraData   = { lastRun: lastRun ?? null, statusVisual: visual, hasChildren, childCount, hasWarnings, runbookState: item.properties?.state ?? null };
                borderColor = visual.border;
                borderWidth = "2px";
            }

            // Certificate expiry badge
            if (cat.nodeType === "certificate") {
                const expiryStatus = getCertificateExpiryStatus(item.properties?.expiryTime);
                extraData = { expiryStatus };
                if (expiryStatus.badgeLabel && expiryStatus.badgeColor) {
                    // Add badge to node label - will be rendered with custom styling
                    nodeLabel = `🛡️ ${item.name}`;
                    borderColor = expiryStatus.borderColor!;
                    borderWidth = "2px";
                }
            }

            nodes.push({
                id: item.id,
                type: cat.nodeType === "runbook" ? "runbookNode" : (cat.nodeType === "certificate" ? "certificateNode" : "default"),
                data: { label: nodeLabel, nodeType: cat.nodeType, resourceId: item.id, name: item.name, ...extraData },
                position: { x: 0, y: 0 },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                draggable: true,
                className: "font-medium rounded-lg shadow-sm border px-4 py-2 cursor-grab",
                style: { background: cat.itemColor.bg, color: cat.itemColor.text, borderColor, borderWidth },
            });

            structuralEdges.push({
                id: `e-${cat.id}-${item.id}`, source: cat.id, target: item.id,
                animated: false, style: { stroke: "#cbd5e1" },
            });

            if (cat.nodeType === "runbook") {
                const linkedSchedules = runbookScheduleLinks.get(item.name) ?? [];
                linkedSchedules.forEach(({ scheduleName, runOn }) => {
                    const schedule    = scheduleMap.get(scheduleName);
                    const isEnabled   = schedule?.properties.isEnabled ?? false;
                    const schedNodeId = `sched-${item.id}-${scheduleName}`;
                    const freqLabel   = schedule ? formatFrequency(schedule) : scheduleName;
                    const nextRun     = schedule ? formatNextRun(schedule)   : "";
                    const icon        = isEnabled ? "🕐" : "⏸";
                    const hwLabel     = runOn ? `⚙ ${runOn}` : "☁ Azure Cloud";
                    const nodeLabel   = `${icon} ${scheduleName}\n${freqLabel}${nextRun ? `\n${nextRun}` : ""}\n${hwLabel}`;
                    const schedColor  = isEnabled ? COLORS.scheduleEnabled : COLORS.scheduleDisabled;

                    nodes.push({
                        id: schedNodeId,
                        type: "default",
                        data: { label: nodeLabel, nodeType: "schedule", resourceId: schedNodeId, name: scheduleName, runOn, parentRunbookId: item.id },
                        position: { x: 0, y: 0 },
                        sourcePosition: Position.Bottom,
                        targetPosition: Position.Top,
                        draggable: true,
                        hidden: true,
                        className: "rounded-lg border text-xs px-3 py-2 cursor-grab whitespace-pre-line text-center leading-tight",
                        style: {
                            background:  schedColor.bg,
                            color:       schedColor.text,
                            borderColor: runOn ? "#7c3aed" : schedColor.border,
                            borderWidth: isEnabled ? "2px" : "1px",
                            minWidth:    "170px",
                        },
                    });

                    structuralEdges.push({
                        id: `e-${item.id}-${schedNodeId}`, source: item.id, target: schedNodeId,
                        animated: isEnabled,
                        style: { stroke: isEnabled ? "#fb923c" : "#cbd5e1", strokeWidth: isEnabled ? 2 : 1, strokeDasharray: isEnabled ? undefined : "4 3" },
                        label: isEnabled ? (runOn ? "hybrid" : "scheduled") : "disabled",
                        labelStyle: { fill: isEnabled ? (runOn ? "#7c3aed" : "#ea580c") : "#94a3b8", fontSize: 10, fontWeight: 600 },
                    });
                });

                // ── Key Vault nodes for this runbook ─────────────────────────
                const kvUsage = item.keyVaultUsage ?? [];
                kvUsage.forEach((kv) => {
                    const kvNodeId = `kv-${item.id}-${kv.vaultName}`;
                    const totalResources = kv.secrets.length + kv.keys.length + kv.certificates.length;
                    const kvLabel = `🔐 ${kv.vaultName}\nKey Vault · ${totalResources} item${totalResources !== 1 ? 's' : ''}`;

                    nodes.push({
                        id: kvNodeId,
                        type: "keyVaultNode",
                        data: { 
                            label: kvLabel, 
                            nodeType: "keyVault", 
                            resourceId: kvNodeId, 
                            name: kv.vaultName,
                            secrets: kv.secrets,
                            keys: kv.keys,
                            certificates: kv.certificates,
                            parentRunbookId: item.id,
                        },
                        position: { x: 0, y: 0 },
                        sourcePosition: Position.Bottom,
                        targetPosition: Position.Top,
                        draggable: true,
                        hidden: true,
                        className: "font-medium rounded-lg shadow-sm border-2 px-3 py-2 cursor-grab whitespace-pre-line text-center leading-tight",
                        style: { background: COLORS.keyVaultItem.bg, color: COLORS.keyVaultItem.text, borderColor: COLORS.keyVault.bg, minWidth: "170px" },
                    });

                    structuralEdges.push({
                        id: `e-${item.id}-${kvNodeId}`, source: item.id, target: kvNodeId,
                        animated: true,
                        style: { stroke: COLORS.keyVault.bg, strokeWidth: 2 },
                        label: "uses",
                        labelStyle: { fill: COLORS.keyVault.bg, fontSize: 10, fontWeight: 600 },
                    });

                    // ── Key Vault Secrets ─────────────────────────────────────
                    kv.secrets.forEach((secret) => {
                        const secretNodeId = `kv-secret-${item.id}-${kv.vaultName}-${secret.name}`;
                        const secretColor = secret.isPlainText ? COLORS.kvSecretDanger : COLORS.kvSecret;
                        const warningIcon = secret.isPlainText ? "⚠️ " : "";
                        const secretLabel = `${warningIcon}🔑 ${secret.name}${secret.isPlainText ? "\n-AsPlainText" : ""}`;

                        nodes.push({
                            id: secretNodeId,
                            type: "kvSecretNode",
                            data: { 
                                label: secretLabel, 
                                nodeType: "kvSecret", 
                                resourceId: secretNodeId, 
                                name: secret.name,
                                vaultName: kv.vaultName,
                                isPlainText: secret.isPlainText,
                                parentRunbookId: item.id,
                            },
                            position: { x: 0, y: 0 },
                            sourcePosition: Position.Bottom,
                            targetPosition: Position.Top,
                            draggable: true,
                            hidden: true,
                            className: "rounded-lg border text-xs px-3 py-2 cursor-grab whitespace-pre-line text-center leading-tight",
                            style: { 
                                background: secretColor.bg, 
                                color: secretColor.text, 
                                borderColor: secretColor.border, 
                                borderWidth: secret.isPlainText ? "2px" : "1px",
                                minWidth: "140px" 
                            },
                        });

                        structuralEdges.push({
                            id: `e-${kvNodeId}-${secretNodeId}`, source: kvNodeId, target: secretNodeId,
                            animated: false,
                            style: { stroke: secret.isPlainText ? "#dc2626" : COLORS.kvSecret.border },
                        });
                    });

                    // ── Key Vault Keys ────────────────────────────────────────
                    kv.keys.forEach((key) => {
                        const keyNodeId = `kv-key-${item.id}-${kv.vaultName}-${key.name}`;
                        const keyLabel = `🗝️ ${key.name}`;

                        nodes.push({
                            id: keyNodeId,
                            type: "kvKeyNode",
                            data: { 
                                label: keyLabel, 
                                nodeType: "kvKey", 
                                resourceId: keyNodeId, 
                                name: key.name,
                                vaultName: kv.vaultName,
                                parentRunbookId: item.id,
                            },
                            position: { x: 0, y: 0 },
                            sourcePosition: Position.Bottom,
                            targetPosition: Position.Top,
                            draggable: true,
                            hidden: true,
                            className: "rounded-lg border text-xs px-3 py-2 cursor-grab text-center",
                            style: { 
                                background: COLORS.kvKey.bg, 
                                color: COLORS.kvKey.text, 
                                borderColor: COLORS.kvKey.border,
                                minWidth: "140px" 
                            },
                        });

                        structuralEdges.push({
                            id: `e-${kvNodeId}-${keyNodeId}`, source: kvNodeId, target: keyNodeId,
                            animated: false,
                            style: { stroke: COLORS.kvKey.border },
                        });
                    });

                    // ── Key Vault Certificates ────────────────────────────────
                    kv.certificates.forEach((cert) => {
                        const certNodeId = `kv-cert-${item.id}-${kv.vaultName}-${cert.name}`;
                        const certLabel = `📜 ${cert.name}`;

                        nodes.push({
                            id: certNodeId,
                            type: "kvCertNode",
                            data: { 
                                label: certLabel, 
                                nodeType: "kvCertificate", 
                                resourceId: certNodeId, 
                                name: cert.name,
                                vaultName: kv.vaultName,
                                parentRunbookId: item.id,
                            },
                            position: { x: 0, y: 0 },
                            sourcePosition: Position.Bottom,
                            targetPosition: Position.Top,
                            draggable: true,
                            hidden: true,
                            className: "rounded-lg border text-xs px-3 py-2 cursor-grab text-center",
                            style: { 
                                background: COLORS.kvCertificate.bg, 
                                color: COLORS.kvCertificate.text, 
                                borderColor: COLORS.kvCertificate.border,
                                minWidth: "140px" 
                            },
                        });

                        structuralEdges.push({
                            id: `e-${kvNodeId}-${certNodeId}`, source: kvNodeId, target: certNodeId,
                            animated: false,
                            style: { stroke: COLORS.kvCertificate.border },
                        });
                    });
                });
            }
        });
    });

    // ── Hybrid Worker Groups tile ─────────────────────────────────────────────
    const hwGroups = data.hybridWorkerGroups ?? [];
    if (hwGroups.length > 0) {
        const hwTileId = `${rootId}-hybridWorkers`;

        nodes.push({
            id: hwTileId,
            type: "default",
            data: { label: "⚙ Hybrid Workers", nodeType: "category", resourceId: hwTileId, name: "Hybrid Workers" },
            position: { x: 0, y: 0 },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            draggable: false,
            className: "font-semibold rounded-lg border-2 shadow-lg px-3 py-2 cursor-default",
            style: { background: COLORS.hybridWorkers.bg, color: COLORS.hybridWorkers.text, borderColor: COLORS.hybridWorkers.border },
        });

        structuralEdges.push({
            id: `e-${rootId}-${hwTileId}`, source: rootId, target: hwTileId,
            animated: true, style: { stroke: "#7c3aed", strokeWidth: 2 },
        });

        hwGroups.forEach((group: HybridWorkerGroup) => {
            const groupNodeId  = `hwg-${group.id}`;
            const onlineCount  = group.workers.filter(w => getWorkerStatus(w.properties.lastSeenDateTime) === "online").length;
            const totalCount   = group.workers.length;
            const allOnline    = totalCount > 0 && onlineCount === totalCount;
            const anyOnline    = onlineCount > 0;
            const groupBorder  = allOnline ? "#4ade80" : anyOnline ? "#fb923c" : totalCount > 0 ? "#fca5a5" : "#c4b5fd";
            const groupLabel   = `${group.name}\n${group.properties.groupType} · ${onlineCount}/${totalCount} online`;

            nodes.push({
                id: groupNodeId,
                type: "default",
                data: { label: groupLabel, nodeType: "hybridWorkerGroup", resourceId: group.id, name: group.name, groupType: group.properties.groupType, onlineCount, totalCount },
                position: { x: 0, y: 0 },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                draggable: true,
                className: "font-medium rounded-lg shadow-sm border-2 px-3 py-2 cursor-grab whitespace-pre-line text-center leading-tight",
                style: { background: COLORS.hybridGroupItem.bg, color: COLORS.hybridGroupItem.text, borderColor: groupBorder, minWidth: "170px" },
            });

            structuralEdges.push({
                id: `e-${hwTileId}-${groupNodeId}`, source: hwTileId, target: groupNodeId,
                animated: false, style: { stroke: "#c4b5fd" },
            });

            group.workers.forEach((worker) => {
                const workerNodeId = `hww-${worker.id}`;
                const status       = getWorkerStatus(worker.properties.lastSeenDateTime);
                const workerColor  = status === "online" ? COLORS.workerOnline : status === "offline" ? COLORS.workerOffline : COLORS.workerUnknown;
                const statusIcon   = status === "online" ? "🟢" : status === "offline" ? "🔴" : "⚪";
                const workerLabel  = `${statusIcon} ${worker.properties.workerName || worker.name}\n${worker.properties.workerType ?? ""}`;

                nodes.push({
                    id: workerNodeId,
                    type: "default",
                    data: { label: workerLabel, nodeType: "hybridWorker", resourceId: worker.id, name: worker.properties.workerName || worker.name, workerStatus: status, lastSeen: worker.properties.lastSeenDateTime, workerType: worker.properties.workerType, ip: worker.properties.ip, vmResourceId: worker.properties.vmResourceId, groupName: group.name },
                    position: { x: 0, y: 0 },
                    sourcePosition: Position.Bottom,
                    targetPosition: Position.Top,
                    draggable: true,
                    className: "rounded-lg border text-xs px-3 py-2 cursor-grab whitespace-pre-line text-center leading-tight",
                    style: { background: workerColor.bg, color: workerColor.text, borderColor: workerColor.border, minWidth: "150px" },
                });

                structuralEdges.push({
                    id: `e-${groupNodeId}-${workerNodeId}`, source: groupNodeId, target: workerNodeId,
                    animated: false, style: { stroke: workerColor.border },
                });
            });
        });
    }

    // ── Dagre layout — structural edges only ─────────────────────────────────
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: "TB", ranksep: 100, nodesep: 50, marginy: 60, marginx: 60 });
    nodes.forEach(n => dagreGraph.setNode(n.id, { width: nodeWidth, height: nodeHeight }));
    structuralEdges.forEach(e => dagreGraph.setEdge(e.source, e.target));
    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map(node => {
        const { x, y } = dagreGraph.node(node.id);
        return { ...node, position: { x: x - nodeWidth / 2, y: y - nodeHeight / 2 } };
    });

    // ── Dependency edges (post-layout) ────────────────────────────────────────
    (data.runbooks ?? []).forEach((runbook) => {
        if (!runbook.scriptDependencies?.length) return;
        runbook.scriptDependencies.forEach((dep) => {
            let targetNode: AutomationResource | undefined;
            switch (dep.resourceType) {
                case "Variable":    targetNode = data.variables?.find(v => v.name.toLowerCase()    === dep.name.toLowerCase()); break;
                case "Credential":  targetNode = data.credentials?.find(c => c.name.toLowerCase()  === dep.name.toLowerCase()); break;
                case "Certificate": targetNode = data.certificates?.find(c => c.name.toLowerCase() === dep.name.toLowerCase()); break;
                case "Connection":  targetNode = data.connections?.find(c => c.name.toLowerCase()  === dep.name.toLowerCase()); break;
            }
            if (targetNode) {
                const isSet     = dep.action === "Set";
                const edgeColor = DEP_COLORS[`${dep.resourceType}-${dep.action}`] ?? "#94a3b8";
                dependencyEdges.push({
                    id: `e-dep-${runbook.id}-${targetNode.id}-${dep.action}`,
                    source: isSet ? runbook.id : targetNode.id,
                    target: isSet ? targetNode.id : runbook.id,
                    animated: true, label: dep.action,
                    style: { stroke: edgeColor, strokeWidth: 2 },
                    labelStyle: { fill: "#475569", fontWeight: 700, fontSize: 12 },
                    className: "z-50",
                });
            } else {
                const categoryNodeId = `${rootId}-${RESOURCE_TYPE_TO_CATEGORY[dep.resourceType]}`;
                // If the category node doesn't exist yet (account has no assets of this type at all)
                // create a ghost category node so the broken dependency edge has a target
                if (!nodes.some(n => n.id === categoryNodeId)) {
                    const catLabels: Record<string, string> = {
                        variables: "𝑥 Variables", credentials: "🔑 Credentials",
                        connections: "🔌 Connections", certificates: "🛡️ Certificates",
                    };
                    const catKey = RESOURCE_TYPE_TO_CATEGORY[dep.resourceType];
                    const catColors = COLORS[catKey as keyof typeof COLORS] as { bg: string; text: string; border: string } | undefined;
                    nodes.push({
                        id: categoryNodeId,
                        type: "default",
                        data: { label: catLabels[catKey] ?? catKey, nodeType: "category", resourceId: categoryNodeId, name: catLabels[catKey] ?? catKey },
                        position: { x: 0, y: 0 },
                        sourcePosition: Position.Bottom,
                        targetPosition: Position.Top,
                        draggable: false,
                        className: "font-semibold rounded-lg border-2 shadow-lg px-3 py-2 cursor-default",
                        style: { background: catColors?.bg ?? "#f8fafc", color: catColors?.text ?? "#1e293b", borderColor: "#dc2626" },
                    });
                    structuralEdges.push({
                        id: `e-${rootId}-${categoryNodeId}`, source: rootId, target: categoryNodeId,
                        animated: false, style: { stroke: "#dc2626", strokeWidth: 2, strokeDasharray: "6 3" },
                    });
                }
                // Draw red edge: runbook → category
                const brokenRunbookEdgeId = `e-broken-rb-${runbook.id}-${dep.resourceType}`;
                if (!dependencyEdges.some(e => e.id === brokenRunbookEdgeId)) {
                    dependencyEdges.push({
                        id: brokenRunbookEdgeId,
                        source: runbook.id,
                        target: categoryNodeId,
                        animated: false,
                        style: { stroke: "#dc2626", strokeWidth: 2, strokeDasharray: "6 3" },
                    });
                }
                // Create missing node under the category
                const missingNodeId = `missing-${runbook.id}-${dep.resourceType}-${dep.name}`;
                if (!nodes.some(n => n.id === missingNodeId)) {
                    nodes.push({
                        id: missingNodeId,
                        type: "default",
                        data: {
                            label: `⛔ ${dep.name}`,
                            nodeType: "missing",
                            resourceId: missingNodeId,
                            name: dep.name,
                        },
                        position: { x: 0, y: 0 },
                        sourcePosition: Position.Bottom,
                        targetPosition: Position.Top,
                        draggable: true,
                        className: "font-semibold rounded-lg border-2 px-4 py-2 cursor-grab text-center",
                        style: {
                            background: "#fef2f2",
                            color: "#991b1b",
                            borderColor: "#dc2626",
                            borderStyle: "dashed",
                            minWidth: "140px",
                            boxShadow: "0 0 0 2px #fca5a540",
                        },
                    });
                }
                // Draw red edge: category → missing node
                const brokenEdgeId = `e-broken-${runbook.id}-${dep.resourceType}-${dep.name}`;
                if (!dependencyEdges.some(e => e.id === brokenEdgeId)) {
                    dependencyEdges.push({
                        id: brokenEdgeId,
                        source: categoryNodeId,
                        target: missingNodeId,
                        animated: false,
                        label: "MISSING",
                        style: { stroke: "#dc2626", strokeWidth: 2, strokeDasharray: "6 3" },
                        labelStyle: { fill: "#dc2626", fontWeight: 700, fontSize: 10 },
                    });
                }
            }
        });
    });

    return { nodes: layoutedNodes, edges: [...structuralEdges, ...dependencyEdges] };
};

// ════════════════════════════════════════════════════════════════════════════
// Object-Centric View: Assets -> Runbooks that use them
// Layout: Account -> Asset Categories -> Individual Assets -> Runbooks (grid)
// ════════════════════════════════════════════════════════════════════════════

export const transformAzureDataToObjectView = (data: AutomationData) => {
    const nodes: Node[] = [];
    const structuralEdges: Edge[] = [];

    const rootId = data.account.id;
    const lastRunMap = data.lastRunByRunbook ?? {};

    // Build reverse map: asset -> runbooks that use it
    const assetToRunbooks = new Map<string, Set<string>>();  // assetKey -> Set of runbook IDs
    
    (data.runbooks ?? []).forEach((runbook) => {
        if (!runbook.scriptDependencies?.length) return;
        runbook.scriptDependencies.forEach((dep) => {
            const assetKey = `${dep.resourceType}-${dep.name.toLowerCase()}`;
            if (!assetToRunbooks.has(assetKey)) {
                assetToRunbooks.set(assetKey, new Set());
            }
            assetToRunbooks.get(assetKey)!.add(runbook.id);
        });
    });

    // ── RANK 0 — Automation Account ───────────────────────────────────────────
    const identityStatus = parseIdentityStatus(data.account);
    const accountLabel = `⚡ ${data.account.name}\n${identityStatus.icon} ${identityStatus.label}`;

    nodes.push({
        id: rootId,
        type: "default",
        data: {
            label: accountLabel,
            nodeType: "account",
            resourceId: rootId,
            name: data.account.name,
            identityStatus,
        },
        position: { x: 0, y: 0 },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        draggable: false,
        className: "font-bold rounded-xl shadow-xl cursor-default border-2 px-4 py-2 whitespace-pre-line text-center leading-snug",
        style: { background: COLORS.account.bg, color: COLORS.account.text, borderColor: COLORS.account.border, minWidth: "200px" },
    });

    // ── Category definitions (excluding Runbooks - they become children) ─────
    const categories = [
        { id: `${rootId}-variables`,    label: "𝑥 Variables",    nodeType: "variable",    items: data.variables,    tileColor: COLORS.variables,    itemColor: COLORS.variableItem,    resourceType: "Variable" },
        { id: `${rootId}-credentials`,  label: "🔑 Credentials",  nodeType: "credential",  items: data.credentials,  tileColor: COLORS.credentials,  itemColor: COLORS.credentialItem,  resourceType: "Credential" },
        { id: `${rootId}-connections`,  label: "🔌 Connections",  nodeType: "connection",  items: data.connections,  tileColor: COLORS.connections,  itemColor: COLORS.connectionItem,  resourceType: "Connection" },
        { id: `${rootId}-certificates`, label: "🛡️ Certificates", nodeType: "certificate", items: data.certificates, tileColor: COLORS.certificates, itemColor: COLORS.certificateItem, resourceType: "Certificate" },
    ];

    // Track nodes for manual positioning
    const positionTracker = {
        categoryY: 150,
        categorySpacing: 400,
    };

    categories.forEach((cat, catIndex) => {
        if (!cat.items || cat.items.length === 0) return;

        const categoryX = catIndex * positionTracker.categorySpacing;

        // Add category node
        nodes.push({
            id: cat.id,
            type: "default",
            data: { label: cat.label, nodeType: "category", resourceId: cat.id, name: cat.label },
            position: { x: categoryX, y: positionTracker.categoryY },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            draggable: false,
            className: "font-semibold rounded-lg border-2 shadow-lg px-3 py-2 cursor-default",
            style: { background: cat.tileColor.bg, color: cat.tileColor.text, borderColor: cat.tileColor.border },
        });

        structuralEdges.push({
            id: `e-${rootId}-${cat.id}`, source: rootId, target: cat.id,
            animated: true, style: { stroke: "#6366f1", strokeWidth: 2 },
        });

        // Add asset items and their connected runbooks
        cat.items.forEach((item: AutomationResource, itemIndex: number) => {
            const assetKey = `${cat.resourceType}-${item.name.toLowerCase()}`;
            const connectedRunbookIds = assetToRunbooks.get(assetKey) ?? new Set();
            const connectedRunbooks = data.runbooks.filter(rb => connectedRunbookIds.has(rb.id));

            let extraData: Record<string, any> = {};
            let borderColor = cat.itemColor.border;
            let nodeLabel = item.name;

            // Certificate expiry badge
            if (cat.nodeType === "certificate") {
                const expiryStatus = getCertificateExpiryStatus(item.properties?.expiryTime);
                extraData = { expiryStatus };
                if (expiryStatus.badgeLabel && expiryStatus.badgeColor) {
                    nodeLabel = `🛡️ ${item.name}`;
                    borderColor = expiryStatus.borderColor!;
                }
            }

            // Count connected runbooks for the label
            const runbookCount = connectedRunbooks.length;
            if (runbookCount > 0) {
                nodeLabel = `${nodeLabel}\n📜 ${runbookCount} runbook${runbookCount > 1 ? 's' : ''}`;
            }

            const itemY = positionTracker.categoryY + 120 + (itemIndex * 200);

            nodes.push({
                id: item.id,
                type: cat.nodeType === "certificate" ? "certificateNode" : "default",
                data: { 
                    label: nodeLabel, 
                    nodeType: cat.nodeType, 
                    resourceId: item.id, 
                    name: item.name,
                    connectedRunbookCount: runbookCount,
                    ...extraData 
                },
                position: { x: categoryX, y: itemY },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                draggable: true,
                className: "font-medium rounded-lg shadow-sm border px-4 py-2 cursor-grab whitespace-pre-line text-center",
                style: { 
                    background: cat.itemColor.bg, 
                    color: cat.itemColor.text, 
                    borderColor,
                    borderWidth: runbookCount > 0 ? "2px" : "1px",
                    minWidth: "150px",
                },
            });

            structuralEdges.push({
                id: `e-${cat.id}-${item.id}`, source: cat.id, target: item.id,
                animated: false, style: { stroke: "#cbd5e1" },
            });

            // Add connected runbooks as children (grid layout: max 6 per row)
            if (connectedRunbooks.length > 0) {
                const maxPerRow = 6;
                const runbookWidth = 180;
                const runbookHeight = 70;
                const runbookGapX = 20;
                const runbookGapY = 20;

                connectedRunbooks.forEach((runbook, rbIndex) => {
                    const row = Math.floor(rbIndex / maxPerRow);
                    const col = rbIndex % maxPerRow;

                    // Calculate total width of this row for centering
                    const itemsInThisRow = Math.min(maxPerRow, connectedRunbooks.length - (row * maxPerRow));
                    const rowWidth = (itemsInThisRow * runbookWidth) + ((itemsInThisRow - 1) * runbookGapX);
                    const startX = categoryX - (rowWidth / 2) + (runbookWidth / 2);

                    const rbX = startX + (col * (runbookWidth + runbookGapX));
                    const rbY = itemY + 100 + (row * (runbookHeight + runbookGapY));

                    const lastRun = lastRunMap[runbook.name];
                    const statusKey = lastRun?.status ?? "NeverRun";
                    const visual = JOB_STATUS_VISUAL[statusKey] ?? JOB_STATUS_VISUAL["NeverRun"];

                    const runbookNodeId = `rb-under-${item.id}-${runbook.id}`;

                    nodes.push({
                        id: runbookNodeId,
                        type: "runbookNode",
                        data: {
                            label: runbook.name,
                            nodeType: "runbook",
                            resourceId: runbook.id,
                            name: runbook.name,
                            lastRun: lastRun ?? null,
                            statusVisual: visual,
                            hasWarnings: lastRun?.hasWarnings ?? false,
                            hasChildren: false,
                            childCount: 0,
                            parentAssetId: item.id,
                        },
                        position: { x: rbX, y: rbY },
                        sourcePosition: Position.Bottom,
                        targetPosition: Position.Top,
                        draggable: true,
                        className: "font-medium rounded-lg shadow-sm border px-3 py-1.5 cursor-grab",
                        style: {
                            background: COLORS.runbookItem.bg,
                            color: COLORS.runbookItem.text,
                            borderColor: visual.border,
                            borderWidth: "2px",
                            minWidth: "160px",
                            maxWidth: "180px",
                        },
                    });

                    structuralEdges.push({
                        id: `e-${item.id}-${runbookNodeId}`,
                        source: item.id,
                        target: runbookNodeId,
                        animated: false,
                        style: { stroke: visual.border, strokeWidth: 1 },
                        label: "uses",
                        labelStyle: { fill: "#94a3b8", fontSize: 9, fontWeight: 500 },
                    });
                });
            }
        });
    });

    // ── Add orphan runbooks (not connected to any asset) as separate section ──
    const usedRunbookIds = new Set<string>();
    assetToRunbooks.forEach((ids) => ids.forEach(id => usedRunbookIds.add(id)));
    
    const orphanRunbooks = data.runbooks.filter(rb => !usedRunbookIds.has(rb.id));
    
    if (orphanRunbooks.length > 0) {
        const orphanCategoryId = `${rootId}-orphan-runbooks`;
        const orphanX = categories.length * positionTracker.categorySpacing;
        
        nodes.push({
            id: orphanCategoryId,
            type: "default",
            data: { label: "📜 Standalone Runbooks", nodeType: "category", resourceId: orphanCategoryId, name: "Standalone Runbooks" },
            position: { x: orphanX, y: positionTracker.categoryY },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            draggable: false,
            className: "font-semibold rounded-lg border-2 shadow-lg px-3 py-2 cursor-default",
            style: { background: COLORS.runbooks.bg, color: COLORS.runbooks.text, borderColor: COLORS.runbooks.border },
        });

        structuralEdges.push({
            id: `e-${rootId}-${orphanCategoryId}`, source: rootId, target: orphanCategoryId,
            animated: true, style: { stroke: "#6366f1", strokeWidth: 2 },
        });

        // Layout orphan runbooks in grid (max 6 per row)
        const maxPerRow = 6;
        const runbookWidth = 180;
        const runbookHeight = 70;
        const runbookGapX = 20;
        const runbookGapY = 20;

        orphanRunbooks.forEach((runbook, rbIndex) => {
            const row = Math.floor(rbIndex / maxPerRow);
            const col = rbIndex % maxPerRow;

            const itemsInThisRow = Math.min(maxPerRow, orphanRunbooks.length - (row * maxPerRow));
            const rowWidth = (itemsInThisRow * runbookWidth) + ((itemsInThisRow - 1) * runbookGapX);
            const startX = orphanX - (rowWidth / 2) + (runbookWidth / 2);

            const rbX = startX + (col * (runbookWidth + runbookGapX));
            const rbY = positionTracker.categoryY + 100 + (row * (runbookHeight + runbookGapY));

            const lastRun = lastRunMap[runbook.name];
            const statusKey = lastRun?.status ?? "NeverRun";
            const visual = JOB_STATUS_VISUAL[statusKey] ?? JOB_STATUS_VISUAL["NeverRun"];

            nodes.push({
                id: runbook.id,
                type: "runbookNode",
                data: {
                    label: runbook.name,
                    nodeType: "runbook",
                    resourceId: runbook.id,
                    name: runbook.name,
                    lastRun: lastRun ?? null,
                    statusVisual: visual,
                    hasWarnings: lastRun?.hasWarnings ?? false,
                    hasChildren: false,
                    childCount: 0,
                },
                position: { x: rbX, y: rbY },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                draggable: true,
                className: "font-medium rounded-lg shadow-sm border px-3 py-1.5 cursor-grab",
                style: {
                    background: COLORS.runbookItem.bg,
                    color: COLORS.runbookItem.text,
                    borderColor: visual.border,
                    borderWidth: "2px",
                    minWidth: "160px",
                    maxWidth: "180px",
                },
            });

            structuralEdges.push({
                id: `e-${orphanCategoryId}-${runbook.id}`,
                source: orphanCategoryId,
                target: runbook.id,
                animated: false,
                style: { stroke: "#cbd5e1" },
            });
        });
    }

    return { nodes, edges: structuralEdges };
};

// ════════════════════════════════════════════════════════════════════════════
// Single Runbook View: Show one runbook and its entire dependency tree
// Layout: Account -> Runbook -> Dependencies (in categories)
// ════════════════════════════════════════════════════════════════════════════

export const transformSingleRunbookView = (data: AutomationData, runbookId: string) => {
    const nodes: Node[] = [];
    const structuralEdges: Edge[] = [];
    const dependencyEdges: Edge[] = [];

    const rootId = data.account.id;
    const lastRunMap = data.lastRunByRunbook ?? {};

    // Find the selected runbook
    const runbook = data.runbooks.find(rb => rb.id === runbookId);
    if (!runbook) {
        return { nodes: [], edges: [] };
    }

    // ── RANK 0 — Automation Account ───────────────────────────────────────────
    const identityStatus = parseIdentityStatus(data.account);
    const accountLabel = `⚡ ${data.account.name}\n${identityStatus.icon} ${identityStatus.label}`;

    nodes.push({
        id: rootId,
        type: "default",
        data: {
            label: accountLabel,
            nodeType: "account",
            resourceId: rootId,
            name: data.account.name,
            identityStatus,
        },
        position: { x: 0, y: 0 },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        draggable: false,
        className: "font-bold rounded-xl shadow-xl cursor-default border-2 px-4 py-2 whitespace-pre-line text-center leading-snug",
        style: { background: COLORS.account.bg, color: COLORS.account.text, borderColor: COLORS.account.border, minWidth: "200px" },
    });

    // ── RANK 1 — The selected Runbook ─────────────────────────────────────────
    const lastRun = lastRunMap[runbook.name];
    const statusKey = lastRun?.status ?? "NeverRun";
    const visual = JOB_STATUS_VISUAL[statusKey] ?? JOB_STATUS_VISUAL["NeverRun"];

    // Count dependencies for the runbook
    const deps = runbook.scriptDependencies ?? [];
    const scheduleLinks = data.jobSchedules?.filter(
        l => l.properties.runbook.name.toLowerCase() === runbook.name.toLowerCase()
    ) ?? [];
    const childCount = deps.length + scheduleLinks.length;

    nodes.push({
        id: runbook.id,
        type: "runbookNode",
        data: {
            label: runbook.name,
            nodeType: "runbook",
            resourceId: runbook.id,
            name: runbook.name,
            lastRun: lastRun ?? null,
            statusVisual: visual,
            hasWarnings: lastRun?.hasWarnings ?? false,
            hasChildren: childCount > 0,
            childCount: childCount,
            isExpanded: true,
            runbookState: runbook.properties?.state ?? null,
        },
        position: { x: 0, y: 0 },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        draggable: true,
        className: "font-medium rounded-lg shadow-lg border-2 px-4 py-2 cursor-grab",
        style: {
            background: COLORS.runbookItem.bg,
            color: COLORS.runbookItem.text,
            borderColor: visual.border,
            borderWidth: "3px",
            minWidth: "200px",
        },
    });

    structuralEdges.push({
        id: `e-${rootId}-${runbook.id}`,
        source: rootId,
        target: runbook.id,
        animated: true,
        style: { stroke: "#6366f1", strokeWidth: 3 },
    });

    // Collect used assets by category
    const usedAssets = {
        variables: new Set<string>(),
        credentials: new Set<string>(),
        connections: new Set<string>(),
        certificates: new Set<string>(),
    };

    deps.forEach(dep => {
        const name = dep.name.toLowerCase();
        switch (dep.resourceType) {
            case "Variable":    usedAssets.variables.add(name); break;
            case "Credential":  usedAssets.credentials.add(name); break;
            case "Connection":  usedAssets.connections.add(name); break;
            case "Certificate": usedAssets.certificates.add(name); break;
        }
    });

    // ── Category definitions for dependencies ─────────────────────────────────
    const categories = [
        { key: "variables",    id: `${runbook.id}-variables`,    label: "𝑥 Variables",    nodeType: "variable",    tileColor: COLORS.variables,    itemColor: COLORS.variableItem,    items: data.variables?.filter(v => usedAssets.variables.has(v.name.toLowerCase())) ?? [] },
        { key: "credentials",  id: `${runbook.id}-credentials`,  label: "🔑 Credentials",  nodeType: "credential",  tileColor: COLORS.credentials,  itemColor: COLORS.credentialItem,  items: data.credentials?.filter(c => usedAssets.credentials.has(c.name.toLowerCase())) ?? [] },
        { key: "connections",  id: `${runbook.id}-connections`,  label: "🔌 Connections",  nodeType: "connection",  tileColor: COLORS.connections,  itemColor: COLORS.connectionItem,  items: data.connections?.filter(c => usedAssets.connections.has(c.name.toLowerCase())) ?? [] },
        { key: "certificates", id: `${runbook.id}-certificates`, label: "🛡️ Certificates", nodeType: "certificate", tileColor: COLORS.certificates, itemColor: COLORS.certificateItem, items: data.certificates?.filter(c => usedAssets.certificates.has(c.name.toLowerCase())) ?? [] },
    ];

    // Add category nodes and their items
    categories.forEach((cat) => {
        if (cat.items.length === 0) return;

        // Add category node
        nodes.push({
            id: cat.id,
            type: "default",
            data: { label: `${cat.label} (${cat.items.length})`, nodeType: "category", resourceId: cat.id, name: cat.label },
            position: { x: 0, y: 0 },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            draggable: false,
            className: "font-semibold rounded-lg border-2 shadow-lg px-3 py-2 cursor-default",
            style: { background: cat.tileColor.bg, color: cat.tileColor.text, borderColor: cat.tileColor.border },
        });

        structuralEdges.push({
            id: `e-${runbook.id}-${cat.id}`,
            source: runbook.id,
            target: cat.id,
            animated: false,
            style: { stroke: cat.tileColor.border, strokeWidth: 2 },
        });

        // Add individual items
        cat.items.forEach((item: AutomationResource) => {
            let extraData: Record<string, any> = {};
            let borderColor = cat.itemColor.border;

            // Certificate expiry badge
            if (cat.nodeType === "certificate") {
                const expiryStatus = getCertificateExpiryStatus(item.properties?.expiryTime);
                extraData = { expiryStatus };
                if (expiryStatus.badgeLabel && expiryStatus.badgeColor) {
                    borderColor = expiryStatus.borderColor!;
                }
            }

            nodes.push({
                id: item.id,
                type: cat.nodeType === "certificate" ? "certificateNode" : "default",
                data: {
                    label: item.name,
                    nodeType: cat.nodeType,
                    resourceId: item.id,
                    name: item.name,
                    ...extraData,
                },
                position: { x: 0, y: 0 },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                draggable: true,
                className: "font-medium rounded-lg shadow-sm border px-4 py-2 cursor-grab",
                style: {
                    background: cat.itemColor.bg,
                    color: cat.itemColor.text,
                    borderColor,
                },
            });

            structuralEdges.push({
                id: `e-${cat.id}-${item.id}`,
                source: cat.id,
                target: item.id,
                animated: false,
                style: { stroke: "#cbd5e1" },
            });
        });
    });

    // ── Broken / Missing dependencies ─────────────────────────────────────────
    // Find deps whose target asset doesn't exist in the automation account.
    // These are rendered as distinct red "missing" nodes so users can see broken links.
    const resTypeToKey: Record<string, string> = {
        Variable:    "variables",
        Credential:  "credentials",
        Connection:  "connections",
        Certificate: "certificates",
    };
    const brokenCatConfig: Record<string, { label: string; tileColor: { bg: string; text: string; border: string }; itemColor: { bg: string; text: string; border: string } }> = {
        Variable:    { label: "𝑥 Variables",    tileColor: COLORS.variables,    itemColor: COLORS.variableItem },
        Credential:  { label: "🔑 Credentials",  tileColor: COLORS.credentials,  itemColor: COLORS.credentialItem },
        Connection:  { label: "🔌 Connections",  tileColor: COLORS.connections,  itemColor: COLORS.connectionItem },
        Certificate: { label: "🛡️ Certificates", tileColor: COLORS.certificates, itemColor: COLORS.certificateItem },
    };

    const brokenDeps = deps.filter(dep => {
        switch (dep.resourceType) {
            case "Variable":    return !data.variables?.some(v => v.name.toLowerCase() === dep.name.toLowerCase());
            case "Credential":  return !data.credentials?.some(c => c.name.toLowerCase() === dep.name.toLowerCase());
            case "Connection":  return !data.connections?.some(c => c.name.toLowerCase() === dep.name.toLowerCase());
            case "Certificate": return !data.certificates?.some(c => c.name.toLowerCase() === dep.name.toLowerCase());
            default: return false;
        }
    });

    // Group broken deps by resource type
    const brokenByType: Record<string, typeof deps> = {};
    brokenDeps.forEach(dep => {
        if (!brokenByType[dep.resourceType]) brokenByType[dep.resourceType] = [];
        brokenByType[dep.resourceType].push(dep);
    });

    Object.entries(brokenByType).forEach(([resourceType, brokenList]) => {
        const conf = brokenCatConfig[resourceType];
        if (!conf) return;
        const catId = `${runbook.id}-${resTypeToKey[resourceType]}`;

        // Add category node only if it wasn't created by resolved deps
        if (!nodes.some(n => n.id === catId)) {
            nodes.push({
                id: catId,
                type: "default",
                data: { label: `${conf.label} (0 found)`, nodeType: "category", resourceId: catId, name: conf.label },
                position: { x: 0, y: 0 },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                draggable: false,
                className: "font-semibold rounded-lg border-2 shadow-lg px-3 py-2 cursor-default",
                style: { background: conf.tileColor.bg, color: conf.tileColor.text, borderColor: "#dc2626" },
            });
            structuralEdges.push({
                id: `e-${runbook.id}-${catId}`,
                source: runbook.id,
                target: catId,
                animated: false,
                style: { stroke: "#dc2626", strokeWidth: 2, strokeDasharray: "6 3" },
            });
        }

        // Add a "missing" node for each unresolved dep
        brokenList.forEach(dep => {
            const missingNodeId = `missing-${runbook.id}-${dep.resourceType}-${dep.name}`;
            nodes.push({
                id: missingNodeId,
                type: "default",
                data: {
                    label: `⛔ ${dep.name}`,
                    nodeType: "missing",
                    resourceId: missingNodeId,
                    name: dep.name,
                },
                position: { x: 0, y: 0 },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                draggable: true,
                className: "font-semibold rounded-lg border-2 px-4 py-2 cursor-grab text-center",
                style: {
                    background: "#fef2f2",
                    color: "#991b1b",
                    borderColor: "#dc2626",
                    borderStyle: "dashed",
                    minWidth: "140px",
                    boxShadow: "0 0 0 2px #fca5a540",
                },
            });
            // Plain red dashed edge: category → missing node
            dependencyEdges.push({
                id: `e-broken-${runbook.id}-${dep.resourceType}-${dep.name}`,
                source: catId,
                target: missingNodeId,
                animated: false,
                label: "MISSING",
                style: { stroke: "#dc2626", strokeWidth: 2, strokeDasharray: "6 3" },
                labelStyle: { fill: "#dc2626", fontWeight: 700, fontSize: 10 },
            });
        });
    });

    // ── Schedules linked to this runbook ──────────────────────────────────────
    if (scheduleLinks.length > 0) {
        const schedulesCategoryId = `${runbook.id}-schedules`;

        nodes.push({
            id: schedulesCategoryId,
            type: "default",
            data: { label: `🕐 Schedules (${scheduleLinks.length})`, nodeType: "category", resourceId: schedulesCategoryId, name: "Schedules" },
            position: { x: 0, y: 0 },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            draggable: false,
            className: "font-semibold rounded-lg border-2 shadow-lg px-3 py-2 cursor-default",
            style: { background: COLORS.scheduleEnabled.bg, color: COLORS.scheduleEnabled.text, borderColor: COLORS.scheduleEnabled.border },
        });

        structuralEdges.push({
            id: `e-${runbook.id}-${schedulesCategoryId}`,
            source: runbook.id,
            target: schedulesCategoryId,
            animated: false,
            style: { stroke: COLORS.scheduleEnabled.border, strokeWidth: 2 },
        });

        scheduleLinks.forEach(link => {
            const schedule = data.schedules?.find(s => s.name.toLowerCase() === link.properties.schedule.name.toLowerCase());
            if (!schedule) return;

            const isEnabled = schedule.properties.isEnabled !== false;
            const colors = isEnabled ? COLORS.scheduleEnabled : COLORS.scheduleDisabled;
            const freq = schedule.properties.frequency ?? "Unknown";
            const nodeLabel = `🕐 ${schedule.name}\n${freq}${isEnabled ? "" : " (Disabled)"}`;

            nodes.push({
                id: schedule.id,
                type: "default",
                data: {
                    label: nodeLabel,
                    nodeType: "schedule",
                    resourceId: schedule.id,
                    name: schedule.name,
                    schedule: schedule,
                    runOn: link.properties.runOn ?? null,
                },
                position: { x: 0, y: 0 },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                draggable: true,
                className: "font-medium rounded-lg shadow-sm border px-3 py-2 cursor-grab whitespace-pre-line text-center",
                style: { background: colors.bg, color: colors.text, borderColor: colors.border },
            });

            structuralEdges.push({
                id: `e-${schedulesCategoryId}-${schedule.id}`,
                source: schedulesCategoryId,
                target: schedule.id,
                animated: false,
                style: { stroke: "#cbd5e1" },
            });
        });
    }

    // ── Key Vault references ──────────────────────────────────────────────────
    const kvUsage = runbook.keyVaultUsage ?? [];
    if (kvUsage.length > 0) {
        const kvCategoryId = `${runbook.id}-keyvault`;
        const totalItems = kvUsage.reduce((sum, v) => sum + v.secrets.length + v.keys.length + v.certificates.length, 0);

        nodes.push({
            id: kvCategoryId,
            type: "default",
            data: { label: `🔐 Key Vault (${totalItems})`, nodeType: "category", resourceId: kvCategoryId, name: "Key Vault" },
            position: { x: 0, y: 0 },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            draggable: false,
            className: "font-semibold rounded-lg border-2 shadow-lg px-3 py-2 cursor-default",
            style: { background: COLORS.keyVault.bg, color: COLORS.keyVault.text, borderColor: COLORS.keyVault.border },
        });

        structuralEdges.push({
            id: `e-${runbook.id}-${kvCategoryId}`,
            source: runbook.id,
            target: kvCategoryId,
            animated: false,
            style: { stroke: COLORS.keyVault.border, strokeWidth: 2 },
        });

        // Add vault nodes
        kvUsage.forEach((vault, vaultIdx) => {
            const vaultNodeId = `${runbook.id}-kv-${vaultIdx}-${vault.vaultName}`;
            const vaultSecrets = vault.secrets ?? [];
            const vaultKeys = vault.keys ?? [];
            const vaultCerts = vault.certificates ?? [];

            nodes.push({
                id: vaultNodeId,
                type: "keyVaultNode",
                data: {
                    label: `🔐 ${vault.vaultName}`,
                    nodeType: "keyVault",
                    resourceId: vaultNodeId,
                    name: vault.vaultName,
                    secrets: vaultSecrets,
                    keys: vaultKeys,
                    certificates: vaultCerts,
                },
                position: { x: 0, y: 0 },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                draggable: true,
                className: "font-medium rounded-lg shadow-sm border px-3 py-2 cursor-grab",
                style: { background: COLORS.keyVaultItem.bg, color: COLORS.keyVaultItem.text, borderColor: COLORS.keyVaultItem.border },
            });

            structuralEdges.push({
                id: `e-${kvCategoryId}-${vaultNodeId}`,
                source: kvCategoryId,
                target: vaultNodeId,
                animated: false,
                style: { stroke: "#cbd5e1" },
            });

            // Add secret nodes
            vaultSecrets.forEach((secret, idx) => {
                const secretNodeId = `${vaultNodeId}-secret-${idx}`;
                const colors = secret.isPlainText ? COLORS.kvSecretDanger : COLORS.kvSecret;

                nodes.push({
                    id: secretNodeId,
                    type: "kvSecretNode",
                    data: {
                        label: `🔑 ${secret.name}`,
                        nodeType: "kvSecret",
                        resourceId: secretNodeId,
                        name: secret.name,
                        isPlainText: secret.isPlainText,
                    },
                    position: { x: 0, y: 0 },
                    sourcePosition: Position.Bottom,
                    targetPosition: Position.Top,
                    draggable: true,
                    className: "font-medium rounded-lg shadow-sm border px-3 py-1.5 cursor-grab",
                    style: { background: colors.bg, color: colors.text, borderColor: colors.border },
                });

                structuralEdges.push({
                    id: `e-${vaultNodeId}-${secretNodeId}`,
                    source: vaultNodeId,
                    target: secretNodeId,
                    animated: false,
                    style: { stroke: "#cbd5e1" },
                });
            });

            // Add key nodes
            vaultKeys.forEach((key, idx) => {
                const keyNodeId = `${vaultNodeId}-key-${idx}`;

                nodes.push({
                    id: keyNodeId,
                    type: "kvKeyNode",
                    data: {
                        label: `🗝️ ${key.name}`,
                        nodeType: "kvKey",
                        resourceId: keyNodeId,
                        name: key.name,
                    },
                    position: { x: 0, y: 0 },
                    sourcePosition: Position.Bottom,
                    targetPosition: Position.Top,
                    draggable: true,
                    className: "font-medium rounded-lg shadow-sm border px-3 py-1.5 cursor-grab",
                    style: { background: COLORS.kvKey.bg, color: COLORS.kvKey.text, borderColor: COLORS.kvKey.border },
                });

                structuralEdges.push({
                    id: `e-${vaultNodeId}-${keyNodeId}`,
                    source: vaultNodeId,
                    target: keyNodeId,
                    animated: false,
                    style: { stroke: "#cbd5e1" },
                });
            });

            // Add certificate nodes
            vaultCerts.forEach((cert, idx) => {
                const certNodeId = `${vaultNodeId}-cert-${idx}`;

                nodes.push({
                    id: certNodeId,
                    type: "kvCertNode",
                    data: {
                        label: `📜 ${cert.name}`,
                        nodeType: "kvCertificate",
                        resourceId: certNodeId,
                        name: cert.name,
                    },
                    position: { x: 0, y: 0 },
                    sourcePosition: Position.Bottom,
                    targetPosition: Position.Top,
                    draggable: true,
                    className: "font-medium rounded-lg shadow-sm border px-3 py-1.5 cursor-grab",
                    style: { background: COLORS.kvCertificate.bg, color: COLORS.kvCertificate.text, borderColor: COLORS.kvCertificate.border },
                });

                structuralEdges.push({
                    id: `e-${vaultNodeId}-${certNodeId}`,
                    source: vaultNodeId,
                    target: certNodeId,
                    animated: false,
                    style: { stroke: "#cbd5e1" },
                });
            });
        });
    }

    // ── Azure VM targets ───────────────────────────────────────────────────────
    const vmUsages = runbook.vmUsage ?? [];
    if (vmUsages.length > 0) {
        const vmCatId = `${runbook.id}-azvms`;

        nodes.push({
            id: vmCatId,
            type: "default",
            data: { label: `🖥️ Azure VMs (${vmUsages.length})`, nodeType: "category", resourceId: vmCatId, name: "Azure VMs" },
            position: { x: 0, y: 0 },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            draggable: false,
            className: "font-semibold rounded-lg border-2 shadow-lg px-3 py-2 cursor-default",
            style: { background: "#e0f2fe", color: "#0c4a6e", borderColor: "#0284c7" },
        });

        structuralEdges.push({
            id: `e-${runbook.id}-${vmCatId}`,
            source: runbook.id,
            target: vmCatId,
            animated: false,
            style: { stroke: "#0284c7", strokeWidth: 2 },
        });

        vmUsages.forEach((vm, idx) => {
            const vmNodeId = `${runbook.id}-vm-${idx}`;
            const vmColor =
                vm.action === "Start"   ? { bg: "#f0fdf4", text: "#14532d", border: "#16a34a" } :
                vm.action === "Stop"    ? { bg: "#fef2f2", text: "#7f1d1d", border: "#dc2626" } :
                vm.action === "Restart" ? { bg: "#fff7ed", text: "#7c2d12", border: "#f97316" } :
                                          { bg: "#eff6ff", text: "#1e3a5f", border: "#3b82f6" };
            const actionIcon =
                vm.action === "Start"   ? "▶" :
                vm.action === "Stop"    ? "⏹" :
                vm.action === "Restart" ? "🔄" : "📋";
            const displayName = vm.vmName
                ? (vm.resourceGroup ? `${vm.vmName}\n${vm.resourceGroup}` : vm.vmName)
                : vm.vmId
                    ? vm.vmId.split("/").pop() ?? vm.vmId   // use last segment of resource ID
                    : `${vm.action}-AzVM`;

            nodes.push({
                id: vmNodeId,
                type: "default",
                data: {
                    label: `${actionIcon} ${displayName}`,
                    nodeType: "azureVm",
                    resourceId: vmNodeId,
                    name: vm.vmName ?? vm.vmId ?? "Unknown VM",
                    action: vm.action,
                    vmName: vm.vmName,
                    resourceGroup: vm.resourceGroup,
                    vmId: vm.vmId,
                },
                position: { x: 0, y: 0 },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                draggable: true,
                className: "font-medium rounded-lg border-2 px-3 py-2 cursor-grab whitespace-pre-line text-center",
                style: { background: vmColor.bg, color: vmColor.text, borderColor: vmColor.border, minWidth: "160px" },
            });

            structuralEdges.push({
                id: `e-${vmCatId}-${vmNodeId}`,
                source: vmCatId,
                target: vmNodeId,
                animated: vm.action === "Start" || vm.action === "Restart",
                label: vm.action,
                style: { stroke: vmColor.border, strokeWidth: 2 },
                labelStyle: { fill: vmColor.border, fontWeight: 700, fontSize: 10 },
            });
        });
    }

    // ── HTTP Web Requests ─────────────────────────────────────────────────────
    const webRequests = runbook.webRequestUsage ?? [];
    if (webRequests.length > 0) {
        const httpCatId = `${runbook.id}-httprequests`;

        nodes.push({
            id: httpCatId,
            type: "default",
            data: { label: `🌐 HTTP Requests (${webRequests.length})`, nodeType: "category", resourceId: httpCatId, name: "HTTP Requests" },
            position: { x: 0, y: 0 },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            draggable: false,
            className: "font-semibold rounded-lg border-2 shadow-lg px-3 py-2 cursor-default",
            style: { background: "#f0f9ff", color: "#0c4a6e", borderColor: "#0284c7" },
        });

        structuralEdges.push({
            id: `e-${runbook.id}-${httpCatId}`,
            source: runbook.id,
            target: httpCatId,
            animated: false,
            style: { stroke: "#0284c7", strokeWidth: 2 },
        });

        // Method badge colours
        const METHOD_COLORS: Record<string, { bg: string; text: string; border: string; badge: string }> = {
            GET:     { bg: "#eff6ff", text: "#1e3a5f", border: "#3b82f6", badge: "#3b82f6" },
            POST:    { bg: "#fff7ed", text: "#7c2d12", border: "#f97316", badge: "#f97316" },
            PUT:     { bg: "#fefce8", text: "#713f12", border: "#eab308", badge: "#ca8a04" },
            DELETE:  { bg: "#fef2f2", text: "#7f1d1d", border: "#dc2626", badge: "#dc2626" },
            PATCH:   { bg: "#f5f3ff", text: "#3b0764", border: "#a855f7", badge: "#9333ea" },
            HEAD:    { bg: "#f0fdf4", text: "#14532d", border: "#22c55e", badge: "#16a34a" },
            OPTIONS: { bg: "#f8fafc", text: "#334155", border: "#94a3b8", badge: "#64748b" },
            DEFAULT: { bg: "#f8fafc", text: "#1e293b", border: "#64748b", badge: "#64748b" },
        };

        webRequests.forEach((req, idx) => {
            const reqNodeId = `${runbook.id}-http-${idx}`;
            const colors = METHOD_COLORS[req.method] ?? METHOD_COLORS.DEFAULT;

            // Display URI — shorten long URLs: show host + path-start
            let uriDisplay = req.uri ?? "(dynamic URI)";
            try {
                if (uriDisplay && !uriDisplay.startsWith("$") && uriDisplay.length > 40) {
                    const url = new URL(uriDisplay);
                    uriDisplay = url.host + (url.pathname !== "/" ? url.pathname : "");
                    if (uriDisplay.length > 40) uriDisplay = uriDisplay.substring(0, 38) + "…";
                }
            } catch { /* keep original if not parseable */ }

            const cmdletLabel = req.cmdlet === "Invoke-RestMethod" ? "REST" : "WEB";
            const nodeLabel = `[${req.method}] ${uriDisplay}\n${req.cmdlet} (${cmdletLabel})`;

            nodes.push({
                id: reqNodeId,
                type: "default",
                data: {
                    label: nodeLabel,
                    nodeType: "httpRequest",
                    resourceId: reqNodeId,
                    name: uriDisplay,
                    method: req.method,
                    uri: req.uri,
                    cmdlet: req.cmdlet,
                },
                position: { x: 0, y: 0 },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                draggable: true,
                className: "font-medium rounded-lg border-2 px-3 py-2 cursor-grab whitespace-pre-line text-center leading-snug",
                style: {
                    background: colors.bg,
                    color: colors.text,
                    borderColor: colors.border,
                    minWidth: "180px",
                },
            });

            structuralEdges.push({
                id: `e-${httpCatId}-${reqNodeId}`,
                source: httpCatId,
                target: reqNodeId,
                animated: false,
                label: req.method,
                style: { stroke: colors.badge, strokeWidth: 2 },
                labelStyle: { fill: colors.badge, fontWeight: 700, fontSize: 10 },
            });
        });
    }

    // ── Hardcoded Secrets ─────────────────────────────────────────────────────
    const hardcodedSecrets = runbook.hardcodedSecrets ?? [];
    if (hardcodedSecrets.length > 0) {
        const secretCatId = `${runbook.id}-hardcoded-secrets`;

        nodes.push({
            id: secretCatId,
            type: "default",
            data: { label: `🔴 Hardcoded Secrets (${hardcodedSecrets.length})`, nodeType: "category", resourceId: secretCatId, name: "Hardcoded Secrets" },
            position: { x: 0, y: 0 },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            draggable: false,
            className: "font-semibold rounded-lg border-2 shadow-lg px-3 py-2 cursor-default",
            style: { background: "#fef2f2", color: "#991b1b", borderColor: "#dc2626" },
        });

        structuralEdges.push({
            id: `e-${runbook.id}-${secretCatId}`,
            source: runbook.id,
            target: secretCatId,
            animated: false,
            label: "SECURITY RISK",
            style: { stroke: "#dc2626", strokeWidth: 2, strokeDasharray: "4 3" },
            labelStyle: { fill: "#dc2626", fontWeight: 700, fontSize: 10 },
        });

        hardcodedSecrets.forEach((secret, idx) => {
            const secretNodeId = `${runbook.id}-secret-${idx}`;
            nodes.push({
                id: secretNodeId,
                type: "default",
                data: { label: `⚠️ ${secret.variableName}\n${secret.value}`, nodeType: "hardcodedSecret", resourceId: secretNodeId, name: secret.variableName },
                position: { x: 0, y: 0 },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                draggable: true,
                className: "font-medium rounded-lg border-2 px-3 py-2 cursor-grab whitespace-pre-line text-center leading-snug",
                style: { background: "#fff1f1", color: "#7f1d1d", borderColor: "#ef4444", minWidth: "150px" },
            });
            structuralEdges.push({
                id: `e-${secretCatId}-${secretNodeId}`,
                source: secretCatId,
                target: secretNodeId,
                animated: false,
                style: { stroke: "#ef4444", strokeWidth: 1.5 },
            });
        });
    }

    // ── Deprecated RunAs Account ──────────────────────────────────────────────
    if (runbook.usesRunAsAccount) {
        const runasNodeId = `${runbook.id}-runas-deprecated`;
        nodes.push({
            id: runasNodeId,
            type: "default",
            data: {
                label: `⚠️ DEPRECATED\nAzureRunAsConnection\nMigrate → Managed Identity`,
                nodeType: "runAsDeprecated",
                resourceId: runasNodeId,
                name: "RunAs Account (Deprecated)",
            },
            position: { x: 0, y: 0 },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            draggable: true,
            className: "font-semibold rounded-lg border-2 px-3 py-2 cursor-grab whitespace-pre-line text-center leading-snug",
            style: { background: "#fff7ed", color: "#7c2d12", borderColor: "#f97316", minWidth: "200px" },
        });
        structuralEdges.push({
            id: `e-${runbook.id}-${runasNodeId}`,
            source: runbook.id,
            target: runasNodeId,
            animated: false,
            label: "DEPRECATED",
            style: { stroke: "#f97316", strokeWidth: 2, strokeDasharray: "4 3" },
            labelStyle: { fill: "#f97316", fontWeight: 700, fontSize: 10 },
        });
    }

    // ── Child Runbook Calls ───────────────────────────────────────────────────
    const childCalls = runbook.childRunbookCalls ?? [];
    if (childCalls.length > 0) {
        const callsCatId = `${runbook.id}-child-runbooks`;

        nodes.push({
            id: callsCatId,
            type: "default",
            data: { label: `📜 Calls Runbooks (${childCalls.length})`, nodeType: "category", resourceId: callsCatId, name: "Child Runbooks" },
            position: { x: 0, y: 0 },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            draggable: false,
            className: "font-semibold rounded-lg border-2 shadow-lg px-3 py-2 cursor-default",
            style: { background: "#f5f3ff", color: "#4c1d95", borderColor: "#7c3aed" },
        });

        structuralEdges.push({
            id: `e-${runbook.id}-${callsCatId}`,
            source: runbook.id,
            target: callsCatId,
            animated: true,
            style: { stroke: "#7c3aed", strokeWidth: 2 },
        });

        childCalls.forEach((call, idx) => {
            const callNodeId  = `${runbook.id}-child-${idx}`;
            const waitLabel   = call.wait ? "⏳ Sync (-Wait)" : "🚀 Async";
            const nodeLabel   = `📜 ${call.runbookName}\n${waitLabel}`;

            nodes.push({
                id: callNodeId,
                type: "default",
                data: {
                    label: nodeLabel,
                    nodeType: "runbook",
                    resourceId: callNodeId,
                    name: call.runbookName,
                },
                position: { x: 0, y: 0 },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                draggable: true,
                className: "font-medium rounded-lg border-2 px-3 py-2 cursor-grab whitespace-pre-line text-center leading-snug",
                style: { background: "#f5f3ff", color: "#4c1d95", borderColor: call.wait ? "#6d28d9" : "#a78bfa", minWidth: "170px" },
            });

            structuralEdges.push({
                id: `e-${callsCatId}-${callNodeId}`,
                source: callsCatId,
                target: callNodeId,
                animated: call.wait,
                label: call.wait ? "wait" : "async",
                style: { stroke: call.wait ? "#7c3aed" : "#a78bfa", strokeWidth: 2 },
                labelStyle: { fill: "#7c3aed", fontWeight: 700, fontSize: 10 },
            });
        });
    }

    // ── Email / Notifications ─────────────────────────────────────────────────
    const emailUsages = runbook.emailUsage ?? [];
    if (emailUsages.length > 0) {
        const emailCatId = `${runbook.id}-notifications`;

        nodes.push({
            id: emailCatId,
            type: "default",
            data: { label: `📧 Notifications (${emailUsages.length})`, nodeType: "category", resourceId: emailCatId, name: "Notifications" },
            position: { x: 0, y: 0 },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            draggable: false,
            className: "font-semibold rounded-lg border-2 shadow-lg px-3 py-2 cursor-default",
            style: { background: "#eff6ff", color: "#1e3a5f", borderColor: "#3b82f6" },
        });

        structuralEdges.push({
            id: `e-${runbook.id}-${emailCatId}`,
            source: runbook.id,
            target: emailCatId,
            animated: false,
            style: { stroke: "#3b82f6", strokeWidth: 2 },
        });

        emailUsages.forEach((email, idx) => {
            const emailNodeId = `${runbook.id}-email-${idx}`;
            const toLabel     = email.to ? `\nTo: ${email.to}` : "";
            const subjLabel   = email.subject ? `\n${email.subject}` : "";
            const nodeLabel   = `📧 ${email.cmdlet}${toLabel}${subjLabel}`;

            nodes.push({
                id: emailNodeId,
                type: "default",
                data: { label: nodeLabel, nodeType: "email", resourceId: emailNodeId, name: email.cmdlet, to: email.to, subject: email.subject },
                position: { x: 0, y: 0 },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                draggable: true,
                className: "font-medium rounded-lg border px-3 py-2 cursor-grab whitespace-pre-line text-center leading-snug",
                style: { background: "#dbeafe", color: "#1e3a5f", borderColor: "#93c5fd", minWidth: "170px" },
            });

            structuralEdges.push({
                id: `e-${emailCatId}-${emailNodeId}`,
                source: emailCatId,
                target: emailNodeId,
                animated: false,
                label: "sends",
                style: { stroke: "#93c5fd", strokeWidth: 1.5 },
                labelStyle: { fill: "#3b82f6", fontWeight: 600, fontSize: 10 },
            });
        });
    }

    // ── Azure Storage Operations ──────────────────────────────────────────────
    const storageOps = runbook.storageUsage ?? [];
    if (storageOps.length > 0) {
        const storageCatId = `${runbook.id}-storage`;

        nodes.push({
            id: storageCatId,
            type: "default",
            data: { label: `💾 Storage (${storageOps.length})`, nodeType: "category", resourceId: storageCatId, name: "Azure Storage" },
            position: { x: 0, y: 0 },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            draggable: false,
            className: "font-semibold rounded-lg border-2 shadow-lg px-3 py-2 cursor-default",
            style: { background: "#ecfdf5", color: "#064e3b", borderColor: "#10b981" },
        });

        structuralEdges.push({
            id: `e-${runbook.id}-${storageCatId}`,
            source: runbook.id,
            target: storageCatId,
            animated: false,
            style: { stroke: "#10b981", strokeWidth: 2 },
        });

        storageOps.forEach((op, idx) => {
            const storageNodeId  = `${runbook.id}-storage-${idx}`;
            const containerLabel = op.container ? `\n📁 ${op.container}` : "";
            const blobLabel      = op.blobName  ? `\n${op.blobName}`     : "";
            const actionIcon     =
                op.action === "Upload"   ? "⬆" :
                op.action === "Download" ? "⬇" :
                op.action === "Delete"   ? "🗑" :
                op.action === "New"      ? "🆕" : "📂";
            const nodeLabel = `${actionIcon} ${op.action}\n${op.cmdlet}${containerLabel}${blobLabel}`;
            const opColor   =
                op.action === "Upload"   ? { bg: "#f0fdf4", text: "#14532d", border: "#22c55e" } :
                op.action === "Download" ? { bg: "#eff6ff", text: "#1e3a5f", border: "#3b82f6" } :
                op.action === "Delete"   ? { bg: "#fef2f2", text: "#7f1d1d", border: "#ef4444" } :
                                          { bg: "#ecfdf5", text: "#064e3b", border: "#10b981" };

            nodes.push({
                id: storageNodeId,
                type: "default",
                data: { label: nodeLabel, nodeType: "storageOp", resourceId: storageNodeId, name: op.cmdlet, action: op.action, container: op.container, blobName: op.blobName },
                position: { x: 0, y: 0 },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                draggable: true,
                className: "font-medium rounded-lg border-2 px-3 py-2 cursor-grab whitespace-pre-line text-center leading-snug",
                style: { background: opColor.bg, color: opColor.text, borderColor: opColor.border, minWidth: "160px" },
            });

            structuralEdges.push({
                id: `e-${storageCatId}-${storageNodeId}`,
                source: storageCatId,
                target: storageNodeId,
                animated: op.action === "Upload",
                label: op.action,
                style: { stroke: opColor.border, strokeWidth: 2 },
                labelStyle: { fill: opColor.border, fontWeight: 700, fontSize: 10 },
            });
        });
    }

    // ── SQL / Database Operations ─────────────────────────────────────────────
    const sqlOps = runbook.sqlUsage ?? [];
    if (sqlOps.length > 0) {
        const sqlCatId = `${runbook.id}-sql`;

        nodes.push({
            id: sqlCatId,
            type: "default",
            data: { label: `🗄️ Database (${sqlOps.length})`, nodeType: "category", resourceId: sqlCatId, name: "Database" },
            position: { x: 0, y: 0 },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
            draggable: false,
            className: "font-semibold rounded-lg border-2 shadow-lg px-3 py-2 cursor-default",
            style: { background: "#f8fafc", color: "#1e293b", borderColor: "#334155" },
        });

        structuralEdges.push({
            id: `e-${runbook.id}-${sqlCatId}`,
            source: runbook.id,
            target: sqlCatId,
            animated: false,
            style: { stroke: "#334155", strokeWidth: 2 },
        });

        sqlOps.forEach((op, idx) => {
            const sqlNodeId    = `${runbook.id}-sql-${idx}`;
            const serverLabel  = op.serverInstance ? `\n🖥 ${op.serverInstance}` : "";
            const dbLabel      = op.database       ? `\n📊 ${op.database}`       : "";
            const nodeLabel    = `🗄️ ${op.cmdlet}${serverLabel}${dbLabel}`;

            nodes.push({
                id: sqlNodeId,
                type: "default",
                data: { label: nodeLabel, nodeType: "sqlOp", resourceId: sqlNodeId, name: op.cmdlet, serverInstance: op.serverInstance, database: op.database },
                position: { x: 0, y: 0 },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                draggable: true,
                className: "font-medium rounded-lg border px-3 py-2 cursor-grab whitespace-pre-line text-center leading-snug",
                style: { background: "#f1f5f9", color: "#1e293b", borderColor: "#475569", minWidth: "160px" },
            });

            structuralEdges.push({
                id: `e-${sqlCatId}-${sqlNodeId}`,
                source: sqlCatId,
                target: sqlNodeId,
                animated: false,
                label: "query",
                style: { stroke: "#475569", strokeWidth: 1.5 },
                labelStyle: { fill: "#475569", fontWeight: 600, fontSize: 10 },
            });
        });
    }

    // ── Hybrid Worker if runbook runs on one ──────────────────────────────────
    const hwGroupName = lastRun?.runOn;
    if (hwGroupName && data.hybridWorkerGroups) {
        const hwGroup = data.hybridWorkerGroups.find(
            g => g.name.toLowerCase() === hwGroupName.toLowerCase()
        );
        if (hwGroup) {
            const hwCategoryId = `${runbook.id}-hybridworker`;

            nodes.push({
                id: hwCategoryId,
                type: "default",
                data: { label: "⚙️ Hybrid Worker", nodeType: "category", resourceId: hwCategoryId, name: "Hybrid Worker" },
                position: { x: 0, y: 0 },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                draggable: false,
                className: "font-semibold rounded-lg border-2 shadow-lg px-3 py-2 cursor-default",
                style: { background: COLORS.hybridWorkers.bg, color: COLORS.hybridWorkers.text, borderColor: COLORS.hybridWorkers.border },
            });

            structuralEdges.push({
                id: `e-${runbook.id}-${hwCategoryId}`,
                source: runbook.id,
                target: hwCategoryId,
                animated: false,
                style: { stroke: COLORS.hybridWorkers.border, strokeWidth: 2 },
            });

            // Add the group node
            nodes.push({
                id: hwGroup.id,
                type: "default",
                data: {
                    label: `⚙️ ${hwGroup.name}\n${hwGroup.workers.length} worker${hwGroup.workers.length !== 1 ? "s" : ""}`,
                    nodeType: "hybridWorkerGroup",
                    resourceId: hwGroup.id,
                    name: hwGroup.name,
                },
                position: { x: 0, y: 0 },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
                draggable: true,
                className: "font-medium rounded-lg shadow-sm border px-3 py-2 cursor-grab whitespace-pre-line text-center",
                style: { background: COLORS.hybridGroupItem.bg, color: COLORS.hybridGroupItem.text, borderColor: COLORS.hybridGroupItem.border },
            });

            structuralEdges.push({
                id: `e-${hwCategoryId}-${hwGroup.id}`,
                source: hwCategoryId,
                target: hwGroup.id,
                animated: false,
                style: { stroke: "#cbd5e1" },
            });

            // Add workers
            hwGroup.workers.forEach(worker => {
                const workerStatus = getWorkerStatus(worker.properties.lastSeenDateTime);
                const workerColors = workerStatus === "online" ? COLORS.workerOnline
                    : workerStatus === "offline" ? COLORS.workerOffline : COLORS.workerUnknown;

                nodes.push({
                    id: worker.id,
                    type: "default",
                    data: {
                        label: worker.name,
                        nodeType: "hybridWorker",
                        resourceId: worker.id,
                        name: worker.name,
                        workerStatus,
                        vmResourceId: worker.properties.vmResourceId,
                        lastSeenDateTime: worker.properties.lastSeenDateTime,
                    },
                    position: { x: 0, y: 0 },
                    sourcePosition: Position.Bottom,
                    targetPosition: Position.Top,
                    draggable: true,
                    className: "font-medium rounded-lg shadow-sm border px-3 py-2 cursor-grab",
                    style: { background: workerColors.bg, color: workerColors.text, borderColor: workerColors.border },
                });

                structuralEdges.push({
                    id: `e-${hwGroup.id}-${worker.id}`,
                    source: hwGroup.id,
                    target: worker.id,
                    animated: false,
                    style: { stroke: workerColors.dot, strokeWidth: 1 },
                });
            });
        }
    }

    // ── Apply Dagre layout ────────────────────────────────────────────────────
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: "TB", ranksep: 100, nodesep: 60 });

    nodes.forEach(node => {
        dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
    });

    [...structuralEdges, ...dependencyEdges].forEach(edge => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map(node => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
            ...node,
            position: {
                x: nodeWithPosition.x - nodeWidth / 2,
                y: nodeWithPosition.y - nodeHeight / 2,
            },
        };
    });

    return { nodes: layoutedNodes, edges: [...structuralEdges, ...dependencyEdges] };
};
