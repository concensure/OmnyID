import test from "node:test";
import assert from "node:assert/strict";

import { buildChangeProposalFailureReceipt } from "../src/lib/changeProposalFailureState.ts";

test("buildChangeProposalFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildChangeProposalFailureReceipt("Apply proposed change", "403 forbidden");
  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildChangeProposalFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildChangeProposalFailureReceipt("Apply change set", "network error while applying edits");
  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /temporary connectivity|service failure/i);
  assert.match(receipt.nextStep, /retry/i);
});

test("buildChangeProposalFailureReceipt falls back to generic review-card guidance", () => {
  const receipt = buildChangeProposalFailureReceipt("Apply proposed change", "unexpected executor failure");
  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /failed/i);
  assert.match(receipt.nextStep, /review card|workspace status|session health/i);
});
