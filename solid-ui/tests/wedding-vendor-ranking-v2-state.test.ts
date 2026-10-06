import test from "node:test";
import assert from "node:assert/strict";
import { weddingVendorConfidenceV2, weddingVendorPriorShrunkFit, weddingVendorRankingPolicyV2Enabled, weddingVendorStyleUtility } from "../src/lib/weddingVendorRankingV2State.ts";

test("v2 stays off by default and prior shrink prevents sparse keyword echo from scoring 100", () => {
  assert.equal(weddingVendorRankingPolicyV2Enabled(), false);
  assert.equal(weddingVendorRankingPolicyV2Enabled({ WEDDING_VENDOR_RANKING_POLICY_V2: "true" }), true);
  assert.equal(weddingVendorPriorShrunkFit([{ weight: 0.2, value: 1, confidence: 0.1 }, { weight: 0.8, value: null, confidence: 0 }]), 51);
});
test("style synonyms expand deterministically and thin snippets do not become a zero", () => {
  assert.equal(weddingVendorStyleUtility({ preferences: ["harbour"], snippet: "harbour venue" }).value, null);
  const style = weddingVendorStyleUtility({ preferences: ["harbour"], styleTags: ["waterfront"] });
  assert.equal(style.value, 1);
  assert.deepEqual(style.matched.sort(), [...style.matched].sort());
});
test("confidence v2 applies sample and agreement factors separately", () => {
  const state = weddingVendorConfidenceV2({ coverage: 1, authority: 1, recency: 1, sentimentReviewCount: 50, decisiveConflict: true });
  assert.equal(state.confidence, 0.4);
  assert.equal(state.conflictLabel, "Sources disagree");
});
