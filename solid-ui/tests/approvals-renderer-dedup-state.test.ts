import test from "node:test";
import assert from "node:assert/strict";

import { approvalCardState } from "../src/lib/approvalCardState.ts";
import type { ApprovalItem } from "../src/lib/approvalPresentationState.ts";

function makeApprovalItem(overrides: Partial<ApprovalItem> = {}): ApprovalItem {
  return {
    messageId: "msg-1",
    threadId: "thread-1",
    actionType: "approval_request",
    title: "Review protected hold",
    summary: "A reversible calendar hold is ready for review.",
    status: "pending",
    requestedBy: "planner",
    boundedReason: "A reversible calendar hold is ready for review.",
    selectionReason: "Nearest high-stakes event needs protected prep.",
    consequencePreview: "Approving would create a reviewable hold.",
    provenanceCue: "Grounded in 2 source references.",
    sourceSummary: "Based on 2 sources.",
    approvalReview: {
      title: "Approval review",
      reason: "A reversible calendar hold is ready for review.",
      consequence_summary_lines: ["Approving would create a reviewable hold."],
      provenance_summary: "Grounded in 2 source references.",
      source_refs: ["thread:1", "event:1"],
    },
    trustSummary: {
      boundedReason: "A reversible calendar hold is ready for review.",
      selectionReason: "Nearest high-stakes event needs protected prep.",
      showSelectionReason: true,
      consequencePreview: "Approving would create a reviewable hold.",
      provenanceCue: "Grounded in 2 source references.",
      sourceSummary: null,
    },
    ...overrides,
  };
}

test("approvalCardState suppresses duplicated review trust cues from secondary trust blocks", () => {
  const state = approvalCardState({
    item: makeApprovalItem(),
    statusText: "pending",
    busy: false,
    feedbackText: "",
    decisionFeedback: null,
  });

  assert.equal(state.consequencePreviewText, null);
  assert.equal(state.provenanceCueText, null);
  assert.equal(state.sourceSummaryText, null);
  assert.equal(state.primaryReasonText, "A reversible calendar hold is ready for review.");
  assert.equal(state.previewBoundaryText.length > 0, true);
});

test("approvalCardState keeps distinct trust cues outside the shared approval review panel", () => {
  const state = approvalCardState({
    item: makeApprovalItem({
      consequencePreview: "Approving would create a reviewable hold and notify finance.",
      trustSummary: {
        boundedReason: "A reversible calendar hold is ready for review.",
        selectionReason: "Nearest high-stakes event needs protected prep.",
        showSelectionReason: true,
        consequencePreview: "Approving would create a reviewable hold and notify finance.",
        provenanceCue: "Grounded in 2 source references plus billing policy.",
        sourceSummary: null,
      },
      provenanceCue: "Grounded in 2 source references plus billing policy.",
      sourceSummary: "Based on 3 sources.",
    }),
    statusText: "pending",
    busy: false,
    feedbackText: "",
    decisionFeedback: null,
  });

  assert.equal(
    state.consequencePreviewText,
    "Approving would create a reviewable hold and notify finance.",
  );
  assert.equal(
    state.provenanceCueText,
    "Grounded in 2 source references plus billing policy.",
  );
  assert.equal(state.sourceSummaryText, "Based on 3 sources.");
});
