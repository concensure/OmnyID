import test from "node:test";
import assert from "node:assert/strict";
import { buildOnboardingWizardFailureReceipt } from "../src/lib/onboardingWizardFailureState.ts";

test("buildOnboardingWizardFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildOnboardingWizardFailureReceipt("Save onboarding", "401 unauthorized");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildOnboardingWizardFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildOnboardingWizardFailureReceipt("Save onboarding", "network error while saving");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});
