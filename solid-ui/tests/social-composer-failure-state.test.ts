import test from "node:test";
import assert from "node:assert/strict";
import { buildSocialComposerFailureReceipt } from "../src/lib/socialComposerFailureState.ts";

test("buildSocialComposerFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildSocialComposerFailureReceipt("Publish post", "403 forbidden");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildSocialComposerFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildSocialComposerFailureReceipt("Load suggestions", "network error while loading");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});
