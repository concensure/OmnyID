import assert from "node:assert/strict";
import test from "node:test";

import { rankWeddingVendorCandidates } from "../src/lib/weddingVendorRankingState.ts";
import {
  WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS,
  WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE,
} from "./fixtures/wedding-vendor-personalised-recommendation-baseline.ts";

test("the sparse Bondi baseline preserves the documented v1 ranking output", () => {
  const ranking = rankWeddingVendorCandidates({
    sources: [WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE],
    requirements: WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS,
    now: new Date("2026-10-15T00:00:00Z"),
  });
  const candidate = ranking.verify[0];

  assert.ok(candidate);
  assert.equal(candidate.fit, 38);
  assert.equal(candidate.priorityMatchLabel, "Matches 1/2 of your priorities");
  assert.equal(candidate.situationFitLabel, "Strong on: Location");
  assert.equal(candidate.components.find((component) => component.id === "style")?.value, 0);
  assert.equal(candidate.components.find((component) => component.id === "location")?.value, 1);
});
