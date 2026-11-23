import test from "node:test";
import assert from "node:assert/strict";

import { buildTaskDetailFailureReceipt } from "../src/lib/taskDetailFailureState.ts";

test("buildTaskDetailFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildTaskDetailFailureReceipt(
    "Load task detail",
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.summary, /current session is no longer trusted/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildTaskDetailFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildTaskDetailFailureReceipt(
    "Load reasoning trace",
    "network error while contacting homeserver",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /temporary connectivity|service failure/i);
  assert.match(receipt.nextStep, /retry from the same task detail view/i);
});
