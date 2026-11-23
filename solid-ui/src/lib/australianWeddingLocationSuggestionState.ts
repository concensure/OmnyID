import type { WeddingVendor } from "@/lib/api";

export type AustralianWeddingLocationSuggestion = {
  label: string;
  locality: string;
  state: string;
};

const STATE_CODES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"] as const;
const CORE_LOCATIONS: ReadonlyArray<[string, string]> = [
  ["Sydney", "NSW"], ["Melbourne", "VIC"], ["Brisbane", "QLD"], ["Perth", "WA"],
  ["Adelaide", "SA"], ["Canberra", "ACT"], ["Hobart", "TAS"], ["Darwin", "NT"],
  ["Ryde", "NSW"], ["Parramatta", "NSW"], ["Mosman", "NSW"], ["Manly", "NSW"],
  ["Newcastle", "NSW"], ["Wollongong", "NSW"], ["Blue Mountains", "NSW"],
  ["Central Coast", "NSW"], ["Yamba", "NSW"], ["Young", "NSW"],
  ["Gold Coast", "QLD"], ["Sunshine Coast", "QLD"], ["Toowoomba", "QLD"], ["Yeppoon", "QLD"],
  ["Geelong", "VIC"], ["Yarra Glen", "VIC"], ["Mornington Peninsula", "VIC"],
  ["Margaret River", "WA"], ["Yallingup", "WA"], ["York", "WA"],
  ["Barossa Valley", "SA"], ["Launceston", "TAS"], ["Alice Springs", "NT"],
];

const clean = (value: unknown) => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function stateFrom(value: string): string | null {
  const match = value.toUpperCase().match(new RegExp(`\\b(${STATE_CODES.join("|")})\\b`));
  return match?.[1] ?? null;
}

function localityFromSegment(value: string): string {
  return clean(value)
    .replace(/\b(?:Australia|Australian Capital Territory|New South Wales|Northern Territory|Queensland|South Australia|Tasmania|Victoria|Western Australia)\b/gi, "")
    .replace(new RegExp(`\\b(?:${STATE_CODES.join("|")})\\b`, "gi"), "")
    .replace(/\b\d{4}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function directoryLocations(vendors: readonly WeddingVendor[]): AustralianWeddingLocationSuggestion[] {
  const results: AustralianWeddingLocationSuggestion[] = [];
  for (const vendor of vendors) {
    const combined = [vendor.serviceArea, vendor.address].filter(Boolean).join(", ");
    const state = stateFrom(combined);
    if (!state) continue;
    for (const segment of combined.split(",")) {
      const locality = localityFromSegment(segment);
      if (!locality || /^(?:Australia|Greater|Metro|Metropolitan|Statewide)$/i.test(locality)) continue;
      results.push({ locality, state, label: `${locality} ${state}` });
    }
  }
  return results;
}

function orderedSubsequence(needle: string, haystack: string): boolean {
  let index = 0;
  for (const character of haystack) if (character === needle[index]) index += 1;
  return index === needle.length;
}

function matchRank(query: string, item: AustralianWeddingLocationSuggestion): number | null {
  const label = normalized(item.label);
  const locality = normalized(item.locality);
  if (locality === query || label === query) return 0;
  if (locality.startsWith(query)) return 1;
  if (locality.split(" ").some((word) => word.startsWith(query))) return 2;
  if (locality.includes(query)) return 3;
  if (query.length >= 2 && orderedSubsequence(query, locality)) return 4;
  return null;
}

export function australianWeddingLocationSuggestions(
  queryValue: string,
  vendors: readonly WeddingVendor[],
  limit = 8,
): AustralianWeddingLocationSuggestion[] {
  const query = normalized(queryValue);
  if (!query) return [];
  const unique = new Map<string, AustralianWeddingLocationSuggestion>();
  for (const [locality, state] of CORE_LOCATIONS) {
    const item = { locality, state, label: `${locality} ${state}` };
    unique.set(normalized(item.label), item);
  }
  for (const item of directoryLocations(vendors)) unique.set(normalized(item.label), item);
  return [...unique.values()]
    .map((item) => ({ item, rank: matchRank(query, item) }))
    .filter((entry): entry is { item: AustralianWeddingLocationSuggestion; rank: number } => entry.rank !== null)
    .sort((left, right) => left.rank - right.rank
      || left.item.locality.length - right.item.locality.length
      || left.item.label.localeCompare(right.item.label, "en-AU"))
    .slice(0, Math.max(1, Math.min(limit, 20)))
    .map((entry) => entry.item);
}
