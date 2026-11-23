import test from "node:test";
import assert from "node:assert/strict";
import { buildPulseFeedFailureReceipt } from "../src/lib/pulseFeedFailureState.ts";

test("buildPulseFeedFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildPulseFeedFailureReceipt("Load channels", "401 unauthorized");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildPulseFeedFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildPulseFeedFailureReceipt("Load feed", "network error while loading feed");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});

test("buildPulseFeedFailureReceipt falls back to generic guidance", () => {
  const receipt = buildPulseFeedFailureReceipt("Save channel", "unexpected response shape");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /failed/i);
  assert.match(receipt.summary, /did not complete successfully/i);
});
