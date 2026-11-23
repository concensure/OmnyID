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

test("policy-v2 card copy is ledger-driven and never turns an unsupported anchor into a strength", () => {
  const ranking = rankWeddingVendorCandidates({
    sources: [WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE],
    requirements: WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS,
    rankingPolicy: "2",
    now: new Date("2026-10-15T00:00:00Z"),
  });
  const candidate = ranking.verify[0];
  assert.ok(candidate?.reasons);
  const card = vendorChoiceCards([candidate], null, WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS)[0] as Record<string, unknown>;
  const rows = card.anchor_rows as Array<{ component_id: string; status: string }>;
  for (const row of rows.filter((row) => row.status === "met" || row.status === "not_met")) {
    const reason = candidate.reasons.find((item) => item.id === row.component_id);
    assert.ok(reason?.evidence.length, `${row.component_id} must retain evidence`);
  }
  assert.ok(Array.isArray(card.facet_labels));
  assert.deepEqual(card.verify_questions, candidate.reasons.filter((reason) => reason.polarity === "unknown").map((reason) => reason.verifyQuestion).filter((question): question is string => Boolean(question)).slice(0, 3));
});
