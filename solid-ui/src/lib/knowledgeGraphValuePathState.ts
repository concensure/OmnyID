// @locs-version: 1.0
import type { KnowledgeGraphCoverageState } from "@/lib/knowledgeGraphCoverageState";
import type { KnowledgeGraphRobustnessState } from "@/lib/knowledgeGraphRobustnessState";
import type { KnowledgeGraphTrustState } from "@/lib/knowledgeGraphTrustState";
import type { KnowledgeGraphLens } from "@/lib/knowledgeGraphViewState";
import {
  continueStudyFocusLabel,
  focusReviewQueueLabel,
  openRetainedSourcesLabel,
  planNextSourceLabel,
  showStrongestLinksLabel,
} from "@/lib/studyFocusActionCopy";

export type KnowledgeGraphValuePathActionId =
  | "focus_cluster"
  | "show_strong_links"
  | "open_study_workspace"
  | "open_files"
  | "plan_next_source"
  | "focus_review_queue";

export type KnowledgeGraphValuePathCard = {
  label: string;
  detail: string;
  tone: "sky" | "emerald" | "violet" | "amber";
};

export type KnowledgeGraphValuePathState = {
  grade: "warmup" | "developing" | "dense" | "zettelkasten";
  headline: string;
  detail: string;
  badge: string;
  cards: KnowledgeGraphValuePathCard[];
  primaryActionId: KnowledgeGraphValuePathActionId;
  primaryActionLabel: string;
  secondaryActionId: KnowledgeGraphValuePathActionId | null;
  secondaryActionLabel: string | null;
};

export function buildKnowledgeGraphValuePathState(input: {
  robustness: KnowledgeGraphRobustnessState | null;
  trust: KnowledgeGraphTrustState | null;
  coverage: KnowledgeGraphCoverageState | null;
  activeLens: KnowledgeGraphLens;
  activeTag: string | null;
  activeConnectionStrength: "high" | "medium" | "low" | null;
  stronglyLinkedCount: number;
  reviewQueueCount: number;
  zettelkastenCount: number;
}): KnowledgeGraphValuePathState | null {
  if (!input.robustness && !input.trust && !input.coverage) return null;

  const recommendedCluster = input.coverage?.recommendedTag ?? null;
  const focusingClusterHelpful = Boolean(recommendedCluster && input.activeTag !== recommendedCluster);
  const showingStrongLinksHelpful = input.stronglyLinkedCount > 0 && input.activeConnectionStrength !== "high";

  if (
    input.activeLens === "zettelkasten"
    || input.zettelkastenCount > 0
    || input.reviewQueueCount > 0
  ) {
    const reviewHeavy = input.reviewQueueCount > 0;
    return {
      grade: "zettelkasten",
      headline: reviewHeavy
        ? "This graph should be used as a review queue, not just a browse surface."
        : "This graph is ready to continue a Zettelkasten study branch.",
      detail: reviewHeavy
        ? "The fastest value is to review pending note-chain material, keep the branch narrow, and promote the strongest notes before adding unrelated sources."
        : "Supertags, note stages, and linked cards are already giving this branch structure, so the next move is to work from the current chain instead of restarting from folders or generic prompts.",
      badge: reviewHeavy ? "Review-driven graph" : "Zettelkasten-ready graph",
      cards: [
        {
          label: "Best focus",
          detail: reviewHeavy
            ? "Open the review queue and clear the strongest pending notes first."
            : "Stay inside the current note branch so OmnyID deepens one chain instead of creating disconnected notes.",
          tone: "violet",
        },
        {
          label: "What makes it reusable",
          detail: input.coverage?.noteProgressLabel
            ?? "Retained note stages and supertags are already shaping this graph into reusable study memory.",
          tone: "emerald",
        },
        {
          label: "Next move after review",
          detail: "Continue from this study focus or attach one adjacent source only if it strengthens the same branch.",
          tone: "sky",
        },
      ],
      primaryActionId: reviewHeavy ? "focus_review_queue" : "open_study_workspace",
      primaryActionLabel: reviewHeavy ? focusReviewQueueLabel() : continueStudyFocusLabel("zettelkasten"),
      secondaryActionId: reviewHeavy ? "open_study_workspace" : "open_files",
      secondaryActionLabel: reviewHeavy ? continueStudyFocusLabel("zettelkasten") : openRetainedSourcesLabel(),
    };
  }

  if (input.robustness?.grade === "warming_up" || input.trust?.grade === "fragile") {
    return {
      grade: "warmup",
      headline: "This graph is not strong enough yet to act like a dependable study network.",
      detail: "For immediate student value, do not widen the graph. Use the current focus to find the narrowest adjacent lecture, reading, note, or recording that will create the first real overlap.",
      badge: "Needs one more anchor",
      cards: [
        {
          label: "Why it is weak",
          detail: input.robustness?.detail ?? input.trust?.detail ?? "Links and corroboration are still too thin for dependable retrieval.",
          tone: "amber",
        },
        {
          label: "Best source to add next",
          detail: "Pick one adjacent source from the same course, week, or concept cluster instead of uploading a broad unrelated pack.",
          tone: "sky",
        },
        {
          label: "What to do after that",
          detail: "Once the next source is retained, return here and filter to the strongest cluster or strongest links before asking follow-up questions.",
          tone: "violet",
        },
      ],
      primaryActionId: "plan_next_source",
      primaryActionLabel: planNextSourceLabel(),
      secondaryActionId: "open_files",
      secondaryActionLabel: openRetainedSourcesLabel(),
    };
  }

  if (input.coverage?.grade === "dense" || input.robustness?.grade === "robust" || input.trust?.grade === "trusted") {
    return {
      grade: "dense",
      headline: focusingClusterHelpful
        ? "This graph is strong enough to revise from; focus the densest cluster first."
        : showingStrongLinksHelpful
          ? "This graph is strong enough to revise from; start with the strongest links."
          : "This graph is strong enough for grounded study retrieval right now.",
      detail: focusingClusterHelpful
        ? `The fastest path is the densest supertag cluster${recommendedCluster ? ` around ${recommendedCluster}` : ""}, because repeated overlap is more useful than scanning the whole graph.`
        : showingStrongLinksHelpful
          ? "Cross-source overlap is already present. Filtering to the strongest links should surface the most reliable revision path immediately."
          : "The current slice already has enough overlap, corroboration, or source diversity to support grounded follow-up questions without more setup.",
      badge: "Revision-ready graph",
      cards: [
        {
          label: "Cluster signal",
          detail: input.coverage?.detail ?? "Dense supertag overlap is present in this graph slice.",
          tone: "violet",
        },
        {
          label: "Trust signal",
          detail: input.trust?.detail ?? "The current graph slice is already reinforced enough for fast retrieval.",
          tone: "emerald",
        },
        {
          label: "Best immediate use",
          detail: "Ask for overlaps, contradictions, weak spots, exam angles, or revision priorities directly from this focus while the context is already narrowed.",
          tone: "sky",
        },
      ],
      primaryActionId: focusingClusterHelpful
        ? "focus_cluster"
        : showingStrongLinksHelpful
          ? "show_strong_links"
          : "open_study_workspace",
      primaryActionLabel: focusingClusterHelpful
        ? "Focus strongest cluster"
        : showingStrongLinksHelpful
          ? showStrongestLinksLabel()
          : continueStudyFocusLabel("connected_notes"),
      secondaryActionId: focusingClusterHelpful
        ? (showingStrongLinksHelpful ? "show_strong_links" : "open_study_workspace")
        : "open_study_workspace",
      secondaryActionLabel: focusingClusterHelpful
        ? (showingStrongLinksHelpful ? showStrongestLinksLabel() : continueStudyFocusLabel("connected_notes"))
        : continueStudyFocusLabel("connected_notes"),
    };
  }

  return {
    grade: "developing",
    headline: "This graph is useful, but one focused move will make it much more reliable.",
    detail: focusingClusterHelpful
      ? "The cleanest next step is to focus the strongest supertag cluster, then ask from that narrower slice or add one adjacent source that deepens the same thread."
      : "There is enough structure here to continue, but not enough density to browse loosely. Stay narrow and use either the strongest links or the next adjacent source.",
    badge: "Developing graph",
    cards: [
      {
        label: "Coverage signal",
        detail: input.coverage?.sourceMixLabel ?? "Source mix is still forming.",
        tone: "sky",
      },
      {
        label: "Graph maturity",
        detail: input.robustness?.detail ?? "Useful links are forming, but the network still needs denser overlap.",
        tone: "amber",
      },
      {
        label: "Best next move",
        detail: focusingClusterHelpful
          ? "Focus the strongest cluster first. If that still feels shallow, plan the next adjacent source from the same topic."
          : showingStrongLinksHelpful
            ? "Show strongest links first, then ask from that focus or add one adjacent source if corroboration still looks weak."
            : "Ask from the current focus only if the question is narrow; otherwise add one adjacent source from the same topic.",
        tone: "violet",
      },
    ],
    primaryActionId: focusingClusterHelpful
      ? "focus_cluster"
      : showingStrongLinksHelpful
        ? "show_strong_links"
        : "open_study_workspace",
    primaryActionLabel: focusingClusterHelpful
      ? "Focus strongest cluster"
      : showingStrongLinksHelpful
        ? showStrongestLinksLabel()
        : continueStudyFocusLabel("connected_notes"),
    secondaryActionId: focusingClusterHelpful ? "plan_next_source" : "plan_next_source",
    secondaryActionLabel: planNextSourceLabel(),
  };
}
