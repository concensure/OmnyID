import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentSettingsDevicePolicyFailureReceipt } from "../src/lib/agentSettingsDevicePolicyFailureState.ts";

test("buildAgentSettingsDevicePolicyFailureReceipt maps stale sessions to a sign-in receipt", () => {
  const receipt = buildAgentSettingsDevicePolicyFailureReceipt(
    "Update sync policy",
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /needs a fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildAgentSettingsDevicePolicyFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildAgentSettingsDevicePolicyFailureReceipt(
    "Update sync policy",
    "connection timeout while contacting device policy service",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.summary, /temporary connectivity or service failure/i);
});

test("buildAgentSettingsDevicePolicyFailureReceipt falls back to generic device policy guidance", () => {
  const receipt = buildAgentSettingsDevicePolicyFailureReceipt(
    "Update sync policy",
    "unexpected policy validation failure",
  );

  assert.equal(receipt.tone, "warning");
  assert.equal(receipt.title, "Update sync policy failed");
  assert.match(receipt.nextStep, /retry from the same device policy panel/i);
});
