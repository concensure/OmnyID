// @locs-version: 1.0
import type { KnowledgeOrganizationMode } from "@/lib/api";

export type FileLibraryStudentFocusActionId =
  | "show_ready_only"
  | "show_extracted_only"
  | "show_connected_notes"
  | "show_review_queue"
  | "clear_filters";

export type FileLibraryStudentFocusCard = {
  label: string;
  value: string;
  detail: string;
  tone: "emerald" | "sky" | "violet" | "amber";
};

export type FileLibraryStudentFocusState = {
  headline: string;
  detail: string;
  badge: string;
  cards: FileLibraryStudentFocusCard[];
  primaryActionId: FileLibraryStudentFocusActionId;
  primaryActionLabel: string;
  secondaryActionId: FileLibraryStudentFocusActionId | null;
  secondaryActionLabel: string | null;
};

export function buildFileLibraryStudentFocusState(input: {
  visibleCount: number;
  matchingCount: number;
  readyCount: number;
  developingCount: number;
  archivalCount: number;
  extractedOnlyCount: number;
  keptFileCount: number;
  connectedNotesCount: number;
  zettelkastenCount: number;
  reviewQueueCount: number;
  linkedCount: number;
  visibleTagCount: number;
  hasActiveFilters: boolean;
  activeKnowledgeMode: "all" | KnowledgeOrganizationMode | "unclassified";
  activeStudyReadiness: "all" | "ready_now" | "developing" | "archival";
  activeRetention: "all" | "keep_file" | "keep_extracted_only" | "keep_nothing" | "unknown";
  activeZettelkastenStage: "all" | "source_note" | "literature_note" | "permanent_note" | "review_pending" | "unclassified";
}): FileLibraryStudentFocusState | null {
  if (input.visibleCount === 0) return null;

  const immediatelyUsableLabel = input.readyCount === 0
    ? "No study-ready sources yet"
    : `${input.readyCount} ready now`;
  const retentionLabel = input.extractedOnlyCount > 0
    ? `${input.extractedOnlyCount} notes-only retained`
    : input.keptFileCount > 0
      ? `${input.keptFileCount} original file${input.keptFileCount === 1 ? "" : "s"} kept`
      : "Retention still forming";
  const linkingLabel = input.visibleTagCount > 0
    ? `${input.visibleTagCount} visible supertag${input.visibleTagCount === 1 ? "" : "s"}`
    : "No visible supertags yet";

  if (input.activeKnowledgeMode === "zettelkasten" || input.zettelkastenCount > 0) {
    const reviewFocused = input.activeZettelkastenStage === "review_pending" || input.reviewQueueCount > 0;
    return {
      headline: reviewFocused
        ? "This library can act like a Zettelkasten review queue."
        : "This library already contains a usable Zettelkasten branch.",
      detail: reviewFocused
        ? "Start with review-pending notes and adjacent retained sources so the student can keep one branch moving instead of scattering attention."
        : "Use Files as the evidence-backed source layer for one note chain, then step into the graph only when you need stronger branch review.",
      badge: reviewFocused ? "Review queue ready" : "Zettelkasten focus",
      cards: [
        {
          label: "Immediately usable",
          value: immediatelyUsableLabel,
          detail: "These are the fastest sources to reopen when the student needs to continue the same branch without re-uploading.",
          tone: "emerald",
        },
        {
          label: "Retention mode",
          value: retentionLabel,
          detail: "Notes-only retention is usually enough for study retrieval and keeps the source layer lighter.",
          tone: "sky",
        },
        {
          label: "Branch structure",
          value: linkingLabel,
          detail: "Supertags and note stages should keep the branch searchable by concept, course, week, and review status.",
          tone: "violet",
        },
      ],
      primaryActionId: reviewFocused ? "show_review_queue" : "show_ready_only",
      primaryActionLabel: reviewFocused ? "Focus review queue" : "Show study-ready first",
      secondaryActionId: input.hasActiveFilters ? "clear_filters" : null,
      secondaryActionLabel: input.hasActiveFilters ? "Reset library view" : null,
    };
  }

  if (input.readyCount >= 2 || input.connectedNotesCount >= 2 || input.linkedCount >= 2) {
    return {
      headline: "This library is already strong enough for same-topic study retrieval.",
      detail: "The fastest student path is to start with the ready sources and connected-notes material first, then widen only if the answer still feels thin.",
      badge: "Study retrieval ready",
      cards: [
        {
          label: "Immediately usable",
          value: immediatelyUsableLabel,
          detail: "These sources should already support grounded follow-up questions and quick revision.",
          tone: "emerald",
        },
        {
          label: "Retention mode",
          value: retentionLabel,
          detail: "Retained extracted notes keep the library searchable without forcing full-file storage every time.",
          tone: "sky",
        },
        {
          label: "Connected coverage",
          value: `${Math.max(input.connectedNotesCount, input.linkedCount)} linked study source${Math.max(input.connectedNotesCount, input.linkedCount) === 1 ? "" : "s"}`,
          detail: "Cross-source linkage matters more than raw file count for stressed students trying to find what matters fast.",
          tone: "violet",
        },
      ],
      primaryActionId: input.activeStudyReadiness === "ready_now" ? "show_connected_notes" : "show_ready_only",
      primaryActionLabel: input.activeStudyReadiness === "ready_now" ? "Show connected notes" : "Show study-ready first",
      secondaryActionId: input.activeRetention !== "keep_extracted_only" && input.extractedOnlyCount > 0 ? "show_extracted_only" : null,
      secondaryActionLabel: input.activeRetention !== "keep_extracted_only" && input.extractedOnlyCount > 0 ? "Show extracted notes only" : null,
    };
  }

  return {
    headline: "One narrowing move should make this library much easier to use.",
    detail: input.archivalCount > input.readyCount
      ? "Too much of the current view still behaves like archive storage. Filter to retained notes or study-ready sources first so the student sees usable material instead of clutter."
      : "There is usable material here, but not enough focus yet. Narrow to the most reusable retained notes before adding more sources.",
    badge: "Needs narrower focus",
    cards: [
      {
        label: "Immediately usable",
        value: immediatelyUsableLabel,
        detail: "Start from the sources OmnyID can reopen immediately, not from everything that happens to be stored.",
        tone: input.readyCount > 0 ? "emerald" : "amber",
      },
      {
        label: "Retention mode",
        value: retentionLabel,
        detail: "Extracted-only retention usually gives the best signal-to-noise ratio for study work.",
        tone: "sky",
      },
      {
        label: "What to narrow by",
        value: linkingLabel,
        detail: "Supertags, study readiness, and knowledge mode are the quickest way to cut down the visible set.",
        tone: "violet",
      },
    ],
    primaryActionId: input.extractedOnlyCount > 0 && input.activeRetention !== "keep_extracted_only"
      ? "show_extracted_only"
      : input.activeStudyReadiness !== "ready_now" && input.readyCount > 0
        ? "show_ready_only"
        : "show_connected_notes",
    primaryActionLabel: input.extractedOnlyCount > 0 && input.activeRetention !== "keep_extracted_only"
      ? "Show extracted notes only"
      : input.activeStudyReadiness !== "ready_now" && input.readyCount > 0
        ? "Show study-ready first"
        : "Show connected notes",
    secondaryActionId: input.hasActiveFilters ? "clear_filters" : null,
    secondaryActionLabel: input.hasActiveFilters ? "Reset library view" : null,
  };
}
