// @locs-version: 1.0
import type { WeddingExperienceModelState } from "@/lib/weddingExperienceModelState";
import type { WeddingVendorRankingRequirements } from "@/lib/weddingVendorRankingState";
import { weddingFacetsForPhrase } from "@/lib/weddingFacetVocabularyState";

export type WeddingPreferenceFacetWeight = "must" | "strong" | "nice";
export type WeddingPreferenceFacetAuthority = "user" | "deterministic" | "interpreter" | "feedback";
export type WeddingPreferenceFacet = {
  facetId: string;
  weight: WeddingPreferenceFacetWeight;
  polarity: 1 | -1;
  anchor: string;
  anchorSource: "priority" | "atmosphere" | "preference" | "inspiration" | "feedback";
  confidence: number;
  authority: WeddingPreferenceFacetAuthority;
};
export type WeddingPreferenceProfile = { facets: WeddingPreferenceFacet[]; unmapped: string[] };

function clean(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
const rank: Record<WeddingPreferenceFacetWeight, number> = { nice: 1, strong: 2, must: 3 };
function add(profile: WeddingPreferenceProfile, anchor: string, weight: WeddingPreferenceFacetWeight, anchorSource: WeddingPreferenceFacet["anchorSource"]) {
  const facets = weddingFacetsForPhrase(anchor);
  if (facets.length === 0) { if (anchor) profile.unmapped.push(anchor); return; }
  for (const facet of facets) profile.facets.push({ facetId: facet.id, weight, polarity: 1, anchor, anchorSource, confidence: 0.7, authority: "deterministic" });
}

/** Maps only explicit couple input. It does not infer a preference from guest count or location. */
export function buildDeterministicPreferenceProfile(requirements: WeddingVendorRankingRequirements, experienceModel?: Pick<WeddingExperienceModelState, "traits"> | null): WeddingPreferenceProfile {
  const profile: WeddingPreferenceProfile = { facets: [], unmapped: [] };
  for (const priority of requirements.topPriorities ?? []) add(profile, clean(priority), "strong", "priority");
  for (const phrase of [clean(requirements.atmosphereDescription), clean(requirements.preferences)]) if (phrase) add(profile, phrase, "nice", phrase === clean(requirements.atmosphereDescription) ? "atmosphere" : "preference");
  for (const trait of experienceModel?.traits ?? []) add(profile, trait.label, "nice", "inspiration");
  return mergePreferenceProfile(profile, null);
}

/** User-confirmed profile entries win; otherwise retain the strongest and most certain duplicate. */
export function mergePreferenceProfile(base: WeddingPreferenceProfile, override: WeddingPreferenceProfile | null | undefined): WeddingPreferenceProfile {
  const chosen = new Map<string, WeddingPreferenceFacet>();
  for (const facet of [...base.facets, ...(override?.facets ?? [])]) {
    const current = chosen.get(facet.facetId);
    const userWins = facet.authority === "user" && current?.authority !== "user";
    if (!current || userWins || (current.authority !== "user" && (rank[facet.weight] > rank[current.weight] || (rank[facet.weight] === rank[current.weight] && facet.confidence > current.confidence)))) chosen.set(facet.facetId, { ...facet });
  }
  return { facets: [...chosen.values()].sort((left, right) => right.weight.localeCompare(left.weight) || left.facetId.localeCompare(right.facetId)), unmapped: [...new Set([...base.unmapped, ...(override?.unmapped ?? [])].filter(Boolean))] };
}
