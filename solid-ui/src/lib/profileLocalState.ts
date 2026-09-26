// @locs-version: 1.0
import { accountScopedStorageKey } from "@/lib/accountScopedStorage";
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export const PROFILE_KEY = "omnyid.profile.v1";

export type UserProfile = {
  displayName: string;
  bio: string;
  avatar: string;
  websites: string[];
};

const DEFAULT_USER_PROFILE: UserProfile = {
  displayName: "",
  bio: "",
  avatar: "ðŸ§‘",
  websites: [],
};

function normalizeProfileText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeProfileWebsites(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry, index, entries) => entry.length > 0 && entries.indexOf(entry) === index);
}

function normalizeUserProfile(value: unknown): UserProfile {
  if (!isRecord(value)) return { ...DEFAULT_USER_PROFILE };
  return {
    displayName: normalizeProfileText(value.displayName),
    bio: normalizeProfileText(value.bio),
    avatar: normalizeProfileText(value.avatar, DEFAULT_USER_PROFILE.avatar) || DEFAULT_USER_PROFILE.avatar,
    websites: normalizeProfileWebsites(value.websites),
  };
}

function profileStorageKey(userId: string | null | undefined): string {
  return accountScopedStorageKey(PROFILE_KEY, userId);
}

function removeProfileStorageValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures for convenience state.
  }
}

export function loadUserProfile(userId?: string | null): UserProfile {
  const scopedKey = profileStorageKey(userId);
  try {
    const raw = localStorage.getItem(scopedKey) ?? localStorage.getItem(PROFILE_KEY);
    if (!raw) return { ...DEFAULT_USER_PROFILE };
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeProfileStorageValue(scopedKey);
      removeProfileStorageValue(PROFILE_KEY);
      return { ...DEFAULT_USER_PROFILE };
    }
    const normalized = normalizeUserProfile(parsed.value);
    const normalizedJson = JSON.stringify(normalized);
    if (raw !== normalizedJson || localStorage.getItem(scopedKey) !== normalizedJson) {
      localStorage.setItem(scopedKey, normalizedJson);
    }
    if (scopedKey !== PROFILE_KEY) removeProfileStorageValue(PROFILE_KEY);
    return normalized;
  } catch {
    removeProfileStorageValue(scopedKey);
    removeProfileStorageValue(PROFILE_KEY);
    return { ...DEFAULT_USER_PROFILE };
  }
}

export function saveUserProfile(profile: UserProfile, userId?: string | null) {
  const scopedKey = profileStorageKey(userId);
  try {
    localStorage.setItem(scopedKey, JSON.stringify(normalizeUserProfile(profile)));
    if (scopedKey !== PROFILE_KEY) removeProfileStorageValue(PROFILE_KEY);
  } catch {
    // Ignore localStorage write failures for convenience state.
  }
}
