import test from "node:test";
import assert from "node:assert/strict";

import { buildToolsFailureReceipt } from "../src/lib/toolsFailureState.ts";

test("buildToolsFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildToolsFailureReceipt("Load tools", "401 unauthorized");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildToolsFailureReceipt keeps disabled accounts out of reauth guidance", () => {
  const receipt = buildToolsFailureReceipt("Load tools", "account access is disabled");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /unavailable for this account/i);
  assert.match(receipt.summary, /account access is currently disabled/i);
  assert.match(receipt.nextStep, /contact support or an operator/i);
});

test("buildToolsFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildToolsFailureReceipt("Disconnect tool", "failed to fetch");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});
