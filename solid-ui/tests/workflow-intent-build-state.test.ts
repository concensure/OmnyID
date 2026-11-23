import test from "node:test";
import assert from "node:assert/strict";

import type { SavedWorkflow } from "../src/lib/api.ts";
import {
  workflowBuiltFromIntent,
  workflowGraphAfterNodeInsertedBetween,
  workflowIntentStarterSubgraph,
} from "../src/lib/workflowIntentBuildState.ts";
import type {
  WorkflowGraphDraft,
  WorkflowNodeDraft,
} from "../src/lib/workflowGraphTypes.ts";

function node(id: string, kind = "agent", metadata: Record<string, unknown> = {}): WorkflowNodeDraft {
  return {
    id,
    kind,
    label: id,
    position: { x: 100, y: 100 },
    config: {},
    policy: {},
    hidden_runtime_nodes: [],
    metadata,
  };
}

function graph(): WorkflowGraphDraft {
  return {
    version: "omnyid-workflow.v1",
    workflow_id: "wf-base",
    title: "Base",
    description: "Base graph",
    status: "draft",
    environment: "dev",
    owner_user_id: "user-a",
    root_node_ids: ["trigger"],
    nodes: [
      node("trigger", "trigger", { generated_by: "intent_builder" }),
      node("generated", "agent", { generated_by: "intent_builder" }),
      node("manual", "tool"),
      {
        ...node("locked", "agent", { generated_by: "intent_builder" }),
        config: {
          regeneration_lock: true,
        },
      },
    ],
    edges: [
      { id: "edge-generated", source: "trigger", target: "generated", metadata: { generated_by: "intent_builder" } },
      { id: "edge-manual", source: "manual", target: "locked", metadata: {} },
    ],
    presets: [
      { preset_id: "generated-preset", metadata: { generated_by: "intent_builder" } },
      { preset_id: "manual-preset", metadata: {} },
    ],
    template_bindings: [
      {
        template_id: "generated-template",
        slot_name: "generated-slot",
        node_ids: ["generated"],
        metadata: { generated_by: "intent_builder" },
      },
      {
        template_id: "manual-template",
        slot_name: "manual-slot",
        node_ids: ["manual"],
        metadata: {},
      },
    ],
    optimization_mode: "balanced",
    metadata: {},
  };
}

function workflow(): SavedWorkflow {
  const draft = graph();
  return {
    workflow_id: draft.workflow_id,
    owner_user_id: draft.owner_user_id,
    title: draft.title,
    description: draft.description,
    favorite: false,
    preset_kinds: [],
    graph: draft,
    latest_ir: null,
    trigger_readiness_summary: null,
    created_at: "2026-08-11T00:00:00.000Z",
    updated_at: "2026-08-11T00:00:00.000Z",
    archived_at: null,
  };
}

test("workflow intent starter subgraph records preset and template provenance", () => {
  const subgraph = workflowIntentStarterSubgraph("research_assistant", 1, "intent_builder");

  assert.ok(subgraph.templateId);
  assert.ok(subgraph.nextNodes.length > 0);
  assert.equal(subgraph.nextEdges.length, Math.max(0, subgraph.nextNodes.length - 1));
  assert.equal(subgraph.presetRecord.preset_kind, "research_assistant");
  assert.deepEqual(subgraph.presetRecord.metadata, { generated_by: "intent_builder" });
  assert.deepEqual(subgraph.templateBindings.map((binding) => binding.node_ids[0]), subgraph.nextNodes.map((entry) => entry.id));
  assert.ok(subgraph.nextNodes.every((entry) => entry.metadata.generated_by === "intent_builder"));
});

test("workflow graph insert-between returns a new graph and preserves unrelated edges", () => {
  const draft = graph();
  const inserted = node("inserted", "condition");
  const next = workflowGraphAfterNodeInsertedBetween(draft, "trigger", "generated", inserted, "success");

  assert.equal(draft.nodes.some((entry) => entry.id === "inserted"), false);
  assert.equal(draft.edges.some((entry) => entry.source === "trigger" && entry.target === "generated"), true);
  assert.equal(next.nodes.some((entry) => entry.id === "inserted"), true);
  assert.equal(next.edges.some((entry) => entry.id === "edge-manual"), true);
  assert.equal(next.edges.some((entry) => entry.source === "trigger" && entry.target === "generated"), false);
  assert.equal(next.edges.some((entry) => entry.source === "trigger" && entry.target === "inserted" && entry.condition_label === "success"), true);
  assert.equal(next.edges.some((entry) => entry.source === "inserted" && entry.target === "generated"), true);
});

test("workflowBuiltFromIntent preserves manual and locked records during regeneration", () => {
  const built = workflowBuiltFromIntent({
    intent: "Research a vendor and summarize the options",
    baseWorkflow: workflow(),
    regenerationMode: "preserve_manual",
    nowIso: "2026-08-11T01:00:00.000Z",
  });
  const nextGraph = built.graph as WorkflowGraphDraft;

  assert.equal(built.updated_at, "2026-08-11T01:00:00.000Z");
  assert.equal(nextGraph.metadata.regeneration_mode, "preserve_manual");
  assert.equal(nextGraph.metadata.preserved_manual_nodes, 2);
  assert.equal(nextGraph.metadata.preserved_manual_edges, 1);
  assert.equal(nextGraph.nodes.some((entry) => entry.id === "manual"), true);
  assert.equal(nextGraph.nodes.some((entry) => entry.id === "locked"), true);
  assert.equal(nextGraph.edges.some((entry) => entry.id === "edge-manual"), true);
  assert.equal(nextGraph.presets.some((entry) => entry.preset_id === "manual-preset"), true);
  assert.equal(nextGraph.template_bindings.some((entry) => entry.template_id === "manual-template"), true);
});

test("workflowBuiltFromIntent rebuild mode drops manual carry-over metadata", () => {
  const built = workflowBuiltFromIntent({
    intent: "Research a vendor and summarize the options",
    baseWorkflow: workflow(),
    regenerationMode: "rebuild",
    nowIso: "2026-08-11T01:00:00.000Z",
  });
  const nextGraph = built.graph as WorkflowGraphDraft;

  assert.equal(nextGraph.metadata.regeneration_mode, "rebuild");
  assert.equal(nextGraph.nodes.some((entry) => entry.id === "manual"), false);
  assert.equal(nextGraph.edges.some((entry) => entry.id === "edge-manual"), false);
  assert.equal(nextGraph.metadata.preserved_manual_nodes, undefined);
});
