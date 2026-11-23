import test from "node:test";
import assert from "node:assert/strict";

import { buildDailyBriefingFailureReceipt } from "../src/lib/dailyBriefingFailureState.ts";

test("buildDailyBriefingFailureReceipt maps missing llm setup to reconnect guidance", () => {
  const receipt = buildDailyBriefingFailureReceipt(
    "Refresh briefing",
    "No usable LLM backend configured for this workspace",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /no ai model is connected/i);
  assert.match(receipt.nextStep, /connect byok|ollama|runpod|hosted ai/i);
});

test("buildDailyBriefingFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildDailyBriefingFailureReceipt(
    "Load briefing",
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.summary, /current session is no longer trusted/i);
  assert.match(receipt.nextStep, /sign in again/i);
});
