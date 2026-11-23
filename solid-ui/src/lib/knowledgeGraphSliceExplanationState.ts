// @locs-version: 1.0
import type { KnowledgeCard } from "@/lib/knowledgeGraphTypes";
import type { KnowledgeGraphLens } from "@/lib/knowledgeGraphViewState";

export type KnowledgeGraphSliceExplanationSignal = {
  label: string;
  value: string;
  tone: "emerald" | "sky" | "violet" | "amber";
};

export type KnowledgeGraphSliceExplanationState = {
  headline: string;
  detail: string;
  badge: string;
  nextStep: string;
  signals: KnowledgeGraphSliceExplanationSignal[];
};

function countLinked(cards: KnowledgeCard[]): number {
  return cards.filter((card) =>
    card.backlinks.length > 0 || (card.relatedCardCount ?? 0) > 0,
  ).length;
}

function strongestVisibleTags(cards: KnowledgeCard[]): string[] {
  const counts = new Map<string, number>();
  for (const card of cards) {
    for (const tag of card.canonicalSupertags ?? card.supertags) {
      const normalized = tag.trim();
      if (!normalized || /^retention:/i.test(normalized) || /^attachment:/i.test(normalized)) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([tag]) => tag)
    .slice(0, 3);
}

function lensLabel(lens: KnowledgeGraphLens): string {
  if (lens === "zettelkasten") return "Zettelkasten";
  if (lens === "connected_notes") return "connected notes";
  if (lens === "review_queue") return "review queue";
  if (lens === "source_notes") return "source notes";
  if (lens === "permanent_notes") return "permanent notes";
  if (lens === "study_materials") return "study materials";
  if (lens === "linked_ideas") return "linked ideas";
  return "knowledge graph";
}

export function buildKnowledgeGraphSliceExplanationState(input: {
  cards: KnowledgeCard[];
  activeLens: KnowledgeGraphLens;
  activeTag: string | null;
  activeConnectionStrength: "high" | "medium" | "low" | null;
  courseTag: string | null;
  weekTag: string | null;
  zettelkastenStage: string | null;
}): KnowledgeGraphSliceExplanationState | null {
  const cards = input.cards;
  if (cards.length === 0) return null;

  const linkedCount = countLinked(cards);
  const strongCount = cards.filter((card) => card.connectionStrength === "high").length;
  const corroboratedCount = cards.filter((card) => (card.corroboratedSourceCount ?? 0) >= 2).length;
  const zettelkastenCount = cards.filter((card) => card.knowledgeMode === "zettelkasten").length;
  const reviewPendingCount = cards.filter((card) => card.reviewPending).length;
  const permanentCount = cards.filter((card) => card.permanentNote).length;
  const topicTags = strongestVisibleTags(cards);
  const context = input.activeTag
    ?? input.weekTag
    ?? input.courseTag
    ?? input.zettelkastenStage
    ?? topicTags[0]
    ?? lensLabel(input.activeLens);

  const signals: KnowledgeGraphSliceExplanationSignal[] = [];

  signals.push({
    label: "Linked cards",
    value: `${linkedCount} of ${cards.length} visible card${cards.length === 1 ? "" : "s"} have backlinks or related-card evidence.`,
    tone: linkedCount >= Math.ceil(cards.length / 2) ? "emerald" : linkedCount > 0 ? "sky" : "amber",
  });

  if (topicTags.length > 0) {
    signals.push({
      label: "Supertag anchors",
      value: `Strongest anchors: ${topicTags.join(", ")}.`,
      tone: "violet",
    });
  }

  if (corroboratedCount > 0) {
    signals.push({
      label: "Cross-source evidence",
      value: `${corroboratedCount} card${corroboratedCount === 1 ? "" : "s"} have at least two retained-source signals, which is safer for study retrieval.`,
      tone: "emerald",
    });
  }

  if (zettelkastenCount > 0) {
    signals.push({
      label: "Note-chain progress",
      value: `${zettelkastenCount} card${zettelkastenCount === 1 ? "" : "s"} are in Zettelkasten mode, with ${reviewPendingCount} pending review and ${permanentCount} permanent note${permanentCount === 1 ? "" : "s"}.`,
      tone: reviewPendingCount > 0 ? "amber" : "sky",
    });
  }

  if (strongCount > 0) {
    signals.push({
      label: "Strong links",
      value: `${strongCount} card${strongCount === 1 ? "" : "s"} are strongly linked and should be the safest starting point for same-topic questions.`,
      tone: "emerald",
    });
  }

  const zettelkastenFocused =
    input.activeLens === "zettelkasten"
    || input.activeLens === "review_queue"
    || input.activeLens === "source_notes"
    || input.activeLens === "permanent_notes"
    || Boolean(input.zettelkastenStage);

  if (zettelkastenFocused || zettelkastenCount > Math.ceil(cards.length / 2)) {
    return {
      headline: `This slice explains a Zettelkasten path around ${context}.`,
      detail:
        "Use it to see which source notes are ready for review, which ideas can become permanent notes, and which supertags keep the branch connected to the wider study graph.",
      badge: `${zettelkastenCount} note-chain cards`,
      nextStep:
        reviewPendingCount > 0
          ? "Open the review queue or ask from this focus to turn one pending source note into a clearer permanent-note candidate."
          : "Ask from this focus, then add one adjacent source only if the branch still lacks corroboration.",
      signals: signals.slice(0, 4),
    };
  }

  return {
    headline: `This slice explains why ${context} is connected.`,
    detail:
      linkedCount > 0
        ? "Use the visible supertags, backlinks, and cross-source signals to ask a grounded follow-up instead of treating the cards as isolated summaries."
        : "The cards are retained and searchable, but the slice still needs another adjacent source before it behaves like a dependable connected-note network.",
    badge: linkedCount > 0 ? `${linkedCount} linked` : "Sparse links",
    nextStep:
      linkedCount > 0
        ? "Ask from this graph focus or open the matching Files view to inspect the retained sources behind the links."
        : "Add one lecture, reading, note, or voice memo from the same topic to strengthen the first useful links.",
    signals: signals.slice(0, 4),
  };
}
