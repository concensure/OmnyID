import test from "node:test";
import assert from "node:assert/strict";
import { buildFirstRunExperienceFailureReceipt } from "../src/lib/firstRunExperienceFailureState.ts";

test("buildFirstRunExperienceFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildFirstRunExperienceFailureReceipt("Send draft", "403 forbidden");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildFirstRunExperienceFailureReceipt maps oauth timeout to retry guidance", () => {
  const receipt = buildFirstRunExperienceFailureReceipt(
    "Confirm Gmail authorisation",
    "Gmail authorisation was not confirmed in time.",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /timed out/i);
  assert.match(receipt.nextStep, /retry gmail setup/i);
});

test("buildFirstRunExperienceFailureReceipt maps temporary send failures to retry guidance", () => {
  const receipt = buildFirstRunExperienceFailureReceipt("Send draft", "Could not send this draft.");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});
