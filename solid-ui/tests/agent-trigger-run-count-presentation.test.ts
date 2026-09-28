import assert from "node:assert/strict";
import test from "node:test";

import {
  agentTriggerRunCount,
  agentTriggerRunCountClass,
  agentTriggerRunCountLabel,
} from "../src/lib/agentTriggerRunCountPresentation.ts";

test("agentTriggerRunCount prefers explicit server-provided counts", () => {
  assert.equal(agentTriggerRunCount({ run_count: 12, recent_runs: [{}, {}] }), 12);
});

test("agentTriggerRunCount falls back to recent run history length", () => {
  assert.equal(agentTriggerRunCount({ recent_runs: [{}, {}, {}] }), 3);
  assert.equal(agentTriggerRunCount({}), 0);
});

test("agentTriggerRunCountLabel preserves zero, singular, and plural copy", () => {
  assert.equal(agentTriggerRunCountLabel(0), "Never run");
  assert.equal(agentTriggerRunCountLabel(1), "1 run");
  assert.equal(agentTriggerRunCountLabel(7), "7 runs");
});

test("agentTriggerRunCountClass preserves run-volume badge tones", () => {
  assert.match(agentTriggerRunCountClass(0), /border-white\/20/);
  assert.match(agentTriggerRunCountClass(5), /border-white\/25/);
  assert.match(agentTriggerRunCountClass(101), /border-amber-300\/60/);
});
