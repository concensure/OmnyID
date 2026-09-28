import test from "node:test";
import assert from "node:assert/strict";
import { buildCostDashboardFailureReceipt } from "../src/lib/costDashboardFailureState.ts";

test("buildCostDashboardFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildCostDashboardFailureReceipt("Load cost dashboard", "403 forbidden");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildCostDashboardFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildCostDashboardFailureReceipt("Save cost limits", "failed to fetch");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});
