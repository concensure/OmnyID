// @locs-version: 1.0
import type { KnowledgeOrganizationMode } from "@/lib/api";
import {
  continueStudyFocusLabel,
  openMatchingGraphLabel,
  planNextSourceLabel,
  showStudyReadyFirstLabel,
} from "@/lib/studyFocusActionCopy";

export type FileLibraryValuePathActionId =
  | "open_study_chat"
  | "open_matching_graph"
  | "show_ready_first"
  | "plan_next_source"
  | "clear_filters";

export type FileLibraryValuePathCard = {
  label: string;
  detail: string;
  tone: "sky" | "emerald" | "violet" | "amber";
};

export type FileLibraryValuePathState = {
  grade: "warmup" | "developing" | "ready" | "zettelkasten";
  headline: string;
  detail: string;
  badge: string;
  cards: FileLibraryValuePathCard[];
  primaryActionId: FileLibraryValuePathActionId;
  primaryActionLabel: string;
  secondaryActionId: FileLibraryValuePathActionId | null;
  secondaryActionLabel: string | null;
};

export function buildFileLibraryValuePathState(input: {
  visibleCount: number;
  studyCount: number;
  readyCount: number;
  developingCount: number;
  archivalCount: number;
  linkedCount: number;
  visibleTagCount: number;
  knowledgeMode: "all" | KnowledgeOrganizationMode | "unclassified";
  hasActiveFilters: boolean;
  showingReadyOnly: boolean;
}): FileLibraryValuePathState | null {
  if (input.visibleCount === 0) return null;

  if (input.studyCount === 0 || input.readyCount === 0 && input.developingCount === 0) {
    return {
      grade: "warmup",
      headline: "This Files view is still too close to storage and not close enough to study retrieval.",
      detail: "Students should not need to browse filenames here. The fastest upgrade is one retained lecture, reading, note, or recording that enters connected notes or Zettelkasten flow with extraction kept.",
      badge: "Needs first study anchor",
      cards: [
        {
          label: "What is missing",
          detail: "There is not enough study-ready material in the current Files view for meaningful retrieval or graph follow-through.",
          tone: "amber",
        },
        {
          label: "Best immediate move",
          detail: "Start or improve a retained study upload so Files gains extracted content, academic metadata, and supertags instead of only passive file entries.",
          tone: "sky",
        },
        {
          label: "Why this matters",
          detail: "Zero-maintenance connected notes only work when the library contains material that can be reopened by concept, course, week, or note branch rather than exact filenames.",
          tone: "violet",
        },
      ],
      primaryActionId: "open_study_chat",
      primaryActionLabel: "Start study upload",
      secondaryActionId: input.hasActiveFilters ? "clear_filters" : null,
      secondaryActionLabel: input.hasActiveFilters ? "Clear filters" : null,
    };
  }

  if (input.knowledgeMode === "zettelkasten") {
    return {
      grade: "zettelkasten",
      headline: input.readyCount >= 2
        ? "This Files view is ready to continue a Zettelkasten branch."
        : "This Files view started a Zettelkasten branch, but it still needs one reinforcement move.",
      detail: input.readyCount >= 2
        ? "Retained sources are now strong enough to reopen source notes, review pending notes, or permanent-note candidates without re-explaining the material."
        : "The branch exists, but it is still thin. The best move is to continue the same branch or add one adjacent source instead of broadening into unrelated topics.",
      badge: input.readyCount >= 2 ? "Branch-ready library" : "Branch developing",
      cards: [
        {
          label: "What Files now does",
          detail: "Files is acting as a branch-aware source surface, not just attachment storage, because note-ready retained material is already present.",
          tone: "emerald",
        },
        {
          label: "Best graph handoff",
          detail: "Open the matching graph to inspect Zettelkasten stages, review queues, and weak links before adding another source.",
          tone: "violet",
        },
        {
          label: "Best next move",
          detail: input.readyCount >= 2
            ? "Continue the current note chain from these retained sources."
            : "Plan the narrowest adjacent source that deepens the same note branch.",
          tone: "sky",
        },
      ],
      primaryActionId: input.readyCount >= 2 ? "open_study_chat" : "plan_next_source",
      primaryActionLabel: input.readyCount >= 2 ? continueStudyFocusLabel("zettelkasten") : planNextSourceLabel(),
      secondaryActionId: "open_matching_graph",
      secondaryActionLabel: openMatchingGraphLabel(),
    };
  }

  if (input.readyCount >= 2) {
    return {
      grade: "ready",
      headline: "This Files view is ready for grounded cross-source study work.",
      detail: "The user should be able to feel value immediately here: retained study-ready files, visible supertags, and enough linked material to continue the topic without manual sorting.",
      badge: "Cross-source ready",
      cards: [
        {
          label: "Study-ready pack",
          detail: `${input.readyCount} retained source${input.readyCount === 1 ? "" : "s"} are already ready for immediate retrieval.`,
          tone: "emerald",
        },
        {
          label: "Graph carryover",
          detail: `${input.linkedCount} linked file${input.linkedCount === 1 ? "" : "s"} and ${input.visibleTagCount} visible supertag${input.visibleTagCount === 1 ? "" : "s"} mean the graph should already help compare overlap and revision gaps.`,
          tone: "violet",
        },
        {
          label: "Best next move",
          detail: "Ask from this study focus now, then open the matching graph only when you want denser overlap or contradiction review.",
          tone: "sky",
        },
      ],
      primaryActionId: "open_study_chat",
      primaryActionLabel: continueStudyFocusLabel(input.knowledgeMode),
      secondaryActionId: "open_matching_graph",
      secondaryActionLabel: openMatchingGraphLabel(),
    };
  }

  return {
    grade: "developing",
    headline: "This Files view has one clear study anchor, but it still needs one focused strengthening move.",
    detail: input.archivalCount > 0
      ? "There is one study-ready source here, but too much of the surrounding material still behaves like archive storage. Start with the ready source, then connect one adjacent source from the same topic."
      : "There is one study-ready source here. That is enough for immediate value, but a second adjacent file is the move that turns this into stronger connected study memory.",
    badge: "Single-source ready",
    cards: [
      {
        label: "What is usable now",
        detail: "One retained source is already ready for grounded retrieval, so the user can get value immediately instead of waiting for a perfect library.",
        tone: "emerald",
      },
      {
        label: "What still feels thin",
        detail: input.developingCount > 0
          ? `${input.developingCount} file${input.developingCount === 1 ? "" : "s"} are still linking up and would benefit from one more related source or stronger graph overlap.`
          : "The current study thread still depends on only one clear anchor.",
        tone: "amber",
      },
      {
        label: "Best next move",
        detail: input.showingReadyOnly
          ? "Use the ready source now, then plan the next adjacent source from the same course, week, or concept."
          : "Show the study-ready source first or plan the next adjacent source before widening the library view.",
        tone: "violet",
      },
    ],
    primaryActionId: input.showingReadyOnly ? "open_study_chat" : "show_ready_first",
    primaryActionLabel: input.showingReadyOnly ? continueStudyFocusLabel(input.knowledgeMode) : showStudyReadyFirstLabel(),
    secondaryActionId: "plan_next_source",
    secondaryActionLabel: planNextSourceLabel(),
  };
}
