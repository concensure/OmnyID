// @locs-version: 1.0
import type { SavedWorkflow, WorkflowRun } from "@/lib/api";
import type {
  CompiledAfpGapFilter,
  CompiledAfpReadinessFocus,
  CompiledOrchestrationRole,
  DeploymentPolicyDiffEntry,
  EdgeExecutionState,
  NodeDeploymentPolicy,
  WorkflowEdgeDraft,
  WorkflowGraphDraft,
  WorkflowNodeDraft,
  PendingNodeDeploymentPolicy,
} from "@/lib/workflowGraphTypes";
import {
  edgeExecutionVisual,
  edgeLine,
  runEdgeCanvasCallout,
} from "@/lib/workflowRunAnalysis";
import {
  compiledAfpGapLabel,
  compiledManifestAfpContract,
  compiledManifestAfpGapKinds,
  compiledManifestOrchestrationRole,
  deploymentPolicyChanges,
  deploymentPolicyVisual,
} from "@/lib/workflowDeploymentHelpers";
import { formatDurationMs } from "@/lib/workflowLiveRunState";
import { isRecord } from "@/lib/eventDetail";
import { liveRunAccentClass } from "@/lib/workflowLiveRunState";
import { nodeKindIcon } from "@/lib/workflowNodeIcon";
import { nodeRegenerationScope } from "@/lib/workflowRegenerationState";
import { runNodeCanvasCallout } from "@/lib/workflowRunSummary";
import {
  availableReviewTargetMessage,
  clearAfpReadinessFocusMessage,
  clearOrchestrationRoleFocusMessage,
  clearOverlappingRouteNarrowingMessage,
  clearReviewFocusMessage,
  compiledManifestMatchesAfpReadinessFocus,
  focusRouteLinkageReviewMessage,
  unavailableReviewTargetMessage,
} from "@/lib/workflowReviewMessages";
import type { WorkflowFamilyParameterField } from "@/lib/workflowReviewTypes";

export type WorkflowCanvasPaletteState<TSemanticStarter extends { id: string; label: string }> = {
  presetItems: string[];
  primitiveItems: string[];
  query: string;
  semanticStarterItems: TSemanticStarter[];
};

export type WorkflowCanvasFamilyAssetRecord = {
  family_label?: string;
  parameter_schema: readonly WorkflowFamilyParameterField[];
  source_workflow_id?: string;
} | null;

export type WorkflowCanvasFamilyInstanceRecord = {
  family_label?: string;
  family_workflow_id?: string;
} | null;

export type WorkflowCanvasFamilyContextState = {
  asset: WorkflowCanvasFamilyAssetRecord;
  assetHasParameters: boolean;
  assetLabel: string;
  canPromoteAsset: boolean;
  instance: WorkflowCanvasFamilyInstanceRecord;
  instanceHasAsset: boolean;
  instanceLabel: string;
  show: boolean;
};

export type WorkflowCanvasSummaryState = {
  deployStatusLabel: string;
  description: string;
  edgeCount: number;
  irStatusLabel: string;
  nodeCount: number;
  title: string;
};

export type WorkflowCanvasBranchOriginRecord = {
  history_event_id?: string;
  parent_workflow_id?: string;
};

export type WorkflowCanvasBranchOriginState = {
  branchCount: number;
  hasSiblings: boolean;
  hiddenSiblingCount: number;
  origin: WorkflowCanvasBranchOriginRecord | null;
  selectedWorkflowId: string | null;
  siblings: SavedWorkflow[];
  visibleSiblings: SavedWorkflow[];
};

export type WorkflowCanvasHeaderState = {
  runEta: string | null;
};

export type WorkflowCanvasEmptyState = {
  show: boolean;
};

export type WorkflowCanvasSharedReviewBannerState = {
  summary: string[];
  visible: boolean;
};

export type WorkflowCanvasRunOverlayState = {
  durationLabel: string | null;
  executionMode: string;
  nodePolicyDeltaCount: number;
  nodePolicyDeltaLabel: string;
  timelineCount: number;
} | null;

export type WorkflowCanvasOverlayChromeState = {
  interactionLockLabel: string | null;
  interactionLocked: boolean;
  topOffsetClass: string;
};

export type WorkflowCanvasPoint = {
  x: number;
  y: number;
};

export type WorkflowCanvasMinimapBounds = {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  nodes: Array<{ id: string; position: WorkflowCanvasPoint }>;
};

export type WorkflowCanvasMinimapLayout = {
  height: number;
  nodeHeight: number;
  nodeWidth: number;
  pad: number;
  style: { height: string; width: string };
  toX: (x: number) => number;
  toY: (y: number) => number;
  viewportHeight: number;
  viewportWidth: number;
  width: number;
};

export type WorkflowCanvasMinimapNodeRectState = {
  fill: string;
  height: number;
  stroke: string;
  width: number;
  x: number;
  y: number;
};

export type WorkflowCanvasMinimapViewState = {
  bounds: WorkflowCanvasMinimapBounds | null;
  layout: WorkflowCanvasMinimapLayout | null;
  selectedNodeId: string | null;
  show: boolean;
};

export type WorkflowCanvasVisibleMinimapState = WorkflowCanvasMinimapViewState & {
  bounds: WorkflowCanvasMinimapBounds;
  layout: WorkflowCanvasMinimapLayout;
  nodeCount: number;
  nodeRects: WorkflowCanvasMinimapNodeRectState[];
};

export type WorkflowCanvasIdleNode = {
  id: string;
  kind: string;
  label?: string | null;
};

export type WorkflowCanvasIdleNodeOverlayState = {
  count: number;
  items: Array<{ id: string; kind: string; label: string }>;
  showPanel: boolean;
};

export type WorkflowCanvasZoomViewState = {
  percentLabel: string;
  style: {
    inset: string;
    position: "absolute";
    transform: string;
    "transform-origin": string;
  };
};

export type WorkflowCanvasSurfaceSectionView = {
  id: string;
};

export type WorkflowCanvasContentSectionView<TId extends string, TContent> = {
  content: TContent;
  id: TId;
};

export type WorkflowCanvasContextSectionId =
  | "branch_origin"
  | "family_context"
  | "palette"
  | "promote_family_asset"
  | "summary";

export type WorkflowCanvasChromeSectionId = "header" | "overlay" | "shared_review";

export type WorkflowCanvasShellSectionId = "empty_state" | "horizontal_ruler" | "vertical_ruler";

export type WorkflowCanvasLeftOverlaySectionId = "compiled_focus" | "interaction_lock";

export type WorkflowCanvasRuntimeVisualSectionId = "edge_animation_style";

export type WorkflowCanvasMinimapSectionId = "minimap" | "minimap_toggle";

export type WorkflowCanvasBottomControlSectionId =
  | "idle_node_panel"
  | "idle_node_toggle"
  | "zoom_controls";

export type WorkflowCanvasInteractiveOverlaySectionId =
  | "context_menu"
  | WorkflowCanvasBottomControlSectionId
  | WorkflowCanvasMinimapSectionId;

export type WorkflowCanvasPassiveOverlaySectionId =
  | WorkflowCanvasLeftOverlaySectionId
  | WorkflowCanvasRuntimeVisualSectionId
  | WorkflowCanvasShellSectionId;

export type WorkflowCanvasReviewRailTopSectionId =
  | "guidance"
  | "header"
  | "primary_focus"
  | "quick_actions";

export type WorkflowCanvasReviewRailBodySectionId =
  | "afp_route"
  | "branch_legend"
  | "manifest_health"
  | "orchestration_role"
  | "readiness"
  | "route_linkage";

export type WorkflowCanvasReviewRailSectionId =
  | "top_group"
  | WorkflowCanvasReviewRailBodySectionId;

export type WorkflowCanvasReviewRailTopSectionView<TContent> = {
  id: WorkflowCanvasReviewRailTopSectionId;
  content: TContent;
};

export type WorkflowCanvasReviewRailBodySectionView<TContent> = {
  id: WorkflowCanvasReviewRailBodySectionId;
  content: TContent;
};

export type WorkflowCanvasReviewRailSectionView<TContent> = {
  id: WorkflowCanvasReviewRailSectionId;
  content: TContent;
};

export type WorkflowCanvasShellViewState<TSection extends WorkflowCanvasSurfaceSectionView> = {
  className: string;
  sections: TSection[];
};

export type WorkflowCanvasFrameMountViewState<TSection extends WorkflowCanvasSurfaceSectionView> = {
  className: string;
  interactiveOverlaySections: TSection[];
  passiveOverlaySections: TSection[];
};

export type WorkflowCanvasReviewRailMountState<TState> = {
  mountClass: string;
  show: boolean;
  state: TState;
};

export type WorkflowCanvasContextMenuPoint = WorkflowCanvasPoint & {
  nodeId: string;
};

export type WorkflowCanvasContextMenuState<TActionItem> = {
  actionItems: TActionItem[];
  menu: WorkflowCanvasContextMenuPoint;
} | null;

export type WorkflowCanvasContextMenuActionId = "comment" | "duplicate" | "inspect";

export type WorkflowCanvasContextMenuActionDescriptor = {
  id: WorkflowCanvasContextMenuActionId;
  label: string;
};

export type WorkflowCanvasContextMenuActionEvent = {
  stopPropagation: () => void;
};

export type WorkflowCanvasContextMenuActionItem =
  WorkflowCanvasContextMenuActionDescriptor & {
    onClick: (event: WorkflowCanvasContextMenuActionEvent) => void;
  };

export type WorkflowCanvasActionItem<TDescriptor, THandler> = TDescriptor & {
  onClick: THandler;
};

export type WorkflowCanvasNodeVisualState = {
  anomalyClass: string;
  depRingClass: string;
  gotoClass: string;
  idleRingClass: string;
  isDownstream: boolean;
  isUpstream: boolean;
  nodeSearchMatchClass: string;
};

export type WorkflowCanvasNodePresentationState = {
  heatmapClass: string;
  nodeKindIconSmall: string;
  successRateBorderColor: string;
  triggerFamilyBadge: string | null;
  triggerFamilyBadgeClass: string;
};

export type WorkflowCanvasNodeButtonClassInput = {
  anomalyClass: string;
  compiledFocusClass: string;
  depRingClass: string;
  gotoClass: string;
  heatmapClass: string;
  idleRingClass: string;
  liveNodeAccent: string;
  nodeProtected: boolean;
  nodeSearchMatchClass: string;
  statusClass: string;
};

export type WorkflowCanvasNodeCardPresentationState = {
  isDraggingThisNode: boolean;
  isDownstream: boolean;
  isNodeCollapsed: boolean;
  isUpstream: boolean;
  nodeButtonClass: string;
  nodeButtonStyle: { "border-left"?: string };
  nodeKindIconLarge: string;
  nodeKindIconSmall: string;
  protectionLabel: string | null;
  triggerFamilyBadge: string | null;
  triggerFamilyBadgeClass: string;
};

export type WorkflowCanvasPolicyDeltaReviewMode = "deployment_context" | "replay_drift";

export type WorkflowCanvasRunNodePolicyDelta = Pick<DeploymentPolicyDiffEntry, "changes"> & {
  source?: string | null;
};

export type WorkflowCanvasNodeDeploymentState = {
  deploymentVisual: ReturnType<typeof deploymentPolicyVisual> | null;
  pendingChanges: ReturnType<typeof deploymentPolicyChanges>;
  policyDeltaFilterMode: WorkflowCanvasPolicyDeltaReviewMode;
  runNodePolicyDeltaSummaryText: string | null;
};

export type WorkflowCanvasLiveNodeOverlay = {
  reason?: unknown;
  status?: string;
};

export type WorkflowCanvasRunNodePresentationPolicyDelta =
  WorkflowCanvasRunNodePolicyDelta & {
    deploymentId?: string | null;
  };

export type WorkflowCanvasRunEdgePolicyDelta = {
  deploymentId?: string | null;
  nodeId?: string | null;
  source?: string | null;
};

export type WorkflowCanvasNodeRunPresentationState = {
  canvasCallout: ReturnType<typeof runNodeCanvasCallout>;
  deploymentPolicy: NodeDeploymentPolicy | undefined;
  deploymentVisual: WorkflowCanvasNodeDeploymentState["deploymentVisual"];
  liveNodeAccent: string;
  liveNodeOverlay: WorkflowCanvasLiveNodeOverlay | undefined;
  liveReason: string | null;
  nodeProtected: boolean;
  nodeStatus: string | undefined;
  pendingChanges: WorkflowCanvasNodeDeploymentState["pendingChanges"];
  pendingPolicy: PendingNodeDeploymentPolicy | undefined;
  policyDeltaFilterMode: WorkflowCanvasPolicyDeltaReviewMode;
  runNodePolicyDelta: WorkflowCanvasRunNodePresentationPolicyDelta | undefined;
  runNodePolicyDeltaSummaryText: string | null;
  stepOrder: number | undefined;
};

export type WorkflowCanvasEdgeRunPresentationState = WorkflowCanvasEdgeCanvasRenderState<
  ReturnType<typeof edgeExecutionVisual>,
  ReturnType<typeof runEdgeCanvasCallout>,
  WorkflowCanvasRunEdgePolicyDelta
>;

export type WorkflowCanvasRouteLinkageFocus = "linked" | "manifest_only";

export type WorkflowCanvasAfpRouteFocus = "full" | "partial";

export type WorkflowCanvasManifestLinkageFocus = "linked" | "inspector_only";

export type WorkflowCanvasFocusOverlayBadgeItem = {
  className: string;
  label: string;
};

export type WorkflowCanvasFocusOverlayCounts = {
  firstMatchingNodeId: string | null;
  fullyMatchingRouteCount: number;
  graphNodeCount: number;
  matchingCount: number;
  partiallyMatchingRouteCount: number;
};

export type WorkflowCanvasFocusOverlayActionKind =
  | "clear_focus"
  | "clear_route_focus"
  | "open_first_match"
  | "review_roster"
  | "route_focus_full"
  | "route_focus_partial";

export type WorkflowCanvasFocusOverlayActionViewState = {
  ariaLabel: string;
  className: string;
  kind: WorkflowCanvasFocusOverlayActionKind;
  label: string;
  mode?: WorkflowCanvasAfpRouteFocus;
  nodeId?: string;
  title: string;
};

export type WorkflowCanvasFocusOverlayActionItem =
  WorkflowCanvasFocusOverlayActionViewState & {
    onClick: () => void;
  };

export type WorkflowCanvasRouteLinkageFocusButtonState = {
  className: string;
  message: string;
};

export type WorkflowCanvasReviewRailCopyState = {
  inspectorOnlyText?: string;
  linkedText?: string;
  fullText?: string;
  partialText?: string;
};

export type WorkflowCanvasReviewClearActionViewState = {
  className: string;
  disabled: boolean;
  label: string;
  title: string;
};

export type WorkflowCanvasReviewRailClearActionId =
  | "afp_readiness"
  | "afp_route"
  | "branch_focus"
  | "manifest_focus"
  | "orchestration_role"
  | "route_linkage";

export type WorkflowCanvasReviewRailClearActionViewState =
  WorkflowCanvasReviewClearActionViewState & {
    edgeId?: string;
    id: WorkflowCanvasReviewRailClearActionId;
    nodeId?: string;
  };

export type WorkflowCanvasReviewRailClearActionItem =
  WorkflowCanvasReviewRailClearActionViewState & {
    onClick: () => void;
  };

export type WorkflowCanvasReviewRailPrimaryFocusKind =
  | "branch_edge"
  | "compiled_route"
  | "manifest_inspector"
  | "manifest_linked"
  | "orchestration_role_node"
  | "readiness_node"
  | "readiness_route";

export type WorkflowCanvasReviewRailPrimaryFocusViewState = {
  available: boolean;
  edgeId?: string;
  kind: WorkflowCanvasReviewRailPrimaryFocusKind;
  label: string;
  nodeId?: string;
  routeTarget?: string;
  title: string;
  tone: string;
};

export type WorkflowCanvasReviewRailPrimaryFocusActionViewState =
  WorkflowCanvasReviewRailPrimaryFocusViewState & {
    onClick: () => void;
  };

export type WorkflowCanvasEdgeLegendVisualInput = {
  badgeBorder: string;
  badgeFill: string;
  badgeText: string;
  stroke: string;
};

export type WorkflowCanvasEdgeLegendVisualState =
  WorkflowCanvasEdgeLegendVisualInput & ReturnType<typeof edgeExecutionVisual>;

export type WorkflowCanvasEdgeLine = {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
} | null;

export type WorkflowCanvasEdgeCallout = {
  border?: string;
  fill?: string;
  textColor?: string;
} | null | undefined;

export type WorkflowCanvasEdgeOverlayLayout = {
  afpOverlayY: number;
  calloutY: number;
  deltaY: number;
  labelEditY: number;
  labelTextY: number;
};

export type WorkflowCanvasEndpointCircleVisualState = {
  fill: string;
  radius: string;
};

export type WorkflowCanvasEdgeLineAnimationState = {
  dasharray: string | undefined;
  style: { "stroke-dashoffset": string; animation: string } | undefined;
};

export type WorkflowCanvasAfpReadinessToneState = {
  clearLabel: string;
  containerClass: string;
  labelClass: string;
  mutedTextClass: string;
  nodeChipClass: string;
  overlayLabel: string;
  pillClass: string;
  primaryFocusClass: string;
  primaryLabel: string;
  ringClass: string;
  stroke: string;
};

export type WorkflowCanvasCompiledNodeOverlayLabelInput = {
  activeAfpFilter: boolean;
  activeGapFilter: CompiledAfpGapFilter | null;
  activeManifestLinkageFilter: WorkflowCanvasManifestLinkageFocus | null;
  activeOrchestrationRole: CompiledOrchestrationRole | null;
  activeReadinessFocus: CompiledAfpReadinessFocus | null;
  compiledManifest: Record<string, unknown> | null;
  matchesAfp: boolean;
  matchesGap: boolean;
  matchesManifestLinkage: boolean;
  matchesOrchestrationRole: boolean;
  matchesReadiness: boolean;
  orchestrationRoleLabel: string;
};

export type WorkflowCanvasCompiledNodeOverlayClassInput = Omit<
  WorkflowCanvasCompiledNodeOverlayLabelInput,
  "activeAfpFilter" | "compiledManifest" | "orchestrationRoleLabel"
> & {
  orchestrationRoleClass: string;
};

export type WorkflowCanvasCompiledNodeFocusClassInput = Omit<
  WorkflowCanvasCompiledNodeOverlayClassInput,
  "orchestrationRoleClass"
> & {
  activeAfpFilter: boolean;
  hasRouteFocus: boolean;
  participatesInRouteFocus: boolean;
};

export type WorkflowCanvasCompiledNodeReviewVisualState = {
  afpFilterOverlayClass: string;
  afpFilterOverlayLabel: string | null;
  compiledFocusClass: string;
};

export type WorkflowCanvasCompiledNodeReviewVisualInput = {
  activeAfpFilter: string | null;
  activeGapFilter: CompiledAfpGapFilter | null;
  activeManifestLinkageFilter: WorkflowCanvasManifestLinkageFocus | null;
  activeOrchestrationRole: CompiledOrchestrationRole | null;
  activeReadinessFocus: CompiledAfpReadinessFocus | null;
  activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  compiledManifest: Record<string, unknown> | null;
  compiledOrchestrationRole: {
    chipClass: string;
    label: string;
  };
  matchesAfp: boolean;
  matchesGap: boolean;
  matchesManifestLinkage: boolean;
  matchesOrchestrationRole: boolean;
  matchesReadiness: boolean;
  participatesInRouteFocus: boolean;
};

export type WorkflowCanvasCompiledManifestAfpReadinessInfo = {
  afpCategory: ReturnType<typeof compiledManifestAfpContract>["category"];
  afpGapKinds: CompiledAfpGapFilter[];
  manifestNodeId: string | null;
  ready: boolean;
};

export type WorkflowCanvasCompiledReadinessReviewData = {
  readyHandoffEntries: Record<string, unknown>[];
  readyHandoffManifestIds: Set<string>;
  readyManifestIds: Set<string>;
};

export type WorkflowCanvasCompiledNodeManifestState = {
  compiledAfpContract: ReturnType<typeof compiledManifestAfpContract>;
  compiledAfpGapKinds: CompiledAfpGapFilter[];
  compiledManifest: Record<string, unknown> | null;
  compiledManifestNodeId: string | null;
  compiledOrchestrationRole: ReturnType<typeof compiledManifestOrchestrationRole>;
  compiledRuntimeKind: string | null;
};

export type WorkflowCanvasCompiledRouteEndpointIds = {
  fromManifestNodeId: string | null;
  routeLabel: string | null;
  toManifestNodeId: string | null;
};

export type WorkflowCanvasCompiledRouteManifestPair = WorkflowCanvasCompiledRouteEndpointIds & {
  fromManifest: Record<string, unknown> | null;
  toManifest: Record<string, unknown> | null;
};

export type WorkflowCanvasCompiledEdgeReviewData = WorkflowCanvasCompiledReadinessReviewData & {
  readyHandoffGraphEdgeIds: Set<string>;
};

export type WorkflowCanvasCompiledReviewContext = {
  activeAfpFilter: string | null;
  activeAfpGapFilter: CompiledAfpGapFilter | null;
  activeAfpReadinessFocus: CompiledAfpReadinessFocus | null;
  activeAfpRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  activeManifestLinkageFilter: WorkflowCanvasManifestLinkageFocus | null;
  activeOrchestrationRole: CompiledOrchestrationRole | null;
  activeRouteLinkageFilter: WorkflowCanvasRouteLinkageFocus | null;
  edgeReviewData: WorkflowCanvasCompiledEdgeReviewData;
  latestEdges: Record<string, unknown>[];
  latestManifests: Record<string, unknown>[];
  readinessReviewData: WorkflowCanvasCompiledReadinessReviewData;
};

export type WorkflowCanvasCompiledEdgeReviewState = {
  activeAfpFilter: string | null;
  activeAfpReadinessFocus: CompiledAfpReadinessFocus | null;
  activeAfpRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  activeRouteLinkageFilter: WorkflowCanvasRouteLinkageFocus | null;
  latestManifests: Record<string, unknown>[];
  linkedGraphEdgeIds: Set<string>;
  matchingNodeIds: Set<string> | null;
  readyHandoffGraphEdgeIds: Set<string>;
  readyManifestIds: Set<string>;
};

export type WorkflowCanvasCompiledNodeReviewState = {
  activeAfpFilter: string | null;
  activeAfpGapFilter: CompiledAfpGapFilter | null;
  activeAfpReadinessFocus: CompiledAfpReadinessFocus | null;
  activeAfpRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  activeManifestLinkageFilter: WorkflowCanvasManifestLinkageFocus | null;
  activeOrchestrationRole: CompiledOrchestrationRole | null;
  latestManifests: Record<string, unknown>[];
  readyHandoffManifestIds: Set<string>;
  readyManifestIds: Set<string>;
};

export type WorkflowCanvasGraphReviewState<TGraphDraft extends {
  edges: WorkflowEdgeDraft[];
  nodes: WorkflowNodeDraft[];
}> = {
  edgeReviewState: WorkflowCanvasCompiledEdgeReviewState;
  graphDraft: TGraphDraft;
  graphEdges: WorkflowEdgeDraft[];
  graphNodes: WorkflowNodeDraft[];
  nodeReviewState: WorkflowCanvasCompiledNodeReviewState;
  reviewContext: WorkflowCanvasCompiledReviewContext;
};

export type WorkflowCanvasCompiledFocusOverlayViewState = {
  actionItems: WorkflowCanvasFocusOverlayActionViewState[];
  activeManifestLinkageFilter: WorkflowCanvasManifestLinkageFocus | null;
  activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  badgeItems: WorkflowCanvasFocusOverlayBadgeItem[];
  firstMatchingNodeId: string | null;
  inspectorOnlyNotice: string | null;
  topOffsetClass: string;
};

export type WorkflowCanvasOrchestrationRouteStats = {
  focusedRouteCount: number;
  graphLinkedRouteCount: number;
  inspectorOnlyRouteCount: number;
};

export type WorkflowCanvasReviewRailTargetState = {
  branchRailFocusAvailable: boolean;
  firstAfpContractWorkSourceNodeId: string | null;
  firstAfpReadyHandoffTarget: string | null;
  firstAfpReadyManifestSourceNodeId: string | null;
  firstCompiledRouteFocusTarget: string | null;
  firstLinkedManifestNodeId: string | null;
  firstOrchestrationRoleNodeId: string | null;
  firstReviewedEdge: WorkflowEdgeDraft | null;
};

export type WorkflowCanvasReviewRailState<TClearAction, TPrimaryFocus> = {
  activeAfpFilter: string | null;
  activeAfpReadinessFocus: CompiledAfpReadinessFocus | null;
  activeLinkageFocus: WorkflowCanvasRouteLinkageFocus | null;
  activeManifestLinkageFocus: WorkflowCanvasManifestLinkageFocus | null;
  activeOrchestrationRoleFocus: CompiledOrchestrationRole | null;
  activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  branchLegendStates: EdgeExecutionState[];
  branchRailFocusAvailable: boolean;
  branchReviewActive: boolean;
  clearActionItems: TClearAction[];
  compiledEdges: Record<string, unknown>[];
  firstReviewedEdge: WorkflowEdgeDraft | null;
  graphEdges: WorkflowEdgeDraft[];
  manifests: Record<string, unknown>[];
  primaryRailFocus: TPrimaryFocus | null;
  readinessReviewData: WorkflowCanvasCompiledReadinessReviewData;
  showCombinedClearAction: boolean;
  showRail: boolean;
  topOffsetClass: string;
};

export type WorkflowCanvasReviewRailOrchestrationRouteState = WorkflowCanvasOrchestrationRouteStats & {
  activeRouteLinkageFocus: WorkflowCanvasRouteLinkageFocus | null;
  inspectorOnlyRouteFocusButton: WorkflowCanvasRouteLinkageFocusButtonState;
  linkedRouteFocusButton: WorkflowCanvasRouteLinkageFocusButtonState;
};

export type WorkflowCanvasCompiledEdgeFocusState = {
  matchesAfp: boolean;
  matchesLinkageFocus: boolean;
  matchesRouteFocus: boolean;
  readyHandoff: boolean;
  touchesAfp: boolean;
  touchesReadiness: boolean;
};

export type WorkflowCanvasCompiledNodeMatchState = {
  matchesAfp: boolean;
  matchesGap: boolean;
  matchesManifestLinkage: boolean;
  matchesOrchestrationRole: boolean;
  matchesReadiness: boolean;
  participatesInRouteFocus: boolean;
};

export type WorkflowCanvasCompiledNodeCanvasReviewState = {
  afpFilterOverlayClass: string;
  afpFilterOverlayLabel: string | null;
  compiledAfpContract: ReturnType<typeof compiledManifestAfpContract>;
  compiledFocusClass: string;
  compiledManifest: Record<string, unknown> | null;
  compiledManifestNodeId: string | null;
  compiledRuntimeKind: string | null;
  readinessFocusChipClass: string;
  showCompiledAfpGapFocus: boolean;
  showCompiledAfpReadinessFocus: boolean;
  showCompiledInspectorOnlyFocus: boolean;
  showCompiledLinkedManifestFocus: boolean;
  showCompiledOrchestrationRoleFocus: boolean;
  showCompiledRouteReviewFocus: boolean;
};

export type WorkflowCanvasEdgeExecutionVisualState = {
  dasharray?: string;
  stroke: string;
};

export type WorkflowCanvasEdgeRenderVisualState<TVisual, TCallout> = {
  edgeAfpOverlayClass: string;
  edgeAfpOverlayLabel: string | null;
  edgeCallout: TCallout;
  edgeCalloutStyle: {
    "background-color": string;
    border: string;
    color: string;
    "box-shadow": string;
  };
  edgeOverlayLayout: WorkflowCanvasEdgeOverlayLayout;
  edgeSelected: boolean;
  effectiveOpacity: number;
  effectiveStroke: string;
  midX: number;
  readinessStroke: string;
  sourceEndpointCircle: WorkflowCanvasEndpointCircleVisualState;
  strokeWidth: number;
  targetEndpointCircle: WorkflowCanvasEndpointCircleVisualState;
  visual: TVisual;
};

export type WorkflowCanvasEdgeCanvasRenderState<TVisual, TCallout, TPolicyDelta> =
  WorkflowCanvasEdgeRenderVisualState<TVisual, TCallout> & {
    edgePolicyDelta: TPolicyDelta | undefined;
    edgeState: EdgeExecutionState | undefined;
    line: WorkflowCanvasEdgeLine;
    lineAnimation: WorkflowCanvasEdgeLineAnimationState;
  };

const EDGE_LEGEND_ORDER: EdgeExecutionState[] = [
  "failed",
  "blocked",
  "waiting_for_approval",
  "waiting_for_resume",
  "queued",
  "skipped",
  "simulated",
  "completed",
];

export const EMPTY_CANVAS_TEMPLATE_ITEMS = [
  { icon: "TG", label: "Trigger -> Agent", kind: "trigger" },
  { icon: "AP", label: "Agent + Approval", kind: "approval" },
  { icon: "IF", label: "Conditional branch", kind: "condition" },
  { icon: "MA", label: "Multi-agent chain", kind: "agent" },
] as const;

export const EMPTY_CANVAS_AI_STARTER_ITEMS = [
  { icon: "EM", title: "Daily email briefing", desc: "email trigger -> summarise -> send" },
  { icon: "MT", title: "Meeting follow-up", desc: "calendar trigger -> draft -> send" },
  { icon: "WR", title: "Weekly report", desc: "schedule trigger -> aggregate -> publish" },
] as const;

export const CANVAS_HORIZONTAL_RULER_MARKS = [0, 200, 400, 600, 800, 1000, 1200] as const;

export const CANVAS_VERTICAL_RULER_MARKS = [0, 100, 200, 300, 400, 500, 600] as const;

export const CANVAS_VERTICAL_RULER_LABEL_STYLE = {
  "writing-mode": "vertical-lr" as const,
  transform: "rotate(180deg)",
};

export const WORKFLOW_CONTEXT_SURFACE_CLASS =
  "glass-surface rounded-[26px] border border-white/35 p-4 shadow-panel";

export const WORKFLOW_CANVAS_SURFACE_CLASS =
  "glass-surface rounded-[28px] border border-white/35 p-4 shadow-panel";

export const WORKFLOW_CANVAS_FRAME_CLASS =
  "relative min-h-[720px] overflow-hidden rounded-[24px] border border-white/35 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.95),_rgba(233,240,247,0.82)_45%,_rgba(225,234,244,0.88))]";

export const REVIEW_CLEAR_ACTION_BASE_CLASS =
  "rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]";

export const REVIEW_CLEAR_ACTION_HOVER_CLASS =
  `${REVIEW_CLEAR_ACTION_BASE_CLASS} transition hover:bg-white`;

export const REVIEW_RAIL_PILL_BASE_CLASS =
  "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]";

export const REVIEW_RAIL_PILL_HOVER_CLASS =
  `${REVIEW_RAIL_PILL_BASE_CLASS} transition hover:bg-white`;

export const COMPILED_FOCUS_ACTION_CLASS =
  `${REVIEW_CLEAR_ACTION_BASE_CLASS} border-emerald-200/80 bg-white/90 text-emerald-800 transition hover:border-emerald-300 hover:bg-white`;

export const COMPILED_NODE_MUTED_CHIP_CLASS = "border-slate-200/70 bg-slate-100/85 text-slate-600";

export const COMPILED_NODE_AFP_CHIP_CLASS = "border-emerald-200/70 text-emerald-700";

export const COMPILED_NODE_GAP_CHIP_CLASS = "border-violet-200/70 text-violet-700";

export const COMPILED_NODE_INSPECTOR_CHIP_CLASS = "border-amber-200/70 text-amber-700";

export const COMPILED_NODE_LINKED_CHIP_CLASS = "border-sky-200/70 text-sky-700";

export const NODE_CARD_CHIP_BASE_CLASS =
  "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]";

export const NODE_CARD_CHIP_HOVER_CLASS = `${NODE_CARD_CHIP_BASE_CLASS} transition hover:bg-white`;

export const NODE_CARD_WHITE_CHIP_CLASS =
  `${NODE_CARD_CHIP_BASE_CLASS} border-white/60 bg-white/80 text-on-surface-variant`;

export const NODE_CARD_AMBER_CHIP_CLASS =
  `${NODE_CARD_CHIP_BASE_CLASS} border-amber-200/70 bg-amber-50/85 text-amber-700`;

export const NODE_CARD_SKY_CHIP_CLASS =
  `${NODE_CARD_CHIP_BASE_CLASS} border-sky-200/70 bg-white/85 text-sky-700`;

export function workflowCanvasHorizontalRulerMarkStyle(x: number): { left: string } {
  return { left: `${x}px` };
}

export function workflowCanvasVerticalRulerMarkStyle(y: number): { top: string } {
  return { top: `${y}px` };
}

export function workflowCanvasZoomStyle(zoomValue: number): WorkflowCanvasZoomViewState["style"] {
  return {
    inset: "0",
    position: "absolute",
    transform: `scale(${zoomValue})`,
    "transform-origin": "top left",
  };
}

export function workflowCanvasPointPositionStyle(position: WorkflowCanvasPoint): {
  left: string;
  top: string;
} {
  return {
    left: `${position.x}px`,
    top: `${position.y}px`,
  };
}

export function workflowCanvasZoomViewState(zoomValue: number): WorkflowCanvasZoomViewState {
  return {
    percentLabel: `${Math.round(zoomValue * 100)}%`,
    style: workflowCanvasZoomStyle(zoomValue),
  };
}

export function workflowCanvasMinimapLayout(
  bounds: Pick<WorkflowCanvasMinimapBounds, "maxX" | "maxY" | "minX" | "minY">,
): WorkflowCanvasMinimapLayout {
  const width = 140;
  const height = 90;
  const pad = 8;
  const graphW = Math.max(bounds.maxX - bounds.minX, 1);
  const graphH = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min((width - pad * 2) / graphW, (height - pad * 2) / graphH);
  return {
    height,
    nodeHeight: Math.max(60 * scale, 4),
    nodeWidth: Math.max(180 * scale, 6),
    pad,
    style: { width: `${width}px`, height: `${height}px` },
    toX: (x: number) => pad + (x - bounds.minX) * scale,
    toY: (y: number) => pad + (y - bounds.minY) * scale,
    viewportHeight: Math.min(height - pad * 2, graphH * scale),
    viewportWidth: Math.min(width - pad * 2, graphW * scale),
    width,
  };
}

export function workflowCanvasMinimapNodeVisual(selected: boolean): {
  fill: string;
  stroke: string;
} {
  return {
    fill: selected ? "rgba(99,102,241,0.55)" : "rgba(148,163,184,0.45)",
    stroke: selected ? "rgba(99,102,241,0.9)" : "rgba(148,163,184,0.6)",
  };
}

export function workflowCanvasMinimapNodeRectState(args: {
  layout: WorkflowCanvasMinimapLayout;
  node: { id: string; position: WorkflowCanvasPoint };
  selectedNodeId: string | null;
}): WorkflowCanvasMinimapNodeRectState {
  const visual = workflowCanvasMinimapNodeVisual(args.selectedNodeId === args.node.id);
  return {
    fill: visual.fill,
    height: args.layout.nodeHeight,
    stroke: visual.stroke,
    width: args.layout.nodeWidth,
    x: args.layout.toX(args.node.position.x),
    y: args.layout.toY(args.node.position.y),
  };
}

export function workflowCanvasMinimapViewState(args: {
  bounds: WorkflowCanvasMinimapBounds | null;
  selectedNodeId: string | null;
  show: boolean;
}): WorkflowCanvasMinimapViewState {
  return {
    bounds: args.bounds,
    layout: args.bounds ? workflowCanvasMinimapLayout(args.bounds) : null,
    selectedNodeId: args.selectedNodeId,
    show: args.show,
  };
}

export function workflowCanvasHiddenMinimapToggleState(
  state: WorkflowCanvasMinimapViewState,
): WorkflowCanvasMinimapViewState | null {
  return !state.show && state.bounds ? state : null;
}

export function workflowCanvasVisibleMinimapState(
  state: WorkflowCanvasMinimapViewState,
): WorkflowCanvasVisibleMinimapState | null {
  if (!state.show || !state.bounds || !state.layout) return null;
  const layout = state.layout;
  return {
    ...state,
    bounds: state.bounds,
    layout,
    nodeCount: state.bounds.nodes.length,
    nodeRects: state.bounds.nodes.map((node) =>
      workflowCanvasMinimapNodeRectState({
        layout,
        node,
        selectedNodeId: state.selectedNodeId,
      }),
    ),
  };
}

export function workflowCanvasIdleNodeOverlayState(args: {
  nodes: readonly WorkflowCanvasIdleNode[];
  showIdleNodes: boolean;
}): WorkflowCanvasIdleNodeOverlayState {
  const items = args.nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    label: node.label ?? node.id,
  }));
  return {
    count: items.length,
    items,
    showPanel: args.showIdleNodes && items.length > 0,
  };
}

export function workflowCanvasIdleNodeBadgeState(
  state: WorkflowCanvasIdleNodeOverlayState,
): WorkflowCanvasIdleNodeOverlayState | null {
  return state.count > 0 ? state : null;
}

export function workflowCanvasVisibleIdleNodePanelState(
  state: WorkflowCanvasIdleNodeOverlayState,
): WorkflowCanvasIdleNodeOverlayState | null {
  return state.showPanel ? state : null;
}

export function compactWorkflowCanvasSectionViews<T extends WorkflowCanvasSurfaceSectionView>(
  sections: Array<T | null>,
): T[] {
  return sections.filter((section): section is T => Boolean(section));
}

export function workflowCanvasSectionViews<TId extends string, TContent>(
  sectionIds: readonly TId[],
  contentById: Record<TId, TContent>,
): Array<WorkflowCanvasContentSectionView<TId, TContent>> {
  return sectionIds.map((sectionId) => ({
    content: contentById[sectionId],
    id: sectionId,
  }));
}

export function workflowCanvasActionItems<TDescriptor, THandler>(
  descriptors: readonly TDescriptor[],
  handlerForItem: (item: TDescriptor) => THandler,
): Array<WorkflowCanvasActionItem<TDescriptor, THandler>> {
  return descriptors.map((item) => ({
    ...item,
    onClick: handlerForItem(item),
  }));
}

export function workflowCanvasContextSectionIds(): WorkflowCanvasContextSectionId[] {
  return ["family_context", "summary", "palette", "promote_family_asset", "branch_origin"];
}

export function workflowCanvasChromeSectionIds(): WorkflowCanvasChromeSectionId[] {
  return ["header", "shared_review", "overlay"];
}

export function workflowCanvasShellSectionIds(): WorkflowCanvasShellSectionId[] {
  return ["horizontal_ruler", "vertical_ruler", "empty_state"];
}

export function workflowCanvasLeftOverlaySectionIds(): WorkflowCanvasLeftOverlaySectionId[] {
  return ["compiled_focus", "interaction_lock"];
}

export function workflowCanvasRuntimeVisualSectionIds(): WorkflowCanvasRuntimeVisualSectionId[] {
  return ["edge_animation_style"];
}

export function workflowCanvasMinimapSectionIds(): WorkflowCanvasMinimapSectionId[] {
  return ["minimap_toggle", "minimap"];
}

export function workflowCanvasBottomControlSectionIds(): WorkflowCanvasBottomControlSectionId[] {
  return ["zoom_controls", "idle_node_toggle", "idle_node_panel"];
}

export function workflowCanvasInteractiveOverlaySectionIds(): WorkflowCanvasInteractiveOverlaySectionId[] {
  return [
    "context_menu",
    ...workflowCanvasBottomControlSectionIds(),
    ...workflowCanvasMinimapSectionIds(),
  ];
}

export function workflowCanvasPassiveOverlaySectionIds(): WorkflowCanvasPassiveOverlaySectionId[] {
  return [
    ...workflowCanvasShellSectionIds(),
    ...workflowCanvasLeftOverlaySectionIds(),
    ...workflowCanvasRuntimeVisualSectionIds(),
  ];
}

export function workflowCanvasReviewRailTopSectionIds(args: {
  hasPrimaryFocus: boolean;
  quickActionCount: number;
}): WorkflowCanvasReviewRailTopSectionId[] {
  const sectionIds: WorkflowCanvasReviewRailTopSectionId[] = ["header"];
  if (args.hasPrimaryFocus) {
    sectionIds.push("primary_focus");
  }
  if (args.quickActionCount > 0) {
    sectionIds.push("quick_actions");
  }
  sectionIds.push("guidance");
  return sectionIds;
}

export function workflowCanvasReviewRailBodySectionIds(args: {
  activeAfpReadinessFocus: boolean;
  activeAfpRouteFocus: boolean;
  activeLinkageFocus: boolean;
  activeManifestLinkageFocus: boolean;
  activeOrchestrationRoleFocus: boolean;
  branchReviewActive: boolean;
  hasAfpFilter: boolean;
}): WorkflowCanvasReviewRailBodySectionId[] {
  const sectionIds: WorkflowCanvasReviewRailBodySectionId[] = [];
  if (args.activeAfpReadinessFocus) {
    sectionIds.push("readiness");
  }
  if (args.activeOrchestrationRoleFocus) {
    sectionIds.push("orchestration_role");
  }
  if (args.activeManifestLinkageFocus) {
    sectionIds.push("manifest_health");
  }
  if (args.hasAfpFilter && args.activeAfpRouteFocus) {
    sectionIds.push("afp_route");
  }
  if (args.activeLinkageFocus) {
    sectionIds.push("route_linkage");
  }
  if (args.branchReviewActive) {
    sectionIds.push("branch_legend");
  }
  return sectionIds;
}

export function workflowCanvasReviewRailSectionIds(
  bodySectionIds: WorkflowCanvasReviewRailBodySectionId[],
): WorkflowCanvasReviewRailSectionId[] {
  return ["top_group", ...bodySectionIds];
}

export function workflowCanvasReviewRailTopSectionViews<TContent>(args: {
  contentById: Record<WorkflowCanvasReviewRailTopSectionId, TContent>;
  hasPrimaryFocus: boolean;
  quickActionCount: number;
}): WorkflowCanvasReviewRailTopSectionView<TContent>[] {
  return workflowCanvasReviewRailTopSectionIds({
    hasPrimaryFocus: args.hasPrimaryFocus,
    quickActionCount: args.quickActionCount,
  }).map((sectionId) => ({
    id: sectionId,
    content: args.contentById[sectionId],
  }));
}

export function workflowCanvasReviewRailBodySectionViews<TContent>(args: {
  activeAfpReadinessFocus: boolean;
  activeAfpRouteFocus: boolean;
  activeLinkageFocus: boolean;
  activeManifestLinkageFocus: boolean;
  activeOrchestrationRoleFocus: boolean;
  branchReviewActive: boolean;
  contentById: Record<WorkflowCanvasReviewRailBodySectionId, TContent>;
  hasAfpFilter: boolean;
}): WorkflowCanvasReviewRailBodySectionView<TContent>[] {
  return workflowCanvasReviewRailBodySectionIds({
    activeAfpReadinessFocus: args.activeAfpReadinessFocus,
    activeAfpRouteFocus: args.activeAfpRouteFocus,
    activeLinkageFocus: args.activeLinkageFocus,
    activeManifestLinkageFocus: args.activeManifestLinkageFocus,
    activeOrchestrationRoleFocus: args.activeOrchestrationRoleFocus,
    branchReviewActive: args.branchReviewActive,
    hasAfpFilter: args.hasAfpFilter,
  }).map((sectionId) => ({
    id: sectionId,
    content: args.contentById[sectionId],
  }));
}

export function workflowCanvasReviewRailSectionViews<TContent>(args: {
  bodySectionViews: WorkflowCanvasReviewRailBodySectionView<TContent>[];
  topGroupContent: TContent;
}): WorkflowCanvasReviewRailSectionView<TContent>[] {
  const contentById = new Map<WorkflowCanvasReviewRailBodySectionId, TContent>(
    args.bodySectionViews.map((section) => [section.id, section.content]),
  );
  return workflowCanvasReviewRailSectionIds(args.bodySectionViews.map((section) => section.id)).map((sectionId) => {
    if (sectionId === "top_group") {
      return {
        id: sectionId,
        content: args.topGroupContent,
      };
    }
    return {
      id: sectionId,
      content: contentById.get(sectionId) as TContent,
    };
  });
}

export function workflowCanvasShellViewState<TSection extends WorkflowCanvasSurfaceSectionView>(args: {
  className: string;
  sections: TSection[];
}): WorkflowCanvasShellViewState<TSection> {
  return {
    className: args.className,
    sections: args.sections,
  };
}

export function workflowCanvasFrameMountViewState<TSection extends WorkflowCanvasSurfaceSectionView>(args: {
  interactiveOverlaySections: TSection[];
  passiveOverlaySections: TSection[];
}): WorkflowCanvasFrameMountViewState<TSection> {
  return {
    className: WORKFLOW_CANVAS_FRAME_CLASS,
    interactiveOverlaySections: args.interactiveOverlaySections,
    passiveOverlaySections: args.passiveOverlaySections,
  };
}

export function workflowCanvasReviewRailMountState<TState extends { showRail: boolean; topOffsetClass: string }>(
  state: TState,
): WorkflowCanvasReviewRailMountState<TState> {
  return {
    mountClass: `absolute right-4 z-10 flex w-[260px] flex-col gap-3 ${state.topOffsetClass}`,
    show: state.showRail,
    state,
  };
}

export function workflowCanvasContextMenuState<TActionItem>(args: {
  actionItems: TActionItem[];
  menu: WorkflowCanvasContextMenuPoint | null;
}): WorkflowCanvasContextMenuState<TActionItem> {
  if (!args.menu) return null;
  return {
    actionItems: args.actionItems,
    menu: args.menu,
  };
}

export function workflowCanvasContextMenuActionDescriptors(): WorkflowCanvasContextMenuActionDescriptor[] {
  return [
    { id: "duplicate", label: "Duplicate node" },
    { id: "inspect", label: "Inspect node" },
    { id: "comment", label: "Add comment" },
  ];
}

export function workflowCanvasContextMenuActionItems(args: {
  duplicateNode: (nodeId: string) => void;
  nodeCommentById: Record<string, string>;
  nodeId: string;
  setCommentDraft: (value: string) => void;
  setCtxMenu: (menu: WorkflowCanvasContextMenuPoint | null) => void;
  setEditingCommentNodeId: (nodeId: string) => void;
  setSelectedNodeId: (nodeId: string) => void;
}): WorkflowCanvasContextMenuActionItem[] {
  return workflowCanvasContextMenuActionDescriptors().map((item) => ({
    ...item,
    onClick: (event) => {
      event.stopPropagation();
      if (item.id === "duplicate") {
        args.duplicateNode(args.nodeId);
        return;
      }
      if (item.id === "inspect") {
        args.setSelectedNodeId(args.nodeId);
        args.setCtxMenu(null);
        return;
      }
      args.setEditingCommentNodeId(args.nodeId);
      args.setCommentDraft(args.nodeCommentById[args.nodeId] ?? "");
      args.setCtxMenu(null);
    },
  }));
}

export function workflowCanvasNodeStatusClass(args: {
  nodeKind: string;
  nodeStatus: string | undefined;
  selected: boolean;
  triggerFamily: unknown;
}): string {
  if (args.nodeStatus === "simulated") return "border-cyan-300/80 bg-cyan-50/85";
  if (args.nodeStatus === "skipped") return "border-slate-300/80 bg-slate-50/85 opacity-75";
  if (args.nodeStatus === "failed") return "border-rose-300/80 bg-rose-50/85";
  if (args.nodeStatus === "blocked") return "border-orange-300/80 bg-orange-50/85";
  if (args.nodeStatus === "waiting_for_approval") return "border-amber-300/80 bg-amber-50/85";
  if (args.nodeStatus === "queued") return "border-slate-300/80 bg-slate-100/90";
  if (args.nodeStatus === "completed") return "border-emerald-300/80 bg-emerald-50/80";
  if (args.nodeStatus === "active") return "border-sky-300/80 bg-sky-50/80";
  if (args.selected) return "border-primary/45 bg-primary/15";
  if (args.nodeKind !== "trigger") return "border-white/50 bg-white/78 hover:bg-white";

  const family = typeof args.triggerFamily === "string" ? args.triggerFamily : "manual";
  if (family === "schedule") return "border-teal-300/70 bg-teal-50/80 hover:bg-teal-50";
  if (family === "webhook" || family === "event") return "border-sky-300/70 bg-sky-50/80 hover:bg-sky-50";
  if (family === "hybrid" || family === "delayed_continuation") {
    return "border-violet-300/70 bg-violet-50/80 hover:bg-violet-50";
  }
  return "border-slate-300/70 bg-slate-50/85 hover:bg-slate-50";
}

export function workflowCanvasNodeHeatmapClass(args: {
  hasNodeStatus: boolean;
  isSearchMatch: boolean;
  successRate: number | undefined;
}): string {
  if (args.isSearchMatch) return "ring-2 ring-amber-400/70";
  if (args.successRate === undefined || args.hasNodeStatus) return "";
  if (args.successRate >= 0.8) return "ring-1 ring-emerald-300/60";
  if (args.successRate >= 0.5) return "ring-1 ring-amber-300/60";
  return "ring-1 ring-rose-300/60";
}

export function workflowCanvasNodeButtonClass(input: WorkflowCanvasNodeButtonClassInput): string {
  return [
    "relative w-[180px] cursor-grab rounded-[22px] border px-4 py-3 text-left shadow-soft transition active:cursor-grabbing disabled:cursor-default disabled:opacity-90",
    input.heatmapClass,
    input.statusClass,
    input.nodeProtected ? "ring-2 ring-slate-500/40 ring-offset-2 ring-offset-transparent" : "",
    input.liveNodeAccent,
    input.compiledFocusClass,
    input.depRingClass,
    input.idleRingClass,
    input.nodeSearchMatchClass,
    input.anomalyClass,
    input.gotoClass,
  ].filter(Boolean).join(" ");
}

export function workflowCanvasNodeSuccessRateBorderColor(args: {
  hasNodeStatus: boolean;
  successRate: number | undefined;
}): string {
  if (args.hasNodeStatus || args.successRate === undefined) return "transparent";
  return args.successRate >= 1 ? "rgba(74,222,128,0.4)" : "rgba(251,113,133,0.4)";
}

export function workflowCanvasNodeButtonStyle(successRateBorderColor: string): {
  "border-left"?: string;
} {
  return {
    "border-left": successRateBorderColor !== "transparent"
      ? `3px solid ${successRateBorderColor}`
      : undefined,
  };
}

export function workflowCanvasNodeSmallIcon(args: {
  nodeKind: string;
  triggerFamily: unknown;
}): string {
  const family = typeof args.triggerFamily === "string" ? args.triggerFamily : "";
  if (args.nodeKind === "trigger" && family === "email") return "EM";
  if (args.nodeKind === "trigger" && family === "schedule") return "SC";
  if (args.nodeKind === "trigger" && (family === "webhook" || family === "event")) return "EV";
  return nodeKindIcon(args.nodeKind);
}

export function workflowCanvasNodeTriggerFamily(args: {
  nodeKind: string;
  triggerFamily: unknown;
}): string | null {
  return args.nodeKind === "trigger"
    && typeof args.triggerFamily === "string"
    && args.triggerFamily !== "manual"
    ? args.triggerFamily
    : null;
}

export function workflowCanvasNodeTriggerFamilyBadgeClass(triggerFamily: string | null): string {
  if (triggerFamily === "schedule") return "bg-teal-100 text-teal-700";
  if (triggerFamily === "webhook" || triggerFamily === "event") return "bg-sky-100 text-sky-700";
  return "bg-violet-100 text-violet-700";
}

export function workflowCanvasNodePresentationState(args: {
  matchingNodeIds: unknown;
  nodeId: string;
  nodeKind: string;
  nodeStatus: string | undefined;
  selected: boolean;
  successRate: number | undefined;
  triggerFamily: unknown;
}): WorkflowCanvasNodePresentationState {
  const isSearchMatch = args.matchingNodeIds instanceof Set
    ? args.matchingNodeIds.has(args.nodeId) && !args.nodeStatus && !args.selected
    : false;
  const hasNodeStatus = Boolean(args.nodeStatus);
  const triggerFamilyBadge = workflowCanvasNodeTriggerFamily({
    nodeKind: args.nodeKind,
    triggerFamily: args.triggerFamily,
  });
  return {
    heatmapClass: workflowCanvasNodeHeatmapClass({
      hasNodeStatus,
      isSearchMatch,
      successRate: args.successRate,
    }),
    nodeKindIconSmall: workflowCanvasNodeSmallIcon({
      nodeKind: args.nodeKind,
      triggerFamily: args.triggerFamily,
    }),
    successRateBorderColor: workflowCanvasNodeSuccessRateBorderColor({
      hasNodeStatus,
      successRate: args.successRate,
    }),
    triggerFamilyBadge,
    triggerFamilyBadgeClass: workflowCanvasNodeTriggerFamilyBadgeClass(triggerFamilyBadge),
  };
}

export function workflowCanvasPolicyDeltaReviewMode(
  source: unknown,
): WorkflowCanvasPolicyDeltaReviewMode {
  return source === "replay_policy_delta" ? "replay_drift" : "deployment_context";
}

export function workflowCanvasNodeDeploymentState(args: {
  deploymentPolicy: NodeDeploymentPolicy | undefined;
  pendingPolicy: PendingNodeDeploymentPolicy | undefined;
  runNodePolicyDelta: WorkflowCanvasRunNodePolicyDelta | undefined;
}): WorkflowCanvasNodeDeploymentState {
  const deploymentVisual = args.deploymentPolicy
    ? deploymentPolicyVisual(args.deploymentPolicy.source)
    : null;
  const pendingChanges = deploymentPolicyChanges(
    args.deploymentPolicy?.fields,
    args.pendingPolicy?.fields,
  );
  const runNodePolicyDeltaSummaryText = args.runNodePolicyDelta
    ? args.runNodePolicyDelta.changes
      .slice(0, 2)
      .map((change) => change.field.replaceAll("_", " "))
      .join(", ")
    : null;
  return {
    deploymentVisual,
    pendingChanges,
    policyDeltaFilterMode: workflowCanvasPolicyDeltaReviewMode(args.runNodePolicyDelta?.source),
    runNodePolicyDeltaSummaryText,
  };
}

export function workflowCanvasNodeRunPresentationState(args: {
  activeRun: WorkflowRun | null;
  deploymentPolicyById: ReadonlyMap<string, NodeDeploymentPolicy>;
  liveRunConnected: boolean;
  node: WorkflowNodeDraft;
  nodePolicyDeltas: ReadonlyMap<string, WorkflowCanvasRunNodePresentationPolicyDelta>;
  pendingPolicyById: ReadonlyMap<string, PendingNodeDeploymentPolicy>;
  protectedNodeIds: ReadonlySet<string>;
  runNodeOverlays: ReadonlyMap<string, WorkflowCanvasLiveNodeOverlay>;
  runStatuses: ReadonlyMap<string, string>;
  runStepOrder: ReadonlyMap<string, number>;
}): WorkflowCanvasNodeRunPresentationState {
  const nodeStatus = args.runStatuses.get(args.node.id);
  const liveNodeOverlay = args.runNodeOverlays.get(args.node.id);
  const runNodePolicyDelta = args.nodePolicyDeltas.get(args.node.id);
  const deploymentPolicy = args.deploymentPolicyById.get(args.node.id);
  const pendingPolicy = args.pendingPolicyById.get(args.node.id);
  const deploymentState = workflowCanvasNodeDeploymentState({
    deploymentPolicy,
    pendingPolicy,
    runNodePolicyDelta,
  });
  const liveReason = typeof liveNodeOverlay?.reason === "string" && liveNodeOverlay.reason.trim()
    ? liveNodeOverlay.reason.trim()
    : null;
  return {
    canvasCallout: runNodeCanvasCallout(args.activeRun, args.node, nodeStatus),
    deploymentPolicy,
    deploymentVisual: deploymentState.deploymentVisual,
    liveNodeAccent: liveRunAccentClass(liveNodeOverlay?.status, args.liveRunConnected),
    liveNodeOverlay,
    liveReason,
    nodeProtected: args.protectedNodeIds.has(args.node.id),
    nodeStatus,
    pendingChanges: deploymentState.pendingChanges,
    pendingPolicy,
    policyDeltaFilterMode: deploymentState.policyDeltaFilterMode,
    runNodePolicyDelta,
    runNodePolicyDeltaSummaryText: deploymentState.runNodePolicyDeltaSummaryText,
    stepOrder: args.runStepOrder.get(args.node.id),
  };
}

export function workflowCanvasNodeVisualState(args: {
  dependencyHighlightedNodeId: string | null;
  downstreamNodeIds: Set<string>;
  gotoNodeId: string | null;
  matchingNodeIds: Set<string> | null;
  nodeErrorIds: Set<string>;
  nodeId: string;
  nodeKind: string;
  showIdleNodes: boolean;
  upstreamNodeIds: Set<string>;
}): WorkflowCanvasNodeVisualState {
  const isUpstream = args.dependencyHighlightedNodeId !== null && args.upstreamNodeIds.has(args.nodeId);
  const isDownstream = args.dependencyHighlightedNodeId !== null && args.downstreamNodeIds.has(args.nodeId);
  const isHighlightedSelf = args.dependencyHighlightedNodeId === args.nodeId;
  const depRingClass = isHighlightedSelf
    ? "ring-2 ring-primary"
    : isUpstream
      ? "ring-2 ring-blue-400"
      : isDownstream
        ? "ring-2 ring-green-400"
        : "";
  const isIdleNode = args.nodeKind === "idle" || args.nodeKind === "failed" || args.nodeKind === "never_executed";
  const nodeSearchMatchClass = args.matchingNodeIds === null
    ? ""
    : args.matchingNodeIds.has(args.nodeId)
      ? "ring-2 ring-yellow-400"
      : "opacity-30";
  return {
    anomalyClass: args.nodeErrorIds.has(args.nodeId) ? "node-anomaly-pulse" : "",
    depRingClass,
    gotoClass: args.gotoNodeId === args.nodeId ? "ring-2 ring-fuchsia-400 ring-offset-2 ring-offset-transparent" : "",
    idleRingClass: args.showIdleNodes && isIdleNode ? "ring-2 ring-amber-400" : "",
    isDownstream,
    isUpstream,
    nodeSearchMatchClass,
  };
}

export function workflowCanvasNodeCardPresentationState(args: {
  activeGotoNodeId: string | null;
  activeMatchingNodeIds: Set<string> | null;
  activeNodeErrorIds: Set<string>;
  activeNodeId: string | null;
  activeShowIdleNodes: boolean;
  collapsedNodeIds: Set<string>;
  compiledFocusClass: string;
  dependencyHighlightedNodeId: string | null;
  downstreamNodeIds: Set<string>;
  dragGhostNodeId: string | null;
  liveNodeAccent: string;
  node: WorkflowNodeDraft;
  nodeProtected: boolean;
  nodeStatus: string | undefined;
  successRate: number | undefined;
  upstreamNodeIds: Set<string>;
}): WorkflowCanvasNodeCardPresentationState {
  const selected = args.activeNodeId === args.node.id;
  const statusClass = workflowCanvasNodeStatusClass({
    nodeKind: args.node.kind,
    nodeStatus: args.nodeStatus,
    selected,
    triggerFamily: args.node.config.trigger_family,
  });
  const presentationState = workflowCanvasNodePresentationState({
    matchingNodeIds: args.activeMatchingNodeIds,
    nodeId: args.node.id,
    nodeKind: args.node.kind,
    nodeStatus: args.nodeStatus,
    selected,
    successRate: args.successRate,
    triggerFamily: args.node.config.trigger_family,
  });
  const nodeVisualState = workflowCanvasNodeVisualState({
    dependencyHighlightedNodeId: args.dependencyHighlightedNodeId,
    downstreamNodeIds: args.downstreamNodeIds,
    gotoNodeId: args.activeGotoNodeId,
    matchingNodeIds: args.activeMatchingNodeIds,
    nodeErrorIds: args.activeNodeErrorIds,
    nodeId: args.node.id,
    nodeKind: args.node.kind,
    showIdleNodes: args.activeShowIdleNodes,
    upstreamNodeIds: args.upstreamNodeIds,
  });
  const nodeButtonClass = workflowCanvasNodeButtonClass({
    anomalyClass: nodeVisualState.anomalyClass,
    compiledFocusClass: args.compiledFocusClass,
    depRingClass: nodeVisualState.depRingClass,
    gotoClass: nodeVisualState.gotoClass,
    heatmapClass: presentationState.heatmapClass,
    idleRingClass: nodeVisualState.idleRingClass,
    liveNodeAccent: args.liveNodeAccent,
    nodeProtected: args.nodeProtected,
    nodeSearchMatchClass: nodeVisualState.nodeSearchMatchClass,
    statusClass,
  });
  return {
    isDraggingThisNode: args.dragGhostNodeId === args.node.id,
    isDownstream: nodeVisualState.isDownstream,
    isNodeCollapsed: args.collapsedNodeIds.has(args.node.id),
    isUpstream: nodeVisualState.isUpstream,
    nodeButtonClass,
    nodeButtonStyle: workflowCanvasNodeButtonStyle(presentationState.successRateBorderColor),
    nodeKindIconLarge: nodeKindIcon(args.node.kind),
    nodeKindIconSmall: presentationState.nodeKindIconSmall,
    protectionLabel: args.nodeProtected
      ? nodeRegenerationScope(args.node) === "subgraph" ? "Protected subgraph" : "Protected node"
      : null,
    triggerFamilyBadge: presentationState.triggerFamilyBadge,
    triggerFamilyBadgeClass: presentationState.triggerFamilyBadgeClass,
  };
}

export function workflowCanvasRouteMatchesAfpFocus(args: {
  hasAfpFilter: boolean;
  routeFocus: WorkflowCanvasAfpRouteFocus | null;
  sourceMatches: boolean;
  targetMatches: boolean;
}): boolean {
  if (args.routeFocus === "full") return args.sourceMatches && args.targetMatches;
  if (args.routeFocus === "partial") {
    return (args.sourceMatches || args.targetMatches) && !(args.sourceMatches && args.targetMatches);
  }
  return !args.hasAfpFilter || args.sourceMatches || args.targetMatches;
}

export function workflowCanvasAfpReadinessTone(
  focus: CompiledAfpReadinessFocus | null,
): WorkflowCanvasAfpReadinessToneState {
  const tone = focus === "needs_contract_work"
    ? "amber"
    : focus === "ready_handoffs"
      ? "cyan"
      : "emerald";
  return {
    clearLabel: focus === "ready_manifests"
      ? "Clear AFP-ready manifest focus"
      : focus === "ready_handoffs"
        ? "Clear AFP-ready handoff focus"
        : "Clear AFP contract-work focus",
    containerClass: tone === "amber"
      ? "border-amber-200/70 bg-white/82"
      : tone === "cyan"
        ? "border-cyan-200/70 bg-white/82"
        : "border-emerald-200/70 bg-white/82",
    labelClass: tone === "amber"
      ? "text-amber-700"
      : tone === "cyan"
        ? "text-cyan-700"
        : "text-emerald-700",
    mutedTextClass: tone === "amber"
      ? "text-amber-700/80"
      : tone === "cyan"
        ? "text-cyan-700/80"
        : "text-emerald-700/80",
    nodeChipClass: tone === "amber"
      ? "border-amber-200/70 text-amber-700"
      : tone === "cyan"
        ? "border-cyan-200/70 text-cyan-700"
        : "border-emerald-200/70 text-emerald-700",
    overlayLabel: focus === "ready_manifests"
      ? "AFP-ready manifest review"
      : focus === "ready_handoffs"
        ? "AFP-ready handoff review"
        : "AFP contract-work review",
    pillClass: tone === "amber"
      ? "border-amber-200/80 bg-amber-50/90 text-amber-800"
      : tone === "cyan"
        ? "border-cyan-200/80 bg-cyan-50/90 text-cyan-800"
        : "border-emerald-200/80 bg-emerald-50/90 text-emerald-800",
    primaryFocusClass: tone === "amber"
      ? "border-amber-200/70 bg-amber-50/90 text-amber-700"
      : tone === "cyan"
        ? "border-cyan-200/70 bg-cyan-50/90 text-cyan-700"
        : "border-emerald-200/70 bg-emerald-50/90 text-emerald-700",
    primaryLabel: focus === "ready_manifests"
      ? "AFP-ready manifests"
      : focus === "ready_handoffs"
        ? "AFP-ready handoffs"
        : "AFP contract-work review",
    ringClass: tone === "amber"
      ? "ring-2 ring-amber-300/60 ring-offset-2 ring-offset-transparent"
      : tone === "cyan"
        ? "ring-2 ring-cyan-300/60 ring-offset-2 ring-offset-transparent"
        : "ring-2 ring-emerald-300/60 ring-offset-2 ring-offset-transparent",
    stroke: tone === "amber"
      ? "#d97706"
      : tone === "cyan"
        ? "#0891b2"
        : "#059669",
  };
}

export function workflowCanvasCompiledEdgeReadinessStroke(
  focus: CompiledAfpReadinessFocus | null,
): string {
  return workflowCanvasAfpReadinessTone(focus).stroke;
}

export function workflowCanvasCompiledEdgeAfpOverlayLabel(args: {
  hasAfpFilter: boolean;
  matchesAfp: boolean;
  readinessFocus: CompiledAfpReadinessFocus | null;
  readyHandoff: boolean;
  touchesAfp: boolean;
  touchesReadiness: boolean;
}): string | null {
  if (!args.hasAfpFilter) {
    if (args.readinessFocus === "ready_manifests") {
      return args.touchesReadiness ? "AFP-ready route review" : "outside AFP-ready review";
    }
    if (args.readinessFocus === "ready_handoffs") {
      return args.readyHandoff ? "AFP-ready handoff review" : "outside AFP-ready handoff review";
    }
    if (args.readinessFocus === "needs_contract_work") {
      return args.touchesReadiness ? "outside AFP contract-work review" : "AFP contract-work review";
    }
    return null;
  }
  if (args.matchesAfp) return "AFP route match";
  return args.touchesAfp ? "partial AFP route" : "outside AFP focus";
}

export function workflowCanvasCompiledEdgeOpacity(args: {
  hasAfpFilter: boolean;
  linkageFilter: WorkflowCanvasRouteLinkageFocus | null;
  linkageMatches: boolean;
  matchesAfp: boolean;
  readinessFocus: CompiledAfpReadinessFocus | null;
  routeMatches: boolean;
  touchesAfp: boolean;
  touchesReadiness: boolean;
}): number {
  if (args.readinessFocus) {
    if (!args.touchesReadiness) return 0.18;
    return args.linkageFilter === "linked" && !args.linkageMatches ? 0.18 : 1;
  }
  if (!args.hasAfpFilter) {
    if (args.linkageFilter === "linked") return args.linkageMatches ? 1 : 0.18;
    return args.linkageFilter === "manifest_only" ? 0.12 : 1;
  }
  if (!args.routeMatches) return 0.16;
  if (args.linkageFilter === "linked" && !args.linkageMatches) return 0.18;
  if (args.linkageFilter === "manifest_only") return 0.12;
  return args.matchesAfp ? 1 : args.touchesAfp ? 0.9 : 0.35;
}

export function workflowCanvasCompiledEdgeStroke(args: {
  fallbackStroke: string;
  hasAfpFilter: boolean;
  matchesAfp: boolean;
  touchesAfp: boolean;
}): string {
  if (!args.hasAfpFilter) return args.fallbackStroke;
  if (args.matchesAfp) return "#059669";
  return args.touchesAfp ? "#f59e0b" : args.fallbackStroke;
}

export function workflowCanvasCompiledEdgeAfpOverlayClass(args: {
  matchesAfp: boolean;
  touchesAfp: boolean;
}): string {
  return [
    "flex h-6 w-full items-center justify-center rounded-full border text-center text-[10px] font-semibold uppercase tracking-[0.08em]",
    args.matchesAfp
      ? "border-emerald-200/70 bg-white/92 text-emerald-700"
      : args.touchesAfp
        ? "border-amber-200/70 bg-white/92 text-amber-700"
        : "border-slate-200/70 bg-white/92 text-slate-600",
  ].join(" ");
}

export function workflowCanvasEdgeLineMidpoint(line: WorkflowCanvasEdgeLine): WorkflowCanvasPoint {
  return {
    x: line ? (line.x1 + line.x2) / 2 : 0,
    y: line ? (line.y1 + line.y2) / 2 : 0,
  };
}

export function workflowCanvasEdgeStrokeWidth(args: {
  edgeProtected: boolean;
  edgeState: EdgeExecutionState | undefined;
  selected: boolean;
}): number {
  return args.selected ? 6 : args.edgeProtected ? 5 : args.edgeState ? 4 : 3;
}

export function workflowCanvasEdgeCalloutButtonStyle(
  callout: WorkflowCanvasEdgeCallout,
  selected: boolean,
): {
  "background-color": string;
  border: string;
  color: string;
  "box-shadow": string;
} {
  return {
    "background-color": callout?.fill ?? "rgba(255,255,255,0.96)",
    border: `1px solid ${callout?.border ?? "rgba(191,219,254,0.96)"}`,
    color: callout?.textColor ?? "#334155",
    "box-shadow": selected ? "0 0 0 2px rgba(255,255,255,0.9)" : "none",
  };
}

export function workflowCanvasEdgeOverlayPositions(args: {
  hasAfpOverlay: boolean;
  hasCallout: boolean;
  midY: number;
}): WorkflowCanvasEdgeOverlayLayout {
  return {
    afpOverlayY: args.hasCallout ? args.midY + 36 : args.midY + 6,
    calloutY: args.hasAfpOverlay ? args.midY + 28 : args.midY + 4,
    deltaY: args.hasCallout
      ? args.hasAfpOverlay ? args.midY + 60 : args.midY + 36
      : args.hasAfpOverlay ? args.midY + 30 : args.midY + 6,
    labelEditY: args.hasCallout ? args.midY - 32 : args.midY - 24,
    labelTextY: args.hasCallout ? args.midY - 16 : args.midY - 8,
  };
}

export function workflowCanvasEdgeEndpointCircleVisual(args: {
  edgeState: EdgeExecutionState | undefined;
  endpoint: "source" | "target";
  selected: boolean;
  stroke: string;
}): WorkflowCanvasEndpointCircleVisualState {
  return {
    fill: args.edgeState
      ? args.stroke
      : args.endpoint === "source"
        ? "rgba(37, 99, 235, 0.9)"
        : "rgba(37, 99, 235, 0.7)",
    radius: args.selected ? "5" : "4",
  };
}

export function workflowCanvasEdgeLineAnimationState(args: {
  edgeState: EdgeExecutionState | undefined;
  fallbackDasharray: string | undefined;
  refreshing: boolean;
}): WorkflowCanvasEdgeLineAnimationState {
  return {
    dasharray: args.refreshing && args.edgeState ? "6 3" : args.fallbackDasharray,
    style: args.refreshing && args.edgeState
      ? { "stroke-dashoffset": "0", animation: "dash-flow 1s linear infinite" }
      : undefined,
  };
}

export function workflowCanvasEdgeRenderVisualState<
  TVisual extends WorkflowCanvasEdgeExecutionVisualState,
  TCallout extends WorkflowCanvasEdgeCallout,
>(input: {
  activeAfpFilter: boolean;
  activeReadinessFocus: CompiledAfpReadinessFocus | null;
  activeRouteLinkageFilter: WorkflowCanvasRouteLinkageFocus | null;
  edgeCallout: TCallout;
  edgeFocusState: WorkflowCanvasCompiledEdgeFocusState;
  edgeId: string;
  edgeProtected: boolean;
  edgeState: EdgeExecutionState | undefined;
  line: WorkflowCanvasEdgeLine;
  selectedEdgeId: string | null;
  visual: TVisual;
}): WorkflowCanvasEdgeRenderVisualState<TVisual, TCallout> {
  const edgeSelected = input.selectedEdgeId === input.edgeId;
  const midpoint = workflowCanvasEdgeLineMidpoint(input.line);
  const edgeAfpOverlayLabel = workflowCanvasCompiledEdgeAfpOverlayLabel({
    hasAfpFilter: input.activeAfpFilter,
    matchesAfp: input.edgeFocusState.matchesAfp,
    readinessFocus: input.activeReadinessFocus,
    readyHandoff: input.edgeFocusState.readyHandoff,
    touchesAfp: input.edgeFocusState.touchesAfp,
    touchesReadiness: input.edgeFocusState.touchesReadiness,
  });
  const effectiveStroke = workflowCanvasCompiledEdgeStroke({
    fallbackStroke: input.visual.stroke,
    hasAfpFilter: input.activeAfpFilter,
    matchesAfp: input.edgeFocusState.matchesAfp,
    touchesAfp: input.edgeFocusState.touchesAfp,
  });
  const effectiveOpacity = workflowCanvasCompiledEdgeOpacity({
    hasAfpFilter: input.activeAfpFilter,
    linkageFilter: input.activeRouteLinkageFilter,
    linkageMatches: input.edgeFocusState.matchesLinkageFocus,
    matchesAfp: input.edgeFocusState.matchesAfp,
    readinessFocus: input.activeReadinessFocus,
    routeMatches: input.edgeFocusState.matchesRouteFocus,
    touchesAfp: input.edgeFocusState.touchesAfp,
    touchesReadiness: input.edgeFocusState.touchesReadiness,
  });

  return {
    edgeAfpOverlayClass: workflowCanvasCompiledEdgeAfpOverlayClass({
      matchesAfp: input.edgeFocusState.matchesAfp,
      touchesAfp: input.edgeFocusState.touchesAfp,
    }),
    edgeAfpOverlayLabel,
    edgeCallout: input.edgeCallout,
    edgeCalloutStyle: workflowCanvasEdgeCalloutButtonStyle(input.edgeCallout, edgeSelected),
    edgeOverlayLayout: workflowCanvasEdgeOverlayPositions({
      hasAfpOverlay: Boolean(edgeAfpOverlayLabel),
      hasCallout: Boolean(input.edgeCallout),
      midY: midpoint.y,
    }),
    edgeSelected,
    effectiveOpacity,
    effectiveStroke,
    midX: midpoint.x,
    readinessStroke: workflowCanvasCompiledEdgeReadinessStroke(input.activeReadinessFocus),
    sourceEndpointCircle: workflowCanvasEdgeEndpointCircleVisual({
      edgeState: input.edgeState,
      endpoint: "source",
      selected: edgeSelected,
      stroke: effectiveStroke,
    }),
    strokeWidth: workflowCanvasEdgeStrokeWidth({
      edgeProtected: input.edgeProtected,
      edgeState: input.edgeState,
      selected: edgeSelected,
    }),
    targetEndpointCircle: workflowCanvasEdgeEndpointCircleVisual({
      edgeState: input.edgeState,
      endpoint: "target",
      selected: edgeSelected,
      stroke: effectiveStroke,
    }),
    visual: input.visual,
  };
}

export function workflowCanvasEdgeCanvasRenderState<
  TVisual extends WorkflowCanvasEdgeExecutionVisualState,
  TCallout extends WorkflowCanvasEdgeCallout,
  TPolicyDelta,
>(args: {
  activeAfpFilter: string | null;
  activeReadinessFocus: CompiledAfpReadinessFocus | null;
  activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  activeRouteLinkageFilter: WorkflowCanvasRouteLinkageFocus | null;
  edge: WorkflowEdgeDraft;
  edgeCallout: TCallout;
  edgePolicyDelta: TPolicyDelta | undefined;
  edgeProtected: boolean;
  edgeState: EdgeExecutionState | undefined;
  latestManifests: Record<string, unknown>[];
  line: WorkflowCanvasEdgeLine;
  linkedGraphEdgeIds: Set<string>;
  matchingNodeIds: Set<string> | null;
  readyHandoffGraphEdgeIds: Set<string>;
  readyManifestIds: Set<string>;
  refreshing: boolean;
  selectedEdgeId: string | null;
  visual: TVisual;
}): WorkflowCanvasEdgeCanvasRenderState<TVisual, TCallout, TPolicyDelta> {
  const edgeFocusState = workflowCanvasCompiledEdgeFocusState({
    activeReadinessFocus: args.activeReadinessFocus,
    activeRouteFocus: args.activeRouteFocus,
    activeRouteLinkageFilter: args.activeRouteLinkageFilter,
    edge: args.edge,
    latestManifests: args.latestManifests,
    linkedGraphEdgeIds: args.linkedGraphEdgeIds,
    matchingNodeIds: args.matchingNodeIds,
    readyHandoffGraphEdgeIds: args.readyHandoffGraphEdgeIds,
    readyManifestIds: args.readyManifestIds,
  });
  const visualState = workflowCanvasEdgeRenderVisualState({
    activeAfpFilter: Boolean(args.activeAfpFilter),
    activeReadinessFocus: args.activeReadinessFocus,
    activeRouteLinkageFilter: args.activeRouteLinkageFilter,
    edgeCallout: args.edgeCallout,
    edgeFocusState,
    edgeId: args.edge.id,
    edgeProtected: args.edgeProtected,
    edgeState: args.edgeState,
    line: args.line,
    selectedEdgeId: args.selectedEdgeId,
    visual: args.visual,
  });
  return {
    ...visualState,
    edgePolicyDelta: args.edgePolicyDelta,
    edgeState: args.edgeState,
    line: args.line,
    lineAnimation: workflowCanvasEdgeLineAnimationState({
      edgeState: args.edgeState,
      fallbackDasharray: visualState.visual.dasharray ?? undefined,
      refreshing: args.refreshing,
    }),
  };
}

export function workflowCanvasEdgeRunPresentationState(args: {
  activeRun: WorkflowRun | null;
  edge: WorkflowEdgeDraft;
  edgePolicyDeltas: ReadonlyMap<string, WorkflowCanvasRunEdgePolicyDelta>;
  edgeReviewState: WorkflowCanvasCompiledEdgeReviewState;
  edgeStates: ReadonlyMap<string, EdgeExecutionState>;
  graphDraft: WorkflowGraphDraft;
  protectedEdgeIds: ReadonlySet<string>;
  refreshing: boolean;
  selectedEdgeId: string | null;
}): WorkflowCanvasEdgeRunPresentationState {
  const edgeState = args.edgeStates.get(args.edge.id);
  return workflowCanvasEdgeCanvasRenderState({
    activeAfpFilter: args.edgeReviewState.activeAfpFilter,
    activeReadinessFocus: args.edgeReviewState.activeAfpReadinessFocus,
    activeRouteFocus: args.edgeReviewState.activeAfpRouteFocus,
    activeRouteLinkageFilter: args.edgeReviewState.activeRouteLinkageFilter,
    edge: args.edge,
    edgeCallout: runEdgeCanvasCallout(args.activeRun, args.edge, edgeState),
    edgePolicyDelta: args.edgePolicyDeltas.get(args.edge.id),
    edgeProtected: args.protectedEdgeIds.has(args.edge.id),
    edgeState,
    latestManifests: args.edgeReviewState.latestManifests,
    line: edgeLine(args.graphDraft, args.edge),
    linkedGraphEdgeIds: args.edgeReviewState.linkedGraphEdgeIds,
    matchingNodeIds: args.edgeReviewState.matchingNodeIds,
    readyHandoffGraphEdgeIds: args.edgeReviewState.readyHandoffGraphEdgeIds,
    readyManifestIds: args.edgeReviewState.readyManifestIds,
    refreshing: args.refreshing,
    selectedEdgeId: args.selectedEdgeId,
    visual: edgeExecutionVisual(edgeState),
  });
}

export function workflowCanvasEdgeLegendVisual(
  state: EdgeExecutionState,
): WorkflowCanvasEdgeLegendVisualState {
  return edgeExecutionVisual(state);
}

export function workflowCanvasReviewRailVisible(args: {
  activeAfpFilter: string | null;
  activeAfpReadinessFocus: CompiledAfpReadinessFocus | null;
  activeLinkageFocus: WorkflowCanvasRouteLinkageFocus | null;
  activeManifestLinkageFocus: WorkflowCanvasManifestLinkageFocus | null;
  activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  branchReviewActive: boolean;
}): boolean {
  return Boolean(
    (args.activeAfpFilter && args.activeRouteFocus)
    || args.activeManifestLinkageFocus
    || args.activeLinkageFocus
    || args.activeAfpReadinessFocus
    || args.branchReviewActive,
  );
}

export function workflowCanvasFocusOverlayBadgeItems(args: {
  activeAfpFilter: string | null;
  activeManifestLinkageFilter: WorkflowCanvasManifestLinkageFocus | null;
  graphNodeCount: number;
  matchingCount: number;
}): WorkflowCanvasFocusOverlayBadgeItem[] {
  return [
    args.activeAfpFilter
      ? {
          className: `${REVIEW_CLEAR_ACTION_BASE_CLASS} border-emerald-200/70 bg-emerald-50/85 text-emerald-700`,
          label: `AFP focus ${args.activeAfpFilter.replaceAll("_", " ")}`,
        }
      : null,
    args.activeManifestLinkageFilter
      ? {
          className: `${REVIEW_CLEAR_ACTION_BASE_CLASS} ${
            args.activeManifestLinkageFilter === "linked"
              ? "border-emerald-200/70 bg-white/85 text-emerald-800"
              : "border-amber-200/70 bg-amber-50/85 text-amber-700"
          }`,
          label: args.activeManifestLinkageFilter === "linked"
            ? "node-review-ready manifests"
            : "inspector-only manifests",
        }
      : null,
    {
      className: `${REVIEW_CLEAR_ACTION_BASE_CLASS} border-white/60 bg-white/85 text-emerald-800`,
      label: `${args.matchingCount} of ${args.graphNodeCount} nodes match`,
    },
  ].filter((item): item is WorkflowCanvasFocusOverlayBadgeItem => item !== null);
}

export function workflowCanvasFocusOverlayCounts(args: {
  graphEdges: WorkflowEdgeDraft[];
  graphNodes: WorkflowNodeDraft[];
  matchingNodeIds: Set<string>;
}): WorkflowCanvasFocusOverlayCounts {
  const matchingCount = args.graphNodes.filter((node) => args.matchingNodeIds.has(node.id)).length;
  const fullyMatchingRouteCount = args.graphEdges.filter((edge) =>
    args.matchingNodeIds.has(edge.source) && args.matchingNodeIds.has(edge.target),
  ).length;
  const partiallyMatchingRouteCount = args.graphEdges.filter((edge) => {
    const sourceMatches = args.matchingNodeIds.has(edge.source);
    const targetMatches = args.matchingNodeIds.has(edge.target);
    return workflowCanvasRouteMatchesAfpFocus({
      hasAfpFilter: true,
      routeFocus: "partial",
      sourceMatches,
      targetMatches,
    });
  }).length;
  return {
    firstMatchingNodeId: args.graphNodes.find((node) => args.matchingNodeIds.has(node.id))?.id ?? null,
    fullyMatchingRouteCount,
    graphNodeCount: args.graphNodes.length,
    matchingCount,
    partiallyMatchingRouteCount,
  };
}

export function workflowCanvasFocusOverlayRouteActionView(args: {
  activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  count: number;
  mode: WorkflowCanvasAfpRouteFocus;
}): WorkflowCanvasFocusOverlayActionViewState {
  const full = args.mode === "full";
  const active = args.activeRouteFocus === args.mode;
  const message = full
    ? "Focus the graph on routes that fully match the current AFP slice"
    : "Focus the graph on routes that partially intersect the current AFP slice";
  const toneClass = full
    ? active
      ? "border-emerald-300 bg-white ring-2 ring-emerald-300/70 text-emerald-800"
      : "border-emerald-200/70 bg-white/85 text-emerald-800"
    : active
      ? "border-amber-300 bg-white ring-2 ring-amber-300/70 text-amber-700"
      : "border-amber-200/70 bg-white/85 text-amber-700";
  return {
    ariaLabel: message,
    className: `${REVIEW_CLEAR_ACTION_HOVER_CLASS} ${toneClass}`,
    kind: full ? "route_focus_full" : "route_focus_partial",
    label: full ? `${args.count} route review matches` : `${args.count} partial route reviews`,
    mode: args.mode,
    title: message,
  };
}

export function workflowCanvasFocusOverlayStaticActionViews(
  firstMatchingNodeId: string | null,
): WorkflowCanvasFocusOverlayActionViewState[] {
  return [
    {
      ariaLabel: "Open the workflow inspector with the current AFP-filtered compiled roster",
      className: COMPILED_FOCUS_ACTION_CLASS,
      kind: "review_roster",
      label: "Review roster",
      title: "Open the workflow inspector with the current AFP-filtered compiled roster",
    },
    ...(firstMatchingNodeId
      ? [{
          ariaLabel: "Open the first matching node's compiled runtime contract",
          className: COMPILED_FOCUS_ACTION_CLASS,
          kind: "open_first_match" as const,
          label: "Open first match",
          nodeId: firstMatchingNodeId,
          title: "Open the first matching node's compiled runtime contract",
        }]
      : []),
    {
      ariaLabel: "Clear the active compiled graph focus from the canvas",
      className: `${REVIEW_CLEAR_ACTION_BASE_CLASS} border-emerald-200/80 bg-emerald-100/80 text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-200/70`,
      kind: "clear_focus",
      label: "Show full graph",
      title: "Clear the active compiled graph focus from the canvas",
    },
  ];
}

export function workflowCanvasFocusOverlayActionViews(args: {
  activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  firstMatchingNodeId: string | null;
  fullyMatchingRouteCount: number;
  partiallyMatchingRouteCount: number;
}): WorkflowCanvasFocusOverlayActionViewState[] {
  return [
    ...(args.fullyMatchingRouteCount > 0
      ? [workflowCanvasFocusOverlayRouteActionView({
          activeRouteFocus: args.activeRouteFocus,
          count: args.fullyMatchingRouteCount,
          mode: "full",
        })]
      : []),
    ...(args.partiallyMatchingRouteCount > 0
      ? [workflowCanvasFocusOverlayRouteActionView({
          activeRouteFocus: args.activeRouteFocus,
          count: args.partiallyMatchingRouteCount,
          mode: "partial",
        })]
      : []),
    ...(args.activeRouteFocus
      ? [{
          ariaLabel: "Clear the route participation focus while keeping the AFP node slice",
          className: COMPILED_FOCUS_ACTION_CLASS,
          kind: "clear_route_focus" as const,
          label: "Show all routes",
          title: "Clear the route participation focus while keeping the AFP node slice",
        }]
      : []),
    ...workflowCanvasFocusOverlayStaticActionViews(args.firstMatchingNodeId),
  ];
}

export function workflowCanvasFocusOverlayActionItems(input: {
  actionViews: WorkflowCanvasFocusOverlayActionViewState[];
  clearAfpGraphFocus: () => void;
  clearAfpRouteFocus: () => void;
  openCompiledRosterReview: () => void;
  openCompiledRuntimeContract: (nodeId: string, focusTarget: string | null) => void;
  setSelectedCompiledAfpRouteFocus: (focus: WorkflowCanvasAfpRouteFocus | null) => void;
}): WorkflowCanvasFocusOverlayActionItem[] {
  return input.actionViews.map((item) => ({
    ...item,
    onClick: () => {
      if (item.kind === "route_focus_full" || item.kind === "route_focus_partial") {
        input.setSelectedCompiledAfpRouteFocus(item.mode ?? null);
        return;
      }
      if (item.kind === "clear_route_focus") {
        input.clearAfpRouteFocus();
        return;
      }
      if (item.kind === "review_roster") {
        input.openCompiledRosterReview();
        return;
      }
      if (item.kind === "open_first_match" && item.nodeId) {
        input.openCompiledRuntimeContract(item.nodeId, item.nodeId);
        return;
      }
      input.clearAfpGraphFocus();
    },
  }));
}

export function workflowCanvasCompiledFocusOverlayViewState(args: {
  graphEdges: WorkflowEdgeDraft[];
  graphNodes: WorkflowNodeDraft[];
  reviewContext: WorkflowCanvasCompiledReviewContext;
  topOffsetClass: string;
}): WorkflowCanvasCompiledFocusOverlayViewState | null {
  const activeAfpFilter = args.reviewContext.activeAfpFilter;
  const activeManifestLinkageFilter = args.reviewContext.activeManifestLinkageFilter;
  if (!activeAfpFilter && !activeManifestLinkageFilter) {
    return null;
  }
  const matchingNodeIds = workflowCanvasCompiledFocusOverlayMatchingNodeIds({
    activeAfpFilter,
    activeManifestLinkageFilter,
    latestManifests: args.reviewContext.latestManifests,
  });
  const overlayCounts = workflowCanvasFocusOverlayCounts({
    graphEdges: args.graphEdges,
    graphNodes: args.graphNodes,
    matchingNodeIds,
  });
  const activeRouteFocus = args.reviewContext.activeAfpRouteFocus;
  return {
    activeManifestLinkageFilter,
    activeRouteFocus,
    actionItems: workflowCanvasFocusOverlayActionViews({
      activeRouteFocus,
      firstMatchingNodeId: overlayCounts.firstMatchingNodeId,
      fullyMatchingRouteCount: overlayCounts.fullyMatchingRouteCount,
      partiallyMatchingRouteCount: overlayCounts.partiallyMatchingRouteCount,
    }),
    badgeItems: workflowCanvasFocusOverlayBadgeItems({
      activeAfpFilter,
      activeManifestLinkageFilter,
      graphNodeCount: overlayCounts.graphNodeCount,
      matchingCount: overlayCounts.matchingCount,
    }),
    firstMatchingNodeId: overlayCounts.firstMatchingNodeId,
    inspectorOnlyNotice: activeManifestLinkageFilter === "inspector_only"
      ? "inspector-only manifests do not yet open editable node review targets"
      : null,
    topOffsetClass: args.topOffsetClass,
  };
}

export function workflowCanvasRouteLinkageFocusButtonState(
  mode: WorkflowCanvasRouteLinkageFocus,
  activeFocus: WorkflowCanvasRouteLinkageFocus | null,
): WorkflowCanvasRouteLinkageFocusButtonState {
  const active = activeFocus === mode;
  const message = active
    ? clearOverlappingRouteNarrowingMessage(mode)
    : focusRouteLinkageReviewMessage(mode);
  return {
    className: mode === "linked"
      ? active
        ? "border-sky-300 bg-white ring-2 ring-sky-300/70 text-sky-800"
        : "border-sky-200/80 bg-sky-50/90 text-sky-800"
      : active
        ? "border-amber-300 bg-white ring-2 ring-amber-300/70 text-amber-800"
        : "border-amber-200/80 bg-amber-50/90 text-amber-800",
    message,
  };
}

export function workflowCanvasEdgeLegendButtonStyle(
  visual: WorkflowCanvasEdgeLegendVisualInput,
): { border: string; "background-color": string; color: string } {
  return {
    border: `1px solid ${visual.badgeBorder}`,
    "background-color": visual.badgeFill,
    color: visual.badgeText,
  };
}

export function workflowCanvasEdgeLegendDotStyle(
  visual: WorkflowCanvasEdgeLegendVisualInput,
): { "background-color": string } {
  return {
    "background-color": visual.stroke,
  };
}

export function workflowCanvasManifestHealthRailCopy(
  focus: WorkflowCanvasManifestLinkageFocus | null,
): WorkflowCanvasReviewRailCopyState {
  return {
    inspectorOnlyText: focus === "inspector_only"
      ? "Inspector-only manifests stay in compiled review only"
      : "Inspector-only manifests are outside canvas node focus",
    linkedText: focus === "linked"
      ? "Node-review-ready manifests remain in focus"
      : "Node-review-ready manifests are de-emphasized",
  };
}

export function workflowCanvasAfpRouteRailCopy(
  focus: WorkflowCanvasAfpRouteFocus | null,
): WorkflowCanvasReviewRailCopyState {
  return {
    fullText: focus === "full" ? "Full AFP route review focus" : "Matched route review remains in focus",
    partialText: focus === "partial" ? "Partial AFP route review focus" : "Partial AFP route review",
  };
}

export function workflowCanvasRouteLinkageRailCopy(
  focus: WorkflowCanvasRouteLinkageFocus | null,
): WorkflowCanvasReviewRailCopyState {
  return {
    inspectorOnlyText: focus === "manifest_only"
      ? "Inspector-only routes remain in focus"
      : "Inspector-only routes are de-emphasized",
    linkedText: focus === "linked"
      ? "Branch-review-ready routes remain in focus"
      : "Branch-review-ready routes are de-emphasized",
  };
}

export function workflowCanvasManifestHealthClearActionView(
  focus: WorkflowCanvasManifestLinkageFocus,
): WorkflowCanvasReviewClearActionViewState {
  const linked = focus === "linked";
  return {
    className: `${REVIEW_CLEAR_ACTION_HOVER_CLASS} ${
      linked ? "border-sky-200/70 bg-sky-50/90 text-sky-700" : "border-amber-200/70 bg-amber-50/90 text-amber-700"
    }`,
    disabled: false,
    label: linked ? "Clear node-review-ready manifest focus" : "Clear inspector-only manifest focus",
    title: clearReviewFocusMessage("manifest_health"),
  };
}

export function workflowCanvasAfpRouteClearActionView(
  focus: WorkflowCanvasAfpRouteFocus,
): WorkflowCanvasReviewClearActionViewState {
  return {
    className: `${REVIEW_CLEAR_ACTION_BASE_CLASS} border-emerald-200/70 bg-emerald-50/90 text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100/90`,
    disabled: false,
    label: `Clear AFP route ${focus === "full" ? "full match" : "partial match"}`,
    title: clearReviewFocusMessage("afp_route"),
  };
}

export function workflowCanvasRouteLinkageClearActionView(
  focus: WorkflowCanvasRouteLinkageFocus,
): WorkflowCanvasReviewClearActionViewState {
  return {
    className: `${REVIEW_CLEAR_ACTION_BASE_CLASS} border-amber-200/70 bg-amber-50/90 text-amber-700 transition hover:border-amber-300 hover:bg-amber-100/90`,
    disabled: false,
    label: focus === "linked" ? "Clear branch-review-ready route focus" : "Clear inspector-only route focus",
    title: clearReviewFocusMessage("route_linkage"),
  };
}

export function workflowCanvasAfpReadinessClearActionView(
  focus: CompiledAfpReadinessFocus,
): WorkflowCanvasReviewClearActionViewState {
  const tone = workflowCanvasAfpReadinessTone(focus);
  return {
    className: `${REVIEW_CLEAR_ACTION_HOVER_CLASS} ${tone.pillClass}`,
    disabled: false,
    label: tone.clearLabel,
    title: clearAfpReadinessFocusMessage(),
  };
}

export function workflowCanvasBranchFocusClearActionView(input: {
  available: boolean;
  selectedEdgeId: string | null;
}): WorkflowCanvasReviewClearActionViewState {
  const hasSelection = Boolean(input.selectedEdgeId);
  return {
    className: `${REVIEW_CLEAR_ACTION_BASE_CLASS} border-violet-200/70 bg-violet-50/90 text-violet-700 transition ${
      input.available ? "hover:border-violet-300 hover:bg-violet-100/90" : "cursor-not-allowed opacity-70"
    }`,
    disabled: !input.available,
    label: hasSelection
      ? "Clear branch focus"
      : input.available
        ? "Review branch focus"
        : "No branch edge to review",
    title: hasSelection
      ? clearReviewFocusMessage("branch_focus")
      : input.available
        ? availableReviewTargetMessage("branch_edge")
        : "No traced branch edge is available for branch review yet",
  };
}

export function workflowCanvasOrchestrationRoleClearActionView(): WorkflowCanvasReviewClearActionViewState {
  return {
    className: `${REVIEW_CLEAR_ACTION_BASE_CLASS} border-cyan-200/70 bg-cyan-50/90 text-cyan-700 transition hover:border-cyan-300 hover:bg-cyan-100/90`,
    disabled: false,
    label: "Clear orchestration role focus",
    title: clearOrchestrationRoleFocusMessage(),
  };
}

export function workflowCanvasReviewRailClearActionViews(input: {
  activeAfpReadinessFocus: CompiledAfpReadinessFocus | null;
  activeLinkageFocus: WorkflowCanvasRouteLinkageFocus | null;
  activeManifestLinkageFocus: WorkflowCanvasManifestLinkageFocus | null;
  activeOrchestrationRoleFocus: CompiledOrchestrationRole | null;
  activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  branchRailFocusAvailable: boolean;
  branchReviewActive: boolean;
  firstReviewedEdge: WorkflowEdgeDraft | null;
  selectedEdgeId: string | null;
}): WorkflowCanvasReviewRailClearActionViewState[] {
  const items: Array<WorkflowCanvasReviewRailClearActionViewState | null> = [
    input.activeManifestLinkageFocus
      ? {
          ...workflowCanvasManifestHealthClearActionView(input.activeManifestLinkageFocus),
          id: "manifest_focus" as const,
        }
      : null,
    input.activeOrchestrationRoleFocus
      ? {
          ...workflowCanvasOrchestrationRoleClearActionView(),
          id: "orchestration_role" as const,
        }
      : null,
    input.activeRouteFocus
      ? {
          ...workflowCanvasAfpRouteClearActionView(input.activeRouteFocus),
          id: "afp_route" as const,
        }
      : null,
    input.activeLinkageFocus
      ? {
          ...workflowCanvasRouteLinkageClearActionView(input.activeLinkageFocus),
          id: "route_linkage" as const,
        }
      : null,
    input.activeAfpReadinessFocus
      ? {
          ...workflowCanvasAfpReadinessClearActionView(input.activeAfpReadinessFocus),
          id: "afp_readiness" as const,
        }
      : null,
    input.branchReviewActive
      ? {
          ...workflowCanvasBranchFocusClearActionView({
            available: input.branchRailFocusAvailable,
            selectedEdgeId: input.selectedEdgeId,
          }),
          edgeId: input.selectedEdgeId ? undefined : input.firstReviewedEdge?.id,
          id: "branch_focus" as const,
          nodeId: input.selectedEdgeId ? undefined : input.firstReviewedEdge?.target,
        }
      : null,
  ];
  return items.filter((item): item is WorkflowCanvasReviewRailClearActionViewState => item !== null);
}

export function workflowCanvasReviewRailClearActionItems(input: {
  activeAfpReadinessFocus: CompiledAfpReadinessFocus | null;
  activeLinkageFocus: WorkflowCanvasRouteLinkageFocus | null;
  activeManifestLinkageFocus: WorkflowCanvasManifestLinkageFocus | null;
  activeOrchestrationRoleFocus: CompiledOrchestrationRole | null;
  activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  branchRailFocusAvailable: boolean;
  branchReviewActive: boolean;
  clearAfpReadinessFocus: () => void;
  clearAfpRouteFocus: () => void;
  clearManifestHealthFocus: () => void;
  clearOrchestrationRoleFocus: () => void;
  clearRouteLinkageFocus: () => void;
  firstReviewedEdge: WorkflowEdgeDraft | null;
  focusRunEdgeTarget: (edgeId: string, nodeId: string) => void;
  selectedEdgeId: string | null;
  setSelectedRunEdgeId: (edgeId: string | null) => void;
}): WorkflowCanvasReviewRailClearActionItem[] {
  return workflowCanvasReviewRailClearActionViews(input).map((item) => ({
    ...item,
    onClick: () => {
      if (item.id === "manifest_focus") {
        input.clearManifestHealthFocus();
        return;
      }
      if (item.id === "orchestration_role") {
        input.clearOrchestrationRoleFocus();
        return;
      }
      if (item.id === "afp_route") {
        input.clearAfpRouteFocus();
        return;
      }
      if (item.id === "route_linkage") {
        input.clearRouteLinkageFocus();
        return;
      }
      if (item.id === "afp_readiness") {
        input.clearAfpReadinessFocus();
        return;
      }
      if (input.selectedEdgeId) {
        input.setSelectedRunEdgeId(null);
        return;
      }
      if (item.edgeId && item.nodeId) {
        input.focusRunEdgeTarget(item.edgeId, item.nodeId);
      }
    },
  }));
}

export function workflowCanvasOrchestrationRoleFocusLabel(
  role: CompiledOrchestrationRole | null,
): string {
  return compiledManifestOrchestrationRole(
    role === "delegated_capability"
      ? "executor"
      : role === "delegated_decision"
        ? "approval_runtime"
        : role === "workflow_summary"
          ? "termination_runtime"
          : "plan",
    role === "delegated_capability" ? "capability" : null,
  ).label;
}

export function workflowCanvasReviewRailUnavailableFocusMessage(input: {
  activeAfpReadinessFocus: CompiledAfpReadinessFocus | null;
  activeLinkageFocus: WorkflowCanvasRouteLinkageFocus | null;
  activeManifestLinkageFocus: WorkflowCanvasManifestLinkageFocus | null;
  activeOrchestrationRoleFocus: CompiledOrchestrationRole | null;
  activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
}): string {
  if (input.activeRouteFocus || input.activeLinkageFocus) {
    return unavailableReviewTargetMessage("compiled_route");
  }
  if (
    input.activeOrchestrationRoleFocus
    || input.activeManifestLinkageFocus
    || input.activeAfpReadinessFocus
  ) {
    return unavailableReviewTargetMessage("compiled_manifest");
  }
  return unavailableReviewTargetMessage("branch_edge");
}

export function workflowCanvasReviewRailPrimaryFocusView(input: {
  activeAfpReadinessFocus: CompiledAfpReadinessFocus | null;
  activeEdgeId: string | null;
  activeLinkageFocus: WorkflowCanvasRouteLinkageFocus | null;
  activeManifestLinkageFocus: WorkflowCanvasManifestLinkageFocus | null;
  activeOrchestrationRoleFocus: CompiledOrchestrationRole | null;
  activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  branchReviewActive: boolean;
  firstAfpContractWorkSourceNodeId: string | null;
  firstAfpReadyHandoffTarget: string | null;
  firstAfpReadyManifestSourceNodeId: string | null;
  firstCompiledRouteFocusTarget: string | null;
  firstLinkedManifestNodeId: string | null;
  firstOrchestrationRoleNodeId: string | null;
  firstReviewedEdge: WorkflowEdgeDraft | null;
  graphEdges: WorkflowEdgeDraft[];
}): WorkflowCanvasReviewRailPrimaryFocusViewState | null {
  const compiledRoutePrimaryFocus = (
    label: string,
    unavailableTitle: string,
    tone = "border-emerald-200/70 bg-emerald-50/90 text-emerald-700",
  ): WorkflowCanvasReviewRailPrimaryFocusViewState => ({
    available: Boolean(input.firstCompiledRouteFocusTarget),
    kind: "compiled_route",
    label,
    routeTarget: input.firstCompiledRouteFocusTarget ?? undefined,
    title: input.firstCompiledRouteFocusTarget
      ? availableReviewTargetMessage("compiled_route")
      : unavailableTitle,
    tone,
  });

  if (input.activeRouteFocus) {
    return compiledRoutePrimaryFocus(
      `Primary: AFP route ${input.activeRouteFocus === "full" ? "full match" : "partial match"}`,
      "No compiled route topology entry is available for the current AFP route focus",
    );
  }

  if (input.activeLinkageFocus) {
    return compiledRoutePrimaryFocus(
      `Primary: ${input.activeLinkageFocus === "linked" ? "branch-review-ready routes" : "inspector-only routes"}`,
      "No compiled route topology entry is available for the current linkage focus",
      "border-amber-200/70 bg-amber-50/90 text-amber-700",
    );
  }

  if (input.activeOrchestrationRoleFocus) {
    return {
      available: Boolean(input.firstOrchestrationRoleNodeId),
      kind: "orchestration_role_node",
      label: `Primary: ${workflowCanvasOrchestrationRoleFocusLabel(input.activeOrchestrationRoleFocus)}`,
      nodeId: input.firstOrchestrationRoleNodeId ?? undefined,
      title: input.firstOrchestrationRoleNodeId
        ? availableReviewTargetMessage("compiled_manifest")
        : "No editable graph node is available for the current orchestration role focus",
      tone: "border-cyan-200/70 bg-cyan-50/90 text-cyan-700",
    };
  }

  if (input.activeManifestLinkageFocus) {
    const linked = input.activeManifestLinkageFocus === "linked";
    return {
      available: linked ? Boolean(input.firstLinkedManifestNodeId) : true,
      kind: linked ? "manifest_linked" : "manifest_inspector",
      label: `Primary: ${linked ? "node-review-ready manifests" : "inspector-only manifests"}`,
      nodeId: input.firstLinkedManifestNodeId ?? undefined,
      title: linked
        ? input.firstLinkedManifestNodeId
          ? availableReviewTargetMessage("compiled_manifest")
          : "No editable graph node is currently linked to this manifest health focus"
        : availableReviewTargetMessage("compiled_manifest"),
      tone: linked
        ? "border-sky-200/70 bg-sky-50/90 text-sky-700"
        : "border-amber-200/70 bg-amber-50/90 text-amber-700",
    };
  }

  if (input.activeAfpReadinessFocus) {
    const routeFocus = input.activeAfpReadinessFocus === "ready_handoffs";
    const readinessTone = workflowCanvasAfpReadinessTone(input.activeAfpReadinessFocus);
    const nodeId = input.activeAfpReadinessFocus === "needs_contract_work"
      ? input.firstAfpContractWorkSourceNodeId
      : input.firstAfpReadyManifestSourceNodeId;
    const routeTarget = input.firstAfpReadyHandoffTarget;
    const available = routeFocus ? Boolean(routeTarget) : Boolean(nodeId);
    const targetKind = routeFocus ? "compiled_route" : "compiled_manifest";
    return {
      available,
      kind: routeFocus ? "readiness_route" : "readiness_node",
      label: `Primary: ${readinessTone.primaryLabel}`,
      nodeId: nodeId ?? undefined,
      routeTarget: routeTarget ?? undefined,
      title: available
        ? availableReviewTargetMessage(targetKind)
        : unavailableReviewTargetMessage(targetKind),
      tone: readinessTone.primaryFocusClass,
    };
  }

  if (!input.branchReviewActive) return null;
  const targetEdge = input.activeEdgeId
    ? input.graphEdges.find((edge) => edge.id === input.activeEdgeId) ?? null
    : input.firstReviewedEdge;
  return {
    available: Boolean(targetEdge),
    edgeId: targetEdge?.id,
    kind: "branch_edge",
    label: input.activeEdgeId ? "Primary: branch edge focus" : "Primary: branch review",
    nodeId: targetEdge?.target,
    title: availableReviewTargetMessage("branch_edge"),
    tone: "border-violet-200/70 bg-violet-50/90 text-violet-700",
  };
}

export function workflowCanvasReviewRailPrimaryFocusActionView(input: {
  activeAfpReadinessFocus: CompiledAfpReadinessFocus | null;
  activeEdgeId: string | null;
  activeLinkageFocus: WorkflowCanvasRouteLinkageFocus | null;
  activeManifestLinkageFocus: WorkflowCanvasManifestLinkageFocus | null;
  activeOrchestrationRoleFocus: CompiledOrchestrationRole | null;
  activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  branchReviewActive: boolean;
  firstAfpContractWorkSourceNodeId: string | null;
  firstAfpReadyHandoffTarget: string | null;
  firstAfpReadyManifestSourceNodeId: string | null;
  firstCompiledRouteFocusTarget: string | null;
  firstLinkedManifestNodeId: string | null;
  firstOrchestrationRoleNodeId: string | null;
  firstReviewedEdge: WorkflowEdgeDraft | null;
  focusRunEdgeTarget: (edgeId: string, nodeId: string) => void;
  graphEdges: WorkflowEdgeDraft[];
  openCompiledRouteReview: (routeTarget: string) => void;
  resetInspectorFocus: () => void;
  selectCanvasNode: (nodeId: string) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
}): WorkflowCanvasReviewRailPrimaryFocusActionViewState | null {
  const focus = workflowCanvasReviewRailPrimaryFocusView(input);
  if (!focus) return null;
  return {
    ...focus,
    onClick: () => {
      if (focus.kind === "compiled_route" || focus.kind === "readiness_route") {
        if (focus.routeTarget) {
          input.openCompiledRouteReview(focus.routeTarget);
        }
        return;
      }
      if (
        focus.kind === "orchestration_role_node"
        || focus.kind === "manifest_linked"
        || focus.kind === "readiness_node"
      ) {
        if (focus.nodeId) {
          input.selectCanvasNode(focus.nodeId);
        }
        return;
      }
      if (focus.kind === "manifest_inspector") {
        input.setSelectedNodeId(null);
        input.resetInspectorFocus();
        return;
      }
      if (focus.edgeId && focus.nodeId) {
        input.focusRunEdgeTarget(focus.edgeId, focus.nodeId);
      }
    },
  };
}

export function workflowCanvasCompiledNodeAfpOverlayLabel(
  input: WorkflowCanvasCompiledNodeOverlayLabelInput,
): string | null {
  if (input.activeOrchestrationRole) {
    if (input.matchesOrchestrationRole) return input.orchestrationRoleLabel;
    return input.compiledManifest ? "outside orchestration role focus" : "outside compiled orchestration focus";
  }
  if (input.activeReadinessFocus) {
    if (input.matchesReadiness) return workflowCanvasAfpReadinessTone(input.activeReadinessFocus).overlayLabel;
    return input.compiledManifest ? "outside AFP readiness review" : "outside compiled AFP readiness";
  }
  if (input.activeGapFilter) {
    if (input.matchesGap) return compiledAfpGapLabel(input.activeGapFilter);
    return input.compiledManifest ? "outside AFP gap focus" : "outside compiled AFP gap focus";
  }
  if (!input.activeAfpFilter) {
    if (input.activeManifestLinkageFilter === "linked") {
      return input.matchesManifestLinkage ? "manifest health match" : "outside manifest health";
    }
    return input.activeManifestLinkageFilter === "inspector_only" ? "inspector-only review context" : null;
  }
  if (input.matchesAfp) return "AFP review match";
  return input.compiledManifest ? "outside AFP review focus" : "outside compiled AFP review";
}

export function workflowCanvasCompiledNodeAfpOverlayClass(
  input: WorkflowCanvasCompiledNodeOverlayClassInput,
): string {
  if (input.activeOrchestrationRole) {
    return input.matchesOrchestrationRole ? input.orchestrationRoleClass : COMPILED_NODE_MUTED_CHIP_CLASS;
  }
  if (input.activeReadinessFocus) {
    return input.matchesReadiness
      ? workflowCanvasAfpReadinessTone(input.activeReadinessFocus).nodeChipClass
      : COMPILED_NODE_MUTED_CHIP_CLASS;
  }
  if (input.activeGapFilter) {
    return input.matchesGap ? COMPILED_NODE_GAP_CHIP_CLASS : COMPILED_NODE_MUTED_CHIP_CLASS;
  }
  if (input.activeManifestLinkageFilter === "linked") {
    return input.matchesManifestLinkage ? COMPILED_NODE_LINKED_CHIP_CLASS : COMPILED_NODE_MUTED_CHIP_CLASS;
  }
  if (input.activeManifestLinkageFilter === "inspector_only") {
    return COMPILED_NODE_INSPECTOR_CHIP_CLASS;
  }
  return input.matchesAfp ? COMPILED_NODE_AFP_CHIP_CLASS : COMPILED_NODE_MUTED_CHIP_CLASS;
}

export function workflowCanvasCompiledNodeFocusClass(
  input: WorkflowCanvasCompiledNodeFocusClassInput,
): string {
  return [
    input.activeAfpFilter && input.matchesAfp ? "ring-2 ring-emerald-300/60 ring-offset-2 ring-offset-transparent" : "",
    input.activeAfpFilter && !input.matchesAfp ? "opacity-55 saturate-[0.7]" : "",
    input.activeReadinessFocus && input.matchesReadiness
      ? workflowCanvasAfpReadinessTone(input.activeReadinessFocus).ringClass
      : "",
    input.activeReadinessFocus && !input.matchesReadiness ? "opacity-45 saturate-[0.65]" : "",
    input.activeGapFilter && input.matchesGap ? "ring-2 ring-violet-300/60 ring-offset-2 ring-offset-transparent" : "",
    input.activeGapFilter && !input.matchesGap ? "opacity-45 saturate-[0.65]" : "",
    input.activeOrchestrationRole && input.matchesOrchestrationRole ? "ring-2 ring-cyan-300/60 ring-offset-2 ring-offset-transparent" : "",
    input.activeOrchestrationRole && !input.matchesOrchestrationRole ? "opacity-45 saturate-[0.65]" : "",
    input.activeManifestLinkageFilter === "linked" && input.matchesManifestLinkage ? "ring-2 ring-sky-300/60 ring-offset-2 ring-offset-transparent" : "",
    input.activeManifestLinkageFilter === "linked" && !input.matchesManifestLinkage ? "opacity-45 saturate-[0.65]" : "",
    input.activeManifestLinkageFilter === "inspector_only" ? "opacity-35 saturate-[0.5]" : "",
    input.activeAfpFilter && input.hasRouteFocus && !input.participatesInRouteFocus ? "opacity-30 saturate-[0.55]" : "",
  ].filter(Boolean).join(" ");
}

export function workflowCanvasCompiledAfpReadinessFocusChipClass(
  focus: CompiledAfpReadinessFocus | null,
): string {
  return workflowCanvasAfpReadinessTone(focus).nodeChipClass;
}

export function workflowCanvasCompiledNodeReviewVisualState(
  input: WorkflowCanvasCompiledNodeReviewVisualInput,
): WorkflowCanvasCompiledNodeReviewVisualState {
  return {
    afpFilterOverlayClass: workflowCanvasCompiledNodeAfpOverlayClass({
      activeGapFilter: input.activeGapFilter,
      activeManifestLinkageFilter: input.activeManifestLinkageFilter,
      activeOrchestrationRole: input.activeOrchestrationRole,
      activeReadinessFocus: input.activeReadinessFocus,
      matchesAfp: input.matchesAfp,
      matchesGap: input.matchesGap,
      matchesManifestLinkage: input.matchesManifestLinkage,
      matchesOrchestrationRole: input.matchesOrchestrationRole,
      matchesReadiness: input.matchesReadiness,
      orchestrationRoleClass: input.compiledOrchestrationRole.chipClass,
    }),
    afpFilterOverlayLabel: workflowCanvasCompiledNodeAfpOverlayLabel({
      activeAfpFilter: Boolean(input.activeAfpFilter),
      activeGapFilter: input.activeGapFilter,
      activeManifestLinkageFilter: input.activeManifestLinkageFilter,
      activeOrchestrationRole: input.activeOrchestrationRole,
      activeReadinessFocus: input.activeReadinessFocus,
      compiledManifest: input.compiledManifest,
      matchesAfp: input.matchesAfp,
      matchesGap: input.matchesGap,
      matchesManifestLinkage: input.matchesManifestLinkage,
      matchesOrchestrationRole: input.matchesOrchestrationRole,
      matchesReadiness: input.matchesReadiness,
      orchestrationRoleLabel: input.compiledOrchestrationRole.label,
    }),
    compiledFocusClass: workflowCanvasCompiledNodeFocusClass({
      activeAfpFilter: Boolean(input.activeAfpFilter),
      activeGapFilter: input.activeGapFilter,
      activeManifestLinkageFilter: input.activeManifestLinkageFilter,
      activeOrchestrationRole: input.activeOrchestrationRole,
      activeReadinessFocus: input.activeReadinessFocus,
      hasRouteFocus: Boolean(input.activeRouteFocus),
      matchesAfp: input.matchesAfp,
      matchesGap: input.matchesGap,
      matchesManifestLinkage: input.matchesManifestLinkage,
      matchesOrchestrationRole: input.matchesOrchestrationRole,
      matchesReadiness: input.matchesReadiness,
      participatesInRouteFocus: input.participatesInRouteFocus,
    }),
  };
}

export function workflowCanvasRecordStringField(
  record: Record<string, unknown> | null | undefined,
  field: string,
): string | null {
  return typeof record?.[field] === "string" ? record[field] : null;
}

export function workflowCanvasCompiledManifestRuntimeKind(
  manifest: Record<string, unknown> | null,
): string | null {
  return workflowCanvasRecordStringField(manifest, "runtime_kind");
}

export function workflowCanvasCompiledManifestConnectorBinding(
  manifest: Record<string, unknown> | null,
): Record<string, unknown> | null {
  return isRecord(manifest?.connector_binding) ? manifest.connector_binding : null;
}

export function workflowCanvasCompiledManifestCapabilityId(
  manifest: Record<string, unknown> | null,
): string | null {
  return workflowCanvasRecordStringField(
    workflowCanvasCompiledManifestConnectorBinding(manifest),
    "capability_id",
  );
}

export function workflowCanvasCompiledManifestAfpCategory(
  manifest: Record<string, unknown> | null,
): ReturnType<typeof compiledManifestAfpContract>["category"] {
  return compiledManifestAfpContract(
    workflowCanvasCompiledManifestRuntimeKind(manifest),
    workflowCanvasCompiledManifestCapabilityId(manifest),
  ).category;
}

export function workflowCanvasCompiledManifestSourceGraphNodeId(
  manifest: Record<string, unknown> | null,
): string | null {
  return workflowCanvasRecordStringField(manifest, "source_graph_node_id");
}

export function workflowCanvasCompiledManifestAfpReadinessInfo(
  manifest: Record<string, unknown>,
): WorkflowCanvasCompiledManifestAfpReadinessInfo {
  const runtimeKind = workflowCanvasCompiledManifestRuntimeKind(manifest);
  const capabilityId = workflowCanvasCompiledManifestCapabilityId(manifest);
  const memoryConfig = isRecord(manifest.memory) ? manifest.memory : null;
  const traceConfig = isRecord(manifest.trace) ? manifest.trace : null;
  const memoryScope = workflowCanvasRecordStringField(memoryConfig, "scope");
  const traceSource = workflowCanvasRecordStringField(traceConfig, "source");
  const afpContract = compiledManifestAfpContract(runtimeKind, capabilityId);
  const afpGapKinds = compiledManifestAfpGapKinds(runtimeKind, capabilityId, memoryScope, traceSource);
  const manifestNodeId = workflowCanvasRecordStringField(manifest, "node_id");
  return {
    afpCategory: afpContract.category,
    afpGapKinds,
    manifestNodeId,
    ready: afpContract.category !== "orchestration_scaffold" && afpGapKinds.length === 0 && Boolean(manifestNodeId),
  };
}

export function workflowCanvasCompiledReadyManifestIds(
  manifests: Record<string, unknown>[],
): Set<string> {
  return new Set(
    manifests
      .map((manifest) => workflowCanvasCompiledManifestAfpReadinessInfo(manifest))
      .filter((info) => info.ready && info.manifestNodeId)
      .map((info) => info.manifestNodeId as string),
  );
}

export function workflowCanvasCompiledRouteEndpointIds(
  entry: Record<string, unknown>,
): WorkflowCanvasCompiledRouteEndpointIds {
  return {
    fromManifestNodeId: workflowCanvasRecordStringField(entry, "from_manifest_node_id"),
    routeLabel: workflowCanvasRecordStringField(entry, "route_label"),
    toManifestNodeId: workflowCanvasRecordStringField(entry, "to_manifest_node_id"),
  };
}

export function workflowCanvasCompiledRouteFocusTarget(
  entry: Record<string, unknown>,
): string | null {
  const { fromManifestNodeId, routeLabel, toManifestNodeId } = workflowCanvasCompiledRouteEndpointIds(entry);
  return fromManifestNodeId && toManifestNodeId
    ? `${fromManifestNodeId}:${toManifestNodeId}:${routeLabel ?? "default"}`
    : null;
}

export function workflowCanvasCompiledReadyHandoffEntries(
  compiledEdges: Record<string, unknown>[],
  readyManifestIds: Set<string>,
): Record<string, unknown>[] {
  return compiledEdges.filter((entry) => {
    const { fromManifestNodeId, toManifestNodeId } = workflowCanvasCompiledRouteEndpointIds(entry);
    return Boolean(
      fromManifestNodeId
        && toManifestNodeId
        && readyManifestIds.has(fromManifestNodeId)
        && readyManifestIds.has(toManifestNodeId),
    );
  });
}

export function workflowCanvasCompiledReadyHandoffManifestIds(
  compiledEdges: Record<string, unknown>[],
  readyManifestIds: Set<string>,
): Set<string> {
  return new Set(
    workflowCanvasCompiledReadyHandoffEntries(compiledEdges, readyManifestIds).flatMap((entry) => {
      const { fromManifestNodeId, toManifestNodeId } = workflowCanvasCompiledRouteEndpointIds(entry);
      return [fromManifestNodeId, toManifestNodeId].filter((value): value is string => Boolean(value));
    }),
  );
}

export function workflowCanvasCompiledReadinessManifestCount(args: {
  manifests: Record<string, unknown>[];
  readinessFocus: CompiledAfpReadinessFocus | null;
  readyHandoffManifestIds: Set<string>;
  readyManifestIds: Set<string>;
}): number {
  return args.manifests.filter((manifest) => {
    const { afpCategory, afpGapKinds, manifestNodeId } = workflowCanvasCompiledManifestAfpReadinessInfo(manifest);
    return compiledManifestMatchesAfpReadinessFocus(args.readinessFocus, {
      manifestNodeId,
      readyManifestIds: args.readyManifestIds,
      readyHandoffManifestIds: args.readyHandoffManifestIds,
      afpGapKinds,
      afpCategory,
    });
  }).length;
}

export function workflowCanvasCompiledReadinessReviewData(
  manifests: Record<string, unknown>[],
  compiledEdges: Record<string, unknown>[],
): WorkflowCanvasCompiledReadinessReviewData {
  const readyManifestIds = workflowCanvasCompiledReadyManifestIds(manifests);
  return {
    readyHandoffEntries: workflowCanvasCompiledReadyHandoffEntries(compiledEdges, readyManifestIds),
    readyHandoffManifestIds: workflowCanvasCompiledReadyHandoffManifestIds(compiledEdges, readyManifestIds),
    readyManifestIds,
  };
}

export function workflowCanvasFirstAfpReadyManifestSourceNodeId(
  manifests: Record<string, unknown>[],
  readyManifestIds: Set<string>,
): string | null {
  return workflowCanvasCompiledManifestSourceGraphNodeId(
    manifests.find((manifest) => {
      const manifestNodeId = workflowCanvasRecordStringField(manifest, "node_id");
      return Boolean(
        manifestNodeId
        && readyManifestIds.has(manifestNodeId)
        && workflowCanvasCompiledManifestSourceGraphNodeId(manifest),
      );
    }) ?? null,
  );
}

export function workflowCanvasFirstAfpContractWorkSourceNodeId(
  manifests: Record<string, unknown>[],
): string | null {
  return workflowCanvasCompiledManifestSourceGraphNodeId(
    manifests.find((manifest) => {
      const { afpCategory, afpGapKinds } = workflowCanvasCompiledManifestAfpReadinessInfo(manifest);
      return Boolean(workflowCanvasCompiledManifestSourceGraphNodeId(manifest))
        && (afpCategory === "orchestration_scaffold" || afpGapKinds.length > 0);
    }) ?? null,
  );
}

export function workflowCanvasFirstAfpReadyHandoffRouteTarget(
  compiledEdges: Record<string, unknown>[],
  readyManifestIds: Set<string>,
): string | null {
  return compiledEdges
    .map((entry) => {
      const { fromManifestNodeId, toManifestNodeId } = workflowCanvasCompiledRouteEndpointIds(entry);
      if (!fromManifestNodeId || !toManifestNodeId) return null;
      if (!readyManifestIds.has(fromManifestNodeId) || !readyManifestIds.has(toManifestNodeId)) return null;
      return workflowCanvasCompiledRouteFocusTarget(entry);
    })
    .find((target): target is string => Boolean(target)) ?? null;
}

export function workflowCanvasFirstLinkedManifestSourceNodeId(
  manifests: Record<string, unknown>[],
): string | null {
  return manifests
    .map(workflowCanvasCompiledManifestSourceGraphNodeId)
    .find((nodeId): nodeId is string => Boolean(nodeId)) ?? null;
}

export function workflowCanvasCompiledManifestByNodeId(
  manifests: Record<string, unknown>[],
  nodeId: string,
): Record<string, unknown> | null {
  return manifests.find((manifest) => manifest.source_graph_node_id === nodeId) ?? null;
}

export function workflowCanvasCompiledManifestByManifestNodeId(
  manifests: Record<string, unknown>[],
  manifestNodeId: string | null,
): Record<string, unknown> | null {
  return manifestNodeId
    ? manifests.find((manifest) => manifest.node_id === manifestNodeId) ?? null
    : null;
}

export function workflowCanvasCompiledRouteManifestPair(
  entry: Record<string, unknown>,
  manifests: Record<string, unknown>[],
): WorkflowCanvasCompiledRouteManifestPair {
  const { fromManifestNodeId, routeLabel, toManifestNodeId } = workflowCanvasCompiledRouteEndpointIds(entry);
  return {
    fromManifest: workflowCanvasCompiledManifestByManifestNodeId(manifests, fromManifestNodeId),
    fromManifestNodeId,
    routeLabel,
    toManifest: workflowCanvasCompiledManifestByManifestNodeId(manifests, toManifestNodeId),
    toManifestNodeId,
  };
}

export function workflowCanvasCompiledManifestMatchesOrchestrationRole(
  manifest: Record<string, unknown> | null,
  role: CompiledOrchestrationRole | null,
): boolean {
  return Boolean(
    role
      && manifest
      && compiledManifestOrchestrationRole(
        workflowCanvasCompiledManifestRuntimeKind(manifest),
        workflowCanvasCompiledManifestCapabilityId(manifest),
      ).role === role,
  );
}

export function workflowCanvasFirstOrchestrationRoleSourceNodeId(
  manifests: Record<string, unknown>[],
  role: CompiledOrchestrationRole | null,
): string | null {
  return workflowCanvasCompiledManifestSourceGraphNodeId(
    role
      ? manifests.find((manifest) =>
          workflowCanvasCompiledManifestMatchesOrchestrationRole(manifest, role)
          && Boolean(workflowCanvasCompiledManifestSourceGraphNodeId(manifest)),
        ) ?? null
      : null,
  );
}

export function workflowCanvasCompiledNodeManifestState(args: {
  latestManifests: Record<string, unknown>[];
  nodeId: string;
}): WorkflowCanvasCompiledNodeManifestState {
  const compiledManifest = workflowCanvasCompiledManifestByNodeId(args.latestManifests, args.nodeId);
  const compiledRuntimeKind = workflowCanvasCompiledManifestRuntimeKind(compiledManifest);
  const compiledManifestNodeId = workflowCanvasRecordStringField(compiledManifest, "node_id");
  const compiledCapabilityId = workflowCanvasCompiledManifestCapabilityId(compiledManifest);
  const compiledMemoryScope = workflowCanvasRecordStringField(compiledManifest, "memory_scope");
  const compiledConnectorBinding = workflowCanvasCompiledManifestConnectorBinding(compiledManifest);
  const compiledTraceSource = workflowCanvasRecordStringField(compiledConnectorBinding, "trace_source");
  const compiledAfpContract = compiledManifestAfpContract(compiledRuntimeKind, compiledCapabilityId);
  return {
    compiledAfpContract,
    compiledAfpGapKinds: compiledManifestAfpGapKinds(
      compiledRuntimeKind,
      compiledCapabilityId,
      compiledMemoryScope,
      compiledTraceSource,
    ),
    compiledManifest,
    compiledManifestNodeId,
    compiledOrchestrationRole: compiledManifestOrchestrationRole(compiledRuntimeKind, compiledCapabilityId),
    compiledRuntimeKind,
  };
}

export function workflowCanvasCompiledRouteGraphEdgeId(args: {
  entry: Record<string, unknown>;
  graphEdges: WorkflowEdgeDraft[];
  manifests: Record<string, unknown>[];
}): string | null {
  const { fromManifest, routeLabel, toManifest } = workflowCanvasCompiledRouteManifestPair(
    args.entry,
    args.manifests,
  );
  const sourceNodeId = workflowCanvasCompiledManifestSourceGraphNodeId(fromManifest);
  const targetNodeId = workflowCanvasCompiledManifestSourceGraphNodeId(toManifest);
  if (!sourceNodeId || !targetNodeId) return null;
  return args.graphEdges.find(
    (graphEdge) => graphEdge.source === sourceNodeId
      && graphEdge.target === targetNodeId
      && (graphEdge.condition_label ?? null) === routeLabel,
  )?.id ?? null;
}

export function workflowCanvasCompiledOrchestrationRoleRouteStats(args: {
  compiledEdges: Record<string, unknown>[];
  graphEdges: WorkflowEdgeDraft[];
  manifests: Record<string, unknown>[];
  role: CompiledOrchestrationRole | null;
}): WorkflowCanvasOrchestrationRouteStats {
  const focusedEdges = !args.role
    ? []
    : args.compiledEdges.filter((entry) => {
        const {
          fromManifest,
          fromManifestNodeId,
          toManifest,
          toManifestNodeId,
        } = workflowCanvasCompiledRouteManifestPair(entry, args.manifests);
        if (!fromManifestNodeId || !toManifestNodeId) return false;
        return workflowCanvasCompiledManifestMatchesOrchestrationRole(fromManifest, args.role)
          || workflowCanvasCompiledManifestMatchesOrchestrationRole(toManifest, args.role);
      });
  const graphLinkedRouteCount = focusedEdges.filter((entry) =>
    Boolean(workflowCanvasCompiledRouteGraphEdgeId({
      entry,
      graphEdges: args.graphEdges,
      manifests: args.manifests,
    })),
  ).length;
  const focusedRouteCount = focusedEdges.length;
  return {
    focusedRouteCount,
    graphLinkedRouteCount,
    inspectorOnlyRouteCount: Math.max(0, focusedRouteCount - graphLinkedRouteCount),
  };
}

export function workflowCanvasCompiledReadyHandoffGraphEdgeIds(args: {
  compiledEdges: Record<string, unknown>[];
  graphEdges: WorkflowEdgeDraft[];
  latestManifests: Record<string, unknown>[];
  readyManifestIds: Set<string>;
}): Set<string> {
  return new Set(
    workflowCanvasCompiledReadyHandoffEntries(args.compiledEdges, args.readyManifestIds)
      .map((entry) => workflowCanvasCompiledRouteGraphEdgeId({
        entry,
        graphEdges: args.graphEdges,
        manifests: args.latestManifests,
      }))
      .filter((edgeId): edgeId is string => Boolean(edgeId)),
  );
}

export function workflowCanvasCompiledEdgeReviewData(args: {
  graphEdges: WorkflowEdgeDraft[];
  latestEdges: Record<string, unknown>[];
  latestManifests: Record<string, unknown>[];
  readinessReviewData?: WorkflowCanvasCompiledReadinessReviewData;
}): WorkflowCanvasCompiledEdgeReviewData {
  const readinessReviewData = args.readinessReviewData
    ?? workflowCanvasCompiledReadinessReviewData(args.latestManifests, args.latestEdges);
  return {
    ...readinessReviewData,
    readyHandoffGraphEdgeIds: workflowCanvasCompiledReadyHandoffGraphEdgeIds({
      compiledEdges: args.latestEdges,
      graphEdges: args.graphEdges,
      latestManifests: args.latestManifests,
      readyManifestIds: readinessReviewData.readyManifestIds,
    }),
  };
}

export function workflowCanvasCompiledReviewContext(args: {
  activeAfpFilter: string | null;
  activeAfpGapFilter: CompiledAfpGapFilter | null;
  activeAfpReadinessFocus: CompiledAfpReadinessFocus | null;
  activeAfpRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  activeManifestLinkageFilter: WorkflowCanvasManifestLinkageFocus | null;
  activeOrchestrationRole: CompiledOrchestrationRole | null;
  activeRouteLinkageFilter: WorkflowCanvasRouteLinkageFocus | null;
  graphEdges: WorkflowEdgeDraft[];
  latestEdges: Record<string, unknown>[];
  latestManifests: Record<string, unknown>[];
}): WorkflowCanvasCompiledReviewContext {
  const readinessReviewData = workflowCanvasCompiledReadinessReviewData(args.latestManifests, args.latestEdges);
  return {
    activeAfpFilter: args.activeAfpFilter,
    activeAfpGapFilter: args.activeAfpGapFilter,
    activeAfpReadinessFocus: args.activeAfpReadinessFocus,
    activeAfpRouteFocus: args.activeAfpRouteFocus,
    activeManifestLinkageFilter: args.activeManifestLinkageFilter,
    activeOrchestrationRole: args.activeOrchestrationRole,
    activeRouteLinkageFilter: args.activeRouteLinkageFilter,
    edgeReviewData: workflowCanvasCompiledEdgeReviewData({
      graphEdges: args.graphEdges,
      latestEdges: args.latestEdges,
      latestManifests: args.latestManifests,
      readinessReviewData,
    }),
    latestEdges: args.latestEdges,
    latestManifests: args.latestManifests,
    readinessReviewData,
  };
}

export function workflowCanvasCompiledAfpMatchingNodeIds(args: {
  activeAfpFilter: string | null;
  latestManifests: Record<string, unknown>[];
}): Set<string> | null {
  return !args.activeAfpFilter
    ? null
    : new Set(
        args.latestManifests
          .filter((manifest) => workflowCanvasCompiledManifestAfpCategory(manifest) === args.activeAfpFilter)
          .map(workflowCanvasCompiledManifestSourceGraphNodeId)
          .filter((nodeId): nodeId is string => Boolean(nodeId)),
      );
}

export function workflowCanvasCompiledFocusOverlayMatchingNodeIds(args: {
  activeAfpFilter: string | null;
  activeManifestLinkageFilter: WorkflowCanvasManifestLinkageFocus | null;
  latestManifests: Record<string, unknown>[];
}): Set<string> {
  const linkedManifestNodeIds = new Set(
    args.latestManifests
      .map(workflowCanvasCompiledManifestSourceGraphNodeId)
      .filter((nodeId): nodeId is string => Boolean(nodeId)),
  );
  const afpMatchingNodeIds = workflowCanvasCompiledAfpMatchingNodeIds(args) ?? linkedManifestNodeIds;

  if (args.activeManifestLinkageFilter === "inspector_only") {
    return new Set();
  }
  if (args.activeManifestLinkageFilter !== "linked") {
    return afpMatchingNodeIds;
  }
  return new Set([...afpMatchingNodeIds].filter((nodeId) => linkedManifestNodeIds.has(nodeId)));
}

export function workflowCanvasCompiledEdgeReviewState(args: {
  graphEdges: WorkflowEdgeDraft[];
  reviewContext: WorkflowCanvasCompiledReviewContext;
}): WorkflowCanvasCompiledEdgeReviewState {
  return {
    activeAfpFilter: args.reviewContext.activeAfpFilter,
    activeAfpReadinessFocus: args.reviewContext.activeAfpReadinessFocus,
    activeAfpRouteFocus: args.reviewContext.activeAfpRouteFocus,
    activeRouteLinkageFilter: args.reviewContext.activeRouteLinkageFilter,
    latestManifests: args.reviewContext.latestManifests,
    linkedGraphEdgeIds: workflowCanvasCompiledLinkedGraphEdgeIdsForFocus({
      activeAfpFilter: args.reviewContext.activeAfpFilter,
      activeRouteFocus: args.reviewContext.activeAfpRouteFocus,
      graphEdges: args.graphEdges,
      latestEdges: args.reviewContext.latestEdges,
      latestManifests: args.reviewContext.latestManifests,
    }),
    matchingNodeIds: workflowCanvasCompiledAfpMatchingNodeIds({
      activeAfpFilter: args.reviewContext.activeAfpFilter,
      latestManifests: args.reviewContext.latestManifests,
    }),
    readyHandoffGraphEdgeIds: args.reviewContext.edgeReviewData.readyHandoffGraphEdgeIds,
    readyManifestIds: args.reviewContext.edgeReviewData.readyManifestIds,
  };
}

export function workflowCanvasCompiledNodeReviewState(
  reviewContext: WorkflowCanvasCompiledReviewContext,
): WorkflowCanvasCompiledNodeReviewState {
  return {
    activeAfpFilter: reviewContext.activeAfpFilter,
    activeAfpGapFilter: reviewContext.activeAfpGapFilter,
    activeAfpReadinessFocus: reviewContext.activeAfpReadinessFocus,
    activeAfpRouteFocus: reviewContext.activeAfpRouteFocus,
    activeManifestLinkageFilter: reviewContext.activeManifestLinkageFilter,
    activeOrchestrationRole: reviewContext.activeOrchestrationRole,
    latestManifests: reviewContext.latestManifests,
    readyHandoffManifestIds: reviewContext.readinessReviewData.readyHandoffManifestIds,
    readyManifestIds: reviewContext.readinessReviewData.readyManifestIds,
  };
}

export function workflowCanvasGraphReviewState<TGraphDraft extends {
  edges: WorkflowEdgeDraft[];
  nodes: WorkflowNodeDraft[];
}>(args: {
  graphDraft: TGraphDraft;
  reviewContext: WorkflowCanvasCompiledReviewContext;
}): WorkflowCanvasGraphReviewState<TGraphDraft> {
  const graphEdges = args.graphDraft.edges;
  return {
    edgeReviewState: workflowCanvasCompiledEdgeReviewState({
      graphEdges,
      reviewContext: args.reviewContext,
    }),
    graphDraft: args.graphDraft,
    graphEdges,
    graphNodes: args.graphDraft.nodes,
    nodeReviewState: workflowCanvasCompiledNodeReviewState(args.reviewContext),
    reviewContext: args.reviewContext,
  };
}

export function workflowCanvasCompiledLinkedGraphEdgeIdsForFocus(args: {
  activeAfpFilter: string | null;
  activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  graphEdges: WorkflowEdgeDraft[];
  latestEdges: Record<string, unknown>[];
  latestManifests: Record<string, unknown>[];
}): Set<string> {
  return new Set(
    args.latestEdges
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry) => {
        const { fromManifest, toManifest } = workflowCanvasCompiledRouteManifestPair(entry, args.latestManifests);
        const sourceNodeId = workflowCanvasCompiledManifestSourceGraphNodeId(fromManifest);
        const targetNodeId = workflowCanvasCompiledManifestSourceGraphNodeId(toManifest);
        const sourceMatches = !args.activeAfpFilter || workflowCanvasCompiledManifestAfpCategory(fromManifest) === args.activeAfpFilter;
        const targetMatches = !args.activeAfpFilter || workflowCanvasCompiledManifestAfpCategory(toManifest) === args.activeAfpFilter;
        if (!workflowCanvasRouteMatchesAfpFocus({
          hasAfpFilter: Boolean(args.activeAfpFilter),
          routeFocus: args.activeRouteFocus,
          sourceMatches,
          targetMatches,
        })) return null;
        if (!sourceNodeId || !targetNodeId) return null;
        return workflowCanvasCompiledRouteGraphEdgeId({
          entry,
          graphEdges: args.graphEdges,
          manifests: args.latestManifests,
        });
      })
      .filter((edgeId): edgeId is string => Boolean(edgeId)),
  );
}

export function workflowCanvasFirstCompiledRouteFocusTargetForRail(args: {
  activeAfpFilter: string | null;
  activeLinkageFocus: WorkflowCanvasRouteLinkageFocus | null;
  activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  compiledEdges: Record<string, unknown>[];
  graphEdges: WorkflowEdgeDraft[];
  manifests: Record<string, unknown>[];
}): string | null {
  const matchingManifestNodeIds = !args.activeAfpFilter
    ? null
    : new Set(
        args.manifests
          .filter((manifest) => workflowCanvasCompiledManifestAfpCategory(manifest) === args.activeAfpFilter)
          .map((manifest) => typeof manifest.node_id === "string" ? manifest.node_id : null)
          .filter((nodeId): nodeId is string => Boolean(nodeId)),
      );
  return args.compiledEdges
    .map((entry) => {
      const { fromManifestNodeId, toManifestNodeId } = workflowCanvasCompiledRouteManifestPair(entry, args.manifests);
      if (!fromManifestNodeId || !toManifestNodeId) return null;
      const sourceMatchesAfp = !matchingManifestNodeIds || matchingManifestNodeIds.has(fromManifestNodeId);
      const targetMatchesAfp = !matchingManifestNodeIds || matchingManifestNodeIds.has(toManifestNodeId);
      const graphLinked = Boolean(workflowCanvasCompiledRouteGraphEdgeId({
        entry,
        graphEdges: args.graphEdges,
        manifests: args.manifests,
      }));
      if (!workflowCanvasRouteMatchesAfpFocus({
        hasAfpFilter: Boolean(args.activeAfpFilter),
        routeFocus: args.activeRouteFocus,
        sourceMatches: sourceMatchesAfp,
        targetMatches: targetMatchesAfp,
      })) return null;
      if (args.activeLinkageFocus === "linked" && !graphLinked) return null;
      if (args.activeLinkageFocus === "manifest_only" && graphLinked) return null;
      return workflowCanvasCompiledRouteFocusTarget(entry);
    })
    .find((target): target is string => Boolean(target)) ?? null;
}

export function workflowCanvasReviewRailTargetState(args: {
  activeAfpFilter: string | null;
  activeEdgeId: string | null;
  activeLinkageFocus: WorkflowCanvasRouteLinkageFocus | null;
  activeOrchestrationRoleFocus: CompiledOrchestrationRole | null;
  activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  compiledEdges: Record<string, unknown>[];
  edgeStates: Map<string, EdgeExecutionState>;
  graphEdges: WorkflowEdgeDraft[];
  manifests: Record<string, unknown>[];
  readyManifestIds: Set<string>;
}): WorkflowCanvasReviewRailTargetState {
  const firstCompiledRouteFocusTarget = workflowCanvasFirstCompiledRouteFocusTargetForRail({
    activeAfpFilter: args.activeAfpFilter,
    activeLinkageFocus: args.activeLinkageFocus,
    activeRouteFocus: args.activeRouteFocus,
    compiledEdges: args.compiledEdges,
    graphEdges: args.graphEdges,
    manifests: args.manifests,
  });
  const firstReviewedEdge = args.graphEdges.find((edge) => args.edgeStates.has(edge.id)) ?? null;
  return {
    branchRailFocusAvailable: Boolean(args.activeEdgeId || firstReviewedEdge),
    firstAfpContractWorkSourceNodeId: workflowCanvasFirstAfpContractWorkSourceNodeId(args.manifests),
    firstAfpReadyHandoffTarget: workflowCanvasFirstAfpReadyHandoffRouteTarget(args.compiledEdges, args.readyManifestIds),
    firstAfpReadyManifestSourceNodeId: workflowCanvasFirstAfpReadyManifestSourceNodeId(args.manifests, args.readyManifestIds),
    firstCompiledRouteFocusTarget,
    firstLinkedManifestNodeId: workflowCanvasFirstLinkedManifestSourceNodeId(args.manifests),
    firstOrchestrationRoleNodeId: workflowCanvasFirstOrchestrationRoleSourceNodeId(
      args.manifests,
      args.activeOrchestrationRoleFocus,
    ),
    firstReviewedEdge,
  };
}

export function workflowCanvasReviewRailState<TClearAction, TPrimaryFocus>(args: {
  activeAfpReadinessFocus: CompiledAfpReadinessFocus | null;
  activeEdgeId: string | null;
  activeLinkageFocus: WorkflowCanvasRouteLinkageFocus | null;
  activeManifestLinkageFocus: WorkflowCanvasManifestLinkageFocus | null;
  activeOrchestrationRoleFocus: CompiledOrchestrationRole | null;
  activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  activeRun: WorkflowRun | null;
  branchLegendStates: EdgeExecutionState[];
  clearActionItemsFor: (input: {
    activeAfpReadinessFocus: CompiledAfpReadinessFocus | null;
    activeLinkageFocus: WorkflowCanvasRouteLinkageFocus | null;
    activeManifestLinkageFocus: WorkflowCanvasManifestLinkageFocus | null;
    activeOrchestrationRoleFocus: CompiledOrchestrationRole | null;
    activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
    branchRailFocusAvailable: boolean;
    branchReviewActive: boolean;
    firstReviewedEdge: WorkflowEdgeDraft | null;
    selectedEdgeId: string | null;
  }) => TClearAction[];
  edgeStates: Map<string, EdgeExecutionState>;
  graphReviewState: WorkflowCanvasGraphReviewState<WorkflowGraphDraft>;
  primaryFocusFor: (input: {
    activeAfpReadinessFocus: CompiledAfpReadinessFocus | null;
    activeEdgeId: string | null;
    activeLinkageFocus: WorkflowCanvasRouteLinkageFocus | null;
    activeManifestLinkageFocus: WorkflowCanvasManifestLinkageFocus | null;
    activeOrchestrationRoleFocus: CompiledOrchestrationRole | null;
    activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
    branchReviewActive: boolean;
    firstAfpContractWorkSourceNodeId: string | null;
    firstAfpReadyHandoffTarget: string | null;
    firstAfpReadyManifestSourceNodeId: string | null;
    firstCompiledRouteFocusTarget: string | null;
    firstLinkedManifestNodeId: string | null;
    firstOrchestrationRoleNodeId: string | null;
    firstReviewedEdge: WorkflowEdgeDraft | null;
    graphEdges: WorkflowEdgeDraft[];
  }) => TPrimaryFocus | null;
  topOffsetClass: string;
}): WorkflowCanvasReviewRailState<TClearAction, TPrimaryFocus> {
  const graphEdges = args.graphReviewState.graphEdges;
  const reviewContext = args.graphReviewState.reviewContext;
  const manifests = reviewContext.latestManifests;
  const compiledEdges = reviewContext.latestEdges;
  const readinessReviewData = reviewContext.readinessReviewData;
  const activeAfpFilter = reviewContext.activeAfpFilter;
  const branchReviewActive = Boolean(args.activeRun && args.branchLegendStates.length > 0);
  const railTargetState = workflowCanvasReviewRailTargetState({
    activeAfpFilter,
    activeEdgeId: args.activeEdgeId,
    activeLinkageFocus: args.activeLinkageFocus,
    activeOrchestrationRoleFocus: args.activeOrchestrationRoleFocus,
    activeRouteFocus: args.activeRouteFocus,
    compiledEdges,
    edgeStates: args.edgeStates,
    graphEdges,
    manifests,
    readyManifestIds: readinessReviewData.readyManifestIds,
  });
  const primaryRailFocus = args.primaryFocusFor({
    activeAfpReadinessFocus: args.activeAfpReadinessFocus,
    activeEdgeId: args.activeEdgeId,
    activeLinkageFocus: args.activeLinkageFocus,
    activeManifestLinkageFocus: args.activeManifestLinkageFocus,
    activeOrchestrationRoleFocus: args.activeOrchestrationRoleFocus,
    activeRouteFocus: args.activeRouteFocus,
    branchReviewActive,
    firstAfpContractWorkSourceNodeId: railTargetState.firstAfpContractWorkSourceNodeId,
    firstAfpReadyHandoffTarget: railTargetState.firstAfpReadyHandoffTarget,
    firstAfpReadyManifestSourceNodeId: railTargetState.firstAfpReadyManifestSourceNodeId,
    firstCompiledRouteFocusTarget: railTargetState.firstCompiledRouteFocusTarget,
    firstLinkedManifestNodeId: railTargetState.firstLinkedManifestNodeId,
    firstOrchestrationRoleNodeId: railTargetState.firstOrchestrationRoleNodeId,
    firstReviewedEdge: railTargetState.firstReviewedEdge,
    graphEdges,
  });
  const clearActionItems = args.clearActionItemsFor({
    activeAfpReadinessFocus: args.activeAfpReadinessFocus,
    activeLinkageFocus: args.activeLinkageFocus,
    activeManifestLinkageFocus: args.activeManifestLinkageFocus,
    activeOrchestrationRoleFocus: args.activeOrchestrationRoleFocus,
    activeRouteFocus: args.activeRouteFocus,
    branchRailFocusAvailable: railTargetState.branchRailFocusAvailable,
    branchReviewActive,
    firstReviewedEdge: railTargetState.firstReviewedEdge,
    selectedEdgeId: args.activeEdgeId,
  });
  return {
    activeAfpFilter,
    activeAfpReadinessFocus: args.activeAfpReadinessFocus,
    activeLinkageFocus: args.activeLinkageFocus,
    activeManifestLinkageFocus: args.activeManifestLinkageFocus,
    activeOrchestrationRoleFocus: args.activeOrchestrationRoleFocus,
    activeRouteFocus: args.activeRouteFocus,
    branchLegendStates: args.branchLegendStates,
    branchRailFocusAvailable: railTargetState.branchRailFocusAvailable,
    branchReviewActive,
    clearActionItems,
    compiledEdges,
    firstReviewedEdge: railTargetState.firstReviewedEdge,
    graphEdges,
    manifests,
    primaryRailFocus,
    readinessReviewData,
    showCombinedClearAction: Boolean(
      args.activeRouteFocus
      || args.activeOrchestrationRoleFocus
      || args.activeManifestLinkageFocus
      || args.activeLinkageFocus
      || args.activeAfpReadinessFocus
    ),
    showRail: workflowCanvasReviewRailVisible({
      activeAfpFilter,
      activeAfpReadinessFocus: args.activeAfpReadinessFocus,
      activeLinkageFocus: args.activeLinkageFocus,
      activeManifestLinkageFocus: args.activeManifestLinkageFocus,
      activeRouteFocus: args.activeRouteFocus,
      branchReviewActive,
    }),
    topOffsetClass: args.topOffsetClass,
  };
}

export function workflowCanvasReviewRailOrchestrationRouteState(args: {
  activeLinkageFocus: WorkflowCanvasRouteLinkageFocus | null;
  compiledEdges: Record<string, unknown>[];
  graphEdges: WorkflowEdgeDraft[];
  manifests: Record<string, unknown>[];
  orchestrationRole: CompiledOrchestrationRole | null;
}): WorkflowCanvasReviewRailOrchestrationRouteState {
  const routeStats = workflowCanvasCompiledOrchestrationRoleRouteStats({
    compiledEdges: args.compiledEdges,
    graphEdges: args.graphEdges,
    manifests: args.manifests,
    role: args.orchestrationRole,
  });
  return {
    activeRouteLinkageFocus: args.activeLinkageFocus,
    focusedRouteCount: routeStats.focusedRouteCount,
    graphLinkedRouteCount: routeStats.graphLinkedRouteCount,
    inspectorOnlyRouteCount: routeStats.inspectorOnlyRouteCount,
    inspectorOnlyRouteFocusButton: workflowCanvasRouteLinkageFocusButtonState("manifest_only", args.activeLinkageFocus),
    linkedRouteFocusButton: workflowCanvasRouteLinkageFocusButtonState("linked", args.activeLinkageFocus),
  };
}

export function workflowCanvasCompiledEdgeFocusState(args: {
  activeReadinessFocus: CompiledAfpReadinessFocus | null;
  activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  activeRouteLinkageFilter: WorkflowCanvasRouteLinkageFocus | null;
  edge: WorkflowEdgeDraft;
  latestManifests: Record<string, unknown>[];
  linkedGraphEdgeIds: Set<string>;
  matchingNodeIds: Set<string> | null;
  readyHandoffGraphEdgeIds: Set<string>;
  readyManifestIds: Set<string>;
}): WorkflowCanvasCompiledEdgeFocusState {
  const matchesAfp = !args.matchingNodeIds
    ? true
    : args.matchingNodeIds.has(args.edge.source) && args.matchingNodeIds.has(args.edge.target);
  const touchesAfp = !args.matchingNodeIds
    ? false
    : args.matchingNodeIds.has(args.edge.source) || args.matchingNodeIds.has(args.edge.target);
  const matchesRouteFocus = !args.activeRouteFocus
    ? true
    : args.activeRouteFocus === "full"
      ? matchesAfp
      : touchesAfp && !matchesAfp;
  const matchesLinkageFocus = !args.activeRouteLinkageFilter
    ? true
    : args.activeRouteLinkageFilter === "linked"
      ? args.linkedGraphEdgeIds.has(args.edge.id)
      : false;
  const readyHandoff = args.readyHandoffGraphEdgeIds.has(args.edge.id);
  const touchesReadiness = !args.activeReadinessFocus
    ? true
    : (() => {
        const sourceManifest = workflowCanvasCompiledManifestByNodeId(args.latestManifests, args.edge.source);
        const targetManifest = workflowCanvasCompiledManifestByNodeId(args.latestManifests, args.edge.target);
        const sourceManifestNodeId = workflowCanvasRecordStringField(sourceManifest, "node_id");
        const targetManifestNodeId = workflowCanvasRecordStringField(targetManifest, "node_id");
        if (args.activeReadinessFocus === "ready_manifests") {
          return Boolean(
            (sourceManifestNodeId && args.readyManifestIds.has(sourceManifestNodeId))
            || (targetManifestNodeId && args.readyManifestIds.has(targetManifestNodeId)),
          );
        }
        if (args.activeReadinessFocus === "ready_handoffs") return readyHandoff;
        return Boolean(
          (sourceManifestNodeId && !args.readyManifestIds.has(sourceManifestNodeId))
          || (targetManifestNodeId && !args.readyManifestIds.has(targetManifestNodeId)),
        );
      })();
  return {
    matchesAfp,
    matchesLinkageFocus,
    matchesRouteFocus,
    readyHandoff,
    touchesAfp,
    touchesReadiness,
  };
}

export function workflowCanvasCompiledNodeMatchState(args: {
  activeAfpFilter: string | null;
  activeGapFilter: CompiledAfpGapFilter | null;
  activeManifestLinkageFilter: WorkflowCanvasManifestLinkageFocus | null;
  activeOrchestrationRole: CompiledOrchestrationRole | null;
  activeReadinessFocus: CompiledAfpReadinessFocus | null;
  activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  afpCategory: ReturnType<typeof compiledManifestAfpContract>["category"];
  afpGapKinds: CompiledAfpGapFilter[];
  compiledManifest: Record<string, unknown> | null;
  compiledManifestNodeId: string | null;
  compiledOrchestrationRole: { role: CompiledOrchestrationRole | null };
  edges: WorkflowEdgeDraft[];
  latestManifests: Record<string, unknown>[];
  nodeId: string;
  readyHandoffManifestIds: Set<string>;
  readyManifestIds: Set<string>;
}): WorkflowCanvasCompiledNodeMatchState {
  const matchesAfp = !args.activeAfpFilter
    ? true
    : Boolean(args.compiledManifest) && args.afpCategory === args.activeAfpFilter;
  const matchesGap = !args.activeGapFilter
    ? true
    : Boolean(args.compiledManifest) && args.afpGapKinds.includes(args.activeGapFilter);
  const matchesOrchestrationRole = !args.activeOrchestrationRole
    ? true
    : Boolean(args.compiledManifest) && args.compiledOrchestrationRole.role === args.activeOrchestrationRole;
  const matchesManifestLinkage = !args.activeManifestLinkageFilter
    ? true
    : args.activeManifestLinkageFilter === "linked"
      ? Boolean(args.compiledManifest)
      : false;
  const matchesReadiness = compiledManifestMatchesAfpReadinessFocus(args.activeReadinessFocus, {
    manifestNodeId: args.compiledManifestNodeId,
    readyManifestIds: args.readyManifestIds,
    readyHandoffManifestIds: args.readyHandoffManifestIds,
    afpGapKinds: args.afpGapKinds,
    afpCategory: args.afpCategory,
  });
  const participatesInRouteFocus = !args.activeAfpFilter || !args.activeRouteFocus
    ? true
    : args.edges.some((edge) => {
        const sourceManifest = workflowCanvasCompiledManifestByNodeId(args.latestManifests, edge.source);
        const targetManifest = workflowCanvasCompiledManifestByNodeId(args.latestManifests, edge.target);
        const sourceMatches = Boolean(sourceManifest)
          && workflowCanvasCompiledManifestAfpCategory(sourceManifest) === args.activeAfpFilter;
        const targetMatches = Boolean(targetManifest)
          && workflowCanvasCompiledManifestAfpCategory(targetManifest) === args.activeAfpFilter;
        const routeMatches = workflowCanvasRouteMatchesAfpFocus({
          hasAfpFilter: Boolean(args.activeAfpFilter),
          routeFocus: args.activeRouteFocus,
          sourceMatches,
          targetMatches,
        });
        return routeMatches && (edge.source === args.nodeId || edge.target === args.nodeId);
      });
  return {
    matchesAfp,
    matchesGap,
    matchesManifestLinkage,
    matchesOrchestrationRole,
    matchesReadiness,
    participatesInRouteFocus,
  };
}

export function workflowCanvasCompiledNodeCanvasReviewState(args: {
  activeAfpFilter: string | null;
  activeGapFilter: CompiledAfpGapFilter | null;
  activeManifestLinkageFilter: WorkflowCanvasManifestLinkageFocus | null;
  activeOrchestrationRole: CompiledOrchestrationRole | null;
  activeReadinessFocus: CompiledAfpReadinessFocus | null;
  activeRouteFocus: WorkflowCanvasAfpRouteFocus | null;
  graphEdges: WorkflowEdgeDraft[];
  latestManifests: Record<string, unknown>[];
  nodeId: string;
  readyHandoffManifestIds: Set<string>;
  readyManifestIds: Set<string>;
}): WorkflowCanvasCompiledNodeCanvasReviewState {
  const manifestState = workflowCanvasCompiledNodeManifestState({
    latestManifests: args.latestManifests,
    nodeId: args.nodeId,
  });
  const {
    compiledAfpContract,
    compiledAfpGapKinds,
    compiledManifest,
    compiledManifestNodeId,
    compiledOrchestrationRole,
    compiledRuntimeKind,
  } = manifestState;
  const matches = workflowCanvasCompiledNodeMatchState({
    activeAfpFilter: args.activeAfpFilter,
    activeGapFilter: args.activeGapFilter,
    activeManifestLinkageFilter: args.activeManifestLinkageFilter,
    activeOrchestrationRole: args.activeOrchestrationRole,
    activeReadinessFocus: args.activeReadinessFocus,
    activeRouteFocus: args.activeRouteFocus,
    afpCategory: compiledAfpContract.category,
    afpGapKinds: compiledAfpGapKinds,
    compiledManifest,
    compiledManifestNodeId,
    compiledOrchestrationRole,
    edges: args.graphEdges,
    latestManifests: args.latestManifests,
    nodeId: args.nodeId,
    readyHandoffManifestIds: args.readyHandoffManifestIds,
    readyManifestIds: args.readyManifestIds,
  });
  const {
    matchesAfp,
    matchesGap,
    matchesManifestLinkage,
    matchesOrchestrationRole,
    matchesReadiness,
    participatesInRouteFocus,
  } = matches;
  const reviewVisualState = workflowCanvasCompiledNodeReviewVisualState({
    activeAfpFilter: args.activeAfpFilter,
    activeGapFilter: args.activeGapFilter,
    activeManifestLinkageFilter: args.activeManifestLinkageFilter,
    activeOrchestrationRole: args.activeOrchestrationRole,
    activeReadinessFocus: args.activeReadinessFocus,
    activeRouteFocus: args.activeRouteFocus,
    compiledManifest,
    compiledOrchestrationRole,
    matchesAfp,
    matchesGap,
    matchesManifestLinkage,
    matchesOrchestrationRole,
    matchesReadiness,
    participatesInRouteFocus,
  });
  return {
    afpFilterOverlayClass: reviewVisualState.afpFilterOverlayClass,
    afpFilterOverlayLabel: reviewVisualState.afpFilterOverlayLabel,
    compiledAfpContract,
    compiledFocusClass: reviewVisualState.compiledFocusClass,
    compiledManifest,
    compiledManifestNodeId,
    compiledRuntimeKind,
    readinessFocusChipClass: workflowCanvasCompiledAfpReadinessFocusChipClass(args.activeReadinessFocus),
    showCompiledAfpGapFocus: Boolean(args.activeGapFilter && matchesGap),
    showCompiledAfpReadinessFocus: Boolean(args.activeReadinessFocus && matchesReadiness),
    showCompiledInspectorOnlyFocus: args.activeManifestLinkageFilter === "inspector_only",
    showCompiledLinkedManifestFocus: args.activeManifestLinkageFilter === "linked" && matchesManifestLinkage,
    showCompiledOrchestrationRoleFocus: Boolean(args.activeOrchestrationRole && matchesOrchestrationRole),
    showCompiledRouteReviewFocus: Boolean(args.activeAfpFilter && args.activeRouteFocus && participatesInRouteFocus),
  };
}

export function workflowCanvasPaletteState<TSemanticStarter extends { id: string; label: string }>(args: {
  filter: string;
  presets: readonly string[];
  primitives: readonly string[];
  semanticStarters: readonly TSemanticStarter[];
}): WorkflowCanvasPaletteState<TSemanticStarter> {
  const query = args.filter.toLowerCase();
  return {
    presetItems: args.presets.filter((preset) => !query || preset.includes(query)),
    primitiveItems: args.primitives.filter((kind) => !query || kind.includes(query)),
    query,
    semanticStarterItems: args.semanticStarters.filter((starter) => (
      !query || starter.label.toLowerCase().includes(query)
    )),
  };
}

export function workflowCanvasFamilyContextState(args: {
  asset: WorkflowCanvasFamilyAssetRecord;
  draftTitle: string;
  instance: WorkflowCanvasFamilyInstanceRecord;
}): WorkflowCanvasFamilyContextState {
  const { asset, draftTitle, instance } = args;
  return {
    asset,
    assetHasParameters: (asset?.parameter_schema.length ?? 0) > 0,
    assetLabel: asset?.family_label ?? draftTitle,
    canPromoteAsset: !asset,
    instance,
    instanceHasAsset: Boolean(asset),
    instanceLabel: instance?.family_label ?? "Derived from family asset",
    show: Boolean(asset || instance),
  };
}

export function workflowCanvasVisibleFamilyContextState(
  state: WorkflowCanvasFamilyContextState,
): WorkflowCanvasFamilyContextState | null {
  return state.show ? state : null;
}

export function workflowCanvasVisiblePromoteFamilyAssetState(
  state: WorkflowCanvasFamilyContextState,
): WorkflowCanvasFamilyContextState | null {
  return state.canPromoteAsset ? state : null;
}

export function workflowCanvasSummaryState(args: {
  deploymentCount: number;
  description?: string | null;
  edgeCount: number;
  hasCompiledContract: boolean;
  nodeCount: number;
  previewOnlyTriggerContract: boolean;
  title: string;
}): WorkflowCanvasSummaryState {
  const deployCountLabel = `${args.deploymentCount} deploys`;
  return {
    deployStatusLabel: !args.hasCompiledContract
      ? deployCountLabel
      : args.previewOnlyTriggerContract
        ? "trigger preview-only"
        : deployCountLabel,
    description: args.description ?? "No description yet.",
    edgeCount: args.edgeCount,
    irStatusLabel: !args.hasCompiledContract
      ? "Pending"
      : args.previewOnlyTriggerContract
        ? "Compiled preview"
        : "Compiled",
    nodeCount: args.nodeCount,
    title: args.title,
  };
}

export function workflowCanvasBranchOriginState(args: {
  branchCount: number;
  origin: WorkflowCanvasBranchOriginRecord | null;
  selectedWorkflowId: string | null;
  siblings: SavedWorkflow[];
  visibleLimit?: number;
}): WorkflowCanvasBranchOriginState {
  const visibleLimit = args.visibleLimit ?? 6;
  const hiddenSiblingCount = Math.max(args.siblings.length - visibleLimit, 0);
  return {
    branchCount: args.branchCount,
    hasSiblings: args.siblings.length > 0,
    hiddenSiblingCount,
    origin: args.origin,
    selectedWorkflowId: args.selectedWorkflowId,
    siblings: args.siblings,
    visibleSiblings: args.siblings.slice(0, visibleLimit),
  };
}

export function workflowCanvasVisibleBranchOriginState(
  state: WorkflowCanvasBranchOriginState,
): (WorkflowCanvasBranchOriginState & { origin: WorkflowCanvasBranchOriginRecord }) | null {
  const { origin } = state;
  if (!origin) return null;
  return {
    ...state,
    origin,
  };
}

export function workflowCanvasHeaderState(runEta: string | null): WorkflowCanvasHeaderState {
  return { runEta };
}

export function workflowCanvasEmptyState(args: {
  busyAction: string | null;
  graph: Pick<WorkflowGraphDraft, "nodes"> | null;
}): WorkflowCanvasEmptyState {
  return {
    show: (args.graph?.nodes ?? []).length === 0 && !args.busyAction,
  };
}

export function workflowCanvasSharedReviewBannerState(args: {
  summary: string[];
  visible: boolean;
}): WorkflowCanvasSharedReviewBannerState {
  return {
    summary: args.summary,
    visible: args.visible,
  };
}

export function workflowCanvasVisibleSharedReviewBannerState(
  state: WorkflowCanvasSharedReviewBannerState,
): WorkflowCanvasSharedReviewBannerState | null {
  return state.visible ? state : null;
}

export function workflowCanvasRunOverlayState(args: {
  nodePolicyDeltaCount: number;
  run: WorkflowRun | null;
}): WorkflowCanvasRunOverlayState {
  const { run } = args;
  if (!run) return null;
  const executionMode =
    typeof run.result?.execution_mode === "string" ? run.result.execution_mode : "live";
  return {
    durationLabel: formatDurationMs(run.result?.duration_ms),
    executionMode,
    nodePolicyDeltaCount: args.nodePolicyDeltaCount,
    nodePolicyDeltaLabel: `${args.nodePolicyDeltaCount} node policy delta${args.nodePolicyDeltaCount === 1 ? "" : "s"} highlighted`,
    timelineCount: Array.isArray(run.timeline) ? run.timeline.length : 0,
  };
}

export function workflowCanvasEdgeLegendStates(
  edgeStates: Iterable<EdgeExecutionState>,
): EdgeExecutionState[] {
  const states = new Set(edgeStates);
  return EDGE_LEGEND_ORDER.filter((state) => states.has(state));
}

export function workflowCanvasOverlayTopOffsetClass(activeAfpFilter: string | null): string {
  return activeAfpFilter ? "top-24" : "top-4";
}

export function workflowCanvasOverlayChromeState(args: {
  activeAfpFilter: string | null;
  interactionLockLabel: string | null;
  interactionLocked: boolean;
}): WorkflowCanvasOverlayChromeState {
  return {
    interactionLockLabel: args.interactionLockLabel,
    interactionLocked: args.interactionLocked,
    topOffsetClass: workflowCanvasOverlayTopOffsetClass(args.activeAfpFilter),
  };
}

export function workflowCanvasVisibleInteractionLockState(
  state: WorkflowCanvasOverlayChromeState,
): WorkflowCanvasOverlayChromeState | null {
  return state.interactionLocked ? state : null;
}
