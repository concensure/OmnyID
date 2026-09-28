import test from "node:test";
import assert from "node:assert/strict";

import {
  workflowApprovalPendingSummary,
  workflowApprovalReasonSummary,
} from "../src/lib/workflowGraphCopy.ts";

test("workflow graph copy falls back to shared pending approval wording", () => {
  assert.equal(
    workflowApprovalPendingSummary(),
    "Awaiting your approval",
  );
  assert.equal(
    workflowApprovalReasonSummary(),
    "Awaiting your approval",
  );
  assert.equal(
    workflowApprovalReasonSummary("Budget export"),
    "Budget export is waiting for approval.",
  );
});
