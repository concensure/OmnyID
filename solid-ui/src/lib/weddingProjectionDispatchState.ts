// @locs-version: 2.0
import {
  markWeddingArtifactAfpProjectionSent,
} from "@/lib/weddingArtifactAfpProjectionState";
import {
  markWeddingNeedToKnowAfpProjectionSent,
} from "@/lib/weddingNeedToKnowAfpProjectionState";
import {
  markWeddingDecisionAfpProjectionSent,
} from "@/lib/weddingDecisionAfpProjectionState";
import {
  WEDDING_CALENDAR_AFP_PROJECTIONS_KEY,
  WEDDING_TASK_AFP_PROJECTIONS_KEY,
  markWeddingProjectionSent,
} from "@/lib/weddingCalendarProjectionState";
import { markWeddingCollaborationAfpProjectionSent } from "@/lib/weddingCollaborationAfpProjectionState";
import { WEDDING_BOUNDARY_AFP_PROJECTIONS_KEY } from "@/lib/weddingProjectionQueueState";
import type {
  WeddingProjectionQueueItem,
  WeddingProjectionQueueItemKind,
  WeddingProjectionQueueState,
} from "@/lib/weddingProjectionQueueState";
import type {
  WeddingSemanticUiKind,
  WeddingSemanticUiObject,
} from "@/lib/weddingSemanticUiState";

export type WeddingProjectionDispatchOutcomeStatus = "saved" | "failed" | "skipped";

export type WeddingProjectionDispatchOutcomeInput = {
  itemId?: string | null;
  sourceId?: string | null;
  kind?: WeddingProjectionQueueItemKind | null;
  status: WeddingProjectionDispatchOutcomeStatus;
  messageId?: string | null;
  error?: string | null;
};

export type WeddingProjectionDispatchReceiptItem = {
  itemId: string;
  sourceId: string;
  kind: WeddingProjectionQueueItemKind;
  semanticKind: WeddingSemanticUiKind | null;
  semanticTags: string[];
  semanticObject: WeddingSemanticUiObject | null;
  title: string;
  status: WeddingProjectionDispatchOutcomeStatus;
  messageId: string | null;
  error: string | null;
};

export type WeddingProjectionDispatchReceiptState = {
  title: string;
  summaryLabel: string;
  savedCount: number;
  failedCount: number;
  skippedCount: number;
  savedItems: WeddingProjectionDispatchReceiptItem[];
  failedItems: WeddingProjectionDispatchReceiptItem[];
  skippedItems: WeddingProjectionDispatchReceiptItem[];
  items: WeddingProjectionDispatchReceiptItem[];
  retryItemIds: string[];
  canRetry: boolean;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function outcomeKey(outcome: WeddingProjectionDispatchOutcomeInput): string | null {
  const itemId = clean(outcome.itemId);
  if (itemId) return `item:${itemId}`;
  const sourceId = clean(outcome.sourceId);
  const kind = clean(outcome.kind);
  return sourceId && kind ? `source:${kind}:${sourceId}` : null;
}

function queueItemKey(item: WeddingProjectionQueueItem): string {
  return `item:${item.id}`;
}

function queueSourceKey(item: WeddingProjectionQueueItem): string {
  return `source:${item.kind}:${item.sourceId}`;
}

function fallbackOutcome(item: WeddingProjectionQueueItem): WeddingProjectionDispatchOutcomeInput {
  if (item.status === "sent") return { itemId: item.id, status: "skipped", error: "Already saved." };
  if (item.status === "blocked") {
    return { itemId: item.id, status: "skipped", error: item.blockedReason ?? "Not ready to save." };
  }
  return { itemId: item.id, status: "skipped", error: "No dispatch result was returned." };
}

function receiptItem(
  item: WeddingProjectionQueueItem,
  outcome: WeddingProjectionDispatchOutcomeInput,
): WeddingProjectionDispatchReceiptItem {
  const messageId = clean(outcome.messageId);
  const status = outcome.status === "saved" && !messageId ? "failed" : outcome.status;
  return {
    itemId: item.id,
    sourceId: item.sourceId,
    kind: item.kind,
    semanticKind: item.semanticKind,
    semanticTags: item.semanticTags,
    semanticObject: item.semanticObject,
    title: item.title,
    status,
    messageId,
    error: status === "failed" && outcome.status === "saved" && !messageId
      ? "Saved outcome did not include a durable message id."
      : clean(outcome.error),
  };
}

function summaryLabel(savedCount: number, failedCount: number, skippedCount: number): string {
  const parts = [
    savedCount > 0 ? `${savedCount} saved` : null,
    failedCount > 0 ? `${failedCount} failed` : null,
    skippedCount > 0 ? `${skippedCount} skipped` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "No save results";
}

export function buildWeddingProjectionDispatchReceiptState(input: {
  queue: WeddingProjectionQueueState;
  outcomes?: readonly WeddingProjectionDispatchOutcomeInput[] | null;
}): WeddingProjectionDispatchReceiptState {
  const outcomes = new Map<string, WeddingProjectionDispatchOutcomeInput>();
  for (const outcome of input.outcomes ?? []) {
    const key = outcomeKey(outcome);
    if (key) outcomes.set(key, outcome);
  }

  const items = input.queue.items.map((item) => {
    const outcome = outcomes.get(queueItemKey(item)) ?? outcomes.get(queueSourceKey(item)) ?? fallbackOutcome(item);
    return receiptItem(item, outcome);
  });
  const savedItems = items.filter((item) => item.status === "saved");
  const failedItems = items.filter((item) => item.status === "failed");
  const skippedItems = items.filter((item) => item.status === "skipped");

  return {
    title: failedItems.length > 0 ? "Some wedding outputs were not saved" : "Wedding outputs save result",
    summaryLabel: summaryLabel(savedItems.length, failedItems.length, skippedItems.length),
    savedCount: savedItems.length,
    failedCount: failedItems.length,
    skippedCount: skippedItems.length,
    savedItems,
    failedItems,
    skippedItems,
    items,
    retryItemIds: failedItems.map((item) => item.itemId),
    canRetry: failedItems.length > 0,
  };
}

export function markWeddingProjectionDispatchReceiptSent(
  receipt: WeddingProjectionDispatchReceiptState,
  storage: Storage = localStorage,
): void {
  for (const item of receipt.savedItems) {
    if (item.kind === "context") {
      markWeddingNeedToKnowAfpProjectionSent(item.sourceId, storage);
    } else if (item.kind === "decision") {
      markWeddingDecisionAfpProjectionSent(item.sourceId, storage);
    } else if (item.kind === "artifact") {
      markWeddingArtifactAfpProjectionSent(item.sourceId, storage);
    } else if (item.kind === "calendar_event") {
      markWeddingProjectionSent(item.sourceId, WEDDING_CALENDAR_AFP_PROJECTIONS_KEY, storage);
    } else if (item.kind === "access_control") {
      markWeddingCollaborationAfpProjectionSent(item.sourceId, storage);
    } else if (item.kind === "boundary") {
      markWeddingProjectionSent(item.sourceId, WEDDING_BOUNDARY_AFP_PROJECTIONS_KEY, storage);
    } else {
      markWeddingProjectionSent(item.sourceId, WEDDING_TASK_AFP_PROJECTIONS_KEY, storage);
    }
  }
}
