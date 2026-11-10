import assert from "node:assert/strict";
import test from "node:test";

import {
  loadWeddingTaskCompletion,
  saveWeddingTaskCompletion,
  weddingTaskCompletionKey,
} from "@/lib/weddingTaskCompletionLocalState";
import { setWeddingLocalAccountScope } from "@/lib/weddingLocalAccountScope";

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

function throwingStorage(): Storage {
  return {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  } as unknown as Storage;
}

test("wedding task completion state saves and reloads by workspace scope", () => {
  const storage = memoryStorage();
  const saved = saveWeddingTaskCompletion({
    taskId: "afp-wedding-task:noim",
    responseWorkspaceId: "response_workspace:harbour",
    weddingPlanId: "wedding_plan:harbour",
    completed: true,
    nowIso: "2026-09-12T00:00:00.000Z",
  }, storage);

  const loaded = loadWeddingTaskCompletion({
    taskId: "afp-wedding-task:noim",
    responseWorkspaceId: "response_workspace:harbour",
    weddingPlanId: "wedding_plan:harbour",
  }, storage);

  assert.equal(saved?.completed, true);
  assert.equal(loaded?.completed, true);
  assert.equal(loaded?.savedAt, "2026-09-12T00:00:00.000Z");
});

test("wedding task completion state isolates same task id across workspaces", () => {
  const storage = memoryStorage();
  saveWeddingTaskCompletion({
    taskId: "afp-wedding-task:noim",
    responseWorkspaceId: "response_workspace:a",
    weddingPlanId: "wedding_plan:a",
    completed: true,
  }, storage);
  saveWeddingTaskCompletion({
    taskId: "afp-wedding-task:noim",
    responseWorkspaceId: "response_workspace:b",
    weddingPlanId: "wedding_plan:b",
    completed: false,
  }, storage);

  assert.equal(loadWeddingTaskCompletion({
    taskId: "afp-wedding-task:noim",
    responseWorkspaceId: "response_workspace:a",
    weddingPlanId: "wedding_plan:a",
  }, storage)?.completed, true);
  assert.equal(loadWeddingTaskCompletion({
    taskId: "afp-wedding-task:noim",
    responseWorkspaceId: "response_workspace:b",
    weddingPlanId: "wedding_plan:b",
  }, storage)?.completed, false);
});

test("wedding task completion state isolates the same starter plan and task across accounts", () => {
  const storage = memoryStorage();
  const scope = {
    taskId: "starter-task:venue",
    responseWorkspaceId: "response_workspace:starter",
    weddingPlanId: "wedding_plan:starter",
  };
  setWeddingLocalAccountScope("user-mia");
  saveWeddingTaskCompletion({ ...scope, completed: true }, storage);
  setWeddingLocalAccountScope("user-priya");
  assert.equal(loadWeddingTaskCompletion(scope, storage), null);
  saveWeddingTaskCompletion({ ...scope, completed: false }, storage);
  assert.equal(loadWeddingTaskCompletion(scope, storage)?.completed, false);
  setWeddingLocalAccountScope("user-mia");
  assert.equal(loadWeddingTaskCompletion(scope, storage)?.completed, true);
  setWeddingLocalAccountScope(null);
});

test("wedding task completion state rejects missing task ids and malformed stored records", () => {
  const storage = memoryStorage();
  assert.equal(weddingTaskCompletionKey({ taskId: "" }), null);
  assert.equal(saveWeddingTaskCompletion({ taskId: "", completed: true }, storage), null);

  const key = weddingTaskCompletionKey({
    taskId: "afp-wedding-task:bad",
    responseWorkspaceId: "workspace",
    weddingPlanId: "plan",
  });
  assert.ok(key);
  storage.setItem(key, "{bad-json");
  assert.equal(loadWeddingTaskCompletion({
    taskId: "afp-wedding-task:bad",
    responseWorkspaceId: "workspace",
    weddingPlanId: "plan",
  }, storage), null);
  assert.equal(storage.getItem(key), null);
});

test("wedding task completion state rejects scope mismatches and invalid timestamps", () => {
  const storage = memoryStorage();
  const scoped = {
    taskId: "afp-wedding-task:expected",
    responseWorkspaceId: "workspace",
    weddingPlanId: "plan",
  };
  const key = weddingTaskCompletionKey(scoped);
  assert.ok(key);
  storage.setItem(key, JSON.stringify({
    taskId: "afp-wedding-task:other",
    responseWorkspaceId: "workspace",
    weddingPlanId: "plan",
    completed: true,
    savedAt: "2026-09-12T00:00:00.000Z",
  }));

  assert.equal(loadWeddingTaskCompletion(scoped, storage), null);
  assert.equal(storage.getItem(key), null);

  storage.setItem(key, JSON.stringify({
    ...scoped,
    completed: true,
    savedAt: "not-a-date",
  }));
  assert.equal(loadWeddingTaskCompletion(scoped, storage), null);
  assert.equal(storage.getItem(key), null);
});

test("wedding task completion state tolerates unavailable storage", () => {
  assert.equal(saveWeddingTaskCompletion({ taskId: "task", completed: true }, throwingStorage()), null);
  assert.equal(loadWeddingTaskCompletion({ taskId: "task" }, throwingStorage()), null);
});
