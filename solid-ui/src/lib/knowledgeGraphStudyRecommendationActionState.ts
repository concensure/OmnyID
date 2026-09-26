// @locs-version: 1.0
import type { KnowledgeGraphStudyRecommendationActionId } from "@/lib/knowledgeGraphStudyRecommendationState";
import {
  buildReportIntentFromFocus,
  type ReportFocusInput,
  type ReportNavigationIntent,
} from "@/lib/reportNavigationState";

type RecommendationReportFocusInput = ReportFocusInput & {
  focusTags?: readonly string[] | null;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function uniqueStrings(values: readonly (string | null | undefined)[], limit = 14): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function focusText(input: RecommendationReportFocusInput): string {
  return [
    input.academicKind,
    input.searchQuery,
    input.activeTag,
    input.courseTag,
    input.chapterTag,
    input.unitTag,
    input.knowledgeGraphGroupKey,
    ...(input.knowledgeGraphLinkTags ?? []),
    ...(input.focusTags ?? []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join(" ").toLowerCase();
}

function withTags(
  input: RecommendationReportFocusInput,
  tags: readonly string[],
): string[] {
  return uniqueStrings([
    ...tags,
    ...(input.knowledgeGraphLinkTags ?? []),
    ...(input.focusTags ?? []),
  ]);
}

export function buildKnowledgeGraphStudyRecommendationReportIntent(
  actionId: KnowledgeGraphStudyRecommendationActionId | null | undefined,
  input: RecommendationReportFocusInput,
): ReportNavigationIntent | null {
  if (!actionId) return null;
  const text = focusText(input);
  const topologyFocus = /\bmedical_topology_coverage\b|\bmedical topology coverage\b|\btopology_gap\b|\breadiness:/i.test(text);
  const sourceOnly = /\breadiness:source only\b|\bsource only\b|\btopology_gap:source_only\b|\bneeds locator\b/i.test(text);
  const practiceReady = /\breadiness:(attempt evidence|ready for timed block|deck generated|review overload)\b|\battempt evidence\b|\bready for timed block\b|\breview overload\b/i.test(text);

  if (actionId === "generate_flashcards") {
    return buildReportIntentFromFocus({
      ...input,
      preferredKind: "flashcard_deck",
    });
  }

  if (actionId === "generate_gap_cloze_deck") {
    return buildReportIntentFromFocus({
      ...input,
      preferredKind: "flashcard_deck",
      academicKind: "medical_cloze_vignette",
      searchQuery: input.searchQuery || (topologyFocus
        ? "medical topology coverage source-only cloze vignette deck"
        : "medical cloze vignette deck from graph gaps"),
      zettelkastenNextAction: topologyFocus
        ? "Use the current medical topology coverage state to generate only missing source-grounded cloze/vignette rows. Preserve source locators, chapter/unit tags, concept supertags, and do not copy proprietary QBank text."
        : "Generate source-grounded medical cloze and short clinical-vignette recall items for the current graph gaps, preserving source locators, chapter/unit tags, and concept supertags.",
      knowledgeGraphLinkTags: withTags(input, [
        "medical_cloze_vignette",
        topologyFocus ? "medical_topology_coverage" : "medical_gap_cloze_deck",
        ...(sourceOnly ? ["topology_gap:source_only"] : []),
      ]),
    });
  }

  if (actionId === "generate_vignette_block") {
    return buildReportIntentFromFocus({
      ...input,
      preferredKind: "practice_questions",
      academicKind: "medical_cloze_vignette",
      searchQuery: input.searchQuery || (topologyFocus
        ? "medical topology coverage timed vignette block"
        : "medical vignette block from concept graph"),
      zettelkastenNextAction: topologyFocus
        ? "Use the current medical topology coverage state to generate freshly phrased vignette/application questions from covered concept relationships, with source locators and no copied proprietary QBank text."
        : "Generate freshly phrased medical vignette/application questions from the current concept graph so the student practices reasoning rather than memorized static cards.",
      knowledgeGraphLinkTags: withTags(input, [
        "medical_cloze_vignette",
        "medical_vignette_block",
        ...(topologyFocus ? ["medical_topology_coverage"] : []),
        ...(practiceReady ? ["topology_practice_ready"] : []),
      ]),
    });
  }

  if (actionId === "review_card_load") {
    return buildReportIntentFromFocus({
      ...input,
      preferredKind: "practice_questions",
      academicKind: "medical_cloze_vignette",
      searchQuery: input.searchQuery || (topologyFocus
        ? "medical topology coverage review overload"
        : "medical review load and shallow first-order card upgrade"),
      zettelkastenNextAction: "Review medical card-load pressure and shallow first-order cards as recommendations only; suggest upgrades into application prompts and do not auto-suspend or rewrite cards without approval.",
      knowledgeGraphLinkTags: withTags(input, [
        "medical_cloze_vignette",
        "quality_action:upgrade_first_order",
        "review_load:recommendation_only",
        ...(topologyFocus ? ["medical_topology_coverage"] : []),
      ]),
    });
  }

  if (actionId === "generate_cheatsheet") {
    return buildReportIntentFromFocus({ ...input, preferredKind: "cheatsheet" });
  }

  if (actionId === "start_guided_session") {
    return buildReportIntentFromFocus({ ...input, preferredKind: "guided_study_session" });
  }

  if (actionId === "generate_exam_report") {
    return buildReportIntentFromFocus({ ...input, preferredKind: "exam_preparation" });
  }

  return null;
}
