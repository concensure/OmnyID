import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentSettingsSoulFailureReceipt } from "../src/lib/agentSettingsSoulFailureState.ts";

test("buildAgentSettingsSoulFailureReceipt maps stale sessions to a sign-in receipt", () => {
  const receipt = buildAgentSettingsSoulFailureReceipt(
    "Save personality",
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /needs a fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildAgentSettingsSoulFailureReceipt maps clipboard blocks to browser guidance", () => {
  const receipt = buildAgentSettingsSoulFailureReceipt(
    "Copy soul.md",
    "NotAllowedError: clipboard permission denied",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /blocked by the browser/i);
  assert.match(receipt.nextStep, /allow clipboard access/i);
});

test("buildAgentSettingsSoulFailureReceipt falls back to generic personality guidance", () => {
  const receipt = buildAgentSettingsSoulFailureReceipt(
    "Save personality",
    "unexpected soul validation failure",
  );

  assert.equal(receipt.tone, "warning");
  assert.equal(receipt.title, "Save personality failed");
  assert.match(receipt.nextStep, /retry from the same personality settings panel/i);
});
