// @locs-version: 1.0
import { weddingFacetById } from "@/lib/weddingFacetVocabularyState";
import type { WeddingPreferenceFacet, WeddingPreferenceProfile } from "@/lib/weddingPreferenceProfileState";

export type WeddingPreferenceSignalReason = "too_big" | "not_our_style" | "too_far" | "too_expensive" | "other" | "contacted" | "restored";

export type WeddingPreferenceSignal = {
  id: string;
  weddingPlanId: string;
  vendorId: string;
  comparisonArtifactId: string;
  /** Profile version for which a rejection keeps a vendor out of the deck. */
  profileFingerprint: string | null;
  reason: WeddingPreferenceSignalReason;
  vendorFacetIds: string[];
  createdAt: string;
};

export type WeddingPreferenceSignalResult = {
  profile: WeddingPreferenceProfile;
  derivedFromSignalIds: string[];
  activeSignalIds: string[];
  confirmationPrompt: string | null;
  proposedConstraint: "tighter_location" | "tighter_budget" | null;
};

const DECAY_DAYS = 90;

function active(signal: WeddingPreferenceSignal, now: Date): boolean {
  const timestamp = Date.parse(signal.createdAt);
  const age = now.getTime() - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age <= DECAY_DAYS * 24 * 60 * 60 * 1000;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/** Deterministic, plan-scoped feedback application. It never creates a must-have. */
export function weddingPreferenceSignalResult(input: {
  profile: WeddingPreferenceProfile;
  signals: readonly WeddingPreferenceSignal[];
  weddingPlanId: string;
  now?: Date;
}): WeddingPreferenceSignalResult {
  const now = input.now ?? new Date();
  const signals = input.signals
    .filter((signal) => signal.weddingPlanId === input.weddingPlanId && active(signal, now))
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id));
  const existing = new Set(input.profile.facets.map((facet) => facet.facetId));
  const facets: WeddingPreferenceFacet[] = input.profile.facets.map((facet) => ({ ...facet }));
  const derivedFromSignalIds: string[] = [];
  for (const signal of signals) {
    if (signal.reason !== "not_our_style") continue;
    let contributed = false;
    for (const facetId of unique(signal.vendorFacetIds)) {
      if (existing.has(facetId) || !weddingFacetById(facetId)) continue;
      existing.add(facetId);
      facets.push({
        facetId,
        weight: "nice",
        polarity: -1,
        anchor: "Not our style",
        anchorSource: "feedback",
        confidence: 0.5,
        authority: "feedback",
      });
      contributed = true;
    }
    if (contributed) derivedFromSignalIds.push(signal.id);
  }
  for (const signal of signals.filter((item) => item.reason === "contacted")) {
    const vendorFacets = new Set(unique(signal.vendorFacetIds));
    for (const facet of facets) if (vendorFacets.has(facet.facetId)) facet.confidence = Math.min(1, facet.confidence + 0.25);
  }
  const tooBigVendorCount = new Set(signals.filter((signal) => signal.reason === "too_big").map((signal) => signal.vendorId)).size;
  const proposedConstraint = signals.some((signal) => signal.reason === "too_far")
    ? "tighter_location"
    : signals.some((signal) => signal.reason === "too_expensive") ? "tighter_budget" : null;
  return {
    profile: { facets, unmapped: [...input.profile.unmapped] },
    derivedFromSignalIds: unique(derivedFromSignalIds),
    activeSignalIds: unique(signals.map((signal) => signal.id)),
    confirmationPrompt: tooBigVendorCount >= 3
      ? "You've passed on 3 large venues. Make 'intimate' a must-have?"
      : null,
    proposedConstraint,
  };
}
