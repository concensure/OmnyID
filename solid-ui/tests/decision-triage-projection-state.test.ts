import test from "node:test";
import assert from "node:assert/strict";

import type { AfpMessage } from "../src/lib/api.ts";
import { buildDecisionTriageProjectionState } from "../src/lib/decisionTriageProjectionState.ts";

function message(id: string, action: string, timestamp: string): AfpMessage {
  return {
    id: `${id}:${action}:${timestamp}`,
    thread_id: "decision_triage:user",
    from: "user://test",
    timestamp,
    type: "ledger",
    kind: "decision_triage",
    subtype: "decision_triage",
    content: { kind: "decision_triage", item_id: id, triage_action: action },
    views: [],
    attachments: [],
  };
}

test("decision triage projection survives reload for approvals and deferrals", () => {
  const state = buildDecisionTriageProjectionState([
    message("decision-1", "approve", "2026-10-06T00:00:00Z"),
    message("response-1", "defer", "2026-10-06T00:01:00Z"),
  ]);
  assert.deepEqual([...state.resolvedIds], ["decision-1"]);
  assert.deepEqual([...state.deferredIds], ["response-1"]);
});

test("decision triage projection applies undo and latest durable action in timestamp order", () => {
  const state = buildDecisionTriageProjectionState([
    message("decision-1", "defer", "2026-10-06T00:02:00Z"),
    message("decision-1", "approve", "2026-10-06T00:01:00Z"),
    message("decision-1", "undo", "2026-10-06T00:03:00Z"),
  ]);
  assert.equal(state.resolvedIds.has("decision-1"), false);
  assert.equal(state.deferredIds.has("decision-1"), false);
});
