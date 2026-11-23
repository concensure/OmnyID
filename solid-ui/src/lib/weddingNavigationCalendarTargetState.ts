// @locs-version: 1.0
import type { WeddingNavigationIntent } from "@/lib/weddingNavigationState";

export type WeddingNavigationCalendarTarget = {
  initialDate: string | null;
  initialEventId: string | null;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function calendarDate(value: unknown): string | null {
  const cleaned = clean(value);
  if (!cleaned) return null;
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? null : cleaned;
}

export function weddingNavigationCalendarTarget(
  intent: WeddingNavigationIntent | null | undefined,
): WeddingNavigationCalendarTarget | null {
  if (!intent || intent.view !== "calendar") return null;
  const metadata = record(intent.metadata);
  const timeline = record(metadata.wedding_timeline);
  const initialDate =
    calendarDate(timeline.selected_start)
    ?? calendarDate(timeline.selected_end)
    ?? calendarDate(metadata.initial_date)
    ?? calendarDate(metadata.date);
  const initialEventId =
    clean(timeline.linked_calendar_event_id)
    ?? clean(metadata.linked_calendar_event_id)
    ?? clean(metadata.calendar_event_id);

  if (!initialDate && !initialEventId) return null;
  return {
    initialDate,
    initialEventId,
  };
}
