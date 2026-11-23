import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentSettingsRuntimeFailureReceipt } from "../src/lib/agentSettingsRuntimeFailureState.ts";

test("buildAgentSettingsRuntimeFailureReceipt maps stale sessions to a sign-in receipt", () => {
  const receipt = buildAgentSettingsRuntimeFailureReceipt(
    "Apply runtime update",
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /needs a fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildAgentSettingsRuntimeFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildAgentSettingsRuntimeFailureReceipt(
    "Load runtime backup manifest",
    "connection timeout while contacting runtime backup service",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.summary, /temporary connectivity or service failure/i);
});

test("buildAgentSettingsRuntimeFailureReceipt falls back to a generic runtime action failure receipt", () => {
  const receipt = buildAgentSettingsRuntimeFailureReceipt(
    "Create restore drill",
    "unexpected runtime drill validation failure",
  );

  assert.equal(receipt.tone, "warning");
  assert.equal(receipt.title, "Create restore drill failed");
  assert.match(receipt.nextStep, /retry from the same runtime settings panel/i);
});
