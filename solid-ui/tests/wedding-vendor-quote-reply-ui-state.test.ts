// @locs-version: 1.0
import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingProviderExecutorReadinessState } from "@/lib/weddingProviderExecutorReadinessState";
import { weddingVendorQuoteReceiptPersistenceState } from "@/lib/weddingVendorQuoteReceiptPersistenceState";
import { weddingVendorQuoteReplyDraftPersistenceState, weddingVendorQuoteReplyProofPersistenceState } from "@/lib/weddingVendorQuoteReplyFlowState";
import { buildWeddingVendorQuoteReplyUiCopyState } from "@/lib/weddingVendorQuoteReplyUiState";

const readyFlow = {
  failureMessage: null,
  canSend: true,
};

const blockedFlow = {
  failureMessage: "Gmail token expired. Reconnect Gmail before sending.",
  canSend: false,
};

const providerReady: WeddingProviderExecutorReadinessState = {
  capability: "email",
  requiredProvider: "Gmail or email provider",
  credentialStatus: "connected",
  executorStatus: "available",
  productionReady: true,
  setupView: "email",
  summary: "Gmail or email provider ready",
  detail: "The connected app is ready.",
};

test("vendor quote reply UI copy announces durable sent proof and connected provider sends", () => {
  const state = buildWeddingVendorQuoteReplyUiCopyState({
    flow: readyFlow,
    providerReadiness: providerReady,
    proofPersistence: weddingVendorQuoteReplyProofPersistenceState({
      notice: "Approval saved with this wedding and attached to the vendor thread.",
    }),
  });

  assert.equal(state.sendStatusCopy, "This reply will be sent through the connected email provider after the undo window.");
  assert.equal(state.proofNoticeRole, "status");
  assert.equal(state.proofNoticeAriaLive, "polite");
  assert.equal(state.sentStatusLabel, "The provider send finished and proof is available.");
  assert.equal(state.failureTelemetryEvent, null);
});

test("vendor quote reply UI copy escalates draft-save failures before approval or external send", () => {
  const state = buildWeddingVendorQuoteReplyUiCopyState({
    flow: readyFlow,
    draftPersistence: weddingVendorQuoteReplyDraftPersistenceState({ status: "local_only" }),
  });

  assert.equal(state.draftNoticeRole, "alert");
  assert.equal(state.draftNoticeAriaLive, "assertive");
  assert.equal(state.failureNoticeTone, "warning");
  assert.equal(state.failureTelemetryEvent, "wedding_vendor_quote_reply_draft_save_failed");
});

test("vendor quote reply UI copy keeps provider failures explicit and telemetry-ready", () => {
  const state = buildWeddingVendorQuoteReplyUiCopyState({
    flow: blockedFlow,
    providerReadiness: {
      ...providerReady,
      credentialStatus: "stale",
      productionReady: false,
      summary: "Gmail or email provider needs setup",
      detail: "The connected app needs to be signed in again before it can send or sync.",
    },
  });

  assert.equal(state.sendStatusCopy, "Gmail token expired. Reconnect Gmail before sending.");
  assert.equal(state.providerNoticeRole, "alert");
  assert.equal(state.providerNoticeAriaLive, "assertive");
  assert.equal(state.failureNoticeTitle, "Provider setup needed");
  assert.equal(state.failureNoticeTone, "critical");
  assert.equal(state.failureTelemetryEvent, "wedding_vendor_quote_reply_provider_not_ready");
});

test("vendor quote reply UI copy distinguishes proof-save attention from failed sends", () => {
  const state = buildWeddingVendorQuoteReplyUiCopyState({
    flow: readyFlow,
    proofPersistence: weddingVendorQuoteReplyProofPersistenceState({
      notice: "Approval finished, but the save record could not be stored.",
    }),
  });

  assert.equal(state.proofNoticeRole, "alert");
  assert.equal(state.proofNoticeAriaLive, "assertive");
  assert.equal(state.sentStatusLabel, "The provider send finished, but proof storage still needs attention.");
  assert.equal(state.failureNoticeTone, "warning");
  assert.equal(state.failureTelemetryEvent, "wedding_vendor_quote_reply_proof_save_attention");
});

test("vendor quote reply UI copy prefers receipt persistence recovery copy when available", () => {
  const state = buildWeddingVendorQuoteReplyUiCopyState({
    flow: readyFlow,
    receiptPersistence: weddingVendorQuoteReceiptPersistenceState({
      approvalSaveAvailable: true,
      approvalSaveSucceeded: true,
      vendorThreadExpected: true,
      vendorThreadProjectionAvailable: true,
      vendorThreadSaveSucceeded: false,
    }),
  });

  assert.equal(
    state.sentStatusLabel,
    "The provider send proof is saved on the approval record, but the vendor thread proof copy failed.",
  );
  assert.equal(state.proofNoticeRole, "alert");
  assert.equal(state.proofNoticeAriaLive, "assertive");
  assert.equal(state.failureNoticeTone, "warning");
  assert.equal(state.failureTelemetryEvent, "wedding_vendor_quote_receipt_vendor_thread_save_failed");
});

test("vendor quote reply UI copy preserves undo-window wording", () => {
  const state = buildWeddingVendorQuoteReplyUiCopyState({
    flow: readyFlow,
  });

  assert.equal(state.undoStatusLabel, "The reply is still inside OmnyID and can be stopped.");
});
