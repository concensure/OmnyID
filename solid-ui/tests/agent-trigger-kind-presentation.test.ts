import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_TRIGGER_KINDS,
  agentTriggerKindIcon,
  agentTriggerKindLabel,
} from "../src/lib/agentTriggerKindPresentation.ts";

test("agent trigger kind presentation exposes the supported trigger order", () => {
  assert.deepEqual(AGENT_TRIGGER_KINDS, [
    "scheduled",
    "interval",
    "webhook",
    "message",
    "one_time",
  ]);
});

test("agent trigger kind presentation formats known labels and icons", () => {
  assert.equal(agentTriggerKindLabel("scheduled"), "Scheduled (cron)");
  assert.equal(agentTriggerKindLabel("message"), "On message");
  assert.equal(agentTriggerKindIcon("scheduled"), "SC");
  assert.equal(agentTriggerKindIcon("one_time"), "ONE");
});

test("agent trigger kind presentation preserves unknown labels and uses fallback icons", () => {
  assert.equal(agentTriggerKindLabel("custom"), "custom");
  assert.equal(agentTriggerKindIcon("custom"), "TR");
});
