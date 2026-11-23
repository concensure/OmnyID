import test from "node:test";
import assert from "node:assert/strict";

import type { WorkflowGraphDraft } from "../src/lib/workflowGraphTypes.ts";
import {
  isIntentGeneratedRecord,
  workflowRegenerationImpactSummary,
} from "../src/lib/workflowRegenerationState.ts";

test("isIntentGeneratedRecord detects intent-builder metadata defensively", () => {
  assert.equal(isIntentGeneratedRecord(null), false);
  assert.equal(isIntentGeneratedRecord({ metadata: null }), false);
  assert.equal(isIntentGeneratedRecord({ metadata: { generated_by: "manual" } }), false);
  assert.equal(isIntentGeneratedRecord({ metadata: { generated_by: "intent_builder" } }), true);
});

test("workflowRegenerationImpactSummary counts generated and preserved graph records", () => {
  const graph: WorkflowGraphDraft = {
    title: "Workflow",
    description: null,
    environment: "dev",
    nodes: [
      {
        id: "trigger",
        kind: "trigger",
        label: "Trigger",
        description: null,
        position: { x: 0, y: 0 },
        config: {},
        metadata: { generated_by: "intent_builder" },
      },
      {
        id: "locked",
        kind: "tool",
        label: "Locked",
        description: null,
        position: { x: 100, y: 0 },
        config: { regeneration_lock: true, regeneration_lock_scope: "subgraph" },
        metadata: { generated_by: "intent_builder" },
      },
      {
        id: "downstream",
        kind: "tool",
        label: "Downstream",
        description: null,
        position: { x: 200, y: 0 },
        config: {},
        metadata: { generated_by: "intent_builder" },
      },
      {
        id: "manual",
        kind: "tool",
        label: "Manual",
        description: null,
        position: { x: 300, y: 0 },
        config: {},
        metadata: {},
      },
    ],
    edges: [
      {
        id: "generated-edge",
        source: "trigger",
        target: "locked",
        label: null,
        metadata: { generated_by: "intent_builder" },
      },
      {
        id: "protected-edge",
        source: "locked",
        target: "downstream",
        label: null,
        metadata: { generated_by: "intent_builder" },
      },
      {
        id: "manual-edge",
        source: "downstream",
        target: "manual",
        label: null,
        metadata: {},
      },
    ],
    presets: [],
    root_node_ids: ["trigger"],
    template_bindings: [],
    metadata: {},
  };

  assert.deepEqual(workflowRegenerationImpactSummary(graph), {
    generatedNodes: 3,
    lockedNodes: 3,
    preservedNodes: 3,
    generatedEdges: 2,
    preservedEdges: 3,
  });
});
