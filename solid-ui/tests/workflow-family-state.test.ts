import test from "node:test";
import assert from "node:assert/strict";

import type { SavedWorkflow } from "../src/lib/api.ts";
import type { WorkflowGraphDraft, WorkflowNodeDraft } from "../src/lib/workflowGraphTypes.ts";
import {
  acceptedWorkflowTemplateIdsFromMetadata,
  branchFamilyRootIdsWithChildren,
  collapsedBranchFamilyIdsAfterToggle,
  collapsedBranchFamilyIdsAfterSelectedWorkflow,
  collapsedBranchFamilyIdsExceptSelected,
  collapsedBranchFamilyIdsForAvailableWorkflows,
  filteredWorkflowsForRail,
  workflowBranchPresetFailureFeedback,
  workflowBranchPresetLabelsForEdges,
  workflowBranchPresetSuccessFeedback,
  workflowBranchPresetUnavailableFeedback,
  workflowBranchScaffoldDraftWorkflow,
  workflowBranchScaffoldFailureFeedback,
  workflowBranchScaffoldForNode,
  workflowBranchScaffoldPreflightFeedback,
  workflowBranchScaffoldSelectedNodeId,
  workflowBranchScaffoldSuccessFeedback,
  workflowBranchFamilySummary,
  workflowBranchVisibleInRail,
  workflowFamilyAssetGraphFromDraft,
  workflowFamilyInstanceCreatedFeedback,
  workflowFamilyInstanceGraphFromAsset,
  workflowFamilyInstancePreflightFeedback,
  workflowFamilyNodeWithAppliedParameters,
  workflowFamilyPromotionPreflightFeedback,
  workflowFamilyPromotionSavedFeedback,
  workflowGraphAfterBranchPresetLabels,
} from "../src/lib/workflowFamilyState.ts";

function workflow(id: string, parentId?: string): SavedWorkflow {
  return {
    workflow_id: id,
    owner_user_id: "user-1",
    title: id,
    favorite: false,
    preset_kinds: [],
    graph: parentId
      ? { metadata: { branch_origin: { parent_workflow_id: parentId } } }
      : { metadata: {} },
    created_at: `2026-07-18T00:00:00.000Z`,
    updated_at: `2026-07-18T00:00:00.000Z`,
  };
}

function node(role: string, config: Record<string, unknown> = {}): WorkflowNodeDraft {
  return {
    id: role,
    kind: "tool",
    label: role,
    description: "",
    position: { x: 0, y: 0 },
    config,
    policy: {},
    hidden_runtime_nodes: [],
    metadata: { semantic_role: role },
  };
}

function branchGraph(): WorkflowGraphDraft {
  return {
    version: "omnyid-workflow.v1",
    workflow_id: "wf-branch",
    title: "Branch graph",
    status: "draft",
    environment: "dev",
    owner_user_id: "user-1",
    root_node_ids: ["source"],
    nodes: [
      {
        ...node("source"),
        kind: "condition",
        label: "Source",
        position: { x: 50, y: 80 },
      },
      {
        ...node("target-a"),
        label: "Target A",
      },
      {
        ...node("target-b"),
        label: "Target B",
      },
    ],
    edges: [
      { id: "edge-a", source: "source", target: "target-a", condition_label: "old-a", metadata: {} },
      { id: "edge-b", source: "source", target: "target-b", condition_label: "old-b", metadata: {} },
      { id: "edge-other", source: "target-a", target: "target-b", condition_label: "kept", metadata: {} },
    ],
    presets: [],
    template_bindings: [],
    optimization_mode: "balanced",
    metadata: {},
  };
}

test("branchFamilyRootIdsWithChildren returns only root workflows with branch children", () => {
  const workflows = [
    workflow("root-a"),
    workflow("branch-a-1", "root-a"),
    workflow("root-b"),
    workflow("orphan-branch", "missing-root"),
  ];

  assert.deepEqual([...branchFamilyRootIdsWithChildren(workflows)], ["root-a"]);
});

test("filteredWorkflowsForRail preserves rail ordering before applying tag filters", () => {
  const root = { ...workflow("root"), updated_at: "2026-07-18T00:00:00.000Z" };
  const branch = { ...workflow("branch", "root"), updated_at: "2026-07-20T00:00:00.000Z" };
  const recent = { ...workflow("recent"), updated_at: "2026-07-19T00:00:00.000Z" };
  const workflows = [root, branch, recent];

  assert.deepEqual(
    filteredWorkflowsForRail({
      workflows,
      tagFilter: null,
      tagsByWorkflow: {},
      favoritesOnly: false,
    }).map((entry) => entry.workflow_id),
    ["recent", "root", "branch"],
  );
  assert.deepEqual(
    filteredWorkflowsForRail({
      workflows,
      tagFilter: "ops",
      tagsByWorkflow: {
        root: ["ops"],
        branch: ["ops"],
        recent: ["finance"],
      },
      favoritesOnly: false,
    }).map((entry) => entry.workflow_id),
    ["root", "branch"],
  );
});

test("filteredWorkflowsForRail can limit the rail to favorited workflows", () => {
  const root = { ...workflow("root"), favorite: true, updated_at: "2026-07-18T00:00:00.000Z" };
  const branch = { ...workflow("branch", "root"), favorite: false, updated_at: "2026-07-20T00:00:00.000Z" };
  const recent = { ...workflow("recent"), favorite: true, updated_at: "2026-07-19T00:00:00.000Z" };

  assert.deepEqual(
    filteredWorkflowsForRail({
      workflows: [root, branch, recent],
      tagFilter: null,
      tagsByWorkflow: {},
      favoritesOnly: true,
    }).map((entry) => entry.workflow_id),
    ["recent", "root"],
  );
});

test("workflowBranchVisibleInRail keeps roots and selected children visible when collapsed", () => {
  const root = workflow("root-a");
  const branch = workflow("branch-a-1", "root-a");
  const collapsedFamilyIds = new Set(["root-a"]);

  assert.equal(
    workflowBranchVisibleInRail({ workflow: root, collapsedFamilyIds, selectedWorkflowId: null }),
    true,
  );
  assert.equal(
    workflowBranchVisibleInRail({ workflow: branch, collapsedFamilyIds, selectedWorkflowId: null }),
    false,
  );
  assert.equal(
    workflowBranchVisibleInRail({
      workflow: branch,
      collapsedFamilyIds,
      selectedWorkflowId: "branch-a-1",
    }),
    true,
  );
});

test("collapsedBranchFamilyIdsAfterToggle toggles ids without mutating current state", () => {
  const current = new Set(["root-a"]);
  assert.deepEqual([...collapsedBranchFamilyIdsAfterToggle(current, "root-a")], []);
  assert.deepEqual([...current], ["root-a"]);
  assert.deepEqual([...collapsedBranchFamilyIdsAfterToggle(current, "root-b")], ["root-a", "root-b"]);
});

test("collapsed branch family cleanup helpers prune stale ids and expand selected families", () => {
  const root = workflow("root-a");
  const branch = workflow("branch-a-1", "root-a");
  const otherRoot = workflow("root-b");
  const workflows = [root, branch, otherRoot];

  assert.deepEqual(
    [...collapsedBranchFamilyIdsForAvailableWorkflows({
      collapsedFamilyIds: new Set(["root-a", "missing"]),
      workflows,
    })],
    ["root-a"],
  );

  assert.deepEqual(
    [...collapsedBranchFamilyIdsAfterSelectedWorkflow({
      collapsedFamilyIds: new Set(["root-a", "root-b"]),
      selectedWorkflowId: "branch-a-1",
      workflows,
    })],
    ["root-b"],
  );
  assert.deepEqual(
    [...collapsedBranchFamilyIdsAfterSelectedWorkflow({
      collapsedFamilyIds: new Set(["root-a"]),
      selectedWorkflowId: "missing",
      workflows,
    })],
    ["root-a"],
  );
});

test("workflowBranchFamilySummary ignores collapsed ids that are not active families", () => {
  assert.deepEqual(
    workflowBranchFamilySummary({
      workflows: [workflow("root-a"), workflow("branch-a-1", "root-a"), workflow("root-b")],
      collapsedFamilyIds: new Set(["root-a", "root-b", "missing"]),
    }),
    { familyCount: 1, collapsedCount: 1 },
  );
});

test("collapsedBranchFamilyIdsExceptSelected collapses every family except the selected root family", () => {
  const workflows = [
    workflow("root-a"),
    workflow("branch-a-1", "root-a"),
    workflow("root-b"),
    workflow("branch-b-1", "root-b"),
  ];

  assert.deepEqual([...collapsedBranchFamilyIdsExceptSelected({ workflows, selectedWorkflowId: "branch-a-1" })], [
    "root-b",
  ]);
  assert.deepEqual([...collapsedBranchFamilyIdsExceptSelected({ workflows, selectedWorkflowId: null })], [
    "root-a",
    "root-b",
  ]);
});

test("workflowFamilyNodeWithAppliedParameters applies source, numeric, and output parameters", () => {
  assert.deepEqual(
    workflowFamilyNodeWithAppliedParameters(node("pdf_source"), { source_kind: "thread_artifact" }).config,
    { source_kind: "thread_artifact" },
  );
  assert.deepEqual(
    workflowFamilyNodeWithAppliedParameters(node("weather_source"), {
      location_query: "Sydney",
      forecast_days: "10",
    }).config,
    { location_query: "Sydney", forecast_days: 10 },
  );
  assert.deepEqual(
    workflowFamilyNodeWithAppliedParameters(node("budget_source"), {
      horizon_months: "bad",
      currency: "AUD",
    }).config,
    { horizon_months: 6, currency: "AUD" },
  );
  assert.deepEqual(
    workflowFamilyNodeWithAppliedParameters(node("spreadsheet_output", { final_schema: { stable: true } }), {
      export_format: "csv",
    }).config,
    { final_schema: { stable: true, formats: ["csv"] } },
  );
});

test("workflowFamilyNodeWithAppliedParameters applies chart, digest, and review parameters", () => {
  assert.deepEqual(
    workflowFamilyNodeWithAppliedParameters(node("chart_output"), { chart_type: "bar" }).config,
    { final_schema: { preferred_chart_type: "bar" } },
  );
  assert.deepEqual(
    workflowFamilyNodeWithAppliedParameters(node("digest_output"), { digest_style: "action_items" }).config,
    { final_schema: { digest_kind: "action_items" } },
  );
  assert.deepEqual(
    workflowFamilyNodeWithAppliedParameters(node("review_step"), { review_mode: "suggest_only" }).policy,
    { approval_mode: "suggest_only" },
  );
  const unchanged = node("unrelated");
  assert.equal(workflowFamilyNodeWithAppliedParameters(unchanged, {}), unchanged);
});

test("workflow branch preset helpers normalize labels and relabel selected edges only", () => {
  const draft = branchGraph();
  const labels = workflowBranchPresetLabelsForEdges(3, ["success", "fallback"]);
  const next = workflowGraphAfterBranchPresetLabels({
    draft,
    edgeIds: ["edge-a", "edge-b"],
    labels,
  });

  assert.deepEqual(labels, ["success", "fallback", "fallback"]);
  assert.deepEqual(
    next.edges.map((edge) => [edge.id, edge.condition_label]),
    [
      ["edge-a", "success"],
      ["edge-b", "fallback"],
      ["edge-other", "kept"],
    ],
  );
  assert.equal(draft.edges[0].condition_label, "old-a");
});

test("workflow branch preset feedback helpers preserve handler copy", () => {
  assert.equal(
    workflowBranchPresetUnavailableFeedback(),
    "Connect this node to downstream branches before applying a branch preset.",
  );
  assert.equal(workflowBranchPresetSuccessFeedback("Decision"), "Applied branch preset to Decision.");
  assert.equal(
    workflowBranchPresetFailureFeedback(new Error("patch failed")),
    "Could not apply branch preset: patch failed",
  );
  assert.equal(
    workflowBranchPresetFailureFeedback("bad response"),
    "Could not apply branch preset: bad response",
  );
});

test("workflowBranchScaffoldForNode creates branch nodes and edges without mutating the draft", () => {
  const draft = branchGraph();
  const source = draft.nodes[0];
  const result = workflowBranchScaffoldForNode({
    draft,
    node: source,
    labels: ["approve", "reject"],
  });

  assert.equal(draft.nodes.length, 3);
  assert.equal(draft.edges.length, 3);
  assert.equal(result.nextNodes.length, 2);
  assert.equal(result.nextEdges.length, 2);
  assert.deepEqual(result.nextNodes.map((entry) => entry.label), ["Approve", "Reject"]);
  assert.deepEqual(result.nextEdges.map((entry) => entry.condition_label), ["approve", "reject"]);
  assert.ok(result.nextNodes.every((entry) => entry.metadata.generated_by === "branch_scaffold"));
  assert.ok(result.nextEdges.every((entry) => entry.source === "source"));
  assert.equal(result.graph.nodes.length, 5);
  assert.equal(result.graph.edges.length, 5);
});

test("workflow branch scaffold helpers preserve preflight, selection, feedback, and draft workflow behavior", () => {
  const draft = branchGraph();
  const nextGraph = {
    ...draft,
    title: "Branched draft",
    description: "Updated branch graph",
  };
  const sourceWorkflow: SavedWorkflow = {
    ...workflow("workflow-branch"),
    title: "Original",
    description: "Original description",
    graph: draft,
    latest_ir: { manifests: [{ id: "old" }] },
    trigger_readiness_summary: {
      status: "ready",
      live_registration_supported: true,
    },
    updated_at: "2026-07-18T00:00:00.000Z",
  };
  const optimistic = workflowBranchScaffoldDraftWorkflow({
    workflow: sourceWorkflow,
    graph: nextGraph,
    updatedAt: "2026-07-19T00:00:00.000Z",
  });

  assert.equal(workflowBranchScaffoldPreflightFeedback(false), null);
  assert.equal(
    workflowBranchScaffoldPreflightFeedback(true),
    "This node already has outgoing branches. Use branch presets to relabel them or remove them before scaffolding new ones.",
  );
  assert.equal(workflowBranchScaffoldSelectedNodeId([{ ...node("next"), id: "next-node" }], "fallback"), "next-node");
  assert.equal(workflowBranchScaffoldSelectedNodeId([], "fallback"), "fallback");
  assert.equal(
    workflowBranchScaffoldSuccessFeedback(["approve", "reject"], "Decision"),
    "Created a approve / reject branch scaffold from Decision. Compiled IR was cleared and should be rebuilt before deploy.",
  );
  assert.equal(
    workflowBranchScaffoldFailureFeedback(new Error("save failed")),
    "Could not create branch scaffold: save failed",
  );
  assert.deepEqual(optimistic, {
    ...sourceWorkflow,
    title: "Branched draft",
    description: "Updated branch graph",
    graph: nextGraph,
    latest_ir: null,
    trigger_readiness_summary: null,
    updated_at: "2026-07-19T00:00:00.000Z",
  });
  assert.equal(sourceWorkflow.latest_ir?.manifests?.[0]?.id, "old");
});

test("workflowFamilyAssetGraphFromDraft promotes accepted templates into family metadata", () => {
  const draft = {
    ...branchGraph(),
    title: "Document export",
    description: undefined,
    metadata: {
      accepted_template_suggestions: ["document_to_spreadsheet", 7, "document_to_spreadsheet"],
      suggested_template_runtime_ids: ["action_guarded", null],
      kept: "yes",
    },
  };

  assert.deepEqual(acceptedWorkflowTemplateIdsFromMetadata(draft.metadata), [
    "document_to_spreadsheet",
    "document_to_spreadsheet",
  ]);

  const promoted = workflowFamilyAssetGraphFromDraft({
    draft,
    familyId: "family-1",
    promotedAt: "2026-08-11T00:00:00.000Z",
    sourceWorkflowId: "source-wf",
    workflowId: "wf-family",
  });

  assert.ok(promoted);
  assert.equal(promoted.workflow_id, "wf-family");
  assert.equal(promoted.title, "Document export family");
  assert.equal(promoted.description, "Reusable workflow family derived from Document export.");
  assert.deepEqual(promoted.metadata.kept, "yes");
  assert.deepEqual(promoted.metadata.workflow_family_asset, {
    family_id: "family-1",
    family_label: "Document export family",
    source_workflow_id: "source-wf",
    template_ids: ["document_to_spreadsheet", "document_to_spreadsheet"],
    runtime_template_ids: ["action_guarded"],
    parameter_schema: promoted.metadata.workflow_family_asset && typeof promoted.metadata.workflow_family_asset === "object"
      ? (promoted.metadata.workflow_family_asset as Record<string, unknown>).parameter_schema
      : [],
    default_parameters: {
      source_kind: "attachment_or_url",
      export_format: "xlsx",
      review_mode: "required",
    },
    promoted_at: "2026-08-11T00:00:00.000Z",
  });
  assert.equal(
    Array.isArray((promoted.metadata.workflow_family_asset as Record<string, unknown>).parameter_schema),
    true,
  );
});

test("workflowFamilyAssetGraphFromDraft no-ops without accepted templates", () => {
  assert.equal(
    workflowFamilyAssetGraphFromDraft({
      draft: branchGraph(),
      familyId: "family-1",
      promotedAt: "2026-08-11T00:00:00.000Z",
      sourceWorkflowId: "source-wf",
      workflowId: "wf-family",
    }),
    null,
  );
});

test("workflow family promotion and instance feedback helpers preserve copy", () => {
  assert.equal(
    workflowFamilyPromotionPreflightFeedback(0),
    "Accept at least one template suggestion before promoting a reusable workflow family.",
  );
  assert.equal(workflowFamilyPromotionPreflightFeedback(1), null);
  assert.equal(
    workflowFamilyPromotionSavedFeedback("Document Ops family"),
    'Saved "Document Ops family" as a reusable workflow family asset.',
  );
  assert.equal(
    workflowFamilyInstancePreflightFeedback(false),
    "Select a workflow family asset before creating a new reusable instance.",
  );
  assert.equal(workflowFamilyInstancePreflightFeedback(true), null);
  assert.equal(
    workflowFamilyInstanceCreatedFeedback("Document Ops instance"),
    'Created "Document Ops instance" from the reusable workflow family asset.',
  );
});

test("workflowFamilyInstanceGraphFromAsset applies default and override parameters", () => {
  const familyDraft = {
    ...branchGraph(),
    title: "Document export family",
    nodes: [
      node("pdf_source"),
      node("spreadsheet_output", { final_schema: { stable: true } }),
    ],
    metadata: {
      workflow_family_asset: {
        family_id: "family-1",
        family_label: "Document export family",
      },
    },
  };
  const instance = workflowFamilyInstanceGraphFromAsset({
    appliedParameterOverrides: {
      export_format: "csv",
      source_kind: "thread_artifact",
    },
    draft: familyDraft,
    familyAsset: {
      family_id: "family-1",
      family_label: "Document export family",
      template_ids: ["document_to_spreadsheet"],
      runtime_template_ids: ["action_guarded"],
      parameter_schema: [
        { id: "source_kind", label: "Source kind", kind: "text", defaultValue: "attachment_or_url" },
        { id: "export_format", label: "Export format", kind: "text", defaultValue: "xlsx" },
      ],
      default_parameters: {
        source_kind: "attachment_or_url",
        export_format: "xlsx",
      },
    },
    familyWorkflowId: "wf-family",
    instanceWorkflowId: "wf-instance",
    instantiatedAt: "2026-08-11T00:05:00.000Z",
  });

  assert.equal(instance.workflow_id, "wf-instance");
  assert.equal(instance.title, "Document export instance");
  assert.equal(instance.metadata.workflow_family_asset, undefined);
  assert.deepEqual(instance.instance_inputs, {
    family_id: "family-1",
    family_workflow_id: "wf-family",
    family_asset_workflow_id: "wf-family",
    instance_workflow_id: "wf-instance",
    values: {
      source_kind: "thread_artifact",
      export_format: "csv",
    },
  });
  assert.equal(instance.nodes[0].config.source_kind, "thread_artifact");
  assert.deepEqual(instance.nodes[1].config.final_schema, { stable: true, formats: ["csv"] });
  assert.deepEqual(instance.metadata.workflow_family_instance, {
    family_id: "family-1",
    family_workflow_id: "wf-family",
    family_asset_workflow_id: "wf-family",
    instance_workflow_id: "wf-instance",
    family_label: "Document export family",
    applied_parameters: {
      source_kind: "thread_artifact",
      export_format: "csv",
    },
    instantiated_at: "2026-08-11T00:05:00.000Z",
  });
});
