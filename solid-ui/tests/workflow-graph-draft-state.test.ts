import test from "node:test";
import assert from "node:assert/strict";

import type { WorkflowGraphDraft } from "../src/lib/workflowGraphTypes.ts";
import {
  workflowInitialSelectedNodeId,
  workflowNewDraftFeedback,
} from "../src/lib/workflowGraphDraftState.ts";

function graph(nodeIds: string[]): WorkflowGraphDraft {
  return {
    version: "omnyid-workflow.v1",
    workflow_id: "workflow-1",
    title: "Draft",
    status: "draft",
    environment: "dev",
    owner_user_id: "user-1",
    root_node_ids: nodeIds.slice(0, 1),
    nodes: nodeIds.map((id) => ({
      id,
      kind: "tool",
      label: id,
      description: "",
      position: { x: 0, y: 0 },
      config: {},
      policy: {},
      hidden_runtime_nodes: [],
      metadata: {},
    })),
    edges: [],
    presets: [],
    template_bindings: [],
    optimization_mode: "balanced",
    metadata: {},
  };
}

test("workflowInitialSelectedNodeId picks first or second node defensively", () => {
  assert.equal(workflowInitialSelectedNodeId(graph([])), null);
  assert.equal(workflowInitialSelectedNodeId(graph(["node-a"])), "node-a");
  assert.equal(workflowInitialSelectedNodeId(graph(["node-a", "node-b"])), "node-a");
  assert.equal(workflowInitialSelectedNodeId(graph(["node-a"]), "prefer_second"), "node-a");
  assert.equal(workflowInitialSelectedNodeId(graph(["node-a", "node-b"]), "prefer_second"), "node-b");
});

test("workflowNewDraftFeedback preserves new draft copy", () => {
  assert.equal(workflowNewDraftFeedback(), "Started a new workflow draft.");
});
