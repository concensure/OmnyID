import test from "node:test";
import assert from "node:assert/strict";
import { buildTokenBudgetFailureReceipt } from "../src/lib/tokenBudgetFailureState.ts";

test("buildTokenBudgetFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildTokenBudgetFailureReceipt("Load token budget", "401 unauthorized");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildTokenBudgetFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildTokenBudgetFailureReceipt("Save provider", "network error while saving");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});
