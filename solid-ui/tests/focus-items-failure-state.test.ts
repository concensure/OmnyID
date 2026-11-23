import test from "node:test";
import assert from "node:assert/strict";

import { buildFocusItemsFailureReceipt } from "../src/lib/focusItemsFailureState.ts";

test("buildFocusItemsFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildFocusItemsFailureReceipt(
    "Add focus item",
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.summary, /current session is no longer trusted/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildFocusItemsFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildFocusItemsFailureReceipt(
    "Update focus item",
    "network error while contacting homeserver",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /temporary connectivity|service failure/i);
  assert.match(receipt.nextStep, /retry from the focus panel/i);
});

test("buildFocusItemsFailureReceipt produces structured load guidance", () => {
  const receipt = buildFocusItemsFailureReceipt(
    "Load focus items",
    "connection refused by homeserver",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /load focus items could not finish right now/i);
  assert.match(receipt.nextStep, /retry from the focus panel/i);
});
