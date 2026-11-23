import test from "node:test";
import assert from "node:assert/strict";

import { buildWorkflowWaitResumeFailureReceipt } from "../src/lib/workflowWaitResumeFailureState.ts";

test("buildWorkflowWaitResumeFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildWorkflowWaitResumeFailureReceipt("401 unauthorized");
  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildWorkflowWaitResumeFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildWorkflowWaitResumeFailureReceipt("network error while loading wait chain");
  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /temporary connectivity|service failure/i);
  assert.match(receipt.nextStep, /retry/i);
});

test("buildWorkflowWaitResumeFailureReceipt falls back to generic wait-chain guidance", () => {
  const receipt = buildWorkflowWaitResumeFailureReceipt("unexpected workflow error");
  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /failed to load/i);
  assert.match(receipt.nextStep, /workspace status|session health/i);
});
