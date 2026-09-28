import test from "node:test";
import assert from "node:assert/strict";

import {
  buildThreadMergeFailureReceipt,
  buildThreadOrchestrationFailureReceipt,
} from "../src/lib/threadOrchestrationFailureState.ts";

test("buildThreadOrchestrationFailureReceipt maps missing llm config to setup guidance", () => {
  const receipt = buildThreadOrchestrationFailureReceipt(
    "no usable LLM backend is configured; save BYOK/Ollama settings or enable hosted AI first.",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /no ai model is connected/i);
  assert.match(receipt.nextStep, /connect byok|ollama|runpod|hosted ai/i);
});

test("buildThreadOrchestrationFailureReceipt maps authorization failures to reauth guidance", () => {
  const receipt = buildThreadOrchestrationFailureReceipt(
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.summary, /current session is no longer trusted/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildThreadMergeFailureReceipt maps authorization failures to merge-specific reauth guidance", () => {
  const receipt = buildThreadMergeFailureReceipt("403 forbidden");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /before merging threads/i);
  assert.match(receipt.nextStep, /retry the merge/i);
});

test("buildThreadMergeFailureReceipt maps temporary failures to merge retry guidance", () => {
  const receipt = buildThreadMergeFailureReceipt("network timeout while merging");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not merge those threads right now/i);
  assert.match(receipt.nextStep, /retry the merge/i);
});
