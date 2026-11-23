import test from "node:test";
import assert from "node:assert/strict";
import { buildThreadSearchFailureReceipt } from "../src/lib/threadSearchFailureState.ts";

test("buildThreadSearchFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildThreadSearchFailureReceipt("Load remote thread search", "403 forbidden");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildThreadSearchFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildThreadSearchFailureReceipt("Load remote thread search", "network error while searching");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});
