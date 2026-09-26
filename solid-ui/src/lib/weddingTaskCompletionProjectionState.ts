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
  const weddingPlanId = clean(record.weddingPlanId);
  const responseWorkspaceId = clean(record.responseWorkspaceId);
  const messageId = `afp-wedding-task-completion:${safeWeddingLabel(weddingPlanId)}:${safeWeddingLabel(responseWorkspaceId)}:${safeWeddingLabel(taskId)}:${status}`;
  const title = clean(input.title) || "Wedding task status update";
  const references: AfpReference[] = [
    {
      type: "wedding_plan",
      target: weddingPlanId,
      label: "Wedding plan",
    },
    {
      type: "response_workspace",
      target: responseWorkspaceId,
      label: "Wedding workspace",
    },
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
    to: ["agent://tasks", "agent://wedding-planning", "agent://decision-os", "agent://knowledge-graph"],
    timestamp: nowIso,
    type: "task_status",
    kind: "task",
    subtype: "wedding_task_completion",
    supertags: [
      "template:wedding_planning",
      "wedding_task_completion",
      "decisionos:wedding_task_completion",
      "topology:wedding_task_graph",
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
      wedding_plan_id: weddingPlanId,
      response_workspace_id: responseWorkspaceId,
      source: "wedding_task_stage_view",
      agent_action: record.completed ? "advance_unblocked_wedding_work" : "review_reopened_wedding_task",
      agent_action_requested: true,
    },
    metadata: {
      origin: "wedding_planning",
      projection: "wedding_task_completion_to_afp_status",
      wedding_plan_id: weddingPlanId,
      response_workspace_id: responseWorkspaceId,
      wedding_task_id: taskId,
      completion_saved_at: record.savedAt,
      agent_action_requested: true,
      agent_action: record.completed ? "advance_unblocked_wedding_work" : "review_reopened_wedding_task",
      local_only_until_backend_sync: true,
      searchable_terms: [
        title,
        taskId,
        status,
        "wedding task completion",
        weddingPlanId,
        responseWorkspaceId,
      ].filter(Boolean),
    },
    views: [
      {
        format: "task_card",
        content: {
          task_id: taskId,
          title,
          status,
          wedding_plan_id: weddingPlanId,
          response_workspace_id: responseWorkspaceId,
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
    supertags: message.supertags ?? [],
    metadata: message.metadata,
    store_in_relational: true,
  };
}
