import test from "node:test";
import assert from "node:assert/strict";
import { buildAddCapabilityFailureReceipt } from "../src/lib/addCapabilityFailureState.ts";

test("buildAddCapabilityFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildAddCapabilityFailureReceipt("Create capability", "403 forbidden");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildAddCapabilityFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildAddCapabilityFailureReceipt("Create capability", "failed to fetch");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});
