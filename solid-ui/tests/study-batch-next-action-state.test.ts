import assert from "node:assert/strict";
import test from "node:test";

import { buildStudyBatchNextActionState } from "../src/lib/studyBatchNextActionState.ts";

test("buildStudyBatchNextActionState blocks unreadable batches", () => {
  const state = buildStudyBatchNextActionState({
    attachedCount: 2,
    supportedCount: 0,
    unsupportedCount: 2,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    recommendedSetupReady: true,
  });

  assert.equal(state?.tone, "amber");
  assert.equal(state?.primaryActionLabel, "Use conversion-first prompt");
  assert.equal(state?.secondaryActionLabel, "Add supported file");
});

test("buildStudyBatchNextActionState pushes recommended setup when retention is weak", () => {
  const state = buildStudyBatchNextActionState({
    attachedCount: 1,
    supportedCount: 1,
    unsupportedCount: 0,
    knowledgeMode: "standard",
    retentionMode: "keep_file",
    recommendedSetupReady: false,
  });

  assert.equal(state?.primaryActionId, "use_recommended_setup");
  assert.match(state?.detail ?? "", /best default retrieval path/i);
});

test("buildStudyBatchNextActionState promotes comparison when multiple readable sources exist", () => {
  const state = buildStudyBatchNextActionState({
    attachedCount: 2,
    supportedCount: 2,
    unsupportedCount: 0,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    recommendedSetupReady: true,
  });

  assert.equal(state?.tone, "emerald");
  assert.equal(state?.primaryActionLabel, "Run comparison now");
});
