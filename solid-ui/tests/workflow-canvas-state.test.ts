import test from "node:test";
import assert from "node:assert/strict";

import type { WorkflowRun } from "../src/lib/api.ts";
import type {
  NodeDeploymentPolicy,
  PendingNodeDeploymentPolicy,
  WorkflowEdgeDraft,
  WorkflowNodeDraft,
} from "../src/lib/workflowGraphTypes.ts";
import {
  CANVAS_HORIZONTAL_RULER_MARKS,
  CANVAS_VERTICAL_RULER_LABEL_STYLE,
  CANVAS_VERTICAL_RULER_MARKS,
  COMPILED_FOCUS_ACTION_CLASS,
  EMPTY_CANVAS_AI_STARTER_ITEMS,
  EMPTY_CANVAS_TEMPLATE_ITEMS,
  NODE_CARD_CHIP_BASE_CLASS,
  NODE_CARD_CHIP_HOVER_CLASS,
  NODE_CARD_WHITE_CHIP_CLASS,
  REVIEW_CLEAR_ACTION_BASE_CLASS,
  REVIEW_CLEAR_ACTION_HOVER_CLASS,
  REVIEW_RAIL_PILL_BASE_CLASS,
  REVIEW_RAIL_PILL_HOVER_CLASS,
  WORKFLOW_CANVAS_FRAME_CLASS,
  WORKFLOW_CANVAS_SURFACE_CLASS,
  WORKFLOW_CONTEXT_SURFACE_CLASS,
  compactWorkflowCanvasSectionViews,
  workflowCanvasActionItems,
  workflowCanvasBottomControlSectionIds,
  workflowCanvasChromeSectionIds,
  workflowCanvasContextSectionIds,
  workflowCanvasAfpRouteClearActionView,
  workflowCanvasAfpReadinessClearActionView,
  workflowCanvasAfpRouteRailCopy,
  workflowCanvasAfpReadinessTone,
  workflowCanvasBranchFocusClearActionView,
  workflowCanvasBranchOriginState,
  workflowCanvasCompiledAfpReadinessFocusChipClass,
  workflowCanvasCompiledAfpMatchingNodeIds,
  workflowCanvasCompiledEdgeAfpOverlayLabel,
  workflowCanvasCompiledEdgeFocusState,
  workflowCanvasCompiledEdgeOpacity,
  workflowCanvasCompiledEdgeReviewData,
  workflowCanvasCompiledEdgeReadinessStroke,
  workflowCanvasCompiledEdgeAfpOverlayClass,
  workflowCanvasCompiledEdgeStroke,
  workflowCanvasCompiledFocusOverlayMatchingNodeIds,
  workflowCanvasCompiledFocusOverlayViewState,
  workflowCanvasCompiledManifestAfpCategory,
  workflowCanvasCompiledManifestAfpReadinessInfo,
  workflowCanvasCompiledManifestByNodeId,
  workflowCanvasCompiledManifestCapabilityId,
  workflowCanvasCompiledManifestMatchesOrchestrationRole,
  workflowCanvasCompiledManifestRuntimeKind,
  workflowCanvasCompiledManifestSourceGraphNodeId,
  workflowCanvasCompiledNodeCanvasReviewState,
  workflowCanvasCompiledNodeManifestState,
  workflowCanvasCompiledNodeMatchState,
  workflowCanvasCompiledNodeReviewVisualState,
  workflowCanvasCompiledOrchestrationRoleRouteStats,
  workflowCanvasCompiledEdgeReviewState,
  workflowCanvasCompiledNodeReviewState,
  workflowCanvasCompiledReadinessManifestCount,
  workflowCanvasCompiledReadinessReviewData,
  workflowCanvasCompiledReadyHandoffGraphEdgeIds,
  workflowCanvasCompiledReadyHandoffEntries,
  workflowCanvasCompiledReadyHandoffManifestIds,
  workflowCanvasCompiledReadyManifestIds,
  workflowCanvasCompiledLinkedGraphEdgeIdsForFocus,
  workflowCanvasCompiledRouteEndpointIds,
  workflowCanvasCompiledRouteFocusTarget,
  workflowCanvasCompiledRouteGraphEdgeId,
  workflowCanvasCompiledRouteManifestPair,
  workflowCanvasCompiledReviewContext,
  workflowCanvasContextMenuActionDescriptors,
  workflowCanvasContextMenuActionItems,
  workflowCanvasContextMenuState,
  workflowCanvasEdgeCalloutButtonStyle,
  workflowCanvasEdgeCanvasRenderState,
  workflowCanvasEdgeRunPresentationState,
  workflowCanvasEdgeEndpointCircleVisual,
  workflowCanvasEdgeLegendVisual,
  workflowCanvasEdgeLegendButtonStyle,
  workflowCanvasEdgeLegendDotStyle,
  workflowCanvasEdgeLegendStates,
  workflowCanvasEdgeLineAnimationState,
  workflowCanvasEdgeLineMidpoint,
  workflowCanvasEdgeOverlayPositions,
  workflowCanvasEdgeRenderVisualState,
  workflowCanvasEdgeStrokeWidth,
  workflowCanvasEmptyState,
  workflowCanvasFamilyContextState,
  workflowCanvasFrameMountViewState,
  workflowCanvasFocusOverlayActionItems,
  workflowCanvasFocusOverlayActionViews,
  workflowCanvasFocusOverlayBadgeItems,
  workflowCanvasFocusOverlayCounts,
  workflowCanvasGraphReviewState,
  workflowCanvasHiddenMinimapToggleState,
  workflowCanvasHorizontalRulerMarkStyle,
  workflowCanvasInteractiveOverlaySectionIds,
  workflowCanvasLeftOverlaySectionIds,
  workflowCanvasFirstAfpContractWorkSourceNodeId,
  workflowCanvasFirstAfpReadyHandoffRouteTarget,
  workflowCanvasFirstAfpReadyManifestSourceNodeId,
  workflowCanvasFirstCompiledRouteFocusTargetForRail,
  workflowCanvasFirstLinkedManifestSourceNodeId,
  workflowCanvasFirstOrchestrationRoleSourceNodeId,
  workflowCanvasHeaderState,
  workflowCanvasIdleNodeBadgeState,
  workflowCanvasIdleNodeOverlayState,
  workflowCanvasMinimapLayout,
  workflowCanvasMinimapNodeRectState,
  workflowCanvasMinimapNodeVisual,
  workflowCanvasMinimapSectionIds,
  workflowCanvasMinimapViewState,
  workflowCanvasNodeButtonClass,
  workflowCanvasNodeButtonStyle,
  workflowCanvasNodeCardPresentationState,
  workflowCanvasNodeDeploymentState,
  workflowCanvasNodeRunPresentationState,
  workflowCanvasNodeHeatmapClass,
  workflowCanvasNodePresentationState,
  workflowCanvasNodeSmallIcon,
  workflowCanvasNodeStatusClass,
  workflowCanvasNodeSuccessRateBorderColor,
  workflowCanvasNodeTriggerFamily,
  workflowCanvasNodeTriggerFamilyBadgeClass,
  workflowCanvasNodeVisualState,
  workflowCanvasManifestHealthClearActionView,
  workflowCanvasManifestHealthRailCopy,
  workflowCanvasOrchestrationRoleClearActionView,
  workflowCanvasOrchestrationRoleFocusLabel,
  workflowCanvasOverlayChromeState,
  workflowCanvasPassiveOverlaySectionIds,
  workflowCanvasOverlayTopOffsetClass,
  workflowCanvasPaletteState,
  workflowCanvasPolicyDeltaReviewMode,
  workflowCanvasPointPositionStyle,
  workflowCanvasReviewRailClearActionViews,
  workflowCanvasReviewRailBodySectionIds,
  workflowCanvasReviewRailBodySectionViews,
  workflowCanvasReviewRailClearActionItems,
  workflowCanvasReviewRailOrchestrationRouteState,
  workflowCanvasReviewRailPrimaryFocusActionView,
  workflowCanvasReviewRailPrimaryFocusView,
  workflowCanvasReviewRailSectionIds,
  workflowCanvasReviewRailSectionViews,
  workflowCanvasReviewRailState,
  workflowCanvasReviewRailTopSectionIds,
  workflowCanvasReviewRailTopSectionViews,
  workflowCanvasReviewRailTargetState,
  workflowCanvasReviewRailUnavailableFocusMessage,
  workflowCanvasRunOverlayState,
  workflowCanvasRouteLinkageClearActionView,
  workflowCanvasRouteLinkageRailCopy,
  workflowCanvasReviewRailMountState,
  workflowCanvasReviewRailVisible,
  workflowCanvasRecordStringField,
  workflowCanvasRouteLinkageFocusButtonState,
  workflowCanvasRouteMatchesAfpFocus,
  workflowCanvasSectionViews,
  workflowCanvasSharedReviewBannerState,
  workflowCanvasShellSectionIds,
  workflowCanvasShellViewState,
  workflowCanvasSummaryState,
  workflowCanvasVerticalRulerMarkStyle,
  workflowCanvasVisibleBranchOriginState,
  workflowCanvasVisibleFamilyContextState,
  workflowCanvasVisibleIdleNodePanelState,
  workflowCanvasVisibleInteractionLockState,
  workflowCanvasVisibleMinimapState,
  workflowCanvasVisiblePromoteFamilyAssetState,
  workflowCanvasVisibleSharedReviewBannerState,
  workflowCanvasRuntimeVisualSectionIds,
  workflowCanvasZoomStyle,
  workflowCanvasZoomViewState,
} from "../src/lib/workflowCanvasState.ts";

function workflowRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    run_id: "run-1",
    workflow_id: "wf-1",
    deployment_id: "dep-1",
    owner_user_id: "user-1",
    status: "succeeded",
    trigger_kind: "manual",
    timeline: [{ node_id: "node-1" }, { node_id: "node-2" }],
    result: { duration_ms: 1250, execution_mode: "dry_run" },
    started_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function savedWorkflow(id: string, title = id) {
  return {
    workflow_id: id,
    owner_user_id: "user-1",
    title,
    favorite: false,
    preset_kinds: [],
    graph: {},
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function workflowNode(overrides: Partial<WorkflowNodeDraft> = {}): WorkflowNodeDraft {
  return {
    id: "node-1",
    kind: "trigger",
    label: "Start",
    position: { x: 0, y: 0 },
    config: {},
    policy: {},
    hidden_runtime_nodes: [],
    metadata: {},
    ...overrides,
  };
}

function workflowEdge(overrides: Partial<WorkflowEdgeDraft> = {}): WorkflowEdgeDraft {
  return {
    id: "edge-1",
    source: "node-1",
    target: "node-2",
    metadata: {},
    ...overrides,
  };
}

test("workflow canvas palette state preserves untrimmed lowercase filtering", () => {
  const state = workflowCanvasPaletteState({
    filter: " Agent ",
    presets: ["agent", "approval_agent", "trigger"],
    primitives: ["agent", "approval", "trigger"],
    semanticStarters: [
      { id: "mail", label: "Email Agent" },
      { id: "report", label: "Weekly report" },
    ],
  });

  assert.deepEqual(state, {
    presetItems: [],
    primitiveItems: [],
    query: " agent ",
    semanticStarterItems: [],
  });

  assert.deepEqual(
    workflowCanvasPaletteState({
      filter: "AGENT",
      presets: ["agent", "approval_agent", "trigger"],
      primitives: ["agent", "approval", "trigger"],
      semanticStarters: [
        { id: "mail", label: "Email Agent" },
        { id: "report", label: "Weekly report" },
      ],
    }).semanticStarterItems,
    [{ id: "mail", label: "Email Agent" }],
  );
});

test("workflow canvas family context derives visibility and labels", () => {
  const empty = workflowCanvasFamilyContextState({
    asset: null,
    draftTitle: "Draft workflow",
    instance: null,
  });
  assert.equal(empty.show, false);
  assert.equal(workflowCanvasVisibleFamilyContextState(empty), null);
  assert.deepEqual(workflowCanvasVisiblePromoteFamilyAssetState(empty), empty);

  const family = workflowCanvasFamilyContextState({
    asset: { family_label: "Reusable asset", parameter_schema: [{}] },
    draftTitle: "Draft workflow",
    instance: { family_label: "Instance label" },
  });
  assert.equal(family.show, true);
  assert.equal(family.assetLabel, "Reusable asset");
  assert.equal(family.assetHasParameters, true);
  assert.equal(family.canPromoteAsset, false);
  assert.equal(family.instanceHasAsset, true);
  assert.deepEqual(workflowCanvasVisibleFamilyContextState(family), family);
  assert.equal(workflowCanvasVisiblePromoteFamilyAssetState(family), null);
});

test("workflow canvas summary labels compiled and preview states", () => {
  assert.deepEqual(
    workflowCanvasSummaryState({
      deploymentCount: 2,
      description: null,
      edgeCount: 3,
      hasCompiledContract: false,
      nodeCount: 4,
      previewOnlyTriggerContract: false,
      title: "Draft",
    }),
    {
      deployStatusLabel: "2 deploys",
      description: "No description yet.",
      edgeCount: 3,
      irStatusLabel: "Pending",
      nodeCount: 4,
      title: "Draft",
    },
  );

  assert.equal(
    workflowCanvasSummaryState({
      deploymentCount: 1,
      description: "Ready",
      edgeCount: 1,
      hasCompiledContract: true,
      nodeCount: 2,
      previewOnlyTriggerContract: true,
      title: "Compiled",
    }).irStatusLabel,
    "Compiled preview",
  );
});

test("workflow canvas branch origin state limits siblings and hides without origin", () => {
  const siblings = Array.from({ length: 7 }, (_, index) => (
    savedWorkflow(`wf-${index}`, `Workflow ${index}`)
  ));
  const state = workflowCanvasBranchOriginState({
    branchCount: 8,
    origin: { parent_workflow_id: "parent-1" },
    selectedWorkflowId: "wf-1",
    siblings,
  });

  assert.equal(state.hasSiblings, true);
  assert.equal(state.hiddenSiblingCount, 1);
  assert.equal(state.visibleSiblings.length, 6);
  assert.deepEqual(workflowCanvasVisibleBranchOriginState(state), state);
  assert.equal(
    workflowCanvasVisibleBranchOriginState({ ...state, origin: null }),
    null,
  );
});

test("workflow canvas empty item exports keep starter copy stable", () => {
  assert.deepEqual(EMPTY_CANVAS_TEMPLATE_ITEMS.map((item) => item.kind), [
    "trigger",
    "approval",
    "condition",
    "agent",
  ]);
  assert.equal(EMPTY_CANVAS_AI_STARTER_ITEMS[0]?.desc, "email trigger -> summarise -> send");
});

test("workflow canvas ruler exports keep marks and styles stable", () => {
  assert.deepEqual([...CANVAS_HORIZONTAL_RULER_MARKS], [0, 200, 400, 600, 800, 1000, 1200]);
  assert.deepEqual([...CANVAS_VERTICAL_RULER_MARKS], [0, 100, 200, 300, 400, 500, 600]);
  assert.deepEqual(workflowCanvasHorizontalRulerMarkStyle(200), { left: "200px" });
  assert.deepEqual(workflowCanvasVerticalRulerMarkStyle(300), { top: "300px" });
  assert.deepEqual(CANVAS_VERTICAL_RULER_LABEL_STYLE, {
    "writing-mode": "vertical-lr",
    transform: "rotate(180deg)",
  });
});

test("workflow canvas zoom and point styles are deterministic", () => {
  assert.deepEqual(workflowCanvasZoomStyle(1.25), {
    inset: "0",
    position: "absolute",
    transform: "scale(1.25)",
    "transform-origin": "top left",
  });
  assert.deepEqual(workflowCanvasZoomViewState(1.234), {
    percentLabel: "123%",
    style: workflowCanvasZoomStyle(1.234),
  });
  assert.deepEqual(workflowCanvasPointPositionStyle({ x: 12, y: 34 }), {
    left: "12px",
    top: "34px",
  });
});

test("workflow canvas minimap helpers derive layout, rects, and visibility", () => {
  const bounds = {
    minX: 0,
    minY: 0,
    maxX: 360,
    maxY: 180,
    nodes: [
      { id: "a", position: { x: 0, y: 0 } },
      { id: "b", position: { x: 180, y: 90 } },
    ],
  };
  const layout = workflowCanvasMinimapLayout(bounds);

  assert.deepEqual(layout.style, { width: "140px", height: "90px" });
  assert.equal(layout.width, 140);
  assert.equal(layout.height, 90);
  assert.deepEqual(workflowCanvasMinimapNodeVisual(true), {
    fill: "rgba(99,102,241,0.55)",
    stroke: "rgba(99,102,241,0.9)",
  });

  const rect = workflowCanvasMinimapNodeRectState({
    layout,
    node: bounds.nodes[1],
    selectedNodeId: "b",
  });
  assert.equal(rect.x, layout.toX(180));
  assert.equal(rect.y, layout.toY(90));
  assert.equal(rect.fill, "rgba(99,102,241,0.55)");

  const hiddenState = workflowCanvasMinimapViewState({
    bounds,
    selectedNodeId: "b",
    show: false,
  });
  assert.deepEqual(workflowCanvasHiddenMinimapToggleState(hiddenState), hiddenState);
  assert.equal(workflowCanvasVisibleMinimapState(hiddenState), null);

  const shownState = workflowCanvasMinimapViewState({
    bounds,
    selectedNodeId: "b",
    show: true,
  });
  const visible = workflowCanvasVisibleMinimapState(shownState);
  assert.equal(visible?.nodeCount, 2);
  assert.equal(visible?.nodeRects.length, 2);
  assert.equal(workflowCanvasHiddenMinimapToggleState(shownState), null);
});

test("workflow canvas idle node state derives badge and panel visibility", () => {
  const hidden = workflowCanvasIdleNodeOverlayState({
    nodes: [{ id: "node-1", kind: "agent", label: null }],
    showIdleNodes: false,
  });
  assert.equal(hidden.count, 1);
  assert.deepEqual(hidden.items, [{ id: "node-1", kind: "agent", label: "node-1" }]);
  assert.deepEqual(workflowCanvasIdleNodeBadgeState(hidden), hidden);
  assert.equal(workflowCanvasVisibleIdleNodePanelState(hidden), null);

  const visible = workflowCanvasIdleNodeOverlayState({
    nodes: [{ id: "node-2", kind: "tool", label: "Lookup" }],
    showIdleNodes: true,
  });
  assert.deepEqual(workflowCanvasVisibleIdleNodePanelState(visible), visible);
  assert.equal(
    workflowCanvasIdleNodeBadgeState(
      workflowCanvasIdleNodeOverlayState({ nodes: [], showIdleNodes: true }),
    ),
    null,
  );
});

test("workflow canvas shell helpers preserve section grouping and classes", () => {
  const sections = compactWorkflowCanvasSectionViews([
    { id: "a", content: "A" },
    null,
    { id: "b", content: "B" },
  ]);
  assert.deepEqual(sections.map((section) => section.id), ["a", "b"]);

  assert.match(WORKFLOW_CONTEXT_SURFACE_CLASS, /glass-surface/);
  assert.match(WORKFLOW_CANVAS_SURFACE_CLASS, /rounded-\[28px\]/);
  assert.match(WORKFLOW_CANVAS_FRAME_CLASS, /min-h-\[720px\]/);

  assert.deepEqual(
    workflowCanvasShellViewState({
      className: "shell",
      sections,
    }),
    {
      className: "shell",
      sections,
    },
  );

  assert.deepEqual(
    workflowCanvasFrameMountViewState({
      interactiveOverlaySections: [{ id: "menu" }],
      passiveOverlaySections: [{ id: "ruler" }],
    }),
    {
      className: WORKFLOW_CANVAS_FRAME_CLASS,
      interactiveOverlaySections: [{ id: "menu" }],
      passiveOverlaySections: [{ id: "ruler" }],
    },
  );
});

test("workflow canvas section id helpers preserve surface ordering", () => {
  assert.deepEqual(workflowCanvasContextSectionIds(), [
    "family_context",
    "summary",
    "palette",
    "promote_family_asset",
    "branch_origin",
  ]);
  assert.deepEqual(workflowCanvasChromeSectionIds(), ["header", "shared_review", "overlay"]);
  assert.deepEqual(workflowCanvasShellSectionIds(), [
    "horizontal_ruler",
    "vertical_ruler",
    "empty_state",
  ]);
  assert.deepEqual(workflowCanvasLeftOverlaySectionIds(), [
    "compiled_focus",
    "interaction_lock",
  ]);
  assert.deepEqual(workflowCanvasRuntimeVisualSectionIds(), ["edge_animation_style"]);
  assert.deepEqual(workflowCanvasMinimapSectionIds(), ["minimap_toggle", "minimap"]);
  assert.deepEqual(workflowCanvasBottomControlSectionIds(), [
    "zoom_controls",
    "idle_node_toggle",
    "idle_node_panel",
  ]);
  assert.deepEqual(workflowCanvasInteractiveOverlaySectionIds(), [
    "context_menu",
    "zoom_controls",
    "idle_node_toggle",
    "idle_node_panel",
    "minimap_toggle",
    "minimap",
  ]);
  assert.deepEqual(workflowCanvasPassiveOverlaySectionIds(), [
    "horizontal_ruler",
    "vertical_ruler",
    "empty_state",
    "compiled_focus",
    "interaction_lock",
    "edge_animation_style",
  ]);
  assert.deepEqual(
    workflowCanvasSectionViews(workflowCanvasPassiveOverlaySectionIds(), {
      compiled_focus: "Compiled focus",
      edge_animation_style: "Edge animation",
      empty_state: "Empty state",
      horizontal_ruler: "Horizontal ruler",
      interaction_lock: "Interaction lock",
      vertical_ruler: "Vertical ruler",
    }).map((section) => `${section.id}:${section.content}`),
    [
      "horizontal_ruler:Horizontal ruler",
      "vertical_ruler:Vertical ruler",
      "empty_state:Empty state",
      "compiled_focus:Compiled focus",
      "interaction_lock:Interaction lock",
      "edge_animation_style:Edge animation",
    ],
  );
});

test("workflow canvas review rail and context menu helpers wrap nullable state", () => {
  const rail = workflowCanvasReviewRailMountState({
    showRail: true,
    topOffsetClass: "top-24",
  });
  assert.equal(rail.show, true);
  assert.match(rail.mountClass, /top-24/);
  assert.deepEqual(workflowCanvasContextMenuActionDescriptors(), [
    { id: "duplicate", label: "Duplicate node" },
    { id: "inspect", label: "Inspect node" },
    { id: "comment", label: "Add comment" },
  ]);
  assert.deepEqual(
    workflowCanvasActionItems(
      workflowCanvasContextMenuActionDescriptors(),
      (item) => `handle:${item.id}`,
    ).map((item) => `${item.id}:${item.label}:${item.onClick}`),
    [
      "duplicate:Duplicate node:handle:duplicate",
      "inspect:Inspect node:handle:inspect",
      "comment:Add comment:handle:comment",
    ],
  );
  const invoked: string[] = [];
  const actions = workflowCanvasContextMenuActionItems({
    duplicateNode: (nodeId) => invoked.push(`duplicate:${nodeId}`),
    nodeCommentById: { "node-1": "Existing comment" },
    nodeId: "node-1",
    setCommentDraft: (value) => invoked.push(`draft:${value}`),
    setCtxMenu: (menu) => invoked.push(`menu:${menu?.nodeId ?? "none"}`),
    setEditingCommentNodeId: (nodeId) => invoked.push(`editing:${nodeId}`),
    setSelectedNodeId: (nodeId) => invoked.push(`selected:${nodeId}`),
  });
  actions.find((item) => item.id === "duplicate")?.onClick({ stopPropagation: () => invoked.push("stop") });
  actions.find((item) => item.id === "inspect")?.onClick({ stopPropagation: () => invoked.push("stop") });
  actions.find((item) => item.id === "comment")?.onClick({ stopPropagation: () => invoked.push("stop") });
  assert.deepEqual(invoked, [
    "stop",
    "duplicate:node-1",
    "stop",
    "selected:node-1",
    "menu:none",
    "stop",
    "editing:node-1",
    "draft:Existing comment",
    "menu:none",
  ]);

  assert.equal(
    workflowCanvasContextMenuState({
      actionItems: ["duplicate"],
      menu: null,
    }),
    null,
  );
  assert.deepEqual(
    workflowCanvasContextMenuState({
      actionItems: ["duplicate"],
      menu: { nodeId: "node-1", x: 10, y: 20 },
    }),
    {
      actionItems: ["duplicate"],
      menu: { nodeId: "node-1", x: 10, y: 20 },
    },
  );
});

test("workflow canvas node status and heatmap classes preserve priority", () => {
  assert.equal(
    workflowCanvasNodeStatusClass({
      nodeKind: "trigger",
      nodeStatus: "failed",
      selected: true,
      triggerFamily: "schedule",
    }),
    "border-rose-300/80 bg-rose-50/85",
  );
  assert.equal(
    workflowCanvasNodeStatusClass({
      nodeKind: "trigger",
      nodeStatus: undefined,
      selected: false,
      triggerFamily: "schedule",
    }),
    "border-teal-300/70 bg-teal-50/80 hover:bg-teal-50",
  );
  assert.equal(
    workflowCanvasNodeHeatmapClass({
      hasNodeStatus: false,
      isSearchMatch: false,
      successRate: 0.4,
    }),
    "ring-1 ring-rose-300/60",
  );
  assert.equal(
    workflowCanvasNodeHeatmapClass({
      hasNodeStatus: true,
      isSearchMatch: false,
      successRate: 1,
    }),
    "",
  );
});

test("workflow canvas node presentation helpers derive trigger icons and badges", () => {
  assert.equal(workflowCanvasNodeSmallIcon({ nodeKind: "trigger", triggerFamily: "email" }), "EM");
  assert.equal(workflowCanvasNodeTriggerFamily({ nodeKind: "trigger", triggerFamily: "manual" }), null);
  assert.equal(workflowCanvasNodeTriggerFamily({ nodeKind: "trigger", triggerFamily: "webhook" }), "webhook");
  assert.equal(workflowCanvasNodeTriggerFamilyBadgeClass("webhook"), "bg-sky-100 text-sky-700");
  assert.equal(
    workflowCanvasNodeSuccessRateBorderColor({
      hasNodeStatus: false,
      successRate: 1,
    }),
    "rgba(74,222,128,0.4)",
  );
  assert.deepEqual(
    workflowCanvasNodeButtonStyle("rgba(74,222,128,0.4)"),
    { "border-left": "3px solid rgba(74,222,128,0.4)" },
  );

  const state = workflowCanvasNodePresentationState({
    matchingNodeIds: new Set(["node-1"]),
    nodeId: "node-1",
    nodeKind: "trigger",
    nodeStatus: undefined,
    selected: false,
    successRate: 0.9,
    triggerFamily: "schedule",
  });
  assert.equal(state.heatmapClass, "ring-2 ring-amber-400/70");
  assert.equal(state.nodeKindIconSmall, "SC");
  assert.equal(state.triggerFamilyBadge, "schedule");
});

test("workflow canvas node visual and card states compose rings and protection labels", () => {
  const visual = workflowCanvasNodeVisualState({
    dependencyHighlightedNodeId: "node-1",
    downstreamNodeIds: new Set(["node-2"]),
    gotoNodeId: "node-1",
    matchingNodeIds: new Set(["node-1"]),
    nodeErrorIds: new Set(["node-1"]),
    nodeId: "node-1",
    nodeKind: "never_executed",
    showIdleNodes: true,
    upstreamNodeIds: new Set(),
  });
  assert.equal(visual.anomalyClass, "node-anomaly-pulse");
  assert.equal(visual.depRingClass, "ring-2 ring-primary");
  assert.equal(visual.gotoClass, "ring-2 ring-fuchsia-400 ring-offset-2 ring-offset-transparent");
  assert.equal(visual.idleRingClass, "ring-2 ring-amber-400");

  const buttonClass = workflowCanvasNodeButtonClass({
    anomalyClass: "anomaly",
    compiledFocusClass: "compiled",
    depRingClass: "dep",
    gotoClass: "goto",
    heatmapClass: "heat",
    idleRingClass: "idle",
    liveNodeAccent: "live",
    nodeProtected: true,
    nodeSearchMatchClass: "search",
    statusClass: "status",
  });
  assert.match(buttonClass, /cursor-grab/);
  assert.match(buttonClass, /ring-2 ring-slate-500/);
  assert.match(buttonClass, /compiled/);

  const card = workflowCanvasNodeCardPresentationState({
    activeGotoNodeId: "node-1",
    activeMatchingNodeIds: new Set(["node-1"]),
    activeNodeErrorIds: new Set(["node-1"]),
    activeNodeId: "node-1",
    activeShowIdleNodes: true,
    collapsedNodeIds: new Set(["node-1"]),
    compiledFocusClass: "compiled",
    dependencyHighlightedNodeId: "node-1",
    downstreamNodeIds: new Set(),
    dragGhostNodeId: "node-1",
    liveNodeAccent: "live",
    node: workflowNode({ config: { regeneration_lock_scope: "subgraph" } }),
    nodeProtected: true,
    nodeStatus: undefined,
    successRate: 0.75,
    upstreamNodeIds: new Set(),
  });
  assert.equal(card.isDraggingThisNode, true);
  assert.equal(card.isNodeCollapsed, true);
  assert.equal(card.protectionLabel, "Protected subgraph");
  assert.match(card.nodeButtonClass, /compiled/);
});

test("workflow canvas node deployment state summarizes policy and review mode", () => {
  const deploymentPolicy: NodeDeploymentPolicy = {
    deploymentId: "dep-1",
    environment: "staging",
    family: "research",
    fields: {
      auth_mode: "sandbox_credentials",
      delivery_tier: "staging",
      provider_route: "sandbox",
      side_effects: "preview_only",
    },
    provider: "openai",
    service: "responses",
    source: "deployment_node_override",
  };
  const pendingPolicy: PendingNodeDeploymentPolicy = {
    environment: "production",
    family: "research",
    fields: {
      auth_mode: "oauth",
      delivery_tier: "production",
      provider_route: "priority",
      side_effects: "live",
    },
    source: "deployment_override",
  };

  const state = workflowCanvasNodeDeploymentState({
    deploymentPolicy,
    pendingPolicy,
    runNodePolicyDelta: {
      changes: [
        { field: "provider_route", current: "sandbox", next: "priority" },
        { field: "delivery_tier", current: "staging", next: "production" },
        { field: "auth_mode", current: "sandbox_credentials", next: "oauth" },
      ],
      source: "replay_policy_delta",
    },
  });

  assert.equal(state.deploymentVisual?.label, "Node override");
  assert.deepEqual(
    state.pendingChanges.map((change) => change.field),
    ["delivery_tier", "auth_mode", "side_effects", "provider_route"],
  );
  assert.equal(state.policyDeltaFilterMode, "replay_drift");
  assert.equal(state.runNodePolicyDeltaSummaryText, "provider route, delivery tier");
  assert.equal(workflowCanvasPolicyDeltaReviewMode("deployment_policy_delta"), "deployment_context");
  assert.equal(workflowCanvasPolicyDeltaReviewMode(null), "deployment_context");

  const pendingOnly = workflowCanvasNodeDeploymentState({
    deploymentPolicy: undefined,
    pendingPolicy,
    runNodePolicyDelta: undefined,
  });
  assert.equal(pendingOnly.deploymentVisual, null);
  assert.deepEqual(
    pendingOnly.pendingChanges.map((change) => change.field),
    ["delivery_tier", "auth_mode", "side_effects", "provider_route"],
  );
  assert.equal(pendingOnly.runNodePolicyDeltaSummaryText, null);

  const node = workflowNode({ id: "node-1" });
  const presentation = workflowCanvasNodeRunPresentationState({
    activeRun: null,
    deploymentPolicyById: new Map([["node-1", deploymentPolicy]]),
    liveRunConnected: true,
    node,
    nodePolicyDeltas: new Map([[
      "node-1",
      {
        changes: [{ field: "provider_route", current: "sandbox", next: "priority" }],
        deploymentId: "dep-1",
        source: "replay_policy_delta",
      },
    ]]),
    pendingPolicyById: new Map([["node-1", pendingPolicy]]),
    protectedNodeIds: new Set(["node-1"]),
    runNodeOverlays: new Map([["node-1", { reason: "  waiting on approval  ", status: "active" }]]),
    runStatuses: new Map([["node-1", "queued"]]),
    runStepOrder: new Map([["node-1", 3]]),
  });
  assert.equal(presentation.nodeStatus, "queued");
  assert.equal(presentation.liveReason, "waiting on approval");
  assert.match(presentation.liveNodeAccent, /ring-sky/);
  assert.equal(presentation.nodeProtected, true);
  assert.equal(presentation.stepOrder, 3);
  assert.equal(presentation.policyDeltaFilterMode, "replay_drift");
  assert.equal(presentation.runNodePolicyDelta?.deploymentId, "dep-1");
  assert.deepEqual(
    presentation.pendingChanges.map((change) => change.field),
    ["delivery_tier", "auth_mode", "side_effects", "provider_route"],
  );
});

test("workflow canvas route focus helpers preserve match modes and rail visibility", () => {
  assert.equal(
    workflowCanvasRouteMatchesAfpFocus({
      hasAfpFilter: true,
      routeFocus: "full",
      sourceMatches: true,
      targetMatches: false,
    }),
    false,
  );
  assert.equal(
    workflowCanvasRouteMatchesAfpFocus({
      hasAfpFilter: true,
      routeFocus: "partial",
      sourceMatches: true,
      targetMatches: false,
    }),
    true,
  );
  assert.equal(
    workflowCanvasRouteMatchesAfpFocus({
      hasAfpFilter: false,
      routeFocus: null,
      sourceMatches: false,
      targetMatches: false,
    }),
    true,
  );

  assert.equal(
    workflowCanvasReviewRailVisible({
      activeAfpFilter: "approval",
      activeAfpReadinessFocus: null,
      activeLinkageFocus: null,
      activeManifestLinkageFocus: null,
      activeRouteFocus: null,
      branchReviewActive: false,
    }),
    false,
  );
  assert.equal(
    workflowCanvasReviewRailVisible({
      activeAfpFilter: "approval",
      activeAfpReadinessFocus: null,
      activeLinkageFocus: null,
      activeManifestLinkageFocus: null,
      activeRouteFocus: "full",
      branchReviewActive: false,
    }),
    true,
  );
});

test("workflow canvas focus overlay helpers build badges and route counts", () => {
  const graphNodes = [
    workflowNode({ id: "node-1" }),
    workflowNode({ id: "node-2" }),
    workflowNode({ id: "node-3" }),
  ];
  const graphEdges = [
    workflowEdge({ id: "edge-1", source: "node-1", target: "node-2" }),
    workflowEdge({ id: "edge-2", source: "node-2", target: "node-3" }),
  ];
  const counts = workflowCanvasFocusOverlayCounts({
    graphEdges,
    graphNodes,
    matchingNodeIds: new Set(["node-1", "node-2"]),
  });

  assert.deepEqual(counts, {
    firstMatchingNodeId: "node-1",
    fullyMatchingRouteCount: 1,
    graphNodeCount: 3,
    matchingCount: 2,
    partiallyMatchingRouteCount: 1,
  });

  const badges = workflowCanvasFocusOverlayBadgeItems({
    activeAfpFilter: "orchestration_scaffold",
    activeManifestLinkageFilter: "inspector_only",
    graphNodeCount: 3,
    matchingCount: 2,
  });
  assert.equal(badges.length, 3);
  assert.equal(badges[0]?.label, "AFP focus orchestration scaffold");
  assert.equal(badges[1]?.label, "inspector-only manifests");
  assert.equal(badges[2]?.label, "2 of 3 nodes match");

  const overlayState = workflowCanvasCompiledFocusOverlayViewState({
    graphEdges,
    graphNodes,
    reviewContext: workflowCanvasCompiledReviewContext({
      activeAfpFilter: "capability_boundary",
      activeAfpGapFilter: null,
      activeAfpReadinessFocus: null,
      activeAfpRouteFocus: "partial",
      activeManifestLinkageFilter: null,
      activeOrchestrationRole: null,
      activeRouteLinkageFilter: null,
      graphEdges,
      latestEdges: [],
      latestManifests: [
        {
          node_id: "manifest-1",
          source_graph_node_id: "node-1",
          runtime_kind: "executor",
          connector_binding: { capability_id: "capability-a" },
          memory: { scope: "thread" },
          trace: { source: "run_trace" },
        },
      ],
    }),
    topOffsetClass: "top-4",
  });
  assert.equal(overlayState?.topOffsetClass, "top-4");
  assert.equal(overlayState?.activeRouteFocus, "partial");
  assert.equal(overlayState?.firstMatchingNodeId, "node-1");
  assert.equal(overlayState?.actionItems.some((item) => item.kind === "clear_route_focus"), true);
});

test("workflow canvas focus overlay action views preserve ordering and tones", () => {
  const actions = workflowCanvasFocusOverlayActionViews({
    activeRouteFocus: "full",
    firstMatchingNodeId: "node-1",
    fullyMatchingRouteCount: 2,
    partiallyMatchingRouteCount: 1,
  });

  assert.deepEqual(
    actions.map((action) => action.kind),
    [
      "route_focus_full",
      "route_focus_partial",
      "clear_route_focus",
      "review_roster",
      "open_first_match",
      "clear_focus",
    ],
  );
  assert.equal(actions[0]?.label, "2 route review matches");
  assert.match(actions[0]?.className ?? "", /ring-2 ring-emerald/);
  assert.equal(actions[1]?.label, "1 partial route reviews");
  assert.match(actions[1]?.className ?? "", /border-amber-200/);
  assert.equal(actions[4]?.nodeId, "node-1");
  assert.equal(actions[5]?.label, "Show full graph");

  assert.deepEqual(
    workflowCanvasFocusOverlayActionViews({
      activeRouteFocus: null,
      firstMatchingNodeId: null,
      fullyMatchingRouteCount: 0,
      partiallyMatchingRouteCount: 0,
    }).map((action) => action.kind),
    ["review_roster", "clear_focus"],
  );

  const invoked: string[] = [];
  const boundActions = workflowCanvasFocusOverlayActionItems({
    actionViews: actions,
    clearAfpGraphFocus: () => invoked.push("clear_graph"),
    clearAfpRouteFocus: () => invoked.push("clear_route"),
    openCompiledRosterReview: () => invoked.push("review_roster"),
    openCompiledRuntimeContract: (nodeId, focusTarget) => invoked.push(`contract:${nodeId}:${focusTarget ?? "none"}`),
    setSelectedCompiledAfpRouteFocus: (focus) => invoked.push(`route_focus:${focus ?? "none"}`),
  });
  boundActions.find((item) => item.kind === "route_focus_full")?.onClick();
  boundActions.find((item) => item.kind === "clear_route_focus")?.onClick();
  boundActions.find((item) => item.kind === "open_first_match")?.onClick();
  boundActions.find((item) => item.kind === "review_roster")?.onClick();
  boundActions.find((item) => item.kind === "clear_focus")?.onClick();
  assert.deepEqual(invoked, [
    "route_focus:full",
    "clear_route",
    "contract:node-1:node-1",
    "review_roster",
    "clear_graph",
  ]);
});

test("workflow canvas route linkage buttons and shared review classes stay stable", () => {
  assert.match(REVIEW_CLEAR_ACTION_BASE_CLASS, /rounded-full/);
  assert.match(REVIEW_CLEAR_ACTION_HOVER_CLASS, /hover:bg-white/);
  assert.match(REVIEW_RAIL_PILL_BASE_CLASS, /px-2\.5/);
  assert.match(REVIEW_RAIL_PILL_HOVER_CLASS, /hover:bg-white/);
  assert.match(COMPILED_FOCUS_ACTION_CLASS, /border-emerald-200/);

  const linked = workflowCanvasRouteLinkageFocusButtonState("linked", "linked");
  assert.match(linked.className, /ring-2 ring-sky/);
  assert.match(linked.message, /Clear/);

  const inspectorOnly = workflowCanvasRouteLinkageFocusButtonState("manifest_only", null);
  assert.match(inspectorOnly.className, /border-amber-200/);
  assert.match(inspectorOnly.message, /inspector-only/i);
});

test("workflow canvas review rail copy helpers preserve focused and dimmed labels", () => {
  assert.deepEqual(workflowCanvasManifestHealthRailCopy("linked"), {
    inspectorOnlyText: "Inspector-only manifests are outside canvas node focus",
    linkedText: "Node-review-ready manifests remain in focus",
  });
  assert.deepEqual(workflowCanvasAfpRouteRailCopy("partial"), {
    fullText: "Matched route review remains in focus",
    partialText: "Partial AFP route review focus",
  });
  assert.deepEqual(workflowCanvasRouteLinkageRailCopy("manifest_only"), {
    inspectorOnlyText: "Inspector-only routes remain in focus",
    linkedText: "Branch-review-ready routes are de-emphasized",
  });
});

test("workflow canvas review rail section helpers preserve conditional ordering", () => {
  assert.deepEqual(
    workflowCanvasReviewRailTopSectionIds({
      hasPrimaryFocus: false,
      quickActionCount: 0,
    }),
    ["header", "guidance"],
  );
  assert.deepEqual(
    workflowCanvasReviewRailTopSectionIds({
      hasPrimaryFocus: true,
      quickActionCount: 2,
    }),
    ["header", "primary_focus", "quick_actions", "guidance"],
  );

  const body = workflowCanvasReviewRailBodySectionIds({
    activeAfpReadinessFocus: true,
    activeAfpRouteFocus: true,
    activeLinkageFocus: true,
    activeManifestLinkageFocus: true,
    activeOrchestrationRoleFocus: true,
    branchReviewActive: true,
    hasAfpFilter: true,
  });
  assert.deepEqual(body, [
    "readiness",
    "orchestration_role",
    "manifest_health",
    "afp_route",
    "route_linkage",
    "branch_legend",
  ]);
  assert.deepEqual(workflowCanvasReviewRailSectionIds(body), [
    "top_group",
    "readiness",
    "orchestration_role",
    "manifest_health",
    "afp_route",
    "route_linkage",
    "branch_legend",
  ]);
  assert.deepEqual(
    workflowCanvasReviewRailBodySectionIds({
      activeAfpReadinessFocus: false,
      activeAfpRouteFocus: true,
      activeLinkageFocus: false,
      activeManifestLinkageFocus: false,
      activeOrchestrationRoleFocus: false,
      branchReviewActive: false,
      hasAfpFilter: false,
    }),
    [],
  );
});

test("workflow canvas review rail section view helpers preserve mapped content", () => {
  const topViews = workflowCanvasReviewRailTopSectionViews({
    contentById: {
      guidance: "Guidance",
      header: "Header",
      primary_focus: "Primary focus",
      quick_actions: "Quick actions",
    },
    hasPrimaryFocus: true,
    quickActionCount: 1,
  });
  assert.deepEqual(
    topViews.map((section) => `${section.id}:${section.content}`),
    [
      "header:Header",
      "primary_focus:Primary focus",
      "quick_actions:Quick actions",
      "guidance:Guidance",
    ],
  );

  const bodyViews = workflowCanvasReviewRailBodySectionViews({
    activeAfpReadinessFocus: false,
    activeAfpRouteFocus: true,
    activeLinkageFocus: true,
    activeManifestLinkageFocus: false,
    activeOrchestrationRoleFocus: false,
    branchReviewActive: true,
    contentById: {
      afp_route: "AFP route",
      branch_legend: "Branch legend",
      manifest_health: "Manifest health",
      orchestration_role: "Orchestration role",
      readiness: "Readiness",
      route_linkage: "Route linkage",
    },
    hasAfpFilter: true,
  });
  assert.deepEqual(
    bodyViews.map((section) => `${section.id}:${section.content}`),
    [
      "afp_route:AFP route",
      "route_linkage:Route linkage",
      "branch_legend:Branch legend",
    ],
  );

  assert.deepEqual(
    workflowCanvasReviewRailSectionViews({
      bodySectionViews: bodyViews,
      topGroupContent: "Top group",
    }).map((section) => `${section.id}:${section.content}`),
    [
      "top_group:Top group",
      "afp_route:AFP route",
      "route_linkage:Route linkage",
      "branch_legend:Branch legend",
    ],
  );
});

test("workflow canvas review clear action helpers preserve labels titles and disabled states", () => {
  const manifest = workflowCanvasManifestHealthClearActionView("inspector_only");
  assert.equal(manifest.disabled, false);
  assert.equal(manifest.label, "Clear inspector-only manifest focus");
  assert.match(manifest.title, /manifest health focus/);

  const route = workflowCanvasAfpRouteClearActionView("full");
  assert.equal(route.label, "Clear AFP route full match");
  assert.match(route.className, /border-emerald-200/);

  const linkage = workflowCanvasRouteLinkageClearActionView("linked");
  assert.equal(linkage.label, "Clear branch-review-ready route focus");
  assert.match(linkage.title, /route linkage focus/);

  const readiness = workflowCanvasAfpReadinessClearActionView("needs_contract_work");
  assert.equal(readiness.disabled, false);
  assert.equal(readiness.label, "Clear AFP contract-work focus");
  assert.match(readiness.className, /border-amber-200/);
  assert.match(readiness.title, /AFP readiness focus/);

  const branchUnavailable = workflowCanvasBranchFocusClearActionView({
    available: false,
    selectedEdgeId: null,
  });
  assert.equal(branchUnavailable.disabled, true);
  assert.equal(branchUnavailable.label, "No branch edge to review");
  assert.match(branchUnavailable.className, /cursor-not-allowed/);

  const branchSelected = workflowCanvasBranchFocusClearActionView({
    available: true,
    selectedEdgeId: "edge-1",
  });
  assert.equal(branchSelected.label, "Clear branch focus");
  assert.match(branchSelected.title, /branch focus/);

  const role = workflowCanvasOrchestrationRoleClearActionView();
  assert.equal(role.label, "Clear orchestration role focus");
  assert.match(role.title, /orchestration role focus/);

  const actions = workflowCanvasReviewRailClearActionViews({
    activeAfpReadinessFocus: "ready_handoffs",
    activeLinkageFocus: "manifest_only",
    activeManifestLinkageFocus: "linked",
    activeOrchestrationRoleFocus: "delegated_capability",
    activeRouteFocus: "full",
    branchRailFocusAvailable: true,
    branchReviewActive: true,
    firstReviewedEdge: workflowEdge({ id: "edge-9", target: "node-9" }),
    selectedEdgeId: null,
  });
  assert.deepEqual(
    actions.map((action) => action.id),
    [
      "manifest_focus",
      "orchestration_role",
      "afp_route",
      "route_linkage",
      "afp_readiness",
      "branch_focus",
    ],
  );
  assert.equal(actions.at(-1)?.edgeId, "edge-9");
  assert.equal(actions.at(-1)?.nodeId, "node-9");

  const invoked: string[] = [];
  const boundActions = workflowCanvasReviewRailClearActionItems({
    activeAfpReadinessFocus: "ready_handoffs",
    activeLinkageFocus: null,
    activeManifestLinkageFocus: null,
    activeOrchestrationRoleFocus: null,
    activeRouteFocus: null,
    branchRailFocusAvailable: true,
    branchReviewActive: true,
    clearAfpReadinessFocus: () => invoked.push("clear_readiness"),
    clearAfpRouteFocus: () => invoked.push("clear_route"),
    clearManifestHealthFocus: () => invoked.push("clear_manifest"),
    clearOrchestrationRoleFocus: () => invoked.push("clear_role"),
    clearRouteLinkageFocus: () => invoked.push("clear_linkage"),
    firstReviewedEdge: workflowEdge({ id: "edge-bound", target: "node-bound" }),
    focusRunEdgeTarget: (edgeId, nodeId) => invoked.push(`focus:${edgeId}:${nodeId}`),
    selectedEdgeId: null,
    setSelectedRunEdgeId: (edgeId) => invoked.push(`select:${edgeId ?? "none"}`),
  });
  boundActions.find((item) => item.id === "afp_readiness")?.onClick();
  boundActions.find((item) => item.id === "branch_focus")?.onClick();
  assert.deepEqual(invoked, ["clear_readiness", "focus:edge-bound:node-bound"]);
});

test("workflow canvas review rail target priority and orchestration labels stay stable", () => {
  assert.equal(workflowCanvasOrchestrationRoleFocusLabel("delegated_capability"), "delegated capability unit");
  assert.equal(workflowCanvasOrchestrationRoleFocusLabel("delegated_decision"), "delegated decision unit");
  assert.equal(workflowCanvasOrchestrationRoleFocusLabel("workflow_summary"), "workflow summary unit");
  assert.equal(workflowCanvasOrchestrationRoleFocusLabel(null), "supervisor orchestration unit");

  assert.match(
    workflowCanvasReviewRailUnavailableFocusMessage({
      activeAfpReadinessFocus: "ready_manifests",
      activeLinkageFocus: "linked",
      activeManifestLinkageFocus: "linked",
      activeOrchestrationRoleFocus: "delegated_capability",
      activeRouteFocus: null,
    }),
    /compiled route/,
  );
  assert.match(
    workflowCanvasReviewRailUnavailableFocusMessage({
      activeAfpReadinessFocus: "ready_manifests",
      activeLinkageFocus: null,
      activeManifestLinkageFocus: null,
      activeOrchestrationRoleFocus: null,
      activeRouteFocus: null,
    }),
    /compiled manifest/,
  );
  assert.match(
    workflowCanvasReviewRailUnavailableFocusMessage({
      activeAfpReadinessFocus: null,
      activeLinkageFocus: null,
      activeManifestLinkageFocus: null,
      activeOrchestrationRoleFocus: null,
      activeRouteFocus: null,
    }),
    /traced branch edge/,
  );
});

test("workflow canvas review rail primary focus view preserves priority and targets", () => {
  const baseInput = {
    activeAfpReadinessFocus: null,
    activeEdgeId: null,
    activeLinkageFocus: null,
    activeManifestLinkageFocus: null,
    activeOrchestrationRoleFocus: null,
    activeRouteFocus: null,
    branchReviewActive: false,
    firstAfpContractWorkSourceNodeId: "contract-node",
    firstAfpReadyHandoffTarget: "handoff-target",
    firstAfpReadyManifestSourceNodeId: "ready-node",
    firstCompiledRouteFocusTarget: "route-target",
    firstLinkedManifestNodeId: "linked-node",
    firstOrchestrationRoleNodeId: "role-node",
    firstReviewedEdge: workflowEdge({ id: "edge-1", target: "node-2" }),
    graphEdges: [workflowEdge({ id: "edge-2", target: "node-3" })],
  };

  const route = workflowCanvasReviewRailPrimaryFocusView({
    ...baseInput,
    activeRouteFocus: "partial",
    activeLinkageFocus: "linked",
  });
  assert.equal(route?.kind, "compiled_route");
  assert.equal(route?.routeTarget, "route-target");
  assert.match(route?.label ?? "", /partial match/);

  const linkage = workflowCanvasReviewRailPrimaryFocusView({
    ...baseInput,
    activeLinkageFocus: "manifest_only",
  });
  assert.equal(linkage?.kind, "compiled_route");
  assert.match(linkage?.tone ?? "", /border-amber-200/);

  const role = workflowCanvasReviewRailPrimaryFocusView({
    ...baseInput,
    activeOrchestrationRoleFocus: "delegated_capability",
  });
  assert.equal(role?.kind, "orchestration_role_node");
  assert.equal(role?.nodeId, "role-node");

  const inspector = workflowCanvasReviewRailPrimaryFocusView({
    ...baseInput,
    activeManifestLinkageFocus: "inspector_only",
    firstLinkedManifestNodeId: null,
  });
  assert.equal(inspector?.kind, "manifest_inspector");
  assert.equal(inspector?.available, true);

  const readiness = workflowCanvasReviewRailPrimaryFocusView({
    ...baseInput,
    activeAfpReadinessFocus: "ready_handoffs",
  });
  assert.equal(readiness?.kind, "readiness_route");
  assert.equal(readiness?.routeTarget, "handoff-target");

  const branch = workflowCanvasReviewRailPrimaryFocusView({
    ...baseInput,
    activeEdgeId: "edge-2",
    branchReviewActive: true,
  });
  assert.equal(branch?.kind, "branch_edge");
  assert.equal(branch?.edgeId, "edge-2");
  assert.equal(branch?.nodeId, "node-3");

  const invoked: string[] = [];
  workflowCanvasReviewRailPrimaryFocusActionView({
    ...baseInput,
    activeRouteFocus: "partial",
    focusRunEdgeTarget: (edgeId, nodeId) => invoked.push(`edge:${edgeId}:${nodeId}`),
    openCompiledRouteReview: (routeTarget) => invoked.push(`route:${routeTarget}`),
    resetInspectorFocus: () => invoked.push("reset_inspector"),
    selectCanvasNode: (nodeId) => invoked.push(`node:${nodeId}`),
    setSelectedNodeId: (nodeId) => invoked.push(`selected:${nodeId ?? "none"}`),
  })?.onClick();
  workflowCanvasReviewRailPrimaryFocusActionView({
    ...baseInput,
    activeManifestLinkageFocus: "inspector_only",
    focusRunEdgeTarget: (edgeId, nodeId) => invoked.push(`edge:${edgeId}:${nodeId}`),
    openCompiledRouteReview: (routeTarget) => invoked.push(`route:${routeTarget}`),
    resetInspectorFocus: () => invoked.push("reset_inspector"),
    selectCanvasNode: (nodeId) => invoked.push(`node:${nodeId}`),
    setSelectedNodeId: (nodeId) => invoked.push(`selected:${nodeId ?? "none"}`),
  })?.onClick();
  assert.deepEqual(invoked, ["route:route-target", "selected:none", "reset_inspector"]);
});

test("workflow canvas review rail state composes targets actions and visibility", () => {
  const graphEdge = workflowEdge({
    condition_label: "success",
    id: "edge-rail",
    source: "node-a",
    target: "node-b",
  });
  const latestManifests = [
    {
      connector_binding: { capability_id: "capability-a" },
      node_id: "manifest-a",
      readiness: { ready: true },
      runtime_kind: "executor",
      source_graph_node_id: "node-a",
    },
    {
      connector_binding: { capability_id: "capability-b" },
      node_id: "manifest-b",
      readiness: { ready: true },
      runtime_kind: "executor",
      source_graph_node_id: "node-b",
    },
  ];
  const latestEdges = [
    {
      from_manifest_node_id: "manifest-a",
      route_label: "success",
      to_manifest_node_id: "manifest-b",
    },
  ];
  const graphDraft = {
    version: "1",
    workflow_id: "workflow-rail",
    title: "Workflow rail",
    status: "draft",
    environment: "dev",
    owner_user_id: "user-1",
    root_node_ids: ["node-a"],
    nodes: [
      workflowNode({ id: "node-a" }),
      workflowNode({ id: "node-b" }),
    ],
    edges: [graphEdge],
    presets: [],
    template_bindings: [],
    optimization_mode: "balanced",
    metadata: {},
  };
  const graphReviewState = workflowCanvasGraphReviewState({
    graphDraft,
    reviewContext: workflowCanvasCompiledReviewContext({
      activeAfpFilter: "capability_boundary",
      activeAfpGapFilter: null,
      activeAfpReadinessFocus: null,
      activeAfpRouteFocus: "full",
      activeManifestLinkageFilter: null,
      activeOrchestrationRole: null,
      activeRouteLinkageFilter: null,
      graphEdges: [graphEdge],
      latestEdges,
      latestManifests,
    }),
  });
  const railState = workflowCanvasReviewRailState({
    activeAfpReadinessFocus: null,
    activeEdgeId: null,
    activeLinkageFocus: null,
    activeManifestLinkageFocus: null,
    activeOrchestrationRoleFocus: null,
    activeRouteFocus: "full",
    activeRun: workflowRun(),
    branchLegendStates: ["completed"],
    clearActionItemsFor: (input) => workflowCanvasReviewRailClearActionViews(input).map((item) => item.id),
    edgeStates: new Map([["edge-rail", "completed"]]),
    graphReviewState,
    primaryFocusFor: workflowCanvasReviewRailPrimaryFocusView,
    topOffsetClass: "top-24",
  });

  assert.equal(railState.activeAfpFilter, "capability_boundary");
  assert.equal(railState.branchReviewActive, true);
  assert.equal(railState.branchRailFocusAvailable, true);
  assert.deepEqual(railState.clearActionItems, ["afp_route", "branch_focus"]);
  assert.equal(railState.firstReviewedEdge?.id, "edge-rail");
  assert.equal(railState.primaryRailFocus?.kind, "compiled_route");
  assert.equal(railState.primaryRailFocus?.routeTarget, "manifest-a:manifest-b:success");
  assert.equal(railState.showCombinedClearAction, true);
  assert.equal(railState.showRail, true);
  assert.equal(railState.topOffsetClass, "top-24");
});

test("workflow canvas edge legend style helpers map visual tokens without mutation", () => {
  const visual = {
    badgeBorder: "#123456",
    badgeFill: "#abcdef",
    badgeText: "#101010",
    stroke: "#654321",
  };

  assert.deepEqual(workflowCanvasEdgeLegendButtonStyle(visual), {
    border: "1px solid #123456",
    "background-color": "#abcdef",
    color: "#101010",
  });
  assert.deepEqual(workflowCanvasEdgeLegendDotStyle(visual), {
    "background-color": "#654321",
  });
});

test("workflow canvas AFP readiness tone and edge helpers preserve review semantics", () => {
  const contractWorkTone = workflowCanvasAfpReadinessTone("needs_contract_work");
  assert.equal(contractWorkTone.clearLabel, "Clear AFP contract-work focus");
  assert.equal(contractWorkTone.overlayLabel, "AFP contract-work review");
  assert.match(contractWorkTone.ringClass, /ring-amber/);
  assert.equal(workflowCanvasCompiledEdgeReadinessStroke("ready_handoffs"), "#0891b2");

  assert.equal(
    workflowCanvasCompiledEdgeAfpOverlayLabel({
      hasAfpFilter: false,
      matchesAfp: false,
      readinessFocus: "ready_handoffs",
      readyHandoff: true,
      touchesAfp: false,
      touchesReadiness: true,
    }),
    "AFP-ready handoff review",
  );
  assert.equal(
    workflowCanvasCompiledEdgeAfpOverlayLabel({
      hasAfpFilter: true,
      matchesAfp: false,
      readinessFocus: null,
      readyHandoff: false,
      touchesAfp: true,
      touchesReadiness: false,
    }),
    "partial AFP route",
  );

  assert.equal(
    workflowCanvasCompiledEdgeOpacity({
      hasAfpFilter: true,
      linkageFilter: null,
      linkageMatches: false,
      matchesAfp: false,
      readinessFocus: null,
      routeMatches: true,
      touchesAfp: false,
      touchesReadiness: false,
    }),
    0.35,
  );
  assert.equal(
    workflowCanvasCompiledEdgeOpacity({
      hasAfpFilter: false,
      linkageFilter: "linked",
      linkageMatches: false,
      matchesAfp: false,
      readinessFocus: null,
      routeMatches: true,
      touchesAfp: false,
      touchesReadiness: false,
    }),
    0.18,
  );
});

test("workflow canvas edge presentation helpers preserve geometry and interaction styles", () => {
  assert.deepEqual(workflowCanvasEdgeLineMidpoint({ x1: 10, y1: 20, x2: 50, y2: 80 }), {
    x: 30,
    y: 50,
  });
  assert.deepEqual(workflowCanvasEdgeLineMidpoint(null), { x: 0, y: 0 });
  assert.equal(workflowCanvasEdgeStrokeWidth({ edgeProtected: false, edgeState: "queued", selected: false }), 4);
  assert.equal(workflowCanvasEdgeStrokeWidth({ edgeProtected: true, edgeState: undefined, selected: false }), 5);
  assert.equal(workflowCanvasEdgeStrokeWidth({ edgeProtected: false, edgeState: undefined, selected: true }), 6);

  assert.deepEqual(
    workflowCanvasEdgeOverlayPositions({
      hasAfpOverlay: true,
      hasCallout: true,
      midY: 100,
    }),
    {
      afpOverlayY: 136,
      calloutY: 128,
      deltaY: 160,
      labelEditY: 68,
      labelTextY: 84,
    },
  );
  assert.deepEqual(
    workflowCanvasEdgeCalloutButtonStyle(
      { border: "#111111", fill: "#eeeeee", textColor: "#222222" },
      true,
    ),
    {
      "background-color": "#eeeeee",
      border: "1px solid #111111",
      color: "#222222",
      "box-shadow": "0 0 0 2px rgba(255,255,255,0.9)",
    },
  );
  assert.deepEqual(
    workflowCanvasEdgeEndpointCircleVisual({
      edgeState: undefined,
      endpoint: "target",
      selected: false,
      stroke: "#059669",
    }),
    { fill: "rgba(37, 99, 235, 0.7)", radius: "4" },
  );
  assert.deepEqual(
    workflowCanvasEdgeLineAnimationState({
      edgeState: "completed",
      fallbackDasharray: "2 2",
      refreshing: true,
    }),
    {
      dasharray: "6 3",
      style: { "stroke-dashoffset": "0", animation: "dash-flow 1s linear infinite" },
    },
  );
});

test("workflow canvas edge render visual helper composes focus visuals", () => {
  const state = workflowCanvasEdgeRenderVisualState({
    activeAfpFilter: true,
    activeReadinessFocus: null,
    activeRouteLinkageFilter: "linked",
    edgeCallout: null,
    edgeFocusState: {
      matchesAfp: false,
      matchesLinkageFocus: false,
      matchesRouteFocus: true,
      readyHandoff: false,
      touchesAfp: true,
      touchesReadiness: false,
    },
    edgeId: "edge-1",
    edgeProtected: false,
    edgeState: "queued",
    line: { x1: 0, y1: 0, x2: 40, y2: 60 },
    selectedEdgeId: "edge-1",
    visual: { dasharray: "4 2", stroke: "#334155" },
  });

  assert.equal(state.edgeAfpOverlayLabel, "partial AFP route");
  assert.match(state.edgeAfpOverlayClass, /border-amber/);
  assert.equal(state.effectiveStroke, "#f59e0b");
  assert.equal(state.effectiveOpacity, 0.18);
  assert.equal(state.midX, 20);
  assert.equal(state.strokeWidth, 6);
  assert.deepEqual(state.sourceEndpointCircle, { fill: "#f59e0b", radius: "5" });
  assert.equal(state.edgeOverlayLayout.afpOverlayY, 36);

  const canvasState = workflowCanvasEdgeCanvasRenderState({
    activeAfpFilter: "capability_boundary",
    activeReadinessFocus: "ready_handoffs",
    activeRouteFocus: "full",
    activeRouteLinkageFilter: "linked",
    edge: workflowEdge({ id: "edge-ab", source: "node-a", target: "node-b" }),
    edgeCallout: { className: "callout", text: "queued" },
    edgePolicyDelta: { deploymentId: "dep-1", nodeId: "node-b", changes: [], source: "deployment_context" },
    edgeProtected: true,
    edgeState: "queued",
    latestManifests: [
      { node_id: "manifest-a", source_graph_node_id: "node-a" },
      { node_id: "manifest-b", source_graph_node_id: "node-b" },
    ],
    line: { x1: 0, y1: 0, x2: 20, y2: 40 },
    linkedGraphEdgeIds: new Set(["edge-ab"]),
    matchingNodeIds: new Set(["node-a", "node-b"]),
    readyHandoffGraphEdgeIds: new Set(["edge-ab"]),
    readyManifestIds: new Set(["manifest-a", "manifest-b"]),
    refreshing: true,
    selectedEdgeId: "edge-ab",
    visual: { dasharray: "2 2", stroke: "#334155" },
  });
  assert.equal(canvasState.edgePolicyDelta?.deploymentId, "dep-1");
  assert.equal(canvasState.edgeAfpOverlayLabel, "AFP route match");
  assert.equal(canvasState.edgeSelected, true);
  assert.equal(canvasState.strokeWidth, 6);
  assert.equal(canvasState.lineAnimation.dasharray, "6 3");
  assert.deepEqual(canvasState.line, { x1: 0, y1: 0, x2: 20, y2: 40 });

  const edge = workflowEdge({ id: "edge-run", source: "node-a", target: "node-b" });
  const runPresentation = workflowCanvasEdgeRunPresentationState({
    activeRun: null,
    edge,
    edgePolicyDeltas: new Map([[
      "edge-run",
      { deploymentId: "dep-2", nodeId: "node-b", source: "replay_policy_delta" },
    ]]),
    edgeReviewState: {
      activeAfpFilter: "capability_boundary",
      activeAfpReadinessFocus: null,
      activeAfpRouteFocus: "partial",
      activeRouteLinkageFilter: null,
      latestManifests: [],
      linkedGraphEdgeIds: new Set(),
      matchingNodeIds: null,
      readyHandoffGraphEdgeIds: new Set(),
      readyManifestIds: new Set(),
    },
    edgeStates: new Map([["edge-run", "completed"]]),
    graphDraft: {
      version: "1",
      workflow_id: "workflow-1",
      title: "Workflow",
      status: "draft",
      environment: "dev",
      owner_user_id: "user-1",
      root_node_ids: ["node-a"],
      edges: [edge],
      nodes: [
        workflowNode({ id: "node-a", position: { x: 10, y: 20 } }),
        workflowNode({ id: "node-b", position: { x: 70, y: 100 } }),
      ],
      presets: [],
      template_bindings: [],
      optimization_mode: "balanced",
      metadata: {},
    },
    protectedEdgeIds: new Set(["edge-run"]),
    refreshing: true,
    selectedEdgeId: "edge-run",
  });
  assert.equal(runPresentation.edgePolicyDelta?.deploymentId, "dep-2");
  assert.equal(runPresentation.edgeState, "completed");
  assert.equal(runPresentation.strokeWidth, 6);
  assert.equal(runPresentation.lineAnimation.dasharray, "6 3");
  assert.equal(runPresentation.line?.x1, 100);
  assert.equal(runPresentation.line?.y2, 132);
  assert.equal(workflowCanvasEdgeLegendVisual("completed").legend, "Taken branch");
});

test("workflow canvas compiled edge classes and strokes preserve AFP matching branches", () => {
  assert.equal(
    workflowCanvasCompiledEdgeStroke({
      fallbackStroke: "#334155",
      hasAfpFilter: true,
      matchesAfp: true,
      touchesAfp: false,
    }),
    "#059669",
  );
  assert.equal(
    workflowCanvasCompiledEdgeStroke({
      fallbackStroke: "#334155",
      hasAfpFilter: false,
      matchesAfp: true,
      touchesAfp: true,
    }),
    "#334155",
  );
  assert.match(
    workflowCanvasCompiledEdgeAfpOverlayClass({
      matchesAfp: false,
      touchesAfp: false,
    }),
    /border-slate/,
  );
});

test("workflow canvas compiled manifest helpers normalize readiness and source data", () => {
  const readyManifest = {
    node_id: "manifest-ready",
    runtime_kind: "executor",
    source_graph_node_id: "node-ready",
    connector_binding: { capability_id: "capability-email", trace_source: "run_trace" },
    memory: { scope: "thread" },
    memory_scope: "thread",
    trace: { source: "run_trace" },
  };
  const scaffoldManifest = {
    node_id: "manifest-plan",
    runtime_kind: "plan",
    source_graph_node_id: "node-plan",
  };
  const manifests = [readyManifest, scaffoldManifest];

  assert.equal(workflowCanvasRecordStringField(readyManifest, "node_id"), "manifest-ready");
  assert.equal(workflowCanvasRecordStringField(readyManifest, "missing"), null);
  assert.equal(workflowCanvasCompiledManifestRuntimeKind(readyManifest), "executor");
  assert.equal(workflowCanvasCompiledManifestCapabilityId(readyManifest), "capability-email");
  assert.equal(workflowCanvasCompiledManifestSourceGraphNodeId(readyManifest), "node-ready");
  assert.equal(workflowCanvasCompiledManifestAfpCategory(readyManifest), "capability_boundary");

  const readiness = workflowCanvasCompiledManifestAfpReadinessInfo(readyManifest);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.manifestNodeId, "manifest-ready");
  assert.deepEqual(readiness.afpGapKinds, []);

  const readyIds = workflowCanvasCompiledReadyManifestIds(manifests);
  assert.deepEqual([...readyIds], ["manifest-ready"]);
  assert.equal(workflowCanvasFirstAfpReadyManifestSourceNodeId(manifests, readyIds), "node-ready");
  assert.equal(workflowCanvasFirstAfpContractWorkSourceNodeId(manifests), "node-plan");
  assert.equal(workflowCanvasFirstLinkedManifestSourceNodeId(manifests), "node-ready");
  assert.equal(
    workflowCanvasFirstOrchestrationRoleSourceNodeId(manifests, "delegated_capability"),
    "node-ready",
  );
  assert.equal(workflowCanvasCompiledManifestMatchesOrchestrationRole(readyManifest, "delegated_capability"), true);

  const nodeState = workflowCanvasCompiledNodeManifestState({
    latestManifests: manifests,
    nodeId: "node-ready",
  });
  assert.equal(nodeState.compiledRuntimeKind, "executor");
  assert.equal(nodeState.compiledAfpContract.category, "capability_boundary");
  assert.equal(nodeState.compiledManifestNodeId, "manifest-ready");
  assert.equal(workflowCanvasCompiledManifestByNodeId(manifests, "node-plan"), scaffoldManifest);
});

test("workflow canvas compiled route helpers derive handoffs and route targets", () => {
  const manifests = [
    {
      node_id: "manifest-a",
      runtime_kind: "executor",
      source_graph_node_id: "node-a",
      connector_binding: { capability_id: "capability-a" },
      memory: { scope: "thread" },
      trace: { source: "run_trace" },
    },
    {
      node_id: "manifest-b",
      runtime_kind: "executor",
      source_graph_node_id: "node-b",
      connector_binding: { capability_id: "capability-b" },
      memory: { scope: "thread" },
      trace: { source: "run_trace" },
    },
    {
      node_id: "manifest-c",
      runtime_kind: "plan",
      source_graph_node_id: "node-c",
    },
  ];
  const readyIds = workflowCanvasCompiledReadyManifestIds(manifests);
  const edges = [
    {
      from_manifest_node_id: "manifest-a",
      route_label: "success",
      to_manifest_node_id: "manifest-b",
    },
    {
      from_manifest_node_id: "manifest-a",
      to_manifest_node_id: "manifest-c",
    },
  ];

  assert.deepEqual(workflowCanvasCompiledRouteEndpointIds(edges[0] ?? {}), {
    fromManifestNodeId: "manifest-a",
    routeLabel: "success",
    toManifestNodeId: "manifest-b",
  });
  assert.equal(workflowCanvasCompiledRouteFocusTarget(edges[0] ?? {}), "manifest-a:manifest-b:success");
  assert.equal(workflowCanvasCompiledRouteFocusTarget(edges[1] ?? {}), "manifest-a:manifest-c:default");

  const pair = workflowCanvasCompiledRouteManifestPair(edges[0] ?? {}, manifests);
  assert.equal(pair.fromManifest?.source_graph_node_id, "node-a");
  assert.equal(pair.toManifest?.source_graph_node_id, "node-b");

  assert.equal(workflowCanvasCompiledReadyHandoffEntries(edges, readyIds).length, 1);
  assert.deepEqual([...workflowCanvasCompiledReadyHandoffManifestIds(edges, readyIds)].sort(), [
    "manifest-a",
    "manifest-b",
  ]);
  assert.equal(workflowCanvasFirstAfpReadyHandoffRouteTarget(edges, readyIds), "manifest-a:manifest-b:success");

  const reviewData = workflowCanvasCompiledReadinessReviewData(manifests, edges);
  assert.equal(reviewData.readyHandoffEntries.length, 1);
  assert.equal(
    workflowCanvasCompiledReadinessManifestCount({
      manifests,
      readinessFocus: "ready_handoffs",
      readyHandoffManifestIds: reviewData.readyHandoffManifestIds,
      readyManifestIds: reviewData.readyManifestIds,
    }),
    2,
  );
});

test("workflow canvas compiled review aggregation helpers link graph routes and rail targets", () => {
  const manifests = [
    {
      node_id: "manifest-a",
      runtime_kind: "executor",
      source_graph_node_id: "node-a",
      connector_binding: { capability_id: "capability-a" },
      memory: { scope: "thread" },
      trace: { source: "run_trace" },
    },
    {
      node_id: "manifest-b",
      runtime_kind: "executor",
      source_graph_node_id: "node-b",
      connector_binding: { capability_id: "capability-b" },
      memory: { scope: "thread" },
      trace: { source: "run_trace" },
    },
    {
      node_id: "manifest-c",
      runtime_kind: "plan",
      source_graph_node_id: "node-c",
    },
  ];
  const compiledEdges = [
    { from_manifest_node_id: "manifest-a", route_label: "success", to_manifest_node_id: "manifest-b" },
    { from_manifest_node_id: "manifest-a", route_label: "fallback", to_manifest_node_id: "manifest-c" },
  ];
  const graphEdges = [
    workflowEdge({ id: "edge-ab", source: "node-a", target: "node-b", condition_label: "success" }),
    workflowEdge({ id: "edge-ac", source: "node-a", target: "node-c", condition_label: "fallback" }),
  ];
  const readyIds = workflowCanvasCompiledReadyManifestIds(manifests);

  assert.equal(
    workflowCanvasCompiledRouteGraphEdgeId({
      entry: compiledEdges[0] ?? {},
      graphEdges,
      manifests,
    }),
    "edge-ab",
  );
  assert.deepEqual(
    [...workflowCanvasCompiledReadyHandoffGraphEdgeIds({
      compiledEdges,
      graphEdges,
      latestManifests: manifests,
      readyManifestIds: readyIds,
    })],
    ["edge-ab"],
  );
  assert.deepEqual(
    [...workflowCanvasCompiledAfpMatchingNodeIds({
      activeAfpFilter: "capability_boundary",
      latestManifests: manifests,
    }) ?? []].sort(),
    ["node-a", "node-b"],
  );
  assert.deepEqual(
    [...workflowCanvasCompiledFocusOverlayMatchingNodeIds({
      activeAfpFilter: null,
      activeManifestLinkageFilter: null,
      latestManifests: manifests,
    })],
    ["node-a", "node-b", "node-c"],
  );
  assert.deepEqual(
    [...workflowCanvasCompiledFocusOverlayMatchingNodeIds({
      activeAfpFilter: "capability_boundary",
      activeManifestLinkageFilter: "linked",
      latestManifests: manifests,
    })].sort(),
    ["node-a", "node-b"],
  );
  assert.deepEqual(
    [...workflowCanvasCompiledFocusOverlayMatchingNodeIds({
      activeAfpFilter: "capability_boundary",
      activeManifestLinkageFilter: "inspector_only",
      latestManifests: manifests,
    })],
    [],
  );
  assert.deepEqual(
    [...workflowCanvasCompiledLinkedGraphEdgeIdsForFocus({
      activeAfpFilter: "capability_boundary",
      activeRouteFocus: "partial",
      graphEdges,
      latestEdges: compiledEdges,
      latestManifests: manifests,
    })],
    ["edge-ac"],
  );
  assert.equal(
    workflowCanvasFirstCompiledRouteFocusTargetForRail({
      activeAfpFilter: "capability_boundary",
      activeLinkageFocus: "linked",
      activeRouteFocus: "full",
      compiledEdges,
      graphEdges,
      manifests,
    }),
    "manifest-a:manifest-b:success",
  );

  const edgeReviewData = workflowCanvasCompiledEdgeReviewData({
    graphEdges,
    latestEdges: compiledEdges,
    latestManifests: manifests,
  });
  assert.deepEqual([...edgeReviewData.readyHandoffGraphEdgeIds], ["edge-ab"]);

  const reviewContext = workflowCanvasCompiledReviewContext({
    activeAfpFilter: "capability_boundary",
    activeAfpGapFilter: null,
    activeAfpReadinessFocus: "ready_handoffs",
    activeAfpRouteFocus: "partial",
    activeManifestLinkageFilter: "linked",
    activeOrchestrationRole: "delegated_capability",
    activeRouteLinkageFilter: "linked",
    graphEdges,
    latestEdges: compiledEdges,
    latestManifests: manifests,
  });
  const edgeReviewState = workflowCanvasCompiledEdgeReviewState({ graphEdges, reviewContext });
  assert.equal(edgeReviewState.activeAfpFilter, "capability_boundary");
  assert.deepEqual([...edgeReviewState.linkedGraphEdgeIds], ["edge-ac"]);
  assert.deepEqual([...(edgeReviewState.matchingNodeIds ?? [])].sort(), ["node-a", "node-b"]);
  assert.deepEqual([...edgeReviewState.readyHandoffGraphEdgeIds], ["edge-ab"]);
  const nodeReviewState = workflowCanvasCompiledNodeReviewState(reviewContext);
  assert.equal(nodeReviewState.activeManifestLinkageFilter, "linked");
  assert.deepEqual([...nodeReviewState.readyHandoffManifestIds].sort(), ["manifest-a", "manifest-b"]);
  const graphReviewState = workflowCanvasGraphReviewState({
    graphDraft: { edges: graphEdges, nodes: [workflowNode({ id: "node-a" }), workflowNode({ id: "node-b" })] },
    reviewContext,
  });
  assert.equal(graphReviewState.graphNodes.length, 2);
  assert.equal(graphReviewState.edgeReviewState.activeAfpRouteFocus, "partial");
  assert.equal(graphReviewState.nodeReviewState.activeOrchestrationRole, "delegated_capability");

  const targetState = workflowCanvasReviewRailTargetState({
    activeAfpFilter: "capability_boundary",
    activeEdgeId: null,
    activeLinkageFocus: "linked",
    activeOrchestrationRoleFocus: "delegated_capability",
    activeRouteFocus: "full",
    compiledEdges,
    edgeStates: new Map([["edge-ac", "queued"]]),
    graphEdges,
    manifests,
    readyManifestIds: readyIds,
  });
  assert.equal(targetState.branchRailFocusAvailable, true);
  assert.equal(targetState.firstReviewedEdge?.id, "edge-ac");
  assert.equal(targetState.firstCompiledRouteFocusTarget, "manifest-a:manifest-b:success");
  assert.equal(targetState.firstAfpReadyHandoffTarget, "manifest-a:manifest-b:success");
  assert.equal(targetState.firstOrchestrationRoleNodeId, "node-a");
});

test("workflow canvas compiled route stats and match helpers preserve focus rules", () => {
  const manifests = [
    {
      node_id: "manifest-a",
      runtime_kind: "executor",
      source_graph_node_id: "node-a",
      connector_binding: { capability_id: "capability-a" },
      memory: { scope: "thread" },
      trace: { source: "run_trace" },
    },
    {
      node_id: "manifest-b",
      runtime_kind: "executor",
      source_graph_node_id: "node-b",
      connector_binding: { capability_id: "capability-b" },
      memory: { scope: "thread" },
      trace: { source: "run_trace" },
    },
    {
      node_id: "manifest-c",
      runtime_kind: "plan",
      source_graph_node_id: "node-c",
    },
  ];
  const compiledEdges = [
    { from_manifest_node_id: "manifest-a", route_label: "success", to_manifest_node_id: "manifest-b" },
    { from_manifest_node_id: "manifest-a", route_label: "fallback", to_manifest_node_id: "manifest-c" },
  ];
  const graphEdges = [
    workflowEdge({ id: "edge-ab", source: "node-a", target: "node-b", condition_label: "success" }),
  ];
  const readyIds = workflowCanvasCompiledReadyManifestIds(manifests);
  const readyHandoffGraphEdgeIds = workflowCanvasCompiledReadyHandoffGraphEdgeIds({
    compiledEdges,
    graphEdges,
    latestManifests: manifests,
    readyManifestIds: readyIds,
  });

  assert.deepEqual(
    workflowCanvasCompiledOrchestrationRoleRouteStats({
      compiledEdges,
      graphEdges,
      manifests,
      role: "delegated_capability",
    }),
    {
      focusedRouteCount: 2,
      graphLinkedRouteCount: 1,
      inspectorOnlyRouteCount: 1,
    },
  );
  const railState = workflowCanvasReviewRailOrchestrationRouteState({
    activeLinkageFocus: "manifest_only",
    compiledEdges,
    graphEdges,
    manifests,
    orchestrationRole: "delegated_capability",
  });
  assert.equal(railState.activeRouteLinkageFocus, "manifest_only");
  assert.match(railState.inspectorOnlyRouteFocusButton.className, /ring-amber/);

  const edgeFocus = workflowCanvasCompiledEdgeFocusState({
    activeReadinessFocus: "ready_handoffs",
    activeRouteFocus: "full",
    activeRouteLinkageFilter: "linked",
    edge: graphEdges[0] ?? workflowEdge(),
    latestManifests: manifests,
    linkedGraphEdgeIds: new Set(["edge-ab"]),
    matchingNodeIds: new Set(["node-a", "node-b"]),
    readyHandoffGraphEdgeIds,
    readyManifestIds: readyIds,
  });
  assert.deepEqual(edgeFocus, {
    matchesAfp: true,
    matchesLinkageFocus: true,
    matchesRouteFocus: true,
    readyHandoff: true,
    touchesAfp: true,
    touchesReadiness: true,
  });

  const nodeState = workflowCanvasCompiledNodeManifestState({
    latestManifests: manifests,
    nodeId: "node-a",
  });
  const nodeMatch = workflowCanvasCompiledNodeMatchState({
    activeAfpFilter: "capability_boundary",
    activeGapFilter: null,
    activeManifestLinkageFilter: "linked",
    activeOrchestrationRole: "delegated_capability",
    activeReadinessFocus: "ready_handoffs",
    activeRouteFocus: "partial",
    afpCategory: nodeState.compiledAfpContract.category,
    afpGapKinds: nodeState.compiledAfpGapKinds,
    compiledManifest: nodeState.compiledManifest,
    compiledManifestNodeId: nodeState.compiledManifestNodeId,
    compiledOrchestrationRole: nodeState.compiledOrchestrationRole,
    edges: [
      workflowEdge({ id: "edge-ac", source: "node-a", target: "node-c", condition_label: "fallback" }),
    ],
    latestManifests: manifests,
    nodeId: "node-a",
    readyHandoffManifestIds: new Set(["manifest-a", "manifest-b"]),
    readyManifestIds: readyIds,
  });
  assert.equal(nodeMatch.matchesAfp, true);
  assert.equal(nodeMatch.matchesManifestLinkage, true);
  assert.equal(nodeMatch.matchesOrchestrationRole, true);
  assert.equal(nodeMatch.matchesReadiness, true);
  assert.equal(nodeMatch.participatesInRouteFocus, true);
});

test("workflow canvas compiled node review visual helper preserves overlay priorities", () => {
  assert.match(NODE_CARD_CHIP_BASE_CLASS, /rounded-full/);
  assert.match(NODE_CARD_CHIP_HOVER_CLASS, /hover:bg-white/);
  assert.match(NODE_CARD_WHITE_CHIP_CLASS, /text-on-surface-variant/);

  const roleVisual = workflowCanvasCompiledNodeReviewVisualState({
    activeAfpFilter: "capability",
    activeGapFilter: "missing_contract",
    activeManifestLinkageFilter: "linked",
    activeOrchestrationRole: "delegated_capability",
    activeReadinessFocus: "ready_manifests",
    activeRouteFocus: "full",
    compiledManifest: { id: "manifest-1" },
    compiledOrchestrationRole: {
      chipClass: "role-chip",
      label: "delegated capability unit",
    },
    matchesAfp: false,
    matchesGap: true,
    matchesManifestLinkage: true,
    matchesOrchestrationRole: true,
    matchesReadiness: true,
    participatesInRouteFocus: false,
  });
  assert.equal(roleVisual.afpFilterOverlayClass, "role-chip");
  assert.equal(roleVisual.afpFilterOverlayLabel, "delegated capability unit");
  assert.match(roleVisual.compiledFocusClass, /ring-cyan/);

  const readinessVisual = workflowCanvasCompiledNodeReviewVisualState({
    activeAfpFilter: null,
    activeGapFilter: null,
    activeManifestLinkageFilter: null,
    activeOrchestrationRole: null,
    activeReadinessFocus: "ready_handoffs",
    activeRouteFocus: null,
    compiledManifest: null,
    compiledOrchestrationRole: {
      chipClass: "role-chip",
      label: "delegated capability unit",
    },
    matchesAfp: false,
    matchesGap: false,
    matchesManifestLinkage: false,
    matchesOrchestrationRole: false,
    matchesReadiness: false,
    participatesInRouteFocus: true,
  });
  assert.equal(readinessVisual.afpFilterOverlayLabel, "outside compiled AFP readiness");
  assert.match(readinessVisual.afpFilterOverlayClass, /border-slate/);
  assert.equal(workflowCanvasCompiledAfpReadinessFocusChipClass("ready_handoffs"), "border-cyan-200/70 text-cyan-700");

  const canvasReviewState = workflowCanvasCompiledNodeCanvasReviewState({
    activeAfpFilter: "capability_boundary",
    activeGapFilter: null,
    activeManifestLinkageFilter: "linked",
    activeOrchestrationRole: "delegated_capability",
    activeReadinessFocus: "ready_manifests",
    activeRouteFocus: "full",
    graphEdges: [
      workflowEdge({ id: "edge-ab", source: "node-a", target: "node-b" }),
    ],
    latestManifests: [
      {
        node_id: "manifest-a",
        runtime_kind: "executor",
        source_graph_node_id: "node-a",
        connector_binding: { capability_id: "capability-a" },
        memory: { scope: "thread" },
        trace: { source: "run_trace" },
      },
      {
        node_id: "manifest-b",
        runtime_kind: "executor",
        source_graph_node_id: "node-b",
        connector_binding: { capability_id: "capability-b" },
        memory: { scope: "thread" },
        trace: { source: "run_trace" },
      },
    ],
    nodeId: "node-a",
    readyHandoffManifestIds: new Set(),
    readyManifestIds: new Set(["manifest-a"]),
  });
  assert.equal(canvasReviewState.compiledManifestNodeId, "manifest-a");
  assert.equal(canvasReviewState.afpFilterOverlayLabel, "delegated capability unit");
  assert.equal(canvasReviewState.readinessFocusChipClass, "border-emerald-200/70 text-emerald-700");
  assert.equal(canvasReviewState.showCompiledLinkedManifestFocus, true);
  assert.equal(canvasReviewState.showCompiledOrchestrationRoleFocus, true);
  assert.equal(canvasReviewState.showCompiledAfpReadinessFocus, true);
  assert.equal(canvasReviewState.showCompiledRouteReviewFocus, true);
});

test("workflow canvas header and empty states preserve simple visibility rules", () => {
  assert.deepEqual(workflowCanvasHeaderState("3.0 s"), { runEta: "3.0 s" });
  assert.deepEqual(workflowCanvasEmptyState({ busyAction: null, graph: { nodes: [] } }), { show: true });
  assert.deepEqual(workflowCanvasEmptyState({ busyAction: "load", graph: { nodes: [] } }), { show: false });
  assert.deepEqual(workflowCanvasEmptyState({ busyAction: null, graph: { nodes: [{ id: "n" }] } }), { show: false });
});

test("workflow canvas shared review banner visibility is explicit", () => {
  const state = workflowCanvasSharedReviewBannerState({
    summary: ["workflow", "run"],
    visible: true,
  });

  assert.deepEqual(workflowCanvasVisibleSharedReviewBannerState(state), state);
  assert.equal(
    workflowCanvasVisibleSharedReviewBannerState({ ...state, visible: false }),
    null,
  );
});

test("workflow canvas run overlay summarizes run metadata defensively", () => {
  assert.equal(workflowCanvasRunOverlayState({ nodePolicyDeltaCount: 0, run: null }), null);
  assert.deepEqual(
    workflowCanvasRunOverlayState({
      nodePolicyDeltaCount: 1,
      run: workflowRun(),
    }),
    {
      durationLabel: "1.3 s",
      executionMode: "dry_run",
      nodePolicyDeltaCount: 1,
      nodePolicyDeltaLabel: "1 node policy delta highlighted",
      timelineCount: 2,
    },
  );
  assert.equal(
    workflowCanvasRunOverlayState({
      nodePolicyDeltaCount: 2,
      run: workflowRun({ result: {}, timeline: [] }),
    })?.executionMode,
    "live",
  );
});

test("workflow canvas edge legend states are ordered and deduped", () => {
  assert.deepEqual(
    workflowCanvasEdgeLegendStates([
      "completed",
      "failed",
      "failed",
      "queued",
      "waiting_for_resume",
    ]),
    ["failed", "waiting_for_resume", "queued", "completed"],
  );
});

test("workflow canvas overlay chrome derives offset and lock visibility", () => {
  assert.equal(workflowCanvasOverlayTopOffsetClass(null), "top-4");
  assert.equal(workflowCanvasOverlayTopOffsetClass("approval"), "top-24");

  const locked = workflowCanvasOverlayChromeState({
    activeAfpFilter: "approval",
    interactionLockLabel: "Saving",
    interactionLocked: true,
  });
  assert.deepEqual(locked, {
    interactionLockLabel: "Saving",
    interactionLocked: true,
    topOffsetClass: "top-24",
  });
  assert.deepEqual(workflowCanvasVisibleInteractionLockState(locked), locked);
  assert.equal(
    workflowCanvasVisibleInteractionLockState({ ...locked, interactionLocked: false }),
    null,
  );
});
