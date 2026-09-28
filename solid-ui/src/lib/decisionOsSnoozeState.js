import { accountScopedStorageKey } from "./accountScopedStorage.ts";
import {
  preferredSnoozeOptionId,
  recordSnoozeHistory,
} from "./decisionOsHomeState.ts";
import { parseJsonValue } from "./jsonParseState.ts";

const DECISION_OS_SNOOZE_KEY = "omnyid.decisionos.snoozed";
const SNOOZE_COUNT_KEY = "omnyid.decisionos.snooze-counts";

function scopedSnoozeStorageKey(baseKey, userId) {
  return accountScopedStorageKey(baseKey, userId);
}

function loadSnoozeStorageValue(baseKey, userId) {
  const scopedKey = scopedSnoozeStorageKey(baseKey, userId);
  return localStorage.getItem(scopedKey) ?? localStorage.getItem(baseKey);
}

function removeSnoozeStorageValue(baseKey, userId) {
  const scopedKey = scopedSnoozeStorageKey(baseKey, userId);
  try {
    localStorage.removeItem(scopedKey);
    if (scopedKey !== baseKey) localStorage.removeItem(baseKey);
  } catch {
    // Ignore storage cleanup failures and keep UI usable.
  }
}

function writeSnoozeStorageValue(baseKey, userId, value) {
  const scopedKey = scopedSnoozeStorageKey(baseKey, userId);
  try {
    localStorage.setItem(scopedKey, value);
    if (scopedKey !== baseKey) localStorage.removeItem(baseKey);
  } catch {
    // Ignore storage write failures and keep UI usable.
  }
}

export function highlightedDecisionSnoozeOptionId(options, preferredSnoozeId) {
  return preferredSnoozeId && options.some((option) => option.id === preferredSnoozeId)
    ? preferredSnoozeId
    : null;
}

export function decisionSnoozeQuickAction(options, preferredSnoozeId) {
  if (!options.length) return null;
  const highlightedId = highlightedDecisionSnoozeOptionId(options, preferredSnoozeId);
  const option = options.find((entry) => entry.id === highlightedId) ?? options[0];
  return {
    optionId: option.id,
    label: option.label,
  };
}

export function decisionSnoozeUsualLabel(options, preferredSnoozeId) {
  const highlightedId = highlightedDecisionSnoozeOptionId(options, preferredSnoozeId);
  if (!highlightedId) return null;
  return options.find((option) => option.id === highlightedId)?.label ?? decisionSnoozeSavedChoiceLabel();
}

export function decisionSnoozeQuickActionTitle(label) {
  return `Snooze until ${label}`;
}

export function decisionSnoozeCountTitle(count) {
  return `Snoozed ${count} time${count === 1 ? "" : "s"} - consider dismissing or delegating`;
}

export function decisionSnoozeUsualPrefix() {
  return "Usual:";
}

export function decisionSnoozeSavedChoiceLabel() {
  return "Saved choice";
}

export function loadDecisionOsSnoozed(userId = null) {
  try {
    const stored = loadSnoozeStorageValue(DECISION_OS_SNOOZE_KEY, userId);
    const parsed = parseJsonValue(stored ?? "{}");
    if (!parsed.ok) {
      removeSnoozeStorageValue(DECISION_OS_SNOOZE_KEY, userId);
      return new Map();
    }
    const raw = parsed.value;
    const normalized = !raw || typeof raw !== "object" || Array.isArray(raw)
      ? {}
      : normalizeSnoozedEntries(Object.entries(raw));
    const serialized = JSON.stringify(normalized);
    const scopedKey = scopedSnoozeStorageKey(DECISION_OS_SNOOZE_KEY, userId);
    if (stored !== null && (stored !== serialized || localStorage.getItem(scopedKey) !== serialized)) {
      writeSnoozeStorageValue(DECISION_OS_SNOOZE_KEY, userId, serialized);
    }
    return new Map(Object.entries(normalized));
  } catch {
    removeSnoozeStorageValue(DECISION_OS_SNOOZE_KEY, userId);
    return new Map();
  }
}

function normalizeSnoozedEntries(snoozed) {
  return Object.fromEntries(
    [...snoozed].filter((entry) =>
      typeof entry[0] === "string"
      && entry[0].length > 0
      && typeof entry[1] === "number"
      && Number.isFinite(entry[1])
      && entry[1] > 0,
    ),
  );
}

export function saveDecisionOsSnoozed(snoozed, userId = null) {
  writeSnoozeStorageValue(
    DECISION_OS_SNOOZE_KEY,
    userId,
    JSON.stringify(normalizeSnoozedEntries(snoozed)),
  );
}

export function loadSnoozeCounts(userId = null) {
  try {
    const stored = loadSnoozeStorageValue(SNOOZE_COUNT_KEY, userId);
    const parsed = parseJsonValue(stored ?? "{}");
    if (!parsed.ok) {
      removeSnoozeStorageValue(SNOOZE_COUNT_KEY, userId);
      return new Map();
    }
    const raw = parsed.value;
    const normalized = !raw || typeof raw !== "object" || Array.isArray(raw)
      ? {}
      : normalizeSnoozeCountEntries(Object.entries(raw));
    const serialized = JSON.stringify(normalized);
    const scopedKey = scopedSnoozeStorageKey(SNOOZE_COUNT_KEY, userId);
    if (stored !== null && (stored !== serialized || localStorage.getItem(scopedKey) !== serialized)) {
      writeSnoozeStorageValue(SNOOZE_COUNT_KEY, userId, serialized);
    }
    return new Map(Object.entries(normalized));
  } catch {
    removeSnoozeStorageValue(SNOOZE_COUNT_KEY, userId);
    return new Map();
  }
}

function normalizeSnoozeCountEntries(counts) {
  return Object.fromEntries(
    [...counts].filter((entry) =>
      typeof entry[0] === "string"
      && entry[0].length > 0
      && typeof entry[1] === "number"
      && Number.isFinite(entry[1])
      && entry[1] >= 0,
    ),
  );
}

export function saveSnoozeCounts(counts, userId = null) {
  writeSnoozeStorageValue(
    SNOOZE_COUNT_KEY,
    userId,
    JSON.stringify(normalizeSnoozeCountEntries(counts)),
  );
}

export function applyDecisionSnooze(args) {
  recordSnoozeHistory(args.optionId, args.now, args.userId);

  const nextSnoozed = new Map(args.snoozed);
  nextSnoozed.set(args.decisionId, args.wakeAt);
  saveDecisionOsSnoozed(nextSnoozed, args.userId);

  const nextCounts = new Map(args.snoozeCounts);
  nextCounts.set(args.decisionId, (nextCounts.get(args.decisionId) ?? 0) + 1);
  saveSnoozeCounts(nextCounts, args.userId);

  return {
    snoozed: nextSnoozed,
    snoozeCounts: nextCounts,
    preferredSnoozeId: preferredSnoozeOptionId(args.userId),
  };
}

export function undoDecisionSnooze(decisionId, snoozed, userId = null) {
  const next = new Map(snoozed);
  next.delete(decisionId);
  saveDecisionOsSnoozed(next, userId);
  return next;
}
