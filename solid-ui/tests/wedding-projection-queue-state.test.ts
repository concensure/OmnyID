import test from "node:test";
import assert from "node:assert/strict";
import { buildWeddingArtifactGenerationState } from "@/lib/weddingArtifactGenerationState";
import { markWeddingArtifactAfpProjectionSent } from "@/lib/weddingArtifactAfpProjectionState";
import {
  WEDDING_CALENDAR_AFP_PROJECTIONS_KEY,
  WEDDING_TASK_AFP_PROJECTIONS_KEY,
  markWeddingProjectionSent,
  type WeddingPlanningScheduleItem,
  type WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";
import { markWeddingNeedToKnowAfpProjectionSent } from "@/lib/weddingNeedToKnowAfpProjectionState";
import { buildWeddingCollaborationState } from "@/lib/weddingCollaborationState";
import {
  buildWeddingProjectionQueueSelectionState,
  buildWeddingProjectionQueueState,
} from "@/lib/weddingProjectionQueueState";
import { buildWeddingTemplateFollowUpState } from "@/lib/weddingTemplateFollowUpState";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as Storage;
}

const metadata = {
  weddingPlanId: "plan-1",
  responseWorkspaceId: "workspace-1",
  sourceResponseId: "response-1",
};

function artifacts() {
  return buildWeddingArtifactGenerationState({
    metadata,
    researchNotes: ["Shortlist garden venues."],
    vendors: [{ name: "Garden House", category: "Venue", location: "Sydney" }],
  }).artifacts;
}

function contextItem(storage = memoryStorage()) {
  return buildWeddingTemplateFollowUpState({
    weddingPlanId: "plan-1",
    responseWorkspaceId: "workspace-1",
    dateOrSeason: "2027-10-03",
    location: "Sydney",
    guestCount: 80,
    projectionStorage: storage,
  }).contextProjection;
}

const scheduleItem: WeddingPlanningScheduleItem = {
  id: "venue-tour-1",
  title: "Venue tour",
  kind: "venue_tour",
  startAt: "2026-10-01T09:00:00.000Z",
  location: "Sydney",
  metadata,
};

const taskItem: WeddingPlanningTaskItem = {
  id: "budget-review-1",
  title: "Review venue budget",
  kind: "budget_review",
  dueLabel: "This week",
  priority: "high",
  metadata,
};

test("buildWeddingProjectionQueueState aggregates pending artifact calendar and task send inputs", () => {
  const state = buildWeddingProjectionQueueState({
    contextItems: [contextItem()],
    artifacts: artifacts().slice(0, 1),
    scheduleItems: [scheduleItem],
    taskItems: [taskItem],
    nowIso: "2026-09-12T00:00:00.000Z",
    storage: memoryStorage(),
  });

  assert.equal(state.items.length, 4);
  assert.equal(state.pendingItems.length, 4);
  assert.equal(state.blockedItems.length, 0);
  assert.equal(state.sentItems.length, 0);
  assert.equal(state.pendingSendInputs.length, 4);
  assert.equal(state.summaryLabel, "4 ready");
  assert.equal(state.nextActionLabel, "Save 4 planning items");
  assert.equal(state.canDispatch, true);
  assert.deepEqual(state.pendingSendInputs.map((input) => input.type), ["context", "artifact", "calendar_event", "task"]);
  assert.ok(state.pendingSendInputs.some((input) => input.supertags?.includes("wedding_task:budget_review")));
});

test("buildWeddingProjectionQueueState includes collaborator invite access-control records", () => {
  const collaboration = buildWeddingCollaborationState({
    invites: [
      {
        email: "partner@example.com",
        displayName: "Partner",
        role: "co_owner",
        status: "draft",
      },
      {
        email: "bad-email",
        displayName: "Viewer",
        role: "viewer",
        status: "draft",
      },
    ],
  });
  const state = buildWeddingProjectionQueueState({
    collaborationInvites: collaboration.invites,
    collaborationMetadata: metadata,
    storage: memoryStorage(),
  });

  assert.equal(state.items.length, 2);
  assert.equal(state.pendingItems.length, 1);
  assert.equal(state.blockedItems.length, 1);
  assert.equal(state.pendingItems[0]?.kind, "access_control");
  assert.equal(state.pendingSendInputs[0]?.type, "access_control");
  assert.match(state.blockedItems[0]?.blockedReason ?? "", /valid email required/);
});

test("buildWeddingProjectionQueueState dispatches lifecycle records without fresh invite subtypes", () => {
  const collaboration = buildWeddingCollaborationState({
    nowIso: "2026-02-15T00:00:00Z",
    invites: [
      {
        email: "accepted@example.com",
        displayName: "Accepted partner",
        role: "co_owner",
        status: "accepted",
        lastActiveAt: "2026-01-01T00:00:00Z",
      },
      {
        email: "expired@example.com",
        displayName: "Expired viewer",
        role: "viewer",
        status: "invited",
        expiresAt: "2026-01-01T00:00:00Z",
      },
      {
        email: "revoked@example.com",
        displayName: "Revoked planner",
        role: "planner",
        status: "accepted",
        revokedAt: "2026-02-01T00:00:00Z",
      },
    ],
  });
  const state = buildWeddingProjectionQueueState({
    collaborationInvites: collaboration.invites,
    collaborationMetadata: metadata,
    storage: memoryStorage(),
  });

  assert.equal(state.pendingItems.length, 3);
  assert.equal(state.blockedItems.length, 0);
  assert.equal(state.pendingSendInputs.length, 3);
  assert.deepEqual(state.pendingSendInputs.map((input) => input.subtype), [
    "wedding_collaborator_review",
    "wedding_collaborator_expire",
    "wedding_collaborator_revoke",
  ]);
  assert.equal(state.pendingSendInputs.every((input) => (input.content as any).shared_editing_enabled === false), true);
});

test("buildWeddingProjectionQueueState labels review-only and incomplete items as blocked", () => {
  const state = buildWeddingProjectionQueueState({
    scheduleItems: [
      { ...scheduleItem, id: "review-date", reviewStatus: "needs_review" },
      { ...scheduleItem, id: "missing-date", startAt: null },
    ],
    taskItems: [{ ...taskItem, id: "ignored-task", reviewStatus: "ignored" }],
    storage: memoryStorage(),
  });

  assert.equal(state.pendingItems.length, 0);
  assert.equal(state.blockedItems.length, 3);
  assert.equal(state.canDispatch, false);
  assert.equal(state.nextActionLabel, "Review items that need attention");
  assert.ok(state.blockedItems.some((item) => item.blockedReason === "Needs date review before saving to Calendar"));
  assert.ok(state.blockedItems.some((item) => item.blockedReason === "Needs a clear start date before saving to Calendar"));
  assert.ok(state.blockedItems.some((item) => item.blockedReason === "Ignored task"));
});

test("buildWeddingProjectionQueueState excludes already sent projections from dispatch inputs", () => {
  const storage = memoryStorage();
  const [artifact] = artifacts();
  assert.ok(artifact);
  markWeddingArtifactAfpProjectionSent(artifact.summary.id, storage);
  markWeddingNeedToKnowAfpProjectionSent("response_workspace:workspace-1", storage);
  markWeddingProjectionSent(scheduleItem.id, WEDDING_CALENDAR_AFP_PROJECTIONS_KEY, storage);
  markWeddingProjectionSent(taskItem.id, WEDDING_TASK_AFP_PROJECTIONS_KEY, storage);

  const state = buildWeddingProjectionQueueState({
    contextItems: [contextItem(storage)],
    artifacts: [artifact],
    scheduleItems: [scheduleItem],
    taskItems: [taskItem],
    storage,
  });

  assert.equal(state.pendingItems.length, 0);
  assert.equal(state.sentItems.length, 4);
  assert.equal(state.pendingSendInputs.length, 0);
  assert.equal(state.summaryLabel, "4 already saved");
  assert.equal(state.nextActionLabel, "Planning items saved");
  assert.equal(state.canDispatch, false);
});

test("buildWeddingProjectionQueueState reports an empty queue", () => {
  const state = buildWeddingProjectionQueueState({ storage: memoryStorage() });

  assert.deepEqual(state.items, []);
  assert.equal(state.summaryLabel, "No wedding items to save");
  assert.equal(state.nextActionLabel, "Create planning items");
  assert.equal(state.canDispatch, false);
});

test("buildWeddingProjectionQueueSelectionState dispatches only selected pending outputs", () => {
  const state = buildWeddingProjectionQueueState({
    artifacts: artifacts().slice(0, 1),
    scheduleItems: [scheduleItem],
    taskItems: [taskItem],
    storage: memoryStorage(),
  });
  const artifactItem = state.pendingItems.find((item) => item.kind === "artifact");
  assert.ok(artifactItem);

  const selection = buildWeddingProjectionQueueSelectionState({
    queue: state,
    deselectedItemIds: { [artifactItem.id]: true },
  });

  assert.equal(selection.totalPendingCount, 3);
  assert.equal(selection.selectedPendingCount, 2);
  assert.equal(selection.selectionSummaryLabel, "2/3 ready items selected");
  assert.equal(selection.queue.pendingSendInputs.length, 2);
  assert.equal(selection.queue.canDispatch, true);
  assert.equal(selection.queue.summaryLabel, "2 selected items ready");
  assert.equal(selection.queue.nextActionLabel, "Save 2 selected items");
  assert.deepEqual(selection.queue.pendingItems.map((item) => item.kind), ["calendar_event", "task"]);
  assert.ok(selection.queue.pendingSendInputs.some((input) => input.supertags?.includes("wedding_task:budget_review")));
});

test("buildWeddingProjectionQueueSelectionState keeps sent and blocked outputs visible when pending outputs are deselected", () => {
  const storage = memoryStorage();
  markWeddingProjectionSent(taskItem.id, WEDDING_TASK_AFP_PROJECTIONS_KEY, storage);
  const state = buildWeddingProjectionQueueState({
    scheduleItems: [
      scheduleItem,
      { ...scheduleItem, id: "missing-date", startAt: null },
    ],
    taskItems: [taskItem],
    storage,
  });
  const pendingItem = state.pendingItems[0];
  assert.ok(pendingItem);

  const selection = buildWeddingProjectionQueueSelectionState({
    queue: state,
    deselectedItemIds: { [pendingItem.id]: true },
  });

  assert.equal(selection.totalPendingCount, 1);
  assert.equal(selection.selectedPendingCount, 0);
  assert.equal(selection.selectionSummaryLabel, "0/1 ready items selected");
  assert.equal(selection.queue.canDispatch, false);
  assert.equal(selection.queue.pendingSendInputs.length, 0);
  assert.equal(selection.queue.sentItems.length, 1);
  assert.equal(selection.queue.blockedItems.length, 1);
  assert.equal(selection.queue.summaryLabel, "No selected items to save");
  assert.equal(selection.queue.nextActionLabel, "Select items to save");
});
