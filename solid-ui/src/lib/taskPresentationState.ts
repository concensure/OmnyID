// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import { decryptedDisplayContent, decryptedDisplayLabel } from "@/lib/decryptedDisplayState";
import { isRecord } from "@/lib/eventDetail";
import type { AgentTask } from "@/lib/taskDetailResponseState";

export type TaskMessagePresentation = {
  descriptionText: string | null;
  dueDateLabel: string | null;
  dueDateSortKey: string | null;
  dueDateValue: string | null;
  isCompleted: boolean;
  isOverdue: boolean;
  isPending: boolean;
  isTask: boolean;
  titleText: string;
};

const TASK_SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const TASK_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function scalarString(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text.length > 0 ? text : null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function parseFiniteDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const candidate =
    typeof value === "string" && /^[0-9]+$/.test(value.trim())
      ? Number(value)
      : value;
  const date = new Date(candidate);
  return Number.isFinite(date.getTime()) ? date : null;
}

function taskDueDateValue(record: Record<string, unknown>): string | null {
  return scalarString(record.due_date) ?? scalarString(record.due_at);
}

export function taskMessageContentRecord(message: Pick<AfpMessage, "content"> & Partial<Pick<AfpMessage, "encryption">>): Record<string, unknown> {
  const content = decryptedDisplayContent(message);
  return isRecord(content) ? content : {};
}

export function taskMessageTitleText(message: Pick<AfpMessage, "type" | "content"> & Partial<Pick<AfpMessage, "encryption">>): string {
  return scalarString(taskMessageContentRecord(message).title) ?? decryptedDisplayLabel(message) ?? "Task";
}

export function taskMessageDescriptionText(message: Pick<AfpMessage, "content"> & Partial<Pick<AfpMessage, "encryption">>): string | null {
  return scalarString(taskMessageContentRecord(message).description);
}

export function taskMessageDueDate(message: Pick<AfpMessage, "content"> & Partial<Pick<AfpMessage, "encryption">>): string | null {
  return taskDueDateValue(taskMessageContentRecord(message));
}

export function taskDateShortLabel(value: unknown): string | null {
  const date = parseFiniteDate(value);
  if (!date) return null;
  return TASK_SHORT_DATE_FORMATTER.format(date);
}

export function taskDateTimeLabel(value: unknown): string | null {
  const date = parseFiniteDate(value);
  if (!date) return null;
  return TASK_DATE_TIME_FORMATTER.format(date);
}

export function taskDetailTitleText(task: Pick<AgentTask, "id" | "intent" | "content">): string {
  return scalarString(task.intent) ?? scalarString(task.content) ?? task.id;
}

export function taskCreatedAtText(task: Pick<AgentTask, "created_at">): string {
  return taskDateTimeLabel(task.created_at) ?? "";
}

export function taskMessagePresentation(
  message: Pick<AfpMessage, "type" | "content"> & Partial<Pick<AfpMessage, "encryption">>,
  now = new Date(),
): TaskMessagePresentation {
  const content = taskMessageContentRecord(message);
  const dueDateValue = taskDueDateValue(content);
  const dueDate = parseFiniteDate(dueDateValue);
  const status = scalarString(content.status);
  const isTask = message.type === "task" || content.kind === "task";
  const isCompleted = status === "completed" || content.completed === true;
  const isOverdue = !isCompleted && Boolean(dueDate) && dueDate!.getTime() < now.getTime();
  const isPending = isTask && !isCompleted && !isOverdue;

  return {
    descriptionText: scalarString(content.description),
    dueDateLabel: taskDateShortLabel(dueDateValue),
    dueDateSortKey: dueDate ? dueDate.toISOString() : null,
    dueDateValue,
    isCompleted,
    isOverdue,
    isPending,
    isTask,
    titleText: scalarString(content.title) ?? decryptedDisplayLabel(message) ?? "Task",
  };
}
