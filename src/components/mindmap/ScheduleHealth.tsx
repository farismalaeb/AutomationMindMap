"use client";

import { useMemo } from "react";
import { AutomationSchedule, AutomationJob, AutomationJobSchedule } from "@/services/azureService";
import { AlertTriangle, CheckCircle, Clock, XCircle, Calendar } from "lucide-react";

export interface ScheduleHealthStatus {
    status:            "healthy" | "warning" | "error" | "disabled" | "expired";
    statusLabel:       string;
    statusColor:       string;
    nextRun:           Date | null;
    nextRunLabel:      string;
    lastRun:           Date | null;
    lastRunLabel:      string;
    expectedRuns:      number;
    actualRuns:        number;
    missedRuns:        number;
    missedPercentage:  number;
    frequency:         string;
    linkedRunbooks:    string[];
}

function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const absDiff = Math.abs(diff);

    const minutes = Math.floor(absDiff / (1000 * 60));
    const hours = Math.floor(absDiff / (1000 * 60 * 60));
    const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));

    const prefix = diff < 0 ? "" : "in ";
    const suffix = diff < 0 ? " ago" : "";

    if (days > 0) return `${prefix}${days} day${days > 1 ? "s" : ""}${suffix}`;
    if (hours > 0) return `${prefix}${hours} hour${hours > 1 ? "s" : ""}${suffix}`;
    if (minutes > 0) return `${prefix}${minutes} min${minutes > 1 ? "s" : ""}${suffix}`;
    return "now";
}

function formatDateTime(date: Date): string {
    return date.toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

function calculateExpectedRuns(schedule: AutomationSchedule, lookbackDays: number = 7): number {
    const { frequency, interval, startTime, isEnabled } = schedule.properties;
    if (!isEnabled) return 0;

    const start = new Date(startTime);
    const now = new Date();
    const lookbackStart = new Date(now);
    lookbackStart.setDate(lookbackStart.getDate() - lookbackDays);

    // Use the later of start time or lookback start
    const effectiveStart = start > lookbackStart ? start : lookbackStart;
    if (effectiveStart > now) return 0;

    const durationMs = now.getTime() - effectiveStart.getTime();
    const i = interval ?? 1;

    switch (frequency) {
        case "Minute":  return Math.floor(durationMs / (i * 60 * 1000));
        case "Hour":    return Math.floor(durationMs / (i * 60 * 60 * 1000));
        case "Day":     return Math.floor(durationMs / (i * 24 * 60 * 60 * 1000));
        case "Week":    return Math.floor(durationMs / (i * 7 * 24 * 60 * 60 * 1000));
        case "Month":   return Math.floor(durationMs / (i * 30 * 24 * 60 * 60 * 1000));
        case "OneTime": return effectiveStart <= now ? 1 : 0;
        default:        return 0;
    }
}

function formatFrequencyLabel(schedule: AutomationSchedule): string {
    const { frequency, interval } = schedule.properties;
    const i = interval ?? 1;

    switch (frequency) {
        case "Minute":  return i === 1 ? "Every minute" : `Every ${i} minutes`;
        case "Hour":    return i === 1 ? "Hourly" : `Every ${i} hours`;
        case "Day":     return i === 1 ? "Daily" : `Every ${i} days`;
        case "Week":    return i === 1 ? "Weekly" : `Every ${i} weeks`;
        case "Month":   return i === 1 ? "Monthly" : `Every ${i} months`;
        case "OneTime": return "One-time";
        default:        return frequency;
    }
}

export function analyzeScheduleHealth(
    schedule: AutomationSchedule,
    jobs: AutomationJob[],
    jobSchedules: AutomationJobSchedule[],
    lookbackDays: number = 7
): ScheduleHealthStatus {
    const p = schedule.properties;

    // Get linked runbooks
    const linkedRunbooks = jobSchedules
        .filter(js => js.properties.schedule.name === schedule.name)
        .map(js => js.properties.runbook.name)
        .filter((v, i, a) => a.indexOf(v) === i);

    // Calculate next run
    let nextRun: Date | null = null;
    let nextRunLabel = "—";
    if (p.nextRun) {
        nextRun = new Date(p.nextRun);
        nextRunLabel = formatRelativeTime(nextRun);
    } else if (p.isEnabled) {
        nextRunLabel = "Expired";
    }

    // Find jobs for linked runbooks in the lookback period
    const lookbackStart = new Date();
    lookbackStart.setDate(lookbackStart.getDate() - lookbackDays);

    const relevantJobs = jobs.filter(j => {
        const jobDate = new Date(j.properties.startTime ?? j.properties.creationTime);
        const rbName = j.properties.runbook.name;
        return linkedRunbooks.includes(rbName) && jobDate >= lookbackStart;
    });

    // Get last run
    const sortedJobs = [...relevantJobs].sort((a, b) => {
        const ta = new Date(a.properties.startTime ?? a.properties.creationTime).getTime();
        const tb = new Date(b.properties.startTime ?? b.properties.creationTime).getTime();
        return tb - ta;
    });
    const lastJob = sortedJobs[0];
    const lastRun = lastJob ? new Date(lastJob.properties.startTime ?? lastJob.properties.creationTime) : null;
    const lastRunLabel = lastRun ? formatRelativeTime(lastRun) : "Never";

    // Calculate expected vs actual
    const expectedRuns = calculateExpectedRuns(schedule, lookbackDays);
    const actualRuns = relevantJobs.length;
    const missedRuns = Math.max(0, expectedRuns - actualRuns);
    const missedPercentage = expectedRuns > 0 ? Math.round((missedRuns / expectedRuns) * 100) : 0;

    // Determine health status
    let status: ScheduleHealthStatus["status"];
    let statusLabel: string;
    let statusColor: string;

    if (!p.isEnabled) {
        status = "disabled";
        statusLabel = "Disabled";
        statusColor = "#94a3b8";
    } else if (!p.nextRun) {
        status = "expired";
        statusLabel = "Expired";
        statusColor = "#94a3b8";
    } else if (missedPercentage === 0) {
        status = "healthy";
        statusLabel = "Healthy";
        statusColor = "#16a34a";
    } else if (missedPercentage < 30) {
        status = "warning";
        statusLabel = "Some Missed";
        statusColor = "#f59e0b";
    } else {
        status = "error";
        statusLabel = "Many Missed";
        statusColor = "#dc2626";
    }

    return {
        status,
        statusLabel,
        statusColor,
        nextRun,
        nextRunLabel,
        lastRun,
        lastRunLabel,
        expectedRuns,
        actualRuns,
        missedRuns,
        missedPercentage,
        frequency: formatFrequencyLabel(schedule),
        linkedRunbooks,
    };
}

interface ScheduleHealthCardProps {
    schedule: AutomationSchedule;
    jobs: AutomationJob[];
    jobSchedules: AutomationJobSchedule[];
    lookbackDays?: 7 | 30;
}

export function ScheduleHealthCard({ schedule, jobs, jobSchedules, lookbackDays = 7 }: ScheduleHealthCardProps) {
    const health = useMemo(
        () => analyzeScheduleHealth(schedule, jobs, jobSchedules, lookbackDays),
        [schedule, jobs, jobSchedules, lookbackDays]
    );

    const StatusIcon = health.status === "healthy" ? CheckCircle 
        : health.status === "warning" ? AlertTriangle 
        : health.status === "error" ? XCircle 
        : Clock;

    return (
        <div 
            className="rounded-lg px-3 py-3 border"
            style={{ 
                background: health.statusColor + "08", 
                borderColor: health.statusColor + "30" 
            }}
        >
            {/* Header with status */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <StatusIcon className="w-4 h-4" style={{ color: health.statusColor }} />
                    <span className="font-bold text-sm" style={{ color: health.statusColor }}>
                        {health.statusLabel}
                    </span>
                </div>
                <span 
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{ background: "#f1f5f9", color: "#64748b" }}
                >
                    {health.frequency}
                </span>
            </div>

            {/* Next/Last Run */}
            <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="bg-white/50 rounded px-2 py-1.5 border border-slate-100">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Next Run</div>
                    <div className="text-xs font-bold text-slate-700">{health.nextRunLabel}</div>
                    {health.nextRun && (
                        <div className="text-[10px] text-slate-400">{formatDateTime(health.nextRun)}</div>
                    )}
                </div>
                <div className="bg-white/50 rounded px-2 py-1.5 border border-slate-100">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Last Run</div>
                    <div className="text-xs font-bold text-slate-700">{health.lastRunLabel}</div>
                    {health.lastRun && (
                        <div className="text-[10px] text-slate-400">{formatDateTime(health.lastRun)}</div>
                    )}
                </div>
            </div>

            {/* Execution Stats (only if schedule is active) */}
            {health.status !== "disabled" && health.status !== "expired" && (
                <div className="bg-white/50 rounded px-2 py-2 border border-slate-100">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">
                        Last {lookbackDays} Days
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-green-700">{health.actualRuns}</span>
                            <span className="text-[10px] text-slate-400">executed</span>
                        </div>
                        {health.missedRuns > 0 && (
                            <div className="flex items-center gap-1">
                                <span className="text-xs font-bold text-red-700">{health.missedRuns}</span>
                                <span className="text-[10px] text-slate-400">missed</span>
                            </div>
                        )}
                        <div className="ml-auto">
                            <span 
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                style={{
                                    background: health.missedPercentage === 0 ? "#dcfce7" 
                                        : health.missedPercentage < 30 ? "#fef9c3" : "#fee2e2",
                                    color: health.missedPercentage === 0 ? "#166534" 
                                        : health.missedPercentage < 30 ? "#854d0e" : "#991b1b",
                                }}
                            >
                                {100 - health.missedPercentage}% hit rate
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Linked Runbooks */}
            {health.linkedRunbooks.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-100">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Triggers</div>
                    <div className="flex flex-wrap gap-1">
                        {health.linkedRunbooks.map((name, i) => (
                            <span 
                                key={i} 
                                className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100"
                            >
                                📜 {name}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* No linked runbooks warning */}
            {health.linkedRunbooks.length === 0 && health.status !== "disabled" && (
                <div className="mt-2 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 text-[10px] text-amber-600">
                        <AlertTriangle className="w-3 h-3" />
                        <span>No runbooks linked to this schedule</span>
                    </div>
                </div>
            )}
        </div>
    );
}

interface SchedulesSummaryCardProps {
    schedules: AutomationSchedule[];
    jobs: AutomationJob[];
    jobSchedules: AutomationJobSchedule[];
}

export function SchedulesSummaryCard({ schedules, jobs, jobSchedules }: SchedulesSummaryCardProps) {
    const summary = useMemo(() => {
        const healthStatuses = schedules.map(s => analyzeScheduleHealth(s, jobs, jobSchedules, 7));

        const active = healthStatuses.filter(h => h.status !== "disabled" && h.status !== "expired");
        const healthy = healthStatuses.filter(h => h.status === "healthy").length;
        const warning = healthStatuses.filter(h => h.status === "warning").length;
        const error = healthStatuses.filter(h => h.status === "error").length;
        const disabled = healthStatuses.filter(h => h.status === "disabled").length;
        const expired = healthStatuses.filter(h => h.status === "expired").length;

        // Find next upcoming run across all schedules
        const nextRuns = healthStatuses
            .map(h => h.nextRun)
            .filter((d): d is Date => d !== null && d > new Date())
            .sort((a, b) => a.getTime() - b.getTime());
        const nextRun = nextRuns[0] ?? null;

        return { healthy, warning, error, disabled, expired, total: schedules.length, activeCount: active.length, nextRun };
    }, [schedules, jobs, jobSchedules]);

    if (schedules.length === 0) {
        return (
            <div className="text-xs text-slate-400 py-2 text-center">
                No schedules configured.
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {/* Status distribution */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
                {summary.healthy > 0 && (
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: "#16a34a" }} />
                        <span className="text-xs font-semibold text-green-700">{summary.healthy} healthy</span>
                    </div>
                )}
                {summary.warning > 0 && (
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: "#f59e0b" }} />
                        <span className="text-xs font-semibold text-amber-700">{summary.warning} warning</span>
                    </div>
                )}
                {summary.error > 0 && (
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: "#dc2626" }} />
                        <span className="text-xs font-semibold text-red-700">{summary.error} failing</span>
                    </div>
                )}
                {summary.disabled > 0 && (
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: "#94a3b8" }} />
                        <span className="text-xs font-semibold text-slate-500">{summary.disabled} disabled</span>
                    </div>
                )}
            </div>

            {/* Next run info */}
            {summary.nextRun && (
                <div className="flex items-center gap-2 text-xs bg-slate-50 rounded px-2 py-1.5 border border-slate-100">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span className="text-slate-500">Next scheduled run:</span>
                    <span className="font-bold text-slate-700">{formatRelativeTime(summary.nextRun)}</span>
                </div>
            )}
        </div>
    );
}
