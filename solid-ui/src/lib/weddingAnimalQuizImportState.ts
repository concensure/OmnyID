// @locs-version: 1.0
import type { SendAfpMessageInput } from "@/lib/api";
import { weddingFacetsForPhrase } from "@/lib/weddingFacetVocabularyState";
import { weddingDealBreakerToAfpSendInput } from "@/lib/weddingDealBreakerAfpState";
import { weddingIntakeProfileToAfpSendInput } from "@/lib/weddingIntakeProfileAfpProjectionState";
import type { WeddingPlanningContext } from "@/lib/weddingNeedToKnowProbingState";
import { weddingPreferenceProfileToAfpSendInput } from "@/lib/weddingPreferenceProfileAfpState";
import type { WeddingPreferenceFacet, WeddingPreferenceProfile } from "@/lib/weddingPreferenceProfileState";
import type { WeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";

export const WEDDING_ANIMAL_QUIZ_HANDOFF_KEY = "omnyid.wedding.animal_quiz.handoff.v1";
export const WEDDING_ANIMAL_QUIZ_BRIEF_KEY = "omnyid.wedding.coupleBrief.v1";

const QUIZ_PRIORITY_LABELS: Record<string, string> = {
  food: "Food & drink", music: "Music & dancing", photos: "Photos & video",
  design: "Design & flowers", ceremony: "The ceremony itself",
  people: "Everyone there & comfortable", venue: "The venue",
  attire: "What we wear", convenience: "Keeping it easy",
  sustainability: "Low-waste & sustainable",
};
const QUIZ_DEAL_BREAKER_LABELS: Record<string, string> = {
  debt: "Going into debt", conflict: "Family conflict", nophotos: "No photos of the day",
  boring: "A boring party", generic: "Feeling generic", stress: "Planning stress",
};
const QUIZ_FAMILY_LABELS: Record<string, string> = {
  traditional: "Family has a big say", cohost: "Family co-hosts",
  independent: "Our day, our call", compromise: "We’ll find a middle path",
};

export type WeddingAnimalQuizHandoff = {
  version: 1 | 2;
  created_at: string;
  expires_at: string;
  animal_title: string | null;
  guest_range: { min: number; max: number } | null;
  budget_comfort: string | null;
  budget_stretch: string | null;
  location: string | null;
  date_or_season: string | null;
  top_priorities: string[];
  atmosphere_keywords: string[];
  venue_vibes: string[];
  values: string[];
  deal_breakers: string[];
  family_involvement: string | null;
  dimension_scores: Array<{ code: string; score: number | null; count: number }>;
  evidence_answer_ids: string[];
  evidence_labels: string[];
  planning_preferences: {
    inspiration: string | null;
    reminders: string | null;
    guest_planning: string | null;
    budget_trade_off: string | null;
    shortlist_tempo: string | null;
    approval_workflow: string | null;
  } | null;
  requires_confirmation: boolean;
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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nested(value: unknown, key: string): Record<string, unknown> {
  return record(record(value)[key]);
}

function json(raw: string): unknown | null {
  try { return JSON.parse(raw); } catch { return null; }
}

function labels(value: unknown, mapping: Record<string, string>, limit: number): string[] {
  return strings(value, limit).map((item) => mapping[item] ?? item);
}

function parsedHandoff(value: unknown, now: Date): WeddingAnimalQuizHandoff | null {
  const source = record(value);
  const createdAt = date(source.created_at);
  const expiresAt = date(source.expires_at);
  if ((source.version !== 1 && source.version !== 2) || !createdAt || !expiresAt || Date.parse(expiresAt) <= now.getTime()) return null;
  const preferences = record(source.planning_preferences);
  const scores = Array.isArray(source.dimension_scores)
    ? source.dimension_scores.map((value) => record(value)).map((value) => ({
        code: clean(value.code, 4) ?? "",
        score: typeof value.score === "number" && value.score >= 0 && value.score <= 100 ? Math.round(value.score) : null,
        count: typeof value.count === "number" && value.count >= 0 ? Math.min(12, Math.round(value.count)) : 0,
      })).filter((value) => /^[OSGFDC]$/.test(value.code)).slice(0, 6)
    : [];
  const result: WeddingAnimalQuizHandoff = {
    version: source.version,
    created_at: createdAt,
    expires_at: expiresAt,
    animal_title: clean(source.animal_title),
    guest_range: guestRange(source.guest_range),
    budget_comfort: clean(source.budget_comfort),
    budget_stretch: clean(source.budget_stretch),
    location: clean(source.location),
    date_or_season: clean(source.date_or_season),
    top_priorities: strings(source.top_priorities, 3),
    atmosphere_keywords: strings(source.atmosphere_keywords, 6),
    venue_vibes: strings(source.venue_vibes, 4),
    values: strings(source.values, 5),
    deal_breakers: strings(source.deal_breakers, 3),
    family_involvement: clean(source.family_involvement),
    dimension_scores: scores,
    evidence_answer_ids: strings(source.evidence_answer_ids, 12),
    evidence_labels: strings(source.evidence_labels, 12),
    planning_preferences: source.version === 2 ? {
      inspiration: clean(preferences.inspiration),
      reminders: clean(preferences.reminders),
      guest_planning: clean(preferences.guest_planning),
      budget_trade_off: clean(preferences.budget_trade_off),
      shortlist_tempo: clean(preferences.shortlist_tempo),
      approval_workflow: clean(preferences.approval_workflow),
    } : null,
    requires_confirmation: source.requires_confirmation !== false,
  };
  return result.top_priorities.length || result.atmosphere_keywords.length || result.venue_vibes.length
    || result.deal_breakers.length || result.guest_range || result.dimension_scores.length ? result : null;
}

/** Compatibility adapter for completed quizzes saved before the explicit handoff was introduced. */
function legacyBriefToHandoff(value: unknown, now: Date): WeddingAnimalQuizHandoff | null {
  const source = record(value);
  if (source.schema !== "omnyid.wedding.couple_brief" || source.version !== 1 || source.source !== "wedding_animal_quiz") return null;
  const createdAt = date(source.created_at);
  if (!createdAt) return null;
  const expiresAt = new Date(Date.parse(createdAt) + 30 * 24 * 60 * 60 * 1000);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) return null;
  const budget = record(source.budget);
  const location = record(source.location);
  const priorities = record(source.priorities);
  const style = record(source.style);
  const coupleAnimal = nested(source.couple, "animal");
  return parsedHandoff({
    version: 1,
    created_at: createdAt,
    expires_at: expiresAt.toISOString(),
    animal_title: coupleAnimal.title,
    guest_range: record(source.guests).range,
    budget_comfort: record(budget.comfort).label,
    budget_stretch: record(budget.stretch).label,
    location: location.region_label,
    date_or_season: record(source.timeframe).label,
    top_priorities: labels(priorities.top3, QUIZ_PRIORITY_LABELS, 3),
    atmosphere_keywords: strings(style.keywords, 6),
    venue_vibes: strings(location.venue_vibe_labels, 4),
    values: strings(source.values, 5),
    deal_breakers: labels(source.dealbreakers, QUIZ_DEAL_BREAKER_LABELS, 3),
    family_involvement: QUIZ_FAMILY_LABELS[clean(source.family_involvement) ?? ""] ?? clean(source.family_involvement),
    dimension_scores: [], evidence_answer_ids: [], evidence_labels: [], planning_preferences: null,
    requires_confirmation: true,
  }, now);
}

export type WeddingAnimalQuizOnboardingSeed = {
  budgetComfort: string;
  prioritiesCsv: string;
  atmosphereDescription: string;
  quizSummary: string[];
};

/** Quiz signals are suggestions only: never manufacture a guest count, budget amount, date or location. */
export function weddingAnimalQuizHandoffToOnboardingSeed(
  handoff: WeddingAnimalQuizHandoff,
): WeddingAnimalQuizOnboardingSeed {
  const preferences = handoff.planning_preferences;
  const summary = preferences ? [
    preferences.inspiration,
    preferences.reminders,
    preferences.guest_planning,
    preferences.budget_trade_off,
    preferences.shortlist_tempo,
    preferences.approval_workflow,
  ].filter((value): value is string => Boolean(value)) : [];
  return {
    budgetComfort: preferences?.budget_trade_off ?? handoff.budget_comfort ?? "",
    prioritiesCsv: handoff.top_priorities.join(", "),
    atmosphereDescription: preferences?.inspiration ?? handoff.atmosphere_keywords.join("; "),
    quizSummary: [...new Set(summary)],
  };
}

/** Untrusted browser handoffs are bounded, schema checked and expired before AFP sees them. */
export function readWeddingAnimalQuizHandoff(storage: Storage, now = new Date()): WeddingAnimalQuizHandoff | null {
  try {
    const raw = storage.getItem(WEDDING_ANIMAL_QUIZ_HANDOFF_KEY);
    if (raw && raw.length <= 12_000) {
      const value = json(raw);
      const result = parsedHandoff(value, now);
      if (result) return result;
      const expiresAt = date(record(value).expires_at);
      if (expiresAt && Date.parse(expiresAt) <= now.getTime()) storage.removeItem(WEDDING_ANIMAL_QUIZ_HANDOFF_KEY);
    }
    const legacy = storage.getItem(WEDDING_ANIMAL_QUIZ_BRIEF_KEY);
    if (!legacy || legacy.length > 64_000) return null;
    const value = json(legacy);
    const result = legacyBriefToHandoff(value, now);
    if (!result && Date.parse(date(record(value).created_at) ?? "") + 30 * 24 * 60 * 60 * 1000 <= now.getTime()) {
      storage.removeItem(WEDDING_ANIMAL_QUIZ_BRIEF_KEY);
    }
    return result;
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
    handoff.family_involvement ?? "",
    ...(handoff.planning_preferences ? Object.values(handoff.planning_preferences).filter((value): value is string => Boolean(value)) : []),
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
    budgetComfort: existing.budgetComfort ?? ([handoff.budget_comfort, handoff.budget_stretch && handoff.budget_stretch !== handoff.budget_comfort
      ? `stretch ${handoff.budget_stretch}` : null].filter(Boolean).join("; ") || null),
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

function quizLedgerEvents(
  handoff: WeddingAnimalQuizHandoff,
  metadata: WeddingPlanningMetadata,
  importFingerprint: string,
): SendAfpMessageInput[] {
  if (handoff.version !== 2) return [];
  const common: Pick<SendAfpMessageInput, "thread_id" | "from" | "to" | "timestamp" | "type" | "supertags" | "store_in_relational"> = {
    thread_id: `wedding_animal_quiz:${metadata.responseWorkspaceId}`,
    from: "user://wedding-animal-quiz",
    to: ["agent://wedding-planning"],
    timestamp: handoff.created_at,
    type: "ledger",
    supertags: ["template:wedding_planning", "wedding_animal_quiz", "privacy:private"],
    store_in_relational: true,
  };
  const answers = handoff.evidence_answer_ids.map((answerId, index): SendAfpMessageInput => ({
    ...common,
    id: `wedding_animal_quiz_answer:${importFingerprint}:${index + 1}`,
    kind: "wedding_animal_quiz_answer",
    subtype: "quiz_answer",
    content: {
      quiz_version: handoff.version,
      answer_id: answerId,
      answer_label: handoff.evidence_labels[index] ?? null,
      confirmed_as_planning_fact: false,
    },
    metadata: {
      ...metadata,
      import_source: "wedding_animal_quiz",
      import_fingerprint: importFingerprint,
      privacy_scope: "private",
    },
  }));
  return [
    ...answers,
    {
      ...common,
      id: `wedding_animal_quiz_result:${importFingerprint}`,
      kind: "wedding_animal_quiz_result",
      subtype: "quiz_result",
      content: {
        quiz_version: handoff.version,
        animal_title: handoff.animal_title,
        dimension_scores: handoff.dimension_scores,
        evidence_answer_ids: handoff.evidence_answer_ids,
        requires_confirmation: handoff.requires_confirmation,
      },
      metadata: { ...metadata, import_source: "wedding_animal_quiz", import_fingerprint: importFingerprint, privacy_scope: "private" },
    },
    {
      ...common,
      id: `wedding_animal_quiz_consent:${importFingerprint}`,
      kind: "wedding_animal_quiz_consent",
      subtype: "quiz_account_import_consent",
      content: { quiz_version: handoff.version, consent: "account_import", raw_partner_answers_stored: false },
      metadata: { ...metadata, import_source: "wedding_animal_quiz", import_fingerprint: importFingerprint, privacy_scope: "private" },
    },
  ];
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
    hardConstraints: handoff.deal_breakers.map((anchor) => ({ key: "quiz_deal_breaker", anchor })),
  });
  preference.metadata = { ...(preference.metadata ?? {}), import_source: "wedding_animal_quiz", import_fingerprint: id };
  preference.metadata.quiz_version = handoff.version;
  preference.metadata.confirmation_status = "pending_user_review";
  preference.references = [...(preference.references ?? []), ...handoff.evidence_answer_ids.map((id) => ({
    type: "quiz_answer",
    target: `omnyid://wedding/quiz-answer/${encodeURIComponent(id)}`,
    label: id,
  }))];
  const intake = weddingIntakeProfileToAfpSendInput({
    metadata: input.metadata,
    planningContext: quizPlanningContext(handoff, input.existingPlanning),
    answeredLabels: ["Imported from the Wedding Animal Quiz after account consent"],
    nextQuestionLabel: "Review these quiz preferences and add any missing wedding details.",
    readyForFirstRecommendations: false,
  }, handoff.created_at);
  intake.id = `wedding_animal_quiz_intake:${id}`;
  intake.metadata = {
    ...(intake.metadata ?? {}), import_source: "wedding_animal_quiz", import_fingerprint: id,
    quiz_budget_stretch: handoff.budget_stretch, quiz_family_involvement: handoff.family_involvement,
  };
  const dealBreakers = handoff.deal_breakers.map((label) => {
    const message = weddingDealBreakerToAfpSendInput({ metadata: input.metadata, label, sourceSurface: "vision" });
    message.id = `wedding_animal_quiz_deal_breaker:${id}:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48)}`;
    message.timestamp = handoff.created_at;
    message.metadata = { ...(message.metadata ?? {}), import_source: "wedding_animal_quiz", import_fingerprint: id };
    return message;
  });
  const quizEvents = quizLedgerEvents(handoff, input.metadata, id);
  const [saved] = await Promise.all([preference, intake, ...dealBreakers, ...quizEvents].map((message) => input.saveProjection(message)));
  const savedRecord = saved && typeof saved === "object" ? saved as Record<string, unknown> : {};
  input.storage.removeItem(WEDDING_ANIMAL_QUIZ_HANDOFF_KEY);
  input.storage.removeItem(WEDDING_ANIMAL_QUIZ_BRIEF_KEY);
  return {
    status: "imported",
    profile,
    messageId: typeof savedRecord.message_id === "string" ? savedRecord.message_id : preference.id ?? "",
    fingerprint: id,
    summary: handoff.top_priorities.slice(0, 2).join(" and ") || handoff.animal_title || "your quiz preferences",
  };
}
