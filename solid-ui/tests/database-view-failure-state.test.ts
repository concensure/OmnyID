import test from "node:test";
import assert from "node:assert/strict";
import { buildDatabaseViewFailureReceipt } from "../src/lib/databaseViewFailureState.ts";

test("buildDatabaseViewFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildDatabaseViewFailureReceipt("Save record", "403 forbidden");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildDatabaseViewFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildDatabaseViewFailureReceipt("Save cell", "network error while saving");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});

test("buildDatabaseViewFailureReceipt falls back to generic guidance", () => {
  const receipt = buildDatabaseViewFailureReceipt("Import records", "unexpected response shape");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /failed/i);
  assert.match(receipt.summary, /did not complete successfully/i);
});
