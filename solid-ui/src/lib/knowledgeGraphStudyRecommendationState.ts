// @locs-version: 1.0
import type { KnowledgeGraphCoverageState } from "@/lib/knowledgeGraphCoverageState";
import type { KnowledgeGraphRobustnessState } from "@/lib/knowledgeGraphRobustnessState";
import type { KnowledgeGraphTrustState } from "@/lib/knowledgeGraphTrustState";
import type { KnowledgeGraphLens } from "@/lib/knowledgeGraphViewState";

export type KnowledgeGraphStudyRecommendationActionId =
  | "generate_exam_report"
  | "generate_flashcards"
  | "generate_gap_cloze_deck"
  | "generate_vignette_block"
  | "review_card_load"
  | "generate_cheatsheet"
  | "start_guided_session"
  | "focus_strongest_cluster"
  | "show_strongest_links"
  | "plan_next_source";

export type KnowledgeGraphStudyRecommendation = {
  label: string;
  detail: string;
  actionId: KnowledgeGraphStudyRecommendationActionId;
  actionLabel: string;
  tone: "sky" | "emerald" | "violet" | "amber";
};

export type KnowledgeGraphStudyRecommendationState = {
  headline: string;
  detail: string;
  badge: string;
  recommendations: KnowledgeGraphStudyRecommendation[];
};

function compact(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function focusLabel(input: {
  activeTag?: string | null;
  courseTag?: string | null;
  weekTag?: string | null;
  lectureTag?: string | null;
  chapterTag?: string | null;
  unitTag?: string | null;
  coverage?: KnowledgeGraphCoverageState | null;
}): string {
  return compact(input.activeTag)
    ?? compact(input.lectureTag)
    ?? compact(input.weekTag)
    ?? compact(input.chapterTag)
    ?? compact(input.unitTag)
    ?? compact(input.courseTag)
    ?? compact(input.coverage?.recommendedTag)
    ?? "this graph focus";
}

function medicalFocusState(input: {
  academicKind?: string | null;
  activeTag?: string | null;
  courseTag?: string | null;
  chapterTag?: string | null;
  unitTag?: string | null;
  focusTags?: readonly string[] | null;
}): {
  isMedical: boolean;
  hasQualitySignal: boolean;
  hasConceptGapSignal: boolean;
  hasTopologyCoverageSignal: boolean;
  hasTopologySourceOnlySignal: boolean;
  hasTopologyPracticeSignal: boolean;
  hasTopologyOverloadSignal: boolean;
} {
  const text = [
    input.academicKind,
    input.activeTag,
    input.courseTag,
    input.chapterTag,
    input.unitTag,
    ...(input.focusTags ?? []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join(" ").toLowerCase();
  const isMedical = /\bmedical_cloze_vignette\b|\bmedical_concept|\bmedical_edge|\bpathophys\b|\bpharm\b|\bclinical presentation\b|\bqbank\b|\bsystem:/i.test(text);
  return {
    isMedical,
    hasQualitySignal: /\bquality_action:upgrade_first_order\b|\bfirst_order\b|\bshallow\b|\breview[-_ ]?overload\b|\breview[-_ ]?load\b|\bbloat\b/i.test(text),
    hasConceptGapSignal: /\bmedical_concept_edge_review\b|\bscore_band:(weak|unattempted)\b|\bmissed_topic:|\bpathophys\b|\bpharm\b|\bpresentation\b|\bcontraindication\b|\bmanagement\b/i.test(text),
    hasTopologyCoverageSignal: /\bmedical_topology_coverage\b|\bmedical topology coverage\b|\btopology_gap\b|\btopology:/i.test(text),
    hasTopologySourceOnlySignal: /\breadiness:source only\b|\bsource only\b|\bsource-only topology gap\b|\bneeds locator\b|\btopology_gap:source_only\b/i.test(text),
    hasTopologyPracticeSignal: /\breadiness:(attempt evidence|ready for timed block|deck generated)\b|\battempt evidence\b|\bready for timed block\b|\bdeck generated\b/i.test(text),
    hasTopologyOverloadSignal: /\breadiness:review overload\b|\breview overload\b|\breview overload topology gap\b|\btopology_gap:overload\b/i.test(text),
  };
}

function pushRecommendation(
  recommendations: KnowledgeGraphStudyRecommendation[],
  recommendation: KnowledgeGraphStudyRecommendation,
): void {
  if (recommendations.some((item) => item.actionId === recommendation.actionId)) return;
  recommendations.push(recommendation);
}

export function buildKnowledgeGraphStudyRecommendationState(input: {
  visibleCount: number;
  activeLens: KnowledgeGraphLens;
  activeTag: string | null;
  courseTag: string | null;
  weekTag: string | null;
  lectureTag: string | null;
  chapterTag?: string | null;
  unitTag?: string | null;
  academicKind?: string | null;
  focusTags?: readonly string[] | null;
  strongCount: number;
  reviewQueueCount: number;
  zettelkastenCount: number;
  robustness: KnowledgeGraphRobustnessState | null;
  trust: KnowledgeGraphTrustState | null;
  coverage: KnowledgeGraphCoverageState | null;
}): KnowledgeGraphStudyRecommendationState | null {
  if (input.visibleCount === 0) return null;

  const focus = focusLabel(input);
  const medicalFocus = medicalFocusState(input);
  const graphReady =
    input.robustness?.grade === "robust"
    || input.trust?.grade === "trusted"
    || input.coverage?.grade === "dense"
    || input.strongCount >= 2;
  const needsSource =
    input.robustness?.grade === "warming_up"
    || input.trust?.grade === "fragile"
    || input.coverage?.grade === "sparse";
  const zettelkastenActive =
    input.activeLens === "zettelkasten"
    || input.activeLens === "review_queue"
    || input.activeLens === "permanent_notes"
    || input.zettelkastenCount > 0;

  const recommendations: KnowledgeGraphStudyRecommendation[] = [];

  if (needsSource) {
    recommendations.push({
      label: "Strengthen before high-stakes revision",
      detail: `Add one adjacent lecture, reading, note, or recording for ${focus} before relying on this as an exam source.`,
      actionId: "plan_next_source",
      actionLabel: "Plan next source",
      tone: "amber",
    });
  }

  if (input.coverage?.recommendedTag && input.activeTag !== input.coverage.recommendedTag) {
    recommendations.push({
      label: "Start with the densest cluster",
      detail: `Focus ${input.coverage.recommendedTag} first so the student revises from repeated supertag overlap instead of scanning every note.`,
      actionId: "focus_strongest_cluster",
      actionLabel: "Focus cluster",
      tone: "violet",
    });
  }

  if (input.strongCount > 0) {
    recommendations.push({
      label: "Use the strongest links",
      detail: "Show high-confidence links first for the most reliable cross-source explanations, comparisons, and likely exam angles.",
      actionId: "show_strongest_links",
      actionLabel: "Show strongest links",
      tone: "emerald",
    });
  }

  if (medicalFocus.isMedical && medicalFocus.hasTopologyCoverageSignal) {
    if (medicalFocus.hasTopologySourceOnlySignal || medicalFocus.hasConceptGapSignal) {
      pushRecommendation(recommendations, {
        label: "Fill medical topology coverage gaps",
        detail: `Use ${focus} to generate only the missing source-grounded cloze/vignette rows, preserving source locators, chapter/unit scope, and concept supertags.`,
        actionId: "generate_gap_cloze_deck",
        actionLabel: "Fill topology gaps",
        tone: "sky",
      });
    }

    if (medicalFocus.hasTopologyPracticeSignal) {
      pushRecommendation(recommendations, {
        label: "Run a fresh vignette block",
        detail: "Use the current medical topology coverage state to generate new clinical application wording from the same concept relationships.",
        actionId: "generate_vignette_block",
        actionLabel: "Vignette block",
        tone: "emerald",
      });
    }
  }

  if (medicalFocus.isMedical && graphReady) {
    pushRecommendation(recommendations, {
      label: "Make cited cloze/vignette cards for gaps",
      detail: `Use ${focus} to generate Anki-compatible cloze rows and short clinical vignettes with source locators, chapter/unit tags, and concept supertags.`,
      actionId: "generate_gap_cloze_deck",
      actionLabel: "Cloze/vignette deck",
      tone: "sky",
    });
    pushRecommendation(recommendations, {
      label: "Run a fresh vignette block",
      detail: "Generate freshly phrased application questions from the same medical concept graph so the student practices reasoning, not memorized card wording.",
      actionId: "generate_vignette_block",
      actionLabel: "Vignette block",
      tone: "emerald",
    });
  }

  if (medicalFocus.isMedical && (medicalFocus.hasQualitySignal || input.reviewQueueCount > 0 || medicalFocus.hasConceptGapSignal || medicalFocus.hasTopologyOverloadSignal)) {
    pushRecommendation(recommendations, {
      label: "Reduce medical review load",
      detail: "Review shallow first-order or overloaded card areas as recommendations only; do not auto-suspend or rewrite cards without explicit student approval.",
      actionId: "review_card_load",
      actionLabel: "Review load",
      tone: "amber",
    });
  }

  if (graphReady) {
    recommendations.push({
      label: "Generate an exam-prep report",
      detail: `Use ${focus}, retained sources, supertags, graph links, and note topology to create a practical revision plan immediately.`,
      actionId: "generate_exam_report",
      actionLabel: "Exam report",
      tone: "emerald",
    });
    recommendations.push({
      label: "Turn this focus into drills",
      detail: "Generate flashcards or practice questions from the same graph slice so the output becomes active recall, not just another summary.",
      actionId: "generate_flashcards",
      actionLabel: "Flashcards",
      tone: "sky",
    });
  }

  if (zettelkastenActive || input.reviewQueueCount > 0) {
    recommendations.push({
      label: "Clear the thinking queue",
      detail: "Run a guided session over pending Zettelkasten notes and promote the strongest source notes into permanent-note candidates.",
      actionId: "start_guided_session",
      actionLabel: "Guided session",
      tone: "violet",
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      label: "Make a compact cheatsheet",
      detail: `Use ${focus} to create a one-page revision artifact, then add missing sources only where the output shows weak coverage.`,
      actionId: "generate_cheatsheet",
      actionLabel: "Cheatsheet",
      tone: "sky",
    });
  }

  const badge = graphReady
    ? "Ready for study output"
    : needsSource
      ? "Needs source reinforcement"
      : "Developing study graph";

  return {
    headline: graphReady
      ? "This graph slice can produce useful study material now."
      : needsSource
        ? "This graph slice needs one focused source before it should drive exam prep."
        : "This graph slice is usable if the next action stays narrow.",
    detail: graphReady
      ? "The fastest student value is to move from graph browsing into an exam report, flashcards, or a guided session while the focus is already narrowed."
      : "Keep the workflow low-effort: use one recommended next action rather than asking the student to manually organize notes or choose folders.",
    badge,
    recommendations: recommendations.slice(0, 4),
  };
}
