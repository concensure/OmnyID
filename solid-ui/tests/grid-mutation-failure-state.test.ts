import test from "node:test";
import assert from "node:assert/strict";

import { buildGridMutationFailureReceipt } from "../src/lib/gridMutationFailureState.ts";

test("buildGridMutationFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildGridMutationFailureReceipt("Submit grid edits", "401 unauthorized");
  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildGridMutationFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildGridMutationFailureReceipt("Propose row", "network error while sending edit");
  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /temporary connectivity|service failure/i);
  assert.match(receipt.nextStep, /retry/i);
});

test("buildGridMutationFailureReceipt falls back to generic grid guidance", () => {
  const receipt = buildGridMutationFailureReceipt("Submit grid edits", "unexpected mutation failure");
  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /failed/i);
  assert.match(receipt.nextStep, /grid panel|workspace status|session health/i);
});
