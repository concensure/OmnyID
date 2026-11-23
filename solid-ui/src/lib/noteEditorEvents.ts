// @locs-version: 1.0
import { customEventRecordDetail } from "@/lib/eventDetail";

export const NOTE_TITLE_UPDATE_EVENT = "omnyid:note-title-update";
export const NOTE_RESTORE_VERSION_EVENT = "omnyid:note-restore-version";

export type NoteTitleUpdateEventDetail = {
  id: string;
  title: string;
};

export type NoteRestoreVersionEventDetail = {
  id: string;
  content: string;
};

export function dispatchNoteTitleUpdateEvent(
  detail: NoteTitleUpdateEventDetail,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(NOTE_TITLE_UPDATE_EVENT, { detail }));
}

export function readNoteTitleUpdateEventDetail(
  event: Event,
): NoteTitleUpdateEventDetail | null {
  const detail = customEventRecordDetail(event);
  if (!detail) return null;
  return typeof detail.id === "string" && typeof detail.title === "string"
    ? { id: detail.id, title: detail.title }
    : null;
}

export function dispatchNoteRestoreVersionEvent(
  detail: NoteRestoreVersionEventDetail,
  target: Window = window,
): void {
  target.dispatchEvent(new CustomEvent(NOTE_RESTORE_VERSION_EVENT, { detail }));
}

export function readNoteRestoreVersionEventDetail(
  event: Event,
): NoteRestoreVersionEventDetail | null {
  const detail = customEventRecordDetail(event);
  if (!detail) return null;
  return typeof detail.id === "string" && typeof detail.content === "string"
    ? { id: detail.id, content: detail.content }
    : null;
}
