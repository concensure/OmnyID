// @locs-version: 1.0
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export type LocalEmailMailboxKey = "inbox" | "sent" | "drafts" | "archive" | "trash";
export type LocalGmailSyncPreference = "new_only" | "full_inbox";

export type LocalEmailDraft = {
  id: string;
  threadId: string;
  sender: string;
  senderDetail?: string | null;
  subject: string;
  preview: string;
  body: string;
  timestamp: string;
  supertags: string[];
};

export const LOCAL_EMAIL_DRAFTS_KEY = "omnyid.email.local-drafts";
export const LOCAL_EMAIL_READ_STATE_KEY = "omnyid.email.read-state";
export const LOCAL_EMAIL_MAILBOX_OVERRIDES_KEY = "omnyid.email.mailbox-overrides";
export const LOCAL_GMAIL_SYNC_PREFERENCE_KEY = "omnyid.email.gmail-sync-preference";

function readTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): string[] => {
    const trimmed = readTrimmedString(entry);
    return trimmed ? [trimmed] : [];
  });
}

function normalizeLocalEmailDraft(value: unknown): LocalEmailDraft | null {
  if (!isRecord(value)) return null;
  const id = readTrimmedString(value.id);
  const threadId = readTrimmedString(value.threadId);
  const sender = readTrimmedString(value.sender);
  const subject = readTrimmedString(value.subject);
  const preview = readTrimmedString(value.preview);
  const body = readTrimmedString(value.body);
  const timestamp = readTrimmedString(value.timestamp);
  if (!id || !threadId || !sender || !subject || !preview || !body || !timestamp) return null;
  const senderDetail =
    value.senderDetail === null
      ? null
      : typeof value.senderDetail === "string"
        ? value.senderDetail.trim() || undefined
        : undefined;
  return {
    id,
    threadId,
    sender,
    senderDetail,
    subject,
    preview,
    body,
    timestamp,
    supertags: readStringArray(value.supertags),
  };
}

function isMailboxKey(value: unknown): value is LocalEmailMailboxKey {
  return value === "inbox" || value === "sent" || value === "drafts" || value === "archive" || value === "trash";
}

function normalizeGmailSyncPreference(value: unknown): LocalGmailSyncPreference {
  return value === "full_inbox" ? "full_inbox" : "new_only";
}

function normalizeLocalEmailDrafts(value: unknown): LocalEmailDraft[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeLocalEmailDraft)
    .filter((entry): entry is LocalEmailDraft => entry !== null);
}

function localEmailStorageKey(baseKey: string, userId: string | null | undefined): string {
  return accountScopedStorageKey(baseKey, userId);
}

function readScopedLocalEmailStorageJson(baseKey: string, userId: string | null | undefined): string | null {
  return localStorage.getItem(localEmailStorageKey(baseKey, userId));
}

function writeLocalEmailStorageValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Best-effort local shell persistence only.
  }
}

function removeLocalEmailStorageValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Best-effort local shell persistence only.
  }
}

function loadLocalEmailStorageJson(baseKey: string, userId: string | null | undefined): string | null {
  const scopedKey = localEmailStorageKey(baseKey, userId);
  return localStorage.getItem(scopedKey) ?? localStorage.getItem(baseKey);
}

function persistLocalEmailStorageJson(baseKey: string, userId: string | null | undefined, value: string): void {
  const scopedKey = localEmailStorageKey(baseKey, userId);
  writeLocalEmailStorageValue(scopedKey, value);
  if (scopedKey !== baseKey) removeLocalEmailStorageValue(baseKey);
}

function clearLocalEmailStorageJson(baseKey: string, userId: string | null | undefined): void {
  const scopedKey = localEmailStorageKey(baseKey, userId);
  removeLocalEmailStorageValue(scopedKey);
  if (scopedKey !== baseKey) removeLocalEmailStorageValue(baseKey);
}

export function loadLocalEmailDrafts(userId?: string | null): LocalEmailDraft[] {
  try {
    const raw = loadLocalEmailStorageJson(LOCAL_EMAIL_DRAFTS_KEY, userId);
    if (!raw) return [];
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      clearLocalEmailStorageJson(LOCAL_EMAIL_DRAFTS_KEY, userId);
      return [];
    }
    const normalized = normalizeLocalEmailDrafts(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw || readScopedLocalEmailStorageJson(LOCAL_EMAIL_DRAFTS_KEY, userId) !== serialized) {
      persistLocalEmailStorageJson(LOCAL_EMAIL_DRAFTS_KEY, userId, serialized);
    }
    return normalized;
  } catch {
    clearLocalEmailStorageJson(LOCAL_EMAIL_DRAFTS_KEY, userId);
    return [];
  }
}

export function persistLocalEmailDrafts(drafts: LocalEmailDraft[], userId?: string | null) {
  persistLocalEmailStorageJson(
    LOCAL_EMAIL_DRAFTS_KEY,
    userId,
    JSON.stringify(normalizeLocalEmailDrafts(drafts)),
  );
}

export function loadLocalEmailReadState(userId?: string | null): Set<string> {
  try {
    const raw = loadLocalEmailStorageJson(LOCAL_EMAIL_READ_STATE_KEY, userId);
    if (!raw) return new Set<string>();
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      clearLocalEmailStorageJson(LOCAL_EMAIL_READ_STATE_KEY, userId);
      return new Set<string>();
    }
    const normalized = readStringArray(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw || readScopedLocalEmailStorageJson(LOCAL_EMAIL_READ_STATE_KEY, userId) !== serialized) {
      persistLocalEmailStorageJson(LOCAL_EMAIL_READ_STATE_KEY, userId, serialized);
    }
    return new Set(normalized);
  } catch {
    clearLocalEmailStorageJson(LOCAL_EMAIL_READ_STATE_KEY, userId);
    return new Set<string>();
  }
}

export function persistLocalEmailReadState(readIds: Set<string>, userId?: string | null) {
  persistLocalEmailStorageJson(
    LOCAL_EMAIL_READ_STATE_KEY,
    userId,
    JSON.stringify(readStringArray(Array.from(readIds))),
  );
}

function normalizeLocalEmailMailboxOverrides(
  overrides: unknown,
): Record<string, LocalEmailMailboxKey> {
  if (!isRecord(overrides)) return {};
  const entries = Object.entries(overrides).flatMap(([key, value]): Array<[string, LocalEmailMailboxKey]> => {
    const trimmedKey = readTrimmedString(key);
    return trimmedKey && isMailboxKey(value) ? [[trimmedKey, value]] : [];
  });
  return Object.fromEntries(entries);
}

export function loadLocalEmailMailboxOverrides(userId?: string | null): Record<string, LocalEmailMailboxKey> {
  try {
    const raw = loadLocalEmailStorageJson(LOCAL_EMAIL_MAILBOX_OVERRIDES_KEY, userId);
    if (!raw) return {};
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      clearLocalEmailStorageJson(LOCAL_EMAIL_MAILBOX_OVERRIDES_KEY, userId);
      return {};
    }
    const normalized = normalizeLocalEmailMailboxOverrides(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw || readScopedLocalEmailStorageJson(LOCAL_EMAIL_MAILBOX_OVERRIDES_KEY, userId) !== serialized) {
      persistLocalEmailStorageJson(LOCAL_EMAIL_MAILBOX_OVERRIDES_KEY, userId, serialized);
    }
    return normalized;
  } catch {
    clearLocalEmailStorageJson(LOCAL_EMAIL_MAILBOX_OVERRIDES_KEY, userId);
    return {};
  }
}

export function persistLocalEmailMailboxOverrides(overrides: Record<string, LocalEmailMailboxKey>, userId?: string | null) {
  persistLocalEmailStorageJson(
    LOCAL_EMAIL_MAILBOX_OVERRIDES_KEY,
    userId,
    JSON.stringify(normalizeLocalEmailMailboxOverrides(overrides)),
  );
}

export function loadLocalGmailSyncPreference(userId?: string | null): LocalGmailSyncPreference {
  try {
    const raw = loadLocalEmailStorageJson(LOCAL_GMAIL_SYNC_PREFERENCE_KEY, userId);
    if (!raw) return "new_only";
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      clearLocalEmailStorageJson(LOCAL_GMAIL_SYNC_PREFERENCE_KEY, userId);
      return "new_only";
    }
    const normalized = normalizeGmailSyncPreference(parsed.value);
    const serialized = JSON.stringify(normalized);
    if (serialized !== raw || readScopedLocalEmailStorageJson(LOCAL_GMAIL_SYNC_PREFERENCE_KEY, userId) !== serialized) {
      persistLocalEmailStorageJson(LOCAL_GMAIL_SYNC_PREFERENCE_KEY, userId, serialized);
    }
    return normalized;
  } catch {
    clearLocalEmailStorageJson(LOCAL_GMAIL_SYNC_PREFERENCE_KEY, userId);
    return "new_only";
  }
}

export function persistLocalGmailSyncPreference(preference: LocalGmailSyncPreference, userId?: string | null) {
  persistLocalEmailStorageJson(
    LOCAL_GMAIL_SYNC_PREFERENCE_KEY,
    userId,
    JSON.stringify(normalizeGmailSyncPreference(preference)),
  );
}
