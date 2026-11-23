import test from "node:test";
import assert from "node:assert/strict";

import { proactiveSuggestionApprovalReviewPanelStateFromUnknown } from "../src/lib/approvalReviewState.ts";

test("proactive suggestion approval review state preserves sibling autonomy decisions", () => {
  const state = proactiveSuggestionApprovalReviewPanelStateFromUnknown({
    description: "Review the outbound draft before sending it.",
    approval_review: {
      title: "Approval review",
      reason: "This outbound action crosses a send boundary.",
      confidence: "high",
    },
    autonomy_decision: {
      autonomy_level: "request_approval",
      reason: "Outbound send remains approval-gated.",
      approval_required: true,
      reversibility: "approval_required",
      consequence_level: "high",
      confidence: "high",
      interruption_budget: "immediate",
    },
  });

  assert.equal(state.showPanel, true);
  assert.equal(state.reviewValue?.title, "Approval review");
  assert.equal(state.fallbackReasonText, "Review the outbound draft before sending it.");
  assert.equal(state.autonomyDecision?.autonomy_level, "request_approval");
  assert.equal(state.autonomyDecision?.reason, "Outbound send remains approval-gated.");
});

test("proactive suggestion approval review state still opens for autonomy-only payloads", () => {
  const state = proactiveSuggestionApprovalReviewPanelStateFromUnknown({
    selection_reason: "The action stays blocked until explicit confirmation.",
    autonomy_decision: {
      autonomy_level: "request_approval",
      reason: "Destructive change remains approval-gated.",
      approval_required: true,
    },
  });

  assert.equal(state.showPanel, true);
  assert.equal(state.reviewValue, null);
  assert.equal(state.fallbackReasonText, "The action stays blocked until explicit confirmation.");
  assert.equal(state.autonomyDecision?.reason, "Destructive change remains approval-gated.");
});

test("proactive suggestion approval review state falls back to nested review autonomy", () => {
  const state = proactiveSuggestionApprovalReviewPanelStateFromUnknown({
    approval_review: {
      title: "Approval review",
      autonomy_decision: {
        autonomy_level: "request_approval",
        reason: "Nested approval policy applies.",
        approval_required: true,
      },
    },
  });

  assert.equal(state.showPanel, true);
  assert.equal(state.autonomyDecision?.reason, "Nested approval policy applies.");
});
