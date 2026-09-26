import assert from "node:assert/strict";
import test from "node:test";

import {
  calendarActionLabel,
  currencyLabel,
  weddingBudgetSidebarAction,
  weddingDayCountdownDetail,
  weddingDayCountdownLabel,
  weddingTaskSidebarAction,
  weddingTimelineSidebarAction,
} from "../src/lib/weddingWorkspaceSidebarActionState.ts";
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
      totalKnownAmount: 0,
    },
    ...overrides,
  } as unknown as WeddingResponseWorkspaceViewState;
}

function withNow<T>(isoDate: string, run: () => T): T {
  const originalNow = Date.now;
  Date.now = () => new Date(isoDate).getTime();
  try {
    return run();
  } finally {
    Date.now = originalNow;
  }
}

test("currencyLabel keeps empty and dollar labels user-facing", () => {
  assert.equal(currencyLabel(null), "Set budget");
  assert.equal(currencyLabel(Number.NaN), "Set budget");
  assert.equal(currencyLabel(12345), "$12,345");
});

test("wedding day countdown uses the wedding-day timeline row", () => {
  const workspace = state({
    ganttTimeline: {
      rows: [
        { id: "venue", title: "Venue hold", startLabel: "2027-08-01", endLabel: "2027-08-01" },
        { id: "wedding", title: "Wedding day", startLabel: "2027-09-18", endLabel: "2027-09-18" },
      ],
      undatedItems: [],
    } as WeddingResponseWorkspaceViewState["ganttTimeline"],
  });

  withNow("2027-09-08T09:00:00.000Z", () => {
    assert.equal(weddingDayCountdownLabel(workspace), "10");
    assert.equal(weddingDayCountdownDetail(workspace), "Wedding day: 2027-09-18");
  });
});

test("wedding day countdown ignores non-wedding timeline dates", () => {
  const workspace = state({
    ganttTimeline: {
      rows: [
        { id: "legal:noim", title: "NOIM lodgement window", startLabel: "2027-04-01", endLabel: "2027-04-18" },
        { id: "vendor-final-payment", title: "Final venue payment", startLabel: "2027-10-01", endLabel: "2027-10-01" },
      ],
      undatedItems: [],
    } as WeddingResponseWorkspaceViewState["ganttTimeline"],
  });

  withNow("2027-09-08T09:00:00.000Z", () => {
    assert.equal(weddingDayCountdownLabel(workspace), "Add date");
    assert.equal(weddingDayCountdownDetail(workspace), "Add the wedding date to start the countdown.");
  });
});

test("wedding day countdown can use an exact saved context date", () => {
  const workspace = state({
    ganttTimeline: {
      rows: [
        { id: "legal:noim", title: "NOIM lodgement window", startLabel: "2027-04-01", endLabel: "2027-04-18" },
      ],
      undatedItems: [],
    } as WeddingResponseWorkspaceViewState["ganttTimeline"],
    contextCards: [{
      answeredLabels: ["Date/season: 2027-09-18"],
    }] as WeddingResponseWorkspaceViewState["contextCards"],
  });

  withNow("2027-09-08T09:00:00.000Z", () => {
    assert.equal(weddingDayCountdownLabel(workspace), "10");
    assert.equal(weddingDayCountdownDetail(workspace), "Wedding day: 2027-09-18");
  });
});

test("calendarActionLabel and timeline sidebar actions handle empty and selected timelines", () => {
  const empty = state();
  assert.equal(calendarActionLabel(empty), "Add wedding date");
  const emptyCalendarAction = weddingTimelineSidebarAction("open_calendar", empty);
  assert.equal(emptyCalendarAction.enabled, false);
  assert.match(emptyCalendarAction.reason ?? "", /Add dated wedding tasks/i);

  const workspace = state({
    ganttTimeline: {
      rows: [
        { id: "final-count", title: "Confirm final guest count", startLabel: "2027-08-01", endLabel: "2027-08-01" },
      ],
      undatedItems: [{ id: "done-noim", title: "NOIM form", statusLabel: "Done" }],
    } as WeddingResponseWorkspaceViewState["ganttTimeline"],
  });
  const selectedAction = weddingTimelineSidebarAction("open_tasks", workspace, "final-count");
  const metadata = selectedAction.metadata?.wedding_timeline as Record<string, unknown>;

  assert.equal(calendarActionLabel(workspace), "Open wedding calendar");
  assert.equal(selectedAction.kind, "open_tasks");
  assert.equal(selectedAction.enabled, true);
  assert.deepEqual(selectedAction.contextLabels, ["Confirm final guest count", "2027-08-01", "2027-08-01"]);
  assert.equal(metadata.selected_row_id, "final-count");
  assert.equal(metadata.dated_count, 1);
  assert.equal(metadata.undated_count, 1);
});

test("timeline sidebar actions preserve selected done or no-date item context", () => {
  const workspace = state({
    ganttTimeline: {
      rows: [],
      undatedItems: [{
        id: "done-noim",
        title: "Download the official Notice of Intended Marriage form",
        statusLabel: "accepted",
        linkedArtifactId: "artifact:noim-form",
      }, {
        id: "anytime-celebrant",
        title: "Compare celebrant options",
        statusLabel: "anytime",
      }],
    } as WeddingResponseWorkspaceViewState["ganttTimeline"],
  });

  const doneAction = weddingTimelineSidebarAction("open_tasks", workspace, "done-noim");
  const doneMetadata = doneAction.metadata?.wedding_timeline as Record<string, unknown>;
  const anytimeAction = weddingTimelineSidebarAction("open_tasks", workspace, "anytime-celebrant");
  const anytimeMetadata = anytimeAction.metadata?.wedding_timeline as Record<string, unknown>;

  assert.equal(doneAction.label, "Open completed wedding tasks");
  assert.deepEqual(doneAction.contextLabels, ["Download the official Notice of Intended Marriage form", "Done"]);
  assert.equal(doneMetadata.selected_row_id, "done-noim");
  assert.equal(doneMetadata.selected_title, "Download the official Notice of Intended Marriage form");
  assert.equal(doneMetadata.selected_status, "Done");
  assert.equal(doneMetadata.selected_bucket, "done_or_no_date");
  assert.equal(doneMetadata.linked_artifact_id, "artifact:noim-form");
  assert.equal(anytimeAction.label, "Open wedding tasks");
  assert.equal(anytimeMetadata.selected_status, "Anytime");
  assert.equal(anytimeMetadata.selected_bucket, "no_date");
});

test("wedding budget sidebar action carries budget figures for downstream routing", () => {
  const action = weddingBudgetSidebarAction(state({
    budgetTracking: {
      budgetTargetAmount: 50000,
      remainingAmount: 12500,
      totalKnownAmount: 37500,
    } as WeddingResponseWorkspaceViewState["budgetTracking"],
  }));
  const metadata = action.metadata?.wedding_budget as Record<string, unknown>;

  assert.equal(action.kind, "open_budget");
  assert.equal(action.label, "Open wedding budget");
  assert.deepEqual(action.contextLabels, ["Budget", "$12,500"]);
  assert.equal(metadata.target_amount, 50000);
  assert.equal(metadata.remaining_amount, 12500);
  assert.equal(metadata.known_amount, 37500);
});

test("wedding task sidebar action opens task-specific wedding workspace sections", () => {
  const workspace = state({
    planningTaskItems: [],
  } as Partial<WeddingResponseWorkspaceViewState>);
  const action = weddingTaskSidebarAction({
    id: "wedding_task:inspiration",
    title: "Turn saved inspiration into wedding style decisions",
    kind: "decision",
    metadata: {
      wedding_workspace_menu: "inspiration",
      preferred_action_label: "Open Inspiration",
      a2ui_primary_action: "open_wedding_inspiration",
    },
  }, workspace);

  assert.equal(action.kind, "open_workspace_menu");
  assert.equal(action.label, "Open Inspiration");
  assert.equal(action.metadata?.wedding_workspace_menu, "inspiration");
  assert.equal(action.metadata?.source_task_id, "wedding_task:inspiration");
  assert.equal(action.metadata?.a2ui_primary_action, "open_wedding_inspiration");
});

test("wedding task sidebar action falls back to tasks for ordinary task items", () => {
  const workspace = state();
  const action = weddingTaskSidebarAction({
    id: "wedding_task:ordinary",
    title: "Confirm final guest count",
    kind: "guest_list",
    metadata: {},
  }, workspace);

  assert.equal(action.kind, "open_tasks");
  assert.equal(action.enabled, true);
  assert.equal((action.metadata?.wedding_timeline as Record<string, unknown>).selected_row_id, null);
});
