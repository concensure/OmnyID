import test from "node:test";
import assert from "node:assert/strict";
import { buildThreadLoadFailureReceipt } from "../src/lib/threadLoadFailureState.ts";

test("buildThreadLoadFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildThreadLoadFailureReceipt("Load thread", "403 forbidden");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildThreadLoadFailureReceipt keeps disabled accounts out of reauth guidance", () => {
  const receipt = buildThreadLoadFailureReceipt("Load thread", "account access is disabled");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /unavailable for this account/i);
  assert.match(receipt.summary, /account access is currently disabled/i);
  assert.match(receipt.nextStep, /contact support or an operator/i);
});

test("buildThreadLoadFailureReceipt maps missing threads to reopen guidance", () => {
  const receipt = buildThreadLoadFailureReceipt("Load thread", "Request failed with 404");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /unavailable/i);
  assert.match(receipt.nextStep, /go back to the thread list/i);
});

test("buildThreadLoadFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildThreadLoadFailureReceipt("Refresh thread", "network error while loading");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});
