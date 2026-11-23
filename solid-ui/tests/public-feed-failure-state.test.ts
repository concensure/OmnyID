import test from "node:test";
import assert from "node:assert/strict";

import { buildPublicFeedFailureReceipt } from "../src/lib/publicFeedFailureState.ts";

test("buildPublicFeedFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildPublicFeedFailureReceipt(
    "Follow agent",
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.summary, /current session is no longer trusted/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildPublicFeedFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildPublicFeedFailureReceipt(
    "Load public feed",
    "network error while contacting homeserver",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /temporary connectivity|service failure/i);
  assert.match(receipt.nextStep, /retry from the same view/i);
});
