import assert from "node:assert/strict";
import test from "node:test";

import {
  weddingTaskCompletionToAfpMessage,
  weddingTaskCompletionToAfpSendInput,
} from "@/lib/weddingTaskCompletionProjectionState";

const record = {
  taskId: "afp-wedding-task:noim",
  responseWorkspaceId: "response_workspace:harbour",
  weddingPlanId: "wedding_plan:harbour",
  completed: true,
  savedAt: "2026-09-12T00:00:00.000Z",
};

test("wedding task completion projection creates a first-class status AFP message", () => {
  const message = weddingTaskCompletionToAfpMessage({
    record,
    title: "Download NOIM",
    sourceMessageId: "afp-wedding-task:noim",
    nowIso: "2026-09-12T01:00:00.000Z",
  });

  assert.ok(message);
  assert.equal(message.type, "task_status");
  assert.equal(message.kind, "task");
  assert.equal(message.subtype, "wedding_task_completion");
  assert.deepEqual(message.to, ["agent://tasks", "agent://wedding-planning", "agent://decision-os", "agent://knowledge-graph"]);
  assert.ok(message.supertags?.includes("decisionos:wedding_task_completion"));
  assert.ok(message.supertags?.includes("topology:wedding_task_graph"));
  assert.ok(message.supertags?.includes("wedding_task_status:done"));
  assert.equal(message.content.status, "done");
  assert.equal(message.content.completed, true);
  assert.equal(message.content.agent_action_requested, true);
  assert.equal(message.content.agent_action, "advance_unblocked_wedding_work");
  assert.equal(message.content.completed_at, "2026-09-12T00:00:00.000Z");
  assert.equal(message.metadata?.projection, "wedding_task_completion_to_afp_status");
  assert.equal(message.metadata?.agent_action_requested, true);
  assert.equal(message.metadata?.local_only_until_backend_sync, true);
  assert.equal(message.views[0]?.format, "task_card");
  assert.equal(message.references?.some((reference) => reference.type === "wedding_plan" && reference.target === "wedding_plan:harbour"), true);
  assert.equal(message.references?.some((reference) => reference.type === "response_workspace" && reference.target === "response_workspace:harbour"), true);
  assert.equal(message.references?.some((reference) => reference.type === "task" && reference.target === "afp-wedding-task:noim"), true);
});

test("wedding task completion projection represents unticked tasks as reopened", () => {
  const message = weddingTaskCompletionToAfpMessage({
    record: { ...record, completed: false },
    title: "Download NOIM",
    nowIso: "2026-09-12T01:00:00.000Z",
  });

  assert.ok(message);
  assert.ok(message.supertags?.includes("wedding_task_status:pending"));
  assert.equal(message.content.status, "pending");
  assert.equal(message.content.agent_action, "review_reopened_wedding_task");
  assert.equal(message.content.completed_at, null);
  assert.equal(message.content.reopened_at, "2026-09-12T00:00:00.000Z");
});

test("wedding task completion projection exposes relational send input and rejects missing records", () => {
  const input = weddingTaskCompletionToAfpSendInput({
    record,
    title: "Download NOIM",
    nowIso: "2026-09-12T01:00:00.000Z",
  });

  assert.ok(input);
  assert.equal(input.type, "task_status");
  assert.equal(input.store_in_relational, true);
  assert.ok(input.supertags?.includes("wedding_task_status:done"));
  assert.equal(weddingTaskCompletionToAfpMessage({ record: null }), null);
  assert.equal(weddingTaskCompletionToAfpSendInput({ record: { ...record, taskId: "" } }), null);
});
