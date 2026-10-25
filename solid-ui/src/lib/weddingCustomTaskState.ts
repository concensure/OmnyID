import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { WeddingJourneyStageId } from "@/lib/weddingJourneyStageState";
import { safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

export type WeddingCustomTaskInput = {
  title: string;
  stage: WeddingJourneyStageId;
  dueDate?: string | null;
  weddingPlanId?: string | null;
  responseWorkspaceId?: string | null;
  nowIso?: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function weddingCustomTaskToAfpMessage(input: WeddingCustomTaskInput): AfpMessage | null {
  const title = clean(input.title);
  const weddingPlanId = clean(input.weddingPlanId);
  const responseWorkspaceId = clean(input.responseWorkspaceId);
  const dueDate = clean(input.dueDate);
  if (!title || !weddingPlanId || !responseWorkspaceId) return null;
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
  const nowIso = clean(input.nowIso) || new Date().toISOString();
  const taskId = `wedding-custom:${safeWeddingLabel(title)}:${Date.parse(nowIso)}`;
  return {
    id: `afp-${taskId}`,
    thread_id: `wedding_task:${taskId}`,
    from: "user://wedding-planning",
    to: ["agent://tasks", "agent://calendar", "agent://wedding-planning", "agent://knowledge-graph"],
    timestamp: nowIso,
    type: "task",
    kind: "task",
    subtype: "wedding_task",
    supertags: [
      "template:wedding_planning",
      "wedding_task",
      "wedding_custom_task",
      `wedding_journey_stage:${input.stage}`,
      `wedding_plan:${safeWeddingLabel(weddingPlanId)}`,
      `response_workspace:${safeWeddingLabel(responseWorkspaceId)}`,
    ],
    content: {
      kind: "other",
      title,
      wedding_task_item_id: taskId,
      wedding_task_kind: "other",
      due_at: dueDate ? `${dueDate}T09:00:00.000Z` : null,
      due_date: dueDate || null,
      wedding_journey_stage: input.stage,
      status: "pending",
      wedding_plan_id: weddingPlanId,
      response_workspace_id: responseWorkspaceId,
    },
    metadata: {
      origin: "wedding_planning",
      projection: "wedding_custom_task",
      wedding_task_item_id: taskId,
      wedding_task_kind: "other",
      wedding_journey_stage: input.stage,
      wedding_plan_id: weddingPlanId,
      response_workspace_id: responseWorkspaceId,
      searchable_terms: [title, input.stage, dueDate].filter(Boolean),
    },
    views: [{ format: "task_card", content: { task_id: taskId, title, due_date: dueDate || null, stage: input.stage } }],
    attachments: [],
    references: [
      { type: "wedding_plan", target: weddingPlanId, label: "Wedding plan" },
      { type: "response_workspace", target: responseWorkspaceId, label: "Wedding workspace" },
    ],
  };
}

export function weddingCustomTaskToAfpSendInput(input: WeddingCustomTaskInput): SendAfpMessageInput | null {
  const message = weddingCustomTaskToAfpMessage(input);
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
