import assert from "node:assert/strict";
import test from "node:test";

import { weddingVendorAnchorRows, weddingVendorVerifyQuestions } from "@/lib/weddingVendorAnchorRowState";
import { rankWeddingVendorCandidates } from "@/lib/weddingVendorRankingState";
import {
  WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS,
  WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE,
} from "./fixtures/wedding-vendor-personalised-recommendation-baseline.ts";

test("sparse preference evidence remains unknown rather than a false negative", () => {
  const ranked = rankWeddingVendorCandidates({
    sources: [WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE],
    requirements: WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS,
    now: new Date("2026-10-15T00:00:00Z"),
  });
  const candidate = ranked.verify[0];
  assert.ok(candidate);

  const rows = weddingVendorAnchorRows(candidate, WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS);
  assert.deepEqual(rows.map((row) => [row.anchor, row.status]), [["Intimacy", "unknown"], ["Bondi, Sydney", "met"]]);
  assert.deepEqual(weddingVendorVerifyQuestions(rows, candidate.unknownHardConstraints), [
    "Could you tell us how this fits intimacy?",
  ]);
});

test("policy-v2 anchor rows and outreach questions come from the evidence ledger", () => {
  const ranked = rankWeddingVendorCandidates({
    sources: [WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_SOURCE],
    requirements: WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS,
    rankingPolicy: "2",
    now: new Date("2026-10-15T00:00:00Z"),
  });
  const candidate = ranked.verify[0];
  assert.ok(candidate);
  const rows = weddingVendorAnchorRows(candidate, WEDDING_VENDOR_PERSONALISED_RECOMMENDATION_BASELINE_REQUIREMENTS);
  assert.equal(rows.find((row) => row.anchor === "Bondi, Sydney")?.status, "met");
  assert.equal(rows.find((row) => row.anchor === "Intimacy")?.status, "unknown");
  assert.deepEqual(weddingVendorVerifyQuestions(rows, []), candidate.reasons?.filter((reason) => reason.polarity === "unknown").map((reason) => reason.verifyQuestion).filter((question): question is string => Boolean(question)).slice(0, 3));
});

test("guest count is couple context while the venue is asked only for space capacity", () => {
  const questions = weddingVendorVerifyQuestions([], ["capacity", "guests"]);
  assert.deepEqual(questions, ["Could you share the seated and standing capacity for each relevant space?"]);
  assert.doesNotMatch(questions.join(" "), /confirm guests/i);
});
