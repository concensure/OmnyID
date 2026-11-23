import test from "node:test";
import assert from "node:assert/strict";

import { buildSpacesFailureReceipt } from "../src/lib/spacesFailureState.ts";

test("buildSpacesFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildSpacesFailureReceipt(
    "Join space",
    "recent sign-in required for high-risk action",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.summary, /current session is no longer trusted/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildSpacesFailureReceipt keeps disabled accounts out of reauth guidance", () => {
  const receipt = buildSpacesFailureReceipt(
    "Join space",
    "account access is disabled: support revocation",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /unavailable for this account/i);
  assert.match(receipt.summary, /account access is currently disabled/i);
  assert.match(receipt.nextStep, /contact support or an operator/i);
});

test("buildSpacesFailureReceipt maps validation errors to local correction guidance", () => {
  const receipt = buildSpacesFailureReceipt(
    "Create space",
    "Name is required.",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /cannot continue until the space has a clear name/i);
  assert.match(receipt.nextStep, /add a name/i);
});
