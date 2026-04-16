import axios from "axios";

const ARM_BASE_URL = "https://management.azure.com";

export interface Subscription {
    id: string;
    subscriptionId: string;
    displayName: string;
}

// ── Managed Identity shape ────────────────────────────────────────────────────
// The identity block sits at the TOP LEVEL of the AutomationAccount ARM object,
// NOT inside properties. ARM returns it as part of the account GET/list response.
//
// identity.type values (can be combined with comma+space):
//   "None"                        → no managed identity configured
//   "SystemAssigned"              → system-assigned only
//   "UserAssigned"                → user-assigned only
//   "SystemAssigned, UserAssigned"→ both enabled
//
// userAssignedIdentities is a record keyed by the full resource ID of each
// user-assigned managed identity, e.g.:
//   "/subscriptions/.../providers/Microsoft.ManagedIdentity/userAssignedIdentities/myId"
export interface AutomationAccountIdentity {
    type:                     "None" | "SystemAssigned" | "UserAssigned" | "SystemAssigned, UserAssigned";
    principalId?:             string;   // system-assigned principal ID (GUID)
    tenantId?:                string;   // system-assigned tenant ID (GUID)
    userAssignedIdentities?:  Record<string, {
        principalId?: string;
        clientId?:   string;
    }>;
}

export interface AutomationAccount {
    id:         string;
    name:       string;
    location:   string;
    identity?:  AutomationAccountIdentity;  // ← top-level identity block
    properties: any;
}

export interface AutomationResource {
    id: string;
    name: string;
    type: string;
    properties: any;
    scriptContent?: string;
    scriptDependencies?: {
        name: string;
        action: "Get" | "Set";
        resourceType: "Variable" | "Credential" | "Certificate" | "Connection";
    }[];
    codeAnalysis?: {
        cmdlets: { verb: string; noun: string; fullName: string; category: string }[];
        functions: { name: string; lineNumber?: number }[];
        cmdletCount: number;
        functionCount: number;
    };
    keyVaultUsage?: {
        vaultName: string;
        secrets: { name: string; isPlainText: boolean }[];
        keys: { name: string }[];
        certificates: { name: string }[];
    }[];
    vmUsage?: {
        action: "Start" | "Stop" | "Get" | "Restart";
        vmName: string | null;
        resourceGroup: string | null;
        vmId: string | null;
    }[];
    webRequestUsage?: {
        cmdlet: "Invoke-WebRequest" | "Invoke-RestMethod";
        method: string;
        uri: string | null;
    }[];
    hardcodedSecrets?: {
        variableName: string;
        value: string;
    }[];
    usesRunAsAccount?: boolean;
    childRunbookCalls?: {
        runbookName:   string;
        wait:          boolean;
        resourceGroup: string | null;
    }[];
    emailUsage?: {
        cmdlet:  string;
        to:      string | null;
        subject: string | null;
    }[];
    storageUsage?: {
        action:    string;
        cmdlet:    string;
        container: string | null;
        blobName:  string | null;
    }[];
    sqlUsage?: {
        cmdlet:         string;
        serverInstance: string | null;
        database:       string | null;
    }[];
    runbookParams?: {
        name:         string;
        type:         string | null;
        mandatory:    boolean;
        defaultValue: string | null;
    }[];
}

export interface AutomationSchedule {
    id: string;
    name: string;
    properties: {
        description:  string;
        startTime:    string;
        expiryTime:   string;
        nextRun:      string | null;
        isEnabled:    boolean;
        frequency:    "OneTime" | "Day" | "Hour" | "Week" | "Month" | "Minute";
        interval:     number | null;
        timeZone:     string;
    };
}

export interface AutomationJobSchedule {
    id: string;
    properties: {
        jobScheduleId: string;
        runbook:  { name: string };
        schedule: { name: string };
        runOn:    string | null;
    };
}

export type JobStatus =
    | "New" | "Activating" | "Running" | "Completed" | "Failed"
    | "Stopped" | "Blocked" | "Suspended" | "Disconnected"
    | "Stopping" | "Resuming" | "Suspending";

export interface AutomationJob {
    id:   string;
    name: string;
    properties: {
        jobId:            string;
        runbook:          { name: string };
        status:           JobStatus;
        startTime:        string | null;
        endTime:          string | null;
        creationTime:     string;
        lastModifiedTime: string;
        exception:        string | null;
        runOn:            string | null;
    };
}

export interface RunbookLastRun {
    status:      JobStatus;
    startTime:   string | null;
    endTime:     string | null;
    jobId:       string;
    exception:   string | null;
    runOn:       string | null;
    hasWarnings: boolean;  // True when job succeeded but had errors/exceptions in output
}

// ── Job Stream for detailed job logs ──────────────────────────────────────────
export type JobStreamType = "Output" | "Error" | "Warning" | "Verbose" | "Debug" | "Progress" | "Any";

export interface JobStream {
    id:   string;
    properties: {
        jobStreamId:  string;
        time:         string;
        streamType:   JobStreamType;
        streamText:   string | null;
        summary:      string | null;
        value:        Record<string, any> | null;
    };
}

export interface JobOutput {
    streams: JobStream[];
    output:  string | null;
}

export interface HybridWorkerGroup {
    id:   string;
    name: string;
    properties: {
        groupType:  "User" | "System";
        credential: { name: string } | null;
    };
    workers: HybridWorker[];
}

export interface HybridWorker {
    id:   string;
    name: string;
    properties: {
        workerName:         string;
        ip:                 string | null;
        lastSeenDateTime:   string | null;
        registeredDateTime: string | null;
        workerType:         "HybridV1" | "HybridV2" | string;
        vmResourceId:       string | null;
    };
}

export interface SourceControl {
    id:   string;
    name: string;
    properties: {
        sourceType:       "GitHub" | "VsoGit" | "VsoTfvc";
        repoUrl:          string;
        branch:           string | null;
        folderPath:       string | null;
        autoSync:         boolean;
        publishRunbook:   boolean;
        description:      string | null;
        creationTime:     string | null;
        lastModifiedTime: string | null;
    };
}

export interface AutomationData {
    account:            AutomationAccount;
    runbooks:           AutomationResource[];
    variables:          AutomationResource[];
    credentials:        AutomationResource[];
    connections:        AutomationResource[];
    certificates:       AutomationResource[];
    schedules:          AutomationSchedule[];
    jobSchedules:       AutomationJobSchedule[];
    jobs:               AutomationJob[];
    lastRunByRunbook:   Record<string, RunbookLastRun>;
    hybridWorkerGroups: HybridWorkerGroup[];
    sourceControls:     SourceControl[];
    jobStreamErrors:    Record<string, boolean>;  // jobId -> true if Error/Warning streams found (top 10 per runbook)
}

// ── Derived helper: parse identity type into booleans ─────────────────────────
// Use this anywhere you need to check identity state without string parsing.
export interface IdentityStatus {
    hasSystem:  boolean;
    hasUser:    boolean;
    userCount:  number;   // number of user-assigned identities
    label:      string;   // human-readable label for display
    icon:       string;   // emoji icon for the node tile
}

export function parseIdentityStatus(account: AutomationAccount): IdentityStatus {
    const identity = account.identity;
    const type     = identity?.type ?? "None";

    const hasSystem = type.includes("SystemAssigned");
    const userMap   = identity?.userAssignedIdentities ?? {};
    const userCount = Object.keys(userMap).length;
    const hasUser   = type.includes("UserAssigned") && userCount > 0;

    let label: string;
    let icon:  string;

    if (hasSystem && hasUser) {
        label = `System + User (${userCount})`;
        icon  = "🔐";
    } else if (hasSystem) {
        label = "System Assigned";
        icon  = "🔐";
    } else if (hasUser) {
        label = `User Assigned (${userCount})`;
        icon  = "🔑";
    } else {
        label = "No Managed Identity";
        icon  = "🔓";
    }

    return { hasSystem, hasUser, userCount, label, icon };
}

const getArmClient = (token: string) => axios.create({
    baseURL: ARM_BASE_URL,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
});

export const fetchSubscriptions = async (token: string): Promise<Subscription[]> => {
    const client = getArmClient(token);
    const response = await client.get(`/subscriptions?api-version=2020-01-01`);
    return response.data.value;
};

export const fetchAutomationAccounts = async (token: string, subscriptionId: string): Promise<AutomationAccount[]> => {
    const client = getArmClient(token);
    const response = await client.get(
        `/subscriptions/${subscriptionId}/providers/Microsoft.Automation/automationAccounts?api-version=2023-11-01`
    );
    return response.data.value;
};

const fetchAutomationSubResource = async (token: string, accountId: string, resourceType: string, apiVersion: string): Promise<any[]> => {
    const client = getArmClient(token);
    try {
        const response = await client.get(`${accountId}/${resourceType}?api-version=${apiVersion}`);
        return response.data.value || [];
    } catch (error) {
        console.error(`Failed to fetch ${resourceType} for ${accountId}`, error);
        return [];
    }
};

// Check if a job has error/warning streams (quick check - no detail fetch)
async function checkJobHasErrorStreams(client: ReturnType<typeof getArmClient>, accountId: string, jobId: string): Promise<boolean> {
    const API_VERSION = "2023-11-01";
    try {
        const response = await client.get(`${accountId}/jobs/${jobId}/streams?api-version=${API_VERSION}`);
        const streams = response.data.value || [];
        return streams.some((s: any) => s.properties?.streamType === "Error" || s.properties?.streamType === "Warning");
    } catch (e) {
        console.warn(`Failed to check streams for job ${jobId}:`, e);
        return false;
    }
}

async function buildLastRunMap(
    jobs: AutomationJob[],
    client: ReturnType<typeof getArmClient>,
    accountId: string
): Promise<{ lastRunMap: Record<string, RunbookLastRun>; jobStreamErrors: Record<string, boolean> }> {
    const map: Record<string, RunbookLastRun> = {};
    const sorted = [...jobs].sort((a, b) => {
        const ta = new Date(a.properties.startTime ?? a.properties.creationTime).getTime();
        const tb = new Date(b.properties.startTime ?? b.properties.creationTime).getTime();
        return tb - ta;
    });
    
    // Collect top 10 completed jobs per runbook (sorted desc = most recent first)
    const completedByRunbook = new Map<string, string[]>(); // runbook name -> [jobId, ...]
    sorted.forEach(job => {
        const name = job.properties.runbook.name;
        if (!map[name]) {
            const hasException = job.properties.exception != null && job.properties.exception !== "";
            map[name] = {
                status:      job.properties.status,
                startTime:   job.properties.startTime,
                endTime:     job.properties.endTime,
                jobId:       job.properties.jobId,
                exception:   job.properties.exception ?? null,
                runOn:       job.properties.runOn ?? null,
                hasWarnings: hasException,
            };
        }
        if (job.properties.status === "Completed") {
            if (!completedByRunbook.has(name)) completedByRunbook.set(name, []);
            const list = completedByRunbook.get(name)!;
            if (list.length < 10) list.push(job.properties.jobId);
        }
    });
    
    // Check streams for top 10 completed jobs per runbook in parallel
    const allJobsToCheck: Array<{ name: string; jobId: string }> = [];
    completedByRunbook.forEach((jobIds, name) => {
        jobIds.forEach(jobId => allJobsToCheck.push({ name, jobId }));
    });

    const jobStreamErrors: Record<string, boolean> = {};
    if (allJobsToCheck.length > 0) {
        const results = await Promise.all(
            allJobsToCheck.map(async ({ name, jobId }) => {
                const hasErrors = await checkJobHasErrorStreams(client, accountId, jobId);
                return { name, jobId, hasErrors };
            })
        );
        results.forEach(({ name, jobId, hasErrors }) => {
            // Update lastRun.hasWarnings for the most recent completed job of this runbook
            if (map[name]?.jobId === jobId) {
                map[name].hasWarnings = hasErrors;
            }
            if (hasErrors) jobStreamErrors[jobId] = true;
        });
    }

    return { lastRunMap: map, jobStreamErrors };
}

async function fetchHybridWorkerGroups(token: string, accountId: string): Promise<HybridWorkerGroup[]> {
    const API_VERSION = "2023-11-01";
    const client = getArmClient(token);
    let rawGroups: any[] = [];
    try {
        const response = await client.get(`${accountId}/hybridRunbookWorkerGroups?api-version=${API_VERSION}`);
        rawGroups = response.data.value || [];
    } catch (err) {
        console.warn("Failed to fetch hybrid worker groups:", err);
        return [];
    }
    const groups = await Promise.all(
        rawGroups.map(async (group: any): Promise<HybridWorkerGroup> => {
            let workers: HybridWorker[] = [];
            try {
                const wResp = await client.get(
                    `${accountId}/hybridRunbookWorkerGroups/${encodeURIComponent(group.name)}/hybridRunbookWorkers?api-version=${API_VERSION}`
                );
                workers = wResp.data.value || [];
            } catch (err) {
                console.warn(`Failed to fetch workers for group ${group.name}:`, err);
            }
            return {
                id:   group.id,
                name: group.name,
                properties: {
                    groupType:  group.properties?.groupType ?? "User",
                    credential: group.properties?.credential ?? null,
                },
                workers,
            };
        })
    );
    return groups;
}

export const fetchAllAutomationData = async (token: string, account: AutomationAccount): Promise<AutomationData> => {
    const API_VERSION = "2023-11-01";

    const [
        rawRunbooks, variables, credentials, connections, certificates,
        schedules, jobSchedules, jobs, hybridWorkerGroups, sourceControls,
    ] = await Promise.all([
        fetchAutomationSubResource(token, account.id, "runbooks",       API_VERSION),
        fetchAutomationSubResource(token, account.id, "variables",      API_VERSION),
        fetchAutomationSubResource(token, account.id, "credentials",    API_VERSION),
        fetchAutomationSubResource(token, account.id, "connections",    API_VERSION),
        fetchAutomationSubResource(token, account.id, "certificates",   API_VERSION),
        fetchAutomationSubResource(token, account.id, "schedules",      API_VERSION),
        fetchAutomationSubResource(token, account.id, "jobSchedules",   API_VERSION),
        fetchAutomationSubResource(token, account.id, "jobs",           API_VERSION),
        fetchHybridWorkerGroups(token, account.id),
        fetchAutomationSubResource(token, account.id, "sourceControls", API_VERSION),
    ]);

    const client = getArmClient(token);
    const runbooksWithScripts = await Promise.all(
        rawRunbooks.map(async (runbook: AutomationResource) => {
            try {
                let scriptBody = "";
                try {
                    const contentResponse = await client.get(`${runbook.id}/content?api-version=${API_VERSION}`);
                    scriptBody = typeof contentResponse.data === "string" ? contentResponse.data : JSON.stringify(contentResponse.data);
                } catch (e: any) {
                    if (e.response && (e.response.status === 404 || e.response.status === 400)) {
                        const draftResponse = await client.get(`${runbook.id}/draft/content?api-version=${API_VERSION}`);
                        scriptBody = typeof draftResponse.data === "string" ? draftResponse.data : JSON.stringify(draftResponse.data);
                    } else { throw e; }
                }
                const { extractDependenciesFromScript, analyzeScriptCode, extractKeyVaultDependencies, groupKeyVaultDependencies, extractAzVmUsage, extractWebRequestUsage, extractHardcodedSecrets, extractRunAsUsage, extractChildRunbookCalls, extractEmailUsage, extractStorageUsage, extractSqlUsage, extractRunbookParams } = await import("@/utils/scriptParser");
                const scriptDependencies  = extractDependenciesFromScript(scriptBody);
                const codeAnalysis        = analyzeScriptCode(scriptBody);
                const keyVaultDeps        = extractKeyVaultDependencies(scriptBody);
                const keyVaultUsage       = groupKeyVaultDependencies(keyVaultDeps);
                const vmUsage             = extractAzVmUsage(scriptBody);
                const webRequestUsage     = extractWebRequestUsage(scriptBody);
                const hardcodedSecrets    = extractHardcodedSecrets(scriptBody);
                const runAsUsage          = extractRunAsUsage(scriptBody);
                const childRunbookCalls   = extractChildRunbookCalls(scriptBody);
                const emailUsage          = extractEmailUsage(scriptBody);
                const storageUsage        = extractStorageUsage(scriptBody);
                const sqlUsage            = extractSqlUsage(scriptBody);
                const runbookParams       = extractRunbookParams(scriptBody);
                return { ...runbook, scriptContent: scriptBody, scriptDependencies, codeAnalysis, keyVaultUsage, vmUsage, webRequestUsage, hardcodedSecrets, usesRunAsAccount: !!runAsUsage, childRunbookCalls, emailUsage, storageUsage, sqlUsage, runbookParams };
            } catch (error) {
                console.error(`Failed to fetch script for runbook ${runbook.name}`, error);
                return runbook;
            }
        })
    );

    // Build last run map with stream checks for completed jobs
    const { lastRunMap: lastRunByRunbook, jobStreamErrors } = await buildLastRunMap(jobs, client, account.id);

    return {
        account,
        runbooks:           runbooksWithScripts,
        variables,
        credentials,
        connections,
        certificates,
        schedules,
        jobSchedules,
        jobs,
        lastRunByRunbook,
        hybridWorkerGroups,
        sourceControls,
        jobStreamErrors,
    };
};

// ── Fetch job streams (logs) for a specific job ───────────────────────────────
export const fetchJobStreams = async (token: string, accountId: string, jobId: string): Promise<JobOutput> => {
    const API_VERSION = "2023-11-01";
    const client = getArmClient(token);
    
    let streams: JobStream[] = [];
    let output: string | null = null;
    
    try {
        // Fetch job streams (structured logs)
        const streamsResponse = await client.get(`${accountId}/jobs/${jobId}/streams?api-version=${API_VERSION}`);
        const rawStreams = streamsResponse.data.value || [];
        
        // Fetch detailed content for each stream
        streams = await Promise.all(
            rawStreams.map(async (stream: any): Promise<JobStream> => {
                try {
                    const detailResponse = await client.get(`${accountId}/jobs/${jobId}/streams/${stream.properties.jobStreamId}?api-version=${API_VERSION}`);
                    return {
                        id: stream.id,
                        properties: {
                            jobStreamId: stream.properties.jobStreamId,
                            time: stream.properties.time,
                            streamType: stream.properties.streamType,
                            streamText: detailResponse.data.properties?.streamText ?? stream.properties.summary ?? null,
                            summary: stream.properties.summary,
                            value: detailResponse.data.properties?.value ?? null,
                        }
                    };
                } catch (e) {
                    // Fall back to summary if detail fetch fails
                    return {
                        id: stream.id,
                        properties: {
                            jobStreamId: stream.properties.jobStreamId,
                            time: stream.properties.time,
                            streamType: stream.properties.streamType,
                            streamText: stream.properties.summary ?? null,
                            summary: stream.properties.summary,
                            value: null,
                        }
                    };
                }
            })
        );
    } catch (e) {
        console.warn("Failed to fetch job streams:", e);
    }
    
    try {
        // Fetch job output (plain text)
        const outputResponse = await client.get(`${accountId}/jobs/${jobId}/output?api-version=${API_VERSION}`);
        output = typeof outputResponse.data === "string" ? outputResponse.data : JSON.stringify(outputResponse.data, null, 2);
    } catch (e) {
        console.warn("Failed to fetch job output:", e);
    }
    
    return { streams, output };
};

// ── Refresh a single runbook's data ───────────────────────────────────────────
export const refreshRunbookData = async (token: string, accountId: string, runbookName: string): Promise<{
    runbook: AutomationResource | null;
    jobs: AutomationJob[];
    lastRun: RunbookLastRun | null;
    jobStreamErrors: Record<string, boolean>;
}> => {
    const API_VERSION = "2023-11-01";
    const client = getArmClient(token);
    
    let runbook: AutomationResource | null = null;
    let jobs: AutomationJob[] = [];
    
    try {
        // Fetch the runbook
        const rbResponse = await client.get(`${accountId}/runbooks/${encodeURIComponent(runbookName)}?api-version=${API_VERSION}`);
        runbook = rbResponse.data;
        
        // Fetch script content
        try {
            let scriptBody = "";
            try {
                const contentResponse = await client.get(`${accountId}/runbooks/${encodeURIComponent(runbookName)}/content?api-version=${API_VERSION}`);
                scriptBody = typeof contentResponse.data === "string" ? contentResponse.data : JSON.stringify(contentResponse.data);
            } catch (e: any) {
                if (e.response && (e.response.status === 404 || e.response.status === 400)) {
                    const draftResponse = await client.get(`${accountId}/runbooks/${encodeURIComponent(runbookName)}/draft/content?api-version=${API_VERSION}`);
                    scriptBody = typeof draftResponse.data === "string" ? draftResponse.data : JSON.stringify(draftResponse.data);
                }
            }
            if (scriptBody && runbook) {
                const { extractDependenciesFromScript, analyzeScriptCode, extractKeyVaultDependencies, groupKeyVaultDependencies, extractAzVmUsage, extractWebRequestUsage, extractHardcodedSecrets, extractRunAsUsage, extractChildRunbookCalls, extractEmailUsage, extractStorageUsage, extractSqlUsage, extractRunbookParams } = await import("@/utils/scriptParser");
                runbook.scriptContent       = scriptBody;
                runbook.scriptDependencies  = extractDependenciesFromScript(scriptBody);
                runbook.codeAnalysis        = analyzeScriptCode(scriptBody);
                runbook.keyVaultUsage       = groupKeyVaultDependencies(extractKeyVaultDependencies(scriptBody));
                runbook.vmUsage             = extractAzVmUsage(scriptBody);
                runbook.webRequestUsage     = extractWebRequestUsage(scriptBody);
                runbook.hardcodedSecrets    = extractHardcodedSecrets(scriptBody);
                runbook.usesRunAsAccount    = !!extractRunAsUsage(scriptBody);
                runbook.childRunbookCalls   = extractChildRunbookCalls(scriptBody);
                runbook.emailUsage          = extractEmailUsage(scriptBody);
                runbook.storageUsage        = extractStorageUsage(scriptBody);
                runbook.sqlUsage            = extractSqlUsage(scriptBody);
                runbook.runbookParams       = extractRunbookParams(scriptBody);
            }
        } catch (e) {
            console.warn("Failed to fetch runbook script:", e);
        }
        
        // Fetch jobs for this runbook
        const jobsResponse = await client.get(`${accountId}/jobs?api-version=${API_VERSION}&$filter=properties/runbook/name eq '${encodeURIComponent(runbookName)}'`);
        jobs = jobsResponse.data.value || [];
    } catch (e) {
        console.error("Failed to refresh runbook data:", e);
    }
    
    // Build last run with stream checks (top 10 completed for this runbook)
    const { lastRunMap, jobStreamErrors } = await buildLastRunMap(jobs, client, accountId);
    const lastRun = lastRunMap[runbookName] ?? null;
    
    return { runbook, jobs, lastRun, jobStreamErrors };
};
