// @locs-version: 1.0
import type { KnowledgeOrganizationMode } from "./api";
import {
  continueStudyFocusLabel,
  openMatchingGraphLabel,
  showStudyReadyFirstLabel,
} from "./studyFocusActionCopy";

export type FileLibraryNextActionId =
  | "open_study_chat"
  | "open_matching_graph"
  | "show_ready_first"
  | "clear_filters";

export type FileLibraryNextActionState = {
  headline: string;
  detail: string;
  tone: "amber" | "sky" | "emerald";
  primaryActionId: FileLibraryNextActionId;
  primaryActionLabel: string;
  secondaryActionId: FileLibraryNextActionId | null;
  secondaryActionLabel: string | null;
};

export function buildFileLibraryNextActionState(input: {
  visibleCount: number;
  studyCount: number;
  readyCount: number;
  developingCount: number;
  archivalCount: number;
  knowledgeMode: "all" | KnowledgeOrganizationMode | "unclassified";
  hasActiveFilters: boolean;
  showingReadyOnly: boolean;
}): FileLibraryNextActionState | null {
  if (input.visibleCount === 0) return null;

  if (input.studyCount === 0) {
    return {
      headline: "This library focus is not study-shaped yet.",
      detail: "Switch back to study chat and retain extracted notes from a lecture, reading, rough note, or voice memo so this surface becomes useful for retrieval instead of passive storage.",
      tone: "amber",
      primaryActionId: "open_study_chat",
      primaryActionLabel: "Start study upload",
      secondaryActionId: input.hasActiveFilters ? "clear_filters" : null,
      secondaryActionLabel: input.hasActiveFilters ? "Clear filters" : null,
    };
  }

  if (input.readyCount === 0) {
    return {
      headline: "These files are retained, but they are not study-ready yet.",
      detail: input.developingCount > 0
        ? "The material has partial metadata or supertags, but it still needs another related source or stronger note linking before retrieval becomes reliable."
        : "The current files look more archival than actionable. Keep extracted notes or connect them to connected notes or Zettelkasten flow first.",
      tone: "amber",
      primaryActionId: "open_matching_graph",
      primaryActionLabel: "Inspect graph gaps",
      secondaryActionId: "open_study_chat",
      secondaryActionLabel: "Improve this study set",
    };
  }

  if (input.readyCount >= 2) {
    return {
      headline: input.knowledgeMode === "zettelkasten"
        ? "This file set is ready to extend a note chain."
        : "This file set is ready for cross-source study answers.",
      detail: input.knowledgeMode === "zettelkasten"
        ? "You have enough retained, study-ready material to continue source notes, review pending notes, or promote permanent notes."
        : "You have enough retained, study-ready material to compare sources, surface revision gaps, and answer grounded study questions immediately.",
      tone: "emerald",
      primaryActionId: "open_study_chat",
      primaryActionLabel: continueStudyFocusLabel(input.knowledgeMode),
      secondaryActionId: "open_matching_graph",
      secondaryActionLabel: openMatchingGraphLabel(),
    };
  }

  return {
    headline: "One study-ready source is available now.",
    detail: input.archivalCount > 0
      ? "Start with the ready source now, then either connect one archival source or upload one more related source to strengthen retrieval."
      : "Start with the ready source now, then add one more related file for stronger comparison and graph links.",
    tone: "sky",
    primaryActionId: "open_study_chat",
    primaryActionLabel: continueStudyFocusLabel(input.knowledgeMode),
    secondaryActionId: !input.showingReadyOnly && input.readyCount > 0 ? "show_ready_first" : "open_matching_graph",
    secondaryActionLabel: !input.showingReadyOnly && input.readyCount > 0 ? showStudyReadyFirstLabel() : openMatchingGraphLabel(),
  };
}
