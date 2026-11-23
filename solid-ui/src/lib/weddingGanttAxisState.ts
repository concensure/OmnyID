// @locs-version: 1.0
import type { WeddingGanttTimelineRow } from "@/lib/weddingGanttTimelineState";

export type WeddingGanttAxisTick = {
  label: string;
  offsetPercent: number;
};

function dateFromLabel(value: string): Date | null {
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayLabel(date: Date, includeYear: boolean): string {
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getUTCMonth()] ?? "";
  return `${date.getUTCDate()} ${month}${includeYear ? ` ${date.getUTCFullYear()}` : ""}`;
}

/** Major date ticks for the shared, horizontal Gantt time scale. */
export function weddingGanttAxisTicks(
  rows: readonly WeddingGanttTimelineRow[],
  range?: { startLabel?: string | null; endLabel?: string | null },
): WeddingGanttAxisTick[] {
  const ranges = rows
    .map((row) => ({ start: dateFromLabel(row.startLabel), end: dateFromLabel(row.endLabel) }))
    .filter((range): range is { start: Date; end: Date } => Boolean(range.start && range.end));
  const rangeStart = dateFromLabel(range?.startLabel ?? "");
  const rangeEnd = dateFromLabel(range?.endLabel ?? "");
  if (ranges.length === 0 && !(rangeStart && rangeEnd)) return [];
  const start = rangeStart ?? new Date(Math.min(...ranges.map((entry) => entry.start.getTime())));
  const end = rangeEnd ?? new Date(Math.max(...ranges.map((entry) => entry.end.getTime())));
  const spanDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  const count = Math.min(5, Math.max(2, spanDays + 1));
  const includeYear = start.getUTCFullYear() !== end.getUTCFullYear();
  return Array.from({ length: count }, (_, index) => {
    const offsetPercent = count === 1 ? 0 : (index / (count - 1)) * 100;
    const date = new Date(start.getTime() + (spanDays * offsetPercent / 100) * 86_400_000);
    return { label: dayLabel(date, includeYear), offsetPercent };
  });
}

/** Keep phone labels legible: the range endpoints carry the useful context. */
export function weddingGanttMobileAxisTicks(ticks: readonly WeddingGanttAxisTick[]): WeddingGanttAxisTick[] {
  if (ticks.length <= 2) return [...ticks];
  return [ticks[0]!, ticks[ticks.length - 1]!];
}

/** Endpoint labels stay inside the chart instead of being clipped at 0/100%. */
export function weddingGanttAxisLabelTransform(offsetPercent: number): string {
  if (offsetPercent <= 0) return "translateX(0)";
  if (offsetPercent >= 100) return "translateX(-100%)";
  return "translateX(-50%)";
}
