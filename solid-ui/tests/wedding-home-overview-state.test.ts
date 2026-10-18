import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingHomeStatusState,
  buildWeddingHomeOverviewActionTiles,
  buildWeddingHomePlanningProgress,
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
    planningTaskItems: [],
    resilience: {
      cards: [],
      hasUrgentItem: false,
    },
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

  assert.equal(guest?.valueLabel, "—");
  assert.equal(guest?.tone, "needs_input");
  assert.equal(guest?.toneLabel, "Action needed");
  assert.equal(guest?.menuId, "guests");
  assert.equal(guest?.actionLabel, "Add guests");
  assert.equal(firstActionTarget(guest!), "guests");
  assert.equal(guest?.a2ui.tone, "needs_input");
  assert.equal(guest?.a2ui.tone_label, "Action needed");
  assert.equal(guest?.a2ui.support_label, "Open guests");
});

test("home overview tiles surface captured intake guest count and budget comfort", () => {
  const tiles = buildWeddingHomeOverviewActionTiles(state({
    contextCards: [{
      planningContext: {
        guestCount: 80,
        budgetComfort: "Keep the budget lean",
      },
      answeredLabels: ["Guest count: 80", "Budget comfort: Keep the budget lean"],
    }] as WeddingResponseWorkspaceViewState["contextCards"],
  }));
  const budget = tiles.find((tile) => tile.id === "budget");
  const guests = tiles.find((tile) => tile.id === "guests");

  assert.equal(budget?.valueLabel, "Budget noted");
  assert.equal(budget?.detailLabel, "Intake: Keep the budget lean");
  assert.equal(budget?.supportLabel, "Open budget to set a numeric target.");
  assert.equal(budget?.toneLabel, "Needs target");
  assert.equal(guests?.valueLabel, "80");
  assert.equal(guests?.detailLabel, "Guest count captured from intake; make the guest list next.");
  assert.equal(guests?.tone, "attention");
  assert.equal(guests?.toneLabel, "In progress");
});

test("home status summarizes the whole wedding and opens the most useful next area", () => {
  const status = buildWeddingHomeStatusState(state());
  const action = status.a2ui.primary_action as Record<string, unknown>;

  assert.equal(status.tone, "attention");
  assert.equal(status.title, "Your wedding plan has a clear next step");
  assert.equal(status.menuId, "timeline");
  assert.equal(status.actionLabel, "Add wedding date");
  assert.ok(status.detail.includes("Budget: —"));
  assert.ok(status.metrics.some((metric) => metric.id === "date" && metric.value === "Add date"));
  assert.equal(action.target_menu, "timeline");
});

test("home status shows captured target season while exact date remains open", () => {
  const status = buildWeddingHomeStatusState(state({
    contextCards: [{
      answeredLabels: ["Date/season: October 2027"],
    }] as WeddingResponseWorkspaceViewState["contextCards"],
  }));
  const dateMetric = status.metrics.find((metric) => metric.id === "date");

  assert.equal(dateMetric?.value, "Confirm date");
  assert.equal(dateMetric?.tone, "attention");
  assert.equal(status.menuId, "timeline");
  assert.equal(status.actionLabel, "Pick exact date");
  assert.match(status.detail, /Date: Confirm date/);
});

test("home status surfaces captured location from onboarding context", () => {
  const status = buildWeddingHomeStatusState(state({
    contextCards: [{
      planningContext: {
        location: "Sydney NSW",
        dateOrSeason: "October 2027",
      },
      answeredLabels: [],
    }] as WeddingResponseWorkspaceViewState["contextCards"],
  }));
  const locationMetric = status.metrics.find((metric) => metric.id === "location");
  const a2uiMetric = (status.a2ui.metrics as Array<Record<string, unknown>>)
    .find((metric) => metric.id === "location");
  const action = a2uiMetric?.action as Record<string, unknown> | undefined;

  assert.equal(locationMetric?.value, "Sydney NSW");
  assert.equal(locationMetric?.tone, "good");
  assert.equal(locationMetric?.menuId, "plan");
  assert.match(status.detail, /Location: Sydney NSW/);
  assert.equal(action?.target_menu, "plan");
});

test("home status escalates urgent vendor and resilience work", () => {
  const status = buildWeddingHomeStatusState(state({
    budgetTracking: {
      budgetTargetAmount: 60_000,
      totalKnownAmount: 45_000,
      remainingAmount: 15_000,
    } as WeddingResponseWorkspaceViewState["budgetTracking"],
    vendorContactCards: [
      { tone: "urgent" },
    ] as WeddingResponseWorkspaceViewState["vendorContactCards"],
    resilience: {
      cards: [{ id: "change" }],
      hasUrgentItem: true,
    } as WeddingResponseWorkspaceViewState["resilience"],
  }));

  assert.equal(status.tone, "risk");
  assert.match(status.title, /needs attention/i);
  assert.equal(status.menuId, "home");
  assert.equal(status.actionLabel, "Open vendor follow-ups");
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
  assert.equal(budget?.toneLabel, "In progress");
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

test("home overview seating tile sends a locked plan to the prerequisite guest list", () => {
  const tiles = buildWeddingHomeOverviewActionTiles(state());
  const seating = tiles.find((tile) => tile.id === "seating");

  assert.equal(seating?.valueLabel, "—");
  assert.equal(seating?.tone, "needs_input");
  assert.equal(seating?.toneLabel, "Locked");
  assert.equal(seating?.menuId, "guests");
  assert.equal(seating?.actionLabel, "Add guests to unlock");
  assert.equal(seating?.supportLabel, "Unlock by adding guests");
  assert.match(seating?.detailLabel ?? "", /guest list/i);
  assert.equal(firstActionTarget(seating!), "guests");
});

test("home overview vendor tile opens wedding vendor tracking before outreach exists", () => {
  const tiles = buildWeddingHomeOverviewActionTiles(state());
  const vendors = tiles.find((tile) => tile.id === "vendors");

  assert.equal(vendors?.valueLabel, "0");
  assert.equal(vendors?.tone, "needs_input");
  assert.equal(vendors?.toneLabel, "Action needed");
  assert.equal(vendors?.menuId, "home");
  assert.equal(vendors?.actionLabel, "Track vendors");
  assert.match(vendors?.detailLabel ?? "", /saved vendors and replies/i);
  assert.equal(firstActionTarget(vendors!), "home");
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
  assert.equal(vendors?.toneLabel, "Action needed");
  assert.equal(vendors?.detailLabel, "1 due - 1 waiting");
  assert.equal(vendors?.supportLabel, "1 closed");
  assert.equal(vendors?.actionLabel, "Open vendor follow-ups");
  assert.equal(firstActionTarget(vendors!), "home");
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

  assert.equal(guest?.valueLabel, "50");
  assert.equal(guest?.detailLabel, "40 replied - 10 awaiting");
  assert.equal(guest?.supportLabel, "32 attending");
  assert.equal(guest?.tone, "attention");
  assert.equal(guest?.toneLabel, "In progress");
  assert.equal(seating?.valueLabel, "24");
  assert.equal(seating?.tone, "attention");
  assert.equal(seating?.toneLabel, "In progress");
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

test("home planning progress counts completed planner tasks rather than elapsed time", () => {
  const progress = buildWeddingHomePlanningProgress(state({
    planningTaskItems: [
      { id: "one", status: "completed" },
      { id: "two", statusLabel: "Done" },
      { id: "three", status: "open" },
      { id: "four", statusLabel: "Planned" },
    ] as WeddingResponseWorkspaceViewState["planningTaskItems"],
  }));

  assert.deepEqual(progress, { completedCount: 2, totalCount: 4, percentage: 50 });
  assert.deepEqual(buildWeddingHomePlanningProgress(state()), { completedCount: 0, totalCount: 0, percentage: 0 });
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
