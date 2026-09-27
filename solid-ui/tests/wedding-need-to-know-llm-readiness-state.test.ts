import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingNeedToKnowLlmReadinessState } from "@/lib/weddingNeedToKnowLlmReadinessState";
import { WEDDING_PRODUCTION_LABEL_MAX_LENGTH } from "@/lib/weddingProductionLabelState";

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
    proofReferenceLabels: ["need-to-know-llm:oracle-prod-1:2026-09-28"],
    errorCount: 0,
  });

  assert.equal(state.status, "ready");
  assert.equal(state.productionEvidenceReady, true);
  assert.equal(state.blockerLabels.length, 0);
  assert.deepEqual(state.proofReferenceLabels, ["need-to-know-llm:oracle-prod-1:2026-09-28"]);
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
  assert.ok(state.blockerLabels.some((label) => /proof reference/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /1 extraction error/i.test(label)));
});

test("buildWeddingNeedToKnowLlmReadinessState rejects placeholder proof references", () => {
  const state = buildWeddingNeedToKnowLlmReadinessState({
    llmExtractorConnected: true,
    transcriptInputsTested: 3,
    chatInputsTested: 3,
    extractedSlots: allSlots,
    reviewLabelsProduced: ["Approximate date needs review"],
    deterministicFallbackAvailable: true,
    afpProjectionReady: true,
    preventsOverwriteWithoutReview: true,
    proofReferenceLabels: ["need-to-know:fake:test"],
  });

  assert.equal(state.status, "blocked");
  assert.deepEqual(state.proofReferenceLabels, []);
  assert.ok(state.blockerLabels.some((label) => /proof reference/i.test(label)));
});

test("buildWeddingNeedToKnowLlmReadinessState rejects bare test proof references while accepting prod-smoke", () => {
  const baseInput = {
    llmExtractorConnected: true,
    transcriptInputsTested: 3,
    chatInputsTested: 3,
    extractedSlots: allSlots,
    reviewLabelsProduced: ["Approximate date needs review"],
    deterministicFallbackAvailable: true,
    afpProjectionReady: true,
    preventsOverwriteWithoutReview: true,
  };

  const testProof = buildWeddingNeedToKnowLlmReadinessState({
    ...baseInput,
    proofReferenceLabels: ["need-to-know-llm:test:latest"],
  });
  const prodSmokeProof = buildWeddingNeedToKnowLlmReadinessState({
    ...baseInput,
    proofReferenceLabels: ["need-to-know-llm:prod-smoke:2026-09-28"],
  });

  assert.equal(testProof.status, "blocked");
  assert.deepEqual(testProof.proofReferenceLabels, []);
  assert.equal(prodSmokeProof.status, "ready");
  assert.deepEqual(prodSmokeProof.proofReferenceLabels, ["need-to-know-llm:prod-smoke:2026-09-28"]);
});

test("buildWeddingNeedToKnowLlmReadinessState rejects local browser-only proof references", () => {
  const state = buildWeddingNeedToKnowLlmReadinessState({
    llmExtractorConnected: true,
    transcriptInputsTested: 3,
    chatInputsTested: 3,
    extractedSlots: allSlots,
    reviewLabelsProduced: ["Approximate date needs review"],
    deterministicFallbackAvailable: true,
    afpProjectionReady: true,
    preventsOverwriteWithoutReview: true,
    proofReferenceLabels: [
      "need-to-know-llm:local-only",
      "http://localhost:5173/need-proof",
      "data:application/json,{}",
      "need-to-know-llm:oracle-prod-1:2026-09-28",
    ],
  });

  assert.equal(state.status, "ready");
  assert.deepEqual(state.proofReferenceLabels, ["need-to-know-llm:oracle-prod-1:2026-09-28"]);
  assert.ok(state.evidenceLabels.some((label) => /1 durable extraction proof reference/i.test(label)));
});

test("buildWeddingNeedToKnowLlmReadinessState bounds noisy slot and review labels", () => {
  const longSlot = `priority_${"flowers_".repeat(80)}`;
  const state = buildWeddingNeedToKnowLlmReadinessState({
    llmExtractorConnected: true,
    transcriptInputsTested: 3,
    chatInputsTested: 3,
    requiredSlots: ["date_or_season", longSlot, longSlot],
    extractedSlots: ["date_or_season"],
    reviewLabelsProduced: [
      `  Approximate guest count ${"needs review ".repeat(80)}  `,
      `Approximate guest count ${"needs review ".repeat(80)}`,
    ],
    deterministicFallbackAvailable: true,
    afpProjectionReady: true,
    preventsOverwriteWithoutReview: true,
  });

  assert.equal(state.status, "blocked");
  assert.ok(state.evidenceLabels.every((label) => label.length <= WEDDING_PRODUCTION_LABEL_MAX_LENGTH));
  assert.ok(state.blockerLabels.every((label) => label.length <= WEDDING_PRODUCTION_LABEL_MAX_LENGTH));
  assert.ok(state.blockerLabels.some((label) => label.endsWith("...")));
});
