// @locs-version: 1.0
import type { KnowledgeGraphLens } from "@/lib/knowledgeGraphViewState";

export type KnowledgeGraphTrustSignal = {
  label: string;
  value: string;
  tone: "sky" | "emerald" | "violet" | "amber";
};

export type KnowledgeGraphTrustState = {
  grade: "fragile" | "developing" | "trusted";
  headline: string;
  detail: string;
  badge: string;
  signals: KnowledgeGraphTrustSignal[];
};

function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

function lensLabel(lens: KnowledgeGraphLens): string {
  if (lens === "linked_ideas") return "Linked ideas";
  if (lens === "study_materials") return "Study materials";
  if (lens === "source_notes") return "Source notes";
  if (lens === "review_queue") return "Review queue";
  if (lens === "permanent_notes") return "Permanent notes";
  if (lens === "connected_notes") return "Connected notes";
  if (lens === "zettelkasten") return "Zettelkasten";
  return "Current graph";
}

export function buildKnowledgeGraphTrustState(input: {
  visibleCount: number;
  linkedCount: number;
  strongCount: number;
  mediumCount: number;
  topicalDenseCount: number;
  corroboratedCount: number;
  diverseSourceCount: number;
  contradictionCount: number;
  activeLens: KnowledgeGraphLens;
  activeTag: string | null;
  courseTag: string | null;
  weekTag: string | null;
}): KnowledgeGraphTrustState | null {
  if (input.visibleCount === 0) return null;

  const reinforcedCount = input.strongCount + input.mediumCount;
  const anchorLabel = input.courseTag?.trim() || input.weekTag?.trim() || input.activeTag?.trim() || lensLabel(input.activeLens);
  const signals: KnowledgeGraphTrustSignal[] = [];

  if (input.corroboratedCount > 0) {
    signals.push({
      label: "Corroborated cards",
      value: `${plural(input.corroboratedCount, "card")} in this focus draw on at least two supporting sources or source threads, which makes retrieval more dependable than single-note recall.`,
      tone: "emerald",
    });
  } else {
    signals.push({
      label: "Corroboration gap",
      value: "Most visible cards still depend on one source at a time. Add one adjacent lecture, reading, or note before trusting this slice as a strong revision anchor.",
      tone: "amber",
    });
  }

  if (input.diverseSourceCount > 0) {
    signals.push({
      label: "Source diversity",
      value: `${plural(input.diverseSourceCount, "card")} already connect across different retained source types, which is stronger for revision than repeating only one lecture or one note format.`,
      tone: "violet",
    });
  } else {
    signals.push({
      label: "Source diversity",
      value: `This focus is still narrow in source mix. Staying inside ${anchorLabel} but adding a different source type should improve trust quickly.`,
      tone: "sky",
    });
  }

  if (input.topicalDenseCount > 0 || input.linkedCount > 0) {
    const overlapCount = Math.max(input.topicalDenseCount, input.linkedCount);
    signals.push({
      label: "Usable overlap",
      value: `${plural(overlapCount, "card")} already sit inside visible overlap, so this focus can be used to compare ideas instead of only storing them.`,
      tone: reinforcedCount > 0 ? "emerald" : "sky",
    });
  }

  if (input.contradictionCount > 0) {
    signals.push({
      label: "Tension worth reviewing",
      value: `${plural(input.contradictionCount, "card")} contain contradiction or challenge links. That is useful for exam revision because it surfaces disagreement instead of hiding it.`,
      tone: "amber",
    });
  }

  if (
    reinforcedCount >= Math.ceil(input.visibleCount / 2)
    && input.corroboratedCount >= Math.ceil(input.visibleCount / 3)
    && (input.diverseSourceCount > 0 || input.topicalDenseCount >= Math.ceil(input.visibleCount / 3))
  ) {
    return {
      grade: "trusted",
      headline: "This graph focus is trustworthy enough for fast revision.",
      detail: `A healthy share of ${lensLabel(input.activeLens).toLowerCase()} cards are reinforced by overlap, corroboration, or mixed source evidence, so this slice should hold up better than memory or folder search under pressure.`,
      badge: "Trusted focus",
      signals: signals.slice(0, 4),
    };
  }

  if (reinforcedCount > 0 || input.corroboratedCount > 0 || input.topicalDenseCount > 0) {
    return {
      grade: "developing",
      headline: "This graph focus is useful, but verify the edges that matter most.",
      detail: `There is enough structure inside ${anchorLabel} to start revising, but the graph is not yet dense enough to trust every visible connection equally.`,
      badge: "Developing trust",
      signals: signals.slice(0, 4),
    };
  }

  return {
    grade: "fragile",
    headline: "This graph focus is still too fragile to rely on heavily.",
    detail: `Cards are visible, but ${anchorLabel} still lacks enough corroboration or overlap to act like a dependable study network. Treat this as a prompt to add one more related source, not as final revision truth.`,
    badge: "Fragile focus",
    signals: signals.slice(0, 4),
  };
}
