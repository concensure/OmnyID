// @locs-version: 2.0
export type WeddingPaymentVerificationReadinessInput = {
  trustedReceiptSourceConnected?: boolean | null;
  vendorInvoiceMatchingReady?: boolean | null;
  amountAndDueDateChecksReady?: boolean | null;
  sensitiveReceiptStoragePolicyReady?: boolean | null;
  auditReceiptPersisted?: boolean | null;
  manualUploadFallbackReady?: boolean | null;
  testedPaymentScenarioCount?: number | null;
  failedPaymentScenarioCount?: number | null;
};

export type WeddingPaymentVerificationReadinessState = {
  status: "verified" | "handoff_only" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  blockerLabels: string[];
};

function count(value: number | null | undefined): number {
  return Math.max(0, Math.trunc(value ?? 0));
}

export function buildWeddingPaymentVerificationReadinessState(
  input: WeddingPaymentVerificationReadinessInput = {},
): WeddingPaymentVerificationReadinessState {
  const tested = count(input.testedPaymentScenarioCount);
  const failed = count(input.failedPaymentScenarioCount);
  const evidenceLabels = [
    input.trustedReceiptSourceConnected ? "trusted receipt/payment source connected" : null,
    input.vendorInvoiceMatchingReady ? "vendor invoice matching proven" : null,
    input.amountAndDueDateChecksReady ? "amount and due-date checks proven" : null,
    input.sensitiveReceiptStoragePolicyReady ? "sensitive receipt storage policy proven" : null,
    input.auditReceiptPersisted ? "payment verification audit receipts persist" : null,
    input.manualUploadFallbackReady ? "manual receipt upload fallback available" : null,
    tested > 0 ? `${tested} payment verification scenarios tested` : "No payment verification scenarios tested",
  ].filter((value): value is string => Boolean(value));
  const blockerLabels: string[] = [];

  if (!input.trustedReceiptSourceConnected) blockerLabels.push("Trusted receipt or payment source is not connected.");
  if (!input.vendorInvoiceMatchingReady) blockerLabels.push("Vendor invoice matching is not proven.");
  if (!input.amountAndDueDateChecksReady) blockerLabels.push("Amount and due-date checks are not proven.");
  if (!input.sensitiveReceiptStoragePolicyReady) blockerLabels.push("Sensitive receipt storage policy is not proven.");
  if (!input.auditReceiptPersisted) blockerLabels.push("Payment verification audit receipt is not persisted.");
  if (!input.manualUploadFallbackReady) blockerLabels.push("Manual receipt upload fallback is missing.");
  if (tested < 2) blockerLabels.push("At least two payment verification scenarios must be tested.");
  if (failed > 0) blockerLabels.push(`${failed} payment verification scenario${failed === 1 ? "" : "s"} failed.`);

  if (blockerLabels.length === 0) {
    return {
      status: "verified",
      productionEvidenceReady: true,
      summary: "Payment verification is proven from trusted receipt/payment evidence, invoice matching, amount/date checks, privacy policy, audit receipts, and fallback.",
      evidenceLabels,
      blockerLabels,
    };
  }

  const handoffOnly = Boolean(input.manualUploadFallbackReady)
    && Boolean(input.sensitiveReceiptStoragePolicyReady)
    && Boolean(input.auditReceiptPersisted)
    && failed === 0;
  return {
    status: handoffOnly ? "handoff_only" : "blocked",
    productionEvidenceReady: false,
    summary: handoffOnly
      ? "Payment verification is safe as an audit-recorded manual receipt review, but not verified for live provider confirmation."
      : "Payment verification is not production-ready yet.",
    evidenceLabels,
    blockerLabels,
  };
}
