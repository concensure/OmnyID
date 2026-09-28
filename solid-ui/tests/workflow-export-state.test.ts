import test from "node:test";
import assert from "node:assert/strict";

import {
  workflowExportFilename,
  workflowExportPayload,
} from "../src/lib/workflowExportState.ts";

test("workflow export filename falls back for empty workflow ids", () => {
  assert.equal(workflowExportFilename("   "), "workflow-untitled.json");
});

test("workflow export filename strips unsafe path characters", () => {
  assert.equal(
    workflowExportFilename("../team alpha/wf:prod?run=1"),
    "workflow-team-alpha-wf-prod-run-1.json",
  );
});

test("workflow export filename limits long workflow ids", () => {
  assert.equal(
    workflowExportFilename("workflow-1234567890-1234567890-1234567890-1234567890"),
    "workflow-workflow-1234567890-1234567890-123456789.json",
  );
});

test("workflow export payload flattens graph nodes and edges", () => {
  assert.deepEqual(
    workflowExportPayload({
      workflowId: "wf-1",
      exportedAt: "2026-07-18T00:00:00.000Z",
      nodes: [
        {
          id: "node-1",
          kind: "tool",
          label: "Tool",
          position: { x: 10, y: 20 },
        },
      ],
      edges: [{ source: "node-1", target: "node-2" }],
    }),
    {
      workflow_id: "wf-1",
      exported_at: "2026-07-18T00:00:00.000Z",
      nodes: [{ id: "node-1", kind: "tool", label: "Tool", x: 10, y: 20 }],
      edges: [{ source: "node-1", target: "node-2" }],
    },
  );
});
