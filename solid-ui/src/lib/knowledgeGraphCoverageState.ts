// @locs-version: 1.0
import type { KnowledgeCard } from "./knowledgeGraphTypes";
import type { KnowledgeGraphLens } from "./knowledgeGraphViewState";

export type KnowledgeGraphCoverageCluster = {
  label: string;
  count: number;
  reinforcedCount: number;
  corroboratedCount: number;
  filterTag: string | null;
  recommended: boolean;
};

export type KnowledgeGraphCoverageState = {
  grade: "sparse" | "developing" | "dense";
  headline: string;
  detail: string;
  badge: string;
  sourceMixLabel: string;
  noteProgressLabel: string;
  recommendedTag: string | null;
  clusters: KnowledgeGraphCoverageCluster[];
};

function lensLabel(lens: KnowledgeGraphLens): string {
  if (lens === "linked_ideas") return "linked ideas";
  if (lens === "study_materials") return "study materials";
  if (lens === "source_notes") return "source notes";
  if (lens === "review_queue") return "review queue";
  if (lens === "permanent_notes") return "permanent notes";
  if (lens === "connected_notes") return "connected notes";
  if (lens === "zettelkasten") return "zettelkasten";
  return "graph";
}

function isVisibleTag(tag: string): boolean {
  const value = tag.trim().toLowerCase();
  if (!value) return false;
  return ![
    "knowledge:",
    "knowledge_mode:",
    "retention:",
    "pipeline:",
    "extraction:",
    "source:",
    "attachment:",
  ].some((prefix) => value.startsWith(prefix));
}

function tagLabel(tag: string): string {
  return tag.replace(/^topic:/i, "").replace(/^concept:/i, "").trim() || tag;
}

export function buildKnowledgeGraphCoverageState(input: {
  cards: readonly KnowledgeCard[];
  activeLens: KnowledgeGraphLens;
  activeTag: string | null;
}): KnowledgeGraphCoverageState | null {
  if (input.cards.length === 0) return null;

  const clusterMap = new Map<string, KnowledgeGraphCoverageCluster>();
  for (const card of input.cards) {
    const canonical = (card.canonicalSupertags ?? []).filter(isVisibleTag);
    const visible = card.supertags.filter(isVisibleTag);
    const tags = canonical.length > 0 ? canonical : visible;
    const filterTags = new Set(visible);
    for (const tag of tags) {
      const existing = clusterMap.get(tag) ?? {
        label: tagLabel(tag),
        count: 0,
        reinforcedCount: 0,
        corroboratedCount: 0,
        filterTag: filterTags.has(tag) ? tag : [...filterTags][0] ?? null,
        recommended: false,
      };
      existing.count += 1;
      if (card.connectionStrength === "high" || card.connectionStrength === "medium") {
        existing.reinforcedCount += 1;
      }
      if ((card.corroboratedSourceCount ?? 0) >= 2) {
        existing.corroboratedCount += 1;
      }
      if (!existing.filterTag && filterTags.size > 0) {
        existing.filterTag = [...filterTags][0] ?? null;
      }
      clusterMap.set(tag, existing);
    }
  }

  const clusters = [...clusterMap.entries()]
    .map(([tag, cluster]) => ({ ...cluster, filterTag: cluster.filterTag ?? tag }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      if (right.reinforcedCount !== left.reinforcedCount) return right.reinforcedCount - left.reinforcedCount;
      if (right.corroboratedCount !== left.corroboratedCount) return right.corroboratedCount - left.corroboratedCount;
      return left.label.localeCompare(right.label);
    })
    .slice(0, 4);

  const recommendedCluster = clusters[0] ?? null;
  if (recommendedCluster) recommendedCluster.recommended = true;

  const mixedSourceCount = input.cards.filter((card) => (card.sourceDiversityCount ?? 0) >= 2).length;
  const permanentCount = input.cards.filter((card) => card.permanentNote).length;
  const reviewCount = input.cards.filter((card) => card.reviewPending).length;
  const denseClusterCount = clusters.filter((cluster) => cluster.count >= 3 && cluster.reinforcedCount >= 2).length;

  const sourceMixLabel =
    mixedSourceCount > 0
      ? `${mixedSourceCount} card${mixedSourceCount === 1 ? "" : "s"} already connect across different retained source types.`
      : "Source mix is still narrow, so one more reading, lecture, or note would strengthen this focus faster than adding unrelated material.";

  const noteProgressLabel =
    permanentCount > 0
      ? `${permanentCount} permanent note${permanentCount === 1 ? "" : "s"} already exist in this focus, so the graph is turning raw uploads into durable study knowledge.`
      : reviewCount > 0
        ? `${reviewCount} note${reviewCount === 1 ? "" : "s"} still sit in review, so promotion is lagging behind capture.`
        : "This focus has not yet converted into permanent-note depth.";

  if (denseClusterCount > 0) {
    return {
      grade: "dense",
      headline: "Supertag coverage is dense enough to anchor revision threads.",
      detail: recommendedCluster
        ? `The strongest cluster inside this ${lensLabel(input.activeLens)} focus is ${recommendedCluster.label}, which already has repeated cards and reinforced links.`
        : `This ${lensLabel(input.activeLens)} focus already contains dense supertag overlap.`,
      badge: "Dense clusters",
      sourceMixLabel,
      noteProgressLabel,
      recommendedTag: recommendedCluster?.filterTag ?? null,
      clusters,
    };
  }

  if (clusters.length > 0) {
    return {
      grade: "developing",
      headline: "Supertag clusters are forming, but most are still shallow.",
      detail: recommendedCluster
        ? `The clearest emerging thread is ${recommendedCluster.label}, but it still needs more reinforced overlap before it behaves like a dependable revision path.`
        : `This ${lensLabel(input.activeLens)} focus has early cluster signals but not enough density yet.`,
      badge: "Developing clusters",
      sourceMixLabel,
      noteProgressLabel,
      recommendedTag: recommendedCluster?.filterTag ?? null,
      clusters,
    };
  }

  return {
    grade: "sparse",
    headline: "This focus is still too sparse for supertag-driven navigation.",
    detail: `Visible cards inside this ${lensLabel(input.activeLens)} focus do not yet repeat enough concepts to form a clear study thread.`,
    badge: "Sparse clusters",
    sourceMixLabel,
    noteProgressLabel,
    recommendedTag: null,
    clusters: [],
  };
}
