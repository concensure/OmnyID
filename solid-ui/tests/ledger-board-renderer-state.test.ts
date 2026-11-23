import test from "node:test";
import assert from "node:assert/strict";

import {
  ledgerTaskUpdateSendInput,
  ledgerTaskWithOverrides,
  todoTaskStates,
  type LedgerTask,
} from "../src/lib/ledgerBoardTodoState.ts";

const TASK: LedgerTask = {
  task_id: "task-venue",
  thread_id: "thread-venue",
  source_message_id: "msg-venue",
  title: "Confirm venue deposit",
  status: "pending",
  raw_status: "pending",
  priority: "high",
  progress: 20,
  assigned_to: "Maya",
  due_date: "2026-10-14T09:00:00Z",
  due_label: "Before contract lock",
  blockers: ["Waiting on venue invoice"],
};

test("todoTaskStates preserves Active-ToDos selection, owner, due label, and blockers", () => {
  const state = todoTaskStates([TASK], new Set(["task-venue"]));

  assert.equal(state.length, 1);
  assert.equal(state[0]?.selected, true);
  assert.equal(state[0]?.showAssignedTo, true);
  assert.equal(state[0]?.assignedToText, "Maya");
  assert.equal(state[0]?.showDueDate, true);
  assert.equal(state[0]?.dueDateText, "Before contract lock");
  assert.equal(state[0]?.showBlockers, true);
  assert.equal(state[0]?.blockersText, "Waiting on venue invoice");
});

test("ledgerTaskWithOverrides updates list projection without dropping task metadata", () => {
  const updated = ledgerTaskWithOverrides(TASK, {
    assignedTo: "Jordan",
    status: "done",
  });

  assert.equal(updated.assigned_to, "Jordan");
  assert.equal(updated.status, "done");
  assert.equal(updated.raw_status, "done");
  assert.equal(updated.thread_id, "thread-venue");
  assert.equal(updated.due_label, "Before contract lock");
});

test("ledgerTaskUpdateSendInput creates mergeable AFP task updates for assignment and selection changes", () => {
  const input = ledgerTaskUpdateSendInput(TASK, {
    assignedTo: "Jordan",
    status: "done",
  });

  assert.ok(input);
  assert.equal(input.thread_id, "thread-venue");
  assert.equal(input.parent_id, "msg-venue");
  assert.equal(input.type, "task");
  assert.equal(input.subtype, "update");
  assert.equal(input.metadata?.task_update_source, "active_todos");
  assert.equal(input.metadata?.updated_task_id, "task-venue");
  assert.deepEqual(input.content, {
    task_id: "task-venue",
    title: "Confirm venue deposit",
    status: "done",
    priority: "high",
    progress: 20,
    assigned_to: "Jordan",
    due_date: "2026-10-14T09:00:00Z",
    due_label: "Before contract lock",
  });
});

test("ledgerTaskUpdateSendInput skips empty updates", () => {
  assert.equal(ledgerTaskUpdateSendInput(TASK, {}), null);
});

test("ledgerTaskUpdateSendInput can clear an existing owner", () => {
  const input = ledgerTaskUpdateSendInput(TASK, { assignedTo: "" });
  assert.ok(input);
  assert.equal(input.metadata?.assigned_to_changed, true);
  assert.equal((input.content as Record<string, unknown>).assigned_to, "");
});
