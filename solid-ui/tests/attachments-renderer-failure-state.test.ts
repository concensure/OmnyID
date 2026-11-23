import test from "node:test";
import assert from "node:assert/strict";
import { buildAttachmentsRendererFailureReceipt } from "../src/lib/attachmentsRendererFailureState.ts";

test("buildAttachmentsRendererFailureReceipt maps stale auth to reauth guidance", () => {
  const receipt = buildAttachmentsRendererFailureReceipt(
    "Preview attachment",
    "401 unauthorized",
  );

  assert.equal(receipt.tone, "danger");
  assert.match(receipt.title, /fresh sign-in/i);
  assert.match(receipt.nextStep, /sign in again/i);
});

test("buildAttachmentsRendererFailureReceipt maps missing preview sources to availability guidance", () => {
  const receipt = buildAttachmentsRendererFailureReceipt(
    "Load audio preview",
    "No inline audio source is available for this attachment.",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /not available here/i);
  assert.match(receipt.summary, /does not expose a browser-safe preview source/i);
});

test("buildAttachmentsRendererFailureReceipt maps temporary failures to retry guidance", () => {
  const receipt = buildAttachmentsRendererFailureReceipt(
    "Preview attachment",
    "Fetch failed: HTTP 503",
  );

  assert.equal(receipt.tone, "warning");
  assert.match(receipt.title, /could not finish right now/i);
  assert.match(receipt.nextStep, /retry/i);
});
