// @locs-version: 1.0
// The public result remains browser-local until an authenticated AFP save succeeds.
import type { SendAfpMessageInput } from "@/lib/api";
import { weddingFacetsForPhrase } from "@/lib/weddingFacetVocabularyState";
import { weddingPreferenceProfileToAfpSendInput } from "@/lib/weddingPreferenceProfileAfpState";
import type { WeddingPreferenceFacet, WeddingPreferenceProfile } from "@/lib/weddingPreferenceProfileState";
import type { WeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";

export const WEDDING_LEAD_MAGNET_RECORD_KEY = "omnyid.wedding.understanding.v1";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type WeddingLeadMagnetPair = { a: string; b: string };
export type WeddingLeadMagnetRecord = {
  version: 1;
  created_at: string;
  expires_at: string;
  core_theme: string;
  preferences: WeddingLeadMagnetPair[];
  largest_tension: string | null;
  opening_observation: string | null;
};

function clean(value: unknown, limit = 400): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function iso(value: unknown): string | null {
  const text = clean(value, 64);
  return text && Number.isFinite(Date.parse(text)) ? text : null;
}

function validPair(value: unknown): WeddingLeadMagnetPair | null {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const a = clean(row.a);
  const b = clean(row.b);
  return a && b ? { a, b } : null;
}

/** Invalid records are ignored; expired records are actively removed. */
export function readLeadMagnetRecord(storage: Storage, now = new Date()): WeddingLeadMagnetRecord | null {
  try {
    const value = JSON.parse(storage.getItem(WEDDING_LEAD_MAGNET_RECORD_KEY) ?? "null");
    const row = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    const createdAt = iso(row.created_at);
    const expiresAt = iso(row.expires_at);
    if (row.version !== 1 || !createdAt || !expiresAt || Date.parse(expiresAt) <= now.getTime()) {
      if (expiresAt && Date.parse(expiresAt) <= now.getTime()) storage.removeItem(WEDDING_LEAD_MAGNET_RECORD_KEY);
      return null;
    }
    const preferences = Array.isArray(row.preferences)
      ? row.preferences.map(validPair).filter((pair): pair is WeddingLeadMagnetPair => Boolean(pair)).slice(0, 12)
      : [];
    const coreTheme = clean(row.core_theme);
    if (!coreTheme && preferences.length === 0) return null;
    return {
      version: 1,
      created_at: createdAt,
      expires_at: expiresAt,
      core_theme: coreTheme,
      preferences,
      largest_tension: clean(row.largest_tension) || null,
      opening_observation: clean(row.opening_observation) || null,
    };
  } catch {
    return null;
  }
}

/** Store model output only. Raw prompt text and uploaded images are not accepted here. */
export function writeLeadMagnetRecord(
  storage: Storage,
  value: Omit<WeddingLeadMagnetRecord, "version" | "created_at" | "expires_at">,
  now = new Date(),
): WeddingLeadMagnetRecord {
  const record: WeddingLeadMagnetRecord = {
    version: 1,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + THIRTY_DAYS_MS).toISOString(),
    core_theme: clean(value.core_theme),
    preferences: value.preferences.map(validPair).filter((pair): pair is WeddingLeadMagnetPair => Boolean(pair)).slice(0, 12),
    largest_tension: clean(value.largest_tension) || null,
    opening_observation: clean(value.opening_observation) || null,
  };
  try { storage.setItem(WEDDING_LEAD_MAGNET_RECORD_KEY, JSON.stringify(record)); } catch { /* result stays visible */ }
  return record;
}

export function leadMagnetPairsToProfileInput(record: WeddingLeadMagnetRecord): {
  atmosphere: string | null;
  tradeoffs: string[];
  fingerprint: string;
} {
  const tradeoffs = record.preferences.map((pair) => `${pair.a} over ${pair.b}`);
  const material = [record.created_at, record.core_theme, ...tradeoffs].join("|").toLowerCase();
  let hash = 2166136261;
  for (const character of material) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return {
    atmosphere: record.core_theme || null,
    tradeoffs,
    fingerprint: `wedding_understanding:${(hash >>> 0).toString(36)}`,
  };
}

/** Generated preferences are reviewable nice-to-haves, never silent must-haves. */
export function leadMagnetRecordToPreferenceProfile(record: WeddingLeadMagnetRecord): WeddingPreferenceProfile {
  const phrases = [record.core_theme, ...record.preferences.flatMap((pair) => [pair.a, pair.b])].filter(Boolean);
  const unmapped: string[] = [];
  const facets: WeddingPreferenceFacet[] = [];
  for (const phrase of phrases) {
    const matches = weddingFacetsForPhrase(phrase);
    if (matches.length === 0) {
      unmapped.push(phrase);
      continue;
    }
    for (const match of matches) {
      facets.push({
        facetId: match.id,
        weight: "nice",
        polarity: 1,
        anchor: phrase,
        anchorSource: "lead_magnet",
        confidence: 0.6,
        authority: "deterministic",
      });
    }
  }
  const chosen = new Map<string, WeddingPreferenceFacet>();
  for (const facet of facets) if (!chosen.has(facet.facetId)) chosen.set(facet.facetId, facet);
  return {
    facets: [...chosen.values()].sort((left, right) => left.facetId.localeCompare(right.facetId)),
    unmapped: [...new Set(unmapped)],
  };
}

export function deleteLeadMagnetRecord(storage: Storage): void {
  try { storage.removeItem(WEDDING_LEAD_MAGNET_RECORD_KEY); } catch { /* retry on a later app load */ }
}

export type WeddingLeadMagnetImportResult =
  | { status: "nothing_to_import" }
  | { status: "imported"; fingerprint: string; profile: WeddingPreferenceProfile; input: SendAfpMessageInput; messageId: string; summary: string };

/** The deterministic message id makes a retry converge through AFP replay handling. */
export async function importWeddingLeadMagnetRecord(input: {
  storage: Storage;
  metadata: WeddingPlanningMetadata;
  saveProjection: (message: SendAfpMessageInput) => Promise<unknown>;
  now?: Date;
}): Promise<WeddingLeadMagnetImportResult> {
  const record = readLeadMagnetRecord(input.storage, input.now);
  if (!record) return { status: "nothing_to_import" };
  const profile = leadMagnetRecordToPreferenceProfile(record);
  const details = leadMagnetPairsToProfileInput(record);
  const message = weddingPreferenceProfileToAfpSendInput({
    metadata: input.metadata,
    profile,
    tradeoffs: record.preferences.map((pair) => ({ prefer: pair.a, over: pair.b, anchor: `${pair.a} over ${pair.b}` })),
    revision: `lead-magnet-${details.fingerprint}`,
    createdAt: record.created_at,
  });
  message.metadata = {
    ...(message.metadata ?? {}),
    import_source: "wedding_understanding",
    import_fingerprint: details.fingerprint,
  };
  const saved = await input.saveProjection(message);
  const savedRecord = saved && typeof saved === "object" ? saved as Record<string, unknown> : {};
  const messageId = typeof savedRecord.message_id === "string" && savedRecord.message_id.trim()
    ? savedRecord.message_id
    : message.id ?? "";
  deleteLeadMagnetRecord(input.storage);
  const pairLabels = record.preferences.map((pair) => `${pair.a} over ${pair.b}`);
  const summary = pairLabels.length > 2
    ? `${pairLabels.slice(0, 2).join(" and ")} +${pairLabels.length - 2} more`
    : pairLabels.join(" and ") || record.core_theme;
  return { status: "imported", fingerprint: details.fingerprint, profile, input: message, messageId, summary };
}
