"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
    ReactFlow, MiniMap, Controls, Background, useNodesState, useEdgesState,
    Panel, BackgroundVariant, Node, Edge, EdgeProps, NodeProps, NodeChange,
    getBezierPath, EdgeLabelRenderer, BaseEdge, Handle, Position,
    ReactFlowProvider, applyNodeChanges,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AutomationData, JobOutput } from "@/services/azureService";
import { transformAzureDataToGraph, transformAzureDataToObjectView, transformSingleRunbookView, JOB_STATUS_VISUAL, JobStatusVisual, CertExpiryStatus } from "@/utils/mindmapTransform";
import { NodeDetailPanel, SelectedNodeInfo, PanelNodeType } from "./NodeDetailPanel";
import { Network, AlertTriangle, Clock } from "lucide-react";

// ── LocalStorage key for persisting expanded runbooks ──────────────────────────
const EXPANDED_RUNBOOKS_KEY = "automation-mindmap-expanded-runbooks";

// ── Helper to load expanded state from localStorage ────────────────────────────
function loadExpandedState(accountId: string): Set<string> {
    if (typeof window === "undefined") return new Set();
    try {
        const stored = localStorage.getItem(`${EXPANDED_RUNBOOKS_KEY}-${accountId}`);
        if (stored) {
            const parsed = JSON.parse(stored);
            return new Set(Array.isArray(parsed) ? parsed : []);
        }
    } catch (e) {
        console.warn("Failed to load expanded state:", e);
    }
    return new Set();
}

// ── Helper to save expanded state to localStorage ──────────────────────────────
function saveExpandedState(accountId: string, expanded: Set<string>): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(`${EXPANDED_RUNBOOKS_KEY}-${accountId}`, JSON.stringify([...expanded]));
    } catch (e) {
        console.warn("Failed to save expanded state:", e);
    }
}

// ── Custom Node: RunbookNode ───────────────────────────────────────────────────
function RunbookNode({ data, selected }: NodeProps) {
    const lastRun = data.lastRun as any;
    const visual  = (data.statusVisual as JobStatusVisual) ?? JOB_STATUS_VISUAL["NeverRun"];
    const label   = String(data.label ?? "");
    const hasChildren = Boolean(data.hasChildren);
    const isExpanded = Boolean(data.isExpanded);
    const childCount = (data.childCount as number) ?? 0;
    const hasWarnings = Boolean(data.hasWarnings);  // Job succeeded but had errors/exceptions
    const runbookState = data.runbookState as string | null | undefined;
    const isPublished = runbookState === "Published";
    const onToggleExpand = data.onToggleExpand as ((nodeId: string) => void) | undefined;
    
    const handleExpandClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onToggleExpand && data.resourceId) {
            onToggleExpand(data.resourceId as string);
        }
    };
    
    return (
        <>
            <Handle type="target"  position={Position.Top}    style={{ background: "#93c5fd" }} />
            <Handle type="source"  position={Position.Bottom} style={{ background: "#93c5fd" }} />
            <div style={{
                background: "#eff6ff", color: "#1e3a5f",
                borderColor: visual.border, borderWidth: "2px", borderStyle: "solid",
                borderRadius: "8px", padding: "6px 10px 4px",
                minWidth: "160px", maxWidth: "220px",
                boxShadow: selected ? `0 0 0 3px ${visual.border}40` : "0 1px 3px rgba(0,0,0,0.1)",
                cursor: "grab", userSelect: "none",
            }}>
                {isPublished && (
                    <div style={{
                        display: "inline-block",
                        fontSize: "9px",
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                        color: "#ffffff",
                        background: "#16a34a",
                        padding: "1px 6px",
                        borderRadius: "4px",
                        marginBottom: "4px",
                        lineHeight: 1.5,
                    }}>
                        PUBLISHED
                    </div>
                )}
                <div style={{ fontSize: "13px", fontWeight: 600, lineHeight: 1.3, marginBottom: "4px", wordBreak: "break-word" }}>
                    {label}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <span style={{
                        width: "8px", height: "8px", borderRadius: "50%",
                        background: visual.dot, display: "inline-block", flexShrink: 0,
                        animation: ["Running", "Activating", "Resuming"].includes(lastRun?.status)
                            ? "pulse 1.5s ease-in-out infinite" : "none",
                    }} />
                    <span style={{ fontSize: "11px", fontWeight: 700, color: visual.dot, lineHeight: 1 }}>{visual.label}</span>
                    {/* Warning triangle when job succeeded but had errors/exceptions */}
                    {hasWarnings && (
                        <span 
                            style={{ 
                                fontSize: "12px", 
                                color: "#eab308", 
                                lineHeight: 1,
                                marginLeft: "-2px",
                            }} 
                            title={lastRun?.exception ? `Warning: ${lastRun.exception}` : "Job completed with warnings/errors"}
                        >
                            ⚠
                        </span>
                    )}
                    {lastRun?.startTime && (
                        <span style={{ fontSize: "10px", color: "#94a3b8", marginLeft: "2px", lineHeight: 1 }}>
                            {new Date(lastRun.startTime).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                        </span>
                    )}
                    {/* Show hybrid indicator on runbook if last job ran on HW */}
                    {lastRun?.runOn && (
                        <span style={{ fontSize: "9px", color: "#7c3aed", marginLeft: "auto", lineHeight: 1, flexShrink: 0 }} title={`Last ran on: ${lastRun.runOn}`}>⚙</span>
                    )}
                </div>
                {/* Expand/Collapse toggle for runbooks with children */}
                {hasChildren && (
                    <div 
                        onClick={handleExpandClick}
                        style={{
                            display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
                            marginTop: "6px", paddingTop: "6px", borderTop: "1px dashed #cbd5e1",
                            cursor: "pointer", fontSize: "10px", color: "#6366f1", fontWeight: 600,
                        }}
                        title={isExpanded ? "Collapse sub-components" : "Expand sub-components"}
                    >
                        <span style={{
                            width: "16px", height: "16px", borderRadius: "4px",
                            background: isExpanded ? "#6366f1" : "#e0e7ff",
                            color: isExpanded ? "#ffffff" : "#6366f1",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 700, fontSize: "12px", lineHeight: 1,
                        }}>
                            {isExpanded ? "−" : "+"}
                        </span>
                        <span>{childCount} sub-component{childCount !== 1 ? "s" : ""}</span>
                    </div>
                )}
            </div>
            <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.3)} }`}</style>
        </>
    );
}

// ── Custom Node: CertificateNode ───────────────────────────────────────────────
function CertificateNode({ data, selected }: NodeProps) {
    const expiryStatus = data.expiryStatus as CertExpiryStatus | undefined;
    const name = String(data.name ?? "");
    
    // Determine badge and border based on expiry status
    const hasBadge = expiryStatus?.badgeLabel && expiryStatus?.badgeColor;
    const borderColor = expiryStatus?.borderColor ?? "#86efac";
    
    return (
        <>
            <Handle type="target" position={Position.Top} style={{ background: "#86efac" }} />
            <Handle type="source" position={Position.Bottom} style={{ background: "#86efac" }} />
            <div style={{
                background: "#f0fdf4", color: "#14532d",
                borderColor: borderColor, borderWidth: hasBadge ? "2px" : "1px", borderStyle: "solid",
                borderRadius: "8px", padding: "6px 10px",
                minWidth: "140px", maxWidth: "220px",
                boxShadow: selected ? `0 0 0 3px ${borderColor}40` : "0 1px 3px rgba(0,0,0,0.1)",
                cursor: "grab", userSelect: "none",
                display: "flex", alignItems: "center", gap: "6px",
            }}>
                <span style={{ fontSize: "13px", fontWeight: 600, lineHeight: 1.3, wordBreak: "break-word", flex: 1 }}>
                    🛡️ {name}
                </span>
                {hasBadge && (
                    <span style={{
                        fontSize: "9px", fontWeight: 700, 
                        color: "#ffffff",
                        background: expiryStatus!.badgeColor!,
                        padding: "2px 5px", 
                        borderRadius: "4px",
                        lineHeight: 1,
                        flexShrink: 0,
                        whiteSpace: "nowrap",
                    }}>
                        {expiryStatus!.badgeLabel}
                    </span>
                )}
            </div>
        </>
    );
}

// ── Custom Node: KeyVaultNode ──────────────────────────────────────────────────
function KeyVaultNode({ data, selected }: NodeProps) {
    const label = String(data.label ?? "");
    const secrets = (data.secrets as any[]) ?? [];
    const keys = (data.keys as any[]) ?? [];
    const certificates = (data.certificates as any[]) ?? [];
    const totalItems = secrets.length + keys.length + certificates.length;
    
    return (
        <>
            <Handle type="target" position={Position.Top} style={{ background: "#0ea5e9" }} />
            <Handle type="source" position={Position.Bottom} style={{ background: "#0ea5e9" }} />
            <div style={{
                background: "#e0f2fe", color: "#0c4a6e",
                borderColor: "#0ea5e9", borderWidth: "2px", borderStyle: "solid",
                borderRadius: "8px", padding: "8px 12px",
                minWidth: "170px", maxWidth: "220px",
                boxShadow: selected ? "0 0 0 3px #0ea5e940" : "0 1px 3px rgba(0,0,0,0.1)",
                cursor: "grab", userSelect: "none",
                textAlign: "center",
            }}>
                <div style={{ whiteSpace: "pre-line", fontSize: "12px", fontWeight: 600, lineHeight: 1.4 }}>
                    {label}
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "4px", fontSize: "10px" }}>
                    {secrets.length > 0 && <span>🔑 {secrets.length}</span>}
                    {keys.length > 0 && <span>🗝️ {keys.length}</span>}
                    {certificates.length > 0 && <span>📜 {certificates.length}</span>}
                </div>
            </div>
        </>
    );
}

// ── Custom Node: KvSecretNode ──────────────────────────────────────────────────
function KvSecretNode({ data, selected }: NodeProps) {
    const label = String(data.label ?? "");
    const isPlainText = Boolean(data.isPlainText);
    const bgColor = isPlainText ? "#fee2e2" : "#fef3c7";
    const textColor = isPlainText ? "#991b1b" : "#92400e";
    const borderColor = isPlainText ? "#dc2626" : "#fcd34d";
    
    return (
        <>
            <Handle type="target" position={Position.Top} style={{ background: borderColor }} />
            <Handle type="source" position={Position.Bottom} style={{ background: borderColor }} />
            <div style={{
                background: bgColor, color: textColor,
                borderColor: borderColor, borderWidth: isPlainText ? "2px" : "1px", borderStyle: "solid",
                borderRadius: "8px", padding: "6px 10px",
                minWidth: "140px", maxWidth: "200px",
                boxShadow: selected ? `0 0 0 3px ${borderColor}40` : "0 1px 3px rgba(0,0,0,0.1)",
                cursor: "grab", userSelect: "none",
                textAlign: "center",
            }}>
                <div style={{ whiteSpace: "pre-line", fontSize: "11px", fontWeight: 600, lineHeight: 1.4 }}>
                    {label}
                </div>
            </div>
        </>
    );
}

// ── Custom Node: KvKeyNode ─────────────────────────────────────────────────────
function KvKeyNode({ data, selected }: NodeProps) {
    const label = String(data.label ?? "");
    
    return (
        <>
            <Handle type="target" position={Position.Top} style={{ background: "#93c5fd" }} />
            <Handle type="source" position={Position.Bottom} style={{ background: "#93c5fd" }} />
            <div style={{
                background: "#dbeafe", color: "#1e40af",
                borderColor: "#93c5fd", borderWidth: "1px", borderStyle: "solid",
                borderRadius: "8px", padding: "6px 10px",
                minWidth: "140px", maxWidth: "200px",
                boxShadow: selected ? "0 0 0 3px #93c5fd40" : "0 1px 3px rgba(0,0,0,0.1)",
                cursor: "grab", userSelect: "none",
                textAlign: "center",
            }}>
                <div style={{ fontSize: "11px", fontWeight: 600, lineHeight: 1.4 }}>
                    {label}
                </div>
            </div>
        </>
    );
}

// ── Custom Node: KvCertNode ────────────────────────────────────────────────────
function KvCertNode({ data, selected }: NodeProps) {
    const label = String(data.label ?? "");
    
    return (
        <>
            <Handle type="target" position={Position.Top} style={{ background: "#6ee7b7" }} />
            <Handle type="source" position={Position.Bottom} style={{ background: "#6ee7b7" }} />
            <div style={{
                background: "#d1fae5", color: "#065f46",
                borderColor: "#6ee7b7", borderWidth: "1px", borderStyle: "solid",
                borderRadius: "8px", padding: "6px 10px",
                minWidth: "140px", maxWidth: "200px",
                boxShadow: selected ? "0 0 0 3px #6ee7b740" : "0 1px 3px rgba(0,0,0,0.1)",
                cursor: "grab", userSelect: "none",
                textAlign: "center",
            }}>
                <div style={{ fontSize: "11px", fontWeight: 600, lineHeight: 1.4 }}>
                    {label}
                </div>
            </div>
        </>
    );
}

// ── Custom Edge: BrokenDependencyEdge ─────────────────────────────────────────
function BrokenDependencyEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps) {
    const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
    return (
        <>
            <BaseEdge id={id} path={edgePath} style={{ stroke: "#ef4444", strokeWidth: 2, strokeDasharray: "6 3" }} />
            <EdgeLabelRenderer>
                <div style={{ position: "absolute", transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: "all" }}
                    className="flex items-center gap-1 bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-md border border-red-400 whitespace-nowrap">
                    <span>✕</span>
                    <span className="max-w-[120px] truncate">{String(data?.missingName ?? "")}</span>
                </div>
            </EdgeLabelRenderer>
        </>
    );
}

const nodeTypes = { 
    runbookNode: RunbookNode, 
    certificateNode: CertificateNode,
    keyVaultNode: KeyVaultNode,
    kvSecretNode: KvSecretNode,
    kvKeyNode: KvKeyNode,
    kvCertNode: KvCertNode,
};
const edgeTypes = { brokenDependency: BrokenDependencyEdge };

export type MindMapViewType = "runbook" | "object" | "single";

interface MindMapProps { 
    data: AutomationData | null;
    viewType?: MindMapViewType;
    singleRunbookId?: string;
    onRefreshRunbook?: (runbookName: string) => Promise<void>;
    onFetchJobStreams?: (jobId: string) => Promise<JobOutput>;
}

// ── Inner component ───────────────────────────────────────────────────────────
function MindMapInner({ data, viewType = "runbook", singleRunbookId, onRefreshRunbook, onFetchJobStreams }: MindMapProps) {
    const [nodes, setNodes] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [panelInfo,      setPanelInfo]      = useState<SelectedNodeInfo | null>(null);
    const [brokenCount,    setBrokenCount]    = useState(0);
    const [expandedRunbooks, setExpandedRunbooks] = useState<Set<string>>(() => 
        data?.account?.id ? loadExpandedState(data.account.id) : new Set()
    );
    // Refs to track current state for synchronous access in highlighting logic
    const nodesRef = useRef<Node[]>([]);
    const edgesRef = useRef<Edge[]>([]);
    // Track last loaded account so we only reset panel selection on account change, not on data refresh
    const prevAccountIdRef = useRef<string | null>(null);
    
    // Keep refs in sync with state
    useEffect(() => { nodesRef.current = nodes; }, [nodes]);
    useEffect(() => { edgesRef.current = edges; }, [edges]);

    // ── Custom node change handler to move children with parent runbook ───────
    const handleNodesChange = useCallback((changes: NodeChange<Node>[]) => {
        setNodes(currentNodes => {
            // First, apply all changes normally
            let updatedNodes = applyNodeChanges(changes, currentNodes);
            
            // Find position changes for runbook nodes
            const positionChanges = changes.filter(
                (c): c is NodeChange<Node> & { type: "position"; position: { x: number; y: number }; dragging?: boolean } =>
                    c.type === "position" && "position" in c && c.position !== undefined
            );
            
            if (positionChanges.length === 0) return updatedNodes;
            
            // Build a map of node id -> position delta for runbook nodes
            const runbookDeltas = new Map<string, { dx: number; dy: number }>();
            
            for (const change of positionChanges) {
                const node = currentNodes.find(n => n.id === change.id);
                if (!node) continue;
                
                // Check if this is a runbook node
                if (node.data?.nodeType === "runbook" && node.data?.resourceId) {
                    const oldPos = node.position;
                    const newPos = change.position;
                    runbookDeltas.set(node.data.resourceId as string, {
                        dx: newPos.x - oldPos.x,
                        dy: newPos.y - oldPos.y,
                    });
                }
            }
            
            // If no runbook position changes, just return the updated nodes
            if (runbookDeltas.size === 0) return updatedNodes;
            
            // Apply deltas to child nodes
            updatedNodes = updatedNodes.map(n => {
                const parentRunbookId = n.data?.parentRunbookId as string | undefined;
                if (parentRunbookId && runbookDeltas.has(parentRunbookId)) {
                    const delta = runbookDeltas.get(parentRunbookId)!;
                    return {
                        ...n,
                        position: {
                            x: n.position.x + delta.dx,
                            y: n.position.y + delta.dy,
                        },
                    };
                }
                return n;
            });
            
            return updatedNodes;
        });
    }, [setNodes]);

    // ── Toggle expand/collapse for runbook children ───────────────────────────
    const handleToggleExpand = useCallback((runbookId: string) => {
        setExpandedRunbooks(prev => {
            const next = new Set(prev);
            if (next.has(runbookId)) {
                next.delete(runbookId);
            } else {
                next.add(runbookId);
            }
            // Persist to localStorage
            if (data?.account?.id) {
                saveExpandedState(data.account.id, next);
            }
            return next;
        });
    }, [data?.account?.id]);

    // ── Update node visibility when expandedRunbooks changes ──────────────────
    useEffect(() => {
        setNodes(nds => nds.map(n => {
            const parentRunbookId = n.data?.parentRunbookId as string | undefined;
            const isRunbook = n.data?.nodeType === "runbook";
            
            // Update runbook nodes with isExpanded and onToggleExpand
            if (isRunbook) {
                const nodeId = n.data?.resourceId as string;
                return {
                    ...n,
                    data: { ...n.data, isExpanded: expandedRunbooks.has(nodeId), onToggleExpand: handleToggleExpand }
                };
            }
            
            // Update child nodes visibility
            if (parentRunbookId) {
                const shouldBeVisible = expandedRunbooks.has(parentRunbookId);
                return { ...n, hidden: !shouldBeVisible };
            }
            
            return n;
        }));
    }, [expandedRunbooks, handleToggleExpand, setNodes]);

    useEffect(() => {
        if (!selectedNodeId) {
            setNodes(nds => nds.map(n => ({ ...n, style: { ...n.style, opacity: 1 } })));
            setEdges(eds => eds.map(e => ({ ...e, style: { ...e.style, opacity: 1 } })));
            return;
        }
        
        // Use refs for synchronous access to current state
        const currentNodes = nodesRef.current;
        const currentEdges = edgesRef.current;
        
        // Find selected node type
        const selectedNode = currentNodes.find(n => n.id === selectedNodeId);
        const selectedNodeType = selectedNode?.data?.nodeType as string ?? "";
        
        // Build adjacency maps for traversal
        const childrenMap = new Map<string, { nodeId: string; edgeId: string }[]>();
        const parentMap = new Map<string, { nodeId: string; edgeId: string }[]>();
        
        currentEdges.forEach(e => {
            // source -> target (parent -> child)
            if (!childrenMap.has(e.source)) childrenMap.set(e.source, []);
            childrenMap.get(e.source)!.push({ nodeId: e.target, edgeId: e.id });
            // target -> source (child -> parent)
            if (!parentMap.has(e.target)) parentMap.set(e.target, []);
            parentMap.get(e.target)!.push({ nodeId: e.source, edgeId: e.id });
        });
        
        const connectedNodeIds = new Set<string>([selectedNodeId]);
        const connectedEdgeIds = new Set<string>();
        
        // Recursive function to traverse down (to children)
        const traverseDown = (nodeId: string) => {
            const children = childrenMap.get(nodeId) || [];
            children.forEach(({ nodeId: childId, edgeId }) => {
                if (!connectedNodeIds.has(childId)) {
                    connectedNodeIds.add(childId);
                    connectedEdgeIds.add(edgeId);
                    traverseDown(childId);
                }
            });
        };
        
        // Recursive function to traverse up (to parents)
        const traverseUp = (nodeId: string) => {
            const parents = parentMap.get(nodeId) || [];
            parents.forEach(({ nodeId: parentId, edgeId }) => {
                if (!connectedNodeIds.has(parentId)) {
                    connectedNodeIds.add(parentId);
                    connectedEdgeIds.add(edgeId);
                    traverseUp(parentId);
                }
            });
        };
        
        // Determine behavior based on node type
        const assetTypes = ["variable", "credential", "connection", "certificate", "schedule", "hybridWorker", "hybridWorkerGroup", "keyVault", "kvSecret", "kvKey", "kvCertificate"];
        
        if (assetTypes.includes(selectedNodeType)) {
            // For asset nodes: traverse UP to find all connected runbooks and their parents
            traverseUp(selectedNodeId);
            // Also traverse down in case there are child nodes
            traverseDown(selectedNodeId);
        } else if (selectedNodeType === "runbook") {
            // For runbook nodes: traverse down to children, up to immediate parent only
            const parents = parentMap.get(selectedNodeId) || [];
            parents.forEach(({ nodeId: parentId, edgeId }) => {
                connectedNodeIds.add(parentId);
                connectedEdgeIds.add(edgeId);
            });
            traverseDown(selectedNodeId);
        } else if (selectedNodeType === "account" || selectedNodeType === "category") {
            // For account/category nodes: don't fade anything, just show all
            setNodes(nds => nds.map(n => ({ ...n, style: { ...n.style, opacity: 1 } })));
            setEdges(eds => eds.map(e => ({ ...e, style: { ...e.style, opacity: 1 } })));
            return;
        } else {
            // For other nodes: traverse down only
            traverseDown(selectedNodeId);
        }
        
        // Update nodes opacity - fade out all unconnected nodes
        setNodes(nds => nds.map(n => ({ 
            ...n, 
            style: { 
                ...n.style, 
                opacity: connectedNodeIds.has(n.id) ? 1 : 0.15, 
                transition: "opacity 0.3s ease" 
            } 
        })));
        
        // Update edges opacity - fade out all unconnected edges (including broken dependency edges)
        setEdges(eds => eds.map(e => ({ 
            ...e, 
            style: { 
                ...e.style, 
                opacity: connectedEdgeIds.has(e.id) ? 1 : 0.1, 
                transition: "opacity 0.3s ease" 
            } 
        })));
    }, [selectedNodeId, setNodes, setEdges]);

    useEffect(() => {
        if (data) {
            // Use appropriate transform based on view type
            let result: { nodes: Node[]; edges: Edge[] };
            
            if (viewType === "single" && singleRunbookId) {
                result = transformSingleRunbookView(data, singleRunbookId);
            } else if (viewType === "object") {
                result = transformAzureDataToObjectView(data);
            } else {
                result = transformAzureDataToGraph(data);
            }
            
            const { nodes: ln, edges: le } = result;
            // Load persisted expanded state
            const persistedExpanded = loadExpandedState(data.account.id);
            // Inject onToggleExpand handler into runbook nodes
            const nodesWithHandlers = ln.map(n => {
                if (n.data?.nodeType === "runbook") {
                    const nodeId = n.data?.resourceId as string;
                    return { ...n, data: { ...n.data, isExpanded: persistedExpanded.has(nodeId), onToggleExpand: handleToggleExpand } };
                }
                // Restore visibility for child nodes based on persisted state
                const parentRunbookId = n.data?.parentRunbookId as string | undefined;
                if (parentRunbookId) {
                    return { ...n, hidden: !persistedExpanded.has(parentRunbookId) };
                }
                return n;
            });
            setNodes(nodesWithHandlers);
            setEdges(le);
            // Only reset the selected panel when the account changes (not on data refresh/auto-refresh)
            const accountChanged = prevAccountIdRef.current !== data.account.id;
            prevAccountIdRef.current = data.account.id;
            if (accountChanged) {
                setSelectedNodeId(null);
                setPanelInfo(null);
            }
            setBrokenCount(le.filter(e => e.type === "brokenDependency").length);
            setExpandedRunbooks(persistedExpanded);
        }
    }, [data, viewType, singleRunbookId, setNodes, setEdges, handleToggleExpand]);

    const handleNodeClick = useCallback((e: React.MouseEvent, node: Node) => {
        e.stopPropagation();
        const nodeType   = node.data?.nodeType   as PanelNodeType;
        const resourceId = node.data?.resourceId as string ?? node.id;
        const name       = node.data?.name       as string ?? "";

        if (selectedNodeId === node.id) {
            setSelectedNodeId(null);
            setPanelInfo(null);
        } else {
            setSelectedNodeId(node.id);
            // ── Extra data passed through for specific node types ──────────────
            // hybridWorker: pass full node.data so NodeDetailPanel can render worker details
            // schedule: pass runOn so NodeDetailPanel can show the ☁/⚙ badge
            const extra: Record<string, any> = {};
            if (nodeType === "hybridWorker") extra.workerNodeData = node.data;
            if (nodeType === "schedule")     extra.runOn = node.data?.runOn ?? null;
            setPanelInfo({ nodeType, resourceId, name, ...extra } as SelectedNodeInfo);
        }
    }, [selectedNodeId]);

    const handleCanvasClick = useCallback(() => {
        setSelectedNodeId(null);
        setPanelInfo(null);
    }, []);

    const totalSchedules   = data?.schedules?.length ?? 0;
    const enabledSchedules = data?.schedules?.filter(s => s.properties.isEnabled).length ?? 0;
    const hwGroups         = data?.hybridWorkerGroups ?? [];
    const totalWorkers     = hwGroups.reduce((s, g) => s + g.workers.length, 0);

    const jobSummary = (() => {
        if (!data?.lastRunByRunbook) return null;
        const entries = Object.values(data.lastRunByRunbook);
        return {
            succeeded: entries.filter(j => j.status === "Completed").length,
            failed:    entries.filter(j => j.status === "Failed").length,
            running:   entries.filter(j => ["Running", "Activating", "Resuming"].includes(j.status)).length,
            neverRun:  (data.runbooks?.length ?? 0) - entries.length,
        };
    })();

    return (
        <div className="w-full h-full bg-slate-50 relative" onClick={handleCanvasClick}>
            <ReactFlow
                nodes={nodes} edges={edges}
                onNodesChange={handleNodesChange} onEdgesChange={onEdgesChange}
                onNodeClick={handleNodeClick}
                nodeTypes={nodeTypes} edgeTypes={edgeTypes}
                fitView fitViewOptions={{ padding: 0.2 }}
                className="bg-slate-50" minZoom={0.2}
                nodesDraggable={true}
                nodesConnectable={false}
                elementsSelectable={true}
            >
                <Controls className="bg-white border-slate-200 shadow-lg text-slate-700 rounded-lg" />
                <MiniMap zoomable pannable className="bg-slate-50 border border-slate-200 shadow-md rounded-lg" />
                <Background gap={24} size={1} color="#cbd5e1" variant={BackgroundVariant.Dots} />

                {data && (
                    <Panel position="top-right"
                        className="bg-white/80 backdrop-blur-md p-4 rounded-xl shadow-lg border border-slate-200 m-4 flex flex-col gap-2 pointer-events-none"
                    >
                        <h3 className="font-bold text-slate-800 border-b pb-2 flex items-center gap-2">
                            <Network className="w-4 h-4 text-indigo-500" />
                            Graph Stats
                        </h3>
                        <div className="text-sm text-slate-600 flex justify-between gap-6"><span>Runbooks:</span><span className="font-medium">{data.runbooks?.length ?? 0}</span></div>
                        <div className="text-sm text-slate-600 flex justify-between gap-6"><span>Variables:</span><span className="font-medium">{data.variables?.length ?? 0}</span></div>
                        <div className="text-sm text-slate-600 flex justify-between gap-6"><span>Credentials:</span><span className="font-medium">{data.credentials?.length ?? 0}</span></div>
                        <div className="text-sm text-slate-600 flex justify-between gap-6"><span>Connections:</span><span className="font-medium">{data.connections?.length ?? 0}</span></div>
                        <div className="text-sm text-slate-600 flex justify-between gap-6"><span>Certificates:</span><span className="font-medium">{data.certificates?.length ?? 0}</span></div>

                        {/* Hybrid Worker summary — shown only when HW groups exist */}
                        {hwGroups.length > 0 && (
                            <div className="mt-1 pt-2 border-t flex flex-col gap-1" style={{ borderColor: "#ede9fe" }}>
                                <div className="flex items-center gap-1.5" style={{ color: "#7c3aed" }}>
                                    <span style={{ fontSize: "13px" }}>⚙</span>
                                    <span className="text-xs font-semibold">Hybrid Workers</span>
                                </div>
                                <div className="text-xs text-slate-600 flex justify-between gap-4 pl-5"><span>Groups:</span><span className="font-medium" style={{ color: "#7c3aed" }}>{hwGroups.length}</span></div>
                                <div className="text-xs text-slate-600 flex justify-between gap-4 pl-5"><span>Workers:</span><span className="font-medium" style={{ color: "#7c3aed" }}>{totalWorkers}</span></div>
                            </div>
                        )}

                        {jobSummary && (data.runbooks?.length ?? 0) > 0 && (
                            <div className="mt-1 pt-2 border-t border-slate-100 flex flex-col gap-1">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Last Run Status</p>
                                {jobSummary.running > 0 && (
                                    <div className="flex items-center gap-2 text-xs">
                                        <span style={{ width:8, height:8, borderRadius:"50%", background:"#f59e0b", display:"inline-block" }} />
                                        <span className="text-slate-600 flex-1">Running</span>
                                        <span className="font-bold" style={{ color:"#f59e0b" }}>{jobSummary.running}</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-2 text-xs">
                                    <span style={{ width:8, height:8, borderRadius:"50%", background:"#16a34a", display:"inline-block" }} />
                                    <span className="text-slate-600 flex-1">Succeeded</span>
                                    <span className="font-bold" style={{ color:"#16a34a" }}>{jobSummary.succeeded}</span>
                                </div>
                                {jobSummary.failed > 0 && (
                                    <div className="flex items-center gap-2 text-xs">
                                        <span style={{ width:8, height:8, borderRadius:"50%", background:"#dc2626", display:"inline-block" }} />
                                        <span className="text-slate-600 flex-1">Failed</span>
                                        <span className="font-bold" style={{ color:"#dc2626" }}>{jobSummary.failed}</span>
                                    </div>
                                )}
                                {jobSummary.neverRun > 0 && (
                                    <div className="flex items-center gap-2 text-xs">
                                        <span style={{ width:8, height:8, borderRadius:"50%", background:"#cbd5e1", display:"inline-block" }} />
                                        <span className="text-slate-600 flex-1">Never Run</span>
                                        <span className="font-bold text-slate-400">{jobSummary.neverRun}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {totalSchedules > 0 && (
                            <div className="mt-1 pt-2 border-t border-orange-100 flex flex-col gap-1">
                                <div className="flex items-center gap-2 text-orange-600">
                                    <Clock className="w-4 h-4 shrink-0" />
                                    <span className="text-xs font-semibold">Schedules</span>
                                </div>
                                <div className="text-xs text-slate-600 flex justify-between gap-4 pl-6"><span>Active:</span><span className="font-medium text-orange-600">{enabledSchedules}</span></div>
                                <div className="text-xs text-slate-600 flex justify-between gap-4 pl-6"><span>Disabled:</span><span className="font-medium text-slate-400">{totalSchedules - enabledSchedules}</span></div>
                            </div>
                        )}

                        {brokenCount > 0 && (
                            <div className="mt-1 pt-2 border-t border-red-100 flex items-center gap-2 text-red-600">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                <span className="text-xs font-semibold">{brokenCount} missing asset{brokenCount > 1 ? "s" : ""}</span>
                            </div>
                        )}
                    </Panel>
                )}
            </ReactFlow>

            {data && (
                <NodeDetailPanel
                    selected={panelInfo}
                    data={data}
                    onClose={() => { setSelectedNodeId(null); setPanelInfo(null); }}
                    onRefreshRunbook={onRefreshRunbook}
                    onFetchJobStreams={onFetchJobStreams}
                />
            )}
        </div>
    );
}

export function MindMap({ data, viewType = "runbook", singleRunbookId, onRefreshRunbook, onFetchJobStreams }: MindMapProps) {
    return (
        <ReactFlowProvider>
            <MindMapInner data={data} viewType={viewType} singleRunbookId={singleRunbookId} onRefreshRunbook={onRefreshRunbook} onFetchJobStreams={onFetchJobStreams} />
        </ReactFlowProvider>
    );
}
