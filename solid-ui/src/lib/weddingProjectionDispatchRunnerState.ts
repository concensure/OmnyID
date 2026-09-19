// @locs-version: 2.0
import { sendAfpMessage, type SendAfpMessageInput } from "@/lib/api";
import {
  buildWeddingProjectionDispatchReceiptState,
  markWeddingProjectionDispatchReceiptSent,
  type WeddingProjectionDispatchOutcomeInput,
  type WeddingProjectionDispatchReceiptState,
} from "@/lib/weddingProjectionDispatchState";
import type {
  WeddingProjectionQueueItem,
  WeddingProjectionQueueState,
} from "@/lib/weddingProjectionQueueState";

export type WeddingProjectionSaveFn = (input: SendAfpMessageInput) => Promise<unknown>;

export type WeddingProjectionDispatchRunState = {
  receipt: WeddingProjectionDispatchReceiptState;
  attemptedCount: number;
  committedSentMarkers: boolean;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function messageIdFromResponse(value: unknown): string | null {
  return clean(recordValue(value, "message_id"))
    ?? clean(recordValue(value, "messageId"))
    ?? clean(recordValue(value, "id"));
}

function successFromResponse(value: unknown): boolean {
  const success = recordValue(value, "success");
  return success === true;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  const raw = clean(error);
  return raw ?? "Could not save this planning output.";
}

async function dispatchItem(
  item: WeddingProjectionQueueItem,
  save: WeddingProjectionSaveFn,
): Promise<WeddingProjectionDispatchOutcomeInput> {
  if (!item.sendInput) {
    return {
      itemId: item.id,
      sourceId: item.sourceId,
      kind: item.kind,
      status: "skipped",
      error: item.blockedReason ?? item.statusLabel,
    };
  }
  try {
    const response = await save(item.sendInput);
    if (!successFromResponse(response)) {
      return {
        itemId: item.id,
        sourceId: item.sourceId,
        kind: item.kind,
        status: "failed",
        error: clean(recordValue(response, "error")) ?? "Save response did not confirm success.",
      };
    }
    const messageId = messageIdFromResponse(response);
    if (!messageId) {
      return {
        itemId: item.id,
        sourceId: item.sourceId,
        kind: item.kind,
        status: "failed",
        error: "Save response did not include a durable message id.",
      };
    }
    return {
      itemId: item.id,
      sourceId: item.sourceId,
      kind: item.kind,
      status: "saved",
      messageId,
    };
  } catch (error) {
    return {
      itemId: item.id,
      sourceId: item.sourceId,
      kind: item.kind,
      status: "failed",
      error: errorMessage(error),
    };
  }
}

export async function runWeddingProjectionDispatchQueue(input: {
  queue: WeddingProjectionQueueState;
  save?: WeddingProjectionSaveFn | null;
  storage?: Storage | null;
  commitSentMarkers?: boolean | null;
}): Promise<WeddingProjectionDispatchRunState> {
  const save = input.save ?? sendAfpMessage;
  const outcomes = await Promise.all(
    input.queue.pendingItems.map((item) => dispatchItem(item, save)),
  );
  const receipt = buildWeddingProjectionDispatchReceiptState({
    queue: input.queue,
    outcomes,
  });
  const shouldCommit = input.commitSentMarkers !== false;
  if (shouldCommit) {
    markWeddingProjectionDispatchReceiptSent(receipt, input.storage ?? localStorage);
  }
  return {
    receipt,
    attemptedCount: input.queue.pendingItems.length,
    committedSentMarkers: shouldCommit,
  };
}
