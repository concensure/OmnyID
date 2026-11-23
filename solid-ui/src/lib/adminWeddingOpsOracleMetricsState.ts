// @locs-version: 2.0
import type { AdminWeddingOpsOracleMetrics } from "@/lib/adminWeddingOpsState";

export type AdminWeddingOpsOracleMetricsPayload = Record<string, unknown>;

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

function cleanText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNonNegativeNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

function firstNumber(payload: AdminWeddingOpsOracleMetricsPayload, keys: string[]): number | null {
  for (const key of keys) {
    const value = finiteNonNegativeNumber(payload[key]);
    if (value !== null) return value;
  }
  return null;
}

function firstText(payload: AdminWeddingOpsOracleMetricsPayload, keys: string[]): string | null {
  for (const key of keys) {
    const value = cleanText(payload[key]);
    if (value) return value;
  }
  return null;
}

export function formatAdminWeddingOpsBytes(bytes: number): string | null {
  if (!Number.isFinite(bytes) || bytes < 0) return null;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex === 0 || value >= 10 ? 0 : 1;
  const rounded = Number(value.toFixed(precision));
  return `${rounded} ${BYTE_UNITS[unitIndex]}`;
}

function usageLabelsFromBytes(args: {
  usedBytes: number | null;
  totalBytes: number | null;
  usedLabel: string | null;
  totalLabel: string | null;
}): { usedLabel?: string | null; totalLabel?: string | null } {
  if (args.usedBytes !== null && args.totalBytes !== null) {
    if (args.usedBytes > args.totalBytes) return {};
    return {
      usedLabel: formatAdminWeddingOpsBytes(args.usedBytes),
      totalLabel: formatAdminWeddingOpsBytes(args.totalBytes),
    };
  }
  return {
    usedLabel: args.usedLabel,
    totalLabel: args.totalLabel,
  };
}

export function buildAdminWeddingOpsOracleMetricsState(
  payload: AdminWeddingOpsOracleMetricsPayload | null | undefined,
): AdminWeddingOpsOracleMetrics {
  if (!payload) return {};
  const disk = usageLabelsFromBytes({
    usedBytes: firstNumber(payload, ["diskUsedBytes", "disk_used_bytes", "diskUsed", "disk_used"]),
    totalBytes: firstNumber(payload, ["diskTotalBytes", "disk_total_bytes", "diskTotal", "disk_total"]),
    usedLabel: firstText(payload, ["diskUsedLabel", "disk_used_label"]),
    totalLabel: firstText(payload, ["diskTotalLabel", "disk_total_label"]),
  });
  const ram = usageLabelsFromBytes({
    usedBytes: firstNumber(payload, ["ramUsedBytes", "ram_used_bytes", "memoryUsedBytes", "memory_used_bytes"]),
    totalBytes: firstNumber(payload, ["ramTotalBytes", "ram_total_bytes", "memoryTotalBytes", "memory_total_bytes"]),
    usedLabel: firstText(payload, ["ramUsedLabel", "ram_used_label", "memoryUsedLabel", "memory_used_label"]),
    totalLabel: firstText(payload, ["ramTotalLabel", "ram_total_label", "memoryTotalLabel", "memory_total_label"]),
  });
  return {
    diskUsedLabel: disk.usedLabel ?? null,
    diskTotalLabel: disk.totalLabel ?? null,
    ramUsedLabel: ram.usedLabel ?? null,
    ramTotalLabel: ram.totalLabel ?? null,
    sourceLabel: firstText(payload, ["sourceLabel", "source_label", "source", "host", "hostname"]) ?? null,
  };
}
