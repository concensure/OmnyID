// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";
import { accountScopedStorageKey, accountScopedStorageReadKey } from "@/lib/accountScopedStorage";

export const ACTIVATION_TIMES_KEY = "omnyid.skill-activation-times";
export const ACTIVATION_HISTORY_KEY = "omnyid.skill-activation-history";
export const PROFILES_KEY = "omnyid.skill-profiles";

export type ActivationRecord = {
  activated_at: string;
  deactivated_at?: string;
  scope: string;
};

export type SkillProfile = {
  id: string;
  name: string;
  skill_ids: string[];
  created_at: string;
};

function readTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeActivationRecord(value: unknown): ActivationRecord | null {
  if (!isRecord(value)) return null;
  const activatedAt = readTrimmedString(value.activated_at);
  const scope = readTrimmedString(value.scope);
  if (!activatedAt || !scope) return null;
  const deactivatedAt = readTrimmedString(value.deactivated_at) ?? undefined;
  return {
    activated_at: activatedAt,
    scope,
    ...(deactivatedAt ? { deactivated_at: deactivatedAt } : {}),
  };
}

function normalizeSkillProfile(value: unknown): SkillProfile | null {
  if (!isRecord(value)) return null;
  const id = readTrimmedString(value.id);
  const name = readTrimmedString(value.name);
  const createdAt = readTrimmedString(value.created_at);
  if (!id || !name || !createdAt || !Array.isArray(value.skill_ids)) return null;
  const skillIds = value.skill_ids
    .filter((skillId): skillId is string => typeof skillId === "string")
    .map((skillId) => skillId.trim())
    .filter((skillId, index, skillIds) => skillId.length > 0 && skillIds.indexOf(skillId) === index);
  return {
    id,
    name,
    skill_ids: skillIds,
    created_at: createdAt,
  };
}

function normalizeActivationTimes(value: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([skillId, activatedAt]): Array<[string, number]> => {
      const trimmedSkillId = skillId.trim();
      return trimmedSkillId && isFinitePositiveNumber(activatedAt) ? [[trimmedSkillId, activatedAt]] : [];
    }),
  );
}

function normalizeActivationHistory(value: Record<string, unknown>): Record<string, ActivationRecord[]> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([skillId, records]): Array<[string, ActivationRecord[]]> => {
      const trimmedSkillId = skillId.trim();
      if (!trimmedSkillId || !Array.isArray(records)) return [];
      const normalized = records
        .map(normalizeActivationRecord)
        .filter((record): record is ActivationRecord => record !== null);
      return normalized.length > 0 ? [[trimmedSkillId, normalized]] : [];
    }),
  );
}

function removeMalformedStorageValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures for convenience state.
  }
}

function skillsScopedStorageKey(baseKey: string, userId?: string | null): string {
  return accountScopedStorageKey(baseKey, userId ?? null);
}

function loadSkillsStorageValue(baseKey: string, userId?: string | null): string | null {
  return localStorage.getItem(accountScopedStorageReadKey(baseKey, userId));
}

function removeSkillsStorageValue(baseKey: string, userId?: string | null): void {
  const scopedKey = skillsScopedStorageKey(baseKey, userId);
  removeMalformedStorageValue(scopedKey);
  if (scopedKey !== baseKey) removeMalformedStorageValue(baseKey);
}

function writeSkillsStorageValue(baseKey: string, stored: string | null, value: unknown, userId?: string | null): void {
  const scopedKey = skillsScopedStorageKey(baseKey, userId);
  const normalizedJson = JSON.stringify(value);
  if (stored === normalizedJson && localStorage.getItem(scopedKey) === normalizedJson) return;
  try {
    localStorage.setItem(scopedKey, normalizedJson);
    if (scopedKey !== baseKey) localStorage.removeItem(baseKey);
  } catch {
    // Ignore storage write failures for convenience state.
  }
}

function writeNormalizedStorageValue(key: string, stored: string | null, value: unknown): void {
  const normalizedJson = JSON.stringify(value);
  if (stored === normalizedJson) return;
  try {
    localStorage.setItem(key, normalizedJson);
  } catch {
    // Ignore storage write failures for convenience state.
  }
}

export function loadActivationTimes(userId?: string | null): Record<string, number> {
  try {
    const stored = loadSkillsStorageValue(ACTIVATION_TIMES_KEY, userId);
    if (!stored) return {};
    const parsed = parseJsonValue(stored);
    if (!parsed.ok) {
      removeSkillsStorageValue(ACTIVATION_TIMES_KEY, userId);
      return {};
    }
    const normalized = isRecord(parsed.value) ? normalizeActivationTimes(parsed.value) : {};
    writeSkillsStorageValue(ACTIVATION_TIMES_KEY, stored, normalized, userId);
    return normalized;
  } catch {
    removeSkillsStorageValue(ACTIVATION_TIMES_KEY, userId);
    return {};
  }
}

export function saveActivationTimes(times: Record<string, number>, userId?: string | null) {
  try {
    writeSkillsStorageValue(ACTIVATION_TIMES_KEY, null, normalizeActivationTimes(times), userId);
  } catch {
    // Ignore localStorage write failures for convenience state.
  }
}

export function loadActivationHistory(userId?: string | null): Record<string, ActivationRecord[]> {
  try {
    const stored = loadSkillsStorageValue(ACTIVATION_HISTORY_KEY, userId);
    if (!stored) return {};
    const parsed = parseJsonValue(stored);
    if (!parsed.ok) {
      removeSkillsStorageValue(ACTIVATION_HISTORY_KEY, userId);
      return {};
    }
    const normalized = isRecord(parsed.value) ? normalizeActivationHistory(parsed.value) : {};
    writeSkillsStorageValue(ACTIVATION_HISTORY_KEY, stored, normalized, userId);
    return normalized;
  } catch {
    removeSkillsStorageValue(ACTIVATION_HISTORY_KEY, userId);
    return {};
  }
}

export function saveActivationHistory(history: Record<string, ActivationRecord[]>, userId?: string | null) {
  try {
    writeSkillsStorageValue(ACTIVATION_HISTORY_KEY, null, normalizeActivationHistory(history), userId);
  } catch {
    // Ignore localStorage write failures for convenience state.
  }
}

export function loadProfiles(userId?: string | null): SkillProfile[] {
  try {
    const stored = loadSkillsStorageValue(PROFILES_KEY, userId);
    if (!stored) return [];
    const parsed = parseJsonValue(stored);
    if (!parsed.ok) {
      removeSkillsStorageValue(PROFILES_KEY, userId);
      return [];
    }
    const normalized = Array.isArray(parsed.value)
      ? parsed.value
        .map(normalizeSkillProfile)
        .filter((profile): profile is SkillProfile => profile !== null)
      : [];
    writeSkillsStorageValue(PROFILES_KEY, stored, normalized, userId);
    return normalized;
  } catch {
    removeSkillsStorageValue(PROFILES_KEY, userId);
    return [];
  }
}

export function saveProfiles(profiles: SkillProfile[], userId?: string | null) {
  try {
    writeSkillsStorageValue(
      PROFILES_KEY,
      null,
      profiles
        .map(normalizeSkillProfile)
        .filter((profile): profile is SkillProfile => profile !== null),
      userId,
    );
  } catch {
    // Ignore localStorage write failures for convenience state.
  }
}
