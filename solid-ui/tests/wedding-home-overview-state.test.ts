import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingHomeOverviewActionTiles,
  buildWeddingHomeTimelineOverview,
} from "@/lib/weddingHomeOverviewState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";

function state(overrides: Partial<WeddingResponseWorkspaceViewState> = {}): WeddingResponseWorkspaceViewState {
  return {
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
    budgetTracking: {
      budgetTargetAmount: null,
      totalKnownAmount: 0,
      remainingAmount: null,
    },
    ganttTimeline: {
      rows: [],
      undatedItems: [],
    },
    vendorContactCards: [],
    ...overrides,
  } as unknown as WeddingResponseWorkspaceViewState;
}

function firstActionTarget(tile: ReturnType<typeof buildWeddingHomeOverviewActionTiles>[number]): unknown {
  const nodes = tile.a2ui.nodes as Array<Record<string, unknown>>;
  const props = nodes[0]?.props as Record<string, unknown>;
  const action = props.action as Record<string, unknown>;
  return action.target_menu;
}

test("home overview guest tile is actionable before guests are added", () => {
  const tiles = buildWeddingHomeOverviewActionTiles(state());
  const guest = tiles.find((tile) => tile.id === "guests");

  assert.equal(guest?.valueLabel, "Add guests");
  assert.equal(guest?.tone, "needs_input");
  assert.equal(guest?.toneLabel, "Needs list");
  assert.equal(guest?.menuId, "guests");
  assert.equal(guest?.actionLabel, "Open guests");
  assert.equal(firstActionTarget(guest!), "guests");
  assert.equal(guest?.a2ui.tone, "needs_input");
  assert.equal(guest?.a2ui.tone_label, "Needs list");
  assert.equal(guest?.a2ui.support_label, "Open guests");
});

test("home overview budget tile summarizes paid estimated and forecast amounts", () => {
  const tiles = buildWeddingHomeOverviewActionTiles(state({
    budgetTracking: {
      budgetTargetAmount: 60_000,
      totalKnownAmount: 38_420,
      totalProjectedAmount: 12_000,
      remainingAmount: 21_580,
    } as WeddingResponseWorkspaceViewState["budgetTracking"],
  }));
  const budget = tiles.find((tile) => tile.id === "budget");

  assert.equal(budget?.valueLabel, "$21,580");
  assert.equal(budget?.tone, "ready");
  assert.equal(budget?.toneLabel, "On track");
  assert.equal(budget?.detailLabel, "Paid $0 - Estimated $12,000 - Forecast $60,000");
  assert.equal(budget?.supportLabel, "$21,580 before forecast risk");
  assert.equal(budget?.menuId, "budget");
  assert.equal(firstActionTarget(budget!), "budget");
});

test("home overview budget tile surfaces cash timing and risk when insights exist", () => {
  const tiles = buildWeddingHomeOverviewActionTiles(state({
    budgetTracking: {
      budgetTargetAmount: 60_000,
      totalKnownAmount: 38_420,
      totalProjectedAmount: 12_000,
      remainingAmount: 21_580,
      insights: {
        committedAmount: 38_420,
        estimatedAmount: 12_000,
        paidAmount: 8_000,
        forecastAmount: 54_500,
        atRiskAmount: 3_200,
        monthlyCashNeedsSummaryLabel: "$15,000 dated across 2 months.",
      },
    } as WeddingResponseWorkspaceViewState["budgetTracking"],
  }));
  const budget = tiles.find((tile) => tile.id === "budget");

  assert.equal(budget?.tone, "attention");
  assert.equal(budget?.toneLabel, "Check risk");
  assert.equal(budget?.detailLabel, "Paid $8,000 - Estimated $12,000 - Forecast $54,500");
  assert.equal(budget?.supportLabel, "$15,000 dated across 2 months.");
});

test("home overview budget tile names over-target status clearly", () => {
  const tiles = buildWeddingHomeOverviewActionTiles(state({
    budgetTracking: {
      budgetTargetAmount: 60_000,
      totalKnownAmount: 64_500,
      remainingAmount: -4_500,
    } as WeddingResponseWorkspaceViewState["budgetTracking"],
  }));
  const budget = tiles.find((tile) => tile.id === "budget");

  assert.equal(budget?.valueLabel, "$4,500 over");
  assert.equal(budget?.tone, "risk");
  assert.equal(budget?.toneLabel, "Over target");
  assert.equal(budget?.supportLabel, "$4,500 over target");
  assert.equal(budget?.menuId, "budget");
  assert.equal(firstActionTarget(budget!), "budget");
});

test("home overview seating tile sends empty plans to guests first", () => {
  const tiles = buildWeddingHomeOverviewActionTiles(state());
  const seating = tiles.find((tile) => tile.id === "seating");

  assert.equal(seating?.valueLabel, "Plan seating");
  assert.equal(seating?.tone, "needs_input");
  assert.equal(seating?.toneLabel, "Needs guests");
  assert.equal(seating?.menuId, "guests");
  assert.match(seating?.detailLabel ?? "", /Add attending guests first/i);
  assert.equal(firstActionTarget(seating!), "guests");
});

test("home overview vendor tile opens response queue before outreach exists", () => {
  const tiles = buildWeddingHomeOverviewActionTiles(state());
  const vendors = tiles.find((tile) => tile.id === "vendors");

  assert.equal(vendors?.valueLabel, "Track vendors");
  assert.equal(vendors?.tone, "needs_input");
  assert.equal(vendors?.toneLabel, "Needs vendors");
  assert.equal(vendors?.menuId, "response_queue");
  assert.equal(vendors?.actionLabel, "Open response queue");
  assert.match(vendors?.detailLabel ?? "", /outreach, replies, and follow-ups/i);
  assert.equal(firstActionTarget(vendors!), "response_queue");
});

test("home overview vendor tile surfaces urgent and due follow-ups", () => {
  const tiles = buildWeddingHomeOverviewActionTiles(state({
    vendorContactCards: [
      { tone: "urgent" },
      { tone: "due" },
      { tone: "waiting" },
      { tone: "closed" },
    ] as WeddingResponseWorkspaceViewState["vendorContactCards"],
  }));
  const vendors = tiles.find((tile) => tile.id === "vendors");

  assert.equal(vendors?.valueLabel, "1 urgent");
  assert.equal(vendors?.tone, "risk");
  assert.equal(vendors?.toneLabel, "Urgent");
  assert.equal(vendors?.detailLabel, "1 due - 1 waiting");
  assert.equal(vendors?.supportLabel, "1 closed");
  assert.equal(vendors?.actionLabel, "Open vendor follow-ups");
  assert.equal(firstActionTarget(vendors!), "response_queue");
});

test("home overview tiles reflect populated guests and seating", () => {
  const tiles = buildWeddingHomeOverviewActionTiles(state({
    guestTracking: {
      guestRowCount: 50,
      attendingCount: 32,
      declinedCount: 8,
      pendingCount: 10,
    } as WeddingResponseWorkspaceViewState["guestTracking"],
    seatingPlan: {
      assignedSeatCount: 24,
      unassignedAttendingCount: 8,
    } as WeddingResponseWorkspaceViewState["seatingPlan"],
  }));
  const guest = tiles.find((tile) => tile.id === "guests");
  const seating = tiles.find((tile) => tile.id === "seating");

  assert.equal(guest?.valueLabel, "50 guests");
  assert.equal(guest?.detailLabel, "40 replied - 10 awaiting");
  assert.equal(guest?.supportLabel, "32 attending");
  assert.equal(guest?.tone, "attention");
  assert.equal(guest?.toneLabel, "Replies waiting");
  assert.equal(seating?.valueLabel, "24 seated");
  assert.equal(seating?.tone, "attention");
  assert.equal(seating?.toneLabel, "Seats left");
  assert.equal(seating?.menuId, "seating");
  assert.equal(seating?.supportLabel, "Open seating");
  assert.equal(firstActionTarget(seating!), "seating");
});

test("home timeline overview is actionable when no dated items exist", () => {
  const timeline = buildWeddingHomeTimelineOverview(state());
  const nodes = timeline.a2ui.nodes as Array<Record<string, unknown>>;
  const props = nodes[0]?.props as Record<string, unknown>;
  const action = props.action as Record<string, unknown>;

  assert.equal(timeline.detailLabel, "No upcoming timeline items yet.");
  assert.equal(timeline.menuId, "timeline");
  assert.equal(timeline.actionLabel, "Open timeline");
  assert.equal(action.target_menu, "timeline");
  assert.equal(action.selected_row_id, null);
});

test("home timeline overview skips completed rows and tolerates missing status labels", () => {
  const timeline = buildWeddingHomeTimelineOverview(state({
    ganttTimeline: {
      rows: [
        { id: "done-noim", title: "File NOIM", endLabel: "2027-04-18", statusLabel: "Done" },
        { id: "venue-payment", title: "Pay venue deposit", endLabel: "2027-05-01" },
        { id: "menu", title: "Choose menu", endLabel: "2027-06-01", statusLabel: "Planned" },
      ],
      undatedItems: [],
    } as WeddingResponseWorkspaceViewState["ganttTimeline"],
  }));
  const nodes = timeline.a2ui.nodes as Array<Record<string, unknown>>;
  const props = nodes[0]?.props as Record<string, unknown>;
  const action = props.action as Record<string, unknown>;

  assert.equal(timeline.detailLabel, "Next: Pay venue deposit");
  assert.equal(timeline.actionLabel, "Open timeline item");
  assert.equal(timeline.selectedRowId, "venue-payment");
  assert.equal(action.selected_row_id, "venue-payment");
});

test("home timeline overview also skips rows with machine status fields", () => {
  const timeline = buildWeddingHomeTimelineOverview(state({
    ganttTimeline: {
      rows: [
        { id: "done-status", title: "Finish legal form", endLabel: "2027-04-01", status: "completed" },
        { id: "earliest", title: "Book tasting", endLabel: "2027-04-15", status: "planned" },
        { id: "later", title: "Final seating", endLabel: "2027-08-01", status: "planned" },
      ],
      undatedItems: [],
    } as WeddingResponseWorkspaceViewState["ganttTimeline"],
  }));

  assert.equal(timeline.detailLabel, "Next: Book tasting");
  assert.equal(timeline.selectedRowId, "earliest");
});
