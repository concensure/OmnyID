// @locs-version: 2.0
export type WeddingLiveRunSheetExecutionReadinessInput = {
  liveDelayIntakeConnected?: boolean | null;
  dependencyRecalculationReady?: boolean | null;
  scopedNotificationRoutesReady?: boolean | null;
  approvalReceiptsPersisted?: boolean | null;
  offlineFallbackReady?: boolean | null;
  testedScenarioCount?: number | null;
  failedScenarioCount?: number | null;
};

export type WeddingLiveRunSheetExecutionReadinessState = {
  status: "verified" | "handoff_only" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  blockerLabels: string[];
};

function count(value: number | null | undefined): number {
  return Math.max(0, Math.trunc(value ?? 0));
}

export function buildWeddingLiveRunSheetExecutionReadinessState(
  input: WeddingLiveRunSheetExecutionReadinessInput = {},
): WeddingLiveRunSheetExecutionReadinessState {
  const testedScenarioCount = count(input.testedScenarioCount);
  const failedScenarioCount = count(input.failedScenarioCount);
  const evidenceLabels = [
    input.liveDelayIntakeConnected ? "live vendor-delay intake connected" : null,
    input.dependencyRecalculationReady ? "run-sheet dependency recalculation proven" : null,
    input.scopedNotificationRoutesReady ? "scoped vendor/guest notification routes proven" : null,
    input.approvalReceiptsPersisted ? "approval receipts persist for day-of changes" : null,
    input.offlineFallbackReady ? "offline coordinator fallback available" : null,
    testedScenarioCount > 0 ? `${testedScenarioCount} live run-sheet scenarios tested` : "No live run-sheet scenarios tested",
  ].filter((value): value is string => Boolean(value));
  const blockerLabels: string[] = [];

  if (!input.liveDelayIntakeConnected) blockerLabels.push("Live vendor-delay intake is not connected.");
  if (!input.dependencyRecalculationReady) blockerLabels.push("Dependency recalculation is not proven.");
  if (!input.scopedNotificationRoutesReady) blockerLabels.push("Scoped notification routes are not proven.");
  if (!input.approvalReceiptsPersisted) blockerLabels.push("Approval receipts are not persisted for day-of changes.");
  if (!input.offlineFallbackReady) blockerLabels.push("Offline coordinator fallback is missing.");
  if (testedScenarioCount < 2) blockerLabels.push("At least two live run-sheet scenarios must be tested.");
  if (failedScenarioCount > 0) {
    blockerLabels.push(`${failedScenarioCount} live run-sheet scenario${failedScenarioCount === 1 ? "" : "s"} failed.`);
  }

  if (blockerLabels.length === 0) {
    return {
      status: "verified",
      productionEvidenceReady: true,
      summary: "Day-of live run-sheet execution is verified for delay intake, recalculation, approvals, scoped notifications, and fallback.",
      evidenceLabels,
      blockerLabels,
    };
  }

  const handoffOnly = Boolean(input.offlineFallbackReady) && Boolean(input.approvalReceiptsPersisted);
  return {
    status: handoffOnly ? "handoff_only" : "blocked",
    productionEvidenceReady: false,
    summary: handoffOnly
      ? "Day-of run-sheet changes are safe as an approval-recorded coordinator handoff, but not verified for live execution."
      : "Day-of live run-sheet execution is not production-ready yet.",
    evidenceLabels,
    blockerLabels,
  };
}
