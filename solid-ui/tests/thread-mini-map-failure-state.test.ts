import test from "node:test";
import assert from "node:assert/strict";

import { buildThreadMiniMapFailureReceipt } from "../src/lib/threadMiniMapFailureState.ts";

test("buildThreadMiniMapFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildThreadMiniMapFailureReceipt("401 unauthorized");
  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildThreadMiniMapFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildThreadMiniMapFailureReceipt("network error while fetching graph");
  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not load right now/i);
  assert.match(receipt.nextStep, /retry/i);
});
