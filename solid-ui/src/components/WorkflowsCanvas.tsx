// @locs-version: 1.0
import { For, Show, Suspense, createMemo, createSignal } from "solid-js";
import type { SavedWorkflow, WorkflowDeployment, WorkflowRun } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";
import type { JSXElement } from "solid-js";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import type {
  CompiledAfpGapFilter,
  CompiledAfpReadinessFocus,
  CompiledOrchestrationRole,
  DeploymentPolicyDiffEntry,
  EdgeExecutionState,
  NodeDeploymentPolicy,
  PendingNodeDeploymentPolicy,
  WorkflowEdgeDraft,
  WorkflowGraphDraft,
  WorkflowNodeDraft,
} from "@/lib/workflowGraphTypes";
import { PRESETS, PRIMITIVES } from "@/lib/workflowGraphTypes";
import { runTimelineSteps } from "@/lib/workflowRunAnalysis";
import {
  CANVAS_HORIZONTAL_RULER_MARKS,
  CANVAS_VERTICAL_RULER_LABEL_STYLE,
  CANVAS_VERTICAL_RULER_MARKS,
  COMPILED_FOCUS_ACTION_CLASS,
  NODE_CARD_AMBER_CHIP_CLASS,
  NODE_CARD_CHIP_BASE_CLASS,
  NODE_CARD_CHIP_HOVER_CLASS,
  NODE_CARD_SKY_CHIP_CLASS,
  NODE_CARD_WHITE_CHIP_CLASS,
  EMPTY_CANVAS_AI_STARTER_ITEMS,
  EMPTY_CANVAS_TEMPLATE_ITEMS,
  REVIEW_CLEAR_ACTION_BASE_CLASS,
  REVIEW_CLEAR_ACTION_HOVER_CLASS,
  REVIEW_RAIL_PILL_BASE_CLASS,
  REVIEW_RAIL_PILL_HOVER_CLASS,
  WORKFLOW_CANVAS_SURFACE_CLASS,
  WORKFLOW_CONTEXT_SURFACE_CLASS,
  compactWorkflowCanvasSectionViews,
  workflowCanvasChromeSectionIds,
  workflowCanvasAfpRouteRailCopy,
  workflowCanvasAfpReadinessTone,
  workflowCanvasBranchOriginState,
  workflowCanvasContextSectionIds,
  workflowCanvasFocusOverlayActionItems,
  workflowCanvasCompiledFocusOverlayViewState,
  workflowCanvasCompiledEdgeReviewState,
  workflowCanvasCompiledNodeCanvasReviewState,
  workflowCanvasCompiledNodeReviewState,
  type WorkflowCanvasCompiledEdgeReviewState,
  type WorkflowCanvasCompiledNodeReviewState,
  workflowCanvasCompiledReadinessManifestCount,
  workflowCanvasCompiledReadyHandoffManifestIds,
  workflowCanvasCompiledReadyManifestIds,
  workflowCanvasCompiledRouteGraphEdgeId,
  workflowCanvasCompiledReviewContext,
  workflowCanvasGraphReviewState,
  workflowCanvasContextMenuActionItems,
  workflowCanvasContextMenuState,
  workflowCanvasEdgeRunPresentationState,
  workflowCanvasEdgeLegendVisual,
  workflowCanvasEdgeLegendButtonStyle,
  workflowCanvasEdgeLegendDotStyle,
  workflowCanvasEdgeLegendStates,
  workflowCanvasEmptyState,
  workflowCanvasFamilyContextState,
  workflowCanvasFrameMountViewState,
  workflowCanvasHiddenMinimapToggleState,
  workflowCanvasHorizontalRulerMarkStyle,
  workflowCanvasInteractiveOverlaySectionIds,
  workflowCanvasHeaderState,
  workflowCanvasIdleNodeBadgeState,
  workflowCanvasIdleNodeOverlayState,
  workflowCanvasMinimapViewState,
  workflowCanvasNodeCardPresentationState,
  workflowCanvasNodeRunPresentationState,
  workflowCanvasOrchestrationRoleFocusLabel,
  workflowCanvasOverlayChromeState,
  workflowCanvasPaletteState,
  workflowCanvasPointPositionStyle,
  workflowCanvasManifestHealthRailCopy,
  workflowCanvasRunOverlayState,
  workflowCanvasPassiveOverlaySectionIds,
  workflowCanvasReviewRailUnavailableFocusMessage,
  workflowCanvasSharedReviewBannerState,
  workflowCanvasShellViewState,
  workflowCanvasSummaryState,
  workflowCanvasReviewRailOrchestrationRouteState,
  workflowCanvasReviewRailPrimaryFocusActionView,
  workflowCanvasReviewRailState,
  workflowCanvasRouteLinkageRailCopy,
  workflowCanvasVerticalRulerMarkStyle,
  workflowCanvasVisibleBranchOriginState,
  workflowCanvasVisibleFamilyContextState,
  workflowCanvasVisibleIdleNodePanelState,
  workflowCanvasVisibleInteractionLockState,
  workflowCanvasVisibleMinimapState,
  workflowCanvasVisiblePromoteFamilyAssetState,
  workflowCanvasVisibleSharedReviewBannerState,
  workflowCanvasZoomViewState,
  workflowCanvasReviewRailMountState,
  workflowCanvasReviewRailClearActionItems,
  workflowCanvasReviewRailBodySectionViews,
  workflowCanvasPolicyDeltaReviewMode,
  workflowCanvasReviewRailSectionViews,
  workflowCanvasReviewRailTopSectionViews,
  workflowCanvasSectionViews,
  type WorkflowCanvasChromeSectionId,
  type WorkflowCanvasContextSectionId,
  type WorkflowCanvasInteractiveOverlaySectionId,
  type WorkflowCanvasPassiveOverlaySectionId,
} from "@/lib/workflowCanvasState";
import {
  workflowHasCompiledContract,
  workflowTriggerReadinessBadgeLabel,
  workflowTriggerReadinessSummaryForWorkflow,
} from "@/lib/workflowDeploymentHelpers";
import {
  afpReadinessFocusSummary,
  broadenOrchestrationRoleRouteReviewMessage,
  clearAfpReadinessFocusMessage,
  clearOrchestrationRoleFocusMessage,
  clearReviewFocusMessage,
  compiledLinkageStatusLabel,
  compiledManifestEmptyStateMessage,
  compiledRouteEmptyStateMessage,
  orchestrationRoleOutsideFocusMessage,
  orchestrationRoleRailGuideMessage,
  overlappingOrchestrationRouteSummaryMessage,
} from "@/lib/workflowReviewMessages";
import { WorkflowPaneFallback, useWorkflowsCtx } from "@/components/graph";
import { titleCase } from "@/lib/workflowGraphCopy";
import {
  branchOriginRecord,
  workflowFamilyAssetRecord,
  workflowFamilyInstanceRecord,
} from "@/lib/workflowGraphMetadata";
import { normalizeGraph } from "@/lib/workflowGraphDraftState";
import { summary } from "@/lib/workflowGraphSummary";
import { SEMANTIC_STARTERS } from "@/lib/workflowStarterCatalog";
import {
  protectedEdgeIdsForGraph,
  protectedNodeIdsForGraph,
} from "@/lib/workflowRegenerationState";
import { readSession } from "@/lib/api";
import { saveWorkflowNodeComments } from "@/lib/workflowsLocalState";

export function WorkflowsCanvas() {
  const [paletteFilter, setPaletteFilter] = createSignal("");
  type FamilyParameterField = {
    id: string;
    label: string;
    description?: string | null;
    kind?: string | null;
    defaultValue?: string | number | null;
    options?: Array<{ value: string; label: string }>;
  };
  type RunNodePolicyDelta = DeploymentPolicyDiffEntry & {
    deploymentId?: string | null;
    source?: string | null;
  };
  type CanvasSetter<T> = (value: T | ((current: T) => T)) => void;
  type CanvasPoint = { x: number; y: number };
  type CanvasBounds = {
    maxX: number;
    maxY: number;
    minX: number;
    minY: number;
    nodes: Array<{ id: string; position: CanvasPoint }>;
  };
  type CanvasRunNodeOverlay = {
    reason?: string | null;
    status?: string;
  };
  type WorkflowsCanvasContext = {
    addEdge: (...args: unknown[]) => unknown;
    addNode: (kind: string, preset?: string) => unknown;
    addSemanticNode: (starterId: string) => unknown;
    busyAction: () => string | null;
    canvasRefHolder: { current: HTMLDivElement | null };
    collapsedNodes: () => Set<string>;
    commentDraft: () => string;
    createWorkflowFromIntent: () => Promise<void>;
    ctxMenu: () => { nodeId: string; x: number; y: number } | null;
    currentWorkflow: () => SavedWorkflow | null;
    deploymentHistory: () => WorkflowDeployment[];
    downstreamOf: () => Set<string>;
    dragGhostOrigin: () => { nodeId: string } | null;
    dragStateHolder: { current: unknown };
    duplicateNode: (nodeId: string) => unknown;
    editingCommentNodeId: () => string | null;
    editingEdgeLabelId: () => string | null;
    editingEdgeLabelValue: () => string;
    familyParameterDrafts: () => Record<string, string>;
    focusDeploymentRecord: (deploymentId: string | null) => void;
    focusPolicyDiffReview: (
      nodeId: string,
      filterMode: "deployment_context" | "replay_drift",
      runId: string | null,
    ) => void;
    gotoNodeId: () => string | null;
    graph: () => WorkflowGraphDraft | null;
    handleWorkflowPatch: (patch: Record<string, unknown>) => Promise<void>;
    highlightedNodeId: () => string | null;
    idleNodes: () => WorkflowNodeDraft[];
    instantiateWorkflowFromFamilyAsset: (fields?: Record<string, string>) => Promise<void>;
    liveRunNodeOverlays: () => Map<string, CanvasRunNodeOverlay>;
    liveRunStreamConnected: () => boolean;
    loadWorkflow: (workflowId: string) => Promise<void>;
    matchingNodeIds: () => Set<string>;
    minimapBounds: () => CanvasBounds | null;
    nodeComments: () => Record<string, string>;
    nodeDeploymentPolicies: () => Map<string, NodeDeploymentPolicy>;
    nodeErrorIds: () => Set<string>;
    nodeSuccessRates: () => Map<string, number>;
    nowMs: () => number;
    pendingNodeDeploymentPolicies: () => Map<string, PendingNodeDeploymentPolicy>;
    promoteCurrentWorkflowToFamilyAsset: () => Promise<void>;
    resetSharedInvestigationView: () => void;
    runHistory: () => WorkflowRun[];
    selectedCompiledAfpFilter: () => string | null;
    selectedCompiledAfpGapFilter: () => CompiledAfpGapFilter | null;
    selectedCompiledAfpReadinessFocus: () => CompiledAfpReadinessFocus | null;
    selectedCompiledAfpRouteFocus: () => "full" | "partial" | null;
    selectedCompiledManifestLinkageFilter: () => "linked" | "inspector_only" | null;
    selectedCompiledOrchestrationRole: () => CompiledOrchestrationRole | null;
    selectedCompiledRouteLinkageFilter: () => "linked" | "manifest_only" | null;
    selectedNodeId: () => string | null;
    selectedRun: () => WorkflowRun | null;
    selectedRunEdgeId: () => string | null;
    selectedRunEdgePolicyDeltas: () => Map<string, RunNodePolicyDelta>;
    selectedRunEdgeStates: () => Map<string, EdgeExecutionState>;
    selectedRunNodePolicyDeltas: () => Map<string, RunNodePolicyDelta>;
    selectedRunStatuses: () => Map<string, string>;
    selectedRunStepOrder: () => Map<string, number>;
    selectedWorkflowId: () => string | null;
    setCollapsedNodes: CanvasSetter<Set<string>>;
    setCommentDraft: (value: string) => void;
    setCtxMenu: CanvasSetter<{ nodeId: string; x: number; y: number } | null>;
    setEditingCommentNodeId: (nodeId: string | null) => void;
    setEditingEdgeLabelId: (edgeId: string | null) => void;
    setEditingEdgeLabelValue: (value: string) => void;
    setFamilyParameterDrafts: CanvasSetter<Record<string, string>>;
    setHighlightedNodeId: (nodeId: string | null) => void;
    setNodeComments: (comments: Record<string, string>) => void;
    setSelectedCompiledAfpFilter: (value: string | null) => void;
    setSelectedCompiledAfpReadinessFocus: (value: CompiledAfpReadinessFocus | null) => void;
    setSelectedCompiledAfpRouteFocus: (value: "full" | "partial" | null) => void;
    setSelectedCompiledManifestLinkageFilter: (value: "linked" | "inspector_only" | null) => void;
    setSelectedCompiledOrchestrationRole: (value: CompiledOrchestrationRole | null) => void;
    setSelectedCompiledRouteLinkageFilter: (value: "linked" | "manifest_only" | null) => void;
    setSelectedInspectorFocusSource: (value: string | null) => void;
    setSelectedInspectorFocusTarget: (value: string | null) => void;
    setSelectedInspectorSection: (value: string | null) => void;
    setSelectedNodeId: (nodeId: string | null) => void;
    setSelectedRunEdgeId: CanvasSetter<string | null>;
    setSharedReviewBannerVisible: (visible: boolean) => void;
    setShowIdleNodes: CanvasSetter<boolean>;
    setShowMinimap: CanvasSetter<boolean>;
    setWorkflowIntent: (intent: string) => void;
    setZoom: CanvasSetter<number>;
    sharedReviewBannerSummary: () => string[];
    sharedReviewBannerVisible: () => boolean;
    showIdleNodes: () => boolean;
    showMinimap: () => boolean;
    siblingBranchCount: (workflow: SavedWorkflow) => number;
    siblingBranches: (workflow: SavedWorkflow) => SavedWorkflow[];
    startDrag: (event: PointerEvent, nodeId: string) => void;
    upstreamOf: () => Set<string>;
    updateGraph: (updater: (draft: WorkflowGraphDraft) => WorkflowGraphDraft) => void;
    workflowExecutionRefreshing: () => boolean;
    workflowInteractionLocked: () => boolean;
    workflowInteractionLockLabel: () => string | null;
    workflowRunEta: () => string | null;
    zoom: () => number;
  };
  const ctx = useWorkflowsCtx<WorkflowsCanvasContext>();
  const {
    busyAction, collapsedNodes, commentDraft, ctxMenu, currentWorkflow,
    deploymentHistory, downstreamOf, dragGhostOrigin, editingCommentNodeId,
    editingEdgeLabelId, editingEdgeLabelValue, familyParameterDrafts, gotoNodeId,
    graph, highlightedNodeId, idleNodes, liveRunNodeOverlays, liveRunStreamConnected, runHistory,
    matchingNodeIds, minimapBounds, nodeComments, nodeDeploymentPolicies, nodeErrorIds,
    nodeSuccessRates, nowMs, pendingNodeDeploymentPolicies, selectedCompiledAfpFilter,
    selectedCompiledAfpGapFilter, selectedCompiledAfpReadinessFocus, selectedCompiledAfpRouteFocus,
    selectedCompiledManifestLinkageFilter, selectedCompiledOrchestrationRole,
    selectedCompiledRouteLinkageFilter, selectedNodeId, selectedRun, selectedRunEdgeId,
    selectedRunEdgePolicyDeltas, selectedRunEdgeStates, selectedRunNodePolicyDeltas,
    selectedRunStatuses, selectedRunStepOrder, selectedWorkflowId, sharedReviewBannerSummary,
    sharedReviewBannerVisible, showIdleNodes, showMinimap, upstreamOf,
    workflowExecutionRefreshing, workflowInteractionLocked, workflowInteractionLockLabel,
    workflowRunEta, zoom,
    // setters
    setCollapsedNodes, setCommentDraft, setCtxMenu, setEditingCommentNodeId,
    setEditingEdgeLabelId, setEditingEdgeLabelValue, setFamilyParameterDrafts,
    setHighlightedNodeId, setNodeComments, setSelectedCompiledAfpFilter,
    setSelectedCompiledAfpReadinessFocus, setSelectedCompiledAfpRouteFocus,
    setSelectedCompiledManifestLinkageFilter, setSelectedCompiledOrchestrationRole,
    setSelectedCompiledRouteLinkageFilter, setSelectedInspectorFocusSource,
    setSelectedInspectorFocusTarget, setSelectedInspectorSection, setSelectedNodeId,
    setSelectedRunEdgeId, setSharedReviewBannerVisible, setShowIdleNodes, setShowMinimap,
    setWorkflowIntent, setZoom,
    // handlers
    addNode, addSemanticNode, addEdge, updateGraph,
    createWorkflowFromIntent, duplicateNode, focusDeploymentRecord, focusPolicyDiffReview,
    handleWorkflowPatch, instantiateWorkflowFromFamilyAsset,
    loadWorkflow, promoteCurrentWorkflowToFamilyAsset, resetSharedInvestigationView,
    siblingBranches, siblingBranchCount, startDrag,
    // refs
    canvasRefHolder, dragStateHolder,
  } = ctx;
  const nodeRunCounts = createMemo<Map<string, number>>(() => {
    const counts = new Map<string, number>();
    const runs = runHistory();
    if (!Array.isArray(runs)) return counts;
    for (const run of runs) {
      const seen = new Set<string>();
      for (const step of runTimelineSteps(run)) {
        const nid = typeof step.node_id === "string" ? step.node_id : null;
        if (nid && !seen.has(nid)) { seen.add(nid); counts.set(nid, (counts.get(nid) ?? 0) + 1); }
      }
    }
    return counts;
  });
  const collapseCanvasNode = (nodeId: string) => {
    setCollapsedNodes((prev: Set<string>) => {
      const next = new Set(prev);
      next.add(nodeId);
      return next;
    });
  };
  const expandCanvasNode = (nodeId: string) => {
    setCollapsedNodes((prev: Set<string>) => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });
  };
  const openNodeCommentEditor = (nodeId: string) => {
    setEditingCommentNodeId(nodeId);
    setCommentDraft(nodeComments()[nodeId] ?? "");
  };
  const resetInspectorFocus = () => {
    setSelectedInspectorSection(null);
    setSelectedInspectorFocusSource(null);
    setSelectedInspectorFocusTarget(null);
  };
  const selectCanvasNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    resetInspectorFocus();
  };
  const openCompiledRuntimeContract = (nodeId: string, focusTarget: string | null) => {
    setSelectedNodeId(nodeId);
    setSelectedInspectorSection("compiled_runtime_contract");
    setSelectedInspectorFocusSource("canvas_afp_badge");
    setSelectedInspectorFocusTarget(focusTarget ?? nodeId);
  };
  const openCompiledRosterReview = () => {
    setSelectedNodeId(null);
    resetInspectorFocus();
  };
  const openCompiledRouteReview = (focusTarget: string | null) => {
    setSelectedNodeId(null);
    setSelectedInspectorSection(null);
    setSelectedInspectorFocusSource("compiled_route");
    setSelectedInspectorFocusTarget(focusTarget);
  };
  const clearAfpGraphFocus = () => {
    setSelectedCompiledAfpFilter(null);
    setSelectedCompiledAfpRouteFocus(null);
    setSelectedCompiledManifestLinkageFilter(null);
  };
  const clearAfpRouteFocus = () => setSelectedCompiledAfpRouteFocus(null);
  const clearManifestHealthFocus = () => setSelectedCompiledManifestLinkageFilter(null);
  const clearOrchestrationRoleFocus = () => setSelectedCompiledOrchestrationRole(null);
  const clearRouteLinkageFocus = () => setSelectedCompiledRouteLinkageFilter(null);
  const clearAfpReadinessFocus = () => setSelectedCompiledAfpReadinessFocus(null);
  const toggleRouteLinkageFocus = (nextFocus: "linked" | "manifest_only", currentFocus: "linked" | "manifest_only" | null) => {
    setSelectedCompiledRouteLinkageFilter(currentFocus === nextFocus ? null : nextFocus);
  };
  const clearCanvasReviewFocus = () => {
    setSelectedCompiledAfpRouteFocus(null);
    setSelectedCompiledOrchestrationRole(null);
    setSelectedCompiledManifestLinkageFilter(null);
    setSelectedCompiledRouteLinkageFilter(null);
    setSelectedCompiledAfpReadinessFocus(null);
  };
  const openPolicyDeltaReview = (
    nodeId: string,
    filterMode: "replay_drift" | "deployment_context",
    runId: string | null,
    deploymentId: string | null,
  ) => {
    focusPolicyDiffReview(nodeId, filterMode, runId);
    focusDeploymentRecord(deploymentId);
  };
  const openEdgePolicyDeltaReview = (
    edgeId: string,
    nodeId: string,
    filterMode: "replay_drift" | "deployment_context",
    runId: string | null,
    deploymentId: string | null,
  ) => {
    setSelectedRunEdgeId(edgeId);
    openPolicyDeltaReview(nodeId, filterMode, runId, deploymentId);
  };
  const focusBranchCallout = (edgeId: string, targetNodeId: string) => {
    setSelectedRunEdgeId((current: string | null) => current === edgeId ? null : edgeId);
    setSelectedNodeId(targetNodeId);
  };
  const focusRunEdgeTarget = (edgeId: string, targetNodeId: string) => {
    setSelectedRunEdgeId(edgeId);
    setSelectedNodeId(targetNodeId);
  };
  const beginEdgeLabelEdit = (edgeId: string, currentLabel: string | undefined) => {
    setEditingEdgeLabelId(edgeId);
    setEditingEdgeLabelValue(currentLabel ?? "");
  };
  const commitEdgeLabelEdit = (edgeId: string) => {
    const newLabel = editingEdgeLabelValue().trim();
    setEditingEdgeLabelId(null);
    void handleWorkflowPatch({ op: "edge_meta_replace", edge_id: edgeId, condition_label: newLabel || undefined });
  };
  const handleEdgeLabelEditKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") (event.target as HTMLInputElement).blur();
    if (event.key === "Escape") setEditingEdgeLabelId(null);
  };
  const isKeyboardActivation = (event: KeyboardEvent) => event.key === "Enter" || event.key === " ";
  const saveNodeCommentDraft = (nodeId: string) => {
    const trimmedComment = commentDraft().trim();
    const next = { ...nodeComments() };
    if (trimmedComment) next[nodeId] = trimmedComment;
    else delete next[nodeId];
    setNodeComments(next);
    try { saveWorkflowNodeComments(next, readSession()?.user?.id ?? null); } catch { /* ignore */ }
    setEditingCommentNodeId(null);
  };

  return (
        <div class="space-y-4">
          <Show when={currentWorkflow()} fallback={<></>}>
            {(workflowAccessor) => {
              const workflow = workflowAccessor();
              const draft = createMemo(() => normalizeGraph(workflow));
              const info = createMemo(() => summary(workflow));
              const triggerReadiness = createMemo(() => workflowTriggerReadinessSummaryForWorkflow(workflow));
              const hasCompiledContract = createMemo(() => workflowHasCompiledContract(workflow));
              const previewOnlyTriggerContract = () => triggerReadiness()?.live_registration_supported === false;
              const protectedNodeIds = createMemo(() => protectedNodeIdsForGraph(draft()));
              const protectedEdgeIds = createMemo(() => protectedEdgeIdsForGraph(draft()));
              const familyAsset = createMemo(() => workflowFamilyAssetRecord(workflow));
              const familyInstance = createMemo(() => workflowFamilyInstanceRecord(workflow));
              const branchOrigin = createMemo(() => branchOriginRecord(workflow));
              const branchSiblings = createMemo(() => siblingBranches(workflow));
              const paletteState = createMemo(() => workflowCanvasPaletteState({
                filter: paletteFilter(),
                presets: PRESETS,
                primitives: PRIMITIVES,
                semanticStarters: SEMANTIC_STARTERS,
              }));
              const familyContextState = createMemo(() => workflowCanvasFamilyContextState({
                asset: familyAsset(),
                draftTitle: draft().title,
                instance: familyInstance(),
              }));
              const visibleFamilyContextState = createMemo(() => {
                return workflowCanvasVisibleFamilyContextState(familyContextState());
              });
              const visiblePromoteFamilyAssetState = createMemo(() => {
                return workflowCanvasVisiblePromoteFamilyAssetState(familyContextState());
              });
              const workflowSummaryState = createMemo(() => {
                const graphSummary = info();
                const graphDraft = draft();
                return workflowCanvasSummaryState({
                  deploymentCount: deploymentHistory().length,
                  description: graphDraft.description,
                  edgeCount: graphSummary.edgeCount,
                  hasCompiledContract: hasCompiledContract(),
                  nodeCount: graphSummary.nodeCount,
                  previewOnlyTriggerContract: previewOnlyTriggerContract(),
                  title: graphDraft.title,
                });
              });
              const branchOriginState = createMemo(() => (
                workflowCanvasBranchOriginState({
                  branchCount: siblingBranchCount(workflow),
                  origin: branchOrigin(),
                  selectedWorkflowId: selectedWorkflowId(),
                  siblings: branchSiblings(),
                })
              ));
              const visibleBranchOriginState = createMemo(() => {
                return workflowCanvasVisibleBranchOriginState(branchOriginState());
              });
              const canvasHeaderState = createMemo(() => workflowCanvasHeaderState(workflowRunEta()));
              const emptyCanvasState = createMemo(() => workflowCanvasEmptyState({
                busyAction: busyAction(),
                graph: graph(),
              }));
              const sharedReviewBannerState = createMemo(() => workflowCanvasSharedReviewBannerState({
                summary: sharedReviewBannerSummary(),
                visible: sharedReviewBannerVisible(),
              }));
              const visibleSharedReviewBannerState = createMemo(() => {
                return workflowCanvasVisibleSharedReviewBannerState(sharedReviewBannerState());
              });
              const canvasRunOverlayState = createMemo(() => {
                return workflowCanvasRunOverlayState({
                  nodePolicyDeltaCount: selectedRunNodePolicyDeltas().size,
                  run: selectedRun(),
                });
              });
              const edgeLegendStates = createMemo(() => {
                return workflowCanvasEdgeLegendStates(selectedRunEdgeStates().values());
              });
              const renderFamilyParameterField = (field: FamilyParameterField) => (
                <label class="block">
                  <span class="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">
                    {field.label}
                  </span>
                  <Show when={field.description}>
                    <p class="mt-1 text-xs text-violet-800">{field.description}</p>
                  </Show>
                  <Show
                    when={field.kind === "select"}
                    fallback={
                      <input
                        aria-label={field.label}
                        type={field.kind === "number" ? "number" : "text"}
                        value={familyParameterDrafts()[field.id] ?? field.defaultValue}
                        onInput={(event) => setFamilyParameterDrafts((current: Record<string, string>) => ({
                          ...current,
                          [field.id]: event.currentTarget.value,
                        }))}
                        class="mt-2 w-full rounded-2xl border border-violet-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none"
                      />
                    }
                  >
                    <select
                      aria-label={field.label}
                      value={familyParameterDrafts()[field.id] ?? field.defaultValue}
                      onChange={(event) => setFamilyParameterDrafts((current: Record<string, string>) => ({
                        ...current,
                        [field.id]: event.currentTarget.value,
                      }))}
                      class="mt-2 w-full rounded-2xl border border-violet-200/70 bg-white/85 px-4 py-3 text-sm text-on-surface outline-none"
                    >
                      <For each={field.options ?? []}>
                        {(option) => <option value={option.value}>{option.label}</option>}
                      </For>
                    </select>
                  </Show>
                </label>
              );
              const FamilyContextSection = () => (
                <Show when={visibleFamilyContextState()}>
                  {(contextAccessor) => {
                    const contextState = contextAccessor();
                    return (
                      <div class="mb-4 rounded-[22px] border border-violet-200/70 bg-violet-50/70 p-4">
                        <Show when={contextState.asset}>
                          {(assetAccessor) => {
                            const asset = assetAccessor();
                            return (
                              <>
                                <div class="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Reusable workflow family</p>
                                    <p class="mt-1 text-sm text-violet-900">
                                      {contextState.assetLabel}
                                    </p>
                                    <Show when={asset.source_workflow_id}>
                                      <p class="mt-1 text-[11px] uppercase tracking-[0.14em] text-violet-700">
                                        derived from {asset.source_workflow_id}
                                      </p>
                                    </Show>
                                  </div>
                                  <button
                                    type="button"
                                    class="rounded-full border border-violet-200/80 bg-white/85 px-3 py-2 text-xs font-medium text-violet-700 transition hover:bg-white"
                                    onClick={() => void instantiateWorkflowFromFamilyAsset()}
                                    disabled={workflowContextActionDisabled()}
                                  >
                                    New instance
                                  </button>
                                </div>
                                <Show when={contextState.assetHasParameters}>
                                  <div class="mt-4 grid gap-3 md:grid-cols-2">
                                    <For each={asset.parameter_schema}>
                                      {(field) => renderFamilyParameterField(field)}
                                    </For>
                                  </div>
                                </Show>
                              </>
                            );
                          }}
                        </Show>
                        <Show when={contextState.instance}>
                          {(instanceAccessor) => {
                            const instance = instanceAccessor();
                            return (
                              <div class={contextState.instanceHasAsset ? "mt-4 border-t border-violet-200/60 pt-4" : ""}>
                                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Workflow family instance</p>
                                <p class="mt-1 text-sm text-sky-900">
                                  {contextState.instanceLabel}
                                </p>
                                <Show when={instance.family_workflow_id}>
                                  <p class="mt-1 text-[11px] uppercase tracking-[0.14em] text-sky-700">
                                    family asset {instance.family_workflow_id}
                                  </p>
                                </Show>
                              </div>
                            );
                          }}
                        </Show>
                      </div>
                    );
                  }}
                </Show>
              );
              const WorkflowSummarySection = () => (
                <Show when={workflowSummaryState()}>
                  {(summaryAccessor) => {
                    const summaryState = summaryAccessor();
                    return (
                      <div class="flex flex-wrap items-start justify-between gap-4">
                        <div class="space-y-1">
                          <p class="text-lg font-semibold text-on-surface">{summaryState.title}</p>
                          <p class="text-sm text-on-surface-variant">{summaryState.description}</p>
                        </div>
                        <div class="grid grid-cols-3 gap-3">
                          <div class="rounded-2xl border border-white/35 bg-white/45 px-4 py-3"><p class="text-[11px] uppercase tracking-[0.2em] text-on-surface-variant">Nodes</p><p class="mt-1 text-lg font-semibold text-on-surface">{summaryState.nodeCount}</p></div>
                          <div class="rounded-2xl border border-white/35 bg-white/45 px-4 py-3"><p class="text-[11px] uppercase tracking-[0.2em] text-on-surface-variant">Edges</p><p class="mt-1 text-lg font-semibold text-on-surface">{summaryState.edgeCount}</p></div>
                          <div class="rounded-2xl border border-white/35 bg-white/45 px-4 py-3">
                            <p class="text-[11px] uppercase tracking-[0.2em] text-on-surface-variant">IR</p>
                            <p class="mt-1 text-sm font-semibold text-on-surface">
                              {summaryState.irStatusLabel}
                            </p>
                            <p class="mt-1 text-[10px] uppercase tracking-[0.14em] text-on-surface-variant">
                              {summaryState.deployStatusLabel}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                </Show>
              );
              const WorkflowPaletteSection = () => (
                <div class="mt-4 space-y-3">
                  <input
                    type="text"
                    aria-label="Filter workflow node palette"
                    placeholder="Filter palette..."
                    value={paletteFilter()}
                    onInput={(e) => setPaletteFilter(e.currentTarget.value)}
                    class="w-full rounded-full border border-white/40 bg-white/60 px-4 py-1.5 text-xs text-on-surface outline-none placeholder:text-on-surface-variant/50 focus:border-primary/40"
                  />
                  <div class="grid gap-3 lg:grid-cols-2">
                    <div class="rounded-[22px] border border-white/35 bg-white/40 p-4">
                      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Primitive palette</p>
                      <div class="mt-3 flex flex-wrap gap-2">
                        <For each={paletteState().primitiveItems}>{(kind) => <button type="button" class="rounded-full border border-white/40 bg-white/60 px-3 py-2 text-xs font-medium text-on-surface transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50" onClick={() => addNode(kind)} disabled={workflowContextActionDisabled()}>{titleCase(kind)}</button>}</For>
                      </div>
                    </div>
                    <div class="rounded-[22px] border border-white/35 bg-white/40 p-4">
                      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Semantic starters</p>
                      <p class="mt-1 text-sm text-on-surface-variant">Human-facing nodes that still compile down into the existing workflow graph.</p>
                      <div class="mt-3 flex flex-wrap gap-2">
                        <For each={paletteState().semanticStarterItems}>
                          {(starter) => (
                            <button
                              type="button"
                              class="rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-2 text-xs font-medium text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => addSemanticNode(starter.id)}
                              disabled={workflowContextActionDisabled()}
                            >
                              {starter.label}
                            </button>
                          )}
                        </For>
                      </div>
                    </div>
                    <div class="rounded-[22px] border border-white/35 bg-white/40 p-4">
                      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Human-friendly presets</p>
                      <div class="mt-3 flex flex-wrap gap-2">
                        <For each={paletteState().presetItems}>{(preset) => <button type="button" class="rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-2 text-xs font-medium text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => addNode("agent", preset)} disabled={workflowContextActionDisabled()}>{titleCase(preset)}</button>}</For>
                      </div>
                    </div>
                  </div>
                </div>
              );
              const PromoteFamilyAssetSection = () => (
                <Show when={visiblePromoteFamilyAssetState()}>
                  <div class="mt-3 rounded-[22px] border border-violet-200/70 bg-violet-50/75 p-4">
                    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">Reusable family asset</p>
                    <p class="mt-1 text-sm text-violet-900">
                      Promote this workflow into a reusable family asset once the suggested template path looks right.
                    </p>
                    <button
                      type="button"
                      class="mt-3 rounded-full border border-violet-200/80 bg-white/85 px-3 py-2 text-xs font-medium text-violet-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void promoteCurrentWorkflowToFamilyAsset()}
                      disabled={workflowContextActionDisabled()}
                    >
                      Promote family asset
                    </button>
                  </div>
                </Show>
              );
              const BranchOriginSection = () => (
                <Show when={visibleBranchOriginState()}>
                  {(branchAccessor) => {
                    const branchState = branchAccessor();
                    const {
                      branchCount,
                      hasSiblings,
                      hiddenSiblingCount,
                      origin,
                      selectedWorkflowId,
                      visibleSiblings,
                    } = branchState;
                    return (
                      <div class="mt-3 rounded-[22px] border border-emerald-200/70 bg-emerald-50/75 p-4">
                        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Branch origin</p>
                        <p class="mt-1 text-sm text-emerald-900">
                          Parent workflow{" "}
                          <span class="font-medium">
                            {String(origin.parent_workflow_id ?? "unknown")}
                          </span>
                        </p>
                        <Show when={origin.history_event_id}>
                          <p class="mt-1 text-xs uppercase tracking-[0.14em] text-emerald-700">
                            from history event{" "}
                            {String(origin.history_event_id)}
                          </p>
                        </Show>
                        <div class="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            class="rounded-full border border-emerald-200/80 bg-white/80 px-3 py-2 text-xs font-medium text-emerald-700 transition hover:bg-white"
                            onClick={() => {
                              const parentId = origin.parent_workflow_id;
                              if (!parentId) return;
                              void loadWorkflow(parentId);
                            }}
                          >
                            Go to parent
                          </button>
                          <Show when={branchCount > 0}>
                            <span class="rounded-full border border-emerald-200/80 bg-white/80 px-3 py-2 text-xs font-medium text-emerald-700">
                              {branchCount} related branch{branchCount === 1 ? "" : "es"}
                            </span>
                          </Show>
                        </div>
                        <Show when={hasSiblings}>
                          <div class="mt-3">
                            <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                              Branch family
                            </p>
                            <div class="mt-2 flex flex-wrap gap-2">
                              <For each={visibleSiblings}>
                                {(sibling) => (
                                  <button
                                    type="button"
                                    class={`rounded-full border px-3 py-2 text-xs font-medium transition ${
                                      selectedWorkflowId === sibling.workflow_id
                                        ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                                        : "border-emerald-200/80 bg-white/80 text-emerald-700 hover:bg-white"
                                    }`}
                                    onClick={() => void loadWorkflow(sibling.workflow_id)}
                                  >
                                    {sibling.title}
                                  </button>
                                )}
                              </For>
                              <Show when={hiddenSiblingCount > 0}>
                                <span class="rounded-full border border-emerald-200/80 bg-white/80 px-3 py-2 text-xs font-medium text-emerald-700">
                                  +{hiddenSiblingCount} more
                                </span>
                              </Show>
                            </div>
                          </div>
                        </Show>
                      </div>
                    );
                  }}
                </Show>
              );
              const workflowContextSectionViews = () => workflowCanvasSectionViews<WorkflowCanvasContextSectionId, JSXElement>(
                workflowCanvasContextSectionIds(),
                {
                  branch_origin: <BranchOriginSection />,
                  family_context: <FamilyContextSection />,
                  palette: <WorkflowPaletteSection />,
                  promote_family_asset: <PromoteFamilyAssetSection />,
                  summary: <WorkflowSummarySection />,
                },
              );
              const CanvasHeaderSection = () => (
                <div class="mb-3 flex flex-wrap items-center gap-2">
                  <p class="text-sm font-semibold text-on-surface">Canvas</p>
                  <p class="text-xs uppercase tracking-[0.18em] text-on-surface-variant">
                    drag nodes - inspect on selection - compile frozen IR
                  </p>
                  <Show when={canvasHeaderState().runEta}>
                    {(eta) => (
                      <span class="rounded-full border border-violet-200/70 bg-violet-50/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-700">
                        avg run {eta()}
                      </span>
                    )}
                  </Show>
                </div>
              );
              const SharedReviewBannerSection = () => (
                <Show when={visibleSharedReviewBannerState()}>
                  {(bannerAccessor) => {
                    const bannerState = bannerAccessor();
                    return (
                      <div class="mb-3 rounded-[20px] border border-sky-200/70 bg-sky-50/80 px-4 py-3">
                        <div class="flex flex-wrap items-start justify-between gap-3">
                          <div class="space-y-2">
                            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">
                              Shared investigation
                            </p>
                            <p class="mt-1 text-sm text-sky-900">
                              This view was opened from a shareable review link, so workflow, run, branch, timeline, and deployment context were restored from the URL.
                            </p>
                            <Show when={bannerState.summary.length > 0}>
                              <div>
                                <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                                  Link contains
                                </p>
                                <div class="mt-2 flex flex-wrap gap-2">
                                  <For each={bannerState.summary}>
                                    {(entry) => (
                                      <span class="rounded-full border border-sky-200/70 bg-white/85 px-3 py-1 text-[11px] font-medium text-sky-800">
                                        {entry}
                                      </span>
                                    )}
                                  </For>
                                </div>
                              </div>
                            </Show>
                          </div>
                          <div class="flex flex-wrap gap-2">
                            <button
                              type="button"
                              class="rounded-full border border-sky-200/70 bg-white/85 px-3 py-1 text-xs font-medium text-sky-700 transition hover:bg-white"
                              onClick={() => setSharedReviewBannerVisible(false)}
                            >
                              Dismiss
                            </button>
                            <button
                              type="button"
                              class="rounded-full border border-sky-200/70 bg-sky-100/90 px-3 py-1 text-xs font-medium text-sky-800 transition hover:bg-sky-100"
                              onClick={() => resetSharedInvestigationView()}
                            >
                              Reset to default view
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                </Show>
              );
              const CanvasOverlaySection = () => (
                <Show when={canvasRunOverlayState()}>
                  {(overlayAccessor) => {
                    const overlayState = overlayAccessor();
                    return (
                      <div class="mb-3 flex flex-wrap items-center gap-2 rounded-[20px] border border-violet-200/70 bg-violet-50/70 px-4 py-3">
                        <span class="rounded-full bg-violet-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">
                          Canvas overlay
                        </span>
                        <span class="rounded-full bg-white/85 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-violet-700">
                          {overlayState.executionMode}
                        </span>
                        <span class="text-xs text-violet-800">
                          {overlayState.timelineCount} timeline steps projected onto nodes and traversed edges
                        </span>
                        <Show when={overlayState.nodePolicyDeltaCount > 0}>
                          <span class="text-xs text-violet-800">
                            {overlayState.nodePolicyDeltaLabel}
                          </span>
                        </Show>
                        <Show when={overlayState.durationLabel}>
                          <span class="text-xs text-violet-800">duration {overlayState.durationLabel}</span>
                        </Show>
                      </div>
                    );
                  }}
                </Show>
              );
              const canvasChromeSectionViews = () => workflowCanvasSectionViews<WorkflowCanvasChromeSectionId, JSXElement>(
                workflowCanvasChromeSectionIds(),
                {
                  header: <CanvasHeaderSection />,
                  overlay: <CanvasOverlaySection />,
                  shared_review: <SharedReviewBannerSection />,
                },
              );
              const CanvasHorizontalRuler = () => (
                <div class="pointer-events-none absolute left-5 top-0 right-0 z-20 h-5 border-b border-white/25 bg-white/20">
                  <For each={CANVAS_HORIZONTAL_RULER_MARKS}>
                    {(x) => (
                      <div class="absolute bottom-0 flex flex-col items-start" style={workflowCanvasHorizontalRulerMarkStyle(x)}>
                        <span class="text-[8px] text-on-surface-variant/30 font-mono leading-none ml-0.5 mb-0.5">{x}</span>
                        <div class="h-1.5 w-px bg-on-surface-variant/20" />
                      </div>
                    )}
                  </For>
                </div>
              );
              const CanvasVerticalRuler = () => (
                <div class="pointer-events-none absolute left-0 top-5 bottom-0 z-20 w-5 border-r border-white/25 bg-white/20">
                  <For each={CANVAS_VERTICAL_RULER_MARKS}>
                    {(y) => (
                      <div class="absolute left-0 flex items-center" style={workflowCanvasVerticalRulerMarkStyle(y)}>
                        <div class="h-px w-1.5 bg-on-surface-variant/20" />
                        <span class="text-[8px] text-on-surface-variant/25 font-mono leading-none" style={CANVAS_VERTICAL_RULER_LABEL_STYLE}>{y}</span>
                      </div>
                    )}
                  </For>
                </div>
              );
              const EmptyCanvasTemplatesSection = () => (
                <div class="grid grid-cols-2 gap-3">
                  <For each={EMPTY_CANVAS_TEMPLATE_ITEMS}>
                    {(tpl) => (
                      <button
                        type="button"
                        class="flex flex-col items-center gap-2 rounded-[20px] border border-white/50 bg-white/80 px-5 py-4 text-center shadow-soft transition hover:bg-white hover:shadow-md"
                        onClick={(e) => { e.stopPropagation(); addNode(tpl.kind); }}
                      >
                        <span class="text-2xl">{tpl.icon}</span>
                        <span class="text-xs font-semibold text-on-surface">{tpl.label}</span>
                      </button>
                    )}
                  </For>
                </div>
              );
              const EmptyCanvasAiScaffoldSection = () => (
                <div class="w-full max-w-lg">
                  <p class="mb-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-on-surface-variant">Or scaffold with AI</p>
                  <div class="grid grid-cols-3 gap-2">
                    <For each={EMPTY_CANVAS_AI_STARTER_ITEMS}>
                      {(starter) => (
                        <button
                          type="button"
                          class="flex flex-col items-start gap-1 rounded-[18px] border border-primary/20 bg-primary/5 px-3 py-3 text-left shadow-soft transition hover:bg-primary/10 hover:shadow-md"
                          onClick={(e) => { e.stopPropagation(); setWorkflowIntent(starter.title); void createWorkflowFromIntent(); }}
                        >
                          <span class="text-lg">{starter.icon}</span>
                          <span class="text-[11px] font-semibold text-on-surface">{starter.title}</span>
                          <span class="text-[10px] leading-4 text-on-surface-variant">{starter.desc}</span>
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              );
              const EmptyCanvasStateSection = () => (
                <Show when={emptyCanvasState().show}>
                  <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 p-8">
                    <p class="text-sm font-semibold text-on-surface-variant">Start from a template</p>
                    <EmptyCanvasTemplatesSection />
                    <EmptyCanvasAiScaffoldSection />
                  </div>
                </Show>
              );
              const canvasOverlayChromeState = createMemo(() => (
                workflowCanvasOverlayChromeState({
                  activeAfpFilter: selectedCompiledAfpFilter(),
                  interactionLockLabel: workflowInteractionLockLabel(),
                  interactionLocked: workflowInteractionLocked(),
                })
              ));
              const workflowContextActionDisabled = () => canvasOverlayChromeState().interactionLocked;
              const visibleInteractionLockState = createMemo(() => {
                return workflowCanvasVisibleInteractionLockState(canvasOverlayChromeState());
              });
              const workflowLatestIr = createMemo(() =>
                isRecord(workflow.latest_ir) ? workflow.latest_ir : null,
              );
              const workflowLatestIrManifests = createMemo(() => {
                const latestIr = workflowLatestIr();
                return Array.isArray(latestIr?.manifests)
                  ? latestIr.manifests.filter(isRecord)
                  : [];
              });
              const workflowLatestIrEdges = createMemo(() => {
                const latestIr = workflowLatestIr();
                return Array.isArray(latestIr?.edges)
                  ? latestIr.edges.filter(isRecord)
                  : [];
              });
              const compiledRouteGraphEdgeId = (
                entry: Record<string, unknown>,
                manifests: Record<string, unknown>[],
                graphEdges: WorkflowEdgeDraft[],
              ) => workflowCanvasCompiledRouteGraphEdgeId({ entry, graphEdges, manifests });
              const compiledCanvasReviewContext = (graphEdges: WorkflowEdgeDraft[]) => {
                const latestManifests = workflowLatestIrManifests();
                const latestEdges = workflowLatestIrEdges();
                return workflowCanvasCompiledReviewContext({
                  activeAfpFilter: selectedCompiledAfpFilter(),
                  activeAfpGapFilter: selectedCompiledAfpGapFilter(),
                  activeAfpReadinessFocus: selectedCompiledAfpReadinessFocus(),
                  activeAfpRouteFocus: selectedCompiledAfpRouteFocus(),
                  activeManifestLinkageFilter: selectedCompiledManifestLinkageFilter(),
                  activeOrchestrationRole: selectedCompiledOrchestrationRole(),
                  activeRouteLinkageFilter: selectedCompiledRouteLinkageFilter(),
                  graphEdges,
                  latestEdges,
                  latestManifests,
                });
              };
              const workflowEdgeCanvasRenderState = (input: {
                activeRun: WorkflowRun | null;
                edge: WorkflowEdgeDraft;
                edgePolicyDeltas: ReturnType<typeof selectedRunEdgePolicyDeltas>;
                edgeReviewState: WorkflowCanvasCompiledEdgeReviewState;
                edgeStates: ReturnType<typeof selectedRunEdgeStates>;
                graphDraft: ReturnType<typeof draft>;
                protectedEdgeIds: Set<string>;
                refreshing: boolean;
                selectedEdgeId: string | null;
                selectedRunId: string | null;
              }) => {
                const edgeRenderState = workflowCanvasEdgeRunPresentationState(input);
                return {
                  ...edgeRenderState,
                  reviewEdgePolicyDelta: () => openEdgePolicyDeltaReview(
                    input.edge.id,
                    edgeRenderState.edgePolicyDelta?.nodeId ?? input.edge.target,
                    workflowCanvasPolicyDeltaReviewMode(edgeRenderState.edgePolicyDelta?.source),
                    input.selectedRunId,
                    edgeRenderState.edgePolicyDelta?.deploymentId ?? null,
                  ),
                };
              };
              const edgeLegendButtonStyle = workflowCanvasEdgeLegendButtonStyle;
              const edgeLegendDotStyle = workflowCanvasEdgeLegendDotStyle;
              const manifestHealthRailCopy = workflowCanvasManifestHealthRailCopy;
              const afpRouteRailCopy = workflowCanvasAfpRouteRailCopy;
              const routeLinkageRailCopy = workflowCanvasRouteLinkageRailCopy;
              const canvasReviewRailClearActionItems = (input: {
                activeAfpReadinessFocus: CompiledAfpReadinessFocus | null;
                activeLinkageFocus: "linked" | "manifest_only" | null;
                activeManifestLinkageFocus: "linked" | "inspector_only" | null;
                activeOrchestrationRoleFocus: CompiledOrchestrationRole | null;
                activeRouteFocus: "full" | "partial" | null;
                branchRailFocusAvailable: boolean;
                branchReviewActive: boolean;
                firstReviewedEdge: WorkflowEdgeDraft | null;
                selectedEdgeId: string | null;
              }) => workflowCanvasReviewRailClearActionItems({
                ...input,
                clearAfpReadinessFocus,
                clearAfpRouteFocus,
                clearManifestHealthFocus,
                clearOrchestrationRoleFocus,
                clearRouteLinkageFocus,
                focusRunEdgeTarget,
                setSelectedRunEdgeId,
              });
              const canvasReviewRailUnavailableFocusMessage = workflowCanvasReviewRailUnavailableFocusMessage;
              const canvasReviewRailPrimaryFocusView = (input: {
                activeAfpReadinessFocus: CompiledAfpReadinessFocus | null;
                activeEdgeId: string | null;
                activeLinkageFocus: "linked" | "manifest_only" | null;
                activeManifestLinkageFocus: "linked" | "inspector_only" | null;
                activeOrchestrationRoleFocus: CompiledOrchestrationRole | null;
                activeRouteFocus: "full" | "partial" | null;
                branchReviewActive: boolean;
                firstAfpContractWorkSourceNodeId: string | null;
                firstAfpReadyHandoffTarget: string | null;
                firstAfpReadyManifestSourceNodeId: string | null;
                firstCompiledRouteFocusTarget: string | null;
                firstLinkedManifestNodeId: string | null;
                firstOrchestrationRoleNodeId: string | null;
                firstReviewedEdge: WorkflowEdgeDraft | null;
                graphEdges: WorkflowEdgeDraft[];
              }) => workflowCanvasReviewRailPrimaryFocusActionView({
                ...input,
                focusRunEdgeTarget,
                openCompiledRouteReview,
                resetInspectorFocus,
                selectCanvasNode,
                setSelectedNodeId,
              });
              const canvasNodePositionStyle = workflowCanvasPointPositionStyle;
              const edgeLabelTextInteractionStyle = { "pointer-events": "all" as const };
              const edgeLabelEditInputStyle = { "font-size": "10px" };
              const workflowNodeRunPresentationState = (input: {
                activeRun: WorkflowRun | null;
                deploymentPolicyById: ReturnType<typeof nodeDeploymentPolicies>;
                liveRunConnected: boolean;
                node: WorkflowNodeDraft;
                nodePolicyDeltas: ReturnType<typeof selectedRunNodePolicyDeltas>;
                pendingPolicyById: ReturnType<typeof pendingNodeDeploymentPolicies>;
                protectedNodeIds: Set<string>;
                runNodeOverlays: ReturnType<typeof liveRunNodeOverlays>;
                runStatuses: ReturnType<typeof selectedRunStatuses>;
                runStepOrder: ReturnType<typeof selectedRunStepOrder>;
                selectedRunId: string | null;
              }) => {
                const state = workflowCanvasNodeRunPresentationState(input);
                return {
                  ...state,
                  reviewNodePolicyDelta: () => openPolicyDeltaReview(
                    input.node.id,
                    state.policyDeltaFilterMode,
                    input.selectedRunId,
                    state.runNodePolicyDelta?.deploymentId ?? null,
                  ),
                };
              };
              const compiledNodeCanvasReviewState = (input: {
                graphEdges: WorkflowEdgeDraft[];
                nodeId: string;
                nodeReviewState: WorkflowCanvasCompiledNodeReviewState;
              }) => workflowCanvasCompiledNodeCanvasReviewState({
                activeAfpFilter: input.nodeReviewState.activeAfpFilter,
                activeGapFilter: input.nodeReviewState.activeAfpGapFilter,
                activeManifestLinkageFilter: input.nodeReviewState.activeManifestLinkageFilter,
                activeOrchestrationRole: input.nodeReviewState.activeOrchestrationRole,
                activeReadinessFocus: input.nodeReviewState.activeAfpReadinessFocus,
                activeRouteFocus: input.nodeReviewState.activeAfpRouteFocus,
                graphEdges: input.graphEdges,
                latestManifests: input.nodeReviewState.latestManifests,
                nodeId: input.nodeId,
                readyHandoffManifestIds: input.nodeReviewState.readyHandoffManifestIds,
                readyManifestIds: input.nodeReviewState.readyManifestIds,
              });
              const canvasGraphReviewState = createMemo(() => {
                const graphDraft = draft();
                return workflowCanvasGraphReviewState({
                  graphDraft,
                  reviewContext: compiledCanvasReviewContext(graphDraft.edges),
                });
              });
              const compiledFocusOverlayState = createMemo(() => {
                const graphReviewState = canvasGraphReviewState();
                const overlayChrome = canvasOverlayChromeState();
                const overlayState = workflowCanvasCompiledFocusOverlayViewState({
                  graphEdges: graphReviewState.graphEdges,
                  graphNodes: graphReviewState.graphNodes,
                  reviewContext: graphReviewState.reviewContext,
                  topOffsetClass: overlayChrome.topOffsetClass,
                });
                if (!overlayState) return null;
                return {
                  ...overlayState,
                  actionItems: workflowCanvasFocusOverlayActionItems({
                    actionViews: overlayState.actionItems,
                    clearAfpGraphFocus,
                    clearAfpRouteFocus,
                    openCompiledRosterReview,
                    openCompiledRuntimeContract,
                    setSelectedCompiledAfpRouteFocus,
                  }),
                };
              });
              const CompiledFocusOverlaySection = () => (
                <Show when={compiledFocusOverlayState()}>
                  {(overlayAccessor) => {
                    const overlayState = overlayAccessor();
                    return (
                      <div class={`absolute left-4 z-20 flex max-w-[420px] flex-wrap items-center gap-2 rounded-[20px] border border-emerald-200/80 bg-white/88 px-4 py-3 shadow-soft backdrop-blur ${overlayState.topOffsetClass}`}>
                        <For each={overlayState.badgeItems}>
                          {(item) => <span class={item.className}>{item.label}</span>}
                        </For>
                        <Show when={overlayState.inspectorOnlyNotice}>
                          <span class="text-xs text-amber-800">
                            {overlayState.inspectorOnlyNotice}
                          </span>
                        </Show>
                        <For each={overlayState.actionItems}>
                          {(item) => (
                            <button
                              type="button"
                              class={item.className}
                              onClick={item.onClick}
                              title={item.title}
                              aria-label={item.ariaLabel}
                            >
                              {item.label}
                            </button>
                          )}
                        </For>
                      </div>
                    );
                  }}
                </Show>
              );
              const WorkflowInteractionLockSection = () => (
                <Show when={visibleInteractionLockState()}>
                  {(chromeAccessor) => {
                    const chromeState = chromeAccessor();
                    return (
                      <div class={`pointer-events-none absolute inset-x-4 z-20 rounded-[20px] border border-amber-200/80 bg-amber-50/90 px-4 py-3 shadow-soft ${chromeState.topOffsetClass}`}>
                        <p class="text-sm font-semibold text-amber-900">{chromeState.interactionLockLabel}</p>
                        <p class="mt-1 text-xs uppercase tracking-[0.16em] text-amber-700">Canvas editing is temporarily locked until this operation finishes.</p>
                      </div>
                    );
                  }}
                </Show>
              );
              const canvasReviewRailState = createMemo(() => {
                const overlayChrome = canvasOverlayChromeState();
                return workflowCanvasReviewRailState({
                  activeAfpReadinessFocus: selectedCompiledAfpReadinessFocus(),
                  activeEdgeId: selectedRunEdgeId(),
                  activeLinkageFocus: selectedCompiledRouteLinkageFilter(),
                  activeManifestLinkageFocus: selectedCompiledManifestLinkageFilter(),
                  activeOrchestrationRoleFocus: selectedCompiledOrchestrationRole(),
                  activeRouteFocus: selectedCompiledAfpRouteFocus(),
                  activeRun: selectedRun(),
                  branchLegendStates: edgeLegendStates(),
                  clearActionItemsFor: canvasReviewRailClearActionItems,
                  edgeStates: selectedRunEdgeStates(),
                  graphReviewState: canvasGraphReviewState(),
                  primaryFocusFor: canvasReviewRailPrimaryFocusView,
                  topOffsetClass: overlayChrome.topOffsetClass,
                });
              });
              const CanvasEdgeAnimationStyleSection = () => (
                <style>{`@keyframes dash-flow { to { stroke-dashoffset: -9; } }`}</style>
              );
              const canvasMinimapViewState = createMemo(() => {
                return workflowCanvasMinimapViewState({
                  bounds: minimapBounds(),
                  selectedNodeId: selectedNodeId(),
                  show: showMinimap(),
                });
              });
              const hiddenCanvasMinimapToggleState = createMemo(() => {
                return workflowCanvasHiddenMinimapToggleState(canvasMinimapViewState());
              });
              const visibleCanvasMinimapState = createMemo(() => {
                return workflowCanvasVisibleMinimapState(canvasMinimapViewState());
              });
              const CanvasMinimapToggleSection = () => (
                <Show when={hiddenCanvasMinimapToggleState()}>
                  <button
                    type="button"
                    class="absolute bottom-3 right-3 z-20 rounded-[10px] border border-white/50 bg-white/80 px-2 py-1 text-[9px] font-medium uppercase tracking-[0.12em] text-slate-400 shadow-soft backdrop-blur-sm hover:bg-white hover:text-slate-600"
                    onClick={() => setShowMinimap(true)}
                    aria-label="Show minimap"
                  >Map</button>
                </Show>
              );
              const CanvasMinimapSection = () => (
                <Show when={visibleCanvasMinimapState()}>
                  {(minimapState) => {
                    const state = minimapState();
                    const minimapLayout = state.layout;
                    return (
                      <div
                        class="absolute bottom-3 right-3 z-20 rounded-[14px] border border-white/50 bg-white/80 shadow-soft backdrop-blur-sm"
                        style={minimapLayout.style}
                        aria-label="Workflow canvas minimap"
                        role="img"
                      >
                        <button
                          type="button"
                          class="absolute right-1.5 top-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-slate-200/70 text-[9px] text-slate-500 hover:bg-slate-300/70"
                          aria-label="Hide minimap"
                          onClick={() => setShowMinimap(false)}
                        >x</button>
                        <svg width={minimapLayout.width} height={minimapLayout.height} aria-hidden="true">
                          <For each={state.nodeRects}>
                            {(rect) => (
                              <rect
                                x={rect.x}
                                y={rect.y}
                                width={rect.width}
                                height={rect.height}
                                rx={3}
                                fill={rect.fill}
                                stroke={rect.stroke}
                                stroke-width="0.8"
                              />
                            )}
                          </For>
                          <rect
                            x={minimapLayout.pad}
                            y={minimapLayout.pad}
                            width={minimapLayout.viewportWidth}
                            height={minimapLayout.viewportHeight}
                            rx={4}
                            fill="none"
                            stroke="rgba(99,102,241,0.5)"
                            stroke-width="1.2"
                            stroke-dasharray="3 2"
                          />
                        </svg>
                        <p class="absolute bottom-1 left-0 right-0 text-center text-[8px] font-medium uppercase tracking-[0.12em] text-slate-400">
                          {state.nodeCount} nodes
                        </p>
                      </div>
                    );
                  }}
                </Show>
              );
              const canvasIdleNodeOverlayState = createMemo(() => {
                return workflowCanvasIdleNodeOverlayState({
                  nodes: idleNodes(),
                  showIdleNodes: showIdleNodes(),
                });
              });
              const canvasIdleNodeBadgeState = createMemo(() => {
                return workflowCanvasIdleNodeBadgeState(canvasIdleNodeOverlayState());
              });
              const visibleCanvasIdleNodePanelState = createMemo(() => {
                return workflowCanvasVisibleIdleNodePanelState(canvasIdleNodeOverlayState());
              });
              const canvasZoomViewState = createMemo(() => {
                return workflowCanvasZoomViewState(zoom());
              });
              const CanvasZoomControlsSection = () => (
                <div class="absolute bottom-4 left-4 z-10 flex items-center gap-1 rounded-full border border-white/40 bg-white/70 px-2 py-1.5 shadow backdrop-blur">
                  <button
                    type="button"
                    onClick={() => setZoom((z: number) => Math.max(z - 0.1, 0.25))}
                    class="flex h-6 w-6 items-center justify-center rounded-full text-sm text-on-surface-variant transition hover:bg-white/50"
                    title="Zoom out"
                    aria-label="Zoom out"
                  >
                    -
                  </button>
                  <span class="min-w-[36px] text-center font-mono text-[10px] text-on-surface-variant">
                    {canvasZoomViewState().percentLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoom((z: number) => Math.min(z + 0.1, 3))}
                    class="flex h-6 w-6 items-center justify-center rounded-full text-sm text-on-surface-variant transition hover:bg-white/50"
                    title="Zoom in"
                    aria-label="Zoom in"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoom(1)}
                    class="ml-0.5 flex h-6 items-center rounded-full px-1.5 text-[9px] text-on-surface-variant/60 transition hover:bg-white/50"
                    title="Reset zoom"
                    aria-label="Reset zoom"
                  >
                    Reset
                  </button>
                </div>
              );
              const CanvasIdleNodeToggleSection = () => (
                <button
                  type="button"
                  onClick={() => setShowIdleNodes((v: boolean) => !v)}
                  class="absolute bottom-4 left-48 z-10 flex items-center gap-1 rounded-full border border-white/40 bg-white/70 px-2 py-1.5 text-[10px] text-on-surface-variant shadow backdrop-blur transition hover:bg-white/90"
                >
                  Alert Idle
                  <Show when={canvasIdleNodeBadgeState()}>
                    {(idleAccessor) => {
                      const idleState = idleAccessor();
                      return (
                        <span class="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                          {idleState.count}
                        </span>
                      );
                    }}
                  </Show>
                </button>
              );
              const CanvasIdleNodesPanelSection = () => (
                <Show when={visibleCanvasIdleNodePanelState()}>
                  {(idleAccessor) => {
                    const idleState = idleAccessor();
                    return (
                      <div class="absolute top-12 right-4 z-20 w-56 space-y-1 rounded-xl border border-amber-300/60 bg-amber-50/90 px-3 py-2 shadow-lg backdrop-blur">
                        <p class="font-mono text-[8px] uppercase tracking-[0.16em] text-amber-700">Idle / Failed nodes</p>
                        <For each={idleState.items}>
                          {(item) => (
                            <div class="flex items-center justify-between rounded-lg bg-white/40 px-2 py-1">
                              <span class="truncate text-[11px] text-on-surface">{item.label}</span>
                              <span class="font-mono text-[9px] text-amber-600">{item.kind}</span>
                            </div>
                          )}
                        </For>
                      </div>
                    );
                  }}
                </Show>
              );
              const canvasContextMenuActionItems = (nodeId: string) =>
                workflowCanvasContextMenuActionItems({
                  duplicateNode,
                  nodeCommentById: nodeComments(),
                  nodeId,
                  setCommentDraft,
                  setCtxMenu,
                  setEditingCommentNodeId,
                  setSelectedNodeId,
                });
              const canvasContextMenuState = createMemo(() => {
                const menu = ctxMenu();
                return workflowCanvasContextMenuState({
                  actionItems: menu ? canvasContextMenuActionItems(menu.nodeId) : [],
                  menu,
                });
              });
              const CanvasContextMenuSection = () => (
                <Show when={canvasContextMenuState()}>
                  {(menuStateAccessor) => {
                    const menuState = menuStateAccessor();
                    return (
                      <div
                        class="absolute z-30 min-w-[140px] rounded-[14px] border border-white/50 bg-white/95 py-1 shadow-lg backdrop-blur-sm"
                        style={workflowCanvasPointPositionStyle(menuState.menu)}
                      >
                        <For each={menuState.actionItems}>
                          {(item) => (
                            <button
                              type="button"
                              class="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-medium text-on-surface hover:bg-slate-50"
                              onClick={item.onClick}
                            >
                              {item.label}
                            </button>
                          )}
                        </For>
                      </div>
                    );
                  }}
                </Show>
              );
              type WorkflowCanvasSurfaceSectionView = {
                id: string;
                content: JSXElement;
              };
              const contextShellViewState = createMemo(() => workflowCanvasShellViewState({
                className: WORKFLOW_CONTEXT_SURFACE_CLASS,
                sections: workflowContextSectionViews(),
              }));
              const mainShellViewState = createMemo(() => workflowCanvasShellViewState({
                className: WORKFLOW_CANVAS_SURFACE_CLASS,
                sections: canvasChromeSectionViews(),
              }));
              const frameMountViewState = createMemo(() => workflowCanvasFrameMountViewState<WorkflowCanvasSurfaceSectionView>({
                interactiveOverlaySections: workflowCanvasSectionViews<WorkflowCanvasInteractiveOverlaySectionId, JSXElement>(
                  workflowCanvasInteractiveOverlaySectionIds(),
                  {
                    context_menu: <CanvasContextMenuSection />,
                    idle_node_panel: <CanvasIdleNodesPanelSection />,
                    idle_node_toggle: <CanvasIdleNodeToggleSection />,
                    minimap: <CanvasMinimapSection />,
                    minimap_toggle: <CanvasMinimapToggleSection />,
                    zoom_controls: <CanvasZoomControlsSection />,
                  },
                ),
                passiveOverlaySections: workflowCanvasSectionViews<WorkflowCanvasPassiveOverlaySectionId, JSXElement>(
                  workflowCanvasPassiveOverlaySectionIds(),
                  {
                    compiled_focus: <CompiledFocusOverlaySection />,
                    edge_animation_style: <CanvasEdgeAnimationStyleSection />,
                    empty_state: <EmptyCanvasStateSection />,
                    horizontal_ruler: <CanvasHorizontalRuler />,
                    interaction_lock: <WorkflowInteractionLockSection />,
                    vertical_ruler: <CanvasVerticalRuler />,
                  },
                ),
              }));
              const reviewRailViewState = createMemo(() => {
                const reviewRailState = canvasReviewRailState();
                return workflowCanvasReviewRailMountState(reviewRailState);
              });
              const surfaceView = createMemo(() => {
                const graphReviewState = canvasGraphReviewState();
                const activeRun = selectedRun();
                return {
                  contextShellView: contextShellViewState(),
                  edgePolicyDeltas: selectedRunEdgePolicyDeltas(),
                  edgeReviewState: graphReviewState.edgeReviewState,
                  edgeStates: selectedRunEdgeStates(),
                  graphDraft: graphReviewState.graphDraft,
                  graphEdges: graphReviewState.graphEdges,
                  graphNodes: graphReviewState.graphNodes,
                  liveRunConnected: liveRunStreamConnected(),
                  mainShellView: mainShellViewState(),
                  collapsedNodeIds: collapsedNodes(),
                  dependencyHighlightedNodeId: highlightedNodeId(),
                  downstreamNodeIds: downstreamOf(),
                  dragGhostNodeId: dragGhostOrigin()?.nodeId ?? null,
                  gotoNodeId: gotoNodeId(),
                  matchingNodeIds: matchingNodeIds(),
                  nodeCommentById: nodeComments(),
                  nodeDeploymentPolicyById: nodeDeploymentPolicies(),
                  nodeErrorIds: nodeErrorIds(),
                  nodePendingDeploymentPolicyById: pendingNodeDeploymentPolicies(),
                  nodePolicyDeltas: selectedRunNodePolicyDeltas(),
                  nodeProtectedIds: protectedNodeIds(),
                  nodeRunCountById: nodeRunCounts(),
                  nodeReviewState: graphReviewState.nodeReviewState,
                  nodeSuccessRateById: nodeSuccessRates(),
                  runNodeOverlays: liveRunNodeOverlays(),
                  runStepOrder: selectedRunStepOrder(),
                  runStatuses: selectedRunStatuses(),
                  selectedEdgeId: selectedRunEdgeId(),
                  selectedNodeId: selectedNodeId(),
                  selectedRun: activeRun,
                  selectedRunId: activeRun?.run_id ?? null,
                  showIdleNodes: showIdleNodes(),
                  upstreamNodeIds: upstreamOf(),
                  protectedEdgeIds: protectedEdgeIds(),
                  workflowRefreshing: workflowExecutionRefreshing(),
                  zoomView: canvasZoomViewState(),
                  frameMountView: frameMountViewState(),
                  reviewRailView: reviewRailViewState(),
                };
              });
              const renderSectionViews = (
                sections: WorkflowCanvasSurfaceSectionView[],
              ): JSXElement => (
                <For each={sections}>
                  {(section) => section.content}
                </For>
              );
              const renderShellSurface = (
                className: string,
                sections: WorkflowCanvasSurfaceSectionView[],
                body?: JSXElement,
              ): JSXElement => (
                <div class={className}>
                  {renderSectionViews(sections)}
                  {body}
                </div>
              );
              const {
                contextShellView,
                collapsedNodeIds,
                dependencyHighlightedNodeId,
                downstreamNodeIds,
                dragGhostNodeId,
                edgePolicyDeltas,
                edgeReviewState,
                edgeStates,
                graphDraft,
                graphEdges,
                graphNodes,
                liveRunConnected,
                gotoNodeId: activeGotoNodeId,
                mainShellView,
                frameMountView,
                matchingNodeIds: activeMatchingNodeIds,
                nodeCommentById,
                nodeDeploymentPolicyById,
                nodeErrorIds: activeNodeErrorIds,
                nodePendingDeploymentPolicyById,
                nodePolicyDeltas,
                nodeProtectedIds,
                nodeRunCountById,
                nodeReviewState,
                nodeSuccessRateById,
                protectedEdgeIds: protectedEdgeIdSet,
                reviewRailView,
                runNodeOverlays,
                runStatuses,
                runStepOrder,
                selectedEdgeId,
                selectedNodeId: activeNodeId,
                selectedRun: activeRun,
                selectedRunId,
                showIdleNodes: activeShowIdleNodes,
                upstreamNodeIds,
                workflowRefreshing,
                zoomView,
              } = surfaceView();
              return (
                    <>
                      {renderShellSurface(contextShellView.className, contextShellView.sections)}

                      {renderShellSurface(mainShellView.className, mainShellView.sections, (
                        <>
                        <div ref={(el) => { canvasRefHolder.current = el; }} class={frameMountView.className} onClick={() => setCtxMenu(null)}>
                          {renderSectionViews(frameMountView.passiveOverlaySections)}
                          <Show when={reviewRailView.show}>
                            <div class={reviewRailView.mountClass}>
                          {(() => {
                            const railState = reviewRailView.state;
                            const {
                              activeAfpFilter,
                              activeAfpReadinessFocus,
                              activeLinkageFocus,
                              activeManifestLinkageFocus,
                              activeOrchestrationRoleFocus,
                              activeRouteFocus,
                              branchLegendStates,
                              branchRailFocusAvailable,
                              branchReviewActive,
                              clearActionItems,
                              compiledEdges,
                              firstReviewedEdge,
                              graphEdges: railGraphEdges,
                              manifests,
                              primaryRailFocus,
                              readinessReviewData,
                              showCombinedClearAction,
                            } = railState;
                            const CanvasReviewRailHeaderSection = () => (
                              <div class="flex flex-wrap items-center justify-between gap-2">
                                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">Canvas review rail</p>
                                <Show when={showCombinedClearAction}>
                                  <button
                                    type="button"
                                    class={`${REVIEW_CLEAR_ACTION_BASE_CLASS} border-slate-200/80 bg-slate-100/80 text-slate-700 transition hover:border-slate-300 hover:bg-slate-200/80`}
                                    onClick={clearCanvasReviewFocus}
                                    title={clearReviewFocusMessage("combined_canvas")}
                                    aria-label={clearReviewFocusMessage("combined_canvas")}
                                  >
                                    Clear orchestration, readiness, manifest, route, and linkage focus
                                  </button>
                                </Show>
                              </div>
                            );
                            const CanvasReviewRailPrimaryFocusSection = () => (
                              <Show when={primaryRailFocus}>
                                {(focusAccessor) => {
                                  const focus = focusAccessor();
                                  return (
                                    <div class="mt-3">
                                      <button
                                        type="button"
                                        class={`${REVIEW_CLEAR_ACTION_BASE_CLASS} transition ${focus.available ? "hover:bg-white" : "cursor-not-allowed opacity-70"} ${focus.tone}`}
                                        onClick={() => focus.available && focus.onClick()}
                                        title={focus.title}
                                        aria-label={focus.title}
                                        disabled={!focus.available}
                                      >
                                        {focus.label}
                                      </button>
                                      <Show when={!focus.available}>
                                        <p class="mt-2 text-[11px] leading-relaxed text-slate-600">
                                          {canvasReviewRailUnavailableFocusMessage({
                                            activeAfpReadinessFocus,
                                            activeLinkageFocus,
                                            activeManifestLinkageFocus,
                                            activeOrchestrationRoleFocus,
                                            activeRouteFocus,
                                          })}
                                        </p>
                                      </Show>
                                    </div>
                                  );
                                }}
                              </Show>
                            );
                            const CanvasReviewRailQuickActionsSection = () => (
                              <div class="mt-3 flex flex-wrap gap-2">
                                <For each={clearActionItems}>
                                  {(item) => (
                                    <button
                                      type="button"
                                      class={item.className}
                                      onClick={item.onClick}
                                      title={item.title}
                                      aria-label={item.title}
                                      disabled={item.disabled}
                                    >
                                      {item.label}
                                    </button>
                                  )}
                                </For>
                              </div>
                            );
                            const CanvasReviewRailGuidanceSection = () => (
                              <p class="mt-3 text-[11px] leading-relaxed text-slate-600">
                                These chips now name their actual action directly, so AFP readiness, orchestration role, manifest health, route focus, linkage focus, and branch review all use the same clear interaction language.
                              </p>
                            );
                            const CanvasReviewRailReadinessSection = () => {
                              const readinessFocus = activeAfpReadinessFocus;
                              if (!readinessFocus) return null;
                              const readyManifestIds = readinessReviewData.readyManifestIds;
                              const readyHandoffEdgeEntries = readinessReviewData.readyHandoffEntries;
                              const readyHandoffManifestIds = readinessReviewData.readyHandoffManifestIds;
                              const matchingManifestCount = workflowCanvasCompiledReadinessManifestCount({
                                readinessFocus,
                                manifests,
                                readyHandoffManifestIds,
                                readyManifestIds,
                              });
                              const readinessRailTone = workflowCanvasAfpReadinessTone(readinessFocus);
                              return <div class={`rounded-[20px] border px-4 py-3 shadow-soft backdrop-blur ${readinessRailTone.containerClass}`}>
                                <div class="flex flex-wrap items-center justify-between gap-2">
                                  <p class={`text-[11px] font-semibold uppercase tracking-[0.18em] ${readinessRailTone.labelClass}`}>AFP readiness focus</p>
                                  <button
                                    type="button"
                                    class={`${REVIEW_CLEAR_ACTION_HOVER_CLASS} ${readinessRailTone.pillClass}`}
                                    onClick={clearAfpReadinessFocus}
                                    title={clearAfpReadinessFocusMessage()}
                                    aria-label={clearAfpReadinessFocusMessage()}
                                  >
                                    {readinessRailTone.clearLabel}
                                  </button>
                                </div>
                                <p class={`mt-2 text-[11px] leading-relaxed ${readinessRailTone.mutedTextClass}`}>
                                  {afpReadinessFocusSummary(readinessFocus)}
                                </p>
                                <div class="mt-3 flex flex-wrap gap-2">
                                  <span class={`${REVIEW_RAIL_PILL_BASE_CLASS} ${readinessRailTone.pillClass}`}>
                                    {matchingManifestCount} manifests in readiness review
                                  </span>
                                  <Show when={readinessFocus === "ready_handoffs"}>
                                    <span class={`${REVIEW_RAIL_PILL_BASE_CLASS} border-cyan-200/80 bg-cyan-50/90 text-cyan-800`}>
                                      {readyHandoffEdgeEntries.length} AFP-ready handoffs in route review
                                    </span>
                                  </Show>
                                </div>
                              </div>;
                            };
                            const CanvasReviewRailOrchestrationRoleSection = () => {
                              const orchestrationRole = activeOrchestrationRoleFocus;
                              const routeRailState = workflowCanvasReviewRailOrchestrationRouteState({
                                activeLinkageFocus,
                                compiledEdges,
                                graphEdges: railGraphEdges,
                                manifests,
                                orchestrationRole,
                              });
                              const {
                                activeRouteLinkageFocus,
                                focusedRouteCount,
                                graphLinkedRouteCount,
                                inspectorOnlyRouteFocusButton,
                                inspectorOnlyRouteCount,
                                linkedRouteFocusButton,
                              } = routeRailState;
                              return <div class="rounded-[20px] border border-cyan-200/70 bg-white/82 px-4 py-3 shadow-soft backdrop-blur">
                                <div class="flex flex-wrap items-center justify-between gap-2">
                                  <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">Orchestration role focus</p>
                                  <button
                                    type="button"
                                    class={`${REVIEW_CLEAR_ACTION_BASE_CLASS} border-cyan-200/80 bg-cyan-100/80 text-cyan-800 transition hover:border-cyan-300 hover:bg-cyan-200/70`}
                                    onClick={clearOrchestrationRoleFocus}
                                    title={clearOrchestrationRoleFocusMessage()}
                                    aria-label={clearOrchestrationRoleFocusMessage()}
                                  >
                                    Clear orchestration role focus
                                  </button>
                                </div>
                                <p class="mt-2 text-[11px] leading-relaxed text-cyan-700/80">
                                  {orchestrationRoleRailGuideMessage()}
                                </p>
                                <div class="mt-3 space-y-2">
                                  <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700">
                                    <span class="h-2.5 w-8 rounded-full bg-cyan-500" />
                                    <span>{workflowCanvasOrchestrationRoleFocusLabel(orchestrationRole)} remain in focus</span>
                                  </div>
                                  <Show when={focusedRouteCount > 0}>
                                    <div class="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        class={`${REVIEW_RAIL_PILL_HOVER_CLASS} border-cyan-200/80 bg-cyan-50/90 text-cyan-800`}
                                        onClick={clearRouteLinkageFocus}
                                        title={broadenOrchestrationRoleRouteReviewMessage()}
                                        aria-label={broadenOrchestrationRoleRouteReviewMessage()}
                                      >
                                        {focusedRouteCount} routes support this role review
                                      </button>
                                      <Show when={graphLinkedRouteCount > 0}>
                                        <button
                                          type="button"
                                          class={`${REVIEW_RAIL_PILL_HOVER_CLASS} ${linkedRouteFocusButton.className}`}
                                          onClick={() => toggleRouteLinkageFocus("linked", activeRouteLinkageFocus)}
                                          title={linkedRouteFocusButton.message}
                                          aria-label={linkedRouteFocusButton.message}
                                        >
                                          {graphLinkedRouteCount} branch-review-ready routes
                                        </button>
                                      </Show>
                                      <Show when={inspectorOnlyRouteCount > 0}>
                                        <button
                                          type="button"
                                          class={`${REVIEW_RAIL_PILL_HOVER_CLASS} ${inspectorOnlyRouteFocusButton.className}`}
                                          onClick={() => toggleRouteLinkageFocus("manifest_only", activeRouteLinkageFocus)}
                                          title={inspectorOnlyRouteFocusButton.message}
                                          aria-label={inspectorOnlyRouteFocusButton.message}
                                        >
                                          {inspectorOnlyRouteCount} inspector-only routes
                                        </button>
                                      </Show>
                                    </div>
                                  </Show>
                                  <Show when={activeRouteLinkageFocus}>
                                    <p class="text-[11px] leading-relaxed text-cyan-700/80">
                                      {overlappingOrchestrationRouteSummaryMessage(activeRouteLinkageFocus === "linked" ? "linked" : "manifest_only")}
                                    </p>
                                  </Show>
                                  <Show when={focusedRouteCount > 0}>
                                    <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                      <span class="h-2.5 w-8 rounded-full bg-sky-500" />
                                      <span>Branch-review-ready routes touching this role stay visible on the graph</span>
                                    </div>
                                  </Show>
                                  <Show when={inspectorOnlyRouteCount > 0}>
                                    <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                      <span class="h-2.5 w-8 rounded-full bg-amber-500" />
                                      <span>Inspector-only routes for this role stay in compiled review only</span>
                                    </div>
                                  </Show>
                                  <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                                    <span class="h-2.5 w-8 rounded-full bg-slate-300" />
                                    <span>{orchestrationRoleOutsideFocusMessage()}</span>
                                  </div>
                                </div>
                              </div>;
                            };
                            const CanvasReviewRailManifestHealthSection = () => {
                              const manifestHealthCopy = manifestHealthRailCopy(activeManifestLinkageFocus);
                              return <div class="rounded-[20px] border border-sky-200/70 bg-white/82 px-4 py-3 shadow-soft backdrop-blur">
                                <div class="flex flex-wrap items-center justify-between gap-2">
                                  <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">Manifest health focus</p>
                                  <button
                                    type="button"
                                    class={`${REVIEW_CLEAR_ACTION_BASE_CLASS} border-sky-200/80 bg-sky-100/80 text-sky-800 transition hover:border-sky-300 hover:bg-sky-200/70`}
                                    onClick={clearManifestHealthFocus}
                                    title={clearReviewFocusMessage("manifest_health")}
                                    aria-label={clearReviewFocusMessage("manifest_health")}
                                  >
                                    Clear manifest health focus
                                  </button>
                                </div>
                                <div class="mt-3 space-y-2">
                                  <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                                    <span class="h-2.5 w-8 rounded-full bg-sky-500" />
                                    <span>{manifestHealthCopy.linkedText}</span>
                                  </div>
                                  <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                    <span class="h-2.5 w-8 rounded-full bg-amber-500" />
                                    <span>{manifestHealthCopy.inspectorOnlyText}</span>
                                  </div>
                                  <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                                    <span class="h-2.5 w-8 rounded-full bg-slate-300" />
                                    <span>Dimmed nodes are outside the current manifest health focus</span>
                                  </div>
                                </div>
                              </div>
                            };
                            const CanvasReviewRailAfpRouteSection = () => {
                              const afpRouteCopy = afpRouteRailCopy(activeRouteFocus);
                              return <div class="rounded-[20px] border border-emerald-200/70 bg-white/82 px-4 py-3 shadow-soft backdrop-blur">
                                <div class="flex flex-wrap items-center justify-between gap-2">
                                  <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">AFP route focus</p>
                                  <button
                                    type="button"
                                    class={`${REVIEW_CLEAR_ACTION_BASE_CLASS} border-emerald-200/80 bg-emerald-100/80 text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-200/70`}
                                    onClick={clearAfpRouteFocus}
                                    title={clearReviewFocusMessage("afp_route")}
                                    aria-label={clearReviewFocusMessage("afp_route")}
                                  >
                                    Clear AFP route focus
                                  </button>
                                </div>
                                <p class="mt-2 text-[11px] leading-relaxed text-emerald-700/80">
                                  Use this card to clear AFP route emphasis while keeping the broader AFP node slice active on the graph.
                                </p>
                                <div class="mt-3 space-y-2">
                                  <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                                    <span class="h-2.5 w-8 rounded-full bg-emerald-600" />
                                    <span>{afpRouteCopy.fullText}</span>
                                  </div>
                                  <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                    <span class="h-2.5 w-8 rounded-full bg-amber-500" />
                                    <span>{afpRouteCopy.partialText}</span>
                                  </div>
                                  <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                                    <span class="h-2.5 w-8 rounded-full bg-slate-300" />
                                    <span>Dimmed graph elements are outside the current route review focus</span>
                                  </div>
                                </div>
                              </div>
                            };
                            const CanvasReviewRailRouteLinkageSection = () => {
                              const routeLinkageCopy = routeLinkageRailCopy(activeLinkageFocus);
                              return <div class="rounded-[20px] border border-amber-200/70 bg-white/82 px-4 py-3 shadow-soft backdrop-blur">
                                <div class="flex flex-wrap items-center justify-between gap-2">
                                  <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Route linkage focus</p>
                                  <button
                                    type="button"
                                    class={`${REVIEW_CLEAR_ACTION_BASE_CLASS} border-amber-200/80 bg-amber-100/80 text-amber-800 transition hover:border-amber-300 hover:bg-amber-200/70`}
                                    onClick={clearRouteLinkageFocus}
                                    title={clearReviewFocusMessage("route_linkage")}
                                    aria-label={clearReviewFocusMessage("route_linkage")}
                                  >
                                    Clear linkage focus
                                  </button>
                                </div>
                                <p class="mt-2 text-[11px] leading-relaxed text-amber-700/80">
                                  Use this card to clear compiled route review emphasis while keeping the rest of the canvas review context intact.
                                </p>
                                <div class="mt-3 space-y-2">
                                  <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                                    <span class="h-2.5 w-8 rounded-full bg-emerald-600" />
                                    <span>{routeLinkageCopy.linkedText}</span>
                                  </div>
                                  <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                                    <span class="h-2.5 w-8 rounded-full bg-amber-500" />
                                    <span>{routeLinkageCopy.inspectorOnlyText}</span>
                                  </div>
                                  <div class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                                    <span class="h-2.5 w-8 rounded-full bg-slate-300" />
                                    <span>Dimmed graph elements are outside the current route linkage review focus</span>
                                  </div>
                                </div>
                              </div>
                            };
                            const focusFirstRunEdgeByState = (state: EdgeExecutionState) => {
                              const matchingEdge = railGraphEdges.find((edge) => edgeStates.get(edge.id) === state);
                              if (!matchingEdge) return;
                              focusRunEdgeTarget(matchingEdge.id, matchingEdge.target);
                            };
                            const CanvasReviewRailBranchLegendSection = () => (
                              <div class="pointer-events-none rounded-[20px] border border-white/45 bg-white/78 px-4 py-3 shadow-soft backdrop-blur">
                                <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">Branch legend</p>
                                <p class="mt-2 text-[11px] leading-relaxed text-slate-600">
                                  Choose a branch state below to focus the first matching traced edge on the graph.
                                </p>
                                <div class="mt-3 flex flex-wrap gap-2">
                                  <For each={branchLegendStates}>
                                    {(state) => {
                                      const visual = workflowCanvasEdgeLegendVisual(state);
                                      return (
                                        <button
                                          type="button"
                                          class="pointer-events-auto inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]"
                                          style={edgeLegendButtonStyle(visual)}
                                          onClick={() => focusFirstRunEdgeByState(state)}
                                        >
                                          <span class="h-2.5 w-2.5 rounded-full" style={edgeLegendDotStyle(visual)} />
                                          {visual.legend}
                                        </button>
                                      );
                                    }}
                                  </For>
                                </div>
                              </div>
                            );
                            const topSectionViews = workflowCanvasReviewRailTopSectionViews<JSXElement>({
                              contentById: {
                                guidance: <CanvasReviewRailGuidanceSection />,
                                header: <CanvasReviewRailHeaderSection />,
                                primary_focus: <CanvasReviewRailPrimaryFocusSection />,
                                quick_actions: <CanvasReviewRailQuickActionsSection />,
                              },
                              hasPrimaryFocus: primaryRailFocus !== null,
                              quickActionCount: clearActionItems.length,
                            });
                            const bodySectionViews = workflowCanvasReviewRailBodySectionViews<JSXElement>({
                              activeAfpReadinessFocus: activeAfpReadinessFocus !== null,
                              activeAfpRouteFocus: activeRouteFocus !== null,
                              activeLinkageFocus: activeLinkageFocus !== null,
                              activeManifestLinkageFocus: activeManifestLinkageFocus !== null,
                              activeOrchestrationRoleFocus: activeOrchestrationRoleFocus !== null,
                              branchReviewActive,
                              contentById: {
                                afp_route: <CanvasReviewRailAfpRouteSection />,
                                branch_legend: <CanvasReviewRailBranchLegendSection />,
                                manifest_health: <CanvasReviewRailManifestHealthSection />,
                                orchestration_role: <CanvasReviewRailOrchestrationRoleSection />,
                                readiness: <CanvasReviewRailReadinessSection />,
                                route_linkage: <CanvasReviewRailRouteLinkageSection />,
                              },
                              hasAfpFilter: activeAfpFilter !== null,
                            });
                            const canvasReviewRailSectionViews = workflowCanvasReviewRailSectionViews<JSXElement>({
                              bodySectionViews,
                              topGroupContent: (
                                <div class="rounded-[20px] border border-slate-200/70 bg-white/84 px-4 py-3 shadow-soft backdrop-blur">
                                  <For each={topSectionViews}>
                                    {(section) => section.content}
                                  </For>
                                </div>
                              ),
                            });
                            return (
                              <For each={canvasReviewRailSectionViews}>
                                {(section) => section.content}
                              </For>
                            );
                          })()}
                        </div>
                      </Show>
                      {/* 19k - zoom wrapper */}
                      <div style={zoomView.style}>
                      <svg class="absolute inset-0 h-full w-full">
                        <For each={graphEdges}>{(edge) => {
                          const edgeRenderState = workflowEdgeCanvasRenderState({
                            activeRun,
                            edge,
                            edgePolicyDeltas,
                            edgeReviewState,
                            edgeStates,
                            graphDraft,
                            protectedEdgeIds: protectedEdgeIdSet,
                            refreshing: workflowRefreshing,
                            selectedEdgeId,
                            selectedRunId,
                          });
                          const {
                            edgeAfpOverlayClass,
                            edgeAfpOverlayLabel,
                            edgeCallout,
                            edgeCalloutStyle,
                            edgeOverlayLayout,
                            edgePolicyDelta,
                            edgeState,
                            effectiveOpacity,
                            effectiveStroke,
                            line,
                            lineAnimation,
                            midX,
                            readinessStroke,
                            reviewEdgePolicyDelta,
                            sourceEndpointCircle,
                            strokeWidth,
                            targetEndpointCircle,
                          } = edgeRenderState;
                          return (
                            <Show when={line}>
                              {(coords) => (
                                <>
                                  <line
                                    x1={coords().x1}
                                    y1={coords().y1}
                                    x2={coords().x2}
                                    y2={coords().y2}
                                    stroke={edgeReviewState.activeAfpReadinessFocus ? readinessStroke : effectiveStroke}
                                    stroke-width={strokeWidth}
                                    stroke-linecap="round"
                                    stroke-dasharray={lineAnimation.dasharray}
                                    style={lineAnimation.style}
                                    class="pointer-events-none"
                                    opacity={effectiveOpacity}
                                  />
                                  <circle cx={coords().x1} cy={coords().y1} r={sourceEndpointCircle.radius} fill={sourceEndpointCircle.fill} class="pointer-events-none" opacity={effectiveOpacity} />
                                  <circle cx={coords().x2} cy={coords().y2} r={targetEndpointCircle.radius} fill={targetEndpointCircle.fill} class="pointer-events-none" opacity={effectiveOpacity} />
                                  <Show when={edge.condition_label}>
                                    <Show when={editingEdgeLabelId() === edge.id} fallback={
                                      <text
                                        role="button"
                                        tabindex={0}
                                        aria-label={`Edit branch label ${edge.condition_label}`}
                                        x={midX}
                                        y={edgeOverlayLayout.labelTextY}
                                        text-anchor="middle"
                                        class="fill-slate-600 text-[11px] font-semibold uppercase tracking-[0.14em] cursor-pointer"
                                        style={edgeLabelTextInteractionStyle}
                                        onClick={(e) => { e.stopPropagation(); beginEdgeLabelEdit(edge.id, edge.condition_label); }}
                                        onKeyDown={(event) => {
                                          if (!isKeyboardActivation(event)) return;
                                          event.preventDefault();
                                          event.stopPropagation();
                                          beginEdgeLabelEdit(edge.id, edge.condition_label);
                                        }}
                                      >
                                        <title>Click to edit branch label</title>
                                        {edge.condition_label}
                                      </text>
                                    }>
                                      <foreignObject x={midX - 60} y={edgeOverlayLayout.labelEditY} width="120" height="24">
                                        <input
                                          type="text"
                                          aria-label="Edit edge label"
                                          value={editingEdgeLabelValue()}
                                          onInput={(e) => setEditingEdgeLabelValue(e.currentTarget.value)}
                                          onBlur={() => commitEdgeLabelEdit(edge.id)}
                                          onKeyDown={handleEdgeLabelEditKeyDown}
                                          class="h-6 w-full rounded-full border border-primary/40 bg-white/95 px-2 text-[10px] font-semibold text-slate-700 outline-none"
                                          style={edgeLabelEditInputStyle}
                                          ref={(el) => { setTimeout(() => el?.focus(), 0); }}
                                        />
                                      </foreignObject>
                                    </Show>
                                  </Show>
                                  <Show when={edgeAfpOverlayLabel}>
                                    <foreignObject x={midX - 60} y={edgeOverlayLayout.afpOverlayY} width="120" height="24">
                                      <div class={edgeAfpOverlayClass}>
                                        {edgeAfpOverlayLabel}
                                      </div>
                                    </foreignObject>
                                  </Show>
                                  <Show when={edgeCallout}>
                                    <foreignObject x={midX - 78} y={edgeOverlayLayout.calloutY} width="156" height="28">
                                      <button
                                        type="button"
                                        class="flex h-7 w-full items-center justify-center rounded-full border text-center text-[10px] font-bold uppercase tracking-[0.06em] transition hover:brightness-[0.98]"
                                        style={edgeCalloutStyle}
                                        onClick={() => focusBranchCallout(edge.id, edge.target)}
                                        title={`Focus branch ${edge.condition_label ?? `${edge.source} to ${edge.target}`}`}
                                      >
                                        {edgeCallout?.text}
                                      </button>
                                    </foreignObject>
                                  </Show>
                                  <Show when={edgePolicyDelta}>
                                    <foreignObject x={midX - 52} y={edgeOverlayLayout.deltaY} width="104" height="24">
                                      <button
                                        type="button"
                                        class="flex h-6 w-full items-center justify-center rounded-full border border-sky-200/70 bg-white/92 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-sky-700 transition hover:bg-white"
                                        onClick={() => reviewEdgePolicyDelta()}
                                        title="Review branch policy delta"
                                      >
                                        delta
                                      </button>
                                    </foreignObject>
                                  </Show>
                                </>
                              )}
                            </Show>
                          );
                        }}</For>
                      </svg>
                      <For each={graphNodes}>{(node) => {
                        const runPresentationState = workflowNodeRunPresentationState({
                          activeRun,
                          deploymentPolicyById: nodeDeploymentPolicyById,
                          liveRunConnected,
                          node,
                          nodePolicyDeltas,
                          pendingPolicyById: nodePendingDeploymentPolicyById,
                          protectedNodeIds: nodeProtectedIds,
                          runNodeOverlays,
                          runStatuses,
                          runStepOrder,
                          selectedRunId,
                        });
                        const {
                          canvasCallout,
                          deploymentPolicy,
                          deploymentVisual,
                          liveNodeAccent,
                          liveNodeOverlay,
                          liveReason,
                          nodeProtected,
                          nodeStatus,
                          pendingChanges,
                          pendingPolicy,
                          reviewNodePolicyDelta,
                          runNodePolicyDelta,
                          runNodePolicyDeltaSummaryText,
                          stepOrder,
                        } = runPresentationState;
                        const compiledReviewState = compiledNodeCanvasReviewState({
                          graphEdges,
                          nodeId: node.id,
                          nodeReviewState,
                        });
                        const {
                          afpFilterOverlayClass,
                          afpFilterOverlayLabel,
                          compiledAfpContract,
                          compiledFocusClass,
                          compiledManifest,
                          compiledManifestNodeId,
                          compiledRuntimeKind,
                          readinessFocusChipClass,
                          showCompiledAfpGapFocus,
                          showCompiledAfpReadinessFocus,
                          showCompiledInspectorOnlyFocus,
                          showCompiledLinkedManifestFocus,
                          showCompiledOrchestrationRoleFocus,
                          showCompiledRouteReviewFocus,
                        } = compiledReviewState;
                        const nodeComment = nodeCommentById[node.id];
                        const nodeRunCount = nodeRunCountById.get(node.id);
                        const successRate = nodeSuccessRateById.get(node.id);
                        const nodePresentationState = workflowCanvasNodeCardPresentationState({
                          activeGotoNodeId,
                          activeMatchingNodeIds,
                          activeNodeErrorIds,
                          activeNodeId,
                          activeShowIdleNodes,
                          collapsedNodeIds,
                          compiledFocusClass,
                          dependencyHighlightedNodeId,
                          downstreamNodeIds,
                          dragGhostNodeId,
                          liveNodeAccent,
                          node,
                          nodeProtected,
                          nodeStatus,
                          successRate,
                          upstreamNodeIds,
                        });
                        const {
                          nodeKindIconLarge,
                          nodeKindIconSmall,
                          protectionLabel,
                          triggerFamilyBadge,
                          triggerFamilyBadgeClass,
                          isNodeCollapsed,
                        } = nodePresentationState;
                        // 18i - collapse: show compact chip when collapsed, full card otherwise
                        if (isNodeCollapsed) {
                          return (
                            <div
                              role="button"
                              tabindex={0}
                              aria-label={`Expand ${node.label ?? node.id}`}
                              class="absolute flex items-center gap-1 rounded-full border border-white/30 bg-white/50 px-3 py-1.5 shadow-sm text-[11px] font-medium text-on-surface cursor-pointer select-none"
                              style={canvasNodePositionStyle(node.position)}
                              onDblClick={() => expandCanvasNode(node.id)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  expandCanvasNode(node.id);
                                }
                              }}
                            >
                              <span class="text-sm">{nodeKindIconLarge}</span>
                              <span>{node.label ?? node.id}</span>
                            </div>
                          );
                        }
                        const {
                          isDownstream,
                          isUpstream,
                          nodeButtonClass,
                        } = nodePresentationState;
                        // 30o - drag ghost: show origin marker when this node is being dragged
                        const {
                          isDraggingThisNode,
                          nodeButtonStyle,
                        } = nodePresentationState;
                        return <div class="absolute" style={canvasNodePositionStyle(node.position)} onMouseEnter={() => setHighlightedNodeId(node.id)} onMouseLeave={() => setHighlightedNodeId(null)}>
                          {/* 30o - drag ghost: faint origin marker shown while dragging */}
                          <Show when={isDraggingThisNode}>
                            <div class="pointer-events-none absolute inset-0 rounded-[22px] border-2 border-dashed border-primary/40 opacity-50 drag-ghost-origin" aria-hidden="true" />
                          </Show>
                          <div role="button" tabindex={0} aria-label={`Inspect ${node.label}`} data-magic-action="inspect" data-magic-label="Inspect node" data-magic-icon="IN" data-magic-alt-action="comment" data-magic-alt-label="Comment" data-magic-alt-icon="NT" data-magic-id={node.id} onDblClick={() => collapseCanvasNode(node.id)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); openNodeCommentEditor(node.id); }} class={nodeButtonClass} style={nodeButtonStyle} onClick={() => selectCanvasNode(node.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectCanvasNode(node.id); } }} onPointerDown={(event) => startDrag(event, node.id)}><div class="flex items-center justify-between gap-2"><p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">{nodeKindIconLarge} {node.kind}</p><Show when={triggerFamilyBadge}><span class={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${triggerFamilyBadgeClass}`}>{triggerFamilyBadge}</span></Show><div class="flex items-center gap-2"><Show when={stepOrder}><span class="rounded-full bg-white/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">step {stepOrder}</span></Show><Show when={nodeStatus}><span class="rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">{nodeStatus}</span></Show><Show when={liveNodeOverlay}><span class="rounded-full border border-sky-200/70 bg-sky-50/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700">live</span></Show></div></div><p class="mt-1 text-sm font-semibold text-on-surface"><span class="mr-1 text-[12px]" style={{ "font-style": "normal" }}>{nodeKindIconSmall}</span>{node.label}</p><Show when={liveReason}><p class="mt-2 rounded-2xl border border-sky-200/70 bg-sky-50/80 px-3 py-2 text-[11px] font-medium leading-5 text-sky-900">{liveReason}</p></Show><Show when={compiledManifest}><div class="mt-2 flex flex-wrap gap-1"><span role="button" tabindex={0} class={`${NODE_CARD_CHIP_HOVER_CLASS} ${compiledAfpContract.chipClass}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); openCompiledRuntimeContract(node.id, compiledManifestNodeId); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); openCompiledRuntimeContract(node.id, compiledManifestNodeId); } }} title="Open this node's compiled runtime contract">{compiledAfpContract.category === "orchestration_scaffold" ? "AFP scaffold" : compiledAfpContract.label}</span><Show when={compiledRuntimeKind}><span class={NODE_CARD_WHITE_CHIP_CLASS}>{compiledRuntimeKind}</span></Show></div></Show><Show when={afpFilterOverlayLabel}><div class="mt-2 flex flex-wrap gap-1"><span class={`${NODE_CARD_CHIP_BASE_CLASS} ${afpFilterOverlayClass}`}>{afpFilterOverlayLabel}</span><Show when={showCompiledLinkedManifestFocus}><span class={NODE_CARD_SKY_CHIP_CLASS}>{compiledLinkageStatusLabel("manifest_linked")}</span></Show><Show when={showCompiledInspectorOnlyFocus}><span class={`${NODE_CARD_CHIP_BASE_CLASS} border-amber-200/70 bg-white/85 text-amber-700`}>{compiledLinkageStatusLabel("manifest_only")}</span></Show><Show when={showCompiledOrchestrationRoleFocus}><span class={`${NODE_CARD_CHIP_BASE_CLASS} border-cyan-200/70 bg-white/85 text-cyan-700`}>Orchestration role focus</span></Show><Show when={showCompiledAfpReadinessFocus}><span class={`${NODE_CARD_CHIP_BASE_CLASS} bg-white/85 ${readinessFocusChipClass}`}>AFP readiness focus</span></Show><Show when={showCompiledAfpGapFocus}><span class={`${NODE_CARD_CHIP_BASE_CLASS} border-violet-200/70 bg-white/85 text-violet-700`}>AFP gap focus</span></Show><Show when={showCompiledRouteReviewFocus}><span class={`${NODE_CARD_CHIP_BASE_CLASS} border-emerald-200/70 bg-white/85 text-emerald-700`}>Route review focus</span></Show></div></Show><Show when={deploymentPolicy && deploymentVisual}><div class="mt-2 flex flex-wrap gap-1"><span class={`${NODE_CARD_CHIP_BASE_CLASS} ${deploymentVisual?.chipClass}`}>{deploymentVisual?.label}</span><Show when={deploymentPolicy?.fields.provider_route}><span class={NODE_CARD_WHITE_CHIP_CLASS}>route {deploymentPolicy?.fields.provider_route}</span></Show><Show when={pendingChanges.length > 0}><span class={NODE_CARD_AMBER_CHIP_CLASS}>{pendingChanges.length} pending</span></Show></div></Show><Show when={!deploymentPolicy && pendingPolicy}><div class="mt-2 flex flex-wrap gap-1"><span class={NODE_CARD_AMBER_CHIP_CLASS}>pending deploy</span><Show when={pendingPolicy?.fields.provider_route}><span class={NODE_CARD_WHITE_CHIP_CLASS}>route {pendingPolicy?.fields.provider_route}</span></Show></div></Show><Show when={runNodePolicyDelta}><div class="mt-2 rounded-2xl border border-sky-200/70 bg-sky-50/80 px-3 py-2"><div class="flex flex-wrap gap-1"><span class={NODE_CARD_SKY_CHIP_CLASS}>{runNodePolicyDelta?.source === "replay_policy_delta" ? "replay delta" : "policy delta"}</span><span class={NODE_CARD_SKY_CHIP_CLASS}>{runNodePolicyDelta?.changes.length} field{runNodePolicyDelta?.changes.length === 1 ? "" : "s"}</span></div><Show when={runNodePolicyDeltaSummaryText}><p class="mt-1 text-[11px] font-medium text-sky-900">{runNodePolicyDeltaSummaryText}</p></Show><span role="button" tabindex={0} class={`mt-2 inline-flex ${NODE_CARD_SKY_CHIP_CLASS} transition hover:bg-white`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); reviewNodePolicyDelta(); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); reviewNodePolicyDelta(); } }} title="Open matching run review and deployment snapshot">review delta</span></div></Show><Show when={canvasCallout}><p class={`mt-2 line-clamp-3 rounded-2xl border px-3 py-2 text-[11px] font-medium leading-5 ${canvasCallout?.className}`}>{canvasCallout?.text}</p></Show><Show when={node.description}><p class="mt-1 line-clamp-2 text-xs leading-5 text-on-surface-variant">{node.description}</p></Show><Show when={node.config.preset_kind}><p class="mt-1 text-xs text-sky-700">{String(node.config.preset_kind)}</p></Show><Show when={typeof node.metadata.semantic_node_kind === "string"}><p class="mt-1 text-[11px] uppercase tracking-[0.14em] text-violet-700">{titleCase(String(node.metadata.semantic_node_kind))}</p></Show><Show when={typeof node.metadata.template_slot === "string"}><p class="mt-1 text-[11px] uppercase tracking-[0.14em] text-violet-700">{String(node.metadata.template_slot)}</p></Show><Show when={protectionLabel}><p class="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-800">{protectionLabel}</p></Show><div class="mt-3 flex flex-wrap gap-1"><For each={node.hidden_runtime_nodes.slice(0, 3)}>{(runtimeKind) => <span class="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-600">{runtimeKind}</span>}</For></div>
                            {/* 20i - dependency direction label */}
                            <Show when={isUpstream}>
                              <span class="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-blue-100 border border-blue-300/60 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 pointer-events-none">UP</span>
                            </Show>
                            <Show when={isDownstream}>
                              <span class="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-green-100 border border-green-300/60 px-1.5 py-0.5 text-[9px] font-bold text-green-700 pointer-events-none">DN</span>
                            </Show>

                            <Show when={nodeRunCount}>
                              <span
                                class="absolute -bottom-2.5 left-3 z-10 rounded-full bg-slate-600/75 px-1.5 py-[1px] font-mono text-[8px] font-semibold text-white/85 pointer-events-none shadow-sm"
                                            title={`Executed in ${nodeRunCount}r`}
                              >
                                {nodeRunCount}r
                              </span>
                            </Show>
                            {/* 19i - comment chip anchored to top-right of node card */}
                            <Show when={nodeComment}>
                              <button
                                type="button"
                                title={nodeComment}
                                aria-label="Open node comment"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={(event) => { event.stopPropagation(); openNodeCommentEditor(node.id); }}
                                class="absolute -top-2 -right-2 z-10 flex h-5 min-w-[1.5rem] items-center justify-center rounded-full bg-amber-100 border border-amber-200/60 px-1 text-[9px] font-semibold shadow-sm">
                                Note
                              </button>
                            </Show>
                          </div>
                          {/* 19i - comment edit popover */}
                          <Show when={editingCommentNodeId() === node.id}>
                            <div class="absolute top-full left-0 z-20 mt-1 w-56 rounded-xl border border-amber-200/60 bg-amber-50/90 p-3 shadow-lg backdrop-blur space-y-2">
                              <TiptapEditor
                                mode="compact"
                                appearance="minimal"
                                showToolbar={false}
                                showFooter={false}
                                enableSlashCommands={false}
                                submitShortcut="none"
                                initialContent={commentDraft()}
                                placeholder="Node comment..."
                                class="w-full"
                                contentClass="min-h-[4.5rem] rounded-lg border border-amber-200/50 bg-white/70 px-2 py-1.5 text-[11px] text-on-surface"
                                onReady={(handle) => queueMicrotask(() => handle.focus())}
                                onChange={(text) => setCommentDraft(text)}
                                onKeyDown={(event) => {
                                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                                    event.preventDefault();
                                    saveNodeCommentDraft(node.id);
                                    return true;
                                  }
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    setEditingCommentNodeId(null);
                                    return true;
                                  }
                                  return false;
                                }}
                                onSend={async () => {}}
                                clearOnSend={false}
                              />
                              <div class="flex gap-1.5">
                                <button type="button"
                                  onClick={() => saveNodeCommentDraft(node.id)}
                                  class="flex-1 rounded-lg bg-amber-600 py-1 text-[10px] font-semibold text-white">Save</button>
                                <button type="button" onClick={() => setEditingCommentNodeId(null)}
                                  class="rounded-lg border border-amber-200/50 px-2 py-1 text-[10px] text-amber-700">Close</button>
                              </div>
                            </div>
                          </Show>
                        </div>;
                      }}</For>
                      </div>{/* end 19k zoom wrapper */}
                    </div>
                    {renderSectionViews(frameMountView.interactiveOverlaySections)}
                        </>
                      ))}
                    </>
              );
            }}
          </Show>
        </div>

  );
}
