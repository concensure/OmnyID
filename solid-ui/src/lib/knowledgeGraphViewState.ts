// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import type { InsightMsg, KnowledgeCard, MergeSuggestion } from "@/lib/knowledgeGraphTypes";

export type KnowledgeGraphLens =
  | "all"
  | "connected_notes"
  | "zettelkasten"
  | "linked_ideas"
  | "study_materials"
  | "source_notes"
  | "review_queue"
  | "permanent_notes";

const HIDDEN_KNOWLEDGE_GRAPH_TAG_PREFIXES = [
  "knowledge:",
  "knowledge_mode:",
  "retention:",
  "pipeline:",
  "extraction:",
  "source:",
  "attachment:",
] as const;

export function hasKnowledgeGraphSampleData(messages: AfpMessage[]): boolean {
  return messages.some((message) => message.metadata?.source === "sample_bootstrap");
}

export function isVisibleKnowledgeGraphTag(tag: string): boolean {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) return false;
  return !HIDDEN_KNOWLEDGE_GRAPH_TAG_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function collectKnowledgeGraphTags(cards: KnowledgeCard[]): string[] {
  const tags = new Set<string>();
  for (const card of cards) {
    for (const tag of card.supertags) {
      if (isVisibleKnowledgeGraphTag(tag)) tags.add(tag);
    }
  }
  return [...tags].sort();
}

export function filterKnowledgeGraphCards(
  cards: KnowledgeCard[],
  searchQuery: string,
  activeTag: string | null,
  activeLens: KnowledgeGraphLens = "all",
): KnowledgeCard[] {
  const query = searchQuery.toLowerCase().trim();
  return cards.filter((card) => {
    if (!knowledgeGraphCardMatchesLens(card, activeLens)) return false;
    if (activeTag && !card.supertags.includes(activeTag)) return false;
    if (!query) return true;
    return (
      card.title.toLowerCase().includes(query)
      || card.summary.toLowerCase().includes(query)
      || (card.sourceKind ?? "").toLowerCase().includes(query)
      || (card.sourceMessageId ?? "").toLowerCase().includes(query)
      || (card.sourceTitle ?? "").toLowerCase().includes(query)
      || (card.sourceFileName ?? "").toLowerCase().includes(query)
      || (card.academicKind ?? "").toLowerCase().includes(query)
      || (card.academicCourseTag ?? "").toLowerCase().includes(query)
      || (card.academicUnitTag ?? "").toLowerCase().includes(query)
      || (card.academicChapterTag ?? "").toLowerCase().includes(query)
      || (card.academicWeekTag ?? "").toLowerCase().includes(query)
      || (card.academicLectureTag ?? "").toLowerCase().includes(query)
      || (card.academicSummary ?? "").toLowerCase().includes(query)
      || (card.retentionLabel ?? "").toLowerCase().includes(query)
      || (card.zettelkastenStage ?? "").toLowerCase().includes(query)
      || (card.zettelkastenEntryType ?? "").toLowerCase().includes(query)
      || (card.zettelkastenNextAction ?? "").toLowerCase().includes(query)
      || (card.knowledgeGraphGroupKey ?? "").toLowerCase().includes(query)
      || (card.storageSummary ?? "").toLowerCase().includes(query)
      || (card.provenanceSummary ?? "").toLowerCase().includes(query)
      || (card.connectionStrength ?? "").toLowerCase().includes(query)
      || (card.connectionReasons ?? []).some((reason) => reason.toLowerCase().includes(query))
      || (card.knowledgeGraphLinkTags ?? []).some((tag) => tag.toLowerCase().includes(query))
      || (card.sourceThreadId ?? "").toLowerCase().includes(query)
      || (card.referenceTargetIds ?? []).some((targetId) => targetId.toLowerCase().includes(query))
      || (card.canonicalSupertags ?? []).some((tag) => tag.toLowerCase().includes(query))
      || card.supertags.some((tag) => tag.toLowerCase().includes(query))
    );
  });
}

export function rankKnowledgeGraphCardsForFocus(
  cards: readonly KnowledgeCard[],
  options?: {
    activeTag?: string | null;
    searchQuery?: string | null;
    activeLens?: KnowledgeGraphLens;
    highlightedCardIds?: ReadonlySet<string>;
    highlightedSourceMessageId?: string | null;
  },
): KnowledgeCard[] {
  const activeTag = options?.activeTag?.trim() || null;
  const searchQuery = options?.searchQuery?.toLowerCase().trim() || "";
  const activeLens = options?.activeLens ?? "all";
  const highlightedCardIds = options?.highlightedCardIds ?? new Set<string>();
  const highlightedSourceMessageId = options?.highlightedSourceMessageId?.trim() || null;
  const score = (card: KnowledgeCard): number => {
    let total = 0;
    if (highlightedCardIds.has(card.id)) total += 100;
    if (highlightedSourceMessageId && card.sourceMessageId === highlightedSourceMessageId) total += 40;
    if (activeTag && card.supertags.includes(activeTag)) total += 20;
    if (activeLens === "study_materials" && (card.academicSummary || card.academicCourseTag || card.academicWeekTag)) total += 16;
    if (activeLens === "linked_ideas") total += Math.min(12, card.backlinks.length * 3 + (card.relatedCardCount ?? 0));
    if (activeLens === "review_queue" && card.reviewPending) total += 18;
    if (activeLens === "permanent_notes" && card.permanentNote) total += 18;
    if (card.academicCourseTag) total += 3;
    if (card.academicWeekTag) total += 2;
    if (card.knowledgeGraphSeed) total += 2;
    if (card.knowledgeGraphGroupKey) total += 2;
    if (card.zettelkastenStage === "permanent_note") total += 4;
    if (card.zettelkastenStage === "review_pending") total += 3;
    if (card.zettelkastenStage === "source_note_review_pending") total += 3;
    if (card.connectionStrength === "high") total += 8;
    if (card.connectionStrength === "medium") total += 4;
    total += Math.min(10, card.linkEvidenceScore ?? 0);
    total += Math.min(6, (card.sourceDiversityCount ?? 0) * 2);
    total += Math.min(6, (card.corroboratedSourceCount ?? 0) * 2);
    total += Math.min(4, card.topicalConnectionCount ?? 0);
    total += Math.min(3, card.contradictionLinkCount ?? 0);
    total += Math.min(8, card.backlinks.length * 2);
    total += Math.min(8, card.relatedCardCount ?? 0);
    if (card.permanentNote) total += 4;
    if (card.sourceNote) total += 2;
    if (searchQuery) {
      if (card.title.toLowerCase().includes(searchQuery)) total += 12;
      if (card.academicCourseTag?.toLowerCase().includes(searchQuery)) total += 8;
      if (card.academicWeekTag?.toLowerCase().includes(searchQuery)) total += 6;
      if (card.knowledgeGraphGroupKey?.toLowerCase().includes(searchQuery)) total += 7;
      if (card.knowledgeGraphLinkTags?.some((tag) => tag.toLowerCase().includes(searchQuery))) total += 6;
      if (card.zettelkastenNextAction?.toLowerCase().includes(searchQuery)) total += 5;
      if (card.academicSummary?.toLowerCase().includes(searchQuery)) total += 6;
      if (card.summary.toLowerCase().includes(searchQuery)) total += 4;
    }
    return total;
  };

  return [...cards].sort((left, right) => {
    const scoreDiff = score(right) - score(left);
    if (scoreDiff !== 0) return scoreDiff;
    const timeDiff = right.timestamp.localeCompare(left.timestamp);
    if (timeDiff !== 0) return timeDiff;
    return left.title.localeCompare(right.title);
  });
}

export function knowledgeGraphCardMatchesLens(
  card: KnowledgeCard,
  lens: KnowledgeGraphLens,
): boolean {
  if (lens === "all") return true;

  if (lens === "connected_notes") {
    return card.knowledgeMode === "connected_notes";
  }

  if (lens === "study_materials") {
    return card.sourceKind === "parsed_document"
      || card.sourceKind === "transcript"
      || Boolean(card.academicKind)
      || Boolean(card.academicCourseTag)
      || Boolean(card.academicWeekTag)
      || Boolean(card.academicSummary)
      || card.supertags.includes("resource:study_material")
      || card.supertags.some((tag) => tag.startsWith("academic:"));
  }

  if (lens === "linked_ideas") {
    return card.backlinks.length > 0
      || (card.relatedCardCount ?? 0) > 0
      || (card.referenceTargetIds ?? []).length > 0;
  }

  if (lens === "source_notes") {
    return card.sourceNote;
  }

  if (lens === "review_queue") {
    return card.reviewPending;
  }

  if (lens === "permanent_notes") {
    return card.permanentNote;
  }

  return card.knowledgeMode === "zettelkasten";
}

export function isKnowledgeGraphEmpty(
  cards: KnowledgeCard[],
  insights: InsightMsg[],
  mergeSuggestions: MergeSuggestion[],
): boolean {
  return cards.length === 0 && insights.length === 0 && mergeSuggestions.length === 0;
}
