import test from "node:test";
import assert from "node:assert/strict";

import {
  workflowApprovalPanelSummaryState,
  workflowStatusContextDecisionLineItems,
  workflowWaitResumeDecisionSummaryState,
} from "../src/lib/workflowApprovalPanelState.ts";

test("workflow approval panel summary state derives approval detail lines from shared follow-up parts", () => {
  const state = workflowApprovalPanelSummaryState({
    approvalDecisionConsequence: "This will send the prepared reply.",
    approvalDecisionLabel: "Approve & send",
    approvalDecisionNote: "Keep the audit trail intact.",
  });

  assert.deepEqual(state.detailLines, [
    "Decision: Approve & send.",
    "This will send the prepared reply.",
    "Note: Keep the audit trail intact.",
  ]);
  assert.equal(state.showSection, true);
});

test("workflow status context decision line items reuse shared decision follow-up ordering", () => {
  const items = workflowStatusContextDecisionLineItems({
    approvalDecisionConsequence: "This will send the prepared reply.",
    approvalDecisionLabel: "Approve & send",
    approvalDecisionNote: "Keep the audit trail intact.",
    approvalDecisionPointId: "approval-node-1",
    decisionClassName: "decision",
    detailClassName: "detail",
  });

  assert.deepEqual(
    items.map((item) => item.label),
    [
      "Decision point approval-node-1",
      "Decision: Approve & send.",
      "This will send the prepared reply.",
      "Note: Keep the audit trail intact.",
    ],
  );
});

test("workflow wait resume decision summary state exposes shared decision detail lines", () => {
  const state = workflowWaitResumeDecisionSummaryState({
    approvalDecisionConsequence: "This will send the prepared reply.",
    approvalDecisionLabel: "Approve & send",
    approvalDecisionNote: "Keep the audit trail intact.",
  });

  assert.deepEqual(state?.detailLines, [
    "Decision: Approve & send.",
    "This will send the prepared reply.",
    "Note: Keep the audit trail intact.",
  ]);
});
