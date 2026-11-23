import assert from "node:assert/strict";
import test from "node:test";

import { dispatchWeddingTaskCompletionSync } from "@/lib/weddingTaskCompletionSyncDispatchState";
import type { WeddingTaskCompletionSyncItem } from "@/lib/weddingTaskCompletionSyncState";

function item(taskId: string): WeddingTaskCompletionSyncItem {
  return {
    taskId,
    title: `Task ${taskId}`,
    completed: true,
    statusLabel: "Completion sync ready",
    actionLabel: "Mark done",
    detailLabel: "Done locally",
    savedAt: "2026-09-12T00:00:00.000Z",
    sendInput: {
      thread_id: "thread-1",
      from: "agent://tasks",
      to: ["agent://wedding-planning"],
      type: "task_status",
      kind: "task",
      subtype: "wedding_task_completion",
      content: { task_id: taskId, status: "done" },
    },
  };
}

test("dispatches wedding task completion sync items and reports saved responses", async () => {
  const calls: string[] = [];
  const receipt = await dispatchWeddingTaskCompletionSync({
    items: [item("one"), item("two")],
    save: async (input) => {
      calls.push((input.content as { task_id: string }).task_id);
      return { success: true, message_id: `message-${calls.length}` };
    },
  });

  assert.deepEqual(calls, ["one", "two"]);
  assert.equal(receipt.attemptedCount, 2);
  assert.equal(receipt.savedCount, 2);
  assert.equal(receipt.failedCount, 0);
  assert.equal(receipt.skippedCount, 0);
  assert.equal(receipt.results[0]?.status, "saved");
  assert.equal(receipt.results[0]?.messageId, "message-1");
  assert.equal(receipt.summaryLabel, "2 wedding task status updates saved; refresh will clear pending state.");
});

test("marks backend non-success responses as failed", async () => {
  const receipt = await dispatchWeddingTaskCompletionSync({
    items: [item("one")],
    save: async () => ({ success: false, error: "Rejected" }),
  });

  assert.equal(receipt.savedCount, 0);
  assert.equal(receipt.failedCount, 1);
  assert.equal(receipt.results[0]?.status, "failed");
  assert.equal(receipt.results[0]?.error, "Rejected");
});

test("fails closed without explicit success and durable message id", async () => {
  let index = 0;
  const receipt = await dispatchWeddingTaskCompletionSync({
    items: [item("one"), item("two")],
    save: async () => {
      index += 1;
      return index === 1 ? { message_id: "msg-without-success" } : { success: true };
    },
  });

  assert.equal(receipt.savedCount, 0);
  assert.equal(receipt.failedCount, 2);
  assert.ok(receipt.results.some((result) => /did not confirm success/i.test(result.error ?? "")));
  assert.ok(receipt.results.some((result) => /durable message id/i.test(result.error ?? "")));
});

test("marks thrown save errors as failed", async () => {
  const receipt = await dispatchWeddingTaskCompletionSync({
    items: [item("one")],
    save: async () => {
      throw new Error("Network unavailable");
    },
  });

  assert.equal(receipt.failedCount, 1);
  assert.equal(receipt.results[0]?.error, "Network unavailable");
});

test("skips dispatch when no save function is available", async () => {
  const receipt = await dispatchWeddingTaskCompletionSync({
    items: [item("one")],
    save: null,
  });

  assert.equal(receipt.attemptedCount, 1);
  assert.equal(receipt.savedCount, 0);
  assert.equal(receipt.skippedCount, 1);
  assert.equal(receipt.results[0]?.status, "skipped");
});
