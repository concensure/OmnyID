import test from "node:test";
import assert from "node:assert/strict";

import type { WorkflowGraphDraft } from "../src/lib/workflowGraphTypes.ts";
import {
  workflowElapsedLabel,
  workflowRailFamilySummaryLabel,
  workflowRailFirstMatchingNodeId,
  workflowRailMatchingNodeIds,
  workflowRailMatchingNodeSummary,
  workflowRailNormalizeTags,
  workflowRailTagsAfterSave,
  workflowRunEtaLabel,
  workflowRailRunStatsBadge,
  workflowRailTagItems,
  workflowRailTriggerBadge,
  workflowRailVersionDiff,
  workflowRailVersionItems,
  workflowExecutionRefreshing,
  workflowInteractionLocked,
  workflowInteractionLockLabel,
  workflowActiveDeployment,
  workflowDeploymentEnvironment,
  workflowDeploymentHistoryById,
  workflowDeployPreviewDiff,
  workflowDownstreamNodeIds,
  workflowIdleNodes,
  workflowLatestRunForDeployment,
  workflowMinimapBounds,
  workflowNodeDeploymentPolicies,
  workflowNodeLabelsById,
  workflowNodeSuccessRates,
  workflowOutgoingEdgeTargets,
  workflowOutgoingTargetNodes,
  workflowPendingNodeDeploymentPolicies,
  workflowPendingDeploymentChangeSummary,
  workflowRunHistoryEntries,
  workflowRunHistoryEntriesForView,
  workflowRunHistoryLineageOptions,
  workflowSavedReviewActiveFilterActionLabel,
  workflowSavedReviewActiveFilters,
  workflowSavedReviewCollapseActionLabel,
  workflowSavedReviewCompositionActionLabel,
  workflowSavedReviewCompositionChipClass,
  workflowSavedReviewCompositionSummary,
  workflowSavedReviewEmptyStateActions,
  workflowSavedReviewEmptyStateLabel,
  workflowSavedReviewExpandActionLabel,
  workflowSavedReviewFilterClass,
  workflowSavedReviewFilteredSelectorEntries,
  workflowSavedReviewGroupedSelectorEntries,
  workflowSavedReviewLegendActionLabel,
  workflowSavedReviewLegendClass,
  workflowSavedReviewPreviewContextActionLabel,
  workflowSavedReviewPreviewContextClass,
  workflowSavedReviewPreviewContextSummary,
  workflowSavedReviewSelectorEntry,
  workflowSavedReviewSelectorEntryActionLabel,
  workflowSavedReviewSavedAtLabel,
  workflowSavedReviewScopeMismatch,
  workflowSavedReviewShareModeCounts,
  workflowSavedReviewShareModeActionLabel,
  workflowSavedReviewSortActionLabel,
  workflowSavedReviewStaleness,
  workflowSavedReviewSummary,
  workflowSavedReviewWorkspaceActive,
  workflowSharedReviewBannerSummary,
  workflowSharedReviewBannerSummaryForView,
  workflowSavedReviewToneLegendEntries,
  workflowSelectedEdge,
  workflowSelectedNode,
  workflowSelectedNodeOutgoingEdgeTargets,
  workflowSelectedNodeOutgoingTargetNodes,
  workflowSelectedRun,
  workflowSelectedRunEdgeIdAfterGraphChange,
  workflowSelectedRunEdgeIdAfterRunChange,
  workflowSelectedRunEdgePolicyDeltas,
  workflowSelectedRunNodePolicyDeltas,
  workflowTimestampMs,
  workflowWaitResumeSummary,
  workflowUpstreamNodeIds,
  workflowVersionNodeLabels,
} from "../src/lib/workflowRailState.ts";

test("workflowVersionNodeLabels trims labels and falls back safely", () => {
  assert.deepEqual(
    workflowVersionNodeLabels([
      { label: " Node A ", id: "ignored" },
      { label: "   ", id: " node-b " },
      { id: "   " },
      null,
      ["bad"],
    ]),
    ["Node A", "node-b", "?", "?", "?"],
  );
});

test("workflowRailVersionDiff compares adjacent snapshots defensively", () => {
  assert.deepEqual(
    workflowRailVersionDiff({
      diffIds: [0, 1],
      versions: [
        { ts: "2026-07-18T00:01:00.000Z", nodes: [{ label: "A" }, { label: "C" }] },
        { ts: "2026-07-18T00:00:00.000Z", nodes: [{ label: "A" }, { label: "B" }] },
      ],
    }),
    {
      added: ["C"],
      label: "v1 -> v2",
      removed: ["B"],
    },
  );
  assert.equal(workflowRailVersionDiff({ diffIds: [0, 2], versions: [] }), null);
});

test("workflowRailVersionItems marks active diff and malformed timestamps", () => {
  const items = workflowRailVersionItems({
    activeDiff: [0, 1],
    versions: [
      { ts: "not-a-date", nodes: [] },
      { ts: "2026-07-18T00:00:00.000Z", nodes: [] },
    ],
  });

  assert.equal(items[0]?.diffActive, true);
  assert.equal(items[0]?.hasPrev, true);
  assert.equal(items[0]?.timeLabel, "unknown");
  assert.equal(items[0]?.versionNumber, 2);
  assert.equal(items[1]?.hasPrev, false);
});

test("workflowTimestampMs returns zero for malformed timestamps", () => {
  assert.equal(workflowTimestampMs("not-a-date"), 0);
  assert.equal(workflowTimestampMs(null), 0);
  assert.ok(workflowTimestampMs("2026-07-18T00:00:00.000Z") > 0);
});

test("workflowRailRunStatsBadge maps success rates to stable labels", () => {
  assert.equal(workflowRailRunStatsBadge(null), null);
  assert.equal(workflowRailRunStatsBadge({ ok: 0, fail: 0 }), null);
  assert.deepEqual(workflowRailRunStatsBadge({ ok: 9, fail: 1 })?.label, "90% ok - 10 runs");
  assert.match(workflowRailRunStatsBadge({ ok: 6, fail: 4 })?.className ?? "", /amber/);
  assert.match(workflowRailRunStatsBadge({ ok: 1, fail: 4 })?.className ?? "", /red/);
});

test("workflowRailTriggerBadge handles preview-only and empty trigger states", () => {
  assert.equal(
    workflowRailTriggerBadge({
      triggerLiveRegistrationSupported: null,
      triggerPreviewStatus: null,
    }),
    null,
  );
  const preview = workflowRailTriggerBadge({
    triggerLiveRegistrationSupported: false,
    triggerPreviewStatus: "ready",
  });
  assert.ok(preview);
  assert.match(preview.className, /amber/);
  assert.match(preview.title ?? "", /preview-only/);
});

test("workflowRailFamilySummaryLabel handles empty and plural families", () => {
  assert.equal(workflowRailFamilySummaryLabel({ familyCount: 0, collapsedCount: 3 }), null);
  assert.deepEqual(workflowRailFamilySummaryLabel({ familyCount: 1, collapsedCount: -1 }), {
    collapsedCount: 0,
    familyLabel: "1 branch family",
  });
  assert.deepEqual(workflowRailFamilySummaryLabel({ familyCount: 2, collapsedCount: 1 }), {
    collapsedCount: 1,
    familyLabel: "2 branch families",
  });
});

test("workflowRailNormalizeTags trims, removes empties, and dedupes case-insensitively", () => {
  assert.deepEqual(
    workflowRailNormalizeTags([" Critical ", "", "critical", "Backfill", " backfill "]),
    ["critical", "backfill"],
  );
  assert.deepEqual(
    workflowRailTagItems({
      one: ["Critical", "Backfill"],
      two: ["critical", "Review"],
    }),
    ["critical", "Backfill", "Review"],
  );
});

test("workflowRailTagsAfterSave normalizes and removes empty workflow tag entries", () => {
  const current = { "wf-1": ["Critical"], "wf-2": ["Ops"] };

  assert.deepEqual(workflowRailTagsAfterSave(current, "wf-1", [" Finance ", "finance", ""]), {
    "wf-1": ["finance"],
    "wf-2": ["Ops"],
  });
  assert.deepEqual(workflowRailTagsAfterSave(current, "wf-1", [" ", ""]), {
    "wf-2": ["Ops"],
  });
});

test("workflowRailMatchingNode helpers preserve graph order and summary labels", () => {
  const nodes = [
    { id: "extract", label: "Extract Invoice", kind: "action" },
    { id: "review", label: "Manual Check", kind: "approval" },
  ];
  assert.equal(workflowRailMatchingNodeIds(nodes, "   "), null);
  const matches = workflowRailMatchingNodeIds(nodes, "check");
  assert.deepEqual([...(matches ?? [])], ["review"]);
  assert.equal(workflowRailFirstMatchingNodeId(nodes, matches), "review");
  assert.equal(workflowRailFirstMatchingNodeId(nodes, new Set(["missing"])), null);
  assert.equal(workflowRailMatchingNodeSummary(null), null);
  assert.equal(workflowRailMatchingNodeSummary(0), "No matches");
  assert.equal(workflowRailMatchingNodeSummary(1), "1 node - press Enter to focus first");
  assert.equal(workflowRailMatchingNodeSummary(2), "2 nodes - press Enter to focus first");
});

test("workflow rail selection helpers preserve fallback behavior", () => {
  const nodes = [
    { id: "idle", kind: "idle", label: "Idle" },
    { id: "failed", kind: "failed", label: "Failed" },
    { id: "never", kind: "never_executed", label: "Never" },
    { id: "active", kind: "tool", label: "Active" },
  ];
  const graph = { nodes };
  const runs = [
    { run_id: "run-a", deployment_id: "deploy-a" },
    { run_id: "run-b", deployment_id: "deploy-b" },
  ];

  assert.deepEqual(workflowIdleNodes(nodes).map((node) => node.id), ["idle", "failed", "never"]);
  assert.equal(workflowSelectedNode(graph, "failed")?.id, "failed");
  assert.equal(workflowSelectedNode(graph, "missing"), null);
  assert.equal(workflowSelectedNode(null, "failed"), null);
  assert.equal(workflowSelectedEdge({ edges: [{ id: "edge-a", source: "a", target: "b" }] }, "edge-a")?.id, "edge-a");
  assert.equal(workflowSelectedEdge({ edges: [{ id: "edge-a", source: "a", target: "b" }] }, "missing"), null);
  assert.equal(workflowSelectedRun(runs, "run-b")?.run_id, "run-b");
  assert.equal(workflowSelectedRun(runs, "missing")?.run_id, "run-a");
  assert.equal(workflowSelectedRun([], "missing"), null);
  assert.equal(workflowLatestRunForDeployment(runs, "deploy-b")?.run_id, "run-b");
  assert.equal(workflowLatestRunForDeployment(runs, "missing"), null);
  assert.equal(workflowLatestRunForDeployment(runs, null), null);
});

test("workflow selected run edge cleanup helpers clear stale graph and run selections", () => {
  const edges = [{ id: "edge-a" }, { id: "edge-b" }];

  assert.equal(workflowSelectedRunEdgeIdAfterGraphChange(null, edges), null);
  assert.equal(workflowSelectedRunEdgeIdAfterGraphChange("edge-a", edges), "edge-a");
  assert.equal(workflowSelectedRunEdgeIdAfterGraphChange("missing", edges), null);
  assert.equal(workflowSelectedRunEdgeIdAfterGraphChange("edge-a", null), null);

  assert.equal(
    workflowSelectedRunEdgeIdAfterRunChange({
      selectedEdgeId: "edge-a",
      currentRunId: "run-b",
      previousRunId: "run-a",
      restoringRunReviewContext: false,
    }),
    null,
  );
  assert.equal(
    workflowSelectedRunEdgeIdAfterRunChange({
      selectedEdgeId: "edge-a",
      currentRunId: "run-a",
      previousRunId: "run-a",
      restoringRunReviewContext: false,
    }),
    "edge-a",
  );
  assert.equal(
    workflowSelectedRunEdgeIdAfterRunChange({
      selectedEdgeId: "edge-a",
      currentRunId: "run-b",
      previousRunId: "run-a",
      restoringRunReviewContext: true,
    }),
    "edge-a",
  );
  assert.equal(
    workflowSelectedRunEdgeIdAfterRunChange({
      selectedEdgeId: "edge-a",
      currentRunId: "run-b",
      previousRunId: undefined,
      restoringRunReviewContext: false,
    }),
    "edge-a",
  );
});

test("workflow saved-review workspace activity detects expanded or narrowed review state", () => {
  assert.equal(
    workflowSavedReviewWorkspaceActive({
      selectedSavedReview: null,
      showAll: false,
      filterText: "",
      sortMode: "priority",
    }),
    false,
  );
  assert.equal(
    workflowSavedReviewWorkspaceActive({
      selectedSavedReview: { id: "review-a" },
      showAll: false,
      filterText: "",
      sortMode: "priority",
    }),
    true,
  );
  assert.equal(
    workflowSavedReviewWorkspaceActive({
      selectedSavedReview: null,
      showAll: false,
      filterText: " ops ",
      sortMode: "priority",
    }),
    true,
  );
  assert.equal(
    workflowSavedReviewWorkspaceActive({
      selectedSavedReview: null,
      showAll: false,
      filterText: "",
      sortMode: "recent",
    }),
    true,
  );
});

test("workflowMinimapBounds computes padded canvas extents only for multi-node graphs", () => {
  assert.equal(workflowMinimapBounds([]), null);
  assert.equal(workflowMinimapBounds([{ position: { x: 10, y: 20 } }]), null);
  assert.deepEqual(
    workflowMinimapBounds([
      { position: { x: 10, y: 20 } },
      { position: { x: -30, y: 100 } },
    ]),
    {
      minX: -30,
      minY: 20,
      maxX: 190,
      maxY: 180,
      nodes: [
        { position: { x: 10, y: 20 } },
        { position: { x: -30, y: 100 } },
      ],
    },
  );
});

test("workflow dependency traversal handles branches and cycles", () => {
  const edges = [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
    { source: "a", target: "d" },
    { source: "c", target: "a" },
  ];

  assert.deepEqual([...workflowUpstreamNodeIds(null, edges)], []);
  assert.deepEqual([...workflowUpstreamNodeIds("c", edges)].sort(), ["a", "b", "c"]);
  assert.deepEqual([...workflowDownstreamNodeIds(undefined, edges)], []);
  assert.deepEqual([...workflowDownstreamNodeIds("a", edges)].sort(), ["a", "b", "c", "d"]);
});

test("workflow outgoing graph helpers preserve edge order and skip dangling targets", () => {
  const nodes = [
    {
      id: "source",
      kind: "condition",
      label: "Source",
      position: { x: 0, y: 0 },
      config: {},
      policy: {},
      hidden_runtime_nodes: [],
      metadata: {},
    },
    {
      id: "target-b",
      kind: "tool",
      label: "Target B",
      position: { x: 10, y: 0 },
      config: {},
      policy: {},
      hidden_runtime_nodes: [],
      metadata: {},
    },
    {
      id: "target-a",
      kind: "agent",
      label: "Target A",
      position: { x: 20, y: 0 },
      config: {},
      policy: {},
      hidden_runtime_nodes: [],
      metadata: {},
    },
  ];
  const edges = [
    { id: "edge-b", source: "source", target: "target-b", metadata: {} },
    { id: "edge-missing", source: "source", target: "missing", metadata: {} },
    { id: "edge-a", source: "source", target: "target-a", metadata: {} },
    { id: "edge-other", source: "target-a", target: "target-b", metadata: {} },
  ];
  const graph: WorkflowGraphDraft = {
    version: "omnyid-workflow.v1",
    workflow_id: "workflow-1",
    title: "Outgoing graph",
    status: "draft",
    environment: "dev",
    owner_user_id: "user-1",
    root_node_ids: ["source"],
    nodes,
    edges,
    presets: [],
    template_bindings: [],
    optimization_mode: "balanced",
    metadata: {},
  };

  assert.deepEqual(workflowOutgoingTargetNodes(null, nodes, edges), []);
  assert.deepEqual(workflowOutgoingTargetNodes("source", nodes, edges).map((node) => node.id), ["target-b", "target-a"]);
  assert.deepEqual(
    workflowOutgoingEdgeTargets("source", nodes, edges).map((entry) => [entry.edge.id, entry.targetNode.id]),
    [["edge-b", "target-b"], ["edge-a", "target-a"]],
  );
  assert.deepEqual(workflowSelectedNodeOutgoingTargetNodes(null, nodes[0]), []);
  assert.deepEqual(workflowSelectedNodeOutgoingTargetNodes(graph, null), []);
  assert.deepEqual(
    workflowSelectedNodeOutgoingTargetNodes(graph, nodes[0]).map((node) => node.id),
    ["target-b", "target-a"],
  );
  assert.deepEqual(
    workflowSelectedNodeOutgoingEdgeTargets(graph, nodes[0]).map((entry) => [
      entry.edge.id,
      entry.targetNode.id,
    ]),
    [["edge-b", "target-b"], ["edge-a", "target-a"]],
  );
});

test("workflowElapsedLabel suppresses malformed and future timestamps", () => {
  const now = Date.parse("2026-07-18T00:02:05.000Z");
  assert.equal(workflowElapsedLabel(undefined, now), null);
  assert.equal(workflowElapsedLabel("not-a-date", now), null);
  assert.equal(workflowElapsedLabel("2026-07-18T00:03:00.000Z", now), null);
  assert.equal(workflowElapsedLabel("2026-07-18T00:02:00.000Z", now), "5s");
  assert.equal(workflowElapsedLabel("2026-07-18T00:00:00.000Z", now), "2m5s");
});

test("workflowRunEtaLabel ignores non-finite and negative durations", () => {
  assert.equal(workflowRunEtaLabel([]), null);
  assert.equal(workflowRunEtaLabel([null, Number.NaN, Infinity, -1]), null);
  assert.equal(workflowRunEtaLabel([250, 750]), "<1s");
  assert.equal(workflowRunEtaLabel([1000, 3000]), "~2s");
  assert.equal(workflowRunEtaLabel([60000, 120000]), "~2m");
});

test("workflowSavedReviewStaleness ignores malformed timestamps and reports newer history", () => {
  assert.equal(
    workflowSavedReviewStaleness({
      savedAt: "not-a-date",
      deploymentTimestamps: ["2026-07-18T00:02:00.000Z"],
      runTimestamps: ["2026-07-18T00:03:00.000Z"],
    }),
    null,
  );
  assert.equal(
    workflowSavedReviewStaleness({
      savedAt: "2026-07-18T00:02:00.000Z",
      deploymentTimestamps: ["not-a-date", "2026-07-18T00:01:00.000Z"],
      runTimestamps: [null],
    }),
    null,
  );
  assert.deepEqual(
    workflowSavedReviewStaleness({
      savedAt: "2026-07-18T00:02:00.000Z",
      deploymentTimestamps: ["2026-07-18T00:03:00.000Z"],
      runTimestamps: ["2026-07-18T00:01:00.000Z"],
    }),
    { reasons: ["newer deployment"], label: "stale: newer deployment" },
  );
  assert.deepEqual(
    workflowSavedReviewStaleness({
      savedAt: "2026-07-18T00:02:00.000Z",
      deploymentTimestamps: ["2026-07-18T00:03:00.000Z"],
      runTimestamps: ["2026-07-18T00:04:00.000Z"],
    }),
    {
      reasons: ["newer deployment", "newer run history"],
      label: "stale: newer deployment and newer run history",
    },
  );
});

test("workflowSavedReviewSavedAtLabel formats valid timestamps and preserves malformed labels", () => {
  assert.equal(workflowSavedReviewSavedAtLabel(null), null);
  assert.equal(workflowSavedReviewSavedAtLabel(""), null);
  assert.equal(workflowSavedReviewSavedAtLabel("not-a-date"), "not-a-date");
  assert.equal(typeof workflowSavedReviewSavedAtLabel("2026-07-18T00:00:00.000Z"), "string");
});

test("workflowSavedReviewScopeMismatch reports environment and deployment differences", () => {
  assert.equal(
    workflowSavedReviewScopeMismatch({
      currentDeploymentId: "dep-1",
      currentEnvironment: "dev",
      recordDeploymentId: "dep-1",
      recordEnvironment: "dev",
    }),
    null,
  );
  assert.deepEqual(
    workflowSavedReviewScopeMismatch({
      currentDeploymentId: "dep-2",
      currentEnvironment: "prod",
      recordDeploymentId: "dep-1",
      recordEnvironment: "dev",
    }),
    {
      reasons: ["saved for dev", "different deployment"],
      label: "scope mismatch: saved for dev and different deployment",
    },
  );
  assert.deepEqual(
    workflowSavedReviewScopeMismatch({
      currentDeploymentId: null,
      currentEnvironment: "prod",
      recordDeploymentId: "dep-1",
      recordEnvironment: "prod",
    }),
    null,
  );
});

test("workflowSavedReviewSummary formats review context with node label fallbacks", () => {
  assert.deepEqual(
    workflowSavedReviewSummary({
      deploymentId: "dep_saved_123456",
      environment: "prod",
      nodeLabels: new Map([["node-focus", "Focus Label"]]),
      reviewState: {
        workflow_id: "wf-1",
        run_id: "run_123456789",
        selected_edge_id: "edge-1",
        timeline_filter: "deployment_context",
        focused_node_id: "node-focus",
        selected_deployment_id: "dep_current_123456",
        selected_node_id: "node-missing",
        drift_filter: "deployment",
        sort_mode: "drift_desc",
        selected_review_id: null,
        show_all_saved_reviews: false,
        saved_review_filter: "",
        saved_review_sort_mode: "priority",
        saved_review_share_mode_filter: "all",
        saved_review_pinned_only: false,
      },
      shareMode: "workspace",
    }),
    [
      "workspace snapshot",
      "run run_1234",
      "branch focus",
      "timeline deployment context",
      "focus Focus Label",
      "node node-missing",
      "deployment dep_curr",
      "history deployment drift",
      "sorted by highest drift",
      "env prod",
      "saved dep dep_save",
    ],
  );
  assert.deepEqual(
    workflowSavedReviewSummary({
      deploymentId: null,
      environment: null,
      nodeLabels: new Map(),
      reviewState: null,
      shareMode: "core",
    }),
    [],
  );
});

test("workflowSavedReviewSelectorEntry builds stable labels with title and fallback precedence", () => {
  const reviewState = {
    workflow_id: "wf-1",
    run_id: "run_abcdef",
    selected_edge_id: null,
    timeline_filter: "replay_drift" as const,
    focused_node_id: null,
    selected_deployment_id: null,
    selected_node_id: null,
    drift_filter: "replay" as const,
    sort_mode: "recent" as const,
    selected_review_id: null,
    show_all_saved_reviews: false,
    saved_review_filter: "",
    saved_review_sort_mode: "priority" as const,
    saved_review_share_mode_filter: "all" as const,
    saved_review_pinned_only: false,
  };
  assert.deepEqual(
    workflowSavedReviewSelectorEntry({
      deploymentId: "dep_123456",
      environment: "prod",
      id: "review-1",
      index: 0,
      pinned: true,
      reviewState,
      shareMode: "workspace",
      title: "  Release review  ",
    }),
    {
      id: "review-1",
      label: "Release review",
      pinned: true,
      share_mode: "workspace",
    },
  );
  assert.deepEqual(
    workflowSavedReviewSelectorEntry({
      deploymentId: "dep_123456",
      environment: "prod",
      id: "review-2",
      index: 1,
      pinned: false,
      reviewState,
      shareMode: "core",
      title: null,
    }),
    {
      id: "review-2",
      label: "run run_ab - prod",
      pinned: false,
      share_mode: "core",
    },
  );
  assert.equal(
    workflowSavedReviewSelectorEntry({
      deploymentId: "dep_123456",
      environment: null,
      id: "review-3",
      index: 2,
      pinned: false,
      reviewState: null,
      shareMode: "core",
      title: "",
    }).label,
    "dep dep_12",
  );
  assert.equal(
    workflowSavedReviewSelectorEntry({
      deploymentId: null,
      environment: null,
      id: "review-4",
      index: 3,
      pinned: false,
      reviewState: null,
      shareMode: "core",
      title: "",
    }).label,
    "saved 4",
  );
});

test("workflowSavedReviewFilteredSelectorEntries filters and sorts selector entries defensively", () => {
  const entries = [
    { id: "a", label: "Ops review", pinned: true, share_mode: "workspace" as const },
    { id: "b", label: "Core review", pinned: false, share_mode: "core" as const },
    { id: "c", label: "Replay review", pinned: false, share_mode: "workspace" as const },
  ];
  const records = [
    { id: "a", saved_at: "2026-07-18T00:00:00.000Z", shareMode: "workspace" as const },
    { id: "b", saved_at: "not-a-date", shareMode: "core" as const },
    { id: "c", saved_at: "2026-07-18T00:02:00.000Z", shareMode: "workspace" as const },
  ];

  assert.deepEqual(
    workflowSavedReviewFilteredSelectorEntries({
      entries,
      filterText: "review",
      pinnedOnly: false,
      records,
      shareModeFilter: "all",
      sortMode: "recent",
    }).map((entry) => entry.id),
    ["c", "a", "b"],
  );
  assert.deepEqual(
    workflowSavedReviewFilteredSelectorEntries({
      entries,
      filterText: "ops",
      pinnedOnly: true,
      records,
      shareModeFilter: "workspace",
      sortMode: "priority",
    }).map((entry) => entry.id),
    ["a"],
  );
  assert.deepEqual(
    workflowSavedReviewFilteredSelectorEntries({
      entries,
      filterText: "",
      pinnedOnly: false,
      records,
      shareModeFilter: "core",
      sortMode: "priority",
    }).map((entry) => entry.id),
    ["b"],
  );
});

test("workflowSavedReviewGroupedSelectorEntries separates pinned entries unless recent sorted", () => {
  const entries = [
    { id: "a", label: "Pinned", pinned: true, share_mode: "workspace" as const },
    { id: "b", label: "Recent", pinned: false, share_mode: "core" as const },
  ];
  assert.deepEqual(workflowSavedReviewGroupedSelectorEntries({ entries, sortMode: "priority" }), {
    pinned: [entries[0]],
    recent: [entries[1]],
  });
  assert.deepEqual(workflowSavedReviewGroupedSelectorEntries({ entries, sortMode: "recent" }), {
    pinned: [],
    recent: entries,
  });
});

test("workflowSavedReviewShareModeCounts totals workspace and core records", () => {
  assert.deepEqual(
    workflowSavedReviewShareModeCounts([
      { shareMode: "workspace" },
      { shareMode: "core" },
      { shareMode: "workspace" },
    ]),
    { all: 3, workspace: 2, core: 1 },
  );
  assert.deepEqual(workflowSavedReviewShareModeCounts([]), { all: 0, workspace: 0, core: 0 });
});

test("workflowSavedReviewActiveFilters orders and trims selector filters", () => {
  assert.deepEqual(
    workflowSavedReviewActiveFilters({
      filterText: "  ops  ",
      pinnedOnly: true,
      shareModeFilter: "workspace",
    }),
    [
      { key: "pinned_only", label: "Pinned only", priority: 0 },
      { key: "share_mode", label: "Workspace only", priority: 1 },
      { key: "search", label: "Search: ops", priority: 2 },
    ],
  );
  assert.deepEqual(
    workflowSavedReviewActiveFilters({
      filterText: " ",
      pinnedOnly: false,
      shareModeFilter: "core",
    }),
    [{ key: "share_mode", label: "Core only", priority: 1 }],
  );
});

test("workflowSavedReviewCompositionSummary builds active composition chips", () => {
  assert.deepEqual(
    workflowSavedReviewCompositionSummary({
      counts: { all: 3, workspace: 2, core: 1 },
      filterText: "",
      pinnedCount: 1,
      pinnedOnly: false,
      shareModeFilter: "all",
    }),
    [
      { key: "all", label: "3 saved", active: true },
      { key: "pinned", label: "1 pinned", active: false },
      { key: "workspace", label: "2 workspace", active: false },
      { key: "core", label: "1 core", active: false },
    ],
  );
  assert.deepEqual(
    workflowSavedReviewCompositionSummary({
      counts: { all: 2, workspace: 0, core: 2 },
      filterText: "ops",
      pinnedCount: 0,
      pinnedOnly: false,
      shareModeFilter: "core",
    }),
    [
      { key: "all", label: "2 saved", active: false },
      { key: "core", label: "2 core", active: true },
    ],
  );
});

test("workflowSavedReviewPreviewContextSummary preserves preview chip order", () => {
  assert.deepEqual(
    workflowSavedReviewPreviewContextSummary({
      filterText: "  audit  ",
      pinnedOnly: true,
      shareModeFilter: "core",
      showAll: true,
      sortMode: "recent",
    }),
    [
      { key: "expanded", label: "expanded selector" },
      { key: "pinned_only", label: "pinned only" },
      { key: "share_mode", label: "core only" },
      { key: "search", label: "search audit" },
      { key: "sort_mode", label: "recent sort" },
    ],
  );
  assert.deepEqual(
    workflowSavedReviewPreviewContextSummary({
      filterText: "",
      pinnedOnly: false,
      shareModeFilter: "all",
      showAll: false,
      sortMode: "priority",
    }),
    [],
  );
});

test("workflowSavedReviewEmptyState helpers describe active narrowing", () => {
  assert.equal(
    workflowSavedReviewEmptyStateLabel("workspace"),
    "No workspace snapshots match this view. Share or refresh a full workspace investigation link to create one.",
  );
  assert.equal(
    workflowSavedReviewEmptyStateLabel("core"),
    "No core review snapshots match this view. Share a core review link to create one without the saved-review workspace shell.",
  );
  assert.equal(workflowSavedReviewEmptyStateLabel("all"), "No saved reviews match this filter.");
  assert.deepEqual(
    workflowSavedReviewEmptyStateActions({
      filterText: " ops ",
      pinnedOnly: true,
      shareModeFilter: "workspace",
    }),
    [
      { key: "search", label: "Clear search" },
      { key: "share_mode", label: "Show all share modes" },
      { key: "pinned_only", label: "Show all saved reviews" },
    ],
  );
});

test("workflowSavedReview action labels and chip classes stay stable", () => {
  assert.match(workflowSavedReviewCompositionChipClass("all", true), /violet-300/);
  assert.match(workflowSavedReviewCompositionChipClass("pinned", false), /amber-50/);
  assert.match(workflowSavedReviewCompositionChipClass("workspace", true), /sky-300/);
  assert.equal(workflowSavedReviewCompositionActionLabel("all"), "Show all saved reviews");
  assert.equal(workflowSavedReviewCompositionActionLabel("pinned"), "Focus pinned saved reviews");
  assert.equal(workflowSavedReviewCompositionActionLabel("workspace"), "Focus workspace snapshots");
  assert.equal(workflowSavedReviewCompositionActionLabel("core"), "Focus core snapshots");
  assert.equal(workflowSavedReviewShareModeActionLabel("all"), "Show all saved-review share modes");
  assert.equal(workflowSavedReviewShareModeActionLabel("workspace"), "Show only workspace snapshots");
  assert.equal(workflowSavedReviewShareModeActionLabel("core"), "Show only core review snapshots");
  assert.equal(workflowSavedReviewSortActionLabel("priority"), "Sort saved reviews by pinned priority");
  assert.equal(workflowSavedReviewSortActionLabel("recent"), "Sort saved reviews by most recent first");
  assert.equal(workflowSavedReviewExpandActionLabel(3), "Expand saved-review selector to show 3 more snapshots");
  assert.equal(workflowSavedReviewCollapseActionLabel(), "Collapse the saved-review selector");
});

test("workflowSavedReview filter labels and classes stay stable", () => {
  assert.match(workflowSavedReviewFilterClass("pinned_only"), /amber-50/);
  assert.match(workflowSavedReviewFilterClass("share_mode"), /sky-50/);
  assert.match(workflowSavedReviewFilterClass("search"), /violet-200/);
  assert.match(workflowSavedReviewPreviewContextClass("expanded"), /slate-100/);
  assert.match(workflowSavedReviewPreviewContextClass("sort_mode"), /slate-100/);
  assert.equal(workflowSavedReviewPreviewContextActionLabel("expanded"), "Collapse the saved-review selector");
  assert.equal(workflowSavedReviewPreviewContextActionLabel("pinned_only"), "Clear pinned-only focus");
  assert.equal(workflowSavedReviewPreviewContextActionLabel("share_mode"), "Clear share-mode focus");
  assert.equal(workflowSavedReviewPreviewContextActionLabel("search"), "Clear saved-review search");
  assert.equal(workflowSavedReviewPreviewContextActionLabel("sort_mode"), "Reset saved-review sort to priority");
  assert.equal(workflowSavedReviewActiveFilterActionLabel("pinned_only"), "Clear pinned-only focus");
  assert.equal(workflowSavedReviewActiveFilterActionLabel("share_mode"), "Clear share-mode focus");
  assert.equal(workflowSavedReviewActiveFilterActionLabel("search"), "Clear saved-review search");
  assert.doesNotMatch(workflowSavedReviewLegendClass("pinned_only"), /hover:/);
});

test("workflowSavedReview selector and legend helpers preserve accessible text", () => {
  assert.equal(
    workflowSavedReviewSelectorEntryActionLabel({
      label: "Ops review",
      pinned: true,
      share_mode: "workspace",
    }, true),
    "Reopen saved review: Ops review, pinned, workspace snapshot",
  );
  assert.equal(
    workflowSavedReviewSelectorEntryActionLabel({
      label: "Core review",
      pinned: false,
      share_mode: "core",
    }, false),
    "Open saved review: Core review, core snapshot",
  );
  assert.equal(workflowSavedReviewLegendActionLabel("pinned"), "Focus pinned saved reviews");
  assert.equal(workflowSavedReviewLegendActionLabel("workspace"), "Focus workspace snapshots");
  assert.equal(workflowSavedReviewLegendActionLabel("core"), "Focus core snapshots");
  assert.equal(workflowSavedReviewLegendActionLabel("clear_search"), "Clear saved-review search");
  assert.equal(workflowSavedReviewLegendActionLabel(null), null);
  assert.deepEqual(
    workflowSavedReviewToneLegendEntries({
      counts: { workspace: 2, core: 1 },
      filterText: " ops ",
      hasPinnedRecord: true,
      hasWorkspaceRecord: true,
      pinnedOnly: false,
      shareModeFilter: "all",
    }),
    [
      { key: "pinned_only", label: "Pinned focus", target: "pinned" },
      { key: "share_mode", label: "Share mode", target: "workspace" },
      { key: "search", label: "Search or general", target: "clear_search" },
    ],
  );
  assert.deepEqual(
    workflowSavedReviewToneLegendEntries({
      counts: { workspace: 0, core: 0 },
      filterText: "",
      hasPinnedRecord: false,
      hasWorkspaceRecord: false,
      pinnedOnly: false,
      shareModeFilter: "all",
    }),
    [{ key: "search", label: "Search or general", target: null }],
  );
});

test("workflowRunHistoryEntriesForView filters drift and lineage before sorting", () => {
  const entries = [
    {
      run: { started_at: "2026-07-18T00:00:00.000Z" },
      deploymentImpact: 0,
      replayImpact: 2,
      totalImpact: 2,
      lineage: { familyId: "fam-a", familyAssetWorkflowId: "asset-a", instanceWorkflowId: "inst-a" },
      id: "run-old-replay",
    },
    {
      run: { started_at: "2026-07-18T00:03:00.000Z" },
      deploymentImpact: 1,
      replayImpact: 0,
      totalImpact: 1,
      lineage: { familyId: "fam-a", familyAssetWorkflowId: "asset-b", instanceWorkflowId: "inst-b" },
      id: "run-new-deploy",
    },
    {
      run: { started_at: "not-a-date" },
      deploymentImpact: 5,
      replayImpact: 5,
      totalImpact: 10,
      lineage: { familyId: "fam-b", familyAssetWorkflowId: "asset-c", instanceWorkflowId: "inst-c" },
      id: "run-invalid-date",
    },
  ];

  assert.deepEqual(
    workflowRunHistoryEntriesForView({
      assetFilter: "all",
      entries,
      familyFilter: "fam-a",
      filterMode: "any",
      instanceFilter: "all",
      sortMode: "recent",
    }).map((entry) => entry.id),
    ["run-new-deploy", "run-old-replay"],
  );
  assert.deepEqual(
    workflowRunHistoryEntriesForView({
      assetFilter: "all",
      entries,
      familyFilter: "all",
      filterMode: "deployment",
      instanceFilter: "all",
      sortMode: "drift_desc",
    }).map((entry) => entry.id),
    ["run-invalid-date", "run-new-deploy"],
  );
  assert.deepEqual(
    workflowRunHistoryEntriesForView({
      assetFilter: "asset-a",
      entries,
      familyFilter: "all",
      filterMode: "replay",
      instanceFilter: "inst-a",
      sortMode: "recent",
    }).map((entry) => entry.id),
    ["run-old-replay"],
  );
});

test("workflow run history builders derive drift, lineage, and selected-run policy deltas", () => {
  const graph = {
    version: "1",
    workflow_id: "wf-1",
    title: "Workflow",
    status: "draft",
    environment: "staging",
    owner_user_id: "owner",
    root_node_ids: ["node-a"],
    nodes: [
      {
        id: "node-a",
        kind: "tool",
        label: "Node A",
        position: { x: 0, y: 0 },
        config: {},
        policy: {},
        hidden_runtime_nodes: [],
        metadata: {},
      },
      {
        id: "node-b",
        kind: "tool",
        label: "Node B",
        position: { x: 200, y: 0 },
        config: {},
        policy: {},
        hidden_runtime_nodes: [],
        metadata: {},
      },
    ],
    edges: [{ id: "edge-ab", source: "node-a", target: "node-b", metadata: {} }],
    presets: [],
    template_bindings: [],
    optimization_mode: "balanced",
    metadata: {},
  };
  const deployment = {
    deployment_id: "dep-1",
    workflow_id: "wf-1",
    owner_user_id: "owner",
    environment: "staging",
    status: "active",
    ir_snapshot: {
      metadata: {
        deployment_change_summary: {
          changed_nodes: [
            {
              node_id: "node-b",
              field_changes: [
                { field: "delivery_tier", previous: "staging", current: "production" },
              ],
            },
          ],
        },
      },
    },
    trigger_readiness_summary: null,
    graph_snapshot: {},
    deployed_at: "2026-07-18T00:00:00.000Z",
    created_at: "2026-07-18T00:00:00.000Z",
  };
  const run = {
    run_id: "run-new",
    workflow_id: "wf-1",
    deployment_id: "dep-1",
    owner_user_id: "owner",
    status: "completed",
    trigger_kind: "manual",
    timeline: [
      {
        node_id: "node-b",
        status: "completed",
        trace: { action: { deployment_id: "dep-1" } },
      },
    ],
    result: {
      workflow_family_context: {
        family_id: "fam-a",
        family_asset_workflow_id: "asset-a",
        instance_workflow_id: "inst-a",
      },
    },
    started_at: "2026-07-18T00:02:00.000Z",
    created_at: "2026-07-18T00:02:00.000Z",
  };
  const oldRun = {
    ...run,
    run_id: "run-old",
    timeline: [],
    result: {},
    started_at: "2026-07-18T00:01:00.000Z",
    created_at: "2026-07-18T00:01:00.000Z",
  };
  const deploymentLookup = new Map([["dep-1", deployment]]);

  const nodeDeltas = workflowSelectedRunNodePolicyDeltas({ deploymentLookup, graph, run });
  assert.deepEqual(nodeDeltas.get("node-b"), {
    source: "deployment_policy_delta",
    deploymentId: "dep-1",
    changes: [{ field: "delivery_tier", current: "staging", next: "production" }],
  });
  assert.equal(workflowSelectedRunNodePolicyDeltas({ deploymentLookup, graph: null, run }).size, 0);

  const edgeDeltas = workflowSelectedRunEdgePolicyDeltas({ deploymentLookup, graph, run });
  assert.deepEqual(edgeDeltas.get("edge-ab"), {
    nodeId: "node-b",
    relation: "to",
    source: "deployment_policy_delta",
    deploymentId: "dep-1",
    changes: [{ field: "delivery_tier", current: "staging", next: "production" }],
  });
  assert.equal(workflowSelectedRunEdgePolicyDeltas({ deploymentLookup, graph, run: null }).size, 0);

  const entries = workflowRunHistoryEntries({
    assetFilter: "asset-a",
    deploymentLookup,
    familyFilter: "fam-a",
    filterMode: "deployment",
    graph,
    instanceFilter: "inst-a",
    runs: [oldRun, run],
    sortMode: "recent",
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].run.run_id, "run-new");
  assert.equal(entries[0].deploymentImpact, 2);
  assert.equal(entries[0].replayImpact, 0);
  assert.equal(entries[0].totalImpact, 2);
  assert.equal(entries[0].lineage?.familyId, "fam-a");
});

test("workflowRunHistoryLineageOptions dedupes and sorts available lineage filters", () => {
  assert.deepEqual(
    workflowRunHistoryLineageOptions([
      { familyId: "fam-b", familyAssetWorkflowId: "asset-b", instanceWorkflowId: "inst-b" },
      { familyId: "fam-a", familyAssetWorkflowId: "asset-a", instanceWorkflowId: "inst-a" },
      { familyId: "fam-a", familyAssetWorkflowId: "asset-a", instanceWorkflowId: "inst-a" },
      null,
    ]),
    {
      familyIds: ["fam-a", "fam-b"],
      assetWorkflowIds: ["asset-a", "asset-b"],
      instanceWorkflowIds: ["inst-a", "inst-b"],
    },
  );
});

test("workflow interaction lock helpers preserve busy-state behavior", () => {
  assert.equal(workflowInteractionLocked("compile"), true);
  assert.equal(workflowInteractionLocked("save"), false);
  assert.equal(workflowInteractionLocked(null), false);
  assert.equal(workflowExecutionRefreshing("run", 0, 100), true);
  assert.equal(workflowExecutionRefreshing("compile", 200, 100), true);
  assert.equal(workflowExecutionRefreshing("compile", 50, 100), false);
  assert.equal(workflowInteractionLockLabel("compile"), "Compiling workflow IR");
  assert.equal(workflowInteractionLockLabel("deploy"), "Deploying workflow");
  assert.equal(workflowInteractionLockLabel("run"), "Running workflow");
  assert.equal(workflowInteractionLockLabel("dry_run"), "Simulating workflow");
  assert.equal(workflowInteractionLockLabel("replay"), "Replaying workflow");
  assert.equal(workflowInteractionLockLabel("rollback"), "Rolling back deployment");
  assert.equal(workflowInteractionLockLabel(undefined), "Workflow locked");
});

test("workflowNodeSuccessRates computes defensive per-node completion rates", () => {
  const rates = workflowNodeSuccessRates([
    {
      timeline: [
        { node_id: "node-a", status: "completed" },
        { node_id: "node-b", status: "failed" },
        { node_id: "", status: "completed" },
        { status: "completed" },
      ],
    },
    {
      timeline: [
        { node_id: "node-a", status: "failed" },
        { node_id: "node-b", status: "completed" },
        { node_id: "node-b", status: "completed" },
      ],
    },
    { timeline: "bad" },
  ]);

  assert.equal(rates.get("node-a"), 0.5);
  assert.equal(rates.get("node-b"), 2 / 3);
  assert.equal(rates.has(""), false);
  assert.equal(workflowNodeSuccessRates([]).size, 0);
});

test("workflowWaitResumeSummary groups pending, follow-up, and resolved states", () => {
  assert.deepEqual(workflowWaitResumeSummary([]), {
    activeFollowup: 0,
    pending: 0,
    resolved: 0,
    total: 0,
  });
  assert.deepEqual(
    workflowWaitResumeSummary([
      { status: "pending" },
      { status: "wake_dispatched" },
      { status: "continued_to_new_wait" },
      { status: "resumed" },
      { status: "cancelled" },
      { status: "unexpected" },
      {},
    ]),
    {
      activeFollowup: 1,
      pending: 2,
      resolved: 4,
      total: 7,
    },
  );
});

test("workflow deployment preview helpers count pending and changed node policies", () => {
  const nodes = [
    { id: "node-a", label: "Node A" },
    { id: "node-b", label: "Node B" },
    { id: "node-c", label: "Node C" },
  ];
  const deployedPolicies = new Map([
    ["node-a", {
      deploymentId: "dep-1",
      environment: "staging",
      family: null,
      provider: null,
      service: null,
      source: "deployment",
      fields: { delivery_tier: "staging", auth_mode: "sandbox_credentials" },
    }],
    ["node-b", {
      deploymentId: "dep-1",
      environment: "staging",
      family: null,
      provider: null,
      service: null,
      source: "deployment",
      fields: { delivery_tier: "staging", auth_mode: "sandbox_credentials" },
    }],
  ]);
  const pendingPolicies = new Map([
    ["node-a", {
      environment: "production",
      family: null,
      source: "pending",
      fields: { delivery_tier: "production", auth_mode: "sandbox_credentials" },
    }],
    ["node-b", {
      environment: "staging",
      family: null,
      source: "pending",
      fields: { delivery_tier: "staging", auth_mode: "sandbox_credentials" },
    }],
  ]);

  assert.deepEqual(
    workflowPendingDeploymentChangeSummary({ deployedPolicies, nodes, pendingPolicies }),
    { changedNodeCount: 1, pendingNodeCount: 2 },
  );
  assert.deepEqual(workflowDeployPreviewDiff({ deployedPolicies, nodes, pendingPolicies }), [
    {
      nodeId: "node-a",
      label: "Node A",
      changes: [{ field: "delivery_tier", current: "staging", next: "production" }],
    },
  ]);
  assert.deepEqual(
    workflowPendingDeploymentChangeSummary({
      deployedPolicies: new Map(),
      nodes: [],
      pendingPolicies,
    }),
    { changedNodeCount: 0, pendingNodeCount: 0 },
  );
});

test("workflow deployment map helpers normalize environment and build lookup maps", () => {
  const toolNode = {
    id: "node-email",
    kind: "tool",
    label: "Email",
    position: { x: 0, y: 0 },
    config: { capability_id: "email" },
    policy: {},
    hidden_runtime_nodes: [],
    metadata: {},
  };
  const graph = {
    environment: "prod",
    nodes: [
      toolNode,
      {
        id: "node-agent",
        kind: "agent",
        label: "Agent",
        position: { x: 100, y: 0 },
        config: {},
        policy: {},
        hidden_runtime_nodes: [],
        metadata: {},
      },
    ],
  };
  const deployment = {
    deployment_id: "dep-prod",
    workflow_id: "wf-1",
    owner_user_id: "owner",
    environment: "prod",
    status: "active",
    ir_snapshot: {
      manifests: [
        {
          source_graph_node_id: "node-email",
          connector_binding: {
            integration_family: "communications",
            provider: "smtp",
            service: "mail",
            deployment_overrides: {
              prod: {
                source: "deployment_override",
                delivery_tier: "production",
                auth_mode: "oauth",
                side_effects: "enabled",
                provider_route: "primary",
              },
            },
          },
        },
      ],
    },
    trigger_readiness_summary: null,
    graph_snapshot: {},
    deployed_at: "2026-07-18T00:00:00.000Z",
    created_at: "2026-07-18T00:00:00.000Z",
  };
  const fallbackDeployment = { ...deployment, deployment_id: "dep-dev", environment: "dev" };

  assert.equal(workflowDeploymentEnvironment(graph), "prod");
  assert.equal(workflowDeploymentEnvironment({ environment: "staging" }), "dev");
  assert.equal(workflowActiveDeployment({ deployments: [fallbackDeployment, deployment], graph })?.deployment_id, "dep-prod");
  assert.deepEqual([...workflowDeploymentHistoryById([deployment]).keys()], ["dep-prod"]);
  assert.deepEqual([...workflowNodeLabelsById(graph).entries()], [["node-email", "Email"], ["node-agent", "Agent"]]);

  const deployedPolicies = workflowNodeDeploymentPolicies({ deployment, graph });
  assert.deepEqual(deployedPolicies.get("node-email")?.fields, {
    delivery_tier: "production",
    auth_mode: "oauth",
    side_effects: "enabled",
    provider_route: "primary",
  });
  assert.equal(deployedPolicies.has("node-agent"), false);

  const pendingPolicies = workflowPendingNodeDeploymentPolicies({
    deploymentDraft: {
      delivery_tier: "staging",
      auth_mode: "sandbox_credentials",
      side_effects: "preview_only",
      provider_route: "sandbox",
    },
    familyOverrides: { communications: { auth_mode: "oauth" } },
    graph,
    nodeOverrides: { "node-email": { provider_route: "primary" } },
  });
  assert.deepEqual(pendingPolicies.get("node-email")?.fields, {
    delivery_tier: "staging",
    auth_mode: "oauth",
    side_effects: "preview_only",
    provider_route: "primary",
  });
  assert.equal(pendingPolicies.has("node-agent"), false);
  assert.equal(workflowNodeDeploymentPolicies({ deployment: null, graph: null }).size, 0);
  assert.equal(
    workflowPendingNodeDeploymentPolicies({
      deploymentDraft: {},
      familyOverrides: {},
      graph: null,
      nodeOverrides: {},
    }).size,
    0,
  );
});

test("workflowSharedReviewBannerSummary assembles visible review context in stable order", () => {
  assert.deepEqual(
    workflowSharedReviewBannerSummary({
      deployment: null,
      edge: null,
      focusedNodeLabel: null,
      run: null,
      runHistoryDriftFilter: "all",
      runHistorySortMode: "recent",
      runTimelineFilterMode: "all",
      savedReviewLabel: null,
      selectedNodeLabel: null,
      showAllSavedReviews: false,
      storedSharedReviewFilter: "",
      storedSharedReviewPinnedOnly: false,
      storedSharedReviewShareModeFilter: "all",
      storedSharedReviewSortMode: "priority",
      visible: false,
      workflow: { title: "Hidden" },
    }),
    [],
  );
  assert.deepEqual(
    workflowSharedReviewBannerSummary({
      deployment: { environment: "production", deployment_id: "dep-123456789" },
      edge: { source: "source-node", target: "target-node", condition_label: " approved " },
      focusedNodeLabel: "Approval",
      run: { run_id: "run-abcdef123456" },
      runHistoryDriftFilter: "deployment",
      runHistorySortMode: "drift_desc",
      runTimelineFilterMode: "failed",
      savedReviewLabel: "Ops snapshot",
      selectedNodeLabel: "Selected node",
      showAllSavedReviews: true,
      storedSharedReviewFilter: " ops ",
      storedSharedReviewPinnedOnly: true,
      storedSharedReviewShareModeFilter: "workspace",
      storedSharedReviewSortMode: "recent",
      visible: true,
      workflow: { title: " Launch " },
    }),
    [
      "workflow Launch",
      "run run-abcd",
      "branch approved",
      "timeline failed steps",
      "focus Approval",
      "node Selected node",
      "deployment production:dep-1234",
      "history deployment drift",
      "sorted by highest drift",
      "saved review Ops snapshot",
      "saved reviews expanded",
      "saved review filter ops",
      "saved reviews sorted by recent",
      "saved reviews workspace only",
      "saved reviews pinned only",
    ],
  );
  assert.deepEqual(
    workflowSharedReviewBannerSummary({
      deployment: { environment: "staging", deployment_id: "" },
      edge: { source: "a", target: "b", condition_label: " " },
      focusedNodeLabel: null,
      run: { run_id: "" },
      runHistoryDriftFilter: "all",
      runHistorySortMode: "recent",
      runTimelineFilterMode: "all",
      savedReviewLabel: "",
      selectedNodeLabel: null,
      showAllSavedReviews: false,
      storedSharedReviewFilter: "",
      storedSharedReviewPinnedOnly: false,
      storedSharedReviewShareModeFilter: "all",
      storedSharedReviewSortMode: "priority",
      visible: true,
      workflow: { title: "" },
    }),
    ["branch a -> b"],
  );
});

test("workflowSharedReviewBannerSummaryForView resolves ids before formatting banner context", () => {
  assert.deepEqual(
    workflowSharedReviewBannerSummaryForView({
      deploymentId: "dep-123456789",
      deploymentLookup: new Map([
        ["dep-123456789", { deployment_id: "dep-123456789", environment: "prod" }],
      ]),
      focusedNodeId: "focus-node",
      graph: {
        edges: [
          {
            id: "edge-a",
            source: "source-node",
            target: "target-node",
            condition_label: "approved",
          },
        ],
      },
      nodeLabels: new Map([["focus-node", "Focus label"]]),
      run: { run_id: "run-abcdef123456" },
      runHistoryDriftFilter: "all",
      runHistorySortMode: "recent",
      runTimelineFilterMode: "deployment_context",
      selectedEdgeId: "edge-a",
      selectedNodeId: "missing-selected",
      selectedSavedReview: { label: "Ops snapshot" },
      showAllSavedReviews: false,
      storedSharedReviewFilter: "",
      storedSharedReviewPinnedOnly: false,
      storedSharedReviewShareModeFilter: "all",
      storedSharedReviewSortMode: "priority",
      visible: true,
      workflow: { title: "Launch" },
    }),
    [
      "workflow Launch",
      "run run-abcd",
      "branch approved",
      "timeline deployment context",
      "focus Focus label",
      "node missing-selected",
      "deployment prod:dep-1234",
      "saved review Ops snapshot",
    ],
  );
});
