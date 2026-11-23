import test from "node:test";
import assert from "node:assert/strict";

import { buildQuickAddFailureReceipt } from "../src/lib/quickAddFailureState.ts";

test("buildQuickAddFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildQuickAddFailureReceipt(
    "Send message",
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.summary, /current session is no longer trusted/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildQuickAddFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildQuickAddFailureReceipt(
    "Create task",
    "network error while contacting homeserver",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /temporary connectivity|service failure/i);
  assert.match(receipt.nextStep, /retry from the same panel/i);
});
