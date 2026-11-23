import test from "node:test";
import assert from "node:assert/strict";

import { buildEmailActionFailureReceipt } from "../src/lib/emailActionFailureState.ts";

test("buildEmailActionFailureReceipt maps missing llm config to setup guidance", () => {
  const receipt = buildEmailActionFailureReceipt(
    "Draft replies",
    "no usable LLM backend is configured; save BYOK/Ollama settings or enable hosted AI first.",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /no ai model is connected/i);
  assert.match(receipt.nextStep, /connect byok|ollama|runpod|hosted ai/i);
});

test("buildEmailActionFailureReceipt maps expired gmail state to reconnect guidance", () => {
  const receipt = buildEmailActionFailureReceipt(
    "Daily summary",
    "temporary upstream failure",
    {
      connected: true,
      gmail_email: "alex@example.com",
      configured: true,
      token_expired: true,
      expires_within_24h: false,
    },
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.summary, /gmail needs to be reconnected/i);
  assert.match(receipt.nextStep, /reconnect gmail/i);
});
