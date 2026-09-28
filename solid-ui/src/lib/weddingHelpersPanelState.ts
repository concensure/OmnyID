// @locs-version: 1.0
import type { AfpMessage, AfpReference, SendAfpMessageInput } from "@/lib/api";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
} from "@/lib/weddingPlanningTemplateState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingSemanticUiObject } from "@/lib/weddingSemanticUiState";

export type WeddingHelperPlanningTask = WeddingResponseWorkspaceViewState["planningTaskItems"][number];

export type WeddingHelperWorkloadRow = {
  name: string;
  openCount: number;
  overdueCount: number;
  estimatedWorkloadPoints: number;
  workloadLabel: string;
  workloadDetailLabel: string;
};

export type WeddingHelperLocalState = {
  doneTaskIds: Record<string, true>;
  taskAssignees: Record<string, string>;
  taskConsultedPeople: Record<string, string>;
  taskLastContactDates: Record<string, string>;
  customHelpers: string[];
};

export type WeddingHelperResponsibilityStatus = "open" | "done";

export type WeddingHelperWeeklyAgendaRow = {
  id: string;
  task: WeddingHelperPlanningTask;
  ownerLabel: string;
  dueLabel: string;
  reasonLabel: string;
  suggestedActionLabel: string;
};

export type WeddingHelperResponsibilityProjectionInput = {
  task: WeddingHelperPlanningTask;
  ownerLabel?: string | null;
  consultedLabel?: string | null;
  lastContactDate?: string | null;
  status?: WeddingHelperResponsibilityStatus | null;
  metadata?: unknown;
  nowIso?: string | null;
};

const WEDDING_HELPER_LOCAL_STATE_KEY = "omnyid.wedding.helpers.v1";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringRecord(value: unknown, dateOnly = false): Record<string, string> {
  const source = record(value);
  const result: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(source)) {
    const cleanKey = clean(key);
    const cleanValue = clean(rawValue);
    if (!cleanKey || !cleanValue) continue;
    if (dateOnly && !/^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) continue;
    result[cleanKey] = cleanValue;
  }
  return result;
}

function doneTaskRecord(value: unknown): Record<string, true> {
  const source = record(value);
  const result: Record<string, true> = {};
  for (const [key, rawValue] of Object.entries(source)) {
    const cleanKey = clean(key);
    if (!cleanKey || rawValue !== true) continue;
    result[cleanKey] = true;
  }
  return result;
}

function uniqueStrings(values: readonly unknown[], limit = 40): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function messageToSendInput(message: AfpMessage): SendAfpMessageInput {
  return {
    thread_id: message.thread_id,
    from: message.from,
    to: message.to ?? [],
    timestamp: message.timestamp,
    type: message.type,
    kind: message.kind,
    subtype: message.subtype ?? undefined,
    content: message.content,
    views: message.views,
    attachments: message.attachments,
    references: message.references,
    supertags: message.supertags ?? [],
    metadata: message.metadata,
    store_in_relational: true,
  };
}

function ref(type: string, target: string, label: string, metadata?: Record<string, unknown>): AfpReference | null {
  const cleanTarget = clean(target);
  if (!cleanTarget) return null;
  return { type, target: cleanTarget, label, metadata };
}

function helperResponsibilitySemanticObject(input: {
  taskId: string;
  taskTitle: string;
  status: WeddingHelperResponsibilityStatus;
  ownerLabel: string;
  consultedLabel: string;
  lastContactDate: string;
  dueLabel: string;
  priorityLabel: string;
}): WeddingSemanticUiObject {
  const open = input.status !== "done";
  const needsOwner = input.ownerLabel === "Unassigned";
  return {
    id: `semantic:wedding_helper_responsibility:${safeWeddingLabel(input.taskId)}:${input.status}`,
    kind: needsOwner ? "wedding_approval_required" : "wedding_active_loop",
    title: input.taskTitle,
    stateLabel: input.status === "done" ? "Done" : needsOwner ? "Needs owner" : "Owner assigned",
    tone: input.status === "done" ? "status" : needsOwner ? "action" : "status",
    summary: needsOwner
      ? "This wedding task needs one clear owner before the agent can help move it forward."
      : `${input.ownerLabel} owns this task.${input.consultedLabel ? ` Consult ${input.consultedLabel}.` : ""}`,
    comparison: null,
    actions: [{
      label: needsOwner ? "Assign owner" : open ? "Open task" : "Review completed work",
      kind: needsOwner ? "assign_wedding_helper_owner" : open ? "open_wedding_task" : "review_wedding_task",
      enabled: true,
      targetMenu: "helpers",
    }],
    semanticTags: uniqueStrings([
      needsOwner ? "wedding_approval_required" : "wedding_active_loop",
      "wedding_helper_responsibility",
      "wedding_workload",
      `wedding_task_status:${input.status}`,
      `wedding_priority:${safeWeddingLabel(input.priorityLabel)}`,
      input.lastContactDate ? "wedding_last_contact_recorded" : null,
      input.consultedLabel ? "wedding_consulted_person_recorded" : null,
    ], 16),
  };
}

function storageKey(workspaceId: string): string {
  return `${WEDDING_HELPER_LOCAL_STATE_KEY}:${workspaceId}`;
}

function emptyWeddingHelperLocalState(): WeddingHelperLocalState {
  return {
    doneTaskIds: {},
    taskAssignees: {},
    taskConsultedPeople: {},
    taskLastContactDates: {},
    customHelpers: [],
  };
}

export function normalizeWeddingHelperLocalState(value: unknown): WeddingHelperLocalState {
  const source = record(value);
  return {
    doneTaskIds: doneTaskRecord(source.doneTaskIds),
    taskAssignees: stringRecord(source.taskAssignees),
    taskConsultedPeople: stringRecord(source.taskConsultedPeople),
    taskLastContactDates: stringRecord(source.taskLastContactDates, true),
    customHelpers: uniqueStrings(Array.isArray(source.customHelpers) ? source.customHelpers : []),
  };
}

export function loadWeddingHelperLocalState(workspaceId: string | null | undefined): WeddingHelperLocalState {
  const scope = clean(workspaceId);
  if (!scope || typeof localStorage === "undefined") return emptyWeddingHelperLocalState();
  try {
    const raw = localStorage.getItem(storageKey(scope));
    return raw ? normalizeWeddingHelperLocalState(JSON.parse(raw)) : emptyWeddingHelperLocalState();
  } catch {
    return emptyWeddingHelperLocalState();
  }
}

export function saveWeddingHelperLocalState(
  workspaceId: string | null | undefined,
  state: WeddingHelperLocalState,
): WeddingHelperLocalState {
  const scope = clean(workspaceId);
  const normalized = normalizeWeddingHelperLocalState(state);
  if (!scope || typeof localStorage === "undefined") return normalized;
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(normalized));
  } catch {
    // The in-memory UI state remains useful if browser storage is blocked or full.
  }
  return normalized;
}

export function weddingHelperTaskDueLabel(task: WeddingHelperPlanningTask): string {
  const dueLabel = clean(task.dueLabel);
  if (dueLabel) return dueLabel;
  const dueAt = clean(task.dueAt);
  if (dueAt) return dueAt.slice(0, 10);
  return "Add due date";
}

export function weddingHelperTaskIsOverdue(task: WeddingHelperPlanningTask, now = Date.now()): boolean {
  const dueAt = clean(task.dueAt);
  if (!dueAt) return false;
  const due = new Date(dueAt).getTime();
  return Number.isFinite(due) && due < now;
}

export function weddingHelperTaskPriorityLabel(task: WeddingHelperPlanningTask): string {
  if (task.priority === "urgent") return "Urgent";
  if (task.priority === "high") return "High";
  if (task.priority === "low") return "Low";
  return "Normal";
}

function weddingHelperEstimatedTaskPoints(task: WeddingHelperPlanningTask, now: number): number {
  const priorityPoints = task.priority === "urgent" ? 3 : task.priority === "high" ? 2 : task.priority === "low" ? 0.5 : 1;
  return priorityPoints + (weddingHelperTaskIsOverdue(task, now) ? 1 : 0);
}

export function buildWeddingHelperPeople(
  contactNames: readonly string[],
  customHelpers: readonly string[],
  partnerNames: readonly string[] = [],
): string[] {
  const seen = new Set<string>();
  const fallbackPartners = partnerNames.length > 0 ? [...partnerNames] : ["Partner 1", "Partner 2"];
  const names = [...contactNames, ...customHelpers, ...fallbackPartners].filter((name) => {
    const label = clean(name);
    const key = label.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((name) => clean(name));
  return names.length > 0 ? names : fallbackPartners;
}

function taskAssignee(task: WeddingHelperPlanningTask, taskAssignees: Record<string, string>): string {
  return (taskAssignees[task.id] ?? clean(task.assignee)) || "Unassigned";
}

export function buildWeddingHelperWorkloadRows(input: {
  people: readonly string[];
  tasks: readonly WeddingHelperPlanningTask[];
  doneTaskIds: Record<string, true>;
  taskAssignees: Record<string, string>;
  now?: number;
}): WeddingHelperWorkloadRow[] {
  const now = input.now ?? Date.now();
  const openTasks = input.tasks.filter((task) => !input.doneTaskIds[task.id]);
  return input.people.map((name) => {
    const tasks = openTasks.filter((task) => taskAssignee(task, input.taskAssignees) === name);
    const estimatedWorkloadPoints = tasks.reduce((sum, task) => sum + weddingHelperEstimatedTaskPoints(task, now), 0);
    return {
      name,
      openCount: tasks.length,
      overdueCount: tasks.filter((task) => weddingHelperTaskIsOverdue(task, now)).length,
      estimatedWorkloadPoints,
      workloadLabel: `${tasks.length} open task${tasks.length === 1 ? "" : "s"}`,
      workloadDetailLabel: `${estimatedWorkloadPoints.toLocaleString(undefined, { maximumFractionDigits: 1 })} workload point${estimatedWorkloadPoints === 1 ? "" : "s"}`,
    };
  });
}

export function weddingHelperWorkloadSuggestion(rows: readonly WeddingHelperWorkloadRow[]): string {
  const activeRows = rows
    .filter((row) => row.openCount > 0)
    .sort((left, right) => right.estimatedWorkloadPoints - left.estimatedWorkloadPoints || right.openCount - left.openCount);
  const busiest = activeRows[0];
  const lightest = activeRows[activeRows.length - 1];
  if (!busiest || !lightest || busiest.estimatedWorkloadPoints - lightest.estimatedWorkloadPoints < 3) {
    return "Workload looks reasonably balanced right now.";
  }
  const busiestTasks = `${busiest.openCount} open task${busiest.openCount === 1 ? "" : "s"}`;
  const lightestTasks = `${lightest.openCount} open task${lightest.openCount === 1 ? "" : "s"}`;
  return `${busiest.name} has ${busiestTasks} and ${lightest.name} has ${lightestTasks}. Consider moving two lower-priority tasks or inviting a helper.`;
}

export function buildWeddingHelperWeeklyAgenda(input: {
  tasks: readonly WeddingHelperPlanningTask[];
  doneTaskIds: Record<string, true>;
  now?: number;
  limit?: number;
}): WeddingHelperPlanningTask[] {
  const now = input.now ?? Date.now();
  return input.tasks
    .filter((task) => !input.doneTaskIds[task.id])
    .slice()
    .sort((left, right) => {
      const leftOverdue = weddingHelperTaskIsOverdue(left, now);
      const rightOverdue = weddingHelperTaskIsOverdue(right, now);
      if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;
      return weddingHelperTaskDueLabel(left).localeCompare(weddingHelperTaskDueLabel(right));
    })
    .slice(0, input.limit ?? 5);
}

export function buildWeddingHelperWeeklyAgendaRows(input: {
  tasks: readonly WeddingHelperPlanningTask[];
  doneTaskIds: Record<string, true>;
  taskAssignees: Record<string, string>;
  taskConsultedPeople?: Record<string, string> | null;
  now?: number;
  limit?: number;
}): WeddingHelperWeeklyAgendaRow[] {
  const now = input.now ?? Date.now();
  return buildWeddingHelperWeeklyAgenda({
    tasks: input.tasks,
    doneTaskIds: input.doneTaskIds,
    now,
    limit: input.limit,
  }).map((task): WeddingHelperWeeklyAgendaRow => {
    const ownerLabel = taskAssignee(task, input.taskAssignees);
    const dueLabel = weddingHelperTaskDueLabel(task);
    const consultedLabel = clean(input.taskConsultedPeople?.[task.id]);
    const overdue = weddingHelperTaskIsOverdue(task, now);
    const reasonLabel = overdue
      ? "Overdue, so discuss this first."
      : ownerLabel === "Unassigned"
        ? "Needs one clear owner."
        : consultedLabel
          ? `Owner should check with ${consultedLabel}.`
          : "Confirm whether this is still on track.";
    const suggestedActionLabel = overdue
      ? "Decide the next move"
      : ownerLabel === "Unassigned"
        ? "Pick an owner"
        : consultedLabel
          ? "Ask for input"
          : "Confirm status";
    return {
      id: task.id,
      task,
      ownerLabel,
      dueLabel,
      reasonLabel,
      suggestedActionLabel,
    };
  });
}

export function weddingHelperResponsibilityToAfpMessage(
  input: WeddingHelperResponsibilityProjectionInput,
): AfpMessage | null {
  const taskId = clean(input.task.id);
  const taskTitle = clean(input.task.title);
  if (!taskId || !taskTitle) return null;

  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const nowIso = clean(input.nowIso) || new Date().toISOString();
  const status: WeddingHelperResponsibilityStatus = input.status === "done" ? "done" : "open";
  const ownerLabel = clean(input.ownerLabel) || clean(input.task.assignee) || "Unassigned";
  const consultedLabel = clean(input.consultedLabel);
  const lastContactDate = clean(input.lastContactDate);
  const dueLabel = weddingHelperTaskDueLabel(input.task);
  const priorityLabel = weddingHelperTaskPriorityLabel(input.task);
  const planLabel = safeWeddingLabel(metadata.weddingPlanId);
  const workspaceLabel = safeWeddingLabel(metadata.responseWorkspaceId);
  const taskLabel = safeWeddingLabel(taskId);
  const references = [
    ref("wedding_plan", metadata.weddingPlanId, "Wedding plan"),
    ref("response_workspace", metadata.responseWorkspaceId, "Wedding workspace"),
    ref("wedding_task", taskId, "Wedding task", { title: taskTitle }),
    ref("helper_owner", ownerLabel, "Task owner"),
    consultedLabel ? ref("consulted_person", consultedLabel, "Person to consult") : null,
  ].filter((item): item is AfpReference => item !== null);
  const semanticObject = helperResponsibilitySemanticObject({
    taskId,
    taskTitle,
    status,
    ownerLabel,
    consultedLabel,
    lastContactDate,
    dueLabel,
    priorityLabel,
  });

  return {
    id: `afp-wedding-helper-responsibility:${planLabel}:${workspaceLabel}:${taskLabel}:${status}`,
    thread_id: `wedding_helper_responsibility:${workspaceLabel}:${taskLabel}`,
    from: "system://wedding-planning",
    to: [
      "agent://wedding-planning",
      "agent://tasks",
      "agent://decision-os",
      "agent://knowledge-graph",
      "agent://topology",
    ],
    timestamp: nowIso,
    type: "ledger",
    kind: "wedding_helper_responsibility",
    subtype: "wedding_helper_responsibility_update",
    supertags: [
      "template:wedding_planning",
      "wedding_helper_responsibility",
      "wedding_workload",
      "decisionos:wedding_workload",
      "topology:wedding_responsibility",
      `wedding_task_status:${status}`,
      `wedding_task:${taskLabel}`,
      `wedding_plan:${planLabel}`,
      `response_workspace:${workspaceLabel}`,
    ],
    content: {
      kind: "wedding_helper_responsibility",
      task_id: taskId,
      task_title: taskTitle,
      status,
      owner_label: ownerLabel,
      consulted_label: consultedLabel || null,
      last_contact_date: lastContactDate || null,
      due_label: dueLabel,
      due_at: clean(input.task.dueAt) || null,
      priority_label: priorityLabel,
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      agent_action_requested: true,
      agent_action: status === "done" ? "advance_unblocked_wedding_work" : "track_wedding_responsibility",
      summary: `${ownerLabel} owns "${taskTitle}".${consultedLabel ? ` Consult ${consultedLabel}.` : ""}`,
      semantic_kind: semanticObject.kind,
      semantic_tags: semanticObject.semanticTags,
      semantic_object: semanticObject,
      semantic_objects: [semanticObject],
    },
    metadata: {
      origin: "wedding_planning",
      projection: "wedding_helper_responsibility_to_afp",
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      wedding_task_id: taskId,
      helper_owner_label: ownerLabel,
      consulted_label: consultedLabel || null,
      last_contact_date: lastContactDate || null,
      responsibility_status: status,
      e2ee_required: true,
      couple_private_by_default: true,
      agent_action_requested: true,
      semantic_kind: semanticObject.kind,
      semantic_tags: semanticObject.semanticTags,
      semantic_object: semanticObject,
      semantic_objects: [semanticObject],
      searchable_terms: uniqueStrings([
        taskTitle,
        taskId,
        ownerLabel,
        consultedLabel,
        lastContactDate,
        dueLabel,
        priorityLabel,
        "wedding helper responsibility",
        "wedding workload",
      ]),
    },
    views: [
      {
        format: "a2ui",
        priority: 1,
        content: {
          title: "Wedding responsibility",
          summary: `${ownerLabel} owns this task`,
          status,
          rows: [
            { label: "Task", value: taskTitle },
            { label: "Owner", value: ownerLabel },
            { label: "Consult", value: consultedLabel || "No one yet" },
            { label: "Due", value: dueLabel },
            { label: "Last contact", value: lastContactDate || "Not recorded" },
          ],
          semantic_object: semanticObject,
          semantic_objects: [semanticObject],
        },
      },
    ],
    attachments: [],
    references,
  };
}

export function weddingHelperResponsibilityToAfpSendInput(
  input: WeddingHelperResponsibilityProjectionInput,
): SendAfpMessageInput | null {
  const message = weddingHelperResponsibilityToAfpMessage(input);
  return message ? messageToSendInput(message) : null;
}
