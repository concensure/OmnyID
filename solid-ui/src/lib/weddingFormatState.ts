export type WeddingFormat = "elopement" | "micro" | "undecided" | "larger";
export type WeddingFormatSource = "explicit" | "deep_link" | "extracted";

export const WEDDING_FORMAT_OPTIONS: ReadonlyArray<{ value: WeddingFormat; label: string; hint: string }> = [
  { value: "elopement", label: "Just us / elopement", hint: "The two of you, with the legal witnesses and people you choose." },
  { value: "micro", label: "Small wedding", hint: "An intimate celebration, usually up to about 40 guests." },
  { value: "larger", label: "Larger celebration", hint: "A broader guest list with the same connected planning tools." },
  { value: "undecided", label: "Still deciding", hint: "Keep every route open while you work out what feels right." },
];

export const WEDDING_FORMAT_RECOMMENDED_STARTERS: Record<WeddingFormat, readonly string[]> = {
  elopement: ["budget_plan", "vendor_emails"],
  micro: ["venue_search", "budget_plan", "guest_list"],
  undecided: ["budget_plan"],
  larger: ["venue_search"],
};

export const WEDDING_FORMAT_MUST_DECIDE_FIRST: Record<WeddingFormat, readonly string[]> = {
  elopement: ["officiant", "photographer"],
  micro: ["venue", "officiant"],
  undecided: ["venue", "officiant"],
  larger: ["venue", "officiant"],
};

export const WEDDING_FORMAT_NEXT_STEPS = {
  elopement: ["ceremony_place", "celebrant_legal", "witnesses"],
  micro: ["guests", "ceremony_place", "budget"],
  undecided: ["format_tradeoff"],
  larger: [],
} as const;

export function normalizeWeddingFormat(value: unknown): WeddingFormat | null {
  return value === "elopement" || value === "micro" || value === "undecided" || value === "larger" ? value : null;
}

export const parseWeddingFormat = normalizeWeddingFormat;

export function effectiveWeddingFormat(input: {
  explicit?: unknown;
  deepLink?: unknown;
  extracted?: unknown;
  guestCount?: unknown;
}): { format: WeddingFormat | null; source: WeddingFormatSource | "inferred" | null } {
  const explicit = normalizeWeddingFormat(input.explicit);
  if (explicit) return { format: explicit, source: "explicit" };
  const deepLink = normalizeWeddingFormat(input.deepLink);
  if (deepLink) return { format: deepLink, source: "deep_link" };
  const extracted = normalizeWeddingFormat(input.extracted);
  if (extracted) return { format: extracted, source: "extracted" };
  const inferred = inferWeddingFormatFromGuestCount(input.guestCount);
  return { format: inferred, source: inferred ? "inferred" : null };
}

export function weddingMenuEmphasis(format: WeddingFormat | null | undefined): {
  collapsed: Array<"seating" | "helpers">;
  suppressBadges: Array<"seating">;
} {
  if (format === "elopement") return { collapsed: ["seating", "helpers"], suppressBadges: ["seating"] };
  if (format === "micro") return { collapsed: [], suppressBadges: ["seating"] };
  return { collapsed: [], suppressBadges: [] };
}

export function normalizeWeddingFormatSource(value: unknown): WeddingFormatSource | null {
  return value === "explicit" || value === "deep_link" || value === "extracted" ? value : null;
}

/** Infer only a suggestion; an explicit choice always wins and is never silently rewritten. */
export function inferWeddingFormatFromGuestCount(value: unknown): Exclude<WeddingFormat, "undecided"> | null {
  const values = typeof value === "number" ? [value] : typeof value === "string"
    ? (value.match(/\d[\d,]*/g) ?? []).map((item) => Number(item.replace(/,/g, "")))
    : [];
  const count = values.filter((item) => Number.isFinite(item) && item > 0).at(-1);
  if (!count) return null;
  if (count <= 10) return "elopement";
  if (count <= 40) return "micro";
  return "larger";
}

export function weddingFormatLabel(value: WeddingFormat | null | undefined): string {
  return WEDDING_FORMAT_OPTIONS.find((option) => option.value === value)?.label ?? "Not selected";
}

export function weddingFormatFromDeepLink(value: string | null | undefined): WeddingFormat | null {
  const normalized = value?.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (normalized === "small" || normalized === "small-wedding" || normalized === "micro-wedding") return "micro";
  if (normalized === "elope") return "elopement";
  return normalizeWeddingFormat(normalized);
}

export function weddingFormatFromWorkspace(value: unknown): WeddingFormat | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as { contextCards?: Array<{ planningContext?: { weddingFormat?: unknown; wedding_format?: unknown } }> };
  for (const card of state.contextCards ?? []) {
    const format = parseWeddingFormat(card.planningContext?.weddingFormat ?? card.planningContext?.wedding_format);
    if (format) return format;
  }
  return null;
}
