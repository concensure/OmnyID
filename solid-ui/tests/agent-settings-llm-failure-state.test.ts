import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentSettingsLlmFailureReceipt } from "../src/lib/agentSettingsLlmFailureState.ts";

test("buildAgentSettingsLlmFailureReceipt maps stale sessions to a sign-in receipt", () => {
  const receipt = buildAgentSettingsLlmFailureReceipt(
    "Save model settings",
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /needs a fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildAgentSettingsLlmFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildAgentSettingsLlmFailureReceipt(
    "Save model settings",
    "connection timeout while contacting model provider",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.summary, /temporary connectivity or service failure/i);
});

test("buildAgentSettingsLlmFailureReceipt maps incomplete model setup to setup guidance", () => {
  const receipt = buildAgentSettingsLlmFailureReceipt(
    "Test model connection",
    "provider not configured: api key required",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /needs model setup first/i);
  assert.match(receipt.nextStep, /finish the model setup/i);
});

test("buildAgentSettingsLlmFailureReceipt falls back to generic model settings guidance", () => {
  const receipt = buildAgentSettingsLlmFailureReceipt(
    "Save model settings",
    "unexpected provider validation failure",
  );

  assert.equal(receipt.tone, "warning");
  assert.equal(receipt.title, "Save model settings failed");
  assert.match(receipt.nextStep, /retry from the same model settings panel/i);
});
