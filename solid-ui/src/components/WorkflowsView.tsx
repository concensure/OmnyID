import { For, Show, Suspense, createEffect, createMemo, createResource, createSignal, lazy, onCleanup, onMount } from "solid-js";
import { TagInput, WorkflowPaneFallback, WorkflowsCtx } from "@/components/graph";
import {
  getWorkflowConnectorAdapters,
  listWorkflows,
  openRunStream,
  runWorkflowAction,
  updateWorkflowTriggerRegistrationStatus,
  validateWorkflow,
  readSession,
  type WorkflowConnectorOverrides,
  type WorkflowConnectorAdapterSpec,
  type WorkflowDeployment,
  type WorkflowRun,
  type WorkflowTriggerRegistration,
  type WorkflowWaitResumeRecord,
  type SavedWorkflow,
  type WorkflowValidationResponse,
} from "@/lib/api";
import {
  type PresetNodeKind,
} from "afp-ts/workflows";
import { subscribeGotoNodeEvent } from "@/lib/gotoNodeEvent";
import { subscribeMagicActionEvent } from "@/lib/magicActionEvent";
import {
  buildWorkflowEditorFailureReceipt,
  type WorkflowEditorFailureReceipt,
} from "@/lib/workflowEditorFailureState";
import {
  workflowEdgeAddRequest,
  workflowEdgeAddedFeedback,
  workflowEdgeAddPreflightFeedback,
  workflowEdgeMetaPatchPayload,
  workflowGraphAfterEdgeAdd,
  workflowGraphAfterEdgeConditionLabel,
  workflowGraphAfterNodeConfig,
  workflowGraphAfterNodeDelete,
  workflowGraphAfterNodeMetaPatch,
  workflowGraphAfterNodePolicy,
  workflowGraphAfterNodePosition,
  workflowGraphAfterNodePrompt,
  workflowGraphAfterNodeDuplicate,
  workflowGraphAfterPresetStarterAdd,
  workflowGraphAfterPrimitiveNodeAdd,
  workflowGraphAfterRootToggle,
  workflowGraphAfterSemanticNodeAdd,
  workflowNodeConfigText,
  workflowNodePolicyText,
  workflowPresetStarterAddedFeedback,
  workflowRootTogglePatchPayload,
  workflowSemanticNodeAddedFeedback,
  workflowSelectedNodeEditorText,
  workflowSelectedNodeConfigPatchPayload,
  workflowSelectedNodeDeletePatchPayload,
  workflowSelectedNodeMetaPatchPayload,
  workflowSelectedNodePolicyPatchPayload,
  workflowSelectedNodePromptPatchPayload,
  workflowUnknownSemanticStarterFeedback,
} from "@/lib/workflowGraphEditState";
import {
  parseWorkflowJsonRecord,
  workflowJsonAppliedFeedback,
  workflowJsonInvalidFeedback,
} from "@/lib/workflowJsonEditorState";
import { workflowNodeDataSelector } from "@/lib/workflowDomState";
import {
  buildWorkflowReviewStateUrl,
  replaceWorkflowHistoryState,
  workflowUrlsMatchView,
} from "@/lib/workflowLinkState";
import {
  workflowSavedCollectionState,
} from "@/lib/workflowPersistenceState";
import {
  applyWorkflowBranchPresetAsyncState,
  createWorkflowFromIntentAsyncState,
  decideWorkflowApprovalAsyncState,
  describeWorkflowBranchAsyncState,
  compileWorkflowAsyncState,
  loadWorkflowAsyncState,
  loadWorkflowDeploymentHistoryState,
  loadWorkflowRunHistoryState,
  loadWorkflowWaitResumeRecordsState,
  patchWorkflowAsyncState,
  regenerateWorkflowFromIntentAsyncState,
  runWorkflowActionAsyncState,
  saveWorkflowAsyncState,
  startWorkflowDryRunAsyncState,
  startWorkflowRunAsyncState,
} from "@/lib/workflowAsyncState";
import {
  workflowRailRunStatsBadge as workflowRailRunStatsBadgeView,
  workflowRailFamilySummaryLabel as workflowRailFamilySummaryLabelView,
  workflowElapsedLabel,
  workflowRunEtaLabel,
  workflowRailFirstMatchingNodeId,
  workflowRailMatchingNodeIds,
  workflowRailMatchingNodeSummary,
  workflowRailTagsAfterSave,
  workflowRailTagItems as workflowRailTagItemsView,
  workflowRailTriggerBadge as workflowRailTriggerBadgeView,
  workflowRailVersionDiff as workflowRailVersionDiffView,
  workflowRailVersionItems as workflowRailVersionItemsView,
  workflowActiveDeployment,
  workflowDeploymentHistoryById,
  workflowDownstreamNodeIds,
  workflowDeployPreviewDiff,
  workflowMinimapBounds,
  workflowNodeDeploymentPolicies,
  workflowNodeLabelsById,
  workflowNodeSuccessRates,
  workflowPendingNodeDeploymentPolicies,
  workflowPendingDeploymentChangeSummary,
  workflowUpstreamNodeIds,
  workflowExecutionRefreshing as workflowExecutionRefreshingView,
  workflowIdleNodes,
  workflowInteractionLocked as workflowInteractionLockedView,
  workflowInteractionLockLabel as workflowInteractionLockLabelView,
  workflowLatestRunForDeployment,
  workflowRunHistoryEntries as workflowRunHistoryEntriesView,
  workflowRunHistoryLineageOptions as workflowRunHistoryLineageOptionsView,
  workflowSelectedRunEdgePolicyDeltas,
  workflowSelectedRunNodePolicyDeltas,
  workflowSelectedEdge,
  workflowSelectedNodeOutgoingEdgeTargets,
  workflowSelectedNodeOutgoingTargetNodes,
  workflowSelectedRunEdgeIdAfterGraphChange,
  workflowSelectedRunEdgeIdAfterRunChange,
  workflowSelectedNode,
  workflowSelectedRun,
  workflowSavedReviewActiveFilters,
  workflowSavedReviewActiveFilterActionLabel as workflowSavedReviewActiveFilterActionLabelView,
  workflowSavedReviewCollapseActionLabel,
  workflowSavedReviewCompositionActionLabel as workflowSavedReviewCompositionActionLabelView,
  workflowSavedReviewCompositionChipClass as workflowSavedReviewCompositionChipClassView,
  workflowSavedReviewCompositionSummary,
  workflowSavedReviewEmptyStateActions as workflowSavedReviewEmptyStateActionsView,
  workflowSavedReviewEmptyStateLabel as workflowSavedReviewEmptyStateLabelView,
  workflowSavedReviewExpandActionLabel,
  workflowSavedReviewFilterClass,
  workflowSavedReviewFilteredSelectorEntries,
  workflowSavedReviewGroupedSelectorEntries as workflowSavedReviewGroupedSelectorEntriesView,
  workflowSavedReviewLegendActionLabel as workflowSavedReviewLegendActionLabelView,
  workflowSavedReviewLegendClass as workflowSavedReviewLegendClassView,
  workflowSavedReviewPreviewContextSummary,
  workflowSavedReviewPreviewContextActionLabel as workflowSavedReviewPreviewContextActionLabelView,
  workflowSavedReviewPreviewContextClass as workflowSavedReviewPreviewContextClassView,
  workflowSavedReviewSelectorEntryActionLabel as workflowSavedReviewSelectorEntryActionLabelView,
  workflowSavedReviewShareModeCounts,
  workflowSavedReviewShareModeActionLabel as workflowSavedReviewShareModeActionLabelView,
  workflowSavedReviewWorkspaceActive,
  workflowSavedReviewSortActionLabel as workflowSavedReviewSortActionLabelView,
  workflowSavedReviewSavedAtLabel,
  workflowSavedReviewScopeMismatch,
  workflowSavedReviewSelectorEntry,
  workflowSavedReviewStaleness,
  workflowSavedReviewSummary as workflowSavedReviewSummaryView,
  workflowSharedReviewBannerSummaryForView,
  workflowSavedReviewToneLegendEntries as workflowSavedReviewToneLegendEntriesView,
  workflowTimestampMs,
  workflowWaitResumeSummary,
  type WorkflowRailBadgeView,
  type WorkflowRailVersionDiff,
  type WorkflowRailVersionItem,
  type WorkflowVersionSnapshot,
} from "@/lib/workflowRailState";
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
  type RunTimelineFilterMode,
  type TargetedDeploymentOverrideDraft,
  type WorkflowGraphDraft,
} from "@/lib/workflowGraphTypes";
import {
  branchExecutionLogEntries,
  compactExecutionLogEntries,
  edgeExecutionVisual,
  edgeLine,
  formatTimelineStamp,
  nextReplayStepState,
  recentFailedRunNodeIds,
  runEdgeCanvasCallout,
  runEdgeStates,
  runNodeStatuses,
  runStepOrder,
  runTimelineSteps,
  runTimelineSliceForEdge,
  workflowExecutionExplanationChip,
  workflowExecutionExplanationText,
  timelineStepAction,
  timelineStepHasDeploymentContext,
  timelineStepHasReplayDrift,
  timelineStepMatchesFilter,
  timelineStepNarrative,
  timelineStepNodeId,
  timelineStepTrace,
  timelineTraceEvents,
  truncateCanvasLabel,
  workflowDryRunFeedback,
  workflowRunActionFeedback,
} from "@/lib/workflowRunAnalysis";
import {
  compiledAfpGapDescription,
  compiledAfpGapLabel,
  compiledManifestAfpContract,
  compiledManifestAfpGapKinds,
  compiledManifestOrchestrationRole,
  deploymentChangeSummary,
  deploymentChangeSummaryEntries,
  deploymentChangeSummaryFieldChangesForNode,
  deploymentNodePoliciesForEnvironment,
  deploymentOverrideDraftForEnvironment,
  deploymentOverridePayload as buildDeploymentOverridePayload,
  deploymentOverrideSummary,
  deploymentPolicyChanges,
  deploymentPolicyDiff,
  deploymentPolicyDiffEntryForNode,
  deploymentPolicyVisual,
  latestDeploymentForEnvironment,
  mergeOverrideFields,
  replayComparisonSummary,
  rollbackPreviewDeploymentIdForFocus,
  workflowActionPreflightFeedback,
  workflowActionFeedback,
  workflowActionSuccessUiEffects,
  workflowCompileFeedback,
  workflowCompiledStateForWorkflow,
  workflowConnectorOverrideTargets,
  workflowDeploymentOverrideDraftAfterEnvironmentChange,
  workflowGraphPayload,
  workflowSavedFeedback,
  workflowValidationFeedback,
} from "@/lib/workflowDeploymentHelpers";
import {
  workflowApprovalDecisionPreflightFeedback,
  workflowApprovalDecisionRequestForOption,
} from "@/lib/workflowApprovalState";
import { runNodeCanvasCallout } from "@/lib/workflowRunSummary";
import {
  runStatusChipClass,
  runTimelineWaitChainSummary,
  waitResumeFamilyLabel,
  waitResumeStatusChipClass,
  waitResumeStatusLabel,
} from "@/lib/workflowRunStatus";
import {
  formatDurationMs,
  liveRunAccentClass,
} from "@/lib/workflowLiveRunState";
import {
  liveRunStreamEventIsTerminal,
  liveRunStreamEventKey,
  liveRunNodeOverlaysFromEvents,
  mergeLiveRunEdgeStates,
  mergeLiveRunStatuses,
  mergeLiveRunStepOrder,
  parseLiveRunStreamEvent,
} from "@/lib/workflowLiveRunStreamState";
import { titleCase } from "@/lib/workflowGraphCopy";
import {
  branchOriginRecord,
  workflowFamilyAssetRecord,
  workflowFamilyInstanceRecord,
  workflowGraphMetadata,
} from "@/lib/workflowGraphMetadata";
import { summary } from "@/lib/workflowGraphSummary";
import { nodeKindIcon } from "@/lib/workflowNodeIcon";
import {
  semanticStarterById,
  suggestedTemplateRuntimeLineage,
  templateScaffoldSteps,
} from "@/lib/workflowStarterCatalog";
import {
  workflowRegenerationImpactSummary,
} from "@/lib/workflowRegenerationState";
import {
  describeHistoryEntries,
  describeHistoryComparisonForDraft,
  describeHistoryEntryComposerState,
  selectedDescribeHistoryEntryForDraft,
  workflowDescribeBranchFailureFeedback,
  workflowDescribeCreatePreflightFeedback,
  workflowIntentExpansionWithOverrides,
  workflowRegeneratePreflightFeedback,
  workflowRegenerationImpactVisible,
  workflowSourceIntentForRegeneration,
} from "@/lib/workflowDescribeIntentAnalysis";
import {
  branchFamilyRootId,
  branchFamilyRootIdsWithChildren as branchFamilyRootIdsWithChildrenView,
  branchFamilyWorkflows,
  collapsedBranchFamilyIdsAfterToggle,
  collapsedBranchFamilyIdsAfterSelectedWorkflow,
  collapsedBranchFamilyIdsExceptSelected,
  collapsedBranchFamilyIdsForAvailableWorkflows,
  acceptedWorkflowTemplateIdsFromMetadata,
  defaultWorkflowFamilyParameters,
  filteredWorkflowsForRail as filteredWorkflowsForRailView,
  isBranchChildWorkflow,
  orderedWorkflowsForRail,
  workflowBranchFamilySummary,
  workflowBranchVisibleInRail,
  workflowBranchPresetFailureFeedback,
  workflowBranchPresetLabelsForEdges,
  workflowBranchPresetUnavailableFeedback,
  workflowBranchScaffoldDraftWorkflow,
  workflowBranchScaffoldFailureFeedback,
  workflowBranchScaffoldForNode,
  workflowBranchScaffoldPreflightFeedback,
  workflowBranchScaffoldSelectedNodeId,
  workflowBranchScaffoldSuccessFeedback,
  workflowFamilyInstanceCreatedFeedback,
  workflowFamilyInstancePreflightFeedback,
  workflowFamilyAssetGraphFromDraft,
  workflowFamilyInstanceGraphFromAsset,
  workflowFamilyPromotionPreflightFeedback,
  workflowFamilyPromotionSavedFeedback,
  workflowGraphAfterBranchPresetLabels,
} from "@/lib/workflowFamilyState";
import {
  makeNewWorkflow,
  normalizeGraph,
  workflowInitialSelectedNodeId,
  workflowNewDraftFeedback,
} from "@/lib/workflowGraphDraftState";
import { parseWorkflowFamilyContext } from "@/lib/workflowFamilyContext";
import { cloneJson, makeId } from "@/lib/workflowGraphUtils";
import {
  workflowBuiltFromIntent,
  workflowIntentStarterSubgraph,
} from "@/lib/workflowIntentBuildState";
import {
  afpReadinessFocusSummary,
  afpReadinessFocusTitle,
  availableReviewTargetMessage,
  broadenOrchestrationRoleRouteReviewMessage,
  clearAfpReadinessFocusMessage,
  clearOrchestrationRoleFocusMessage,
  clearOverlappingRouteNarrowingMessage,
  clearReviewFocusMessage,
  clearRouteReviewFilterMessage,
  compiledLinkageStatusLabel,
  compiledManifestEmptyStateMessage,
  compiledManifestMatchesAfpReadinessFocus,
  compiledRouteEmptyStateMessage,
  focusOrchestrationRoleReviewMessage,
  focusOrchestrationRouteReviewMessage,
  focusRouteLinkageReviewMessage,
  orchestrationRoleFocusTargetLabel,
  orchestrationRoleOutsideFocusMessage,
  orchestrationRoleRailGuideMessage,
  overlappingOrchestrationRouteSummaryMessage,
  recoveryReviewTargetMessage,
  resetRouteReviewStatesLabel,
  unavailableReviewTargetMessage,
} from "@/lib/workflowReviewMessages";
import {
  workflowGraphAfterTemplateSuggestionScaffold,
  workflowTemplateSuggestionAcceptedFeedback,
  workflowTemplateSuggestionDismissedFeedback,
  workflowTemplateSuggestionPreferenceMetadata,
} from "@/lib/workflowTemplateScaffold";
import {
  triggerFamilyFromKind,
  triggerProvenanceChipClass,
} from "@/lib/workflowTriggerPresentation";
import { WORKFLOW_BRANCH_FAMILY_COLLAPSE_STORAGE_KEY } from "@/lib/workflowGraphStorageKeys";
import type { DescribeHistoryEntry } from "@/lib/workflowDescribeHistory";
import type {
  LiveRunStreamEvent,
  PersistedRunReviewContext,
  PersistedStoredSharedReviewUiContext,
  ReviewUrlState,
  RunHistoryDriftFilter,
  RunHistorySortMode,
  SemanticStarterDefinition,
  StoredSharedReviewLink,
  SuggestedTemplateRuntimeLineage,
  TemplateScaffoldStep,
  WorkflowFamilyContext,
  WorkflowFamilyParameterField,
  WorkflowFamilyParameterFieldDraft,
} from "@/lib/workflowReviewTypes";
import {
  loadCollapsedWorkflowBranchFamilies,
  loadWorkflowHasRun,
  loadWorkflowNodeComments,
  loadWorkflowRunStats,
  loadWorkflowTags,
  loadWorkflowVersions,
  saveCollapsedWorkflowBranchFamilies,
  saveWorkflowHasRun,
  saveWorkflowRunStats,
  saveWorkflowTags,
  saveWorkflowVersions,
  workflowHasRunAfterMark,
  workflowRunStatsAfterUpdate,
  workflowVersionsAfterSnapshot,
} from "@/lib/workflowsLocalState";
import {
  inferWorkflowSharedReviewShareModeFromHref,
  clearWorkflowStoredSharedReviewLinks,
  loadWorkflowRunHistoryReviewStorageState,
  loadWorkflowSharedReviewLinksStorage,
  persistWorkflowRunHistoryReviewStorageState,
  persistWorkflowSharedReviewLinksStorage,
  readWorkflowStoredSharedReviewRecordState,
  readWorkflowReviewUrlStateFromSearch,
  resolveWorkflowRunReviewContextSelection,
  resolveWorkflowIdToLoad,
  resolveWorkflowRunReviewContextRestorePlan,
  resolveWorkflowReviewUrlNavigationPlan,
  resolveWorkflowSelectedRunId,
  resolveWorkflowStoredSharedReviewSelection,
  resolveWorkflowStoredSharedReviewUiState,
  updateWorkflowStoredSharedReviewLink,
  upsertWorkflowStoredSharedReviewLink,
  upsertWorkflowRunReviewContext,
  upsertWorkflowRunSelection,
  upsertWorkflowStoredSharedReviewUiContext,
  workflowReviewUrlStateForWorkflow,
  workflowRunReviewContextForPersistence,
  workflowSelectedStoredSharedReviewRecord,
  workflowSelectedStoredSharedReviewRecordState,
  workflowStoredSharedReviewUiStateAfterActiveFilterClear,
  workflowStoredSharedReviewUiStateAfterCompositionFocus,
  workflowStoredSharedReviewUiStateAfterPreviewContextClear,
  workflowStoredSharedReviewUiStateAfterPreviewContextReset,
  workflowStoredSharedReviewUiContextForPersistence,
  workflowStoredSharedReviewRecordStatesForWorkflow,
  workflowStoredSharedReviewRecordsForWorkflow,
  workflowStoredSharedReviewNarrowingState,
  workflowStoredSharedReviewUiStateFromUrlState,
} from "@/lib/workflowReviewLocalState";
import {
  workflowComposerPendingIntentSeedDecision,
  type WorkflowComposerPendingIntentSeed,
} from "@/lib/workflowComposerState";
import {
  clearStoredSharedReviewState,
  cloneWorkflowState,
  copyWorkflowCleanLinkState,
  copyWorkflowReviewLinkState,
  exportWorkflowJsonState,
  refreshStoredSharedReviewState,
  renameStoredSharedReviewState,
  resumeStoredSharedReviewState,
  togglePinStoredSharedReviewState,
} from "@/lib/workflowUtilityState";

const WorkflowRailCard = lazy(() =>
  import("@/components/WorkflowRailCard").then((m) => ({ default: m.WorkflowRailCard })),
);
const WorkflowsComposerPanel = lazy(() =>
  import("@/components/WorkflowsComposerPanel").then((m) => ({ default: m.WorkflowsComposerPanel })),
);
const WorkflowsCanvas = lazy(() =>
  import("@/components/WorkflowsCanvas").then((m) => ({ default: m.WorkflowsCanvas })),
);
const WorkflowsInspector = lazy(() =>
  import("@/components/WorkflowsInspector").then((m) => ({ default: m.WorkflowsInspector })),
);
const WorkflowStoredSharedReviewControls = lazy(() =>
  import("@/components/WorkflowStoredSharedReviewControls").then((m) => ({
    default: m.WorkflowStoredSharedReviewControls,
  })),
);


export function WorkflowsView(props: {
  onWorkflowPresenceChange?: (present: boolean) => void;
  pendingIntent?: WorkflowComposerPendingIntentSeed | null;
  onPendingIntentConsumed?: (seedId: string) => void;
} = {}) {
  const sessionUserId = () => readSession()?.user?.id ?? null;
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
  // 18i - node collapse on double-click
  const [collapsedNodes, setCollapsedNodes] = createSignal<Set<string>>(new Set());
  // 18k - workflow tags (persisted in localStorage)
  const [workflowTags, setWorkflowTags] = createSignal<Record<string, string[]>>(
    loadWorkflowTags(sessionUserId()),
  );
  const [tagFilter, setTagFilter] = createSignal("");
  const [favoritesOnly, setFavoritesOnly] = createSignal(false);
  const [feedback, setFeedback] = createSignal("");
  const [feedbackError, setFeedbackError] = createSignal<WorkflowEditorFailureReceipt | null>(null);
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
  const [connectorAdapters, setConnectorAdapters] = createSignal<WorkflowConnectorAdapterSpec[]>([]);
  const [triggerRegistrations, setTriggerRegistrations] = createSignal<WorkflowTriggerRegistration[]>([]);
  const [triggerRegistrationsLoading, setTriggerRegistrationsLoading] = createSignal(false);
  let triggerRegistrationRequestId = 0;
  let selectedRunWaitResumeRequestId = 0;
  const [showMinimap, setShowMinimap] = createSignal(true);
  const [ctxMenu, setCtxMenu] = createSignal<{ nodeId: string; x: number; y: number } | null>(null);
  let appliedPendingIntentSeedId: string | null = null;

  createEffect(() => {
    const decision = workflowComposerPendingIntentSeedDecision({
      currentIntent: workflowIntent(),
      pendingSeed: props.pendingIntent,
      previouslyAppliedSeedId: appliedPendingIntentSeedId,
    });
    if (!decision.seedId) return;
    appliedPendingIntentSeedId = decision.seedId;
    if (decision.nextIntent !== null) {
      setWorkflowIntent(decision.nextIntent);
    }
    if (decision.feedback) {
      setFeedback(decision.feedback);
    }
    props.onPendingIntentConsumed?.(decision.seedId);
  });

  // 19i - node comment annotation
  const [nodeComments, setNodeComments] = createSignal<Record<string, string>>(
    loadWorkflowNodeComments(sessionUserId()),
  );
  const [editingCommentNodeId, setEditingCommentNodeId] = createSignal<string | null>(null);
  const [commentDraft, setCommentDraft] = createSignal("");
  // 19j - workflow run replay
  const [replayingRunId, setReplayingRunId] = createSignal<string | null>(null);
  // 19k - canvas zoom
  const [zoom, setZoom] = createSignal(1);
  // 20i - node dependency visualiser
  const [highlightedNodeId, setHighlightedNodeId] = createSignal<string | null>(null);
  // 20j - workflow version history
  const [workflowHasRun, setWorkflowHasRun] = createSignal<Set<string>>(
    loadWorkflowHasRun(sessionUserId()),
  );
  const [workflowRunStats, setWorkflowRunStats] = createSignal<Record<string, { ok: number; fail: number }>>(
    loadWorkflowRunStats(sessionUserId()),
  );
  function markWorkflowRun(workflowId: string) {
    if (workflowHasRun().has(workflowId)) return;
    const next = workflowHasRunAfterMark(workflowHasRun(), workflowId);
    saveWorkflowHasRun(next, sessionUserId());
    setWorkflowHasRun(next);
  }
  createEffect(() => {
    const wfId = currentWorkflow()?.workflow_id;
    const runs = runHistory();
    if (!wfId || runs.length === 0) return;
    setWorkflowRunStats((prev) => {
      const next = workflowRunStatsAfterUpdate(prev, wfId, runs);
      if (next === prev) return prev;
      try { saveWorkflowRunStats(next, sessionUserId()); } catch { /* ignore */ }
      return next;
    });
  });
  const [workflowVersions, setWorkflowVersions] = createSignal<Record<string, WorkflowVersionSnapshot[]>>(
    loadWorkflowVersions(sessionUserId()),
  );
  const [showVersionsId, setShowVersionsId] = createSignal<string | null>(null);
  // 20k - idle node detector
  const [showIdleNodes, setShowIdleNodes] = createSignal(false);
  // 21k - node run timer
  const [nowMs, setNowMs] = createSignal(Date.now());
  // 22h - node search/filter
  const [nodeSearchQuery, setNodeSearchQuery] = createSignal("");
  // 22i - workflow clone
  const [clonedId, setClonedId] = createSignal<string | null>(null);
  const canvasRefHolder = { current: null as HTMLDivElement | null };
  const dragStateHolder = { current: null as { nodeId: string; offsetX: number; offsetY: number } | null };
  // 30d - Anomaly pulse: tracks node IDs with recent error runs (persisted per workflow session)
  const [nodeErrorIds, setNodeErrorIds] = createSignal<Set<string>>(new Set());
  // 30g - Jump-to-node: target node ID from command bar
  const [gotoNodeId, setGotoNodeId] = createSignal<string | null>(null);
  // 30l - Execution trace replay
  const [replayActive, setReplayActive] = createSignal(false);
  const [replayStepIdx, setReplayStepIdx] = createSignal(0);
  let clonedIdClearTimer: ReturnType<typeof setTimeout> | null = null;
  let gotoNodeClearTimer: ReturnType<typeof setTimeout> | null = null;
  let replayInterval: ReturnType<typeof setInterval> | null = null;
  // 30o - Node drag ghost: tracks origin position while dragging
  const [dragGhostOrigin, setDragGhostOrigin] = createSignal<{ x: number; y: number; nodeId: string } | null>(null);
  // 30t - Version diff: tracks which two snapshot indices to diff
  const [versionDiffIds, setVersionDiffIds] = createSignal<[number, number] | null>(null);

  createEffect(() => {
    if (feedback()) setFeedbackError(null);
  });

  function clearFeedbackError() {
    setFeedbackError(null);
  }

  function setWorkflowFeedbackFailure(actionLabel: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    setFeedback("");
    setFeedbackError(buildWorkflowEditorFailureReceipt(actionLabel, message));
  }

  function scheduleClonedIdClear() {
    if (clonedIdClearTimer) clearTimeout(clonedIdClearTimer);
    clonedIdClearTimer = setTimeout(() => {
      clonedIdClearTimer = null;
      setClonedId(null);
    }, 2000);
  }

  function scheduleGotoNodeClear() {
    if (gotoNodeClearTimer) clearTimeout(gotoNodeClearTimer);
    gotoNodeClearTimer = setTimeout(() => {
      gotoNodeClearTimer = null;
      setGotoNodeId(null);
    }, 2000);
  }

  onCleanup(() => {
    if (clonedIdClearTimer) clearTimeout(clonedIdClearTimer);
    if (gotoNodeClearTimer) clearTimeout(gotoNodeClearTimer);
  });

  const graph = () => {
    const workflow = currentWorkflow();
    return workflow ? normalizeGraph(workflow) : null;
  };

  const minimapBounds = createMemo(() => workflowMinimapBounds(graph()?.nodes ?? []));

  // 20i - upstream/downstream dependency memos
  const upstreamOf = createMemo(() => {
    return workflowUpstreamNodeIds(highlightedNodeId(), graph()?.edges ?? []);
  });
  const downstreamOf = createMemo(() => {
    return workflowDownstreamNodeIds(highlightedNodeId(), graph()?.edges ?? []);
  });

  // 22h - matching node ids memo for search/filter
  const matchingNodeIds = createMemo<Set<string> | null>(() => {
    return workflowRailMatchingNodeIds(graph()?.nodes ?? [], nodeSearchQuery());
  });
  const firstMatchingNodeId = createMemo(() => {
    return workflowRailFirstMatchingNodeId(graph()?.nodes ?? [], matchingNodeIds());
  });
  const matchingNodeSummary = createMemo(() => {
    const matches = matchingNodeIds();
    return workflowRailMatchingNodeSummary(matches ? matches.size : null);
  });

  // 22i - clone workflow
  async function cloneWorkflow(workflowId: string) {
    clearFeedbackError();
    try {
      const result = await cloneWorkflowState(workflowId);
      if (result.shouldRefetch) void refetch();
      setClonedId(result.clonedId);
      scheduleClonedIdClear();
    } catch (error) {
      setWorkflowFeedbackFailure("Clone workflow", error);
    }
  }

  // 21m - export workflow as JSON
  function exportWorkflowJson(workflowId: string) {
    clearFeedbackError();
    try {
      exportWorkflowJsonState({
        workflowId,
        nodes: graph()?.nodes ?? [],
        edges: graph()?.edges ?? [],
      });
    } catch (error) {
      setWorkflowFeedbackFailure("Export workflow JSON", error);
    }
  }

  // 20j - snapshot version function
  function snapshotVersion(workflowId: string) {
    setWorkflowVersions(prev => {
      const next = workflowVersionsAfterSnapshot(prev, workflowId, {
        nodes: graph()?.nodes ?? [],
        ts: new Date().toISOString(),
      });
      try { saveWorkflowVersions(next, sessionUserId()); } catch {}
      return next;
    });
  }

  // 20k - idle nodes memo
  const idleNodes = createMemo(() => workflowIdleNodes(graph()?.nodes ?? []));

  const workflowRunEta = createMemo(() => {
    return workflowRunEtaLabel(runHistory()
      .map((run) => run.result?.status === "completed" ? run.result.duration_ms : null)
    );
  });

  // 21k - elapsed label helper for node run timer
  function elapsedLabel(startedAt: string | undefined): string | null {
    return workflowElapsedLabel(startedAt, nowMs());
  }

  const nodeSuccessRates = createMemo(() => workflowNodeSuccessRates(runHistory()));

  const [workflows, { mutate, refetch }] = createResource(async () => {
    try {
      const response = await listWorkflows(false, 50);
      return response.workflows;
    } catch (error) {
      // A temporary workflow API failure must leave the editor usable and
      // retryable; never let an eager resource rejection unmount the view.
      setWorkflowFeedbackFailure("Load workflows", error);
      return [];
    }
  });
  createEffect(() => {
    const hasWorkflow = Boolean(currentWorkflow()) || (workflows()?.length ?? 0) > 0;
    props.onWorkflowPresenceChange?.(hasWorkflow);
  });

  const selectedNode = () => workflowSelectedNode(graph(), selectedNodeId());

  const selectedRun = () => workflowSelectedRun(runHistory(), selectedRunId());
  const selectedRunWaitResumeSummary = createMemo(() => workflowWaitResumeSummary(selectedRunWaitResumeRecords()));
  const latestRunForDeployment = (deploymentId: string | null | undefined) =>
    workflowLatestRunForDeployment(runHistory(), deploymentId);
  const focusDeploymentRecord = (deploymentId: string | null | undefined) => {
    if (!deploymentId) return;
    setSelectedDeploymentRecordId(deploymentId);
    setDeployPreviewOpen(false);
    setRollbackPreviewDeploymentId(rollbackPreviewDeploymentIdForFocus(deploymentId, deploymentHistory()));
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
    const resolvedContext = resolveWorkflowRunReviewContextSelection({
      context,
      nodes: draft?.nodes,
      edges: draft?.edges,
      deployments,
    });

    setSelectedNodeId(resolvedContext.selectedNodeId);
    setSelectedRunEdgeId(resolvedContext.selectedRunEdgeId);
    setRunTimelineFilterMode(resolvedContext.runTimelineFilterMode);
    setRunTimelineFocusNodeId(resolvedContext.runTimelineFocusNodeId);
    setSelectedDeploymentRecordId(resolvedContext.selectedDeploymentRecordId);
    Promise.resolve().then(() => setRestoringRunReviewContext(false));
  };
  const restoreRunReviewContextForWorkflow = (
    workflowId: string,
    draft: WorkflowGraphDraft | null,
    deployments: WorkflowDeployment[],
  ) => {
    const restorePlan = resolveWorkflowRunReviewContextRestorePlan({
      workflowId,
      pendingUrlState: pendingUrlReviewState(),
      persistedContext: persistedRunReviewContexts()[workflowId] ?? null,
    });
    applyRunReviewContext(restorePlan.context, draft, deployments);
    if (restorePlan.persistSharedReviewLink) {
      const sharedHref = `${window.location.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
      persistSharedReviewLinkForWorkflow(
        workflowId,
        sharedHref,
        restorePlan.shareMode ?? "core",
      );
    }
    if (restorePlan.showSharedReviewBanner) {
      setSharedReviewBannerVisible(true);
    }
    if (restorePlan.clearPendingUrlReviewState) {
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
  function storedSharedReviewShareMode(record: Pick<StoredSharedReviewLink, "href" | "share_mode">): "workspace" | "core" {
    return readWorkflowStoredSharedReviewRecordState(record, window.location.origin)?.shareMode ?? "core";
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
    const resolvedShareMode =
      shareMode ?? inferWorkflowSharedReviewShareModeFromHref(href, window.location.origin);
    setPersistedSharedReviewLinks((current) =>
      upsertWorkflowStoredSharedReviewLink(current, {
        workflowId,
        href,
        savedAt,
        environment,
        deploymentId,
        shareMode: resolvedShareMode,
        createId: () => makeId("shared_review"),
        shareModeForRecord: storedSharedReviewShareMode,
      })
    );
    setSelectedStoredSharedReviewId(null);
  }
  function updateStoredSharedReviewForWorkflow(
    workflowId: string | null | undefined,
    reviewId: string | null | undefined,
    updater: (record: StoredSharedReviewLink) => StoredSharedReviewLink,
  ) {
    if (!workflowId || !reviewId) return;
    setPersistedSharedReviewLinks((current) =>
      updateWorkflowStoredSharedReviewLink(current, workflowId, reviewId, updater)
    );
  }
  function clearStoredSharedReviewForWorkflow(workflowId: string | null | undefined, reviewId?: string | null) {
    if (!workflowId) return;
    setPersistedSharedReviewLinks((current) =>
      clearWorkflowStoredSharedReviewLinks(current, workflowId, reviewId)
    );
  }
  const storedSharedReviewRecordsForCurrentWorkflow = createMemo(() => {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    return workflowStoredSharedReviewRecordsForWorkflow(
      persistedSharedReviewLinks(),
      workflowId,
      window.location.origin,
    );
  });
  const storedSharedReviewRecordStatesForCurrentWorkflow = createMemo(() => {
    return workflowStoredSharedReviewRecordStatesForWorkflow(
      storedSharedReviewRecordsForCurrentWorkflow(),
      window.location.origin,
    );
  });
  createEffect(() => {
    const records = storedSharedReviewRecordsForCurrentWorkflow();
    const selectedId = selectedStoredSharedReviewId();
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    const urlSelectedId = workflowReviewUrlStateForWorkflow(
      pendingUrlReviewState(),
      workflowId ?? null,
    )?.selected_review_id ?? null;
    const persistedContext = workflowId ? persistedStoredSharedReviewUiContexts()[workflowId] : null;
    const nextSelectedId = resolveWorkflowStoredSharedReviewSelection({
      records,
      selectedId,
      urlSelectedId,
      persistedSelectedId: persistedContext?.selected_review_id ?? null,
    });
    if (nextSelectedId !== selectedId) setSelectedStoredSharedReviewId(nextSelectedId);
  });
  createEffect((previousWorkflowId: string | null | undefined) => {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId() ?? null;
    if (workflowId === previousWorkflowId) return workflowId;
    const persistedContext = workflowId ? persistedStoredSharedReviewUiContexts()[workflowId] : null;
    const nextUiState = resolveWorkflowStoredSharedReviewUiState({
      workflowId,
      pendingUrlState: pendingUrlReviewState(),
      persistedContext,
    });
    setShowAllStoredSharedReviews(nextUiState.showAll);
    setStoredSharedReviewFilter(nextUiState.filterText);
    setStoredSharedReviewSortMode(nextUiState.sortMode);
    setStoredSharedReviewShareModeFilter(nextUiState.shareModeFilter);
    setStoredSharedReviewPinnedOnly(nextUiState.pinnedOnly);
    return workflowId;
  });
  createEffect(() => {
    const currentShowAll = showAllStoredSharedReviews();
    const currentFilter = storedSharedReviewFilter();
    const nextState = workflowStoredSharedReviewNarrowingState({
      recordCount: storedSharedReviewRecordsForCurrentWorkflow().length,
      showAll: currentShowAll,
      filterText: currentFilter,
    });
    if (nextState.showAll !== currentShowAll) setShowAllStoredSharedReviews(nextState.showAll);
    if (nextState.filterText !== currentFilter) setStoredSharedReviewFilter(nextState.filterText);
  });
  const storedSharedReviewRecordForCurrentWorkflow = createMemo(() => {
    return workflowSelectedStoredSharedReviewRecord(
      storedSharedReviewRecordsForCurrentWorkflow(),
      selectedStoredSharedReviewId(),
    );
  });
  const storedSharedReviewRecordStateForCurrentWorkflow = createMemo(() => {
    return workflowSelectedStoredSharedReviewRecordState(
      storedSharedReviewRecordStatesForCurrentWorkflow(),
      storedSharedReviewRecordForCurrentWorkflow()?.id,
    );
  });
  const storedSharedReviewLinkForCurrentWorkflow = createMemo(() => {
    return storedSharedReviewRecordStateForCurrentWorkflow()?.record.href ?? null;
  });
  const storedSharedReviewSavedAtLabel = createMemo(() => {
    return workflowSavedReviewSavedAtLabel(storedSharedReviewRecordStateForCurrentWorkflow()?.record.saved_at);
  });
  const storedSharedReviewTitle = createMemo(() => {
    return storedSharedReviewRecordStateForCurrentWorkflow()?.record.title?.trim() || null;
  });
  const storedSharedReviewSummary = createMemo(() => {
    const current = storedSharedReviewRecordStateForCurrentWorkflow();
    if (!current?.record || !current.recordState) return [];
    const { record, recordState } = current;
    return workflowSavedReviewSummaryView({
      deploymentId: record.deployment_id,
      environment: record.environment,
      nodeLabels: nodeLabelById(),
      reviewState: recordState.reviewState,
      shareMode: recordState.shareMode,
    });
  });
  const storedSharedReviewSelectorEntries = createMemo(() => {
    return storedSharedReviewRecordStatesForCurrentWorkflow().map(({ record, recordState }, index) => {
      const shareModeLabel = recordState?.shareMode === "workspace" ? "workspace" : "core";
      return workflowSavedReviewSelectorEntry({
        deploymentId: record.deployment_id,
        id: record.id,
        index,
        pinned: record.pinned,
        reviewState: recordState?.reviewState,
        shareMode: shareModeLabel,
        title: record.title,
        environment: record.environment,
      });
    });
  });
  const selectedStoredSharedReviewSelectorEntry = createMemo(() => {
    const selectedId = selectedStoredSharedReviewId();
    if (!selectedId) return null;
    return storedSharedReviewSelectorEntries().find((entry) => entry.id === selectedId) ?? null;
  });
  const storedSharedReviewShareModeCounts = createMemo(() => {
    return workflowSavedReviewShareModeCounts(
      storedSharedReviewRecordStatesForCurrentWorkflow().map(({ record }) => ({
        shareMode: storedSharedReviewShareMode(record),
      })),
    );
  });
  const storedSharedReviewCompositionSummary = createMemo(() => {
    const records = storedSharedReviewRecordsForCurrentWorkflow();
    const pinned = records.filter((record) => record.pinned).length;
    const counts = storedSharedReviewShareModeCounts();
    return workflowSavedReviewCompositionSummary({
      counts,
      filterText: storedSharedReviewFilter(),
      pinnedCount: pinned,
      pinnedOnly: storedSharedReviewPinnedOnly(),
      shareModeFilter: storedSharedReviewShareModeFilter(),
    });
  });

  function currentStoredSharedReviewUiState() {
    return {
      selectedReviewId: selectedStoredSharedReviewId(),
      showAll: showAllStoredSharedReviews(),
      filterText: storedSharedReviewFilter(),
      sortMode: storedSharedReviewSortMode(),
      shareModeFilter: storedSharedReviewShareModeFilter(),
      pinnedOnly: storedSharedReviewPinnedOnly(),
    };
  }

  function applyStoredSharedReviewUiState(nextState: ReturnType<typeof currentStoredSharedReviewUiState>) {
    setSelectedStoredSharedReviewId(nextState.selectedReviewId);
    setShowAllStoredSharedReviews(nextState.showAll);
    setStoredSharedReviewFilter(nextState.filterText);
    setStoredSharedReviewSortMode(nextState.sortMode);
    setStoredSharedReviewShareModeFilter(nextState.shareModeFilter);
    setStoredSharedReviewPinnedOnly(nextState.pinnedOnly);
  }

  function applyStoredSharedReviewCompositionFocus(key: "all" | "pinned" | "workspace" | "core") {
    applyStoredSharedReviewUiState(
      workflowStoredSharedReviewUiStateAfterCompositionFocus(currentStoredSharedReviewUiState(), key),
    );
  }
  function storedSharedReviewCompositionChipClass(key: "all" | "pinned" | "workspace" | "core", active: boolean) {
    return workflowSavedReviewCompositionChipClassView(key, active);
  }
  function storedSharedReviewCompositionActionLabel(key: "all" | "pinned" | "workspace" | "core") {
    return workflowSavedReviewCompositionActionLabelView(key);
  }
  function storedSharedReviewShareModeActionLabel(mode: "all" | "workspace" | "core") {
    return workflowSavedReviewShareModeActionLabelView(mode);
  }
  function storedSharedReviewSortActionLabel(mode: "priority" | "recent") {
    return workflowSavedReviewSortActionLabelView(mode);
  }
  function storedSharedReviewSelectorEntryActionLabel(entry: {
    label: string;
    pinned: boolean;
    share_mode: string;
  }, selected: boolean) {
    return workflowSavedReviewSelectorEntryActionLabelView(entry, selected);
  }
  function storedSharedReviewExpandActionLabel(hiddenCount: number) {
    return workflowSavedReviewExpandActionLabel(hiddenCount);
  }
  function storedSharedReviewCollapseActionLabel() {
    return workflowSavedReviewCollapseActionLabel();
  }
  const storedSharedReviewActiveFilters = createMemo(() => {
    return workflowSavedReviewActiveFilters({
      filterText: storedSharedReviewFilter(),
      pinnedOnly: storedSharedReviewPinnedOnly(),
      shareModeFilter: storedSharedReviewShareModeFilter(),
    });
  });
  const storedSharedReviewHasMultipleActiveFilters = createMemo(() => storedSharedReviewActiveFilters().length > 1);
  const storedSharedReviewPreviewContextSummary = createMemo(() => {
    return workflowSavedReviewPreviewContextSummary({
      filterText: storedSharedReviewFilter(),
      pinnedOnly: storedSharedReviewPinnedOnly(),
      shareModeFilter: storedSharedReviewShareModeFilter(),
      showAll: showAllStoredSharedReviews(),
      sortMode: storedSharedReviewSortMode(),
    });
  });
  const storedSharedReviewHasMultiplePreviewContextEntries = createMemo(
    () => storedSharedReviewPreviewContextSummary().length > 1,
  );
  function clearStoredSharedReviewPreviewContext(key: "expanded" | "pinned_only" | "share_mode" | "search" | "sort_mode") {
    applyStoredSharedReviewUiState(
      workflowStoredSharedReviewUiStateAfterPreviewContextClear(currentStoredSharedReviewUiState(), key),
    );
  }
  function resetStoredSharedReviewPreviewContext() {
    applyStoredSharedReviewUiState(
      workflowStoredSharedReviewUiStateAfterPreviewContextReset(currentStoredSharedReviewUiState()),
    );
  }
  function storedSharedReviewPreviewContextClass(key: "expanded" | "pinned_only" | "share_mode" | "search" | "sort_mode") {
    return workflowSavedReviewPreviewContextClassView(key);
  }
  function storedSharedReviewPreviewContextActionLabel(key: "expanded" | "pinned_only" | "share_mode" | "search" | "sort_mode") {
    return workflowSavedReviewPreviewContextActionLabelView(key);
  }
  function storedSharedReviewActiveFilterClass(key: "pinned_only" | "share_mode" | "search") {
    return workflowSavedReviewFilterClass(key);
  }
  function storedSharedReviewActiveFilterActionLabel(key: "pinned_only" | "share_mode" | "search") {
    return workflowSavedReviewActiveFilterActionLabelView(key);
  }
  function storedSharedReviewLegendClass(key: "pinned_only" | "share_mode" | "search") {
    return workflowSavedReviewLegendClassView(key);
  }
  function storedSharedReviewLegendActionLabel(target: "pinned" | "workspace" | "core" | "clear_search" | null) {
    return workflowSavedReviewLegendActionLabelView(target);
  }
  const storedSharedReviewToneLegendEntries = createMemo(() => {
    const records = storedSharedReviewRecordsForCurrentWorkflow();
    const counts = storedSharedReviewShareModeCounts();
    return workflowSavedReviewToneLegendEntriesView({
      counts,
      filterText: storedSharedReviewFilter(),
      hasPinnedRecord: records.some((record) => record.pinned),
      hasWorkspaceRecord: records.some((record) => storedSharedReviewShareMode(record) !== "core"),
      pinnedOnly: storedSharedReviewPinnedOnly(),
      shareModeFilter: storedSharedReviewShareModeFilter(),
    });
  });
  function clearStoredSharedReviewActiveFilter(key: "pinned_only" | "share_mode" | "search") {
    applyStoredSharedReviewUiState(
      workflowStoredSharedReviewUiStateAfterActiveFilterClear(currentStoredSharedReviewUiState(), key),
    );
  }
  function resetStoredSharedReviewSelectorNarrowing() {
    applyStoredSharedReviewUiState({
      ...currentStoredSharedReviewUiState(),
      filterText: "",
      shareModeFilter: "all",
      pinnedOnly: false,
    });
  }
  const storedSharedReviewEmptyStateLabel = createMemo(() => {
    return workflowSavedReviewEmptyStateLabelView(storedSharedReviewShareModeFilter());
  });
  const storedSharedReviewEmptyStateActions = createMemo(() => {
    return workflowSavedReviewEmptyStateActionsView({
      filterText: storedSharedReviewFilter(),
      pinnedOnly: storedSharedReviewPinnedOnly(),
      shareModeFilter: storedSharedReviewShareModeFilter(),
    });
  });
  const filteredStoredSharedReviewSelectorEntries = createMemo(() => {
    const recordStates = storedSharedReviewRecordStatesForCurrentWorkflow();
    return workflowSavedReviewFilteredSelectorEntries({
      entries: storedSharedReviewSelectorEntries(),
      filterText: storedSharedReviewFilter(),
      pinnedOnly: storedSharedReviewPinnedOnly(),
      records: recordStates.map(({ record }) => ({
        id: record.id,
        saved_at: record.saved_at,
        shareMode: storedSharedReviewShareMode(record),
      })),
      shareModeFilter: storedSharedReviewShareModeFilter(),
      sortMode: storedSharedReviewSortMode(),
    });
  });
  const visibleStoredSharedReviewSelectorEntries = createMemo(() => {
    const entries = filteredStoredSharedReviewSelectorEntries();
    return showAllStoredSharedReviews() ? entries : entries.slice(0, 4);
  });
  const groupedStoredSharedReviewSelectorEntries = createMemo(() => {
    return workflowSavedReviewGroupedSelectorEntriesView({
      entries: filteredStoredSharedReviewSelectorEntries(),
      sortMode: storedSharedReviewSortMode(),
    });
  });
  const storedSharedReviewStaleness = createMemo(() => {
    const record = storedSharedReviewRecordStateForCurrentWorkflow()?.record;
    if (!record?.saved_at) return null;
    return workflowSavedReviewStaleness({
      deploymentTimestamps: deploymentHistory().map((deployment) => deployment.deployed_at),
      runTimestamps: runHistory().map((run) => run.started_at),
      savedAt: record.saved_at,
    });
  });
  const storedSharedReviewScopeMismatch = createMemo(() => {
    const record = storedSharedReviewRecordStateForCurrentWorkflow()?.record;
    if (!record) return null;
    const currentEnvironment = graph()?.environment === "prod" ? "prod" : "dev";
    const currentDeploymentId =
      selectedDeploymentRecordId()
      ?? selectedRun()?.deployment_id
      ?? activeDeployment()?.deployment_id
      ?? null;
    return workflowSavedReviewScopeMismatch({
      currentDeploymentId,
      currentEnvironment,
      recordDeploymentId: record.deployment_id,
      recordEnvironment: record.environment,
    });
  });
  const storedSharedReviewMatchesCurrentView = createMemo(() => {
    const parsedStoredUrl = storedSharedReviewRecordStateForCurrentWorkflow()?.recordState?.parsedUrl;
    return workflowUrlsMatchView(parsedStoredUrl, window.location.href);
  });
  const applyReviewUrlNavigationState = (urlState: ReviewUrlState | null) => {
    const workflowId = currentWorkflow()?.workflow_id ?? null;
    const persistedRunId = workflowId ? persistedRunSelections()[workflowId] : null;
    const navigationPlan = resolveWorkflowReviewUrlNavigationPlan({
      urlState,
      currentWorkflowId: workflowId,
      runs: runHistory(),
      persistedRunId,
    });

    if (navigationPlan.kind === "clear") {
      const persistedContext = workflowId ? persistedStoredSharedReviewUiContexts()[workflowId] : null;
      const nextSharedReviewUiState = resolveWorkflowStoredSharedReviewUiState({
        workflowId,
        pendingUrlState: null,
        persistedContext,
      });
      setSharedReviewBannerVisible(false);
      setPendingUrlReviewState(null);
      setReplayPreviewRunId(null);
      setRollbackPreviewDeploymentId(null);
      applyRunReviewContext(null, graph(), deploymentHistory());
      setRunHistoryDriftFilter(navigationPlan.driftFilter);
      setRunHistorySortMode(navigationPlan.sortMode);
      setSelectedRunId(navigationPlan.selectedRunId);
      setSelectedStoredSharedReviewId(nextSharedReviewUiState.selectedReviewId);
      setShowAllStoredSharedReviews(nextSharedReviewUiState.showAll);
      setStoredSharedReviewFilter(nextSharedReviewUiState.filterText);
      setStoredSharedReviewSortMode(nextSharedReviewUiState.sortMode);
      setStoredSharedReviewShareModeFilter(nextSharedReviewUiState.shareModeFilter);
      setStoredSharedReviewPinnedOnly(nextSharedReviewUiState.pinnedOnly);
      return;
    }

    setRunHistoryDriftFilter(navigationPlan.driftFilter);
    setRunHistorySortMode(navigationPlan.sortMode);
    setReplayPreviewRunId(null);
    setRollbackPreviewDeploymentId(null);

    if (navigationPlan.kind === "load-workflow") {
      setPendingUrlReviewState(navigationPlan.pendingUrlState);
      void loadWorkflow(navigationPlan.workflowIdToLoad);
      return;
    }

    setPendingUrlReviewState(navigationPlan.pendingUrlState);
    setSelectedRunId(navigationPlan.selectedRunId);
    setSelectedStoredSharedReviewId(navigationPlan.sharedReviewUiState.selectedReviewId);
    setShowAllStoredSharedReviews(navigationPlan.sharedReviewUiState.showAll);
    setStoredSharedReviewFilter(navigationPlan.sharedReviewUiState.filterText);
    setStoredSharedReviewSortMode(navigationPlan.sharedReviewUiState.sortMode);
    setStoredSharedReviewShareModeFilter(navigationPlan.sharedReviewUiState.shareModeFilter);
    setStoredSharedReviewPinnedOnly(navigationPlan.sharedReviewUiState.pinnedOnly);
    applyRunReviewContext(
      navigationPlan.runReviewContext,
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
    return workflowActiveDeployment({
      deployments: deploymentHistory(),
      graph: graph(),
    });
  });
  const nodeDeploymentPolicies = createMemo(() => {
    return workflowNodeDeploymentPolicies({
      deployment: activeDeployment(),
      graph: graph(),
    });
  });
  const pendingNodeDeploymentPolicies = createMemo(() => {
    return workflowPendingNodeDeploymentPolicies({
      deploymentDraft: deployOverrideDraft(),
      familyOverrides: deployFamilyOverrides(),
      graph: graph(),
      nodeOverrides: deployNodeOverrides(),
    });
  });
  const pendingDeploymentChangeSummary = createMemo(() => workflowPendingDeploymentChangeSummary({
    deployedPolicies: nodeDeploymentPolicies(),
    nodes: graph()?.nodes ?? [],
    pendingPolicies: pendingNodeDeploymentPolicies(),
  }));
  const deployPreviewDiff = createMemo(() => {
    return workflowDeployPreviewDiff({
      deployedPolicies: nodeDeploymentPolicies(),
      nodes: graph()?.nodes ?? [],
      pendingPolicies: pendingNodeDeploymentPolicies(),
    });
  });
  const deploymentHistoryById = createMemo(() => workflowDeploymentHistoryById(deploymentHistory()));
  const nodeLabelById = createMemo(() => workflowNodeLabelsById(graph()));
  const selectedRunEdge = () => workflowSelectedEdge(graph(), selectedRunEdgeId());
  const currentSavedReviewWorkspaceActive = createMemo(() => {
    return workflowSavedReviewWorkspaceActive({
      selectedSavedReview: selectedStoredSharedReviewSelectorEntry(),
      showAll: showAllStoredSharedReviews(),
      filterText: storedSharedReviewFilter(),
      sortMode: storedSharedReviewSortMode(),
    });
  });
  const sharedReviewBannerSummary = createMemo(() => {
    return workflowSharedReviewBannerSummaryForView({
      deploymentId: selectedDeploymentRecordId(),
      deploymentLookup: deploymentHistoryById(),
      focusedNodeId: runTimelineFocusNodeId(),
      graph: graph(),
      nodeLabels: nodeLabelById(),
      run: selectedRun(),
      runHistoryDriftFilter: runHistoryDriftFilter(),
      runHistorySortMode: runHistorySortMode(),
      runTimelineFilterMode: runTimelineFilterMode(),
      selectedEdgeId: selectedRunEdgeId(),
      selectedNodeId: selectedNodeId(),
      selectedSavedReview: selectedStoredSharedReviewSelectorEntry(),
      showAllSavedReviews: showAllStoredSharedReviews(),
      storedSharedReviewFilter: storedSharedReviewFilter(),
      storedSharedReviewPinnedOnly: storedSharedReviewPinnedOnly(),
      storedSharedReviewShareModeFilter: storedSharedReviewShareModeFilter(),
      storedSharedReviewSortMode: storedSharedReviewSortMode(),
      visible: sharedReviewBannerVisible(),
      workflow: currentWorkflow(),
    });
  });
  const intentExpansion = () => {
    return workflowIntentExpansionWithOverrides(
      workflowIntent(),
      intentPresetOverride(),
      intentOptimizationOverride(),
    );
  };
  const regenerationImpact = () => {
    if (!workflowRegenerationImpactVisible({
      intent: workflowIntent(),
      hasWorkflow: Boolean(currentWorkflow()),
    })) return null;
    return regenerationImpactSummary();
  };
  const selectedDescribeHistoryEntry = () => {
    const workflow = currentWorkflow();
    return selectedDescribeHistoryEntryForDraft(
      workflow ? normalizeGraph(workflow) : null,
      selectedDescribeHistoryEventId(),
    );
  };
  const describeHistoryComparison = () => {
    const workflow = currentWorkflow();
    return describeHistoryComparisonForDraft({
      draft: workflow ? normalizeGraph(workflow) : null,
      entry: selectedDescribeHistoryEntry(),
      intentOverride: workflowIntent(),
      optimizationOverride: intentOptimizationOverride(),
      presetOverride: intentPresetOverride(),
      regenerationMode: regenerationMode(),
      workflowDescription: workflow?.description,
    });
  };
  const persistedSelectedRunStatuses = createMemo(() => runNodeStatuses(selectedRun()));
  const persistedSelectedRunStepOrder = createMemo(() => runStepOrder(selectedRun()));
  const persistedSelectedRunEdgeStates = createMemo(() => runEdgeStates(graph(), selectedRun()));
  const liveRunNodeOverlays = createMemo(() => liveRunNodeOverlaysFromEvents(liveRunStreamEvents()));
  const selectedRunStatuses = createMemo(() => {
    return mergeLiveRunStatuses(persistedSelectedRunStatuses(), liveRunNodeOverlays());
  });
  const selectedRunStepOrder = createMemo(() => {
    return mergeLiveRunStepOrder(persistedSelectedRunStepOrder(), liveRunNodeOverlays());
  });
  const selectedRunEdgeStates = createMemo(() => {
    const draft = graph();
    return mergeLiveRunEdgeStates(persistedSelectedRunEdgeStates(), draft?.edges ?? [], liveRunNodeOverlays());
  });
  const selectedRunEdgeTimeline = () => runTimelineSliceForEdge(graph(), selectedRun(), selectedRunEdgeId());
  const selectedRunNodePolicyDeltas = createMemo(() => {
    return workflowSelectedRunNodePolicyDeltas({
      deploymentLookup: deploymentHistoryById(),
      graph: graph(),
      run: selectedRun(),
    });
  });
  const selectedRunEdgePolicyDeltas = createMemo(() => {
    return workflowSelectedRunEdgePolicyDeltas({
      deploymentLookup: deploymentHistoryById(),
      graph: graph(),
      run: selectedRun(),
    });
  });
  const runHistoryEntries = createMemo(() => {
    return workflowRunHistoryEntriesView({
      assetFilter: runHistoryAssetFilter(),
      deploymentLookup: deploymentHistoryById(),
      familyFilter: runHistoryFamilyFilter(),
      filterMode: runHistoryDriftFilter(),
      graph: graph(),
      instanceFilter: runHistoryInstanceFilter(),
      runs: runHistory(),
      sortMode: runHistorySortMode(),
    });
  });
  const runHistoryLineageOptions = createMemo(() => {
    return workflowRunHistoryLineageOptionsView(
      runHistory().map((run) => parseWorkflowFamilyContext(run.result?.workflow_family_context)),
    );
  });
  const workflowInteractionLocked = () =>
    workflowInteractionLockedView(busyAction());
  const workflowExecutionRefreshing = () =>
    workflowExecutionRefreshingView(busyAction(), liveRefreshUntil(), Date.now());
  const workflowInteractionLockLabel = () => {
    return workflowInteractionLockLabelView(busyAction());
  };

  createEffect(() => {
    const available = workflows();
    const nextWorkflowId = resolveWorkflowIdToLoad({
      workflows: available ?? [],
      preferredWorkflowId: pendingUrlReviewState()?.workflow_id,
      currentWorkflowPresent: Boolean(currentWorkflow()),
    });
    if (nextWorkflowId) void loadWorkflow(nextWorkflowId);
  });

  createEffect(() => {
    const draft = graph();
    const selectedEdgeId = selectedRunEdgeId();
    const nextSelectedEdgeId = workflowSelectedRunEdgeIdAfterGraphChange(selectedEdgeId, draft?.edges);
    if (nextSelectedEdgeId !== selectedEdgeId) setSelectedRunEdgeId(nextSelectedEdgeId);
  });

  createEffect((previousRunId: string | null | undefined) => {
    const runId = selectedRun()?.run_id ?? null;
    const selectedEdgeId = selectedRunEdgeId();
    const nextSelectedEdgeId = workflowSelectedRunEdgeIdAfterRunChange({
      selectedEdgeId,
      currentRunId: runId,
      previousRunId,
      restoringRunReviewContext: restoringRunReviewContext(),
    });
    if (nextSelectedEdgeId !== selectedEdgeId) setSelectedRunEdgeId(nextSelectedEdgeId ?? null);
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
    const editorText = workflowSelectedNodeEditorText(node);
    setConfigText(editorText.configText);
    setPolicyText(editorText.policyText);
  });

  createEffect(() => {
    const available = workflows() ?? [];
    if (!available.length) return;
    const current = collapsedBranchFamilies();
    const next = collapsedBranchFamilyIdsForAvailableWorkflows({
      collapsedFamilyIds: current,
      workflows: available,
    });
    if (next.size !== current.size) {
      setCollapsedBranchFamilies(next);
    }
  });

  createEffect(() => {
    const workflowId = selectedWorkflowId();
    const available = workflows() ?? [];
    if (!workflowId || !available.length) return;
    setCollapsedBranchFamilies((current) => {
      const next = collapsedBranchFamilyIdsAfterSelectedWorkflow({
        collapsedFamilyIds: current,
        selectedWorkflowId: workflowId,
        workflows: available,
      });
      return next.size === current.size ? current : next;
    });
  });

  createEffect(() => {
    const collapsed = [...collapsedBranchFamilies()];
      try {
      saveCollapsedWorkflowBranchFamilies(new Set(collapsed), sessionUserId());
    } catch {
      // Ignore local persistence failures and keep the in-memory session state.
    }
  });

  createEffect(() => {
    const workflowId = currentWorkflow()?.workflow_id;
    const runId = selectedRunId();
    setPersistedRunSelections((current) => upsertWorkflowRunSelection(current, workflowId, runId));
  });

  createEffect(() => {
    const workflowId = currentWorkflow()?.workflow_id;
    if (!workflowId) return;
    const nextContext = workflowRunReviewContextForPersistence({
      selectedRunEdgeId: selectedRunEdgeId(),
      runTimelineFilterMode: runTimelineFilterMode(),
      focusedNodeId: runTimelineFocusNodeId(),
      selectedDeploymentRecordId: selectedDeploymentRecordId(),
      selectedNodeId: selectedNodeId(),
    });
    setPersistedRunReviewContexts((current) => upsertWorkflowRunReviewContext(current, workflowId, nextContext));
  });

  createEffect(() => {
    const workflowId = currentWorkflow()?.workflow_id;
    if (!workflowId) return;
    const nextContext = workflowStoredSharedReviewUiContextForPersistence({
      selectedReviewId: selectedStoredSharedReviewId(),
      showAll: showAllStoredSharedReviews(),
      filterText: storedSharedReviewFilter(),
      sortMode: storedSharedReviewSortMode(),
      shareModeFilter: storedSharedReviewShareModeFilter(),
      pinnedOnly: storedSharedReviewPinnedOnly(),
    });
    setPersistedStoredSharedReviewUiContexts((current) =>
      upsertWorkflowStoredSharedReviewUiContext(current, workflowId, nextContext)
    );
  });

  createEffect(() => {
    try {
      persistWorkflowRunHistoryReviewStorageState({
        driftFilter: runHistoryDriftFilter(),
        sortMode: runHistorySortMode(),
        selectedRuns: persistedRunSelections(),
        reviewContexts: persistedRunReviewContexts(),
        sharedReviewUiContexts: persistedStoredSharedReviewUiContexts(),
      }, sessionUserId());
    } catch {
      // Ignore local persistence failures and keep the in-memory review state.
    }
  });

  createEffect(() => {
    try {
      persistWorkflowSharedReviewLinksStorage(persistedSharedReviewLinks(), {
        inferShareMode: (href) =>
          inferWorkflowSharedReviewShareModeFromHref(href, window.location.origin),
      }, sessionUserId());
    } catch {
      // Ignore local persistence failures and keep the in-memory shared review links.
    }
  });

  createEffect(() => {
    const nextUrl = buildWorkflowReviewStateUrl({
      currentSearch: window.location.search,
      driftFilter: runHistoryDriftFilter(),
      focusedNodeId: runTimelineFocusNodeId(),
      hash: window.location.hash,
      pathname: window.location.pathname,
      runHistorySortMode: runHistorySortMode(),
      runId: selectedRunId(),
      savedReviewFilter: storedSharedReviewFilter(),
      savedReviewPinnedOnly: storedSharedReviewPinnedOnly(),
      savedReviewShareModeFilter: storedSharedReviewShareModeFilter(),
      savedReviewSortMode: storedSharedReviewSortMode(),
      selectedDeploymentId: selectedDeploymentRecordId(),
      selectedEdgeId: selectedRunEdgeId(),
      selectedNodeId: selectedNodeId(),
      selectedReviewId: selectedStoredSharedReviewId(),
      showAllSavedReviews: showAllStoredSharedReviews(),
      timelineFilter: runTimelineFilterMode(),
      workflowId: currentWorkflow()?.workflow_id ?? selectedWorkflowId(),
    });
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      replaceWorkflowHistoryState(window.history, nextUrl);
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
      const payload = parseLiveRunStreamEvent(message.data);
      if (!payload) return;
      setLiveRunStreamEvents((current) => {
        const key = liveRunStreamEventKey(payload);
        if (current.some((entry) => liveRunStreamEventKey(entry) === key)) {
          return current;
        }
        const next = [...current, payload];
        return next.slice(-40);
      });
      if (liveRunStreamEventIsTerminal(payload)) {
        setLiveRunStreamConnected(false);
        void refreshRunHistory(workflowId);
        const runId = selectedRun()?.run_id ?? selectedRunId();
        if (runId) void refreshSelectedRunWaitResumeRecords(workflowId, runId);
        stream.close();
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
      setCollapsedBranchFamilies(loadCollapsedWorkflowBranchFamilies(sessionUserId()));
    } catch {
      // Ignore local persistence failures and fall back to the default expanded state.
    }
    try {
      const persistedReviewState = loadWorkflowRunHistoryReviewStorageState(sessionUserId());
      setRunHistoryDriftFilter(persistedReviewState.driftFilter);
      setRunHistorySortMode(persistedReviewState.sortMode);
      setPersistedRunSelections(persistedReviewState.selectedRuns);
      setPersistedRunReviewContexts(persistedReviewState.reviewContexts);
      setPersistedStoredSharedReviewUiContexts(persistedReviewState.sharedReviewUiContexts);
    } catch {
      // Ignore local persistence failures and fall back to the default run review state.
    }
    try {
      setPersistedSharedReviewLinks(
        loadWorkflowSharedReviewLinksStorage({
          createId: makeId,
          inferShareMode: (href) =>
            inferWorkflowSharedReviewShareModeFromHref(href, window.location.origin),
        }, sessionUserId()),
      );
    } catch {
      // Ignore local persistence failures and fall back to the default shared review link state.
    }
    try {
      const urlState = readWorkflowReviewUrlStateFromSearch(window.location.search);
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
      updateGraph((draft) => workflowGraphAfterNodePosition(draft, dragStateHolder.current!.nodeId, { x, y }));
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
      setDragGhostOrigin(null); // 30o - clear ghost on drop
    };
    const handlePopState = () => {
      try {
        applyReviewUrlNavigationState(readWorkflowReviewUrlStateFromSearch(window.location.search));
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
    // 21k - node run timer tick
    const tickInterval = setInterval(() => setNowMs(Date.now()), 1000);
    onCleanup(() => clearInterval(tickInterval));
    // Load connector adapter registry once on mount so node panels can show family descriptions.
    let adapterRegistryMounted = true;
    void getWorkflowConnectorAdapters().then((response) => {
      if (!adapterRegistryMounted) return;
      setConnectorAdapters(Array.isArray(response.adapters) ? response.adapters : []);
    }).catch(() => { /* Non-fatal; adapters panel degrades gracefully */ });
    onCleanup(() => {
      adapterRegistryMounted = false;
    });

    // 29a - Magic Pointer action handler for workflow nodes
    const unsubscribeMagicActionEvent = subscribeMagicActionEvent(({ action, msgId }) => {
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
    });
    onCleanup(() => unsubscribeMagicActionEvent());

    // 30g - Jump-to-node via command bar: listen for omnyid:goto-node events
    const unsubscribeGotoNodeEvent = subscribeGotoNodeEvent((detail) => {
      const nodeId = detail.nodeId;
      if (!nodeId) return;
      setGotoNodeId(nodeId);
      setSelectedNodeId(nodeId);
      setSelectedInspectorSection(null);
      // Scroll canvas to node if possible
      const nodeEl = canvasRefHolder.current?.querySelector(workflowNodeDataSelector(nodeId));
      nodeEl?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      scheduleGotoNodeClear();
    });
    onCleanup(() => unsubscribeGotoNodeEvent());

  // 30d - detect error nodes from selected run steps
    onCleanup(() => {
      if (replayInterval) clearInterval(replayInterval);
    });
  });

  // 30d - Anomaly pulse: scan runs to find nodes with recent failures
  createEffect(() => {
    setNodeErrorIds(recentFailedRunNodeIds(runHistory()));
  });

  // 30l - Execution trace replay
  function startReplay() {
    const steps = runTimelineSteps(selectedRun());
    if (steps.length === 0) return;
    setReplayActive(true);
    setReplayStepIdx(0);
    if (replayInterval) clearInterval(replayInterval);
    replayInterval = setInterval(() => {
      setReplayStepIdx(prev => {
        const nextReplayState = nextReplayStepState(prev, steps);
        if (nextReplayState.done) {
          if (replayInterval) clearInterval(replayInterval);
          replayInterval = null;
          setReplayActive(false);
          return prev;
        }
        if (nextReplayState.nextNodeId) setSelectedNodeId(nextReplayState.nextNodeId);
        return nextReplayState.nextIndex;
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
    clearFeedbackError();
    try {
      const pendingUrlState = pendingUrlReviewState();
      const urlRunId = pendingUrlState?.workflow_id === workflowId ? pendingUrlState.run_id : null;
      const persistedRunId = persistedRunSelections()[workflowId];
      const loaded = await loadWorkflowAsyncState({
        workflowId,
        preferredRunId: urlRunId,
        persistedRunId,
      });
      const workflow = cloneJson(loaded.workflow);
      setSelectedWorkflowId(workflow.workflow_id);
      setCurrentWorkflow(workflow);
      setDeploymentHistory(loaded.deployments);
      setRunHistory(loaded.runs);
      const triggerRequestId = ++triggerRegistrationRequestId;
      setTriggerRegistrationsLoading(true);
      queueMicrotask(() => {
        if (triggerRequestId !== triggerRegistrationRequestId) return;
        setTriggerRegistrations(loaded.triggerRegistrations);
        setTriggerRegistrationsLoading(false);
      });
      setSelectedRunId(loaded.selectedRunId);
      restoreRunReviewContextForWorkflow(workflow.workflow_id, normalizeGraph(workflow), loaded.deployments);
      setValidationResult(null);
    } catch (error) {
      setWorkflowFeedbackFailure("Load workflow", error);
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

  // 18k - filtered workflow list for tag filter
  const filteredWorkflowsForRail = createMemo(() => {
    return filteredWorkflowsForRailView({
      workflows: workflows() ?? [],
      tagFilter: tagFilter(),
      tagsByWorkflow: workflowTags(),
      favoritesOnly: favoritesOnly(),
    });
  });

  function branchFamilyCollapsed(rootId: string) {
    return collapsedBranchFamilies().has(rootId);
  }

  function toggleBranchFamily(rootId: string) {
    setCollapsedBranchFamilies((current) => {
      return collapsedBranchFamilyIdsAfterToggle(current, rootId);
    });
  }

  function branchWorkflowVisibleInRail(workflow: SavedWorkflow) {
    return workflowBranchVisibleInRail({
      workflow,
      collapsedFamilyIds: collapsedBranchFamilies(),
      selectedWorkflowId: selectedWorkflowId(),
    });
  }

  function branchFamilyRootIdsWithChildren() {
    return branchFamilyRootIdsWithChildrenView(workflows() ?? []);
  }

  function branchFamilySummary() {
    return workflowBranchFamilySummary({
      workflows: workflows() ?? [],
      collapsedFamilyIds: collapsedBranchFamilies(),
    });
  }

  const workflowRailFamilySummary = createMemo(() => branchFamilySummary());

  const workflowRailFamilySummaryLabel = createMemo(() => {
    return workflowRailFamilySummaryLabelView(workflowRailFamilySummary());
  });

  const workflowRailTagItems = createMemo(() => workflowRailTagItemsView(workflowTags()));
  const favoriteWorkflowCount = createMemo(() =>
    (workflows() ?? []).filter((workflow) => workflow.favorite).length,
  );

  function workflowRailTagsFor(workflowId: string): string[] {
    return workflowTags()[workflowId] ?? [];
  }

  function saveWorkflowRailTags(workflowId: string, tags: string[]) {
    const next = workflowRailTagsAfterSave(workflowTags(), workflowId, tags);
    setWorkflowTags(next);
    try { saveWorkflowTags(next, sessionUserId()); } catch { /* ignore */ }
  }

  function workflowRailNeverRun(workflowId: string): boolean {
    return !workflowHasRun().has(workflowId);
  }

  function workflowRailRunStatsBadge(workflowId: string): WorkflowRailBadgeView | null {
    return workflowRailRunStatsBadgeView(workflowRunStats()[workflowId]);
  }

  function workflowRailTriggerBadge(info: ReturnType<typeof summary>): WorkflowRailBadgeView | null {
    return workflowRailTriggerBadgeView(info);
  }

  function renderWorkflowRailBadge(badge: WorkflowRailBadgeView | null) {
    if (!badge) return null;
    return (
      <div class="mt-0.5 px-1">
        <span
          class={`rounded-full border px-2 py-0.5 font-mono text-[9px] ${badge.className}`}
          title={badge.title}
        >
          {badge.label}
        </span>
      </div>
    );
  }

  function workflowRailVersionItems(workflowId: string): WorkflowRailVersionItem[] {
    return workflowRailVersionItemsView({
      activeDiff: versionDiffIds(),
      versions: workflowVersions()[workflowId] ?? [],
    });
  }

  function workflowRailVersionDiff(workflowId: string): WorkflowRailVersionDiff | null {
    return workflowRailVersionDiffView({
      diffIds: versionDiffIds(),
      versions: workflowVersions()[workflowId] ?? [],
    });
  }

  function expandAllBranchFamilies() {
    setCollapsedBranchFamilies(new Set<string>());
  }

  function collapseOtherBranchFamilies() {
    setCollapsedBranchFamilies(
      collapsedBranchFamilyIdsExceptSelected({
        workflows: workflows() ?? [],
        selectedWorkflowId: selectedWorkflowId(),
      }),
    );
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

  function regenerationImpactSummary() {
    const workflow = currentWorkflow();
    if (!workflow) return null;
    return workflowRegenerationImpactSummary(normalizeGraph(workflow));
  }

  function buildWorkflowFromIntent(intent: string, baseWorkflow?: SavedWorkflow | null) {
    return workflowBuiltFromIntent({
      intent,
      baseWorkflow,
      expansion: intentExpansion(),
      regenerationMode: regenerationMode(),
    });
  }

  function applyDescribeHistoryEntry(entry: DescribeHistoryEntry) {
    const state = describeHistoryEntryComposerState(entry);
    setWorkflowIntent(state.intent);
    setIntentPresetOverride(state.presetOverride);
    setIntentOptimizationOverride(state.optimizationOverride);
    setRegenerationMode(state.regenerationMode);
  }

  async function saveWorkflowBranchFromDescribeHistory(entry: DescribeHistoryEntry) {
    setBusyAction("describe");
    setFeedback("");
    try {
      const state = describeHistoryEntryComposerState(entry);
      const result = await describeWorkflowBranchAsyncState({
        workflowId: currentWorkflow()?.workflow_id,
        eventId: entry.event_id,
        intent: state.intent,
        presetOverride: state.presetOverride,
        optimizationOverride: state.optimizationOverride || null,
        regenerationMode: state.regenerationMode,
        currentWorkflows: workflows() ?? [],
        selectNodeId: (workflow) => workflowInitialSelectedNodeId(normalizeGraph(workflow), "prefer_second"),
      });
      const branched = cloneJson(result.workflow);
      setCurrentWorkflow(branched);
      setSelectedWorkflowId(branched.workflow_id);
      setSelectedNodeId(result.selectedNodeId);
      if (result.shouldResetExecutionHistory) {
        setDeploymentHistory([]);
        setRunHistory([]);
        setSelectedRunId(null);
        setValidationResult(null);
      }
      setWorkflowIntent(state.intent);
      setIntentPresetOverride(state.presetOverride);
      setIntentOptimizationOverride(state.optimizationOverride);
      setRegenerationMode(state.regenerationMode);
      mutate(() => result.workflows);
      setFeedback(result.feedback);
    } catch (error) {
      setFeedback(workflowDescribeBranchFailureFeedback(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function createWorkflowFromIntent() {
    const intent = workflowIntent().trim();
    const preflightFeedback = workflowDescribeCreatePreflightFeedback(intent);
    if (preflightFeedback) {
      setFeedback(preflightFeedback);
      return;
    }
    setBusyAction("describe");
    setFeedback("");
    try {
      const result = await createWorkflowFromIntentAsyncState({
        intent,
        presetOverride: intentPresetOverride(),
        optimizationOverride: intentOptimizationOverride() || null,
        regenerationMode: regenerationMode(),
        currentWorkflows: workflows() ?? [],
        fallbackWorkflow: buildWorkflowFromIntent(intent),
        selectNodeId: (workflow) => workflowInitialSelectedNodeId(normalizeGraph(workflow), "prefer_second"),
      });
      const nextWorkflow = cloneJson(result.workflow);
      setCurrentWorkflow(nextWorkflow);
      setSelectedWorkflowId(nextWorkflow.workflow_id);
      setSelectedNodeId(result.selectedNodeId);
      if (result.shouldResetExecutionHistory) {
        setDeploymentHistory([]);
        setRunHistory([]);
        setSelectedRunId(null);
        setValidationResult(null);
      }
      if (result.workflows.length > 0) {
        mutate(() => result.workflows);
        setWorkflowIntent("");
        setIntentPresetOverride("");
        setIntentOptimizationOverride("");
      }
      setFeedback(result.feedback);
    } finally {
      setBusyAction(null);
    }
  }

  async function regenerateCurrentWorkflowFromIntent() {
    const workflow = currentWorkflow();
    if (!workflow) {
      setFeedback(workflowRegeneratePreflightFeedback({ hasWorkflow: false, sourceIntent: "" }) ?? "");
      return;
    }
    const sourceIntent = workflowSourceIntentForRegeneration({
      composerIntent: workflowIntent(),
      description: workflow.description,
      draft: normalizeGraph(workflow),
    });
    const preflightFeedback = workflowRegeneratePreflightFeedback({
      hasWorkflow: true,
      sourceIntent,
    });
    if (preflightFeedback) {
      setFeedback(preflightFeedback);
      return;
    }

    setBusyAction("describe");
    setFeedback("");
    try {
      const result = await regenerateWorkflowFromIntentAsyncState({
        workflow,
        sourceIntent,
        presetOverride: intentPresetOverride(),
        optimizationOverride: intentOptimizationOverride() || null,
        regenerationMode: regenerationMode(),
        fallbackWorkflow: buildWorkflowFromIntent(sourceIntent, workflow),
        selectNodeId: (nextWorkflow) => workflowInitialSelectedNodeId(normalizeGraph(nextWorkflow), "prefer_second"),
      });
      const regenerated = cloneJson(result.workflow);
      setCurrentWorkflow(regenerated);
      setSelectedWorkflowId(regenerated.workflow_id);
      setSelectedNodeId(result.selectedNodeId);
      if (result.shouldResetExecutionHistory) {
        setDeploymentHistory([]);
        setRunHistory([]);
        setSelectedRunId(null);
        setValidationResult(null);
      }
      setWorkflowIntent(sourceIntent);
      setFeedback(result.feedback);
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
      const subgraph = workflowIntentStarterSubgraph(
        presetKind,
        index,
      );
      updateGraph((current) => workflowGraphAfterPresetStarterAdd(current, subgraph));
      setSelectedNodeId(subgraph.nextNodes[0].id);
      setFeedback(workflowPresetStarterAddedFeedback(preset));
      return;
    }
    const nextNodeId = makeId("node");
    updateGraph((current) => workflowGraphAfterPrimitiveNodeAdd(current, kind, nextNodeId).graph);
    setSelectedNodeId(nextNodeId);
  }

  function removeSelectedNode() {
    if (workflowInteractionLocked()) return;
    const patch = workflowSelectedNodeDeletePatchPayload(selectedNodeId());
    if (!patch) return;
    updateGraph((draft) => workflowGraphAfterNodeDelete(draft, patch.node_id));
    setSelectedNodeId(null);
    void handleWorkflowPatch(patch);
  }

  function duplicateNode(nodeId: string) {
    if (workflowInteractionLocked()) return;
    const src = graph()?.nodes.find((n) => n.id === nodeId);
    if (!src) return;
    const nextNodeId = makeId("node");
    updateGraph((current) => workflowGraphAfterNodeDuplicate(current, nodeId, nextNodeId).graph);
    setSelectedNodeId(nextNodeId);
    setCtxMenu(null);
  }

  function addSemanticNode(starterId: string) {
    if (workflowInteractionLocked()) return;
    const starter = semanticStarterById(starterId);
    if (!starter) {
      setFeedback(workflowUnknownSemanticStarterFeedback(starterId));
      return;
    }
    const nextNodeId = makeId("node");
    updateGraph((current) => workflowGraphAfterSemanticNodeAdd(current, starter, nextNodeId).graph);
    setSelectedNodeId(nextNodeId);
    setFeedback(workflowSemanticNodeAddedFeedback(starter.label));
  }

  function applyConfig() {
    if (workflowInteractionLocked()) return;
    const parsed = parseWorkflowJsonRecord(configText());
    if (!parsed.ok) {
      setFeedback(workflowJsonInvalidFeedback("config", parsed.message));
      return;
    }
    const patch = workflowSelectedNodeConfigPatchPayload(selectedNodeId(), parsed.value);
    if (patch) {
      updateGraph((draft) => workflowGraphAfterNodeConfig(draft, patch.node_id, parsed.value));
      void handleWorkflowPatch(patch);
    }
    setFeedback(workflowJsonAppliedFeedback("config"));
  }

  function applyPolicy() {
    if (workflowInteractionLocked()) return;
    const parsed = parseWorkflowJsonRecord(policyText());
    if (!parsed.ok) {
      setFeedback(workflowJsonInvalidFeedback("policy", parsed.message));
      return;
    }
    const patch = workflowSelectedNodePolicyPatchPayload(selectedNodeId(), parsed.value);
    if (patch) {
      updateGraph((draft) => workflowGraphAfterNodePolicy(draft, patch.node_id, parsed.value));
      void handleWorkflowPatch(patch);
      setPolicyText(workflowNodePolicyText(parsed.value));
    }
    setFeedback(workflowJsonAppliedFeedback("policy"));
  }

  function addEdge() {
    if (workflowInteractionLocked()) return;
    const request = workflowEdgeAddRequest({
      source: edgeSource(),
      target: edgeTarget(),
      conditionLabel: edgeConditionLabel(),
      edgeId: makeId("edge"),
    });
    const preflightFeedback = workflowEdgeAddPreflightFeedback(request);
    if (preflightFeedback || !request) {
      setFeedback(preflightFeedback ?? "");
      return;
    }
    updateGraph((draft) => workflowGraphAfterEdgeAdd(draft, request.edge));
    setEdgeTarget("");
    setEdgeConditionLabel("");
    setFeedback(workflowEdgeAddedFeedback());
    void handleWorkflowPatch(request.patch);
  }

  function patchEdgeConditionLabel(edgeId: string, conditionLabel: string) {
    if (workflowInteractionLocked()) return;
    const patch = workflowEdgeMetaPatchPayload(edgeId, conditionLabel);
    updateGraph((draft) => workflowGraphAfterEdgeConditionLabel(draft, edgeId, conditionLabel));
    void handleWorkflowPatch(patch);
  }

  function toggleRoot(nodeId: string, checked: boolean) {
    if (workflowInteractionLocked()) return;
    const patch = workflowRootTogglePatchPayload(nodeId, checked);
    updateGraph((draft) => workflowGraphAfterRootToggle(draft, nodeId, checked));
    void handleWorkflowPatch(patch);
  }

  function createNewWorkflow() {
    const workflow = makeNewWorkflow();
    setCurrentWorkflow(workflow);
    setSelectedWorkflowId(workflow.workflow_id);
    setDeploymentHistory([]);
    setRunHistory([]);
    setSelectedRunId(null);
    setSelectedNodeId(workflowInitialSelectedNodeId(normalizeGraph(workflow)));
    setValidationResult(null);
    setFeedback(workflowNewDraftFeedback());
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
    // 30o - track origin for drag ghost
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
    clearFeedbackError();
    try {
      const result = await saveWorkflowAsyncState({
        workflow,
        graph: normalizeGraph(workflow),
        currentWorkflows: workflows() ?? [],
        mode: "prepend",
      });
      const saved = cloneJson(result.saved);
      setCurrentWorkflow(saved);
      setSelectedWorkflowId(saved.workflow_id);
      mutate(() => result.workflows);
      return saved;
    } catch (error) {
      setWorkflowFeedbackFailure("Persist workflow before patching", error);
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
    clearFeedbackError();
    try {
      const result = await patchWorkflowAsyncState({
        workflowId: workflow.workflow_id,
        currentWorkflows: workflows() ?? [],
        patch,
      });
      const updated = cloneJson(result.workflow);
      setCurrentWorkflow(updated);
      setSelectedWorkflowId(updated.workflow_id);
      mutate(() => result.workflows);
      if (result.feedback) setFeedback(result.feedback);
    } catch (error) {
      setWorkflowFeedbackFailure("Patch workflow", error);
    }
  }

  async function refreshDeploymentHistory(workflowId: string) {
    try {
      const deployments = await loadWorkflowDeploymentHistoryState(workflowId);
      setDeploymentHistory(deployments);
    } catch {
      setDeploymentHistory([]);
    }
  }

  async function refreshRunHistory(workflowId: string) {
    try {
      const result = await loadWorkflowRunHistoryState({
        workflowId,
        persistedRunId: persistedRunSelections()[workflowId],
        currentRunId: selectedRunId(),
      });
      setRunHistory(result.runs);
      if (result.shouldMarkWorkflowRun) markWorkflowRun(workflowId);
      setSelectedRunId(result.selectedRunId);
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
    const waitResumeRequestId = ++selectedRunWaitResumeRequestId;
    setSelectedRunWaitResumeLoading(true);
    setSelectedRunWaitResumeError(null);
    try {
      const response = await loadWorkflowWaitResumeRecordsState({ workflowId, runId });
      if (waitResumeRequestId !== selectedRunWaitResumeRequestId) return;
      setSelectedRunWaitResumeRecords(response.records);
    } catch (error) {
      if (waitResumeRequestId !== selectedRunWaitResumeRequestId) return;
      setSelectedRunWaitResumeRecords([]);
      setSelectedRunWaitResumeError(error instanceof Error ? error.message : String(error));
    } finally {
      if (waitResumeRequestId !== selectedRunWaitResumeRequestId) return;
      setSelectedRunWaitResumeLoading(false);
    }
  }

  function retrySelectedRunWaitResumeRecords() {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    const runId = selectedRun()?.run_id ?? selectedRunId();
    if (!workflowId || !runId) return;
    void refreshSelectedRunWaitResumeRecords(workflowId, runId);
  }

  async function copyReviewLink(includeSavedReviewWorkspace = true) {
    setFeedback("");
    const result = await copyWorkflowReviewLinkState({
      clipboard: navigator.clipboard,
      currentHref: window.location.href,
      includeSavedReviewWorkspace,
      savedReviewWorkspaceActive: currentSavedReviewWorkspaceActive(),
    });
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    if (workflowId) {
      persistSharedReviewLinkForWorkflow(
        workflowId,
        result.href,
        includeSavedReviewWorkspace ? "workspace" : "core",
      );
    }
    setFeedback(result.feedback);
  }

  function resumeStoredSharedReview() {
    const result = resumeStoredSharedReviewState({
      entry: storedSharedReviewRecordStateForCurrentWorkflow(),
      historyWriter: window.history,
    });
    if (result.kind === "restored") {
      applyReviewUrlNavigationState(result.reviewState);
    }
    setFeedback(result.feedback);
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
    const result = clearStoredSharedReviewState({ workflowId, record });
    if (result.kind === "preflight" || !workflowId || !record) {
      setFeedback(result.feedback);
      return;
    }
    clearStoredSharedReviewForWorkflow(workflowId, record.id);
    setFeedback(result.feedback);
  }

  function refreshStoredSharedReview() {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    const result = refreshStoredSharedReviewState({
      workflowId,
      href: window.location.href,
      shareMode: currentSavedReviewWorkspaceActive() ? "workspace" : "core",
    });
    if (result.kind === "preflight" || !workflowId || !result.href || !result.shareMode) {
      setFeedback(result.feedback);
      return;
    }
    persistSharedReviewLinkForWorkflow(workflowId, result.href, result.shareMode);
    setFeedback(result.feedback);
  }
  function renameStoredSharedReview() {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    const record = storedSharedReviewRecordForCurrentWorkflow();
    const result = renameStoredSharedReviewState({
      workflowId,
      record,
      promptReader: window,
    });
    if (result.kind === "cancelled") return;
    if (result.kind === "preflight" || result.kind === "unavailable" || !workflowId || !record) {
      setFeedback(result.feedback);
      return;
    }
    updateStoredSharedReviewForWorkflow(workflowId, record.id, (entry) => ({
      ...entry,
      title: result.title,
    }));
    setFeedback(result.feedback);
  }
  function togglePinStoredSharedReview() {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    const record = storedSharedReviewRecordForCurrentWorkflow();
    const result = togglePinStoredSharedReviewState({ workflowId, record });
    if (result.kind === "preflight" || !workflowId || !record || typeof result.nextPinned !== "boolean") {
      setFeedback(result.feedback);
      return;
    }
    const nextPinned = result.nextPinned;
    updateStoredSharedReviewForWorkflow(workflowId, record.id, (entry) => ({
      ...entry,
      pinned: nextPinned,
    }));
    setFeedback(result.feedback);
  }

  async function copyWorkflowLink() {
    setFeedback("");
    const result = await copyWorkflowCleanLinkState({
      clipboard: navigator.clipboard,
      origin: window.location.origin,
      pathname: window.location.pathname,
      hash: window.location.hash,
      workflowId: currentWorkflow()?.workflow_id ?? selectedWorkflowId(),
    });
    setFeedback(result.feedback);
  }

  async function handleSave() {
    const workflow = currentWorkflow();
    if (!workflow) return;
    setBusyAction("save");
    setFeedback("");
    clearFeedbackError();
    try {
      const result = await saveWorkflowAsyncState({
        workflow,
        graph: normalizeGraph(workflow),
        currentWorkflows: workflows() ?? [],
        mode: "upsert",
      });
      const saved = cloneJson(result.saved);
      setCurrentWorkflow(saved);
      setSelectedWorkflowId(saved.workflow_id);
      mutate(() => result.workflows);
      setFeedback(result.feedback);
    } catch (error) {
      setWorkflowFeedbackFailure("Save workflow", error);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleValidate() {
    const workflow = currentWorkflow();
    if (!workflow) return;
    setBusyAction("validate");
    setFeedback("");
    clearFeedbackError();
    try {
      const result = await validateWorkflow(workflowGraphPayload(normalizeGraph(workflow)));
      setValidationResult(result);
      setFeedback(workflowValidationFeedback(result));
    } catch (error) {
      setWorkflowFeedbackFailure("Validate workflow", error);
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
      return {
        ...draft,
        metadata: workflowTemplateSuggestionPreferenceMetadata({
          metadata: draft.metadata,
          templateId,
          preference,
          reviewedAt: new Date().toISOString(),
        }),
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
      const result = workflowGraphAfterTemplateSuggestionScaffold({
        draft,
        matchedNodeIds,
        runtimeLineage,
        steps,
        templateId,
      });
      insertedCount = result.insertedCount;
      return result.graph;
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
    setFeedback(workflowTemplateSuggestionAcceptedFeedback({ insertedCount, title }));
  }

  function dismissTemplateSuggestion(templateId: string, title: string, _matchedNodeIds: string[]) {
    if (workflowInteractionLocked()) return;
    updateTemplateSuggestionPreference(templateId, "dismissed");
    setFeedback(workflowTemplateSuggestionDismissedFeedback(title));
  }

  async function promoteCurrentWorkflowToFamilyAsset() {
    const workflow = currentWorkflow();
    if (!workflow) return;
    const draft = normalizeGraph(workflow);
    const acceptedTemplateIds = acceptedWorkflowTemplateIdsFromMetadata(draft.metadata);
    const preflightFeedback = workflowFamilyPromotionPreflightFeedback(acceptedTemplateIds.length);
    if (preflightFeedback) {
      setFeedback(preflightFeedback);
      return;
    }

    setBusyAction("save");
    setFeedback("");
    clearFeedbackError();
    try {
      const familyGraph = workflowFamilyAssetGraphFromDraft({
        draft,
        familyId: makeId("family"),
        promotedAt: new Date().toISOString(),
        sourceWorkflowId: workflow.workflow_id,
        workflowId: makeId("wf"),
      });
      if (!familyGraph) {
        setFeedback(workflowFamilyPromotionPreflightFeedback(0) ?? "");
        return;
      }
      const saved = cloneJson((await saveWorkflowAsyncState({
        workflow: {
          title: workflow.title,
          latest_ir: null,
          favorite: false,
          archived_at: null,
        },
        graph: familyGraph,
        currentWorkflows: workflows() ?? [],
        mode: "prepend_unique",
      })).saved);
      mutate((current) => workflowSavedCollectionState(current, saved, "prepend_unique"));
      setFeedback(workflowFamilyPromotionSavedFeedback(saved.title));
    } catch (error) {
      setWorkflowFeedbackFailure("Promote workflow family asset", error);
    } finally {
      setBusyAction(null);
    }
  }

  async function instantiateWorkflowFromFamilyAsset() {
    const workflow = currentWorkflow();
    if (!workflow) return;
    const familyAsset = workflowFamilyAssetRecord(workflow);
    const preflightFeedback = workflowFamilyInstancePreflightFeedback(Boolean(familyAsset?.family_id));
    if (preflightFeedback || !familyAsset?.family_id) {
      setFeedback(preflightFeedback ?? "");
      return;
    }

    setBusyAction("save");
    setFeedback("");
    clearFeedbackError();
    try {
      const draft = normalizeGraph(workflow);
      const instanceGraph = workflowFamilyInstanceGraphFromAsset({
        appliedParameterOverrides: familyParameterDrafts(),
        draft,
        familyAsset,
        familyWorkflowId: workflow.workflow_id,
        instanceWorkflowId: makeId("wf"),
        instantiatedAt: new Date().toISOString(),
      });
      const saveResult = await saveWorkflowAsyncState({
        workflow: {
          title: workflow.title,
          latest_ir: null,
          favorite: false,
          archived_at: null,
        },
        graph: instanceGraph,
        currentWorkflows: workflows() ?? [],
        mode: "prepend_unique",
      });
      const saved = cloneJson(saveResult.saved);
      mutate(() => saveResult.workflows);
      setCurrentWorkflow(saved);
      setSelectedWorkflowId(saved.workflow_id);
      setSelectedNodeId(workflowInitialSelectedNodeId(normalizeGraph(saved)));
      setValidationResult(null);
      setFeedback(workflowFamilyInstanceCreatedFeedback(saved.title));
    } catch (error) {
      setWorkflowFeedbackFailure("Create workflow from family asset", error);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCompile() {
    const workflow = currentWorkflow();
    if (!workflow) return;
    setBusyAction("compile");
    setFeedback("");
    clearFeedbackError();
    try {
      if (!(workflows() ?? []).some((entry) => entry.workflow_id === workflow.workflow_id)) {
        const persisted = await ensureWorkflowPersisted();
        if (!persisted) return;
      }
      const result = await compileWorkflowAsyncState({
        workflow: currentWorkflow() ?? workflow,
        currentWorkflows: workflows() ?? [],
      });
      setCurrentWorkflow(result.workflow);
      mutate(() => result.workflows);
      setFeedback(result.feedback);
      void refetch();
    } catch (error) {
      setWorkflowFeedbackFailure("Compile workflow", error);
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
    clearFeedbackError();
    try {
      const result = await runWorkflowActionAsyncState({
        workflow,
        currentWorkflows: workflows() ?? [],
        action,
        options,
      });
      if (result.kind === "preflight") {
        setFeedback(result.feedback);
        return;
      }
      const updated = result.workflow;
      setCurrentWorkflow(updated);
      mutate(() => result.workflows);
      if (result.uiEffects.refreshDeploymentHistory) {
        await refreshDeploymentHistory(updated.workflow_id);
      }
      if (result.uiEffects.extendLiveRefreshWindow) {
        extendLiveRefreshWindow();
      }
      if (result.uiEffects.closeDeployPreview) {
        setDeployPreviewOpen(false);
      }
      if (result.uiEffects.clearRollbackPreview) {
        setRollbackPreviewDeploymentId(null);
      }
      setFeedback(result.feedback);
    } catch (error) {
      setWorkflowFeedbackFailure(`${titleCase(action)} workflow`, error);
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
    clearFeedbackError();
    try {
      const result = await startWorkflowRunAsyncState({
        workflowId: workflow.workflow_id,
        kind,
        options,
      });
      if (result.shouldMarkWorkflowRun) markWorkflowRun(workflow.workflow_id);
      if (result.shouldExtendLiveRefreshWindow) extendLiveRefreshWindow();
      await refreshRunHistory(workflow.workflow_id);
      setSelectedRunId(result.selectedRunId);
      if (result.shouldClearReplayPreview) {
        setReplayPreviewRunId(null);
      }
      setFeedback(result.feedback);
    } catch (error) {
      setWorkflowFeedbackFailure(kind === "replay" ? "Replay workflow run" : "Start workflow run", error);
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
    clearFeedbackError();
    try {
      const result = await startWorkflowDryRunAsyncState({
        workflowId: workflow.workflow_id,
        deploymentId,
      });
      if (result.shouldExtendLiveRefreshWindow) extendLiveRefreshWindow();
      await refreshRunHistory(workflow.workflow_id);
      setSelectedRunId(result.selectedRunId);
      setFeedback(result.feedback);
    } catch (error) {
      setWorkflowFeedbackFailure("Dry run workflow", error);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleWorkflowApprovalDecision(
    run: WorkflowRun,
    option: Record<string, unknown>,
  ) {
    const workflowId = currentWorkflow()?.workflow_id ?? selectedWorkflowId();
    const preflightFeedback = workflowApprovalDecisionPreflightFeedback(workflowId);
    if (preflightFeedback || !workflowId) {
      setFeedback(preflightFeedback ?? "");
      return;
    }
    const decisionRequest = workflowApprovalDecisionRequestForOption(option);
    setBusyAction(decisionRequest.busyAction);
    setFeedback("");
    clearFeedbackError();
    try {
      const result = await decideWorkflowApprovalAsyncState({
        workflowId,
        runId: run.run_id,
        option: decisionRequest,
      });
      if (result.kind === "preflight" || result.kind === "missing_pending_approval") {
        setFeedback(result.feedback);
        return;
      }
      if (result.shouldExtendLiveRefreshWindow) extendLiveRefreshWindow();
      await refreshRunHistory(workflowId);
      setSelectedRunId(result.selectedRunId);
      setFeedback(result.feedback);
    } catch (error) {
      setWorkflowFeedbackFailure("Record workflow approval decision", error);
    } finally {
      setBusyAction(null);
    }
  }

  // 19j - replay a run using its run_id
  async function replayRun(run: WorkflowRun) {
    setReplayingRunId(run.run_id);
    try {
      const result = await startWorkflowRunAsyncState({
        workflowId: run.workflow_id,
        kind: "replay",
        options: { replay_run_id: run.run_id },
      });
      if (result.shouldExtendLiveRefreshWindow) extendLiveRefreshWindow();
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
    setDeployOverrideDraft((current) =>
      workflowDeploymentOverrideDraftAfterEnvironmentChange(current, environment)
    );
  });

  const connectorOverrideTargets = () => {
    const workflow = currentWorkflow();
    return workflowConnectorOverrideTargets(workflow ? normalizeGraph(workflow) : null);
  };

  function deploymentOverridePayload(): WorkflowConnectorOverrides {
    return buildDeploymentOverridePayload({
      draft: deployOverrideDraft(),
      familyOverrides: deployFamilyOverrides(),
      nodeOverrides: deployNodeOverrides(),
    });
  }

  function patchSelectedNodePrompt(prompt: {
    system_prompt?: string;
    instruction_prompt?: string;
    user_editable?: boolean;
  }) {
    if (workflowInteractionLocked()) return;
    const patch = workflowSelectedNodePromptPatchPayload(selectedNodeId(), prompt);
    if (!patch) return;
    updateGraph((draft) => workflowGraphAfterNodePrompt(draft, patch.node_id, prompt));
    void handleWorkflowPatch(patch);
  }

  function patchSelectedNodeMeta(fields: {
    label?: string;
    description?: string;
  }) {
    if (workflowInteractionLocked()) return;
    const patch = workflowSelectedNodeMetaPatchPayload(selectedNodeId(), fields);
    if (!patch) return;
    updateGraph((draft) => workflowGraphAfterNodeMetaPatch(draft, patch.node_id, fields));
    void handleWorkflowPatch(patch);
  }

  function replaceSelectedNodeConfig(nextConfig: Record<string, unknown>) {
    const patch = workflowSelectedNodeConfigPatchPayload(selectedNodeId(), nextConfig);
    if (!patch) return;
    updateGraph((draft) => workflowGraphAfterNodeConfig(draft, patch.node_id, nextConfig));
    setConfigText(workflowNodeConfigText(nextConfig));
  }

  function patchSelectedNodeConfig(nextConfig: Record<string, unknown>) {
    if (workflowInteractionLocked()) return;
    const patch = workflowSelectedNodeConfigPatchPayload(selectedNodeId(), nextConfig);
    if (!patch) return;
    replaceSelectedNodeConfig(nextConfig);
    void handleWorkflowPatch(patch);
  }

  function selectedNodeOutgoingTargets() {
    return workflowSelectedNodeOutgoingTargetNodes(graph(), selectedNode());
  }

  function selectedNodeOutgoingEdges() {
    return workflowSelectedNodeOutgoingEdgeTargets(graph(), selectedNode());
  }

  async function applyBranchPreset(labels: string[]) {
    if (workflowInteractionLocked()) return;
    const workflow = await ensureWorkflowPersisted();
    const node = selectedNode();
    const outgoingEdges = selectedNodeOutgoingEdges();
    if (!workflow || !node || outgoingEdges.length === 0) {
      setFeedback(workflowBranchPresetUnavailableFeedback());
      return;
    }
    const normalizedLabels = workflowBranchPresetLabelsForEdges(outgoingEdges.length, labels);
    const outgoingEdgeIds = outgoingEdges.map((entry) => entry.edge.id);
    updateGraph((draft) => workflowGraphAfterBranchPresetLabels({
      draft,
      edgeIds: outgoingEdgeIds,
      labels: normalizedLabels,
    }));
    try {
      const result = await applyWorkflowBranchPresetAsyncState({
        workflowId: workflow.workflow_id,
        currentWorkflows: workflows() ?? [],
        edgeIds: outgoingEdgeIds,
        labels: normalizedLabels,
        nodeLabel: node.label,
      });
      setCurrentWorkflow(cloneJson(result.workflow));
      setSelectedWorkflowId(result.workflow.workflow_id);
      mutate(() => result.workflows);
      setFeedback(result.feedback);
    } catch (error) {
      setFeedback(workflowBranchPresetFailureFeedback(error));
    }
  }

  async function applyBranchScaffold(labels: string[]) {
    if (workflowInteractionLocked()) return;
    const workflow = currentWorkflow();
    const node = selectedNode();
    const draft = graph();
    if (!workflow || !node || !draft) return;
    const preflightFeedback = workflowBranchScaffoldPreflightFeedback(selectedNodeOutgoingEdges().length > 0);
    if (preflightFeedback) {
      setFeedback(preflightFeedback);
      return;
    }

    const { graph: nextGraph, nextNodes } = workflowBranchScaffoldForNode({ draft, node, labels });

    setCurrentWorkflow(workflowBranchScaffoldDraftWorkflow({
      workflow,
      graph: nextGraph,
      updatedAt: new Date().toISOString(),
    }));
    setSelectedNodeId(workflowBranchScaffoldSelectedNodeId(nextNodes, node.id));

    try {
      const saveResult = await saveWorkflowAsyncState({
        workflow,
        graph: nextGraph,
        currentWorkflows: workflows() ?? [],
        mode: "upsert",
      });
      const saved = cloneJson(saveResult.saved);
      setCurrentWorkflow(saved);
      setSelectedWorkflowId(saved.workflow_id);
      mutate(() => saveResult.workflows);
      setFeedback(workflowBranchScaffoldSuccessFeedback(labels, node.label));
    } catch (error) {
      setFeedback(workflowBranchScaffoldFailureFeedback(error));
    }
  }


  // Bundle all state for context-consuming sub-components
  const ctxValue = {
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
    refreshDeploymentHistory, refreshRunHistory, retrySelectedRunWaitResumeRecords,
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
      <Suspense fallback={<WorkflowPaneFallback label="workflow composer" />}>
        <WorkflowsComposerPanel />
      </Suspense>
      <Show when={feedbackError()}>
        {(receipt) => (
          <div
            class={`glass-surface rounded-[22px] px-5 py-4 shadow-panel ${
              receipt().tone === "danger"
                ? "border border-rose-200/70 text-rose-900"
                : "border border-amber-200/70 text-amber-950"
            }`}
          >
            <p class="text-sm font-semibold">{receipt().title}</p>
            <p class="mt-1 text-sm">{receipt().summary}</p>
            <p class="mt-2 text-xs opacity-80">{receipt().nextStep}</p>
          </div>
        )}
      </Show>
      <Show when={!feedbackError() && feedback()}>
        <div class="glass-surface rounded-[22px] border border-white/35 px-5 py-4 text-sm text-on-surface-variant shadow-panel">{feedback()}</div>
      </Show>

      <div class="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <div class="glass-surface rounded-[26px] border border-white/35 p-4 shadow-panel">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-on-surface">Saved workflows</p>
              <p class="text-xs uppercase tracking-[0.18em] text-on-surface-variant">revisit - favorite - compile</p>
              <Show when={workflowRailFamilySummaryLabel()}>
                {(familySummary) => (
                <p class="mt-1 text-[11px] uppercase tracking-[0.14em] text-emerald-700">
                  {familySummary().familyLabel}
                  <Show when={familySummary().collapsedCount > 0}>
                    {" - "}{familySummary().collapsedCount} collapsed
                  </Show>
                </p>
                )}
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
            {/* 22h - node search input */}
            <div class="relative">
              <input
                type="text"
                aria-label="Filter workflow nodes"
                placeholder="Filter nodes..."
                value={nodeSearchQuery()}
                onInput={(e) => setNodeSearchQuery(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const first = firstMatchingNodeId();
                    if (first) {
                      setSelectedNodeId(first);
                      setGotoNodeId(first);
                      scheduleGotoNodeClear();
                    }
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
                >Clear</button>
              </Show>
            </div>
            {matchingNodeSummary() && (
              <p class="text-[10px] text-on-surface-variant text-right">
                {matchingNodeSummary()}
              </p>
            )}
            <Show when={!workflows.loading} fallback={<p class="text-sm text-on-surface-variant">Loading workflows...</p>}>
              <Show
                when={workflowsForRail().length > 0}
                fallback={
                  <div class="rounded-2xl border border-dashed border-white/35 bg-white/30 px-4 py-5 text-sm text-on-surface-variant">
                    No saved workflows yet. Describe a workflow above to create the first draft.
                  </div>
                }
              >
                {/* 18k - tag filter bar */}
                <div class="mb-2 flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => setFavoritesOnly((current) => !current)}
                    class={`rounded-full px-2 py-0.5 text-[10px] border transition ${favoritesOnly() ? "bg-amber-500 text-white border-amber-500" : "border-white/30 text-on-surface-variant hover:bg-white/30"}`}
                  >
                    Favorites
                    <Show when={favoriteWorkflowCount() > 0}>
                      {" "}({favoriteWorkflowCount()})
                    </Show>
                  </button>
                  <Show when={workflowRailTagItems().length > 0}>
                    <button
                      type="button"
                      onClick={() => setTagFilter("")}
                      class={`rounded-full px-2 py-0.5 text-[10px] border transition ${!tagFilter() ? "bg-primary text-white border-primary" : "border-white/30 text-on-surface-variant hover:bg-white/30"}`}>
                      All
                    </button>
                    <For each={workflowRailTagItems()}>
                      {(tag) => (
                        <button
                          type="button"
                          onClick={() => setTagFilter(t => t === tag ? "" : tag)}
                          class={`rounded-full px-2 py-0.5 text-[10px] border transition ${tagFilter() === tag ? "bg-primary text-white border-primary" : "border-white/30 text-on-surface-variant hover:bg-white/30"}`}>
                          #{tag}
                        </button>
                      )}
                    </For>
                  </Show>
                </div>
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
                        <Show when={workflowRailNeverRun(workflow.workflow_id)}>
                          <div class="mt-0.5 px-1">
                            <span class="rounded-full border border-outline/20 bg-outline/8 px-2 py-0.5 font-mono text-[9px] text-on-surface-variant/40">
                              Never run
                            </span>
                          </div>
                        </Show>
                        {renderWorkflowRailBadge(workflowRailRunStatsBadge(workflow.workflow_id))}
                        {renderWorkflowRailBadge(workflowRailTriggerBadge(info))}
                        {/* 18k - tags section below the rail card */}
                        <div class="mt-1 flex flex-wrap gap-1 px-1">
                          <For each={workflowRailTagsFor(workflow.workflow_id)}>
                            {(tag) => (
                              <span class="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">#{tag}</span>
                            )}
                          </For>
                          <TagInput workflowId={workflow.workflow_id} tags={workflowTags()} onSave={saveWorkflowRailTags} />
                        </div>
                        {/* 22i - clone workflow button */}
                        <div class="mt-1 px-1 flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            title="Clone this workflow"
                            onClick={(e) => { e.stopPropagation(); void cloneWorkflow(workflow.workflow_id); }}
                            class="rounded-full border border-white/30 bg-white/20 px-2 py-0.5 text-[9px] text-on-surface-variant transition hover:bg-white/40 hover:text-primary"
                          >
                            Clone
                          </button>
                          <Show when={clonedId() === workflow.workflow_id}>
                            <span class="text-[9px] text-emerald-600 font-medium">Cloned!</span>
                          </Show>
                        </div>
                        {/* 20j - workflow version history */}
                        <div class="mt-1 px-1 flex flex-wrap gap-1">
                          <button type="button" onClick={() => setShowVersionsId(id => id === workflow.workflow_id ? null : workflow.workflow_id)}
                            class="rounded-full border border-white/30 px-2 py-0.5 text-[9px] text-on-surface-variant/60 hover:border-primary/30 hover:text-primary/70 transition">
                            History
                          </button>
                          {/* 21m - export workflow as JSON */}
                          <button
                            type="button"
                            title="Export workflow as JSON"
                            onClick={(e) => { e.stopPropagation(); exportWorkflowJson(workflow.workflow_id ?? ""); }}
                            class="rounded-full border border-white/30 bg-white/20 px-2 py-0.5 text-[9px] text-on-surface-variant transition hover:bg-white/40 hover:text-primary"
                          >
                            Export JSON
                          </button>
                          <Show when={showVersionsId() === workflow.workflow_id}>
                            <div class="rounded-lg bg-white/20 mt-1 px-3 py-2 space-y-1 max-h-36 overflow-y-auto">
                              <For each={workflowRailVersionItems(workflow.workflow_id)} fallback={<p class="text-[10px] text-on-surface-variant/50">No snapshots yet - click "Save snapshot" to record one.</p>}>
                                {(item) => (
                                    <div class="flex items-center justify-between text-[10px] text-on-surface-variant">
                                      <span>v{item.versionNumber}</span>
                                      <div class="flex items-center gap-1.5">
                                        <span class="opacity-60">{item.timeLabel}</span>
                                        {/* 30t - diff button between this version and the next */}
                                        <Show when={item.hasPrev}>
                                          <button
                                            type="button"
                                            onClick={() => setVersionDiffIds(item.diffActive ? null : [item.index, item.index + 1])}
                                            class={`rounded px-1 py-0.5 text-[9px] font-medium transition ${item.diffActive ? "bg-violet-200 text-violet-800" : "bg-white/30 text-on-surface-variant/70 hover:bg-white/50"}`}
                                          >
                                            {item.diffActive ? "Hide diff" : "Diff"}
                                          </button>
                                        </Show>
                                      </div>
                                    </div>
                                )}
                              </For>
                              {/* 30t - version diff result panel */}
                              <Show when={workflowRailVersionDiff(workflow.workflow_id)}>
                                {(diff) => (
                                  <div class="mt-1 rounded-lg border border-violet-200/50 bg-violet-50/60 px-2 py-1.5 space-y-1">
                                    <p class="font-mono text-[8px] uppercase text-violet-700 tracking-widest">{diff().label}</p>
                                    <Show when={diff().added.length === 0 && diff().removed.length === 0}>
                                      <p class="text-[9px] text-on-surface-variant/60">No node changes</p>
                                    </Show>
                                    <For each={diff().added}>
                                      {(l) => <p class="text-[9px] text-emerald-700">+ {l}</p>}
                                    </For>
                                    <For each={diff().removed}>
                                      {(l) => <p class="text-[9px] text-rose-700">- {l}</p>}
                                    </For>
                                  </div>
                                )}
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

        <Suspense fallback={<WorkflowPaneFallback label="workflow canvas" />}>
          <WorkflowsCanvas />
        </Suspense>
        <Suspense fallback={<WorkflowPaneFallback label="workflow inspector" />}>
          <WorkflowsInspector />
        </Suspense>
      </div>
    </div>
    </WorkflowsCtx.Provider>
  );
}
