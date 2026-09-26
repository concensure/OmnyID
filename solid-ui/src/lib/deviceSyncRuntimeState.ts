// @locs-version: 1.0
import type { DashboardBootstrap, DeviceSyncPolicyEntry } from "./api";
import { compactSummaryLinesExcluding, deviceSyncSliceSummaryLines } from "./agentSettingsSummaryFormat";
import { dateTimeLabel, relativeTimeLabel } from "./agentSettingsRuntimeFormat";

type DeviceSyncRuntimeSummaryCarrier = DashboardBootstrap["device_sync_runtime_summary"] | null | undefined;
type DeviceSyncPolicyEntriesCarrier = DeviceSyncPolicyEntry[] | null | undefined;

export type DeviceSyncRuntimeSummaryCardState = {
  classBreakdownLabel: string;
  latestActivityLabel: string;
  latestDeviceLabel: string;
  latestLastUsedLine: string;
  latestLastUsedRelativeLine: string;
  latestPolicyNote: string | null;
};

export type DeviceSyncPolicyCardState = {
  deviceId: string;
  policyProfile: string;
  deviceClassLine: string;
  lastUsedLine: string;
  policyUpdatedLine: string;
  bundledUpdatedLine: string;
  policyNote: string | null;
  profileChips: string[];
  sourceChips: string[];
  policyDetailChips: string[];
  syncScopeChips: string[];
};

function deviceSyncPolicyEntries(
  deviceSyncPolicies?: DeviceSyncPolicyEntriesCarrier,
): DeviceSyncPolicyEntry[] {
  return deviceSyncPolicies ?? [];
}

function deviceSyncPolicyNotes(entry: DeviceSyncPolicyEntry): Record<string, unknown> {
  return entry.notes_summary ?? {};
}

export function deviceSyncRuntimeHasSummary(
  deviceSyncRuntimeSummary?: DeviceSyncRuntimeSummaryCarrier,
): boolean {
  return deviceSyncRuntimeSummary !== null && deviceSyncRuntimeSummary !== undefined;
}

export function deviceSyncPolicyCount(
  deviceSyncRuntimeSummary?: DeviceSyncRuntimeSummaryCarrier,
  deviceSyncPolicies?: DeviceSyncPolicyEntriesCarrier,
): number {
  return deviceSyncRuntimeSummary?.device_policy_count ?? deviceSyncPolicyEntries(deviceSyncPolicies).length;
}

export function deviceSyncUsedDeviceCount(
  deviceSyncRuntimeSummary?: DeviceSyncRuntimeSummaryCarrier,
  deviceSyncPolicies?: DeviceSyncPolicyEntriesCarrier,
): number {
  return deviceSyncRuntimeSummary?.used_device_count
    ?? deviceSyncPolicyEntries(deviceSyncPolicies).filter((entry) => Boolean(entry.last_used_at)).length;
}

export function deviceSyncLocalKeyDeviceCount(
  deviceSyncRuntimeSummary?: DeviceSyncRuntimeSummaryCarrier,
  deviceSyncPolicies?: DeviceSyncPolicyEntriesCarrier,
): number {
  return deviceSyncRuntimeSummary?.local_key_device_count
    ?? deviceSyncPolicyEntries(deviceSyncPolicies).filter((entry) => entry.requires_local_key_material).length;
}

export function deviceSyncProvisionedLabel(
  deviceSyncRuntimeSummary?: DeviceSyncRuntimeSummaryCarrier,
  deviceSyncPolicies?: DeviceSyncPolicyEntriesCarrier,
): string {
  return `${deviceSyncPolicyCount(deviceSyncRuntimeSummary, deviceSyncPolicies)} device policies`;
}

export function deviceSyncUsedLabel(
  deviceSyncRuntimeSummary?: DeviceSyncRuntimeSummaryCarrier,
  deviceSyncPolicies?: DeviceSyncPolicyEntriesCarrier,
): string {
  return `${deviceSyncUsedDeviceCount(deviceSyncRuntimeSummary, deviceSyncPolicies)} active bootstrap records`;
}

export function deviceSyncLocalKeysLabel(
  deviceSyncRuntimeSummary?: DeviceSyncRuntimeSummaryCarrier,
  deviceSyncPolicies?: DeviceSyncPolicyEntriesCarrier,
): string {
  const count = deviceSyncLocalKeyDeviceCount(deviceSyncRuntimeSummary, deviceSyncPolicies);
  return `${count} device${count === 1 ? " needs" : "s need"} local key material`;
}

export function deviceSyncClassBreakdownLabel(
  deviceSyncRuntimeSummary?: DeviceSyncRuntimeSummaryCarrier,
): string {
  return `${deviceSyncRuntimeSummary?.desktop_device_count ?? 0} desktop | ${deviceSyncRuntimeSummary?.mobile_device_count ?? 0} mobile | ${deviceSyncRuntimeSummary?.watch_device_count ?? 0} watch`;
}

export function deviceSyncLatestPolicyActivityLabel(
  deviceSyncRuntimeSummary?: DeviceSyncRuntimeSummaryCarrier,
): string {
  return `${deviceSyncRuntimeSummary?.latest_device_class ?? "unknown"} | ${deviceSyncRuntimeSummary?.latest_policy_profile ?? "unknown"}`;
}

export function deviceSyncLatestDeviceLabel(
  deviceSyncRuntimeSummary?: DeviceSyncRuntimeSummaryCarrier,
): string {
  return `device ${deviceSyncRuntimeSummary?.latest_device_id ?? "unknown"}`;
}

export function deviceSyncLatestLastUsedAt(
  deviceSyncRuntimeSummary?: DeviceSyncRuntimeSummaryCarrier,
): string | null {
  return deviceSyncRuntimeSummary?.latest_last_used_at ?? null;
}

export function deviceSyncLatestPolicyNote(
  deviceSyncRuntimeSummary?: DeviceSyncRuntimeSummaryCarrier,
): string | null {
  return deviceSyncRuntimeSummary?.latest_policy_note ?? null;
}

export function deviceSyncRuntimeSummaryCardState(
  deviceSyncRuntimeSummary?: DeviceSyncRuntimeSummaryCarrier,
): DeviceSyncRuntimeSummaryCardState {
  const latestLastUsedAt = deviceSyncLatestLastUsedAt(deviceSyncRuntimeSummary);
  return {
    classBreakdownLabel: deviceSyncClassBreakdownLabel(deviceSyncRuntimeSummary),
    latestActivityLabel: deviceSyncLatestPolicyActivityLabel(deviceSyncRuntimeSummary),
    latestDeviceLabel: deviceSyncLatestDeviceLabel(deviceSyncRuntimeSummary),
    latestLastUsedLine: `last used ${dateTimeLabel(latestLastUsedAt)}`,
    latestLastUsedRelativeLine: relativeTimeLabel(latestLastUsedAt),
    latestPolicyNote: deviceSyncLatestPolicyNote(deviceSyncRuntimeSummary),
  };
}

export function deviceSyncPolicyCardState(
  entry: DeviceSyncPolicyEntry,
): DeviceSyncPolicyCardState {
  const notes = deviceSyncPolicyNotes(entry);
  const policyNote = typeof notes.policy_note === "string" ? notes.policy_note : null;
  const policySource = typeof notes.source === "string" ? notes.source : null;
  const defaultProfile = typeof notes.default_profile === "string" ? notes.default_profile : null;

  return {
    deviceId: entry.device_id,
    policyProfile: entry.policy_profile,
    deviceClassLine: `${entry.device_class} device | ${relativeTimeLabel(entry.last_used_at)} | bundled ${dateTimeLabel(entry.last_bundle_at)}`,
    lastUsedLine: `last used ${dateTimeLabel(entry.last_used_at)}`,
    policyUpdatedLine: `policy updated ${dateTimeLabel(entry.updated_at)}`,
    bundledUpdatedLine: `bundled ${relativeTimeLabel(entry.last_bundle_at)} | updated ${relativeTimeLabel(entry.updated_at)}`,
    policyNote,
    profileChips: [
      entry.policy_profile,
      entry.requires_local_key_material ? "local-key" : "metadata-only",
    ],
    sourceChips: [
      ...(policySource ? [`source: ${policySource}`] : []),
      ...(defaultProfile ? [`default: ${defaultProfile}`] : []),
    ],
    policyDetailChips: compactSummaryLinesExcluding(entry.notes_summary, [
      "policy_note",
      "source",
      "default_profile",
    ]),
    syncScopeChips: deviceSyncSliceSummaryLines(entry.sync_slices),
  };
}

export function deviceSyncPolicyCardStates(
  deviceSyncPolicies?: DeviceSyncPolicyEntriesCarrier,
): DeviceSyncPolicyCardState[] {
  return deviceSyncPolicyEntries(deviceSyncPolicies).map((entry) => deviceSyncPolicyCardState(entry));
}
