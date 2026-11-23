// @locs-version: 1.0
import { customEventDetail, isRecord, optionalStringProperty } from "@/lib/eventDetail";

export const DIARY_ENTRY_EVENT = "omnyid:diary-entry";

export type DiaryEntry = {
  ts: string;
  type: "mood" | "decision" | "note" | "calendar" | "agent" | "milestone";
  icon: string;
  title: string;
  detail?: string;
  meta?: string;
  decisionId?: string;
  outcomeCheckAt?: string;
  note?: string;
};

export type DiaryEntryEventDetail = DiaryEntry;

const DIARY_ENTRY_TYPES = [
  "mood",
  "decision",
  "note",
  "calendar",
  "agent",
  "milestone",
] as const;

function isDiaryEntryEventDetail(value: unknown): value is DiaryEntryEventDetail {
  if (!isRecord(value)) return false;
  const entry = value;
  return (
    typeof entry.ts === "string"
    && typeof entry.type === "string"
    && (DIARY_ENTRY_TYPES as readonly string[]).includes(entry.type)
    && typeof entry.icon === "string"
    && typeof entry.title === "string"
    && optionalStringProperty(entry, "detail") !== null
    && optionalStringProperty(entry, "meta") !== null
    && optionalStringProperty(entry, "decisionId") !== null
    && optionalStringProperty(entry, "outcomeCheckAt") !== null
    && optionalStringProperty(entry, "note") !== null
  );
}

export function dispatchDiaryEntryEvent(
  detail: DiaryEntryEventDetail,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(DIARY_ENTRY_EVENT, { detail }));
}

export function readDiaryEntryEventDetail(
  event: Event,
): DiaryEntryEventDetail | null {
  const detail = customEventDetail(event);
  return isDiaryEntryEventDetail(detail) ? detail : null;
}

export function subscribeDiaryEntryEvent(
  callback: (detail: DiaryEntryEventDetail) => void,
  target: Window = window,
): () => void {
  const handler = (event: Event) => {
    const detail = readDiaryEntryEventDetail(event);
    if (!detail) return;
    callback(detail);
  };
  target.addEventListener(DIARY_ENTRY_EVENT, handler);
  return () => target.removeEventListener(DIARY_ENTRY_EVENT, handler);
}
