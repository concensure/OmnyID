import test from "node:test";
import assert from "node:assert/strict";

import type { WorkflowGraphDraft, WorkflowNodeDraft } from "../src/lib/workflowGraphTypes.ts";
import {
  workflowDuplicatedNode,
  workflowEdgeAddedFeedback,
  workflowEdgeAddRequest,
  workflowEdgeAddPreflightFeedback,
  workflowEdgeConditionLabelValue,
  workflowEdgeMetaPatchPayload,
  workflowGraphAfterEdgeAdd,
  workflowGraphAfterEdgeConditionLabel,
  workflowGraphAfterNodeDelete,
  workflowGraphAfterNodeDuplicate,
  workflowGraphAfterNodeConfig,
  workflowGraphAfterNodeMetaPatch,
  workflowGraphAfterNodePolicy,
  workflowGraphAfterNodePosition,
  workflowGraphAfterNodePrompt,
  workflowGraphAfterNodeUpdate,
  workflowGraphAfterPresetStarterAdd,
  workflowGraphAfterPrimitiveNodeAdd,
  workflowGraphAfterRootToggle,
  workflowGraphAfterSemanticNodeAdd,
  workflowNodeConfigText,
  workflowNodePolicyText,
  workflowNodeGridPosition,
  workflowPatchIrInvalidatedFeedback,
  workflowPrimitiveNode,
  workflowPresetStarterAddedFeedback,
  workflowRootTogglePatchPayload,
  workflowRootNodeIdsAfterToggle,
  workflowSemanticNode,
  workflowSelectedNodeEditorText,
  workflowSelectedNodeConfigPatchPayload,
  workflowSelectedNodeDeletePatchPayload,
  workflowSelectedNodeMetaPatchPayload,
  workflowSelectedNodePolicyPatchPayload,
  workflowSelectedNodePromptPatchPayload,
  workflowSemanticNodeAddedFeedback,
  workflowUnknownSemanticStarterFeedback,
} from "../src/lib/workflowGraphEditState.ts";
import type { WorkflowIntentStarterSubgraph } from "../src/lib/workflowIntentBuildState.ts";
import type { SemanticStarterDefinition } from "../src/lib/workflowReviewTypes.ts";

function node(id: string, overrides: Partial<WorkflowNodeDraft> = {}): WorkflowNodeDraft {
  return {
    id,
    kind: "agent",
    label: id,
    position: { x: 10, y: 20 },
    config: {},
    policy: {},
    hidden_runtime_nodes: [],
    metadata: {},
    ...overrides,
  };
}

function graph(): WorkflowGraphDraft {
  return {
    version: "omnyid-workflow.v1",
    workflow_id: "wf-1",
    title: "Workflow",
    status: "draft",
    environment: "dev",
    owner_user_id: "user-1",
    root_node_ids: ["node-a", "node-b"],
    nodes: [node("node-a"), node("node-b"), node("node-c")],
    edges: [
      { id: "edge-ab", source: "node-a", target: "node-b", metadata: {} },
      { id: "edge-bc", source: "node-b", target: "node-c", metadata: {} },
    ],
    presets: [],
    template_bindings: [],
    optimization_mode: "balanced",
    metadata: {},
  };
}

test("workflow graph edit reducers delete nodes and connected references", () => {
  const next = workflowGraphAfterNodeDelete(graph(), "node-b");

  assert.deepEqual(next.nodes.map((entry) => entry.id), ["node-a", "node-c"]);
  assert.deepEqual(next.edges, []);
  assert.deepEqual(next.root_node_ids, ["node-a"]);
});

test("workflow graph edit reducers duplicate nodes without mutating source graph", () => {
  const draft = graph();
  const duplicated = workflowDuplicatedNode(draft.nodes[0], "node-copy");

  assert.deepEqual(duplicated, {
    ...draft.nodes[0],
    id: "node-copy",
    label: "node-a copy",
    position: { x: 90, y: 100 },
  });

  const result = workflowGraphAfterNodeDuplicate(draft, "node-a", "node-copy");
  assert.equal(result.duplicatedNode?.id, "node-copy");
  assert.deepEqual(result.graph.nodes.map((entry) => entry.id), ["node-a", "node-b", "node-c", "node-copy"]);

  const missing = workflowGraphAfterNodeDuplicate(draft, "missing", "node-copy");
  assert.equal(missing.graph, draft);
  assert.equal(missing.duplicatedNode, null);
});

test("workflow graph edit reducers add and relabel edges defensively", () => {
  const draft = graph();
  const duplicate = workflowGraphAfterEdgeAdd(draft, {
    id: "edge-duplicate",
    source: "node-a",
    target: "node-b",
    metadata: {},
  });
  assert.equal(duplicate, draft);

  const added = workflowGraphAfterEdgeAdd(draft, {
    id: "edge-ac",
    source: "node-a",
    target: "node-c",
    condition_label: " success ",
    metadata: {},
  });
  assert.deepEqual(added.edges.map((entry) => entry.id), ["edge-ab", "edge-bc", "edge-ac"]);

  const relabeled = workflowGraphAfterEdgeConditionLabel(added, "edge-ac", "  fallback  ");
  assert.equal(relabeled.edges.find((edge) => edge.id === "edge-ac")?.condition_label, "fallback");
  const cleared = workflowGraphAfterEdgeConditionLabel(relabeled, "edge-ac", "  ");
  assert.equal(cleared.edges.find((edge) => edge.id === "edge-ac")?.condition_label, undefined);
});

test("workflow graph edit helpers build edge patch requests defensively", () => {
  assert.equal(workflowEdgeConditionLabelValue("  success  "), "success");
  assert.equal(workflowEdgeConditionLabelValue("  "), undefined);
  assert.equal(workflowEdgeAddRequest({ source: "", target: "node-b", conditionLabel: "", edgeId: "edge-new" }), null);
  assert.equal(workflowEdgeAddRequest({ source: "node-a", target: "node-a", conditionLabel: "", edgeId: "edge-new" }), null);

  assert.deepEqual(
    workflowEdgeAddRequest({
      source: "node-a",
      target: "node-b",
      conditionLabel: "  fallback  ",
      edgeId: "edge-new",
    }),
    {
      edge: {
        id: "edge-new",
        source: "node-a",
        target: "node-b",
        condition_label: "fallback",
        metadata: {},
      },
      patch: {
        op: "edge_add",
        source: "node-a",
        target: "node-b",
        condition_label: "fallback",
      },
    },
  );
  assert.deepEqual(workflowEdgeMetaPatchPayload("edge-a", "  "), {
    op: "edge_meta_replace",
    edge_id: "edge-a",
    condition_label: undefined,
  });
});

test("workflow graph edit feedback helpers preserve graph editing copy", () => {
  const request = workflowEdgeAddRequest({
    source: "node-a",
    target: "node-b",
    conditionLabel: "",
    edgeId: "edge-a",
  });

  assert.equal(workflowPresetStarterAddedFeedback("research_assistant"), "Added Research Assistant starter workflow.");
  assert.equal(workflowUnknownSemanticStarterFeedback("missing"), "Unknown semantic starter: missing");
  assert.equal(workflowSemanticNodeAddedFeedback("Review dataset"), "Added Review dataset semantic node.");
  assert.equal(workflowEdgeAddPreflightFeedback(null), "Choose two different nodes to create an edge.");
  assert.equal(workflowEdgeAddPreflightFeedback(request), null);
  assert.equal(workflowEdgeAddedFeedback(), "Added edge.");
  assert.equal(workflowPatchIrInvalidatedFeedback(false), null);
  assert.equal(
    workflowPatchIrInvalidatedFeedback(true),
    "Workflow graph updated. Compiled IR was cleared and should be rebuilt before deploy.",
  );
});

test("workflow graph edit reducers toggle root nodes without duplicates", () => {
  assert.deepEqual(workflowRootNodeIdsAfterToggle(["node-a"], "node-b", true), ["node-a", "node-b"]);
  assert.deepEqual(workflowRootNodeIdsAfterToggle(["node-a"], "node-a", true), ["node-a"]);
  assert.deepEqual(workflowRootNodeIdsAfterToggle(["node-a", "node-b"], "node-a", false), ["node-b"]);
  assert.deepEqual(workflowGraphAfterRootToggle(graph(), "node-c", true).root_node_ids, ["node-a", "node-b", "node-c"]);
  assert.deepEqual(workflowRootTogglePatchPayload("node-a", false), {
    op: "root_toggle",
    node_id: "node-a",
    root_enabled: false,
  });
});

test("workflow graph edit reducers create primitive nodes at deterministic grid positions", () => {
  assert.deepEqual(workflowNodeGridPosition(0), { x: 80, y: 80 });
  assert.deepEqual(workflowNodeGridPosition(5), { x: 300, y: 200 });

  const primitive = workflowPrimitiveNode("approval", "node-new", 5);
  assert.equal(primitive.id, "node-new");
  assert.equal(primitive.kind, "approval");
  assert.equal(primitive.label, "Approval node");
  assert.deepEqual(primitive.position, { x: 300, y: 200 });
  assert.equal(typeof primitive.config.decision_point_id, "string");

  const emptyDraft = { ...graph(), nodes: [], root_node_ids: [] };
  const result = workflowGraphAfterPrimitiveNodeAdd(emptyDraft, "tool", "node-tool");
  assert.equal(result.node.id, "node-tool");
  assert.deepEqual(result.graph.nodes.map((entry) => entry.id), ["node-tool"]);
  assert.deepEqual(result.graph.root_node_ids, ["node-tool"]);
  assert.deepEqual(emptyDraft.nodes, []);
});

test("workflow graph edit reducers create semantic starter nodes and mark builder metadata", () => {
  const starter: SemanticStarterDefinition = {
    id: "pdf_source",
    label: "PDF",
    nodeKind: "tool",
    description: "Load a PDF",
    config: { capability_id: "document_ingest" },
    semanticRole: "pdf_source",
  };
  const semantic = workflowSemanticNode(starter, "node-semantic", 2);
  assert.deepEqual(semantic.metadata, {
    semantic_node_kind: "pdf_source",
    semantic_role: "pdf_source",
    human_facing_node: true,
  });
  semantic.config.capability_id = "changed";
  assert.equal(starter.config.capability_id, "document_ingest");

  const result = workflowGraphAfterSemanticNodeAdd(graph(), starter, "node-semantic");
  assert.equal(result.node.id, "node-semantic");
  assert.equal(result.graph.metadata.semantic_builder_enabled, true);
  assert.deepEqual(result.graph.root_node_ids, ["node-a", "node-b"]);
});

test("workflow graph edit reducers merge preset starter subgraphs", () => {
  const subgraph: WorkflowIntentStarterSubgraph = {
    templateId: "linear_worker",
    nextNodes: [node("preset-node")],
    nextEdges: [{ id: "preset-edge", source: "preset-node", target: "node-a", metadata: {} }],
    presetRecord: { preset_id: "preset-1", preset_kind: "research_assistant" },
    templateBindings: [
      {
        template_id: "linear_worker",
        slot_name: "intake_slot",
        node_ids: ["preset-node"],
        metadata: {},
      },
    ],
  };
  const next = workflowGraphAfterPresetStarterAdd(graph(), subgraph);
  assert.deepEqual(next.nodes.map((entry) => entry.id), ["node-a", "node-b", "node-c", "preset-node"]);
  assert.deepEqual(next.edges.map((entry) => entry.id), ["edge-ab", "edge-bc", "preset-edge"]);
  assert.equal(next.presets.at(-1)?.preset_id, "preset-1");
  assert.deepEqual(next.template_bindings.at(-1)?.node_ids, ["preset-node"]);
  assert.deepEqual(next.metadata.preset_template_ids, ["linear_worker"]);

  const emptyNext = workflowGraphAfterPresetStarterAdd({ ...graph(), nodes: [], root_node_ids: [] }, subgraph);
  assert.equal(emptyNext.template_id, "linear_worker");
  assert.equal(emptyNext.template_version, "omnyid-subagent-template.v1");
  assert.deepEqual(emptyNext.root_node_ids, ["preset-node"]);
});

test("workflow graph edit reducers update one node without mutating source graph", () => {
  const draft = graph();
  const next = workflowGraphAfterNodeUpdate(draft, "node-a", (entry) => ({
    ...entry,
    label: "Renamed",
    config: { edited: true },
  }));

  assert.equal(next.nodes[0].label, "Renamed");
  assert.deepEqual(next.nodes[0].config, { edited: true });
  assert.equal(next.nodes[1], draft.nodes[1]);
  assert.equal(draft.nodes[0].label, "node-a");

  const missing = workflowGraphAfterNodeUpdate(draft, "missing", (entry) => ({ ...entry, label: "Nope" }));
  assert.deepEqual(missing.nodes.map((entry) => entry.label), ["node-a", "node-b", "node-c"]);
});

test("workflow graph edit reducers patch node fields with small helpers", () => {
  const prompt = {
    system_prompt: "System",
    instruction_prompt: "Do it",
    user_editable: true,
  };
  const withPosition = workflowGraphAfterNodePosition(graph(), "node-a", { x: 5, y: 6 });
  assert.deepEqual(withPosition.nodes[0].position, { x: 5, y: 6 });

  const withConfig = workflowGraphAfterNodeConfig(graph(), "node-a", { capability_id: "search" });
  assert.deepEqual(withConfig.nodes[0].config, { capability_id: "search" });

  const withPolicy = workflowGraphAfterNodePolicy(graph(), "node-a", { approval_mode: "required" });
  assert.deepEqual(withPolicy.nodes[0].policy, { approval_mode: "required" });

  const withPrompt = workflowGraphAfterNodePrompt(graph(), "node-a", prompt);
  assert.deepEqual(withPrompt.nodes[0].prompt, prompt);

  const withMeta = workflowGraphAfterNodeMetaPatch(graph(), "node-a", {
    label: "New label",
    description: "New description",
  });
  assert.equal(withMeta.nodes[0].label, "New label");
  assert.equal(withMeta.nodes[0].description, "New description");
});

test("workflow graph edit helpers build selected-node patch payloads defensively", () => {
  const prompt = {
    system_prompt: "System",
    instruction_prompt: "Do it",
    user_editable: true,
  };
  const config = { capability_id: "search", nested: { stable: true } };

  assert.equal(workflowSelectedNodePromptPatchPayload(null, prompt), null);
  assert.deepEqual(workflowSelectedNodePromptPatchPayload("node-a", prompt), {
    op: "node_prompt_replace",
    node_id: "node-a",
    prompt,
  });
  assert.equal(workflowSelectedNodeMetaPatchPayload(undefined, { label: "New" }), null);
  assert.deepEqual(workflowSelectedNodeMetaPatchPayload("node-a", { label: "New" }), {
    op: "node_meta_replace",
    node_id: "node-a",
    label: "New",
  });
  assert.equal(workflowSelectedNodeConfigPatchPayload("", config), null);
  assert.deepEqual(workflowSelectedNodeConfigPatchPayload("node-a", config), {
    op: "node_config_replace",
    node_id: "node-a",
    config,
  });
  assert.equal(workflowSelectedNodePolicyPatchPayload(undefined, config), null);
  assert.deepEqual(workflowSelectedNodePolicyPatchPayload("node-a", config), {
    op: "node_policy_replace",
    node_id: "node-a",
    policy: config,
  });
  assert.equal(workflowSelectedNodeDeletePatchPayload(null), null);
  assert.deepEqual(workflowSelectedNodeDeletePatchPayload("node-a"), {
    op: "node_delete",
    node_id: "node-a",
  });
  assert.equal(
    workflowNodeConfigText({ capability_id: "search", enabled: true }),
    '{\n  "capability_id": "search",\n  "enabled": true\n}',
  );
  assert.equal(
    workflowNodePolicyText({ approval_mode: "required" }),
    '{\n  "approval_mode": "required"\n}',
  );
  assert.deepEqual(
    workflowSelectedNodeEditorText({
      config: { capability_id: "search" },
      policy: { approval_mode: "required" },
    }),
    {
      configText: '{\n  "capability_id": "search"\n}',
      policyText: '{\n  "approval_mode": "required"\n}',
    },
  );
  assert.deepEqual(workflowSelectedNodeEditorText(null), {
    configText: "{}",
    policyText: "{}",
  });
});
