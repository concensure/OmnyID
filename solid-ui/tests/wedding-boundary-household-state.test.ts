import assert from "node:assert/strict";
import test from "node:test";

import {
  weddingBoundaryLedgerObjectToAfpMessage,
  type WeddingBoundaryHousehold,
  type WeddingBoundaryLedgerObject,
} from "../src/lib/weddingBoundaryLedgerState";
import { buildWeddingBoundaryHouseholdRows } from "../src/lib/weddingBoundaryHouseholdState";
import { weddingPersistedBoundaryObjectFromAfpMessage } from "../src/lib/weddingPersistedBoundaryObjectState";

const base = { title: "", visibility: "couple_only" as const, createdAt: "2026-11-01T00:00:00Z" };

test("household projection combines allocation RSVP requests group and representative", () => {
  const objects: WeddingBoundaryLedgerObject[] = [
    { ...base, id: "house:chen", kind: "wedding_boundary_household", householdId: "house:chen", displayName: "Chen household", primaryContactPersonId: "person:maya", memberPersonIds: ["person:maya", "person:lee"], familyGroupId: "family_group:shared", familyGroupLabel: "Shared friends", invitationAllocation: 1, requestDeadline: "2027-09-01" },
    { ...base, id: "guest:maya", kind: "wedding_boundary_guest_profile", personId: "person:maya", displayName: "Maya Chen", householdId: "house:chen" },
    { ...base, id: "guest:lee", kind: "wedding_boundary_guest_profile", personId: "person:lee", displayName: "Lee Chen", householdId: "house:chen" },
    { ...base, id: "invite:maya", kind: "wedding_boundary_event_invitation", invitationId: "invite:maya", eventId: "reception", personId: "person:maya", invitationStatus: "rsvp_yes" },
    { ...base, id: "invite:lee", kind: "wedding_boundary_event_invitation", invitationId: "invite:lee", eventId: "reception", personId: "person:lee", invitationStatus: "invited" },
    { ...base, id: "request:chen", kind: "wedding_boundary_change_request", requestId: "request:chen", requestedBy: "person:maya", targetHouseholdId: "house:chen", changeType: "add_guest", requestStatus: "pending" },
  ];

  const [row] = buildWeddingBoundaryHouseholdRows(objects);
  assert.equal(row?.representativeLabel, "Maya Chen");
  assert.equal(row?.familyGroupLabel, "Shared friends");
  assert.equal(row?.namedInvitationCount, 2);
  assert.equal(row?.remainingAllocation, -1);
  assert.equal(row?.pendingRequestCount, 1);
  assert.match(row?.rsvpLabel ?? "", /1 attending · 1 pending/);
  assert.deepEqual(row?.attentionLabels, ["1 request need review", "1 over allocation", "1 RSVP pending"]);
});

test("households sort review attention before quiet rows", () => {
  const objects: WeddingBoundaryLedgerObject[] = [
    { ...base, id: "house:quiet", kind: "wedding_boundary_household", householdId: "house:quiet", displayName: "Quiet household", invitationAllocation: 2 },
    { ...base, id: "house:review", kind: "wedding_boundary_household", householdId: "house:review", displayName: "Review household", invitationAllocation: 2 },
    { ...base, id: "request:review", kind: "wedding_boundary_change_request", requestId: "request:review", requestedBy: "family", targetHouseholdId: "house:review", changeType: "add_guest", requestStatus: "pending" },
  ];
  assert.deepEqual(buildWeddingBoundaryHouseholdRows(objects).map((row) => row.householdId), ["house:review", "house:quiet"]);
});

test("family group allocation and request deadline round-trip through AFP", () => {
  const household: WeddingBoundaryHousehold = {
    ...base,
    id: "house:rivera",
    kind: "wedding_boundary_household",
    householdId: "house:rivera",
    displayName: "Rivera household",
    familyGroupId: "family_group:partner_one",
    familyGroupLabel: "Partner one's family",
    invitationAllocation: 0,
    requestDeadline: "2027-08-01",
  };
  const metadata = { weddingPlanId: "plan:test", responseWorkspaceId: "workspace:test", templateId: "wedding_planner", supertags: [] };
  const restored = weddingPersistedBoundaryObjectFromAfpMessage(
    weddingBoundaryLedgerObjectToAfpMessage(household, metadata, "2026-11-01T01:00:00Z"),
    metadata,
  );
  assert.equal(restored?.kind, "wedding_boundary_household");
  if (restored?.kind !== "wedding_boundary_household") return;
  assert.equal(restored.familyGroupId, "family_group:partner_one");
  assert.equal(restored.familyGroupLabel, "Partner one's family");
  assert.equal(restored.invitationAllocation, 0);
  assert.equal(restored.requestDeadline, "2027-08-01");
});
