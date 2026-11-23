// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export type ShortcutRecencyEntry = {
  id: string;
  label: string;
  shortcut: string;
};

const SHORTCUT_RECENCY_KEY = "omnyid.shortcuts.recent";

function readShortcutRecencyMap(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(SHORTCUT_RECENCY_KEY);
    if (!raw) return {};
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      try {
        sessionStorage.removeItem(SHORTCUT_RECENCY_KEY);
      } catch {
        // Best-effort session ordering only.
      }
      return {};
    }
    const normalized = normalizeShortcutRecencyMap(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw) writeShortcutRecencyMap(normalized);
    return normalized;
  } catch {
    try {
      sessionStorage.removeItem(SHORTCUT_RECENCY_KEY);
    } catch {
      // Best-effort session ordering only.
    }
    return {};
  }
}

function normalizeShortcutRecencyMap(next: unknown): Record<string, number> {
  if (!isRecord(next)) return {};
  return Object.fromEntries(
    Object.entries(next).filter((entry): entry is [string, number] =>
      typeof entry[0] === "string"
      && entry[0].length > 0
      && typeof entry[1] === "number"
      && Number.isFinite(entry[1])
      && entry[1] > 0,
    ),
  );
}

function writeShortcutRecencyMap(next: Record<string, number>) {
  try {
    sessionStorage.setItem(
      SHORTCUT_RECENCY_KEY,
      JSON.stringify(normalizeShortcutRecencyMap(next)),
    );
  } catch {
    // Best-effort session ordering only.
  }
}

export function recordShortcutUse(id: string) {
  const trimmedId = id.trim();
  const next = {
    ...readShortcutRecencyMap(),
    [trimmedId]: Date.now(),
  };
  writeShortcutRecencyMap(next);
}

export function sortShortcutsByRecent<T extends ShortcutRecencyEntry>(entries: T[]): T[] {
  const recency = readShortcutRecencyMap();
  return [...entries].sort((left, right) => {
    const leftSeen = recency[left.id] ?? 0;
    const rightSeen = recency[right.id] ?? 0;
    if (leftSeen !== rightSeen) return rightSeen - leftSeen;
    return 0;
  });
}
