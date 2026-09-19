// @locs-version: 2.0
export type WeddingRunSheetAdjustmentReadinessInput = {
  delayOptionModelReady?: boolean | null;
  dependencyImpactPreviewReady?: boolean | null;
  approvalUiReady?: boolean | null;
  dragOrButtonAdjustmentReady?: boolean | null;
  calendarTaskProjectionReady?: boolean | null;
  receiptPersistenceReady?: boolean | null;
  coordinatorFallbackReady?: boolean | null;
  testedAdjustmentScenarioCount?: number | null;
  failedAdjustmentScenarioCount?: number | null;
};

export type WeddingRunSheetAdjustmentReadinessState = {
  status: "verified" | "handoff_only" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  blockerLabels: string[];
};

function count(value: number | null | undefined): number {
  return Math.max(0, Math.trunc(value ?? 0));
}

export function buildWeddingRunSheetAdjustmentReadinessState(
  input: WeddingRunSheetAdjustmentReadinessInput = {},
): WeddingRunSheetAdjustmentReadinessState {
  const tested = count(input.testedAdjustmentScenarioCount);
  const failed = count(input.failedAdjustmentScenarioCount);
  const evidenceLabels = [
    input.delayOptionModelReady ? "delay option model proven" : null,
    input.dependencyImpactPreviewReady ? "dependency impact preview proven" : null,
    input.approvalUiReady ? "run-sheet adjustment approval UI proven" : null,
    input.dragOrButtonAdjustmentReady ? "drag/button adjustment controls proven" : null,
    input.calendarTaskProjectionReady ? "calendar/task projection for adjustments proven" : null,
    input.receiptPersistenceReady ? "run-sheet adjustment receipts persist" : null,
    input.coordinatorFallbackReady ? "coordinator fallback proven" : null,
    tested > 0 ? `${tested} run-sheet adjustment scenarios tested` : "No run-sheet adjustment scenarios tested",
  ].filter((value): value is string => Boolean(value));
  const blockerLabels: string[] = [];

  if (!input.delayOptionModelReady) blockerLabels.push("Delay option model is not proven.");
  if (!input.dependencyImpactPreviewReady) blockerLabels.push("Dependency impact preview is not proven.");
  if (!input.approvalUiReady) blockerLabels.push("Run-sheet adjustment approval UI is not proven.");
  if (!input.dragOrButtonAdjustmentReady) blockerLabels.push("Drag/button adjustment controls are not proven.");
  if (!input.calendarTaskProjectionReady) blockerLabels.push("Calendar/task projection for adjustments is not proven.");
  if (!input.receiptPersistenceReady) blockerLabels.push("Run-sheet adjustment receipts are not persisted.");
  if (!input.coordinatorFallbackReady) blockerLabels.push("Coordinator fallback is not proven.");
  if (tested < 2) blockerLabels.push("At least two run-sheet adjustment scenarios must be tested.");
  if (failed > 0) blockerLabels.push(`${failed} run-sheet adjustment scenario${failed === 1 ? "" : "s"} failed.`);

  if (blockerLabels.length === 0) {
    return {
      status: "verified",
      productionEvidenceReady: true,
      summary: "Run-sheet adjustments are verified for delay options, dependency previews, approval UI, accessible controls, calendar/task projection, receipts, fallback, and scenario tests.",
      evidenceLabels,
      blockerLabels,
    };
  }

  const handoffOnly = Boolean(input.delayOptionModelReady)
    && Boolean(input.dependencyImpactPreviewReady)
    && Boolean(input.approvalUiReady)
    && Boolean(input.calendarTaskProjectionReady)
    && Boolean(input.coordinatorFallbackReady)
    && failed === 0;
  return {
    status: handoffOnly ? "handoff_only" : "blocked",
    productionEvidenceReady: false,
    summary: handoffOnly
      ? "Run-sheet adjustments are safe as an approval-recorded coordinator handoff, but not verified for focused controls, receipts, or production scenario coverage."
      : "Run-sheet adjustments are not production-ready yet.",
    evidenceLabels,
    blockerLabels,
  };
}
