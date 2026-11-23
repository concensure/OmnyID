// @locs-version: 1.0
import type { DashboardBootstrap } from "./api";
import {
  simulatorRuntimeCompactObservationSummary,
  simulatorRuntimeCompactTrustSummary,
  simulatorRuntimeHighestRolloutStageLabel,
  simulatorRuntimeObservedCalibrationModeLabel,
  simulatorRuntimeObservedRolloutStageLabel,
} from "./simulatorRuntimeState";

type RuntimeDeploymentCarrier = DashboardBootstrap["runtime_deployment"] | null | undefined;
type SimulatorRuntimeSummaryCarrier = DashboardBootstrap["simulator_runtime_summary"] | null | undefined;
type OperationalGuidanceCarrier = DashboardBootstrap["operational_guidance"] | null | undefined;

export type OperationalRuntimeLaneState = {
  title: string;
  detail: string;
  reason: string;
};

export function operationalRuntimeLaneState(
  runtimeFramework: string | null,
  runtimeStatus: string,
  runtimeDeploymentState: RuntimeDeploymentCarrier,
  simulatorRuntimeSummary: SimulatorRuntimeSummaryCarrier,
  operationalGuidance?: OperationalGuidanceCarrier,
): OperationalRuntimeLaneState {
  const observedRolloutStage = simulatorRuntimeObservedRolloutStageLabel(simulatorRuntimeSummary);
  const observedCalibrationMode = simulatorRuntimeObservedCalibrationModeLabel(simulatorRuntimeSummary);
  const rolloutStage = observedRolloutStage || simulatorRuntimeHighestRolloutStageLabel(simulatorRuntimeSummary);
  const simulatorSummary = simulatorRuntimeCompactObservationSummary(simulatorRuntimeSummary);
  const simulatorTrustSummary = simulatorRuntimeCompactTrustSummary(simulatorRuntimeSummary);
  const runtimeDetail = runtimeDeploymentState
    ? "Deployment and update telemetry are available."
    : "No active runtime deployment is attached yet.";
  const operationalGuidanceSummary = operationalGuidance?.summary?.trim() || null;
  const operationalGuidanceReason = operationalGuidance?.pressure_status?.trim()
    ? `operator gate ${operationalGuidance.pressure_status}`
    : operationalGuidanceSummary
      ? "operator gate recorded"
      : null;

  return {
    title: runtimeFramework
      ? observedRolloutStage
        ? `${runtimeFramework} runtime ${runtimeStatus} | simulator ${observedRolloutStage}`
        : `${runtimeFramework} runtime ${runtimeStatus}`
      : `Runtime ${runtimeStatus}`,
    detail: [
      runtimeDetail,
      operationalGuidanceSummary,
      simulatorSummary,
      simulatorTrustSummary,
    ].filter((value): value is string => Boolean(value && value.trim().length > 0)).join(" "),
    reason: operationalGuidanceReason
      ? operationalGuidanceReason
      : observedRolloutStage
      ? observedCalibrationMode
        ? `simulator observation at ${observedRolloutStage} / ${observedCalibrationMode}`
        : `simulator observation at ${observedRolloutStage}`
      : simulatorTrustSummary
        ? "simulator rollout policy summarized"
        : runtimeDeploymentState
          ? "deployment telemetry attached"
          : "no runtime deployment attached",
  };
}
