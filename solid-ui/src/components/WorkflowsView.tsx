import { For, Show, Suspense, createEffect, createMemo, createResource, createSignal, lazy, onCleanup, onMount } from "solid-js";
import { WorkflowsCtx } from "@/components/graph/WorkflowsContext";
import { WorkflowsComposerPanel } from "@/components/WorkflowsComposerPanel";
import { WorkflowsCanvas } from "@/components/WorkflowsCanvas";
import { WorkflowsInspector } from "@/components/WorkflowsInspector";
import {
  apiFetch,
  compileWorkflow,
  decideWorkflowWaitResume,
  describeWorkflow,
  getWorkflow,
  getWorkflowConnectorAdapters,
  listWorkflowWaitResumeRecords,
  listWorkflowDeployments,
  listWorkflowRuns,
  listWorkflowTriggerRegistrations,
  listWorkflows,
  openRunStream,
  patchWorkflow,
  runWorkflowAction,
  saveWorkflow,
  startWorkflowRun,
  updateWorkflowTriggerRegistrationStatus,
  validateWorkflow,
  type WorkflowConnectorOverrideFields,
  type WorkflowConnectorOverrides,
  type WorkflowDeployment,
  type WorkflowRun,
  type WorkflowWaitResumeRecord,
  type SavedWorkflow,
  type WorkflowValidationResponse,
} from "@/lib/api";
import {
  expandWorkflowIntent,
  presetDefaultTriggerConfig,
  presetStarterBlueprintsForPreset,
  suggestWorkflowTitleFromIntent,
  templateForPreset,
  type PresetNodeKind,
  type PresetStarterBlueprint,
} from "../../../typescript-sdk/src/workflows";
import {
  BRANCH_PRESETS,
  DEFAULT_DEPLOYMENT_OVERRIDE_DRAFT,
  PRESETS,
  PRIMITIVES,
  type CompiledAfpGapFilter,
  type CompiledAfpReadinessFocus,
  type CompiledOrchestrationRole,
  type DeploymentOverrideDraft,
  type DeploymentPolicyDiffEntry,
  type EdgeExecutionState,
  type NodeDeploymentPolicy,
  type NodeDeploymentPolicyChange,
  type PendingNodeDeploymentPolicy,
  type RunTimelineFilterMode,
  type TargetedDeploymentOverrideDraft,
  type WorkflowEdgeDraft,
  type WorkflowGraphDraft,
  type WorkflowNodeDraft,
} from "@/lib/workflowGraphTypes";
import {
  branchExecutionLogEntries,
  compactExecutionLogEntries,
  edgeExecutionVisual,
  edgeLine,
  formatTimelineStamp,
  runEdgeCanvasCallout,
  runEdgeStates,
  runNodeStatuses,
  runStepOrder,
  runTimelineSliceForEdge,
  workflowExecutionExplanationChip,
  workflowExecutionExplanationText,
  timelineFilterSummaryLabel,
  timelineStepAction,
  timelineStepHasDeploymentContext,
  timelineStepHasReplayDrift,
  timelineStepMatchesFilter,
  timelineStepNarrative,
  timelineStepNodeId,
  timelineStepTrace,
  timelineTraceEvents,
  truncateCanvasLabel,
} from "@/lib/workflowRunAnalysis";
import {
  compiledAfpGapDescription,
  compiledAfpGapLabel,
  compiledManifestAfpContract,
  compiledManifestAfpGapKinds,
  compiledManifestOrchestrationRole,
  compactOverrideDraft,
  deploymentChangeSummary,
  deploymentChangeSummaryEntries,
  deploymentChangeSummaryFieldChangesForNode,
  deploymentNodePoliciesForEnvironment,
  deploymentOverrideDraftForEnvironment,
  deploymentOverrideSummary,
  deploymentPolicyChanges,
  deploymentPolicyDiff,
  deploymentPolicyDiffEntryForNode,
  deploymentPolicyVisual,
  latestDeploymentForEnvironment,
  mergeOverrideFields,
  nodeDeploymentPolicyFromDeployment,
  pendingDeploymentPolicyForNode,
  replayComparisonSummary,
  runEdgePolicyDeltaSummary,
  runNodePolicyDeltaSummary,
  runPolicyDriftSummary,
  workflowNodeIntegrationFamily,
} from "@/lib/workflowDeploymentHelpers";
import {
  WORKFLOW_BRANCH_FAMILY_COLLAPSE_STORAGE_KEY,
  WORKFLOW_RUN_HISTORY_REVIEW_STORAGE_KEY,
  WORKFLOW_TAGS_KEY,
  WORKFLOW_SHARED_REVIEW_LINK_STORAGE_KEY,
  SEMANTIC_STARTERS,
  TEMPLATE_SCAFFOLD_STEPS,
  SUGGESTED_TEMPLATE_RUNTIME_LINEAGE,
  parseWorkflowFamilyContext,
  triggerFamilyFromKind,
  triggerProvenanceChipClass,
  parseReviewUrlStateFromSearch,
  branchScaffoldBlueprint,
  workflowApprovalDecisionForOption,
  presetTemplateId,
  presetStarterBlueprints,
  cloneJson,
  makeId,
  titleCase,
  nodeKindIcon,
  runtimeHints,
  defaultPolicy,
  defaultConfig,
  normalizeGraph,
  makeNewWorkflow,
  semanticStarterById,
  templateScaffoldSteps,
  suggestedTemplateRuntimeLineage,
  nodeSemanticRole,
  scaffoldNodeFromTemplateStep,
  summary,
  formatDurationMs,
  runStatusChipClass,
  runStatusSummary,
  waitResumeStatusChipClass,
  waitResumeStatusLabel,
  waitResumeFamilyLabel,
  runTimelineWaitChainSummary,
  runNodeCanvasCallout,
  liveRunEventStatus,
  liveEdgeStateForNodeStatus,
  liveRunAccentClass,
  generatedCoreSummary,
  regenerationPreservationEstimate,
  estimatedGeneratedCoreForIntent,
  describeHistoryEntries,
  branchOriginRecord,
  workflowGraphMetadata,
  workflowFamilyAssetRecord,
  workflowFamilyInstanceRecord,
  inferredWorkflowFamilyParameterSchema,
  defaultWorkflowFamilyParameters,
  branchFamilyWorkflows,
  orderedWorkflowsForRail,
  isBranchChildWorkflow,
  branchFamilyRootId,
  nodeRegenerationLocked,
  nodeRegenerationScope,
  protectedNodeIdsForGraph,
  protectedEdgeIdsForGraph,
  unavailableReviewTargetMessage,
  availableReviewTargetMessage,
  clearReviewFocusMessage,
  broadenOrchestrationRoleRouteReviewMessage,
  clearOverlappingRouteNarrowingMessage,
  overlappingOrchestrationRouteSummaryMessage,
  clearOrchestrationRoleFocusMessage,
  orchestrationRoleRailGuideMessage,
  orchestrationRoleOutsideFocusMessage,
  orchestrationRoleFocusTargetLabel,
  focusOrchestrationRoleReviewMessage,
  focusOrchestrationRouteReviewMessage,
  focusRouteLinkageReviewMessage,
  clearRouteReviewFilterMessage,
  resetRouteReviewStatesLabel,
  clearAfpReadinessFocusMessage,
  afpReadinessFocusTitle,
  afpReadinessFocusSummary,
  compiledManifestMatchesAfpReadinessFocus,
  compiledManifestEmptyStateMessage,
  compiledRouteEmptyStateMessage,
  recoveryReviewTargetMessage,
  compiledLinkageStatusLabel,
  WorkflowPaneFallback,
  TagInput,
  type RunHistoryDriftFilter,
  type RunHistorySortMode,
  type PersistedRunReviewContext,
  type PersistedStoredSharedReviewUiContext,
  type LiveRunStreamEvent,
  type WorkflowFamilyContext,
  type LiveRunNodeOverlay,
  type ReviewUrlState,
  type StoredSharedReviewLink,
  type SemanticStarterDefinition,
  type TemplateScaffoldStep,
  type SuggestedTemplateRuntimeLineage,
  type WorkflowFamilyParameterField,
  type WorkflowFamilyParameterFieldDraft,
  type DescribeHistoryEntry,
} from "@/components/graph";

const WorkflowRailCard = lazy(() =>
  import("@/components/WorkflowRailCard").then((m) => ({ default: m.WorkflowRailCard })),
);
const WorkflowStoredSharedReviewControls = lazy(() =>
  import("@/components/WorkflowStoredSharedReviewControls").then((m) => ({
    default: m.WorkflowStoredSharedReviewControls,
  })),
);


export function WorkflowsView(props: { onWorkflowPresenceChange?: (present: boolean) => void } = {}) {
  const [selectedWorkflowId, setSelectedWorkflowId] = createSignal<string | null>(null);
  const [currentWorkflow, setCurrentWorkflow] = createSignal<SavedWorkflow | null>(null);
  const [selectedNodeId, setSelectedNodeId] = createSignal<string | null>(null);
  const [selectedInspectorSection, setSelectedInspectorSection] = createSignal<"compiled_runtime_contract" | null>(null);
  const [selectedInspectorFocusSource, setSelectedInspectorFocusSource] = createSignal<"canvas_afp_badge" | "compiled_manifest" | "compiled_route" | null>(null);
  const [selectedInspectorFocusTarget, setSelectedInspectorFocusTarget] = createSignal<string | null>(null);
  const [selectedCompiledAfpFilter, setSelectedCompiledAfpFilter] = createSignal<"capability_boundary" | "decision_boundary" | "summary_boundary" | "orchestration_scaffold" | null>(null);
  const [selectedCompiledAfpGapFilter, setSelectedCompiledAfpGapFilter] = createSignal<CompiledAfpGapFilter | null>(null);
  const [selectedCompiledAfpReadinessFocus, setSelectedCompiledAfpReadinessFocus] = createSignal<CompiledAfpReadinessFocus | null>(null);
  const [selectedCompiledOrchestrationRole, setSelectedCompiledOrchestrationRole] = createSignal<CompiledOrchestrationRole | null>(null);
  const [selectedCompiledAfpRouteFocus, setSelectedCompiledAfpRouteFocus] = createSignal<"full" | "partial" | null>(null);
  const [selectedCompiledManifestLinkageFilter, setSelectedCompiledManifestLinkageFilter] = createSignal<"linked" | "inspector_only" | null>(null);
  const [selectedCompiledRouteLinkageFilter, setSelectedCompiledRouteLinkageFilter] = createSignal<"linked" | "manifest_only" | null>(null);
  const [selectedRunId, setSelectedRunId] = createSignal<string | null>(null);
  const [selectedRunEdgeId, setSelectedRunEdgeId] = createSignal<string | null>(null);
  const [editingEdgeLabelId, setEditingEdgeLabelId] = createSignal<string | null>(null);
  const [editingEdgeLabelValue, setEditingEdgeLabelValue] = createSignal("");
  const [workflowIntent, setWorkflowIntent] = createSignal("");
  const [intentPresetOverride, setIntentPresetOverride] = createSignal<PresetNodeKind | "">("");
  const [intentOptimizationOverride, setIntentOptimizationOverride] = createSignal<"balanced" | "speed" | "cost" | "">("");
  const [regenerationMode, setRegenerationMode] = createSignal<"rebuild" | "preserve_manual">("preserve_manual");
  const [selectedDescribeHistoryEventId, setSelectedDescribeHistoryEventId] = createSignal<string | null>(null);
  const [collapsedBranchFamilies, setCollapsedBranchFamilies] = createSignal<Set<string>>(new Set());
  // 18i Ã¢â‚¬â€ node collapse on double-click
  const [collapsedNodes, setCollapsedNodes] = createSignal<Set<string>>(new Set());
  // 18k Ã¢â‚¬â€ workflow tags (persisted in localStorage)
  const [workflowTags, setWorkflowTags] = createSignal<Record<string, string[]>>((() => {
    try {
      const raw = localStorage.getItem(WORKFLOW_TAGS_KEY);
      return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    } catch { return {}; }
  })());
  const [tagFilter, setTagFilter] = createSignal("");
  const [feedback, setFeedback] = createSignal("");
  const [busyAction, setBusyAction] = createSignal<string | null>(null);
  const [liveRefreshUntil, setLiveRefreshUntil] = createSignal(0);
  const [validationResult, setValidationResult] = createSignal<WorkflowValidationResponse | null>(null);
  const [familyParameterDrafts, setFamilyParameterDrafts] = createSignal<Record<string, string>>({});
  const [deploymentHistory, setDeploymentHistory] = createSignal<WorkflowDeployment[]>([]);
  const [rollbackPreviewDeploymentId, setRollbackPreviewDeploymentId] = createSignal<string | null>(null);
  const [selectedDeploymentRecordId, setSelectedDeploymentRecordId] = createSignal<string | null>(null);
  const [deployPreviewOpen, setDeployPreviewOpen] = createSignal(false);
  const [replayPreviewRunId, setReplayPreviewRunId] = createSignal<string | null>(null);
  const [runTimelineFilterMode, setRunTimelineFilterMode] = createSignal<RunTimelineFilterMode>("all");
  const [runTimelineFocusNodeId, setRunTimelineFocusNodeId] = createSignal<string | null>(null);
  const [runHistoryDriftFilter, setRunHistoryDriftFilter] = createSignal<RunHistoryDriftFilter>("all");
  const [runHistorySortMode, setRunHistorySortMode] = createSignal<RunHistorySortMode>("recent");
  const [runHistoryFamilyFilter, setRunHistoryFamilyFilter] = createSignal("all");
  const [runHistoryAssetFilter, setRunHistoryAssetFilter] = createSignal("all");
  const [runHistoryInstanceFilter, setRunHistoryInstanceFilter] = createSignal("all");
  const [persistedRunSelections, setPersistedRunSelections] = createSignal<Record<string, string>>({});
  const [persistedRunReviewContexts, setPersistedRunReviewContexts] = createSignal<Record<string, PersistedRunReviewContext>>({});
  const [persistedSharedReviewLinks, setPersistedSharedReviewLinks] = createSignal<Record<string, StoredSharedReviewLink[]>>({});
  const [persistedStoredSharedReviewUiContexts, setPersistedStoredSharedReviewUiContexts] = createSignal<Record<string, PersistedStoredSharedReviewUiContext>>({});
  const [selectedStoredSharedReviewId, setSelectedStoredSharedReviewId] = createSignal<string | null>(null);
  const [showAllStoredSharedReviews, setShowAllStoredSharedReviews] = createSignal(false);
  const [storedSharedReviewFilter, setStoredSharedReviewFilter] = createSignal("");
  const [storedSharedReviewSortMode, setStoredSharedReviewSortMode] = createSignal<"priority" | "recent">("priority");
  const [storedSharedReviewShareModeFilter, setStoredSharedReviewShareModeFilter] = createSignal<"all" | "workspace" | "core">("all");
  const [storedSharedReviewPinnedOnly, setStoredSharedReviewPinnedOnly] = createSignal(false);
  const [restoringRunReviewContext, setRestoringRunReviewContext] = createSignal(false);
  const [pendingUrlReviewState, setPendingUrlReviewState] = createSignal<ReviewUrlState | null>(null);
  const [sharedReviewBannerVisible, setSharedReviewBannerVisible] = createSignal(false);
  const [deployOverrideDraft, setDeployOverrideDraft] = createSignal<DeploymentOverrideDraft>(
    deploymentOverrideDraftForEnvironment("dev"),
  );
  const [deployFamilyOverrides, setDeployFamilyOverrides] = createSignal<Record<string, TargetedDeploymentOverrideDraft>>({});
  const [deployNodeOverrides, setDeployNodeOverrides] = createSignal<Record<string, TargetedDeploymentOverrideDraft>>({});
  const [runHistory, setRunHistory] = createSignal<WorkflowRun[]>([]);
  const [selectedRunWaitResumeRecords, setSelectedRunWaitResumeRecords] = createSignal<WorkflowWaitResumeRecord[]>([]);
  const [selectedRunWaitResumeLoading, setSelectedRunWaitResumeLoading] = createSignal(false);
  const [selectedRunWaitResumeError, setSelectedRunWaitResumeError] = createSignal<string | null>(null);
  const [liveRunStreamEvents, setLiveRunStreamEvents] = createSignal<LiveRunStreamEvent[]>([]);
  const [liveRunStreamConnected, setLiveRunStreamConnected] = createSignal(false);
  const [configText, setConfigText] = createSignal("{}");
  const [policyText, setPolicyText] = createSignal("{}");
  const [edgeSource, setEdgeSource] = createSignal("");
  const [edgeTarget, setEdgeTarget] = createSignal("");
  const [edgeConditionLabel, setEdgeConditionLabel] = createSignal("");
  const [connectorAdapters, setConnectorAdapters] = createSignal<Record<string, unknown>>({});
  const [triggerRegistrations, setTriggerRegistrations] = createSignal<Record<string, unknown>[]>([]);
  const [triggerRegistrationsLoading, setTriggerRegistrationsLoading] = createSignal(false);
  const [showMinimap, setShowMinimap] = createSignal(true);
  const [ctxMenu, setCtxMenu] = createSignal<{ nodeId: string; x: number; y: number } | null>(null);
  // 19i Ã¢â‚¬â€ node comment annotation
  const NODE_COMMENTS_KEY = "omnyid.node-comments";
  const [nodeComments, setNodeComments] = createSignal<Record<string, string>>((() => {
    try { return JSON.parse(localStorage.getItem(NODE_COMMENTS_KEY) ?? "{}") as Record<string, string>; } catch { return {}; }
  })());
  const [editingCommentNodeId, setEditingCommentNodeId] = createSignal<string | null>(null);
  const [commentDraft, setCommentDraft] = createSignal("");
  // 19j Ã¢â‚¬â€ workflow run replay
  const [replayingRunId, setReplayingRunId] = createSignal<string | null>(null);
  // 19k Ã¢â‚¬â€ canvas zoom
  const [zoom, setZoom] = createSignal(1);
  // 20i Ã¢â‚¬â€ node dependency visualiser
  const [highlightedNodeId, setHighlightedNodeId] = createSignal<string | null>(null);
  // 20j Ã¢â‚¬â€ workflow version history
  const WORKFLOW_HAS_RUN_KEY = "omnyid.workflow.has-run";
  const [workflowHasRun, setWorkflowHasRun] = createSignal<Set<string>>(
    (() => { try { return new Set<string>(JSON.parse(localStorage.getItem(WORKFLOW_HAS_RUN_KEY) ?? "[]")); } catch { return new Set<string>(); } })()
  );
  const WORKFLOW_RUN_STATS_KEY = "omnyid.workflow.run-stats";
  const [workflowRunStats, setWorkflowRunStats] = createSignal<Record<string, { ok: number; fail: number }>>(
    (() => { try { return JSON.parse(localStorage.getItem(WORKFLOW_RUN_STATS_KEY) ?? "{}"); } catch { return {}; } })()
  );
  function markWorkflowRun(workflowId: string) {
    if (workflowHasRun().has(workflowId)) return;
    const next = new Set(workflowHasRun());
    next.add(workflowId);
    localStorage.setItem(WORKFLOW_HAS_RUN_KEY, JSON.stringify([...next]));
    setWorkflowHasRun(next);
  }
  createEffect(() => {
    const wfId = currentWorkflow()?.workflow_id;
    const runs = runHistory();
    if (!wfId || runs.length === 0) return;
    let ok = 0; let fail = 0;
    for (const r of runs) {
      const s = r.status;
      if (s === "completed" || s === "success" || s === "done") ok++;
      else if (s === "failed" || s === "error" || s === "cancelled") fail++;
    }
    if (ok + fail === 0) return;
    setWorkflowRunStats((prev) => {
      const next = { ...prev, [wfId]: { ok, fail } };
      try { localStorage.setItem(WORKFLOW_RUN_STATS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  });
  const WORKFLOW_VERSIONS_KEY = "omnyid.workflow-versions";
  const [workflowVersions, setWorkflowVersions] = createSignal<Record<string, Array<{nodes: unknown[]; ts: string}>>>((() => { try { return JSON.parse(localStorage.getItem(WORKFLOW_VERSIONS_KEY) ?? "{}"); } catch { return {}; } })());
  const [showVersionsId, setShowVersionsId] = createSignal<string | null>(null);
  // 20k Ã¢â‚¬â€ idle node detector
  const [showIdleNodes, setShowIdleNodes] = createSignal(false);
  // 21k Ã¢â‚¬â€ node run timer
  const [nowMs, setNowMs] = createSignal(Date.now());
  // 22h Ã¢â‚¬â€ node search/filter
  const [nodeSearchQuery, setNodeSearchQuery] = createSignal("");
  // 22i Ã¢â‚¬â€ workflow clone
  const [clonedId, setClonedId] = createSignal<string | null>(null);
  const canvasRefHolder = { current: null as HTMLDivElement | null };
  const dragStateHolder = { current: null as { nodeId: string; offsetX: number; offsetY: number } | null };
  // 30d Ã¢â‚¬â€ Anomaly pulse: tracks node IDs with recent error runs (persisted per workflow session)
  const [nodeErrorIds, setNodeErrorIds] = createSignal<Set<string>>(new Set());
  // 30g Ã¢â‚¬â€ Jump-to-node: target node ID from command bar
  const [gotoNodeId, setGotoNodeId] = createSignal<string | null>(null);
  // 30l Ã¢â‚¬â€ Execution trace replay
  const [replayActive, setReplayActive] = createSignal(false);
  const [replayStepIdx, setReplayStepIdx] = createSignal(0);
  let replayInterval: ReturnType<typeof setInterval> | null = null;
  // 30o Ã¢â‚¬â€ Node drag ghost: tracks origin position while dragging
  const [dragGhostOrigin, setDragGhostOrigin] = createSignal<{ x: number; y: number; nodeId: string } | null>(null);
  // 30t Ã¢â‚¬â€ Version diff: tracks which two snapshot indices to diff
  const [versionDiffIds, setVersionDiffIds] = createSignal<[number, number] | null>(null);
  const graph = () => {
    const workflow = currentWorkflow();
    return workflow ? normalizeGraph(workflow) : null;
  };

  const minimapBounds = createMemo(() => {
    const nodes = graph()?.nodes ?? [];
    if (nodes.length < 2) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + 180);
      maxY = Math.max(maxY, n.position.y + 80);
    }
    return { minX, minY, maxX, maxY, nodes };
  });

  // 20i Ã¢â‚¬â€ upstream/downstream dependency memos
  const upstreamOf = createMemo(() => {
    const id = highlightedNodeId();
    if (!id) return new Set<string>();
    const edges = graph()?.edges ?? [];
    const up = new Set<string>();
    function walkUp(nodeId: string) {
      for (const e of edges) { if (e.target === nodeId && !up.has(e.source)) { up.add(e.source); walkUp(e.source); } }
    }
    walkUp(id);
    return up;
  });
  const downstreamOf = createMemo(() => {
    const id = highlightedNodeId();
    if (!id) return new Set<string>();
    const edges = graph()?.edges ?? [];
    const down = new Set<string>();
    function walkDown(nodeId: string) {
      for (const e of edges) { if (e.source === nodeId && !down.has(e.target)) { down.add(e.target); walkDown(e.target); } }
    }
    walkDown(id);
    return down;
  });

  // 22h Ã¢â‚¬â€ matching node ids memo for search/filter
  const matchingNodeIds = createMemo<Set<string> | null>(() => {
    const query = nodeSearchQuery().trim().toLowerCase();
    if (!query) return null;
    const nodes = graph()?.nodes ?? [];
    const matched = new Set<string>();
    for (const node of nodes) {
      if (
        node.id.toLowerCase().includes(query) ||
        node.label.toLowerCase().includes(query) ||
        node.kind.toLowerCase().includes(query)
      ) {
        matched.add(node.id);
      }
    }
    return matched;
  });

  // 22i Ã¢â‚¬â€ clone workflow
  async function cloneWorkflow(workflowId: string) {
    try {
      await apiFetch<unknown>("/ui/command", {
        method: "POST",
        bodyJson: { intent: "clone_workflow", workflow_id: workflowId },
      });
      void refetch();
      setClonedId(workflowId);
      setTimeout(() => setClonedId(null), 2000);
    } catch (error) {
      setFeedback(`Could not clone workflow: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 21m Ã¢â‚¬â€ export workflow as JSON
  function exportWorkflowJson(workflowId: string) {
    const nodes = graph()?.nodes ?? [];
    const edges = graph()?.edges ?? [];
    const data = {
      workflow_id: workflowId,
      exported_at: new Date().toISOString(),
      nodes: nodes.map(n => ({ id: n.id, kind: (n as any).kind, label: (n as any).label, x: (n as any).position?.x, y: (n as any).position?.y })),
      edges: edges.map((e: any) => ({ source: e.source ?? e.from, target: e.target ?? e.to })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workflow-${workflowId.slice(0, 20)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 20j Ã¢â‚¬â€ snapshot version function
  function snapshotVersion(workflowId: string) {
    setWorkflowVersions(prev => {
      const existing = prev[workflowId] ?? [];
      const updated = [{ nodes: graph()?.nodes ?? [], ts: new Date().toISOString() }, ...existing].slice(0, 10);
      const next = { ...prev, [workflowId]: updated };
      try { localStorage.setItem(WORKFLOW_VERSIONS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // 20k Ã¢â‚¬â€ idle nodes memo
  const idleNodes = createMemo(() => (graph()?.nodes ?? []).filter(n => {
    const kind = n.kind ?? "";
    return kind === "idle" || kind === "failed" || kind === "never_executed";
  }));

  const workflowRunEta = createMemo(() => {
    const runs = runHistory();
    const completed = runs.filter((r) => r.result?.status === "completed" && typeof r.result?.duration_ms === "number");
    if (completed.length === 0) return null;
    const meanMs = completed.reduce((sum, r) => sum + (r.result!.duration_ms as number), 0) / completed.length;
    if (meanMs < 1000) return "<1s";
    if (meanMs < 60000) return `~${Math.round(meanMs / 1000)}s`;
    return `~${Math.round(meanMs / 60000)}m`;
  });

  // 21k Ã¢â‚¬â€ elapsed label helper for node run timer
  function elapsedLabel(startedAt: string | undefined): string | null {
    if (!startedAt) return null;
    const elapsed = Math.floor((nowMs() - new Date(startedAt).getTime()) / 1000);
    if (elapsed < 0) return null;
    if (elapsed < 60) return `${elapsed}s`;
    return `${Math.floor(elapsed / 60)}m${elapsed % 60}s`;
  }

  const nodeSuccessRates = createMemo(() => {
    const rates = new Map<string, number>();
    const runs = runHistory();
    if (runs.length === 0) return rates;
    const totals = new Map<string, number>();
    const successes = new Map<string, number>();
    for (const run of runs) {
      if (!Array.isArray(run.timeline)) continue;
      for (const step of run.timeline as Array<{ node_id?: unknown; status?: unknown }>) {
        const nid = typeof step.node_id === "string" ? step.node_id : null;
        if (!nid) continue;
        totals.set(nid, (totals.get(nid) ?? 0) + 1);
        if (step.status === "completed") successes.set(nid, (successes.get(nid) ?? 0) + 1);
      }
    }
    for (const [nid, total] of totals) {
      rates.set(nid, (successes.get(nid) ?? 0) / total);
    }
    return rates;
  });

  const [workflows, { mutate, refetch }] = createResource(async () => {
    const response = await listWorkflows(false, 50);
    return response.workflows;
  });
  createEffect(() => {
    const hasWorkflow = Boolean(currentWorkflow()) || (workflows()?.length ?? 0) > 0;
    props.onWorkflowPresenceChange?.(hasWorkflow);
  });

  const selectedNode = () => {
    const draft = graph();
    const nodeId = selectedNodeId();
    return draft?.nodes.find((node) => node.id === nodeId) ?? null;
  };

  const selectedRun = () => {
    const runId = selectedRunId();
    return runHistory().find((run) => run.run_id === runId) ?? runHistory()[0] ?? null;
  };
  const selectedRunWaitResumeSummary = createMemo(() => {
    const records = selectedRunWaitResumeRecords();
    let pending = 0;
    let activeFollowup = 0;
    let resolved = 0;
    for (const record of records) {
      if (record.status === "pending" || record.status === "wake_dispatched") pending += 1;
      else if (record.status === "continued_to_new_wait") activeFollowup += 1;
      else resolved += 1;
    }
    return {
      total: records.length,
      pending,
      activeFollowup,
      resolved,
    };
  });
  const latestRunForDeployment = (deploymentId: string | null | undefined) => {
    if (!deploymentId) return null;
    return runHistory().find((run) => run.deployment_id === deploymentId) ?? null;
  };
  const focusDeploymentRecord = (deploymentId: string | null | undefined) => {
    if (!deploymentId) return;
    setSelectedDeploymentRecordId(deploymentId);
    setDeployPreviewOpen(false);
    const deployment = deploymentHistoryById().get(deploymentId);
    if (deployment) {
      const activeForEnvironment = latestDeploymentForEnvironment(deploymentHistory(), deployment.environment);
      setRollbackPreviewDeploymentId(
        activeForEnvironment && activeForEnvironment.deployment_id !== deploymentId ? deploymentId : null,
      );
    } else {
      setRollbackPreviewDeploymentId(null);
    }
  };
  const focusPolicyDiffReview = (
    nodeId: string,
    filterMode: RunTimelineFilterMode,
    runId?: string | null,
  ) => {
    setSelectedNodeId(nodeId);
    setRunTimelineFocusNodeId(nodeId);
    setRunTimelineFilterMode(filterMode);
    setSelectedRunEdgeId(null);
    if (runId) setSelectedRunId(runId);
  };
  const applyRunReviewContext = (
    context: PersistedRunReviewContext | null,
    draft: WorkflowGraphDraft | null,
    deployments: WorkflowDeployment[],
  ) => {
    setRestoringRunReviewContext(true);
    if (!context) {
      setSelectedRunEdgeId(null);
      setRunTimelineFilterMode("all");
      setRunTimelineFocusNodeId(null);
      setSelectedDeploymentRecordId(null);
      Promise.resolve().then(() => setRestoringRunReviewContext(false));
      return;
    }
    const validNodeId = context.selected_node_id && draft?.nodes.some((node) => node.id === context.selected_node_id)
      ? context.selected_node_id
      : null;
    const validFocusedNodeId = context.focused_node_id && draft?.nodes.some((node) => node.id === context.focused_node_id)
      ? context.focused_node_id
      : null;
    const validEdgeId = context.selected_edge_id && draft?.edges.some((edge) => edge.id === context.selected_edge_id)
      ? context.selected_edge_id
      : null;
    const validDeploymentId = context.selected_deployment_id && deployments.some((deployment) => deployment.deployment_id === context.selected_deployment_id)
      ? context.selected_deployment_id
      : null;

    setSelectedNodeId(validNodeId);
    setSelectedRunEdgeId(validEdgeId);
    setRunTimelineFilterMode(context.timeline_filter ?? "all");
    setRunTimelineFocusNodeId(validFocusedNodeId);
    setSelectedDeploymentRecordId(validDeploymentId);
    Promise.resolve().then(() => setRestoringRunReviewContext(false));
  };
  const restoreRunReviewContextForWorkflow = (
    workflowId: string,
    draft: WorkflowGraphDraft | null,
    deployments: WorkflowDeployment[],
  ) => {
    const urlState = pendingUrlReviewState();
    const usingUrlState = urlState?.workflow_id === workflowId;
    const context = urlState?.workflow_id === workflowId
      ? {
          selected_edge_id: urlState.selected_edge_id,
          timeline_filter: urlState.timeline_filter,
          focused_node_id: urlState.focused_node_id,
          selected_deployment_id: urlState.selected_deployment_id,
          selected_node_id: urlState.selected_node_id,
        }
      : persistedRunReviewContexts()[workflowId] ?? null;
    applyRunReviewContext(context, draft, deployments);
    if (usingUrlState) {
      const sharedHref = `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
      persistSharedReviewLinkForWorkflow(
        workflowId,
        sharedHref,
        urlState?.selected_review_id
          || urlState?.show_all_saved_reviews
          || !!urlState?.saved_review_filter
          || urlState?.saved_review_sort_mode === "recent"
          ? "workspace"
          : "core",
      );
      setSharedReviewBannerVisible(true);
      setPendingUrlReviewState(null);
    }
  };
  const resetSharedInvestigationView = () => {
    setSharedReviewBannerVisible(false);
    setPendingUrlReviewState(null);
    setReplayPreviewRunId(null);
    setSelectedRunId(null);
    setSelectedRunEdgeId(null);
    setRunTimelineFilterMode("all");
    setRunTimelineFocusNodeId(null);
    setSelectedDeploymentRecordId(null);
    setRollbackPreviewDeploymentId(null);
    setSelectedNodeId(null);
    setRunHistoryDriftFilter("all");
    setRunHistorySortMode("recent");
    setFeedback("Reset the shared investigation view to the default workflow state.");
  };
  function inferStoredSharedReviewShareModeFromHref(href: string): "workspace" | "core" {
    try {
      const parsed = new URL(href, window.location.origin);
      const reviewState = parseReviewUrlStateFromSearch(parsed.search);
      if (
        reviewState?.selected_review_id
        || reviewState?.show_all_saved_reviews
        || !!reviewState?.saved_review_filter
        || reviewState?.saved_review_sort_mode === "recent"
      ) {
        return "workspace";
      }
    } catch {
      // Fall back to the lighter core-review mode if the stored URL cannot be parsed.
    }
    return "core";
  }
  function persistSharedReviewLinkForWorkflow(
    workflowId: string,
    href: string,
    shareMode?: "workspace" | "core",
  ) {
    const savedAt = new Date().toISOString();
    const environment = graph()?.environment === "prod" ? "prod" : "dev";
    const deploymentId =
      selectedDeploymentRecordId()
      ?? selectedRun()?.deployment_id
      ?? activeDeployment()?.deployment_id
      ?? null;
    const resolvedShareMode = shareMode ?? inferStoredSharedReviewShareModeFromHref(href);
    const nextEntryId = makeId("shared_review");
    setPersistedSharedReviewLinks((current) => {
      const previousEntries = current[workflowId] ?? [];
      const existing = previousEntries.find((entry) =>
        entry.href === href
        && entry.environment === environment
        && entry.deployment_id === deploymentId,
      );
      const nextEntry: StoredSharedReviewLink = existing
        ? { ...existing, saved_at: savedAt, share_mode: resolvedShareMode }
        : {
            id: nextEntryId,
            href,
            saved_at: savedAt,
            environment,
            deployment_id: deploymentId,
            share_mode: resolvedShareMode,
            title: null,
            pinned: false,
          };
      const nextEntries = [
        nextEntry,
        ...previousEntries.filter((entry) => entry.id !== nextEntry.id),
      ]
        .sort((left, right) => {
          if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
          return Date.parse(right.saved_at) - Date.parse(left.saved_at);
        })
        .slice(0, 5);
      if (
        previousEntries.length === nextEntries.length
        && previousEntries.every((entry, index) =>
          entry.id === nextEntries[index]?.id
          && entry.saved_at === nextEntries[index]?.saved_at
          && entry.href === nextEntries[index]?.href
          && entry.environment === nextEntries[index]?.environment
          && entry.deployment_id === nextEntries[index]?.deployment_id
          && (entry.share_mode ?? inferStoredSharedReviewShareModeFromHref(entry.href)) === nextEntries[index]?.share_mode
          && entry.title === nextEntries[index]?.title
          && entry.pinned === nextEntries[index]?.pinned
        )
      ) {
        return current;
      }
      return { ...current, [workflowId]: nextEntries };
    });
    setSelectedStoredSharedReviewId(null);
  }
  function updateStoredSharedReviewForWorkflow(
    workflowId: string | null | undefined,
    reviewId: string | null | undefined,
    updater: (record: StoredSharedReviewLink) => StoredSharedReviewLink,
  ) {
    if (!workflowId || !reviewId) return;
    setPersistedSharedReviewLinks((current) => {
      const existing = current[workflowId] ?? [];
      let changed = false;
      const nextEntries = existing
        .map((entry) => {
          if (entry.id !== reviewId) return entry;
          changed = true;
          return updater(entry);
        })
        .sort((left, right) => {
          if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
          return Date.parse(right.saved_at) - Date.parse(left.saved_at);
        });
      if (!changed) return current;
      return { ...current, [workflowId]: nextEntries };
    });
  }
  function clearStoredSharedReviewForWorkflow(workflowId: string | null | undefined, reviewId?: string | null) {
    if (!workflowId) return;
    setPersistedSharedReviewLinks((current) => {
      if (!(workflowId in current)) return current;
      const existing = current[workflowId] ?? [];
      if (!reviewId) {
        const next = { ...current };
        delete next[workflowId];
        return next;
      }
      const remaining = existing.filter((entry) => entry.id !== reviewId);
      if (remaining.length === existing.length) return current;
      const next = { ...current };
      if (remaining.length === 0) delete next[workflowId];
      else next[workflowId] = remaining;
      return next;
    });
  }
  const storedSharedReviewRecordsForCurrentWorkflow = createMemo(() => {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    if (!workflowId) return [] as StoredSharedReviewLink[];
    return (persistedSharedReviewLinks()[workflowId] ?? []).filter((record) => {
      if (!record?.href) return false;
      try {
        const parsed = new URL(record.href, window.location.origin);
        const reviewState = parseReviewUrlStateFromSearch(parsed.search);
        return !reviewState?.workflow_id || reviewState.workflow_id === workflowId;
      } catch {
        return false;
      }
    });
  });
  createEffect(() => {
    const records = storedSharedReviewRecordsForCurrentWorkflow();
    const selectedId = selectedStoredSharedReviewId();
    if (selectedId && records.some((record) => record.id === selectedId)) return;
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    const pendingUrlState = pendingUrlReviewState();
    const urlSelectedId = pendingUrlState?.workflow_id === workflowId ? pendingUrlState.selected_review_id : null;
    if (urlSelectedId && records.some((record) => record.id === urlSelectedId)) {
      setSelectedStoredSharedReviewId(urlSelectedId);
      return;
    }
    const persistedContext = workflowId ? persistedStoredSharedReviewUiContexts()[workflowId] : null;
    const persistedSelectedId = persistedContext?.selected_review_id ?? null;
    if (persistedSelectedId && records.some((record) => record.id === persistedSelectedId)) {
      setSelectedStoredSharedReviewId(persistedSelectedId);
      return;
    }
    setSelectedStoredSharedReviewId(records[0]?.id ?? null);
  });
  createEffect((previousWorkflowId: string | null | undefined) => {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId() ?? null;
    if (workflowId === previousWorkflowId) return workflowId;
    const pendingUrlState = pendingUrlReviewState();
    const urlContext = pendingUrlState?.workflow_id === workflowId
      ? pendingUrlState
      : null;
    const persistedContext = workflowId ? persistedStoredSharedReviewUiContexts()[workflowId] : null;
    setShowAllStoredSharedReviews(urlContext?.show_all_saved_reviews ?? persistedContext?.show_all ?? false);
    setStoredSharedReviewFilter(urlContext?.saved_review_filter ?? persistedContext?.filter_text ?? "");
    setStoredSharedReviewSortMode(urlContext?.saved_review_sort_mode ?? persistedContext?.sort_mode ?? "priority");
    setStoredSharedReviewShareModeFilter(urlContext?.saved_review_share_mode_filter ?? persistedContext?.share_mode_filter ?? "all");
    setStoredSharedReviewPinnedOnly(urlContext?.saved_review_pinned_only ?? persistedContext?.pinned_only ?? false);
    return workflowId;
  });
  createEffect(() => {
    const records = storedSharedReviewRecordsForCurrentWorkflow();
    if (records.length <= 4 && showAllStoredSharedReviews()) {
      setShowAllStoredSharedReviews(false);
    }
  });
  createEffect(() => {
    if (!showAllStoredSharedReviews() && storedSharedReviewFilter()) {
      setStoredSharedReviewFilter("");
    }
  });
  const storedSharedReviewRecordForCurrentWorkflow = createMemo(() => {
    const records = storedSharedReviewRecordsForCurrentWorkflow();
    const selectedId = selectedStoredSharedReviewId();
    return records.find((record) => record.id === selectedId) ?? records[0] ?? null;
  });
  const storedSharedReviewLinkForCurrentWorkflow = createMemo(() => {
    return storedSharedReviewRecordForCurrentWorkflow()?.href ?? null;
  });
  const storedSharedReviewSavedAtLabel = createMemo(() => {
    const savedAt = storedSharedReviewRecordForCurrentWorkflow()?.saved_at;
    if (!savedAt) return null;
    const timestamp = Date.parse(savedAt);
    if (Number.isNaN(timestamp)) return savedAt;
    return new Date(timestamp).toLocaleString();
  });
  const storedSharedReviewTitle = createMemo(() => {
    return storedSharedReviewRecordForCurrentWorkflow()?.title?.trim() || null;
  });
  const storedSharedReviewSummary = createMemo(() => {
    const record = storedSharedReviewRecordForCurrentWorkflow();
    if (!record?.href) return [] as string[];
    try {
      const parsed = new URL(record.href, window.location.origin);
      const reviewState = parseReviewUrlStateFromSearch(parsed.search);
      if (!reviewState) return [] as string[];
      const entries: string[] = [];
      entries.push((record.share_mode ?? inferStoredSharedReviewShareModeFromHref(record.href)) === "workspace"
        ? "workspace snapshot"
        : "core review snapshot");
      if (reviewState.run_id) entries.push(`run ${reviewState.run_id.slice(0, 8)}`);
      if (reviewState.selected_edge_id) entries.push("branch focus");
      if (reviewState.timeline_filter !== "all") entries.push(`timeline ${timelineFilterSummaryLabel(reviewState.timeline_filter)}`);
      if (reviewState.focused_node_id) {
        const focusedNodeLabel = nodeLabelById().get(reviewState.focused_node_id) ?? reviewState.focused_node_id;
        entries.push(`focus ${focusedNodeLabel}`);
      }
      if (reviewState.selected_node_id) {
        const selectedNodeLabel = nodeLabelById().get(reviewState.selected_node_id) ?? reviewState.selected_node_id;
        entries.push(`node ${selectedNodeLabel}`);
      }
      if (reviewState.selected_deployment_id) entries.push(`deployment ${reviewState.selected_deployment_id.slice(0, 8)}`);
      if (reviewState.drift_filter !== "all") entries.push(`history ${reviewState.drift_filter} drift`);
      if (reviewState.sort_mode === "drift_desc") entries.push("sorted by highest drift");
      if (record.environment) entries.push(`env ${record.environment}`);
      if (record.deployment_id) entries.push(`saved dep ${record.deployment_id.slice(0, 8)}`);
      return entries;
    } catch {
      return [] as string[];
    }
  });
  const storedSharedReviewSelectorEntries = createMemo(() => {
    return storedSharedReviewRecordsForCurrentWorkflow().map((record, index) => {
      try {
        const parsed = new URL(record.href, window.location.origin);
        const reviewState = parseReviewUrlStateFromSearch(parsed.search);
        const shareModeLabel = (record.share_mode ?? inferStoredSharedReviewShareModeFromHref(record.href)) === "workspace"
          ? "workspace"
          : "core";
        const labelParts: string[] = [];
        if (reviewState?.run_id) labelParts.push(`run ${reviewState.run_id.slice(0, 6)}`);
        if (record.title?.trim()) {
          return {
            id: record.id,
            label: record.title.trim(),
            pinned: record.pinned,
            share_mode: shareModeLabel,
          };
        }
        if (record.environment) labelParts.push(record.environment);
        if (reviewState?.timeline_filter && reviewState.timeline_filter !== "all") {
          labelParts.push(reviewState.timeline_filter === "deployment_context" ? "deploy" : "replay");
        }
        if (reviewState?.drift_filter && reviewState.drift_filter !== "all") {
          labelParts.push(`${reviewState.drift_filter} drift`);
        }
        if (labelParts.length === 0 && record.deployment_id) {
          labelParts.push(`dep ${record.deployment_id.slice(0, 6)}`);
        }
        return {
          id: record.id,
          label: labelParts.slice(0, 2).join(" - ") || `saved ${index + 1}`,
          pinned: record.pinned,
          share_mode: shareModeLabel,
        };
      } catch {
        return {
          id: record.id,
          label: `saved ${index + 1}`,
          pinned: record.pinned,
          share_mode: "core" as const,
        };
      }
    });
  });
  const selectedStoredSharedReviewSelectorEntry = createMemo(() => {
    const selectedId = selectedStoredSharedReviewId();
    if (!selectedId) return null;
    return storedSharedReviewSelectorEntries().find((entry) => entry.id === selectedId) ?? null;
  });
  const storedSharedReviewShareModeCounts = createMemo(() => {
    const records = storedSharedReviewRecordsForCurrentWorkflow();
    let workspace = 0;
    let core = 0;
    for (const record of records) {
      const shareMode = record.share_mode ?? inferStoredSharedReviewShareModeFromHref(record.href);
      if (shareMode === "workspace") workspace += 1;
      else core += 1;
    }
    return {
      all: records.length,
      workspace,
      core,
    };
  });
  const storedSharedReviewCompositionSummary = createMemo(() => {
    const records = storedSharedReviewRecordsForCurrentWorkflow();
    const pinned = records.filter((record) => record.pinned).length;
    const counts = storedSharedReviewShareModeCounts();
    const entries: Array<{
      key: "all" | "pinned" | "workspace" | "core";
      label: string;
      active: boolean;
    }> = [];
    entries.push({
      key: "all",
      label: `${counts.all} saved`,
      active: storedSharedReviewShareModeFilter() === "all" && !storedSharedReviewFilter().trim() && !storedSharedReviewPinnedOnly(),
    });
    if (pinned > 0) {
      entries.push({
        key: "pinned",
        label: `${pinned} pinned`,
        active: storedSharedReviewPinnedOnly(),
      });
    }
    if (counts.workspace > 0) {
      entries.push({
        key: "workspace",
        label: `${counts.workspace} workspace`,
        active: storedSharedReviewShareModeFilter() === "workspace",
      });
    }
    if (counts.core > 0) {
      entries.push({
        key: "core",
        label: `${counts.core} core`,
        active: storedSharedReviewShareModeFilter() === "core",
      });
    }
    return entries;
  });
  function applyStoredSharedReviewCompositionFocus(key: "all" | "pinned" | "workspace" | "core") {
    setShowAllStoredSharedReviews(true);
    if (key === "all") {
      setStoredSharedReviewPinnedOnly(false);
      setStoredSharedReviewShareModeFilter("all");
      setStoredSharedReviewFilter("");
      return;
    }
    if (key === "pinned") {
      setStoredSharedReviewSortMode("priority");
      setStoredSharedReviewPinnedOnly(true);
      return;
    }
    setStoredSharedReviewPinnedOnly(false);
    setStoredSharedReviewShareModeFilter(key);
  }
  function storedSharedReviewCompositionChipClass(key: "all" | "pinned" | "workspace" | "core", active: boolean) {
    if (key === "all") {
      return active
        ? "border-violet-300 bg-violet-100 text-violet-800"
        : "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white";
    }
    if (key === "pinned") {
      return active
        ? "border-amber-300 bg-amber-100 text-amber-800"
        : "border-amber-200/70 bg-amber-50/85 text-amber-700 hover:bg-amber-100";
    }
    return active
      ? "border-sky-300 bg-sky-100 text-sky-800"
      : "border-sky-200/70 bg-sky-50/85 text-sky-700 hover:bg-sky-100";
  }
  function storedSharedReviewCompositionActionLabel(key: "all" | "pinned" | "workspace" | "core") {
    if (key === "all") return "Show all saved reviews";
    if (key === "pinned") return "Focus pinned saved reviews";
    if (key === "workspace") return "Focus workspace snapshots";
    return "Focus core snapshots";
  }
  function storedSharedReviewShareModeActionLabel(mode: "all" | "workspace" | "core") {
    if (mode === "all") return "Show all saved-review share modes";
    if (mode === "workspace") return "Show only workspace snapshots";
    return "Show only core review snapshots";
  }
  function storedSharedReviewSortActionLabel(mode: "priority" | "recent") {
    if (mode === "priority") return "Sort saved reviews by pinned priority";
    return "Sort saved reviews by most recent first";
  }
  function storedSharedReviewSelectorEntryActionLabel(entry: {
    label: string;
    pinned: boolean;
    share_mode: string;
  }, selected: boolean) {
    const prefix = selected ? "Reopen saved review" : "Open saved review";
    const details = [entry.label];
    if (entry.pinned) details.push("pinned");
    details.push(entry.share_mode === "workspace" ? "workspace snapshot" : "core snapshot");
    return `${prefix}: ${details.join(", ")}`;
  }
  function storedSharedReviewExpandActionLabel(hiddenCount: number) {
    return `Expand saved-review selector to show ${hiddenCount} more snapshots`;
  }
  function storedSharedReviewCollapseActionLabel() {
    return "Collapse the saved-review selector";
  }
  const storedSharedReviewActiveFilters = createMemo(() => {
    const entries: Array<{
      key: "pinned_only" | "share_mode" | "search";
      label: string;
      priority: number;
    }> = [];
    if (storedSharedReviewPinnedOnly()) {
      entries.push({ key: "pinned_only", label: "Pinned only", priority: 0 });
    }
    if (storedSharedReviewShareModeFilter() !== "all") {
      entries.push({
        key: "share_mode",
        label: storedSharedReviewShareModeFilter() === "workspace" ? "Workspace only" : "Core only",
        priority: 1,
      });
    }
    if (storedSharedReviewFilter().trim()) {
      entries.push({
        key: "search",
        label: `Search: ${storedSharedReviewFilter().trim()}`,
        priority: 2,
      });
    }
    return entries.sort((left, right) => left.priority - right.priority);
  });
  const storedSharedReviewHasMultipleActiveFilters = createMemo(() => storedSharedReviewActiveFilters().length > 1);
  const storedSharedReviewPreviewContextSummary = createMemo(() => {
    const entries: Array<{
      key: "expanded" | "pinned_only" | "share_mode" | "search" | "sort_mode";
      label: string;
    }> = [];
    if (showAllStoredSharedReviews()) entries.push({ key: "expanded", label: "expanded selector" });
    if (storedSharedReviewPinnedOnly()) entries.push({ key: "pinned_only", label: "pinned only" });
    if (storedSharedReviewShareModeFilter() !== "all") {
      entries.push({
        key: "share_mode",
        label: storedSharedReviewShareModeFilter() === "workspace" ? "workspace only" : "core only",
      });
    }
    if (storedSharedReviewFilter().trim()) {
      entries.push({ key: "search", label: `search ${storedSharedReviewFilter().trim()}` });
    }
    if (storedSharedReviewSortMode() === "recent") entries.push({ key: "sort_mode", label: "recent sort" });
    return entries;
  });
  const storedSharedReviewHasMultiplePreviewContextEntries = createMemo(
    () => storedSharedReviewPreviewContextSummary().length > 1,
  );
  function clearStoredSharedReviewPreviewContext(key: "expanded" | "pinned_only" | "share_mode" | "search" | "sort_mode") {
    if (key === "expanded") {
      setShowAllStoredSharedReviews(false);
      return;
    }
    if (key === "sort_mode") {
      setStoredSharedReviewSortMode("priority");
      return;
    }
    if (key === "pinned_only" || key === "share_mode" || key === "search") {
      clearStoredSharedReviewActiveFilter(key);
    }
  }
  function resetStoredSharedReviewPreviewContext() {
    setShowAllStoredSharedReviews(false);
    setStoredSharedReviewSortMode("priority");
    resetStoredSharedReviewSelectorNarrowing();
  }
  function storedSharedReviewPreviewContextClass(key: "expanded" | "pinned_only" | "share_mode" | "search" | "sort_mode") {
    if (key === "pinned_only") {
      return "border-amber-200/70 bg-amber-50/85 text-amber-700 hover:bg-amber-100";
    }
    if (key === "share_mode") {
      return "border-sky-200/70 bg-sky-50/85 text-sky-700 hover:bg-sky-100";
    }
    if (key === "search") {
      return "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white";
    }
    return "border-slate-200/70 bg-slate-100/85 text-slate-700 hover:bg-slate-200/80";
  }
  function storedSharedReviewPreviewContextActionLabel(key: "expanded" | "pinned_only" | "share_mode" | "search" | "sort_mode") {
    if (key === "expanded") return "Collapse the saved-review selector";
    if (key === "pinned_only") return "Clear pinned-only focus";
    if (key === "share_mode") return "Clear share-mode focus";
    if (key === "search") return "Clear saved-review search";
    return "Reset saved-review sort to priority";
  }
  function storedSharedReviewActiveFilterClass(key: "pinned_only" | "share_mode" | "search") {
    if (key === "pinned_only") {
      return "border-amber-200/70 bg-amber-50/85 text-amber-700 hover:bg-amber-100";
    }
    if (key === "share_mode") {
      return "border-sky-200/70 bg-sky-50/85 text-sky-700 hover:bg-sky-100";
    }
    return "border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white";
  }
  function storedSharedReviewActiveFilterActionLabel(key: "pinned_only" | "share_mode" | "search") {
    if (key === "pinned_only") return "Clear pinned-only focus";
    if (key === "share_mode") return "Clear share-mode focus";
    return "Clear saved-review search";
  }
  function storedSharedReviewLegendClass(key: "pinned_only" | "share_mode" | "search") {
    return storedSharedReviewActiveFilterClass(key)
      .replace(" hover:bg-amber-100", "")
      .replace(" hover:bg-sky-100", "")
      .replace(" hover:bg-white", "");
  }
  function storedSharedReviewLegendActionLabel(target: "pinned" | "workspace" | "core" | "clear_search" | null) {
    if (target === "pinned") return "Focus pinned saved reviews";
    if (target === "workspace") return "Focus workspace snapshots";
    if (target === "core") return "Focus core snapshots";
    if (target === "clear_search") return "Clear saved-review search";
    return null;
  }
  const storedSharedReviewToneLegendEntries = createMemo(() => {
    const entries: Array<{
      key: "pinned_only" | "share_mode" | "search";
      label: string;
      target: "pinned" | "workspace" | "core" | "clear_search" | null;
    }> = [];
    const records = storedSharedReviewRecordsForCurrentWorkflow();
    const hasPinned = records.some((record) => record.pinned) || storedSharedReviewPinnedOnly();
    const hasShareMode =
      records.some((record) => (record.share_mode ?? inferStoredSharedReviewShareModeFromHref(record.href)) !== "core")
      || storedSharedReviewShareModeFilter() !== "all";
    const hasSearch = !!storedSharedReviewFilter().trim();
    const counts = storedSharedReviewShareModeCounts();
    if (hasPinned) entries.push({ key: "pinned_only", label: "Pinned focus", target: "pinned" });
    if (hasShareMode) {
      const activeShareMode = storedSharedReviewShareModeFilter();
      const target = activeShareMode === "workspace" || activeShareMode === "core"
        ? activeShareMode
        : counts.workspace > 0
          ? "workspace"
          : counts.core > 0
            ? "core"
            : null;
      entries.push({ key: "share_mode", label: "Share mode", target });
    }
    if (hasSearch || entries.length === 0) {
      entries.push({
        key: "search",
        label: "Search or general",
        target: hasSearch ? "clear_search" : null,
      });
    }
    return entries;
  });
  function clearStoredSharedReviewActiveFilter(key: "pinned_only" | "share_mode" | "search") {
    if (key === "pinned_only") {
      setStoredSharedReviewPinnedOnly(false);
      return;
    }
    if (key === "share_mode") {
      setStoredSharedReviewShareModeFilter("all");
      return;
    }
    setStoredSharedReviewFilter("");
  }
  function resetStoredSharedReviewSelectorNarrowing() {
    setStoredSharedReviewPinnedOnly(false);
    setStoredSharedReviewShareModeFilter("all");
    setStoredSharedReviewFilter("");
  }
  const storedSharedReviewEmptyStateLabel = createMemo(() => {
    const shareModeFilter = storedSharedReviewShareModeFilter();
    if (shareModeFilter === "workspace") {
      return "No workspace snapshots match this view. Share or refresh a full workspace investigation link to create one.";
    }
    if (shareModeFilter === "core") {
      return "No core review snapshots match this view. Share a core review link to create one without the saved-review workspace shell.";
    }
    return "No saved reviews match this filter.";
  });
  const storedSharedReviewEmptyStateActions = createMemo(() => {
    const entries: Array<{
      key: "search" | "share_mode" | "pinned_only";
      label: string;
    }> = [];
    if (storedSharedReviewFilter().trim()) {
      entries.push({ key: "search", label: "Clear search" });
    }
    if (storedSharedReviewShareModeFilter() !== "all") {
      entries.push({ key: "share_mode", label: "Show all share modes" });
    }
    if (storedSharedReviewPinnedOnly()) {
      entries.push({ key: "pinned_only", label: "Show all saved reviews" });
    }
    return entries;
  });
  const filteredStoredSharedReviewSelectorEntries = createMemo(() => {
    const filter = storedSharedReviewFilter().trim().toLowerCase();
    const shareModeFilter = storedSharedReviewShareModeFilter();
    const pinnedOnly = storedSharedReviewPinnedOnly();
    const baseEntries = storedSharedReviewSelectorEntries();
    const entries = storedSharedReviewSortMode() === "recent"
      ? [...baseEntries].sort((left, right) => {
          const leftRecord = storedSharedReviewRecordsForCurrentWorkflow().find((record) => record.id === left.id);
          const rightRecord = storedSharedReviewRecordsForCurrentWorkflow().find((record) => record.id === right.id);
          return Date.parse(rightRecord?.saved_at ?? "") - Date.parse(leftRecord?.saved_at ?? "");
        })
      : baseEntries;
    return entries.filter((entry) => {
      const record = storedSharedReviewRecordsForCurrentWorkflow().find((candidate) => candidate.id === entry.id);
      const entryShareMode = record?.share_mode ?? (record?.href ? inferStoredSharedReviewShareModeFromHref(record.href) : "core");
      if (pinnedOnly && !entry.pinned) return false;
      if (shareModeFilter !== "all" && entryShareMode !== shareModeFilter) return false;
      if (!filter) return true;
      return entry.label.toLowerCase().includes(filter);
    });
  });
  const visibleStoredSharedReviewSelectorEntries = createMemo(() => {
    const entries = filteredStoredSharedReviewSelectorEntries();
    return showAllStoredSharedReviews() ? entries : entries.slice(0, 4);
  });
  const groupedStoredSharedReviewSelectorEntries = createMemo(() => {
    const entries = filteredStoredSharedReviewSelectorEntries();
    if (storedSharedReviewSortMode() === "recent") {
      return {
        pinned: [] as typeof entries,
        recent: entries,
      };
    }
    return {
      pinned: entries.filter((entry) => entry.pinned),
      recent: entries.filter((entry) => !entry.pinned),
    };
  });
  const storedSharedReviewStaleness = createMemo(() => {
    const record = storedSharedReviewRecordForCurrentWorkflow();
    if (!record?.saved_at) return null;
    const savedAt = Date.parse(record.saved_at);
    if (Number.isNaN(savedAt)) return null;
    const latestDeploymentTimestamp = deploymentHistory().reduce((latest, deployment) => {
      const next = Date.parse(deployment.deployed_at ?? "");
      return Number.isNaN(next) ? latest : Math.max(latest, next);
    }, 0);
    const latestRunTimestamp = runHistory().reduce((latest, run) => {
      const next = Date.parse(run.started_at ?? "");
      return Number.isNaN(next) ? latest : Math.max(latest, next);
    }, 0);
    const newerDeployment = latestDeploymentTimestamp > savedAt;
    const newerRun = latestRunTimestamp > savedAt;
    if (!newerDeployment && !newerRun) return null;
    const reasons: string[] = [];
    if (newerDeployment) reasons.push("newer deployment");
    if (newerRun) reasons.push("newer run history");
    return {
      reasons,
      label: `stale: ${reasons.join(" and ")}`,
    };
  });
  const storedSharedReviewScopeMismatch = createMemo(() => {
    const record = storedSharedReviewRecordForCurrentWorkflow();
    if (!record) return null;
    const currentEnvironment = graph()?.environment === "prod" ? "prod" : "dev";
    const currentDeploymentId =
      selectedDeploymentRecordId()
      ?? selectedRun()?.deployment_id
      ?? activeDeployment()?.deployment_id
      ?? null;
    const reasons: string[] = [];
    if (record.environment && record.environment !== currentEnvironment) {
      reasons.push(`saved for ${record.environment}`);
    }
    if (record.deployment_id && currentDeploymentId && record.deployment_id !== currentDeploymentId) {
      reasons.push("different deployment");
    }
    if (reasons.length === 0) return null;
    return {
      reasons,
      label: `scope mismatch: ${reasons.join(" and ")}`,
    };
  });
  const storedSharedReviewMatchesCurrentView = createMemo(() => {
    const href = storedSharedReviewLinkForCurrentWorkflow();
    if (!href) return false;
    try {
      const stored = new URL(href, window.location.origin);
      const current = new URL(window.location.href);
      return `${stored.pathname}${stored.search}${stored.hash}` === `${current.pathname}${current.search}${current.hash}`;
    } catch {
      return false;
    }
  });
  const applyReviewUrlNavigationState = (urlState: ReviewUrlState | null) => {
    if (!urlState) {
      setSharedReviewBannerVisible(false);
      setPendingUrlReviewState(null);
      setReplayPreviewRunId(null);
      setRollbackPreviewDeploymentId(null);
      setSelectedRunEdgeId(null);
      setRunTimelineFilterMode("all");
      setRunTimelineFocusNodeId(null);
      setSelectedDeploymentRecordId(null);
      setSelectedNodeId(null);
      setRunHistoryDriftFilter("all");
      setRunHistorySortMode("recent");
      const workflowId = currentWorkflow()?.workflow_id;
      const persistedRunId = workflowId ? persistedRunSelections()[workflowId] : null;
      setSelectedRunId(
        persistedRunId && runHistory().some((run) => run.run_id === persistedRunId)
          ? persistedRunId
          : runHistory()[0]?.run_id ?? null,
      );
      return;
    }

    setRunHistoryDriftFilter(urlState.drift_filter);
    setRunHistorySortMode(urlState.sort_mode);
    setReplayPreviewRunId(null);
    setRollbackPreviewDeploymentId(null);

    const currentWorkflowId = currentWorkflow()?.workflow_id;
    if (urlState.workflow_id && urlState.workflow_id !== currentWorkflowId) {
      setPendingUrlReviewState(urlState);
      void loadWorkflow(urlState.workflow_id);
      return;
    }

    setPendingUrlReviewState(urlState);
    const nextRunId = urlState.run_id;
    setSelectedRunId(
      nextRunId && runHistory().some((run) => run.run_id === nextRunId)
        ? nextRunId
        : runHistory()[0]?.run_id ?? null,
    );
    setSelectedStoredSharedReviewId(urlState.selected_review_id);
    setShowAllStoredSharedReviews(urlState.show_all_saved_reviews);
    setStoredSharedReviewFilter(urlState.saved_review_filter);
    setStoredSharedReviewSortMode(urlState.saved_review_sort_mode);
    applyRunReviewContext(
      {
        selected_edge_id: urlState.selected_edge_id,
        timeline_filter: urlState.timeline_filter,
        focused_node_id: urlState.focused_node_id,
        selected_deployment_id: urlState.selected_deployment_id,
        selected_node_id: urlState.selected_node_id,
      },
      graph(),
      deploymentHistory(),
    );
    setSharedReviewBannerVisible(true);
    setPendingUrlReviewState(null);
  };
  createEffect(() => {
    selectedRunId();
    if (restoringRunReviewContext()) return;
    setRunTimelineFilterMode("all");
    setRunTimelineFocusNodeId(null);
  });
  const activeDeployment = createMemo(() => {
    const environment = graph()?.environment === "prod" ? "prod" : "dev";
    return latestDeploymentForEnvironment(deploymentHistory(), environment);
  });
  const nodeDeploymentPolicies = createMemo(() => {
    const environment = graph()?.environment === "prod" ? "prod" : "dev";
    const deployment = activeDeployment();
    const draft = graph();
    const policies = new Map<string, NodeDeploymentPolicy>();
    if (!draft) return policies;
    for (const node of draft.nodes) {
      const policy = nodeDeploymentPolicyFromDeployment(node, deployment, environment);
      if (policy) policies.set(node.id, policy);
    }
    return policies;
  });
  const pendingNodeDeploymentPolicies = createMemo(() => {
    const environment = graph()?.environment === "prod" ? "prod" : "dev";
    const draft = graph();
    const policies = new Map<string, PendingNodeDeploymentPolicy>();
    if (!draft) return policies;
    for (const node of draft.nodes) {
      const policy = pendingDeploymentPolicyForNode(
        node,
        environment,
        deployOverrideDraft(),
        deployFamilyOverrides(),
        deployNodeOverrides(),
      );
      if (policy) policies.set(node.id, policy);
    }
    return policies;
  });
  const pendingDeploymentChangeSummary = createMemo(() => {
    const draft = graph();
    if (!draft) return { changedNodeCount: 0, pendingNodeCount: 0 };
    let changedNodeCount = 0;
    let pendingNodeCount = 0;
    for (const node of draft.nodes) {
      const pendingPolicy = pendingNodeDeploymentPolicies().get(node.id);
      if (!pendingPolicy) continue;
      pendingNodeCount += 1;
      const deployedPolicy = nodeDeploymentPolicies().get(node.id);
      if (deploymentPolicyChanges(deployedPolicy?.fields, pendingPolicy.fields).length > 0) {
        changedNodeCount += 1;
      }
    }
    return { changedNodeCount, pendingNodeCount };
  });
  const deployPreviewDiff = createMemo(() => {
    const draft = graph();
    if (!draft) return [] as Array<{ nodeId: string; label: string; changes: NodeDeploymentPolicyChange[] }>;
    const entries: Array<{ nodeId: string; label: string; changes: NodeDeploymentPolicyChange[] }> = [];
    for (const node of draft.nodes) {
      const pendingPolicy = pendingNodeDeploymentPolicies().get(node.id);
      if (!pendingPolicy) continue;
      const deployedPolicy = nodeDeploymentPolicies().get(node.id);
      const changes = deploymentPolicyChanges(deployedPolicy?.fields, pendingPolicy.fields);
      if (changes.length > 0) {
        entries.push({
          nodeId: node.id,
          label: node.label,
          changes,
        });
      }
    }
    return entries;
  });
  const deploymentHistoryById = createMemo(() => {
    const entries = new Map<string, WorkflowDeployment>();
    for (const deployment of deploymentHistory()) {
      entries.set(deployment.deployment_id, deployment);
    }
    return entries;
  });
  const nodeLabelById = createMemo(() => {
    const labels = new Map<string, string>();
    const draft = graph();
    if (!draft) return labels;
    for (const node of draft.nodes) {
      labels.set(node.id, node.label);
    }
    return labels;
  });
  const selectedRunEdge = () => {
    const draft = graph();
    const edgeId = selectedRunEdgeId();
    return draft?.edges.find((edge) => edge.id === edgeId) ?? null;
  };
  const currentSavedReviewWorkspaceActive = createMemo(() => {
    return !!selectedStoredSharedReviewSelectorEntry()
      || showAllStoredSharedReviews()
      || !!storedSharedReviewFilter().trim()
      || storedSharedReviewSortMode() === "recent";
  });
  const sharedReviewBannerSummary = createMemo(() => {
    if (!sharedReviewBannerVisible()) return [] as string[];
    const entries: string[] = [];
    const workflow = currentWorkflow();
    const run = selectedRun();
    const edge = selectedRunEdge();
    const focusedNodeLabel = runTimelineFocusNodeId()
      ? nodeLabelById().get(runTimelineFocusNodeId()!) ?? runTimelineFocusNodeId()
      : null;
    const selectedNodeLabel = selectedNodeId()
      ? nodeLabelById().get(selectedNodeId()!) ?? selectedNodeId()
      : null;
    const deployment = selectedDeploymentRecordId()
      ? deploymentHistoryById().get(selectedDeploymentRecordId()!) ?? null
      : null;

    if (workflow) entries.push(`workflow ${workflow.title}`);
    if (run) entries.push(`run ${run.run_id.slice(0, 8)}`);
    if (edge) entries.push(`branch ${edge.condition_label?.trim() || `${edge.source} -> ${edge.target}`}`);
    if (runTimelineFilterMode() !== "all") entries.push(`timeline ${timelineFilterSummaryLabel(runTimelineFilterMode())}`);
    if (focusedNodeLabel) entries.push(`focus ${focusedNodeLabel}`);
    if (selectedNodeLabel) entries.push(`node ${selectedNodeLabel}`);
    if (deployment) entries.push(`deployment ${deployment.environment}:${deployment.deployment_id.slice(0, 8)}`);
    if (runHistoryDriftFilter() !== "all") entries.push(`history ${runHistoryDriftFilter()} drift`);
    if (runHistorySortMode() === "drift_desc") entries.push("sorted by highest drift");
    const selectedSavedReview = selectedStoredSharedReviewSelectorEntry();
    if (selectedSavedReview) entries.push(`saved review ${selectedSavedReview.label}`);
    if (showAllStoredSharedReviews()) entries.push("saved reviews expanded");
    if (storedSharedReviewFilter().trim()) entries.push(`saved review filter ${storedSharedReviewFilter().trim()}`);
    if (storedSharedReviewSortMode() === "recent") entries.push("saved reviews sorted by recent");
    if (storedSharedReviewShareModeFilter() !== "all") entries.push(`saved reviews ${storedSharedReviewShareModeFilter()} only`);
    if (storedSharedReviewPinnedOnly()) entries.push("saved reviews pinned only");
    return entries;
  });
  const intentExpansion = () => {
    const intent = workflowIntent().trim();
    if (!intent) return null;
    const base = expandWorkflowIntent(intent);
    return {
      ...base,
      preset_kind: intentPresetOverride() || base.preset_kind,
      optimization_mode: intentOptimizationOverride() || base.optimization_mode,
    };
  };
  const regenerationImpact = () => {
    if (!workflowIntent().trim() || !currentWorkflow()) return null;
    return regenerationImpactSummary();
  };
  const selectedDescribeHistoryEntry = () => {
    const workflow = currentWorkflow();
    const eventId = selectedDescribeHistoryEventId();
    if (!workflow || !eventId) return null;
    return describeHistoryEntries(normalizeGraph(workflow)).find((entry) => entry.event_id === eventId) ?? null;
  };
  const describeHistoryComparison = () => {
    const workflow = currentWorkflow();
    const entry = selectedDescribeHistoryEntry();
    if (!workflow || !entry) return null;
    const draft = normalizeGraph(workflow);
    const currentIntent =
      workflowIntent().trim() ||
      (typeof draft.metadata["source_intent"] === "string" ? String(draft.metadata["source_intent"]) : "") ||
      (workflow.description ?? "").trim();
    const currentPreset =
      (intentPresetOverride() || (typeof draft.metadata["inferred_preset"] === "string" ? String(draft.metadata["inferred_preset"]) : "")) || "";
    const currentOptimization =
      (intentOptimizationOverride() || (typeof draft.optimization_mode === "string" ? draft.optimization_mode : "balanced")) || "balanced";
    const currentRegeneration = regenerationMode();
    const currentCore = generatedCoreSummary(draft);
    const preservation = regenerationPreservationEstimate(draft, currentRegeneration);
    const estimatedEntryCore = estimatedGeneratedCoreForIntent(
      entry.intent,
      (entry.preset_kind as PresetNodeKind | undefined) ?? "",
    );
    return {
      intentChanged: currentIntent.trim() !== entry.intent.trim(),
      presetChanged: Boolean(entry.preset_kind) && currentPreset !== (entry.preset_kind ?? ""),
      optimizationChanged: Boolean(entry.optimization_mode) && currentOptimization !== (entry.optimization_mode ?? ""),
      regenerationChanged: Boolean(entry.regeneration_mode) && currentRegeneration !== (entry.regeneration_mode ?? "preserve_manual"),
      currentNodeCount: draft.nodes.length,
      currentEdgeCount: draft.edges.length,
      currentGeneratedNodeCount: currentCore.generatedNodeCount,
      currentGeneratedEdgeCount: currentCore.generatedEdgeCount,
      protectedNodeCount: currentCore.protectedNodeCount,
      protectedEdgeCount: currentCore.protectedEdgeCount,
      estimatedGeneratedNodeCount: estimatedEntryCore.estimatedNodeCount,
      estimatedGeneratedEdgeCount: estimatedEntryCore.estimatedEdgeCount,
      estimatedPresetKind: estimatedEntryCore.presetKind,
      estimatedNeedsApproval: estimatedEntryCore.requiresApproval,
      estimatedNeedsBranching: estimatedEntryCore.needsBranching,
      estimatedNeedsResearchSupport: estimatedEntryCore.needsResearchSupport,
      preservedManualNodeCount: preservation.preservedManualNodeCount,
      preservedManualEdgeCount: preservation.preservedManualEdgeCount,
      preservedProtectedNodeCount: preservation.preservedProtectedNodeCount,
      preservedProtectedEdgeCount: preservation.preservedProtectedEdgeCount,
    };
  };
  const persistedSelectedRunStatuses = createMemo(() => runNodeStatuses(selectedRun()));
  const persistedSelectedRunStepOrder = createMemo(() => runStepOrder(selectedRun()));
  const persistedSelectedRunEdgeStates = createMemo(() => runEdgeStates(graph(), selectedRun()));
  const liveRunNodeOverlays = createMemo(() => {
    const overlays = new Map<string, LiveRunNodeOverlay>();
    for (const event of liveRunStreamEvents()) {
      const nodeId = typeof event.node_id === "string" && event.node_id.trim() ? event.node_id.trim() : null;
      if (!nodeId) continue;
      const status = liveRunEventStatus(event);
      if (!status) continue;
      const current = overlays.get(nodeId);
      overlays.set(nodeId, {
        status,
        stepOrder: typeof event.index === "number" ? event.index + 1 : current?.stepOrder ?? null,
        phase: typeof event.phase === "string" ? event.phase : current?.phase ?? null,
        checkpoint: typeof event.outcome_checkpoint === "string" ? event.outcome_checkpoint : current?.checkpoint ?? null,
        reason: typeof event.reason === "string" ? event.reason : current?.reason ?? null,
      });
    }
    return overlays;
  });
  const selectedRunStatuses = createMemo(() => {
    const merged = new Map(persistedSelectedRunStatuses());
    for (const [nodeId, overlay] of liveRunNodeOverlays()) merged.set(nodeId, overlay.status);
    return merged;
  });
  const selectedRunStepOrder = createMemo(() => {
    const merged = new Map(persistedSelectedRunStepOrder());
    for (const [nodeId, overlay] of liveRunNodeOverlays()) {
      if (typeof overlay.stepOrder === "number" && Number.isFinite(overlay.stepOrder)) {
        merged.set(nodeId, overlay.stepOrder);
      }
    }
    return merged;
  });
  const selectedRunEdgeStates = createMemo(() => {
    const merged = new Map(persistedSelectedRunEdgeStates());
    const draft = graph();
    if (!draft) return merged;
    const orderedNodes = [...liveRunNodeOverlays().entries()]
      .map(([nodeId, overlay]) => ({
        nodeId,
        status: overlay.status,
        stepOrder: overlay.stepOrder,
      }))
      .filter((entry): entry is { nodeId: string; status: string; stepOrder: number } => typeof entry.stepOrder === "number")
      .sort((left, right) => left.stepOrder - right.stepOrder);
    for (let index = 0; index < orderedNodes.length - 1; index += 1) {
      const current = orderedNodes[index];
      const next = orderedNodes[index + 1];
      const edge = draft.edges.find((candidate) => candidate.source === current.nodeId && candidate.target === next.nodeId);
      if (!edge) continue;
      const state = liveEdgeStateForNodeStatus(next.status);
      if (state) merged.set(edge.id, state);
    }
    return merged;
  });
  const selectedRunEdgeTimeline = () => runTimelineSliceForEdge(graph(), selectedRun(), selectedRunEdgeId());
  const selectedRunNodePolicyDeltas = createMemo(() => {
    const run = selectedRun();
    const draft = graph();
    const deltas = new Map<string, { source: string; changes: NodeDeploymentPolicyChange[]; deploymentId: string | null }>();
    if (!run || !draft) return deltas;
    const deploymentLookup = deploymentHistoryById();
    for (const node of draft.nodes) {
      const delta = runNodePolicyDeltaSummary(run, deploymentLookup, node.id);
      if (delta) deltas.set(node.id, delta);
    }
    return deltas;
  });
  const selectedRunEdgePolicyDeltas = createMemo(() => {
    const run = selectedRun();
    const draft = graph();
    const deltas = new Map<string, { nodeId: string; relation: "from" | "to" | "related"; source: string; changes: NodeDeploymentPolicyChange[]; deploymentId: string | null }>();
    if (!run || !draft) return deltas;
    const deploymentLookup = deploymentHistoryById();
    for (const edge of draft.edges) {
      const delta = runEdgePolicyDeltaSummary(draft, run, deploymentLookup, edge.id);
      if (delta) deltas.set(edge.id, delta);
    }
    return deltas;
  });
  const runHistoryEntries = createMemo(() => {
    const draft = graph();
    const deploymentLookup = deploymentHistoryById();
    const filterMode = runHistoryDriftFilter();
    const sortMode = runHistorySortMode();
    const familyFilter = runHistoryFamilyFilter();
    const assetFilter = runHistoryAssetFilter();
    const instanceFilter = runHistoryInstanceFilter();
    const entries = runHistory().map((run) => {
      const drift = runPolicyDriftSummary(draft, run, deploymentLookup);
      const deploymentImpact = drift.deploymentNodeCount + drift.deploymentEdgeCount;
      const replayImpact = drift.replayNodeCount + drift.replayEdgeCount;
      const totalImpact = deploymentImpact + replayImpact;
      const lineage = parseWorkflowFamilyContext(run.result?.workflow_family_context);
      return {
        run,
        drift,
        deploymentImpact,
        replayImpact,
        totalImpact,
        lineage,
      };
    }).filter((entry) => {
      if (familyFilter !== "all" && entry.lineage?.familyId !== familyFilter) return false;
      if (assetFilter !== "all" && entry.lineage?.familyAssetWorkflowId !== assetFilter) return false;
      if (instanceFilter !== "all" && entry.lineage?.instanceWorkflowId !== instanceFilter) return false;
      switch (filterMode) {
        case "deployment":
          return entry.deploymentImpact > 0;
        case "replay":
          return entry.replayImpact > 0;
        case "any":
          return entry.totalImpact > 0;
        case "all":
        default:
          return true;
      }
    });

    entries.sort((left, right) => {
      if (sortMode === "drift_desc") {
        const impactDelta = right.totalImpact - left.totalImpact;
        if (impactDelta !== 0) return impactDelta;
      }
      return Date.parse(right.run.started_at ?? "") - Date.parse(left.run.started_at ?? "");
    });
    return entries;
  });
  const runHistoryLineageOptions = createMemo(() => {
    const familyIds = new Set<string>();
    const assetWorkflowIds = new Set<string>();
    const instanceWorkflowIds = new Set<string>();
    for (const run of runHistory()) {
      const lineage = parseWorkflowFamilyContext(run.result?.workflow_family_context);
      if (lineage?.familyId) familyIds.add(lineage.familyId);
      if (lineage?.familyAssetWorkflowId) assetWorkflowIds.add(lineage.familyAssetWorkflowId);
      if (lineage?.instanceWorkflowId) instanceWorkflowIds.add(lineage.instanceWorkflowId);
    }
    return {
      familyIds: [...familyIds].sort(),
      assetWorkflowIds: [...assetWorkflowIds].sort(),
      instanceWorkflowIds: [...instanceWorkflowIds].sort(),
    };
  });
  const workflowInteractionLocked = () =>
    ["compile", "deploy", "run", "dry_run", "replay", "rollback"].includes(busyAction() ?? "");
  const workflowExecutionRefreshing = () =>
    ["deploy", "run", "dry_run", "replay", "rollback"].includes(busyAction() ?? "") || liveRefreshUntil() > Date.now();
  const workflowInteractionLockLabel = () => {
    const action = busyAction();
    switch (action) {
      case "compile":
        return "Compiling workflow IR";
      case "deploy":
        return "Deploying workflow";
      case "run":
        return "Running workflow";
      case "dry_run":
        return "Simulating workflow";
      case "replay":
        return "Replaying workflow";
      case "rollback":
        return "Rolling back deployment";
      default:
        return "Workflow locked";
    }
  };

  createEffect(() => {
    const available = workflows();
    if (!available?.length || currentWorkflow()) return;
    const preferredWorkflowId = pendingUrlReviewState()?.workflow_id;
    const nextWorkflowId = preferredWorkflowId && available.some((workflow) => workflow.workflow_id === preferredWorkflowId)
      ? preferredWorkflowId
      : available[0].workflow_id;
    void loadWorkflow(nextWorkflowId);
  });

  createEffect(() => {
    const draft = graph();
    const selectedEdgeId = selectedRunEdgeId();
    if (!selectedEdgeId) return;
    if (!draft?.edges.some((edge) => edge.id === selectedEdgeId)) {
      setSelectedRunEdgeId(null);
    }
  });

  createEffect((previousRunId: string | null | undefined) => {
    const runId = selectedRun()?.run_id ?? null;
    if (!restoringRunReviewContext() && previousRunId !== undefined && runId !== previousRunId) {
      setSelectedRunEdgeId(null);
    }
    return runId;
  });

  createEffect(() => {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    const runId = selectedRun()?.run_id ?? selectedRunId();
    if (!workflowId || !runId) {
      setSelectedRunWaitResumeRecords([]);
      setSelectedRunWaitResumeError(null);
      setSelectedRunWaitResumeLoading(false);
      return;
    }
    void refreshSelectedRunWaitResumeRecords(workflowId, runId);
  });

  createEffect(() => {
    const node = selectedNode();
    setConfigText(JSON.stringify(node?.config ?? {}, null, 2));
    setPolicyText(JSON.stringify(node?.policy ?? {}, null, 2));
  });

  createEffect(() => {
    const available = workflows() ?? [];
    if (!available.length) return;
    const validFamilyIds = new Set(available.map((workflow) => branchFamilyRootId(workflow)));
    const current = collapsedBranchFamilies();
    const next = new Set([...current].filter((familyId) => validFamilyIds.has(familyId)));
    if (next.size !== current.size) {
      setCollapsedBranchFamilies(next);
    }
  });

  createEffect(() => {
    const workflowId = selectedWorkflowId();
    const available = workflows() ?? [];
    if (!workflowId || !available.length) return;
    const selected = available.find((workflow) => workflow.workflow_id === workflowId);
    if (!selected) return;
    const familyRootId = branchFamilyRootId(selected);
    if (!collapsedBranchFamilies().has(familyRootId)) return;
    setCollapsedBranchFamilies((current) => {
      if (!current.has(familyRootId)) return current;
      const next = new Set(current);
      next.delete(familyRootId);
      return next;
    });
  });

  createEffect(() => {
    const collapsed = [...collapsedBranchFamilies()];
    try {
      window.localStorage.setItem(
        WORKFLOW_BRANCH_FAMILY_COLLAPSE_STORAGE_KEY,
        JSON.stringify(collapsed),
      );
    } catch {
      // Ignore local persistence failures and keep the in-memory session state.
    }
  });

  createEffect(() => {
    const workflowId = currentWorkflow()?.workflow_id;
    const runId = selectedRunId();
    if (!workflowId || !runId) return;
    setPersistedRunSelections((current) => current[workflowId] === runId ? current : { ...current, [workflowId]: runId });
  });

  createEffect(() => {
    const workflowId = currentWorkflow()?.workflow_id;
    if (!workflowId) return;
    const nextContext: PersistedRunReviewContext = {
      selected_edge_id: selectedRunEdgeId(),
      timeline_filter: runTimelineFilterMode(),
      focused_node_id: runTimelineFocusNodeId(),
      selected_deployment_id: selectedDeploymentRecordId(),
      selected_node_id: selectedNodeId(),
    };
    setPersistedRunReviewContexts((current) => {
      const previous = current[workflowId];
      if (previous
        && previous.selected_edge_id === nextContext.selected_edge_id
        && previous.timeline_filter === nextContext.timeline_filter
        && previous.focused_node_id === nextContext.focused_node_id
        && previous.selected_deployment_id === nextContext.selected_deployment_id
        && previous.selected_node_id === nextContext.selected_node_id) {
        return current;
      }
      return { ...current, [workflowId]: nextContext };
    });
  });

  createEffect(() => {
    const workflowId = currentWorkflow()?.workflow_id;
    if (!workflowId) return;
    const nextContext: PersistedStoredSharedReviewUiContext = {
      selected_review_id: selectedStoredSharedReviewId(),
      show_all: showAllStoredSharedReviews(),
      filter_text: storedSharedReviewFilter(),
      sort_mode: storedSharedReviewSortMode(),
      share_mode_filter: storedSharedReviewShareModeFilter(),
      pinned_only: storedSharedReviewPinnedOnly(),
    };
    setPersistedStoredSharedReviewUiContexts((current) => {
      const previous = current[workflowId];
      if (previous
        && previous.selected_review_id === nextContext.selected_review_id
        && previous.show_all === nextContext.show_all
        && previous.filter_text === nextContext.filter_text
        && previous.sort_mode === nextContext.sort_mode
        && previous.share_mode_filter === nextContext.share_mode_filter
        && previous.pinned_only === nextContext.pinned_only) {
        return current;
      }
      return { ...current, [workflowId]: nextContext };
    });
  });

  createEffect(() => {
    const reviewState = {
      drift_filter: runHistoryDriftFilter(),
      sort_mode: runHistorySortMode(),
      selected_runs: persistedRunSelections(),
      review_contexts: persistedRunReviewContexts(),
      shared_review_ui_contexts: persistedStoredSharedReviewUiContexts(),
    };
    try {
      window.localStorage.setItem(
        WORKFLOW_RUN_HISTORY_REVIEW_STORAGE_KEY,
        JSON.stringify(reviewState),
      );
    } catch {
      // Ignore local persistence failures and keep the in-memory review state.
    }
  });

  createEffect(() => {
    try {
      window.localStorage.setItem(
        WORKFLOW_SHARED_REVIEW_LINK_STORAGE_KEY,
        JSON.stringify(persistedSharedReviewLinks()),
      );
    } catch {
      // Ignore local persistence failures and keep the in-memory shared review links.
    }
  });

  createEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    const runId = selectedRunId();
    const selectedEdgeId = selectedRunEdgeId();
    const timelineFilter = runTimelineFilterMode();
    const focusedNodeId = runTimelineFocusNodeId();
    const selectedDeploymentId = selectedDeploymentRecordId();
    const selectedNode = selectedNodeId();
    const driftFilter = runHistoryDriftFilter();
    const sortMode = runHistorySortMode();
    const selectedReviewId = selectedStoredSharedReviewId();
    const showAllSavedReviews = showAllStoredSharedReviews();
    const savedReviewFilter = storedSharedReviewFilter();
    const savedReviewSortMode = storedSharedReviewSortMode();
    const savedReviewShareModeFilter = storedSharedReviewShareModeFilter();
    const savedReviewPinnedOnly = storedSharedReviewPinnedOnly();

    const setOrDelete = (key: string, value: string | null, defaultValue?: string) => {
      if (!value || (defaultValue !== undefined && value === defaultValue)) params.delete(key);
      else params.set(key, value);
    };

    setOrDelete("wf", workflowId ?? null);
    setOrDelete("run", runId);
    setOrDelete("edge", selectedEdgeId);
    setOrDelete("tf", timelineFilter, "all");
    setOrDelete("focus", focusedNodeId);
    setOrDelete("dep", selectedDeploymentId);
    setOrDelete("node", selectedNode);
    setOrDelete("rdf", driftFilter, "all");
    setOrDelete("rds", sortMode, "recent");
    setOrDelete("srid", selectedReviewId);
    setOrDelete("sra", showAllSavedReviews ? "1" : null);
    setOrDelete("srf", savedReviewFilter);
    setOrDelete("srsm", savedReviewSortMode, "priority");
    setOrDelete("srmf", savedReviewShareModeFilter, "all");
    setOrDelete("srpo", savedReviewPinnedOnly ? "1" : null);

    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState({}, "", nextUrl);
    }
  });

  function extendLiveRefreshWindow(durationMs = 15000) {
    setLiveRefreshUntil(Date.now() + durationMs);
  }

  createEffect(() => {
    const workflowId = currentWorkflow()?.workflow_id;
    if (!workflowId || !workflowExecutionRefreshing()) return;
    void refreshDeploymentHistory(workflowId);
    void refreshRunHistory(workflowId);
    const runId = selectedRun()?.run_id ?? selectedRunId();
    if (runId) void refreshSelectedRunWaitResumeRecords(workflowId, runId);
    const interval = window.setInterval(() => {
      void refreshDeploymentHistory(workflowId);
      void refreshRunHistory(workflowId);
      const nextRunId = selectedRun()?.run_id ?? selectedRunId();
      if (nextRunId) void refreshSelectedRunWaitResumeRecords(workflowId, nextRunId);
    }, 2500);
    onCleanup(() => window.clearInterval(interval));
  });

  createEffect(() => {
    const workflowId = currentWorkflow()?.workflow_id;
    const run = selectedRun();
    if (!workflowId || !run || !workflowExecutionRefreshing()) {
      setLiveRunStreamEvents([]);
      setLiveRunStreamConnected(false);
      return;
    }
    const stream = openRunStream(workflowId, run.run_id);
    setLiveRunStreamEvents([]);
    setLiveRunStreamConnected(false);
    stream.onopen = () => {
      setLiveRunStreamConnected(true);
    };
    stream.onmessage = (message) => {
      try {
        const payload = JSON.parse(String(message.data)) as LiveRunStreamEvent;
        if (!payload || typeof payload.event !== "string") return;
        setLiveRunStreamEvents((current) => {
          const key = `${payload.event}:${payload.node_id ?? "run"}:${String(payload.index ?? "")}:${payload.ts ?? ""}`;
          if (current.some((entry) => `${entry.event}:${entry.node_id ?? "run"}:${String(entry.index ?? "")}:${entry.ts ?? ""}` === key)) {
            return current;
          }
          const next = [...current, payload];
          return next.slice(-40);
        });
        if (payload.event === "run_completed" || payload.event === "run_failed") {
          setLiveRunStreamConnected(false);
          void refreshRunHistory(workflowId);
          const runId = selectedRun()?.run_id ?? selectedRunId();
          if (runId) void refreshSelectedRunWaitResumeRecords(workflowId, runId);
          stream.close();
        }
      } catch {
        // Ignore malformed stream events and keep the persisted run detail available.
      }
    };
    stream.onerror = () => {
      setLiveRunStreamConnected(false);
      stream.close();
    };
    onCleanup(() => {
      setLiveRunStreamConnected(false);
      stream.close();
    });
  });

  onMount(() => {
    try {
      const raw = window.localStorage.getItem(WORKFLOW_BRANCH_FAMILY_COLLAPSE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setCollapsedBranchFamilies(
            new Set(parsed.filter((entry): entry is string => typeof entry === "string")),
          );
        }
      }
    } catch {
      // Ignore local persistence failures and fall back to the default expanded state.
    }
    try {
      const raw = window.localStorage.getItem(WORKFLOW_RUN_HISTORY_REVIEW_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed.drift_filter === "all" || parsed.drift_filter === "deployment" || parsed.drift_filter === "replay" || parsed.drift_filter === "any") {
          setRunHistoryDriftFilter(parsed.drift_filter);
        }
        if (parsed.sort_mode === "recent" || parsed.sort_mode === "drift_desc") {
          setRunHistorySortMode(parsed.sort_mode);
        }
        if (parsed.selected_runs && typeof parsed.selected_runs === "object") {
          setPersistedRunSelections(
            Object.fromEntries(
              Object.entries(parsed.selected_runs as Record<string, unknown>)
                .filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"),
            ),
          );
        }
        if (parsed.review_contexts && typeof parsed.review_contexts === "object") {
          setPersistedRunReviewContexts(
            Object.fromEntries(
              Object.entries(parsed.review_contexts as Record<string, unknown>)
                .filter((entry): entry is [string, PersistedRunReviewContext] => {
                  if (typeof entry[0] !== "string" || !entry[1] || typeof entry[1] !== "object") return false;
                  const context = entry[1] as Record<string, unknown>;
                  return (context.timeline_filter === "all"
                    || context.timeline_filter === "deployment_context"
                    || context.timeline_filter === "replay_drift");
                })
                .map(([workflowId, context]) => {
                  const record = context as Record<string, unknown>;
                  return [workflowId, {
                    selected_edge_id: typeof record.selected_edge_id === "string" ? record.selected_edge_id : null,
                    timeline_filter: record.timeline_filter as RunTimelineFilterMode,
                    focused_node_id: typeof record.focused_node_id === "string" ? record.focused_node_id : null,
                    selected_deployment_id: typeof record.selected_deployment_id === "string" ? record.selected_deployment_id : null,
                    selected_node_id: typeof record.selected_node_id === "string" ? record.selected_node_id : null,
                  }];
                }),
            ),
          );
        }
        if (parsed.shared_review_ui_contexts && typeof parsed.shared_review_ui_contexts === "object") {
          setPersistedStoredSharedReviewUiContexts(
            Object.fromEntries(
              Object.entries(parsed.shared_review_ui_contexts as Record<string, unknown>)
                .filter((entry): entry is [string, PersistedStoredSharedReviewUiContext] => {
                  if (typeof entry[0] !== "string" || !entry[1] || typeof entry[1] !== "object") return false;
                  const context = entry[1] as Record<string, unknown>;
                  return context.sort_mode === "priority" || context.sort_mode === "recent";
                })
                .map(([workflowId, context]) => {
                  const record = context as Record<string, unknown>;
                  return [workflowId, {
                    selected_review_id: typeof record.selected_review_id === "string" ? record.selected_review_id : null,
                    show_all: record.show_all === true,
                    filter_text: typeof record.filter_text === "string" ? record.filter_text : "",
                    sort_mode: record.sort_mode === "recent" ? "recent" : "priority",
                    share_mode_filter:
                      record.share_mode_filter === "workspace" || record.share_mode_filter === "core"
                        ? record.share_mode_filter
                        : "all",
                    pinned_only: record.pinned_only === true,
                  }];
                }),
            ),
          );
        }
      }
    } catch {
      // Ignore local persistence failures and fall back to the default run review state.
    }
    try {
      const raw = window.localStorage.getItem(WORKFLOW_SHARED_REVIEW_LINK_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        setPersistedSharedReviewLinks(
          Object.fromEntries(
            Object.entries(parsed)
              .map(([workflowId, value]) => {
                if (typeof workflowId !== "string") return null;
                const normalizeRecord = (recordValue: unknown): StoredSharedReviewLink | null => {
                if (typeof recordValue === "string") {
                  return {
                      id: makeId("shared_review"),
                      href: recordValue,
                      saved_at: new Date().toISOString(),
                      environment: null,
                      deployment_id: null,
                      share_mode: inferStoredSharedReviewShareModeFromHref(recordValue),
                      title: null,
                      pinned: false,
                    };
                  }
                  if (!recordValue || typeof recordValue !== "object") return null;
                  const record = recordValue as Record<string, unknown>;
                  if (typeof record.href !== "string") return null;
                  return {
                    id: typeof record.id === "string" ? record.id : makeId("shared_review"),
                    href: record.href,
                    saved_at: typeof record.saved_at === "string" ? record.saved_at : new Date().toISOString(),
                    environment: typeof record.environment === "string" ? record.environment : null,
                    deployment_id: typeof record.deployment_id === "string" ? record.deployment_id : null,
                    share_mode:
                      record.share_mode === "workspace" || record.share_mode === "core"
                        ? record.share_mode
                        : inferStoredSharedReviewShareModeFromHref(record.href),
                    title: typeof record.title === "string" ? record.title : null,
                    pinned: record.pinned === true,
                  };
                };
                if (Array.isArray(value)) {
                  const entries = value
                    .map((entry) => normalizeRecord(entry))
                    .filter((entry): entry is StoredSharedReviewLink => Boolean(entry));
                  return entries.length > 0 ? [workflowId, entries.slice(0, 5)] as const : null;
                }
                const normalized = normalizeRecord(value);
                return normalized ? [workflowId, [normalized]] as const : null;
              })
              .filter((entry): entry is readonly [string, StoredSharedReviewLink[]] => Boolean(entry)),
          ),
        );
      }
    } catch {
      // Ignore local persistence failures and fall back to the default shared review link state.
    }
    try {
      const urlState = parseReviewUrlStateFromSearch(window.location.search);
      if (urlState) {
        setRunHistoryDriftFilter(urlState.drift_filter);
        setRunHistorySortMode(urlState.sort_mode);
        setPendingUrlReviewState(urlState);
      }
    } catch {
      // Ignore malformed review URL state and fall back to local defaults.
    }
    const move = (event: PointerEvent) => {
      if (!dragStateHolder.current || !canvasRefHolder.current) return;
      const rect = canvasRefHolder.current.getBoundingClientRect();
      const x = Math.max(24, event.clientX - rect.left - dragStateHolder.current.offsetX);
      const y = Math.max(24, event.clientY - rect.top - dragStateHolder.current.offsetY);
      updateSelectedNode((node) => ({ ...node, position: { x, y } }));
    };
    const up = () => {
      if (dragStateHolder.current) {
        const nodeId = dragStateHolder.current.nodeId;
        const draft = graph();
        const node = draft?.nodes.find((entry) => entry.id === nodeId);
        if (node) {
          void handleWorkflowPatch({
            op: "node_move",
            node_id: nodeId,
            x: node.position.x,
            y: node.position.y,
          });
        }
      }
      dragStateHolder.current = null;
      setDragGhostOrigin(null); // 30o Ã¢â‚¬â€ clear ghost on drop
    };
    const handlePopState = () => {
      try {
        applyReviewUrlNavigationState(parseReviewUrlStateFromSearch(window.location.search));
      } catch {
        applyReviewUrlNavigationState(null);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("popstate", handlePopState);
    onCleanup(() => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("popstate", handlePopState);
    });
    // 21k Ã¢â‚¬â€ node run timer tick
    const tickInterval = setInterval(() => setNowMs(Date.now()), 1000);
    onCleanup(() => clearInterval(tickInterval));
    // Load connector adapter registry once on mount so node panels can show family descriptions.
    void getWorkflowConnectorAdapters().then((response) => {
      if (response.adapters && typeof response.adapters === "object") {
        setConnectorAdapters(response.adapters);
      }
    }).catch(() => { /* Non-fatal; adapters panel degrades gracefully */ });

    // 29a Ã¢â‚¬â€ Magic Pointer action handler for workflow nodes
    function handleMagicAction(e: Event) {
      const ev = e as CustomEvent<{ action: string; msgId: string | null }>;
      const { action, msgId } = ev.detail;
      if (!msgId) return;
      if (action === 'inspect') {
        setSelectedNodeId(msgId);
        setSelectedInspectorSection(null);
        setSelectedInspectorFocusSource(null);
        setSelectedInspectorFocusTarget(null);
      }
      if (action === 'comment') {
        setEditingCommentNodeId(msgId);
        setCommentDraft(nodeComments()[msgId] ?? '');
      }
    }
    document.addEventListener('magic-action', handleMagicAction);
    onCleanup(() => document.removeEventListener('magic-action', handleMagicAction));

    // 30g Ã¢â‚¬â€ Jump-to-node via command bar: listen for omnyid:goto-node events
    function handleGotoNode(e: Event) {
      const ev = e as CustomEvent<{ nodeId?: string }>;
      const nodeId = ev.detail?.nodeId;
      if (!nodeId) return;
      setGotoNodeId(nodeId);
      setSelectedNodeId(nodeId);
      setSelectedInspectorSection(null);
      // Scroll canvas to node if possible
      const nodeEl = canvasRefHolder.current?.querySelector(`[data-magic-id="${nodeId}"]`);
      nodeEl?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      setTimeout(() => setGotoNodeId(null), 2000);
    }
    document.addEventListener('omnyid:goto-node', handleGotoNode);
    onCleanup(() => document.removeEventListener('omnyid:goto-node', handleGotoNode));

    // 30d Ã¢â‚¬â€ detect error nodes from selected run steps
    onCleanup(() => {
      if (replayInterval) clearInterval(replayInterval);
    });
  });

  // 30d Ã¢â‚¬â€ Anomaly pulse: scan runs to find nodes with recent failures
  createEffect(() => {
    const runs = runHistory();
    if (!runs || runs.length === 0) return;
    const recent = runs.slice(0, 3);
    const errorNodeSet = new Set<string>();
    for (const run of recent) {
      const steps = (run as Record<string, unknown>)?.steps as Array<Record<string, unknown>> | undefined;
      if (!steps) continue;
      for (const step of steps) {
        if (step?.status === 'failed' || step?.status === 'error') {
          const nodeId = String(step?.node_id ?? '');
          if (nodeId) errorNodeSet.add(nodeId);
        }
      }
    }
    setNodeErrorIds(errorNodeSet);
  });

  // 30l Ã¢â‚¬â€ Execution trace replay
  function startReplay() {
    const run = selectedRun();
    const steps = (run as Record<string, unknown>)?.steps as Array<Record<string, unknown>> | undefined;
    if (!steps || steps.length === 0) return;
    setReplayActive(true);
    setReplayStepIdx(0);
    if (replayInterval) clearInterval(replayInterval);
    replayInterval = setInterval(() => {
      setReplayStepIdx(prev => {
        if (prev >= steps.length - 1) {
          clearInterval(replayInterval!);
          replayInterval = null;
          setReplayActive(false);
          return prev;
        }
        const step = steps[prev + 1];
        const nodeId = String(step?.node_id ?? '');
        if (nodeId) setSelectedNodeId(nodeId);
        return prev + 1;
      });
    }, 650);
  }

  createEffect(() => {
    const workflow = currentWorkflow();
    const familyAsset = workflow ? workflowFamilyAssetRecord(workflow) : null;
    if (!familyAsset) {
      setFamilyParameterDrafts({});
      return;
    }
    setFamilyParameterDrafts({
      ...defaultWorkflowFamilyParameters(familyAsset.parameter_schema),
      ...familyAsset.default_parameters,
    });
  });

  async function loadWorkflow(workflowId: string) {
    setBusyAction("load");
    setFeedback("");
    try {
      const [workflow, deployments, runs] = await Promise.all([
        getWorkflow(workflowId),
        listWorkflowDeployments(workflowId),
        listWorkflowRuns(workflowId),
      ]);
      setSelectedWorkflowId(workflow.workflow_id);
      setCurrentWorkflow(cloneJson(workflow));
      setDeploymentHistory(deployments.deployments);
      setRunHistory(runs.runs);
      // Load trigger registrations non-fatally.
      setTriggerRegistrationsLoading(true);
      void listWorkflowTriggerRegistrations(workflowId).then((response) => {
        setTriggerRegistrations(response.registrations ?? []);
      }).catch(() => {
        setTriggerRegistrations([]);
      }).finally(() => {
        setTriggerRegistrationsLoading(false);
      });
      const pendingUrlState = pendingUrlReviewState();
      const urlRunId = pendingUrlState?.workflow_id === workflow.workflow_id ? pendingUrlState.run_id : null;
      const persistedRunId = persistedRunSelections()[workflow.workflow_id];
      setSelectedRunId(
        urlRunId && runs.runs.some((run) => run.run_id === urlRunId)
          ? urlRunId
          : runs.runs.some((run) => run.run_id === persistedRunId)
          ? persistedRunId
          : runs.runs[0]?.run_id ?? null,
      );
      restoreRunReviewContextForWorkflow(workflow.workflow_id, normalizeGraph(workflow), deployments.deployments);
      setValidationResult(null);
    } catch (error) {
      setFeedback(`Could not load workflow: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  function siblingBranchCount(workflow: SavedWorkflow) {
    return branchFamilyWorkflows(workflow, workflows() ?? []).length;
  }

  function siblingBranches(workflow: SavedWorkflow) {
    return branchFamilyWorkflows(workflow, workflows() ?? []);
  }

  function workflowsForRail() {
    return orderedWorkflowsForRail(workflows() ?? []);
  }

  // 18k Ã¢â‚¬â€ filtered workflow list for tag filter
  const filteredWorkflowsForRail = createMemo(() => {
    const filter = tagFilter();
    if (!filter) return workflowsForRail();
    return workflowsForRail().filter(wf => (workflowTags()[wf.workflow_id] ?? []).includes(filter));
  });

  function branchFamilyCollapsed(rootId: string) {
    return collapsedBranchFamilies().has(rootId);
  }

  function toggleBranchFamily(rootId: string) {
    setCollapsedBranchFamilies((current) => {
      const next = new Set(current);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  }

  function branchWorkflowVisibleInRail(workflow: SavedWorkflow) {
    const rootId = branchFamilyRootId(workflow);
    if (!branchFamilyCollapsed(rootId)) return true;
    if (!isBranchChildWorkflow(workflow)) return true;
    return selectedWorkflowId() === workflow.workflow_id;
  }

  function branchFamilyRootIdsWithChildren() {
    const available = workflows() ?? [];
    return new Set<string>(
      available
        .filter((workflow) => !isBranchChildWorkflow(workflow) && siblingBranchCount(workflow) > 0)
        .map((workflow) => workflow.workflow_id),
    );
  }

  function branchFamilySummary() {
    const familyIds = branchFamilyRootIdsWithChildren();
    const collapsed = [...collapsedBranchFamilies()].filter((familyId) => familyIds.has(familyId));
    return {
      familyCount: familyIds.size,
      collapsedCount: collapsed.length,
    };
  }

  function expandAllBranchFamilies() {
    setCollapsedBranchFamilies(new Set<string>());
  }

  function collapseOtherBranchFamilies() {
    const rootIds = branchFamilyRootIdsWithChildren();
    const selected = (workflows() ?? []).find((workflow) => workflow.workflow_id === selectedWorkflowId());
    const selectedRootId = selected ? branchFamilyRootId(selected) : null;
    const next = new Set<string>();
    for (const rootId of rootIds) {
      if (rootId !== selectedRootId) next.add(rootId);
    }
    setCollapsedBranchFamilies(next);
  }

  function updateGraph(updater: (draft: WorkflowGraphDraft) => WorkflowGraphDraft) {
    setCurrentWorkflow((workflow) => {
      if (!workflow) return workflow;
      const nextGraph = updater(normalizeGraph(workflow));
      return {
        ...workflow,
        title: nextGraph.title,
        description: nextGraph.description,
        graph: nextGraph,
        preset_kinds: nextGraph.presets.map((preset) => preset.preset_kind).filter((value): value is string => typeof value === "string"),
        updated_at: new Date().toISOString(),
      };
    });
  }

  function updateSelectedNode(updater: (node: WorkflowNodeDraft) => WorkflowNodeDraft) {
    const nodeId = selectedNodeId();
    if (!nodeId) return;
    updateGraph((draft) => ({
      ...draft,
      nodes: draft.nodes.map((node) => (node.id === nodeId ? updater(cloneJson(node)) : node)),
    }));
  }

  function instantiatePresetStarterSubgraph(
    preset: PresetNodeKind,
    index: number,
    source: "palette" | "intent_builder" = "palette",
  ) {
    const blueprints = presetStarterBlueprints(preset);
    const templateId = presetTemplateId(preset);
    const baseX = 80 + (index % 3) * 280;
    const baseY = 80 + Math.floor(index / 3) * 180;
    const nextNodes = blueprints.map((blueprint, blueprintIndex) => {
      const id = makeId("node");
      return {
        id,
        kind: blueprint.kind,
        label: blueprint.label,
        description: blueprint.description,
        position: {
          x: baseX + blueprintIndex * 220,
          y: baseY + (blueprint.kind === "approval" ? 30 : 0),
        },
        config: cloneJson(blueprint.config),
        policy: blueprint.policy ? cloneJson(blueprint.policy) : defaultPolicy(),
        prompt: blueprint.prompt ? cloneJson(blueprint.prompt) : undefined,
        hidden_runtime_nodes: runtimeHints(blueprint.runtime_kind_source ?? blueprint.kind),
        metadata: {
          preset_origin: preset,
          subgraph_seed: true,
          ...(source === "intent_builder" ? { generated_by: "intent_builder" } : {}),
          template_id: templateId,
          template_slot: blueprint.slot_name,
        },
      } satisfies WorkflowNodeDraft;
    });

    for (const node of nextNodes) {
      if (node.kind !== "approval") continue;
      const config = node.config as Record<string, unknown>;
      if (typeof config.decision_point_id !== "string" || !config.decision_point_id) {
        config.decision_point_id = makeId("dp");
      }
    }

    const nextEdges = nextNodes.slice(0, -1).map((nodeEntry, blueprintIndex) => ({
      id: makeId("edge"),
      source: nodeEntry.id,
      target: nextNodes[blueprintIndex + 1].id,
      metadata: {
        preset_origin: preset,
        ...(source === "intent_builder" ? { generated_by: "intent_builder" } : {}),
      },
    } satisfies WorkflowEdgeDraft));

    const presetRecord = {
      preset_id: makeId("preset"),
      preset_kind: preset,
      label: titleCase(preset),
      root_node_ids: [nextNodes[0].id],
      favorite_eligible: true,
      parameter_schema: {},
      template_id: templateId,
      metadata: source === "intent_builder" ? { generated_by: "intent_builder" } : {},
    };

    const templateBindings = nextNodes.map((nodeEntry, blueprintIndex) => ({
      template_id: templateId,
      slot_name: blueprints[blueprintIndex].slot_name,
      node_ids: [nodeEntry.id],
      metadata: {
        preset_kind: preset,
        subgraph_seed: true,
        ...(source === "intent_builder" ? { generated_by: "intent_builder" } : {}),
      },
    }));

    return {
      templateId,
      nextNodes,
      nextEdges,
      presetRecord,
      templateBindings,
    };
  }

  function insertNodeBetween(
    graphDraft: WorkflowGraphDraft,
    previousNodeId: string,
    nextNodeId: string,
    node: WorkflowNodeDraft,
    edgeLabel?: string,
  ) {
    const edgeIndex = graphDraft.edges.findIndex((edge) => edge.source === previousNodeId && edge.target === nextNodeId);
    if (edgeIndex >= 0) {
      graphDraft.edges.splice(edgeIndex, 1);
    }
    graphDraft.nodes.push(node);
    graphDraft.edges.push(
      {
        id: makeId("edge"),
        source: previousNodeId,
        target: node.id,
        condition_label: edgeLabel,
        metadata: { generated_by: "intent_builder" },
      },
      {
        id: makeId("edge"),
        source: node.id,
        target: nextNodeId,
        metadata: { generated_by: "intent_builder" },
      },
    );
  }

  function augmentWorkflowForIntent(
    graphDraft: WorkflowGraphDraft,
    intent: string,
    preset: PresetNodeKind,
    templateId: string,
  ) {
    const expansion = expandWorkflowIntent(intent);
    graphDraft.optimization_mode = expansion.optimization_mode;

    if (expansion.public_output) {
      const firstAgent = graphDraft.nodes.find((node) => node.kind === "agent");
      if (firstAgent) {
        firstAgent.policy = {
          ...firstAgent.policy,
          mask: "public",
        };
      }
    }

    if (expansion.needs_research_support && !graphDraft.nodes.some((node) => typeof node.config.capability_id === "string" && node.config.capability_id === "web_search")) {
      const firstToolOrTerminal = graphDraft.nodes.find((node) => node.kind === "tool" || node.kind === "termination");
      const firstAgent = graphDraft.nodes.find((node) => node.kind === "agent");
      if (firstToolOrTerminal && firstAgent && firstToolOrTerminal.id !== firstAgent.id) {
        const supportNode: WorkflowNodeDraft = {
          id: makeId("node"),
          kind: "tool",
          label: "Research Support",
          description: "Gather supporting web evidence for the described workflow.",
          position: {
            x: (firstAgent.position.x + firstToolOrTerminal.position.x) / 2,
            y: firstToolOrTerminal.position.y - 70,
          },
          config: { capability_id: "web_search", operation: "search", timeout_seconds: 120 },
          policy: defaultPolicy(),
          prompt: undefined,
          hidden_runtime_nodes: runtimeHints("tool"),
          metadata: {
            generated_by: "intent_builder",
            template_id: templateId,
            template_slot: "gather_slot",
          },
        };
        insertNodeBetween(graphDraft, firstAgent.id, firstToolOrTerminal.id, supportNode);
        graphDraft.template_bindings.push({
          template_id: templateId,
          slot_name: "gather_slot",
          node_ids: [supportNode.id],
          metadata: {
            preset_kind: preset,
            generated_by: "intent_builder",
            augmentation: "research_support",
          },
        });
      }
    }

    if (expansion.requires_approval && !graphDraft.nodes.some((node) => node.kind === "approval")) {
      const terminalNode = [...graphDraft.nodes].reverse().find((node) => node.kind === "termination");
      const previousNode = terminalNode
        ? [...graphDraft.edges]
            .reverse()
            .find((edge) => edge.target === terminalNode.id)
            ?.source
        : undefined;
      if (terminalNode && previousNode) {
        const upstreamNode = graphDraft.nodes.find((node) => node.id === previousNode);
        if (upstreamNode) {
          const approvalNode: WorkflowNodeDraft = {
            id: makeId("node"),
            kind: "approval",
            label: "Human Review",
            description: "Pause for review before the workflow continues to its final output.",
            position: {
              x: (upstreamNode.position.x + terminalNode.position.x) / 2,
              y: terminalNode.position.y - 40,
            },
            config: {
              approval_reason: `Review the workflow before completing: ${intent}`,
              decision_point_id: makeId("dp"),
              options: [
                { option_id: "approve", label: "Approve", consequence_summary: "Continue to the final result." },
                { option_id: "hold", label: "Hold", consequence_summary: "Pause before any final action." },
              ],
            },
            policy: defaultPolicy(),
            prompt: undefined,
            hidden_runtime_nodes: runtimeHints("approval"),
            metadata: {
              generated_by: "intent_builder",
              template_id: templateId,
              template_slot: "approval_slot",
            },
          };
          insertNodeBetween(graphDraft, upstreamNode.id, terminalNode.id, approvalNode);
          graphDraft.template_bindings.push({
            template_id: templateId,
            slot_name: "approval_slot",
            node_ids: [approvalNode.id],
            metadata: {
              preset_kind: preset,
              generated_by: "intent_builder",
              augmentation: "approval_gate",
            },
          });
        }
      }
    }

    if (expansion.needs_branching && !graphDraft.nodes.some((node) => node.kind === "condition")) {
      const firstAgent = graphDraft.nodes.find((node) => node.kind === "agent");
      const firstNonTriggerTarget = firstAgent
        ? graphDraft.edges.find((edge) => edge.source === firstAgent.id)?.target
        : undefined;
      const nextNode = firstNonTriggerTarget
        ? graphDraft.nodes.find((node) => node.id === firstNonTriggerTarget)
        : undefined;
      if (firstAgent && nextNode) {
        const conditionNode: WorkflowNodeDraft = {
          id: makeId("node"),
          kind: "condition",
          label: "Decision Split",
          description: "Branch between the preferred path and a fallback path from the described objective.",
          position: {
            x: (firstAgent.position.x + nextNode.position.x) / 2,
            y: nextNode.position.y - 20,
          },
          config: {
            expression: "preferred_option_available",
          },
          policy: defaultPolicy(),
          prompt: undefined,
          hidden_runtime_nodes: runtimeHints("condition"),
          metadata: {
            generated_by: "intent_builder",
            template_id: templateId,
            template_slot: "check_slot",
          },
        };
        insertNodeBetween(graphDraft, firstAgent.id, nextNode.id, conditionNode, "success");
        const fallbackNode: WorkflowNodeDraft = {
          id: makeId("node"),
          kind: "termination",
          label: "Fallback Summary",
          description: "Return the fallback recommendation when the preferred route is not viable.",
          position: {
            x: conditionNode.position.x + 240,
            y: conditionNode.position.y + 120,
          },
          config: {
            output_kind: "chat_reply",
            final_schema: { workflow: preset, branch_outcome: "fallback" },
          },
          policy: defaultPolicy(),
          prompt: undefined,
          hidden_runtime_nodes: runtimeHints("termination"),
          metadata: {
            generated_by: "intent_builder",
            branch_label: "fallback",
          },
        };
        graphDraft.nodes.push(fallbackNode);
        graphDraft.edges.push({
          id: makeId("edge"),
          source: conditionNode.id,
          target: fallbackNode.id,
          condition_label: "fallback",
          metadata: {
            generated_by: "intent_builder",
          },
        });
        graphDraft.template_bindings.push({
          template_id: templateId,
          slot_name: "check_slot",
          node_ids: [conditionNode.id],
          metadata: {
            preset_kind: preset,
            generated_by: "intent_builder",
            augmentation: "branching",
          },
        });
      }
    }
  }

  function isIntentGeneratedRecord(value: unknown) {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    const metadata = record.metadata;
    return Boolean(metadata && typeof metadata === "object" && (metadata as Record<string, unknown>).generated_by === "intent_builder");
  }

  function regenerationImpactSummary() {
    const workflow = currentWorkflow();
    if (!workflow) return null;
    const draft = normalizeGraph(workflow);
    const lockedNodeIds = protectedNodeIdsForGraph(draft);
    const generatedNodes = draft.nodes.filter((node) => isIntentGeneratedRecord(node)).length;
    const lockedNodes = lockedNodeIds.size;
    const preservedNodes = draft.nodes.filter((node) => !isIntentGeneratedRecord(node) || lockedNodeIds.has(node.id)).length;
    const generatedEdges = draft.edges.filter((edge) => isIntentGeneratedRecord(edge)).length;
    const preservedEdges = draft.edges.filter((edge) => !isIntentGeneratedRecord(edge) || lockedNodeIds.has(edge.source) || lockedNodeIds.has(edge.target)).length;
    return {
      generatedNodes,
      lockedNodes,
      preservedNodes,
      generatedEdges,
      preservedEdges,
    };
  }

  function buildWorkflowFromIntent(intent: string, baseWorkflow?: SavedWorkflow | null) {
    const expansion = intentExpansion() ?? expandWorkflowIntent(intent);
    const preset = expansion.preset_kind;
    const workflow = baseWorkflow ? cloneJson(baseWorkflow) : makeNewWorkflow();
    const draft = baseWorkflow ? normalizeGraph(workflow) : normalizeGraph(workflow);
    const triggerNode = draft.nodes[0];
    const subgraph = instantiatePresetStarterSubgraph(preset, draft.nodes.length, "intent_builder");

    const defaultTriggerCfg = presetDefaultTriggerConfig(preset);
    triggerNode.label = "Intent trigger";
    triggerNode.description = "Start this generated workflow from a natural-language objective.";
    triggerNode.config = {
      ...triggerNode.config,
      ...defaultTriggerCfg,
      event_filter: {
        objective: intent,
      },
    };
    triggerNode.metadata = {
      ...triggerNode.metadata,
      generated_by: "intent_builder",
    };

    const nextGraph: WorkflowGraphDraft = {
      ...draft,
      title: suggestWorkflowTitleFromIntent(intent, preset),
      description: intent,
      nodes: [triggerNode, ...subgraph.nextNodes],
      edges: [
        {
          id: makeId("edge"),
          source: triggerNode.id,
          target: subgraph.nextNodes[0].id,
          metadata: {
            generated_by: "intent_builder",
          },
        },
        ...subgraph.nextEdges,
      ],
      presets: [subgraph.presetRecord],
      template_id: subgraph.templateId,
      template_version: "omnyid-subagent-template.v1",
      template_bindings: subgraph.templateBindings,
      root_node_ids: [triggerNode.id],
      metadata: {
        ...draft.metadata,
        origin: "workflow_builder_describe_intent",
        source_intent: intent,
        inferred_preset: preset,
        intent_expansion: expansion as unknown as Record<string, unknown>,
        preset_template_ids: [subgraph.templateId],
      },
    };
    augmentWorkflowForIntent(nextGraph, intent, preset, subgraph.templateId);

    if (baseWorkflow && regenerationMode() === "preserve_manual") {
      const baseGraph = normalizeGraph(baseWorkflow);
      const preservedReachableNodeIds = protectedNodeIdsForGraph(baseGraph);
      for (const node of baseGraph.nodes) {
        if (!isIntentGeneratedRecord(node)) {
          preservedReachableNodeIds.add(node.id);
        }
      }
      const preservedNodes = baseGraph.nodes.filter((node) => preservedReachableNodeIds.has(node.id));
      const preservedNodeIds = new Set(preservedNodes.map((node) => node.id));
      const preservedEdges = baseGraph.edges.filter((edge) => preservedNodeIds.has(edge.source) && preservedNodeIds.has(edge.target));
      const preservedPresets = baseGraph.presets.filter((presetRecord) => !isIntentGeneratedRecord(presetRecord));
      const preservedTemplateBindings = baseGraph.template_bindings.filter((binding) => !isIntentGeneratedRecord(binding));
      const preservedLockedNodes = preservedNodes.filter((node) => nodeRegenerationLocked(node)).length;

      nextGraph.nodes = [...nextGraph.nodes, ...preservedNodes];
      nextGraph.edges = [...nextGraph.edges, ...preservedEdges];
      nextGraph.presets = [...nextGraph.presets, ...preservedPresets];
      nextGraph.template_bindings = [...nextGraph.template_bindings, ...preservedTemplateBindings];
      nextGraph.metadata = {
        ...nextGraph.metadata,
        preserved_manual_nodes: preservedNodes.length,
        preserved_manual_edges: preservedEdges.length,
        preserved_locked_nodes: preservedLockedNodes,
        regeneration_mode: "preserve_manual",
      };
    } else {
      nextGraph.metadata = {
        ...nextGraph.metadata,
        regeneration_mode: "rebuild",
      };
    }

    return {
      ...workflow,
      workflow_id: workflow.workflow_id,
      owner_user_id: workflow.owner_user_id,
      title: nextGraph.title,
      description: nextGraph.description,
      preset_kinds: [preset],
      graph: nextGraph,
      latest_ir: null,
      updated_at: new Date().toISOString(),
    };
  }

  function applyDescribeHistoryEntry(entry: DescribeHistoryEntry) {
    setWorkflowIntent(entry.intent);
    setIntentPresetOverride((entry.preset_kind as PresetNodeKind | undefined) ?? "");
    setIntentOptimizationOverride(
      entry.optimization_mode === "speed" || entry.optimization_mode === "cost" || entry.optimization_mode === "balanced"
        ? entry.optimization_mode
        : "",
    );
    setRegenerationMode(entry.regeneration_mode === "rebuild" ? "rebuild" : "preserve_manual");
  }

  async function saveWorkflowBranchFromDescribeHistory(entry: DescribeHistoryEntry) {
    setBusyAction("describe");
    setFeedback("");
    try {
      const described = await describeWorkflow({
        intent: entry.intent,
        preset_override: (entry.preset_kind as PresetNodeKind | undefined) ?? undefined,
        optimization_override:
          entry.optimization_mode === "balanced" ||
          entry.optimization_mode === "speed" ||
          entry.optimization_mode === "cost"
            ? entry.optimization_mode
            : undefined,
        regeneration_mode:
          entry.regeneration_mode === "rebuild" ? "rebuild" : "preserve_manual",
        save_draft: true,
        branch_from_workflow_id: currentWorkflow()?.workflow_id,
        branch_from_event_id: entry.event_id,
      });
      const branched = cloneJson(described.workflow);
      setCurrentWorkflow(branched);
      setSelectedWorkflowId(branched.workflow_id);
      setSelectedNodeId(
        normalizeGraph(branched).nodes[1]?.id ??
          normalizeGraph(branched).nodes[0]?.id ??
          null,
      );
      setDeploymentHistory([]);
      setRunHistory([]);
      setSelectedRunId(null);
      setValidationResult(null);
      setWorkflowIntent(entry.intent);
      setIntentPresetOverride((entry.preset_kind as PresetNodeKind | undefined) ?? "");
      setIntentOptimizationOverride(
        entry.optimization_mode === "balanced" ||
          entry.optimization_mode === "speed" ||
          entry.optimization_mode === "cost"
          ? entry.optimization_mode
          : "",
      );
      setRegenerationMode(
        entry.regeneration_mode === "rebuild" ? "rebuild" : "preserve_manual",
      );
      mutate((current) => {
        const list = current ?? [];
        const idx = list.findIndex((item) => item.workflow_id === branched.workflow_id);
        if (idx >= 0) {
          const next = [...list];
          next[idx] = branched;
          return next;
        }
        return [branched, ...list];
      });
      setFeedback("Saved a new workflow branch from this describe event.");
    } catch (error) {
      setFeedback(
        `Could not save branch from describe history: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function createWorkflowFromIntent() {
    const intent = workflowIntent().trim();
    if (!intent) {
      setFeedback("Describe the workflow you want to build first.");
      return;
    }
    setBusyAction("describe");
    setFeedback("");
    try {
      const described = await describeWorkflow({
        intent,
        preset_override: intentPresetOverride() || undefined,
        optimization_override: intentOptimizationOverride() || undefined,
        regeneration_mode: regenerationMode(),
        save_draft: true,
      });
      const nextWorkflow = cloneJson(described.workflow);
      setCurrentWorkflow(nextWorkflow);
      setSelectedWorkflowId(nextWorkflow.workflow_id);
      setSelectedNodeId(normalizeGraph(nextWorkflow).nodes[1]?.id ?? normalizeGraph(nextWorkflow).nodes[0]?.id ?? null);
      setDeploymentHistory([]);
      setRunHistory([]);
      setSelectedRunId(null);
      setValidationResult(null);
      setWorkflowIntent("");
      setIntentPresetOverride("");
      setIntentOptimizationOverride("");
      mutate((current) => {
        const list = current ?? [];
        const idx = list.findIndex((entry) => entry.workflow_id === nextWorkflow.workflow_id);
        if (idx >= 0) {
          const next = [...list];
          next[idx] = nextWorkflow;
          return next;
        }
        return [nextWorkflow, ...list];
      });
      setFeedback(`Generated a ${titleCase(nextWorkflow.preset_kinds[0] ?? "research_assistant")} starter workflow from your description.`);
    } catch (error) {
      const nextWorkflow = buildWorkflowFromIntent(intent);
      setCurrentWorkflow(nextWorkflow);
      setSelectedWorkflowId(nextWorkflow.workflow_id);
      setSelectedNodeId(normalizeGraph(nextWorkflow).nodes[1]?.id ?? normalizeGraph(nextWorkflow).nodes[0]?.id ?? null);
      setDeploymentHistory([]);
      setRunHistory([]);
      setSelectedRunId(null);
      setValidationResult(null);
      setFeedback(`Used local describe fallback: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function regenerateCurrentWorkflowFromIntent() {
    const workflow = currentWorkflow();
    if (!workflow) {
      setFeedback("Select a workflow to regenerate it from description.");
      return;
    }
    const sourceIntent =
      workflowIntent().trim() ||
      (typeof normalizeGraph(workflow).metadata["source_intent"] === "string"
        ? String(normalizeGraph(workflow).metadata["source_intent"])
        : "") ||
      (workflow.description ?? "").trim();
    if (!sourceIntent) {
      setFeedback("This workflow does not have a saved description to regenerate from.");
      return;
    }

    setBusyAction("describe");
    setFeedback("");
    try {
      const described = await describeWorkflow({
        intent: sourceIntent,
        base_workflow: workflow,
        preset_override: intentPresetOverride() || undefined,
        optimization_override: intentOptimizationOverride() || undefined,
        regeneration_mode: regenerationMode(),
      });
      const regenerated = cloneJson(described.workflow);
      setCurrentWorkflow(regenerated);
      setSelectedWorkflowId(regenerated.workflow_id);
      setSelectedNodeId(normalizeGraph(regenerated).nodes[1]?.id ?? normalizeGraph(regenerated).nodes[0]?.id ?? null);
      setDeploymentHistory([]);
      setRunHistory([]);
      setSelectedRunId(null);
      setValidationResult(null);
      setWorkflowIntent(sourceIntent);
    setFeedback("Regenerated the workflow draft from its description. Save when youÃ¢â‚¬â„¢re happy with the updated graph.");
    } catch (error) {
      const regenerated = buildWorkflowFromIntent(sourceIntent, workflow);
      setCurrentWorkflow(regenerated);
      setSelectedWorkflowId(regenerated.workflow_id);
      setSelectedNodeId(normalizeGraph(regenerated).nodes[1]?.id ?? normalizeGraph(regenerated).nodes[0]?.id ?? null);
      setDeploymentHistory([]);
      setRunHistory([]);
      setSelectedRunId(null);
      setValidationResult(null);
      setWorkflowIntent(sourceIntent);
      setFeedback(`Used local regeneration fallback: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  function addNode(kind: string, preset?: string) {
    if (workflowInteractionLocked()) return;
    const draft = graph();
    const index = draft?.nodes.length ?? 0;
    if (preset) {
      const presetKind = preset as PresetNodeKind;
      const { templateId, nextNodes, nextEdges, presetRecord, templateBindings } = instantiatePresetStarterSubgraph(
        presetKind,
        index,
      );
      updateGraph((current) => ({
        ...current,
        nodes: [...current.nodes, ...nextNodes],
        edges: [...current.edges, ...nextEdges],
        presets: [...current.presets, presetRecord],
        template_id: current.nodes.length === 0 ? templateId : current.template_id,
        template_version: current.nodes.length === 0 ? "omnyid-subagent-template.v1" : current.template_version,
        template_bindings: [...current.template_bindings, ...templateBindings],
        root_node_ids: current.root_node_ids.length ? current.root_node_ids : [nextNodes[0].id],
        metadata: {
          ...current.metadata,
          preset_template_ids: Array.from(
            new Set([
              ...(Array.isArray(current.metadata.preset_template_ids) ? current.metadata.preset_template_ids.filter((value): value is string => typeof value === "string") : []),
              templateId,
            ]),
          ),
        },
      }));
      setSelectedNodeId(nextNodes[0].id);
      setFeedback(`Added ${titleCase(preset)} starter workflow.`);
      return;
    }
    const node: WorkflowNodeDraft = {
      id: makeId("node"),
      kind,
      label: `${titleCase(kind)} node`,
      description: `${titleCase(kind)} primitive node.`,
      position: { x: 80 + (index % 4) * 220, y: 80 + Math.floor(index / 4) * 120 },
      config: defaultConfig(kind),
      policy: defaultPolicy(),
      prompt: undefined,
      hidden_runtime_nodes: runtimeHints(kind),
      metadata: {},
    };
    updateGraph((current) => ({
      ...current,
      nodes: [...current.nodes, node],
      presets: current.presets,
      root_node_ids: current.root_node_ids.length ? current.root_node_ids : [node.id],
    }));
    setSelectedNodeId(node.id);
  }

  function removeSelectedNode() {
    if (workflowInteractionLocked()) return;
    const nodeId = selectedNodeId();
    if (!nodeId) return;
    updateGraph((draft) => ({
      ...draft,
      nodes: draft.nodes.filter((node) => node.id !== nodeId),
      edges: draft.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      root_node_ids: draft.root_node_ids.filter((root) => root !== nodeId),
    }));
    setSelectedNodeId(null);
    void handleWorkflowPatch({ op: "node_delete", node_id: nodeId });
  }

  function duplicateNode(nodeId: string) {
    if (workflowInteractionLocked()) return;
    const src = graph()?.nodes.find((n) => n.id === nodeId);
    if (!src) return;
    const copy: WorkflowNodeDraft = {
      ...src,
      id: makeId("node"),
      label: `${src.label} copy`,
      position: { x: src.position.x + 80, y: src.position.y + 80 },
    };
    updateGraph((current) => ({ ...current, nodes: [...current.nodes, copy] }));
    setSelectedNodeId(copy.id);
    setCtxMenu(null);
  }

  function addSemanticNode(starterId: string) {
    if (workflowInteractionLocked()) return;
    const starter = semanticStarterById(starterId);
    if (!starter) {
      setFeedback(`Unknown semantic starter: ${starterId}`);
      return;
    }
    const draft = graph();
    const index = draft?.nodes.length ?? 0;
    const node: WorkflowNodeDraft = {
      id: makeId("node"),
      kind: starter.nodeKind,
      label: starter.label,
      description: starter.description,
      position: { x: 80 + (index % 4) * 220, y: 80 + Math.floor(index / 4) * 120 },
      config: cloneJson(starter.config),
      policy: defaultPolicy(),
      prompt: undefined,
      hidden_runtime_nodes: runtimeHints(starter.nodeKind),
      metadata: {
        semantic_node_kind: starter.id,
        semantic_role: starter.semanticRole,
        human_facing_node: true,
      },
    };
    updateGraph((current) => ({
      ...current,
      nodes: [...current.nodes, node],
      root_node_ids: current.root_node_ids.length ? current.root_node_ids : [node.id],
      metadata: {
        ...current.metadata,
        semantic_builder_enabled: true,
      },
    }));
    setSelectedNodeId(node.id);
    setFeedback(`Added ${starter.label} semantic node.`);
  }

  function applyConfig() {
    if (workflowInteractionLocked()) return;
    try {
      const parsed = JSON.parse(configText()) as Record<string, unknown>;
      updateSelectedNode((node) => ({ ...node, config: parsed }));
      const nodeId = selectedNodeId();
      if (nodeId) {
        void handleWorkflowPatch({ op: "node_config_replace", node_id: nodeId, config: parsed });
      }
      setFeedback("Applied node config JSON.");
    } catch (error) {
      setFeedback(`Invalid config JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function applyPolicy() {
    if (workflowInteractionLocked()) return;
    try {
      const parsed = JSON.parse(policyText()) as Record<string, unknown>;
      updateSelectedNode((node) => ({ ...node, policy: parsed }));
      const nodeId = selectedNodeId();
      if (nodeId) {
        void handleWorkflowPatch({ op: "node_policy_replace", node_id: nodeId, policy: parsed });
      }
      setFeedback("Applied node policy JSON.");
    } catch (error) {
      setFeedback(`Invalid policy JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function addEdge() {
    if (workflowInteractionLocked()) return;
    const source = edgeSource();
    const target = edgeTarget();
    if (!source || !target || source === target) {
      setFeedback("Choose two different nodes to create an edge.");
      return;
    }
    updateGraph((draft) => draft.edges.some((edge) => edge.source === source && edge.target === target)
      ? draft
      : {
          ...draft,
          edges: [
            ...draft.edges,
            {
              id: makeId("edge"),
              source,
              target,
              condition_label: edgeConditionLabel().trim() || undefined,
              metadata: {},
            },
          ],
        });
    setEdgeTarget("");
    setEdgeConditionLabel("");
    setFeedback("Added edge.");
    void handleWorkflowPatch({
      op: "edge_add",
      source,
      target,
      condition_label: edgeConditionLabel().trim() || undefined,
    });
  }

  function patchEdgeConditionLabel(edgeId: string, conditionLabel: string) {
    if (workflowInteractionLocked()) return;
    updateGraph((draft) => ({
      ...draft,
      edges: draft.edges.map((edge) =>
        edge.id === edgeId
          ? {
              ...edge,
              condition_label: conditionLabel.trim() || undefined,
            }
          : edge,
      ),
    }));
    void handleWorkflowPatch({
      op: "edge_meta_replace",
      edge_id: edgeId,
      condition_label: conditionLabel.trim() || undefined,
    });
  }

  function toggleRoot(nodeId: string, checked: boolean) {
    if (workflowInteractionLocked()) return;
    updateGraph((draft) => ({
      ...draft,
      root_node_ids: checked
        ? [...new Set([...draft.root_node_ids, nodeId])]
        : draft.root_node_ids.filter((root) => root !== nodeId),
    }));
    void handleWorkflowPatch({ op: "root_toggle", node_id: nodeId, root_enabled: checked });
  }

  function createNewWorkflow() {
    const workflow = makeNewWorkflow();
    setCurrentWorkflow(workflow);
    setSelectedWorkflowId(workflow.workflow_id);
    setDeploymentHistory([]);
    setRunHistory([]);
    setSelectedRunId(null);
    setSelectedNodeId(normalizeGraph(workflow).nodes[0]?.id ?? null);
    setValidationResult(null);
    setFeedback("Started a new workflow draft.");
  }

  function startDrag(event: PointerEvent & { currentTarget: HTMLButtonElement }, nodeId: string) {
    if (workflowInteractionLocked()) return;
    const draft = graph();
    const node = draft?.nodes.find((entry) => entry.id === nodeId);
    if (!node || !canvasRefHolder.current) return;
    const rect = canvasRefHolder.current.getBoundingClientRect();
    dragStateHolder.current = {
      nodeId,
      offsetX: event.clientX - rect.left - node.position.x,
      offsetY: event.clientY - rect.top - node.position.y,
    };
    // 30o Ã¢â‚¬â€ track origin for drag ghost
    setDragGhostOrigin({ x: node.position.x, y: node.position.y, nodeId });
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedNodeId(nodeId);
  }

  async function ensureWorkflowPersisted(): Promise<SavedWorkflow | null> {
    const workflow = currentWorkflow();
    if (!workflow) return null;
    if ((workflows() ?? []).some((entry) => entry.workflow_id === workflow.workflow_id)) {
      return workflow;
    }
    try {
      const response = await saveWorkflow({
        graph: normalizeGraph(workflow) as unknown as Record<string, unknown>,
        latest_ir: (workflow.latest_ir ?? undefined) as Record<string, unknown> | undefined,
        favorite: workflow.favorite,
        archived: Boolean(workflow.archived_at),
      });
      const saved = cloneJson(response.workflow);
      setCurrentWorkflow(saved);
      setSelectedWorkflowId(saved.workflow_id);
      mutate((current) => [saved, ...(current ?? [])]);
      return saved;
    } catch (error) {
      setFeedback(`Could not persist workflow before patching: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  async function handleWorkflowPatch(
    patch:
      | {
          op: "workflow_meta_replace";
          title?: string;
          description?: string;
          environment?: string;
          optimization_mode?: string;
        }
      | {
          op: "node_meta_replace";
          node_id: string;
          label?: string;
          description?: string;
        }
      | { op: "node_move"; node_id: string; x: number; y: number }
      | { op: "root_toggle"; node_id: string; root_enabled: boolean }
      | { op: "edge_add"; source: string; target: string; condition_label?: string }
      | { op: "edge_meta_replace"; edge_id: string; condition_label?: string }
      | { op: "edge_remove"; edge_id: string }
      | { op: "node_delete"; node_id: string }
      | { op: "node_config_replace"; node_id: string; config: Record<string, unknown> }
      | { op: "node_policy_replace"; node_id: string; policy: Record<string, unknown> }
      | {
          op: "node_prompt_replace";
          node_id: string;
          prompt: {
            system_prompt?: string;
            instruction_prompt?: string;
            user_editable?: boolean;
          };
        },
  ) {
    const workflow = await ensureWorkflowPersisted();
    if (!workflow) return;
    try {
      const response = await patchWorkflow(workflow.workflow_id, patch);
      const updated = cloneJson(response.workflow);
      setCurrentWorkflow(updated);
      setSelectedWorkflowId(updated.workflow_id);
      mutate((current) => (current ?? []).map((entry) => entry.workflow_id === updated.workflow_id ? updated : entry));
      if (response.ir_invalidated) {
        setFeedback("Workflow graph updated. Compiled IR was cleared and should be rebuilt before deploy.");
      }
    } catch (error) {
      setFeedback(`Could not patch workflow: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function refreshDeploymentHistory(workflowId: string) {
    try {
      const response = await listWorkflowDeployments(workflowId);
      setDeploymentHistory(response.deployments);
    } catch {
      setDeploymentHistory([]);
    }
  }

  async function refreshRunHistory(workflowId: string) {
    try {
      const response = await listWorkflowRuns(workflowId);
      setRunHistory(response.runs);
      if (response.runs.length > 0) markWorkflowRun(workflowId);
      const persistedRunId = persistedRunSelections()[workflowId];
      setSelectedRunId((current) => {
        if (current && response.runs.some((run) => run.run_id === current)) return current;
        if (persistedRunId && response.runs.some((run) => run.run_id === persistedRunId)) return persistedRunId;
        return response.runs[0]?.run_id ?? null;
      });
      const workflow = currentWorkflow();
      if (workflow?.workflow_id === workflowId) {
        restoreRunReviewContextForWorkflow(workflowId, normalizeGraph(workflow), deploymentHistory());
      }
    } catch {
      setRunHistory([]);
      setSelectedRunId(null);
    }
  }

  async function refreshSelectedRunWaitResumeRecords(workflowId: string, runId: string) {
    setSelectedRunWaitResumeLoading(true);
    setSelectedRunWaitResumeError(null);
    try {
      const response = await listWorkflowWaitResumeRecords(workflowId, runId);
      setSelectedRunWaitResumeRecords(response.wait_resume_records);
    } catch (error) {
      setSelectedRunWaitResumeRecords([]);
      setSelectedRunWaitResumeError(error instanceof Error ? error.message : String(error));
    } finally {
      setSelectedRunWaitResumeLoading(false);
    }
  }

  function buildReviewLink(includeSavedReviewWorkspace: boolean) {
    const url = new URL(window.location.href);
    if (!includeSavedReviewWorkspace) {
      url.searchParams.delete("srid");
      url.searchParams.delete("sra");
      url.searchParams.delete("srf");
      url.searchParams.delete("srsm");
    }
    return `${url.origin}${url.pathname}${url.search}${url.hash}`;
  }

  async function copyReviewLink(includeSavedReviewWorkspace = true) {
    setFeedback("");
    const href = buildReviewLink(includeSavedReviewWorkspace);
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    if (workflowId) {
      persistSharedReviewLinkForWorkflow(workflowId, href, includeSavedReviewWorkspace ? "workspace" : "core");
    }
    const savedReviewWorkspaceActive = currentSavedReviewWorkspaceActive();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(href);
        setFeedback(includeSavedReviewWorkspace && savedReviewWorkspaceActive
          ? "Copied investigation link to clipboard with the current run review and saved-review workspace context."
          : "Copied investigation link to clipboard with the current run review context only.");
        return;
      }
    } catch {
      // Fall through to the manual-copy guidance below.
    }
    setFeedback(includeSavedReviewWorkspace && savedReviewWorkspaceActive
      ? `Copy this investigation link manually. It includes the current run review and saved-review workspace context: ${href}`
      : `Copy this investigation link manually. It includes the current run review context only: ${href}`);
  }

  function resumeStoredSharedReview() {
    const record = storedSharedReviewRecordForCurrentWorkflow();
    if (!record?.href) {
      setFeedback("No shared investigation context is stored for this workflow yet.");
      return;
    }
    try {
      const parsed = new URL(record.href, window.location.origin);
      const reviewState = parseReviewUrlStateFromSearch(parsed.search);
      window.history.pushState({}, "", `${parsed.pathname}${parsed.search}${parsed.hash}`);
      applyReviewUrlNavigationState(reviewState);
      const shareMode = record.share_mode ?? inferStoredSharedReviewShareModeFromHref(record.href);
      setFeedback(shareMode === "workspace"
        ? "Restored the stored shared investigation and its saved-review workspace context for this workflow."
        : "Restored the stored shared investigation context for this workflow.");
    } catch {
      setFeedback("Could not restore the stored shared investigation link.");
    }
  }

  function renderStoredSharedReviewControls(resumeLabel: string) {
    return (
      <Suspense fallback={<WorkflowPaneFallback label="saved review controls" />}>
        <WorkflowStoredSharedReviewControls
          resumeLabel={resumeLabel}
          recordCount={() => storedSharedReviewRecordsForCurrentWorkflow().length}
          onResume={() => resumeStoredSharedReview()}
          compositionSummary={storedSharedReviewCompositionSummary}
          compositionChipClass={storedSharedReviewCompositionChipClass}
          compositionActionLabel={storedSharedReviewCompositionActionLabel}
          onApplyCompositionFocus={applyStoredSharedReviewCompositionFocus}
          activeFilters={storedSharedReviewActiveFilters}
          activeFilterClass={storedSharedReviewActiveFilterClass}
          activeFilterActionLabel={storedSharedReviewActiveFilterActionLabel}
          onClearActiveFilter={clearStoredSharedReviewActiveFilter}
          hasMultipleActiveFilters={storedSharedReviewHasMultipleActiveFilters}
          onResetSelectorNarrowing={resetStoredSharedReviewSelectorNarrowing}
          showAll={showAllStoredSharedReviews}
          toneLegendEntries={storedSharedReviewToneLegendEntries}
          legendClass={storedSharedReviewLegendClass}
          legendActionLabel={storedSharedReviewLegendActionLabel}
          onSetShowAll={setShowAllStoredSharedReviews}
          selectorEntries={storedSharedReviewSelectorEntries}
          filterValue={storedSharedReviewFilter}
          onSetFilter={setStoredSharedReviewFilter}
          shareModeFilter={storedSharedReviewShareModeFilter}
          onSetShareModeFilter={setStoredSharedReviewShareModeFilter}
          shareModeActionLabel={storedSharedReviewShareModeActionLabel}
          shareModeCounts={storedSharedReviewShareModeCounts}
          sortMode={storedSharedReviewSortMode}
          onSetSortMode={setStoredSharedReviewSortMode}
          sortActionLabel={storedSharedReviewSortActionLabel}
          visibleSelectorEntries={visibleStoredSharedReviewSelectorEntries}
          selectedEntryId={selectedStoredSharedReviewId}
          selectorEntryActionLabel={storedSharedReviewSelectorEntryActionLabel}
          onSelectEntry={setSelectedStoredSharedReviewId}
          expandActionLabel={storedSharedReviewExpandActionLabel}
          groupedSelectorEntries={groupedStoredSharedReviewSelectorEntries}
          collapseActionLabel={storedSharedReviewCollapseActionLabel}
          filteredSelectorEntries={filteredStoredSharedReviewSelectorEntries}
          emptyStateLabel={storedSharedReviewEmptyStateLabel}
          emptyStateActions={storedSharedReviewEmptyStateActions}
          title={storedSharedReviewTitle}
          savedAtLabel={storedSharedReviewSavedAtLabel}
          summary={storedSharedReviewSummary}
          previewContextSummary={storedSharedReviewPreviewContextSummary}
          previewContextClass={storedSharedReviewPreviewContextClass}
          previewContextActionLabel={storedSharedReviewPreviewContextActionLabel}
          onClearPreviewContext={clearStoredSharedReviewPreviewContext}
          hasMultiplePreviewContextEntries={storedSharedReviewHasMultiplePreviewContextEntries}
          onResetPreviewContext={resetStoredSharedReviewPreviewContext}
          staleness={storedSharedReviewStaleness}
          scopeMismatch={storedSharedReviewScopeMismatch}
          matchesCurrentView={storedSharedReviewMatchesCurrentView}
          onRefreshStoredReview={refreshStoredSharedReview}
          onRenameStoredReview={renameStoredSharedReview}
          onTogglePinStoredReview={togglePinStoredSharedReview}
          onForgetStoredReview={forgetStoredSharedReview}
          selectedEntryPinned={() => Boolean(storedSharedReviewRecordForCurrentWorkflow()?.pinned)}
        />
      </Suspense>
    );
  }

  function forgetStoredSharedReview() {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    const record = storedSharedReviewRecordForCurrentWorkflow();
    if (!workflowId || !record) {
      setFeedback("No stored shared investigation context is available to clear.");
      return;
    }
    clearStoredSharedReviewForWorkflow(workflowId, record.id);
    setFeedback("Cleared the stored shared investigation context for this workflow.");
  }

  function refreshStoredSharedReview() {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    if (!workflowId) {
      setFeedback("Select a workflow before refreshing its stored shared investigation.");
      return;
    }
    const href = window.location.href;
    persistSharedReviewLinkForWorkflow(workflowId, href, currentSavedReviewWorkspaceActive() ? "workspace" : "core");
    setFeedback("Updated the stored shared investigation to match the current review context.");
  }
  function renameStoredSharedReview() {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    const record = storedSharedReviewRecordForCurrentWorkflow();
    if (!workflowId || !record) {
      setFeedback("No stored shared investigation is selected to rename.");
      return;
    }
    const nextTitle = window.prompt("Name this saved investigation", record.title ?? "");
    if (nextTitle === null) return;
    updateStoredSharedReviewForWorkflow(workflowId, record.id, (entry) => ({
      ...entry,
      title: nextTitle.trim() || null,
    }));
    setFeedback(nextTitle.trim()
      ? `Renamed the saved investigation to "${nextTitle.trim()}".`
      : "Cleared the custom name for the saved investigation.");
  }
  function togglePinStoredSharedReview() {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    const record = storedSharedReviewRecordForCurrentWorkflow();
    if (!workflowId || !record) {
      setFeedback("No stored shared investigation is selected to pin.");
      return;
    }
    updateStoredSharedReviewForWorkflow(workflowId, record.id, (entry) => ({
      ...entry,
      pinned: !entry.pinned,
    }));
    setFeedback(record.pinned
      ? "Unpinned the saved investigation."
      : "Pinned the saved investigation.");
  }

  async function copyWorkflowLink() {
    setFeedback("");
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    const params = new URLSearchParams();
    if (workflowId) params.set("wf", workflowId);
    const href = `${window.location.origin}${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(href);
        setFeedback("Copied clean workflow link to clipboard without run or investigation state.");
        return;
      }
    } catch {
      // Fall through to the manual-copy guidance below.
    }
    setFeedback(`Copy this workflow link manually. It opens the workflow without run review context: ${href}`);
  }

  async function handleSave() {
    const workflow = currentWorkflow();
    if (!workflow) return;
    setBusyAction("save");
    setFeedback("");
    try {
      const response = await saveWorkflow({
        graph: normalizeGraph(workflow) as unknown as Record<string, unknown>,
        latest_ir: (workflow.latest_ir ?? undefined) as Record<string, unknown> | undefined,
        favorite: workflow.favorite,
        archived: Boolean(workflow.archived_at),
      });
      const saved = cloneJson(response.workflow);
      setCurrentWorkflow(saved);
      setSelectedWorkflowId(saved.workflow_id);
      mutate((current) => {
        const list = current ?? [];
        const idx = list.findIndex((entry) => entry.workflow_id === saved.workflow_id);
        if (idx >= 0) {
          const next = [...list];
          next[idx] = saved;
          return next;
        }
        return [saved, ...list];
      });
      setFeedback(`Saved "${saved.title}".`);
    } catch (error) {
      setFeedback(`Could not save workflow: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleValidate() {
    const workflow = currentWorkflow();
    if (!workflow) return;
    setBusyAction("validate");
    setFeedback("");
    try {
      const result = await validateWorkflow(normalizeGraph(workflow) as unknown as Record<string, unknown>);
      setValidationResult(result);
      setFeedback(result.valid ? "Workflow validation passed." : "Workflow validation found issues.");
    } catch (error) {
      setFeedback(`Could not validate workflow: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  function revalidateAfterGraphChange() {
    queueMicrotask(() => {
      void handleValidate();
    });
  }

  function updateTemplateSuggestionPreference(
    templateId: string,
    preference: "accepted" | "dismissed",
  ) {
    updateGraph((draft) => {
      const accepted = new Set(
        Array.isArray(draft.metadata["accepted_template_suggestions"])
          ? draft.metadata["accepted_template_suggestions"].filter((value): value is string => typeof value === "string")
          : [],
      );
      const dismissed = new Set(
        Array.isArray(draft.metadata["dismissed_template_suggestions"])
          ? draft.metadata["dismissed_template_suggestions"].filter((value): value is string => typeof value === "string")
          : [],
      );
      if (preference === "accepted") {
        accepted.add(templateId);
        dismissed.delete(templateId);
      } else {
        dismissed.add(templateId);
        accepted.delete(templateId);
      }
      return {
        ...draft,
        metadata: {
          ...draft.metadata,
          accepted_template_suggestions: [...accepted],
          dismissed_template_suggestions: [...dismissed],
          template_suggestion_reviewed_at: new Date().toISOString(),
        },
      };
    });
    revalidateAfterGraphChange();
  }

  function scaffoldTemplateSuggestion(templateId: string, matchedNodeIds: string[]) {
    const steps = templateScaffoldSteps(templateId);
    const runtimeLineage = suggestedTemplateRuntimeLineage(templateId);
    if (steps.length === 0) {
      return 0;
    }
    let insertedCount = 0;
    updateGraph((draft) => {
      const matchedNodes = matchedNodeIds
        .map((id) => draft.nodes.find((node) => node.id === id))
        .filter((node): node is WorkflowNodeDraft => Boolean(node));
      if (matchedNodes.length < 2) {
        return draft;
      }
      const sourceNode = matchedNodes[0];
      const targetNode = matchedNodes[matchedNodes.length - 1];
      const existingRoles = new Set(
        draft.nodes
          .map((node) => nodeSemanticRole(node))
          .filter((value): value is string => Boolean(value)),
      );
      const nodesToInsert = steps
        .filter((step) => !existingRoles.has(step.semanticRole))
        .map((step, index, filteredSteps) => {
          const ratio = (index + 1) / (filteredSteps.length + 1);
          return scaffoldNodeFromTemplateStep(step, {
            x: sourceNode.position.x + (targetNode.position.x - sourceNode.position.x) * ratio,
            y: sourceNode.position.y + (targetNode.position.y - sourceNode.position.y) * ratio - 56,
          });
        });
      if (nodesToInsert.length === 0) {
        if (!runtimeLineage) {
          return draft;
        }
      } else {
        insertedCount = nodesToInsert.length;
        const directEdgeIndex = draft.edges.findIndex((edge) => edge.source === sourceNode.id && edge.target === targetNode.id);
        if (directEdgeIndex >= 0) {
          draft.edges.splice(directEdgeIndex, 1);
        }
        draft.nodes.push(...nodesToInsert);
        const chain = [sourceNode.id, ...nodesToInsert.map((node) => node.id), targetNode.id];
        for (let index = 0; index < chain.length - 1; index += 1) {
          const source = chain[index];
          const target = chain[index + 1];
          if (!draft.edges.some((edge) => edge.source === source && edge.target === target)) {
            draft.edges.push({
              id: makeId("edge"),
              source,
              target,
              metadata: {
                scaffolded_from_template_suggestion: templateId,
              },
            });
          }
        }
      }
      const chain = [sourceNode.id, ...nodesToInsert.map((node) => node.id), targetNode.id];
      if (runtimeLineage) {
        const slotSequence = runtimeLineage.slotSequence.slice(0, chain.length);
        const relevantNodeIds = new Set(chain);
        draft.template_bindings = draft.template_bindings.filter((binding) =>
          !binding.node_ids.some((nodeId) => relevantNodeIds.has(nodeId)),
        );
        chain.forEach((nodeId, index) => {
          const slotName = slotSequence[index] ?? slotSequence[slotSequence.length - 1] ?? "finalize_slot";
          draft.template_bindings.push({
            template_id: runtimeLineage.runtimeTemplateId,
            slot_name: slotName,
            node_ids: [nodeId],
            metadata: {
              generated_by: "template_suggestion",
              workflow_family: templateId,
            },
          });
          draft.nodes = draft.nodes.map((node) =>
            node.id === nodeId
              ? {
                  ...node,
                  metadata: {
                    ...node.metadata,
                    template_id: runtimeLineage.runtimeTemplateId,
                    template_slot: slotName,
                    template_lineage_source: "template_suggestion",
                    suggested_workflow_family: templateId,
                  },
                }
              : node,
          );
        });
      }
      draft.metadata = {
        ...draft.metadata,
        scaffolded_template_suggestions: Array.from(
          new Set([
            ...(Array.isArray(draft.metadata["scaffolded_template_suggestions"])
              ? draft.metadata["scaffolded_template_suggestions"].filter((value): value is string => typeof value === "string")
              : []),
            templateId,
          ]),
        ),
        suggested_template_runtime_ids: Array.from(
          new Set([
            ...(Array.isArray(draft.metadata["suggested_template_runtime_ids"])
              ? draft.metadata["suggested_template_runtime_ids"].filter((value): value is string => typeof value === "string")
              : []),
            ...(runtimeLineage ? [runtimeLineage.runtimeTemplateId] : []),
          ]),
        ),
        preset_template_ids: Array.from(
          new Set([
            ...(Array.isArray(draft.metadata["preset_template_ids"])
              ? draft.metadata["preset_template_ids"].filter((value): value is string => typeof value === "string")
              : []),
            ...(runtimeLineage ? [runtimeLineage.runtimeTemplateId] : []),
          ]),
        ),
      };
      return draft;
    });
    if (insertedCount > 0) {
      revalidateAfterGraphChange();
    }
    return insertedCount;
  }

  function acceptTemplateSuggestion(templateId: string, title: string, matchedNodeIds: string[]) {
    if (workflowInteractionLocked()) return;
    updateTemplateSuggestionPreference(templateId, "accepted");
    const insertedCount = scaffoldTemplateSuggestion(templateId, matchedNodeIds);
    setFeedback(
      insertedCount > 0
        ? `Marked ${title} as the preferred reliable template and scaffolded ${insertedCount} supporting node${insertedCount === 1 ? "" : "s"}.`
        : `Marked ${title} as the preferred reliable template while keeping the graph customizable.`,
    );
  }

  function dismissTemplateSuggestion(templateId: string, title: string, _matchedNodeIds: string[]) {
    if (workflowInteractionLocked()) return;
    updateTemplateSuggestionPreference(templateId, "dismissed");
    setFeedback(`Kept the custom graph and dismissed the ${title} template suggestion for this draft.`);
  }

  async function promoteCurrentWorkflowToFamilyAsset() {
    const workflow = currentWorkflow();
    if (!workflow) return;
    const draft = normalizeGraph(workflow);
    const acceptedTemplateIds = Array.isArray(draft.metadata["accepted_template_suggestions"])
      ? draft.metadata["accepted_template_suggestions"].filter((value): value is string => typeof value === "string")
      : [];
    const runtimeTemplateIds = Array.isArray(draft.metadata["suggested_template_runtime_ids"])
      ? draft.metadata["suggested_template_runtime_ids"].filter((value): value is string => typeof value === "string")
      : [];
    if (acceptedTemplateIds.length === 0) {
      setFeedback("Accept at least one template suggestion before promoting a reusable workflow family.");
      return;
    }

    setBusyAction("save");
    setFeedback("");
    try {
      const familyId = makeId("family");
      const familyLabel = `${draft.title} family`;
      const parameterSchema = inferredWorkflowFamilyParameterSchema(acceptedTemplateIds);
      const defaultParameters = defaultWorkflowFamilyParameters(parameterSchema);
      const familyGraph: WorkflowGraphDraft = {
        ...cloneJson(draft),
        workflow_id: makeId("wf"),
        title: familyLabel,
        description: draft.description ?? `Reusable workflow family derived from ${draft.title}.`,
        metadata: {
          ...cloneJson(draft.metadata),
          workflow_family_asset: {
            family_id: familyId,
            family_label: familyLabel,
            source_workflow_id: workflow.workflow_id,
            template_ids: acceptedTemplateIds,
            runtime_template_ids: runtimeTemplateIds,
            parameter_schema: parameterSchema,
            default_parameters: defaultParameters,
            promoted_at: new Date().toISOString(),
          },
        },
      };
      const response = await saveWorkflow({
        graph: familyGraph as unknown as Record<string, unknown>,
        favorite: false,
        archived: false,
      });
      const saved = cloneJson(response.workflow);
      mutate((current) => [saved, ...(current ?? []).filter((entry) => entry.workflow_id !== saved.workflow_id)]);
      setFeedback(`Saved "${saved.title}" as a reusable workflow family asset.`);
    } catch (error) {
      setFeedback(`Could not promote workflow family asset: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function instantiateWorkflowFromFamilyAsset() {
    const workflow = currentWorkflow();
    if (!workflow) return;
    const familyAsset = workflowFamilyAssetRecord(workflow);
    if (!familyAsset?.family_id) {
      setFeedback("Select a workflow family asset before creating a new reusable instance.");
      return;
    }

    setBusyAction("save");
    setFeedback("");
    try {
      const draft = normalizeGraph(workflow);
      const instanceTitle = `${draft.title.replace(/\s+family$/i, "")} instance`;
      const appliedParameters = {
        ...defaultWorkflowFamilyParameters(familyAsset.parameter_schema),
        ...familyAsset.default_parameters,
        ...familyParameterDrafts(),
      };
      const instanceGraph: WorkflowGraphDraft = {
        ...cloneJson(draft),
        workflow_id: makeId("wf"),
        title: instanceTitle,
        instance_inputs: {
          family_id: familyAsset.family_id,
          family_workflow_id: workflow.workflow_id,
          family_asset_workflow_id: workflow.workflow_id,
          instance_workflow_id: makeId("wfinst"),
          values: appliedParameters,
        },
        metadata: {
          ...cloneJson(draft.metadata),
          workflow_family_instance: {
            family_id: familyAsset.family_id,
            family_workflow_id: workflow.workflow_id,
            family_asset_workflow_id: workflow.workflow_id,
            instance_workflow_id: "",
            family_label: familyAsset.family_label ?? draft.title,
            applied_parameters: appliedParameters,
            instantiated_at: new Date().toISOString(),
          },
        },
      };
      if (instanceGraph.instance_inputs) {
        instanceGraph.instance_inputs.instance_workflow_id = instanceGraph.workflow_id;
      }
      if (instanceGraph.metadata["workflow_family_instance"] && typeof instanceGraph.metadata["workflow_family_instance"] === "object") {
        (instanceGraph.metadata["workflow_family_instance"] as Record<string, unknown>).instance_workflow_id = instanceGraph.workflow_id;
      }
      delete (instanceGraph.metadata as Record<string, unknown>)["workflow_family_asset"];
      instanceGraph.nodes = instanceGraph.nodes.map((node) => {
        const semanticRole = nodeSemanticRole(node);
        if (semanticRole === "pdf_source" || semanticRole === "meeting_source") {
          const sourceKind =
            appliedParameters[semanticRole === "meeting_source" ? "meeting_source_kind" : "source_kind"];
          if (typeof sourceKind === "string" && sourceKind) {
            return {
              ...node,
              config: {
                ...node.config,
                source_kind: sourceKind,
              },
            };
          }
        }
        if (semanticRole === "weather_source") {
          return {
            ...node,
            config: {
              ...node.config,
              ...(appliedParameters.location_query ? { location_query: appliedParameters.location_query } : {}),
              ...(appliedParameters.forecast_days ? { forecast_days: Number(appliedParameters.forecast_days) || 7 } : {}),
            },
          };
        }
        if (semanticRole === "budget_source") {
          return {
            ...node,
            config: {
              ...node.config,
              ...(appliedParameters.horizon_months ? { horizon_months: Number(appliedParameters.horizon_months) || 6 } : {}),
              ...(appliedParameters.currency ? { currency: appliedParameters.currency } : {}),
            },
          };
        }
        if (semanticRole === "spreadsheet_output") {
          return {
            ...node,
            config: {
              ...node.config,
              final_schema: {
                ...((node.config.final_schema as Record<string, unknown> | undefined) ?? {}),
                formats: [appliedParameters.export_format || "xlsx"],
              },
            },
          };
        }
        if (semanticRole === "chart_output") {
          return {
            ...node,
            config: {
              ...node.config,
              final_schema: {
                ...((node.config.final_schema as Record<string, unknown> | undefined) ?? {}),
                preferred_chart_type: appliedParameters.chart_type || "line",
              },
            },
          };
        }
        if (semanticRole === "digest_output") {
          return {
            ...node,
            config: {
              ...node.config,
              final_schema: {
                ...((node.config.final_schema as Record<string, unknown> | undefined) ?? {}),
                digest_kind: appliedParameters.digest_style || "summary",
              },
            },
          };
        }
        if (semanticRole === "review_step" && appliedParameters.review_mode === "suggest_only") {
          return {
            ...node,
            policy: {
              ...node.policy,
              approval_mode: "suggest_only",
            },
          };
        }
        return node;
      });
      const response = await saveWorkflow({
        graph: instanceGraph as unknown as Record<string, unknown>,
        favorite: false,
        archived: false,
      });
      const saved = cloneJson(response.workflow);
      mutate((current) => [saved, ...(current ?? []).filter((entry) => entry.workflow_id !== saved.workflow_id)]);
      setCurrentWorkflow(saved);
      setSelectedWorkflowId(saved.workflow_id);
      setSelectedNodeId(normalizeGraph(saved).nodes[0]?.id ?? null);
      setValidationResult(null);
      setFeedback(`Created "${saved.title}" from the reusable workflow family asset.`);
    } catch (error) {
      setFeedback(`Could not create workflow from family asset: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCompile() {
    const workflow = currentWorkflow();
    if (!workflow) return;
    setBusyAction("compile");
    setFeedback("");
    try {
      if (!(workflows() ?? []).some((entry) => entry.workflow_id === workflow.workflow_id)) {
        await handleSave();
      }
      const response = await compileWorkflow(currentWorkflow()?.workflow_id ?? workflow.workflow_id);
      setCurrentWorkflow((current) => current ? { ...current, latest_ir: response.ir, updated_at: new Date().toISOString() } : current);
      mutate((current) => (current ?? []).map((entry) => entry.workflow_id === response.workflow_id ? { ...entry, latest_ir: response.ir } : entry));
      setFeedback("Compiled workflow into deterministic runtime IR.");
      void refetch();
    } catch (error) {
      setFeedback(`Could not compile workflow: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleWorkflowAction(action: "favorite" | "archive" | "deploy" | "rollback", options?: {
    favorite?: boolean;
    archived?: boolean;
    environment?: "dev" | "prod";
    deployment_id?: string;
    connector_overrides?: WorkflowConnectorOverrides;
  }) {
    const workflow = currentWorkflow();
    if (!workflow) return;
    setBusyAction(action);
    setFeedback("");
    try {
      if (action === "deploy" && !workflow.latest_ir) {
        setFeedback("Compile the workflow before deploying it.");
        return;
      }
      const response = await runWorkflowAction(workflow.workflow_id, {
        action,
        favorite: options?.favorite,
        archived: options?.archived,
        environment: options?.environment,
        deployment_id: options?.deployment_id,
        connector_overrides: options?.connector_overrides,
      });
      const updated = response.workflow;
      setCurrentWorkflow(updated);
      mutate((current) => (current ?? []).map((entry) => entry.workflow_id === updated.workflow_id ? updated : entry));
      if (action === "deploy" || action === "rollback") {
        await refreshDeploymentHistory(updated.workflow_id);
      }
      if (action === "deploy" || action === "rollback") {
        extendLiveRefreshWindow();
      }
      if (action === "deploy") {
        setDeployPreviewOpen(false);
      }
      if (action === "rollback") {
        setRollbackPreviewDeploymentId(null);
      }
      if (action === "deploy" && response.deployment_id) {
        setFeedback(`Workflow deployed with deployment id ${response.deployment_id}.`);
      } else if (action === "rollback" && response.deployment_id) {
        setFeedback(`Workflow rolled back with deployment id ${response.deployment_id}.`);
      } else if (action === "favorite") {
        setFeedback(updated.favorite ? "Workflow favorited." : "Workflow removed from favorites.");
      } else {
        setFeedback(updated.archived_at ? "Workflow archived." : "Workflow restored from archive.");
      }
    } catch (error) {
      setFeedback(`Could not ${action} workflow: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRunAction(kind: "start" | "replay", options?: {
    deployment_id?: string;
    replay_run_id?: string;
  }) {
    const workflow = currentWorkflow();
    if (!workflow) return;
    setBusyAction(kind === "start" ? "run" : "replay");
    setFeedback("");
    try {
      const response = await startWorkflowRun(workflow.workflow_id, {
        deployment_id: options?.deployment_id,
        replay_run_id: options?.replay_run_id,
        trigger_kind: kind === "replay" ? "replay" : "manual",
      });
      markWorkflowRun(workflow.workflow_id);
      extendLiveRefreshWindow();
      await refreshRunHistory(workflow.workflow_id);
      setSelectedRunId(response.run.run_id);
      if (kind === "replay") {
        setReplayPreviewRunId(null);
      }
      if (response.run.status === "waiting_for_approval") {
        setFeedback(`Workflow run ${response.run.run_id} is waiting for approval.`);
      } else if (response.run.status === "waiting_for_resume") {
        setFeedback(`Workflow run ${response.run.run_id} is waiting for a delayed resume.`);
      } else if (response.run.status === "blocked") {
        setFeedback(`Workflow run ${response.run.run_id} was blocked by policy.`);
      } else if (response.run.status === "failed") {
        setFeedback(`Workflow run ${response.run.run_id} failed.`);
      } else {
        setFeedback(
          kind === "replay"
            ? `Replay started from run ${options?.replay_run_id} as ${response.run.run_id}.`
            : `Workflow run ${response.run.run_id} completed.`,
        );
      }
    } catch (error) {
      setFeedback(`Could not ${kind} workflow run: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDryRun() {
    const workflow = currentWorkflow();
    const deploymentId = deploymentHistory()[0]?.deployment_id;
    if (!workflow || !deploymentId) return;
    setBusyAction("dry_run");
    setFeedback("");
    try {
      const response = await startWorkflowRun(workflow.workflow_id, {
        deployment_id: deploymentId,
        trigger_kind: "dry_run",
      });
      extendLiveRefreshWindow();
      await refreshRunHistory(workflow.workflow_id);
      setSelectedRunId(response.run.run_id);
      setFeedback(
        response.run.status === "waiting_for_approval"
          ? `Dry run ${response.run.run_id} paused at an approval boundary.`
          : response.run.status === "waiting_for_resume"
            ? `Dry run ${response.run.run_id} paused at a delayed resume boundary.`
          : response.run.status === "blocked"
            ? `Dry run ${response.run.run_id} was blocked by policy.`
            : response.run.status === "failed"
              ? `Dry run ${response.run.run_id} failed.`
          : `Dry run ${response.run.run_id} completed.`,
      );
    } catch (error) {
      setFeedback(`Could not dry run workflow: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleWorkflowApprovalDecision(
    run: WorkflowRun,
    option: Record<string, unknown>,
  ) {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    if (!workflowId) {
      setFeedback("Select a workflow before recording an approval decision.");
      return;
    }
    const optionId =
      typeof option.option_id === "string" && option.option_id.trim() ? option.option_id.trim() : undefined;
    const optionLabel =
      typeof option.label === "string" && option.label.trim()
        ? option.label.trim()
        : optionId ?? "Approval option";
    const decision = workflowApprovalDecisionForOption(option);
    setBusyAction(`workflow_approval_${decision}`);
    setFeedback("");
    try {
      const waitResume = await listWorkflowWaitResumeRecords(workflowId, run.run_id);
      const pendingApprovalRecord = waitResume.wait_resume_records.find((record) =>
        record.status === "pending" && record.resume_family === "approval",
      );
      if (!pendingApprovalRecord) {
        setFeedback("This run no longer has a pending approval wait to decide.");
        return;
      }
      const response = await decideWorkflowWaitResume(
        workflowId,
        run.run_id,
        pendingApprovalRecord.wait_resume_id,
        {
          decision,
          option_id: optionId,
        },
      );
      extendLiveRefreshWindow();
      await refreshRunHistory(workflowId);
      setSelectedRunId(response.run.run_id);
      setFeedback(
        decision === "approved"
          ? `${optionLabel} resumed workflow run ${response.run.run_id}.`
          : `${optionLabel} cancelled workflow run ${response.run.run_id}.`,
      );
    } catch (error) {
      setFeedback(`Could not record workflow approval decision: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusyAction(null);
    }
  }

  // 19j Ã¢â‚¬â€ replay a run using its run_id
  async function replayRun(run: WorkflowRun) {
    setReplayingRunId(run.run_id);
    try {
      await startWorkflowRun(run.workflow_id, {
        replay_run_id: run.run_id,
        trigger_kind: "replay",
      });
      extendLiveRefreshWindow();
      await refreshRunHistory(run.workflow_id);
    } catch { /* ignore */ }
    finally { setReplayingRunId(null); }
  }

  function patchWorkflowMeta(fields: {
    title?: string;
    description?: string;
    environment?: string;
    optimization_mode?: string;
  }) {
    if (workflowInteractionLocked()) return;
    void handleWorkflowPatch({ op: "workflow_meta_replace", ...fields });
  }

  createEffect(() => {
    const workflow = currentWorkflow();
    if (!workflow) return;
    const environment = normalizeGraph(workflow).environment === "prod" ? "prod" : "dev";
    setDeployOverrideDraft((current) => {
      const currentMatchesProd =
        current.delivery_tier === "production"
        || current.auth_mode === "tenant_credentials"
        || current.side_effects === "executed"
        || current.provider_route === "primary";
      const nextDefault = deploymentOverrideDraftForEnvironment(environment);
      if ((environment === "prod" && currentMatchesProd) || (environment === "dev" && !currentMatchesProd)) {
        return current;
      }
      return nextDefault;
    });
  });

  const connectorOverrideTargets = () => {
    const workflow = currentWorkflow();
    if (!workflow) return { families: [] as string[], nodes: [] as Array<{ id: string; label: string; family: string }> };
    const graph = normalizeGraph(workflow);
    const nodes = graph.nodes
      .filter((node) => node.kind === "tool")
      .map((node) => ({
        id: node.id,
        label: node.label,
        family: workflowNodeIntegrationFamily(node) ?? "integration",
      }));
    const families = Array.from(new Set(nodes.map((node) => node.family))).sort();
    return { families, nodes };
  };

  function deploymentOverridePayload(): WorkflowConnectorOverrides {
    const familyOverrides = Object.fromEntries(
      Object.entries(deployFamilyOverrides())
        .map(([key, value]) => [key, compactOverrideDraft(value)])
        .filter((entry): entry is [string, WorkflowConnectorOverrideFields] => Boolean(entry[1])),
    );
    const nodeOverrides = Object.fromEntries(
      Object.entries(deployNodeOverrides())
        .map(([key, value]) => [key, compactOverrideDraft(value)])
        .filter((entry): entry is [string, WorkflowConnectorOverrideFields] => Boolean(entry[1])),
    );
    return {
      ...deployOverrideDraft(),
      ...(Object.keys(familyOverrides).length > 0 ? { family_overrides: familyOverrides } : {}),
      ...(Object.keys(nodeOverrides).length > 0 ? { node_overrides: nodeOverrides } : {}),
    };
  }

  function patchSelectedNodePrompt(prompt: {
    system_prompt?: string;
    instruction_prompt?: string;
    user_editable?: boolean;
  }) {
    if (workflowInteractionLocked()) return;
    const nodeId = selectedNodeId();
    if (!nodeId) return;
    void handleWorkflowPatch({ op: "node_prompt_replace", node_id: nodeId, prompt });
  }

  function patchSelectedNodeMeta(fields: {
    label?: string;
    description?: string;
  }) {
    if (workflowInteractionLocked()) return;
    const nodeId = selectedNodeId();
    if (!nodeId) return;
    void handleWorkflowPatch({ op: "node_meta_replace", node_id: nodeId, ...fields });
  }

  function replaceSelectedNodeConfig(nextConfig: Record<string, unknown>) {
    const nodeId = selectedNodeId();
    if (!nodeId) return;
    updateSelectedNode((current) => ({ ...current, config: nextConfig }));
    setConfigText(JSON.stringify(nextConfig, null, 2));
  }

  function patchSelectedNodeConfig(nextConfig: Record<string, unknown>) {
    if (workflowInteractionLocked()) return;
    const nodeId = selectedNodeId();
    if (!nodeId) return;
    replaceSelectedNodeConfig(nextConfig);
    void handleWorkflowPatch({ op: "node_config_replace", node_id: nodeId, config: nextConfig });
  }

  function selectedNodeOutgoingTargets() {
    const draft = graph();
    const node = selectedNode();
    if (!draft || !node) return [] as WorkflowNodeDraft[];
    const targets = draft.edges
      .filter((edge) => edge.source === node.id)
      .map((edge) => draft.nodes.find((candidate) => candidate.id === edge.target))
      .filter((candidate): candidate is WorkflowNodeDraft => Boolean(candidate));
    return targets;
  }

  function selectedNodeOutgoingEdges() {
    const draft = graph();
    const node = selectedNode();
    if (!draft || !node) {
      return [] as Array<{ edge: WorkflowEdgeDraft; targetNode: WorkflowNodeDraft }>;
    }
    return draft.edges
      .filter((edge) => edge.source === node.id)
      .map((edge) => {
        const targetNode = draft.nodes.find((candidate) => candidate.id === edge.target);
        return targetNode ? { edge, targetNode } : null;
      })
      .filter((candidate): candidate is { edge: WorkflowEdgeDraft; targetNode: WorkflowNodeDraft } => Boolean(candidate));
  }

  async function applyBranchPreset(labels: string[]) {
    if (workflowInteractionLocked()) return;
    const workflow = await ensureWorkflowPersisted();
    const node = selectedNode();
    const outgoingEdges = selectedNodeOutgoingEdges();
    if (!workflow || !node || outgoingEdges.length === 0) {
      setFeedback("Connect this node to downstream branches before applying a branch preset.");
      return;
    }
    const normalizedLabels = outgoingEdges.map((_, index) => labels[index] ?? labels[labels.length - 1] ?? "");
    updateGraph((draft) => ({
      ...draft,
      edges: draft.edges.map((edge) => {
        const edgeIndex = outgoingEdges.findIndex((entry) => entry.edge.id === edge.id);
        return edgeIndex >= 0
          ? { ...edge, condition_label: normalizedLabels[edgeIndex] || undefined }
          : edge;
      }),
    }));
    try {
      let latestWorkflow: SavedWorkflow | null = null;
      for (const [index, entry] of outgoingEdges.entries()) {
        const response = await patchWorkflow(workflow.workflow_id, {
          op: "edge_meta_replace",
          edge_id: entry.edge.id,
          condition_label: normalizedLabels[index] || undefined,
        });
        latestWorkflow = cloneJson(response.workflow);
      }
      if (latestWorkflow) {
        setCurrentWorkflow(latestWorkflow);
        setSelectedWorkflowId(latestWorkflow.workflow_id);
        mutate((current) =>
          (current ?? []).map((entry) =>
            entry.workflow_id === latestWorkflow?.workflow_id ? latestWorkflow : entry,
          ),
        );
      }
      setFeedback(`Applied branch preset to ${node.label}.`);
    } catch (error) {
      setFeedback(`Could not apply branch preset: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function applyBranchScaffold(labels: string[]) {
    if (workflowInteractionLocked()) return;
    const workflow = currentWorkflow();
    const node = selectedNode();
    const draft = graph();
    if (!workflow || !node || !draft) return;
    if (selectedNodeOutgoingEdges().length > 0) {
      setFeedback("This node already has outgoing branches. Use branch presets to relabel them or remove them before scaffolding new ones.");
      return;
    }

    const nextNodes = labels.map((label, index) => {
      const blueprint = branchScaffoldBlueprint(label, node.kind);
      const id = makeId("node");
      return {
        id,
        kind: blueprint.kind,
        label: titleCase(label),
        description: blueprint.description,
        position: {
          x: node.position.x + 260,
          y: node.position.y + index * 120 - ((labels.length - 1) * 60),
        },
        config: blueprint.config,
        policy: defaultPolicy(),
        prompt: blueprint.prompt,
        hidden_runtime_nodes: runtimeHints(blueprint.kind),
        metadata: {
          ...blueprint.metadata,
          generated_by: "branch_scaffold",
          source_node_id: node.id,
          branch_label: label,
        },
      } satisfies WorkflowNodeDraft;
    });

    const nextEdges = nextNodes.map((branchNode, index) => ({
      id: makeId("edge"),
      source: node.id,
      target: branchNode.id,
      condition_label: labels[index],
      metadata: {
        generated_by: "branch_scaffold",
      },
    } satisfies WorkflowEdgeDraft));

    const nextGraph: WorkflowGraphDraft = {
      ...draft,
      nodes: [...draft.nodes, ...nextNodes],
      edges: [...draft.edges, ...nextEdges],
    };

    setCurrentWorkflow({
      ...workflow,
      title: nextGraph.title,
      description: nextGraph.description,
      graph: nextGraph,
      latest_ir: null,
      updated_at: new Date().toISOString(),
    });
    setSelectedNodeId(nextNodes[0]?.id ?? node.id);

    try {
      const response = await saveWorkflow({
        graph: nextGraph as unknown as Record<string, unknown>,
        favorite: workflow.favorite,
        archived: Boolean(workflow.archived_at),
      });
      const saved = cloneJson(response.workflow);
      setCurrentWorkflow(saved);
      setSelectedWorkflowId(saved.workflow_id);
      mutate((current) => {
        const list = current ?? [];
        const index = list.findIndex((entry) => entry.workflow_id === saved.workflow_id);
        if (index >= 0) {
          const next = [...list];
          next[index] = saved;
          return next;
        }
        return [saved, ...list];
      });
      setFeedback(`Created a ${labels.join(" / ")} branch scaffold from ${node.label}. Compiled IR was cleared and should be rebuilt before deploy.`);
    } catch (error) {
      setFeedback(`Could not create branch scaffold: ${error instanceof Error ? error.message : String(error)}`);
    }
  }


  // Bundle all state for context-consuming sub-components
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctxValue: Record<string, any> = {
    // signals
    selectedWorkflowId, setSelectedWorkflowId,
    currentWorkflow, setCurrentWorkflow,
    selectedNodeId, setSelectedNodeId,
    selectedInspectorSection, setSelectedInspectorSection,
    selectedInspectorFocusSource, setSelectedInspectorFocusSource,
    selectedInspectorFocusTarget, setSelectedInspectorFocusTarget,
    selectedCompiledAfpFilter, setSelectedCompiledAfpFilter,
    selectedCompiledAfpGapFilter, setSelectedCompiledAfpGapFilter,
    selectedCompiledAfpReadinessFocus, setSelectedCompiledAfpReadinessFocus,
    selectedCompiledOrchestrationRole, setSelectedCompiledOrchestrationRole,
    selectedCompiledAfpRouteFocus, setSelectedCompiledAfpRouteFocus,
    selectedCompiledManifestLinkageFilter, setSelectedCompiledManifestLinkageFilter,
    selectedCompiledRouteLinkageFilter, setSelectedCompiledRouteLinkageFilter,
    selectedRunId, setSelectedRunId,
    selectedRunEdgeId, setSelectedRunEdgeId,
    editingEdgeLabelId, setEditingEdgeLabelId,
    editingEdgeLabelValue, setEditingEdgeLabelValue,
    workflowIntent, setWorkflowIntent,
    intentPresetOverride, setIntentPresetOverride,
    intentOptimizationOverride, setIntentOptimizationOverride,
    regenerationMode, setRegenerationMode,
    selectedDescribeHistoryEventId, setSelectedDescribeHistoryEventId,
    collapsedBranchFamilies, setCollapsedBranchFamilies,
    collapsedNodes, setCollapsedNodes,
    workflowTags, setWorkflowTags,
    tagFilter, setTagFilter,
    feedback, setFeedback,
    busyAction, setBusyAction,
    liveRefreshUntil, setLiveRefreshUntil,
    validationResult, setValidationResult,
    familyParameterDrafts, setFamilyParameterDrafts,
    deploymentHistory, setDeploymentHistory,
    rollbackPreviewDeploymentId, setRollbackPreviewDeploymentId,
    selectedDeploymentRecordId, setSelectedDeploymentRecordId,
    deployPreviewOpen, setDeployPreviewOpen,
    replayPreviewRunId, setReplayPreviewRunId,
    runTimelineFilterMode, setRunTimelineFilterMode,
    runTimelineFocusNodeId, setRunTimelineFocusNodeId,
    runHistoryDriftFilter, setRunHistoryDriftFilter,
    runHistorySortMode, setRunHistorySortMode,
    runHistoryFamilyFilter, setRunHistoryFamilyFilter,
    runHistoryAssetFilter, setRunHistoryAssetFilter,
    runHistoryInstanceFilter, setRunHistoryInstanceFilter,
    persistedRunSelections, setPersistedRunSelections,
    persistedRunReviewContexts, setPersistedRunReviewContexts,
    persistedSharedReviewLinks, setPersistedSharedReviewLinks,
    persistedStoredSharedReviewUiContexts, setPersistedStoredSharedReviewUiContexts,
    selectedStoredSharedReviewId, setSelectedStoredSharedReviewId,
    showAllStoredSharedReviews, setShowAllStoredSharedReviews,
    storedSharedReviewFilter, setStoredSharedReviewFilter,
    storedSharedReviewSortMode, setStoredSharedReviewSortMode,
    storedSharedReviewShareModeFilter, setStoredSharedReviewShareModeFilter,
    storedSharedReviewPinnedOnly, setStoredSharedReviewPinnedOnly,
    restoringRunReviewContext, setRestoringRunReviewContext,
    pendingUrlReviewState, setPendingUrlReviewState,
    sharedReviewBannerVisible, setSharedReviewBannerVisible,
    deployOverrideDraft, setDeployOverrideDraft,
    deployFamilyOverrides, setDeployFamilyOverrides,
    deployNodeOverrides, setDeployNodeOverrides,
    runHistory, setRunHistory,
    selectedRunWaitResumeRecords, setSelectedRunWaitResumeRecords,
    selectedRunWaitResumeLoading, setSelectedRunWaitResumeLoading,
    selectedRunWaitResumeError, setSelectedRunWaitResumeError,
    liveRunStreamEvents, setLiveRunStreamEvents,
    liveRunStreamConnected, setLiveRunStreamConnected,
    configText, setConfigText,
    policyText, setPolicyText,
    edgeSource, setEdgeSource,
    edgeTarget, setEdgeTarget,
    edgeConditionLabel, setEdgeConditionLabel,
    connectorAdapters, setConnectorAdapters,
    triggerRegistrations, setTriggerRegistrations,
    triggerRegistrationsLoading, setTriggerRegistrationsLoading,
    showMinimap, setShowMinimap,
    ctxMenu, setCtxMenu,
    nodeComments, setNodeComments,
    editingCommentNodeId, setEditingCommentNodeId,
    commentDraft, setCommentDraft,
    replayingRunId, setReplayingRunId,
    zoom, setZoom,
    highlightedNodeId, setHighlightedNodeId,
    workflowVersions, setWorkflowVersions,
    showVersionsId, setShowVersionsId,
    showIdleNodes, setShowIdleNodes,
    nowMs, setNowMs,
    nodeSearchQuery, setNodeSearchQuery,
    clonedId, setClonedId,
    nodeErrorIds, setNodeErrorIds,
    gotoNodeId, setGotoNodeId,
    replayActive, setReplayActive,
    replayStepIdx, setReplayStepIdx,
    dragGhostOrigin, setDragGhostOrigin,
    versionDiffIds, setVersionDiffIds,
    // computed / memos
    graph, minimapBounds, upstreamOf, downstreamOf, matchingNodeIds,
    idleNodes, workflowRunEta, nodeSuccessRates,
    selectedNode, selectedRun, selectedRunWaitResumeSummary,
    latestRunForDeployment, focusDeploymentRecord, focusPolicyDiffReview,
    storedSharedReviewLinkForCurrentWorkflow,
    activeDeployment, nodeDeploymentPolicies, pendingNodeDeploymentPolicies,
    pendingDeploymentChangeSummary, deployPreviewDiff, deploymentHistoryById,
    nodeLabelById, sharedReviewBannerSummary,
    selectedRunEdge, selectedRunEdgeTimeline,
    selectedRunStatuses, selectedRunStepOrder, selectedRunEdgeStates,
    selectedRunNodePolicyDeltas, selectedRunEdgePolicyDeltas,
    liveRunNodeOverlays, runHistoryEntries, runHistoryLineageOptions,
    connectorOverrideTargets, selectedNodeOutgoingTargets, selectedNodeOutgoingEdges,
    intentExpansion, regenerationImpact, selectedDescribeHistoryEntry, describeHistoryComparison,
    workflowInteractionLocked, workflowExecutionRefreshing, workflowInteractionLockLabel,
    // handlers
    loadWorkflow, createNewWorkflow, handleSave, handleValidate, handleCompile,
    handleWorkflowAction, handleRunAction, handleDryRun, handleWorkflowPatch,
    createWorkflowFromIntent, regenerateCurrentWorkflowFromIntent,
    applyDescribeHistoryEntry, saveWorkflowBranchFromDescribeHistory,
    refreshDeploymentHistory, refreshRunHistory,
    instantiateWorkflowFromFamilyAsset, promoteCurrentWorkflowToFamilyAsset,
    resetSharedInvestigationView, copyReviewLink, copyWorkflowLink,
    applyBranchPreset, applyBranchScaffold, startReplay, replayRun,
    cloneWorkflow, exportWorkflowJson, snapshotVersion, elapsedLabel,
    renderStoredSharedReviewControls, deploymentOverridePayload,
    // refs
    canvasRefHolder, dragStateHolder,
    // misc
    workflowsForRail, branchWorkflowVisibleInRail, branchFamilySummary,
    siblingBranchCount, expandAllBranchFamilies, collapseOtherBranchFamilies,
    refetch, mutate,
  };

  return (
    <WorkflowsCtx.Provider value={ctxValue}>
    <div class="space-y-5">
      <WorkflowsComposerPanel />
      <Show when={feedback()}>
        <div class="glass-surface rounded-[22px] border border-white/35 px-5 py-4 text-sm text-on-surface-variant shadow-panel">{feedback()}</div>
      </Show>

      <div class="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <div class="glass-surface rounded-[26px] border border-white/35 p-4 shadow-panel">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-on-surface">Saved workflows</p>
              <p class="text-xs uppercase tracking-[0.18em] text-on-surface-variant">revisit - favorite - compile</p>
              <Show when={branchFamilySummary().familyCount > 0}>
                <p class="mt-1 text-[11px] uppercase tracking-[0.14em] text-emerald-700">
                  {branchFamilySummary().familyCount} branch famil{branchFamilySummary().familyCount === 1 ? "y" : "ies"}
                  <Show when={branchFamilySummary().collapsedCount > 0}>
                    {" "}Ã‚Â· {branchFamilySummary().collapsedCount} collapsed
                  </Show>
                </p>
              </Show>
            </div>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                class="rounded-full border border-white/40 bg-white/45 px-3 py-1 text-xs font-medium text-on-surface-variant transition hover:bg-white/60"
                onClick={expandAllBranchFamilies}
              >
                Expand all
              </button>
              <button
                type="button"
                class="rounded-full border border-white/40 bg-white/45 px-3 py-1 text-xs font-medium text-on-surface-variant transition hover:bg-white/60"
                onClick={collapseOtherBranchFamilies}
              >
                Collapse others
              </button>
              <button type="button" class="rounded-full border border-white/40 bg-white/45 px-3 py-1 text-xs font-medium text-on-surface-variant transition hover:bg-white/60" onClick={() => void refetch()}>Refresh</button>
            </div>
          </div>
          <div class="mt-4 space-y-3">
            {/* 22h Ã¢â‚¬â€ node search input */}
            <div class="relative">
              <input
                type="text"
                placeholder="Filter nodes..."
                value={nodeSearchQuery()}
                onInput={(e) => setNodeSearchQuery(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const first = matchingNodeIds() ? [...matchingNodeIds()!][0] : null;
                    if (first) { setSelectedNodeId(first); setGotoNodeId(first); }
                  }
                }}
                class="w-full rounded-full border border-white/40 bg-white/60 px-3 py-1.5 pr-7 text-xs text-on-surface outline-none placeholder:text-on-surface-variant/50 focus:border-primary/40"
              />
              <Show when={nodeSearchQuery().length > 0}>
                <button
                  type="button"
                  onClick={() => setNodeSearchQuery("")}
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/40 transition hover:text-on-surface-variant"
                  aria-label="Clear search"
                >×</button>
              </Show>
            </div>
            {matchingNodeIds() && (
              <p class="text-[10px] text-on-surface-variant text-right">
                {matchingNodeIds()!.size === 0 ? "No matches" : `${matchingNodeIds()!.size} node${matchingNodeIds()!.size === 1 ? "" : "s"} — press Enter to focus first`}
              </p>
            )}
            <Show when={!workflows.loading} fallback={<p class="text-sm text-on-surface-variant">Loading workflows...</p>}>
              <Show when={workflowsForRail().length > 0} fallback={<></>}>
                {/* 18k Ã¢â‚¬â€ tag filter bar */}
                <Show when={Object.values(workflowTags()).flat().length > 0}>
                  <div class="flex flex-wrap gap-1 mb-2">
                    <button
                      onClick={() => setTagFilter("")}
                      class={`rounded-full px-2 py-0.5 text-[10px] border transition ${!tagFilter() ? "bg-primary text-white border-primary" : "border-white/30 text-on-surface-variant hover:bg-white/30"}`}>
                      All
                    </button>
                    <For each={[...new Set(Object.values(workflowTags()).flat())]}>
                      {(tag) => (
                        <button onClick={() => setTagFilter(t => t === tag ? "" : tag)}
                          class={`rounded-full px-2 py-0.5 text-[10px] border transition ${tagFilter() === tag ? "bg-primary text-white border-primary" : "border-white/30 text-on-surface-variant hover:bg-white/30"}`}>
                          #{tag}
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
                <For each={filteredWorkflowsForRail()}>
                  {(workflow) => {
                    const info = summary(workflow);
                    const isSelected = selectedWorkflowId() === workflow.workflow_id;
                    const branchOrigin = branchOriginRecord(workflow);
                    const isBranchChild = isBranchChildWorkflow(workflow);
                    const familyRootId = branchFamilyRootId(workflow);
                    const siblingCount = siblingBranchCount(workflow);
                    const siblings = siblingBranches(workflow);
                    const isBranchFamilyRoot = !isBranchChild && siblingCount > 0;
                    const familyCollapsed = branchFamilyCollapsed(familyRootId);
                    return (
                      <Show when={branchWorkflowVisibleInRail(workflow)}>
                        <Suspense fallback={<WorkflowPaneFallback label="workflow rail card" />}>
                        <WorkflowRailCard
                          workflow={workflow}
                          nodeCount={info.nodeCount}
                          isSelected={isSelected}
                          isBranchChild={isBranchChild}
                          isBranchFamilyRoot={isBranchFamilyRoot}
                          familyCollapsed={familyCollapsed}
                          siblingCount={siblingCount}
                          siblings={siblings}
                          selectedWorkflowId={selectedWorkflowId()}
                          branchOriginParentWorkflowId={branchOrigin?.parent_workflow_id}
                          onToggleFamily={() => toggleBranchFamily(familyRootId)}
                          onLoadWorkflow={loadWorkflow}
                        />
                        </Suspense>
                        <Show when={!workflowHasRun().has(workflow.workflow_id)}>
                          <div class="mt-0.5 px-1">
                            <span class="rounded-full border border-outline/20 bg-outline/8 px-2 py-0.5 font-mono text-[9px] text-on-surface-variant/40">
                              Never run
                            </span>
                          </div>
                        </Show>
                        {(() => {
                          const stats = workflowRunStats()[workflow.workflow_id];
                          if (!stats) return null;
                          const total = stats.ok + stats.fail;
                          if (total === 0) return null;
                          const rate = Math.round((stats.ok / total) * 100);
                          const colorClass = rate >= 90
                            ? "text-emerald-600 border-emerald-500/25 bg-emerald-500/8"
                            : rate >= 60
                              ? "text-amber-500 border-amber-400/25 bg-amber-400/8"
                              : "text-red-500 border-red-400/25 bg-red-400/8";
                          return (
                            <div class="mt-0.5 px-1">
                              <span class={`rounded-full border px-2 py-0.5 font-mono text-[9px] ${colorClass}`}>
                                {rate}% ok · {total} run{total === 1 ? "" : "s"}
                              </span>
                            </div>
                          );
                        })()}
                        {/* 18k Ã¢â‚¬â€ tags section below the rail card */}
                        <div class="mt-1 flex flex-wrap gap-1 px-1">
                          <For each={workflowTags()[workflow.workflow_id] ?? []}>
                            {(tag) => (
                              <span class="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">#{tag}</span>
                            )}
                          </For>
                          <TagInput workflowId={workflow.workflow_id} tags={workflowTags()} onSave={(id, tags) => {
                            const next = { ...workflowTags(), [id]: tags };
                            setWorkflowTags(next);
                            try { localStorage.setItem(WORKFLOW_TAGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
                          }} />
                        </div>
                        {/* 22i Ã¢â‚¬â€ clone workflow button */}
                        <div class="mt-1 px-1 flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            title="Clone this workflow"
                            onClick={(e) => { e.stopPropagation(); void cloneWorkflow(workflow.workflow_id); }}
                            class="rounded-full border border-white/30 bg-white/20 px-2 py-0.5 text-[9px] text-on-surface-variant transition hover:bg-white/40 hover:text-primary"
                          >
                            Ã¢Â§â€° Clone
                          </button>
                          <Show when={clonedId() === workflow.workflow_id}>
                            <span class="text-[9px] text-emerald-600 font-medium">Cloned!</span>
                          </Show>
                        </div>
                        {/* 20j Ã¢â‚¬â€ workflow version history */}
                        <div class="mt-1 px-1 flex flex-wrap gap-1">
                          <button type="button" onClick={() => setShowVersionsId(id => id === workflow.workflow_id ? null : workflow.workflow_id)}
                            class="rounded-full border border-white/30 px-2 py-0.5 text-[9px] text-on-surface-variant/60 hover:border-primary/30 hover:text-primary/70 transition">
                            Ã°Å¸â€¢â€™ History
                          </button>
                          {/* 21m Ã¢â‚¬â€ export workflow as JSON */}
                          <button
                            type="button"
                            title="Export workflow as JSON"
                            onClick={(e) => { e.stopPropagation(); exportWorkflowJson(workflow.workflow_id ?? ""); }}
                            class="rounded-full border border-white/30 bg-white/20 px-2 py-0.5 text-[9px] text-on-surface-variant transition hover:bg-white/40 hover:text-primary"
                          >
                            Ã¢â€ â€œ JSON
                          </button>
                          <Show when={showVersionsId() === workflow.workflow_id}>
                            <div class="rounded-lg bg-white/20 mt-1 px-3 py-2 space-y-1 max-h-36 overflow-y-auto">
                              <For each={workflowVersions()[workflow.workflow_id] ?? []} fallback={<p class="text-[10px] text-on-surface-variant/50">No snapshots yet Ã¢â‚¬â€ click "Save snapshot" to record one.</p>}>
                                {(v, i) => {
                                  const versions = workflowVersions()[workflow.workflow_id] ?? [];
                                  const vNum = versions.length - i();
                                  const hasPrev = i() < versions.length - 1;
                                  const diffActive = versionDiffIds() !== null && versionDiffIds()![0] === i() && versionDiffIds()![1] === i() + 1;
                                  return (
                                    <div class="flex items-center justify-between text-[10px] text-on-surface-variant">
                                      <span>v{vNum}</span>
                                      <div class="flex items-center gap-1.5">
                                        <span class="opacity-60">{new Date(v.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
                                        {/* 30t Ã¢â‚¬â€ diff button between this version and the next */}
                                        <Show when={hasPrev}>
                                          <button
                                            type="button"
                                            onClick={() => setVersionDiffIds(diffActive ? null : [i(), i() + 1])}
                                            class={`rounded px-1 py-0.5 text-[9px] font-medium transition ${diffActive ? "bg-violet-200 text-violet-800" : "bg-white/30 text-on-surface-variant/70 hover:bg-white/50"}`}
                                          >
                                            {diffActive ? "Ã¢Å“â€¢ diff" : "diff"}
                                          </button>
                                        </Show>
                                      </div>
                                    </div>
                                  );
                                }}
                              </For>
                              {/* 30t Ã¢â‚¬â€ version diff result panel */}
                              <Show when={versionDiffIds() !== null}>
                                {(() => {
                                  const versions = workflowVersions()[workflow.workflow_id] ?? [];
                                  const ids = versionDiffIds()!;
                                  const vA = versions[ids[0]];
                                  const vB = versions[ids[1]];
                                  if (!vA || !vB) return null;
                                  const labelsA = new Set((vA.nodes as Array<{label?: string; id?: string}>).map(n => n.label ?? n.id ?? "?"));
                                  const labelsB = new Set((vB.nodes as Array<{label?: string; id?: string}>).map(n => n.label ?? n.id ?? "?"));
                                  const added = [...labelsA].filter(l => !labelsB.has(l));
                                  const removed = [...labelsB].filter(l => !labelsA.has(l));
                                  return (
                                    <div class="mt-1 rounded-lg border border-violet-200/50 bg-violet-50/60 px-2 py-1.5 space-y-1">
                                      <p class="font-mono text-[8px] uppercase text-violet-700 tracking-widest">v{versions.length - ids[1]} Ã¢â€ â€™ v{versions.length - ids[0]}</p>
                                      <Show when={added.length === 0 && removed.length === 0}>
                                        <p class="text-[9px] text-on-surface-variant/60">No node changes</p>
                                      </Show>
                                      <For each={added}>
                                        {(l) => <p class="text-[9px] text-emerald-700">+ {l}</p>}
                                      </For>
                                      <For each={removed}>
                                        {(l) => <p class="text-[9px] text-rose-700">Ã¢Ë†â€™ {l}</p>}
                                      </For>
                                    </div>
                                  );
                                })()}
                              </Show>
                              <button type="button" onClick={() => snapshotVersion(workflow.workflow_id)} class="w-full rounded-lg bg-primary/10 px-2 py-1 text-[10px] text-primary hover:bg-primary/20 transition">Save snapshot</button>
                            </div>
                          </Show>
                        </div>
                      </Show>
                    );
                  }}
                </For>
              </Show>
            </Show>
          </div>
        </div>

        <WorkflowsCanvas />
        <WorkflowsInspector />
      </div>
    </div>
    </WorkflowsCtx.Provider>
  );
}
