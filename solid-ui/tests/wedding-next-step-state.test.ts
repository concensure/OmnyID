import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingNextStepState } from "../src/lib/weddingNextStepState.ts";
import type { WeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";

function state(overrides: Partial<WeddingResponseWorkspaceViewState> = {}): WeddingResponseWorkspaceViewState {
  return {
    ganttTimeline: {
      rows: [],
      undatedItems: [],
    },
    budgetTracking: {
      budgetTargetAmount: null,
      remainingAmount: null,
    },
    guestTracking: {
      guestRowCount: 0,
      attendingCount: 0,
      declinedCount: 0,
      pendingCount: 0,
    },
    seatingPlan: {
      assignedSeatCount: 0,
      unassignedAttendingCount: 0,
    },
    vendorContactCards: [],
    inspiration: {
      items: [],
      tagCounts: [],
      insight: null,
      originalFileCount: 0,
      savedOriginalFileCount: 0,
      unsavedOriginalFileCount: 0,
      originalFileStatusLabel: "No original files yet.",
      emptyLabel: "No inspiration saved yet.",
    },
    planningTaskItems: [],
    ...overrides,
  } as unknown as WeddingResponseWorkspaceViewState;
}

test("wedding next step starts with the date when no dated timeline exists", () => {
  const next = buildWeddingNextStepState(state());

  assert.equal(next.priority, "wedding_date");
  assert.equal(next.menuId, "plan");
  assert.equal(next.actionLabel, "Open plan");
  assert.equal(next.a2ui.schema_version, "a2ui.v1");
  assert.equal(next.a2ui.kind, "wedding_next_step");
  const action = ((next.a2ui.nodes as Array<Record<string, unknown>>)[2]?.props as Record<string, unknown>).actions as Array<Record<string, unknown>>;
  assert.equal(action[0]?.target_menu, "plan");
});

test("wedding next step does not treat ordinary dated tasks as the wedding date", () => {
  const next = buildWeddingNextStepState(state({
    ganttTimeline: {
      rows: [{ id: "legal:noim", title: "NOIM lodgement window", endLabel: "2027-04-18", statusLabel: "planned" }],
      undatedItems: [],
    } as WeddingResponseWorkspaceViewState["ganttTimeline"],
  }));

  assert.equal(next.priority, "wedding_date");
  assert.equal(next.menuId, "plan");
});

test("wedding next step accepts an exact saved wedding date from context", () => {
  const next = buildWeddingNextStepState(state({
    ganttTimeline: {
      rows: [{ id: "legal:noim", title: "NOIM lodgement window", endLabel: "2027-04-18", statusLabel: "planned" }],
      undatedItems: [],
    } as WeddingResponseWorkspaceViewState["ganttTimeline"],
    contextCards: [{
      answeredLabels: ["Date/season: 2027-09-18"],
    }] as WeddingResponseWorkspaceViewState["contextCards"],
  }));

  assert.equal(next.priority, "budget");
  assert.equal(next.menuId, "budget");
});

test("wedding next step moves to budget after a date exists", () => {
  const next = buildWeddingNextStepState(state({
    ganttTimeline: {
      rows: [{ id: "wedding-day", title: "Wedding day", endLabel: "2027-09-18", statusLabel: "planned" }],
      undatedItems: [],
    } as WeddingResponseWorkspaceViewState["ganttTimeline"],
  }));

  assert.equal(next.priority, "budget");
  assert.equal(next.menuId, "budget");
});

test("wedding next step asks for guests after date and budget exist", () => {
  const next = buildWeddingNextStepState(state({
    ganttTimeline: {
      rows: [{ id: "wedding-day", title: "Wedding day", endLabel: "2027-09-18", statusLabel: "planned" }],
      undatedItems: [],
    } as WeddingResponseWorkspaceViewState["ganttTimeline"],
    budgetTracking: {
      budgetTargetAmount: 30_000,
      remainingAmount: 12_000,
    } as WeddingResponseWorkspaceViewState["budgetTracking"],
  }));

  assert.equal(next.priority, "guests");
  assert.equal(next.menuId, "people");
  assert.equal(next.actionLabel, "Open people");
});

test("wedding next step surfaces helpers when open tasks have no owner", () => {
  const next = buildWeddingNextStepState(state({
    ganttTimeline: {
      rows: [{ id: "wedding-day", title: "Wedding day", endLabel: "2027-09-18", statusLabel: "planned" }],
      undatedItems: [],
    } as WeddingResponseWorkspaceViewState["ganttTimeline"],
    budgetTracking: {
      budgetTargetAmount: 30_000,
      remainingAmount: 12_000,
    } as WeddingResponseWorkspaceViewState["budgetTracking"],
    guestTracking: {
      guestRowCount: 20,
      attendingCount: 20,
      declinedCount: 0,
      pendingCount: 0,
    } as WeddingResponseWorkspaceViewState["guestTracking"],
    seatingPlan: {
      assignedSeatCount: 20,
      unassignedAttendingCount: 0,
    } as WeddingResponseWorkspaceViewState["seatingPlan"],
    planningTaskItems: [{
      id: "task:rings",
      title: "Confirm rings",
      kind: "vendor",
      assignee: null,
    }],
  }));

  assert.equal(next.priority, "helpers");
  assert.equal(next.menuId, "helpers");
});

test("wedding next step surfaces vendor follow-ups once basics exist", () => {
  const next = buildWeddingNextStepState(state({
    ganttTimeline: {
      rows: [{ id: "wedding-day", title: "Wedding day", endLabel: "2027-09-18", statusLabel: "planned" }],
      undatedItems: [],
    } as WeddingResponseWorkspaceViewState["ganttTimeline"],
    budgetTracking: {
      budgetTargetAmount: 30_000,
      remainingAmount: 12_000,
    } as WeddingResponseWorkspaceViewState["budgetTracking"],
    guestTracking: {
      guestRowCount: 20,
      attendingCount: 18,
      declinedCount: 0,
      pendingCount: 2,
    } as WeddingResponseWorkspaceViewState["guestTracking"],
    vendorContactCards: [{
      id: "vendor:photo",
      vendorId: "photo",
      vendorName: "Northlight Photo",
      categoryLabel: "Photography",
      statusLabel: "Follow-up due",
      stage: "follow_up_due",
      tone: "due",
      detailLabel: "A follow-up is due.",
      nextActionLabel: "Review",
      primaryActionLabel: "Review and approve follow-up",
      actionMode: "follow_up",
      lastContactLabel: "2026-09-20",
      followUpDueLabel: "2026-09-25",
      replyLabel: null,
      metadataLabels: [],
    }],
  }));

  assert.equal(next.priority, "vendor_follow_up");
  assert.equal(next.menuId, "plan");
  assert.equal(next.actionLabel, "Open plan");
  assert.match(next.secondaryLabels[0] ?? "", /1 vendor/);
});

test("wedding next step opens people for the first seating draft", () => {
  const next = buildWeddingNextStepState(state({
    ganttTimeline: {
      rows: [{ id: "wedding-day", title: "Wedding day", endLabel: "2027-09-18", statusLabel: "planned" }],
      undatedItems: [],
    } as WeddingResponseWorkspaceViewState["ganttTimeline"],
    budgetTracking: {
      budgetTargetAmount: 30_000,
      remainingAmount: 12_000,
    } as WeddingResponseWorkspaceViewState["budgetTracking"],
    guestTracking: {
      guestRowCount: 20,
      attendingCount: 18,
      declinedCount: 0,
      pendingCount: 2,
    } as WeddingResponseWorkspaceViewState["guestTracking"],
    seatingPlan: {
      assignedSeatCount: 0,
      unassignedAttendingCount: 18,
    } as WeddingResponseWorkspaceViewState["seatingPlan"],
  }));

  assert.equal(next.priority, "seating");
  assert.equal(next.menuId, "people");
  assert.equal(next.actionLabel, "Open people");
});

test("wedding next step surfaces unsaved inspiration originals before on-track", () => {
  const next = buildWeddingNextStepState(state({
    ganttTimeline: {
      rows: [{ id: "wedding-day", title: "Wedding day", endLabel: "2027-09-18", statusLabel: "planned" }],
      undatedItems: [],
    } as WeddingResponseWorkspaceViewState["ganttTimeline"],
    budgetTracking: {
      budgetTargetAmount: 30_000,
      remainingAmount: 12_000,
    } as WeddingResponseWorkspaceViewState["budgetTracking"],
    guestTracking: {
      guestRowCount: 20,
      attendingCount: 18,
      declinedCount: 2,
      pendingCount: 0,
    } as WeddingResponseWorkspaceViewState["guestTracking"],
    seatingPlan: {
      assignedSeatCount: 18,
      unassignedAttendingCount: 0,
    } as WeddingResponseWorkspaceViewState["seatingPlan"],
    inspiration: {
      items: [],
      tagCounts: [],
      insight: null,
      originalFileCount: 2,
      savedOriginalFileCount: 1,
      unsavedOriginalFileCount: 1,
      originalFileStatusLabel: "1 original file still needs to be saved so you can reopen it later.",
      emptyLabel: "No inspiration saved yet.",
    } as WeddingResponseWorkspaceViewState["inspiration"],
  }));

  assert.equal(next.priority, "inspiration_storage");
  assert.equal(next.menuId, "inspiration");
  assert.equal(next.actionLabel, "Open inspiration");
});

test("wedding next step opens plan when the wedding is on track", () => {
  const next = buildWeddingNextStepState(state({
    ganttTimeline: {
      rows: [{ id: "wedding-day", title: "Wedding day", endLabel: "2027-09-18", statusLabel: "planned" }],
      undatedItems: [],
    } as WeddingResponseWorkspaceViewState["ganttTimeline"],
    budgetTracking: {
      budgetTargetAmount: 30_000,
      remainingAmount: 12_000,
    } as WeddingResponseWorkspaceViewState["budgetTracking"],
    guestTracking: {
      guestRowCount: 20,
      attendingCount: 18,
      declinedCount: 2,
      pendingCount: 0,
    } as WeddingResponseWorkspaceViewState["guestTracking"],
    seatingPlan: {
      assignedSeatCount: 18,
      unassignedAttendingCount: 0,
    } as WeddingResponseWorkspaceViewState["seatingPlan"],
  }));

  assert.equal(next.priority, "on_track");
  assert.equal(next.menuId, "plan");
  assert.equal(next.actionLabel, "Open plan");
});
