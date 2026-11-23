import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentSettingsIdentityFailureReceipt } from "../src/lib/agentSettingsIdentityFailureState.ts";

test("buildAgentSettingsIdentityFailureReceipt maps stale sessions to a sign-in receipt", () => {
  const receipt = buildAgentSettingsIdentityFailureReceipt(
    "Load agent identity",
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /needs a fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildAgentSettingsIdentityFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildAgentSettingsIdentityFailureReceipt(
    "Refresh agent personality",
    "connection timeout while contacting agent fleet",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.summary, /temporary connectivity or service failure/i);
});

test("buildAgentSettingsIdentityFailureReceipt falls back to generic identity guidance", () => {
  const receipt = buildAgentSettingsIdentityFailureReceipt(
    "Load agent identity",
    "unexpected identity parsing failure",
  );

  assert.equal(receipt.tone, "warning");
  assert.equal(receipt.title, "Load agent identity failed");
  assert.match(receipt.nextStep, /retry from the same agent settings panel/i);
});
