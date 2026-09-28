import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentPulseFailureReceipt } from "../src/lib/agentPulseFailureState.ts";

test("buildAgentPulseFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildAgentPulseFailureReceipt(
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.summary, /session is no longer trusted/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildAgentPulseFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildAgentPulseFailureReceipt(
    "network error while contacting homeserver",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /temporary connectivity|service failure/i);
  assert.match(receipt.nextStep, /retry the pulse/i);
});
