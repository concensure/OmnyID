// @locs-version: 1.0
import type { SupertagDefinitionRecord } from "@/lib/api";
import { normalizeDashboardFeedSupertagKey } from "@/lib/dashboardFeedCardPresentation";
import type { KnowledgeCard, KnowledgeGraphBacklinkRef } from "@/lib/knowledgeGraphTypes";

const CONTEXTUAL_TAG_PREFIXES = [
  "project:",
  "area:",
  "resource:",
  "topic:",
  "course:",
  "subject:",
  "class:",
  "academic:",
] as const;

function dedupeStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0))];
}

function normalizeGraphTagKey(tag: string): string {
  const normalized = normalizeDashboardFeedSupertagKey(tag);
  if (!normalized) return "";
  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex < 0) return normalized.replace(/[\s_]+/g, "-");
  const prefix = normalized.slice(0, separatorIndex).trim();
  const rawValue = normalized.slice(separatorIndex + 1).trim();
  const slugValue = rawValue
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!prefix) return slugValue;
  return slugValue ? `${prefix}:${slugValue}` : prefix;
}

function compactGraphTagKey(tag: string): string {
  const normalized = normalizeGraphTagKey(tag);
  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex < 0) return normalized.replace(/[^a-z0-9]/g, "");
  const prefix = normalized.slice(0, separatorIndex);
  const rawValue = normalized.slice(separatorIndex + 1);
  const compactValue = rawValue.replace(/[^a-z0-9]/g, "");
  return compactValue ? `${prefix}:${compactValue}` : prefix;
}

function isContextualTag(tag: string): boolean {
  return CONTEXTUAL_TAG_PREFIXES.some((prefix) => tag.toLowerCase().startsWith(prefix));
}

export type KnowledgeGraphSupertagDefinitionIndex = {
  aliasToCanonical: Map<string, string>;
};

export function buildKnowledgeGraphSupertagDefinitionIndex(
  definitions: readonly SupertagDefinitionRecord[],
): KnowledgeGraphSupertagDefinitionIndex {
  const aliasToCanonical = new Map<string, string>();
  for (const definition of definitions) {
    const canonical = definition.tag_name.trim();
    if (!canonical) continue;
    for (const alias of [canonical, ...definition.alias_tags]) {
      const key = normalizeDashboardFeedSupertagKey(alias);
      if (key) aliasToCanonical.set(key, canonical);
    }
  }
  return { aliasToCanonical };
}

function resolveCanonicalTagLabel(
  tag: string,
  index: KnowledgeGraphSupertagDefinitionIndex,
): string | null {
  return index.aliasToCanonical.get(normalizeDashboardFeedSupertagKey(tag)) ?? null;
}

function canonicalVariantsForTag(
  tag: string,
  index: KnowledgeGraphSupertagDefinitionIndex,
): string[] {
  if (!isContextualTag(tag)) return [];
  const canonicalLabel = resolveCanonicalTagLabel(tag, index) ?? tag.trim();
  return dedupeStrings([
    canonicalLabel,
    normalizeGraphTagKey(canonicalLabel),
    compactGraphTagKey(canonicalLabel),
  ]);
}

function normalizeSharedRelationLabel(
  relationLabel: string,
  index: KnowledgeGraphSupertagDefinitionIndex,
): string {
  if (!relationLabel.startsWith("shared ")) return relationLabel;
  const rawTag = relationLabel.slice("shared ".length).trim();
  const canonical = resolveCanonicalTagLabel(rawTag, index);
  return canonical ? `shared ${canonical}` : relationLabel;
}

function dedupeBacklinks(backlinks: readonly KnowledgeGraphBacklinkRef[]): KnowledgeGraphBacklinkRef[] {
  const seen = new Set<string>();
  const deduped: KnowledgeGraphBacklinkRef[] = [];
  for (const backlink of backlinks) {
    const key = `${backlink.targetId}::${backlink.relationLabel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(backlink);
  }
  return deduped.sort((left, right) =>
    left.targetTitle.localeCompare(right.targetTitle) || left.relationLabel.localeCompare(right.relationLabel)
  );
}

export function applyKnowledgeGraphSupertagDefinitions(
  cards: readonly KnowledgeCard[],
  definitions: readonly SupertagDefinitionRecord[],
): KnowledgeCard[] {
  if (definitions.length === 0) return [...cards];
  const index = buildKnowledgeGraphSupertagDefinitionIndex(definitions);
  const clonedCards = cards.map((card) => ({
    ...card,
    canonicalSupertags: dedupeStrings([
      ...(card.canonicalSupertags ?? []),
      ...card.supertags.flatMap((tag) => canonicalVariantsForTag(tag, index)),
    ]),
    backlinks: dedupeBacklinks(
      card.backlinks.map((backlink) => ({
        ...backlink,
        relationLabel: normalizeSharedRelationLabel(backlink.relationLabel, index),
      })),
    ),
  }));

  const buckets = new Map<string, { label: string; ids: string[] }>();
  for (const card of clonedCards) {
    const seenForCard = new Set<string>();
    for (const tag of card.supertags) {
      if (!isContextualTag(tag)) continue;
      const canonicalLabel = resolveCanonicalTagLabel(tag, index);
      if (!canonicalLabel) continue;
      const canonicalKey = normalizeDashboardFeedSupertagKey(canonicalLabel);
      if (!canonicalKey || seenForCard.has(canonicalKey)) continue;
      seenForCard.add(canonicalKey);
      const bucket = buckets.get(canonicalKey) ?? { label: canonicalLabel, ids: [] };
      if (!bucket.ids.includes(card.id)) bucket.ids.push(card.id);
      buckets.set(canonicalKey, bucket);
    }
  }

  const cardById = new Map(clonedCards.map((card) => [card.id, card]));
  for (const [, bucket] of buckets) {
    if (bucket.ids.length < 2) continue;
    for (const sourceId of bucket.ids.slice(0, 5)) {
      const sourceCard = cardById.get(sourceId);
      if (!sourceCard) continue;
      for (const targetId of bucket.ids.slice(0, 5)) {
        if (sourceId === targetId) continue;
        sourceCard.backlinks = dedupeBacklinks([
          ...sourceCard.backlinks,
          {
            targetId,
            targetTitle: cardById.get(targetId)?.title ?? targetId.slice(0, 12),
            relationLabel: `shared ${bucket.label}`,
          },
        ]);
      }
    }
  }

  const clusterSizes = new Map<string, number>();
  for (const card of clonedCards) {
    for (const tag of card.canonicalSupertags ?? []) {
      clusterSizes.set(tag, (clusterSizes.get(tag) ?? 0) + 1);
    }
  }

  return clonedCards.map((card) => {
    const relatedFromClusters = Math.max(
      0,
      ...((card.canonicalSupertags ?? []).map((tag) => (clusterSizes.get(tag) ?? 1) - 1)),
    );
    return {
      ...card,
      relatedCardCount: Math.max(card.relatedCardCount ?? 0, relatedFromClusters, card.backlinks.length),
    };
  });
}
