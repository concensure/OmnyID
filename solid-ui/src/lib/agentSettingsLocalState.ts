// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";

export type LatencySnapshot = { ts: number; ms: number };
export type TestHistoryEntry = {
  ts: number;
  model: string;
  ms: number | null;
  ok: boolean;
  reason?: string;
};
export type LoraSnapshot = { date: string; score: number };

export const LLM_LATENCY_KEY = "omnyid.llm.latency_history";
export const LLM_TEST_HISTORY_KEY = "omnyid.llm.test_history";
export const LORA_HISTORY_KEY = "omnyid.lora.history";
export const LLM_PING_KEY = "omnyid.llm.last_ping";
export const LLM_PING_OK_KEY = "omnyid.llm.last_ping_ok";
export const SOUL_SAVED_KEY = "omnyid.soul.saved_at";
export const CAP_LAST_USED_KEY = "omnyid.cap.last_used";
export const CAP_USAGE_COUNT_KEY = "omnyid.cap.usage_count";
export const CAP_DOW_KEY = "omnyid.cap.dow_usage";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeTimestamp(value: unknown): number | null {
  return isFiniteNumber(value) && value >= 0 ? Math.trunc(value) : null;
}

function writeAgentSettingsStorageValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Agent settings persistence is best-effort.
  }
}

function scopedAgentSettingsStorageKey(baseKey: string, userId?: string | null): string {
  return accountScopedStorageKey(baseKey, userId ?? null);
}

function loadAgentSettingsStorageValue(baseKey: string, userId?: string | null): string | null {
  const scopedKey = scopedAgentSettingsStorageKey(baseKey, userId);
  return localStorage.getItem(scopedKey) ?? localStorage.getItem(baseKey);
}

function writeScopedAgentSettingsStorageValue(baseKey: string, value: string, userId?: string | null): void {
  const scopedKey = scopedAgentSettingsStorageKey(baseKey, userId);
  try {
    localStorage.setItem(scopedKey, value);
    if (scopedKey !== baseKey) localStorage.removeItem(baseKey);
  } catch {
    // Agent settings persistence is best-effort.
  }
}

function removeScopedAgentSettingsStorageValue(baseKey: string, userId?: string | null): void {
  const scopedKey = scopedAgentSettingsStorageKey(baseKey, userId);
  try {
    localStorage.removeItem(scopedKey);
    if (scopedKey !== baseKey) localStorage.removeItem(baseKey);
  } catch {
    // Agent settings persistence is best-effort.
  }
}

function removeAgentSettingsStorageValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Agent settings persistence is best-effort.
  }
}

function loadTimestampValue(key: string, userId?: string | null): number | null {
  try {
    const raw = loadAgentSettingsStorageValue(key, userId);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    const normalized = normalizeTimestamp(parsed);
    if (normalized === null) {
      removeScopedAgentSettingsStorageValue(key, userId);
      return null;
    }
    if (String(normalized) !== raw || localStorage.getItem(scopedAgentSettingsStorageKey(key, userId)) !== String(normalized)) {
      writeScopedAgentSettingsStorageValue(key, String(normalized), userId);
    }
    return normalized;
  } catch {
    return null;
  }
}

function saveTimestampValue(key: string, value: unknown, userId?: string | null): number | null {
  const normalized = normalizeTimestamp(value);
  if (normalized == null) {
    removeScopedAgentSettingsStorageValue(key, userId);
    return null;
  }
  writeScopedAgentSettingsStorageValue(key, String(normalized), userId);
  return normalized;
}

export function loadLatencyHistory(userId?: string | null): LatencySnapshot[] {
  try {
    const raw = loadAgentSettingsStorageValue(LLM_LATENCY_KEY, userId);
    if (!raw) return [];
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeScopedAgentSettingsStorageValue(LLM_LATENCY_KEY, userId);
      return [];
    }
    const normalized = loadLatencyHistoryFromValue(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw || localStorage.getItem(scopedAgentSettingsStorageKey(LLM_LATENCY_KEY, userId)) !== serialized) {
      writeScopedAgentSettingsStorageValue(LLM_LATENCY_KEY, serialized, userId);
    }
    return normalized;
  } catch {
    removeScopedAgentSettingsStorageValue(LLM_LATENCY_KEY, userId);
    return [];
  }
}

export function saveLatencyHistory(history: LatencySnapshot[], userId?: string | null): void {
  writeScopedAgentSettingsStorageValue(LLM_LATENCY_KEY, JSON.stringify(loadLatencyHistoryFromValue(history)), userId);
}

export function appendLatencyHistoryEntry(
  entry: LatencySnapshot,
  userId?: string | null,
  maxEntries = 7,
): LatencySnapshot[] {
  const next = [...loadLatencyHistory(userId), entry].slice(-Math.max(1, Math.trunc(maxEntries) || 1));
  saveLatencyHistory(next, userId);
  return next;
}

export function loadTestHistory(userId?: string | null): TestHistoryEntry[] {
  try {
    const raw = loadAgentSettingsStorageValue(LLM_TEST_HISTORY_KEY, userId);
    if (!raw) return [];
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeScopedAgentSettingsStorageValue(LLM_TEST_HISTORY_KEY, userId);
      return [];
    }
    const normalized = loadTestHistoryFromValue(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw || localStorage.getItem(scopedAgentSettingsStorageKey(LLM_TEST_HISTORY_KEY, userId)) !== serialized) {
      writeScopedAgentSettingsStorageValue(LLM_TEST_HISTORY_KEY, serialized, userId);
    }
    return normalized;
  } catch {
    removeScopedAgentSettingsStorageValue(LLM_TEST_HISTORY_KEY, userId);
    return [];
  }
}

export function saveTestHistory(history: TestHistoryEntry[], userId?: string | null): void {
  writeScopedAgentSettingsStorageValue(LLM_TEST_HISTORY_KEY, JSON.stringify(loadTestHistoryFromValue(history)), userId);
}

export function pushTestHistoryEntry(
  entry: TestHistoryEntry,
  userId?: string | null,
  maxEntries = 10,
): TestHistoryEntry[] {
  const next = [entry, ...loadTestHistory(userId)].slice(0, Math.max(1, Math.trunc(maxEntries) || 1));
  saveTestHistory(next, userId);
  return next;
}

export function loadLoraHistory(userId?: string | null): LoraSnapshot[] {
  try {
    const raw = loadAgentSettingsStorageValue(LORA_HISTORY_KEY, userId);
    if (!raw) return [];
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeScopedAgentSettingsStorageValue(LORA_HISTORY_KEY, userId);
      return [];
    }
    const normalized = loadLoraHistoryFromValue(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw || localStorage.getItem(scopedAgentSettingsStorageKey(LORA_HISTORY_KEY, userId)) !== serialized) {
      writeScopedAgentSettingsStorageValue(LORA_HISTORY_KEY, serialized, userId);
    }
    return normalized;
  } catch {
    removeScopedAgentSettingsStorageValue(LORA_HISTORY_KEY, userId);
    return [];
  }
}

export function saveLoraHistory(history: LoraSnapshot[], userId?: string | null): void {
  writeScopedAgentSettingsStorageValue(LORA_HISTORY_KEY, JSON.stringify(loadLoraHistoryFromValue(history)), userId);
}

export function clearLoraHistory(userId?: string | null): void {
  removeScopedAgentSettingsStorageValue(LORA_HISTORY_KEY, userId);
}

export function loadLastLlmPingAt(userId?: string | null): number | null {
  return loadTimestampValue(LLM_PING_KEY, userId);
}

export function saveLastLlmPingAt(value: number | null, userId?: string | null): number | null {
  return saveTimestampValue(LLM_PING_KEY, value, userId);
}

export function loadLastLlmPingOk(userId?: string | null): boolean {
  try {
    const raw = loadAgentSettingsStorageValue(LLM_PING_OK_KEY, userId);
    if (raw === "1") {
      if (localStorage.getItem(scopedAgentSettingsStorageKey(LLM_PING_OK_KEY, userId)) !== raw) {
        writeScopedAgentSettingsStorageValue(LLM_PING_OK_KEY, raw, userId);
      }
      return true;
    }
    if (raw === "0" || raw === null) {
      if (
        raw !== null
        && localStorage.getItem(scopedAgentSettingsStorageKey(LLM_PING_OK_KEY, userId)) !== raw
      ) {
        writeScopedAgentSettingsStorageValue(LLM_PING_OK_KEY, raw, userId);
      }
      return false;
    }
    writeScopedAgentSettingsStorageValue(LLM_PING_OK_KEY, "0", userId);
    return false;
  } catch {
    return false;
  }
}

export function saveLastLlmPingOk(value: boolean, userId?: string | null): boolean {
  writeScopedAgentSettingsStorageValue(LLM_PING_OK_KEY, value ? "1" : "0", userId);
  return value;
}

export function loadSoulSavedAt(userId?: string | null): number | null {
  return loadTimestampValue(SOUL_SAVED_KEY, userId);
}

export function saveSoulSavedAt(value: number | null, userId?: string | null): number | null {
  return saveTimestampValue(SOUL_SAVED_KEY, value, userId);
}

function loadNumericRecord(key: string, userId?: string | null): Record<string, number> {
  try {
    const raw = loadAgentSettingsStorageValue(key, userId);
    if (!raw) return {};
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeScopedAgentSettingsStorageValue(key, userId);
      return {};
    }
    const normalized = loadNumericRecordFromValue(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw || localStorage.getItem(scopedAgentSettingsStorageKey(key, userId)) !== serialized) {
      writeScopedAgentSettingsStorageValue(key, serialized, userId);
    }
    return normalized;
  } catch {
    removeScopedAgentSettingsStorageValue(key, userId);
    return {};
  }
}

export function loadCapabilityLastUsed(userId?: string | null): Record<string, number> {
  return loadNumericRecord(CAP_LAST_USED_KEY, userId);
}

export function saveCapabilityLastUsed(value: Record<string, number>, userId?: string | null): void {
  writeScopedAgentSettingsStorageValue(CAP_LAST_USED_KEY, JSON.stringify(loadNumericRecordFromValue(value)), userId);
}

export function loadCapabilityUsageCount(userId?: string | null): Record<string, number> {
  return loadNumericRecord(CAP_USAGE_COUNT_KEY, userId);
}

export function saveCapabilityUsageCount(value: Record<string, number>, userId?: string | null): void {
  writeScopedAgentSettingsStorageValue(CAP_USAGE_COUNT_KEY, JSON.stringify(loadNumericRecordFromValue(value)), userId);
}

export function loadCapabilityDowUsage(userId?: string | null): Record<string, number[]> {
  try {
    const raw = loadAgentSettingsStorageValue(CAP_DOW_KEY, userId);
    if (!raw) return {};
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeScopedAgentSettingsStorageValue(CAP_DOW_KEY, userId);
      return {};
    }
    const normalized = loadCapabilityDowUsageFromValue(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw || localStorage.getItem(scopedAgentSettingsStorageKey(CAP_DOW_KEY, userId)) !== serialized) {
      writeScopedAgentSettingsStorageValue(CAP_DOW_KEY, serialized, userId);
    }
    return normalized;
  } catch {
    removeScopedAgentSettingsStorageValue(CAP_DOW_KEY, userId);
    return {};
  }
}

export function saveCapabilityDowUsage(value: Record<string, number[]>, userId?: string | null): void {
  writeScopedAgentSettingsStorageValue(CAP_DOW_KEY, JSON.stringify(loadCapabilityDowUsageFromValue(value)), userId);
}

function loadLatencyHistoryFromValue(value: unknown): LatencySnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): LatencySnapshot[] => {
    if (!isRecord(entry) || !isFiniteNumber(entry.ts) || !isFiniteNumber(entry.ms)) return [];
    return [{ ts: entry.ts, ms: entry.ms }];
  });
}

function loadTestHistoryFromValue(value: unknown): TestHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): TestHistoryEntry[] => {
    if (
      !isRecord(entry)
      || !isFiniteNumber(entry.ts)
      || typeof entry.model !== "string"
      || typeof entry.ok !== "boolean"
    ) {
      return [];
    }
    if (!(entry.ms === null || isFiniteNumber(entry.ms))) return [];
    const model = entry.model.trim();
    if (!model) return [];
    const reason =
      typeof entry.reason === "string" && entry.reason.trim().length > 0
        ? entry.reason.trim()
        : undefined;
    return [{
      ts: entry.ts,
      model,
      ms: entry.ms,
      ok: entry.ok,
      reason,
    }];
  });
}

function loadLoraHistoryFromValue(value: unknown): LoraSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): LoraSnapshot[] => {
    if (!isRecord(entry) || !isFiniteNumber(entry.score)) return [];
    const date = readTrimmedString(entry.date);
    return date ? [{ date, score: entry.score }] : [];
  });
}

function loadNumericRecordFromValue(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([entryKey, entryValue]): Array<[string, number]> => {
      const trimmedKey = entryKey.trim();
      return trimmedKey && isFiniteNumber(entryValue) && entryValue >= 0 ? [[trimmedKey, entryValue]] : [];
    }),
  );
}

function loadCapabilityDowUsageFromValue(value: unknown): Record<string, number[]> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([entryKey, entryValue]): Array<[string, number[]]> => {
      const trimmedKey = entryKey.trim();
      if (!trimmedKey || !Array.isArray(entryValue) || entryValue.length !== 7) return [];
      const normalized = entryValue.flatMap((item): number[] => (isFiniteNumber(item) && item >= 0 ? [item] : []));
      return normalized.length === 7 ? [[trimmedKey, normalized]] : [];
    }),
  );
}
