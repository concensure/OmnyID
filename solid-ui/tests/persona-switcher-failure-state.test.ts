import test from "node:test";
import assert from "node:assert/strict";

import { buildPersonaSwitcherFailureReceipt } from "../src/lib/personaSwitcherFailureState.ts";

test("buildPersonaSwitcherFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildPersonaSwitcherFailureReceipt("Load personas", "401 unauthorized");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.summary, /current session is no longer trusted/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildPersonaSwitcherFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildPersonaSwitcherFailureReceipt("Switch persona", "network error while activating persona");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /temporary connectivity|service failure/i);
  assert.match(receipt.nextStep, /retry/i);
});
