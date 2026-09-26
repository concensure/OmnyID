// @locs-version: 1.0
import {
  continueStudyFocusLabel,
  openRetainedSourcesLabel,
  focusReviewQueueLabel,
  showStrongestLinksLabel,
} from "@/lib/studyFocusActionCopy";

export type KnowledgeGraphRobustnessActionId =
  | "show_strong_links"
  | "focus_review_queue"
  | "open_files"
  | "open_study_workspace";

export type KnowledgeGraphRobustnessState = {
  grade: "warming_up" | "developing" | "robust";
  headline: string;
  detail: string;
  tone: "amber" | "sky" | "emerald";
  primaryActionId: KnowledgeGraphRobustnessActionId;
  primaryActionLabel: string;
  secondaryActionId: KnowledgeGraphRobustnessActionId | null;
  secondaryActionLabel: string | null;
};

export function buildKnowledgeGraphRobustnessState(input: {
  totalCards: number;
  linkedCards: number;
  strongCount: number;
  mediumCount: number;
  lightCount: number;
  courseCount: number;
  weekCount: number;
  lectureCount: number;
  topicalDenseCount: number;
  corroboratedCount: number;
  diverseSourceCount: number;
  zettelkastenCount: number;
  permanentCount: number;
  reviewQueueCount: number;
  activeConnectionStrength: "high" | "medium" | "low" | null;
  activeLens: string;
}): KnowledgeGraphRobustnessState | null {
  if (input.totalCards === 0) return null;

  const reinforcedCount = input.strongCount + input.mediumCount;
  const sparseCoverage = input.courseCount <= 1 && input.weekCount <= 1 && input.lectureCount <= 1;
  const corroboratedCoverage = input.corroboratedCount >= Math.ceil(input.totalCards / 3);
  const sourceDiversityHealthy = input.diverseSourceCount >= Math.ceil(input.totalCards / 4);
  const topicalCoverageHealthy = input.topicalDenseCount >= Math.ceil(input.totalCards / 3);

  if (input.totalCards < 3 || input.linkedCards === 0) {
    return {
      grade: "warming_up",
      headline: "This graph is still warming up.",
      detail: input.linkedCards === 0
        ? "Cards exist, but meaningful links have not formed yet. Another related lecture, reading, or note from the same subject should create the first grounded overlaps."
        : "There is not enough retained material yet to trust this graph as a strong study network.",
      tone: "amber",
      primaryActionId: "open_files",
      primaryActionLabel: openRetainedSourcesLabel(),
      secondaryActionId: "open_study_workspace",
      secondaryActionLabel: "Add more study material",
    };
  }

  if (input.zettelkastenCount > 0 && input.reviewQueueCount > 0 && input.permanentCount === 0) {
    return {
      grade: "developing",
      headline: "Your Zettelkasten chain is forming, but review is backing up.",
      detail: "You already have linked note material, but permanent-note promotion has not started. Reviewing pending notes should improve the graph faster than adding unrelated sources.",
      tone: "sky",
      primaryActionId: "focus_review_queue",
      primaryActionLabel: input.activeLens === "review_queue" ? "Keep review queue open" : focusReviewQueueLabel(),
      secondaryActionId: "open_study_workspace",
      secondaryActionLabel: continueStudyFocusLabel("zettelkasten"),
    };
  }

  if (
    reinforcedCount >= Math.ceil(input.totalCards / 2)
    && !sparseCoverage
    && corroboratedCoverage
    && (sourceDiversityHealthy || topicalCoverageHealthy)
  ) {
    return {
      grade: "robust",
      headline: "This graph is strong enough for grounded retrieval.",
      detail: input.activeConnectionStrength === "high"
        ? "You are already looking at the strongest links. Cross-source corroboration and topical overlap are strong enough here for fast revision, comparison, and note promotion."
        : "A healthy share of cards are reinforced by medium or strong links, with enough corroboration and topical overlap to support useful study retrieval.",
      tone: "emerald",
      primaryActionId: "show_strong_links",
      primaryActionLabel: input.activeConnectionStrength === "high" ? "Keep strongest links" : showStrongestLinksLabel(),
      secondaryActionId: "open_study_workspace",
      secondaryActionLabel: continueStudyFocusLabel(input.activeLens === "zettelkasten" ? "zettelkasten" : "connected_notes"),
    };
  }

  return {
    grade: "developing",
    headline: "The graph is useful, but it still needs denser overlap.",
    detail: sparseCoverage
      ? "Most links still sit inside one narrow course or week context. Add one more adjacent source from the same subject to strengthen retrieval without fragmenting the graph."
      : !corroboratedCoverage
        ? "Links exist, but too many cards still rely on shallow or single-source evidence. Add another related lecture, reading, or note so the graph can corroborate ideas instead of only storing them."
        : !sourceDiversityHealthy
          ? "The graph is linking notes, but not yet across enough distinct retained sources. Mixing lecture, reading, and personal notes should improve retrieval quality."
      : "Some useful links exist already, but too many cards are still lightly connected. Reviewing stronger links first should make the next study step clearer.",
    tone: "sky",
    primaryActionId: reinforcedCount > 0 ? "show_strong_links" : "open_files",
    primaryActionLabel: reinforcedCount > 0 ? showStrongestLinksLabel() : openRetainedSourcesLabel(),
    secondaryActionId: "open_study_workspace",
    secondaryActionLabel: continueStudyFocusLabel(input.activeLens === "zettelkasten" ? "zettelkasten" : "connected_notes"),
  };
}
