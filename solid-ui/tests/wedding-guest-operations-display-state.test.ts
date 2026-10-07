import assert from "node:assert/strict";
import test from "node:test";

import { weddingGuestOperationsDisplayCounts } from "@/lib/weddingGuestOperationsDisplayState";
import type { WeddingGuestTrackingState } from "@/lib/weddingGuestTrackingState";

const baseState: WeddingGuestTrackingState = {
  guestFileCount: 0,
  guestRowCount: 3,
  guestRows: [{
    id: "guest:alex",
    displayName: "Alex Lee",
    householdLabel: "Lee",
    rsvpStatus: "Attending",
    contactLabel: null,
    mealPreference: null,
    dietaryNote: null,
    accessibilityNote: null,
    sourceLabel: "Saved guest records",
  }],
  attendingCount: 1,
  declinedCount: 1,
  pendingCount: 1,
  householdCount: 3,
  dietaryCount: 1,
  accessibilityCount: 1,
  missingContactCount: 0,
  missingMealCount: 0,
  finalCountOptions: [],
  followUpTaskCandidates: [],
  boundaryRuleLabels: [],
  invitationScopeLabels: [],
  summaryLabel: "base",
  warningLabels: [],
  sourceLabels: [],
};

test("wedding guest display counts include a fresh local save until the projection reloads", () => {
  assert.deepEqual(weddingGuestOperationsDisplayCounts(baseState, [{ name: "Blair Kim", group: "Friends", rsvp: "Pending" }]), {
    guestRowCount: 4,
    attendingCount: 1,
    pendingCount: 2,
    declinedCount: 1,
    needsCount: 2,
  });
});

test("wedding guest display counts do not double-count a persisted draft", () => {
  assert.deepEqual(weddingGuestOperationsDisplayCounts(baseState, [{ name: " alex lee ", group: "Lee", rsvp: "Attending" }]), {
    guestRowCount: 3,
    attendingCount: 1,
    pendingCount: 1,
    declinedCount: 1,
    needsCount: 2,
  });
});
