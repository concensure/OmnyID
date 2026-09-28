// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export type NoteSnapshot = { ts: string; content: string };

export const MAX_NOTE_SNAPSHOTS = 20;

function noteHistoryKey(noteId: string): string {
  return `omnyid.note.history.${noteId}`;
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeNoteSnapshots(value: unknown): NoteSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): NoteSnapshot[] => {
    if (!isRecord(entry)) return [];
    const ts = readTrimmedString(entry.ts);
    if (!ts || typeof entry.content !== "string") return [];
    return [{ ts, content: entry.content }];
  });
}

function writeNoteHistoryStorageValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function removeNoteHistoryStorageValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

export function loadNoteSnapshots(noteId: string): NoteSnapshot[] {
  const key = noteHistoryKey(noteId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeNoteHistoryStorageValue(key);
      return [];
    }
    const normalized = normalizeNoteSnapshots(parsed.value).slice(0, MAX_NOTE_SNAPSHOTS);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw) writeNoteHistoryStorageValue(key, serialized);
    return normalized;
  } catch {
    removeNoteHistoryStorageValue(key);
    return [];
  }
}

export function recordNoteSnapshot(noteId: string, content: string): void {
  try {
    const snaps = loadNoteSnapshots(noteId);
    const now = new Date().toISOString();
    const next = [{ ts: now, content }, ...snaps].slice(0, MAX_NOTE_SNAPSHOTS);
    writeNoteHistoryStorageValue(noteHistoryKey(noteId), JSON.stringify(normalizeNoteSnapshots(next)));
  } catch {
    // ignore storage failures
  }
}
