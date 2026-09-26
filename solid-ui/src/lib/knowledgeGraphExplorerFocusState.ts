// @locs-version: 1.0
import type { KnowledgeGraphLens } from "@/lib/knowledgeGraphViewState";

export type KnowledgeGraphExplorerFocusState = {
  headline: string;
  detail: string;
  badge: string;
  appliedFocus: string[];
  suggestedTags: string[];
  searchExamples: string[];
  nextRefinement: string;
};

function quoted(value: string): string {
  return `"${value}"`;
}

function lensLabel(lens: KnowledgeGraphLens): string {
  if (lens === "linked_ideas") return "Linked ideas";
  if (lens === "study_materials") return "Study materials";
  if (lens === "source_notes") return "Source notes";
  if (lens === "review_queue") return "Review queue";
  if (lens === "permanent_notes") return "Permanent notes";
  if (lens === "connected_notes") return "Connected notes";
  if (lens === "zettelkasten") return "Zettelkasten";
  return "All lenses";
}

function labelTag(value: string): string {
  return value.replace(/^topic:/i, "").replace(/^concept:/i, "").trim() || value;
}

function buildSearchExamples(input: {
  searchQuery: string;
  activeTag: string | null;
  recommendedTag: string | null;
  courseTag: string | null;
  weekTag: string | null;
  lectureTag: string | null;
}): string[] {
  const examples = new Set<string>();
  const query = input.searchQuery.trim();
  if (query) {
    examples.add(`${query} exam`);
    examples.add(`${query} compare`);
    if (input.weekTag?.trim()) examples.add(`${query} ${input.weekTag.trim().replace(/^week:/i, "week ")}`);
    if (input.courseTag?.trim()) examples.add(`${query} ${input.courseTag.trim().replace(/^course:/i, "")}`);
  } else {
    if (input.recommendedTag?.trim()) examples.add(labelTag(input.recommendedTag));
    if (input.activeTag?.trim()) examples.add(labelTag(input.activeTag));
    if (input.courseTag?.trim()) examples.add(input.courseTag.trim().replace(/^course:/i, ""));
    if (input.weekTag?.trim()) examples.add(input.weekTag.trim().replace(/^week:/i, "week "));
    if (input.lectureTag?.trim()) examples.add(input.lectureTag.trim().replace(/^lecture:/i, "lecture "));
    examples.add("market failure");
    examples.add("assignment argument");
  }
  return [...examples].slice(0, 4);
}

export function buildKnowledgeGraphExplorerFocusState(input: {
  visibleCount: number;
  totalCount: number;
  linkedCount: number;
  strongCount: number;
  denseCount: number;
  visibleSupertagCount: number;
  searchQuery: string;
  activeTag: string | null;
  activeLens: KnowledgeGraphLens;
  activeConnectionStrength: "high" | "medium" | "low" | null;
  courseTag: string | null;
  weekTag: string | null;
  lectureTag: string | null;
  recommendedTag: string | null;
  clusterTags: string[];
}): KnowledgeGraphExplorerFocusState | null {
  if (input.visibleCount === 0) return null;

  const appliedFocus: string[] = [];
  if (input.searchQuery.trim()) appliedFocus.push(`keyword ${quoted(input.searchQuery.trim())}`);
  if (input.activeTag?.trim()) appliedFocus.push(`cluster ${labelTag(input.activeTag.trim())}`);
  if (input.activeLens !== "all") appliedFocus.push(lensLabel(input.activeLens));
  if (input.activeConnectionStrength) {
    appliedFocus.push(
      input.activeConnectionStrength === "high"
        ? "Strong links"
        : input.activeConnectionStrength === "medium"
          ? "Medium links"
          : "Light links",
    );
  }
  if (input.courseTag?.trim()) appliedFocus.push(input.courseTag.trim());
  if (input.weekTag?.trim()) appliedFocus.push(input.weekTag.trim());
  if (input.lectureTag?.trim()) appliedFocus.push(input.lectureTag.trim());

  const suggestedTags = input.clusterTags
    .filter((tag) => tag.trim().length > 0 && tag !== input.activeTag)
    .slice(0, 5);
  const searchExamples = buildSearchExamples({
    searchQuery: input.searchQuery,
    activeTag: input.activeTag,
    recommendedTag: input.recommendedTag,
    courseTag: input.courseTag,
    weekTag: input.weekTag,
    lectureTag: input.lectureTag,
  });

  if (appliedFocus.length === 0) {
    return {
      headline: "Search the graph by concept, then narrow into one cluster.",
      detail: `You can move across ${input.totalCount} knowledge cards without relying on folders. OmnyID uses supertags, retained-source links, and academic context so connected ideas stay searchable by topic, week, lecture, and note branch.`,
      badge: `${input.visibleCount} visible`,
      appliedFocus,
      suggestedTags,
      searchExamples,
      nextRefinement:
        input.recommendedTag
          ? `Start with the strongest cluster around ${labelTag(input.recommendedTag)}, or search one concept inside it.`
          : "Start with one concept, week, or lecture query so the graph tightens into a studyable slice quickly.",
    };
  }

  const focusLabel = appliedFocus.join(" Â· ");
  const reusableCount =
    input.strongCount > 0
      ? input.strongCount
      : input.linkedCount > 0
        ? input.linkedCount
        : input.visibleSupertagCount;
  const badge =
    input.strongCount > 0
      ? `${input.strongCount} strong`
      : input.linkedCount > 0
        ? `${input.linkedCount} linked`
        : `${input.visibleSupertagCount} tagged`;

  return {
    headline: `Showing ${input.visibleCount} graph card${input.visibleCount === 1 ? "" : "s"} for ${focusLabel}.`,
    detail:
      input.denseCount > 0
        ? `This slice is already dense enough to support same-topic revision. ${reusableCount} card${reusableCount === 1 ? "" : "s"} carry the strongest reusable signal in the current graph focus.`
        : `This slice is narrow enough to inspect fast while preserving the retained-source links behind it. ${reusableCount} card${reusableCount === 1 ? "" : "s"} already carry the strongest reusable signal here.`,
    badge,
    appliedFocus,
    suggestedTags,
    searchExamples,
    nextRefinement:
      input.activeTag && !input.searchQuery.trim()
        ? "Next refinement: add one concept keyword inside this cluster so the graph tightens without widening into unrelated cards."
        : input.searchQuery.trim() && !input.activeTag
          ? "Next refinement: focus one cluster so repeated overlap becomes easier to trust than a broad keyword slice."
          : input.recommendedTag && input.activeTag !== input.recommendedTag
            ? `Next refinement: switch to the strongest cluster around ${labelTag(input.recommendedTag)} if this slice still feels noisy.`
            : "Next refinement: keep the graph narrow and only widen if the current cluster still lacks enough corroboration.",
  };
}
