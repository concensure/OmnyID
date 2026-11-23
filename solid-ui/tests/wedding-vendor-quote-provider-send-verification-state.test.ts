// @locs-version: 1.0
import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import { runWeddingApprovalExecution } from "@/lib/weddingApprovalExecutionState";
import { weddingApprovalReceiptToVendorThreadAfpSendInput } from "@/lib/weddingApprovalReceiptAfpProjectionState";
import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import { buildWeddingGmailApprovalExecutionHandlers } from "@/lib/weddingGmailApprovalExecutorState";
import { buildWeddingVendorQuoteProofRoundTripState } from "@/lib/weddingVendorQuoteProofRoundTripState";
import { buildWeddingVendorQuoteProviderSendVerificationState } from "@/lib/weddingVendorQuoteProviderSendVerificationState";
import {
  buildWeddingVendorQuoteReplyFlowState,
  weddingVendorQuoteDraftAfpSendInput,
  weddingVendorQuoteIncomingAfpMessage,
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
  inclusions: ["Bridal bouquet"],
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

async function runGmailQuoteSend(input: {
  gmailMessageId?: string | null;
  recipient?: string;
  subject?: string;
} = {}) {
  const recipient = input.recipient ?? "hello@chloes.example";
  const subject = input.subject ?? "Floral quote";
  const incoming = weddingVendorQuoteIncomingAfpMessage({
    quote,
    metadata,
    subject,
    createdAt: "2026-09-27T02:00:00.000Z",
  });
  const flow = buildWeddingVendorQuoteReplyFlowState({
    quote,
    metadata,
    recipient,
    subject,
    draftBody: "Thanks Chloe, we would like to proceed.",
    quoteMessageId: incoming.id,
    approvedWording: true,
    budgetImpactAcknowledged: true,
  });
  const draft = messageFromSendInput(weddingVendorQuoteDraftAfpSendInput({
    flow,
    recipient,
    subject,
    body: flow.draftBody,
    parentId: incoming.id,
    createdAt: "2026-09-27T02:00:01.000Z",
  }), "draft");
  const execution = await runWeddingApprovalExecution({
    request: flow.approvalRequest,
    nowIso: "2026-09-27T02:00:02.000Z",
    handlers: buildWeddingGmailApprovalExecutionHandlers((delivery) => ({
      ok: true,
      messageId: input.gmailMessageId,
      clientMessageId: input.gmailMessageId ? "local-gmail-1" : null,
      message: input.gmailMessageId ? undefined : "Gmail accepted but did not return a message id.",
    })),
  });
  const receiptInput = weddingApprovalReceiptToVendorThreadAfpSendInput(execution.receipt, {
    threadId: flow.threadId,
    parentId: weddingVendorQuoteReceiptParentId([incoming, draft], flow.approvalRequest.id),
  });
  const serverMessages = receiptInput
    ? [incoming, draft, messageFromSendInput(receiptInput, "receipt")]
    : [incoming, draft];
  const proof = buildWeddingVendorQuoteProofRoundTripState({
    vendorName: quote.vendorName,
    serverMessages,
  });
  return { flow, incoming, draft, execution, proof };
}

test("vendor quote provider send verification passes through the real Gmail executor contract", async () => {
  const { flow, execution, proof } = await runGmailQuoteSend({
    gmailMessageId: "gmail-message-live-123",
  });

  const verification = buildWeddingVendorQuoteProviderSendVerificationState({
    execution,
    proof,
    expectedThreadId: flow.threadId,
    expectedRecipient: flow.recipient,
    expectedSubject: flow.subject,
  });

  assert.equal(verification.status, "verified");
  assert.equal(verification.verified, true);
  assert.equal(verification.providerReceiptId, "gmail-message-live-123");
  assert.equal(verification.telemetryEvent, null);
  assert.deepEqual(verification.blockerLabels, []);
  assert.ok(verification.evidenceLabels.includes("provider: gmail"));
  assert.ok(verification.evidenceLabels.includes("external delivery performed"));
  assert.ok(verification.evidenceLabels.includes("proof drawer reconstructed sent proof"));
});

test("vendor quote provider send verification bounds noisy evidence labels", async () => {
  const longMessageId = `gmail-message-live-${"receipt-".repeat(80)}`;
  const { flow, execution, proof } = await runGmailQuoteSend({
    gmailMessageId: longMessageId,
  });

  const noisyExecution = {
    ...execution,
    receipt: {
      ...execution.receipt,
      metadata: {
        ...execution.receipt.metadata,
        provider_label: "  Connected    Gmail   provider  ",
      },
    },
  };

  const verification = buildWeddingVendorQuoteProviderSendVerificationState({
    execution: noisyExecution,
    proof,
    expectedThreadId: flow.threadId,
    expectedRecipient: flow.recipient,
    expectedSubject: flow.subject,
  });

  assert.equal(verification.status, "verified");
  assert.ok(verification.evidenceLabels.includes("provider label: Connected Gmail provider"));
  assert.ok(verification.evidenceLabels.every((label) => label.length <= 240));
  assert.ok(verification.evidenceLabels.some((label) => label.startsWith("provider receipt: gmail-message-live-")));
  assert.ok(verification.evidenceLabels.some((label) => label.endsWith("...")));
});

test("vendor quote provider send verification fails closed when Gmail omits durable receipt", async () => {
  const { flow, execution, proof } = await runGmailQuoteSend({
    gmailMessageId: null,
  });

  const verification = buildWeddingVendorQuoteProviderSendVerificationState({
    execution,
    proof,
    expectedThreadId: flow.threadId,
    expectedRecipient: flow.recipient,
    expectedSubject: flow.subject,
  });

  assert.equal(execution.status, "failed");
  assert.equal(verification.status, "not_executed");
  assert.equal(verification.verified, false);
  assert.equal(verification.providerReceiptId, null);
  assert.equal(verification.telemetryEvent, "wedding_vendor_quote_provider_send_not_executed");
  assert.match(verification.blockerLabels.join(" "), /executed receipt/i);
});

test("vendor quote provider send verification catches proof reconstruction mismatches", async () => {
  const { flow, execution } = await runGmailQuoteSend({
    gmailMessageId: "gmail-message-live-456",
  });
  const proof = buildWeddingVendorQuoteProofRoundTripState({
    vendorName: quote.vendorName,
    serverMessages: [],
  });

  const verification = buildWeddingVendorQuoteProviderSendVerificationState({
    execution,
    proof,
    expectedThreadId: flow.threadId,
    expectedRecipient: flow.recipient,
    expectedSubject: flow.subject,
  });

  assert.equal(verification.status, "proof_not_reconstructed");
  assert.equal(verification.verified, false);
  assert.equal(verification.providerReceiptId, "gmail-message-live-456");
  assert.equal(verification.telemetryEvent, "wedding_vendor_quote_provider_send_proof_not_reconstructed");
});

test("vendor quote provider send verification requires delivery expectations", async () => {
  const { execution, proof } = await runGmailQuoteSend({
    gmailMessageId: "gmail-message-live-missing-expectations",
  });

  const verification = buildWeddingVendorQuoteProviderSendVerificationState({
    execution,
    proof,
  });

  assert.equal(verification.status, "missing_delivery_expectations");
  assert.equal(verification.verified, false);
  assert.equal(verification.telemetryEvent, "wedding_vendor_quote_provider_send_missing_delivery_expectations");
  assert.match(verification.blockerLabels.join(" "), /thread id/i);
  assert.match(verification.blockerLabels.join(" "), /vendor recipient/i);
  assert.match(verification.blockerLabels.join(" "), /email subject/i);
});

test("vendor quote provider send verification requires quote and draft context in reconstructed proof", async () => {
  const { flow, execution, incoming } = await runGmailQuoteSend({
    gmailMessageId: "gmail-message-live-context",
  });
  const receiptInput = weddingApprovalReceiptToVendorThreadAfpSendInput(execution.receipt, {
    threadId: flow.threadId,
    parentId: incoming.id,
  });
  assert.ok(receiptInput);
  const proof = buildWeddingVendorQuoteProofRoundTripState({
    vendorName: quote.vendorName,
    serverMessages: [incoming, messageFromSendInput(receiptInput, "receipt-without-draft")],
  });

  const verification = buildWeddingVendorQuoteProviderSendVerificationState({
    execution,
    proof,
    expectedThreadId: flow.threadId,
    expectedRecipient: flow.recipient,
    expectedSubject: flow.subject,
  });

  assert.equal(proof.status, "missing_thread_context");
  assert.equal(verification.status, "proof_not_reconstructed");
  assert.equal(verification.verified, false);
  assert.match(verification.blockerLabels.join(" "), /quote, draft, and same provider receipt/i);
});

test("vendor quote provider send verification rejects dry-run provider metadata", async () => {
  const { flow, execution, proof } = await runGmailQuoteSend({
    gmailMessageId: "gmail-message-live-654",
  });
  const dryRunExecution = {
    ...execution,
    receipt: {
      ...execution.receipt,
      metadata: {
        ...execution.receipt.metadata,
        provider_executor_mode: "dry_run",
      },
    },
  };

  const verification = buildWeddingVendorQuoteProviderSendVerificationState({
    execution: dryRunExecution,
    proof,
    expectedThreadId: flow.threadId,
    expectedRecipient: flow.recipient,
    expectedSubject: flow.subject,
  });

  assert.equal(verification.status, "provider_not_live");
  assert.equal(verification.verified, false);
  assert.equal(verification.telemetryEvent, "wedding_vendor_quote_provider_send_provider_not_live");
  assert.match(verification.blockerLabels.join(" "), /connected live Gmail provider/i);
});

test("vendor quote provider send verification rejects disconnected provider metadata", async () => {
  const { flow, execution, proof } = await runGmailQuoteSend({
    gmailMessageId: "gmail-message-live-987",
  });
  const disconnectedExecution = {
    ...execution,
    receipt: {
      ...execution.receipt,
      metadata: {
        ...execution.receipt.metadata,
        provider_executor_connected: false,
      },
    },
  };

  const verification = buildWeddingVendorQuoteProviderSendVerificationState({
    execution: disconnectedExecution,
    proof,
    expectedThreadId: flow.threadId,
    expectedRecipient: flow.recipient,
    expectedSubject: flow.subject,
  });

  assert.equal(verification.status, "provider_not_live");
  assert.equal(verification.verified, false);
  assert.equal(verification.telemetryEvent, "wedding_vendor_quote_provider_send_provider_not_live");
});

test("vendor quote provider send verification catches delivery metadata mismatches", async () => {
  const { flow, execution, proof } = await runGmailQuoteSend({
    gmailMessageId: "gmail-message-live-789",
  });

  const verification = buildWeddingVendorQuoteProviderSendVerificationState({
    execution,
    proof,
    expectedThreadId: flow.threadId,
    expectedRecipient: "wrong@example.com",
    expectedSubject: flow.subject,
  });

  assert.equal(verification.status, "delivery_mismatch");
  assert.equal(verification.verified, false);
  assert.equal(verification.telemetryEvent, "wedding_vendor_quote_provider_send_delivery_mismatch");
  assert.match(verification.blockerLabels.join(" "), /recipient/i);
});
