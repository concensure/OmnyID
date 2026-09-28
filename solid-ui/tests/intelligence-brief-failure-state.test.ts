import test from "node:test";
import assert from "node:assert/strict";

import { buildIntelligenceBriefFailureReceipt } from "../src/lib/intelligenceBriefFailureState.ts";

test("buildIntelligenceBriefFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildIntelligenceBriefFailureReceipt("Load brief", "401 unauthorized");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.summary, /current session is no longer trusted/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildIntelligenceBriefFailureReceipt maps missing llm config to setup guidance", () => {
  const receipt = buildIntelligenceBriefFailureReceipt(
    "Queue offer",
    "No usable LLM backend configured for this workspace",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /no ai model is connected/i);
  assert.match(receipt.nextStep, /connect byok|ollama|runpod|hosted ai/i);
});

test("buildIntelligenceBriefFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildIntelligenceBriefFailureReceipt(
    "Load goal pulse",
    "network error while loading brief",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /temporary connectivity|service failure/i);
  assert.match(receipt.nextStep, /retry/i);
});
