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
  // Never fall back to an old unscoped key while session restoration is in
  // flight. An anonymous browser draft may be imported explicitly later, but
  // it must not become authenticated state for whichever account logs in next.
  return `${baseKey}:account:${activeWeddingAccountId || "anonymous"}`;
}
