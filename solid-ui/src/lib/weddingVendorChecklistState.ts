// @locs-version: 2.0
export type WeddingVendorChecklistItem = {
  id: string;
  label: string;
  searchTerms: string[];
};

export const WEDDING_VENDOR_CHECKLIST: WeddingVendorChecklistItem[] = [
  { id: "venue", label: "Venue", searchTerms: ["wedding venue", "event space"] },
  { id: "planner", label: "Planner", searchTerms: ["wedding planner", "event planner"] },
  { id: "photographer", label: "Photographer", searchTerms: ["wedding photographer", "day-of photography"] },
  { id: "floral_designer", label: "Floral Designer", searchTerms: ["wedding florist", "floral designer"] },
  { id: "dj", label: "DJ", searchTerms: ["wedding DJ"] },
  { id: "band", label: "Band", searchTerms: ["wedding band", "live music"] },
  { id: "caterer", label: "Caterer", searchTerms: ["wedding caterer"] },
  { id: "decor", label: "Decor", searchTerms: ["wedding decor", "styling"] },
  { id: "rental_company", label: "Rental Company", searchTerms: ["wedding rentals", "event hire"] },
  { id: "videographer", label: "Videographer", searchTerms: ["wedding videographer"] },
  { id: "officiant", label: "Officiant", searchTerms: ["wedding officiant", "marriage celebrant"] },
  { id: "hair_stylist", label: "Hair Stylist", searchTerms: ["wedding hair stylist"] },
  { id: "makeup_artist", label: "Makeup Artist", searchTerms: ["wedding makeup artist"] },
  { id: "entertainment", label: "Entertainment", searchTerms: ["wedding entertainment"] },
  { id: "lighting_company", label: "Lighting Company", searchTerms: ["wedding lighting"] },
  { id: "cake_baker", label: "Cake Baker", searchTerms: ["wedding cake baker"] },
  { id: "transportation_provider", label: "Transportation Provider", searchTerms: ["wedding transport"] },
  { id: "stationer", label: "Stationer", searchTerms: ["wedding stationery"] },
  { id: "calligrapher", label: "Calligrapher", searchTerms: ["wedding calligrapher"] },
  { id: "bartending", label: "Bartending", searchTerms: ["wedding bar service", "bartending"] },
  { id: "ceremony_ensemble", label: "Ceremony Ensemble", searchTerms: ["ceremony musicians", "string quartet"] },
  { id: "accommodations", label: "Accommodations", searchTerms: ["wedding guest accommodation"] },
  { id: "attire_designer", label: "Attire Designer", searchTerms: ["wedding attire designer"] },
  { id: "dress_salon", label: "Dress Salon", searchTerms: ["wedding dress salon"] },
  { id: "alterations_specialist", label: "Alterations Specialist", searchTerms: ["wedding alterations"] },
  { id: "emcee", label: "Emcee", searchTerms: ["wedding emcee", "master of ceremonies"] },
  { id: "jeweler", label: "Jeweler", searchTerms: ["wedding jeweler"] },
  { id: "photo_booth", label: "Photo Booth", searchTerms: ["wedding photo booth"] },
  { id: "travel_honeymoon_advisor", label: "Travel / Honeymoon Advisor", searchTerms: ["honeymoon advisor", "wedding travel advisor"] },
  { id: "welcome_amenity_supplier", label: "Welcome Amenity Supplier", searchTerms: ["wedding welcome bags", "guest amenities"] },
  { id: "trendy_emerging", label: "Trendy and Emerging Wedding Vendors", searchTerms: ["wedding content creator", "audio guest book", "live painter"] },
];

function lookupKey(value: string): string {
  return value.toLowerCase().replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim();
}

const LOOKUP = new Map(WEDDING_VENDOR_CHECKLIST.flatMap((item) => [
  [lookupKey(item.id), item],
  [lookupKey(item.label), item],
]));

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeWeddingVendorSelections(values: readonly unknown[] | null | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values ?? []) {
    const key = lookupKey(clean(value));
    const item = LOOKUP.get(key);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item.id);
  }
  return result;
}

export function weddingVendorSelectionLabels(values: readonly unknown[] | null | undefined): string[] {
  return normalizeWeddingVendorSelections(values).map((id) => LOOKUP.get(id)?.label ?? id);
}

export function weddingVendorSearchTerms(values: readonly unknown[] | null | undefined): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const id of normalizeWeddingVendorSelections(values)) {
    const item = LOOKUP.get(id);
    for (const term of item?.searchTerms ?? []) {
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      terms.push(term);
    }
  }
  return terms;
}
