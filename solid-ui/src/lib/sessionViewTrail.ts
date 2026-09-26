// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";
import { normalizeViewName, type ViewName } from "@/lib/viewNames";

export type SessionViewTrailEntry = {
  view: ViewName;
  viewedAt: number;
};

export const SESSION_VIEW_TRAIL_KEY = "omnyid.nav.session_view_trail";

function normalizedSessionViewTrailEntry(value: unknown): SessionViewTrailEntry | null {
  if (!isRecord(value)) return null;
  const entry = value;
  const view = typeof entry.view === "string" ? normalizeViewName(entry.view) : null;
  if (!view || typeof entry.viewedAt !== "number" || !Number.isFinite(entry.viewedAt)) {
    return null;
  }
  return { view, viewedAt: entry.viewedAt };
}

export function loadSessionViewTrail(max = 10): SessionViewTrailEntry[] {
  try {
    const raw = sessionStorage.getItem(SESSION_VIEW_TRAIL_KEY);
    if (!raw) return [];
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      sessionStorage.removeItem(SESSION_VIEW_TRAIL_KEY);
      return [];
    }
    const normalized = Array.isArray(parsed.value)
      ? parsed.value
          .map(normalizedSessionViewTrailEntry)
          .filter((entry): entry is SessionViewTrailEntry => entry !== null)
          .sort((left, right) => right.viewedAt - left.viewedAt)
          .slice(0, max)
      : [];
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw) {
      try {
        sessionStorage.setItem(SESSION_VIEW_TRAIL_KEY, serialized);
      } catch {
        // ignore session storage write failures
      }
    }
    return normalized;
  } catch {
    try {
      sessionStorage.removeItem(SESSION_VIEW_TRAIL_KEY);
    } catch {
      // ignore session storage write failures
    }
    return [];
  }
}

export function saveSessionViewTrail(entries: readonly SessionViewTrailEntry[], max = 10): SessionViewTrailEntry[] {
  const normalized = entries
    .map(normalizedSessionViewTrailEntry)
    .filter((entry): entry is SessionViewTrailEntry => entry !== null)
    .sort((left, right) => right.viewedAt - left.viewedAt)
    .slice(0, max);
  try {
    sessionStorage.setItem(SESSION_VIEW_TRAIL_KEY, JSON.stringify(normalized));
  } catch {
    // ignore session storage write failures
  }
  return normalized;
}

export function recordSessionViewVisit(
  entries: readonly SessionViewTrailEntry[],
  view: ViewName,
  viewedAt: number,
  max = 10,
): SessionViewTrailEntry[] {
  return [{ view, viewedAt }, ...entries.filter((entry) => entry.view !== view)].slice(0, max);
}
