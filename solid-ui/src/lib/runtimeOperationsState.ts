// @locs-version: 1.0
import type { DashboardBootstrap, RuntimeUpdatesResponse } from "./api";
import { compactSummaryLines } from "./agentSettingsSummaryFormat";
import { dateTimeLabel, relativeTimeLabel } from "./agentSettingsRuntimeFormat";
import {
  runtimeDeploymentFramework,
  runtimeDeploymentStatus,
  type RuntimeDeploymentState,
} from "./runtimeDeploymentState";
import {
  runtimeUpdatesCurrentVersionLabel,
  runtimeUpdatesEntries,
  runtimeUpdatesLastAppliedAt,
  runtimeUpdatesLastCheckedAt,
  runtimeUpdatesLatestEventAt,
  runtimeUpdatesLatestVersionLabel,
  runtimeUpdatesPressureLabel,
} from "./runtimeUpdatesState";
import {
  simulatorRuntimeCompactTrustSummary,
  simulatorRuntimeHighestRolloutStageLabel,
  simulatorRuntimeObservedRolloutStageLabel,
} from "./simulatorRuntimeState";

export type RuntimeOperationRow = {
  label: string;
  value: string;
};

export type RuntimeUpdateEventCard = {
  id: string;
  title: string;
  versionSummary: string;
  relativeCreatedAt: string;
  noteChips: string[];
};

type RuntimeDeploymentCarrier = DashboardBootstrap["runtime_deployment"] | null | undefined;
type RuntimeUpdatesCarrier = RuntimeUpdatesResponse | null | undefined;
type SimulatorRuntimeSummaryCarrier = DashboardBootstrap["simulator_runtime_summary"] | null | undefined;

function dateTimeRelativeSummary(value?: string | null): string {
  return `${dateTimeLabel(value)} | ${relativeTimeLabel(value)}`;
}

function humanizeSimulatorValue(value?: string | null, fallback = "unknown"): string {
  const normalized = value?.trim();
  if (!normalized) return fallback;
  return normalized.replace(/_/g, " ");
}

export function runtimeOperationsOverviewRows(
  runtimeDeployment?: RuntimeDeploymentCarrier,
  runtimeUpdates?: RuntimeUpdatesCarrier,
  simulatorRuntimeSummary?: SimulatorRuntimeSummaryCarrier,
): RuntimeOperationRow[] {
  const observedRolloutStage = simulatorRuntimeObservedRolloutStageLabel(simulatorRuntimeSummary);
  const latestObservedAt = simulatorRuntimeSummary?.latest_observed_at ?? null;
  const rolloutAlignmentSummary = simulatorRuntimeCompactTrustSummary(simulatorRuntimeSummary);
  const rolloutAlignmentStatus = simulatorRuntimeSummary?.rollout_alignment_status?.trim() ?? "";
  const latestObservationSuffix = [
    observedRolloutStage ? `stage ${observedRolloutStage}` : "",
    simulatorRuntimeSummary?.observed_actionable_event_count !== null &&
    simulatorRuntimeSummary?.observed_actionable_event_count !== undefined
      ? `${simulatorRuntimeSummary.observed_actionable_event_count} actionable`
      : "",
    simulatorRuntimeSummary?.observed_promotion_candidate_count !== null &&
    simulatorRuntimeSummary?.observed_promotion_candidate_count !== undefined
      ? `${simulatorRuntimeSummary.observed_promotion_candidate_count} promotion candidate${simulatorRuntimeSummary.observed_promotion_candidate_count === 1 ? "" : "s"}`
      : "",
  ]
    .filter((value) => value.length > 0)
    .join(" | ");

  return [
    {
      label: "Status",
      value: runtimeDeploymentStatus(runtimeDeployment as RuntimeDeploymentState | null | undefined, runtimeUpdates),
    },
    {
      label: "Framework",
      value: runtimeDeploymentFramework(runtimeDeployment as RuntimeDeploymentState | null | undefined, runtimeUpdates) ?? "none",
    },
    {
      label: "Latest version",
      value: runtimeUpdatesLatestVersionLabel(runtimeUpdates),
    },
    {
      label: "Current version",
      value: runtimeUpdatesCurrentVersionLabel(runtimeUpdates),
    },
    {
      label: "Update pressure",
      value: runtimeUpdatesPressureLabel(runtimeUpdates),
    },
    {
      label: "Simulator stage",
      value: observedRolloutStage
        ? observedRolloutStage
        : simulatorRuntimeHighestRolloutStageLabel(simulatorRuntimeSummary),
    },
    {
      label: "Simulator trust",
      value: rolloutAlignmentSummary
        || simulatorRuntimeSummary?.policy_posture_summary?.trim()
        || "No simulator rollout posture available",
    },
    {
      label: "Latest simulation",
      value: latestObservedAt
        ? latestObservationSuffix
          ? `${dateTimeRelativeSummary(latestObservedAt)} | ${latestObservationSuffix}`
          : dateTimeRelativeSummary(latestObservedAt)
        : rolloutAlignmentStatus === "policy_only"
          ? "No observed simulation yet | policy only"
          : "No observed simulation yet",
    },
    {
      label: "Last checked",
      value: dateTimeRelativeSummary(runtimeUpdatesLastCheckedAt(runtimeUpdates)),
    },
    {
      label: "Last applied",
      value: dateTimeRelativeSummary(runtimeUpdatesLastAppliedAt(runtimeUpdates)),
    },
    {
      label: "Last update event",
      value: dateTimeRelativeSummary(runtimeUpdatesLatestEventAt(runtimeUpdates)),
    },
  ];
}

export function runtimeUpdateEventCards(
  runtimeUpdates?: RuntimeUpdatesCarrier,
  limit = 3,
): RuntimeUpdateEventCard[] {
  return runtimeUpdatesEntries(runtimeUpdates).slice(0, limit).map((entry) => ({
    id: entry.id,
    title: `${entry.action} | ${entry.status}`,
    versionSummary: `${entry.from_version ?? "unknown"} -> ${entry.to_version ?? "pending"} | ${dateTimeLabel(entry.created_at)}`,
    relativeCreatedAt: relativeTimeLabel(entry.created_at),
    noteChips: compactSummaryLines(entry.notes_summary),
  }));
}
