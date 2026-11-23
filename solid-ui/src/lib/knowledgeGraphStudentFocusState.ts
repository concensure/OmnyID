// @locs-version: 1.0
import type { KnowledgeGraphLens } from "@/lib/knowledgeGraphViewState";

export type KnowledgeGraphStudentFocusActionId =
  | "focus_cluster"
  | "show_strong_links"
  | "focus_review_queue"
  | "open_files"
  | "open_study_workspace"
  | "plan_next_source"
  | "clear_filters";

export type KnowledgeGraphStudentFocusCard = {
  label: string;
  value: string;
  detail: string;
  tone: "emerald" | "sky" | "violet" | "amber";
};

export type KnowledgeGraphStudentFocusState = {
  headline: string;
  detail: string;
  badge: string;
  cards: KnowledgeGraphStudentFocusCard[];
  primaryActionId: KnowledgeGraphStudentFocusActionId;
  primaryActionLabel: string;
  secondaryActionId: KnowledgeGraphStudentFocusActionId | null;
  secondaryActionLabel: string | null;
};

export function buildKnowledgeGraphStudentFocusState(input: {
  visibleCount: number;
  totalCount: number;
  linkedCount: number;
  strongCount: number;
  denseCount: number;
  visibleSupertagCount: number;
  connectedNotesCount: number;
  zettelkastenCount: number;
  reviewQueueCount: number;
  permanentNotesCount: number;
  recommendedTag: string | null;
  activeTag: string | null;
  activeLens: KnowledgeGraphLens;
  activeConnectionStrength: "high" | "medium" | "low" | null;
  hasActiveFilters: boolean;
}): KnowledgeGraphStudentFocusState | null {
  if (input.visibleCount === 0) return null;

  const clusterLabel = input.recommendedTag
    ? input.activeTag === input.recommendedTag
      ? `Cluster ${input.recommendedTag} focused`
      : `Best cluster ${input.recommendedTag}`
    : input.visibleSupertagCount > 0
      ? `${input.visibleSupertagCount} visible supertag${input.visibleSupertagCount === 1 ? "" : "s"}`
      : "Cluster still forming";
  const linkLabel = input.strongCount > 0
    ? `${input.strongCount} strong link${input.strongCount === 1 ? "" : "s"}`
    : input.linkedCount > 0
      ? `${input.linkedCount} linked card${input.linkedCount === 1 ? "" : "s"}`
      : "No reliable links yet";
  const branchLabel = input.zettelkastenCount > 0
    ? input.reviewQueueCount > 0
      ? `${input.reviewQueueCount} review-pending`
      : input.permanentNotesCount > 0
        ? `${input.permanentNotesCount} permanent note${input.permanentNotesCount === 1 ? "" : "s"}`
        : `${input.zettelkastenCount} note-chain card${input.zettelkastenCount === 1 ? "" : "s"}`
    : input.connectedNotesCount > 0
      ? `${input.connectedNotesCount} connected note${input.connectedNotesCount === 1 ? "" : "s"}`
      : "Study branch still forming";

  if (input.activeLens === "zettelkasten" || input.zettelkastenCount > 0 || input.reviewQueueCount > 0) {
    const reviewHeavy = input.activeLens === "review_queue" || input.reviewQueueCount > 0;
    return {
      headline: reviewHeavy
        ? "This graph can already work like a review queue."
        : "This graph already holds a usable note-chain branch.",
      detail: reviewHeavy
        ? "Start with review-pending notes and the strongest linked branch first. For a stressed student, clearing one branch is more valuable than scanning the whole graph."
        : "Use the graph to continue one note chain, then return to retained sources only when the evidence behind the branch needs checking.",
      badge: reviewHeavy ? "Review queue ready" : "Note chain ready",
      cards: [
        {
          label: "Best branch",
          value: branchLabel,
          detail: "Note stages and review state already make this graph more useful than a flat search result list.",
          tone: "violet",
        },
        {
          label: "Link quality",
          value: linkLabel,
          detail: "The strongest linked notes should be reviewed before new unrelated material is added.",
          tone: input.strongCount > 0 ? "emerald" : "amber",
        },
        {
          label: "Best supporting surface",
          value: "Retained sources in Files",
          detail: "Files should still hold the extracted notes and source evidence behind this branch when the student needs to verify details quickly.",
          tone: "sky",
        },
      ],
      primaryActionId: reviewHeavy ? "focus_review_queue" : "open_study_workspace",
      primaryActionLabel: reviewHeavy ? "Focus review queue" : "Continue note chain",
      secondaryActionId: reviewHeavy ? "open_files" : (input.hasActiveFilters ? "clear_filters" : "open_files"),
      secondaryActionLabel: reviewHeavy ? "Open retained sources" : (input.hasActiveFilters ? "Reset graph view" : "Open retained sources"),
    };
  }

  if (input.strongCount >= 2 || input.linkedCount >= 3 || input.denseCount > 0) {
    const shouldFocusCluster = Boolean(input.recommendedTag && input.activeTag !== input.recommendedTag);
    const shouldShowStrongLinks = input.strongCount > 0 && input.activeConnectionStrength !== "high";
    return {
      headline: "This graph is already strong enough for same-topic revision.",
      detail: "The fastest path is to stay narrow: focus the densest supertag cluster or the strongest links, then ask from that slice instead of browsing the whole graph.",
      badge: "Revision-ready graph",
      cards: [
        {
          label: "Best cluster",
          value: clusterLabel,
          detail: "Supertag density is the quickest signal for where a student should start when time and energy are low.",
          tone: "violet",
        },
        {
          label: "Reliable overlap",
          value: linkLabel,
          detail: "Strong links and repeated overlap are what make the graph useful for revision rather than just interesting to look at.",
          tone: "emerald",
        },
        {
          label: "Study branch",
          value: branchLabel,
          detail: "Connected notes and retained branches should now be dense enough to support grounded follow-up questions immediately.",
          tone: "sky",
        },
      ],
      primaryActionId: shouldFocusCluster
        ? "focus_cluster"
        : shouldShowStrongLinks
          ? "show_strong_links"
          : "open_study_workspace",
      primaryActionLabel: shouldFocusCluster
        ? "Focus strongest cluster"
        : shouldShowStrongLinks
          ? "Show strongest links"
          : "Ask from this study focus",
      secondaryActionId: shouldFocusCluster
        ? (shouldShowStrongLinks ? "show_strong_links" : "open_files")
        : "open_files",
      secondaryActionLabel: shouldFocusCluster
        ? (shouldShowStrongLinks ? "Show strongest links" : "Open retained sources")
        : "Open retained sources",
    };
  }

  return {
    headline: "One narrower move should make this graph much easier to trust.",
    detail: "This is still closer to early signal than a dependable study map. Stay inside one cluster, one source family, or one next-source plan before asking broader revision questions.",
    badge: "Needs one more anchor",
    cards: [
      {
        label: "Current graph signal",
        value: linkLabel,
        detail: "Weak or sparse linkage usually means the graph needs one adjacent lecture, reading, or rough note from the same topic.",
        tone: input.linkedCount > 0 ? "sky" : "amber",
      },
      {
        label: "Best narrowing key",
        value: clusterLabel,
        detail: "Supertags are the quickest way to avoid widening into unrelated cards.",
        tone: "violet",
      },
      {
        label: "Best continuation surface",
        value: "Files plus one next source",
        detail: "Open retained sources when the graph still feels shallow, then attach one adjacent source that strengthens the same thread.",
        tone: "emerald",
      },
    ],
    primaryActionId: input.recommendedTag && input.activeTag !== input.recommendedTag
      ? "focus_cluster"
      : "plan_next_source",
    primaryActionLabel: input.recommendedTag && input.activeTag !== input.recommendedTag
      ? "Focus strongest cluster"
      : "Plan next source",
    secondaryActionId: input.hasActiveFilters ? "clear_filters" : "open_files",
    secondaryActionLabel: input.hasActiveFilters ? "Reset graph view" : "Open retained sources",
  };
}
