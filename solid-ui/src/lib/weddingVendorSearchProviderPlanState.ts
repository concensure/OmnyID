// @locs-version: 2.0
import type { WeddingVendorSearchProviderKind } from "@/lib/weddingVendorSearchProviderEnvState";
import type { WeddingVendorSearchReadinessState } from "@/lib/weddingVendorSearchReadinessState";

export type WeddingVendorSearchProviderQuery = {
  providerKind: WeddingVendorSearchProviderKind;
  category: string;
  query: string;
  googlePlaceTypes: string[];
  overpassTags: string[];
  expectedFields: string[];
  guardrails: string[];
};

export type WeddingVendorSearchProviderPlan = {
  providerKind: WeddingVendorSearchProviderKind;
  label: string;
  priority: number;
  queries: WeddingVendorSearchProviderQuery[];
  guardrails: string[];
};

export type WeddingVendorSearchProviderPlanState = {
  status: "blocked" | "ready";
  providerPlans: WeddingVendorSearchProviderPlan[];
  queryCount: number;
  missing: string[];
  summary: string;
};

const LABELS: Record<WeddingVendorSearchProviderKind, string> = {
  brave_search: "Brave Search",
  exa_search: "EXA Search API",
  google_places: "Google Places API",
  overpass: "OSM / Overpass API",
};

const GOOGLE_TYPES: Record<string, string[]> = {
  venue: ["event_venue", "restaurant", "lodging"],
  floral_designer: ["florist"],
  hair_stylist: ["hair_care", "beauty_salon"],
  makeup_artist: ["beauty_salon"],
  cake_baker: ["bakery"],
  jeweler: ["jewelry_store"],
  accommodations: ["lodging"],
  caterer: ["restaurant"],
  planner: ["point_of_interest"],
  photographer: ["point_of_interest"],
  videographer: ["point_of_interest"],
  band: ["point_of_interest"],
  dj: ["point_of_interest"],
  officiant: ["point_of_interest"],
};

const OVERPASS_TAGS: Record<string, string[]> = {
  venue: ["amenity=events_venue", "amenity=community_centre", "tourism=hotel"],
  floral_designer: ["shop=florist"],
  hair_stylist: ["shop=hairdresser"],
  makeup_artist: ["shop=beauty"],
  cake_baker: ["shop=bakery"],
  jeweler: ["shop=jewelry"],
  accommodations: ["tourism=hotel", "tourism=guest_house"],
  caterer: ["amenity=restaurant"],
  photographer: ["craft=photographer"],
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseBriefValue(readiness: WeddingVendorSearchReadinessState, prefix: string): string {
  const line = readiness.searchBrief.find((item) => item.toLowerCase().startsWith(prefix.toLowerCase()));
  return clean(line?.slice(prefix.length));
}

function categoriesFrom(readiness: WeddingVendorSearchReadinessState): string[] {
  return parseBriefValue(readiness, "Vendor categories:")
    .split(",")
    .map((category) => clean(category).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""))
    .filter(Boolean);
}

function termsFrom(readiness: WeddingVendorSearchReadinessState): {
  location: string;
  preferences: string;
  photographyScope: string;
  musicDirection: string;
  categories: string[];
} {
  return {
    location: parseBriefValue(readiness, "Location:"),
    preferences: parseBriefValue(readiness, "Preferences:"),
    photographyScope: parseBriefValue(readiness, "Photography scope:"),
    musicDirection: readiness.searchBrief.some((item) => /music\/entertainment needed/i.test(item))
      ? "music entertainment needed"
      : readiness.searchBrief.some((item) => /no music\/entertainment search requested/i.test(item))
        ? "no music entertainment search requested"
        : "",
    categories: categoriesFrom(readiness),
  };
}

function searchLocationFor(input: { location: string; approximateLocation?: string | null }): string {
  return clean(input.location) || clean(input.approximateLocation);
}

function expectedFieldsFor(providerKind: WeddingVendorSearchProviderKind): string[] {
  if (providerKind === "google_places") {
    return ["name", "website", "phone", "address", "rating", "review count", "opening hours", "place id"];
  }
  if (providerKind === "overpass") {
    return ["name", "OSM id", "coordinates", "tags", "website or phone when present"];
  }
  if (providerKind === "exa_search") {
    return ["title", "url", "semantic highlight", "source domain", "wedding/style fit signal"];
  }
  return ["title", "url", "snippet", "source domain", "publish/update signal when available"];
}

function queryFor(input: {
  providerKind: WeddingVendorSearchProviderKind;
  location: string;
  category: string;
  preferences: string;
  photographyScope: string;
  musicDirection: string;
}): string {
  const label = input.category.replace(/_/g, " ");
  const scopePart = /photo|photograph|videograph/i.test(input.category) && input.photographyScope
    ? ` ${input.photographyScope}`
    : "";
  const musicPart = /band|dj|music|entertain/i.test(input.category) && input.musicDirection
    ? ` ${input.musicDirection}`
    : "";
  const contextPart = `${scopePart}${musicPart}`;
  const areaPhrase = input.location || "the wedding area";
  if (input.providerKind === "google_places") {
    return `wedding ${label} near ${areaPhrase}${input.preferences ? ` ${input.preferences}` : ""}${contextPart}`.replace(/\s+/g, " ").trim();
  }
  if (input.providerKind === "overpass") {
    return `${areaPhrase} ${label}${contextPart}`.replace(/\s+/g, " ").trim();
  }
  const areaConnector = input.category === "venue" ? `near ${areaPhrase}` : `in ${areaPhrase}`;
  if (input.providerKind === "exa_search") {
    return `source-backed wedding ${label} ${areaConnector} ${input.preferences || "packages reviews"} official website instagram contact${contextPart}`.replace(/\s+/g, " ").trim();
  }
  return `wedding ${label} ${areaConnector} services packages price reviews${input.preferences ? ` ${input.preferences}` : ""}${contextPart}`.replace(/\s+/g, " ").trim();
}

function guardrailsFor(providerKind: WeddingVendorSearchProviderKind): string[] {
  if (providerKind === "google_places") {
    return [
      "Use Google Places for live place facts, but still cite the returned place/source receipt.",
      "Do not infer package price or wedding availability from rating alone.",
    ];
  }
  if (providerKind === "overpass") {
    return [
      "Use Overpass as an open discovery fallback; OSM records may miss phone, reviews, pricing, and wedding-specific fit.",
      "Respect the configured Overpass rate limit and contact policy.",
    ];
  }
  if (providerKind === "exa_search") {
    return [
      "Use EXA Search as a semantic web fallback for vendor websites and niche style fit.",
      "Keep recommendations source-cited; do not treat EXA highlights as confirmed availability or pricing.",
    ];
  }
  return [
    "Use Brave Search for broad web discovery and package/review pages.",
    "Cross-check vendor facts against official vendor pages before recommending booking action.",
  ];
}

function priorityFor(
  providerKind: WeddingVendorSearchProviderKind,
  index: number,
  preserveInputOrder: boolean,
): number {
  if (preserveInputOrder) return index + 1;
  if (providerKind === "google_places") return 1;
  if (providerKind === "brave_search") return 2;
  if (providerKind === "exa_search") return 3;
  return 4;
}

export function buildWeddingVendorSearchProviderPlanState(input: {
  readiness: WeddingVendorSearchReadinessState;
  providerKinds?: readonly WeddingVendorSearchProviderKind[] | null;
  maxCategories?: number | null;
  approximateLocation?: string | null;
}): WeddingVendorSearchProviderPlanState {
  if (input.readiness.status === "blocked") {
    return {
      status: "blocked",
      providerPlans: [],
      queryCount: 0,
      missing: input.readiness.missing,
      summary: `Vendor search plan blocked: ${input.readiness.missing.join(", ") || "missing required context"}.`,
    };
  }

  const terms = termsFrom(input.readiness);
  const location = searchLocationFor({
    location: terms.location,
    approximateLocation: input.approximateLocation,
  });
  const { preferences, photographyScope, musicDirection, categories } = terms;
  const explicitProviders = input.providerKinds?.length ? input.providerKinds : null;
  const preserveInputOrder = Boolean(explicitProviders);
  const providers: readonly WeddingVendorSearchProviderKind[] = explicitProviders
    ? explicitProviders
    : (["google_places", "brave_search", "exa_search", "overpass"] as const);
  const categoryLimit = Math.max(1, input.maxCategories ?? 8);
  const providerPlans = providers.map((providerKind, index): WeddingVendorSearchProviderPlan => {
    const queries = categories.slice(0, categoryLimit).map((category): WeddingVendorSearchProviderQuery => ({
      providerKind,
      category,
      query: queryFor({ providerKind, location, category, preferences, photographyScope, musicDirection }),
      googlePlaceTypes: providerKind === "google_places" ? GOOGLE_TYPES[category] ?? ["point_of_interest"] : [],
      overpassTags: providerKind === "overpass" ? OVERPASS_TAGS[category] ?? ["name~wedding"] : [],
      expectedFields: expectedFieldsFor(providerKind),
      guardrails: guardrailsFor(providerKind),
    }));
    return {
      providerKind,
      label: LABELS[providerKind],
      priority: priorityFor(providerKind, index, preserveInputOrder),
      queries,
      guardrails: guardrailsFor(providerKind),
    };
  }).sort((a, b) => a.priority - b.priority);

  const queryCount = providerPlans.reduce((sum, plan) => sum + plan.queries.length, 0);
  return {
    status: "ready",
    providerPlans,
    queryCount,
    missing: [],
    summary: `Prepared ${queryCount} provider-specific wedding vendor search queries across ${providerPlans.length} provider${providerPlans.length === 1 ? "" : "s"}.`,
  };
}
