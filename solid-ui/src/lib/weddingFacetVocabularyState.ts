// @locs-version: 1.0
import vocabularyJson from "@/lib/weddingFacetVocabulary.json" with { type: "json" };

export type WeddingFacet = {
  id: string;
  dimension: string;
  label: string;
  couple_phrase: string;
  synonyms: string[];
  conflicts: string[];
  derive?: Record<string, unknown>;
};

type WeddingFacetVocabulary = { version: string; facets: WeddingFacet[] };
const vocabulary = vocabularyJson as WeddingFacetVocabulary;

export const WEDDING_FACET_VOCABULARY_VERSION = vocabulary.version;
export const WEDDING_FACET_VOCABULARY: readonly WeddingFacet[] = vocabulary.facets;
const facetsById = new Map(WEDDING_FACET_VOCABULARY.map((facet) => [facet.id, facet]));

function escaped(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function matches(text: string, phrase: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escaped(phrase.toLowerCase())}(?=$|[^a-z0-9])`, "i").test(text);
}

export function weddingFacetById(id: string | null | undefined): WeddingFacet | null {
  return facetsById.get(String(id ?? "").trim()) ?? null;
}

/** Stable, vocabulary-order synonym lookup. Phrases match as whole words, never substrings. */
export function weddingFacetsForPhrase(text: string | null | undefined): WeddingFacet[] {
  const normalized = String(text ?? "").trim().toLowerCase();
  if (!normalized) return [];
  return WEDDING_FACET_VOCABULARY.filter((facet) => facet.synonyms.some((synonym) => matches(normalized, synonym)));
}

export function weddingFacetConflicts(id: string | null | undefined): WeddingFacet[] {
  return (weddingFacetById(id)?.conflicts ?? []).flatMap((conflict) => {
    const facet = weddingFacetById(conflict);
    return facet ? [facet] : [];
  });
}

export function validateWeddingFacetVocabulary(): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const facet of WEDDING_FACET_VOCABULARY) {
    if (!/^[a-z]+\.[a-z_]+$/.test(facet.id)) errors.push(`invalid id ${facet.id}`);
    if (seen.has(facet.id)) errors.push(`duplicate id ${facet.id}`);
    seen.add(facet.id);
    for (const conflict of facet.conflicts) if (!facetsById.has(conflict)) errors.push(`${facet.id} references unknown conflict ${conflict}`);
  }
  return errors;
}
