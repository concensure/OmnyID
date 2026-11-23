import test from "node:test";
import assert from "node:assert/strict";

import { buildPlanningFailureReceipt } from "../src/lib/planningFailureState.ts";

test("buildPlanningFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildPlanningFailureReceipt("Planning query", "401 unauthorized");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.summary, /current session is no longer trusted/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildPlanningFailureReceipt maps missing llm config to setup guidance", () => {
  const receipt = buildPlanningFailureReceipt(
    "Assumption update",
    "No usable LLM backend configured for this workspace",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /no ai model is connected/i);
  assert.match(receipt.nextStep, /connect byok|ollama|runpod|hosted ai/i);
});

test("buildPlanningFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildPlanningFailureReceipt(
    "Planning query",
    "network error while contacting planner",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /temporary connectivity|service failure/i);
  assert.match(receipt.nextStep, /retry/i);
});
