// @locs-version: 1.0
export function normalizeAccountScopedStorageUserId(userId: string | null | undefined): string {
  const normalized = typeof userId === "string" ? userId.trim() : "";
  return normalized.length > 0 ? normalized : "anonymous";
}

export function accountScopedStorageKey(baseKey: string, userId: string | null | undefined): string {
  return `${baseKey}:${normalizeAccountScopedStorageUserId(userId)}`;
}
