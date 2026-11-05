// @locs-version: 1.0

export type WeddingVendorQueryIntentState = {
  category: string | null;
  categoryLabel: string | null;
  exactNameLookup: boolean;
  location: string | null;
  guestCount: string | null;
  budgetComfort: string | null;
  priorities: string[];
  atmosphere: string | null;
  preferences: string | null;
};

const CATEGORY_PATTERNS: ReadonlyArray<readonly [RegExp, string, string]> = [
  [/\b(?:venue|venues|reception venue|ceremony location)s?\b/i, "venue", "Venue"],
  [/\b(?:photographer|photographers|photography)\b/i, "photographer", "Photographer"],
  [/\b(?:videographer|videographers|videography)\b/i, "videographer", "Videographer"],
  [/\b(?:florist|florists|flowers|floral designer)s?\b/i, "floral_designer", "Floral designer"],
  [/\b(?:caterer|caterers|catering)\b/i, "caterer", "Caterer"],
  [/\b(?:celebrant|celebrants|officiant|officiants)\b/i, "officiant", "Celebrant"],
  [/\b(?:band|bands|dj|djs|music|musician|musicians|singer|singers|live music|acoustic duo|acoustic trio)\b/i, "band", "Music"],
  [/\b(?:cake|cakes|cake baker|bakery)\b/i, "cake_baker", "Cake baker"],
  [/\b(?:hair stylist|hairdresser|hair styling)\b/i, "hair_stylist", "Hair stylist"],
  [/\b(?:makeup artist|make-up artist|makeup)\b/i, "makeup_artist", "Makeup artist"],
  [/\b(?:planner|planners|wedding coordinator)\b/i, "planner", "Planner"],
];

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

export function mergeWeddingVendorPreferenceLabels(...values: readonly unknown[]): string[] {
  return unique(values.flatMap((value) => {
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
    return typeof value === "string" ? value.split(/[;,\n]+/) : [];
  }));
}

function queryLocation(query: string): string | null {
  const match = query.match(/\b(?:in|around|within)\s+(.+?)(?=\s+(?:with|for|and\s+looking|that\s+)|[,.;]|$)/i);
  return clean(match?.[1]) || null;
}

function queryGuestCount(query: string): string | null {
  const match = query.match(/\b(\d{1,4})\s*(?:guests?|people|persons?)\b/i);
  return match ? `${Number(match[1])} guests` : null;
}

function queryBudget(query: string): string | null {
  const match = query.match(/(?:\bAUD\s*|\$)\s*(\d[\d,]*(?:\.\d+)?\s*[kKmM]?)|\bbudget(?:\s+of|\s+around|\s+about|\s+is|\s*:)?\s*(\d[\d,]*(?:\.\d+)?\s*[kKmM]?)|(\d[\d,]*(?:\.\d+)?\s*[kKmM]?)\s+(?:total\s+)?budget\b/i);
  const amount = clean(match?.[1] ?? match?.[2] ?? match?.[3]);
  return amount ? `AUD $${amount}` : null;
}

function queryAtmosphere(query: string): string | null {
  const match = query.match(/\b(?:looking for|want(?:ing)?|after)\s+(?:an?\s+)?(.{3,80}?\batmosphere\b)/i)
    ?? query.match(/\b((?:natural|relaxed|formal|romantic|intimate|rustic|modern|coastal|garden|elegant)(?:[ -][a-z]+){0,3}\s+atmosphere)\b/i);
  return clean(match?.[1]) || null;
}

const DESCRIPTIVE_PREFERENCE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\brustic\b/i, "rustic"],
  [/\bcountry\b/i, "country"],
  [/\bmicro(?:[- ]wedding)?\b/i, "micro wedding"],
  [/\bintimate\b/i, "intimate"],
  [/\bcoastal\b/i, "coastal"],
  [/\bgarden\b/i, "garden"],
  [/\bnatural\b/i, "natural"],
  [/\brelaxed\b/i, "relaxed"],
  [/\bromantic\b/i, "romantic"],
  [/\bmodern\b/i, "modern"],
  [/\belegant\b/i, "elegant"],
  [/\bformal\b/i, "formal"],
  [/\bindustrial\b/i, "industrial"],
  [/\bboho\b/i, "boho"],
  [/\blux(?:e|ury)\b/i, "luxury"],
];

function descriptivePreferences(query: string): string[] {
  return DESCRIPTIVE_PREFERENCE_PATTERNS
    .filter(([pattern]) => pattern.test(query))
    .map(([, label]) => label);
}

function isExactNameLookup(query: string): boolean {
  const words = query.split(/\s+/).filter(Boolean);
  const contextual = /\b(?:wedding|find|search|looking|recommend|compare|near|around|within|guests?|people|budget|atmosphere|style|available)\b/i.test(query);
  return words.length > 0 && words.length <= 7 && !contextual;
}

export function weddingVendorQueryIntent(value: unknown): WeddingVendorQueryIntentState {
  const query = clean(value);
  const categoryMatch = CATEGORY_PATTERNS.find(([pattern]) => pattern.test(query));
  const location = queryLocation(query);
  const guestCount = queryGuestCount(query);
  const budgetComfort = queryBudget(query);
  const atmosphere = queryAtmosphere(query);
  const descriptors = descriptivePreferences(query);
  const priorities = mergeWeddingVendorPreferenceLabels([
    /\b(?:near|by|close to|beside)\s+(?:the\s+)?beach\b/i.test(query) ? "Near the beach" : "",
    atmosphere ?? "",
    ...descriptors.filter((descriptor) => !atmosphere?.toLowerCase().includes(descriptor)),
  ]);
  return {
    category: categoryMatch?.[1] ?? null,
    categoryLabel: categoryMatch?.[2] ?? null,
    exactNameLookup: isExactNameLookup(query),
    location,
    guestCount,
    budgetComfort,
    priorities,
    atmosphere,
    preferences: priorities.length > 0 ? priorities.join("; ") : null,
  };
}

export function weddingVendorQueryGooglePlaceTypes(category: string | null): string[] {
  if (category === "venue") return ["event_venue", "restaurant", "lodging"];
  if (category === "floral_designer") return ["florist"];
  if (category === "cake_baker") return ["bakery"];
  if (category === "caterer") return ["restaurant"];
  if (category === "hair_stylist") return ["hair_care", "beauty_salon"];
  if (category === "makeup_artist") return ["beauty_salon"];
  return ["point_of_interest"];
}
