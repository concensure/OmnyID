import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingRsvpReconciliationState } from "../src/lib/weddingRsvpReconciliationState.ts";
import type { WeddingGuestTrackingState } from "../src/lib/weddingGuestTrackingState.ts";

function fixture(): WeddingGuestTrackingState {
  const rows = [
    {
      id: "guest:alex", personId: "person:alex", householdId: "household:rivera", displayName: "Alex Rivera", householdLabel: "Rivera", rsvpStatus: "Attending" as const,
      contactLabel: "alex@example.test", mealPreference: null, dietaryNote: "allergy: nuts", accessibilityNote: null, mealRequired: true, sourceLabel: "Guest list",
      eventResponses: [{ invitationId: "invite:alex", eventId: "event:wedding", attendance: "Attending" as const, responseSource: "guest" as const, viewedAt: null, respondedAt: "2027-09-01T00:00:00Z", lockedAt: null, changed: false, revision: 1 }],
    },
    {
      id: "guest:sam", personId: "person:sam", householdId: "household:rivera", displayName: "Sam Rivera", householdLabel: "Rivera", rsvpStatus: "Attending" as const,
      contactLabel: null, mealPreference: "Vegetarian", dietaryNote: null, accessibilityNote: null, mealRequired: true, sourceLabel: "Guest list",
      eventResponses: [{ invitationId: "invite:sam", eventId: "event:wedding", attendance: "Attending" as const, responseSource: "guest" as const, viewedAt: null, respondedAt: "2027-09-02T00:00:00Z", lockedAt: "2027-09-03T00:00:00Z", changed: true, revision: 2 }],
    },
    {
      id: "guest:lee", personId: "person:lee", householdId: "household:lee", displayName: "Lee Chen", householdLabel: "Chen", rsvpStatus: "Not attending" as const,
      contactLabel: null, mealPreference: null, dietaryNote: null, accessibilityNote: null, mealRequired: true, sourceLabel: "Guest list",
      eventResponses: [{ invitationId: "invite:lee", eventId: "event:wedding", attendance: "Not attending" as const, responseSource: "guest" as const, viewedAt: null, respondedAt: "2027-09-02T00:00:00Z", lockedAt: null, changed: false, revision: 1 }],
    },
  ];
  return {
    guestFileCount: 0, guestRowCount: rows.length, guestRows: rows, attendingCount: 2, declinedCount: 1, pendingCount: 0, householdCount: 2,
    dietaryCount: 1, accessibilityCount: 0, missingContactCount: 2, missingMealCount: 1, finalCountOptions: [], followUpTaskCandidates: [], boundaryRuleLabels: [], invitationScopeLabels: [], summaryLabel: "",
    warningLabels: [], sourceLabels: [], rsvpResponseSummary: { guestCount: 3, repliedCount: 3, awaitingCount: 0, completeCount: 2, incompleteCount: 1, changedCount: 1, lockedCount: 1, privateRequirementCount: 1, rows: [], summaryLabel: "" },
  };
}

test("reconciliation keeps seating, catering, budget and commitments explainable", () => {
  const state = buildWeddingRsvpReconciliationState({ guestTracking: fixture(), eventId: "event:wedding", contractedHeadcount: 1, estimatedCostPerGuest: 180, requiredQuestionIds: ["meal_choice", "dietary_requirements"] });
  assert.equal(state.seatingEligibleCount, 2);
  assert.equal(state.cateringHeadcount, 2);
  assert.equal(state.contractualVariance, 1);
  assert.equal(state.estimatedBudgetImpact, 360);
  assert.deepEqual(state.attendingGuestIds, ["guest:alex", "guest:sam"]);
  assert.equal(state.missingDetailCandidates[0]?.kind, "meal");
  assert.ok(state.missingDetailCandidates.some((candidate) => candidate.kind === "dietary" && candidate.guestId === "guest:sam"));
  assert.equal(state.lateChangeExceptions.length, 1);
  assert.match(state.connectedChangeLabels.join(" "), /No vendor commitment was changed|saved vendor commitment remains/i);
  assert.ok(state.sourceReferences.includes("invitation:invite:alex"));
  assert.equal(state.a2ui.schema_version, "a2ui.v1");
  assert.deepEqual((state.a2ui.actions as Array<{ intent: string }>).map((action) => action.intent), [
    "wedding.rsvp.review_incomplete",
    "wedding.rsvp.review_late_change",
    "wedding.rsvp.preview_vendor_brief",
  ]);
});
