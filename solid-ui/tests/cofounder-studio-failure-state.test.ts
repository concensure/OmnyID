import test from "node:test";
import assert from "node:assert/strict";

import { buildCofounderStudioFailureReceipt } from "../src/lib/cofounderStudioFailureState.ts";

test("buildCofounderStudioFailureReceipt maps stale sessions to a sign-in receipt", () => {
  const receipt = buildCofounderStudioFailureReceipt(
    "Launch startup workflow",
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /needs a fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildCofounderStudioFailureReceipt maps incomplete ai setup to setup guidance", () => {
  const receipt = buildCofounderStudioFailureReceipt(
    "Launch startup workflow",
    "provider not configured: api key required",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /needs ai setup first/i);
  assert.match(receipt.nextStep, /finish ai setup/i);
});

test("buildCofounderStudioFailureReceipt maps stream disconnects to retry guidance", () => {
  const receipt = buildCofounderStudioFailureReceipt(
    "Run stream",
    "Lost connection to run stream. Retry the stream or check the Automations tab for status.",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /lost its live connection/i);
  assert.match(receipt.nextStep, /retry the stream/i);
});
