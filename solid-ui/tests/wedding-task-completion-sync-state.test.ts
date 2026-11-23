import assert from "node:assert/strict";
import test from "node:test";

import { saveWeddingTaskCompletion } from "@/lib/weddingTaskCompletionLocalState";
import { buildWeddingTaskCompletionSyncState } from "@/lib/weddingTaskCompletionSyncState";
import type { WeddingTaskHierarchyStage } from "@/lib/weddingTaskHierarchyState";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  } as Storage;
}

function stage(status = "pending"): WeddingTaskHierarchyStage<{
  task_id: string;
  title: string;
  status: string;
  wedding_plan_id: string;
  response_workspace_id: string;
}> {
  return {
    id: "anytime",
    label: "Anytime",
    timingLabel: "No fixed deadline",
    accentClass: "test",
    items: [
      {
        task: {
          task_id: "afp-wedding-task:noim",
          title: "Download NOIM",
          status,
          wedding_plan_id: "wedding_plan:harbour",
          response_workspace_id: "response_workspace:harbour",
        },
        title: "Download NOIM",
        completed: status === "done",
        stageId: "anytime",
        stageLabel: "Anytime",
        dueText: "Anytime",
        dueSortKey: -1,
        statusClass: "test",
        titleClass: "test",
        checkboxLabel: "Mark Download NOIM complete",
      },
    ],
  };
}

test("wedding task completion sync state reports pending completion when local state differs from task status", () => {
  const storage = memoryStorage();
  saveWeddingTaskCompletion({
    taskId: "afp-wedding-task:noim",
    responseWorkspaceId: "response_workspace:harbour",
    weddingPlanId: "wedding_plan:harbour",
    completed: true,
    nowIso: "2026-09-12T00:00:00.000Z",
  }, storage);

  const state = buildWeddingTaskCompletionSyncState([stage("pending")], storage);

  assert.equal(state.hasPending, true);
  assert.equal(state.pendingCount, 1);
  assert.equal(state.summaryLabel, "1 task status update ready to save");
  assert.equal(state.pendingItems[0]?.statusLabel, "Ready to mark done");
  assert.equal(state.pendingItems[0]?.actionLabel, "Mark done");
  assert.equal(state.pendingItems[0]?.detailLabel, "Done locally at 2026-09-12T00:00:00.000Z");
  assert.equal(state.pendingItems[0]?.sendInput.type, "task_status");
});

test("wedding task completion sync state reports pending reopen when a done task is unticked", () => {
  const storage = memoryStorage();
  saveWeddingTaskCompletion({
    taskId: "afp-wedding-task:noim",
    responseWorkspaceId: "response_workspace:harbour",
    weddingPlanId: "wedding_plan:harbour",
    completed: false,
    nowIso: "2026-09-12T00:00:00.000Z",
  }, storage);

  const state = buildWeddingTaskCompletionSyncState([stage("done")], storage);

  assert.equal(state.hasPending, true);
  assert.equal(state.pendingItems[0]?.statusLabel, "Ready to mark not done");
  assert.equal(state.pendingItems[0]?.actionLabel, "Mark not done");
  assert.equal(state.pendingItems[0]?.sendInput.content.status, "pending");
});

test("wedding task completion sync state hides records already reflected by task status", () => {
  const storage = memoryStorage();
  saveWeddingTaskCompletion({
    taskId: "afp-wedding-task:noim",
    responseWorkspaceId: "response_workspace:harbour",
    weddingPlanId: "wedding_plan:harbour",
    completed: true,
    nowIso: "2026-09-12T00:00:00.000Z",
  }, storage);

  const state = buildWeddingTaskCompletionSyncState([stage("done")], storage);

  assert.equal(state.hasPending, false);
  assert.equal(state.pendingCount, 0);
  assert.equal(state.summaryLabel, "No task status changes waiting to save");
});
