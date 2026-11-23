import test from "node:test";
import assert from "node:assert/strict";
import type { SendAfpMessageInput } from "@/lib/api";
import { buildWeddingArtifactGenerationState } from "@/lib/weddingArtifactGenerationState";
import { hasSentWeddingArtifactAfpProjection } from "@/lib/weddingArtifactAfpProjectionState";
import {
  WEDDING_CALENDAR_AFP_PROJECTIONS_KEY,
  WEDDING_TASK_AFP_PROJECTIONS_KEY,
  hasSentWeddingProjection,
  type WeddingPlanningScheduleItem,
  type WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";
import {
  buildWeddingProjectionQueueState,
  WEDDING_BOUNDARY_AFP_PROJECTIONS_KEY,
} from "@/lib/weddingProjectionQueueState";
import { runWeddingProjectionDispatchQueue } from "@/lib/weddingProjectionDispatchRunnerState";
import type { WeddingBoundaryPolicy } from "@/lib/weddingBoundaryLedgerState";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as Storage;
}

const metadata = {
  weddingPlanId: "plan-runner",
  responseWorkspaceId: "workspace-runner",
  sourceResponseId: "response-runner",
};

function artifact() {
  const [result] = buildWeddingArtifactGenerationState({
    metadata,
    researchNotes: ["Check photo permits."],
  }).artifacts;
  assert.ok(result);
  return result;
}

const scheduleItem: WeddingPlanningScheduleItem = {
  id: "photo-permit-1",
  title: "Photo permit deadline",
  kind: "other",
  startAt: "2026-10-04T00:00:00.000Z",
  metadata,
};

const budgetTaskItem: WeddingPlanningTaskItem = {
  id: "budget-payment-review-1",
  title: "Review venue payment schedule",
  kind: "budget_review",
  dueAt: "2027-01-15T09:00:00.000Z",
  priority: "high",
  metadata: {
    ...metadata,
    budget_payment_review: true,
    budget_payment_candidate_id: "payment:venue:deposit",
    budget_payment_due_amount_label: "$3000",
    budget_vendor_label: "Garden Hall",
    budget_category_label: "Venue",
    second_order_loop: "budget_drift",
  },
};

const boundaryPolicy: WeddingBoundaryPolicy = {
  id: "policy:guest-changes-need-approval",
  kind: "wedding_boundary_policy",
  title: "Guest changes need approval",
  status: "active",
  visibility: "family_visible",
  ruleType: "invitation_scope",
  enforcement: "require_approval",
  plainLanguage: "Family can suggest guest changes, but the couple approves the final list.",
};

test("runWeddingProjectionDispatchQueue saves pending outputs and commits sent markers", async () => {
  const storage = memoryStorage();
  const generatedArtifact = artifact();
  const calls: SendAfpMessageInput[] = [];
  const queue = buildWeddingProjectionQueueState({
    artifacts: [generatedArtifact],
    scheduleItems: [scheduleItem],
    storage,
  });

  const result = await runWeddingProjectionDispatchQueue({
    queue,
    storage,
    save: async (input) => {
      calls.push(input);
      return { success: true, message_id: `saved-${input.type}` };
    },
  });

  assert.equal(result.attemptedCount, 2);
  assert.equal(result.receipt.savedCount, 2);
  assert.equal(result.receipt.failedCount, 0);
  assert.equal(calls.length, 2);
  assert.equal(hasSentWeddingArtifactAfpProjection(generatedArtifact.summary.id, storage), true);
  assert.equal(hasSentWeddingProjection(scheduleItem.id, WEDDING_CALENDAR_AFP_PROJECTIONS_KEY, storage), true);
});

test("runWeddingProjectionDispatchQueue records thrown and negative save results as failures", async () => {
  const queue = buildWeddingProjectionQueueState({
    artifacts: [artifact()],
    scheduleItems: [scheduleItem],
    storage: memoryStorage(),
  });
  let index = 0;

  const result = await runWeddingProjectionDispatchQueue({
    queue,
    storage: memoryStorage(),
    save: async () => {
      index += 1;
      if (index === 1) return { success: false, error: "server rejected artifact" };
      throw new Error("calendar save failed");
    },
  });

  assert.equal(result.receipt.savedCount, 0);
  assert.equal(result.receipt.failedCount, 2);
  assert.deepEqual(
    result.receipt.failedItems.map((item) => item.error),
    ["server rejected artifact", "calendar save failed"],
  );
  assert.equal(result.receipt.canRetry, true);
});

test("runWeddingProjectionDispatchQueue fails closed without explicit success and durable message id", async () => {
  const queue = buildWeddingProjectionQueueState({
    artifacts: [artifact()],
    scheduleItems: [scheduleItem],
    storage: memoryStorage(),
  });
  let index = 0;

  const result = await runWeddingProjectionDispatchQueue({
    queue,
    storage: memoryStorage(),
    save: async () => {
      index += 1;
      return index === 1 ? { message_id: "msg-without-success" } : { success: true };
    },
  });

  assert.equal(result.receipt.savedCount, 0);
  assert.equal(result.receipt.failedCount, 2);
  assert.ok(result.receipt.failedItems.some((item) => /did not confirm success/i.test(item.error ?? "")));
  assert.ok(result.receipt.failedItems.some((item) => /durable message id/i.test(item.error ?? "")));
});

test("runWeddingProjectionDispatchQueue does not call save for blocked items", async () => {
  let calls = 0;
  const queue = buildWeddingProjectionQueueState({
    scheduleItems: [{ ...scheduleItem, startAt: null }],
    storage: memoryStorage(),
  });

  const result = await runWeddingProjectionDispatchQueue({
    queue,
    storage: memoryStorage(),
    save: async () => {
      calls += 1;
      return { success: true };
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.attemptedCount, 0);
  assert.equal(result.receipt.skippedCount, 1);
});

test("runWeddingProjectionDispatchQueue can skip local sent-marker commits", async () => {
  const storage = memoryStorage();
  const generatedArtifact = artifact();
  const queue = buildWeddingProjectionQueueState({
    artifacts: [generatedArtifact],
    storage,
  });

  const result = await runWeddingProjectionDispatchQueue({
    queue,
    storage,
    commitSentMarkers: false,
    save: async () => ({ success: true, id: "msg-1" }),
  });

  assert.equal(result.committedSentMarkers, false);
  assert.equal(result.receipt.savedItems[0]?.messageId, "msg-1");
  assert.equal(hasSentWeddingArtifactAfpProjection(generatedArtifact.summary.id, storage), false);
});

test("runWeddingProjectionDispatchQueue preserves budget supertags in saved payloads", async () => {
  const storage = memoryStorage();
  const calls: SendAfpMessageInput[] = [];
  const queue = buildWeddingProjectionQueueState({
    taskItems: [budgetTaskItem],
    storage,
  });

  const result = await runWeddingProjectionDispatchQueue({
    queue,
    storage,
    save: async (input) => {
      calls.push(input);
      return { success: true, message_id: "msg-budget-task" };
    },
  });

  assert.equal(result.receipt.savedCount, 1);
  assert.equal(calls.length, 1);
  assert.ok(calls[0]?.supertags?.includes("wedding_budget"));
  assert.ok(calls[0]?.supertags?.includes("wedding_budget:payment_schedule"));
  assert.ok(calls[0]?.supertags?.includes("topology:budget_drift"));
  assert.ok(calls[0]?.to.includes("agent://knowledge-graph"));
  assert.equal(hasSentWeddingProjection(budgetTaskItem.id, WEDDING_TASK_AFP_PROJECTIONS_KEY, storage), true);
});

test("runWeddingProjectionDispatchQueue commits boundary ledger sent markers", async () => {
  const storage = memoryStorage();
  const calls: SendAfpMessageInput[] = [];
  const queue = buildWeddingProjectionQueueState({
    boundaryObjects: [boundaryPolicy],
    boundaryMetadata: metadata,
    storage,
  });

  const result = await runWeddingProjectionDispatchQueue({
    queue,
    storage,
    save: async (input) => {
      calls.push(input);
      return { success: true, message_id: "msg-boundary-policy" };
    },
  });

  assert.equal(result.receipt.savedCount, 1);
  assert.equal(calls[0]?.type, "ledger");
  assert.equal(calls[0]?.kind, "wedding_boundary_policy");
  assert.equal(hasSentWeddingProjection(boundaryPolicy.id, WEDDING_BOUNDARY_AFP_PROJECTIONS_KEY, storage), true);
  assert.equal(hasSentWeddingProjection(boundaryPolicy.id, WEDDING_TASK_AFP_PROJECTIONS_KEY, storage), false);
});
