import test from "node:test";
import assert from "node:assert/strict";

import {
  liveRunNodeOverlaysFromEvents,
  liveRunStreamEventIsTerminal,
  liveRunStreamEventKey,
  mergeLiveRunEdgeStates,
  mergeLiveRunStatuses,
  mergeLiveRunStepOrder,
  parseLiveRunStreamEvent,
} from "../src/lib/workflowLiveRunStreamState.ts";

test("parseLiveRunStreamEvent rejects malformed stream payloads", () => {
  assert.equal(parseLiveRunStreamEvent("{bad json"), null);
  assert.equal(parseLiveRunStreamEvent("[]"), null);
  assert.equal(parseLiveRunStreamEvent("{}"), null);
  assert.equal(parseLiveRunStreamEvent({ event: "   " }), null);
});

test("parseLiveRunStreamEvent normalizes supported fields", () => {
  assert.deepEqual(
    parseLiveRunStreamEvent(JSON.stringify({
      event: " node_started ",
      node_id: "node-a",
      index: 2,
      complexity_score: 3,
      risk_score: Number.POSITIVE_INFINITY,
      ignored: "field",
    })),
    {
      event: "node_started",
      node_id: "node-a",
      index: 2,
      complexity_score: 3,
      risk_score: undefined,
      decision: undefined,
      label: undefined,
      note: undefined,
      option_consequence: undefined,
      option_id: undefined,
      option_label: undefined,
      result_summary: undefined,
      status: undefined,
      ts: undefined,
      phase: undefined,
      trace_kind: undefined,
      outcome_checkpoint: undefined,
      reason: undefined,
      runtime_kind: undefined,
      graph_node_kind: undefined,
    },
  );
});

test("live run stream event keys and terminal detection stay stable", () => {
  const event = { event: "run_completed", node_id: "node-a", index: 1, ts: "2026-07-18T00:00:00.000Z" };

  assert.equal(liveRunStreamEventKey(event), "run_completed:node-a:1:2026-07-18T00:00:00.000Z");
  assert.equal(liveRunStreamEventIsTerminal(event), true);
  assert.equal(liveRunStreamEventIsTerminal({ event: "node_started" }), false);
});

test("liveRunNodeOverlaysFromEvents normalizes live node overlays defensively", () => {
  const overlays = liveRunNodeOverlaysFromEvents([
    { event: "node_started", node_id: " node-a ", index: 0, phase: "dispatch", reason: "Started" },
    {
      event: "wait_for_approval",
      node_id: "node-a",
      decision: "pending",
      option_label: "Approve",
      option_consequence: "Sends email",
      result_summary: "Needs owner",
      note: "review",
      outcome_checkpoint: "approval_gate",
    },
    { event: "node_failed", node_id: "node-b", index: 2, status: " failed_custom " },
    { event: "unknown_event", node_id: "node-c" },
    { event: "node_completed", node_id: " " },
  ]);

  assert.deepEqual([...overlays.keys()].sort(), ["node-a", "node-b"]);
  assert.deepEqual(overlays.get("node-a"), {
    status: "waiting_for_approval",
    stepOrder: 1,
    phase: "dispatch",
    checkpoint: "approval_gate",
    reason: "Decision pending via Approve Sends email Needs owner Note: review",
  });
  assert.deepEqual(overlays.get("node-b"), {
    status: "failed_custom",
    stepOrder: 3,
    phase: null,
    checkpoint: null,
    reason: null,
  });
});

test("live run merge helpers overlay persisted statuses, step order, and edge states", () => {
  const liveOverlays = new Map([
    ["node-a", { status: "completed", stepOrder: 1 }],
    ["node-b", { status: "active", stepOrder: Number.NaN }],
    ["node-c", { status: "waiting_for_approval", stepOrder: 2 }],
  ]);

  assert.deepEqual(
    [...mergeLiveRunStatuses(new Map([["node-a", "failed"], ["node-z", "completed"]]), liveOverlays).entries()].sort(),
    [["node-a", "completed"], ["node-b", "active"], ["node-c", "waiting_for_approval"], ["node-z", "completed"]],
  );
  assert.deepEqual(
    [...mergeLiveRunStepOrder(new Map([["node-b", 5], ["node-z", 9]]), liveOverlays).entries()].sort(),
    [["node-a", 1], ["node-b", 5], ["node-c", 2], ["node-z", 9]],
  );
  assert.deepEqual(
    [...mergeLiveRunEdgeStates(
      new Map([["edge-old", "completed"]]),
      [
        { id: "edge-ac", source: "node-a", target: "node-c" },
        { id: "edge-cb", source: "node-c", target: "node-b" },
      ],
      liveOverlays,
    ).entries()].sort(),
    [["edge-ac", "waiting_for_approval"], ["edge-old", "completed"]],
  );
});
