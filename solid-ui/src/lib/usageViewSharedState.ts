// @locs-version: 1.0
import { surfaceDateTimeLabel, surfaceDateTitleLabel } from "./surfaceTimestampPresentation";

export function redactMountedId(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return "Not connected";
  if (normalized.length <= 8) return normalized;
  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}

export function hasMountedOptionalIdSignal(value: string | null | undefined) {
  return value === null || (typeof value === "string" && value.trim().length > 0);
}

export function hasMountedFiniteBytes(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function readMountedDateLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const label = surfaceDateTitleLabel(normalized);
  return label || null;
}

export function readMountedWarningText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export function byteCountLabel(bytes: number | null | undefined) {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = value;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  return `${current >= 10 || unitIndex === 0 ? current.toFixed(0) : current.toFixed(1)} ${units[unitIndex]}`;
}

export function moneyLabel(value: number | null | undefined) {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized)) return "$0.00";
  return `$${normalized.toFixed(Math.abs(normalized) >= 100 ? 0 : 2)}`;
}

export function quantityLabel(value: number | null | undefined) {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized)) return "0";
  return normalized >= 100 ? normalized.toFixed(0) : normalized.toFixed(2).replace(/\.?0+$/, "");
}

export function sumEstimatedCost(rows: Array<{ total_estimated_cost_usd: number }> | null | undefined) {
  return (rows ?? []).reduce((sum, row) => {
    const value = Number(row.total_estimated_cost_usd ?? 0);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

export function readMountedDateTimeLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const label = surfaceDateTimeLabel(normalized);
  return label || null;
}

export function operatorStatusToneClass(status: string | null | undefined) {
  return String(status ?? "").trim().toLowerCase() === "suspended"
    ? "text-red-700"
    : "text-emerald-700";
}
