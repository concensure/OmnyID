import test from "node:test";
import assert from "node:assert/strict";
import { buildContactsFailureReceipt } from "../src/lib/contactsFailureState.ts";

test("buildContactsFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildContactsFailureReceipt("Contact sync", "403 forbidden");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.summary, /saved locally/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildContactsFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildContactsFailureReceipt("Contact sync", "network error while syncing");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not reach the agent right now/i);
  assert.match(receipt.summary, /saved locally/i);
  assert.match(receipt.nextStep, /retry later/i);
});
