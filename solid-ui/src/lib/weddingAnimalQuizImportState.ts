// @locs-version: 1.0
import type { SendAfpMessageInput } from "@/lib/api";
import { weddingFacetsForPhrase } from "@/lib/weddingFacetVocabularyState";
import { weddingIntakeProfileToAfpSendInput } from "@/lib/weddingIntakeProfileAfpProjectionState";
import type { WeddingPlanningContext } from "@/lib/weddingNeedToKnowProbingState";
import { weddingPreferenceProfileToAfpSendInput } from "@/lib/weddingPreferenceProfileAfpState";
import type { WeddingPreferenceFacet, WeddingPreferenceProfile } from "@/lib/weddingPreferenceProfileState";
import type { WeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";

export const WEDDING_ANIMAL_QUIZ_HANDOFF_KEY = "omnyid.wedding.animal_quiz.handoff.v1";

export type WeddingAnimalQuizHandoff = {
  version: 1;
  created_at: string;
  expires_at: string;
  animal_title: string | null;
  guest_range: { min: number; max: number } | null;
  budget_comfort: string | null;
  location: string | null;
  date_or_season: string | null;
  top_priorities: string[];
  atmosphere_keywords: string[];
  venue_vibes: string[];
  values: string[];
};

function clean(value: unknown, limit = 120): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, limit) : null;
}

function strings(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => clean(item)).filter((item): item is string => Boolean(item)))].slice(0, limit);
}

function date(value: unknown): string | null {
  const result = clean(value, 64);
  return result && Number.isFinite(Date.parse(result)) ? result : null;
}

function guestRange(value: unknown): WeddingAnimalQuizHandoff["guest_range"] {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const min = typeof record.min === "number" ? Math.round(record.min) : Number.NaN;
  const max = typeof record.max === "number" ? Math.round(record.max) : Number.NaN;
  return Number.isFinite(min) && Number.isFinite(max) && min >= 1 && max >= min && max <= 10_000 ? { min, max } : null;
}

/** Untrusted browser handoffs are bounded, schema checked and expired before AFP sees them. */
export function readWeddingAnimalQuizHandoff(storage: Storage, now = new Date()): WeddingAnimalQuizHandoff | null {
  try {
    const raw = storage.getItem(WEDDING_ANIMAL_QUIZ_HANDOFF_KEY);
    if (!raw || raw.length > 12_000) return null;
    const value = JSON.parse(raw);
    const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const createdAt = date(record.created_at);
    const expiresAt = date(record.expires_at);
    if (record.version !== 1 || !createdAt || !expiresAt || Date.parse(expiresAt) <= now.getTime()) {
      if (expiresAt && Date.parse(expiresAt) <= now.getTime()) storage.removeItem(WEDDING_ANIMAL_QUIZ_HANDOFF_KEY);
      return null;
    }
    const result: WeddingAnimalQuizHandoff = {
      version: 1,
      created_at: createdAt,
      expires_at: expiresAt,
      animal_title: clean(record.animal_title),
      guest_range: guestRange(record.guest_range),
      budget_comfort: clean(record.budget_comfort),
      location: clean(record.location),
      date_or_season: clean(record.date_or_season),
      top_priorities: strings(record.top_priorities, 3),
      atmosphere_keywords: strings(record.atmosphere_keywords, 6),
      venue_vibes: strings(record.venue_vibes, 4),
      values: strings(record.values, 5),
    };
    return result.top_priorities.length || result.atmosphere_keywords.length || result.venue_vibes.length || result.guest_range
      ? result
      : null;
  } catch {
    return null;
  }
}

function handoffPhrases(handoff: WeddingAnimalQuizHandoff): string[] {
  return [...new Set([
    ...handoff.top_priorities,
    ...handoff.atmosphere_keywords,
    ...handoff.venue_vibes,
    ...handoff.values,
  ].filter(Boolean))];
}

export function weddingAnimalQuizHandoffToPreferenceProfile(handoff: WeddingAnimalQuizHandoff): WeddingPreferenceProfile {
  const facets: WeddingPreferenceFacet[] = [];
  const unmapped: string[] = [];
  for (const phrase of handoffPhrases(handoff)) {
    const matches = weddingFacetsForPhrase(phrase);
    if (matches.length === 0) {
      unmapped.push(phrase);
      continue;
    }
    for (const match of matches) facets.push({
      facetId: match.id,
      weight: handoff.top_priorities.includes(phrase) ? "strong" : "nice",
      polarity: 1,
      anchor: phrase,
      anchorSource: "lead_magnet",
      confidence: 0.7,
      authority: "deterministic",
    });
  }
  const unique = new Map<string, WeddingPreferenceFacet>();
  for (const facet of facets) if (!unique.has(facet.facetId)) unique.set(facet.facetId, facet);
  return { facets: [...unique.values()], unmapped: [...new Set(unmapped)] };
}

function quizPlanningContext(handoff: WeddingAnimalQuizHandoff, existing: WeddingPlanningContext): WeddingPlanningContext {
  const guestRangeLabel = handoff.guest_range ? `${handoff.guest_range.min}–${handoff.guest_range.max}` : null;
  const atmosphere = [...handoff.atmosphere_keywords, ...handoff.venue_vibes].join(", ") || null;
  return {
    ...existing,
    dateOrSeason: existing.dateOrSeason ?? handoff.date_or_season,
    location: existing.location ?? handoff.location,
    guestCount: existing.guestCount ?? guestRangeLabel,
    budgetComfort: existing.budgetComfort ?? handoff.budget_comfort,
    topPriorities: existing.topPriorities?.length ? existing.topPriorities : handoff.top_priorities,
    atmosphereDescription: existing.atmosphereDescription ?? atmosphere,
    vendorPreferences: existing.vendorPreferences ?? (handoff.venue_vibes.join(", ") || null),
  };
}

function fingerprint(handoff: WeddingAnimalQuizHandoff): string {
  const material = [handoff.created_at, ...handoffPhrases(handoff), handoff.budget_comfort, handoff.location].join("|").toLowerCase();
  let hash = 2166136261;
  for (const character of material) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `animal_quiz:${(hash >>> 0).toString(36)}`;
}

export type WeddingAnimalQuizImportResult =
  | { status: "nothing_to_import" }
  | { status: "imported"; profile: WeddingPreferenceProfile; messageId: string; fingerprint: string; summary: string };

/** Saves a private AFP preference event and intake projection, then consumes the one-time handoff. */
export async function importWeddingAnimalQuizHandoff(input: {
  storage: Storage;
  metadata: WeddingPlanningMetadata;
  existingPlanning: WeddingPlanningContext;
  saveProjection: (message: SendAfpMessageInput) => Promise<unknown>;
  now?: Date;
}): Promise<WeddingAnimalQuizImportResult> {
  const handoff = readWeddingAnimalQuizHandoff(input.storage, input.now);
  if (!handoff) return { status: "nothing_to_import" };
  const profile = weddingAnimalQuizHandoffToPreferenceProfile(handoff);
  const id = fingerprint(handoff);
  const preference = weddingPreferenceProfileToAfpSendInput({
    metadata: input.metadata,
    profile,
    revision: id,
    createdAt: handoff.created_at,
    derivedFromSignals: ["wedding_animal_quiz_explicit_handoff"],
  });
  preference.metadata = { ...(preference.metadata ?? {}), import_source: "wedding_animal_quiz", import_fingerprint: id };
  const saved = await input.saveProjection(preference);
  const savedRecord = saved && typeof saved === "object" ? saved as Record<string, unknown> : {};
  const intake = weddingIntakeProfileToAfpSendInput({
    metadata: input.metadata,
    planningContext: quizPlanningContext(handoff, input.existingPlanning),
    answeredLabels: ["Imported from the Wedding Animal Quiz after account consent"],
    nextQuestionLabel: "Review these quiz preferences and add any missing wedding details.",
    readyForFirstRecommendations: false,
  }, handoff.created_at);
  intake.metadata = { ...(intake.metadata ?? {}), import_source: "wedding_animal_quiz", import_fingerprint: id };
  await input.saveProjection(intake);
  input.storage.removeItem(WEDDING_ANIMAL_QUIZ_HANDOFF_KEY);
  return {
    status: "imported",
    profile,
    messageId: typeof savedRecord.message_id === "string" ? savedRecord.message_id : preference.id ?? "",
    fingerprint: id,
    summary: handoff.top_priorities.slice(0, 2).join(" and ") || handoff.animal_title || "your quiz preferences",
  };
}
