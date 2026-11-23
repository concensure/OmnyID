// @locs-version: 1.0
export function isMissingToolConnectionsBackend(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  return (
    message.includes("404")
    || message.includes("not found")
    || message.includes("cannot get /tools/connections")
    || message.includes("cannot post /tools/connections")
    || message.includes("cannot delete /tools/connections")
  );
}

export function signedInLocalRegistryNotice(): string {
  return "The server-backed tool connection registry is unavailable here, so this screen is showing account-scoped browser-only staging data instead of live runtime connections.";
}

export function signedInLocalRegistryBanner(): string {
  return "These entries are stored locally in this browser for the current signed-in account. They are not active runtime connections until the authenticated `/tools/connections` registry is available again.";
}

export function connectToolBlockedInLocalRegistryReason(toolName: string): string {
  return `Cannot connect ${toolName} right now because the authenticated server connection registry is unavailable. Browser-only staging is still visible, but it is not a live runtime connection.`;
}
