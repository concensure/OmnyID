import test from "node:test";
import assert from "node:assert/strict";

import { proactiveSuggestionFooterState } from "../src/lib/proactiveSuggestionFooterState.ts";

test("proactive footer suppresses source summary when context artifact preview already shows it", () => {
  const state = proactiveSuggestionFooterState({
    artifactLineItems: [],
    trustReasonTexts: [],
    comparisonRowsPreview: [],
    sourceSummaryText: "Based on 2 sources",
    destinationText: "DecisionOS",
    showSourceSummaryCandidate: true,
    contextArtifactShowsSourceSummary: true,
    simulatorPreviewShowsSourceSummary: false,
  });

  assert.equal(state.showSourceSummary, false);
  assert.equal(state.sourceSummaryText, "Based on 2 sources");
  assert.equal(state.showDestinationLabel, true);
});

test("proactive footer suppresses source summary when simulator preview already shows it", () => {
  const state = proactiveSuggestionFooterState({
    artifactLineItems: [],
    trustReasonTexts: [],
    comparisonRowsPreview: [],
    sourceSummaryText: "Based on 2 sources",
    destinationText: null,
    showSourceSummaryCandidate: true,
    contextArtifactShowsSourceSummary: false,
    simulatorPreviewShowsSourceSummary: true,
  });

  assert.equal(state.showSourceSummary, false);
  assert.equal(state.showDestinationLabel, false);
});

test("proactive footer keeps source summary when no higher panel has already shown it", () => {
  const state = proactiveSuggestionFooterState({
    artifactLineItems: ["Artifact line"],
    trustReasonTexts: ["Trust reason"],
    comparisonRowsPreview: [{ label: "Option A", values: ["Yes", "No"] }],
    sourceSummaryText: "Based on 1 source",
    destinationText: "Thread",
    showSourceSummaryCandidate: true,
    contextArtifactShowsSourceSummary: false,
    simulatorPreviewShowsSourceSummary: false,
  });

  assert.equal(state.showArtifactLines, true);
  assert.equal(state.showTrustReasons, true);
  assert.equal(state.showComparisonPreview, true);
  assert.equal(state.showSourceSummary, true);
  assert.equal(state.showDestinationLabel, true);
});

test("proactive footer summarizes provenance policy without duplicating source summary", () => {
  const state = proactiveSuggestionFooterState({
    artifactLineItems: [],
    trustReasonTexts: [],
    comparisonRowsPreview: [],
    sourceSummaryText: "Based on 1 source",
    destinationText: "DecisionOS",
    provenanceCueText: "Based on 1 source",
    surfacePolicy: "surface_now",
    approvalPolicy: "approval_required",
    strategicAction: "ask_approval",
    showSourceSummaryCandidate: true,
    contextArtifactShowsSourceSummary: false,
    simulatorPreviewShowsSourceSummary: false,
  });

  assert.equal(state.showProvenanceLines, true);
  assert.deepEqual(state.provenanceLineItems, [
    "Policy: surface now, approval required, ask approval",
  ]);
});

test("proactive footer keeps distinct provenance cue before policy line", () => {
  const state = proactiveSuggestionFooterState({
    artifactLineItems: [],
    trustReasonTexts: [],
    comparisonRowsPreview: [],
    sourceSummaryText: "Based on 2 sources",
    provenanceCueText: "Grounded in a supplier thread and budget artifact.",
    surfacePolicy: "surface_now",
    approvalPolicy: "review_optional",
    showSourceSummaryCandidate: false,
    contextArtifactShowsSourceSummary: false,
    simulatorPreviewShowsSourceSummary: false,
  });

  assert.deepEqual(state.provenanceLineItems, [
    "Grounded in a supplier thread and budget artifact.",
    "Policy: surface now, review optional",
  ]);
});
