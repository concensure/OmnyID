// @locs-version: 1.0
export type CapabilityUsageDowBar = {
  label: string;
  count: number;
  height: number;
  active: boolean;
};

export type CapabilityUsageCardState = {
  usageSummary: string | null;
  dowBars: CapabilityUsageDowBar[];
  staleSummary: string | null;
};

const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"] as const;

export function capabilityUsageSummary(
  usageCount: number | null | undefined,
  lastUsedAt: number | null | undefined,
  now = Date.now(),
): string | null {
  const count = typeof usageCount === "number" && Number.isFinite(usageCount) ? usageCount : 0;
  const countLabel = count > 0 ? `used ${count}x` : null;
  let lastLabel: string | null = null;
  if (typeof lastUsedAt === "number" && Number.isFinite(lastUsedAt) && lastUsedAt > 0) {
    const secs = Math.max(0, Math.floor((now - lastUsedAt) / 1000));
    if (secs < 60) lastLabel = "just now";
    else if (secs < 3600) lastLabel = `${Math.floor(secs / 60)}m ago`;
    else if (secs < 86400) lastLabel = `${Math.floor(secs / 3600)}h ago`;
    else lastLabel = `${Math.floor(secs / 86400)}d ago`;
  }
  const parts = [countLabel, lastLabel ? `last ${lastLabel}` : null].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(" | ") : null;
}

export function capabilityDowBars(
  dowUsage: number[] | null | undefined,
): CapabilityUsageDowBar[] {
  if (!Array.isArray(dowUsage) || dowUsage.length !== 7 || dowUsage.every((count) => count === 0)) return [];
  const maxCount = Math.max(1, ...dowUsage);
  return dowUsage.map((count, index) => ({
    label: DOW_LABELS[index] ?? "?",
    count,
    height: count > 0 ? Math.max(3, Math.round((count / maxCount) * 12)) : 2,
    active: count > 0,
  }));
}

export function capabilityStaleSummary(
  lastUsedAt: number | null | undefined,
  now = Date.now(),
  thresholdDays = 14,
): string | null {
  if (typeof lastUsedAt !== "number" || !Number.isFinite(lastUsedAt) || lastUsedAt <= 0) return null;
  const staleDays = Math.floor((now - lastUsedAt) / 86400000);
  if (staleDays < thresholdDays) return null;
  return `not used in ${staleDays}d - may be redundant`;
}

export function capabilityUsageCardState(args: {
  usageCount: number | null | undefined;
  lastUsedAt: number | null | undefined;
  dowUsage: number[] | null | undefined;
  now?: number;
}): CapabilityUsageCardState {
  const now = args.now ?? Date.now();
  return {
    usageSummary: capabilityUsageSummary(args.usageCount, args.lastUsedAt, now),
    dowBars: capabilityDowBars(args.dowUsage),
    staleSummary: capabilityStaleSummary(args.lastUsedAt, now),
  };
}
