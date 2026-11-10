// @locs-version: 1.0
import { accountScopedStorageKey } from "./accountScopedStorage.ts";
import { dispatchDiaryEntryEvent } from "./diaryEvent.ts";
import { parseJsonValue } from "./jsonParseState.ts";

const DIARY_KEY = "omnyid.diary-entries";

function diaryStorageKey(userId) {
  return accountScopedStorageKey(DIARY_KEY, userId);
}

function loadDiaryStorageValue(userId) {
  const scopedKey = diaryStorageKey(userId);
  const authenticatedUserId = typeof userId === "string" && userId.trim().length > 0;
  // An authenticated account must never inherit the old unscoped diary. The
  // legacy key remains readable only for signed-out/local-only use.
  return localStorage.getItem(scopedKey) ?? (authenticatedUserId ? null : localStorage.getItem(DIARY_KEY));
}

function removeDiaryStorageValue(userId) {
  const scopedKey = diaryStorageKey(userId);
  try {
    localStorage.removeItem(scopedKey);
    if (scopedKey !== DIARY_KEY) localStorage.removeItem(DIARY_KEY);
  } catch {
    // Ignore storage cleanup failures and keep UI usable.
  }
}

function writeDiaryStorageValue(userId, value) {
  const scopedKey = diaryStorageKey(userId);
  try {
    localStorage.setItem(scopedKey, value);
    if (scopedKey !== DIARY_KEY) localStorage.removeItem(DIARY_KEY);
  } catch {
    // Ignore storage write failures and keep UI usable.
  }
}

function isOptionalString(value) {
  return typeof value === "undefined" || typeof value === "string";
}

function isDiaryEntryRecord(value) {
  return !!value
    && typeof value === "object"
    && typeof value.ts === "string"
    && typeof value.type === "string"
    && typeof value.icon === "string"
    && typeof value.title === "string"
    && isOptionalString(value.detail)
    && isOptionalString(value.meta)
    && isOptionalString(value.decisionId)
    && isOptionalString(value.outcomeCheckAt)
    && isOptionalString(value.note);
}

export function loadDecisionOsDiaryBuckets(userId = null) {
  try {
    const stored = loadDiaryStorageValue(userId);
    const parsed = parseJsonValue(stored ?? "{}");
    if (!parsed.ok) {
      removeDiaryStorageValue(userId);
      return {};
    }
    const normalized = normalizeDiaryBuckets(parsed.value);
    const serialized = JSON.stringify(normalized);
    const scopedKey = diaryStorageKey(userId);
    if (stored !== null && (stored !== serialized || localStorage.getItem(scopedKey) !== serialized)) {
      writeDiaryStorageValue(userId, serialized);
    }
    return normalized;
  } catch {
    removeDiaryStorageValue(userId);
    return {};
  }
}

function normalizeDiaryBuckets(buckets) {
  if (!buckets || typeof buckets !== "object" || Array.isArray(buckets)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(buckets).map(([day, entries]) => [
      day,
      Array.isArray(entries) ? entries.filter(isDiaryEntryRecord) : [],
    ]),
  );
}

function saveDiaryBuckets(buckets, userId = null) {
  writeDiaryStorageValue(userId, JSON.stringify(normalizeDiaryBuckets(buckets)));
}

export function persistDecisionOsDiaryBuckets(buckets, userId = null) {
  saveDiaryBuckets(buckets, userId);
  return normalizeDiaryBuckets(buckets);
}

export function loadDecisionOsDiaryEntriesForDate(dateKey, userId = null) {
  return [...(loadDecisionOsDiaryBuckets(userId)[dateKey] ?? [])].sort((a, b) => a.ts.localeCompare(b.ts));
}

export function appendDecisionOsDiaryEntry(
  entry,
  userIdOrOptions = null,
  {
    maxEntriesPerDay = Number.POSITIVE_INFINITY,
    maxDays = Number.POSITIVE_INFINITY,
  } = {},
) {
  const hasUserIdArgument =
    typeof userIdOrOptions === "string"
    || userIdOrOptions === null
    || typeof userIdOrOptions === "undefined";
  const userId = hasUserIdArgument ? userIdOrOptions ?? null : null;
  const options = hasUserIdArgument ? { maxEntriesPerDay, maxDays } : (userIdOrOptions ?? {});
  const normalizedMaxEntriesPerDay =
    Number.isFinite(options.maxEntriesPerDay) && options.maxEntriesPerDay > 0
      ? Math.floor(options.maxEntriesPerDay)
      : Number.POSITIVE_INFINITY;
  const normalizedMaxDays =
    Number.isFinite(options.maxDays) && options.maxDays > 0
      ? Math.floor(options.maxDays)
      : Number.POSITIVE_INFINITY;
  const dateKey = typeof entry?.ts === "string" ? entry.ts.slice(0, 10) : "";
  if (!dateKey) return loadDecisionOsDiaryBuckets(userId);

  const all = loadDecisionOsDiaryBuckets(userId);
  const dayEntries = all[dateKey] ?? [];
  if (dayEntries.length >= normalizedMaxEntriesPerDay) {
    return all;
  }
  all[dateKey] = [...dayEntries, entry];
  const days = Object.keys(all).sort();
  if (days.length > normalizedMaxDays) {
    for (const old of days.slice(0, days.length - normalizedMaxDays)) {
      delete all[old];
    }
  }
  return persistDecisionOsDiaryBuckets(all, userId);
}

export function recordDecisionOsDiaryEntry(
  entry,
  userIdOrDispatch = null,
  dispatch = dispatchDiaryEntryEvent,
) {
  const userId =
    typeof userIdOrDispatch === "string" || userIdOrDispatch === null || typeof userIdOrDispatch === "undefined"
      ? userIdOrDispatch ?? null
      : null;
  const effectiveDispatch = typeof userIdOrDispatch === "function" ? userIdOrDispatch : dispatch;
  const day = new Date().toISOString().slice(0, 10);
  const all = loadDecisionOsDiaryBuckets(userId);
  const nextDay = [...(all[day] ?? []), entry];
  all[day] = nextDay;
  saveDiaryBuckets(all, userId);
  effectiveDispatch(entry);
  return nextDay;
}

export function updateDecisionOsDiaryEntryOutcomeCheck(decisionId, checkAt, userId = null) {
  const all = loadDecisionOsDiaryBuckets(userId);
  for (const day of Object.keys(all)) {
    all[day] = (all[day] ?? []).map((entry) =>
      entry.decisionId === decisionId
        ? { ...entry, outcomeCheckAt: checkAt }
        : entry,
    );
  }
  saveDiaryBuckets(all, userId);
  return all;
}
