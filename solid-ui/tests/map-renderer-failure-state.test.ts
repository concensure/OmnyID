import test from "node:test";
import assert from "node:assert/strict";

import { buildMapRendererFailureReceipt } from "../src/lib/mapRendererFailureState.ts";

test("buildMapRendererFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildMapRendererFailureReceipt("Save zone", "401 unauthorized");
  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildMapRendererFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildMapRendererFailureReceipt("Load map", "network error while loading tiles");
  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /temporary connectivity|tile\/service failure/i);
  assert.match(receipt.nextStep, /retry/i);
});

test("buildMapRendererFailureReceipt falls back to generic map guidance", () => {
  const receipt = buildMapRendererFailureReceipt("Delete zone", "unexpected persistence failure");
  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /failed/i);
  assert.match(receipt.nextStep, /map panel|workspace status|session health/i);
});
