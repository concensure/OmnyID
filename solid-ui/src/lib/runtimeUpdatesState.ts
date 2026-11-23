// @locs-version: 1.0
import type { RuntimeUpdatesResponse } from "./api";

type RuntimeUpdatesCarrier = RuntimeUpdatesResponse | null | undefined;

export type RuntimeUpdatesPolicyViewState = {
  updateChannel: string;
  autoApply: string;
  supportPostureLine: string;
};

export type RuntimeUpdatesActionState = {
  canCheck: boolean;
  canApply: boolean;
  checkBusy: boolean;
  applyBusy: boolean;
  checkLabel: string;
  applyLabel: string;
};

export function runtimeUpdatesEntries(
  runtimeUpdates?: RuntimeUpdatesCarrier,
): RuntimeUpdatesResponse["entries"] {
  return runtimeUpdates?.entries ?? [];
}

export function runtimeUpdatesPanel(
  runtimeUpdates?: RuntimeUpdatesCarrier,
): RuntimeUpdatesResponse["panel"] | null {
  return runtimeUpdates?.panel ?? null;
}

export function runtimeUpdatesPolicy(
  runtimeUpdates?: RuntimeUpdatesCarrier,
): RuntimeUpdatesResponse["policy"] | null {
  return runtimeUpdates?.policy ?? null;
}

export function runtimeUpdatesCurrentVersionLabel(
  runtimeUpdates?: RuntimeUpdatesCarrier,
  fallback = "unknown",
): string {
  return runtimeUpdates?.current_version ?? fallback;
}

export function runtimeUpdatesLatestVersionLabel(
  runtimeUpdates?: RuntimeUpdatesCarrier,
  fallback = "unknown",
): string {
  return runtimeUpdates?.latest_version ?? fallback;
}

export function runtimeUpdatesHasAvailableUpdate(
  runtimeUpdates?: RuntimeUpdatesCarrier,
): boolean {
  return runtimeUpdates?.update_available === true;
}

export function runtimeUpdatesPressureLabel(
  runtimeUpdates?: RuntimeUpdatesCarrier,
): string {
  if (!runtimeUpdatesHasAvailableUpdate(runtimeUpdates)) return "up to date";
  return `${runtimeUpdatesCurrentVersionLabel(runtimeUpdates, "current")} -> ${runtimeUpdatesLatestVersionLabel(runtimeUpdates, "latest")}`;
}

export function runtimeUpdatesLastCheckedAt(
  runtimeUpdates?: RuntimeUpdatesCarrier,
): string | null {
  return runtimeUpdates?.last_checked_at ?? null;
}

export function runtimeUpdatesLastAppliedAt(
  runtimeUpdates?: RuntimeUpdatesCarrier,
): string | null {
  return runtimeUpdates?.last_applied_at ?? null;
}

export function runtimeUpdatesLatestEventAt(
  runtimeUpdates?: RuntimeUpdatesCarrier,
): string | null {
  const entries = runtimeUpdatesEntries(runtimeUpdates);
  if (entries.length === 0) return null;
  let latest: string | null = null;
  let latestMs = -Infinity;
  for (const entry of entries) {
    const parsed = Date.parse(entry.created_at);
    if (Number.isNaN(parsed) || parsed <= latestMs) continue;
    latestMs = parsed;
    latest = entry.created_at;
  }
  return latest;
}

export function runtimeUpdatesPolicyUpdateChannel(
  runtimeUpdates?: RuntimeUpdatesCarrier,
  fallback = "stable",
): string {
  return runtimeUpdatesPolicy(runtimeUpdates)?.update_channel ?? fallback;
}

export function runtimeUpdatesPolicyAutoApply(
  runtimeUpdates?: RuntimeUpdatesCarrier,
  fallback = "manual_only",
): string {
  return runtimeUpdatesPolicy(runtimeUpdates)?.auto_apply ?? fallback;
}

export function runtimeUpdatesPolicySupportPostureLabel(
  runtimeUpdates?: RuntimeUpdatesCarrier,
): string {
  return runtimeUpdatesPolicy(runtimeUpdates)?.support_disabled_by_default === false
    ? "customized"
    : "disabled by default";
}

export function runtimeUpdatesPolicyViewState(
  runtimeUpdates?: RuntimeUpdatesCarrier,
): RuntimeUpdatesPolicyViewState {
  return {
    updateChannel: runtimeUpdatesPolicyUpdateChannel(runtimeUpdates),
    autoApply: runtimeUpdatesPolicyAutoApply(runtimeUpdates),
    supportPostureLine: `Support posture: ${runtimeUpdatesPolicySupportPostureLabel(runtimeUpdates)}`,
  };
}

export function runtimeUpdatesActionState(
  runtimeUpdatesBusy: "policy" | "check" | "apply" | null,
  runtimeUpdates?: RuntimeUpdatesCarrier,
): RuntimeUpdatesActionState {
  const busy = runtimeUpdatesBusy !== null;
  const checkBusy = runtimeUpdatesBusy === "check";
  const applyBusy = runtimeUpdatesBusy === "apply";
  return {
    canCheck: !busy,
    canApply: !busy && runtimeUpdatesHasAvailableUpdate(runtimeUpdates),
    checkBusy,
    applyBusy,
    checkLabel: checkBusy ? "Checking updates..." : "Check updates",
    applyLabel: applyBusy ? "Applying..." : "Apply update",
  };
}
