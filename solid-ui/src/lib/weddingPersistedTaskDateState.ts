// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import { safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

export type WeddingPersistedTaskDateUpdate = {
  taskId: string;
  sourceMessageId: string | null;
  dueAt: string | null;
  dueDate: string | null;
  timestamp: number;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function contentValue(message: AfpMessage, key: string): unknown {
  return decryptedDisplayContent(message)[key] ?? message.metadata?.[key];
}

function workspaceIdFrom(message: AfpMessage): string | null {
  return clean(contentValue(message, "response_workspace_id")) ?? clean(message.metadata?.responseWorkspaceId);
}

export function weddingPersistedTaskDateUpdateFromAfpMessage(
  message: AfpMessage,
): WeddingPersistedTaskDateUpdate | null {
  if (message.subtype !== "wedding_task_due_date_update" || workspaceIdFrom(message) === null) return null;
  const taskId = clean(contentValue(message, "task_id") ?? message.metadata?.wedding_task_id);
  if (!taskId) return null;
  const dueDate = clean(contentValue(message, "due_date") ?? message.metadata?.due_date);
  const dueAt = clean(contentValue(message, "due_at")) ?? (dueDate ? `${dueDate}T09:00:00.000Z` : null);
  const sourceMessageId = clean(message.references?.find((reference) => reference.type === "message")?.target);
  return {
    taskId,
    sourceMessageId,
    dueAt,
    dueDate,
    timestamp: Date.parse(message.timestamp) || 0,
  };
}

export function applyWeddingPersistedTaskDateUpdates(
  tasks: WeddingPlanningTaskItem[],
  updates: WeddingPersistedTaskDateUpdate[],
): WeddingPlanningTaskItem[] {
  if (updates.length === 0 || tasks.length === 0) return tasks;
  const latest = new Map<string, WeddingPersistedTaskDateUpdate>();
  for (const update of updates) {
    for (const key of [update.taskId, update.sourceMessageId].filter((value): value is string => Boolean(value))) {
      const previous = latest.get(key);
      if (!previous || update.timestamp >= previous.timestamp) latest.set(key, update);
    }
  }
  return tasks.map((task) => {
    const update = latest.get(task.id) ?? latest.get(`afp-wedding-task:${safeWeddingLabel(task.id)}`);
    if (!update) return task;
    return {
      ...task,
      dueAt: update.dueAt,
      metadata: {
        ...(task.metadata ?? {}),
        user_edited_due_date: update.dueDate,
        user_edited_due_date_at: update.timestamp,
      },
    };
  });
}
