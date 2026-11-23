import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";

import {
  weddingArtifact,
  weddingResponseWorkspaceMetadata,
} from "./wedding-response-workspace-fixtures.ts";

test("response workspace exposes background automation coverage from planning evidence", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata: weddingResponseWorkspaceMetadata,
    artifacts: [
      weddingArtifact({
        title: "Guest RSVP export",
        kind: "guest_list",
        createdAt: 1,
        bodyText: [
          "| Name | RSVP | Email | Meal | Dietary | Accessibility | Household | Table |",
          "| --- | --- | --- | --- | --- | --- | --- | --- |",
          "| Alex | Confirmed | alex@example.com | Beef | Vegan | Wheelchair access | Family A | 1 |",
          "| Sam | Pending | sam@example.com | | | | Family A | |",
        ].join("\n"),
      }),
      weddingArtifact({
        title: "Selected photographer comparison",
        kind: "vendor_comparison",
        createdAt: 2,
        bodyText: "Selected: Harbour Light Studio. Projected price AUD 5000. Category: Photographer.",
      }),
    ],
    scheduleItems: [{
      id: "schedule:photographer",
      title: "Booked photographer arrival and departure",
      kind: "other",
      startAt: "2028-01-01T09:00:00.000Z",
      endAt: "2028-01-01T22:00:00.000Z",
      notes: "Booked vendor arrival 9am and departure 10pm.",
    }],
  });

  assert.equal(state.backgroundAutomationCoverage.status, "partial");
  assert.equal(
    state.backgroundAutomationCoverage.items.find((item) => item.id === "booked_vendor_timeline_sync")?.status,
    "matched",
  );
  assert.equal(
    state.backgroundAutomationCoverage.items.find((item) => item.id === "gmail_vendor_reply_sync")?.status,
    "blocked",
  );
  assert.ok(
    state.backgroundAutomationCoverage.omnyidDifferentiatorLabels.some((label) => /NOIM|DecisionOS/i.test(label)),
  );
  assert.ok(state.projectionQueue?.queue.items.some((item) =>
    item.id === "task:wedding_background_automation:gmail_vendor_reply_sync"
  ));
  assert.ok(!state.personalOsProjection.rankedItems.some((item) =>
    /Vendor replies from connected Gmail/i.test(item.title)
    || item.evidenceLabels.includes("background automation gap")
  ));
});
