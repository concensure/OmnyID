// @locs-version: 1.0

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`.trim();
  return String(error ?? "").trim();
}

/**
 * Browsers use different wording when an open tab asks for a hashed module
 * removed by a newer deploy. Resetting a Solid lazy boundary cannot repair the
 * rejected module promise; the application shell must be reloaded instead.
 */
export function isWorkspaceModuleLoadFailure(error: unknown): boolean {
  return /(failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|chunkloaderror|loading chunk [^ ]+ failed|dynamically imported module.*(?:404|not found)|module script.*(?:mime|load failed)|unable to preload css)/i
    .test(errorText(error));
}

export function workspaceFailureReference(error: unknown, surface: string): string {
  const input = `${surface}:${errorText(error)}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `WED-${(hash >>> 0).toString(16).padStart(8, "0").toUpperCase()}`;
}

