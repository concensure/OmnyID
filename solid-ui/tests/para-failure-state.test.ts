import test from "node:test";
import assert from "node:assert/strict";
import { buildParaFailureReceipt } from "../src/lib/paraFailureState.ts";

test("buildParaFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildParaFailureReceipt("Load PARA section", "403 forbidden");

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildParaFailureReceipt preserves local storage policy guidance", () => {
  const receipt = buildParaFailureReceipt("Upload to PARA", "Archive-only mode blocks new uploads right now.");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /storage policy/i);
  assert.equal(receipt.summary, "Archive-only mode blocks new uploads right now.");
});

test("buildParaFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildParaFailureReceipt("Export PARA section", "failed to fetch");

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});
