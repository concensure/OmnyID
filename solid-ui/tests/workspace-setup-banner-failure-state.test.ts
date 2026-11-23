import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkspaceSetupBannerFailureReceipt,
  buildWorkspaceSetupBannerSummaryReceipt,
} from "../src/lib/workspaceSetupBannerFailureState.ts";

test("buildWorkspaceSetupBannerFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildWorkspaceSetupBannerFailureReceipt(
    "Verify workspace setup",
    "403 forbidden",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildWorkspaceSetupBannerFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildWorkspaceSetupBannerFailureReceipt(
    "Verify workspace setup",
    "network error while checking gmail",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});

test("buildWorkspaceSetupBannerSummaryReceipt escalates to danger when any failed item needs reauth", () => {
  const receipt = buildWorkspaceSetupBannerSummaryReceipt(
    ["AI model", "Gmail"],
    [
      buildWorkspaceSetupBannerFailureReceipt(
        "Verify workspace setup",
        "network error while checking llm",
      ),
      buildWorkspaceSetupBannerFailureReceipt(
        "Verify workspace setup",
        "401 unauthorized",
      ),
    ],
  );

  assert.ok(receipt);
  assert.equal(receipt?.tone, "danger");
  assert.match(receipt?.summary ?? "", /AI model, Gmail/);
});
