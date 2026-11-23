// @locs-version: 1.0
// Widening is deliberately an in-memory re-rank. It must never mutate a saved profile.
import { rankWeddingVendorCandidates, type WeddingVendorRankedCandidate, type WeddingVendorRankingRequirements, type WeddingVendorRankingResult, type WeddingVendorRankingSource } from "@/lib/weddingVendorRankingState";
import type { WeddingPreferenceProfile } from "@/lib/weddingPreferenceProfileState";

export type WeddingVendorWidenActionKind = "increase_distance" | "allow_standing" | "include_unknown_price" | "must_to_strong";
export type WeddingVendorWidenAction = { id: WeddingVendorWidenActionKind; label: string; detail: string };
export type WeddingVendorNearMiss = { id: string; title: string; constraint: string };

function has(input: string | null | undefined, expression: RegExp): boolean { return expression.test(input ?? ""); }

export function weddingVendorNearMisses(result: WeddingVendorRankingResult): WeddingVendorNearMiss[] {
  return result.excluded.slice(0, 2).map((candidate) => ({ id: candidate.id, title: candidate.title, constraint: candidate.exclusionReason }));
}

/** Only advertise one relaxation per binding constraint; each is a new, non-persisted query input. */
export function weddingVendorWidenActions(result: WeddingVendorRankingResult, requirements: WeddingVendorRankingRequirements, profile?: WeddingPreferenceProfile | null): WeddingVendorWidenAction[] {
  if (result.bookable.length + result.verify.length + result.booked.length > 2) return [];
  const constraints = result.excluded.map((candidate) => candidate.exclusionReason).join(" ");
  const actions: WeddingVendorWidenAction[] = [];
  if (has(constraints, /capacity|seated/i)) actions.push({ id: "allow_standing", label: "Allow cocktail-style reception", detail: "Re-rank using standing capacity; this does not change your plan." });
  if (has(constraints, /price|budget/i) || requirements.includeUnknownPrice !== true) actions.push({ id: "include_unknown_price", label: "Show venues without price on record", detail: "Include unknown-price venues in a temporary re-rank." });
  if (has(constraints, /must-have|must have/i) || profile?.facets.some((facet) => facet.weight === "must")) actions.push({ id: "must_to_strong", label: "Treat a must-have as strong", detail: "Temporarily relax one must-have without changing your saved profile." });
  if (requirements.maxDistanceKm !== null && requirements.maxDistanceKm !== undefined) actions.push({ id: "increase_distance", label: `Include venues up to ${requirements.maxDistanceKm + 15} km away`, detail: "Temporarily extend the search radius by 15 km." });
  return actions.slice(0, 4);
}

export function rerankWeddingVendorWithWiden(input: {
  action: WeddingVendorWidenActionKind;
  sources: readonly WeddingVendorRankingSource[];
  requirements: WeddingVendorRankingRequirements;
  preferenceProfile?: WeddingPreferenceProfile | null;
  rankingPolicy?: "1" | "2";
  now?: Date;
}): { requirements: WeddingVendorRankingRequirements; preferenceProfile: WeddingPreferenceProfile | null | undefined; result: WeddingVendorRankingResult } {
  const requirements: WeddingVendorRankingRequirements = { ...input.requirements };
  let preferenceProfile = input.preferenceProfile;
  if (input.action === "allow_standing") requirements.preferences = `${requirements.preferences ?? ""} cocktail-style standing reception`.trim();
  if (input.action === "include_unknown_price") requirements.includeUnknownPrice = true;
  if (input.action === "increase_distance") requirements.maxDistanceKm = (requirements.maxDistanceKm ?? 15) + 15;
  if (input.action === "must_to_strong" && preferenceProfile) preferenceProfile = { ...preferenceProfile, facets: preferenceProfile.facets.map((facet) => facet.weight === "must" ? { ...facet, weight: "strong" } : { ...facet }) };
  return { requirements, preferenceProfile, result: rankWeddingVendorCandidates({ sources: input.sources, requirements, preferenceProfile, rankingPolicy: input.rankingPolicy, now: input.now }) };
}
