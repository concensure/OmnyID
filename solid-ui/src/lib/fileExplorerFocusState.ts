// @locs-version: 1.0
import type { FileLibraryTagFacet } from "@/lib/api";

type KnowledgeMode = "all" | "connected_notes" | "zettelkasten" | "standard" | "unclassified";
type StudyReadiness = "all" | "ready_now" | "developing" | "archival";

export type FileExplorerFocusState = {
  headline: string;
  detail: string;
  badge: string;
  appliedFocus: string[];
  suggestedTags: Array<{ tag: string; count: number }>;
  nextRefinement: string;
  searchExamples: string[];
};

function prioritizeTag(tag: string): number {
  if (tag.startsWith("course:")) return 0;
  if (tag.startsWith("unit:")) return 1;
  if (tag.startsWith("chapter:")) return 2;
  if (tag.startsWith("week:")) return 3;
  if (tag.startsWith("lecture:")) return 4;
  if (tag.startsWith("topic:")) return 5;
  if (tag.startsWith("resource:")) return 6;
  return 7;
}

function quoted(value: string): string {
  return `"${value}"`;
}

function buildSearchExamples(input: {
  query: string;
  courseTag: string | null;
  unitTag: string | null;
  chapterTag: string | null;
  weekTag: string | null;
  lectureTag: string | null;
  activeTag: string | null;
}): string[] {
  const examples = new Set<string>();
  if (input.query.trim()) {
    if (input.weekTag?.trim()) examples.add(`${input.query.trim()} ${input.weekTag.trim().replace(/^week:/i, "week ")}`);
    if (input.chapterTag?.trim()) examples.add(`${input.query.trim()} ${input.chapterTag.trim().replace(/^chapter:/i, "chapter ")}`);
    if (input.unitTag?.trim()) examples.add(`${input.query.trim()} ${input.unitTag.trim().replace(/^unit:/i, "unit ")}`);
    if (input.courseTag?.trim()) examples.add(`${input.query.trim()} ${input.courseTag.trim().replace(/^course:/i, "")}`);
    examples.add(`${input.query.trim()} revision`);
    examples.add(`${input.query.trim()} exam`);
  } else {
    if (input.courseTag?.trim()) examples.add(input.courseTag.trim().replace(/^course:/i, ""));
    if (input.unitTag?.trim()) examples.add(input.unitTag.trim().replace(/^unit:/i, "unit "));
    if (input.chapterTag?.trim()) examples.add(input.chapterTag.trim().replace(/^chapter:/i, "chapter "));
    if (input.weekTag?.trim()) examples.add(input.weekTag.trim().replace(/^week:/i, "week "));
    if (input.lectureTag?.trim()) examples.add(input.lectureTag.trim().replace(/^lecture:/i, "lecture "));
    if (input.activeTag?.trim()) examples.add(input.activeTag.trim().replace(/^[a-z_]+:/i, ""));
    examples.add("week 3");
    examples.add("assignment brief");
    examples.add("revision notes");
  }
  return [...examples].slice(0, 4);
}

export function buildFileExplorerFocusState(input: {
  matchingCount: number;
  visibleCount: number;
  readyCount: number;
  linkedCount: number;
  visibleTagCount: number;
  query: string;
  activeTag: string | null;
  courseTag: string | null;
  unitTag: string | null;
  chapterTag: string | null;
  weekTag: string | null;
  lectureTag: string | null;
  knowledgeMode: KnowledgeMode;
  studyReadiness: StudyReadiness;
  topTags: FileLibraryTagFacet[];
}): FileExplorerFocusState {
  const appliedFocus: string[] = [];
  if (input.query.trim()) appliedFocus.push(`keyword ${quoted(input.query.trim())}`);
  if (input.activeTag?.trim()) appliedFocus.push(`tag ${input.activeTag.trim()}`);
  if (input.courseTag?.trim()) appliedFocus.push(input.courseTag.trim());
  if (input.unitTag?.trim()) appliedFocus.push(input.unitTag.trim());
  if (input.chapterTag?.trim()) appliedFocus.push(input.chapterTag.trim());
  if (input.weekTag?.trim()) appliedFocus.push(input.weekTag.trim());
  if (input.lectureTag?.trim()) appliedFocus.push(input.lectureTag.trim());
  if (input.knowledgeMode !== "all") {
    appliedFocus.push(
      input.knowledgeMode === "connected_notes"
        ? "Connected notes"
        : input.knowledgeMode === "zettelkasten"
          ? "Zettelkasten"
          : input.knowledgeMode === "standard"
            ? "Standard knowledge"
            : "Unclassified knowledge",
    );
  }
  if (input.studyReadiness !== "all") {
    appliedFocus.push(
      input.studyReadiness === "ready_now"
        ? "Study ready"
        : input.studyReadiness === "developing"
          ? "Linking up"
          : "Archive",
    );
  }

  const suggestedTags = input.topTags
    .filter((facet) => facet.tag.trim().length > 0 && facet.tag !== input.activeTag)
    .sort((left, right) =>
      prioritizeTag(left.tag) - prioritizeTag(right.tag)
      || right.count - left.count
      || left.tag.localeCompare(right.tag))
    .slice(0, 6);
  const searchExamples = buildSearchExamples({
    query: input.query,
    courseTag: input.courseTag,
    unitTag: input.unitTag,
    chapterTag: input.chapterTag,
    weekTag: input.weekTag,
    lectureTag: input.lectureTag,
    activeTag: input.activeTag,
  });

  if (appliedFocus.length === 0) {
    return {
      headline: "Search all retained files by keyword or supertag.",
      detail: `You can search across ${input.matchingCount} retained files without relying on folders. OmnyID uses the same supertags and study metadata here that power connected notes, graph links, and later retrieval.`,
      badge: `${input.visibleCount} visible`,
      appliedFocus,
      suggestedTags,
      nextRefinement:
        suggestedTags.length > 0
          ? "Start with a course, week, topic, or resource tag to narrow the library fast."
          : "Add a keyword like a course code, topic, lecture week, or assignment name to narrow the library fast.",
      searchExamples,
    };
  }

  const focusLabel = appliedFocus.join(" Â· ");
  const reusableCount =
    input.readyCount > 0
      ? input.readyCount
      : input.linkedCount > 0
        ? input.linkedCount
        : input.visibleTagCount;
  const badgeLabel =
    input.readyCount > 0
      ? `${input.readyCount} study-ready`
      : input.linkedCount > 0
        ? `${input.linkedCount} linked`
        : `${input.visibleTagCount} tagged`;

  return {
    headline: `Showing ${input.visibleCount} retained file${input.visibleCount === 1 ? "" : "s"} for ${focusLabel}.`,
    detail:
      input.visibleCount > 0
        ? `This focus keeps the library narrow enough to review fast while preserving the links into supertags, extracted notes, and the knowledge graph. ${reusableCount} item${reusableCount === 1 ? "" : "s"} are immediately reusable from this slice.`
        : "No retained files match the current combination yet. Clear one filter or swap to a broader tag so OmnyID can widen the study slice again.",
    badge: input.visibleCount > 0 ? badgeLabel : "No matches",
    appliedFocus,
    suggestedTags,
    nextRefinement:
      input.query.trim() && !input.activeTag
        ? "Next refinement: add one supertag to narrow the same keyword search into a cleaner study pack."
        : !input.query.trim() && input.activeTag
          ? "Next refinement: add a keyword like a lecture topic, professor name, assignment, or week number inside this tagged slice."
          : input.visibleCount > 0
            ? "Next refinement: either tighten the keyword or pivot to one suggested supertag to inspect a different connected thread."
            : "Next refinement: remove the narrowest filter first, then retry with a broader course, week, or topic tag.",
    searchExamples,
  };
}
