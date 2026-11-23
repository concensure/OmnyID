import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentDashboardSkillsFailureReceipt } from "../src/lib/agentDashboardSkillsFailureState.ts";

test("buildAgentDashboardSkillsFailureReceipt maps stale sessions to a sign-in receipt", () => {
  const receipt = buildAgentDashboardSkillsFailureReceipt(
    "Load capabilities",
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /needs a fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildAgentDashboardSkillsFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildAgentDashboardSkillsFailureReceipt(
    "Enable capability",
    "connection timeout while saving capability state",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.summary, /temporary connectivity or service failure/i);
});

test("buildAgentDashboardSkillsFailureReceipt falls back to generic skills guidance", () => {
  const receipt = buildAgentDashboardSkillsFailureReceipt(
    "Delete capability",
    "unexpected capability projection failure",
  );

  assert.equal(receipt.tone, "warning");
  assert.equal(receipt.title, "Delete capability failed");
  assert.match(receipt.nextStep, /retry from the same skills panel/i);
});
