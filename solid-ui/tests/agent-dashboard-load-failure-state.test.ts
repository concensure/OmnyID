import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentDashboardLoadFailureReceipt } from "../src/lib/agentDashboardLoadFailureState.ts";

test("buildAgentDashboardLoadFailureReceipt maps stale sessions to a sign-in receipt", () => {
  const receipt = buildAgentDashboardLoadFailureReceipt(
    "Load agent dashboard",
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /needs a fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildAgentDashboardLoadFailureReceipt keeps disabled accounts out of reauth guidance", () => {
  const receipt = buildAgentDashboardLoadFailureReceipt(
    "Load agent dashboard",
    "account access is disabled: abuse review",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /unavailable for this account/i);
  assert.match(receipt.summary, /account access is currently disabled/i);
  assert.match(receipt.nextStep, /contact support or an operator/i);
});

test("buildAgentDashboardLoadFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildAgentDashboardLoadFailureReceipt(
    "Load spend history",
    "connection timeout while loading spend history",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.summary, /temporary connectivity or service failure/i);
});

test("buildAgentDashboardLoadFailureReceipt falls back to generic dashboard guidance", () => {
  const receipt = buildAgentDashboardLoadFailureReceipt(
    "Load agent memory",
    "unexpected dashboard projection failure",
  );

  assert.equal(receipt.tone, "warning");
  assert.equal(receipt.title, "Load agent memory failed");
  assert.match(receipt.nextStep, /retry from the same dashboard view/i);
});
