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
export function weddingGanttAxisTicks(rows: readonly WeddingGanttTimelineRow[]): WeddingGanttAxisTick[] {
  const ranges = rows
    .map((row) => ({ start: dateFromLabel(row.startLabel), end: dateFromLabel(row.endLabel) }))
    .filter((range): range is { start: Date; end: Date } => Boolean(range.start && range.end));
  if (ranges.length === 0) return [];
  const start = new Date(Math.min(...ranges.map((range) => range.start.getTime())));
  const end = new Date(Math.max(...ranges.map((range) => range.end.getTime())));
  const spanDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  const count = Math.min(5, Math.max(2, spanDays + 1));
  const includeYear = start.getUTCFullYear() !== end.getUTCFullYear();
  return Array.from({ length: count }, (_, index) => {
    const offsetPercent = count === 1 ? 0 : (index / (count - 1)) * 100;
    const date = new Date(start.getTime() + (spanDays * offsetPercent / 100) * 86_400_000);
    return { label: dayLabel(date, includeYear), offsetPercent };
  });
}
