import assert from "node:assert/strict";
import test from "node:test";

import { agentTriggerCardState } from "../src/lib/agentTriggerCardState.ts";

const NOW_MS = Date.UTC(2026, 7, 14, 12, 0, 0);

test("agent trigger card state provides stable fallbacks for sparse triggers", () => {
  const state = agentTriggerCardState(
    {
      id: "trigger-1",
      trigger_type: "custom",
      config_json: {},
      enabled: true,
    },
    { nowMs: NOW_MS },
  );

  assert.deepEqual(state, {
    fullSummary: "custom",
    displaySummary: "custom",
    expandable: false,
    isEnabled: true,
    runCount: 0,
    runCountLabel: "Never run",
    runCountClass: "border-white/20 bg-white/20 text-on-surface-variant/50",
    createdAt: null,
    createdRelativeLabel: null,
    lastRunAt: null,
    lastRunRelativeLabel: null,
    nextRunAt: null,
    nextRunRelativeLabel: null,
    nextRunCountdownLabel: null,
    recentRuns: [],
    recentRunsLabel: null,
    hasRecentRuns: false,
    lastSuccessLabel: null,
    cronSummary: null,
  });
});

test("agent trigger card state centralizes summaries timing and run presentation", () => {
  const longObjective = "Morning briefing for leadership stakeholders with overnight market moves and inbox triage";
  const state = agentTriggerCardState(
    {
      id: "trigger-2",
      trigger_type: "scheduled",
      config_json: {
        objective: longObjective,
        cron: "0 8 * * 1-5",
        last_run_at: "stale-config-value",
      },
      enabled: false,
      created_at: new Date(NOW_MS - 3 * 24 * 60 * 60 * 1000).toISOString(),
      next_run_at: new Date(NOW_MS + 125 * 60 * 1000).toISOString(),
      cron_expression: "0 8 * * 1-5",
      recent_runs: [
        { status: "failed", created_at: new Date(NOW_MS - 5 * 60 * 1000).toISOString() },
        { status: "success", ran_at: new Date(NOW_MS - 2 * 60 * 60 * 1000).toISOString() },
      ],
    },
    { nowMs: NOW_MS, expanded: false, maxCollapsedSummaryLength: 40 },
  );

  assert.equal(
    state.fullSummary,
    `${longObjective} | cron: 0 8 * * 1-5`,
  );
  assert.equal(
    state.displaySummary,
    `${state.fullSummary.slice(0, 40)}...`,
  );
  assert.equal(state.expandable, true);
  assert.equal(state.isEnabled, false);
  assert.equal(state.runCount, 2);
  assert.equal(state.runCountLabel, "2 runs");
  assert.equal(state.runCountClass, "border-white/25 bg-white/40 text-on-surface-variant");
  assert.equal(state.createdRelativeLabel, "3d ago");
  assert.equal(state.lastRunRelativeLabel, "5m ago");
  assert.equal(state.nextRunRelativeLabel, "just now");
  assert.equal(state.nextRunCountdownLabel, "in 2 h 5 m");
  assert.equal(state.recentRunsLabel, "Last 2 runs");
  assert.equal(state.hasRecentRuns, true);
  assert.equal(state.lastSuccessLabel, "2 h ago");
  assert.equal(state.cronSummary, "Every weekday at 08:00 UTC");
});
