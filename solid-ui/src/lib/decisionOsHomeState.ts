// @locs-version: 1.0
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export type PendingOutcomeCheck = {
  id: string;
  title: string;
  checkAt: string;
};

const CLEAR_STREAK_KEY = "omnyid.decisionos.clear-streak";
const OUTCOME_CHECKS_KEY = "omnyid.pending-outcome-checks";
const OPTION_CHOICE_KEY = "omnyid.decision-choices";
const SNOOZE_HISTORY_KEY = "omnyid.decisionos.snooze-history";

type ClearStreakState = { dates: string[] };
type SnoozeHistoryEntry = { id: string; count: number; lastUsedAt: string };

function scopedDecisionOsStorageKey(baseKey: string, userId: string | null | undefined): string {
  return accountScopedStorageKey(baseKey, userId);
}

function removeDecisionOsStorageValue(baseKey: string, userId: string | null | undefined): void {
  const scopedKey = scopedDecisionOsStorageKey(baseKey, userId);
  try {
    localStorage.removeItem(scopedKey);
    if (scopedKey !== baseKey) localStorage.removeItem(baseKey);
  } catch {
    // Ignore storage write failures and keep the UI usable.
  }
}

function loadDecisionOsStorageValue(baseKey: string, userId: string | null | undefined): string | null {
  const scopedKey = scopedDecisionOsStorageKey(baseKey, userId);
  return localStorage.getItem(scopedKey) ?? localStorage.getItem(baseKey);
}

function writeDecisionOsStorageValue(baseKey: string, userId: string | null | undefined, value: string): void {
  const scopedKey = scopedDecisionOsStorageKey(baseKey, userId);
  try {
    localStorage.setItem(scopedKey, value);
    if (scopedKey !== baseKey) localStorage.removeItem(baseKey);
  } catch {
    // Ignore storage write failures and keep the UI usable.
  }
}

function loadParsedJson(key: string, userId: string | null | undefined): unknown | null {
  try {
    const raw = loadDecisionOsStorageValue(key, userId);
    if (!raw) return null;
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeDecisionOsStorageValue(key, userId);
      return null;
    }
    return parsed.value;
  } catch {
    removeDecisionOsStorageValue(key, userId);
    return null;
  }
}

function saveJson<T>(key: string, userId: string | null | undefined, value: T): void {
  writeDecisionOsStorageValue(key, userId, JSON.stringify(value));
}

function loadNormalizedJson<T>(
  key: string,
  userId: string | null | undefined,
  normalize: (value: unknown) => T,
): T {
  const normalized = normalize(loadParsedJson(key, userId));
  try {
    const raw = loadDecisionOsStorageValue(key, userId);
    if (!raw) return normalized;
    const serialized = JSON.stringify(normalized);
    const scopedKey = scopedDecisionOsStorageKey(key, userId);
    if (serialized !== raw || localStorage.getItem(scopedKey) !== serialized) {
      writeDecisionOsStorageValue(key, userId, serialized);
    }
  } catch {
    // Ignore storage write failures and keep the UI usable.
  }
  return normalized;
}

function normalizeStringRecord(parsed: unknown): Record<string, string> {
  if (!isRecord(parsed)) return {};
  return Object.fromEntries(
    Object.entries(parsed).filter(
      (entry): entry is [string, string] =>
        entry[0].length > 0 && typeof entry[1] === "string",
    ),
  );
}

function loadStringRecord(key: string, userId?: string | null): Record<string, string> {
  return loadNormalizedJson(key, userId, normalizeStringRecord);
}

function saveStringRecord(key: string, value: Record<string, string>, userId?: string | null): void {
  saveJson(key, userId, normalizeStringRecord(value));
}

function normalizeClearStreakState(parsed: unknown): ClearStreakState {
  if (!isRecord(parsed)) {
    return { dates: [] };
  }
  const dates = Array.isArray(parsed.dates)
    ? parsed.dates.filter((value): value is string => typeof value === "string")
    : [];
  return { dates };
}

function loadClearStreakState(userId?: string | null): ClearStreakState {
  return loadNormalizedJson(CLEAR_STREAK_KEY, userId, normalizeClearStreakState);
}

function saveClearStreakState(value: ClearStreakState, userId?: string | null): void {
  saveJson(CLEAR_STREAK_KEY, userId, normalizeClearStreakState(value));
}

function normalizePendingOutcomeCheckEntries(parsed: unknown): PendingOutcomeCheck[] {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((entry): entry is PendingOutcomeCheck => (
      !!entry
      && typeof entry === "object"
      && typeof entry.id === "string"
      && entry.id.length > 0
      && typeof entry.title === "string"
      && entry.title.length > 0
      && typeof entry.checkAt === "string"
      && entry.checkAt.length > 0
    ))
    .sort((a, b) => a.checkAt.localeCompare(b.checkAt));
}

function loadPendingOutcomeCheckEntries(userId?: string | null): PendingOutcomeCheck[] {
  return loadNormalizedJson(OUTCOME_CHECKS_KEY, userId, normalizePendingOutcomeCheckEntries);
}

function savePendingOutcomeCheckEntries(entries: PendingOutcomeCheck[], userId?: string | null): void {
  saveJson(OUTCOME_CHECKS_KEY, userId, normalizePendingOutcomeCheckEntries(entries));
}

function normalizeSnoozeHistoryEntries(parsed: unknown): SnoozeHistoryEntry[] {
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((entry): entry is SnoozeHistoryEntry => (
      !!entry
      && typeof entry === "object"
      && typeof entry.id === "string"
      && entry.id.length > 0
      && typeof entry.count === "number"
      && Number.isFinite(entry.count)
      && entry.count >= 0
      && typeof entry.lastUsedAt === "string"
      && entry.lastUsedAt.length > 0
    ))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.lastUsedAt.localeCompare(a.lastUsedAt);
    });
}

function loadSnoozeHistoryEntries(userId?: string | null): SnoozeHistoryEntry[] {
  return loadNormalizedJson(SNOOZE_HISTORY_KEY, userId, normalizeSnoozeHistoryEntries);
}

function saveSnoozeHistoryEntries(entries: SnoozeHistoryEntry[], userId?: string | null): void {
  saveJson(SNOOZE_HISTORY_KEY, userId, normalizeSnoozeHistoryEntries(entries));
}

export function loadOptionChoice(decisionId: string, userId?: string | null): string | null {
  const all = loadStringRecord(OPTION_CHOICE_KEY, userId);
  return all[decisionId] ?? null;
}

export function saveOptionChoice(decisionId: string, optionId: string, userId?: string | null): void {
  const all = loadStringRecord(OPTION_CHOICE_KEY, userId);
  all[decisionId] = optionId;
  saveStringRecord(OPTION_CHOICE_KEY, all, userId);
}

export function loadClearStreak(userId?: string | null): ClearStreakState {
  return loadClearStreakState(userId);
}

export function recordClearStreak(date = new Date(), userId?: string | null): void {
  const today = date.toISOString().slice(0, 10);
  const data = loadClearStreak(userId);
  if (data.dates.includes(today)) return;
  data.dates.push(today);
  data.dates = data.dates.slice(-7);
  saveClearStreakState(data, userId);
}

export function computeCurrentStreak(today = new Date(), userId?: string | null): number {
  const data = loadClearStreak(userId);
  let streak = 0;
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (data.dates.includes(d.toISOString().slice(0, 10))) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

export function loadPendingOutcomeChecks(userId?: string | null): PendingOutcomeCheck[] {
  return loadPendingOutcomeCheckEntries(userId);
}

export function upsertPendingOutcomeCheck(entry: PendingOutcomeCheck, userId?: string | null): PendingOutcomeCheck[] {
  const all = loadPendingOutcomeChecks(userId).filter((item) => item.id !== entry.id);
  all.push(entry);
  all.sort((a, b) => a.checkAt.localeCompare(b.checkAt));
  savePendingOutcomeCheckEntries(all, userId);
  return all;
}

export function updatePendingOutcomeCheck(
  decisionId: string,
  updater: (entry: PendingOutcomeCheck) => PendingOutcomeCheck,
  userId?: string | null,
): PendingOutcomeCheck[] {
  const all = loadPendingOutcomeChecks(userId);
  const next = all.map((entry) => (entry.id === decisionId ? updater(entry) : entry));
  savePendingOutcomeCheckEntries(next, userId);
  return next;
}

export function removePendingOutcomeCheck(decisionId: string, userId?: string | null): PendingOutcomeCheck[] {
  const next = loadPendingOutcomeChecks(userId).filter((entry) => entry.id !== decisionId);
  savePendingOutcomeCheckEntries(next, userId);
  return next;
}

export function pendingOutcomeCheckForDecision(decisionId: string, userId?: string | null): PendingOutcomeCheck | null {
  return loadPendingOutcomeChecks(userId).find((entry) => entry.id === decisionId) ?? null;
}

export function recordSnoozeHistory(optionId: string, now = new Date(), userId?: string | null): SnoozeHistoryEntry[] {
  const entries = loadSnoozeHistoryEntries(userId);
  const next = entries.filter((entry) => entry.id !== optionId);
  const current = entries.find((entry) => entry.id === optionId);
  next.push({
    id: optionId,
    count: (current?.count ?? 0) + 1,
    lastUsedAt: now.toISOString(),
  });
  next.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.lastUsedAt.localeCompare(a.lastUsedAt);
  });
  saveSnoozeHistoryEntries(next.slice(0, 5), userId);
  return next.slice(0, 5);
}

export function preferredSnoozeOptionId(userId?: string | null): string | null {
  const entries = loadSnoozeHistoryEntries(userId);
  return entries[0]?.id ?? null;
}
