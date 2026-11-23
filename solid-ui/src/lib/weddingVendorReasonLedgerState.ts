// @locs-version: 1.0
import type { WeddingPreferenceProfile } from "@/lib/weddingPreferenceProfileState";
import type { WeddingVendorFacetMatch } from "@/lib/weddingVendorFacetMatchState";
import type { WeddingVendorRankingRequirements, WeddingVendorRankingSource, WeddingVendorUtilityComponent } from "@/lib/weddingVendorRankingState";

export type WeddingVendorReason = {
  id: string;
  anchor: string | null;
  anchorSource: "priority" | "atmosphere" | "location" | "budget" | "guests" | "inspiration" | "feedback" | "lead_magnet" | null;
  polarity: "pro" | "con" | "unknown";
  strength: "decisive" | "supporting";
  claim: string;
  evidence: Array<{ attributeKey: string; value: unknown; authority: string; sourceUrl: string | null; retrievedAt: string | null }>;
  verifyQuestion: string | null;
  weight: number;
};

export type WeddingVendorReasonLedgerDebug = { droppedUnsupportedReasons: number };
export type WeddingVendorReasonLedgerResult = { reasons: WeddingVendorReason[]; debug: WeddingVendorReasonLedgerDebug };

const weights = { must: 3, strong: 2, nice: 1 } as const;
const COMPONENT_ATTRIBUTE_KEYS: Record<string, readonly string[]> = {
  cost: ["price_estimate_total_aud", "venue_hire_fee_aud", "price_per_head_aud", "minimum_spend_aud"],
  capacity: ["capacity_seated_max", "capacity_standing_max"],
  quality: ["rating_google", "review_count_google"],
};

function componentAnchor(id: string, requirements: WeddingVendorRankingRequirements): { anchor: string | null; anchorSource: WeddingVendorReason["anchorSource"]; question: string } {
  if (id === "location") return { anchor: requirements.location?.trim() || "Location", anchorSource: "location", question: "How close is the venue to our preferred location?" };
  if (id === "cost") return { anchor: requirements.budgetComfort?.trim() || "Budget", anchorSource: "budget", question: "What is the total price and minimum spend for our date?" };
  if (id === "capacity") return { anchor: requirements.guestCount?.trim() ? `${requirements.guestCount.trim()} guests` : "Guest count", anchorSource: "guests", question: `What is the seated capacity of your smallest private room?${requirements.guestCount?.trim() ? ` We expect about ${requirements.guestCount.trim()} guests.` : ""}` };
  return { anchor: null, anchorSource: null, question: "Could you confirm your current reviews and reputation details?" };
}

function componentEvidence(source: WeddingVendorRankingSource, component: WeddingVendorUtilityComponent): WeddingVendorReason["evidence"] {
  if (component.id === "location" && source.address?.trim()) return [{ attributeKey: "address", value: source.address, authority: component.authority ?? "directory", sourceUrl: source.url || null, retrievedAt: component.retrievedAt }];
  for (const key of COMPONENT_ATTRIBUTE_KEYS[component.id] ?? []) {
    const attribute = source.attributes?.[key];
    if (attribute?.value !== null && attribute?.value !== undefined) return [{ attributeKey: key, value: attribute.value, authority: attribute.authority ?? component.authority ?? "unknown", sourceUrl: (attribute.source_url ?? source.url) || null, retrievedAt: attribute.retrieved_at ?? component.retrievedAt }];
  }
  if (component.id === "quality" && source.rating !== null && source.rating !== undefined) return [{ attributeKey: "rating", value: source.rating, authority: component.authority ?? "independent_aggregate", sourceUrl: source.url || null, retrievedAt: component.retrievedAt }];
  return [];
}

function validate(reasons: WeddingVendorReason[]): WeddingVendorReasonLedgerResult {
  let droppedUnsupportedReasons = 0;
  const supported = reasons.filter((reason) => {
    const valid = reason.polarity === "unknown" || reason.evidence.length > 0;
    if (!valid) droppedUnsupportedReasons += 1;
    return valid;
  });
  return { reasons: supported.sort((left, right) => right.weight - left.weight || left.id.localeCompare(right.id)), debug: { droppedUnsupportedReasons } };
}

function strongestFacetReason(reasons: WeddingVendorReason[]): WeddingVendorReason[] {
  const outcomeRank: Record<WeddingVendorReason["polarity"], number> = { pro: 3, con: 2, unknown: 1 };
  const byAnchor = new Map<string, WeddingVendorReason>();
  for (const reason of reasons) {
    const key = `${reason.anchorSource ?? ""}:${reason.anchor ?? ""}`;
    const current = byAnchor.get(key);
    if (!current || outcomeRank[reason.polarity] > outcomeRank[current.polarity] || outcomeRank[reason.polarity] === outcomeRank[current.polarity] && (reason.strength === "decisive" ? 1 : 0) > (current.strength === "decisive" ? 1 : 0) || outcomeRank[reason.polarity] === outcomeRank[current.polarity] && reason.strength === current.strength && reason.id.localeCompare(current.id) < 0) byAnchor.set(key, reason);
  }
  return [...byAnchor.values()];
}

/** Builds the policy-v2 evidence ledger; it never creates a positive or negative claim without provenance. */
export function buildWeddingVendorReasonLedger(input: {
  source: WeddingVendorRankingSource;
  components: readonly WeddingVendorUtilityComponent[];
  profile: WeddingPreferenceProfile;
  requirements: WeddingVendorRankingRequirements;
  facetMatches: readonly WeddingVendorFacetMatch[];
}): WeddingVendorReasonLedgerResult {
  const reasons: WeddingVendorReason[] = [];
  for (const [index, match] of input.facetMatches.entries()) {
    const preference = input.profile.facets[index];
    if (!preference) continue;
    const strength = match.confidence >= 0.7 ? "decisive" as const : "supporting" as const;
    const evidence = match.evidence.map((item) => ({ ...item, authority: item.authority ?? "unknown", retrievedAt: null }));
    const anchorSource = preference.anchorSource === "preference" ? "atmosphere" : preference.anchorSource;
    if (match.outcome === "match" || match.outcome === "partial") reasons.push({ id: `facet:${match.facetId}`, anchor: match.anchor, anchorSource, polarity: "pro", strength, claim: `${match.anchor} — ${match.outcome === "partial" || strength === "supporting" ? "likely: " : ""}${match.facetId.replace(/^[^.]+\./, "").replace(/_/g, " ")}`, evidence, verifyQuestion: null, weight: weights[preference.weight] });
    else if (match.outcome === "conflict") reasons.push({ id: `facet:${match.facetId}`, anchor: match.anchor, anchorSource, polarity: "con", strength, claim: `${match.anchor} — available evidence conflicts with this preference`, evidence, verifyQuestion: null, weight: weights[preference.weight] });
    else reasons.push({ id: `facet:${match.facetId}`, anchor: match.anchor, anchorSource, polarity: "unknown", strength: "supporting", claim: `${match.anchor} — not confirmed`, evidence: [], verifyQuestion: `Could you confirm how ${match.facetId.replace(/^[^.]+\./, "").replace(/_/g, " ")} this venue feels?`, weight: weights[preference.weight] });
  }
  for (const component of input.components.filter((item) => ["location", "cost", "capacity", "quality"].includes(item.id))) {
    const { anchor, anchorSource, question } = componentAnchor(component.id, input.requirements);
    const evidence = component.known ? componentEvidence(input.source, component) : [];
    const strength = component.confidence >= 0.7 ? "decisive" as const : "supporting" as const;
    const polarity = !component.known || component.value > 0.4 && component.value < 0.6 ? "unknown" as const : component.value >= 0.6 ? "pro" as const : "con" as const;
    reasons.push({
      id: component.id,
      anchor,
      anchorSource,
      polarity,
      strength,
      claim: polarity === "unknown" ? `${anchor ?? component.label} — not confirmed` : `${anchor ?? component.label} — ${polarity === "pro" ? "evidence supports this" : "available evidence may not fit"}`,
      evidence,
      verifyQuestion: polarity === "unknown" ? question : null,
      weight: Math.max(1, Math.round(component.weight * 10)),
    });
  }
  const facetReasons = reasons.filter((reason) => reason.id.startsWith("facet:"));
  const componentReasons = reasons.filter((reason) => !reason.id.startsWith("facet:"));
  return validate([...strongestFacetReason(facetReasons), ...componentReasons]);
}
