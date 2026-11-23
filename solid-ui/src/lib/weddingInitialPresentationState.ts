// @locs-version: 1.0
import type { WeddingEntrySource } from "@/lib/weddingEntrySourceState";
import type { WorkspaceLens } from "@/lib/workspaceLensState";

export type InitialWeddingPresentationInput = {
  operator: boolean;
  authSource?: string | null;
  fromQuiz?: string | null;
  workspaceLens?: WorkspaceLens | null;
  weddingEntrySource?: WeddingEntrySource | null;
};

/** Decides the pre-render Wedding theme without reading private profile data. */
export function shouldApplyInitialWeddingPresentation(
  input: InitialWeddingPresentationInput,
): boolean {
  if (input.operator) return false;
  return input.authSource === "wedding"
    || input.authSource === "marketing"
    || input.authSource === "wedding_quiz"
    || input.fromQuiz === "quiz"
    || input.workspaceLens === "wedding"
    || input.weddingEntrySource === "wedding_site"
    || input.weddingEntrySource === "wedding_quiz";
}
