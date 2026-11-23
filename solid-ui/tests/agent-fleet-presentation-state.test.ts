import test from "node:test";
import assert from "node:assert/strict";

import {
  agentFleetDelegationRowState,
  agentFleetSummaryState,
  agentFleetTaskRowState,
  agentFleetTaskStatusClass,
} from "../src/lib/agentFleetPresentationState.ts";
import { surfaceShortDateLabel, surfaceTimeLabel } from "../src/lib/surfaceTimestampPresentation.ts";

const NOW_MS = Date.UTC(2026, 7, 14, 12, 0, 0);

test("fleet presentation summary provides stable fallback state", () => {
  assert.deepEqual(agentFleetSummaryState({}), {
    activeCount: 0,
    idleCount: 0,
    hasActiveWork: false,
    indicatorClass: "bg-green-400",
    statusLabel: "0 active | 0 pending",
  });
});

test("fleet presentation summary reuses fleet counters and active indicator", () => {
  assert.deepEqual(
    agentFleetSummaryState({
      recent_tasks: [
        { id: "task-1", status: "executing", priority: "high", created_at: "2026-08-14T00:00:00Z" },
        { id: "task-2", status: "queued", priority: "normal", created_at: "2026-08-14T00:00:00Z" },
      ],
    }),
    {
      activeCount: 1,
      idleCount: 1,
      hasActiveWork: true,
      indicatorClass: "animate-pulse bg-blue-500",
      statusLabel: "1 active | 1 pending",
    },
  );
});

test("fleet delegation row state normalizes task and expiry labels", () => {
  assert.deepEqual(
    agentFleetDelegationRowState({
      id: "delegation-1",
      scope: "email:read",
      mask: "private",
      expires_at: "2026-08-14T05:10:00Z",
      task_id: null,
    }),
    {
      id: "delegation-1",
      scope: "email:read",
      mask: "private",
      expiresLabel: surfaceTimeLabel("2026-08-14T05:10:00Z"),
      taskLabel: "-",
    },
  );
});

test("fleet task row state centralizes labels durations and cancel state", () => {
  const state = agentFleetTaskRowState(
    {
      id: "task-9",
      intent: "Review approvals",
      content: "fallback copy",
      status: "planning",
      priority: "high",
      created_at: "2026-08-10T00:00:00Z",
      started_at: new Date(NOW_MS - 125000).toISOString(),
    },
    { nowMs: NOW_MS, cancelingId: "other-task" },
  );

  assert.deepEqual(state, {
    id: "task-9",
    label: "Review approvals",
    status: "planning",
    statusClass: "text-blue-500",
    durationLabel: "2m 5s",
    priority: "high",
    createdLabel: surfaceShortDateLabel("2026-08-10T00:00:00Z"),
    canCancel: true,
  });
});

test("fleet task row state disables cancel and omits duration for terminal tasks", () => {
  const state = agentFleetTaskRowState(
    {
      id: "task-10",
      status: "completed",
      priority: "normal",
      created_at: "2026-08-14T00:00:00Z",
    },
    { nowMs: NOW_MS, cancelingId: "task-10" },
  );

  assert.equal(state.durationLabel, null);
  assert.equal(state.canCancel, false);
  assert.equal(state.statusClass, "text-green-600");
});

test("fleet task status class preserves task-state tones", () => {
  assert.equal(agentFleetTaskStatusClass("failed"), "text-red-500");
  assert.equal(agentFleetTaskStatusClass("cancelled"), "text-on-surface-variant");
  assert.equal(agentFleetTaskStatusClass("queued"), "text-yellow-600");
});
