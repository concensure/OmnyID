import test from "node:test";
import assert from "node:assert/strict";

import { buildSkillsFailureReceipt } from "../src/lib/skillsFailureState.ts";

test("buildSkillsFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildSkillsFailureReceipt("Load catalog", "401 unauthorized");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.summary, /current session is no longer trusted/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildSkillsFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildSkillsFailureReceipt("Activate skill", "network error while saving selection");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /temporary connectivity|service failure/i);
  assert.match(receipt.nextStep, /retry/i);
});
