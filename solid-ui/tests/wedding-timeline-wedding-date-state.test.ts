import assert from "node:assert/strict";
import test from "node:test";

import { weddingTimelineWeddingDateLabel } from "@/lib/weddingTimelineWeddingDateState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";

function state(overrides: Partial<WeddingResponseWorkspaceViewState> = {}): WeddingResponseWorkspaceViewState {
  return {
    ganttTimeline: { rows: [], undatedItems: [] },
    contextCards: [],
    ...overrides,
  } as unknown as WeddingResponseWorkspaceViewState;
}

test("weddingTimelineWeddingDateLabel prefers an explicit wedding-day timeline row", () => {
  const result = weddingTimelineWeddingDateLabel(state({
    ganttTimeline: {
      rows: [
        { id: "vendor-payment", title: "Final venue payment", endLabel: "2027-10-01" },
        { id: "wedding-day", title: "Wedding day", endLabel: "2027-09-18" },
      ],
      undatedItems: [],
    } as WeddingResponseWorkspaceViewState["ganttTimeline"],
    contextCards: [{ answeredLabels: ["Date/season: 2027-09-20"] }] as WeddingResponseWorkspaceViewState["contextCards"],
  }));

  assert.equal(result, "2027-09-18");
});

test("weddingTimelineWeddingDateLabel falls back to an exact saved context date", () => {
  const result = weddingTimelineWeddingDateLabel(state({
    ganttTimeline: {
      rows: [{ id: "legal:noim", title: "NOIM lodgement", endLabel: "2027-04-18" }],
      undatedItems: [],
    } as WeddingResponseWorkspaceViewState["ganttTimeline"],
    contextCards: [{ answeredLabels: ["Date/season: 2027-09-18"] }] as WeddingResponseWorkspaceViewState["contextCards"],
  }));

  assert.equal(result, "2027-09-18");
});

test("weddingTimelineWeddingDateLabel ignores seasons and non-wedding timeline dates", () => {
  const result = weddingTimelineWeddingDateLabel(state({
    ganttTimeline: {
      rows: [{ id: "final-count", title: "Final guest count", endLabel: "2027-08-01" }],
      undatedItems: [],
    } as WeddingResponseWorkspaceViewState["ganttTimeline"],
    contextCards: [{ answeredLabels: ["Date/season: Spring 2027"] }] as WeddingResponseWorkspaceViewState["contextCards"],
  }));

  assert.equal(result, null);
});
