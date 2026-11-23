import test from "node:test";
import assert from "node:assert/strict";

import { buildParsedDocumentFailureReceipt } from "../src/lib/parsedDocumentFailureState.ts";

test("buildParsedDocumentFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildParsedDocumentFailureReceipt("Extract table", "403 forbidden");
  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildParsedDocumentFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildParsedDocumentFailureReceipt("Extract table", "network error while extracting");
  assert.equal(receipt.tone, "warning");
  assert.match(receipt.summary, /temporary connectivity|service failure/i);
  assert.match(receipt.nextStep, /retry/i);
});

test("buildParsedDocumentFailureReceipt falls back to generic extraction guidance", () => {
  const receipt = buildParsedDocumentFailureReceipt("Extract table", "unexpected parser failure");
  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /failed/i);
  assert.match(receipt.nextStep, /document panel|workspace status|session health/i);
});
