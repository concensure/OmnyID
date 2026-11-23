// @locs-version: 1.0
import { sendAfpMessage, type SendAfpMessageInput } from "@/lib/api";
import {
  markContactFollowUpTaskProjectionSent,
  type ContactFollowUpTaskProjectionState,
} from "@/lib/contactFollowUpTaskProjectionState";

export type ContactFollowUpTaskSaveFn = (input: SendAfpMessageInput) => Promise<unknown>;

export type ContactFollowUpTaskDispatchItem = {
  projectionId: string;
  title: string;
  status: "saved" | "failed";
  messageId: string | null;
  error: string | null;
};

export type ContactFollowUpTaskDispatchReceipt = {
  attemptedCount: number;
  savedCount: number;
  failedCount: number;
  savedItems: ContactFollowUpTaskDispatchItem[];
  failedItems: ContactFollowUpTaskDispatchItem[];
  summaryLabel: string;
  canRetry: boolean;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function contentRecord(input: SendAfpMessageInput): Record<string, unknown> {
  return record(input.content);
}

function projectionId(input: SendAfpMessageInput): string {
  return clean(contentRecord(input).projection_id)
    ?? clean(record(input.metadata).projection_id)
    ?? input.thread_id;
}

function title(input: SendAfpMessageInput): string {
  return clean(contentRecord(input).title) ?? "Contact follow-up task";
}

function messageIdFromResponse(value: unknown): string | null {
  const data = record(value);
  return clean(data.message_id) ?? clean(data.messageId) ?? clean(data.id);
}

function successFromResponse(value: unknown): boolean {
  const success = record(value).success;
  return success === undefined ? true : success === true;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return clean(error) ?? "Could not save this contact follow-up task.";
}

function receipt(items: ContactFollowUpTaskDispatchItem[]): ContactFollowUpTaskDispatchReceipt {
  const savedItems = items.filter((item) => item.status === "saved");
  const failedItems = items.filter((item) => item.status === "failed");
  return {
    attemptedCount: items.length,
    savedCount: savedItems.length,
    failedCount: failedItems.length,
    savedItems,
    failedItems,
    summaryLabel: failedItems.length > 0
      ? `${savedItems.length} saved, ${failedItems.length} failed`
      : savedItems.length > 0 ? `${savedItems.length} contact follow-up task${savedItems.length === 1 ? "" : "s"} saved` : "No contact follow-up tasks to save",
    canRetry: failedItems.length > 0,
  };
}

async function saveTask(
  input: SendAfpMessageInput,
  save: ContactFollowUpTaskSaveFn,
  storage: Storage | null | undefined,
  userId: string | null | undefined,
): Promise<ContactFollowUpTaskDispatchItem> {
  const id = projectionId(input);
  try {
    const response = await save(input);
    if (!successFromResponse(response)) {
      return {
        projectionId: id,
        title: title(input),
        status: "failed",
        messageId: null,
        error: clean(record(response).error) ?? "Save response did not confirm success.",
      };
    }
    markContactFollowUpTaskProjectionSent(id, storage, userId);
    return {
      projectionId: id,
      title: title(input),
      status: "saved",
      messageId: messageIdFromResponse(response),
      error: null,
    };
  } catch (error) {
    return {
      projectionId: id,
      title: title(input),
      status: "failed",
      messageId: null,
      error: errorMessage(error),
    };
  }
}

export async function runContactFollowUpTaskDispatch(input: {
  projection: ContactFollowUpTaskProjectionState;
  save?: ContactFollowUpTaskSaveFn | null;
  storage?: Storage | null;
  userId?: string | null;
}): Promise<ContactFollowUpTaskDispatchReceipt> {
  const save = input.save ?? sendAfpMessage;
  const storage = input.storage ?? (typeof localStorage === "undefined" ? null : localStorage);
  const items = await Promise.all(
    input.projection.tasks.map((task) => saveTask(task, save, storage, input.userId)),
  );
  return receipt(items);
}
