// @locs-version: 2.0
export type WeddingControlledOutreachReadinessInput = {
  approvalUiReady?: boolean | null;
  contactInfoConsentReady?: boolean | null;
  vendorSafePayloadReady?: boolean | null;
  emailOrContactExecutorReady?: boolean | null;
  noSpamPolicyReady?: boolean | null;
  providerSetupFallbackReady?: boolean | null;
  receiptPersistenceReady?: boolean | null;
  rejectionPathReady?: boolean | null;
  testedOutreachScenarioCount?: number | null;
  failedOutreachScenarioCount?: number | null;
};

export type WeddingControlledOutreachReadinessState = {
  status: "verified" | "handoff_only" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  blockerLabels: string[];
};

function count(value: number | null | undefined): number {
  return Math.max(0, Math.trunc(value ?? 0));
}

export function buildWeddingControlledOutreachReadinessState(
  input: WeddingControlledOutreachReadinessInput = {},
): WeddingControlledOutreachReadinessState {
  const tested = count(input.testedOutreachScenarioCount);
  const failed = count(input.failedOutreachScenarioCount);
  const evidenceLabels = [
    input.approvalUiReady ? "controlled outreach approval UI proven" : null,
    input.contactInfoConsentReady ? "contact-info sharing consent proven" : null,
    input.vendorSafePayloadReady ? "vendor-safe payload filtering proven" : null,
    input.emailOrContactExecutorReady ? "email/contact executor proven for outreach" : null,
    input.noSpamPolicyReady ? "no-spam outreach policy proven" : null,
    input.providerSetupFallbackReady ? "provider setup fallback proven" : null,
    input.receiptPersistenceReady ? "outreach receipts persist" : null,
    input.rejectionPathReady ? "outreach rejection path proven" : null,
    tested > 0 ? `${tested} controlled-outreach scenarios tested` : "No controlled-outreach scenarios tested",
  ].filter((value): value is string => Boolean(value));
  const blockerLabels: string[] = [];

  if (!input.approvalUiReady) blockerLabels.push("Controlled outreach approval UI is not proven.");
  if (!input.contactInfoConsentReady) blockerLabels.push("Contact-info sharing consent is not proven.");
  if (!input.vendorSafePayloadReady) blockerLabels.push("Vendor-safe payload filtering is not proven.");
  if (!input.emailOrContactExecutorReady) blockerLabels.push("Email/contact executor is not proven for outreach.");
  if (!input.noSpamPolicyReady) blockerLabels.push("No-spam outreach policy is not proven.");
  if (!input.providerSetupFallbackReady) blockerLabels.push("Provider setup fallback is not proven.");
  if (!input.receiptPersistenceReady) blockerLabels.push("Outreach receipts are not persisted.");
  if (!input.rejectionPathReady) blockerLabels.push("Outreach rejection path is not proven.");
  if (tested < 2) blockerLabels.push("At least two controlled-outreach scenarios must be tested.");
  if (failed > 0) blockerLabels.push(`${failed} controlled-outreach scenario${failed === 1 ? "" : "s"} failed.`);

  if (blockerLabels.length === 0) {
    return {
      status: "verified",
      productionEvidenceReady: true,
      summary: "Controlled outreach is verified for approval, contact-info consent, vendor-safe payloads, executor delivery, no-spam policy, setup fallback, receipts, rejection path, and scenario tests.",
      evidenceLabels,
      blockerLabels,
    };
  }

  const handoffOnly = Boolean(input.approvalUiReady)
    && Boolean(input.contactInfoConsentReady)
    && Boolean(input.vendorSafePayloadReady)
    && Boolean(input.noSpamPolicyReady)
    && Boolean(input.providerSetupFallbackReady)
    && Boolean(input.rejectionPathReady)
    && failed === 0;
  return {
    status: handoffOnly ? "handoff_only" : "blocked",
    productionEvidenceReady: false,
    summary: handoffOnly
      ? "Controlled outreach is safe as an approval-recorded manual handoff, but not verified for live email/contact execution or durable receipts."
      : "Controlled outreach is not production-ready yet.",
    evidenceLabels,
    blockerLabels,
  };
}
