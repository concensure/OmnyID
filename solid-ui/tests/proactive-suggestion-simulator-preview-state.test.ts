import test from "node:test";
import assert from "node:assert/strict";

import { proactiveSuggestionSimulatorPreviewPanelState } from "../src/lib/proactiveSuggestionSimulatorPreviewState.ts";

test("proactive simulator preview panel suppresses trust cues duplicated by approval review", () => {
  const state = proactiveSuggestionSimulatorPreviewPanelState({
    artifactPreviewOpen: true,
    hasActionPayload: false,
    simulatorPreviewReviewAvailable: true,
    showApprovalPreview: true,
    showReversiblePreview: false,
    showFusionPreview: false,
    boundarySummaryText: "Preview only.",
    sourceSummaryText: "Based on 2 sources.",
    persistenceReasonText: "Persisted from continuity.",
    rolloutSummaryText: "Rollout stage: review.",
    consequencePreviewText: "Approving will send the staged reply.",
    provenanceCueText: "Grounded in 2 source references.",
    draftPreviewTitleText: "Draft reply",
    draftPreviewSummaryText: "Subject: Status update",
    primarySourceRef: "thread:1",
    approvalReview: {
      title: "Approval review",
      reason: "Review the outbound draft before sending it.",
      consequence_summary_lines: ["Approving will send the staged reply."],
      provenance_summary: "Grounded in 2 source references.",
      source_refs: ["thread:1", "thread:2"],
    },
    fallbackReasonText: "Review the outbound draft before sending it.",
  });

  assert.equal(state.showPanel, true);
  assert.equal(state.showBoundarySummary, true);
  assert.equal(state.showPersistenceReason, true);
  assert.equal(state.showRolloutSummary, true);
  assert.equal(state.showDraftPreviewTitle, true);
  assert.equal(state.showDraftPreviewSummary, true);
  assert.equal(state.showPrimarySourceRef, true);
  assert.equal(state.showConsequencePreview, false);
  assert.equal(state.showProvenanceCue, false);
  assert.equal(state.showSourceSummary, false);
});

test("proactive simulator preview panel preserves distinct trust cues outside approval review", () => {
  const state = proactiveSuggestionSimulatorPreviewPanelState({
    artifactPreviewOpen: true,
    hasActionPayload: false,
    simulatorPreviewReviewAvailable: true,
    showApprovalPreview: true,
    showReversiblePreview: false,
    showFusionPreview: false,
    boundarySummaryText: "Preview only.",
    sourceSummaryText: "Based on 3 sources.",
    consequencePreviewText: "Approving will send the staged reply and notify finance.",
    provenanceCueText: "Grounded in 2 source references plus billing policy.",
    approvalReview: {
      title: "Approval review",
      reason: "Review the outbound draft before sending it.",
      consequence_summary_lines: ["Approving will send the staged reply."],
      provenance_summary: "Grounded in 2 source references.",
      source_refs: ["thread:1", "thread:2"],
    },
    fallbackReasonText: "Review the outbound draft before sending it.",
  });

  assert.equal(state.showConsequencePreview, true);
  assert.equal(state.consequencePreviewText, "Approving will send the staged reply and notify finance.");
  assert.equal(state.showProvenanceCue, true);
  assert.equal(state.provenanceCueText, "Grounded in 2 source references plus billing policy.");
  assert.equal(state.showSourceSummary, true);
  assert.equal(state.sourceSummaryText, "Based on 3 sources.");
});
