// @locs-version: 1.0
import type { WeddingPreferenceProfile } from "@/lib/weddingPreferenceProfileState";
import type { WeddingVendorDerivedFacet } from "@/lib/weddingVendorFacetDerivationState";
import { weddingFacetConflicts } from "@/lib/weddingFacetVocabularyState";

export type WeddingVendorFacetMatchOutcome = "match" | "partial" | "conflict" | "unknown";
export type WeddingVendorFacetMatch = { facetId: string; anchor: string; outcome: WeddingVendorFacetMatchOutcome; confidence: number; evidence: WeddingVendorDerivedFacet["evidence"] };
const weight = { must: 3, strong: 2, nice: 1 } as const;

export function matchWeddingVendorFacets(profile: WeddingPreferenceProfile, vendorFacets: readonly WeddingVendorDerivedFacet[]) {
  const vendor = new Map(vendorFacets.map((facet) => [facet.facetId, facet]));
  const perFacet: WeddingVendorFacetMatch[] = profile.facets.map((preference) => {
    const direct = vendor.get(preference.facetId);
    if (direct) return { facetId: preference.facetId, anchor: preference.anchor, outcome: "match", confidence: direct.confidence, evidence: direct.evidence };
    const conflict = weddingFacetConflicts(preference.facetId).map((facet) => vendor.get(facet.id)).find(Boolean);
    if (conflict) return { facetId: preference.facetId, anchor: preference.anchor, outcome: "conflict", confidence: conflict.confidence, evidence: conflict.evidence };
    return { facetId: preference.facetId, anchor: preference.anchor, outcome: "unknown", confidence: 0, evidence: [] };
  });
  const total = profile.facets.reduce((sum, facet) => sum + weight[facet.weight], 0);
  const value = total === 0 ? null : perFacet.reduce((sum, match, index) => sum + weight[profile.facets[index]!.weight] * (match.outcome === "match" ? 1 : match.outcome === "partial" || match.outcome === "unknown" ? 0.5 : 0), 0) / total;
  const confidence = total === 0 ? 0 : perFacet.reduce((sum, match, index) => sum + weight[profile.facets[index]!.weight] * match.confidence, 0) / total;
  return { value, confidence, perFacet };
}
