import type { AfpMessage } from "@/lib/api";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function timestamp(value: unknown): number {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestTaskOwners(messages: readonly AfpMessage[] | null | undefined): Map<string, string> {
  const assignments = new Map<string, { owner: string; timestamp: number }>();
  for (const message of messages ?? []) {
    const content = record(message.content);
    const metadata = record(message.metadata);
    const isResponsibility = message.kind === "wedding_helper_responsibility"
      || message.subtype === "wedding_helper_responsibility_update"
      || (message.supertags ?? []).includes("wedding_helper_responsibility");
    if (!isResponsibility) continue;
    const taskId = clean(content.task_id) || clean(metadata.wedding_task_id);
    const owner = clean(content.owner_label) || clean(metadata.helper_owner_label);
    if (!taskId || !owner) continue;
    const savedAt = timestamp(message.timestamp);
    const current = assignments.get(taskId);
    if (!current || savedAt >= current.timestamp) assignments.set(taskId, { owner, timestamp: savedAt });
  }
  return new Map([...assignments].map(([taskId, state]) => [taskId, state.owner]));
}

function latestTaskCompletions(messages: readonly AfpMessage[] | null | undefined): Map<string, "done" | "pending"> {
  const statuses = new Map<string, { status: "done" | "pending"; timestamp: number }>();
  for (const message of messages ?? []) {
    const content = record(message.content);
    const metadata = record(message.metadata);
    const isCompletion = message.subtype === "wedding_task_completion"
      || (message.supertags ?? []).includes("wedding_task_completion");
    if (!isCompletion) continue;
    const taskId = clean(content.task_id) || clean(metadata.wedding_task_id);
    if (!taskId) continue;
    const status = content.completed === true || clean(content.status).toLowerCase() === "done" ? "done" : "pending";
    const savedAt = timestamp(message.timestamp);
    const current = statuses.get(taskId);
    if (!current || savedAt >= current.timestamp) statuses.set(taskId, { status, timestamp: savedAt });
  }
  return new Map([...statuses].map(([taskId, state]) => [taskId, state.status]));
}

export function weddingTaskResponsibilityAssigneeNames(messages: readonly AfpMessage[] | null | undefined): string[] {
  return [...new Set(latestTaskOwners(messages).values())];
}

export function weddingHelperContactNamesFromAfpMessages(messages: readonly AfpMessage[] | null | undefined): string[] {
  const names = (messages ?? []).flatMap((message) => {
    const content = record(message.content);
    const metadata = record(message.metadata);
    const isHelperContact = message.kind === "wedding_helper_contact"
      || message.subtype === "wedding_helper_contact_upsert"
      || (message.supertags ?? []).includes("wedding_helper_contact");
    return isHelperContact ? [content.name, content.helper_name, metadata.helper_name, metadata.contact_name] : [];
  }).map(clean).filter(Boolean);
  return [...new Set(names)];
}

export function applyWeddingTaskResponsibilityProjection(
  tasks: readonly WeddingPlanningTaskItem[],
  messages: readonly AfpMessage[] | null | undefined,
): WeddingPlanningTaskItem[] {
  const owners = latestTaskOwners(messages);
  const completions = latestTaskCompletions(messages);
  return tasks.map((task) => {
    const completion = completions.get(task.id);
    const semanticTags = (task.semanticTags ?? []).filter((tag) => !/^wedding_task_status:/i.test(tag));
    if (completion) semanticTags.push(`wedding_task_status:${completion}`);
    return { ...task, assignee: owners.get(task.id) ?? task.assignee, semanticTags };
  });
}
