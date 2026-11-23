import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentSettingsIdentityUtilityFailureReceipt } from "../src/lib/agentSettingsIdentityUtilityFailureState.ts";

test("buildAgentSettingsIdentityUtilityFailureReceipt maps stale sessions to a sign-in receipt", () => {
  const receipt = buildAgentSettingsIdentityUtilityFailureReceipt(
    "Export identity card",
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /needs a fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildAgentSettingsIdentityUtilityFailureReceipt maps clipboard blocks to browser guidance", () => {
  const receipt = buildAgentSettingsIdentityUtilityFailureReceipt(
    "Copy expected key prefix",
    "NotAllowedError: clipboard permission denied",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /blocked by the browser/i);
  assert.match(receipt.nextStep, /allow clipboard access/i);
});

test("buildAgentSettingsIdentityUtilityFailureReceipt maps popup blocks to browser guidance", () => {
  const receipt = buildAgentSettingsIdentityUtilityFailureReceipt(
    "Export identity card",
    "Could not open the print preview. Allow pop-ups for OmnyID and try again.",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /blocked by the browser/i);
  assert.match(receipt.nextStep, /allow pop-ups/i);
});

test("buildAgentSettingsIdentityUtilityFailureReceipt maps download blocks to browser guidance", () => {
  const receipt = buildAgentSettingsIdentityUtilityFailureReceipt(
    "Export sovereign data bundle",
    "SecurityError: download blocked by browser",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /blocked by the browser/i);
  assert.match(receipt.nextStep, /different browser|download protections/i);
});
