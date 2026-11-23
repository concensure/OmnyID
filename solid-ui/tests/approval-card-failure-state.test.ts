import test from "node:test";
import assert from "node:assert/strict";

import { buildApprovalCardFailureReceipt } from "../src/lib/approvalCardFailureState.ts";

test("buildApprovalCardFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildApprovalCardFailureReceipt("Approve shell command", "401 unauthorized");
  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildApprovalCardFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildApprovalCardFailureReceipt("Generate export", "network error while contacting worker");
  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /temporary connectivity|service failure/i);
  assert.match(receipt.nextStep, /retry/i);
});

test("buildApprovalCardFailureReceipt falls back to generic approval guidance", () => {
  const receipt = buildApprovalCardFailureReceipt("Generate export", "unexpected executor failure");
  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /failed/i);
  assert.match(receipt.nextStep, /workspace status|session health/i);
});
