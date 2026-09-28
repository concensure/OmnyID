import test from "node:test";
import assert from "node:assert/strict";

import {
  weddingTaskDateToAfpMessage,
  weddingTaskDateToAfpSendInput,
} from "@/lib/weddingTaskDateProjectionState";

const base = {
  taskId: "afp-wedding-task:venue-deposit",
  title: "Confirm venue deposit date",
  weddingPlanId: "wedding_plan:date-test",
  responseWorkspaceId: "response_workspace:date-test",
  sourceMessageId: "message:task-source",
  nowIso: "2026-09-27T01:00:00.000Z",
};

test("weddingTaskDateToAfpMessage creates a relational due-date update", () => {
  const message = weddingTaskDateToAfpMessage({ ...base, dueDate: "2027-08-01" });
  assert.ok(message);
  assert.equal(message.type, "task_update");
  assert.equal(message.subtype, "wedding_task_due_date_update");
  assert.ok(message.to?.includes("agent://calendar"));
  assert.ok(message.to?.includes("agent://knowledge-graph"));
  assert.equal((message.content as Record<string, unknown>).due_date, "2027-08-01");
  assert.equal((message.content as Record<string, unknown>).due_at, "2027-08-01T09:00:00.000Z");
  assert.equal((message.metadata as Record<string, unknown>).agent_action, "rebuild_wedding_timeline_and_reminders");
  assert.ok(message.references.some((reference) => reference.type === "task" && reference.target === base.taskId));
});

test("weddingTaskDateToAfpMessage can clear a task date without dropping topology", () => {
  const message = weddingTaskDateToAfpMessage({ ...base, dueDate: null });
  assert.ok(message);
  assert.equal((message.content as Record<string, unknown>).due_date, null);
  assert.equal((message.content as Record<string, unknown>).status, "undated");
  assert.ok(message.supertags?.includes("wedding_task_date_status:undated"));
});

test("weddingTaskDateToAfpSendInput fails closed for malformed dates or missing scope", () => {
  assert.equal(weddingTaskDateToAfpSendInput({ ...base, dueDate: "2027-02-31" }), null);
  assert.equal(weddingTaskDateToAfpSendInput({ ...base, taskId: "", dueDate: "2027-08-01" }), null);

  const sendInput = weddingTaskDateToAfpSendInput({ ...base, dueDate: "2027-08-01" });
  assert.ok(sendInput);
  assert.equal(sendInput.store_in_relational, true);
  assert.equal(sendInput.subtype, "wedding_task_due_date_update");
});
