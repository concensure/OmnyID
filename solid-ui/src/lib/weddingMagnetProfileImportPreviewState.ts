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

function factsFromProfile(value: unknown): WeddingMagnetImportFact[] {
  const root = record(value);
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
}

function budgetEnvelopeProfile(value: unknown): Record<string, unknown> | null {
  const envelope = record(value);
  if (envelope.version !== 1 || envelope.schema !== "budget_reality_check") return null;
  const resultId = clean(envelope.result_id, 80);
  const recordedAt = clean(envelope.updated_at, 40) || clean(envelope.created_at, 40);
  const inputs = record(envelope.inputs);
  const result = record(envelope.result);
  if (!resultId || !recordedAt) return null;
  const facts: Record<string, unknown> = {};
  const add = (key: string, factValue: unknown) => {
    if (factValue === undefined || factValue === null || factValue === "") return;
    facts[key] = { key, value: factValue, source_label: "Budget Reality Check", result_id: resultId, recorded_at: recordedAt };
  };
  add("guest_count", Number(inputs.guests));
  add("budget_total_aud", Number(inputs.totalBudget));
  add("state", clean(inputs.state, 8));
  const locationType = clean(inputs.locationType, 40);
  if (locationType && locationType !== "not_decided") add("area_type", locationType === "metro" ? "capital" : locationType);
  const setting = clean(inputs.setting, 160);
  if (setting && setting !== "not_decided") add("setting_preference", setting);
  const priorities = Array.isArray(inputs.priorities) ? inputs.priorities : [];
  if (priorities.length > 0) add("top_priorities", priorities);
  const allocation = Array.isArray(result.allocation)
    ? Object.fromEntries(result.allocation.flatMap((item) => {
      const entry = record(item);
      const id = clean(entry.id, 80);
      return id && typeof entry.amount === "number" ? [[id, entry.amount]] : [];
    }))
    : {};
  if (Object.keys(allocation).length > 0) add("budget_allocation", allocation);
  add("planning_started_at", recordedAt.slice(0, 10));
  return { version: 1, facts };
}

export function weddingMagnetImportFactsFromJsonText(text: string): WeddingMagnetImportFact[] {
  try {
    const value = JSON.parse(text) as unknown;
    const profileFacts = factsFromProfile(value);
    if (profileFacts.length > 0) return profileFacts;
    const envelopeProfile = budgetEnvelopeProfile(value);
    return envelopeProfile ? factsFromProfile(envelopeProfile) : [];
  } catch {
    return [];
  }
}

export function readWeddingMagnetImportFacts(storage: Storage): WeddingMagnetImportFact[] {
  try {
    return weddingMagnetImportFactsFromJsonText(storage.getItem(WEDDING_MAGNET_PROFILE_STORAGE_KEY) ?? "null");
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
