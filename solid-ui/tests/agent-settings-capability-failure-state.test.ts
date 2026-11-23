import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentSettingsCapabilityFailureReceipt } from "../src/lib/agentSettingsCapabilityFailureState.ts";

test("buildAgentSettingsCapabilityFailureReceipt maps stale sessions to a sign-in receipt", () => {
  const receipt = buildAgentSettingsCapabilityFailureReceipt(
    "Remove capability",
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /needs a fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildAgentSettingsCapabilityFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildAgentSettingsCapabilityFailureReceipt(
    "Load capabilities",
    "connection timeout while contacting capability registry",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.summary, /temporary connectivity or service failure/i);
});

test("buildAgentSettingsCapabilityFailureReceipt falls back to a generic capability failure receipt", () => {
  const receipt = buildAgentSettingsCapabilityFailureReceipt(
    "Add email_guardian",
    "unexpected capability validation failure",
  );

  assert.equal(receipt.tone, "warning");
  assert.equal(receipt.title, "Add email_guardian failed");
  assert.match(receipt.nextStep, /retry from the same capability settings panel/i);
});
