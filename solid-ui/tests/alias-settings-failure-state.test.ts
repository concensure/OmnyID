import test from "node:test";
import assert from "node:assert/strict";

import { buildAliasSettingsFailureReceipt } from "../src/lib/aliasSettingsFailureState.ts";

test("buildAliasSettingsFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildAliasSettingsFailureReceipt(
    "Save alias",
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.summary, /current session is no longer trusted/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildAliasSettingsFailureReceipt maps availability conflicts to new-handle guidance", () => {
  const receipt = buildAliasSettingsFailureReceipt(
    "Check alias",
    "This alias is already taken.",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /not available/i);
  assert.match(receipt.nextStep, /choose a different alias/i);
});
