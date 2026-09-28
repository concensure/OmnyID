// @locs-version: 2.0
import {
  cleanWeddingProductionLabel,
  cleanWeddingProductionLabels,
} from "@/lib/weddingProductionLabelState";

export type WeddingVendorSearchReadinessStatus = "blocked" | "partial" | "ready";

export type WeddingVendorSearchReadinessState = {
  status: WeddingVendorSearchReadinessStatus;
  label: string;
  missing: string[];
  searchBrief: string[];
  searchQueries: string[];
  guardrails: string[];
};

export type WeddingVendorSearchReadinessInput = {
  location?: string | null;
  vendorCategories?: readonly string[] | null;
  vendorPreferences?: string | null;
  photographyScope?: string | null;
  musicOrBandNeeded?: boolean | "yes" | "no" | "unknown" | null;
  liveSearchProviderReady?: boolean | null;
};

function clean(value: unknown): string {
  return cleanWeddingProductionLabel(typeof value === "string" ? value : null) ?? "";
}

function hasText(value: unknown): boolean {
  return clean(value).length > 0;
}

function hasListValue(value: readonly string[] | null | undefined): boolean {
  return Array.isArray(value) && value.some(hasText);
}

function normalizedCategories(categories: readonly string[] | null | undefined): string[] {
  return Array.isArray(categories)
    ? cleanWeddingProductionLabels(categories)
    : [];
}

function searchQueriesFor(input: WeddingVendorSearchReadinessInput, categories: readonly string[]): string[] {
  const location = clean(input.location);
  const preferences = clean(input.vendorPreferences);
  if (!location || categories.length === 0) return [];
  const queryKinds = ["services", "packages price", "reviews"];
  const queries: string[] = [];
  for (const category of categories.slice(0, 8)) {
    for (const kind of queryKinds) {
      const preferencePart = preferences ? ` ${preferences}` : "";
      const query = cleanWeddingProductionLabel(`${location} wedding ${category} ${kind}${preferencePart}`, {
        maxLength: 180,
        wordAware: true,
      });
      if (query) queries.push(query);
    }
  }
  return queries.slice(0, 20);
}

function includesPhotography(categories: readonly string[]): boolean {
  return categories.some((category) => /photo|photograph|videograph/i.test(category));
}

function includesMusic(categories: readonly string[]): boolean {
  return categories.some((category) => /band|music|dj|entertain/i.test(category));
}

export function buildWeddingVendorSearchReadinessState(
  input: WeddingVendorSearchReadinessInput,
): WeddingVendorSearchReadinessState {
  const categories = normalizedCategories(input.vendorCategories);
  const missing = [
    hasText(input.location) ? null : "wedding location or service area",
    hasListValue(categories) ? null : "vendor categories needed",
    hasText(input.vendorPreferences) ? null : "vendor fit preferences",
    includesPhotography(categories) && !hasText(input.photographyScope)
      ? "photography scope: wedding photo style, day-of coverage, or both"
      : null,
    includesMusic(categories) && input.musicOrBandNeeded === "unknown"
      ? "music direction: band, DJ, other entertainment, or none"
      : null,
    input.liveSearchProviderReady ? null : "live vendor-search provider",
  ].filter((item): item is string => item !== null);
  const blockingMissing = missing.filter((item) => item !== "live vendor-search provider");
  const status: WeddingVendorSearchReadinessStatus = blockingMissing.length > 0
    ? "blocked"
    : input.liveSearchProviderReady ? "ready" : "partial";
  return {
    status,
    label: status === "ready"
      ? "Ready for live vendor search"
      : status === "partial"
        ? "Ready for a structured search brief; live provider not connected"
        : "Needs vendor-search intake",
    missing: cleanWeddingProductionLabels(missing),
    searchBrief: cleanWeddingProductionLabels([
      hasText(input.location) ? `Location: ${clean(input.location)}` : null,
      categories.length > 0 ? `Vendor categories: ${categories.join(", ")}` : null,
      hasText(input.vendorPreferences) ? `Preferences: ${clean(input.vendorPreferences)}` : null,
      hasText(input.photographyScope) ? `Photography scope: ${clean(input.photographyScope)}` : null,
      input.musicOrBandNeeded === true || input.musicOrBandNeeded === "yes" ? "Music/entertainment needed" : null,
      input.musicOrBandNeeded === false || input.musicOrBandNeeded === "no" ? "No music/entertainment search requested" : null,
    ]),
    searchQueries: searchQueriesFor(input, categories),
    guardrails: [
      "Do not recommend specific vendors without location and vendor-category context.",
      "Do not treat wedding-photo style research as the same thing as day-of photography coverage.",
      "Do not claim live pricing, availability, package inclusions, or booking status unless a provider/source verified it.",
      "If live search is unavailable, produce a search brief and questions rather than fake vendor matches.",
    ],
  };
}
