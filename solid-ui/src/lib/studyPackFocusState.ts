// @locs-version: 1.0
import type { FileLibraryItem } from "@/lib/api";
import type { KnowledgeCard } from "@/lib/knowledgeGraphTypes";
import { fileLibraryStudyReadiness } from "@/lib/fileLibraryState";

export type StudyPackFocusSummary = {
  headline: string;
  detail: string;
  contextLabel: string | null;
  stats: Array<{ label: string; value: string }>;
  nextStep: string;
};

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return [...new Set(values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim()))];
}

function buildContextLabel(
  courseTags: string[],
  weekTags: string[],
  lectureTags: string[],
  chapterTags: string[],
  unitTags: string[],
): string | null {
  if (courseTags.length === 1 && unitTags.length === 1 && chapterTags.length === 1) {
    return `${courseTags[0]} / ${unitTags[0]} / ${chapterTags[0]}`;
  }
  if (courseTags.length === 1 && chapterTags.length === 1) {
    return `${courseTags[0]} / ${chapterTags[0]}`;
  }
  if (courseTags.length === 1 && unitTags.length === 1) {
    return `${courseTags[0]} / ${unitTags[0]}`;
  }
  if (courseTags.length === 1 && weekTags.length === 1 && lectureTags.length === 1) {
    return `${courseTags[0]} · ${weekTags[0]} · ${lectureTags[0]}`;
  }
  if (courseTags.length === 1 && weekTags.length === 1) {
    return `${courseTags[0]} · ${weekTags[0]}`;
  }
  if (courseTags.length === 1) return courseTags[0] ?? null;
  if (chapterTags.length === 1) return chapterTags[0] ?? null;
  if (unitTags.length === 1) return unitTags[0] ?? null;
  if (weekTags.length === 1) return weekTags[0] ?? null;
  return null;
}

function itemLooksStudyLike(item: FileLibraryItem): boolean {
  return item.source_kind === "parsed_document"
    || item.source_kind === "transcript"
    || typeof item.source_metadata.academic_kind === "string"
    || typeof item.source_metadata.academic_course_tag === "string"
    || typeof item.source_metadata.academic_week_tag === "string"
    || typeof item.source_metadata.academic_lecture_tag === "string"
    || typeof item.source_metadata.academic_chapter_tag === "string"
    || typeof item.source_metadata.academic_unit_tag === "string"
    || item.source_supertags.some((tag) => tag.startsWith("academic:")
      || tag.startsWith("course:")
      || tag.startsWith("week:")
      || tag.startsWith("lecture:")
      || tag.startsWith("chapter:")
      || tag.startsWith("unit:"));
}

export function summarizeFileStudyPack(items: readonly FileLibraryItem[]): StudyPackFocusSummary | null {
  const studyItems = items.filter(itemLooksStudyLike);
  if (studyItems.length === 0) return null;

  const readyCount = studyItems.filter((item) => fileLibraryStudyReadiness(item) === "ready_now").length;
  const connectedCount = studyItems.filter((item) => item.source_metadata.knowledge_mode === "connected_notes").length;
  const zettelkastenCount = studyItems.filter((item) => item.source_metadata.knowledge_mode === "zettelkasten").length;
  const courseTags = uniqueNonEmpty(studyItems.map((item) => item.source_metadata.academic_course_tag as string | undefined));
  const weekTags = uniqueNonEmpty(studyItems.map((item) => item.source_metadata.academic_week_tag as string | undefined));
  const lectureTags = uniqueNonEmpty(studyItems.map((item) => item.source_metadata.academic_lecture_tag as string | undefined));
  const chapterTags = uniqueNonEmpty(studyItems.map((item) => item.source_metadata.academic_chapter_tag as string | undefined));
  const unitTags = uniqueNonEmpty(studyItems.map((item) => item.source_metadata.academic_unit_tag as string | undefined));
  const contextLabel = buildContextLabel(courseTags, weekTags, lectureTags, chapterTags, unitTags);

  return {
    headline:
      studyItems.length > 1
        ? "Focused study pack from your retained sources"
        : "Focused retained study source",
    detail:
      studyItems.length > 1
        ? "This view is narrowed to the study material most relevant to the latest run, so you can review retained sources before branching back out."
        : "This view is narrowed to the retained study source from the latest run, so you can inspect what OmnyID kept without digging through the whole library.",
    contextLabel,
    stats: [
      { label: "Visible study items", value: `${studyItems.length}` },
      { label: "Study ready now", value: `${readyCount}` },
      { label: "Connected notes", value: `${connectedCount}` },
      { label: "Zettelkasten", value: `${zettelkastenCount}` },
    ],
    nextStep:
      studyItems.length > 1
        ? "Next best step: review the study-ready sources first, then open the matching graph view to inspect overlap and revision gaps."
        : "Next best step: review the retained source first, then open the matching graph view as related study material accumulates.",
  };
}

export function summarizeKnowledgeGraphStudyPack(cards: readonly KnowledgeCard[]): StudyPackFocusSummary | null {
  if (cards.length === 0) return null;
  const stronglyLinkedCount = cards.filter((card) => card.connectionStrength === "high").length;
  const connectedCount = cards.filter((card) => card.knowledgeMode === "connected_notes").length;
  const zettelkastenCount = cards.filter((card) => card.knowledgeMode === "zettelkasten").length;
  const courseTags = uniqueNonEmpty(cards.map((card) => card.academicCourseTag));
  const weekTags = uniqueNonEmpty(cards.map((card) => card.academicWeekTag));
  const lectureTags = uniqueNonEmpty(cards.map((card) => card.academicLectureTag));
  const chapterTags = uniqueNonEmpty(cards.map((card) => card.academicChapterTag));
  const unitTags = uniqueNonEmpty(cards.map((card) => card.academicUnitTag));
  const contextLabel = buildContextLabel(courseTags, weekTags, lectureTags, chapterTags, unitTags);

  return {
    headline:
      cards.length > 1
        ? "Focused study graph for the retained pack"
        : "Focused study graph card",
    detail:
      cards.length > 1
        ? "This graph view is narrowed to the retained cards most relevant to the current study pack, so cross-source links are easier to inspect immediately."
        : "This graph view is narrowed to the retained card most relevant to the current study pack, so the first grounded note is easier to inspect immediately.",
    contextLabel,
    stats: [
      { label: "Visible cards", value: `${cards.length}` },
      { label: "Strong links", value: `${stronglyLinkedCount}` },
      { label: "Connected notes", value: `${connectedCount}` },
      { label: "Zettelkasten", value: `${zettelkastenCount}` },
    ],
    nextStep:
      cards.length > 1
        ? "Next best step: inspect the strongest links first, then return to Files if you need the retained source material behind those cards."
        : "Next best step: inspect this card, then add the next related lecture, reading, or note so the graph can form stronger links.",
  };
}
