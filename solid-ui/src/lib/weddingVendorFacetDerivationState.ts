// @locs-version: 1.0
// Rank-time only: these facets are derived from source evidence and are never persisted.
import type { WeddingVendorAttributeEvidence, WeddingVendorRankingSource } from "@/lib/weddingVendorRankingState";
import { weddingFacetById, weddingFacetsForPhrase } from "@/lib/weddingFacetVocabularyState";

export type WeddingVendorFacetEvidence = {
  attributeKey: string;
  value: unknown;
  authority: string | null;
  sourceUrl: string | null;
};

export type WeddingVendorDerivedFacet = {
  facetId: string;
  confidence: number;
  evidence: WeddingVendorFacetEvidence[];
};

type View = { value: unknown; confidence: number; authority: string | null; sourceUrl: string | null } | null;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

function view(source: WeddingVendorRankingSource, key: string): View {
  const attribute: WeddingVendorAttributeEvidence | undefined = source.attributes?.[key];
  if (!attribute || !["known", "estimated"].includes(attribute.status) || attribute.value === null || attribute.value === undefined) return null;
  return { value: attribute.value, confidence: clamp(attribute.confidence ?? (attribute.status === "known" ? 0.8 : 0.4)), authority: attribute.authority ?? null, sourceUrl: attribute.source_url ?? null };
}

function evidence(key: string, item: NonNullable<View>): WeddingVendorFacetEvidence {
  return { attributeKey: key, value: item.value, authority: item.authority, sourceUrl: item.sourceUrl };
}

const SETTING_FACETS: Record<string, string[]> = {
  iconic_waterfront: ["setting.waterfront", "experience.views_led"], heritage_garden: ["setting.heritage_estate", "setting.garden"],
  parkland_garden: ["setting.garden"], premium_city: ["setting.city"], suburban_landscaped: ["setting.garden"], suburban_function: ["setting.city"], limited: [],
};
const BOOLEAN_FACETS: Record<string, string> = {
  wheelchair_accessible: "practical.accessible", accommodation_on_site: "experience.stay_on_site", exclusive_use: "experience.exclusive_use",
  byo_alcohol_allowed: "practical.byo", pets_allowed: "practical.pets_ok", public_transport_access: "practical.public_transport", parking: "practical.parking",
};

/** Returns stable, merged facets. Unknown source facts produce no facet rather than a penalty. */
export function deriveWeddingVendorFacets(input: { source: WeddingVendorRankingSource; guestCount?: number | null }): WeddingVendorDerivedFacet[] {
  const collected = new Map<string, WeddingVendorDerivedFacet>();
  const add = (facetId: string, confidence: number, item: WeddingVendorFacetEvidence) => {
    if (!weddingFacetById(facetId)) return;
    const current = collected.get(facetId);
    if (current) {
      current.confidence = Math.max(current.confidence, clamp(confidence));
      current.evidence.push(item);
    } else collected.set(facetId, { facetId, confidence: clamp(confidence), evidence: [item] });
  };
  const source = input.source;
  const setting = view(source, "location_setting_class");
  if (setting && typeof setting.value === "string") for (const id of SETTING_FACETS[setting.value] ?? []) add(id, setting.confidence * 0.8, evidence("location_setting_class", setting));
  for (const [key, facetId] of Object.entries(BOOLEAN_FACETS)) {
    const item = view(source, key);
    if (item?.value === true) add(facetId, item.confidence, evidence(key, item));
  }
  const wetWeather = view(source, "wet_weather_option");
  if (wetWeather && wetWeather.value !== "none") add("practical.wet_weather_backup", wetWeather.confidence, evidence("wet_weather_option", wetWeather));
  const ceremony = view(source, "ceremony_on_site");
  const reception = view(source, "reception_on_site");
  if (ceremony?.value === true && reception?.value === true) {
    add("practical.ceremony_and_reception", Math.min(ceremony.confidence, reception.confidence), evidence("ceremony_on_site", ceremony));
    add("experience.all_in_one", Math.min(ceremony.confidence, reception.confidence), evidence("reception_on_site", reception));
  }
  for (const [key, multiplier] of [["style_tags", 0.7], ["editorial_summary", 0.6]] as const) {
    const item = view(source, key);
    const text = Array.isArray(item?.value) ? item.value.filter((value): value is string => typeof value === "string").join(" ") : typeof item?.value === "string" ? item.value : "";
    if (item && text) for (const facet of weddingFacetsForPhrase(text)) add(facet.id, item.confidence * multiplier, evidence(key, item));
  }
  const stored = view(source, "style_facets");
  if (stored && Array.isArray(stored.value)) for (const facetId of stored.value.filter((id): id is string => typeof id === "string")) add(facetId, stored.confidence, evidence("style_facets", stored));
  const guests = input.guestCount ?? null;
  if (guests && guests > 0) {
    const roomCapacities = (source.rooms ?? []).map((room) => number(room.capacity_seated)).filter((capacity): capacity is number => capacity !== null && capacity > 0);
    const suitable = roomCapacities.filter((capacity) => capacity >= guests).sort((left, right) => left - right)[0] ?? null;
    const fallback = number(view(source, "capacity_seated_max")?.value);
    const capacity = suitable ?? fallback;
    if (capacity) {
      const capacityEvidence = view(source, "capacity_seated_max");
      const confidence = capacityEvidence?.confidence ?? 0.6;
      const item: WeddingVendorFacetEvidence = capacityEvidence ? evidence("capacity_seated_max", capacityEvidence) : { attributeKey: "wedding_vendor_rooms.capacity_seated", value: capacity, authority: null, sourceUrl: null };
      const ratio = capacity / guests;
      if (ratio <= 1.6) add("scale.intimate", confidence, item);
      else if (ratio <= 2.5) {
        add("scale.mid", confidence, item);
        if (roomCapacities.length > 1) add("scale.flexible_rooms", confidence, item);
      } else if (ratio > 4 && suitable === null) add("scale.large", confidence, item);
    }
  }
  return [...collected.values()].sort((left, right) => left.facetId.localeCompare(right.facetId));
}
