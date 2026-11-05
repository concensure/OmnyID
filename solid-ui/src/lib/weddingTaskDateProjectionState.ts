// @locs-version: 1.0
import type { AfpMessage, AfpReference, SendAfpMessageInput } from "@/lib/api";
import { safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

export type WeddingTaskDateProjectionInput = {
  taskId?: string | null;
  title?: string | null;
  dueDate?: string | null;
  weddingPlanId?: string | null;
  responseWorkspaceId?: string | null;
  parentTaskId?: string | null;
  sourceMessageId?: string | null;
  nowIso?: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T09:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function weddingTaskDateToAfpMessage(input: WeddingTaskDateProjectionInput): AfpMessage | null {
  const taskId = clean(input.taskId);
  const weddingPlanId = clean(input.weddingPlanId);
  const responseWorkspaceId = clean(input.responseWorkspaceId);
  const dueDate = clean(input.dueDate);
  const hasDate = dueDate.length > 0;
  if (!taskId || !weddingPlanId || !responseWorkspaceId) return null;
  if (hasDate && !validIsoDate(dueDate)) return null;

  const nowIso = clean(input.nowIso) || new Date().toISOString();
  const title = clean(input.title) || "Wedding task date update";
  const parentTaskId = clean(input.parentTaskId);
  const status = hasDate ? "dated" : "undated";
  const messageId = `afp-wedding-task-date:${safeWeddingLabel(weddingPlanId)}:${safeWeddingLabel(responseWorkspaceId)}:${safeWeddingLabel(taskId)}:${status}`;
  const references: AfpReference[] = [
    { type: "wedding_plan", target: weddingPlanId, label: "Wedding plan" },
    { type: "response_workspace", target: responseWorkspaceId, label: "Wedding workspace" },
    { type: "task", target: taskId, label: "Updated wedding task" },
  ];
  const sourceMessageId = clean(input.sourceMessageId);
  if (sourceMessageId) references.push({ type: "message", target: sourceMessageId, label: "Source task message" });

  return {
    id: messageId,
    thread_id: `wedding_task_date:${safeWeddingLabel(taskId)}`,
    from: "system://wedding-planning",
    to: ["agent://tasks", "agent://calendar", "agent://wedding-planning", "agent://decision-os", "agent://knowledge-graph"],
    timestamp: nowIso,
    type: "task_update",
    kind: "task",
    subtype: "wedding_task_due_date_update",
    supertags: [
      "template:wedding_planning",
      "wedding_task_due_date",
      "decisionos:wedding_task_due_date",
      "topology:wedding_task_graph",
      `wedding_task_date_status:${status}`,
      `wedding_plan:${safeWeddingLabel(weddingPlanId)}`,
      `response_workspace:${safeWeddingLabel(responseWorkspaceId)}`,
    ],
    content: {
      kind: "task_update",
      task_id: taskId,
      title,
      due_date: hasDate ? dueDate : null,
      due_at: hasDate ? `${dueDate}T09:00:00.000Z` : null,
      status,
      wedding_plan_id: weddingPlanId,
      response_workspace_id: responseWorkspaceId,
      parent_task_id: parentTaskId || null,
      source: "wedding_task_stage_view",
      agent_action: "rebuild_wedding_timeline_and_reminders",
      agent_action_requested: true,
    },
    metadata: {
      origin: "wedding_planning",
      projection: "wedding_task_date_to_afp_update",
      wedding_plan_id: weddingPlanId,
      response_workspace_id: responseWorkspaceId,
      wedding_task_id: taskId,
      parent_task_id: parentTaskId || null,
      wedding_subtask: Boolean(parentTaskId),
      due_date: hasDate ? dueDate : null,
      agent_action_requested: true,
      agent_action: "rebuild_wedding_timeline_and_reminders",
      searchable_terms: [
        title,
        taskId,
        dueDate,
        "wedding task due date",
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
          due_date: hasDate ? dueDate : null,
          wedding_plan_id: weddingPlanId,
          response_workspace_id: responseWorkspaceId,
        },
      },
    ],
    attachments: [],
    references,
  };
}

export function weddingTaskDateToAfpSendInput(input: WeddingTaskDateProjectionInput): SendAfpMessageInput | null {
  const message = weddingTaskDateToAfpMessage(input);
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
