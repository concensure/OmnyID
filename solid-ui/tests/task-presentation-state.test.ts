import test from "node:test";
import assert from "node:assert/strict";

import type { AfpMessage } from "@/lib/api";
import type { AgentTask } from "@/lib/taskDetailResponseState";
import {
  taskCreatedAtText,
  taskDateShortLabel,
  taskDetailTitleText,
  taskMessageContentRecord,
  taskMessageDescriptionText,
  taskMessageDueDate,
  taskMessagePresentation,
  taskMessageTitleText,
} from "@/lib/taskPresentationState";

function message(
  overrides: Partial<AfpMessage> & Pick<AfpMessage, "id" | "thread_id" | "from" | "timestamp" | "type" | "content" | "views" | "attachments">,
): AfpMessage {
  return {
    id: overrides.id,
    thread_id: overrides.thread_id,
    from: overrides.from,
    timestamp: overrides.timestamp,
    type: overrides.type,
    content: overrides.content,
    views: overrides.views,
    attachments: overrides.attachments,
    parent_id: overrides.parent_id,
    to: overrides.to,
    kind: overrides.kind,
    subtype: overrides.subtype,
    supertags: overrides.supertags,
    metadata: overrides.metadata,
    references: overrides.references,
    encryption: overrides.encryption,
    signature: overrides.signature,
  };
}

const NOW = new Date("2026-08-31T12:00:00Z");

test("task presentation normalizes task messages into one shared UI shape", () => {
  const state = taskMessagePresentation(message({
    id: "msg-1",
    thread_id: "thread-1",
    from: "agent@omnyid",
    timestamp: "2026-08-31T11:00:00Z",
    type: "task",
    content: {
      title: "Send invoice",
      description: "Finance is waiting on the final PDF",
      due_date: "2026-09-01T09:00:00Z",
    },
    views: [],
    attachments: [],
  }), NOW);

  assert.equal(state.isTask, true);
  assert.equal(state.isCompleted, false);
  assert.equal(state.isOverdue, false);
  assert.equal(state.isPending, true);
  assert.equal(state.titleText, "Send invoice");
  assert.equal(state.descriptionText, "Finance is waiting on the final PDF");
  assert.equal(state.dueDateLabel, "Sep 1");
  assert.equal(state.dueDateSortKey, "2026-09-01T09:00:00.000Z");
});

test("task presentation treats malformed content and invalid due dates safely", () => {
  const malformed = message({
    id: "msg-2",
    thread_id: "thread-2",
    from: "agent@omnyid",
    timestamp: "2026-08-31T11:00:00Z",
    type: "task",
    content: null as unknown as Record<string, unknown>,
    views: [],
    attachments: [],
  });
  const invalidDue = message({
    id: "msg-3",
    thread_id: "thread-3",
    from: "agent@omnyid",
    timestamp: "2026-08-31T11:00:00Z",
    type: "note",
    content: {
      kind: "task",
      title: 404,
      description: true,
      due_date: "not-a-date",
    },
    views: [],
    attachments: [],
  });

  assert.deepEqual(taskMessageContentRecord(malformed), {});
  assert.equal(taskMessageTitleText(malformed), "Task");
  assert.equal(taskMessageDescriptionText(malformed), null);
  assert.equal(taskMessageDueDate(malformed), null);

  const invalidState = taskMessagePresentation(invalidDue, NOW);
  assert.equal(invalidState.isTask, true);
  assert.equal(invalidState.isPending, true);
  assert.equal(invalidState.isOverdue, false);
  assert.equal(invalidState.titleText, "404");
  assert.equal(invalidState.descriptionText, "true");
  assert.equal(invalidState.dueDateValue, "not-a-date");
  assert.equal(invalidState.dueDateLabel, null);
  assert.equal(invalidState.dueDateSortKey, null);
});

test("task presentation centralizes completed and overdue classification", () => {
  const overdue = taskMessagePresentation(message({
    id: "msg-4",
    thread_id: "thread-4",
    from: "agent@omnyid",
    timestamp: "2026-08-31T11:00:00Z",
    type: "task",
    content: {
      title: "Pay supplier",
      due_date: "2026-08-30T23:00:00Z",
    },
    views: [],
    attachments: [],
  }), NOW);
  const completed = taskMessagePresentation(message({
    id: "msg-5",
    thread_id: "thread-5",
    from: "agent@omnyid",
    timestamp: "2026-08-31T11:00:00Z",
    type: "task",
    content: {
      title: "Archive receipts",
      status: "completed",
      due_date: Date.parse("2026-08-31T00:00:00Z"),
    },
    views: [],
    attachments: [],
  }), NOW);

  assert.equal(overdue.isPending, false);
  assert.equal(overdue.isOverdue, true);
  assert.equal(completed.isCompleted, true);
  assert.equal(completed.isPending, false);
  assert.equal(completed.isOverdue, false);
  assert.equal(completed.dueDateLabel, "Aug 31");
});

test("task presentation accepts due_at as a fallback for AFP task projections", () => {
  const state = taskMessagePresentation(message({
    id: "msg-due-at",
    thread_id: "thread-due-at",
    from: "system://contacts",
    timestamp: "2026-08-31T11:00:00Z",
    type: "task",
    content: {
      kind: "contact_follow_up_task",
      title: "Follow up with supplier: Harbour Venue",
      description: "Reply SLA has expired.",
      due_at: "2026-09-02T09:00:00Z",
    },
    views: [],
    attachments: [],
  }), NOW);

  assert.equal(state.isTask, true);
  assert.equal(state.dueDateValue, "2026-09-02T09:00:00Z");
  assert.equal(state.dueDateLabel, "Sep 2");
  assert.equal(state.dueDateSortKey, "2026-09-02T09:00:00.000Z");
});

test("task presentation hides encrypted task payloads until local decryption is available", () => {
  const encrypted = message({
    id: "msg-encrypted-task",
    thread_id: "thread-encrypted-task",
    from: "agent@omnyid",
    timestamp: "2026-08-31T11:00:00Z",
    type: "task",
    content: {
      title: "Hidden venue payment",
      description: "Pay the secret venue deposit.",
      due_date: "2026-09-02T09:00:00Z",
      ciphertext: "abc123",
      nonce: "nonce123",
    },
    encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" } as any,
    views: [],
    attachments: [],
  });

  assert.deepEqual(taskMessageContentRecord(encrypted), {});
  assert.equal(taskMessageTitleText(encrypted), "Encrypted message - unlock this device to view");
  assert.equal(taskMessageDescriptionText(encrypted), null);
  assert.equal(taskMessageDueDate(encrypted), null);

  const state = taskMessagePresentation(encrypted, NOW);
  assert.equal(state.titleText, "Encrypted message - unlock this device to view");
  assert.equal(state.descriptionText, null);
  assert.equal(state.dueDateValue, null);
  assert.equal(state.isPending, true);
});

test("task presentation centralizes task detail title and created-at labels", () => {
  const task: AgentTask = {
    id: "task-1",
    intent: "",
    content: "Fallback content",
    status: "pending",
    priority: "high",
    created_at: "2026-08-31T06:05:00Z",
    started_at: null,
    thread_id: "thread-1",
  };

  assert.equal(taskDetailTitleText(task), "Fallback content");
  assert.equal(taskDateShortLabel("2026-08-31T06:05:00Z"), "Aug 31");
  assert.equal(taskCreatedAtText(task), "Aug 31, 2026, 4:05 PM");
});
