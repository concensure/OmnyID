import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsWatcherSignalState,
  type DecisionOsWatcherSignal,
} from "../src/lib/decisionosWatcherSignalState.ts";

function signal(overrides: Partial<DecisionOsWatcherSignal>): DecisionOsWatcherSignal {
  return {
    id: "sig_1",
    signal_key: "renewal",
    category: "follow_up",
    freshness: "reactivated",
    urgency: "high",
    confidence: "0.84",
    source_type: "message",
    source_subtype: "email",
    thread_id: "thread_1",
    source_refs: ["message:1"],
    ...overrides,
  };
}

test("decisionOsWatcherSignalState builds bounded watcher chips", () => {
  const state = decisionOsWatcherSignalState([
    signal({ id: "sig_1", category: "follow_up", urgency: "high", freshness: "fresh" }),
    signal({ id: "sig_2", category: "approval", urgency: "low" }),
    signal({ id: "sig_3", category: "context", urgency: "low" }),
  ], 2);

  assert.equal(state.count, 3);
  assert.equal(state.hasSignals, true);
  assert.deepEqual(state.chips.map((chip) => chip.id), ["sig_1", "sig_2"]);
  assert.equal(state.chips[0].label, "follow up · high · fresh");
  assert.equal(state.chips[0].tone, "warning");
});

test("decisionOsWatcherSignalState marks escalation urgent", () => {
  const state = decisionOsWatcherSignalState([
    signal({
      escalation_status: "escalated",
      escalation_reason: "Waiting item crossed the follow-up threshold.",
      urgency: "medium",
    }),
  ]);

  assert.equal(state.chips[0].tone, "urgent");
  assert.equal(state.chips[0].title, "Waiting item crossed the follow-up threshold.");
});

test("decisionOsWatcherSignalState mutes suppressed and decrypt-needed signals", () => {
  const state = decisionOsWatcherSignalState([
    signal({ id: "sig_1", suppression_status: "suppressed", suppression_reason: "Cooldown active." }),
    signal({ id: "sig_2", decrypt_needed: true }),
  ]);

  assert.deepEqual(state.chips.map((chip) => chip.tone), ["muted", "muted"]);
  assert.equal(state.chips[0].title, "Cooldown active.");
  assert.equal(state.chips[1].title, "Based on 1 source");
});

test("decisionOsWatcherSignalState hides malformed ids", () => {
  const state = decisionOsWatcherSignalState([signal({ id: " " })]);

  assert.equal(state.count, 1);
  assert.equal(state.hasSignals, false);
});
