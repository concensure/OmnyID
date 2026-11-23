// @locs-version: 1.0
import { customEventRecordDetail } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";
import { surfaceDateTimeLabel } from "@/lib/surfaceTimestampPresentation";

export type EditorDatetimeFormat = "iso" | "locale" | "custom";

export type EditorDatetimePreference = {
  format: EditorDatetimeFormat;
  customPattern: string;
};

export const EDITOR_DATETIME_PREFERENCE_KEY = "omnyid.editor.datetime_preference";
export const EDITOR_DATETIME_PREFERENCE_EVENT = "omnyid:editor-datetime-preference";
const DEFAULT_CUSTOM_PATTERN = "YYYY-MM-DD HH:mm";

const DEFAULT_EDITOR_DATETIME_PREFERENCE: EditorDatetimePreference = {
  format: "locale",
  customPattern: DEFAULT_CUSTOM_PATTERN,
};

function normalizePreference(value: unknown): EditorDatetimePreference {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_EDITOR_DATETIME_PREFERENCE;
  }
  const candidate = value as { format?: unknown; customPattern?: unknown };
  const format =
    candidate.format === "iso" || candidate.format === "locale" || candidate.format === "custom"
      ? candidate.format
      : DEFAULT_EDITOR_DATETIME_PREFERENCE.format;
  const customPattern =
    typeof candidate.customPattern === "string" && candidate.customPattern.trim().length > 0
      ? candidate.customPattern
      : DEFAULT_CUSTOM_PATTERN;
  return { format, customPattern };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function applyCustomPattern(date: Date, pattern: string): string {
  const replacements = new Map<string, string>([
    ["YYYY", String(date.getFullYear())],
    ["MM", pad(date.getMonth() + 1)],
    ["DD", pad(date.getDate())],
    ["HH", pad(date.getHours())],
    ["mm", pad(date.getMinutes())],
    ["ss", pad(date.getSeconds())],
  ]);
  return pattern.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => replacements.get(token) ?? token);
}

export function loadEditorDatetimePreference(): EditorDatetimePreference {
  try {
    const raw = localStorage.getItem(EDITOR_DATETIME_PREFERENCE_KEY);
    if (!raw) return DEFAULT_EDITOR_DATETIME_PREFERENCE;
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      localStorage.removeItem(EDITOR_DATETIME_PREFERENCE_KEY);
      return DEFAULT_EDITOR_DATETIME_PREFERENCE;
    }
    const normalized = normalizePreference(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw) {
      try {
        localStorage.setItem(EDITOR_DATETIME_PREFERENCE_KEY, serialized);
      } catch {
        // Best-effort local preference only.
      }
    }
    return normalized;
  } catch {
    try {
      localStorage.removeItem(EDITOR_DATETIME_PREFERENCE_KEY);
    } catch {
      // Best-effort local preference only.
    }
    return DEFAULT_EDITOR_DATETIME_PREFERENCE;
  }
}

export function saveEditorDatetimePreference(next: EditorDatetimePreference) {
  const normalized = normalizePreference(next);
  try {
    localStorage.setItem(EDITOR_DATETIME_PREFERENCE_KEY, JSON.stringify(normalized));
  } catch {
    // Best-effort local preference only.
  }
  window.dispatchEvent(
    new CustomEvent<EditorDatetimePreference>(EDITOR_DATETIME_PREFERENCE_EVENT, {
      detail: normalized,
    }),
  );
}

export function readEditorDatetimePreferenceEventDetail(
  event: Event,
): EditorDatetimePreference | null {
  const candidate = customEventRecordDetail(event);
  if (!candidate) return null;
  if (
    candidate.format !== "iso"
    && candidate.format !== "locale"
    && candidate.format !== "custom"
  ) {
    return null;
  }
  if (
    typeof candidate.customPattern !== "string"
    || candidate.customPattern.trim().length === 0
  ) {
    return null;
  }
  return {
    format: candidate.format,
    customPattern: candidate.customPattern,
  };
}

export function formatEditorDatetime(
  date: Date,
  preference: EditorDatetimePreference,
): string {
  const normalized = normalizePreference(preference);
  if (normalized.format === "iso") return date.toISOString();
  if (normalized.format === "custom") return applyCustomPattern(date, normalized.customPattern);
  return surfaceDateTimeLabel(date.toISOString()) || date.toISOString();
}
