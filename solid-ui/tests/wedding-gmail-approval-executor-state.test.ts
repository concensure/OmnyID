import assert from "node:assert/strict";
import test from "node:test";

import {
  approveWeddingApprovalRequestState,
  buildWeddingApprovalRequestState,
} from "@/lib/weddingApprovalState";
import { runWeddingApprovalExecution } from "@/lib/weddingApprovalExecutionState";
import { weddingApprovalReceiptToVendorThreadAfpSendInput } from "@/lib/weddingApprovalReceiptAfpProjectionState";
import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import {
  buildWeddingGmailApprovalExecutionHandlers,
  weddingGmailDraftSendResultFromApiResponse,
  weddingGmailApprovalExecutor,
} from "@/lib/weddingGmailApprovalExecutorState";
import { buildWeddingProviderExecutorSmokeProofState } from "@/lib/weddingProviderExecutorSmokeProofState";
import {
  buildWeddingVendorQuoteReplyFlowState,
  weddingVendorQuoteDraftAfpSendInput,
  weddingVendorQuoteIncomingAfpMessage,
} from "@/lib/weddingVendorQuoteReplyFlowState";
import {
  buildWeddingVendorQuoteThreadProofState,
  weddingVendorQuoteReceiptParentId,
} from "@/lib/weddingVendorQuoteThreadProofState";

const metadata = {
  weddingPlanId: "plan-1",
  responseWorkspaceId: "workspace-1",
  sourceResponseId: "response-1",
};

test("wedding Gmail approved draft API adapter preserves provider and local send ids", () => {
  assert.deepEqual(weddingGmailDraftSendResultFromApiResponse({
    ok: true,
    messageId: "gmail-msg-1",
    clientMessageId: "local-msg-1",
  }), {
    ok: true,
    messageId: "gmail-msg-1",
    clientMessageId: "local-msg-1",
    message: "Gmail sent the approved wedding email.",
  });

  assert.deepEqual(weddingGmailDraftSendResultFromApiResponse({
    ok: false,
    message: "Reconnect Gmail.",
  }), {
    ok: false,
    messageId: null,
    clientMessageId: null,
    message: "Reconnect Gmail.",
  });
});

test("wedding Gmail approval executor sends approved delivery payloads", async () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send florist reply",
    metadata,
    recipients: ["hello@chloes.example"],
    externalProvider: "Gmail",
    userApproved: true,
    delivery: {
      channel: "email",
      to: ["hello@chloes.example"],
      subject: "Floral quote",
      text: "Thanks Chloe,\n\nWe would like to proceed.",
      threadId: "wedding_vendor_quote:workspace-1:chloe",
      inReplyTo: "<quote-message@example.com>",
      references: [" <quote-message@example.com> ", "afp-quote-message-1", "", "AFP-QUOTE-MESSAGE-1"],
    },
  });
  const sent: Array<{
    to: string;
    subject: string;
    html: string;
    text: string;
    inReplyTo?: string | null;
    references?: string[];
  }> = [];
  const result = await runWeddingApprovalExecution({
    request,
    handlers: buildWeddingGmailApprovalExecutionHandlers((input) => {
      sent.push(input);
      return { ok: true, messageId: "gmail-msg-1", clientMessageId: "local-msg-1" };
    }),
    nowIso: "2026-09-27T02:00:00.000Z",
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.to, "hello@chloes.example");
  assert.equal(sent[0]?.subject, "Floral quote");
  assert.equal(sent[0]?.inReplyTo, "<quote-message@example.com>");
  assert.deepEqual(sent[0]?.references, ["<quote-message@example.com>", "afp-quote-message-1"]);
  assert.match(sent[0]?.html ?? "", /<p>Thanks Chloe/);
  assert.equal(result.status, "executed");
  assert.equal(result.externalId, "gmail-msg-1");
  assert.equal(result.receipt.metadata.provider_message_id, "gmail-msg-1");
  assert.equal(result.receipt.metadata.client_message_id, "local-msg-1");
  assert.equal(result.receipt.metadata.provider_capability, "email");
  assert.equal(result.receipt.metadata.provider_executor_status, "available");
  assert.equal(result.receipt.metadata.provider_executor_connected, true);
  assert.equal(result.receipt.metadata.provider_executor_mode, "live");
  assert.equal(result.receipt.metadata.provider_result_ok, true);
  assert.equal(result.receipt.metadata.external_delivery_performed, true);
  assert.deepEqual(result.receipt.metadata.delivery_recipients, ["hello@chloes.example"]);
  assert.equal(result.receipt.metadata.delivery_subject, "Floral quote");
  assert.equal(result.receipt.metadata.delivery_thread_id, "wedding_vendor_quote:workspace-1:chloe");
  assert.equal(result.receipt.metadata.in_reply_to, "<quote-message@example.com>");
  assert.deepEqual(result.receipt.metadata.references, ["<quote-message@example.com>", "afp-quote-message-1"]);

  const projected = weddingApprovalReceiptToVendorThreadAfpSendInput(result.receipt, {
    threadId: "wedding_vendor_quote:workspace-1:chloe",
    parentId: "draft-1",
  });
  assert.ok(projected);
  const projectedContent = projected.content as Record<string, unknown>;
  assert.equal(projectedContent.provider_capability, "email");
  assert.equal(projectedContent.provider_executor_connected, true);
  assert.deepEqual(projectedContent.delivery_recipients, ["hello@chloes.example"]);
  assert.equal(projectedContent.delivery_subject, "Floral quote");

  const smokeProof = buildWeddingProviderExecutorSmokeProofState({
    requiredCapabilities: ["email"],
    approvalReceipts: [result.receipt],
  });
  assert.equal(smokeProof.status, "ready");
  assert.equal(smokeProof.executorProofRefs.email, "gmail-msg-1");
});

test("wedding Gmail approval executor fails closed without delivery payload", async () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send florist reply",
    metadata,
    recipients: ["hello@chloes.example"],
    externalProvider: "Gmail",
    userApproved: true,
  });
  const executor = weddingGmailApprovalExecutor(() => {
    throw new Error("should not call Gmail without delivery");
  });
  const result = await executor(request);

  assert.equal(result.ok, false);
  assert.match(result.message ?? "", /missing a recipient, subject, or body/i);
  assert.equal(result.metadata?.missing_delivery_payload, true);
  assert.equal(result.metadata?.provider_capability, "email");
  assert.equal(result.metadata?.provider_executor_status, "available");
  assert.equal(result.metadata?.provider_executor_connected, true);
  assert.equal(result.metadata?.provider_executor_mode, "live");
  assert.equal(result.metadata?.provider_result_ok, false);
  assert.equal(result.metadata?.external_delivery_performed, false);
  assert.deepEqual(result.metadata?.delivery_missing_fields, ["delivery"]);
  assert.deepEqual(result.metadata?.delivery_recipients, []);
});

test("wedding Gmail approval executor requires a durable Gmail message id", async () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send florist reply",
    metadata,
    recipients: ["hello@chloes.example"],
    externalProvider: "Gmail",
    userApproved: true,
    delivery: {
      channel: "email",
      to: ["hello@chloes.example"],
      subject: "Floral quote",
      text: "Thanks Chloe.",
    },
  });
  const result = await runWeddingApprovalExecution({
    request,
    handlers: buildWeddingGmailApprovalExecutionHandlers(() => ({ ok: true })),
  });

  assert.equal(result.status, "failed");
  assert.match(result.message, /did not confirm/i);
  assert.equal(result.receipt.metadata.provider_capability, "email");
  assert.equal(result.receipt.metadata.provider_executor_status, "available");
  assert.equal(result.receipt.metadata.provider_executor_connected, true);
  assert.equal(result.receipt.metadata.provider_executor_mode, "live");
  assert.equal(result.receipt.metadata.provider_result_ok, true);
  assert.equal(result.receipt.metadata.external_delivery_performed, false);
  assert.equal(result.receipt.metadata.missing_durable_provider_receipt, true);
  assert.deepEqual(result.receipt.metadata.delivery_recipients, ["hello@chloes.example"]);
  assert.equal(result.receipt.metadata.delivery_subject, "Floral quote");
});

test("vendor quote approval supports undo before Gmail send and proof after confirmed receipt", async () => {
  const quote: WeddingArtifactQuotePreview = {
    kind: "quote",
    vendorName: "Chloe's Florals",
    amount: 799,
    amountLabel: "AUD $799",
    currency: "AUD",
    budgetDeltaAmount: 200,
    budgetDeltaLabel: "$200 over budget",
    inclusions: ["Bridal bouquet"],
  };
  const baseFlow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: "hello@chloes.example",
    subject: "Floral quote",
    draftBody: "Thanks Chloe, we would like to proceed.",
  });
  const undoFlow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: baseFlow.recipient,
    subject: baseFlow.subject,
    draftBody: baseFlow.draftBody,
    approvedWording: true,
    budgetImpactAcknowledged: true,
    undoUntilIso: "2026-09-27T02:00:06.000Z",
  });
  const cancelledFlow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient: baseFlow.recipient,
    subject: baseFlow.subject,
    draftBody: baseFlow.draftBody,
    approvedWording: true,
    budgetImpactAcknowledged: true,
  });
  const sent: unknown[] = [];
  const approvedRequest = approveWeddingApprovalRequestState(cancelledFlow.approvalRequest);
  const result = await runWeddingApprovalExecution({
    request: approvedRequest,
    handlers: buildWeddingGmailApprovalExecutionHandlers((input) => {
      sent.push(input);
      return { ok: true, messageId: "gmail-msg-quote-1", clientMessageId: "local-msg-quote-1" };
    }),
    nowIso: "2026-09-27T02:00:07.000Z",
  });
  const incoming = weddingVendorQuoteIncomingAfpMessage({ quote, metadata, subject: baseFlow.subject });
  const draft = weddingVendorQuoteDraftAfpSendInput({
    flow: cancelledFlow,
    recipient: cancelledFlow.recipient,
    subject: cancelledFlow.subject,
    body: cancelledFlow.draftBody,
  });
  const draftMessage = {
    ...draft,
    id: "draft-1",
    timestamp: "2026-09-27T02:00:00.000Z",
  };
  const parentId = weddingVendorQuoteReceiptParentId([incoming, draftMessage], approvedRequest.id);
  const receiptProjection = weddingApprovalReceiptToVendorThreadAfpSendInput(result.receipt, {
    threadId: cancelledFlow.threadId,
    parentId,
  });
  assert.equal(undoFlow.stage, "sending_undo_window");
  assert.equal(cancelledFlow.stage, "ready_to_send");
  assert.equal(sent.length, 1);
  assert.equal(result.status, "executed");
  assert.equal(result.externalId, "gmail-msg-quote-1");
  assert.equal(parentId, "draft-1");
  assert.equal(receiptProjection?.parent_id, "draft-1");
  const proofRows = buildWeddingVendorQuoteThreadProofState([
    incoming,
    draftMessage,
    {
      ...receiptProjection!,
      id: "receipt-1",
      timestamp: result.receipt.createdAt,
    },
  ]);
  const sentProof = proofRows.find((row) => row.isSentProof);
  assert.equal(sentProof?.receiptId, "gmail-msg-quote-1");
  assert.equal(sentProof?.clientMessageId, "local-msg-quote-1");
  assert.equal(sentProof?.sentToLabel, "hello@chloes.example");
  assert.equal(sentProof?.subjectLabel, "Floral quote");
});
