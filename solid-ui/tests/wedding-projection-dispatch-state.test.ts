import test from "node:test";
import assert from "node:assert/strict";
import { buildWeddingArtifactGenerationState } from "@/lib/weddingArtifactGenerationState";
import {
  hasSentWeddingArtifactAfpProjection,
} from "@/lib/weddingArtifactAfpProjectionState";
import {
  WEDDING_CALENDAR_AFP_PROJECTIONS_KEY,
  WEDDING_TASK_AFP_PROJECTIONS_KEY,
  hasSentWeddingProjection,
  type WeddingPlanningScheduleItem,
  type WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";
import { buildWeddingCollaborationState } from "@/lib/weddingCollaborationState";
import { hasSentWeddingCollaborationAfpProjection } from "@/lib/weddingCollaborationAfpProjectionState";
import { hasSentWeddingNeedToKnowAfpProjection } from "@/lib/weddingNeedToKnowAfpProjectionState";
import { buildWeddingProjectionQueueState } from "@/lib/weddingProjectionQueueState";
import { buildWeddingTemplateFollowUpState } from "@/lib/weddingTemplateFollowUpState";
import {
  buildWeddingProjectionDispatchReceiptState,
  markWeddingProjectionDispatchReceiptSent,
} from "@/lib/weddingProjectionDispatchState";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as Storage;
}

const metadata = {
  weddingPlanId: "plan-dispatch",
  responseWorkspaceId: "workspace-dispatch",
  sourceResponseId: "response-dispatch",
};

function artifact() {
  const [result] = buildWeddingArtifactGenerationState({
    metadata,
    researchNotes: ["Confirm wet-weather ceremony options."],
  }).artifacts;
  assert.ok(result);
  return result;
}

function contextItem(storage = memoryStorage()) {
  return buildWeddingTemplateFollowUpState({
    weddingPlanId: "plan-dispatch",
    responseWorkspaceId: "workspace-dispatch",
    dateOrSeason: "2027-10-03",
    location: "Sydney",
    guestCount: 80,
    projectionStorage: storage,
  }).contextProjection;
}

const scheduleItem: WeddingPlanningScheduleItem = {
  id: "ceremony-1",
  title: "Ceremony",
  kind: "ceremony",
  startAt: "2026-10-03T05:00:00.000Z",
  metadata,
};

const taskItem: WeddingPlanningTaskItem = {
  id: "vendor-call-1",
  title: "Call photographer",
  kind: "vendor_follow_up",
  metadata,
};

test("buildWeddingProjectionDispatchReceiptState records successful save outcomes", () => {
  const queue = buildWeddingProjectionQueueState({
    contextItems: [contextItem()],
    artifacts: [artifact()],
    scheduleItems: [scheduleItem],
    taskItems: [taskItem],
    storage: memoryStorage(),
  });
  const receipt = buildWeddingProjectionDispatchReceiptState({
    queue,
    outcomes: queue.pendingItems.map((item) => ({
      itemId: item.id,
      status: "saved",
      messageId: `message-${item.id}`,
    })),
  });

  assert.equal(receipt.savedCount, 4);
  assert.equal(receipt.failedCount, 0);
  assert.equal(receipt.skippedCount, 0);
  assert.equal(receipt.summaryLabel, "4 saved");
  assert.equal(receipt.canRetry, false);
  assert.ok(receipt.savedItems.every((item) => item.messageId?.startsWith("message-")));
  assert.equal(receipt.savedItems.find((item) => item.kind === "context")?.semanticKind, "wedding_active_loop");
  assert.ok(receipt.savedItems.find((item) => item.kind === "context")?.semanticTags.includes("wedding_context"));
});

test("buildWeddingProjectionDispatchReceiptState records failures and retry ids", () => {
  const queue = buildWeddingProjectionQueueState({
    artifacts: [artifact()],
    scheduleItems: [scheduleItem],
    storage: memoryStorage(),
  });
  const receipt = buildWeddingProjectionDispatchReceiptState({
    queue,
    outcomes: [
      { itemId: queue.pendingItems[0]?.id, status: "saved", messageId: "msg-1" },
      { itemId: queue.pendingItems[1]?.id, status: "failed", error: "network error" },
    ],
  });

  assert.equal(receipt.savedCount, 1);
  assert.equal(receipt.failedCount, 1);
  assert.equal(receipt.summaryLabel, "1 saved, 1 failed");
  assert.equal(receipt.title, "Some wedding outputs were not saved");
  assert.deepEqual(receipt.retryItemIds, [queue.pendingItems[1]?.id]);
  assert.equal(receipt.canRetry, true);
  assert.equal(receipt.failedItems[0]?.semanticKind, null);
});

test("buildWeddingProjectionDispatchReceiptState skips blocked or already handled items without fake success", () => {
  const queue = buildWeddingProjectionQueueState({
    scheduleItems: [{ ...scheduleItem, id: "missing-date", startAt: null }],
    storage: memoryStorage(),
  });
  const receipt = buildWeddingProjectionDispatchReceiptState({ queue, outcomes: [] });

  assert.equal(receipt.savedCount, 0);
  assert.equal(receipt.failedCount, 0);
  assert.equal(receipt.skippedCount, 1);
  assert.equal(receipt.skippedItems[0]?.error, "Needs a clear start date before saving to Calendar");
});

test("markWeddingProjectionDispatchReceiptSent commits sent markers by projection family", () => {
  const storage = memoryStorage();
  const generatedArtifact = artifact();
  const collaboration = buildWeddingCollaborationState({
    invites: [{
      email: "planner@example.com",
      displayName: "Planner",
      role: "planner",
      status: "draft",
    }],
  });
  const queue = buildWeddingProjectionQueueState({
    contextItems: [contextItem(storage)],
    artifacts: [generatedArtifact],
    scheduleItems: [scheduleItem],
    taskItems: [taskItem],
    collaborationInvites: collaboration.invites,
    collaborationMetadata: metadata,
    storage,
  });
  const receipt = buildWeddingProjectionDispatchReceiptState({
    queue,
    outcomes: queue.pendingItems.map((item) => ({ itemId: item.id, status: "saved", messageId: `message-${item.id}` })),
  });

  markWeddingProjectionDispatchReceiptSent(receipt, storage);

  assert.equal(hasSentWeddingNeedToKnowAfpProjection("response_workspace:workspace-dispatch", storage), true);
  assert.equal(hasSentWeddingArtifactAfpProjection(generatedArtifact.summary.id, storage), true);
  assert.equal(hasSentWeddingProjection(scheduleItem.id, WEDDING_CALENDAR_AFP_PROJECTIONS_KEY, storage), true);
  assert.equal(hasSentWeddingProjection(taskItem.id, WEDDING_TASK_AFP_PROJECTIONS_KEY, storage), true);
  assert.equal(hasSentWeddingCollaborationAfpProjection(queue.pendingItems.find((item) => item.kind === "access_control")?.sourceId ?? "", storage), true);
});

test("buildWeddingProjectionDispatchReceiptState downgrades saved outcomes without durable message ids", () => {
  const queue = buildWeddingProjectionQueueState({
    artifacts: [artifact()],
    storage: memoryStorage(),
  });
  const receipt = buildWeddingProjectionDispatchReceiptState({
    queue,
    outcomes: [{ itemId: queue.pendingItems[0]?.id, status: "saved" }],
  });

  assert.equal(receipt.savedCount, 0);
  assert.equal(receipt.failedCount, 1);
  assert.match(receipt.failedItems[0]?.error ?? "", /durable message id/i);
});

test("buildWeddingProjectionDispatchReceiptState can match outcomes by source id and kind", () => {
  const queue = buildWeddingProjectionQueueState({
    scheduleItems: [scheduleItem],
    storage: memoryStorage(),
  });
  const receipt = buildWeddingProjectionDispatchReceiptState({
    queue,
    outcomes: [{
      sourceId: scheduleItem.id,
      kind: "calendar_event",
      status: "saved",
      messageId: "calendar-message-1",
    }],
  });

  assert.equal(receipt.savedCount, 1);
  assert.equal(receipt.savedItems[0]?.messageId, "calendar-message-1");
});
