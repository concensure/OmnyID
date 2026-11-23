// @locs-version: 2.0
export type WeddingFollowUpAutomationReadinessInput = {
  escalationLadderReady?: boolean | null;
  approvalGateReady?: boolean | null;
  emailOrContactExecutorReady?: boolean | null;
  oneFollowUpLimitReady?: boolean | null;
  userEscalationReady?: boolean | null;
  unresponsiveAlternativeReady?: boolean | null;
  receiptPersistenceReady?: boolean | null;
  manualCallMoveOnOptionsReady?: boolean | null;
  testedFollowUpScenarioCount?: number | null;
  failedFollowUpScenarioCount?: number | null;
};

export type WeddingFollowUpAutomationReadinessState = {
  status: "verified" | "handoff_only" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  blockerLabels: string[];
};

function count(value: number | null | undefined): number {
  return Math.max(0, Math.trunc(value ?? 0));
}

export function buildWeddingFollowUpAutomationReadinessState(
  input: WeddingFollowUpAutomationReadinessInput = {},
): WeddingFollowUpAutomationReadinessState {
  const tested = count(input.testedFollowUpScenarioCount);
  const failed = count(input.failedFollowUpScenarioCount);
  const evidenceLabels = [
    input.escalationLadderReady ? "5/7/10 day escalation ladder proven" : null,
    input.approvalGateReady ? "follow-up approval gate proven" : null,
    input.emailOrContactExecutorReady ? "email/contact executor proven for follow-ups" : null,
    input.oneFollowUpLimitReady ? "one-follow-up limit proven" : null,
    input.userEscalationReady ? "day-7 user escalation proven" : null,
    input.unresponsiveAlternativeReady ? "day-10 unresponsive alternative path proven" : null,
    input.receiptPersistenceReady ? "follow-up receipts persist" : null,
    input.manualCallMoveOnOptionsReady ? "manual call/move-on options proven" : null,
    tested > 0 ? `${tested} follow-up automation scenarios tested` : "No follow-up automation scenarios tested",
  ].filter((value): value is string => Boolean(value));
  const blockerLabels: string[] = [];

  if (!input.escalationLadderReady) blockerLabels.push("5/7/10 day escalation ladder is not proven.");
  if (!input.approvalGateReady) blockerLabels.push("Follow-up approval gate is not proven.");
  if (!input.emailOrContactExecutorReady) blockerLabels.push("Email/contact executor is not proven for follow-ups.");
  if (!input.oneFollowUpLimitReady) blockerLabels.push("One-follow-up limit is not proven.");
  if (!input.userEscalationReady) blockerLabels.push("Day-7 user escalation is not proven.");
  if (!input.unresponsiveAlternativeReady) blockerLabels.push("Day-10 unresponsive alternative path is not proven.");
  if (!input.receiptPersistenceReady) blockerLabels.push("Follow-up receipts are not persisted.");
  if (!input.manualCallMoveOnOptionsReady) blockerLabels.push("Manual call or move-on options are not proven.");
  if (tested < 4) blockerLabels.push("Initial, day-5, day-7, and day-10 follow-up scenarios must be tested.");
  if (failed > 0) blockerLabels.push(`${failed} follow-up automation scenario${failed === 1 ? "" : "s"} failed.`);

  if (blockerLabels.length === 0) {
    return {
      status: "verified",
      productionEvidenceReady: true,
      summary: "Follow-up automation is verified for the 5/7/10 day ladder, approval gate, contact executor, no-spam limit, receipts, manual decisions, and scenario tests.",
      evidenceLabels,
      blockerLabels,
    };
  }

  const handoffOnly = Boolean(input.escalationLadderReady)
    && Boolean(input.approvalGateReady)
    && Boolean(input.oneFollowUpLimitReady)
    && Boolean(input.userEscalationReady)
    && Boolean(input.unresponsiveAlternativeReady)
    && Boolean(input.manualCallMoveOnOptionsReady)
    && failed === 0;
  return {
    status: handoffOnly ? "handoff_only" : "blocked",
    productionEvidenceReady: false,
    summary: handoffOnly
      ? "Follow-up automation is safe as an approval-recorded manual escalation handoff, but not verified for live contact execution or durable receipts."
      : "Follow-up automation is not production-ready yet.",
    evidenceLabels,
    blockerLabels,
  };
}
