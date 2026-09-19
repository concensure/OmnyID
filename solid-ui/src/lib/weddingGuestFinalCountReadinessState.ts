// @locs-version: 2.0
export type WeddingGuestFinalCountReadinessInput = {
  rsvpCountSourceReady?: boolean | null;
  catererDeadlineKnown?: boolean | null;
  waitRiskOptionReady?: boolean | null;
  budgetImpactOptionReady?: boolean | null;
  approvalUiReady?: boolean | null;
  submissionExecutorReady?: boolean | null;
  auditReceiptReady?: boolean | null;
  manualFallbackReady?: boolean | null;
  testedGuestCountScenarioCount?: number | null;
  failedGuestCountScenarioCount?: number | null;
};

export type WeddingGuestFinalCountReadinessState = {
  status: "verified" | "handoff_only" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  blockerLabels: string[];
};

function count(value: number | null | undefined): number {
  return Math.max(0, Math.trunc(value ?? 0));
}

export function buildWeddingGuestFinalCountReadinessState(
  input: WeddingGuestFinalCountReadinessInput = {},
): WeddingGuestFinalCountReadinessState {
  const tested = count(input.testedGuestCountScenarioCount);
  const failed = count(input.failedGuestCountScenarioCount);
  const evidenceLabels = [
    input.rsvpCountSourceReady ? "RSVP count source proven" : null,
    input.catererDeadlineKnown ? "caterer final-count deadline known" : null,
    input.waitRiskOptionReady ? "wait-for-RSVPs risk option proven" : null,
    input.budgetImpactOptionReady ? "budget-impact option proven" : null,
    input.approvalUiReady ? "guest final-count approval UI proven" : null,
    input.submissionExecutorReady ? "final-count submission executor proven" : null,
    input.auditReceiptReady ? "guest final-count audit receipt proven" : null,
    input.manualFallbackReady ? "manual guest-count fallback available" : null,
    tested > 0 ? `${tested} guest final-count scenarios tested` : "No guest final-count scenarios tested",
  ].filter((value): value is string => Boolean(value));
  const blockerLabels: string[] = [];

  if (!input.rsvpCountSourceReady) blockerLabels.push("RSVP count source is not proven.");
  if (!input.catererDeadlineKnown) blockerLabels.push("Caterer final-count deadline is not known.");
  if (!input.waitRiskOptionReady) blockerLabels.push("Wait-for-RSVPs risk option is not proven.");
  if (!input.budgetImpactOptionReady) blockerLabels.push("Budget-impact option is not proven.");
  if (!input.approvalUiReady) blockerLabels.push("Guest final-count approval UI is not proven.");
  if (!input.submissionExecutorReady) blockerLabels.push("Final-count submission executor is not proven.");
  if (!input.auditReceiptReady) blockerLabels.push("Guest final-count audit receipt is not proven.");
  if (!input.manualFallbackReady) blockerLabels.push("Manual guest-count fallback is missing.");
  if (tested < 2) blockerLabels.push("At least two guest final-count scenarios must be tested.");
  if (failed > 0) blockerLabels.push(`${failed} guest final-count scenario${failed === 1 ? "" : "s"} failed.`);

  if (blockerLabels.length === 0) {
    return {
      status: "verified",
      productionEvidenceReady: true,
      summary: "Guest final-count submission is verified for RSVP source, caterer deadline, wait-risk and budget options, approval UI, submission executor, audit receipt, fallback, and scenario tests.",
      evidenceLabels,
      blockerLabels,
    };
  }

  const handoffOnly = Boolean(input.rsvpCountSourceReady)
    && Boolean(input.catererDeadlineKnown)
    && Boolean(input.waitRiskOptionReady)
    && Boolean(input.budgetImpactOptionReady)
    && Boolean(input.approvalUiReady)
    && Boolean(input.auditReceiptReady)
    && Boolean(input.manualFallbackReady)
    && failed === 0;
  return {
    status: handoffOnly ? "handoff_only" : "blocked",
    productionEvidenceReady: false,
    summary: handoffOnly
      ? "Guest final-count decisions are safe as approval-recorded manual handoffs, but not verified for live caterer submission or production scenario coverage."
      : "Guest final-count submission is not production-ready yet.",
    evidenceLabels,
    blockerLabels,
  };
}
