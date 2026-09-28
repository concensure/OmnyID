import test from "node:test";
import assert from "node:assert/strict";
import { buildClaimNeighborhoodFailureReceipt } from "../src/lib/claimNeighborhoodFailureState.ts";

test("buildClaimNeighborhoodFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildClaimNeighborhoodFailureReceipt(
    "Load claim neighborhood",
    "403 forbidden",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildClaimNeighborhoodFailureReceipt maps unindexed neighborhoods to retry guidance", () => {
  const receipt = buildClaimNeighborhoodFailureReceipt(
    "Load claim neighborhood",
    "Claim neighborhood is not indexed yet.",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /still being prepared/i);
  assert.match(receipt.summary, /not indexed/i);
});

test("buildClaimNeighborhoodFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildClaimNeighborhoodFailureReceipt(
    "Load claim neighborhood",
    "network error while loading neighborhood",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});
