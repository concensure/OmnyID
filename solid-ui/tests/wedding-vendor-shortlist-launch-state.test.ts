import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingVendorShortlistCoordinatorState } from "@/lib/weddingVendorShortlistCoordinatorState";

test("a stored completed fingerprint suppresses a reload duplicate while a changed category becomes a successor", () => {
  const base = { weddingPlanId: "plan-1", location: "Sydney", onboardingPriorities: ["Venue"], unbookedCategories: ["Venue", "Florist"] };
  const venue = buildWeddingVendorShortlistCoordinatorState(base);
  assert.equal(buildWeddingVendorShortlistCoordinatorState({ ...base, completedFingerprint: venue.fingerprint }).status, "complete");
  const florist = buildWeddingVendorShortlistCoordinatorState({ ...base, explicitCategory: "Florist", completedFingerprint: venue.fingerprint });
  assert.equal(florist.status, "ready");
  assert.equal(florist.action, "run_directory_first");
  assert.equal(florist.category, "Florist");
});
