import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentPreferencesFailureReceipt } from "../src/lib/agentPreferencesFailureState.ts";

test("buildAgentPreferencesFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildAgentPreferencesFailureReceipt("Profile load", "403 forbidden");
  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildAgentPreferencesFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildAgentPreferencesFailureReceipt("Preference load", "network error while fetching");
  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});
