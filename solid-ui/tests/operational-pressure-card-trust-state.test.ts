import test from "node:test";
import assert from "node:assert/strict";

import { operationalPressureCardTrustState } from "../src/lib/operationalPressureCardTrustState.ts";

test("operationalPressureCardTrustState keeps bounded reason outside shared trust blocks", () => {
  const state = operationalPressureCardTrustState({
    boundedReason: " Needs review before dispatch. ",
    consequencePreview: "Would send a controlled follow-up.",
    provenanceCue: "Grounded in 2 source refs.",
    autonomySummary: "Human review still gates the outbound step.",
    sourceSummary: "Based on 2 sources.",
  });

  assert.equal(state.showBoundedReason, true);
  assert.equal(state.boundedReasonText, "Needs review before dispatch.");
  assert.equal(state.trustBlocks.boundedReason, undefined);
  assert.equal(
    state.trustBlocks.consequencePreview,
    "Would send a controlled follow-up.",
  );
  assert.equal(state.trustBlocks.provenanceCue, "Grounded in 2 source refs.");
  assert.equal(
    state.trustBlocks.autonomySummary,
    "Human review still gates the outbound step.",
  );
  assert.equal(state.trustBlocks.sourceSummary, "Based on 2 sources.");
});

test("operationalPressureCardTrustState only shows selection reason block when raw reason exists", () => {
  const state = operationalPressureCardTrustState({
    rawReason: "Nearest deadline now dominates the queue.",
  });

  assert.equal(state.showSelectionReason, true);
  assert.equal(state.selectionReasonText, "Nearest deadline now dominates the queue.");
  assert.equal(state.showBoundedReason, false);
});
