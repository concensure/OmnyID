// @locs-version: 1.0
import type { WeddingApprovalExecutionState } from "@/lib/weddingApprovalExecutionState";
import { cleanWeddingProductionLabels } from "@/lib/weddingProductionLabelState";
import type { WeddingVendorQuoteProofRoundTripState } from "@/lib/weddingVendorQuoteProofRoundTripState";

export type WeddingVendorQuoteProviderSendVerificationStatus =
  | "verified"
  | "not_executed"
  | "wrong_action"
  | "provider_not_live"
  | "provider_failed"
  | "delivery_not_performed"
  | "missing_provider_receipt"
  | "proof_not_reconstructed"
  | "missing_delivery_expectations"
  | "delivery_mismatch";

export type WeddingVendorQuoteProviderSendVerificationState = {
  status: WeddingVendorQuoteProviderSendVerificationStatus;
  verified: boolean;
  providerReceiptId: string | null;
  telemetryEvent: string | null;
  evidenceLabels: string[];
  blockerLabels: string[];
};

const DURABLE_PROVIDER_RECEIPT_KEYS = [
  "external_id",
  "provider_receipt_id",
  "provider_message_id",
  "message_id",
] as const;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function booleanValue(value: unknown): boolean | null {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

function firstString(values: readonly unknown[]): string | null {
  for (const value of values) {
    const item = clean(value);
    if (item) return item;
  }
  return null;
}

function durableProviderReceiptId(execution: WeddingApprovalExecutionState | null | undefined): string | null {
  const metadata = execution?.receipt.metadata ?? {};
  return firstString([
    execution?.externalId,
    ...DURABLE_PROVIDER_RECEIPT_KEYS.map((key) => metadata[key]),
  ]);
}

function deliveryRecipients(metadata: Record<string, unknown>): string[] {
  const raw = metadata.delivery_recipients;
  if (Array.isArray(raw)) return raw.map(clean).filter(Boolean);
  return clean(raw) ? [clean(raw)] : [];
}

function providerExecutionIsLive(metadata: Record<string, unknown>): boolean {
  return clean(metadata.provider).toLowerCase() === "gmail"
    && clean(metadata.provider_executor_mode).toLowerCase() === "live"
    && clean(metadata.provider_executor_status).toLowerCase() === "available"
    && booleanValue(metadata.provider_executor_connected) === true;
}

function telemetryFor(status: WeddingVendorQuoteProviderSendVerificationStatus): string | null {
  return status === "verified" ? null : `wedding_vendor_quote_provider_send_${status}`;
}

export function buildWeddingVendorQuoteProviderSendVerificationState(input: {
  execution?: WeddingApprovalExecutionState | null;
  proof?: WeddingVendorQuoteProofRoundTripState | null;
  expectedThreadId?: string | null;
  expectedRecipient?: string | null;
  expectedSubject?: string | null;
}): WeddingVendorQuoteProviderSendVerificationState {
  const execution = input.execution ?? null;
  const metadata = execution?.receipt.metadata ?? {};
  const providerReceiptId = durableProviderReceiptId(execution);
  const providerResultOk = booleanValue(metadata.provider_result_ok);
  const externalDeliveryPerformed = booleanValue(metadata.external_delivery_performed);
  const missingDurableProviderReceipt = booleanValue(metadata.missing_durable_provider_receipt);
  const proof = input.proof ?? null;

  const baseEvidence = [
    clean(metadata.provider) ? `provider: ${clean(metadata.provider)}` : null,
    clean(metadata.provider_label) ? `provider label: ${clean(metadata.provider_label)}` : null,
    providerReceiptId ? `provider receipt: ${providerReceiptId}` : null,
    externalDeliveryPerformed === true ? "external delivery performed" : null,
    providerResultOk === true ? "provider result ok" : null,
    proof?.hasDurableSentProof ? "proof drawer reconstructed sent proof" : null,
  ].filter((label): label is string => Boolean(label));

  const finish = (
    status: WeddingVendorQuoteProviderSendVerificationStatus,
    blockerLabels: string[],
  ): WeddingVendorQuoteProviderSendVerificationState => ({
    status,
    verified: status === "verified",
    providerReceiptId,
    telemetryEvent: telemetryFor(status),
    evidenceLabels: cleanWeddingProductionLabels(baseEvidence),
    blockerLabels: cleanWeddingProductionLabels(blockerLabels),
  });

  if (!execution || execution.status !== "executed" || execution.receipt.status !== "executed") {
    return finish("not_executed", ["The provider send has not completed with an executed receipt."]);
  }
  if (execution.actionKind !== "send_email" || execution.receipt.actionKind !== "send_email") {
    return finish("wrong_action", ["The receipt is not a send_email provider action."]);
  }
  if (!providerExecutionIsLive(metadata)) {
    return finish("provider_not_live", ["The receipt does not prove a connected live Gmail provider execution."]);
  }
  if (providerResultOk === false) {
    return finish("provider_failed", ["The provider reported a failed result."]);
  }
  if (externalDeliveryPerformed !== true) {
    return finish("delivery_not_performed", ["The provider receipt does not confirm external delivery."]);
  }
  if (!providerReceiptId || missingDurableProviderReceipt === true) {
    return finish("missing_provider_receipt", ["The provider send did not return a durable message or receipt id."]);
  }
  if (
    proof?.status !== "complete"
    || !proof.hasQuote
    || !proof.hasDraft
    || !proof.hasDurableSentProof
    || proof.drawer.latestSentReceiptLabel !== providerReceiptId
  ) {
    return finish("proof_not_reconstructed", ["The saved vendor thread did not reconstruct the quote, draft, and same provider receipt."]);
  }

  const expectedThreadId = clean(input.expectedThreadId);
  const expectedRecipient = clean(input.expectedRecipient).toLowerCase();
  const expectedSubject = clean(input.expectedSubject);
  const missingExpectationLabels = [
    expectedThreadId ? null : "Expected quote thread id was not supplied for provider verification.",
    expectedRecipient ? null : "Expected vendor recipient was not supplied for provider verification.",
    expectedSubject ? null : "Expected email subject was not supplied for provider verification.",
  ].filter((label): label is string => Boolean(label));
  if (missingExpectationLabels.length > 0) return finish("missing_delivery_expectations", missingExpectationLabels);

  const actualThreadId = firstString([metadata.delivery_thread_id, metadata.thread_id]);
  const actualRecipients = deliveryRecipients(metadata).map((recipient) => recipient.toLowerCase());
  const actualSubject = firstString([metadata.delivery_subject, metadata.subject]);
  const mismatchLabels = [
    expectedThreadId && actualThreadId !== expectedThreadId
      ? "The provider receipt delivery thread does not match the quote thread."
      : null,
    expectedRecipient && !actualRecipients.includes(expectedRecipient)
      ? "The provider receipt recipient does not match the approved vendor email."
      : null,
    expectedSubject && actualSubject !== expectedSubject
      ? "The provider receipt subject does not match the approved email subject."
      : null,
  ].filter((label): label is string => Boolean(label));
  if (mismatchLabels.length > 0) return finish("delivery_mismatch", mismatchLabels);

  return finish("verified", []);
}
