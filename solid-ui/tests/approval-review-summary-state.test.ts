import test from "node:test";
import assert from "node:assert/strict";

import { approvalReviewTrustBlockState } from "../src/lib/approvalReviewSummaryState.ts";

test("approval review summary state moves shared trust fields into trust blocks and keeps only residual detail lines", () => {
  const state = approvalReviewTrustBlockState({
    approvalReview: {
      reason: "This outbound action crosses a send boundary.",
      provenance_summary: "Grounded in the latest thread and delivery policy.",
      source_refs: ["thread:abc", "message:def"],
      consequence_summary_lines: [
        "Approving will send the queued reply.",
        "The delivery receipt will be recorded.",
      ],
    },
    autonomyDecision: {
      autonomy_level: "request_approval",
      reason: "Outbound send remains approval-gated.",
      approval_required: true,
    },
  });

  assert.equal(state.boundedReason, "This outbound action crosses a send boundary.");
  assert.equal(state.provenanceCue, "Grounded in the latest thread and delivery policy.");
  assert.equal(state.sourceSummary, "Based on 2 sources");
  assert.equal(state.consequencePreview, "Approving will send the queued reply.");
  assert.deepEqual(state.detailLines, [
    "The delivery receipt will be recorded.",
    "Approval boundary: Outbound send remains approval-gated.",
  ]);
});
