import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentDashboardActionFailureReceipt } from "../src/lib/agentDashboardActionFailureState.ts";

test("buildAgentDashboardActionFailureReceipt maps stale sessions to a sign-in receipt", () => {
  const receipt = buildAgentDashboardActionFailureReceipt(
    "Approve queued task",
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /needs a fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildAgentDashboardActionFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildAgentDashboardActionFailureReceipt(
    "Revoke delegation",
    "connection timeout while revoking delegation",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.summary, /temporary connectivity or service failure/i);
});

test("buildAgentDashboardActionFailureReceipt falls back to generic action guidance", () => {
  const receipt = buildAgentDashboardActionFailureReceipt(
    "Cancel task",
    "unexpected task state mismatch",
  );

  assert.equal(receipt.tone, "warning");
  assert.equal(receipt.title, "Cancel task failed");
  assert.match(receipt.nextStep, /retry from the same dashboard view/i);
});

test("buildAgentDashboardActionFailureReceipt maps clipboard blocks to browser guidance", () => {
  const receipt = buildAgentDashboardActionFailureReceipt(
    "Copy session summary",
    "NotAllowedError: clipboard write permission denied",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /blocked in this browser/i);
  assert.match(receipt.nextStep, /copy the summary manually/i);
});

test("buildAgentDashboardActionFailureReceipt maps download blocks to browser guidance", () => {
  const receipt = buildAgentDashboardActionFailureReceipt(
    "Download audit log",
    "SecurityError: createObjectURL download blocked",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /blocked in this browser/i);
  assert.match(receipt.nextStep, /different browser/i);
});
