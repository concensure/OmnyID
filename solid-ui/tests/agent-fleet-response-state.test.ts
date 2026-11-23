import test from "node:test";
import assert from "node:assert/strict";

import {
  fleetActiveOrPendingTasks,
  fleetActiveTasks,
  fleetActiveCount,
  fleetCancelledTasks,
  fleetCompletedTasks,
  fleetFailedTasks,
  fleetIdleCount,
  fleetMasterInstance,
  fleetMasterInstanceId,
  fleetPendingTasks,
  fleetRecentTasks,
  fleetStatusSummary,
  isAgentFleetTaskActive,
  isAgentFleetTaskCancellable,
  isAgentFleetTaskCancelled,
  isAgentFleetTaskCompleted,
  isAgentFleetTaskFailed,
  isAgentFleetTaskPending,
} from "../src/lib/agentFleetResponseState.ts";

test("fleetMasterInstance returns the normalized master instance when present", () => {
  const master = fleetMasterInstance({
    master_instance: {
      id: "master-1",
      soul_md: "operator",
      lora_confidence_score: 0.72,
      lora_genome_active: true,
      is_master: true,
    },
  });

  assert.deepEqual(master, {
    id: "master-1",
    soul_md: "operator",
    lora_confidence_score: 0.72,
    lora_genome_active: true,
    is_master: true,
  });
});

test("fleetStatusSummary derives stable fallback counts from recent task statuses", () => {
  const summary = fleetStatusSummary({
    recent_tasks: [
      { id: "a", status: "executing", priority: "high", created_at: "2026-08-14T00:00:00Z" },
      { id: "b", status: "planning", priority: "high", created_at: "2026-08-14T00:00:00Z" },
      { id: "c", status: "pending", priority: "normal", created_at: "2026-08-14T00:00:00Z" },
      { id: "d", status: "queued", priority: "normal", created_at: "2026-08-14T00:00:00Z" },
      { id: "e", status: "completed", priority: "normal", created_at: "2026-08-14T00:00:00Z" },
    ],
    healthy: undefined,
    error_count: undefined,
  });

  assert.deepEqual(summary, {
    active_count: 2,
    idle_count: 2,
    active_agents: [],
    error_count: 0,
    healthy: true,
  });
});

test("fleetStatusSummary preserves explicit server counters over task-derived fallbacks", () => {
  const summary = fleetStatusSummary({
    active_count: 7,
    idle_count: 3,
    active_agents: ["planner", "reviewer"],
    error_count: 1,
    healthy: false,
    recent_tasks: [
      { id: "a", status: "executing", priority: "high", created_at: "2026-08-14T00:00:00Z" },
    ],
  });

  assert.deepEqual(summary, {
    active_count: 7,
    idle_count: 3,
    active_agents: ["planner", "reviewer"],
    error_count: 1,
    healthy: false,
  });
});

test("fleetMasterInstanceId returns a string id and fleetRecentTasks returns a stable fallback list", () => {
  const fleet = {
    master_instance: { id: 42 },
    recent_tasks: [{ id: "task-1", status: "pending", priority: "normal", created_at: "2026-08-14T00:00:00Z" }],
  };

  assert.equal(fleetMasterInstanceId(fleet), "42");
  assert.deepEqual(fleetRecentTasks(fleet), fleet.recent_tasks);
  assert.deepEqual(fleetRecentTasks({}), []);
});

test("fleet task status helpers classify active pending completed failed and cancelled states consistently", () => {
  assert.equal(isAgentFleetTaskActive({ status: "executing" }), true);
  assert.equal(isAgentFleetTaskActive({ status: "in_progress" }), true);
  assert.equal(isAgentFleetTaskPending({ status: "pending" }), true);
  assert.equal(isAgentFleetTaskPending({ status: "queued" }), true);
  assert.equal(isAgentFleetTaskCancellable({ status: "planning" }), true);
  assert.equal(isAgentFleetTaskCancellable({ status: "queued" }), true);
  assert.equal(isAgentFleetTaskCompleted({ status: "completed" }), true);
  assert.equal(isAgentFleetTaskFailed({ status: "failed" }), true);
  assert.equal(isAgentFleetTaskFailed({ status: "error" }), true);
  assert.equal(isAgentFleetTaskCancelled({ status: "cancelled" }), true);
  assert.equal(isAgentFleetTaskActive({ status: "completed" }), false);
  assert.equal(isAgentFleetTaskPending({ status: "failed" }), false);
  assert.equal(isAgentFleetTaskCancellable({ status: "completed" }), false);
});

test("fleetActiveCount and fleetIdleCount reuse the shared fleet status summary contract", () => {
  const fleet = {
    recent_tasks: [
      { id: "a", status: "running", priority: "normal", created_at: "2026-08-14T00:00:00Z" },
      { id: "b", status: "queued", priority: "normal", created_at: "2026-08-14T00:00:00Z" },
    ],
  };

  assert.equal(fleetActiveCount(fleet), 1);
  assert.equal(fleetIdleCount(fleet), 1);
});

test("fleet task bucket selectors return stable grouped task lists", () => {
  const fleet = {
    recent_tasks: [
      { id: "active-1", status: "executing", priority: "normal", created_at: "2026-08-14T00:00:00Z" },
      { id: "active-2", status: "planning", priority: "normal", created_at: "2026-08-14T00:00:00Z" },
      { id: "pending-1", status: "pending", priority: "normal", created_at: "2026-08-14T00:00:00Z" },
      { id: "pending-2", status: "queued", priority: "normal", created_at: "2026-08-14T00:00:00Z" },
      { id: "done-1", status: "completed", priority: "normal", created_at: "2026-08-14T00:00:00Z" },
      { id: "fail-1", status: "failed", priority: "normal", created_at: "2026-08-14T00:00:00Z" },
      { id: "cancel-1", status: "cancelled", priority: "normal", created_at: "2026-08-14T00:00:00Z" },
    ],
  };

  assert.deepEqual(fleetActiveTasks(fleet).map((task) => task.id), ["active-1", "active-2"]);
  assert.deepEqual(fleetPendingTasks(fleet).map((task) => task.id), ["pending-1", "pending-2"]);
  assert.deepEqual(fleetActiveOrPendingTasks(fleet).map((task) => task.id), ["active-1", "active-2", "pending-1", "pending-2"]);
  assert.deepEqual(fleetCompletedTasks(fleet).map((task) => task.id), ["done-1"]);
  assert.deepEqual(fleetFailedTasks(fleet).map((task) => task.id), ["fail-1"]);
  assert.deepEqual(fleetCancelledTasks(fleet).map((task) => task.id), ["cancel-1"]);
});
