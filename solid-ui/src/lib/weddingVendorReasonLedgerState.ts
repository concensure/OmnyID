// @locs-version: 1.0
import type { WeddingPreferenceProfile } from "@/lib/weddingPreferenceProfileState";
import type { WeddingVendorFacetMatch } from "@/lib/weddingVendorFacetMatchState";

export type WeddingVendorReason = {
  id: string;
  anchor: string | null;
  anchorSource: "priority" | "atmosphere" | "location" | "budget" | "guests" | "inspiration" | "feedback" | null;
  polarity: "pro" | "con" | "unknown";
  strength: "decisive" | "supporting";
  claim: string;
  evidence: Array<{ attributeKey: string; value: unknown; authority: string | null; sourceUrl: string | null; retrievedAt: string | null }>;
  verifyQuestion: string | null;
  weight: number;
};

const weights = { must: 3, strong: 2, nice: 1 } as const;

/** One ledger row per couple anchor. Pros and cons without evidence are never emitted. */
export function buildWeddingVendorFacetReasonLedger(profile: WeddingPreferenceProfile, matches: readonly WeddingVendorFacetMatch[]): WeddingVendorReason[] {
  const reasons: WeddingVendorReason[] = [];
  for (const [index, match] of matches.entries()) {
    const preference = profile.facets[index];
    if (!preference) continue;
    const strength = match.confidence >= 0.7 ? "decisive" as const : "supporting" as const;
    const evidence = match.evidence.map((item) => ({ ...item, retrievedAt: null }));
    const source = preference.anchorSource === "preference" ? "atmosphere" : preference.anchorSource;
    if (match.outcome === "match" && evidence.length) reasons.push({ id: `facet:${match.facetId}`, anchor: match.anchor, anchorSource: source, polarity: "pro", strength, claim: `${match.anchor} — ${strength === "supporting" ? "likely: " : ""}${match.facetId.replace(/^[^.]+\./, "").replace(/_/g, " ")}`, evidence, verifyQuestion: null, weight: weights[preference.weight] });
    else if (match.outcome === "conflict" && evidence.length) reasons.push({ id: `facet:${match.facetId}`, anchor: match.anchor, anchorSource: source, polarity: "con", strength, claim: `${match.anchor} — available evidence conflicts with this preference`, evidence, verifyQuestion: null, weight: weights[preference.weight] });
    else reasons.push({ id: `facet:${match.facetId}`, anchor: match.anchor, anchorSource: source, polarity: "unknown", strength: "supporting", claim: `${match.anchor} — not confirmed`, evidence: [], verifyQuestion: `Could you confirm how ${match.facetId.replace(/^[^.]+\./, "").replace(/_/g, " ")} this venue feels?`, weight: weights[preference.weight] });
  }
  return reasons.sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id));
}
