import test from "node:test";
import assert from "node:assert/strict";

import {
  workflowApprovalDecisionFollowUpParts,
  workflowApprovalDecisionFollowUpSummary,
} from "../src/lib/workflowApprovalState.ts";

test("workflow approval decision follow-up helpers keep decision consequence and note ordered", () => {
  assert.deepEqual(
    workflowApprovalDecisionFollowUpParts({
      optionLabel: "Approve & send",
      consequenceSummary: "This will send the prepared reply.",
      note: "Keep the audit trail intact.",
    }),
    [
      "Decision: Approve & send.",
      "This will send the prepared reply.",
      "Note: Keep the audit trail intact.",
    ],
  );

  assert.equal(
    workflowApprovalDecisionFollowUpSummary({
      optionLabel: "Approve & send",
      consequenceSummary: "This will send the prepared reply.",
      note: "Keep the audit trail intact.",
    }),
    "Decision: Approve & send. This will send the prepared reply. Note: Keep the audit trail intact.",
  );
});

test("workflow approval decision follow-up helpers omit empty fields", () => {
  assert.deepEqual(
    workflowApprovalDecisionFollowUpParts({
      optionLabel: "Reject",
      consequenceSummary: null,
      note: "Hold for later review.",
    }),
    [
      "Decision: Reject.",
      "Note: Hold for later review.",
    ],
  );

  assert.equal(
    workflowApprovalDecisionFollowUpSummary({
      optionLabel: null,
      consequenceSummary: null,
      note: null,
    }),
    null,
  );
});
