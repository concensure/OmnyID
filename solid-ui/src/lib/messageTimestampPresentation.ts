// @locs-version: 1.0
import { surfaceRelativeTimestamp } from "./surfaceTimestampPresentation";

const UTC_SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const UTC_WEEKDAY_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const UTC_TITLE_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function relativeMessageTime(timestamp: string, nowMs = Date.now()): string {
  return surfaceRelativeTimestamp(timestamp, nowMs) || timestamp;
}

export function absoluteDisplayTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

export function absoluteUtcTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  const iso = date.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function utcShortDateLabel(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return UTC_SHORT_DATE_FORMATTER.format(date);
}

export function utcWeekdayDateLabel(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return UTC_WEEKDAY_DATE_FORMATTER.format(date);
}

export function utcTitleDateLabel(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return UTC_TITLE_DATE_FORMATTER.format(date);
}

export function displayMessageTimestamp(timestamp: string, nowMs = Date.now()): string {
  const ageMs = nowMs - new Date(timestamp).getTime();
  if (!Number.isFinite(ageMs) || ageMs >= 7 * 86400_000) {
    return absoluteDisplayTimestamp(timestamp);
  }
  return relativeMessageTime(timestamp, nowMs);
}
