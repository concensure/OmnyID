import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage } from "@/lib/api";
import {
  buildWeddingApprovalReceiptState,
  buildWeddingApprovalRequestState,
} from "@/lib/weddingApprovalState";
import { weddingApprovalReceiptToVendorThreadAfpSendInput } from "@/lib/weddingApprovalReceiptAfpProjectionState";
import {
  buildWeddingVendorQuoteThreadProofDrawerState,
  buildWeddingVendorQuoteThreadProofMessageState,
  buildWeddingVendorQuoteThreadProofState,
  mergeWeddingVendorQuoteThreadProofMessages,
  weddingVendorQuoteLocalReceiptProofMessage,
} from "@/lib/weddingVendorQuoteThreadProofState";

function message(overrides: Partial<AfpMessage> = {}): AfpMessage {
  return {
    id: "msg-1",
    thread_id: "thread-1",
    from: "agent://wedding",
    timestamp: "2026-09-27T01:02:03.000Z",
    type: "email_draft",
    kind: "wedding_vendor_quote_reply_draft",
    content: {
      subject: "Floral quote",
      markdown: "Thanks Chloe, we would like to proceed.",
    },
    views: [],
    attachments: [],
    ...overrides,
  };
}

test("vendor quote proof rows prefer user-facing subject and saved body text", () => {
  const state = buildWeddingVendorQuoteThreadProofMessageState(message());

  assert.ok(state);
  assert.equal(state.id, "msg-1");
  assert.equal(state.title, "Floral quote");
  assert.equal(state.body, "Thanks Chloe, we would like to proceed.");
  assert.equal(state.typeLabel, "email_draft | wedding_vendor_quote_reply_draft");
  assert.equal(state.proofKind, "draft");
  assert.equal(state.deliveryReady, null);
  assert.deepEqual(state.deliveryMissingFields, []);
  assert.match(state.timestampLabel, /2026|Sep|Sept|27/);
});

test("vendor quote proof rows expose draft delivery completeness", () => {
  const ready = buildWeddingVendorQuoteThreadProofMessageState(message({
    content: {
      subject: "Floral quote",
      text: "Thanks Chloe.",
      delivery_ready: true,
      delivery_missing_fields: [],
    },
  }));
  const incomplete = buildWeddingVendorQuoteThreadProofMessageState(message({
    id: "incomplete-draft",
    content: {
      subject: "Floral quote",
      text: "",
      delivery_ready: false,
      delivery_missing_fields: ["recipient", "body"],
    },
  }));

  assert.ok(ready);
  assert.equal(ready.deliveryReady, true);
  assert.deepEqual(ready.deliveryMissingFields, []);
  assert.ok(incomplete);
  assert.equal(incomplete.deliveryReady, false);
  assert.deepEqual(incomplete.deliveryMissingFields, ["recipient", "body"]);
});

test("vendor quote proof rows fall back to semantic kind and bounded json", () => {
  const state = buildWeddingVendorQuoteThreadProofMessageState(message({
    id: "msg-2",
    type: "ledger",
    kind: "wedding_vendor_quote_received",
    content: {
      vendor_name: "Chloe's Florals",
      nested: { note: "Quote imported from PDF." },
    },
  }));

  assert.ok(state);
  assert.equal(state.title, "wedding vendor quote received");
  assert.equal(state.proofKind, "quote");
  assert.match(state.body, /Chloe's Florals/);
  assert.match(state.body, /Quote imported/);
});

test("vendor quote proof rows create readable previews from html-only bodies", () => {
  const state = buildWeddingVendorQuoteThreadProofMessageState(message({
    content: {
      subject: "Floral quote",
      html: "<p>Hi Chloe,</p><p>Thanks &amp; please send the contract.</p>",
    },
  }));

  assert.ok(state);
  assert.equal(state.body, "Hi Chloe,\nThanks & please send the contract.");
});

test("vendor quote proof rows bound oversized fallback payloads", () => {
  const state = buildWeddingVendorQuoteThreadProofMessageState(message({
    content: {
      long_field: "x".repeat(600),
    },
  }));

  assert.ok(state);
  assert.ok(state.body.length <= 323);
  assert.ok(state.body.endsWith("..."));
});

test("vendor quote proof rows expose Gmail receipt facts for the sent proof drawer", () => {
  const state = buildWeddingVendorQuoteThreadProofMessageState(message({
    id: "receipt",
    type: "approval_receipt",
    kind: "receipt",
    content: {
      title: "Send reply to Chloe's Florals",
      external_id: "gmail-msg-1",
      provider: "gmail",
      external_delivery_performed: true,
      client_message_id: "local-msg-1",
      delivery: {
        to: ["hello@chloes.example"],
        subject: "Floral quote",
        inReplyTo: "<quote-message@example.com>",
        references: ["<quote-message@example.com>", "afp-quote-message-1"],
      },
      markdown: "Sent with Gmail after explicit wedding approval.",
    },
  }));

  assert.ok(state);
  assert.equal(state.isSentProof, true);
  assert.equal(state.proofKind, "receipt");
  assert.equal(state.providerLabel, "gmail");
  assert.equal(state.receiptId, "gmail-msg-1");
  assert.equal(state.receiptIdLabel, "External receipt");
  assert.equal(state.clientMessageId, "local-msg-1");
  assert.equal(state.sentToLabel, "hello@chloes.example");
  assert.equal(state.subjectLabel, "Floral quote");
  assert.equal(state.inReplyToLabel, "<quote-message@example.com>");
  assert.equal(state.deliveryReferencesLabel, "<quote-message@example.com>, afp-quote-message-1");
});

test("vendor quote proof rows accept string delivery recipients", () => {
  const state = buildWeddingVendorQuoteThreadProofMessageState(message({
    id: "receipt",
    type: "approval_receipt",
    kind: "receipt",
    content: {
      external_id: "gmail-msg-string-to",
      provider: "gmail",
      external_delivery_performed: true,
      delivery: {
        to: "hello@chloes.example",
        subject: "Floral quote",
      },
      markdown: "Sent.",
    },
  }));

  assert.ok(state);
  assert.equal(state.sentToLabel, "hello@chloes.example");
  assert.equal(state.subjectLabel, "Floral quote");
});

test("vendor quote proof rows recover sent proof facts from metadata fallbacks", () => {
  const state = buildWeddingVendorQuoteThreadProofMessageState(message({
    id: "receipt",
    type: "approval_receipt",
    content: {
      markdown: "Sent.",
    },
    metadata: {
      provider: "gmail",
      provider_message_id: "gmail-msg-2",
      external_delivery_performed: true,
      client_message_id: "local-msg-2",
      recipient: "events@example.com",
      subject: "Venue quote",
      in_reply_to: "<venue-quote@example.com>",
      references: ["<venue-quote@example.com>", "afp-venue-quote-1"],
    },
  }));

  assert.ok(state);
  assert.equal(state.isSentProof, true);
  assert.equal(state.proofKind, "receipt");
  assert.equal(state.providerLabel, "gmail");
  assert.equal(state.receiptId, "gmail-msg-2");
  assert.equal(state.receiptIdLabel, "Provider message");
  assert.equal(state.clientMessageId, "local-msg-2");
  assert.equal(state.sentToLabel, "events@example.com");
  assert.equal(state.subjectLabel, "Venue quote");
  assert.equal(state.inReplyToLabel, "<venue-quote@example.com>");
  assert.equal(state.deliveryReferencesLabel, "<venue-quote@example.com>, afp-venue-quote-1");
});

test("vendor quote proof rows accept alternate durable receipt ids", () => {
  const providerReceipt = buildWeddingVendorQuoteThreadProofMessageState(message({
    id: "provider-receipt",
    type: "approval_receipt",
    content: {
      markdown: "Sent.",
      provider_receipt_id: "gmail-receipt-789",
      provider_label: "Gmail",
      external_delivery_performed: true,
    },
  }));
  const genericMessage = buildWeddingVendorQuoteThreadProofMessageState(message({
    id: "message-id-receipt",
    type: "approval_receipt",
    metadata: {
      message_id: "rfc822-message-789",
      provider_label: "Gmail",
      external_delivery_performed: true,
    },
  }));

  assert.ok(providerReceipt);
  assert.equal(providerReceipt.isSentProof, true);
  assert.equal(providerReceipt.proofKind, "receipt");
  assert.equal(providerReceipt.receiptId, "gmail-receipt-789");
  assert.equal(providerReceipt.receiptIdLabel, "Provider receipt");
  assert.equal(providerReceipt.providerLabel, "Gmail");
  assert.ok(genericMessage);
  assert.equal(genericMessage.isSentProof, true);
  assert.equal(genericMessage.proofKind, "receipt");
  assert.equal(genericMessage.receiptId, "rfc822-message-789");
  assert.equal(genericMessage.receiptIdLabel, "Message ID");
  assert.equal(genericMessage.providerLabel, "Gmail");
});

test("vendor quote proof rows do not mark explicit provider failures as sent proof", () => {
  const failedDelivery = buildWeddingVendorQuoteThreadProofMessageState(message({
    id: "receipt-failed-provider-delivery",
    type: "approval_receipt",
    kind: "receipt",
    content: {
      provider_message_id: "gmail-msg-failed",
      external_delivery_performed: false,
      missing_durable_provider_receipt: false,
      markdown: "Provider did not complete delivery.",
    },
  }));
  const missingDurableReceipt = buildWeddingVendorQuoteThreadProofMessageState(message({
    id: "receipt-missing-durable-provider-id",
    type: "approval_receipt",
    kind: "receipt",
    content: {
      provider_message_id: "gmail-msg-missing-durable",
      external_delivery_performed: true,
      missing_durable_provider_receipt: true,
      markdown: "Provider returned no durable receipt.",
    },
  }));
  const providerFailed = buildWeddingVendorQuoteThreadProofMessageState(message({
    id: "receipt-provider-result-false",
    type: "approval_receipt",
    kind: "receipt",
    metadata: {
      provider_message_id: "gmail-msg-provider-failed",
      provider_result_ok: false,
      external_delivery_performed: true,
      missing_durable_provider_receipt: false,
    },
  }));

  assert.ok(failedDelivery);
  assert.equal(failedDelivery.proofKind, "receipt");
  assert.equal(failedDelivery.receiptId, "gmail-msg-failed");
  assert.equal(failedDelivery.isSentProof, false);
  assert.ok(missingDurableReceipt);
  assert.equal(missingDurableReceipt.receiptId, "gmail-msg-missing-durable");
  assert.equal(missingDurableReceipt.isSentProof, false);
  assert.ok(providerFailed);
  assert.equal(providerFailed.receiptId, "gmail-msg-provider-failed");
  assert.equal(providerFailed.isSentProof, false);
});

test("vendor quote proof rows require explicit external delivery confirmation for sent proof", () => {
  const receiptWithoutDeliveryConfirmation = buildWeddingVendorQuoteThreadProofMessageState(message({
    id: "receipt-without-delivery-confirmation",
    type: "approval_receipt",
    kind: "receipt",
    content: {
      provider_message_id: "gmail-msg-unconfirmed",
      provider_result_ok: true,
      missing_durable_provider_receipt: false,
      markdown: "Receipt id exists, but delivery was not confirmed.",
    },
  }));

  assert.ok(receiptWithoutDeliveryConfirmation);
  assert.equal(receiptWithoutDeliveryConfirmation.proofKind, "receipt");
  assert.equal(receiptWithoutDeliveryConfirmation.receiptId, "gmail-msg-unconfirmed");
  assert.equal(receiptWithoutDeliveryConfirmation.isSentProof, false);
});

test("vendor quote proof rows recover delivery facts from projected receipt arrays", () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send florist reply",
    metadata: {
      weddingPlanId: "plan-1",
      responseWorkspaceId: "workspace-1",
      sourceResponseId: "response-1",
    },
    recipients: ["hello@chloes.example"],
    externalProvider: "Gmail",
    delivery: {
      channel: "email",
      to: ["hello@chloes.example"],
      subject: "Floral quote",
      text: "Thanks Chloe.",
      threadId: "wedding_vendor_quote:workspace-1:chloes-florals",
      inReplyTo: "<quote-message@example.com>",
      references: ["<quote-message@example.com>", "afp-quote-message-1"],
    },
    userApproved: true,
  });
  const receipt = buildWeddingApprovalReceiptState(request, "2026-09-27T02:00:00.000Z");
  const projected = weddingApprovalReceiptToVendorThreadAfpSendInput({
    ...receipt,
    metadata: {
      ...receipt.metadata,
      external_id: "gmail-msg-3",
      provider: "gmail",
      client_message_id: "local-msg-3",
      external_delivery_performed: true,
    },
  }, {
    threadId: "wedding_vendor_quote:workspace-1:chloes-florals",
    parentId: "draft-1",
  });
  assert.ok(projected);
  const state = buildWeddingVendorQuoteThreadProofMessageState({
    ...projected,
    id: "receipt",
    timestamp: "2026-09-27T02:00:00.000Z",
  });

  assert.ok(state);
  assert.equal(state.proofKind, "receipt");
  assert.equal(state.receiptId, "gmail-msg-3");
  assert.equal(state.clientMessageId, "local-msg-3");
  assert.equal(state.sentToLabel, "hello@chloes.example");
  assert.equal(state.subjectLabel, "Floral quote");
  assert.equal(state.inReplyToLabel, "<quote-message@example.com>");
  assert.equal(state.deliveryReferencesLabel, "<quote-message@example.com>, afp-quote-message-1");
});

test("vendor quote proof state maps every AFP message in order", () => {
  const rows = buildWeddingVendorQuoteThreadProofState([
    message({ id: "quote", type: "ledger", kind: "wedding_vendor_quote_received" }),
    message({ id: "draft", type: "email_draft", kind: "wedding_vendor_quote_reply_draft" }),
  ]);

  assert.deepEqual(rows.map((row) => row.id), ["quote", "draft"]);
});

test("vendor quote proof state filters unrelated AFP messages from the sent drawer", () => {
  const rows = buildWeddingVendorQuoteThreadProofState([
    message({ id: "quote", type: "ledger", kind: "wedding_vendor_quote_received" }),
    message({
      id: "noise",
      type: "note",
      kind: "ordinary_note",
      content: { title: "Unrelated note", text: "Do not show this in sent proof." },
    }),
    message({
      id: "receipt",
      type: "approval_receipt",
      kind: "receipt",
      content: { external_id: "gmail-msg-1", external_delivery_performed: true, markdown: "Sent." },
      metadata: { projection: "wedding_approval_receipt_to_vendor_thread_afp" },
    }),
  ]);

  assert.deepEqual(rows.map((row) => row.id), ["quote", "receipt"]);
  assert.deepEqual(rows.map((row) => row.proofKind), ["quote", "receipt"]);
});

test("vendor quote proof merge shows local receipts until saved proof arrives", () => {
  const savedQuote = message({
    id: "quote",
    type: "ledger",
    kind: "wedding_vendor_quote_received",
    timestamp: "2026-09-27T01:00:00.000Z",
  });
  const localReceipt = message({
    id: "local-receipt",
    type: "approval_receipt",
    kind: "receipt",
    timestamp: "2026-09-27T01:02:00.000Z",
    content: { external_id: "gmail-msg-1", external_delivery_performed: true, markdown: "Sent." },
    metadata: { projection: "wedding_approval_receipt_to_vendor_thread_afp" },
  });
  const savedReceipt = message({
    id: "saved-receipt",
    type: "approval_receipt",
    kind: "receipt",
    timestamp: "2026-09-27T01:03:00.000Z",
    content: { external_id: "gmail-msg-1", external_delivery_performed: true, markdown: "Sent from saved AFP." },
    metadata: { projection: "wedding_approval_receipt_to_vendor_thread_afp" },
  });

  assert.deepEqual(
    mergeWeddingVendorQuoteThreadProofMessages([savedQuote], [localReceipt]).map((item) => item.id),
    ["quote", "local-receipt"],
  );
  assert.deepEqual(
    mergeWeddingVendorQuoteThreadProofMessages([savedQuote, savedReceipt], [localReceipt]).map((item) => item.id),
    ["quote", "saved-receipt"],
  );
});

test("vendor quote proof merge dedupes alternate durable receipt ids", () => {
  const savedQuote = message({
    id: "quote",
    type: "ledger",
    kind: "wedding_vendor_quote_received",
    timestamp: "2026-09-27T01:00:00.000Z",
  });
  const localReceipt = message({
    id: "local-receipt",
    type: "approval_receipt",
    kind: "receipt",
    timestamp: "2026-09-27T01:02:00.000Z",
    content: { provider_receipt_id: "gmail-receipt-789", external_delivery_performed: true, markdown: "Sent." },
  });
  const savedReceipt = message({
    id: "saved-receipt",
    type: "approval_receipt",
    kind: "receipt",
    timestamp: "2026-09-27T01:03:00.000Z",
    metadata: {
      provider_receipt_id: "gmail-receipt-789",
      external_delivery_performed: true,
      projection: "wedding_approval_receipt_to_vendor_thread_afp",
    },
  });

  assert.deepEqual(
    mergeWeddingVendorQuoteThreadProofMessages([savedQuote, savedReceipt], [localReceipt]).map((item) => item.id),
    ["quote", "saved-receipt"],
  );
});

test("vendor quote proof merge dedupes receipt ids with provider casing differences", () => {
  const savedQuote = message({
    id: "quote",
    type: "ledger",
    kind: "wedding_vendor_quote_received",
    timestamp: "2026-09-27T01:00:00.000Z",
  });
  const localReceipt = message({
    id: "local-receipt",
    type: "approval_receipt",
    kind: "receipt",
    timestamp: "2026-09-27T01:02:00.000Z",
    content: { provider_message_id: " GMAIL-MSG-ABC ", external_delivery_performed: true, markdown: "Sent." },
  });
  const savedReceipt = message({
    id: "saved-receipt",
    type: "approval_receipt",
    kind: "receipt",
    timestamp: "2026-09-27T01:03:00.000Z",
    content: { provider_message_id: "gmail-msg-abc", external_delivery_performed: true, markdown: "Saved sent proof." },
    metadata: { projection: "wedding_approval_receipt_to_vendor_thread_afp" },
  });

  assert.deepEqual(
    mergeWeddingVendorQuoteThreadProofMessages([savedQuote, savedReceipt], [localReceipt]).map((item) => item.id),
    ["quote", "saved-receipt"],
  );
  assert.deepEqual(
    mergeWeddingVendorQuoteThreadProofMessages([savedQuote], [localReceipt, savedReceipt]).map((item) => item.id),
    ["quote", "local-receipt"],
  );
});

test("vendor quote proof merge does not let failed saved receipts suppress local sent proof", () => {
  const savedQuote = message({
    id: "quote",
    type: "ledger",
    kind: "wedding_vendor_quote_received",
    timestamp: "2026-09-27T01:00:00.000Z",
  });
  const failedSavedReceipt = message({
    id: "failed-saved-receipt",
    type: "approval_receipt",
    kind: "receipt",
    timestamp: "2026-09-27T01:02:00.000Z",
    content: {
      provider_message_id: "gmail-msg-proof",
      external_delivery_performed: false,
      markdown: "Provider did not complete delivery.",
    },
    metadata: { projection: "wedding_approval_receipt_to_vendor_thread_afp" },
  });
  const localSentReceipt = message({
    id: "local-sent-receipt",
    type: "approval_receipt",
    kind: "receipt",
    timestamp: "2026-09-27T01:03:00.000Z",
    content: {
      provider_message_id: "gmail-msg-proof",
      external_delivery_performed: true,
      missing_durable_provider_receipt: false,
      markdown: "Sent.",
    },
  });

  assert.deepEqual(
    mergeWeddingVendorQuoteThreadProofMessages([savedQuote, failedSavedReceipt], [localSentReceipt]).map((item) => item.id),
    ["quote", "failed-saved-receipt", "local-sent-receipt"],
  );
});

test("vendor quote proof drawer state leads with durable sent proof", () => {
  const messages = buildWeddingVendorQuoteThreadProofState([
    message({
      id: "quote",
      type: "ledger",
      kind: "wedding_vendor_quote_received",
      timestamp: "2026-09-27T01:00:00.000Z",
    }),
    message({
      id: "draft",
      type: "email_draft",
      kind: "wedding_vendor_quote_reply_draft",
      timestamp: "2026-09-27T01:01:00.000Z",
      content: {
        approval_request_id: "approval-1",
        subject: "Floral quote",
        text: "Thanks Chloe.",
        delivery_ready: true,
      },
    }),
    message({
      id: "receipt",
      type: "approval_receipt",
      kind: "receipt",
      timestamp: "2026-09-27T01:02:00.000Z",
      content: {
        provider_message_id: "gmail-msg-proof",
        external_delivery_performed: true,
        markdown: "Sent.",
      },
    }),
  ]);

  const state = buildWeddingVendorQuoteThreadProofDrawerState({
    vendorName: "Chloe's Florals",
    messages,
  });

  assert.equal(state.title, "What was sent to Chloe's Florals");
  assert.equal(state.statusLabel, "Sent proof found");
  assert.equal(state.statusTone, "success");
  assert.equal(state.quoteCount, 1);
  assert.equal(state.draftCount, 1);
  assert.equal(state.sentProofCount, 1);
  assert.equal(state.latestSentReceiptLabel, "gmail-msg-proof");
  assert.match(state.summary, /Provider message: gmail-msg-proof/i);
});

test("vendor quote proof drawer counts duplicate saved receipts once", () => {
  const messages = buildWeddingVendorQuoteThreadProofState([
    message({
      id: "receipt-1",
      type: "approval_receipt",
      kind: "receipt",
      timestamp: "2026-09-27T01:02:00.000Z",
      content: { provider_message_id: "GMAIL-MSG-PROOF", external_delivery_performed: true, markdown: "Sent." },
    }),
    message({
      id: "receipt-2",
      type: "approval_receipt",
      kind: "receipt",
      timestamp: "2026-09-27T01:03:00.000Z",
      content: { provider_message_id: "gmail-msg-proof", external_delivery_performed: true, markdown: "Saved sent proof." },
    }),
  ]);

  const state = buildWeddingVendorQuoteThreadProofDrawerState({
    vendorName: "Chloe's Florals",
    messages,
  });

  assert.equal(state.statusLabel, "Sent proof found");
  assert.equal(state.sentProofCount, 1);
  assert.equal(state.latestSentReceiptLabel, "gmail-msg-proof");
  assert.match(state.summary, /^A sent receipt is attached/i);
});

test("vendor quote proof drawer does not count failed provider receipts as sent proof", () => {
  const messages = buildWeddingVendorQuoteThreadProofState([
    message({
      id: "quote",
      type: "ledger",
      kind: "wedding_vendor_quote_received",
    }),
    message({
      id: "failed-receipt",
      type: "approval_receipt",
      kind: "receipt",
      content: {
        provider_message_id: "gmail-msg-failed",
        external_delivery_performed: false,
        missing_durable_provider_receipt: false,
        markdown: "Provider did not complete delivery.",
      },
    }),
  ]);

  const state = buildWeddingVendorQuoteThreadProofDrawerState({
    vendorName: "Chloe's Florals",
    messages,
  });

  assert.equal(messages[1]?.proofKind, "receipt");
  assert.equal(messages[1]?.receiptId, "gmail-msg-failed");
  assert.equal(messages[1]?.isSentProof, false);
  assert.equal(state.statusLabel, "No sent proof yet");
  assert.equal(state.statusTone, "warning");
  assert.equal(state.sentProofCount, 0);
  assert.equal(state.latestSentReceiptLabel, null);
  assert.match(state.summary, /no provider sent receipt is attached/i);
});

test("vendor quote proof drawer state distinguishes loading errors and missing receipts", () => {
  const draftOnly = buildWeddingVendorQuoteThreadProofState([
    message({
      id: "quote",
      type: "ledger",
      kind: "wedding_vendor_quote_received",
    }),
    message({
      id: "draft",
      type: "email_draft",
      kind: "wedding_vendor_quote_reply_draft",
      content: {
        approval_request_id: "approval-1",
        text: "Thanks Chloe.",
      },
    }),
  ]);
  const missingSentProof = buildWeddingVendorQuoteThreadProofDrawerState({
    vendorName: "Chloe's Florals",
    messages: draftOnly,
  });
  assert.equal(missingSentProof.statusLabel, "No sent proof yet");
  assert.equal(missingSentProof.statusTone, "warning");
  assert.match(missingSentProof.summary, /no provider sent receipt/i);

  const loading = buildWeddingVendorQuoteThreadProofDrawerState({
    vendorName: "Chloe's Florals",
    messages: [],
    loading: true,
  });
  assert.equal(loading.statusLabel, "Loading");
  assert.equal(loading.statusTone, "neutral");

  const errorWithLocalProof = buildWeddingVendorQuoteThreadProofDrawerState({
    vendorName: "Chloe's Florals",
    messages: [message({
      id: "local-receipt",
      type: "approval_receipt",
      content: {
        external_id: "gmail-msg-local",
        external_delivery_performed: true,
        markdown: "Sent.",
      },
    })].map(buildWeddingVendorQuoteThreadProofMessageState).filter((row): row is NonNullable<typeof row> => row !== null),
    error: "Network failed",
  });
  assert.equal(errorWithLocalProof.statusLabel, "Thread needs reload");
  assert.equal(errorWithLocalProof.statusTone, "warning");
  assert.equal(errorWithLocalProof.latestSentReceiptLabel, "gmail-msg-local");
  assert.match(errorWithLocalProof.summary, /local sent proof is still visible/i);
});

test("vendor quote local receipt proof uses live approval delivery thread", () => {
  const threadId = "wedding_vendor_quote:workspace-1:chloes-florals";
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send florist reply",
    metadata: {
      weddingPlanId: "plan-1",
      responseWorkspaceId: "workspace-1",
      sourceResponseId: "response-1",
    },
    recipients: ["hello@chloes.example"],
    delivery: {
      channel: "email",
      to: ["hello@chloes.example"],
      subject: "Floral quote",
      text: "Thanks Chloe.",
      threadId,
    },
    userApproved: true,
  });
  const receipt = buildWeddingApprovalReceiptState(request, "2026-09-27T02:00:00.000Z");
  const proof = weddingVendorQuoteLocalReceiptProofMessage({
    receipt: {
      ...receipt,
      metadata: {
        ...receipt.metadata,
        external_id: "gmail-msg-1",
        provider: "gmail",
        provider_message_id: "gmail-msg-1",
        client_message_id: "local-msg-1",
        external_delivery_performed: true,
      },
    },
    threadId,
  });

  assert.ok(proof);
  assert.equal(proof.thread_id, threadId);
  assert.equal(proof.id.startsWith("local-"), true);
  assert.equal(proof.parent_id, null);
  assert.equal(proof.content.provider_message_id, "gmail-msg-1");
  assert.equal(proof.content.client_message_id, "local-msg-1");
  assert.ok(proof.supertags?.includes("wedding_vendor_thread_receipt"));
});

test("vendor quote local receipt proof can parent to the latest saved draft before thread load", () => {
  const threadId = "wedding_vendor_quote:workspace-1:chloes-florals";
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send florist reply",
    metadata: {
      weddingPlanId: "plan-1",
      responseWorkspaceId: "workspace-1",
      sourceResponseId: "response-1",
    },
    recipients: ["hello@chloes.example"],
    delivery: {
      channel: "email",
      to: ["hello@chloes.example"],
      subject: "Floral quote",
      text: "Thanks Chloe.",
      threadId,
    },
    userApproved: true,
  });
  const receipt = buildWeddingApprovalReceiptState(request, "2026-09-27T02:00:00.000Z");
  const proof = weddingVendorQuoteLocalReceiptProofMessage({
    receipt: {
      ...receipt,
      metadata: {
        ...receipt.metadata,
        external_id: "gmail-msg-parented",
        external_delivery_performed: true,
      },
    },
    threadId,
    parentId: "draft-message-from-local-state",
  });

  assert.ok(proof);
  assert.equal(proof.parent_id, "draft-message-from-local-state");
});

test("vendor quote local receipt proof accepts provider metadata receipts without external id", () => {
  const threadId = "wedding_vendor_quote:workspace-1:chloes-florals";
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send florist reply",
    metadata: {
      weddingPlanId: "plan-1",
      responseWorkspaceId: "workspace-1",
      sourceResponseId: "response-1",
    },
    recipients: ["hello@chloes.example"],
    delivery: {
      channel: "email",
      to: ["hello@chloes.example"],
      subject: "Floral quote",
      text: "Thanks Chloe.",
      threadId,
    },
    userApproved: true,
  });
  const receipt = buildWeddingApprovalReceiptState(request, "2026-09-27T02:00:00.000Z");
  const proof = weddingVendorQuoteLocalReceiptProofMessage({
    receipt: {
      ...receipt,
      metadata: {
        ...receipt.metadata,
        provider: "gmail",
        provider_message_id: "gmail-msg-from-provider-metadata",
        external_delivery_performed: true,
      },
    },
    threadId,
  });

  assert.ok(proof);
  assert.equal(proof.content.provider_message_id, "gmail-msg-from-provider-metadata");
});

test("vendor quote local receipt proof rejects blocked receipts, mismatched threads, and receipt-only proof", () => {
  const threadId = "wedding_vendor_quote:workspace-1:chloes-florals";
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send florist reply",
    metadata: {
      weddingPlanId: "plan-1",
      responseWorkspaceId: "workspace-1",
      sourceResponseId: "response-1",
    },
    recipients: ["hello@chloes.example"],
    delivery: {
      channel: "email",
      to: ["hello@chloes.example"],
      subject: "Floral quote",
      text: "Thanks Chloe.",
      threadId,
    },
    userApproved: true,
  });
  const receipt = buildWeddingApprovalReceiptState(request, "2026-09-27T02:00:00.000Z");
  const registryRequest = buildWeddingApprovalRequestState({
    actionKind: "publish_registry",
    title: "Publish registry",
    metadata: {
      weddingPlanId: "plan-1",
      responseWorkspaceId: "workspace-1",
      sourceResponseId: "response-1",
    },
    userApproved: true,
  });
  const registryReceipt = buildWeddingApprovalReceiptState(registryRequest, "2026-09-27T02:00:00.000Z");

  assert.equal(weddingVendorQuoteLocalReceiptProofMessage({
    receipt: { ...receipt, status: "blocked" },
    threadId,
  }), null);
  assert.equal(weddingVendorQuoteLocalReceiptProofMessage({
    receipt,
    threadId: "wedding_vendor_quote:workspace-1:other-vendor",
  }), null);
  assert.equal(weddingVendorQuoteLocalReceiptProofMessage({
    receipt,
    threadId,
  }), null);
  assert.equal(weddingVendorQuoteLocalReceiptProofMessage({
    receipt: {
      ...receipt,
      metadata: {
        ...receipt.metadata,
        provider_message_id: "gmail-msg-failed",
        external_delivery_performed: false,
        missing_durable_provider_receipt: false,
      },
    },
    threadId,
  }), null);
  assert.equal(weddingVendorQuoteLocalReceiptProofMessage({
    receipt: {
      ...receipt,
      metadata: {
        ...receipt.metadata,
        provider_message_id: "gmail-msg-missing-durable",
        external_delivery_performed: true,
        missing_durable_provider_receipt: true,
      },
    },
    threadId,
  }), null);
  assert.equal(weddingVendorQuoteLocalReceiptProofMessage({
    receipt: {
      ...receipt,
      metadata: {
        ...receipt.metadata,
        provider_message_id: "gmail-msg-provider-failed",
        provider_result_ok: false,
        external_delivery_performed: true,
        missing_durable_provider_receipt: false,
      },
    },
    threadId,
  }), null);
  assert.equal(weddingVendorQuoteLocalReceiptProofMessage({
    receipt: {
      ...receipt,
      metadata: {
        ...receipt.metadata,
        delivery_thread_id: "",
        delivery: {
          threadId: "wedding_vendor_quote:workspace-1:other-vendor",
        },
        external_id: "gmail-msg-mismatch",
      },
    },
    threadId,
  }), null);
  assert.equal(weddingVendorQuoteLocalReceiptProofMessage({
    receipt: {
      ...registryReceipt,
      metadata: {
        ...registryReceipt.metadata,
        external_id: "registry-publish-1",
      },
    },
    threadId,
  }), null);
});
