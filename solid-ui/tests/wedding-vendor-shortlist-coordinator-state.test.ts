import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingVendorShortlistCoordinatorState } from "@/lib/weddingVendorShortlistCoordinatorState";

const base = { weddingPlanId: "plan:1", location: "Sydney", unbookedCategories: ["Venue", "Florist"], onboardingPriorities: ["Venue"] };

test("coordinator gates incomplete intake and ambiguous category choices", () => {
  assert.equal(buildWeddingVendorShortlistCoordinatorState({ ...base, location: "" }).status, "not_ready");
  assert.equal(buildWeddingVendorShortlistCoordinatorState({ ...base, onboardingPriorities: ["Venue", "Florist"] }).status, "blocked");
});

test("coordinator is idempotent for running and completed fingerprints", () => {
  const ready = buildWeddingVendorShortlistCoordinatorState(base);
  assert.equal(ready.status, "ready");
  assert.equal(buildWeddingVendorShortlistCoordinatorState({ ...base, runningFingerprint: ready.fingerprint }).status, "running");
  assert.equal(buildWeddingVendorShortlistCoordinatorState({ ...base, completedFingerprint: ready.fingerprint }).status, "complete");
});

test("coordinator creates a successor run after material changes and honours explicit overrides", () => {
  const venue = buildWeddingVendorShortlistCoordinatorState(base);
  const florist = buildWeddingVendorShortlistCoordinatorState({ ...base, explicitCategory: "Florist", activeFingerprint: venue.fingerprint });
  assert.equal(florist.category, "Florist");
  assert.equal(florist.status, "stale_after_material_change");
  assert.equal(florist.action, "run_directory_first");
});
