import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentDashboardBudgetFailureReceipt } from "../src/lib/agentDashboardBudgetFailureState.ts";

test("buildAgentDashboardBudgetFailureReceipt maps stale sessions to a sign-in receipt", () => {
  const receipt = buildAgentDashboardBudgetFailureReceipt(
    "Save budget limits",
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /needs a fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildAgentDashboardBudgetFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildAgentDashboardBudgetFailureReceipt(
    "Load budget settings",
    "connection timeout while loading budget settings",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.summary, /temporary connectivity or service failure/i);
});

test("buildAgentDashboardBudgetFailureReceipt falls back to generic dashboard budget guidance", () => {
  const receipt = buildAgentDashboardBudgetFailureReceipt(
    "Load budget settings",
    "unexpected budget projection failure",
  );

  assert.equal(receipt.tone, "warning");
  assert.equal(receipt.title, "Load budget settings failed");
  assert.match(receipt.nextStep, /retry from the same budget panel/i);
});
