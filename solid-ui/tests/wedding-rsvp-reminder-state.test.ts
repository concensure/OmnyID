import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingRsvpReminderCandidates, weddingRsvpReminderDraftToAfpSendInput } from "../src/lib/weddingRsvpReminderState";
import type { WeddingGuestTrackingState } from "../src/lib/weddingGuestTrackingState";

function state(): WeddingGuestTrackingState {
  const guestRows: NonNullable<WeddingGuestTrackingState["guestRows"]> = [
    { id: "guest:one", personId: "person:one", householdId: "household:one", displayName: "Alex", householdLabel: "Rivera", rsvpStatus: "Pending", contactLabel: "alex@example.test", mealPreference: null, dietaryNote: null, accessibilityNote: null, mealRequired: false, sourceLabel: "Guest list", eventResponses: [{ invitationId: "invite:one", eventId: "event:wedding", attendance: "Pending", responseSource: null, viewedAt: null, respondedAt: null, lockedAt: null, changed: false, revision: 1 }] },
    { id: "guest:two", personId: "person:two", householdId: "household:two", displayName: "Sam", householdLabel: "Chen", rsvpStatus: "Not attending", contactLabel: "sam@example.test", mealPreference: null, dietaryNote: null, accessibilityNote: null, mealRequired: false, sourceLabel: "Guest list", eventResponses: [{ invitationId: "invite:two", eventId: "event:wedding", attendance: "Not attending", responseSource: "guest", viewedAt: null, respondedAt: "2027-09-01", lockedAt: null, changed: false, revision: 1 }] },
  ];
  return { guestFileCount: 0, guestRowCount: 2, guestRows, attendingCount: 0, declinedCount: 1, pendingCount: 1, householdCount: 2, dietaryCount: 0, accessibilityCount: 0, missingContactCount: 0, missingMealCount: 0, finalCountOptions: [], followUpTaskCandidates: [], boundaryRuleLabels: [], invitationScopeLabels: [], summaryLabel: "", warningLabels: [], sourceLabels: [], rsvpResponseSummary: { guestCount: 2, repliedCount: 1, awaitingCount: 1, completeCount: 1, incompleteCount: 0, changedCount: 0, lockedCount: 0, privateRequirementCount: 0, rows: [{ guestId: "guest:one", displayName: "Alex", attendance: "Pending", operationalState: "invited", statusLabel: "Awaiting reply", provenanceLabel: "Guest list", missingDetailLabels: [], eventCount: 1, hasPrivateRequirements: false, privacyLabel: null }, { guestId: "guest:two", displayName: "Sam", attendance: "Not attending", operationalState: "responded", statusLabel: "Declined", provenanceLabel: "Submitted by guest", missingDetailLabels: [], eventCount: 1, hasPrivateRequirements: false, privacyLabel: null }], summaryLabel: "" } };
}

test("reminder candidates exclude declined households and never send while drafting", () => {
  const candidates = buildWeddingRsvpReminderCandidates({ guestTracking: state(), eventId: "event:wedding", eventLabel: "Wedding day", hostLabel: "Priya and Daniel", responseDeadline: "2027-10-01" });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.householdLabel, "Rivera");
  const afp = weddingRsvpReminderDraftToAfpSendInput(candidates[0]!, { weddingPlanId: "plan:one", responseWorkspaceId: "workspace:one" }, "2027-09-01T00:00:00Z");
  assert.equal((afp.content as Record<string, unknown>).sends_message, false);
  assert.equal((afp.content as Record<string, unknown>).approval_status, "draft");
  assert.equal((afp.metadata as Record<string, unknown>).model_calls, 0);
});

test("quiet hours and prior household receipts suppress reminders", () => {
  const base = { guestTracking: state(), eventId: "event:wedding", eventLabel: "Wedding day", hostLabel: "Priya and Daniel", responseDeadline: "2027-10-01" };
  assert.deepEqual(buildWeddingRsvpReminderCandidates({ ...base, quietHoursActive: true }), []);
  assert.deepEqual(buildWeddingRsvpReminderCandidates({ ...base, priorReminderHouseholdIds: ["household:one"] }), []);
});
