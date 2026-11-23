import test from "node:test";
import assert from "node:assert/strict";

import {
  calmPreparedActionDecision,
  calmPreparedPriorityDecision,
  continuityConfidenceExplanation,
  continuityConfidenceScore,
  continuitySynthesisSourceSummary,
  decisionScopeCueSummary,
} from "../src/lib/decisionOsContinuityDecisionState.ts";

test("continuity decision state builds scoped human-grounded summaries", () => {
  assert.equal(
    decisionScopeCueSummary({
      memory_space: "work",
      human_only: true,
    }),
    "Scoped to work context and human-grounded.",
  );
});

test("continuity decision state detects calm prepared decisions", () => {
  assert.equal(
    calmPreparedPriorityDecision({
      requires_approval: false,
      description: "Prepared response is ready for review",
      action_label: "Open responses",
      prepared_draft_class: null,
    }),
    true,
  );
  assert.equal(
    calmPreparedActionDecision({
      requires_approval: false,
      suggested_action: "review prepared context",
    }),
    true,
  );
  assert.equal(
    calmPreparedPriorityDecision({
      requires_approval: false,
      description: "Prepared decision support is ready for review",
      action_label: "Open decision queue",
      prepared_draft_class: null,
    }),
    true,
  );
  assert.equal(
    calmPreparedPriorityDecision({
      requires_approval: false,
      description: "Prepared work is ready for review",
      action_label: "Open workspace",
      prepared_draft_class: null,
    }),
    true,
  );
  assert.equal(
    calmPreparedActionDecision({
      requires_approval: false,
      suggested_action: "review prepared decision support",
    }),
    true,
  );
  assert.equal(
    calmPreparedActionDecision({
      requires_approval: false,
      suggested_action: "open workspace",
    }),
    true,
  );
});

test("continuity decision state summarizes synthesis source and confidence consistently", () => {
  assert.equal(
    continuitySynthesisSourceSummary({
      preparedDraftClass: "reply",
      selectionReason: "prepared context",
    }),
    "Prepared from continuity state and ready for review",
  );
  assert.equal(continuityConfidenceScore("medium"), 0.76);
  assert.equal(
    continuityConfidenceExplanation({
      confidence: "high",
      requiresApproval: true,
      sourceRefs: ["thread:a"],
      scopeCue: "Scoped to work context.",
    }),
    "High confidence. Approval is still required, but 1 source reference support this lane and it is scoped to work context.",
  );
});
