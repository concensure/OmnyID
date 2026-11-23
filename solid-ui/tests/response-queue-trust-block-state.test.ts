import test from "node:test";
import assert from "node:assert/strict";

import { responseQueueTrustBlockState } from "../src/lib/responseQueueTrustBlockState.ts";

test("responseQueueTrustBlockState groups response queue trust cues into shared trust blocks", () => {
  const state = responseQueueTrustBlockState({
    sourceSummaryText: " Based on 2 sources. ",
    consequencePreviewText: " Creates a reversible draft. ",
    provenanceCueText: " Grounded in the source thread. ",
    autonomySummaryText: " Human approval required. ",
  });

  assert.equal(state.showSharedTrustBlocks, true);
  assert.equal(state.sourceSummaryText, "Based on 2 sources.");
  assert.equal(state.consequencePreviewText, "Creates a reversible draft.");
  assert.equal(state.provenanceCueText, "Grounded in the source thread.");
  assert.equal(state.autonomySummaryText, "Human approval required.");
});

test("responseQueueTrustBlockState preserves preview boundary summaries for simulator previews", () => {
  const state = responseQueueTrustBlockState({
    previewBoundarySummaryText: "Preview only until approval.",
  });

  assert.equal(state.showSharedTrustBlocks, true);
  assert.equal(state.previewBoundarySummaryText, "Preview only until approval.");
  assert.equal(state.sourceSummaryText, null);
});

test("responseQueueTrustBlockState stays hidden when no trust cues are available", () => {
  const state = responseQueueTrustBlockState({});

  assert.equal(state.showSharedTrustBlocks, false);
  assert.equal(state.sourceSummaryText, null);
  assert.equal(state.previewBoundarySummaryText, null);
});
