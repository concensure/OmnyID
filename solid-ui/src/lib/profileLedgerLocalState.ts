// @locs-version: 1.0
import { DEFAULT_VALUE_WEIGHTS, type CoreValueKey } from "@/lib/profileLedger";
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";

export const VALUE_SETTINGS_KEY = "omnyid.profile.value-weights.v1";
export const VALUE_OVERRIDE_KEY = "omnyid.profile.value-override.v1";

export type ProfileLedgerValueWeights = Record<CoreValueKey, number>;

function clampWeight(value: unknown, fallback: number): number {
  return typeof value === "number" ? Math.min(1, Math.max(0, value)) : fallback;
}

function normalizeValueWeights(value: unknown): ProfileLedgerValueWeights {
  const parsed = isRecord(value) ? value : {};
  return {
    health: clampWeight(parsed.health, DEFAULT_VALUE_WEIGHTS.health),
    family: clampWeight(parsed.family, DEFAULT_VALUE_WEIGHTS.family),
    wealth: clampWeight(parsed.wealth, DEFAULT_VALUE_WEIGHTS.wealth),
    social_life: clampWeight(parsed.social_life, DEFAULT_VALUE_WEIGHTS.social_life),
  };
}

function normalizeValueOverride(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function writeProfileLedgerStorageValue(key: string, value: string): "ok" | "quota_exceeded" {
  try {
    localStorage.setItem(key, value);
    return "ok";
  } catch {
    return "quota_exceeded";
  }
}

function removeProfileLedgerStorageValue(key: string): "ok" | "quota_exceeded" {
  try {
    localStorage.removeItem(key);
    return "ok";
  } catch {
    return "quota_exceeded";
  }
}

function scopedProfileLedgerStorageKey(baseKey: string, userId?: string | null): string {
  return accountScopedStorageKey(baseKey, userId ?? null);
}

function loadProfileLedgerStorageValue(baseKey: string, userId?: string | null): string | null {
  const scopedKey = scopedProfileLedgerStorageKey(baseKey, userId);
  return localStorage.getItem(scopedKey) ?? localStorage.getItem(baseKey);
}

function writeScopedProfileLedgerStorageValue(
  baseKey: string,
  value: string,
  userId?: string | null,
): "ok" | "quota_exceeded" {
  const scopedKey = scopedProfileLedgerStorageKey(baseKey, userId);
  const result = writeProfileLedgerStorageValue(scopedKey, value);
  if (result === "ok" && scopedKey !== baseKey) removeProfileLedgerStorageValue(baseKey);
  return result;
}

function removeScopedProfileLedgerStorageValue(
  baseKey: string,
  userId?: string | null,
): "ok" | "quota_exceeded" {
  const scopedKey = scopedProfileLedgerStorageKey(baseKey, userId);
  const result = removeProfileLedgerStorageValue(scopedKey);
  if (scopedKey !== baseKey) removeProfileLedgerStorageValue(baseKey);
  return result;
}

export function loadProfileLedgerValueWeights(userId?: string | null): ProfileLedgerValueWeights {
  try {
    const raw = loadProfileLedgerStorageValue(VALUE_SETTINGS_KEY, userId);
    if (!raw) return { ...DEFAULT_VALUE_WEIGHTS };
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeScopedProfileLedgerStorageValue(VALUE_SETTINGS_KEY, userId);
      return { ...DEFAULT_VALUE_WEIGHTS };
    }
    const normalized = normalizeValueWeights(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (
      serialized !== raw
      || localStorage.getItem(scopedProfileLedgerStorageKey(VALUE_SETTINGS_KEY, userId)) !== serialized
    ) {
      writeScopedProfileLedgerStorageValue(VALUE_SETTINGS_KEY, serialized, userId);
    }
    return normalized;
  } catch {
    removeScopedProfileLedgerStorageValue(VALUE_SETTINGS_KEY, userId);
    return { ...DEFAULT_VALUE_WEIGHTS };
  }
}

export function saveProfileLedgerValueWeights(
  weights: ProfileLedgerValueWeights,
  userId?: string | null,
): "ok" | "quota_exceeded" {
  return writeScopedProfileLedgerStorageValue(
    VALUE_SETTINGS_KEY,
    JSON.stringify(normalizeValueWeights(weights)),
    userId,
  );
}

export function loadProfileLedgerValueOverride(userId?: string | null): string {
  try {
    const raw = loadProfileLedgerStorageValue(VALUE_OVERRIDE_KEY, userId);
    const normalized = normalizeValueOverride(raw);
    if (
      normalized
      && (
        normalized !== raw
        || localStorage.getItem(scopedProfileLedgerStorageKey(VALUE_OVERRIDE_KEY, userId)) !== normalized
      )
    ) {
      writeScopedProfileLedgerStorageValue(VALUE_OVERRIDE_KEY, normalized, userId);
    }
    if (!normalized && raw !== null) removeScopedProfileLedgerStorageValue(VALUE_OVERRIDE_KEY, userId);
    return normalized;
  } catch {
    return "";
  }
}

export function saveProfileLedgerValueOverride(
  summary: string,
  userId?: string | null,
): "ok" | "quota_exceeded" {
  const normalized = normalizeValueOverride(summary);
  if (normalized) return writeScopedProfileLedgerStorageValue(VALUE_OVERRIDE_KEY, normalized, userId);
  return removeScopedProfileLedgerStorageValue(VALUE_OVERRIDE_KEY, userId);
}
