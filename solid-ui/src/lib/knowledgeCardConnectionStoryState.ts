// @locs-version: 1.0
import type { KnowledgeCard } from "@/lib/knowledgeGraphTypes";

export type KnowledgeCardConnectionStorySignal = {
  label: string;
  value: string;
  tone: "sky" | "emerald" | "violet" | "amber";
};

export type KnowledgeCardConnectionStoryState = {
  grade: "fragile" | "developing" | "strong";
  headline: string;
  detail: string;
  nextStep: string;
  signals: KnowledgeCardConnectionStorySignal[];
};

function visibleTopicTags(card: KnowledgeCard): string[] {
  return (card.canonicalSupertags ?? card.supertags)
    .filter((tag) => /^topic:/i.test(tag))
    .map((tag) => tag.replace(/^topic:/i, "").trim())
    .filter((tag, index, all) => tag.length > 0 && all.indexOf(tag) === index)
    .slice(0, 3);
}

function anchorLabel(card: KnowledgeCard): string {
  return card.academicCourseTag?.trim()
    || card.academicWeekTag?.trim()
    || visibleTopicTags(card)[0]
    || card.title;
}

export function buildKnowledgeCardConnectionStoryState(
  card: KnowledgeCard,
): KnowledgeCardConnectionStoryState | null {
  const relatedCount = (card.relatedCardCount ?? 0) + card.backlinks.length;
  const corroboratedCount = card.corroboratedSourceCount ?? 0;
  const sourceDiversityCount = card.sourceDiversityCount ?? 0;
  const topicalCount = card.topicalConnectionCount ?? 0;
  const contradictionCount = card.contradictionLinkCount ?? 0;
  const topicTags = visibleTopicTags(card);
  const anchor = anchorLabel(card);

  if (
    relatedCount === 0
    && corroboratedCount === 0
    && sourceDiversityCount === 0
    && topicalCount === 0
    && contradictionCount === 0
  ) {
    return null;
  }

  const signals: KnowledgeCardConnectionStorySignal[] = [];

  if (corroboratedCount >= 2) {
    signals.push({
      label: "Corroboration",
      value: `This note is supported by ${corroboratedCount} retained sources or source threads, which makes it safer to revise from than a one-source note.`,
      tone: "emerald",
    });
  } else if (corroboratedCount === 1) {
    signals.push({
      label: "Corroboration",
      value: "There is at least one reinforcing source thread here, but the note would still be safer with one more adjacent source from the same topic.",
      tone: "sky",
    });
  } else {
    signals.push({
      label: "Corroboration gap",
      value: "This note still leans on isolated evidence. Treat it as a prompt to verify, not as final revision truth.",
      tone: "amber",
    });
  }

  if (sourceDiversityCount >= 2) {
    signals.push({
      label: "Source mix",
      value: `Evidence spans ${sourceDiversityCount} different source types or anchors, which is stronger for study recall than repeating only one lecture or one note format.`,
      tone: "violet",
    });
  } else if (topicTags.length > 0) {
    signals.push({
      label: "Source mix",
      value: `The note is anchored to ${topicTags.join(", ")}, but a second source type on the same idea would strengthen it faster than widening the graph.`,
      tone: "sky",
    });
  }

  if (topicalCount > 0) {
    signals.push({
      label: "Topic overlap",
      value: `This note sits inside ${topicalCount} topical overlap signal${topicalCount === 1 ? "" : "s"}, so it is starting to behave like part of a revision thread rather than a loose file.`,
      tone: card.connectionStrength === "high" ? "emerald" : "sky",
    });
  }

  if (contradictionCount > 0) {
    signals.push({
      label: "Useful tension",
      value: `${contradictionCount} contrast or challenge link${contradictionCount === 1 ? "" : "s"} are present. That is valuable for exam prep because disagreement is easier to review explicitly.`,
      tone: "amber",
    });
  }

  if (card.connectionStrength === "high") {
    return {
      grade: "strong",
      headline: "This note is strong enough to revise from directly.",
      detail: `OmnyID has enough overlap around ${anchor} that this note should hold up for grounded follow-up questions, comparisons, and revision priorities.`,
      nextStep: "Use this note for the next grounded study question, or follow one of its linked notes before broadening the topic.",
      signals: signals.slice(0, 4),
    };
  }

  if (
    card.connectionStrength === "medium"
    || corroboratedCount > 0
    || sourceDiversityCount > 0
    || topicalCount > 0
    || contradictionCount > 0
  ) {
    return {
      grade: "developing",
      headline: "This note is useful now, but it still needs one focused reinforcement move.",
      detail: `The note already has meaningful structure around ${anchor}, but not enough to trust every edge equally. Stay narrow and strengthen this exact thread next.`,
      nextStep: "Ask a narrower follow-up from this note, or add one adjacent lecture, reading, or rough note that deepens the same concept.",
      signals: signals.slice(0, 4),
    };
  }

  return {
    grade: "fragile",
    headline: "This note is still a fragile anchor.",
    detail: `The note is retained and findable, but ${anchor} still lacks enough overlap to behave like dependable connected study memory.`,
    nextStep: "Keep the note, but verify it with one adjacent source from the same topic before relying on it for revision.",
    signals: signals.slice(0, 4),
  };
}
