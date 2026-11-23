import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAgentFleetFailureReceipt,
  buildAgentFleetRunFailureNotice,
} from "../src/lib/agentFleetFailureState.ts";

test("buildAgentFleetFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildAgentFleetFailureReceipt("Fleet status", "401 unauthorized");
  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildAgentFleetFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildAgentFleetFailureReceipt("Task cancel", "network error while contacting server");
  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});

test("buildAgentFleetRunFailureNotice avoids raw backend wording in the visible run status", () => {
  const notice = buildAgentFleetRunFailureNotice("connection refused by upstream");
  assert.equal(notice.tone, "danger");
  assert.doesNotMatch(notice.message, /connection refused by upstream/i);
  assert.match(notice.message, /delegation start/i);
});
