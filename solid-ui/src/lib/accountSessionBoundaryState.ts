// @locs-version: 1.0

export const AUTHENTICATED_ACCOUNT_BOUNDARY_KEY = "omnyid.authenticated-account-boundary.v1";
export const SESSION_TOKEN_STORAGE_KEY = "omnyid.preview.session";

const ACCOUNT_SENSITIVE_PREFIXES = [
  "omnyid.contacts",
  "omnyid.contact-",
  "omnyid.decision",
  "omnyid.pending-outcome",
  "omnyid.diary-entries",
  "omnyid.mobile-focus",
  "omnyid.profile",
  "omnyid.ledger.salt",
  "omnyid.ck",
  "omnyid.soul",
  "omnyid.wedding",
  "omnyid:wedding",
] as const;

const WEDDING_QUIZ_HANDOFF_KEYS = new Set([
  "omnyid.wedding.animal_quiz.handoff.v1",
  "omnyid.wedding.couple_brief",
  "omnyid.wedding.coupleBrief.v1",
]);

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export type AccountSessionBoundaryResult = {
  accountChanged: boolean;
  previousUserId: string | null;
  removedLocalKeys: string[];
  removedSessionKeys: string[];
};

/**
 * A first successful sign-in already cleared ambiguous browser state before
 * this decision is made, so it can adopt the new session in place. A hard
 * reload is reserved for replacing an authenticated account whose reactive
 * projections may still be mounted in memory.
 */
export function shouldReloadForAuthenticatedAccountReplacement(input: {
  accountChanged: boolean;
  hadAuthenticatedSession: boolean;
}): boolean {
  return input.accountChanged && input.hadAuthenticatedSession;
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function storageKeys(storage: StorageLike): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }
  return keys;
}

function accountScopedFor(key: string, userIds: readonly (string | null)[]): boolean {
  return userIds.some((userId) => userId !== null && key.endsWith(`:${userId}`));
}

function sensitiveUnscopedKey(key: string, userIds: readonly (string | null)[]): boolean {
  if (key === AUTHENTICATED_ACCOUNT_BOUNDARY_KEY || accountScopedFor(key, userIds)) return false;
  return ACCOUNT_SENSITIVE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Establishes a hard browser boundary before account-owned UI state is read.
 * Canonical AFP/server records are unaffected. Properly account-scoped keys for
 * the current or previous account remain isolated; ambiguous legacy and
 * workspace-only caches are removed instead of being adopted by another user.
 */
export function enforceAuthenticatedAccountBoundary(input: {
  userId: string | null | undefined;
  localStorage: StorageLike;
  sessionStorage?: StorageLike | null;
  preserveWeddingQuizHandoff?: boolean;
}): AccountSessionBoundaryResult {
  const userId = clean(input.userId);
  const previousUserId = clean(input.localStorage.getItem(AUTHENTICATED_ACCOUNT_BOUNDARY_KEY));
  if (!userId) {
    return { accountChanged: false, previousUserId, removedLocalKeys: [], removedSessionKeys: [] };
  }

  const accountChanged = previousUserId !== null && previousUserId !== userId;
  const removedLocalKeys: string[] = [];
  for (const key of storageKeys(input.localStorage)) {
    const preservedHandoff = input.preserveWeddingQuizHandoff === true && WEDDING_QUIZ_HANDOFF_KEYS.has(key);
    if (!preservedHandoff && sensitiveUnscopedKey(key, [previousUserId, userId])) {
      input.localStorage.removeItem(key);
      removedLocalKeys.push(key);
    }
  }
  input.localStorage.setItem(AUTHENTICATED_ACCOUNT_BOUNDARY_KEY, userId);

  const removedSessionKeys: string[] = [];
  if (accountChanged && input.sessionStorage) {
    for (const key of storageKeys(input.sessionStorage)) {
      if (key === SESSION_TOKEN_STORAGE_KEY) continue;
      input.sessionStorage.removeItem(key);
      removedSessionKeys.push(key);
    }
  }
  return { accountChanged, previousUserId, removedLocalKeys, removedSessionKeys };
}
