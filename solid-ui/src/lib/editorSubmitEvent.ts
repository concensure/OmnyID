// @locs-version: 1.0
import type { EditorPayload } from "@/lib/editorPayload";

export const EDITOR_SUBMIT_EVENT = "omnyid:editor-submit";
export type EditorSubmitEventDetail = EditorPayload;

type EventDispatchTarget = {
  dispatchEvent(event: Event): boolean;
};

export function dispatchEditorSubmitEvent(
  payload: EditorSubmitEventDetail,
  target: EventDispatchTarget | null | undefined =
    typeof window !== "undefined" ? window : null,
) {
  if (!target) return;
  target.dispatchEvent(new CustomEvent(EDITOR_SUBMIT_EVENT, { detail: payload }));
}
