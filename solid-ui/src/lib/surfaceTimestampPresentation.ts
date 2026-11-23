// @locs-version: 1.0
const SURFACE_RELATIVE_DAY_CUTOFF = 24;

const SURFACE_SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const SURFACE_DATE_TITLE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const SURFACE_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const SURFACE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

const SURFACE_NOTE_HEADER_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function parseSurfaceDate(timestamp: string | null | undefined): Date | null {
  const normalized = String(timestamp ?? "").trim();
  if (!normalized) return null;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function surfaceRelativeTimestamp(timestamp: string | null | undefined, nowMs = Date.now()): string {
  const date = parseSurfaceDate(timestamp);
  if (!date) return "";
  const diffMinutes = Math.floor((nowMs - date.getTime()) / 60_000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < SURFACE_RELATIVE_DAY_CUTOFF) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / SURFACE_RELATIVE_DAY_CUTOFF);
  return `${diffDays}d ago`;
}

export function surfaceShortDateLabel(timestamp: string | null | undefined): string {
  const date = parseSurfaceDate(timestamp);
  if (!date) return "";
  return SURFACE_SHORT_DATE_FORMATTER.format(date);
}

export function surfaceDateTitleLabel(timestamp: string | null | undefined): string {
  const date = parseSurfaceDate(timestamp);
  if (!date) return "";
  return SURFACE_DATE_TITLE_FORMATTER.format(date);
}

export function surfaceDateTimeLabel(timestamp: string | null | undefined): string {
  const date = parseSurfaceDate(timestamp);
  if (!date) return "";
  return SURFACE_DATE_TIME_FORMATTER.format(date);
}

export function surfaceTimeLabel(timestamp: string | null | undefined): string {
  const date = parseSurfaceDate(timestamp);
  if (!date) return "";
  return SURFACE_TIME_FORMATTER.format(date);
}

export function surfaceNoteHeaderTimestamp(timestamp: string | null | undefined): string {
  const date = parseSurfaceDate(timestamp);
  if (!date) return "";
  return SURFACE_NOTE_HEADER_FORMATTER.format(date);
}
