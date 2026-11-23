// @locs-version: 2.0
export type WeddingDayOfEmergencyReadinessInput = {
  emergencyPlaybooksReady?: boolean | null;
  vendorNoShowFallbackReady?: boolean | null;
  weatherEmergencyActivationReady?: boolean | null;
  verifiedWeatherOrSourceReady?: boolean | null;
  scopedNotificationReady?: boolean | null;
  approvalUiReady?: boolean | null;
  executorReady?: boolean | null;
  auditReceiptReady?: boolean | null;
  manualCoordinatorFallbackReady?: boolean | null;
  testedEmergencyScenarioCount?: number | null;
  failedEmergencyScenarioCount?: number | null;
};

export type WeddingDayOfEmergencyReadinessState = {
  status: "verified" | "handoff_only" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  blockerLabels: string[];
};

function count(value: number | null | undefined): number {
  return Math.max(0, Math.trunc(value ?? 0));
}

export function buildWeddingDayOfEmergencyReadinessState(
  input: WeddingDayOfEmergencyReadinessInput = {},
): WeddingDayOfEmergencyReadinessState {
  const tested = count(input.testedEmergencyScenarioCount);
  const failed = count(input.failedEmergencyScenarioCount);
  const evidenceLabels = [
    input.emergencyPlaybooksReady ? "day-of emergency playbooks proven" : null,
    input.vendorNoShowFallbackReady ? "vendor no-show fallback proven" : null,
    input.weatherEmergencyActivationReady ? "weather emergency activation path proven" : null,
    input.verifiedWeatherOrSourceReady ? "verified weather/source evidence proven" : null,
    input.scopedNotificationReady ? "scoped emergency notification routes proven" : null,
    input.approvalUiReady ? "emergency approval UI proven" : null,
    input.executorReady ? "emergency executor path proven" : null,
    input.auditReceiptReady ? "emergency audit receipts persist" : null,
    input.manualCoordinatorFallbackReady ? "manual coordinator fallback available" : null,
    tested > 0 ? `${tested} day-of emergency scenarios tested` : "No day-of emergency scenarios tested",
  ].filter((value): value is string => Boolean(value));
  const blockerLabels: string[] = [];

  if (!input.emergencyPlaybooksReady) blockerLabels.push("Day-of emergency playbooks are not proven.");
  if (!input.vendorNoShowFallbackReady) blockerLabels.push("Vendor no-show fallback is not proven.");
  if (!input.weatherEmergencyActivationReady) blockerLabels.push("Weather emergency activation path is not proven.");
  if (!input.verifiedWeatherOrSourceReady) blockerLabels.push("Verified weather/source evidence is not proven.");
  if (!input.scopedNotificationReady) blockerLabels.push("Scoped emergency notification routes are not proven.");
  if (!input.approvalUiReady) blockerLabels.push("Emergency approval UI is not proven.");
  if (!input.executorReady) blockerLabels.push("Emergency executor path is not proven.");
  if (!input.auditReceiptReady) blockerLabels.push("Emergency audit receipts are not persisted.");
  if (!input.manualCoordinatorFallbackReady) blockerLabels.push("Manual coordinator fallback is missing.");
  if (tested < 2) blockerLabels.push("At least two day-of emergency scenarios must be tested.");
  if (failed > 0) blockerLabels.push(`${failed} day-of emergency scenario${failed === 1 ? "" : "s"} failed.`);

  if (blockerLabels.length === 0) {
    return {
      status: "verified",
      productionEvidenceReady: true,
      summary: "Day-of emergency handling is verified for playbooks, no-show fallback, weather activation, source evidence, scoped notifications, approval, executor path, receipts, fallback, and scenario tests.",
      evidenceLabels,
      blockerLabels,
    };
  }

  const handoffOnly = Boolean(input.emergencyPlaybooksReady)
    && Boolean(input.vendorNoShowFallbackReady)
    && Boolean(input.weatherEmergencyActivationReady)
    && Boolean(input.approvalUiReady)
    && Boolean(input.auditReceiptReady)
    && Boolean(input.manualCoordinatorFallbackReady)
    && failed === 0;
  return {
    status: handoffOnly ? "handoff_only" : "blocked",
    productionEvidenceReady: false,
    summary: handoffOnly
      ? "Day-of emergency handling is safe as an approval-recorded coordinator handoff, but not verified for live source evidence, scoped notification execution, or production scenario coverage."
      : "Day-of emergency handling is not production-ready yet.",
    evidenceLabels,
    blockerLabels,
  };
}
