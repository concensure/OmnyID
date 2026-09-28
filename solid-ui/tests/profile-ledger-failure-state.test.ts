import test from "node:test";
import assert from "node:assert/strict";

import { buildProfileLedgerFailureReceipt } from "../src/lib/profileLedgerFailureState.ts";

test("buildProfileLedgerFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildProfileLedgerFailureReceipt("Load ledger", "401 unauthorized");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.summary, /current session is no longer trusted/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildProfileLedgerFailureReceipt maps storage pressure to export-reset guidance", () => {
  const receipt = buildProfileLedgerFailureReceipt("Save weights", "quota exceeded while saving profile");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /storage is full|could not be written safely/i);
  assert.match(receipt.nextStep, /export|reset/i);
});

test("buildProfileLedgerFailureReceipt maps temporary connectivity failures to retry guidance", () => {
  const receipt = buildProfileLedgerFailureReceipt("Delete entry", "network error while updating ledger");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /temporary connectivity|service failure/i);
  assert.match(receipt.nextStep, /retry/i);
});
