import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentTriggersFailureReceipt } from "../src/lib/agentTriggersFailureState.ts";

test("buildAgentTriggersFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildAgentTriggersFailureReceipt("Trigger load", "401 unauthorized");
  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildAgentTriggersFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildAgentTriggersFailureReceipt("Trigger update", "network error while saving");
  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});
