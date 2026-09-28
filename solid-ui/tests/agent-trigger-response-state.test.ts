import test from "node:test";
import assert from "node:assert/strict";

import {
  agentTriggerCronExpression,
  agentTriggerHasRecentRuns,
  agentTriggerIsEnabled,
  agentTriggerLastRunAt,
  agentTriggerNextRunAt,
  agentTriggerRecentRuns,
  agentTriggerRunCount,
  agentTriggerRuntimeTimestamp,
  groupAgentTriggerRecordsByKind,
} from "../src/lib/agentTriggerResponseState.ts";

test("agentTriggerRuntimeTimestamp prefers top-level next_run_at when present", () => {
  const timestamp = agentTriggerRuntimeTimestamp(
    {
      id: "trigger-1",
      trigger_type: "scheduled",
      config_json: { next_run_at: "stale-config-value" },
      enabled: true,
      next_run_at: "2026-08-14T08:00:00Z",
    },
    "next_run_at",
  );

  assert.equal(timestamp, "2026-08-14T08:00:00Z");
});

test("agentTriggerRuntimeTimestamp falls back to config runtime fields for legacy payloads", () => {
  const timestamp = agentTriggerRuntimeTimestamp(
    {
      id: "trigger-2",
      trigger_type: "interval",
      config_json: { last_run_at: 1723622400000 },
      enabled: true,
    },
    "last_run_at",
  );

  assert.equal(timestamp, "1723622400000");
});

test("agentTriggerRuntimeTimestamp returns null when the runtime field is absent", () => {
  const timestamp = agentTriggerRuntimeTimestamp(
    {
      id: "trigger-3",
      trigger_type: "webhook",
      config_json: {},
      enabled: false,
    },
    "last_run_at",
  );

  assert.equal(timestamp, null);
});

test("agent trigger selectors normalize malformed recent run payloads", () => {
  const trigger = {
    id: "trigger-4",
    trigger_type: "scheduled",
    config_json: {},
    enabled: true,
    recent_runs: [
      { status: "completed", ran_at: "2026-08-14T07:00:00Z" },
      { status: 123 },
      { status: "failed", created_at: "2026-08-14T06:00:00Z" },
    ],
  } as const;

  assert.deepEqual(agentTriggerRecentRuns(trigger), [
    { status: "completed", ran_at: "2026-08-14T07:00:00Z", created_at: undefined },
    { status: "failed", ran_at: undefined, created_at: "2026-08-14T06:00:00Z" },
  ]);
  assert.equal(agentTriggerRunCount(trigger), 2);
  assert.equal(agentTriggerHasRecentRuns(trigger), true);
});

test("agent trigger selectors expose enablement, cron, and runtime helpers consistently", () => {
  const trigger = {
    id: "trigger-5",
    trigger_type: "interval",
    config_json: { last_run_at: "2026-08-14T05:00:00Z", next_run_at: 1723615200000 },
    enabled: false,
    next_run_at: null,
    cron_expression: "0 8 * * 1-5",
  };

  assert.equal(agentTriggerIsEnabled(trigger), false);
  assert.equal(agentTriggerCronExpression(trigger), "0 8 * * 1-5");
  assert.equal(agentTriggerLastRunAt(trigger), "2026-08-14T05:00:00Z");
  assert.equal(agentTriggerNextRunAt(trigger), null);
});

test("agent trigger grouping helper groups records by type in insertion order", () => {
  const grouped = groupAgentTriggerRecordsByKind([
    { id: "a", trigger_type: "scheduled" },
    { id: "b", trigger_type: "webhook" },
    { id: "c", trigger_type: "scheduled" },
  ]);

  assert.deepEqual(grouped, [
    {
      kind: "scheduled",
      items: [
        { id: "a", trigger_type: "scheduled" },
        { id: "c", trigger_type: "scheduled" },
      ],
    },
    {
      kind: "webhook",
      items: [{ id: "b", trigger_type: "webhook" }],
    },
  ]);
});
