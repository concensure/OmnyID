// @locs-version: 1.0
import type { SendAfpMessageInput } from "@/lib/api";
import {
  normalizeTaskStatus,
  type TaskExecutionExplanation,
  type ToolResultMetadata,
} from "@/lib/taskResultMeta";

export interface LedgerTask {
  task_id: string;
  thread_id?: string;
  source_message_id?: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "blocked" | "done" | "cancelled" | string;
  raw_status?: string;
  priority: "low" | "normal" | "high" | "critical" | string;
  progress: number;
  milestone?: string;
  assigned_to?: string;
  due_date?: string;
  due_label?: string;
  depends_on?: string[];
  blockers?: string[];
  background?: boolean;
  summary?: string;
  error?: string;
  wedding_task_kind?: string;
  wedding_plan_id?: string;
  response_workspace_id?: string;
  second_order_loop?: string;
  second_order_evidence_labels?: string[];
  preparation_checklist?: boolean;
  preparation_checklist_item?: string;
  alert_offset_days?: number[];
  alert_dates?: string[];
  schedule_basis?: string;
  tool_meta?: ToolResultMetadata;
  execution_explanation?: TaskExecutionExplanation | null;
}

export type TodoTaskState = {
  task: LedgerTask;
  title: string;
  done: boolean;
  selected: boolean;
  titleClass: string;
  statusDotClass: string;
  showBackgroundBadge: boolean;
  showProgress: boolean;
  progress: number;
  showAssignedTo: boolean;
  assignedToText: string | null;
  showBlockers: boolean;
  blockersText: string | null;
  showDueDate: boolean;
  dueDateText: string | null;
};

const STATUS_DOT: Record<string, string> = {
  pending: "bg-yellow-400",
  in_progress: "bg-blue-500 animate-pulse",
  blocked: "bg-amber-400",
  done: "bg-emerald-400",
  cancelled: "bg-slate-400",
};

const DONE_STATUSES = new Set(["done", "cancelled"]);

function formatDueDate(dateString: string): string {
  if (!dateString) return "";
  try {
    const dueDate = new Date(dateString);
    if (isNaN(dueDate.getTime())) return dateString;
    const now = new Date();
    const diffDays = Math.round((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < -1) return `Overdue by ${Math.abs(diffDays)}d`;
    if (diffDays < 0) return "Due yesterday";
    if (diffDays === 0) return "Due today";
    if (diffDays === 1) return "Due tomorrow";
    if (diffDays <= 7) return `Due in ${diffDays} days`;
    return `Due ${dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  } catch {
    return dateString;
  }
}

export function todoTaskStates(
  tasks: LedgerTask[],
  selectedTaskIds: ReadonlySet<string> = new Set(),
): TodoTaskState[] {
  const sorted = [...tasks].sort((left, right) => {
    const leftDone = DONE_STATUSES.has(left.status) ? 1 : 0;
    const rightDone = DONE_STATUSES.has(right.status) ? 1 : 0;
    if (leftDone !== rightDone) return leftDone - rightDone;
    const priorityOrder = ["critical", "high", "normal", "low"];
    return priorityOrder.indexOf(left.priority) - priorityOrder.indexOf(right.priority);
  });

  return sorted.map((task) => {
    const done = DONE_STATUSES.has(task.status);
    const blockersText = (task.blockers ?? []).length > 0 ? task.blockers!.join(", ") : null;
    const assignedToText = task.assigned_to?.trim() || null;
    const dueDateText = task.due_label?.trim() || (task.due_date ? formatDueDate(task.due_date) : null);
    return {
      task,
      title: task.title,
      done,
      selected: selectedTaskIds.has(task.task_id),
      titleClass: done ? "line-through text-on-surface-variant" : "text-on-surface",
      statusDotClass: STATUS_DOT[task.status] ?? "bg-slate-400",
      showBackgroundBadge: Boolean(task.background),
      showProgress: task.progress > 0 && !done,
      progress: task.progress,
      showAssignedTo: Boolean(assignedToText),
      assignedToText,
      showBlockers: Boolean(blockersText),
      blockersText,
      showDueDate: Boolean(dueDateText),
      dueDateText,
    };
  });
}

export function ledgerTaskWithOverrides(
  task: LedgerTask,
  overrides: {
    assignedTo?: string | null;
    status?: string | null;
  } = {},
): LedgerTask {
  return {
    ...task,
    assigned_to: overrides.assignedTo ?? task.assigned_to,
    status: overrides.status ? normalizeTaskStatus(overrides.status) : task.status,
    raw_status: overrides.status ?? task.raw_status,
  };
}

export function ledgerTaskUpdateSendInput(task: LedgerTask, update: {
  assignedTo?: string | null;
  status?: string | null;
}): SendAfpMessageInput | null {
  const hasAssignedToUpdate = Object.prototype.hasOwnProperty.call(update, "assignedTo");
  const assignedTo = typeof update.assignedTo === "string" ? update.assignedTo.trim() : "";
  const status = typeof update.status === "string" ? update.status.trim() : undefined;
  if (!hasAssignedToUpdate && !status) return null;
  const content: Record<string, unknown> = {
    task_id: task.task_id,
    title: task.title,
    status: status ?? task.raw_status ?? task.status,
    priority: task.priority,
    progress: task.progress,
  };
  if (hasAssignedToUpdate) content.assigned_to = assignedTo;
  else if (task.assigned_to) content.assigned_to = task.assigned_to;
  if (task.due_date) content.due_date = task.due_date;
  if (task.due_label) content.due_label = task.due_label;
  return {
    thread_id: task.thread_id || `task:${task.task_id}`,
    parent_id: task.source_message_id || null,
    from: "system://omnyid-ui",
    to: [],
    type: "task",
    subtype: "update",
    content,
    metadata: {
      task_update_source: "active_todos",
      updated_task_id: task.task_id,
      assigned_to_changed: hasAssignedToUpdate,
      status_changed: status !== undefined,
    },
  };
}
