// @locs-version: 2.0
import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingTaskCompletionSyncItem } from "@/lib/weddingTaskCompletionSyncState";

export type WeddingTaskCompletionSaveFn = (input: SendAfpMessageInput) => Promise<unknown> | unknown;

export type WeddingTaskCompletionSyncDispatchResult = {
  taskId: string;
  title: string;
  status: "saved" | "failed" | "skipped";
  messageId?: string;
  error?: string;
};

export type WeddingTaskCompletionSyncDispatchReceipt = {
  attemptedCount: number;
  savedCount: number;
  failedCount: number;
  skippedCount: number;
  results: WeddingTaskCompletionSyncDispatchResult[];
  summaryLabel: string;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function responseMessageId(value: unknown): string | undefined {
  return clean(recordValue(value, "message_id"))
    ?? clean(recordValue(value, "messageId"))
    ?? clean(recordValue(value, "id"))
    ?? undefined;
}

function responseSuccess(value: unknown): boolean {
  const success = recordValue(value, "success");
  return success === true;
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return clean(error) ?? "Could not save this wedding task status update.";
}

async function dispatchItem(
  item: WeddingTaskCompletionSyncItem,
  save?: WeddingTaskCompletionSaveFn | null,
): Promise<WeddingTaskCompletionSyncDispatchResult> {
  if (!save) {
    return {
      taskId: item.taskId,
      title: item.title,
      status: "skipped",
      error: "No task status save function is available.",
    };
  }
  try {
    const response = await save(item.sendInput);
    if (!responseSuccess(response)) {
      return {
        taskId: item.taskId,
        title: item.title,
        status: "failed",
        error: clean(recordValue(response, "error")) ?? "Save response did not confirm success.",
      };
    }
    const messageId = responseMessageId(response);
    if (!messageId) {
      return {
        taskId: item.taskId,
        title: item.title,
        status: "failed",
        error: "Save response did not include a durable message id.",
      };
    }
    return {
      taskId: item.taskId,
      title: item.title,
      status: "saved",
      messageId,
    };
  } catch (error) {
    return {
      taskId: item.taskId,
      title: item.title,
      status: "failed",
      error: errorText(error),
    };
  }
}

export async function dispatchWeddingTaskCompletionSync(input: {
  items: readonly WeddingTaskCompletionSyncItem[];
  save?: WeddingTaskCompletionSaveFn | null;
}): Promise<WeddingTaskCompletionSyncDispatchReceipt> {
  const results = await Promise.all(input.items.map((item) => dispatchItem(item, input.save)));
  const savedCount = results.filter((result) => result.status === "saved").length;
  const failedCount = results.filter((result) => result.status === "failed").length;
  const skippedCount = results.filter((result) => result.status === "skipped").length;
  const attemptedCount = input.items.length;
  return {
    attemptedCount,
    savedCount,
    failedCount,
    skippedCount,
    results,
    summaryLabel: savedCount === attemptedCount && attemptedCount > 0
      ? `${savedCount} wedding task status update${savedCount === 1 ? "" : "s"} saved; refresh will clear pending state.`
      : `${savedCount} saved, ${failedCount} failed, ${skippedCount} skipped.`,
  };
}
