// @locs-version: 1.0
// Reads the public Wedding tools' browser-local profile for a reviewable intake
// prefill. This module never writes AFP and never silently confirms a fact.
import {
  WEDDING_MAGNET_PROFILE_FIELDS,
  type WeddingMagnetProfileField,
  type WeddingMagnetProfileTier,
} from "@/lib/weddingMagnetProfileRegistry";

export const WEDDING_MAGNET_PROFILE_STORAGE_KEY = "omnyid.wedding.magnetProfile.v1";

export type WeddingMagnetImportFact = {
  key: string;
  value: unknown;
  displayValue: string;
  sourceLabel: string;
  resultId: string;
  tier: WeddingMagnetProfileTier;
  workspaceTarget: string;
  why: string;
};

export type WeddingMagnetIntakePrefill = {
  weddingDate?: string;
  location?: string;
  guestCount?: string;
  budgetTotal?: string;
  priorities?: string;
  atmosphere?: string;
  coupleNames?: string;
  vendorCategories?: string[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown, limit = 1_200): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function validValue(field: WeddingMagnetProfileField, value: unknown): boolean {
  const limits = field.validation ?? {};
  if (field.type === "string") return Boolean(clean(value, Number(limits.max_length ?? 1_200)));
  if (field.type === "date") return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
  if (field.type === "integer") {
    const number = typeof value === "number" ? value : Number.NaN;
    return Number.isInteger(number)
      && (typeof limits.min !== "number" || number >= limits.min)
      && (typeof limits.max !== "number" || number <= limits.max);
  }
  if (field.type === "string_array") return Array.isArray(value) && value.every((item) => Boolean(clean(item, Number(limits.item_max_length ?? 160))));
  if (field.type === "object") return Boolean(value && typeof value === "object" && !Array.isArray(value));
  if (field.type === "object_array") return Array.isArray(value) && value.every((item) => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  return false;
}

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => clean(item, 80)).filter(Boolean).join(", ").slice(0, 320);
  if (value && typeof value === "object") return "Structured result ready for review";
  if (typeof value === "number") return new Intl.NumberFormat("en-AU").format(value);
  return clean(value, 320);
}

export function readWeddingMagnetImportFacts(storage: Storage): WeddingMagnetImportFact[] {
  try {
    const root = record(JSON.parse(storage.getItem(WEDDING_MAGNET_PROFILE_STORAGE_KEY) ?? "null"));
    if (root.version !== 1) return [];
    const facts = record(root.facts);
    return WEDDING_MAGNET_PROFILE_FIELDS.flatMap((field) => {
      const fact = record(facts[field.key]);
      if (fact.key !== field.key || !validValue(field, fact.value)) return [];
      const sourceLabel = clean(fact.source_label, 100);
      const resultId = clean(fact.result_id, 80);
      if (!sourceLabel || !resultId) return [];
      return [{
        key: field.key,
        value: fact.value,
        displayValue: displayValue(fact.value),
        sourceLabel,
        resultId,
        tier: field.tier,
        workspaceTarget: field.workspace_target,
        why: field.why,
      }];
    });
  } catch {
    return [];
  }
}

function selectedValue(facts: readonly WeddingMagnetImportFact[], key: string): unknown {
  return facts.find((fact) => fact.key === key)?.value;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => clean(item, 100)).filter(Boolean) : [];
}

/** Maps only to fields the existing Wedding intake already owns. */
export function weddingMagnetFactsToIntakePrefill(facts: readonly WeddingMagnetImportFact[]): WeddingMagnetIntakePrefill {
  const style = [
    clean(selectedValue(facts, "style_name"), 120),
    clean(selectedValue(facts, "style_description"), 800),
    ...stringList(selectedValue(facts, "mood_words")),
    ...stringList(selectedValue(facts, "style_tags")),
  ].filter(Boolean);
  const names = stringList(selectedValue(facts, "couple_names"));
  const guestCount = selectedValue(facts, "guest_count");
  const budget = selectedValue(facts, "budget_total_aud");
  return {
    weddingDate: clean(selectedValue(facts, "wedding_date"), 10) || clean(selectedValue(facts, "wedding_date_approx"), 80) || undefined,
    location: clean(selectedValue(facts, "location_label"), 160) || undefined,
    guestCount: typeof guestCount === "number" ? String(guestCount) : undefined,
    budgetTotal: typeof budget === "number" ? String(budget) : undefined,
    priorities: stringList(selectedValue(facts, "top_priorities")).join(", ") || undefined,
    atmosphere: Array.from(new Set(style)).join("; ") || undefined,
    coupleNames: names.join(" and ") || undefined,
    vendorCategories: stringList(selectedValue(facts, "vendor_categories_needed")),
  };
}
