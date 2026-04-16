"use client";

import { useMemo } from "react";
import { AutomationJob } from "@/services/azureService";

interface JobHistoryChartProps {
    jobs: AutomationJob[];
    runbookName?: string;  // Filter to specific runbook, or undefined for all
    days?: 7 | 30;
}

interface DayStats {
    date: string;
    label: string;
    succeeded: number;
    failed: number;
    other: number;
    total: number;
}

type JobOutcome = "succeeded" | "failed" | "other";

function getJobOutcome(status: string): JobOutcome {
    const lower = status.toLowerCase();
    if (lower === "completed") return "succeeded";
    if (lower === "failed" || lower === "blocked" || lower === "disconnected") return "failed";
    return "other";
}

export function JobHistoryChart({ jobs, runbookName, days = 7 }: JobHistoryChartProps) {
    const { dayStats, totals, maxPerDay, chartDays } = useMemo(() => {
        const now = new Date();
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - days);
        cutoff.setHours(0, 0, 0, 0);

        // Filter jobs by runbook if specified
        const filtered = jobs.filter(j => {
            if (runbookName && j.properties.runbook.name.toLowerCase() !== runbookName.toLowerCase()) {
                return false;
            }
            const jobDate = new Date(j.properties.startTime ?? j.properties.creationTime);
            return jobDate >= cutoff;
        });

        // Build day buckets
        const buckets = new Map<string, DayStats>();
        const dateKeys: string[] = [];

        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            const label = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
            dateKeys.push(key);
            buckets.set(key, { date: key, label, succeeded: 0, failed: 0, other: 0, total: 0 });
        }

        // Tally jobs per day
        filtered.forEach(job => {
            const jobDate = new Date(job.properties.startTime ?? job.properties.creationTime);
            const key = jobDate.toISOString().slice(0, 10);
            const bucket = buckets.get(key);
            if (bucket) {
                const outcome = getJobOutcome(job.properties.status);
                bucket[outcome]++;
                bucket.total++;
            }
        });

        const dayStats = dateKeys.map(k => buckets.get(k)!);
        const maxPerDay = Math.max(1, ...dayStats.map(d => d.total));

        const totals = {
            succeeded: dayStats.reduce((sum, d) => sum + d.succeeded, 0),
            failed:    dayStats.reduce((sum, d) => sum + d.failed, 0),
            other:     dayStats.reduce((sum, d) => sum + d.other, 0),
            total:     dayStats.reduce((sum, d) => sum + d.total, 0),
        };

        return { dayStats, totals, maxPerDay, chartDays: days };
    }, [jobs, runbookName, days]);

    if (totals.total === 0) {
        return (
            <div className="text-xs text-slate-400 py-2 text-center">
                No job executions in the last {chartDays} days.
            </div>
        );
    }

    const successRate = totals.total > 0 
        ? Math.round((totals.succeeded / totals.total) * 100) 
        : 0;

    const barHeight = 40;
    const barWidth = chartDays === 7 ? 28 : 14;

    return (
        <div className="space-y-3">
            {/* Summary Row */}
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: "#16a34a" }} />
                        <span className="text-xs font-semibold text-green-700">{totals.succeeded}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: "#dc2626" }} />
                        <span className="text-xs font-semibold text-red-700">{totals.failed}</span>
                    </div>
                    {totals.other > 0 && (
                        <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: "#f59e0b" }} />
                            <span className="text-xs font-semibold text-amber-700">{totals.other}</span>
                        </div>
                    )}
                </div>
                <div 
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ 
                        background: successRate >= 80 ? "#dcfce7" : successRate >= 50 ? "#fef9c3" : "#fee2e2",
                        color: successRate >= 80 ? "#166534" : successRate >= 50 ? "#854d0e" : "#991b1b",
                    }}
                >
                    {successRate}% success
                </div>
            </div>

            {/* Bar Chart */}
            <div className="flex items-end justify-between gap-0.5" style={{ height: barHeight + 20 }}>
                {dayStats.map((day, i) => {
                    const succeededHeight = (day.succeeded / maxPerDay) * barHeight;
                    const failedHeight = (day.failed / maxPerDay) * barHeight;
                    const otherHeight = (day.other / maxPerDay) * barHeight;
                    const hasData = day.total > 0;

                    return (
                        <div key={day.date} className="flex flex-col items-center gap-1" style={{ width: barWidth }}>
                            {/* Stacked Bar */}
                            <div 
                                className="flex flex-col-reverse rounded-t overflow-hidden"
                                style={{ width: barWidth - 4, height: barHeight }}
                                title={`${day.label}: ${day.succeeded} succeeded, ${day.failed} failed${day.other > 0 ? `, ${day.other} other` : ""}`}
                            >
                                {hasData ? (
                                    <>
                                        {day.succeeded > 0 && (
                                            <div style={{ height: succeededHeight, background: "#16a34a" }} />
                                        )}
                                        {day.failed > 0 && (
                                            <div style={{ height: failedHeight, background: "#dc2626" }} />
                                        )}
                                        {day.other > 0 && (
                                            <div style={{ height: otherHeight, background: "#f59e0b" }} />
                                        )}
                                    </>
                                ) : (
                                    <div 
                                        className="w-full rounded-t"
                                        style={{ height: 2, background: "#e2e8f0", marginTop: "auto" }} 
                                    />
                                )}
                            </div>
                            {/* Date Label - show every day for 7-day, every 3rd for 30-day */}
                            {(chartDays === 7 || i % 5 === 0 || i === chartDays - 1) && (
                                <span className="text-[9px] text-slate-400 font-medium whitespace-nowrap">
                                    {day.label.slice(0, 2)}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-4 text-[10px] text-slate-500 pt-1">
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm" style={{ background: "#16a34a" }} />
                    Succeeded
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-sm" style={{ background: "#dc2626" }} />
                    Failed
                </span>
                {totals.other > 0 && (
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm" style={{ background: "#f59e0b" }} />
                        Other
                    </span>
                )}
            </div>
        </div>
    );
}
