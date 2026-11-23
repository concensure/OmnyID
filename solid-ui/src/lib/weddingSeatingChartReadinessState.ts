// @locs-version: 2.0
export type WeddingSeatingChartReadinessInput = {
  focusedCanvasReady?: boolean | null;
  householdGroupingReady?: boolean | null;
  vipAndRoleConstraintsReady?: boolean | null;
  sensitiveSeatingConstraintsReady?: boolean | null;
  accessibilityNeedsReady?: boolean | null;
  dragAndButtonControlsReady?: boolean | null;
  revisionHistoryReady?: boolean | null;
  exportOrVendorBriefReady?: boolean | null;
  testedSeatingScenarioCount?: number | null;
  failedSeatingScenarioCount?: number | null;
};

export type WeddingSeatingChartReadinessState = {
  status: "verified" | "handoff_only" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  blockerLabels: string[];
};

function count(value: number | null | undefined): number {
  return Math.max(0, Math.trunc(value ?? 0));
}

export function buildWeddingSeatingChartReadinessState(
  input: WeddingSeatingChartReadinessInput = {},
): WeddingSeatingChartReadinessState {
  const tested = count(input.testedSeatingScenarioCount);
  const failed = count(input.failedSeatingScenarioCount);
  const evidenceLabels = [
    input.focusedCanvasReady ? "focused seating canvas ready" : null,
    input.householdGroupingReady ? "household grouping constraints proven" : null,
    input.vipAndRoleConstraintsReady ? "VIP and wedding-party role constraints proven" : null,
    input.sensitiveSeatingConstraintsReady ? "sensitive seating constraints proven" : null,
    input.accessibilityNeedsReady ? "accessibility seating needs proven" : null,
    input.dragAndButtonControlsReady ? "drag and button controls proven" : null,
    input.revisionHistoryReady ? "seating revision history proven" : null,
    input.exportOrVendorBriefReady ? "seating export/vendor brief proven" : null,
    tested > 0 ? `${tested} seating scenarios tested` : "No seating scenarios tested",
  ].filter((value): value is string => Boolean(value));
  const blockerLabels: string[] = [];

  if (!input.focusedCanvasReady) blockerLabels.push("Focused seating canvas is not ready.");
  if (!input.householdGroupingReady) blockerLabels.push("Household grouping constraints are not proven.");
  if (!input.vipAndRoleConstraintsReady) blockerLabels.push("VIP and wedding-party role constraints are not proven.");
  if (!input.sensitiveSeatingConstraintsReady) blockerLabels.push("Sensitive seating constraints are not proven.");
  if (!input.accessibilityNeedsReady) blockerLabels.push("Accessibility seating needs are not proven.");
  if (!input.dragAndButtonControlsReady) blockerLabels.push("Drag controls and visible button fallbacks are not proven.");
  if (!input.revisionHistoryReady) blockerLabels.push("Seating revision history is not proven.");
  if (!input.exportOrVendorBriefReady) blockerLabels.push("Seating export or vendor brief is not proven.");
  if (tested < 2) blockerLabels.push("At least two seating scenarios must be tested.");
  if (failed > 0) blockerLabels.push(`${failed} seating scenario${failed === 1 ? "" : "s"} failed.`);

  if (blockerLabels.length === 0) {
    return {
      status: "verified",
      productionEvidenceReady: true,
      summary: "Seating chart review is verified for canvas controls, household/VIP/sensitive/accessibility constraints, revisions, export, and scenario tests.",
      evidenceLabels,
      blockerLabels,
    };
  }

  const handoffOnly = Boolean(input.householdGroupingReady)
    && Boolean(input.sensitiveSeatingConstraintsReady)
    && Boolean(input.accessibilityNeedsReady)
    && Boolean(input.exportOrVendorBriefReady)
    && failed === 0;
  return {
    status: handoffOnly ? "handoff_only" : "blocked",
    productionEvidenceReady: false,
    summary: handoffOnly
      ? "Seating chart work is safe as a structured vendor-brief handoff, but not verified as an interactive seating canvas."
      : "Seating chart review is not production-ready yet.",
    evidenceLabels,
    blockerLabels,
  };
}
