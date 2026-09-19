// @locs-version: 2.0
export type WeddingRsvpCollectionReadinessInput = {
  secureLinkProviderConnected?: boolean | null;
  guestIdentityScopeReady?: boolean | null;
  mealDietaryAccessibilityFieldsReady?: boolean | null;
  noThirdPartyTrackingPolicyReady?: boolean | null;
  responseExportReady?: boolean | null;
  auditReceiptsPersisted?: boolean | null;
  manualEntryFallbackReady?: boolean | null;
  testedRsvpScenarioCount?: number | null;
  failedRsvpScenarioCount?: number | null;
};

export type WeddingRsvpCollectionReadinessState = {
  status: "verified" | "handoff_only" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  blockerLabels: string[];
};

function count(value: number | null | undefined): number {
  return Math.max(0, Math.trunc(value ?? 0));
}

export function buildWeddingRsvpCollectionReadinessState(
  input: WeddingRsvpCollectionReadinessInput = {},
): WeddingRsvpCollectionReadinessState {
  const tested = count(input.testedRsvpScenarioCount);
  const failed = count(input.failedRsvpScenarioCount);
  const evidenceLabels = [
    input.secureLinkProviderConnected ? "secure RSVP link provider connected" : null,
    input.guestIdentityScopeReady ? "guest identity scope proven" : null,
    input.mealDietaryAccessibilityFieldsReady ? "meal, dietary, and accessibility fields proven" : null,
    input.noThirdPartyTrackingPolicyReady ? "no third-party tracking policy proven" : null,
    input.responseExportReady ? "RSVP response export proven" : null,
    input.auditReceiptsPersisted ? "RSVP audit receipts persist" : null,
    input.manualEntryFallbackReady ? "manual RSVP entry fallback available" : null,
    tested > 0 ? `${tested} RSVP scenarios tested` : "No RSVP scenarios tested",
  ].filter((value): value is string => Boolean(value));
  const blockerLabels: string[] = [];

  if (!input.secureLinkProviderConnected) blockerLabels.push("Secure RSVP link provider is not connected.");
  if (!input.guestIdentityScopeReady) blockerLabels.push("Guest identity scope is not proven.");
  if (!input.mealDietaryAccessibilityFieldsReady) blockerLabels.push("Meal, dietary, and accessibility fields are not proven.");
  if (!input.noThirdPartyTrackingPolicyReady) blockerLabels.push("No third-party tracking policy is not proven.");
  if (!input.responseExportReady) blockerLabels.push("RSVP response export is not proven.");
  if (!input.auditReceiptsPersisted) blockerLabels.push("RSVP audit receipts are not persisted.");
  if (!input.manualEntryFallbackReady) blockerLabels.push("Manual RSVP entry fallback is missing.");
  if (tested < 2) blockerLabels.push("At least two RSVP scenarios must be tested.");
  if (failed > 0) blockerLabels.push(`${failed} RSVP scenario${failed === 1 ? "" : "s"} failed.`);

  if (blockerLabels.length === 0) {
    return {
      status: "verified",
      productionEvidenceReady: true,
      summary: "RSVP collection is verified for secure links, guest scope, meal/dietary/access fields, privacy policy, export, audit receipts, and fallback.",
      evidenceLabels,
      blockerLabels,
    };
  }

  const handoffOnly = Boolean(input.guestIdentityScopeReady)
    && Boolean(input.mealDietaryAccessibilityFieldsReady)
    && Boolean(input.auditReceiptsPersisted)
    && Boolean(input.manualEntryFallbackReady)
    && failed === 0;
  return {
    status: handoffOnly ? "handoff_only" : "blocked",
    productionEvidenceReady: false,
    summary: handoffOnly
      ? "RSVP collection is safe as an audit-recorded manual guest-list handoff, but not verified for secure live RSVP links."
      : "RSVP collection is not production-ready yet.",
    evidenceLabels,
    blockerLabels,
  };
}
