import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingBoundaryStarterObjects, weddingBoundaryStarterGuestsFromArtifacts } from "@/lib/weddingBoundaryDefaultsState";
import type {
  WeddingBoundaryGuestProfile,
  WeddingBoundaryHousehold,
  WeddingBoundaryRoleAssignment,
} from "@/lib/weddingBoundaryLedgerState";

const metadata = {
  weddingPlanId: "wedding_plan:harbour",
  responseWorkspaceId: "response_workspace:harbour",
};

test("buildWeddingBoundaryStarterObjects groups imported guests into a default household", () => {
  const objects = buildWeddingBoundaryStarterObjects({
    metadata,
    guestNames: ["Alex", "Blair", "Alex"],
  });
  const household = objects.find(
    (object): object is WeddingBoundaryHousehold => object.kind === "wedding_boundary_household",
  );
  const guests = objects.filter(
    (object): object is WeddingBoundaryGuestProfile => object.kind === "wedding_boundary_guest_profile",
  );

  assert.equal(household?.displayName, "Imported guest list");
  assert.deepEqual(household?.memberPersonIds, ["person:alex", "person:blair"]);
  assert.equal(household?.primaryContactPersonId, "person:alex");
  assert.equal(guests.length, 2);
  assert.ok(guests.every((guest) => guest.householdId === household?.householdId));
});

test("buildWeddingBoundaryStarterObjects does not turn imported guests into helpers", () => {
  const objects = buildWeddingBoundaryStarterObjects({
    metadata,
    guestNames: ["Alex", "Blair"],
    helperNames: ["Alex", "Coordinator"],
  });
  const roles = objects.filter(
    (object): object is WeddingBoundaryRoleAssignment => object.kind === "wedding_boundary_role_assignment",
  );

  assert.ok(!roles.some((role) => role.personId === "person:alex"));
  assert.ok(roles.some((role) => role.personId === "person:coordinator" && role.role === "helper"));
});

test("reviewed guest-table imports preserve invitation households, groups, allocations and deadlines", () => {
  const guestRows = weddingBoundaryStarterGuestsFromArtifacts([{
    id: "artifact:guest-import",
    kind: "guest_list",
    title: "Reviewed blended family import",
    bodyText: [
      "| Name | Invitation group | Family group | Allocation | Request deadline | Email | Dietary | Residential address |",
      "| --- | --- | --- | --- | --- | --- | --- | --- |",
      "| Alex Rivera | Alex and Mum | Partner one family | 2 | 2027-08-01 | alex@example.test | allergy note | 1 Example Street |",
      "| Morgan Rivera | Alex and Mum | Partner one family | 2 | 2027-08-01 | morgan@example.test | private note | 99 Other Street |",
      "| Taylor Chen | Taylor and Dad | Partner two family | 1 | 2027-07-15 | taylor@example.test |  | 7 Sample Road |",
    ].join("\n"),
  } as never]);
  assert.deepEqual(guestRows.map((row) => row.householdLabel), ["Alex and Mum", "Alex and Mum", "Taylor and Dad"]);
  const objects = buildWeddingBoundaryStarterObjects({ metadata, guestRows });
  const households = objects.filter((object): object is WeddingBoundaryHousehold => object.kind === "wedding_boundary_household");
  const guests = objects.filter((object): object is WeddingBoundaryGuestProfile => object.kind === "wedding_boundary_guest_profile");
  assert.equal(households.length, 2);
  assert.deepEqual(households.map((item) => item.displayName), ["Alex and Mum", "Taylor and Dad"]);
  assert.equal(households[0]?.familyGroupLabel, "Partner one family");
  assert.equal(households[0]?.invitationAllocation, 2);
  assert.equal(households[0]?.requestDeadline, "2027-08-01");
  assert.equal(guests.find((item) => item.displayName === "Morgan Rivera")?.householdId, households[0]?.householdId);
  assert.doesNotMatch(JSON.stringify(objects), /example\.test|allergy note|private note|Example Street|Sample Road/i);
});

test("invalid imported allocation and deadline remain unconfirmed instead of becoming authority", () => {
  const [row] = weddingBoundaryStarterGuestsFromArtifacts([{
    id: "artifact:unsafe-import", kind: "guest_list", title: "Unsafe values",
    bodyText: "| Name | Household | Allocation | Request deadline |\n| --- | --- | --- | --- |\n| Alex | Rivera | -4 | next Friday |",
  } as never]);
  assert.equal(row?.invitationAllocation, null);
  assert.equal(row?.requestDeadline, null);
});
