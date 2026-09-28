import test from "node:test";
import assert from "node:assert/strict";
import { buildUsageViewFailureReceipt } from "../src/lib/usageViewFailureState.ts";

test("buildUsageViewFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildUsageViewFailureReceipt("Open billing portal", "403 forbidden");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildUsageViewFailureReceipt keeps disabled accounts out of reauth guidance", () => {
  const receipt = buildUsageViewFailureReceipt("Open billing portal", "account access is disabled");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /unavailable for this account/i);
  assert.match(receipt.summary, /account access is currently disabled/i);
  assert.match(receipt.nextStep, /contact support or an operator/i);
});

test("buildUsageViewFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildUsageViewFailureReceipt("Update archive-only mode", "network error while saving");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});

test("buildUsageViewFailureReceipt maps clipboard blocks to browser guidance", () => {
  const receipt = buildUsageViewFailureReceipt("Copy upgrade request", "NotAllowedError: clipboard write permission denied");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /clipboard access/i);
  assert.match(receipt.summary, /browser blocked/i);
  assert.match(receipt.nextStep, /granting clipboard access|allows copy actions/i);
});
