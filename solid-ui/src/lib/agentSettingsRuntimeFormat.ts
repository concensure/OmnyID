// @locs-version: 1.0
import { surfaceDateTimeLabel, surfaceRelativeTimestamp } from "./surfaceTimestampPresentation";

export function byteCountLabel(value: number | null | undefined): string {
  if (!value || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const rounded = size >= 10 || unitIndex === 0 ? Math.round(size) : Math.round(size * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
}

export function durationLabel(startedAt?: string | null, completedAt?: string | null): string | null {
  if (!startedAt) return null;
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return null;
  const ended = completedAt ? Date.parse(completedAt) : Date.now();
  if (Number.isNaN(ended) || ended < started) return null;
  const totalSeconds = Math.max(1, Math.round((ended - started) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const totalHours = Math.round(totalMinutes / 60);
  if (totalHours < 48) return `${totalHours}h`;
  const totalDays = Math.round(totalHours / 24);
  return `${totalDays}d`;
}

export function latestTimestampValue(values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed) || parsed <= latestMs) continue;
    latestMs = parsed;
    latest = value;
  }
  return latest;
}

export function earliestTimestampValue(values: Array<string | null | undefined>): string | null {
  let earliest: string | null = null;
  let earliestMs = Number.POSITIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed) || parsed >= earliestMs) continue;
    earliestMs = parsed;
    earliest = value;
  }
  return earliest;
}

export function nextFutureTimestampValue(values: Array<string | null | undefined>): string | null {
  let next: string | null = null;
  let nextMs = Number.POSITIVE_INFINITY;
  const now = Date.now();
  for (const value of values) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed) || parsed < now || parsed >= nextMs) continue;
    nextMs = parsed;
    next = value;
  }
  return next;
}

export function expiredTimestampCount(values: Array<string | null | undefined>): number {
  const now = Date.now();
  return values.reduce((count, value) => {
    if (!value) return count;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed) || parsed >= now) return count;
    return count + 1;
  }, 0);
}

export function futureTimestampCount(values: Array<string | null | undefined>): number {
  const now = Date.now();
  return values.reduce((count, value) => {
    if (!value) return count;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed) || parsed < now) return count;
    return count + 1;
  }, 0);
}

export function totalNumber(values: Array<number | null | undefined>): number {
  return values.reduce<number>(
    (sum, value) => sum + (typeof value === "number" && Number.isFinite(value) ? value : 0),
    0,
  );
}

export function relativeTimeLabel(value?: string | null): string {
  if (!value) return "Not used yet";
  const label = surfaceRelativeTimestamp(value);
  return label ? `Used ${label}` : value;
}

export function dateTimeLabel(value?: string | null): string {
  if (!value) return "-";
  const label = surfaceDateTimeLabel(value);
  return label || value;
}
