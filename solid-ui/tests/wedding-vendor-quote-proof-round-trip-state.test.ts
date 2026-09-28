// @locs-version: 1.0
import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "@/lib/api";
import { buildWeddingVendorQuoteProofRoundTripState } from "@/lib/weddingVendorQuoteProofRoundTripState";

function message(overrides: Partial<AfpMessage> = {}): AfpMessage {
  return {
    id: "msg-1",
    thread_id: "thread-1",
    from: "agent://wedding",
    timestamp: "2026-09-27T01:00:00.000Z",
    type: "ledger",
    kind: "wedding_vendor_quote_received",
    content: {
      title: "Quote from Chloe's Florals",
      summary: "$4,200 floral quote.",
    },
    views: [],
    attachments: [],
    references: [],
    supertags: [],
    metadata: {},
    ...overrides,
  };
}

const quote = message({ id: "quote" });

const draft = message({
  id: "draft",
  timestamp: "2026-09-27T01:01:00.000Z",
  type: "email_draft",
  kind: "wedding_vendor_quote_reply_draft",
  content: {
    approval_request_id: "approval-1",
    subject: "Floral quote",
    markdown: "Thanks Chloe, we would like to proceed.",
    delivery_ready: true,
    delivery: {
      to: ["hello@chloes.example"],
      subject: "Floral quote",
    },
  },
});

const durableReceipt = message({
  id: "receipt",
  timestamp: "2026-09-27T01:02:00.000Z",
  type: "approval_receipt",
  kind: "receipt",
  content: {
    title: "Sent reply to Chloe's Florals",
    provider: "gmail",
    provider_message_id: "gmail-msg-123",
    external_delivery_performed: true,
    provider_result_ok: true,
    missing_durable_provider_receipt: false,
    markdown: "Sent with Gmail after explicit approval.",
  },
});

test("vendor quote proof round trip reconstructs quote draft and durable send from server thread", () => {
  const state = buildWeddingVendorQuoteProofRoundTripState({
    vendorName: "Chloe's Florals",
    serverMessages: [durableReceipt, quote, draft],
  });

  assert.equal(state.status, "complete");
  assert.equal(state.hasQuote, true);
  assert.equal(state.hasDraft, true);
  assert.equal(state.hasDurableSentProof, true);
  assert.equal(state.drawer.statusLabel, "Sent proof found");
  assert.equal(state.drawer.sentProofCount, 1);
  assert.equal(state.drawer.latestSentReceiptLabel, "gmail-msg-123");
  assert.deepEqual(state.messages.map((row) => row.id), ["quote", "draft", "receipt"]);
  assert.equal(state.telemetryEvent, null);
});

test("vendor quote proof round trip dedupes local proof once server receipt arrives", () => {
  const localReceipt = message({
    ...durableReceipt,
    id: "local-receipt",
    timestamp: "2026-09-27T01:03:00.000Z",
  });
  const state = buildWeddingVendorQuoteProofRoundTripState({
    vendorName: "Chloe's Florals",
    serverMessages: [quote, draft, durableReceipt],
    localMessages: [localReceipt],
  });

  assert.equal(state.status, "complete");
  assert.equal(state.drawer.sentProofCount, 1);
  assert.deepEqual(state.messages.map((row) => row.id), ["quote", "draft", "receipt"]);
});

test("vendor quote proof round trip keeps local proof visible when server reload fails", () => {
  const state = buildWeddingVendorQuoteProofRoundTripState({
    vendorName: "Chloe's Florals",
    serverMessages: [],
    localMessages: [durableReceipt],
    error: "Network failed",
  });

  assert.equal(state.status, "server_error_with_local_proof");
  assert.equal(state.hasDurableSentProof, true);
  assert.equal(state.drawer.statusLabel, "Thread needs reload");
  assert.equal(state.drawer.statusTone, "warning");
  assert.equal(state.telemetryEvent, "wedding_vendor_quote_proof_thread_reload_failed_local_proof_available");
});

test("vendor quote proof round trip does not complete when sent proof lacks quote or draft context", () => {
  const missingDraft = buildWeddingVendorQuoteProofRoundTripState({
    vendorName: "Chloe's Florals",
    serverMessages: [quote, durableReceipt],
  });
  const missingQuote = buildWeddingVendorQuoteProofRoundTripState({
    vendorName: "Chloe's Florals",
    serverMessages: [draft, durableReceipt],
  });

  assert.equal(missingDraft.status, "missing_thread_context");
  assert.equal(missingDraft.hasQuote, true);
  assert.equal(missingDraft.hasDraft, false);
  assert.equal(missingDraft.hasDurableSentProof, true);
  assert.equal(missingDraft.telemetryEvent, "wedding_vendor_quote_proof_thread_missing_context");
  assert.equal(missingQuote.status, "missing_thread_context");
  assert.equal(missingQuote.hasQuote, false);
  assert.equal(missingQuote.hasDraft, true);
});

test("vendor quote proof round trip does not treat failed provider attempts as durable proof", () => {
  const failedReceipt = message({
    ...durableReceipt,
    id: "failed-receipt",
    content: {
      ...durableReceipt.content,
      external_delivery_performed: false,
      provider_result_ok: false,
    },
  });
  const state = buildWeddingVendorQuoteProofRoundTripState({
    vendorName: "Chloe's Florals",
    serverMessages: [quote, draft, failedReceipt],
  });

  assert.equal(state.status, "missing_sent_proof");
  assert.equal(state.hasDurableSentProof, false);
  assert.equal(state.drawer.sentProofCount, 0);
  assert.equal(state.telemetryEvent, "wedding_vendor_quote_proof_thread_missing_sent_proof");
});

test("vendor quote proof round trip distinguishes empty reloaded threads", () => {
  const state = buildWeddingVendorQuoteProofRoundTripState({
    vendorName: "Chloe's Florals",
    serverMessages: [],
  });

  assert.equal(state.status, "empty");
  assert.equal(state.drawer.statusLabel, "No thread messages");
  assert.equal(state.telemetryEvent, "wedding_vendor_quote_proof_thread_empty");
});
