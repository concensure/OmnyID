import test from "node:test";
import assert from "node:assert/strict";

import {
  createDefaultAgentPulseSummary,
  loadAgentPulseState,
} from "../src/lib/agentPulseState.ts";

test("createDefaultAgentPulseSummary provides a stable empty summary", () => {
  assert.deepEqual(createDefaultAgentPulseSummary(), {
    active_count: 0,
    idle_count: 0,
    active_agents: [],
    error_count: 0,
    healthy: true,
  });
});

test("loadAgentPulseState replaces the summary on success", async () => {
  const previous = createDefaultAgentPulseSummary();
  const result = await loadAgentPulseState(previous, false, {
    async loadSummary() {
      return {
        active_count: 2,
        idle_count: 1,
        active_agents: ["agent-1"],
        error_count: 0,
        healthy: true,
      };
    },
  });

  assert.equal(result.error, null);
  assert.equal(result.hasLoaded, true);
  assert.equal(result.summary.active_count, 2);
});

test("loadAgentPulseState preserves the last summary and maps failures to receipts", async () => {
  const previous = {
    active_count: 3,
    idle_count: 4,
    active_agents: ["agent-1", "agent-2"],
    error_count: 1,
    healthy: false,
  };
  const result = await loadAgentPulseState(previous, true, {
    async loadSummary() {
      throw new Error("403 forbidden");
    },
  });

  assert.equal(result.summary, previous);
  assert.equal(result.hasLoaded, true);
  assert.equal(result.error?.tone, "danger");
  assert.match(result.error?.title ?? "", /fresh sign-in/i);
});
