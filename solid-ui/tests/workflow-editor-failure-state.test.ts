import test from "node:test";
import assert from "node:assert/strict";

import { buildWorkflowEditorFailureReceipt } from "../src/lib/workflowEditorFailureState.ts";

test("buildWorkflowEditorFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildWorkflowEditorFailureReceipt("Save workflow", "403 forbidden");
  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildWorkflowEditorFailureReceipt keeps disabled accounts out of reauth guidance", () => {
  const receipt = buildWorkflowEditorFailureReceipt("Save workflow", "account access is disabled");
  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /unavailable for this account/i);
  assert.match(receipt.summary, /account access is currently disabled/i);
  assert.match(receipt.nextStep, /contact support or an operator/i);
});

test("buildWorkflowEditorFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildWorkflowEditorFailureReceipt("Load workflow", "network error while fetching workflow");
  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /temporary connectivity|service failure/i);
  assert.match(receipt.nextStep, /retry/i);
});

test("buildWorkflowEditorFailureReceipt falls back to generic workflow editor guidance", () => {
  const receipt = buildWorkflowEditorFailureReceipt("Validate workflow", "unexpected compiler failure");
  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /failed/i);
  assert.match(receipt.nextStep, /workspace status|session health/i);
});
