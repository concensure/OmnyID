// @locs-version: 1.0
import type { RuntimeBackupManifestResponse } from "./api";
import { dateTimeLabel, relativeTimeLabel } from "./agentSettingsRuntimeFormat";
import { runtimeManifestSummaryLines } from "./agentSettingsRuntimeSummaryFormat";

type RuntimeBackupManifestCarrier = RuntimeBackupManifestResponse | null | undefined;

export type RuntimeBackupManifestReviewState = {
  title: string;
  lifecycleLine: string;
  relativeLifecycleLine: string;
  manifestLines: string[];
};

export function runtimeBackupManifestId(
  manifest?: RuntimeBackupManifestCarrier,
  fallback = "unknown",
): string {
  return manifest?.id ?? fallback;
}

export function runtimeBackupManifestStorageMode(
  manifest?: RuntimeBackupManifestCarrier,
  fallback = "unknown",
): string {
  return manifest?.storage_mode ?? fallback;
}

export function runtimeBackupManifestCreatedAt(
  manifest?: RuntimeBackupManifestCarrier,
): string | null {
  return manifest?.created_at ?? null;
}

export function runtimeBackupManifestExpiresAt(
  manifest?: RuntimeBackupManifestCarrier,
): string | null {
  return manifest?.expires_at ?? null;
}

export function runtimeBackupManifestHeaderLabel(
  manifest?: RuntimeBackupManifestCarrier,
): string {
  return `Manifest review | ${runtimeBackupManifestId(manifest)}`;
}

export function runtimeBackupManifestLifecycleSummary(
  manifest?: RuntimeBackupManifestCarrier,
): string {
  return `${runtimeBackupManifestStorageMode(manifest)} | created ${runtimeBackupManifestCreatedAt(manifest) ?? "unknown"} | expires ${runtimeBackupManifestExpiresAt(manifest) ?? "unknown"}`;
}

export function runtimeBackupManifestReviewState(
  manifest?: RuntimeBackupManifestCarrier,
): RuntimeBackupManifestReviewState {
  return {
    title: runtimeBackupManifestHeaderLabel(manifest),
    lifecycleLine: `${runtimeBackupManifestStorageMode(manifest)} | created ${dateTimeLabel(runtimeBackupManifestCreatedAt(manifest))} | expires ${dateTimeLabel(runtimeBackupManifestExpiresAt(manifest))}`,
    relativeLifecycleLine: `${relativeTimeLabel(runtimeBackupManifestCreatedAt(manifest))} | expires ${relativeTimeLabel(runtimeBackupManifestExpiresAt(manifest))}`,
    manifestLines: runtimeManifestSummaryLines(manifest ?? null),
  };
}
