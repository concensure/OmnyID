// Browser-side Wedding mirrors must include the authenticated account. Shared
// starter plan/workspace ids are not an account boundary.
let activeWeddingAccountId = "";

function safeAccountPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, "_").replace(/^_+|_+$/g, "");
}

export function setWeddingLocalAccountScope(userId: string | null | undefined): void {
  activeWeddingAccountId = safeAccountPart(userId ?? "");
}

export function weddingLocalAccountScope(): string | null {
  return activeWeddingAccountId || null;
}

export function weddingAccountScopedStorageKey(baseKey: string): string {
  return activeWeddingAccountId ? `${baseKey}:account:${activeWeddingAccountId}` : baseKey;
}
