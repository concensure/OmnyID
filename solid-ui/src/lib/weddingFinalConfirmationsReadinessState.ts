// @locs-version: 2.0
export type WeddingFinalConfirmationsReadinessInput = {
  vendorConfirmationTasksReady?: boolean | null;
  approvalUiReady?: boolean | null;
  emailOrContactExecutorReady?: boolean | null;
  reminderCadenceReady?: boolean | null;
  noSpamPolicyReady?: boolean | null;
  guestFinalCountDecisionReady?: boolean | null;
  paymentReviewLinked?: boolean | null;
  auditReceiptsPersisted?: boolean | null;
  manualFallbackReady?: boolean | null;
  testedFinalConfirmationScenarioCount?: number | null;
  failedFinalConfirmationScenarioCount?: number | null;
};

export type WeddingFinalConfirmationsReadinessState = {
  status: "verified" | "handoff_only" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  blockerLabels: string[];
};

function count(value: number | null | undefined): number {
  return Math.max(0, Math.trunc(value ?? 0));
}

export function buildWeddingFinalConfirmationsReadinessState(
  input: WeddingFinalConfirmationsReadinessInput = {},
): WeddingFinalConfirmationsReadinessState {
  const tested = count(input.testedFinalConfirmationScenarioCount);
  const failed = count(input.failedFinalConfirmationScenarioCount);
  const evidenceLabels = [
    input.vendorConfirmationTasksReady ? "vendor confirmation tasks proven" : null,
    input.approvalUiReady ? "approval UI proven for reminders and submissions" : null,
    input.emailOrContactExecutorReady ? "email/contact executor proven" : null,
    input.reminderCadenceReady ? "final reminder cadence proven" : null,
    input.noSpamPolicyReady ? "no-spam policy proven" : null,
    input.guestFinalCountDecisionReady ? "guest final-count decision proven" : null,
    input.paymentReviewLinked ? "payment review linked" : null,
    input.auditReceiptsPersisted ? "final-confirmation audit receipts persist" : null,
    input.manualFallbackReady ? "manual final-confirmation fallback available" : null,
    tested > 0 ? `${tested} final-confirmation scenarios tested` : "No final-confirmation scenarios tested",
  ].filter((value): value is string => Boolean(value));
  const blockerLabels: string[] = [];

  if (!input.vendorConfirmationTasksReady) blockerLabels.push("Vendor confirmation tasks are not proven.");
  if (!input.approvalUiReady) blockerLabels.push("Approval UI is not proven for final reminders or submissions.");
  if (!input.emailOrContactExecutorReady) blockerLabels.push("Email/contact executor is not proven.");
  if (!input.reminderCadenceReady) blockerLabels.push("Final reminder cadence is not proven.");
  if (!input.noSpamPolicyReady) blockerLabels.push("No-spam policy is not proven for final reminders.");
  if (!input.guestFinalCountDecisionReady) blockerLabels.push("Guest final-count decision is not proven.");
  if (!input.paymentReviewLinked) blockerLabels.push("Payment review is not linked to final confirmations.");
  if (!input.auditReceiptsPersisted) blockerLabels.push("Final-confirmation audit receipts are not persisted.");
  if (!input.manualFallbackReady) blockerLabels.push("Manual final-confirmation fallback is missing.");
  if (tested < 2) blockerLabels.push("At least two final-confirmation scenarios must be tested.");
  if (failed > 0) blockerLabels.push(`${failed} final-confirmation scenario${failed === 1 ? "" : "s"} failed.`);

  if (blockerLabels.length === 0) {
    return {
      status: "verified",
      productionEvidenceReady: true,
      summary: "Final confirmations are verified for vendor reminders, approval UI, contact execution, reminder cadence, no-spam policy, guest-count decisions, payment review, audit receipts, fallback, and scenario tests.",
      evidenceLabels,
      blockerLabels,
    };
  }

  const handoffOnly = Boolean(input.vendorConfirmationTasksReady)
    && Boolean(input.approvalUiReady)
    && Boolean(input.guestFinalCountDecisionReady)
    && Boolean(input.paymentReviewLinked)
    && Boolean(input.auditReceiptsPersisted)
    && Boolean(input.manualFallbackReady)
    && failed === 0;
  return {
    status: handoffOnly ? "handoff_only" : "blocked",
    productionEvidenceReady: false,
    summary: handoffOnly
      ? "Final confirmations are safe as approval-recorded manual handoffs, but not verified for live vendor reminders or submissions."
      : "Final confirmations are not production-ready yet.",
    evidenceLabels,
    blockerLabels,
  };
}
