import test from "node:test";
import assert from "node:assert/strict";

import { buildCommandSearchFailureReceipt } from "../src/lib/commandSearchFailureState.ts";

test("buildCommandSearchFailureReceipt maps missing llm config to setup guidance", () => {
  const receipt = buildCommandSearchFailureReceipt(
    "no usable LLM backend is configured; save BYOK/Ollama settings or enable hosted AI first.",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /no ai model is connected/i);
  assert.match(receipt.nextStep, /connect byok|ollama|runpod|hosted ai/i);
});

test("buildCommandSearchFailureReceipt maps authorization failures to reauth guidance", () => {
  const receipt = buildCommandSearchFailureReceipt(
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.summary, /current session is no longer trusted/i);
  assert.match(receipt.nextStep, /sign in again/i);
});
