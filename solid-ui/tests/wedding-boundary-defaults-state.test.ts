import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingBoundaryStarterObjects } from "@/lib/weddingBoundaryDefaultsState";
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
