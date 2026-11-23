// @locs-version: 2.0
import type { SendAfpMessageInput } from "@/lib/api";
import {
  loadWeddingTaskCompletion,
  type WeddingTaskCompletionRecord,
} from "@/lib/weddingTaskCompletionLocalState";
import { weddingTaskCompletionToAfpSendInput } from "@/lib/weddingTaskCompletionProjectionState";
import type { WeddingTaskHierarchyStage } from "@/lib/weddingTaskHierarchyState";

export type WeddingTaskCompletionSyncTask = {
  task_id: string;
  title: string;
  status: string;
  wedding_plan_id?: string;
  response_workspace_id?: string;
};

export type WeddingTaskCompletionSyncItem = {
  taskId: string;
  title: string;
  completed: boolean;
  statusLabel: string;
  actionLabel: string;
  detailLabel: string;
  savedAt: string;
  sendInput: SendAfpMessageInput;
};

export type WeddingTaskCompletionSyncState = {
  pendingItems: WeddingTaskCompletionSyncItem[];
  pendingCount: number;
  hasPending: boolean;
  summaryLabel: string;
};

const DONE_STATUSES = new Set(["done", "completed", "cancelled"]);

function taskCompleted(task: WeddingTaskCompletionSyncTask): boolean {
  return DONE_STATUSES.has(task.status);
}

function pendingItem(
  task: WeddingTaskCompletionSyncTask,
  record: WeddingTaskCompletionRecord,
): WeddingTaskCompletionSyncItem | null {
  if (record.completed === taskCompleted(task)) return null;
  const sendInput = weddingTaskCompletionToAfpSendInput({
    record,
    title: task.title,
    sourceMessageId: task.task_id,
  });
  if (!sendInput) return null;
  return {
    taskId: task.task_id,
    title: task.title,
    completed: record.completed,
    statusLabel: record.completed ? "Ready to mark done" : "Ready to mark not done",
    actionLabel: record.completed ? "Mark done" : "Mark not done",
    detailLabel: `${record.completed ? "Done" : "Reopened"} locally at ${record.savedAt}`,
    savedAt: record.savedAt,
    sendInput,
  };
}

export function buildWeddingTaskCompletionSyncState<TTask extends WeddingTaskCompletionSyncTask>(
  stages: readonly WeddingTaskHierarchyStage<TTask>[],
  storage?: Storage | null,
): WeddingTaskCompletionSyncState {
  const pendingItems = stages.flatMap((stage) =>
    stage.items.flatMap((item): WeddingTaskCompletionSyncItem[] => {
      const task = item.task;
      const record = loadWeddingTaskCompletion({
        taskId: task.task_id,
        responseWorkspaceId: task.response_workspace_id,
        weddingPlanId: task.wedding_plan_id,
      }, storage);
      if (!record) return [];
      const pending = pendingItem(task, record);
      return pending ? [pending] : [];
    }),
  );
  const pendingCount = pendingItems.length;
  return {
    pendingItems,
    pendingCount,
    hasPending: pendingCount > 0,
    summaryLabel: pendingCount > 0
      ? `${pendingCount} task status update${pendingCount === 1 ? "" : "s"} ready to save`
      : "No task status changes waiting to save",
  };
}
