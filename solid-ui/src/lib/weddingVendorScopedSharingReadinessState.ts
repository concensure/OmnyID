// @locs-version: 2.0
export type WeddingVendorScopedSharingReadinessInput = {
  runSheetPacketGenerationReady?: boolean | null;
  vendorAudienceScopeReady?: boolean | null;
  minimumNecessaryFieldsReady?: boolean | null;
  privacyRedactionReady?: boolean | null;
  approvalUiReady?: boolean | null;
  sharingExecutorReady?: boolean | null;
  accessControlReady?: boolean | null;
  receiptPersistenceReady?: boolean | null;
  revocationOrCorrectionReady?: boolean | null;
  testedSharingScenarioCount?: number | null;
  failedSharingScenarioCount?: number | null;
};

export type WeddingVendorScopedSharingReadinessState = {
  status: "verified" | "handoff_only" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  blockerLabels: string[];
};

function count(value: number | null | undefined): number {
  return Math.max(0, Math.trunc(value ?? 0));
}

export function buildWeddingVendorScopedSharingReadinessState(
  input: WeddingVendorScopedSharingReadinessInput = {},
): WeddingVendorScopedSharingReadinessState {
  const tested = count(input.testedSharingScenarioCount);
  const failed = count(input.failedSharingScenarioCount);
  const evidenceLabels = [
    input.runSheetPacketGenerationReady ? "vendor-scoped run-sheet packet generation proven" : null,
    input.vendorAudienceScopeReady ? "vendor audience scope proven" : null,
    input.minimumNecessaryFieldsReady ? "minimum-necessary field filtering proven" : null,
    input.privacyRedactionReady ? "privacy redaction proven" : null,
    input.approvalUiReady ? "vendor sharing approval UI proven" : null,
    input.sharingExecutorReady ? "sharing executor proven" : null,
    input.accessControlReady ? "vendor access controls proven" : null,
    input.receiptPersistenceReady ? "vendor sharing receipts persist" : null,
    input.revocationOrCorrectionReady ? "revocation/correction path proven" : null,
    tested > 0 ? `${tested} vendor-scoped sharing scenarios tested` : "No vendor-scoped sharing scenarios tested",
  ].filter((value): value is string => Boolean(value));
  const blockerLabels: string[] = [];

  if (!input.runSheetPacketGenerationReady) blockerLabels.push("Vendor-scoped run-sheet packet generation is not proven.");
  if (!input.vendorAudienceScopeReady) blockerLabels.push("Vendor audience scope is not proven.");
  if (!input.minimumNecessaryFieldsReady) blockerLabels.push("Minimum-necessary field filtering is not proven.");
  if (!input.privacyRedactionReady) blockerLabels.push("Privacy redaction is not proven.");
  if (!input.approvalUiReady) blockerLabels.push("Vendor sharing approval UI is not proven.");
  if (!input.sharingExecutorReady) blockerLabels.push("Sharing executor is not proven.");
  if (!input.accessControlReady) blockerLabels.push("Vendor access controls are not proven.");
  if (!input.receiptPersistenceReady) blockerLabels.push("Vendor sharing receipts are not persisted.");
  if (!input.revocationOrCorrectionReady) blockerLabels.push("Revocation or correction path is not proven.");
  if (tested < 2) blockerLabels.push("At least two vendor-scoped sharing scenarios must be tested.");
  if (failed > 0) blockerLabels.push(`${failed} vendor-scoped sharing scenario${failed === 1 ? "" : "s"} failed.`);

  if (blockerLabels.length === 0) {
    return {
      status: "verified",
      productionEvidenceReady: true,
      summary: "Vendor-scoped sharing is verified for packet generation, audience scope, minimum-necessary filtering, redaction, approval, executor delivery, access controls, receipts, revocation/correction, and scenario tests.",
      evidenceLabels,
      blockerLabels,
    };
  }

  const handoffOnly = Boolean(input.runSheetPacketGenerationReady)
    && Boolean(input.vendorAudienceScopeReady)
    && Boolean(input.minimumNecessaryFieldsReady)
    && Boolean(input.privacyRedactionReady)
    && Boolean(input.approvalUiReady)
    && Boolean(input.revocationOrCorrectionReady)
    && failed === 0;
  return {
    status: handoffOnly ? "handoff_only" : "blocked",
    productionEvidenceReady: false,
    summary: handoffOnly
      ? "Vendor-scoped sharing is safe as an approval-recorded manual handoff, but not verified for live sharing execution, access controls, or durable receipts."
      : "Vendor-scoped sharing is not production-ready yet.",
    evidenceLabels,
    blockerLabels,
  };
}
