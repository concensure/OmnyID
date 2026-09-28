import test from "node:test";
import assert from "node:assert/strict";

import { buildGenerativeCardFailureReceipt } from "../src/lib/generativeCardFailureState.ts";

test("buildGenerativeCardFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildGenerativeCardFailureReceipt("Run planner path", "403 forbidden");
  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildGenerativeCardFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildGenerativeCardFailureReceipt("Run planner path", "network error while contacting worker");
  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /temporary connectivity|service failure/i);
  assert.match(receipt.nextStep, /retry/i);
});

test("buildGenerativeCardFailureReceipt falls back to generic run guidance", () => {
  const receipt = buildGenerativeCardFailureReceipt("Run planner path", "unexpected executor failure");
  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /failed/i);
  assert.match(receipt.nextStep, /workspace status|session health/i);
});
