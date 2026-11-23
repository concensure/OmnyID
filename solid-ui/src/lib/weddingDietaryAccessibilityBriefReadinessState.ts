// @locs-version: 2.0
export type WeddingDietaryAccessibilityBriefReadinessInput = {
  verifiedRsvpCountsReady?: boolean | null;
  dietaryCategoriesNormalized?: boolean | null;
  allergySeverityHandlingReady?: boolean | null;
  accessibilityNeedsScoped?: boolean | null;
  vendorAudienceScopeReady?: boolean | null;
  approvalReceiptsPersisted?: boolean | null;
  deliveryOrExportReady?: boolean | null;
  correctionLoopReady?: boolean | null;
  testedBriefScenarioCount?: number | null;
  failedBriefScenarioCount?: number | null;
};

export type WeddingDietaryAccessibilityBriefReadinessState = {
  status: "verified" | "handoff_only" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  blockerLabels: string[];
};

function count(value: number | null | undefined): number {
  return Math.max(0, Math.trunc(value ?? 0));
}

export function buildWeddingDietaryAccessibilityBriefReadinessState(
  input: WeddingDietaryAccessibilityBriefReadinessInput = {},
): WeddingDietaryAccessibilityBriefReadinessState {
  const tested = count(input.testedBriefScenarioCount);
  const failed = count(input.failedBriefScenarioCount);
  const evidenceLabels = [
    input.verifiedRsvpCountsReady ? "verified RSVP meal, dietary, and accessibility counts ready" : null,
    input.dietaryCategoriesNormalized ? "dietary categories normalized" : null,
    input.allergySeverityHandlingReady ? "allergy severity handling proven" : null,
    input.accessibilityNeedsScoped ? "accessibility needs scoped for vendor sharing" : null,
    input.vendorAudienceScopeReady ? "vendor audience scope proven" : null,
    input.approvalReceiptsPersisted ? "approval receipts persist for vendor briefs" : null,
    input.deliveryOrExportReady ? "brief delivery/export proven" : null,
    input.correctionLoopReady ? "correction loop proven" : null,
    tested > 0 ? `${tested} dietary/accessibility brief scenarios tested` : "No dietary/accessibility brief scenarios tested",
  ].filter((value): value is string => Boolean(value));
  const blockerLabels: string[] = [];

  if (!input.verifiedRsvpCountsReady) blockerLabels.push("Verified RSVP meal, dietary, and accessibility counts are missing.");
  if (!input.dietaryCategoriesNormalized) blockerLabels.push("Dietary categories are not normalized.");
  if (!input.allergySeverityHandlingReady) blockerLabels.push("Allergy severity handling is not proven.");
  if (!input.accessibilityNeedsScoped) blockerLabels.push("Accessibility needs are not scoped for vendor sharing.");
  if (!input.vendorAudienceScopeReady) blockerLabels.push("Vendor audience scope is not proven.");
  if (!input.approvalReceiptsPersisted) blockerLabels.push("Approval receipts are not persisted for vendor briefs.");
  if (!input.deliveryOrExportReady) blockerLabels.push("Brief delivery or export is not proven.");
  if (!input.correctionLoopReady) blockerLabels.push("Correction loop is not proven.");
  if (tested < 2) blockerLabels.push("At least two dietary/accessibility brief scenarios must be tested.");
  if (failed > 0) blockerLabels.push(`${failed} dietary/accessibility brief scenario${failed === 1 ? "" : "s"} failed.`);

  if (blockerLabels.length === 0) {
    return {
      status: "verified",
      productionEvidenceReady: true,
      summary: "Dietary and accessibility vendor briefs are verified from RSVP counts, normalized categories, scoped sharing, approvals, delivery/export, correction loop, and scenario tests.",
      evidenceLabels,
      blockerLabels,
    };
  }

  const handoffOnly = Boolean(input.verifiedRsvpCountsReady)
    && Boolean(input.vendorAudienceScopeReady)
    && Boolean(input.approvalReceiptsPersisted)
    && Boolean(input.correctionLoopReady)
    && failed === 0;
  return {
    status: handoffOnly ? "handoff_only" : "blocked",
    productionEvidenceReady: false,
    summary: handoffOnly
      ? "Dietary and accessibility vendor briefs are safe as approval-recorded manual handoffs, but not verified for live delivery/export."
      : "Dietary and accessibility vendor briefs are not production-ready yet.",
    evidenceLabels,
    blockerLabels,
  };
}
