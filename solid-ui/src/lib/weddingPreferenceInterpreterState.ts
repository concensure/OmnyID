// @locs-version: 1.0
// Client-side, fail-soft orchestration around the server's constrained interpreter.
import { apiFetch } from "@/lib/api";
import type { WeddingPreferenceFacet, WeddingPreferenceProfile, WeddingPreferenceFacetWeight } from "@/lib/weddingPreferenceProfileState";
import type { WeddingVendorRankingRequirements } from "@/lib/weddingVendorRankingState";
import { buildDeterministicPreferenceProfile, mergePreferenceProfile } from "@/lib/weddingPreferenceProfileState";
import { WEDDING_FACET_VOCABULARY_VERSION, weddingFacetById, weddingFacetsForPhrase } from "@/lib/weddingFacetVocabularyState";
import { weddingAccountScopedStorageKey } from "@/lib/weddingLocalAccountScope";

export const WEDDING_PREFERENCE_INTERPRETER_CACHE_KEY = "omnyid.wedding-preference-interpreter.v1";

export type WeddingPreferenceInterpreterFacet = {
  id: string;
  weight: WeddingPreferenceFacetWeight;
  anchor: string;
  reading: string;
};
export type WeddingPreferenceInterpreterResponse = {
  status: "interpreted" | "fallback";
  facets: WeddingPreferenceInterpreterFacet[];
  hard_constraints?: { key: string; anchor: string }[];
  tradeoffs?: { prefer: string; over: string; anchor: string }[];
  unmapped?: string[];
  clarifying_question?: string | null;
  model?: string | null;
};
export type WeddingPreferenceInterpreterCacheEntry = {
  fingerprint: string;
  vocabularyVersion: string;
  response: WeddingPreferenceInterpreterResponse;
};

function clean(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function phraseInputs(requirements: WeddingVendorRankingRequirements): string[] {
  return [
    ...(requirements.topPriorities ?? []).map(clean),
    clean(requirements.atmosphereDescription),
    clean(requirements.preferences),
  ].filter(Boolean);
}

/** Invoke only when the deterministic map did not understand a phrase or is ambiguous. */
export function shouldInterpretWeddingPreferenceProfile(requirements: WeddingVendorRankingRequirements): boolean {
  const deterministic = buildDeterministicPreferenceProfile(requirements);
  return deterministic.unmapped.length > 0 || phraseInputs(requirements).some((phrase) => weddingFacetsForPhrase(phrase).length > 2);
}

/** Stable cache key includes the vocabulary, because a vocab change can change an interpretation. */
export function weddingPreferenceInterpreterFingerprint(input: {
  weddingPlanId: string;
  requirements: WeddingVendorRankingRequirements;
  vocabularyVersion?: string | null;
}): string {
  const material = [
    clean(input.weddingPlanId),
    input.vocabularyVersion ?? WEDDING_FACET_VOCABULARY_VERSION,
    ...phraseInputs(input.requirements),
    clean(input.requirements.guestCount),
  ].map((item) => item.toLowerCase().replace(/\s+/g, " ")).join("|");
  let hash = 2166136261;
  for (const character of material) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return `wedding_preference:${(hash >>> 0).toString(36)}`;
}

function validInterpreterFacet(value: WeddingPreferenceInterpreterFacet): WeddingPreferenceFacet | null {
  const facetId = clean(value.id);
  const anchor = clean(value.anchor);
  const reading = clean(value.reading);
  if (!weddingFacetById(facetId) || !anchor || !reading || !["must", "strong", "nice"].includes(value.weight)) return null;
  return { facetId, weight: value.weight, polarity: 1, anchor, anchorSource: "preference", confidence: 0.6, authority: "interpreter" };
}

/** Invalid or failed responses intentionally preserve the deterministic profile. */
export function preferenceProfileWithInterpreter(
  requirements: WeddingVendorRankingRequirements,
  response: WeddingPreferenceInterpreterResponse | null | undefined,
): WeddingPreferenceProfile {
  const deterministic = buildDeterministicPreferenceProfile(requirements);
  if (response?.status !== "interpreted") return deterministic;
  const interpreted: WeddingPreferenceProfile = {
    facets: response.facets.map(validInterpreterFacet).filter((facet): facet is WeddingPreferenceFacet => Boolean(facet)),
    unmapped: (response.unmapped ?? []).map(clean).filter(Boolean),
  };
  return mergePreferenceProfile(deterministic, interpreted);
}

export function loadWeddingPreferenceInterpreterCache(storage: Storage = localStorage): WeddingPreferenceInterpreterCacheEntry[] {
  try {
    const parsed = JSON.parse(storage.getItem(weddingAccountScopedStorageKey(WEDDING_PREFERENCE_INTERPRETER_CACHE_KEY)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((entry): entry is WeddingPreferenceInterpreterCacheEntry => Boolean(entry) && typeof entry.fingerprint === "string" && typeof entry.vocabularyVersion === "string" && entry.response && typeof entry.response === "object").slice(0, 80) : [];
  } catch { storage.removeItem(weddingAccountScopedStorageKey(WEDDING_PREFERENCE_INTERPRETER_CACHE_KEY)); return []; }
}

export function cachedWeddingPreferenceInterpretation(fingerprint: string, vocabularyVersion = WEDDING_FACET_VOCABULARY_VERSION, storage: Storage = localStorage): WeddingPreferenceInterpreterResponse | null {
  return loadWeddingPreferenceInterpreterCache(storage).find((entry) => entry.fingerprint === fingerprint && entry.vocabularyVersion === vocabularyVersion)?.response ?? null;
}

export function cacheWeddingPreferenceInterpretation(entry: WeddingPreferenceInterpreterCacheEntry, storage: Storage = localStorage): void {
  if (!clean(entry.fingerprint) || !clean(entry.vocabularyVersion)) return;
  const prior = loadWeddingPreferenceInterpreterCache(storage).filter((current) => current.fingerprint !== entry.fingerprint || current.vocabularyVersion !== entry.vocabularyVersion);
  storage.setItem(weddingAccountScopedStorageKey(WEDDING_PREFERENCE_INTERPRETER_CACHE_KEY), JSON.stringify([entry, ...prior].slice(0, 80)));
}

/** Intended for the intake-save owner. A failed request is intentionally indistinguishable from no interpretation. */
export async function interpretWeddingPreferenceOnIntakeSave(input: {
  weddingPlanId: string;
  requirements: WeddingVendorRankingRequirements;
  storage?: Storage;
}): Promise<{ fingerprint: string; response: WeddingPreferenceInterpreterResponse | null; profile: WeddingPreferenceProfile }> {
  const vocabularyVersion = WEDDING_FACET_VOCABULARY_VERSION;
  const fingerprint = weddingPreferenceInterpreterFingerprint({ weddingPlanId: input.weddingPlanId, requirements: input.requirements, vocabularyVersion });
  const deterministic = buildDeterministicPreferenceProfile(input.requirements);
  if (!shouldInterpretWeddingPreferenceProfile(input.requirements)) return { fingerprint, response: null, profile: deterministic };
  const cached = cachedWeddingPreferenceInterpretation(fingerprint, vocabularyVersion, input.storage);
  if (cached) return { fingerprint, response: cached, profile: preferenceProfileWithInterpreter(input.requirements, cached) };
  try {
    const response = await apiFetch<WeddingPreferenceInterpreterResponse>("/wedding/preference-profile/interpret", {
      method: "POST",
      bodyJson: {
        wedding_plan_id: input.weddingPlanId,
        priorities: (input.requirements.topPriorities ?? []).map(clean).filter(Boolean).join(" | ") || null,
        atmosphere: clean(input.requirements.atmosphereDescription) || null,
        vendor_preferences: clean(input.requirements.preferences) || null,
        guest_count: clean(input.requirements.guestCount) || null,
        vocabulary_version: vocabularyVersion,
      },
    });
    if (response?.status === "interpreted" || response?.status === "fallback") {
      cacheWeddingPreferenceInterpretation({ fingerprint, vocabularyVersion, response }, input.storage);
      return { fingerprint, response, profile: preferenceProfileWithInterpreter(input.requirements, response) };
    }
  } catch { /* Deterministic mapping remains sufficient and non-blocking. */ }
  return { fingerprint, response: null, profile: deterministic };
}

export type WeddingPreferenceChipChange = { facetId: string; choice: "must" | "nice" | "remove" };

/** Returns a new profile for a new AFP successor; it never mutates the prior profile. */
export function applyWeddingPreferenceChipChange(profile: WeddingPreferenceProfile, change: WeddingPreferenceChipChange): WeddingPreferenceProfile {
  const facetId = clean(change.facetId);
  const facets = profile.facets.flatMap((facet) => {
    if (facet.facetId !== facetId) return [{ ...facet }];
    if (change.choice === "remove") return [];
    return [{ ...facet, weight: change.choice, confidence: 1, authority: "user" as const }];
  });
  return { facets, unmapped: [...profile.unmapped] };
}

export function confirmWeddingPreferenceProfile(profile: WeddingPreferenceProfile): WeddingPreferenceProfile {
  return { facets: profile.facets.map((facet) => ({ ...facet, confidence: 1, authority: "user" as const })), unmapped: [...profile.unmapped] };
}
