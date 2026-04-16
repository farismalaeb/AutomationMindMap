// Detects Azure Automation internal cmdlet usage inside runbook PowerShell scripts.
// These are internal cmdlets from the Orchestrator.AssetManagement.Cmdlets module.
//
// Supported syntax variants for each cmdlet:
//
//   With    -Name and double quotes : Get-AutomationVariable -Name "MyVar"
//   With    -Name and single quotes : Get-AutomationVariable -Name 'MyVar'
//   Without -Name and double quotes : Get-AutomationVariable "MyVar"
//   Without -Name and single quotes : Get-AutomationVariable 'MyVar'
//   Without -Name, unquoted literal : Get-AutomationVariable MyVar
//
// NOTE: Per Microsoft docs, only Get is supported inside runbooks for
// Credentials, Certificates, and Connections. Set is only valid for Variables.
//
// Refs:
//   https://learn.microsoft.com/en-us/azure/automation/shared-resources/certificates
//   https://learn.microsoft.com/en-us/azure/automation/automation-connections

// ── Helper: Strip PowerShell comments ──────────────────────────────────────────
/**
 * Removes PowerShell comments from script content.
 * - Removes block comments: <# ... #>
 * - Removes single-line comments: # ... (to end of line)
 * - Handles inline comments on lines with code
 * 
 * IMPORTANT: This is a simplified approach that does not handle `#` inside strings.
 * For runbook analysis, this is acceptable since we're looking for cmdlet patterns.
 */
function stripPowerShellComments(scriptContent: string): string {
    if (!scriptContent) return "";
    
    // First, remove block comments <# ... #> (can span multiple lines)
    let result = scriptContent.replace(/<#[\s\S]*?#>/g, "");
    
    // Then, remove single-line comments (# to end of line)
    // We process line by line to handle inline comments
    const lines = result.split("\n");
    const cleanedLines = lines.map(line => {
        // Find # that is not inside a string
        // Simplified approach: find first # that is not preceded by a backtick (escape)
        // and assume it starts a comment
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let commentStart = -1;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const prevChar = i > 0 ? line[i - 1] : "";
            
            // Handle quote tracking (simplified - doesn't handle escaped quotes perfectly)
            if (char === "'" && !inDoubleQuote && prevChar !== "`") {
                inSingleQuote = !inSingleQuote;
            } else if (char === '"' && !inSingleQuote && prevChar !== "`") {
                inDoubleQuote = !inDoubleQuote;
            } else if (char === "#" && !inSingleQuote && !inDoubleQuote) {
                commentStart = i;
                break;
            }
        }
        
        if (commentStart !== -1) {
            return line.substring(0, commentStart);
        }
        return line;
    });
    
    return cleanedLines.join("\n");
}

export interface ScriptDependency {
    name: string;
    action: "Get" | "Set";
    resourceType: "Variable" | "Credential" | "Certificate" | "Connection";
}

// Keep the old export name so existing imports don't break
export type VariableDependency = ScriptDependency;

// ── PowerShell Code Analysis ───────────────────────────────────────────────────

/**
 * Represents a PowerShell cmdlet found in the script
 */
export interface PowerShellCmdlet {
    verb: string;       // e.g., "Get", "Set", "New", "Remove"
    noun: string;       // e.g., "Item", "ChildItem", "Content"
    fullName: string;   // e.g., "Get-Item"
    category: string;   // e.g., "FileSystem", "Process", "Service", etc.
}

/**
 * Represents a PowerShell function defined in the script
 */
export interface PowerShellFunction {
    name: string;
    lineNumber?: number;
}

/**
 * Complete code analysis result
 */
export interface CodeAnalysisResult {
    cmdlets: PowerShellCmdlet[];
    functions: PowerShellFunction[];
    cmdletCount: number;
    functionCount: number;
}

// Cmdlet categories mapping for common cmdlets
const CMDLET_CATEGORIES: Record<string, string> = {
    // FileSystem operations
    "Get-Item": "FileSystem",
    "Set-Item": "FileSystem",
    "Get-ChildItem": "FileSystem",
    "New-Item": "FileSystem",
    "Remove-Item": "FileSystem",
    "Copy-Item": "FileSystem",
    "Move-Item": "FileSystem",
    "Rename-Item": "FileSystem",
    "Get-Content": "FileSystem",
    "Set-Content": "FileSystem",
    "Add-Content": "FileSystem",
    "Clear-Content": "FileSystem",
    "Get-ItemProperty": "FileSystem",
    "Set-ItemProperty": "FileSystem",
    "Test-Path": "FileSystem",
    "Resolve-Path": "FileSystem",
    "Split-Path": "FileSystem",
    "Join-Path": "FileSystem",
    
    // Process management
    "Get-Process": "Process",
    "Start-Process": "Process",
    "Stop-Process": "Process",
    "Wait-Process": "Process",
    
    // Service management
    "Get-Service": "Service",
    "Start-Service": "Service",
    "Stop-Service": "Service",
    "Restart-Service": "Service",
    "Set-Service": "Service",
    
    // Network operations
    "Test-Connection": "Network",
    "Test-NetConnection": "Network",
    "Invoke-WebRequest": "Network",
    "Invoke-RestMethod": "Network",
    "Resolve-DnsName": "Network",
    "Get-NetAdapter": "Network",
    "Get-NetIPAddress": "Network",
    
    // Event Log
    "Get-EventLog": "EventLog",
    "Write-EventLog": "EventLog",
    "Get-WinEvent": "EventLog",
    
    // Registry (Note: Get-ItemProperty and Set-ItemProperty are already in FileSystem)
    "New-ItemProperty": "Registry",
    "Remove-ItemProperty": "Registry",
    
    // Scheduled Tasks
    "Get-ScheduledTask": "ScheduledTask",
    "Register-ScheduledTask": "ScheduledTask",
    "Unregister-ScheduledTask": "ScheduledTask",
    "Start-ScheduledTask": "ScheduledTask",
    "Stop-ScheduledTask": "ScheduledTask",
    
    // Azure cmdlets
    "Connect-AzAccount": "Azure",
    "Get-AzSubscription": "Azure",
    "Set-AzContext": "Azure",
    "Get-AzResource": "Azure",
    "Get-AzResourceGroup": "Azure",
    "New-AzResourceGroup": "Azure",
    "Get-AzVM": "Azure",
    "Start-AzVM": "Azure",
    "Stop-AzVM": "Azure",
    "Get-AzStorageAccount": "Azure",
    "Get-AzKeyVault": "Azure",
    "Get-AzKeyVaultSecret": "Azure",
    "Set-AzKeyVaultSecret": "Azure",
    "Get-AzAutomationAccount": "Azure",
    "Start-AzAutomationRunbook": "Azure",
    
    // Active Directory
    "Get-ADUser": "ActiveDirectory",
    "Set-ADUser": "ActiveDirectory",
    "New-ADUser": "ActiveDirectory",
    "Get-ADGroup": "ActiveDirectory",
    "Get-ADComputer": "ActiveDirectory",
    "Get-ADGroupMember": "ActiveDirectory",
    
    // Output/Logging
    "Write-Output": "Output",
    "Write-Host": "Output",
    "Write-Warning": "Output",
    "Write-Error": "Output",
    "Write-Verbose": "Output",
    "Write-Debug": "Output",
    "Write-Information": "Output",
    
    // Object manipulation
    "Select-Object": "Object",
    "Where-Object": "Object",
    "ForEach-Object": "Object",
    "Sort-Object": "Object",
    "Group-Object": "Object",
    "Measure-Object": "Object",
    "Compare-Object": "Object",
    "New-Object": "Object",
    
    // String/Data
    "ConvertTo-Json": "Data",
    "ConvertFrom-Json": "Data",
    "ConvertTo-Csv": "Data",
    "ConvertFrom-Csv": "Data",
    "ConvertTo-Xml": "Data",
    "Export-Csv": "Data",
    "Import-Csv": "Data",
    
    // Module management
    "Import-Module": "Module",
    "Get-Module": "Module",
    "Install-Module": "Module",
    
    // Error handling
    "Try": "ErrorHandling",
    "Catch": "ErrorHandling",
    "Finally": "ErrorHandling",
    "Throw": "ErrorHandling",
    
    // Variable/Environment
    "Get-Variable": "Variable",
    "Set-Variable": "Variable",
    "Get-ChildItem Env:": "Environment",
};

/**
 * Extracts PowerShell cmdlets and functions from script content
 */
export const analyzeScriptCode = (scriptContent: string): CodeAnalysisResult => {
    const cmdlets: PowerShellCmdlet[] = [];
    const functions: PowerShellFunction[] = [];

    if (!scriptContent) {
        return { cmdlets: [], functions: [], cmdletCount: 0, functionCount: 0 };
    }

    // Strip comments before analyzing - cmdlets in comments should not be counted
    const cleanedContent = stripPowerShellComments(scriptContent);

    // ── Extract Cmdlets ────────────────────────────────────────────────────────
    // Match Verb-Noun pattern (standard PowerShell cmdlet naming)
    // Common verbs: Get, Set, New, Remove, Add, Clear, Copy, Move, Start, Stop, 
    //               Invoke, Test, Write, Read, Export, Import, Connect, Disconnect, etc.
    const cmdletRegex = /\b(Get|Set|New|Remove|Add|Clear|Copy|Move|Start|Stop|Restart|Invoke|Test|Write|Read|Export|Import|Connect|Disconnect|Enable|Disable|Install|Uninstall|Update|Register|Unregister|Enter|Exit|Find|Format|Measure|Out|Push|Pop|Rename|Reset|Resolve|Select|Send|Show|Sort|Split|Join|Wait|Watch|Debug|Trace|Use|ConvertTo|ConvertFrom|Compare|Compress|Expand|Limit|Lock|Unlock|Merge|Mount|Unmount|Receive|Redo|Undo|Repair|Request|Revoke|Save|Search|Step|Submit|Suspend|Resume|Sync|Publish|Unpublish|Assert|Checkpoint|Confirm|Deny|Grant|Switch|Protect|Unprotect|Approve|Block|Unblock|Close|Open|Hide|Optimize|Complete|Skip|Initialize|Backup|Restore)-([A-Z][a-zA-Z0-9]+)/g;

    const seenCmdlets = new Set<string>();
    let match: RegExpExecArray | null;

    while ((match = cmdletRegex.exec(cleanedContent)) !== null) {
        const verb = match[1];
        const noun = match[2];
        const fullName = `${verb}-${noun}`;

        if (!seenCmdlets.has(fullName.toLowerCase())) {
            seenCmdlets.add(fullName.toLowerCase());
            const category = CMDLET_CATEGORIES[fullName] || categorizeByNoun(noun) || "Other";
            cmdlets.push({ verb, noun, fullName, category });
        }
    }

    // ── Extract Functions ──────────────────────────────────────────────────────
    // Match function definitions: function FunctionName { ... } or function FunctionName() { ... }
    // Also matches: function Verb-Noun { ... }
    // Note: We use original scriptContent for line numbers but skip commented lines
    const functionRegex = /^\s*function\s+([A-Za-z][A-Za-z0-9_-]*)\s*(?:\([^)]*\))?\s*\{/gim;

    const lines = scriptContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip if line is a comment (starts with #, possibly with leading whitespace)
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('#') || trimmedLine.startsWith('<#')) {
            continue;
        }
        const funcMatch = /^\s*function\s+([A-Za-z][A-Za-z0-9_-]*)/i.exec(line);
        if (funcMatch) {
            const funcName = funcMatch[1];
            // Avoid duplicates
            if (!functions.some(f => f.name.toLowerCase() === funcName.toLowerCase())) {
                functions.push({ name: funcName, lineNumber: i + 1 });
            }
        }
    }

    return {
        cmdlets,
        functions,
        cmdletCount: cmdlets.length,
        functionCount: functions.length,
    };
};

/**
 * Categorize cmdlets by their noun when not found in predefined categories
 */
function categorizeByNoun(noun: string): string {
    const nounLower = noun.toLowerCase();
    
    if (nounLower.includes("az") || nounLower.includes("azure")) return "Azure";
    if (nounLower.includes("ad") || nounLower.includes("user") || nounLower.includes("group")) return "ActiveDirectory";
    if (nounLower.includes("file") || nounLower.includes("path") || nounLower.includes("content") || nounLower.includes("item")) return "FileSystem";
    if (nounLower.includes("process")) return "Process";
    if (nounLower.includes("service")) return "Service";
    if (nounLower.includes("event") || nounLower.includes("log")) return "EventLog";
    if (nounLower.includes("net") || nounLower.includes("web") || nounLower.includes("rest") || nounLower.includes("dns")) return "Network";
    if (nounLower.includes("task") || nounLower.includes("job") || nounLower.includes("schedule")) return "ScheduledTask";
    if (nounLower.includes("module")) return "Module";
    if (nounLower.includes("object")) return "Object";
    if (nounLower.includes("json") || nounLower.includes("csv") || nounLower.includes("xml")) return "Data";
    if (nounLower.includes("string") || nounLower.includes("date")) return "Utility";
    
    return "Other";
}

export const extractDependenciesFromScript = (scriptContent: string): ScriptDependency[] => {
    const dependencies: ScriptDependency[] = [];

    if (!scriptContent) return dependencies;

    // Strip comments before analyzing - dependencies in comments should not be counted
    const cleanedContent = stripPowerShellComments(scriptContent);

    // Deduplication helper
    const addIfUnique = (dep: ScriptDependency) => {
        if (!dependencies.some(d =>
            d.name === dep.name &&
            d.action === dep.action &&
            d.resourceType === dep.resourceType
        )) {
            dependencies.push(dep);
        }
    };

    // -------------------------------------------------------------------------
    // Regex building blocks
    //
    // QUOTED   : matches "value" or 'value' — captures the inner text
    // UNQUOTED : matches a bare word that does NOT start with - (flag) or $ (variable)
    //            This prevents false positives like: Get-AutomationVariable -Name $someVar
    //            or capturing the next PowerShell parameter flag as the name.
    // NAME_OPT : optional -Name parameter (case-insensitive via /i flag on each regex)
    // -------------------------------------------------------------------------
    const QUOTED   = `["']([^"'\\s]+)["']`;
    const UNQUOTED = `([^-"'\\s$][^"'\\s]*)`;
    const NAME_OPT = `(?:\\s+-Name)?`;
    const VALUE    = `(?:${QUOTED}|${UNQUOTED})`;

    let match: RegExpExecArray | null;

    // -------------------------------------------------------------------------
    // Variables — Get-AutomationVariable / Set-AutomationVariable
    // -------------------------------------------------------------------------
    const varRegex = new RegExp(`(Get|Set)-AutomationVariable${NAME_OPT}\\s+${VALUE}`, "gi");
    while ((match = varRegex.exec(cleanedContent)) !== null) {
        const action = match[1] as "Get" | "Set";
        const name   = match[2] || match[3]; // [2] = quoted, [3] = unquoted
        if (name) addIfUnique({ action, name, resourceType: "Variable" });
    }

    // -------------------------------------------------------------------------
    // Credentials — Get-AutomationPSCredential
    // -------------------------------------------------------------------------
    const credRegex = new RegExp(`Get-AutomationPSCredential${NAME_OPT}\\s+${VALUE}`, "gi");
    while ((match = credRegex.exec(cleanedContent)) !== null) {
        const name = match[1] || match[2];
        if (name) addIfUnique({ action: "Get", name, resourceType: "Credential" });
    }

    // -------------------------------------------------------------------------
    // Certificates — Get-AutomationCertificate
    // Returns an X509Certificate2 object used for authentication signing.
    // -------------------------------------------------------------------------
    const certRegex = new RegExp(`Get-AutomationCertificate${NAME_OPT}\\s+${VALUE}`, "gi");
    while ((match = certRegex.exec(cleanedContent)) !== null) {
        const name = match[1] || match[2];
        if (name) addIfUnique({ action: "Get", name, resourceType: "Certificate" });
    }

    // -------------------------------------------------------------------------
    // Connections — Get-AutomationConnection
    // Returns a hashtable of fields (TenantId, ApplicationId, CertificateThumbprint, etc.)
    // Commonly used for service principal authentication patterns.
    // -------------------------------------------------------------------------
    const connRegex = new RegExp(`Get-AutomationConnection${NAME_OPT}\\s+${VALUE}`, "gi");
    while ((match = connRegex.exec(cleanedContent)) !== null) {
        const name = match[1] || match[2];
        if (name) addIfUnique({ action: "Get", name, resourceType: "Connection" });
    }

    return dependencies;
};

// ── Azure Key Vault Dependencies ───────────────────────────────────────────────

/**
 * Represents a Key Vault resource accessed in the script
 */
export interface KeyVaultDependency {
    vaultName: string;
    resourceName: string;
    resourceType: "Secret" | "Key" | "Certificate";
    isPlainText?: boolean;  // For secrets retrieved with -AsPlainText (security risk)
}

/**
 * Key Vault usage grouped by vault
 */
export interface KeyVaultUsage {
    vaultName: string;
    secrets: { name: string; isPlainText: boolean }[];
    keys: { name: string }[];
    certificates: { name: string }[];
}

/**
 * Extracts Azure Key Vault dependencies from PowerShell script content
 * 
 * Supported cmdlets:
 * - Get-AzKeyVaultSecret -VaultName "X" -Name "Y" [-AsPlainText]
 * - Get-AzKeyVaultKey -VaultName "X" -Name "Y" (or -KeyName "Y")
 * - Get-AzKeyVaultCertificate -VaultName "X" -Name "Y"
 */
export const extractKeyVaultDependencies = (scriptContent: string): KeyVaultDependency[] => {
    const dependencies: KeyVaultDependency[] = [];

    if (!scriptContent) return dependencies;

    // Strip comments before analyzing - Key Vault cmdlets in comments should not be counted
    const cleanedContent = stripPowerShellComments(scriptContent);

    // Helper to add unique dependencies
    const addIfUnique = (dep: KeyVaultDependency) => {
        if (!dependencies.some(d =>
            d.vaultName.toLowerCase() === dep.vaultName.toLowerCase() &&
            d.resourceName.toLowerCase() === dep.resourceName.toLowerCase() &&
            d.resourceType === dep.resourceType
        )) {
            dependencies.push(dep);
        }
    };

    // -------------------------------------------------------------------------
    // Regex patterns for parameter extraction
    // Supports both quoted ("value", 'value') and unquoted (value) parameter values
    // -------------------------------------------------------------------------

    // Match -VaultName parameter
    const vaultNamePattern = `-VaultName\\s+(?:["']([^"']+)["']|([^\\s-][^\\s]*))`;
    // Match -Name parameter
    const namePattern = `-Name\\s+(?:["']([^"']+)["']|([^\\s-][^\\s]*))`;
    // Match -KeyName parameter (alternative for Get-AzKeyVaultKey)
    const keyNamePattern = `-KeyName\\s+(?:["']([^"']+)["']|([^\\s-][^\\s]*))`;

    let match: RegExpExecArray | null;

    // -------------------------------------------------------------------------
    // Get-AzKeyVaultSecret -VaultName "X" -Name "Y" [-AsPlainText]
    // https://learn.microsoft.com/en-us/powershell/module/az.keyvault/get-azkeyvaultsecret
    // -------------------------------------------------------------------------
    const secretRegex = /Get-AzKeyVaultSecret\s+[^|;\n]+/gi;
    while ((match = secretRegex.exec(cleanedContent)) !== null) {
        const cmdLine = match[0];
        
        // Extract VaultName
        const vaultMatch = new RegExp(vaultNamePattern, "i").exec(cmdLine);
        const vaultName = vaultMatch ? (vaultMatch[1] || vaultMatch[2]) : null;
        
        // Extract Name
        const nameMatch = new RegExp(namePattern, "i").exec(cmdLine);
        const secretName = nameMatch ? (nameMatch[1] || nameMatch[2]) : null;
        
        // Check for -AsPlainText (security risk indicator)
        const isPlainText = /-AsPlainText/i.test(cmdLine);
        
        if (vaultName && secretName) {
            addIfUnique({
                vaultName,
                resourceName: secretName,
                resourceType: "Secret",
                isPlainText,
            });
        }
    }

    // -------------------------------------------------------------------------
    // Get-AzKeyVaultKey -VaultName "X" -Name "Y" (or -KeyName "Y")
    // https://learn.microsoft.com/en-us/powershell/module/az.keyvault/get-azkeyvaultkey
    // -------------------------------------------------------------------------
    const keyRegex = /Get-AzKeyVaultKey\s+[^|;\n]+/gi;
    while ((match = keyRegex.exec(cleanedContent)) !== null) {
        const cmdLine = match[0];
        
        // Extract VaultName
        const vaultMatch = new RegExp(vaultNamePattern, "i").exec(cmdLine);
        const vaultName = vaultMatch ? (vaultMatch[1] || vaultMatch[2]) : null;
        
        // Extract Name or KeyName
        let keyName: string | null = null;
        const nameMatch = new RegExp(namePattern, "i").exec(cmdLine);
        const keyNameMatch = new RegExp(keyNamePattern, "i").exec(cmdLine);
        
        if (nameMatch) {
            keyName = nameMatch[1] || nameMatch[2];
        } else if (keyNameMatch) {
            keyName = keyNameMatch[1] || keyNameMatch[2];
        }
        
        if (vaultName && keyName) {
            addIfUnique({
                vaultName,
                resourceName: keyName,
                resourceType: "Key",
            });
        }
    }

    // -------------------------------------------------------------------------
    // Get-AzKeyVaultCertificate -VaultName "X" -Name "Y"
    // https://learn.microsoft.com/en-us/powershell/module/az.keyvault/get-azkeyvaultcertificate
    // -------------------------------------------------------------------------
    const certRegex = /Get-AzKeyVaultCertificate\s+[^|;\n]+/gi;
    while ((match = certRegex.exec(cleanedContent)) !== null) {
        const cmdLine = match[0];
        
        // Extract VaultName
        const vaultMatch = new RegExp(vaultNamePattern, "i").exec(cmdLine);
        const vaultName = vaultMatch ? (vaultMatch[1] || vaultMatch[2]) : null;
        
        // Extract Name
        const nameMatch = new RegExp(namePattern, "i").exec(cmdLine);
        const certName = nameMatch ? (nameMatch[1] || nameMatch[2]) : null;
        
        if (vaultName && certName) {
            addIfUnique({
                vaultName,
                resourceName: certName,
                resourceType: "Certificate",
            });
        }
    }

    return dependencies;
};

// ── Script Variable Resolver ────────────────────────────────────────────────────

/**
 * Extracts simple scalar string assignments from cleaned script content.
 * Maps lowercase variable name → literal string value.
 * Used to resolve $variable references in cmdlet parameters.
 *
 * Example:
 *   $url = "https://api.example.com"
 *   Invoke-WebRequest $url          ← $url resolved to literal URL
 */
function extractScriptVariables(cleanedContent: string): Map<string, string> {
    const vars = new Map<string, string>();
    const assignRegex = /\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']([^"'\r\n]+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = assignRegex.exec(cleanedContent)) !== null) {
        vars.set(m[1].toLowerCase(), m[2]);
    }
    return vars;
}

/**
 * Resolves a $variable reference to its literal value if found in `vars`.
 * If it cannot be resolved (computed at runtime), keeps the original $varName
 * string so the graph still shows it.
 */
function resolveVariable(value: string | null, vars: Map<string, string>): string | null {
    if (!value) return null;
    if (value.startsWith("$")) {
        const varName = value.replace(/^\$/, "").split(".")[0].toLowerCase();
        return vars.get(varName) ?? value;
    }
    return value;
}

// ── Azure VM Dependencies ──────────────────────────────────────────────────────

/**
 * Represents a single Azure VM operation found in the script
 * Covers: Start-AzVM, Stop-AzVM, Get-AzVM, Restart-AzVM
 * Ref: https://learn.microsoft.com/en-us/powershell/module/az.compute/start-azvm
 */
export interface AzVmUsage {
    action: "Start" | "Stop" | "Get" | "Restart";
    vmName: string | null;        // from -Name parameter
    resourceGroup: string | null; // from -ResourceGroupName parameter
    vmId: string | null;          // from -Id parameter (full resource ID)
}

/**
 * Extracts Azure VM operations from PowerShell runbook scripts.
 *
 * Supported variants:
 *   Start-AzVM -ResourceGroupName "RG1" -Name "VM1"
 *   Start-AzVM -Name $VMName -ResourceGroupName $RG         ← variable params
 *   Start-AzVM -Name "VM1" -ResourceGroupName "RG1"
 *   Start-AzVM -Id "/subscriptions/.../virtualMachines/VM1"
 *   Multi-line via backtick continuation
 *   Stop-AzVM / Get-AzVM / Restart-AzVM with same patterns
 */
export const extractAzVmUsage = (scriptContent: string): AzVmUsage[] => {
    const usages: AzVmUsage[] = [];
    if (!scriptContent) return usages;

    // Normalise backtick line continuations before stripping comments
    // so multi-line Start-AzVM calls are joined into a single line
    const normalised = scriptContent.replace(/`\s*\r?\n\s*/g, " ");
    const cleanedContent = stripPowerShellComments(normalised);
    const scriptVars = extractScriptVariables(cleanedContent);

    const addIfUnique = (u: AzVmUsage) => {
        const key = `${u.action}-${(u.vmName ?? u.vmId ?? "").toLowerCase()}-${(u.resourceGroup ?? "").toLowerCase()}`;
        if (!usages.some(x => `${x.action}-${(x.vmName ?? x.vmId ?? "").toLowerCase()}-${(x.resourceGroup ?? "").toLowerCase()}` === key)) {
            usages.push(u);
        }
    };

    // VALUE captures:  "quoted"  |  'quoted'  |  $variable  |  bare-word
    // Deliberately includes $variable so runtime-bound names are visible in the graph.
    const VALUE = `(?:["']([^"']+)["']|(\\$[A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z0-9_]+)*)|([^-"'\\s$][^"'\\s]*))`;

    // Match VM cmdlet + remaining args until newline, semicolon, or pipe
    const vmCmdRegex = /\b(Start|Stop|Get|Restart)-AzVM\b([^\n;|]*)/gi;
    const NAME_RE = new RegExp(`-Name\\s+${VALUE}`, "i");
    const RG_RE   = new RegExp(`-ResourceGroupName\\s+${VALUE}`, "i");
    const ID_RE   = new RegExp(`-Id\\s+${VALUE}`, "i");

    let match: RegExpExecArray | null;
    while ((match = vmCmdRegex.exec(cleanedContent)) !== null) {
        const action  = match[1] as AzVmUsage["action"];
        const cmdLine = match[0];

        const nameMatch = NAME_RE.exec(cmdLine);
        const rgMatch   = RG_RE.exec(cmdLine);
        const idMatch   = ID_RE.exec(cmdLine);

        // Each VALUE group has 3 capture slots: quoted / $var / bare-word
        const rawVmName = nameMatch ? (nameMatch[1] || nameMatch[2] || nameMatch[3] || null) : null;
        const rawRG     = rgMatch   ? (rgMatch[1]   || rgMatch[2]   || rgMatch[3]   || null) : null;
        const vmId      = idMatch   ? (idMatch[1]   || idMatch[2]   || idMatch[3]   || null) : null;

        // Always emit a node — even if we only know the command was present.
        // Resolve $variable references to their literal string values when possible.
        addIfUnique({
            action,
            vmName:        resolveVariable(rawVmName, scriptVars),
            resourceGroup: resolveVariable(rawRG, scriptVars),
            vmId,
        });
    }

    return usages;
};

// ── HTTP Web Request Dependencies ──────────────────────────────────────────────

/**
 * Represents a single Invoke-WebRequest / Invoke-RestMethod call found in the script.
 * Ref: https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/invoke-webrequest
 *
 * Parsed parameters:
 *   -Uri        : positional (index 0) or named — can be a quoted URL or $variable
 *   -Method     : Default/Get/Head/Post/Put/Delete/Trace/Options/Merge/Patch (default = GET)
 *   -CustomMethod: any freeform string (e.g. "TEST")
 *
 * Covered cmdlets / aliases:
 *   Invoke-WebRequest  (iwr)
 *   Invoke-RestMethod  (irm)
 */
export interface WebRequestUsage {
    cmdlet: "Invoke-WebRequest" | "Invoke-RestMethod";
    method: string;           // GET / POST / PUT / DELETE etc. (uppercased)
    uri: string | null;       // literal URL or $varName
}

export const extractWebRequestUsage = (scriptContent: string): WebRequestUsage[] => {
    const usages: WebRequestUsage[] = [];
    if (!scriptContent) return usages;

    // Normalise backtick line continuations before comment stripping
    const normalised = scriptContent.replace(/`\s*\r?\n\s*/g, " ");
    const cleanedContent = stripPowerShellComments(normalised);
    const scriptVars = extractScriptVariables(cleanedContent);

    const addIfUnique = (u: WebRequestUsage) => {
        const key = `${u.cmdlet}-${u.method}-${(u.uri ?? "").toLowerCase()}`;
        if (!usages.some(x => `${x.cmdlet}-${x.method}-${(x.uri ?? "").toLowerCase()}` === key)) {
            usages.push(u);
        }
    };

    // Matches all variants including aliases. The args run until newline|semicolon|pipe.
    const cmdRegex = /\b(Invoke-WebRequest|iwr|Invoke-RestMethod|irm)\b([^\n;|]*)/gi;

    // VALUE: "quoted" | 'quoted' | $variable | bare-word (no leading - or $param flag)
    const VAL = `(?:["']([^"']+)["']|(\\$[A-Za-z_][A-Za-z0-9_.]*)|([^-"'\\s$][^"'\\s]*))`;

    // Named -Uri
    const URI_NAMED_RE  = new RegExp(`-Uri\\s+${VAL}`, "i");
    // Positional: first bare value after the cmdlet name that isn't a switch flag
    // Covers: `Invoke-WebRequest https://...` or `Invoke-WebRequest $uri`
    const URI_POS_RE    = new RegExp(`^(?:Invoke-WebRequest|iwr|Invoke-RestMethod|irm)\\s+${VAL}`, "i");
    const METHOD_RE     = new RegExp(`-Method\\s+(?:["']([^"']+)["']|([A-Za-z]+))`, "i");
    const CUSTOM_RE     = new RegExp(`-CustomMethod\\s+(?:["']([^"']+)["']|([A-Za-z]+))`, "i");

    let match: RegExpExecArray | null;
    while ((match = cmdRegex.exec(cleanedContent)) !== null) {
        const rawCmdlet = match[1].toLowerCase();
        const cmdlet: WebRequestUsage["cmdlet"] =
            (rawCmdlet === "invoke-webrequest" || rawCmdlet === "iwr")
                ? "Invoke-WebRequest"
                : "Invoke-RestMethod";
        const cmdLine = match[0];

        // Resolve URI: try named first, fall back to positional
        let uri: string | null = null;
        const uriNamedMatch = URI_NAMED_RE.exec(cmdLine);
        if (uriNamedMatch) {
            uri = uriNamedMatch[1] || uriNamedMatch[2] || uriNamedMatch[3] || null;
        } else {
            const uriPosMatch = URI_POS_RE.exec(cmdLine);
            if (uriPosMatch) {
                const candidate = uriPosMatch[1] || uriPosMatch[2] || uriPosMatch[3] || null;
                // Only accept as positional URI if not a parameter flag
                if (candidate && !candidate.startsWith("-")) {
                    uri = candidate;
                }
            }
        }
        // Resolve $variable references to their literal string values when possible
        if (uri) uri = resolveVariable(uri, scriptVars) ?? uri;

        // Resolve Method
        let method = "GET";
        const customMatch = CUSTOM_RE.exec(cmdLine);
        if (customMatch) {
            method = (customMatch[1] || customMatch[2] || "GET").toUpperCase();
        } else {
            const methodMatch = METHOD_RE.exec(cmdLine);
            if (methodMatch) {
                const raw = (methodMatch[1] || methodMatch[2] || "").toUpperCase();
                // "Default" maps to GET per PowerShell docs
                method = raw === "DEFAULT" || raw === "" ? "GET" : raw;
            }
        }

        addIfUnique({ cmdlet, method, uri });
    }

    return usages;
};

/**
 * Groups Key Vault dependencies by vault name for hierarchical display
 */
export const groupKeyVaultDependencies = (deps: KeyVaultDependency[]): KeyVaultUsage[] => {
    const vaultMap = new Map<string, KeyVaultUsage>();

    for (const dep of deps) {
        const key = dep.vaultName.toLowerCase();
        
        if (!vaultMap.has(key)) {
            vaultMap.set(key, {
                vaultName: dep.vaultName,
                secrets: [],
                keys: [],
                certificates: [],
            });
        }

        const vault = vaultMap.get(key)!;

        switch (dep.resourceType) {
            case "Secret":
                if (!vault.secrets.some(s => s.name.toLowerCase() === dep.resourceName.toLowerCase())) {
                    vault.secrets.push({ name: dep.resourceName, isPlainText: dep.isPlainText ?? false });
                }
                break;
            case "Key":
                if (!vault.keys.some(k => k.name.toLowerCase() === dep.resourceName.toLowerCase())) {
                    vault.keys.push({ name: dep.resourceName });
                }
                break;
            case "Certificate":
                if (!vault.certificates.some(c => c.name.toLowerCase() === dep.resourceName.toLowerCase())) {
                    vault.certificates.push({ name: dep.resourceName });
                }
                break;
        }
    }

    return Array.from(vaultMap.values());
};

// ── Hardcoded Secret Detection ────────────────────────────────────────────────

/**
 * Represents a potential hardcoded secret found in the script.
 * Detection is name-based: variables whose names suggest sensitive data
 * and whose values are non-trivial string literals.
 */
export interface HardcodedSecret {
    variableName: string;  // e.g. "$password"
    value: string;         // masked:  e.g. "P@ss****"
}

/**
 * Detects hardcoded credentials/secrets in PowerShell scripts.
 * Flags assignments like:  $password = "P@ssw0rd123!"
 *
 * Sensitive variable name patterns: password, passwd, pwd, secret, apikey,
 *   token, bearer, credential, connectionstring, accesskey, privatekey,
 *   clientsecret, sastoken.
 *
 * False-positive guards:
 *   - Value must be ≥ 6 characters
 *   - Skips file paths (C:\..., /...)
 */
export const extractHardcodedSecrets = (scriptContent: string): HardcodedSecret[] => {
    const secrets: HardcodedSecret[] = [];
    if (!scriptContent) return secrets;

    const cleanedContent = stripPowerShellComments(scriptContent);
    const SENSITIVE = /\b(password|passwd|pwd|secret|api[_-]?key|apikey|token|bearer|credential(?!s\b)|cred(?!entials)|connstr|connectionstring|access[_-]?key|private[_-]?key|client[_-]?secret|sas[_-]?token|shared[_-]?access)\b/i;

    // Match: $varName = "literal"  (not another variable, not a cmdlet return)
    const assignRegex = /\$([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']([^"'\r\n]{4,})["']/g;
    let m: RegExpExecArray | null;
    while ((m = assignRegex.exec(cleanedContent)) !== null) {
        const varName = m[1];
        const value   = m[2];
        if (!SENSITIVE.test(varName)) continue;
        if (value.startsWith("C:\\") || value.startsWith("/")) continue;
        if (value.length < 6) continue;
        if (!secrets.some(s => s.variableName.toLowerCase() === `$${varName}`.toLowerCase())) {
            const masked = value.length > 6 ? value.substring(0, 4) + "****" : "****";
            secrets.push({ variableName: `$${varName}`, value: masked });
        }
    }

    return secrets;
};

// ── RunAs Account Detection ───────────────────────────────────────────────────

/**
 * Represents usage of the deprecated Azure RunAs account pattern.
 * Microsoft deprecated RunAs accounts (Sept 30, 2023).
 * Scripts should migrate to Managed Identity.
 * Ref: https://learn.microsoft.com/en-us/azure/automation/migrate-run-as-accounts-managed-identity
 */
export interface RunAsUsage {
    connectionName:       string;   // e.g. "AzureRunAsConnection"
    usesServicePrincipal: boolean;
    usesCertificate:      boolean;
}

export const extractRunAsUsage = (scriptContent: string): RunAsUsage | null => {
    if (!scriptContent) return null;

    const normalised     = scriptContent.replace(/`\s*\r?\n\s*/g, " ");
    const cleanedContent = stripPowerShellComments(normalised);

    const runAsConn = /Get-AutomationConnection\s+(?:-Name\s+)?["']?(AzureRunAsConnection|AzureClassicRunAsConnection)["']?/i.test(cleanedContent);
    const spAuth    = /Connect-AzAccount\s+[^|;\n]*-ServicePrincipal/i.test(cleanedContent);
    const certAuth  = /-CertificateThumbprint/i.test(cleanedContent);

    if (!runAsConn && !spAuth) return null;

    return {
        connectionName:       runAsConn ? "AzureRunAsConnection" : "AzureClassicRunAsConnection",
        usesServicePrincipal: spAuth,
        usesCertificate:      certAuth,
    };
};

// ── Child Runbook Calls ───────────────────────────────────────────────────────

/**
 * Represents a call to Start-AzAutomationRunbook within a runbook.
 * Used to map runbook orchestration chains.
 */
export interface ChildRunbookCall {
    runbookName:   string;        // target runbook name (literal or $variable)
    wait:          boolean;       // -Wait flag (synchronous call)
    resourceGroup: string | null;
}

export const extractChildRunbookCalls = (scriptContent: string): ChildRunbookCall[] => {
    const calls: ChildRunbookCall[] = [];
    if (!scriptContent) return calls;

    const normalised     = scriptContent.replace(/`\s*\r?\n\s*/g, " ");
    const cleanedContent = stripPowerShellComments(normalised);
    const scriptVars     = extractScriptVariables(cleanedContent);

    const VAL     = `(?:["']([^"']+)["']|(\\$[A-Za-z_][A-Za-z0-9_]*)|([^-"'\\s$][^"'\\s]*))`;
    const NAME_RE = new RegExp(`-Name\\s+${VAL}`, "i");
    const RG_RE   = new RegExp(`-ResourceGroupName\\s+${VAL}`, "i");
    const WAIT_RE = /-Wait\b/i;

    const cmdRegex = /\bStart-AzAutomationRunbook\b([^\n;|]*)/gi;
    let match: RegExpExecArray | null;
    while ((match = cmdRegex.exec(cleanedContent)) !== null) {
        const cmdLine   = match[0];
        const nameMatch = NAME_RE.exec(cmdLine);
        const rgMatch   = RG_RE.exec(cmdLine);
        const wait      = WAIT_RE.test(cmdLine);

        const rawName       = nameMatch ? (nameMatch[1] || nameMatch[2] || nameMatch[3] || null) : null;
        const rawRG         = rgMatch   ? (rgMatch[1]   || rgMatch[2]   || rgMatch[3]   || null) : null;
        const runbookName   = resolveVariable(rawName, scriptVars);
        const resourceGroup = resolveVariable(rawRG, scriptVars);

        if (runbookName && !calls.some(c => c.runbookName.toLowerCase() === runbookName.toLowerCase())) {
            calls.push({ runbookName, wait, resourceGroup });
        }
    }

    return calls;
};

// ── Email / Notification Detection ───────────────────────────────────────────

/**
 * Represents an email or notification call found in the script.
 * Covers Send-MailMessage (SMTP), Send-MgUserMail (MS Graph),
 * and Invoke-RestMethod calls to Graph mail endpoints.
 */
export interface EmailUsage {
    cmdlet:  string;
    to:      string | null;
    subject: string | null;
}

export const extractEmailUsage = (scriptContent: string): EmailUsage[] => {
    const usages: EmailUsage[] = [];
    if (!scriptContent) return usages;

    const normalised     = scriptContent.replace(/`\s*\r?\n\s*/g, " ");
    const cleanedContent = stripPowerShellComments(normalised);
    const scriptVars     = extractScriptVariables(cleanedContent);

    const VAL     = `(?:["']([^"']+)["']|(\\$[A-Za-z_][A-Za-z0-9_]*)|([^-"'\\s$][^"'\\s]*))`;
    const TO_RE   = new RegExp(`-To\\s+${VAL}`, "i");
    const SUBJ_RE = new RegExp(`-Subject\\s+${VAL}`, "i");
    let m: RegExpExecArray | null;

    // Send-MailMessage (classic SMTP)
    const smtpRegex = /\bSend-MailMessage\b([^\n;|]*)/gi;
    while ((m = smtpRegex.exec(cleanedContent)) !== null) {
        const cmdLine   = m[0];
        const toMatch   = TO_RE.exec(cmdLine);
        const subjMatch = SUBJ_RE.exec(cmdLine);
        const rawTo     = toMatch   ? (toMatch[1]   || toMatch[2]   || toMatch[3]   || null) : null;
        const rawSubj   = subjMatch ? (subjMatch[1] || subjMatch[2] || subjMatch[3] || null) : null;
        usages.push({
            cmdlet:  "Send-MailMessage",
            to:      resolveVariable(rawTo, scriptVars),
            subject: resolveVariable(rawSubj, scriptVars),
        });
    }

    // Send-MgUserMail (Microsoft Graph SDK)
    if (/\bSend-MgUserMail\b/i.test(cleanedContent)) {
        usages.push({ cmdlet: "Send-MgUserMail", to: null, subject: null });
    }

    // Send-MgUserMessage
    if (/\bSend-MgUserMessage\b/i.test(cleanedContent)) {
        usages.push({ cmdlet: "Send-MgUserMessage", to: null, subject: null });
    }

    // Graph REST API mail send  (Invoke-RestMethod .../sendMail or .../messages/send)
    if (/Invoke-RestMethod[^|;\n]*(?:sendMail|messages\/send)/i.test(cleanedContent)) {
        usages.push({ cmdlet: "Graph API (sendMail)", to: null, subject: null });
    }

    return usages;
};

// ── Azure Storage Operations ──────────────────────────────────────────────────

/**
 * Represents an Azure Storage operation found in the script.
 * Covers blobs, containers, tables, queues, and Data Lake.
 */
export interface StorageUsage {
    action:    "Upload" | "Download" | "List" | "Delete" | "Get" | "New" | "Other";
    cmdlet:    string;
    container: string | null;
    blobName:  string | null;
}

export const extractStorageUsage = (scriptContent: string): StorageUsage[] => {
    const usages: StorageUsage[] = [];
    if (!scriptContent) return usages;

    const normalised     = scriptContent.replace(/`\s*\r?\n\s*/g, " ");
    const cleanedContent = stripPowerShellComments(normalised);
    const scriptVars     = extractScriptVariables(cleanedContent);

    const VAL          = `(?:["']([^"']+)["']|(\\$[A-Za-z_][A-Za-z0-9_]*)|([^-"'\\s$][^"'\\s]*))`;
    const CONTAINER_RE = new RegExp(`-Container(?:Name)?\\s+${VAL}`, "i");
    const BLOB_RE      = new RegExp(`-Blob(?:Name)?\\s+${VAL}`, "i");

    const STORAGE_CMDLETS = [
        "Set-AzStorageBlobContent",
        "Get-AzStorageBlob",
        "Remove-AzStorageBlob",
        "Copy-AzStorageBlob",
        "Get-AzStorageContainer",
        "New-AzStorageContainer",
        "Remove-AzStorageContainer",
        "Get-AzStorageTable",
        "New-AzStorageTable",
        "Get-AzStorageQueue",
        "Export-AzStorageBlobContent",
        "Start-AzStorageBlobCopy",
        "Get-AzDataLakeGen2Item",
        "New-AzDataLakeGen2Item",
    ];

    const cmdPattern = STORAGE_CMDLETS.map(c => c.replace("-", "\\-")).join("|");
    const cmdRegex   = new RegExp(`\\b(${cmdPattern})\\b([^\\n;|]*)`, "gi");
    let m: RegExpExecArray | null;

    while ((m = cmdRegex.exec(cleanedContent)) !== null) {
        const cmdlet   = m[1];
        const cmdLine  = m[0];
        const verb     = cmdlet.split("-")[0];

        const containerMatch = CONTAINER_RE.exec(cmdLine);
        const blobMatch      = BLOB_RE.exec(cmdLine);

        const rawContainer = containerMatch ? (containerMatch[1] || containerMatch[2] || containerMatch[3] || null) : null;
        const rawBlob      = blobMatch      ? (blobMatch[1]      || blobMatch[2]      || blobMatch[3]      || null) : null;
        const container    = resolveVariable(rawContainer, scriptVars);
        const blobName     = resolveVariable(rawBlob, scriptVars);

        const action: StorageUsage["action"] =
            verb === "Set"   ? "Upload" :
            verb === "Export" ? "Download" :
            verb === "Remove" ? "Delete" :
            verb === "New"   ? "New" :
            verb === "Copy" || verb === "Start" ? "Upload" :
            verb === "Get"   ? (cmdlet.toLowerCase().includes("blob") ? "Download" : "Get") :
            "Other";

        const key = `${cmdlet}-${container ?? ""}-${blobName ?? ""}`;
        if (!usages.some(u => `${u.cmdlet}-${u.container ?? ""}-${u.blobName ?? ""}` === key)) {
            usages.push({ action, cmdlet, container, blobName });
        }
    }

    return usages;
};

// ── SQL / Database Operations ─────────────────────────────────────────────────

/**
 * Represents a SQL or database operation found in the script.
 * Covers Invoke-Sqlcmd, dbatools, and System.Data.SqlClient.
 */
export interface SqlUsage {
    cmdlet:         string;
    serverInstance: string | null;
    database:       string | null;
}

export const extractSqlUsage = (scriptContent: string): SqlUsage[] => {
    const usages: SqlUsage[] = [];
    if (!scriptContent) return usages;

    const normalised     = scriptContent.replace(/`\s*\r?\n\s*/g, " ");
    const cleanedContent = stripPowerShellComments(normalised);
    const scriptVars     = extractScriptVariables(cleanedContent);

    const VAL       = `(?:["']([^"']+)["']|(\\$[A-Za-z_][A-Za-z0-9_]*)|([^-"'\\s$][^"'\\s]*))`;
    const SERVER_RE = new RegExp(`-Server(?:Instance)?\\s+${VAL}`, "i");
    const DB_RE     = new RegExp(`-Database\\s+${VAL}`, "i");

    const SQL_CMDLETS = [
        "Invoke-Sqlcmd", "Invoke-DbaQuery", "Write-DbaDataTable",
        "Get-DbaDatabase", "Import-DbaCsv", "Invoke-DbaSqlScript",
    ];

    const cmdPattern = SQL_CMDLETS.map(c => c.replace("-", "\\-")).join("|");
    const cmdRegex   = new RegExp(`\\b(${cmdPattern})\\b([^\\n;|]*)`, "gi");
    let m: RegExpExecArray | null;

    while ((m = cmdRegex.exec(cleanedContent)) !== null) {
        const cmdlet  = m[1];
        const cmdLine = m[0];

        const serverMatch = SERVER_RE.exec(cmdLine);
        const dbMatch     = DB_RE.exec(cmdLine);

        const rawServer = serverMatch ? (serverMatch[1] || serverMatch[2] || serverMatch[3] || null) : null;
        const rawDb     = dbMatch     ? (dbMatch[1]     || dbMatch[2]     || dbMatch[3]     || null) : null;

        const serverInstance = resolveVariable(rawServer, scriptVars);
        const database       = resolveVariable(rawDb, scriptVars);

        if (!usages.some(u => u.cmdlet === cmdlet && u.serverInstance === serverInstance && u.database === database)) {
            usages.push({ cmdlet, serverInstance, database });
        }
    }

    // System.Data.SqlClient (raw .NET usage)
    if (/System\.Data\.SqlClient|SqlConnection|New-Object.*SqlClient/i.test(cleanedContent)) {
        usages.push({ cmdlet: "System.Data.SqlClient", serverInstance: null, database: null });
    }

    return usages;
};

// ── Runbook Parameters ────────────────────────────────────────────────────────

/**
 * Represents a parameter declared in the runbook's param() block.
 * Useful for understanding what inputs the runbook expects.
 */
export interface RunbookParam {
    name:         string;
    type:         string | null;
    mandatory:    boolean;
    defaultValue: string | null;
}

/**
 * Parses the param(...) block of a PowerShell script.
 * Handles:
 *   param([Parameter(Mandatory=$true)][string]$Name = "default")
 *   param($Simple, [bool]$Flag = $false)
 */
export const extractRunbookParams = (scriptContent: string): RunbookParam[] => {
    if (!scriptContent) return [];

    // Find the outermost param(...) — walk chars to handle nested parens
    const lower    = scriptContent.toLowerCase();
    const paramIdx = lower.search(/\bparam\s*\(/);
    if (paramIdx === -1) return [];

    const openParen = scriptContent.indexOf("(", paramIdx);
    if (openParen === -1) return [];

    let depth = 0;
    let closeParen = -1;
    for (let i = openParen; i < scriptContent.length; i++) {
        if (scriptContent[i] === "(") depth++;
        else if (scriptContent[i] === ")") {
            depth--;
            if (depth === 0) { closeParen = i; break; }
        }
    }
    if (closeParen === -1) return [];

    const paramBlock = scriptContent.substring(openParen + 1, closeParen);
    const params: RunbookParam[] = [];

    // Match each parameter declaration
    const paramRegex = /(?:\[Parameter\(([^)]*)\)\]\s*)?(?:\[([^\]]+)\]\s*)?\$([A-Za-z_][A-Za-z0-9_]*)(?:\s*=\s*([^,\r\n)]+))?/gi;
    let m: RegExpExecArray | null;
    while ((m = paramRegex.exec(paramBlock)) !== null) {
        const attributes = m[1] || "";
        const type       = m[2]?.trim() ?? null;
        const name       = m[3];
        const rawDefault = m[4]?.trim() ?? null;
        const mandatory  = /Mandatory\s*=\s*\$?true/i.test(attributes);
        params.push({ name, type, mandatory, defaultValue: rawDefault });
    }

    return params;
};
