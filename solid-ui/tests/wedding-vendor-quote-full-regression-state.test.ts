// @locs-version: 1.0
import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import { runWeddingApprovalExecution } from "@/lib/weddingApprovalExecutionState";
import { weddingApprovalReceiptToVendorThreadAfpSendInput } from "@/lib/weddingApprovalReceiptAfpProjectionState";
import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import { buildWeddingVendorQuoteProofRoundTripState } from "@/lib/weddingVendorQuoteProofRoundTripState";
import { buildWeddingVendorQuoteProviderSendVerificationState } from "@/lib/weddingVendorQuoteProviderSendVerificationState";
import { weddingVendorQuoteReceiptPersistenceState } from "@/lib/weddingVendorQuoteReceiptPersistenceState";
import { buildWeddingVendorQuoteReplyProductionReadinessState } from "@/lib/weddingVendorQuoteReplyProductionReadinessState";
import { buildWeddingVendorQuoteReplyUiReadinessState } from "@/lib/weddingVendorQuoteReplyUiReadinessState";
import {
  buildWeddingVendorQuoteReplyFlowState,
  weddingVendorQuoteDraftAfpSendInput,
  weddingVendorQuoteIncomingAfpMessage,
  weddingVendorQuoteReplyDraftEditEffect,
  weddingVendorQuoteReplyDraftPersistenceState,
  weddingVendorQuoteReplyEditorDirtyState,
  weddingVendorQuoteReplyProofPersistenceState,
  weddingVendorQuoteReplyScheduledSendGateFlowState,
  weddingVendorQuoteReplyScheduledSendResolutionState,
  weddingVendorQuoteReplySendGateState,
} from "@/lib/weddingVendorQuoteReplyFlowState";
import { weddingVendorQuoteReceiptParentId } from "@/lib/weddingVendorQuoteThreadProofState";

const quote: WeddingArtifactQuotePreview = {
  kind: "quote",
  vendorName: "Chloe's Florals",
  amount: 4200,
  amountLabel: "AUD $4,200",
  currency: "AUD",
  budgetDeltaAmount: 350,
  budgetDeltaLabel: "$350 over budget",
  inclusions: ["Bridal bouquet", "Ceremony arrangements"],
  validUntil: "2026-10-15",
  attachmentUrl: "https://example.com/chloe-quote.pdf",
};

const metadata = {
  weddingPlanId: "plan-1",
  responseWorkspaceId: "workspace-1",
  sourceResponseId: "response-1",
};

function messageFromSendInput(input: SendAfpMessageInput, fallbackId: string): AfpMessage {
  const metadataId = typeof input.metadata?.id === "string" ? input.metadata.id : "";
  return {
    id: metadataId || fallbackId,
    thread_id: input.thread_id,
    parent_id: input.parent_id ?? null,
    from: input.from,
    to: input.to,
    timestamp: input.timestamp ?? "2026-09-27T02:00:00.000Z",
    type: input.type,
    kind: input.kind ?? null,
    subtype: input.subtype ?? null,
    content: input.content && typeof input.content === "object" && !Array.isArray(input.content)
      ? input.content as Record<string, unknown>
      : {},
    views: input.views ?? [],
    attachments: input.attachments ?? [],
    references: input.references ?? [],
    supertags: input.supertags ?? [],
    metadata: input.metadata ?? {},
  };
}

test("vendor quote inline reply regression covers edit save approvals undo send and proof drawer reconstruction", async () => {
  const incomingQuote = weddingVendorQuoteIncomingAfpMessage({
    quote,
    metadata,
    subject: "Floral quote",
    createdAt: "2026-09-27T02:00:00.000Z",
  });
  const initialFlow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
    quoteMessageId: incomingQuote.id,
    createdAt: "2026-09-27T02:00:01.000Z",
  });

  assert.equal(initialFlow.stage, "draft_ready");
  assert.equal(initialFlow.canSend, false);

  const editedBody = "Thanks Chloe, we would like to proceed. Please send the contract and payment schedule.";
  const editEffect = weddingVendorQuoteReplyDraftEditEffect({
    previousDraft: initialFlow.draftBody,
    nextDraft: editedBody,
    approvedWording: true,
  });
  assert.deepEqual(editEffect, {
    changed: true,
    approvedWording: false,
    clearExecution: false,
  });

  const dirty = weddingVendorQuoteReplyEditorDirtyState({
    savedDraft: initialFlow.draftBody,
    editorDraft: editedBody,
    approvedWording: false,
  });
  assert.equal(dirty.dirty, true);
  assert.equal(weddingVendorQuoteReplySendGateState({
    flowCanSend: true,
    dirtyState: dirty,
  }).blockedBy, "dirty_draft");

  const savedFlow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: editedBody,
    quoteMessageId: incomingQuote.id,
    createdAt: "2026-09-27T02:00:02.000Z",
  });
  const draftSendInput = weddingVendorQuoteDraftAfpSendInput({
    flow: savedFlow,
    recipient: savedFlow.recipient,
    subject: savedFlow.subject,
    body: editedBody,
    parentId: incomingQuote.id,
    createdAt: "2026-09-27T02:00:03.000Z",
  });
  const savedDraft = messageFromSendInput(draftSendInput, "draft");

  assert.equal(savedDraft.thread_id, savedFlow.threadId);
  assert.equal(savedDraft.parent_id, incomingQuote.id);
  assert.equal(savedDraft.content.delivery_ready, true);

  const wordingApprovedFlow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: editedBody,
    quoteMessageId: incomingQuote.id,
    draftMessageId: savedDraft.id,
    approvedWording: true,
    budgetImpactAcknowledged: false,
  });
  assert.equal(wordingApprovedFlow.stage, "needs_budget_acknowledgement");

  const sendReadyFlow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: editedBody,
    quoteMessageId: incomingQuote.id,
    draftMessageId: savedDraft.id,
    approvedWording: true,
    budgetImpactAcknowledged: true,
  });
  const sendGate = weddingVendorQuoteReplySendGateState({
    flowCanSend: sendReadyFlow.canSend,
    draftPersistence: weddingVendorQuoteReplyDraftPersistenceState({ status: "saved" }),
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
  });
  assert.deepEqual(sendGate, {
    canStartSend: true,
    blockedBy: null,
    blockedReason: null,
  });

  const undoFlow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: editedBody,
    quoteMessageId: incomingQuote.id,
    draftMessageId: savedDraft.id,
    approvedWording: true,
    budgetImpactAcknowledged: true,
    undoUntilIso: "2026-09-27T02:00:10.000Z",
    nowIso: "2026-09-27T02:00:05.000Z",
  });
  assert.equal(undoFlow.stage, "sending_undo_window");
  assert.equal(weddingVendorQuoteReplyScheduledSendResolutionState({
    flow: undoFlow,
    sendGate: weddingVendorQuoteReplySendGateState({
      flowCanSend: weddingVendorQuoteReplyScheduledSendGateFlowState({ flow: undoFlow }).flowCanSend,
      draftPersistence: weddingVendorQuoteReplyDraftPersistenceState({ status: "saved" }),
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
    }),
  }).canExecute, true);

  const cancelledFlow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: editedBody,
    quoteMessageId: incomingQuote.id,
    draftMessageId: savedDraft.id,
    approvedWording: true,
    budgetImpactAcknowledged: true,
    nowIso: "2026-09-27T02:00:06.000Z",
  });
  assert.equal(cancelledFlow.stage, "ready_to_send");

  const execution = await runWeddingApprovalExecution({
    request: sendReadyFlow.approvalRequest,
    nowIso: "2026-09-27T02:00:11.000Z",
    handlers: {
      send_email: (request) => ({
        ok: true,
        externalId: "gmail-message-quote-123",
        message: "Sent with Gmail.",
        metadata: {
          provider: "gmail",
          provider_executor_connected: true,
          provider_executor_mode: "live",
          provider_executor_status: "available",
          provider_message_id: "gmail-message-quote-123",
          provider_result_ok: true,
          external_delivery_performed: true,
          missing_durable_provider_receipt: false,
          delivery_recipients: request.delivery?.to ?? [],
          delivery_subject: request.delivery?.subject,
          delivery_thread_id: request.delivery?.threadId,
          delivery_in_reply_to: savedDraft.id,
          delivery_references: [incomingQuote.id, savedDraft.id],
        },
      }),
    },
  });
  assert.equal(execution.status, "executed");
  assert.equal(execution.externalId, "gmail-message-quote-123");

  const sentFlow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: editedBody,
    quoteMessageId: incomingQuote.id,
    draftMessageId: savedDraft.id,
    approvedWording: true,
    budgetImpactAcknowledged: true,
    execution,
  });
  assert.equal(sentFlow.stage, "sent");
  assert.equal(sentFlow.sentReceiptId, "gmail-message-quote-123");

  const parentId = weddingVendorQuoteReceiptParentId([incomingQuote, savedDraft], sendReadyFlow.approvalRequest.id);
  const receiptSendInput = weddingApprovalReceiptToVendorThreadAfpSendInput(execution.receipt, {
    threadId: sentFlow.threadId,
    parentId,
  });
  assert.ok(receiptSendInput);

  const savedReceipt = messageFromSendInput(receiptSendInput, "receipt");
  const proof = buildWeddingVendorQuoteProofRoundTripState({
    vendorName: quote.vendorName,
    serverMessages: [savedReceipt, incomingQuote, savedDraft],
  });

  assert.equal(proof.status, "complete");
  assert.equal(proof.hasQuote, true);
  assert.equal(proof.hasDraft, true);
  assert.equal(proof.hasDurableSentProof, true);
  assert.equal(proof.drawer.sentProofCount, 1);
  assert.equal(proof.drawer.latestSentReceiptLabel, "gmail-message-quote-123");
  assert.deepEqual(proof.messages.map((message) => message.id), [
    incomingQuote.id,
    savedDraft.id,
    savedReceipt.id,
  ]);

  const providerVerification = buildWeddingVendorQuoteProviderSendVerificationState({
    execution,
    proof,
    expectedThreadId: sentFlow.threadId,
    expectedRecipient: sentFlow.recipient,
    expectedSubject: sentFlow.subject,
  });
  const receiptPersistence = weddingVendorQuoteReceiptPersistenceState({
    approvalSaveAvailable: true,
    approvalSaveSucceeded: true,
    vendorThreadExpected: true,
    vendorThreadProjectionAvailable: true,
    vendorThreadSaveSucceeded: true,
  });
  const providerReadiness = {
    capability: "email" as const,
    requiredProvider: "Gmail or email provider",
    credentialStatus: "connected" as const,
    executorStatus: "available" as const,
    productionReady: true,
    setupView: "email" as const,
    summary: "Gmail or email provider ready",
    detail: "The connected app is ready.",
  };
  const uiReadiness = buildWeddingVendorQuoteReplyUiReadinessState({
    quoteSummaryMounted: true,
    originalQuoteActionMounted: true,
    inlineEmailEditorMounted: true,
    wordingApprovalControlMounted: true,
    budgetAcknowledgementControlMounted: true,
    sendActionMounted: true,
    primaryDecisionActionMounted: true,
    secondaryDecisionActionMounted: true,
    conditionalReplyEditorMounted: true,
    sentReplyHistoryMounted: true,
    undoWindowMounted: true,
    persistentSentConfirmationMounted: true,
    proofDrawerActionMounted: true,
    proofDrawerStatusMounted: true,
    liveRegionsMounted: true,
    failureTelemetryMounted: true,
    providerReadiness,
    draftPersistence: weddingVendorQuoteReplyDraftPersistenceState({ status: "saved" }),
    proofPersistence: weddingVendorQuoteReplyProofPersistenceState({
      notice: receiptPersistence.notice,
    }),
    receiptPersistence,
  });
  const productionReadiness = buildWeddingVendorQuoteReplyProductionReadinessState({
    uiReadiness,
    providerSendVerification: providerVerification,
    proofRoundTrip: proof,
    receiptPersistence,
    fullRegressionPassed: true,
    typecheckPassed: true,
    buildPassed: true,
    weddingSuitePassed: true,
    actualConnectedProviderVerificationRecord: {
      schema_version: 1,
      verification_kind: "omnyid_live_gmail_provider_send",
      ok: true,
      from: "admin@omnyid.com",
      to: sentFlow.recipient,
      subject: sentFlow.subject,
      thread_id: sentFlow.threadId,
      status_route: "/integrations/gmail/status",
      send_route: "/integrations/gmail/send-draft",
      provider: "gmail",
      provider_message_id: "gmail-message-quote-123",
      actual_connected_provider_proof_ref: "gmail:prod-smoke:2026-09-27:gmail-message-quote-123",
      verified_at: "2026-09-27T02:00:07.000Z",
    },
    expectedSender: "admin@omnyid.com",
    expectedRecipient: sentFlow.recipient,
    expectedSubject: sentFlow.subject,
    expectedThreadId: sentFlow.threadId,
  });

  assert.equal(providerVerification.verified, true);
  assert.equal(receiptPersistence.proofReliability, "vendor_thread");
  assert.equal(uiReadiness.productionReady, true);
  assert.equal(productionReadiness.productionReady, true);
  assert.deepEqual(productionReadiness.blockerLabels, []);
});
