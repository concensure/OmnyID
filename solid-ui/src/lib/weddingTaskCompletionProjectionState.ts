// @locs-version: 2.0
import type { AfpMessage, AfpReference, SendAfpMessageInput } from "@/lib/api";
import type { WeddingTaskCompletionRecord } from "@/lib/weddingTaskCompletionLocalState";
import { safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

export type WeddingTaskCompletionProjectionInput = {
  record?: WeddingTaskCompletionRecord | null;
  title?: string | null;
  sourceMessageId?: string | null;
  nowIso?: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function weddingTaskCompletionToAfpMessage(
  input: WeddingTaskCompletionProjectionInput,
): AfpMessage | null {
  const record = input.record;
  const taskId = clean(record?.taskId);
  if (!record || !taskId) return null;
  const nowIso = clean(input.nowIso) || new Date().toISOString();
  const status = record.completed ? "done" : "pending";
  const messageId = `afp-wedding-task-completion:${safeWeddingLabel(record.weddingPlanId)}:${safeWeddingLabel(record.responseWorkspaceId)}:${safeWeddingLabel(taskId)}:${status}`;
  const title = clean(input.title) || "Wedding task status update";
  const references: AfpReference[] = [
    {
      type: "task",
      target: taskId,
      label: "Updated wedding task",
    },
  ];
  const sourceMessageId = clean(input.sourceMessageId);
  if (sourceMessageId) {
    references.push({
      type: "message",
      target: sourceMessageId,
      label: "Source task message",
    });
  }
  return {
    id: messageId,
    thread_id: `wedding_task_completion:${safeWeddingLabel(taskId)}`,
    from: "system://wedding-planning",
    to: ["agent://tasks", "agent://wedding-planning"],
    timestamp: nowIso,
    type: "task_status",
    kind: "task",
    subtype: "wedding_task_completion",
    supertags: [
      "template:wedding_planning",
      "wedding_task_completion",
      `wedding_task_status:${status}`,
      `wedding_plan:${safeWeddingLabel(record.weddingPlanId)}`,
      `response_workspace:${safeWeddingLabel(record.responseWorkspaceId)}`,
    ],
    content: {
      kind: "task_status",
      task_id: taskId,
      title,
      status,
      completed: record.completed,
      completed_at: record.completed ? record.savedAt : null,
      reopened_at: record.completed ? null : record.savedAt,
      wedding_plan_id: record.weddingPlanId,
      response_workspace_id: record.responseWorkspaceId,
      source: "wedding_task_stage_view",
    },
    metadata: {
      origin: "wedding_planning",
      projection: "wedding_task_completion_to_afp_status",
      wedding_plan_id: record.weddingPlanId,
      response_workspace_id: record.responseWorkspaceId,
      wedding_task_id: taskId,
      completion_saved_at: record.savedAt,
      local_only_until_backend_sync: true,
      searchable_terms: [
        title,
        taskId,
        status,
        "wedding task completion",
        record.weddingPlanId,
        record.responseWorkspaceId,
      ].filter(Boolean),
    },
    views: [
      {
        format: "task_card",
        content: {
          task_id: taskId,
          title,
          status,
          wedding_plan_id: record.weddingPlanId,
          response_workspace_id: record.responseWorkspaceId,
        },
      },
    ],
    attachments: [],
    references,
  };
}

export function weddingTaskCompletionToAfpSendInput(
  input: WeddingTaskCompletionProjectionInput,
): SendAfpMessageInput | null {
  const message = weddingTaskCompletionToAfpMessage(input);
  if (!message) return null;
  return {
    thread_id: message.thread_id,
    from: message.from,
    to: message.to ?? [],
    type: message.type,
    kind: message.kind ?? undefined,
    subtype: message.subtype ?? undefined,
    content: message.content,
    timestamp: message.timestamp,
    views: message.views,
    attachments: message.attachments,
    references: message.references,
    metadata: message.metadata,
    store_in_relational: true,
  };
}
