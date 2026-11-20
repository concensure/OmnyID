import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "../src/lib/api";
import type { WeddingGuestTrackingState } from "../src/lib/weddingGuestTrackingState";
import { buildWeddingRsvpHouseholdLifecycles } from "../src/lib/weddingRsvpLifecycleState";

function tracking(operationalState: "invited" | "incomplete" | "responded"): WeddingGuestTrackingState {
  return {
    guestRows: [{
      id: "guest:one", personId: "person:one", householdId: "household:one", displayName: "Alex", householdLabel: "Rivera household",
      rsvpStatus: operationalState === "responded" ? "Attending" : "Pending", contactLabel: "alex@example.test", mealPreference: null,
      dietaryNote: null, accessibilityNote: null, mealRequired: false, sourceLabel: "Guest list",
      eventResponses: [{ invitationId: "invite:one", eventId: "event:wedding", attendance: operationalState === "responded" ? "Attending" : "Pending", responseSource: operationalState === "responded" ? "guest" : null, viewedAt: null, respondedAt: null, lockedAt: null, changed: false, revision: 1 }],
    }],
    rsvpResponseSummary: { rows: [{ guestId: "guest:one", displayName: "Alex", attendance: "Pending", operationalState, statusLabel: operationalState, provenanceLabel: "Guest list", missingDetailLabels: [], eventCount: 1, hasPrivateRequirements: false, privacyLabel: null }] },
  } as WeddingGuestTrackingState;
}

function capability(kind: string, timestamp: string): AfpMessage {
  return { id: `${kind}:${timestamp}`, thread_id: "rsvp", kind, timestamp, content: { kind, household_id: "household:one", invitation_ids: ["invite:one"] } } as AfpMessage;
}

test("RSVP lifecycle distinguishes created, opened, incomplete and due evidence", () => {
  const result = buildWeddingRsvpHouseholdLifecycles({
    guestTracking: tracking("incomplete"), eventId: "event:wedding", responseDeadline: "2027-03-01", nowIso: "2027-03-02T00:00:00Z",
    afpMessages: [capability("wedding_rsvp_capability_granted", "2027-02-01T00:00:00Z"), capability("wedding_rsvp_capability_opened", "2027-02-02T00:00:00Z")],
    reminderReceipts: [],
  });
  assert.equal(result[0]?.linkState, "opened");
  assert.equal(result[0]?.responseState, "incomplete");
  assert.equal(result[0]?.followUpDue, true);
  assert.match(result[0]?.nextAction ?? "", /missing required/i);
  assert.deepEqual(result[0]?.evidenceLabels, ["Private link opened", "RSVP incomplete", "Follow-up due · deadline 2027-03-01"]);
});

test("provider acceptance suppresses due action while completed response needs no follow-up", () => {
  const accepted = buildWeddingRsvpHouseholdLifecycles({
    guestTracking: tracking("invited"), eventId: "event:wedding", responseDeadline: "2027-03-01", nowIso: "2027-03-02T00:00:00Z",
    afpMessages: [capability("wedding_rsvp_capability_opened", "2027-02-02T00:00:00Z")],
    reminderReceipts: [{ messageId: "receipt:one", threadId: "reminders", draftId: null, householdId: "household:one", deliveryStatus: "provider_accepted", providerMessageId: null, createdAt: "2027-03-02T00:00:00Z" }],
  });
  assert.equal(accepted[0]?.followUpDue, false);
  assert.match(accepted[0]?.evidenceLabels.join(" ") ?? "", /accepted by provider/i);

  const complete = buildWeddingRsvpHouseholdLifecycles({ guestTracking: tracking("responded"), eventId: "event:wedding", responseDeadline: "2027-03-01", nowIso: "2027-03-02T00:00:00Z", afpMessages: [], reminderReceipts: [] });
  assert.equal(complete[0]?.responseState, "complete");
  assert.equal(complete[0]?.followUpDue, false);
  assert.match(complete[0]?.nextAction ?? "", /no follow-up/i);
});
