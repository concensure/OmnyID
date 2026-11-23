// @locs-version: 2.0
export type WeddingGuestMessagingReadinessInput = {
  secureGuestChannelConnected?: boolean | null;
  scopedAudienceControlsReady?: boolean | null;
  optInContactSourceReady?: boolean | null;
  rateLimitAndNoSpamPolicyReady?: boolean | null;
  approvalReceiptsPersisted?: boolean | null;
  deliveryReceiptsAvailable?: boolean | null;
  emergencyFallbackReady?: boolean | null;
  testedMessageScenarioCount?: number | null;
  failedMessageScenarioCount?: number | null;
};

export type WeddingGuestMessagingReadinessState = {
  status: "verified" | "handoff_only" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  blockerLabels: string[];
};

function count(value: number | null | undefined): number {
  return Math.max(0, Math.trunc(value ?? 0));
}

export function buildWeddingGuestMessagingReadinessState(
  input: WeddingGuestMessagingReadinessInput = {},
): WeddingGuestMessagingReadinessState {
  const tested = count(input.testedMessageScenarioCount);
  const failed = count(input.failedMessageScenarioCount);
  const evidenceLabels = [
    input.secureGuestChannelConnected ? "secure guest messaging channel connected" : null,
    input.scopedAudienceControlsReady ? "scoped audience controls proven" : null,
    input.optInContactSourceReady ? "opt-in guest contact source proven" : null,
    input.rateLimitAndNoSpamPolicyReady ? "rate-limit and no-spam policy proven" : null,
    input.approvalReceiptsPersisted ? "approval receipts persist for guest messages" : null,
    input.deliveryReceiptsAvailable ? "delivery receipts available" : null,
    input.emergencyFallbackReady ? "manual emergency broadcast fallback available" : null,
    tested > 0 ? `${tested} guest-message scenarios tested` : "No guest-message scenarios tested",
  ].filter((value): value is string => Boolean(value));
  const blockerLabels: string[] = [];

  if (!input.secureGuestChannelConnected) blockerLabels.push("Secure guest messaging channel is not connected.");
  if (!input.scopedAudienceControlsReady) blockerLabels.push("Scoped audience controls are not proven.");
  if (!input.optInContactSourceReady) blockerLabels.push("Opt-in guest contact source is not proven.");
  if (!input.rateLimitAndNoSpamPolicyReady) blockerLabels.push("Rate-limit and no-spam policy is not proven.");
  if (!input.approvalReceiptsPersisted) blockerLabels.push("Approval receipts are not persisted for guest messages.");
  if (!input.deliveryReceiptsAvailable) blockerLabels.push("Delivery receipts are not available.");
  if (!input.emergencyFallbackReady) blockerLabels.push("Manual emergency broadcast fallback is missing.");
  if (tested < 2) blockerLabels.push("At least two guest-message scenarios must be tested.");
  if (failed > 0) blockerLabels.push(`${failed} guest-message scenario${failed === 1 ? "" : "s"} failed.`);

  if (blockerLabels.length === 0) {
    return {
      status: "verified",
      productionEvidenceReady: true,
      summary: "Guest messaging is verified for secure scoped updates, opt-in contacts, approvals, receipts, no-spam limits, and fallback.",
      evidenceLabels,
      blockerLabels,
    };
  }

  const handoffOnly = Boolean(input.scopedAudienceControlsReady)
    && Boolean(input.approvalReceiptsPersisted)
    && Boolean(input.emergencyFallbackReady)
    && failed === 0;
  return {
    status: handoffOnly ? "handoff_only" : "blocked",
    productionEvidenceReady: false,
    summary: handoffOnly
      ? "Guest messaging is safe as an approval-recorded coordinator handoff, but not verified for live guest delivery."
      : "Guest messaging is not production-ready yet.",
    evidenceLabels,
    blockerLabels,
  };
}
