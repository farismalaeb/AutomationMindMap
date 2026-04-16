"use client";

import { useState, useMemo } from "react";
import {
    AutomationData,
    AutomationResource,
    AutomationSchedule,
    RunbookLastRun,
    JobOutput,
} from "@/services/azureService";
import { NodeDetailPanel, SelectedNodeInfo } from "./NodeDetailPanel";
import {
    Search,
    ChevronDown,
    ChevronRight,
    ExternalLink,
    Clock,
    Variable,
    Key,
    Link2,
    Shield,
    Calendar,
    CheckCircle2,
    XCircle,
    AlertCircle,
    PlayCircle,
    Code,
    Server,
    GitBranch,
} from "lucide-react";

interface TableViewProps {
    data: AutomationData;
    onRefreshRunbook?: (runbookName: string) => Promise<void>;
    onFetchJobStreams?: (jobId: string) => Promise<JobOutput>;
}

// Helper to get Azure Portal URL
function getAzurePortalUrl(resourceId: string): string {
    return `https://portal.azure.com/#@/resource${resourceId}`;
}

// Helper to get status color
function getStatusColor(status: string | undefined): { bg: string; text: string; icon: React.ReactNode } {
    switch (status) {
        case "Completed":
            return { bg: "bg-green-100", text: "text-green-700", icon: <CheckCircle2 className="w-3.5 h-3.5" /> };
        case "Failed":
            return { bg: "bg-red-100", text: "text-red-700", icon: <XCircle className="w-3.5 h-3.5" /> };
        case "Running":
            return { bg: "bg-blue-100", text: "text-blue-700", icon: <PlayCircle className="w-3.5 h-3.5" /> };
        case "Stopped":
        case "Suspended":
            return { bg: "bg-yellow-100", text: "text-yellow-700", icon: <AlertCircle className="w-3.5 h-3.5" /> };
        default:
            return { bg: "bg-slate-100", text: "text-slate-600", icon: <Clock className="w-3.5 h-3.5" /> };
    }
}

// Helper to format date
function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    return date.toLocaleString();
}

// Badge component for resource types
function ResourceBadge({ type, name, resourceId }: { type: string; name: string; resourceId?: string }) {
    const config: Record<string, { icon: React.ReactNode; bg: string; text: string }> = {
        Variable: { icon: <Variable className="w-3 h-3" />, bg: "bg-amber-100", text: "text-amber-700" },
        Credential: { icon: <Key className="w-3 h-3" />, bg: "bg-purple-100", text: "text-purple-700" },
        Connection: { icon: <Link2 className="w-3 h-3" />, bg: "bg-cyan-100", text: "text-cyan-700" },
        Certificate: { icon: <Shield className="w-3 h-3" />, bg: "bg-emerald-100", text: "text-emerald-700" },
        Schedule: { icon: <Calendar className="w-3 h-3" />, bg: "bg-indigo-100", text: "text-indigo-700" },
        Cmdlet: { icon: <Code className="w-3 h-3" />, bg: "bg-slate-100", text: "text-slate-700" },
        HybridWorker: { icon: <Server className="w-3 h-3" />, bg: "bg-orange-100", text: "text-orange-700" },
        SourceControl: { icon: <GitBranch className="w-3 h-3" />, bg: "bg-pink-100", text: "text-pink-700" },
    };

    const { icon, bg, text } = config[type] || { icon: null, bg: "bg-slate-100", text: "text-slate-600" };

    const badge = (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>
            {icon}
            {name}
        </span>
    );

    if (resourceId) {
        return (
            <a
                href={getAzurePortalUrl(resourceId)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80 transition-opacity"
            >
                {badge}
            </a>
        );
    }

    return badge;
}

export function TableView({ data, onRefreshRunbook, onFetchJobStreams }: TableViewProps) {
    const [searchTerm, setSearchTerm] = useState("");
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [selectedRunbook, setSelectedRunbook] = useState<SelectedNodeInfo | null>(null);

    // Handle runbook click to show detail panel
    const handleRunbookClick = (runbook: AutomationResource) => {
        setSelectedRunbook({
            nodeType: "runbook",
            resourceId: runbook.id,
            name: runbook.name,
        });
    };

    // Build runbook relationships
    const runbookRelations = useMemo(() => {
        const relations: Record<string, {
            runbook: AutomationResource;
            variables: AutomationResource[];
            credentials: AutomationResource[];
            connections: AutomationResource[];
            certificates: AutomationResource[];
            schedules: AutomationSchedule[];
            lastRun: RunbookLastRun | null;
            cmdlets: { verb: string; noun: string; fullName: string; category: string }[];
            hybridWorkerGroup: string | null;
        }> = {};

        // Initialize with all runbooks
        data.runbooks.forEach((rb) => {
            relations[rb.name] = {
                runbook: rb,
                variables: [],
                credentials: [],
                connections: [],
                certificates: [],
                schedules: [],
                lastRun: data.lastRunByRunbook[rb.name] || null,
                cmdlets: rb.codeAnalysis?.cmdlets || [],
                hybridWorkerGroup: null,
            };
        });

        // Map script dependencies to resources
        data.runbooks.forEach((rb) => {
            if (rb.scriptDependencies) {
                rb.scriptDependencies.forEach((dep) => {
                    const rel = relations[rb.name];
                    if (!rel) return;

                    switch (dep.resourceType) {
                        case "Variable":
                            const variable = data.variables.find((v) => v.name === dep.name);
                            if (variable && !rel.variables.some((v) => v.name === dep.name)) {
                                rel.variables.push(variable);
                            }
                            break;
                        case "Credential":
                            const cred = data.credentials.find((c) => c.name === dep.name);
                            if (cred && !rel.credentials.some((c) => c.name === dep.name)) {
                                rel.credentials.push(cred);
                            }
                            break;
                        case "Connection":
                            const conn = data.connections.find((c) => c.name === dep.name);
                            if (conn && !rel.connections.some((c) => c.name === dep.name)) {
                                rel.connections.push(conn);
                            }
                            break;
                        case "Certificate":
                            const cert = data.certificates.find((c) => c.name === dep.name);
                            if (cert && !rel.certificates.some((c) => c.name === dep.name)) {
                                rel.certificates.push(cert);
                            }
                            break;
                    }
                });
            }
        });

        // Map job schedules to runbooks
        data.jobSchedules.forEach((js) => {
            const runbookName = js.properties.runbook.name;
            const scheduleName = js.properties.schedule.name;
            const schedule = data.schedules.find((s) => s.name === scheduleName);
            const rel = relations[runbookName];
            if (rel && schedule && !rel.schedules.some((s) => s.name === scheduleName)) {
                rel.schedules.push(schedule);
            }
            // Track hybrid worker group
            if (rel && js.properties.runOn) {
                rel.hybridWorkerGroup = js.properties.runOn;
            }
        });

        return relations;
    }, [data]);

    // Filter runbooks based on search
    const filteredRunbooks = useMemo(() => {
        const term = searchTerm.toLowerCase();
        return Object.values(runbookRelations).filter((rel) => {
            if (!term) return true;
            return (
                rel.runbook.name.toLowerCase().includes(term) ||
                rel.variables.some((v) => v.name.toLowerCase().includes(term)) ||
                rel.credentials.some((c) => c.name.toLowerCase().includes(term)) ||
                rel.connections.some((c) => c.name.toLowerCase().includes(term)) ||
                rel.certificates.some((c) => c.name.toLowerCase().includes(term)) ||
                rel.schedules.some((s) => s.name.toLowerCase().includes(term))
            );
        });
    }, [runbookRelations, searchTerm]);

    const toggleRow = (name: string) => {
        setExpandedRows((prev) => {
            const next = new Set(prev);
            if (next.has(name)) {
                next.delete(name);
            } else {
                next.add(name);
            }
            return next;
        });
    };

    const totalResources = (rel: typeof runbookRelations[string]) => {
        return (
            rel.variables.length +
            rel.credentials.length +
            rel.connections.length +
            rel.certificates.length +
            rel.schedules.length
        );
    };

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Search Header */}
            <div className="p-4 border-b border-slate-200 bg-slate-50">
                <div className="relative max-w-md">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search runbooks, resources..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                </div>
                <div className="mt-2 text-xs text-slate-500">
                    Showing {filteredRunbooks.length} of {data.runbooks.length} runbooks
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                <table className="w-full">
                    <thead className="sticky top-0 bg-slate-100 z-10">
                        <tr>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider w-8"></th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Runbook Name</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">State</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Last Run</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Related Resources</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Schedules</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider w-12">Link</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredRunbooks.map((rel) => {
                            const isExpanded = expandedRows.has(rel.runbook.name);
                            const status = getStatusColor(rel.lastRun?.status);
                            const hasResources = totalResources(rel) > 0;

                            return (
                                <>
                                    {/* Main Row */}
                                    <tr
                                        key={rel.runbook.name}
                                        className={`hover:bg-slate-50 transition-colors ${isExpanded ? "bg-slate-50" : ""}`}
                                    >
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => toggleRow(rel.runbook.name)}
                                                className="p-1 hover:bg-slate-200 rounded transition-colors"
                                            >
                                                {isExpanded ? (
                                                    <ChevronDown className="w-4 h-4 text-slate-500" />
                                                ) : (
                                                    <ChevronRight className="w-4 h-4 text-slate-500" />
                                                )}
                                            </button>
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => handleRunbookClick(rel.runbook)}
                                                className="text-left group"
                                            >
                                                <div className="font-medium text-slate-800 group-hover:text-indigo-600 transition-colors">
                                                    {rel.runbook.name}
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                    {rel.runbook.properties?.runbookType || "PowerShell"} • Click for details
                                                </div>
                                            </button>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                                                    rel.runbook.properties?.state === "Published"
                                                        ? "bg-green-100 text-green-700"
                                                        : "bg-yellow-100 text-yellow-700"
                                                }`}
                                            >
                                                {rel.runbook.properties?.state || "Draft"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            {rel.lastRun ? (
                                                <div className="flex flex-col gap-1">
                                                    <span
                                                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${status.bg} ${status.text}`}
                                                    >
                                                        {status.icon}
                                                        {rel.lastRun.status}
                                                    </span>
                                                    <span className="text-xs text-slate-500">
                                                        {formatDate(rel.lastRun.endTime || rel.lastRun.startTime)}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-400">Never run</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-1">
                                                {rel.variables.length > 0 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                                                        <Variable className="w-3 h-3" />
                                                        {rel.variables.length} Variables
                                                    </span>
                                                )}
                                                {rel.credentials.length > 0 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                                        <Key className="w-3 h-3" />
                                                        {rel.credentials.length} Credentials
                                                    </span>
                                                )}
                                                {rel.connections.length > 0 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-700">
                                                        <Link2 className="w-3 h-3" />
                                                        {rel.connections.length} Connections
                                                    </span>
                                                )}
                                                {rel.certificates.length > 0 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                                                        <Shield className="w-3 h-3" />
                                                        {rel.certificates.length} Certificates
                                                    </span>
                                                )}
                                                {!hasResources && (
                                                    <span className="text-xs text-slate-400">No dependencies</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {rel.schedules.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {rel.schedules.slice(0, 2).map((s) => (
                                                        <span
                                                            key={s.name}
                                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                                                s.properties.isEnabled
                                                                    ? "bg-indigo-100 text-indigo-700"
                                                                    : "bg-slate-100 text-slate-500"
                                                            }`}
                                                        >
                                                            <Calendar className="w-3 h-3" />
                                                            {s.name}
                                                        </span>
                                                    ))}
                                                    {rel.schedules.length > 2 && (
                                                        <span className="text-xs text-slate-500">
                                                            +{rel.schedules.length - 2} more
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-400">None</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <a
                                                href={getAzurePortalUrl(rel.runbook.id)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-1.5 hover:bg-indigo-100 rounded-lg transition-colors inline-flex"
                                            >
                                                <ExternalLink className="w-4 h-4 text-indigo-600" />
                                            </a>
                                        </td>
                                    </tr>

                                    {/* Expanded Details Row */}
                                    {isExpanded && (
                                        <tr key={`${rel.runbook.name}-details`} className="bg-slate-50">
                                            <td colSpan={7} className="px-8 py-4">
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                    {/* Variables */}
                                                    {rel.variables.length > 0 && (
                                                        <div>
                                                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                                                <Variable className="w-3.5 h-3.5" />
                                                                Automation Variables
                                                            </h4>
                                                            <div className="flex flex-wrap gap-1">
                                                                {rel.variables.map((v) => (
                                                                    <ResourceBadge
                                                                        key={v.id}
                                                                        type="Variable"
                                                                        name={v.name}
                                                                        resourceId={v.id}
                                                                    />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Credentials */}
                                                    {rel.credentials.length > 0 && (
                                                        <div>
                                                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                                                <Key className="w-3.5 h-3.5" />
                                                                Automation Credentials
                                                            </h4>
                                                            <div className="flex flex-wrap gap-1">
                                                                {rel.credentials.map((c) => (
                                                                    <ResourceBadge
                                                                        key={c.id}
                                                                        type="Credential"
                                                                        name={c.name}
                                                                        resourceId={c.id}
                                                                    />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Connections */}
                                                    {rel.connections.length > 0 && (
                                                        <div>
                                                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                                                <Link2 className="w-3.5 h-3.5" />
                                                                Automation Connections
                                                            </h4>
                                                            <div className="flex flex-wrap gap-1">
                                                                {rel.connections.map((c) => (
                                                                    <ResourceBadge
                                                                        key={c.id}
                                                                        type="Connection"
                                                                        name={c.name}
                                                                        resourceId={c.id}
                                                                    />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Certificates */}
                                                    {rel.certificates.length > 0 && (
                                                        <div>
                                                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                                                <Shield className="w-3.5 h-3.5" />
                                                                Automation Certificates
                                                            </h4>
                                                            <div className="flex flex-wrap gap-1">
                                                                {rel.certificates.map((c) => (
                                                                    <ResourceBadge
                                                                        key={c.id}
                                                                        type="Certificate"
                                                                        name={c.name}
                                                                        resourceId={c.id}
                                                                    />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Schedules */}
                                                    {rel.schedules.length > 0 && (
                                                        <div>
                                                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                                                <Calendar className="w-3.5 h-3.5" />
                                                                Schedules
                                                            </h4>
                                                            <div className="space-y-2">
                                                                {rel.schedules.map((s) => (
                                                                    <div
                                                                        key={s.id}
                                                                        className="text-xs bg-white border border-slate-200 rounded-lg p-2"
                                                                    >
                                                                        <div className="font-medium text-slate-700 flex items-center gap-2">
                                                                            {s.name}
                                                                            <span
                                                                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                                                    s.properties.isEnabled
                                                                                        ? "bg-green-100 text-green-700"
                                                                                        : "bg-slate-100 text-slate-500"
                                                                                }`}
                                                                            >
                                                                                {s.properties.isEnabled ? "Enabled" : "Disabled"}
                                                                            </span>
                                                                        </div>
                                                                        <div className="text-slate-500 mt-1">
                                                                            {s.properties.frequency} • Next: {formatDate(s.properties.nextRun)}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Cmdlets Used */}
                                                    {rel.cmdlets.length > 0 && (
                                                        <div>
                                                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                                                <Code className="w-3.5 h-3.5" />
                                                                Cmdlets Used ({rel.cmdlets.length})
                                                            </h4>
                                                            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                                                                {rel.cmdlets.slice(0, 15).map((cmd, i) => (
                                                                    <span
                                                                        key={`${cmd.fullName}-${i}`}
                                                                        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600"
                                                                    >
                                                                        {cmd.fullName}
                                                                    </span>
                                                                ))}
                                                                {rel.cmdlets.length > 15 && (
                                                                    <span className="text-xs text-slate-500">
                                                                        +{rel.cmdlets.length - 15} more
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Hybrid Worker */}
                                                    {rel.hybridWorkerGroup && (
                                                        <div>
                                                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                                                <Server className="w-3.5 h-3.5" />
                                                                Hybrid Worker Group
                                                            </h4>
                                                            <ResourceBadge type="HybridWorker" name={rel.hybridWorkerGroup} />
                                                        </div>
                                                    )}

                                                    {/* Runbook Description */}
                                                    {rel.runbook.properties?.description && (
                                                        <div className="md:col-span-2 lg:col-span-3">
                                                            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                                                Description
                                                            </h4>
                                                            <p className="text-sm text-slate-600">
                                                                {rel.runbook.properties.description}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            );
                        })}
                    </tbody>
                </table>

                {filteredRunbooks.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                        <Search className="w-12 h-12 text-slate-300 mb-4" />
                        <p className="text-sm font-medium">No runbooks found</p>
                        <p className="text-xs text-slate-400">Try adjusting your search term</p>
                    </div>
                )}
            </div>

            {/* Summary Footer */}
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
                <div className="flex flex-wrap gap-4 text-xs text-slate-600">
                    <span className="flex items-center gap-1">
                        <span className="font-semibold">{data.runbooks.length}</span> Runbooks
                    </span>
                    <span className="flex items-center gap-1">
                        <Variable className="w-3 h-3 text-amber-600" />
                        <span className="font-semibold">{data.variables.length}</span> Variables
                    </span>
                    <span className="flex items-center gap-1">
                        <Key className="w-3 h-3 text-purple-600" />
                        <span className="font-semibold">{data.credentials.length}</span> Credentials
                    </span>
                    <span className="flex items-center gap-1">
                        <Link2 className="w-3 h-3 text-cyan-600" />
                        <span className="font-semibold">{data.connections.length}</span> Connections
                    </span>
                    <span className="flex items-center gap-1">
                        <Shield className="w-3 h-3 text-emerald-600" />
                        <span className="font-semibold">{data.certificates.length}</span> Certificates
                    </span>
                    <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-indigo-600" />
                        <span className="font-semibold">{data.schedules.length}</span> Schedules
                    </span>
                </div>
            </div>

            {/* Detail Panel - same as MindMap view */}
            <NodeDetailPanel
                selected={selectedRunbook}
                data={data}
                onClose={() => setSelectedRunbook(null)}
                onRefreshRunbook={onRefreshRunbook}
                onFetchJobStreams={onFetchJobStreams}
            />
        </div>
    );
}
