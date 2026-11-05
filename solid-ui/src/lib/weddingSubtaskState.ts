// @locs-version: 1.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";

export type WeddingSubtask = WeddingPlanningTaskItem & {
  parentTaskId: string;
  removed: boolean;
  autoResearchEligible: false;
  origin: "suggested" | "user";
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function suggestedTitles(task: WeddingPlanningTaskItem): string[] {
  const text = `${task.title} ${task.notes ?? ""}`.toLowerCase();
  if (/venue|ceremony format|reception/.test(text)) return [
    "Check venue package inclusions for tablecloths and décor",
    "Confirm access, setup, pack-down and wet-weather rules",
  ];
  if (/signage|decor|styling|confetti/.test(text)) return [
    "Research signage, confetti and venue cleanup rules",
    "Confirm who supplies, installs and removes each item",
  ];
  if (/celebrant|noim|ceremony wording|vows/.test(text)) return [
    "Confirm celebrant registration and legal paperwork timing",
    "List ceremony wording, witness and rehearsal questions",
  ];
  if (/photo|video|shot list/.test(text)) return [
    "Confirm coverage hours, locations and delivery inclusions",
    "Draft priority people and moments for the shot list",
  ];
  if (/cater|menu|meal|cake|bar/.test(text)) return [
    "Confirm menu inclusions, dietary handling and final-number date",
    "Check delivery, staffing, equipment and cleanup responsibilities",
  ];
  if (/invite|rsvp|guest|seating/.test(text)) return [
    "Check missing guest details and response deadlines",
    "Confirm access, dietary, household and plus-one needs",
  ];
  if (/budget|deposit|payment|cost|contract/.test(text)) return [
    "Check inclusions, exclusions and likely cost escalations",
    "Record the approval, payment date and supporting document",
  ];
  if (/run.?sheet|timeline|wedding day|supplier confirmation/.test(text)) return [
    "Confirm owner, timing, location and dependency for each handoff",
    "Share the current version with only the people who need it",
  ];
  if (/transport|travel|accommodation/.test(text)) return [
    "Check routes, disruption, parking and accessible arrival",
    "Confirm pickup, return and late-night fallback arrangements",
  ];
  return ["Confirm the next concrete action, owner and evidence needed"];
}

function suggestedSubtasks(task: WeddingPlanningTaskItem): WeddingSubtask[] {
  return suggestedTitles(task).map((title, index) => ({
    id: `afp-wedding-subtask:${task.id}:${index + 1}`,
    parentTaskId: task.id,
    title,
    kind: task.kind,
    dueAt: task.dueAt ?? null,
    dueLabel: task.dueLabel ?? null,
    priority: task.priority ?? "normal",
    assignee: task.assignee ?? null,
    source: "manual",
    notes: "Suggested subtask. It is not researched automatically.",
    metadata: { wedding_subtask: true, parent_task_id: task.id, auto_research_eligible: false },
    removed: false,
    autoResearchEligible: false,
    origin: "suggested",
  }));
}

export function buildWeddingSubtasks(
  parent: WeddingPlanningTaskItem,
  messages: readonly AfpMessage[],
): WeddingSubtask[] {
  const byId = new Map(suggestedSubtasks(parent).map((item) => [item.id, item]));
  for (const message of messages) {
    const content = record(decryptedDisplayContent(message));
    const metadata = record(message.metadata);
    if (clean(content.parent_task_id) !== parent.id && clean(metadata.parent_task_id) !== parent.id) continue;
    const id = clean(content.task_id) || clean(metadata.wedding_task_id);
    if (!id) continue;
    const existing = byId.get(id);
    const status = clean(content.status).toLowerCase();
    byId.set(id, {
      id,
      parentTaskId: parent.id,
      title: clean(content.title) || existing?.title || "Untitled subtask",
      kind: (clean(content.wedding_task_kind) || existing?.kind || parent.kind) as WeddingPlanningTaskItem["kind"],
      dueAt: clean(content.due_date) || existing?.dueAt || null,
      dueLabel: clean(content.due_label) || existing?.dueLabel || null,
      priority: (clean(content.priority) || existing?.priority || parent.priority || "normal") as WeddingPlanningTaskItem["priority"],
      assignee: clean(content.assigned_to) || existing?.assignee || null,
      source: "manual",
      notes: clean(content.notes) || existing?.notes || "Subtask. It is not researched automatically.",
      metadata: { ...record(existing?.metadata), ...metadata, wedding_subtask: true, parent_task_id: parent.id, auto_research_eligible: false },
      removed: status === "cancelled" || status === "removed",
      autoResearchEligible: false,
      origin: existing?.origin ?? "user",
    });
  }
  return [...byId.values()].filter((item) => !item.removed);
}

export function weddingSubtaskCreateInput(input: {
  id: string;
  parent: WeddingPlanningTaskItem;
  title: string;
  weddingPlanId?: string | null;
  responseWorkspaceId?: string | null;
}): SendAfpMessageInput | null {
  const title = input.title.trim();
  if (!title || title.length > 180) return null;
  return {
    thread_id: `wedding-task:${input.parent.id}`,
    parent_id: null,
    from: "system://omnyid-ui",
    to: [],
    type: "task",
    subtype: "wedding_subtask",
    content: {
      task_id: input.id,
      parent_task_id: input.parent.id,
      title,
      status: "pending",
      priority: input.parent.priority ?? "normal",
      wedding_task_kind: input.parent.kind,
      wedding_plan_id: input.weddingPlanId ?? "",
      response_workspace_id: input.responseWorkspaceId ?? "",
      auto_research_eligible: false,
    },
    metadata: { wedding_subtask: true, parent_task_id: input.parent.id, auto_research_eligible: false },
  };
}

export function weddingSubtaskRemoveInput(subtask: WeddingSubtask): SendAfpMessageInput {
  return {
    thread_id: `wedding-task:${subtask.parentTaskId}`,
    parent_id: null,
    from: "system://omnyid-ui",
    to: [],
    type: "task",
    subtype: "wedding_subtask_removed",
    content: {
      task_id: subtask.id,
      parent_task_id: subtask.parentTaskId,
      title: subtask.title,
      status: "cancelled",
      wedding_task_kind: subtask.kind,
      auto_research_eligible: false,
    },
    metadata: { wedding_subtask: true, parent_task_id: subtask.parentTaskId, auto_research_eligible: false },
  };
}

export function weddingSubtaskResearchInput(subtask: WeddingSubtask): SendAfpMessageInput {
  return {
    thread_id: `wedding-task:${subtask.parentTaskId}`,
    parent_id: null,
    from: "system://omnyid-ui",
    to: [],
    type: "task",
    subtype: "wedding_subtask_research_requested",
    content: {
      task_id: subtask.id,
      parent_task_id: subtask.parentTaskId,
      title: subtask.title,
      status: "pending",
      wedding_task_kind: "research",
      requested_by_user: true,
      auto_research_eligible: false,
      agent_action_requested: true,
      agent_action: "research_wedding_subtask",
    },
    metadata: { wedding_subtask: true, parent_task_id: subtask.parentTaskId, manual_research_request: true, auto_research_eligible: false, agent_action_requested: true, agent_action: "research_wedding_subtask" },
  };
}
