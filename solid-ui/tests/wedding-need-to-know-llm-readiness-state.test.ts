import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingNeedToKnowLlmReadinessState } from "@/lib/weddingNeedToKnowLlmReadinessState";

const allSlots = [
  "date_or_season",
  "location",
  "guest_count",
  "budget_comfort",
  "priorities",
  "noim_status",
  "celebrant_path",
];

test("buildWeddingNeedToKnowLlmReadinessState passes complete transcript and chat proof", () => {
  const state = buildWeddingNeedToKnowLlmReadinessState({
    llmExtractorConnected: true,
    transcriptInputsTested: 3,
    chatInputsTested: 4,
    extractedSlots: allSlots,
    reviewLabelsProduced: ["Approximate guest count needs review"],
    deterministicFallbackAvailable: true,
    afpProjectionReady: true,
    preventsOverwriteWithoutReview: true,
    errorCount: 0,
  });

  assert.equal(state.status, "ready");
  assert.equal(state.productionEvidenceReady, true);
  assert.equal(state.blockerLabels.length, 0);
  assert.ok(state.evidenceLabels.some((label) => /7\/7 required slots/i.test(label)));
});

test("buildWeddingNeedToKnowLlmReadinessState keeps deterministic extractor as fallback only", () => {
  const state = buildWeddingNeedToKnowLlmReadinessState({
    llmExtractorConnected: false,
    deterministicFallbackAvailable: true,
    afpProjectionReady: true,
    preventsOverwriteWithoutReview: true,
  });

  assert.equal(state.status, "deterministic_only");
  assert.equal(state.productionEvidenceReady, false);
  assert.match(state.summary, /deterministic extraction/i);
  assert.ok(state.blockerLabels.some((label) => /LLM extractor is not connected/i.test(label)));
});

test("buildWeddingNeedToKnowLlmReadinessState blocks unsafe partial extraction", () => {
  const state = buildWeddingNeedToKnowLlmReadinessState({
    llmExtractorConnected: true,
    transcriptInputsTested: 1,
    chatInputsTested: 2,
    extractedSlots: ["date_or_season", "location"],
    deterministicFallbackAvailable: false,
    afpProjectionReady: false,
    preventsOverwriteWithoutReview: false,
    errorCount: 1,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /at least two transcript-style/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /Required slots not proven/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /without explicit review/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /1 extraction error/i.test(label)));
});
