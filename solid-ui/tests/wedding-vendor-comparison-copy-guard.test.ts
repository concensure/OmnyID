import assert from "node:assert/strict";
import test from "node:test";

import { vendorChoiceCards } from "@/lib/weddingVendorComparisonPresentationState";
import { rankWeddingVendorCandidates } from "@/lib/weddingVendorRankingState";
import {
  WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS,
  WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE,
} from "./fixtures/wedding-vendor-personalised-recommendation-baseline.ts";

test("generated comparison copy avoids generic ranking claims and weak anchor checks", () => {
  const ranking = rankWeddingVendorCandidates({
    sources: [WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE],
    requirements: WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS,
    now: new Date("2026-10-15T00:00:00Z"),
  });
  const candidate = ranking.verify[0];
  assert.ok(candidate);
  const cards = vendorChoiceCards([candidate], null, WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS);
  const generated = JSON.stringify(cards);

  assert.doesNotMatch(generated, /available option|assess against|stronger first choice for|fit requires|review manually/i);
  for (const row of cards[0]?.anchor_rows as Array<{ status: string; component_id: string }> ?? []) {
    if (row.status !== "met") continue;
    const component = candidate.components.find((item) => item.id === row.component_id);
    assert.ok(component && component.value >= 0.6, `${row.component_id} must have evidence for a positive anchor`);
  }
});
