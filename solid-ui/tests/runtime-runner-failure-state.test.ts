import test from "node:test";
import assert from "node:assert/strict";

import { buildRuntimeRunnerFailureReceipt } from "../src/lib/runtimeRunnerFailureState.ts";

test("buildRuntimeRunnerFailureReceipt maps stale auth to fresh sign-in guidance", () => {
  const receipt = buildRuntimeRunnerFailureReceipt(
    "Deploy runner",
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.summary, /current session is no longer trusted/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildRuntimeRunnerFailureReceipt maps disabled runtime feature to operator guidance", () => {
  const receipt = buildRuntimeRunnerFailureReceipt(
    "Deploy runner",
    "private runtimes disabled by server policy",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /currently disabled/i);
  assert.match(receipt.nextStep, /enable private runtimes|runner feature is available/i);
});

test("buildRuntimeRunnerFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildRuntimeRunnerFailureReceipt(
    "Load runtime logs",
    "connection refused while contacting runtime/logs",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /temporary connectivity|runtime availability failure/i);
  assert.match(receipt.nextStep, /retry from the runner view/i);
});
