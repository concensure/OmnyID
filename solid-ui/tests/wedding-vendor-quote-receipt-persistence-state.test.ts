import assert from "node:assert/strict";
import test from "node:test";

import {
  weddingVendorQuoteReceiptPersistenceNotice,
  weddingVendorQuoteReceiptPersistenceState,
} from "@/lib/weddingVendorQuoteReceiptPersistenceState";

test("vendor quote receipt persistence state reports account-save gaps", () => {
  assert.deepEqual(weddingVendorQuoteReceiptPersistenceState({
    approvalSaveAvailable: false,
  }), {
    outcome: "account_save_unavailable",
    notice: "Approval is saved on this device until account saving is connected.",
    proofAttached: false,
    proofReliability: "local_only",
    sentStatusLabel: "The provider send may have completed, but durable account proof is not available yet.",
    recoveryActionLabel: "Connect account saving",
    needsAttention: true,
    telemetryEvent: "wedding_vendor_quote_receipt_account_save_unavailable",
  });
});

test("vendor quote receipt persistence state reports approval-save failure", () => {
  assert.deepEqual(weddingVendorQuoteReceiptPersistenceState({
    approvalSaveAvailable: true,
    approvalSaveSucceeded: false,
    vendorThreadExpected: true,
  }), {
    outcome: "approval_save_failed",
    notice: "Approval finished, but the save record could not be stored.",
    proofAttached: false,
    proofReliability: "local_only",
    sentStatusLabel: "The provider send may have completed, but the approval receipt was not durably saved.",
    recoveryActionLabel: "Retry saving approval proof",
    needsAttention: true,
    telemetryEvent: "wedding_vendor_quote_receipt_approval_save_failed",
  });
});

test("vendor quote receipt persistence state distinguishes vendor-thread proof outcomes", () => {
  assert.deepEqual(weddingVendorQuoteReceiptPersistenceState({
    approvalSaveAvailable: true,
    approvalSaveSucceeded: true,
    vendorThreadExpected: true,
    vendorThreadProjectionAvailable: false,
  }), {
    outcome: "approval_saved_vendor_thread_skipped",
    notice: "Approval saved, but provider delivery proof was not attached to the vendor thread.",
    proofAttached: false,
    proofReliability: "approval_record",
    sentStatusLabel: "The provider send proof is saved on the approval record, but the vendor thread is missing its proof copy.",
    recoveryActionLabel: "Attach proof to vendor thread",
    needsAttention: true,
    telemetryEvent: "wedding_vendor_quote_receipt_vendor_thread_projection_missing",
  });

  assert.deepEqual(weddingVendorQuoteReceiptPersistenceState({
    approvalSaveAvailable: true,
    approvalSaveSucceeded: true,
    vendorThreadExpected: true,
    vendorThreadProjectionAvailable: true,
    vendorThreadSaveSucceeded: false,
  }), {
    outcome: "approval_saved_vendor_thread_failed",
    notice: "Approval saved, but the vendor-thread proof copy could not be attached yet.",
    proofAttached: false,
    proofReliability: "approval_record",
    sentStatusLabel: "The provider send proof is saved on the approval record, but the vendor thread proof copy failed.",
    recoveryActionLabel: "Retry thread proof save",
    needsAttention: true,
    telemetryEvent: "wedding_vendor_quote_receipt_vendor_thread_save_failed",
  });

  assert.deepEqual(weddingVendorQuoteReceiptPersistenceState({
    approvalSaveAvailable: true,
    approvalSaveSucceeded: true,
    vendorThreadExpected: true,
    vendorThreadProjectionAvailable: true,
    vendorThreadSaveSucceeded: true,
  }), {
    outcome: "approval_saved_vendor_thread_saved",
    notice: "Approval saved with this wedding and attached to the vendor thread.",
    proofAttached: true,
    proofReliability: "vendor_thread",
    sentStatusLabel: "The provider send finished and durable proof is attached to the vendor thread.",
    recoveryActionLabel: "View what was sent",
    needsAttention: false,
    telemetryEvent: null,
  });
});

test("vendor quote receipt persistence state reports ordinary approval save", () => {
  assert.deepEqual(weddingVendorQuoteReceiptPersistenceState({
    approvalSaveAvailable: true,
    approvalSaveSucceeded: true,
    vendorThreadExpected: false,
  }), {
    outcome: "approval_saved",
    notice: "Approval saved with this wedding.",
    proofAttached: false,
    proofReliability: "approval_record",
    sentStatusLabel: "The approval receipt is saved with this wedding.",
    recoveryActionLabel: "View approval record",
    needsAttention: false,
    telemetryEvent: null,
  });
});

test("vendor quote receipt persistence state exposes recovery copy for proof-save failures", () => {
  const failed = weddingVendorQuoteReceiptPersistenceState({
    approvalSaveAvailable: true,
    approvalSaveSucceeded: true,
    vendorThreadExpected: true,
    vendorThreadProjectionAvailable: true,
    vendorThreadSaveSucceeded: false,
  });

  assert.equal(failed.proofReliability, "approval_record");
  assert.equal(failed.sentStatusLabel, "The provider send proof is saved on the approval record, but the vendor thread proof copy failed.");
  assert.equal(failed.recoveryActionLabel, "Retry thread proof save");
  assert.equal(failed.needsAttention, true);
});

test("vendor quote receipt persistence notice exposes compact component copy", () => {
  assert.equal(
    weddingVendorQuoteReceiptPersistenceNotice("approval_saved_vendor_thread_skipped"),
    "Approval saved, but provider delivery proof was not attached to the vendor thread.",
  );
  assert.equal(
    weddingVendorQuoteReceiptPersistenceNotice("approval_saved_vendor_thread_saved"),
    "Approval saved with this wedding and attached to the vendor thread.",
  );
});
