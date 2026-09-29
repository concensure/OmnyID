import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import {
  buildWeddingVendorQuoteReplyFlowState,
  weddingVendorQuoteReplyDraftEditEffect,
  weddingVendorQuoteReplyDraftPersistenceState,
  weddingVendorQuoteReplyDraftSaveCompletionState,
  weddingVendorQuoteReplyDraftSyncState,
  weddingVendorQuoteReplyEditorDirtyState,
  weddingVendorQuoteReplyExecutionSelectionState,
  weddingVendorQuoteReplyRequestMatchState,
  weddingVendorQuoteReplyBusyLabelState,
  weddingVendorQuoteReplyContextualSurfaceState,
  weddingVendorQuoteReplyPendingSendRetryState,
  weddingVendorQuoteReplyPendingSendTokenState,
  weddingVendorQuoteReplyPresentationState,
  weddingVendorQuoteReplySendGateState,
} from "@/lib/weddingVendorQuoteReplyFlowState";

const quote: WeddingArtifactQuotePreview = {
  kind: "quote",
  vendorName: "Chloe's Florals",
  amount: 799,
  amountLabel: "AUD $799",
  currency: "AUD",
  budgetDeltaAmount: 200,
  budgetDeltaLabel: "$200 over budget",
  inclusions: ["Bridal bouquet", "Ceremony arrangements"],
  validUntil: "2026-10-15",
  attachmentUrl: "https://example.com/chloe-quote.pdf",
};

const metadata = {
  weddingPlanId: "plan-1",
  responseWorkspaceId: "workspace-1",
  sourceResponseId: "response-1",
};

test("vendor quote reply flow separates wording approval from budget acknowledgement", () => {
  const flow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: false,
  });

  assert.equal(flow.stage, "needs_budget_acknowledgement");
  assert.equal(flow.approvedWording, true);
  assert.equal(flow.budgetImpactAcknowledged, false);
  assert.equal(flow.canSend, false);
  assert.equal(flow.approvalRequest.userApproved, false);
  assert.ok(flow.approvalRequest.disclosureLines.some((line) => /Budget impact/i.test(line)));
  assert.equal(flow.recommendationLabel, "Ask for trade-offs before approving");
  assert.match(flow.recommendationRationale, /Bridal bouquet/);
  assert.match(flow.recommendationRationale, /\$200 over budget/);
  assert.ok(flow.recommendationWhyLabels.includes("Budget impact: $200 over budget"));
  assert.ok(flow.recommendationWhyLabels.some((label) => /Quote includes Bridal bouquet/i.test(label)));
  assert.ok(flow.recommendationWhyLabels.includes("Original quote attachment is linked but text extraction is not verified"));
  assert.match(flow.recommendationRationale, /has not been verified by OmnyID/i);
  assert.equal(flow.recommendationConfidenceLabel, "Confidence: developing");
  assert.equal(flow.semanticObject.stateLabel, "Confirm budget impact");
  assert.ok(flow.semanticObject.comparison?.rows.some((row) => row.id === "recommendation_rationale"));
});

test("vendor quote reply contextual surface exposes status recommendation why and dynamic action", () => {
  const flow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: false,
  });

  const surface = weddingVendorQuoteReplyContextualSurfaceState({ flow });
  assert.equal(surface.lifecycleStage, "decision_surfaced");
  assert.equal(surface.surfaceWeight, "full_card");
  assert.equal(surface.statusLabel, "Chloe's Florals sent a quote.");
  assert.equal(surface.recommendationLabel, "Ask for trade-offs before approving");
  assert.match(surface.rationaleLabel, /\$200 over budget/);
  assert.equal(surface.confidenceLabel, "Confidence: developing");
  assert.ok(surface.whyLabels.includes("Budget impact: $200 over budget"));
  assert.deepEqual(surface.primaryAction, {
    kind: "acknowledge_budget",
    label: "Confirm budget impact",
    enabled: true,
  });
  assert.deepEqual(surface.secondaryAction, {
    kind: "edit_reply",
    label: "Edit reply",
  });
});

test("vendor quote reply contextual surface collapses sent flow to receipt semantics", () => {
  const sentAt = "2026-09-27T03:30:00.000Z";
  const flow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      requestId: "approval-1",
      actionKind: "send_email",
      status: "executed",
      externalId: "gmail-msg-1",
      createdAt: sentAt,
      message: "Sent",
      receipt: {
        receiptId: "receipt-1",
        requestId: "approval-1",
        actionKind: "send_email",
        status: "executed",
        summary: "Sent",
        createdAt: sentAt,
        metadata: {
          external_delivery_performed: true,
          provider_label: "Gmail",
          provider_message_id: "gmail-msg-1",
        },
      },
    },
  });

  const surface = weddingVendorQuoteReplyContextualSurfaceState({ flow });
  assert.equal(surface.lifecycleStage, "resolved");
  assert.equal(surface.surfaceWeight, "receipt");
  assert.match(surface.statusLabel, /Sent to Chloe's Florals/i);
  assert.equal(surface.recommendationLabel, "Keep this as history");
  assert.equal(surface.confidenceLabel, "Proof recorded");
  assert.equal(surface.primaryAction.kind, "view_sent_log");
  assert.equal(surface.primaryAction.label, "View what was sent");
  assert.equal(surface.secondaryAction, null);
});

test("vendor quote reply recommendation handoff lowers confidence when evidence is thin", () => {
  const flow = buildWeddingVendorQuoteReplyFlowState({
    quote: {
      ...quote,
      budgetDeltaAmount: null,
      budgetDeltaLabel: null,
      inclusions: [],
      validUntil: null,
      attachmentUrl: null,
    },
    metadata,
    recipient: "",
    subject: "Floral quote",
    draftBody: "",
    approvedWording: false,
    budgetImpactAcknowledged: false,
  });

  assert.equal(flow.recommendationLabel, "Complete the reply details before sending");
  assert.ok(flow.recommendationWhyLabels.includes("Budget impact not measured yet"));
  assert.ok(flow.recommendationWhyLabels.includes("Inclusions need confirmation"));
  assert.ok(flow.recommendationWhyLabels.includes("No original quote attachment linked"));
  assert.ok(flow.recommendationWhyLabels.includes("Vendor email is missing"));
  assert.ok(flow.recommendationWhyLabels.includes("Reply wording is missing"));
  assert.equal(flow.recommendationConfidenceLabel, "Confidence: early");
});

test("vendor quote reply confidence is strong when original attachment text was extracted", () => {
  const flow = buildWeddingVendorQuoteReplyFlowState({
    quote: {
      ...quote,
      attachmentTextStatus: "extracted",
      attachmentEvidenceLabels: ["Original quote attachment text was extracted", "server document parser"],
    },
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: false,
  });

  assert.equal(flow.recommendationConfidenceLabel, "Confidence: strong");
  assert.ok(flow.recommendationWhyLabels.includes("Original quote attachment text was extracted; verify final terms in the file"));
  assert.match(flow.recommendationRationale, /attachment text was extracted/i);
});

test("vendor quote reply flow becomes send-ready only after both confirmations", () => {
  const flow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    quoteMessageId: "quote-message-1",
    draftMessageId: "draft-message-1",
    approvedWording: true,
    budgetImpactAcknowledged: true,
  });

  assert.equal(flow.stage, "ready_to_send");
  assert.equal(flow.approvedWording, true);
  assert.equal(flow.budgetImpactAcknowledged, true);
  assert.equal(flow.canSend, true);
  assert.equal(flow.approvalRequest.userApproved, true);
  assert.equal(flow.approvalRequest.canExecute, true);
  assert.equal(flow.approvalRequest.delivery?.channel, "email");
  assert.equal(flow.approvalRequest.delivery?.to[0], "hello@chloes.example");
  assert.equal(flow.approvalRequest.delivery?.subject, "Floral quote");
  assert.match(flow.approvalRequest.delivery?.text ?? "", /proceed/);
  assert.equal(flow.quoteMessageId, "quote-message-1");
  assert.equal(flow.draftMessageId, "draft-message-1");
  assert.deepEqual(flow.approvalRequest.delivery?.references, ["quote-message-1", "draft-message-1"]);
  assert.equal(flow.semanticObject.actions[0]?.label, "Send to Chloe's Florals");
  assert.equal(flow.semanticObject.actions[0]?.kind, "send_vendor_quote_reply");
  assert.equal(flow.semanticObject.actions[1]?.label, "Edit reply");
  assert.equal(flow.semanticObject.actions[1]?.kind, "edit_vendor_quote_reply");
});

test("vendor quote reply presentation only opens editor when wording work is required", () => {
  const draftReady = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: false,
    budgetImpactAcknowledged: false,
  });
  const needsBudget = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: false,
  });
  const readyToSend = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
  });

  const draftPresentation = weddingVendorQuoteReplyPresentationState({ flow: draftReady });
  assert.equal(draftPresentation.showReplyEditor, true);
  assert.equal(draftPresentation.eyebrowLabel, "Needs your review");
  assert.equal(draftPresentation.primaryActionKind, "approve_wording");
  assert.equal(draftPresentation.primaryActionLabel, "Approve wording");
  assert.equal(draftPresentation.secondaryActionKind, "view_quote");
  assert.equal(draftPresentation.secondaryActionLabel, "Open quote file");
  assert.equal(draftReady.semanticObject.actions[0]?.label, "Approve wording");
  assert.equal(draftReady.semanticObject.actions[0]?.kind, "approve_vendor_quote_reply_wording");
  assert.equal(draftReady.semanticObject.actions[1]?.label, "Open quote file");
  assert.equal(draftReady.semanticObject.actions[1]?.kind, "view_vendor_quote");
  assert.equal(draftPresentation.replySectionLabel, "Suggested reply - edit or send as-is");
  assert.match(draftPresentation.decisionPromptLabel, /Review the wording/i);

  const budgetPresentation = weddingVendorQuoteReplyPresentationState({ flow: needsBudget });
  assert.equal(budgetPresentation.showReplyEditor, false);
  assert.equal(budgetPresentation.eyebrowLabel, "Needs your decision");
  assert.equal(budgetPresentation.primaryActionKind, "acknowledge_budget");
  assert.equal(budgetPresentation.primaryActionLabel, "Confirm budget impact");
  assert.equal(budgetPresentation.secondaryActionKind, "edit_reply");
  assert.equal(budgetPresentation.secondaryActionLabel, "Edit reply");
  assert.equal(needsBudget.semanticObject.actions[0]?.label, "Confirm budget impact");
  assert.equal(needsBudget.semanticObject.actions[0]?.kind, "acknowledge_vendor_quote_budget");
  assert.equal(budgetPresentation.replySectionLabel, "Suggested reply reviewed");
  assert.match(budgetPresentation.decisionPromptLabel, /Confirm the budget impact/i);

  const sendPresentation = weddingVendorQuoteReplyPresentationState({ flow: readyToSend });
  assert.equal(sendPresentation.showReplyEditor, false);
  assert.equal(sendPresentation.eyebrowLabel, "Ready for your decision");
  assert.equal(sendPresentation.primaryActionKind, "send");
  assert.equal(sendPresentation.primaryActionLabel, "Send to Chloe's Florals");
  assert.equal(sendPresentation.secondaryActionKind, "edit_reply");
  assert.equal(sendPresentation.sendButtonLabel, "Send to Chloe's Florals");
  assert.match(sendPresentation.decisionPromptLabel, /send this reply now/i);
});

test("vendor quote reply presentation distinguishes inline quote details from attached quote files", () => {
  const inlineOnly = buildWeddingVendorQuoteReplyFlowState({
    quote: {
      ...quote,
      attachmentUrl: null,
    },
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: false,
    budgetImpactAcknowledged: false,
  });

  const presentation = weddingVendorQuoteReplyPresentationState({ flow: inlineOnly });
  assert.equal(presentation.secondaryActionKind, "view_quote");
  assert.equal(presentation.secondaryActionLabel, "Show quote details");
  assert.equal(inlineOnly.semanticObject.actions[1]?.label, "Show quote details");
});

test("vendor quote reply flow fails closed when stale approval lacks email delivery details", () => {
  const missingRecipient = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
  });

  assert.equal(missingRecipient.stage, "blocked");
  assert.equal(missingRecipient.canSend, false);
  assert.equal(missingRecipient.approvalRequest.canExecute, true);
  assert.equal(missingRecipient.approvalRequest.delivery, null);
  assert.match(missingRecipient.failureMessage ?? "", /email address/i);
  assert.match(missingRecipient.summary, /email address/i);

  const missingBody = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "",
    approvedWording: true,
    budgetImpactAcknowledged: true,
  });

  assert.equal(missingBody.stage, "blocked");
  assert.equal(missingBody.canSend, false);
  assert.equal(missingBody.approvalRequest.delivery, null);
  assert.match(missingBody.failureMessage ?? "", /reply wording/i);
});

test("vendor quote reply flow preserves undo and sent-proof states", () => {
  const undo = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    undoUntilIso: "2026-09-27T01:00:06.000Z",
  });

  assert.equal(undo.stage, "sending_undo_window");
  assert.equal(undo.undoUntilIso, "2026-09-27T01:00:06.000Z");

  const sent = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      requestId: undo.approvalRequest.id,
      actionKind: "send_email",
      status: "executed",
      canRetry: false,
      externalId: "gmail-message-123",
      message: "Sent.",
      receipt: {
        id: "receipt-1",
        requestId: undo.approvalRequest.id,
        actionKind: "send_email",
        title: "Send reply to Chloe's Florals",
        status: "executed",
        createdAt: "2026-09-27T01:00:07.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: {
          external_id: "gmail-message-123",
          external_delivery_performed: true,
        },
      },
    },
  });

  assert.equal(sent.stage, "sent");
  assert.equal(sent.sentReceiptId, "gmail-message-123");
  assert.equal(sent.execution?.requestId, undo.approvalRequest.id);
  assert.match(sent.sentConfirmationLabel ?? "", /Sent to Chloe's Florals/);
  assert.equal(sent.semanticObject.actions[0]?.label, "View what was sent");
  assert.equal(sent.semanticObject.actions[0]?.kind, "view_vendor_quote_reply_log");
  assert.equal(sent.semanticObject.actions.length, 1);
});

test("vendor quote reply flow ignores expired or malformed undo windows", () => {
  const expired = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    undoUntilIso: "2026-09-27T01:00:06.000Z",
    nowIso: "2026-09-27T01:00:07.000Z",
  });

  assert.equal(expired.stage, "ready_to_send");
  assert.equal(expired.undoUntilIso, null);
  assert.equal(expired.canSend, true);

  const malformed = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    undoUntilIso: "soon-ish",
    nowIso: "2026-09-27T01:00:07.000Z",
  });

  assert.equal(malformed.stage, "ready_to_send");
  assert.equal(malformed.undoUntilIso, null);
  assert.equal(malformed.canSend, true);

  const unrealisticFuture = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    undoUntilIso: "2026-09-28T01:00:07.000Z",
    nowIso: "2026-09-27T01:00:07.000Z",
  });

  assert.equal(unrealisticFuture.stage, "ready_to_send");
  assert.equal(unrealisticFuture.undoUntilIso, null);
  assert.equal(unrealisticFuture.canSend, true);
});

test("vendor quote reply pending send token is not consumed by clock expiry", () => {
  const token = "2026-09-27T01:00:06.000Z";

  assert.deepEqual(weddingVendorQuoteReplyPendingSendTokenState({
    expectedUndoUntilIso: token,
    currentUndoUntilIso: token,
  }), {
    stillCurrent: true,
  });

  assert.deepEqual(weddingVendorQuoteReplyPendingSendTokenState({
    expectedUndoUntilIso: token,
    currentUndoUntilIso: null,
  }), {
    stillCurrent: false,
  });

  assert.deepEqual(weddingVendorQuoteReplyPendingSendTokenState({
    expectedUndoUntilIso: token,
    currentUndoUntilIso: "2026-09-27T01:00:07.000Z",
  }), {
    stillCurrent: false,
  });
});

test("vendor quote reply busy labels distinguish active and waiting cards", () => {
  assert.deepEqual(weddingVendorQuoteReplyBusyLabelState({
    requestId: "request:chloe",
    runningRequestId: null,
  }), {
    label: null,
  });

  assert.deepEqual(weddingVendorQuoteReplyBusyLabelState({
    requestId: "request:chloe",
    runningRequestId: "request:chloe",
  }), {
    label: "Sending...",
  });

  assert.deepEqual(weddingVendorQuoteReplyBusyLabelState({
    requestId: "request:venue",
    runningRequestId: "request:chloe",
  }), {
    label: "Waiting...",
  });
});

test("vendor quote reply pending send retries while another approval is running", () => {
  assert.deepEqual(weddingVendorQuoteReplyPendingSendRetryState({
    approvalRunning: false,
    nowIso: "2026-09-27T01:00:06.000Z",
  }), {
    shouldRetry: false,
    nextUndoUntilIso: null,
    delayMs: 0,
    notice: null,
  });

  assert.deepEqual(weddingVendorQuoteReplyPendingSendRetryState({
    approvalRunning: true,
    nowIso: "2026-09-27T01:00:06.000Z",
  }), {
    shouldRetry: true,
    nextUndoUntilIso: "2026-09-27T01:00:07.000Z",
    delayMs: 1000,
    notice: "Another approval is finishing. This reply will send next; Undo still works.",
  });
});

test("vendor quote reply flow requires confirmed delivery and a durable provider receipt before showing sent", () => {
  const providerMetadataConfirmed = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      requestId: "wedding_vendor_quote_reply:wedding_vendor_quote_workspace_1_chloes_florals_floral_quote:send",
      actionKind: "send_email",
      status: "executed",
      canRetry: false,
      externalId: null,
      message: "Sent.",
      receipt: {
        id: "local-receipt-1",
        requestId: "wedding_vendor_quote_reply:wedding_vendor_quote_workspace_1_chloes_florals_floral_quote:send",
        actionKind: "send_email",
        title: "Send reply to Chloe's Florals",
        status: "executed",
        createdAt: "2026-09-27T01:00:07.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: {
          provider_message_id: "gmail-message-from-metadata",
          external_delivery_performed: true,
        },
      },
    },
  });

  assert.equal(providerMetadataConfirmed.stage, "sent");
  assert.equal(providerMetadataConfirmed.sentReceiptId, "gmail-message-from-metadata");
  assert.equal(providerMetadataConfirmed.execution?.receipt.id, "local-receipt-1");

  const unconfirmedDelivery = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      requestId: "wedding_vendor_quote_reply:wedding_vendor_quote_workspace_1_chloes_florals_floral_quote:send",
      actionKind: "send_email",
      status: "executed",
      canRetry: false,
      externalId: null,
      message: "Sent.",
      receipt: {
        id: "local-receipt-unconfirmed",
        requestId: "wedding_vendor_quote_reply:wedding_vendor_quote_workspace_1_chloes_florals_floral_quote:send",
        actionKind: "send_email",
        title: "Send reply to Chloe's Florals",
        status: "executed",
        createdAt: "2026-09-27T01:00:07.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: { provider_message_id: "gmail-message-from-metadata" },
      },
    },
  });

  assert.equal(unconfirmedDelivery.stage, "blocked");
  assert.equal(unconfirmedDelivery.sentReceiptId, null);
  assert.match(unconfirmedDelivery.failureMessage ?? "", /missing a provider receipt/i);

  const missingProviderReceipt = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      requestId: "wedding_vendor_quote_reply:wedding_vendor_quote_workspace_1_chloes_florals_floral_quote:send",
      actionKind: "send_email",
      status: "executed",
      canRetry: false,
      externalId: null,
      message: "Sent.",
      receipt: {
        id: "local-receipt-only",
        requestId: "wedding_vendor_quote_reply:wedding_vendor_quote_workspace_1_chloes_florals_floral_quote:send",
        actionKind: "send_email",
        title: "Send reply to Chloe's Florals",
        status: "executed",
        createdAt: "2026-09-27T01:00:07.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: {},
      },
    },
  });

  assert.equal(missingProviderReceipt.stage, "blocked");
  assert.equal(missingProviderReceipt.sentReceiptId, null);
  assert.equal(missingProviderReceipt.canSend, false);
  assert.match(missingProviderReceipt.failureMessage ?? "", /missing a provider receipt/i);
  assert.equal(missingProviderReceipt.semanticObject.stateLabel, "Needs attention");
  assert.equal(weddingVendorQuoteReplyPresentationState({
    flow: missingProviderReceipt,
  }).sendButtonLabel, "Send unavailable");
});

test("vendor quote reply flow only marks executed email receipts as sent", () => {
  const calendarExecution = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      requestId: "calendar-request",
      actionKind: "create_external_calendar_event",
      status: "executed",
      canRetry: false,
      externalId: "gcal-event-123",
      message: "Calendar event created.",
      receipt: {
        id: "calendar-receipt",
        requestId: "calendar-request",
        actionKind: "create_external_calendar_event",
        title: "Create venue tour",
        status: "executed",
        createdAt: "2026-09-27T01:00:07.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: { external_id: "gcal-event-123" },
      },
    },
  });
  const blockedReceipt = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      requestId: "email-request",
      actionKind: "send_email",
      status: "executed",
      canRetry: false,
      externalId: "gmail-message-123",
      message: "Sent.",
      receipt: {
        id: "email-receipt",
        requestId: "email-request",
        actionKind: "send_email",
        title: "Send reply to Chloe's Florals",
        status: "blocked",
        createdAt: "2026-09-27T01:00:07.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: {
          external_id: "gmail-message-123",
          external_delivery_performed: true,
        },
      },
    },
  });

  assert.equal(calendarExecution.stage, "blocked");
  assert.equal(calendarExecution.sentReceiptId, null);
  assert.match(calendarExecution.failureMessage ?? "", /missing a provider receipt/i);
  assert.equal(blockedReceipt.stage, "blocked");
  assert.equal(blockedReceipt.sentReceiptId, null);
  assert.match(blockedReceipt.failureMessage ?? "", /missing a provider receipt/i);
});

test("vendor quote reply flow does not mark failed provider receipts as sent", () => {
  const baseExecution = {
    requestId: "email-request",
    actionKind: "send_email" as const,
    status: "executed" as const,
    canRetry: false,
    externalId: "gmail-message-123",
    message: "Sent.",
    receipt: {
      id: "email-receipt",
      requestId: "email-request",
      actionKind: "send_email" as const,
      title: "Send reply to Chloe's Florals",
      status: "executed" as const,
      createdAt: "2026-09-27T01:00:07.000Z",
      disclosureLines: [],
      riskLabels: [],
      metadata: { external_id: "gmail-message-123" },
    },
  };
  const failedDelivery = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      ...baseExecution,
      receipt: {
        ...baseExecution.receipt,
        metadata: {
          ...baseExecution.receipt.metadata,
          external_delivery_performed: false,
          missing_durable_provider_receipt: false,
        },
      },
    },
  });
  const missingDurableReceipt = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      ...baseExecution,
      receipt: {
        ...baseExecution.receipt,
        metadata: {
          ...baseExecution.receipt.metadata,
          external_delivery_performed: true,
          missing_durable_provider_receipt: true,
        },
      },
    },
  });
  const providerResultFailed = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      ...baseExecution,
      receipt: {
        ...baseExecution.receipt,
        metadata: {
          ...baseExecution.receipt.metadata,
          provider_result_ok: false,
          external_delivery_performed: true,
          missing_durable_provider_receipt: false,
        },
      },
    },
  });

  for (const flow of [failedDelivery, missingDurableReceipt, providerResultFailed]) {
    assert.equal(flow.stage, "blocked");
    assert.equal(flow.sentReceiptId, null);
    assert.match(flow.failureMessage ?? "", /missing a provider receipt/i);
    assert.equal(flow.semanticObject.stateLabel, "Needs attention");
  }
});

test("vendor quote reply flow suppresses malformed sent receipt timestamps", () => {
  const sent = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      requestId: "email-request",
      actionKind: "send_email",
      status: "executed",
      canRetry: false,
      externalId: "gmail-message-123",
      message: "Sent.",
      receipt: {
        id: "email-receipt",
        requestId: "email-request",
        actionKind: "send_email",
        title: "Send reply to Chloe's Florals",
        status: "executed",
        createdAt: "not-a-date",
        disclosureLines: [],
        riskLabels: [],
        metadata: {
          external_id: "gmail-message-123",
          external_delivery_performed: true,
        },
      },
    },
  });

  assert.equal(sent.stage, "sent");
  assert.equal(sent.sentConfirmationLabel, "Sent to Chloe's Florals.");
  assert.doesNotMatch(sent.summary, /not-a-date/);
});

test("vendor quote reply flow preserves provider failure messages without hiding the draft", () => {
  const failed = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      requestId: "wedding_vendor_quote_reply:wedding_vendor_quote_workspace_1_chloes_florals_floral_quote:send",
      actionKind: "send_email",
      status: "failed",
      canRetry: true,
      externalId: null,
      message: "Gmail token expired. Reconnect Gmail before sending.",
      receipt: {
        id: "receipt-1",
        requestId: "wedding_vendor_quote_reply:wedding_vendor_quote_workspace_1_chloes_florals_floral_quote:send",
        actionKind: "send_email",
        title: "Send reply to Chloe's Florals",
        status: "blocked",
        createdAt: "2026-09-27T02:00:00.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: {
          blocked_reason: "Gmail token expired. Reconnect Gmail before sending.",
        },
      },
    },
  });

  assert.equal(failed.stage, "blocked");
  assert.equal(failed.canSend, true);
  assert.equal(failed.draftBody, "Thanks Chloe, we would like to proceed.");
  assert.equal(failed.failureMessage, "Gmail token expired. Reconnect Gmail before sending.");
  assert.match(failed.summary, /Gmail token expired/i);
  assert.equal(failed.semanticObject.stateLabel, "Needs attention");
  assert.equal(weddingVendorQuoteReplyPresentationState({ flow: failed }).primaryActionKind, "send");
  assert.equal(weddingVendorQuoteReplyPresentationState({ flow: failed }).primaryActionLabel, "Try sending again");
  assert.equal(failed.semanticObject.actions[0]?.label, "Try sending again");
  assert.equal(failed.semanticObject.actions[0]?.kind, "send_vendor_quote_reply");

  const retrying = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: failed.draftBody,
    approvedWording: true,
    budgetImpactAcknowledged: true,
    undoUntilIso: "2026-09-27T02:00:06.000Z",
    execution: {
      requestId: failed.approvalRequest.id,
      actionKind: "send_email",
      status: "failed",
      canRetry: true,
      externalId: null,
      message: "Gmail token expired. Reconnect Gmail before sending.",
      receipt: {
        id: "receipt-1",
        requestId: failed.approvalRequest.id,
        actionKind: "send_email",
        title: "Send reply to Chloe's Florals",
        status: "blocked",
        createdAt: "2026-09-27T02:00:00.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: {
          blocked_reason: "Gmail token expired. Reconnect Gmail before sending.",
        },
      },
    },
  });

  assert.equal(retrying.stage, "sending_undo_window");
  assert.equal(retrying.canSend, false);
});

test("vendor quote draft edits revoke stale wording approval and provider failure state", () => {
  assert.deepEqual(weddingVendorQuoteReplyDraftEditEffect({
    previousDraft: "Thanks Chloe.",
    nextDraft: "Thanks Chloe.",
    approvedWording: true,
    hadExecution: true,
  }), {
    changed: false,
    approvedWording: true,
    clearExecution: false,
  });

  assert.deepEqual(weddingVendorQuoteReplyDraftEditEffect({
    previousDraft: "Thanks Chloe.",
    nextDraft: "Thanks Chloe, please confirm the delivery window.",
    approvedWording: true,
    hadExecution: true,
  }), {
    changed: true,
    approvedWording: false,
    clearExecution: true,
  });
});

test("vendor quote execution selection suppresses stale persisted execution after edits", () => {
  const persisted = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      requestId: "request:persisted",
      actionKind: "send_email",
      status: "blocked",
      canRetry: true,
      externalId: null,
      message: "Gmail token expired.",
      receipt: {
        id: "receipt:persisted",
        requestId: "request:persisted",
        actionKind: "send_email",
        title: "Send reply to Chloe's Florals",
        status: "blocked",
        createdAt: "2026-09-27T01:00:07.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: {},
      },
    },
  }).execution;
  const local = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, please confirm delivery.",
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution: {
      requestId: "request:local",
      actionKind: "send_email",
      status: "executed",
      canRetry: false,
      externalId: "gmail-local",
      message: "Sent.",
      receipt: {
        id: "receipt:local",
        requestId: "request:local",
        actionKind: "send_email",
        title: "Send reply to Chloe's Florals",
        status: "executed",
        createdAt: "2026-09-27T01:01:07.000Z",
        disclosureLines: [],
        riskLabels: [],
        metadata: {
          external_id: "gmail-local",
          external_delivery_performed: true,
        },
      },
    },
  }).execution;

  assert.equal(weddingVendorQuoteReplyExecutionSelectionState({
    persistedExecution: persisted,
  }).execution?.requestId, "request:persisted");
  assert.equal(weddingVendorQuoteReplyExecutionSelectionState({
    persistedExecution: persisted,
    cleared: true,
  }).execution, null);
  assert.equal(weddingVendorQuoteReplyExecutionSelectionState({
    localExecution: local,
    persistedExecution: persisted,
    cleared: true,
  }).execution?.requestId, "request:local");
});

test("vendor quote request matching only clears the active receipt for that request", () => {
  assert.deepEqual(weddingVendorQuoteReplyRequestMatchState({
    requestId: "request:chloe",
    currentRequestId: "request:chloe",
  }), {
    matches: true,
  });

  assert.deepEqual(weddingVendorQuoteReplyRequestMatchState({
    requestId: "request:chloe",
    currentRequestId: "request:venue",
  }), {
    matches: false,
  });

  assert.deepEqual(weddingVendorQuoteReplyRequestMatchState({
    requestId: "request:chloe",
    currentRequestId: null,
  }), {
    matches: false,
  });
});

test("vendor quote editor dirty state blocks sending until edited wording is saved", () => {
  assert.deepEqual(weddingVendorQuoteReplyEditorDirtyState({
    savedDraft: "Thanks Chloe.",
    editorDraft: "Thanks Chloe.",
    approvedWording: true,
  }), {
    dirty: false,
    approvalMatchesSavedDraft: true,
    sendBlockedReason: null,
  });

  const dirty = weddingVendorQuoteReplyEditorDirtyState({
    savedDraft: "Thanks Chloe.",
    editorDraft: "Thanks Chloe, please confirm delivery.",
    approvedWording: true,
  });

  assert.equal(dirty.dirty, true);
  assert.equal(dirty.approvalMatchesSavedDraft, false);
  assert.match(dirty.sendBlockedReason ?? "", /Save the edited reply before sending/i);
});

test("vendor quote draft sync adopts saved changes without clobbering active edits", () => {
  assert.deepEqual(weddingVendorQuoteReplyDraftSyncState({
    currentDraft: "Thanks Chloe.",
    previousSavedDraft: "Thanks Chloe.",
    nextSavedDraft: "Thanks Chloe, saved wording.",
  }), {
    draft: "Thanks Chloe, saved wording.",
    syncedDraftBody: "Thanks Chloe, saved wording.",
    adoptedSavedDraft: true,
  });

  assert.deepEqual(weddingVendorQuoteReplyDraftSyncState({
    currentDraft: "Thanks Chloe, local unsaved edit.",
    previousSavedDraft: "Thanks Chloe.",
    nextSavedDraft: "Thanks Chloe, saved wording.",
  }), {
    draft: "Thanks Chloe, local unsaved edit.",
    syncedDraftBody: "Thanks Chloe, saved wording.",
    adoptedSavedDraft: false,
  });
});

test("vendor quote draft persistence blocks approval and sending for local-only wording", () => {
  assert.deepEqual(weddingVendorQuoteReplyDraftPersistenceState({ status: "saved" }), {
    status: "saved",
    tone: "success",
    label: "Reply saved",
    detail: "The latest wording is saved to this wedding record.",
    blocksApproval: false,
    blocksExternalSend: false,
  });

  const localOnly = weddingVendorQuoteReplyDraftPersistenceState({ status: "local_only" });

  assert.equal(localOnly.tone, "warning");
  assert.equal(localOnly.blocksApproval, true);
  assert.equal(localOnly.blocksExternalSend, true);
  assert.match(localOnly.detail, /durable thread history/i);
});

test("vendor quote draft save completion ignores stale async results", () => {
  assert.deepEqual(weddingVendorQuoteReplyDraftSaveCompletionState({
    attemptId: 2,
    currentAttemptId: 2,
  }), {
    shouldApply: true,
  });

  assert.deepEqual(weddingVendorQuoteReplyDraftSaveCompletionState({
    attemptId: 1,
    currentAttemptId: 2,
  }), {
    shouldApply: false,
  });

  assert.deepEqual(weddingVendorQuoteReplyDraftSaveCompletionState({
    attemptId: null,
    currentAttemptId: 2,
  }), {
    shouldApply: false,
  });
});

test("vendor quote send gate blocks dirty drafts, local-only drafts, and provider gaps", () => {
  const readyPersistence = weddingVendorQuoteReplyDraftPersistenceState({ status: "saved" });
  const localOnly = weddingVendorQuoteReplyDraftPersistenceState({ status: "local_only" });

  assert.deepEqual(weddingVendorQuoteReplySendGateState({
    flowCanSend: true,
    dirtyState: weddingVendorQuoteReplyEditorDirtyState({
      savedDraft: "Thanks Chloe.",
      editorDraft: "Thanks Chloe, please confirm delivery.",
    }),
    draftPersistence: readyPersistence,
  }), {
    canStartSend: false,
    blockedBy: "dirty_draft",
    blockedReason: "Save the edited reply before sending so approval applies to the latest wording.",
  });

  assert.equal(weddingVendorQuoteReplySendGateState({
    flowCanSend: true,
    draftPersistence: localOnly,
  }).blockedBy, "draft_persistence");

  assert.deepEqual(weddingVendorQuoteReplySendGateState({
    flowCanSend: true,
    draftPersistence: readyPersistence,
    providerReadiness: {
      capability: "email",
      requiredProvider: "Gmail or email provider",
      credentialStatus: "missing",
      executorStatus: "available",
      productionReady: false,
      setupView: "email",
      summary: "Gmail or email provider needs setup",
      detail: "Connect the app account before this can be sent or synced outside OmnyID.",
    },
  }), {
    canStartSend: false,
    blockedBy: "provider",
    blockedReason: "Connect the app account before this can be sent or synced outside OmnyID.",
  });

  assert.deepEqual(weddingVendorQuoteReplySendGateState({
    flowCanSend: true,
    draftPersistence: readyPersistence,
    providerReadiness: {
      capability: "email",
      requiredProvider: "Gmail or email provider",
      credentialStatus: "connected",
      executorStatus: "available",
      productionReady: true,
      setupView: "email",
      summary: "Gmail or email provider ready",
      detail: "The connected app is ready.",
    },
  }), {
    canStartSend: true,
    blockedBy: null,
    blockedReason: null,
  });
});
