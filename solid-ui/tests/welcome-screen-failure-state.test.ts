import test from "node:test";
import assert from "node:assert/strict";
import { buildWelcomeScreenFailureReceipt } from "../src/lib/welcomeScreenFailureState.ts";

test("buildWelcomeScreenFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildWelcomeScreenFailureReceipt("Save onboarding", "403 forbidden");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildWelcomeScreenFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildWelcomeScreenFailureReceipt("Save onboarding", "network error while saving");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});
