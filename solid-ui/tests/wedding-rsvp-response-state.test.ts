import assert from "node:assert/strict";
import test from "node:test";

import { weddingBoundaryLedgerObjectToAfpMessage } from "@/lib/weddingBoundaryLedgerState";
import { buildWeddingGuestBoundaryDraftObjects } from "@/lib/weddingGuestBoundaryDraftState";
import { weddingPersistedBoundaryObjectFromAfpMessage } from "@/lib/weddingPersistedBoundaryObjectState";
import { buildWeddingRsvpResponseSummary } from "@/lib/weddingRsvpResponseState";

const metadata = {
  wedding_plan_id: "wedding_plan:rsvp-test",
  response_workspace_id: "response_workspace:rsvp-test",
};

test("buildWeddingRsvpResponseSummary keeps awaiting incomplete changed and private states explicit", () => {
  const state = buildWeddingRsvpResponseSummary([{
    id: "alex",
    displayName: "Alex",
    attendance: "Attending",
    mealRequired: true,
    mealPreference: "",
    dietaryNote: "Nut allergy",
    eventResponses: [{
      invitationId: "invite:alex:reception",
      eventId: "reception",
      attendance: "Attending",
      responseSource: "guest",
      viewedAt: "2027-01-01T00:00:00Z",
      respondedAt: "2027-01-01T00:01:00Z",
      lockedAt: null,
      changed: false,
      revision: 1,
    }],
  }, {
    id: "blair",
    displayName: "Blair",
    attendance: "Pending",
    sourceLabel: "Imported private planning file",
    eventResponses: [],
  }, {
    id: "casey",
    displayName: "Casey",
    attendance: "Not attending",
    eventResponses: [{
      invitationId: "invite:casey:reception",
      eventId: "reception",
      attendance: "Not attending",
      responseSource: "couple_manual",
      viewedAt: null,
      respondedAt: "2027-01-02T00:00:00Z",
      lockedAt: null,
      changed: true,
      revision: 2,
    }],
  }]);

  assert.equal(state.guestCount, 3);
  assert.equal(state.repliedCount, 2);
  assert.equal(state.awaitingCount, 1);
  assert.equal(state.incompleteCount, 1);
  assert.equal(state.changedCount, 1);
  assert.equal(state.privateRequirementCount, 1);
  assert.equal(state.rows[0]?.statusLabel, "Needs details");
  assert.equal(state.rows[0]?.provenanceLabel, "Submitted by guest");
  assert.deepEqual(state.rows[0]?.missingDetailLabels, ["Meal choice needed"]);
  assert.match(state.rows[0]?.privacyLabel ?? "", /Private to the couple/i);
  assert.equal(state.rows[1]?.statusLabel, "Not sent");
  assert.equal(state.rows[1]?.provenanceLabel, "Imported response");
  assert.equal(state.rows[2]?.statusLabel, "Response changed");
  assert.equal(state.rows[2]?.provenanceLabel, "Entered by couple");
});

test("manual guest draft round-trips response provenance and private logistics through AFP", () => {
  const objects = buildWeddingGuestBoundaryDraftObjects({
    displayName: "Alex Chen",
    householdLabel: "Chen household",
    rsvpStatus: "Attending",
    previousRsvpStatus: "Pending",
    contactLabel: "alex@example.test",
    mealPreference: "Vegetarian",
    dietaryNote: "Coeliac - caterer confirmation required",
    accessibilityNote: "Step-free route",
  }, metadata, "2027-01-10T10:00:00Z");
  const guest = objects.find((object) => object.kind === "wedding_boundary_guest_profile");
  const invitation = objects.find((object) => object.kind === "wedding_boundary_event_invitation");
  assert.ok(guest);
  assert.ok(invitation);
  assert.equal(guest?.visibility, "couple_only");

  const restoredGuest = weddingPersistedBoundaryObjectFromAfpMessage(
    weddingBoundaryLedgerObjectToAfpMessage(guest!, metadata, "2027-01-10T10:00:00Z"),
    metadata as never,
  );
  const restoredInvitation = weddingPersistedBoundaryObjectFromAfpMessage(
    weddingBoundaryLedgerObjectToAfpMessage(invitation!, metadata, "2027-01-10T10:00:00Z"),
    metadata as never,
  );

  assert.equal(restoredGuest?.kind, "wedding_boundary_guest_profile");
  if (restoredGuest?.kind !== "wedding_boundary_guest_profile") return;
  assert.equal(restoredGuest.contactLabel, "alex@example.test");
  assert.equal(restoredGuest.mealPreference, "Vegetarian");
  assert.equal(restoredGuest.dietaryNote, "Coeliac - caterer confirmation required");
  assert.equal(restoredGuest.accessibilityNote, "Step-free route");
  assert.equal(restoredGuest.visibility, "couple_only");

  assert.equal(restoredInvitation?.kind, "wedding_boundary_event_invitation");
  if (restoredInvitation?.kind !== "wedding_boundary_event_invitation") return;
  assert.equal(restoredInvitation.responseSource, "couple_manual");
  assert.equal(restoredInvitation.respondedAt, "2027-01-10T10:00:00Z");
  assert.equal(restoredInvitation.previousInvitationStatus, "invited");
  assert.equal(restoredInvitation.responseRevision, 2);
});
