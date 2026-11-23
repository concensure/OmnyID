import assert from "node:assert/strict";
import test from "node:test";

import { weddingNavigationCalendarTarget } from "../src/lib/weddingNavigationCalendarTargetState.ts";
import type { WeddingNavigationIntent } from "../src/lib/weddingNavigationState.ts";

function intent(overrides: Partial<WeddingNavigationIntent> = {}): WeddingNavigationIntent {
  return {
    view: "calendar",
    surface: "calendar",
    weddingPlanId: "wedding_plan:target",
    responseWorkspaceId: "response_workspace:target",
    sourceResponseId: null,
    artifactId: null,
    sectionId: null,
    notice: "Opening wedding dates in Calendar.",
    metadata: {
      template: "wedding_planning",
      wedding_plan_id: "wedding_plan:target",
      response_workspace_id: "response_workspace:target",
      surface: "calendar",
    },
    ...overrides,
  };
}

test("weddingNavigationCalendarTarget focuses the selected wedding timeline date", () => {
  const target = weddingNavigationCalendarTarget(intent({
    metadata: {
      wedding_timeline: {
        selected_title: "Confirm wet-weather backup",
        selected_start: "2027-08-01",
        selected_end: "2027-08-01",
        linked_calendar_event_id: "calendar:event:wet-weather",
      },
    },
  }));

  assert.deepEqual(target, {
    initialDate: "2027-08-01",
    initialEventId: "calendar:event:wet-weather",
  });
});

test("weddingNavigationCalendarTarget ignores non-calendar intents and invalid dates", () => {
  assert.equal(weddingNavigationCalendarTarget(intent({ view: "tasks", surface: "tasks" })), null);
  assert.equal(weddingNavigationCalendarTarget(intent({
    metadata: {
      wedding_timeline: {
        selected_start: "not-a-date",
      },
    },
  })), null);
});

test("weddingNavigationCalendarTarget can use generic calendar metadata", () => {
  const target = weddingNavigationCalendarTarget(intent({
    metadata: {
      initial_date: "2027-09-18",
      calendar_event_id: "calendar:event:wedding-day",
    },
  }));

  assert.deepEqual(target, {
    initialDate: "2027-09-18",
    initialEventId: "calendar:event:wedding-day",
  });
});
