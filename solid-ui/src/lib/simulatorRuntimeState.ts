// @locs-version: 1.0
import type { DashboardBootstrap } from "./api";
import { dateTimeLabel, relativeTimeLabel } from "./agentSettingsRuntimeFormat";

type SimulatorRuntimeSummaryCarrier = DashboardBootstrap["simulator_runtime_summary"] | null | undefined;

export type SimulatorRuntimeSummaryCardState = {
  highestRolloutStageLabel: string;
  enabledSurfacesLabel: string;
  promotionSurfacesLabel: string;
  reviewSurfacesLabel: string;
  sampledSurfacesLabel: string;
  rolloutTrustLines: string[];
  observedSummaryLines: string[];
  surfaceStageChips: string[];
  calibrationModeChips: string[];
  policySummaryLines: string[];
  calibrationNoteLines: string[];
};

function humanizeSimulatorValue(value?: string | null, fallback = "unknown"): string {
  const normalized = value?.trim();
  if (!normalized) return fallback;
  return normalized.replace(/_/g, " ");
}

export function simulatorRuntimeHasSummary(
  simulatorRuntimeSummary?: SimulatorRuntimeSummaryCarrier,
): boolean {
  return simulatorRuntimeSummary !== null && simulatorRuntimeSummary !== undefined;
}

export function simulatorRuntimeHighestRolloutStageLabel(
  simulatorRuntimeSummary?: SimulatorRuntimeSummaryCarrier,
): string {
  return humanizeSimulatorValue(simulatorRuntimeSummary?.highest_rollout_stage, "shadow");
}

export function simulatorRuntimeObservedRolloutStageLabel(
  simulatorRuntimeSummary?: SimulatorRuntimeSummaryCarrier,
): string | null {
  const normalized = simulatorRuntimeSummary?.observed_rollout_stage?.trim();
  return normalized ? humanizeSimulatorValue(normalized) : null;
}

export function simulatorRuntimeObservedCalibrationModeLabel(
  simulatorRuntimeSummary?: SimulatorRuntimeSummaryCarrier,
): string | null {
  const normalized = simulatorRuntimeSummary?.observed_calibration_mode?.trim();
  return normalized ? humanizeSimulatorValue(normalized) : null;
}

export function simulatorRuntimeEnabledSurfacesLabel(
  simulatorRuntimeSummary?: SimulatorRuntimeSummaryCarrier,
): string {
  const count = simulatorRuntimeSummary?.enabled_surface_count ?? 0;
  return `${count} active surface${count === 1 ? "" : "s"}`;
}

export function simulatorRuntimePromotionSurfacesLabel(
  simulatorRuntimeSummary?: SimulatorRuntimeSummaryCarrier,
): string {
  const count = simulatorRuntimeSummary?.promotion_enabled_surface_count ?? 0;
  return `${count} promotion-enabled`;
}

export function simulatorRuntimeReviewSurfacesLabel(
  simulatorRuntimeSummary?: SimulatorRuntimeSummaryCarrier,
): string {
  const count = simulatorRuntimeSummary?.review_surface_count ?? 0;
  return `${count} review surface${count === 1 ? "" : "s"}`;
}

export function simulatorRuntimeSampledSurfacesLabel(
  simulatorRuntimeSummary?: SimulatorRuntimeSummaryCarrier,
): string {
  const count = simulatorRuntimeSummary?.sampled_surface_count ?? 0;
  return `${count} sampled surface${count === 1 ? "" : "s"}`;
}

export function simulatorRuntimeSurfaceStageChips(
  simulatorRuntimeSummary?: SimulatorRuntimeSummaryCarrier,
): string[] {
  return (simulatorRuntimeSummary?.surfaces ?? []).map(
    (surface) => `${surface.surface}: ${humanizeSimulatorValue(surface.rollout_stage, "shadow")}`,
  );
}

export function simulatorRuntimeCalibrationModeChips(
  simulatorRuntimeSummary?: SimulatorRuntimeSummaryCarrier,
): string[] {
  return (simulatorRuntimeSummary?.surfaces ?? []).map(
    (surface) => `${surface.surface}: ${humanizeSimulatorValue(surface.calibration_mode, "unknown")}`,
  );
}

export function simulatorRuntimeCompactTrustSummary(
  simulatorRuntimeSummary?: SimulatorRuntimeSummaryCarrier,
): string {
  if (!simulatorRuntimeHasSummary(simulatorRuntimeSummary)) {
    return "";
  }
  return simulatorRuntimeSummary?.rollout_alignment_summary?.trim()
    || simulatorRuntimeSummary?.policy_posture_summary?.trim()
    || "";
}

export function simulatorRuntimeCompactObservationSummary(
  simulatorRuntimeSummary?: SimulatorRuntimeSummaryCarrier,
): string | null {
  if (!simulatorRuntimeHasSummary(simulatorRuntimeSummary)) {
    return null;
  }
  const observedStage = simulatorRuntimeObservedRolloutStageLabel(simulatorRuntimeSummary);
  const observedMode = simulatorRuntimeObservedCalibrationModeLabel(simulatorRuntimeSummary);
  if (observedStage) {
    return `Latest simulator observation is ${observedStage}${observedMode ? ` / ${observedMode}` : ""}.`;
  }
  const enabledSurfaceCount = simulatorRuntimeSummary?.enabled_surface_count ?? 0;
  const rolloutStage = simulatorRuntimeHighestRolloutStageLabel(simulatorRuntimeSummary);
  if (enabledSurfaceCount > 0) {
    return `Simulator rollout is ${rolloutStage} across ${enabledSurfaceCount} active surface${enabledSurfaceCount === 1 ? "" : "s"}.`;
  }
  return null;
}

export function simulatorRuntimeSummaryCardState(
  simulatorRuntimeSummary?: SimulatorRuntimeSummaryCarrier,
): SimulatorRuntimeSummaryCardState {
  const highestRolloutStageLabel = simulatorRuntimeHighestRolloutStageLabel(simulatorRuntimeSummary);
  const plannedStageRaw = simulatorRuntimeSummary?.highest_rollout_stage ?? null;
  const observedStageRaw = simulatorRuntimeSummary?.observed_rollout_stage ?? null;
  const observedStageLabel = simulatorRuntimeObservedRolloutStageLabel(simulatorRuntimeSummary) ?? "";
  const observedCalibrationModeLabel =
    simulatorRuntimeObservedCalibrationModeLabel(simulatorRuntimeSummary) ?? "";
  const observedCalibrationNotes = (simulatorRuntimeSummary?.observed_calibration_notes ?? []).filter(
    (note) => note.trim().length > 0,
  );
  const rolloutAlignmentSummary = simulatorRuntimeSummary?.rollout_alignment_summary?.trim() ?? "";
  const rolloutTrustLines = simulatorRuntimeHasSummary(simulatorRuntimeSummary)
    ? [
        simulatorRuntimeSummary?.policy_posture_summary?.trim()
          || `Policy posture: ${highestRolloutStageLabel} stage across ${simulatorRuntimeSummary?.enabled_surface_count ?? 0} active surface${(simulatorRuntimeSummary?.enabled_surface_count ?? 0) === 1 ? "" : "s"}.`,
        rolloutAlignmentSummary || (
          observedStageRaw
            ? plannedStageRaw === observedStageRaw
              ? `Latest observed simulation matches the planned ${highestRolloutStageLabel} posture.`
              : `Latest observed simulation used ${observedStageLabel} while policy reports ${highestRolloutStageLabel}.`
            : `No observed simulator run has been recorded yet for the current ${highestRolloutStageLabel} policy posture.`
        ),
      ]
    : [];
  const observedSummaryLines = [
    simulatorRuntimeSummary?.latest_observed_at
      ? `observed at ${dateTimeLabel(simulatorRuntimeSummary.latest_observed_at)}`
      : "",
    simulatorRuntimeSummary?.latest_observed_at
      ? relativeTimeLabel(simulatorRuntimeSummary.latest_observed_at)
      : "",
    simulatorRuntimeSummary?.observed_rollout_stage
      ? `observed stage: ${observedStageLabel}`
      : "",
    simulatorRuntimeSummary?.observed_calibration_mode
      ? `observed mode: ${observedCalibrationModeLabel}`
      : "",
    simulatorRuntimeSummary?.observed_projection_summary ?? "",
    simulatorRuntimeSummary?.observed_review_summary ?? "",
    simulatorRuntimeSummary?.observed_actionable_event_count !== null &&
    simulatorRuntimeSummary?.observed_actionable_event_count !== undefined
      ? `${simulatorRuntimeSummary.observed_actionable_event_count} actionable event${simulatorRuntimeSummary.observed_actionable_event_count === 1 ? "" : "s"}`
      : "",
    simulatorRuntimeSummary?.observed_promotion_candidate_count !== null &&
    simulatorRuntimeSummary?.observed_promotion_candidate_count !== undefined
      ? `${simulatorRuntimeSummary.observed_promotion_candidate_count} promotion candidate${simulatorRuntimeSummary.observed_promotion_candidate_count === 1 ? "" : "s"}`
      : "",
    simulatorRuntimeSummary?.observed_review_surface_count !== null &&
    simulatorRuntimeSummary?.observed_review_surface_count !== undefined
      ? `${simulatorRuntimeSummary.observed_review_surface_count} review surface${simulatorRuntimeSummary.observed_review_surface_count === 1 ? "" : "s"} in latest observation`
      : "",
    ...observedCalibrationNotes,
  ].filter((line) => line.length > 0);
  return {
    highestRolloutStageLabel,
    enabledSurfacesLabel: simulatorRuntimeEnabledSurfacesLabel(simulatorRuntimeSummary),
    promotionSurfacesLabel: simulatorRuntimePromotionSurfacesLabel(simulatorRuntimeSummary),
    reviewSurfacesLabel: simulatorRuntimeReviewSurfacesLabel(simulatorRuntimeSummary),
    sampledSurfacesLabel: simulatorRuntimeSampledSurfacesLabel(simulatorRuntimeSummary),
    rolloutTrustLines,
    observedSummaryLines,
    surfaceStageChips: simulatorRuntimeSurfaceStageChips(simulatorRuntimeSummary),
    calibrationModeChips: simulatorRuntimeCalibrationModeChips(simulatorRuntimeSummary),
    policySummaryLines: (simulatorRuntimeSummary?.surfaces ?? [])
      .map((surface) => {
        const summary = surface.policy_summary || "";
        return summary ? `${surface.surface}: ${summary}` : "";
      })
      .filter((summary) => summary.length > 0),
    calibrationNoteLines: (simulatorRuntimeSummary?.surfaces ?? []).flatMap((surface) =>
      (surface.calibration_notes ?? []).map((note) => `${surface.surface}: ${note}`),
    ),
  };
}
