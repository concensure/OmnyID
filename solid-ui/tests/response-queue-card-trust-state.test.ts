import test from "node:test";
import assert from "node:assert/strict";

import { responseQueueCardTrustState } from "../src/lib/responseQueueCardTrustState.ts";

test("responseQueueCardTrustState keeps inline bounded and selection reasons out of trust blocks", () => {
  const state = responseQueueCardTrustState({
    boundedReasonText: "Reply window is about to close.",
    selectionReasonText: "Nearest partner thread has the strongest timing signal.",
    showSelectionReasonCandidate: true,
    confidenceText: "high",
    sourceSummaryText: "Based on 2 sources.",
    consequencePreviewText: "Draft stays reversible until send.",
    provenanceCueText: "Grounded in the source thread.",
  });

  assert.equal(state.showBoundedReason, true);
  assert.equal(state.boundedReasonText, "Reply window is about to close.");
  assert.equal(state.showSelectionReason, true);
  assert.equal(
    state.selectionReasonText,
    "Nearest partner thread has the strongest timing signal.",
  );
  assert.equal(state.trustBlocks.boundedReason, undefined);
  assert.equal(state.trustBlocks.selectionReason, undefined);
  assert.equal(state.trustBlocks.confidence, "high");
  assert.equal(state.trustBlocks.sourceSummary, "Based on 2 sources.");
  assert.equal(state.trustBlocks.consequencePreview, "Draft stays reversible until send.");
  assert.equal(state.trustBlocks.provenanceCue, "Grounded in the source thread.");
});

test("responseQueueCardTrustState suppresses selection reason when not marked distinct", () => {
  const state = responseQueueCardTrustState({
    selectionReasonText: "Same as bounded reason",
    showSelectionReasonCandidate: false,
  });

  assert.equal(state.showSelectionReason, false);
  assert.equal(state.selectionReasonText, "Same as bounded reason");
});
