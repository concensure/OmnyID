// @locs-version: 1.0
export function normalizeAccountScopedStorageUserId(userId: string | null | undefined): string {
  const normalized = typeof userId === "string" ? userId.trim() : "";
  return normalized.length > 0 ? normalized : "anonymous";
}

export function accountScopedStorageKey(baseKey: string, userId: string | null | undefined): string {
  return `${baseKey}:${normalizeAccountScopedStorageUserId(userId)}`;
}

/**
 * Legacy unscoped state is readable only before authentication. Supplying an
 * account id always resolves to its namespaced key and never falls back to a
 * browser-global value owned by an unknown account.
 */
export function accountScopedStorageReadKey(baseKey: string, userId: string | null | undefined): string {
  const normalized = typeof userId === "string" ? userId.trim() : "";
  return normalized ? accountScopedStorageKey(baseKey, normalized) : baseKey;
}
