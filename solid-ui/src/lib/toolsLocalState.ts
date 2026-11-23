// @locs-version: 1.0
import { accountScopedStorageKey, accountScopedStorageReadKey } from "@/lib/accountScopedStorage";
import type { McpToolConnection } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";

export const TOOL_USAGE_KEY = "omnyid.tool-usage";
export const RECENTLY_USED_KEY = "omnyid.tools.recently_used";
export const RECENTLY_USED_LIMIT = 5;
export const LOCAL_CONNECTIONS_KEY = "omnyid.tools.local_connections.v1";

function normalizeToolConnection(value: unknown): McpToolConnection | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string"
    || typeof value.tool_slug !== "string"
    || typeof value.tool_name !== "string"
    || typeof value.mcp_server_url !== "string"
    || typeof value.connected_at !== "string"
  ) {
    return null;
  }
  const id = value.id.trim();
  const toolSlug = value.tool_slug.trim();
  const toolName = value.tool_name.trim();
  const serverUrl = value.mcp_server_url.trim();
  const connectedAt = value.connected_at.trim();
  if (!id || !toolSlug || !toolName || !serverUrl || !connectedAt) return null;
  return {
    id,
    tool_slug: toolSlug,
    tool_name: toolName,
    mcp_server_url: serverUrl,
    connected_at: connectedAt,
  };
}

function normalizeRecentlyUsedToolSlugs(slugs: unknown): string[] {
  if (!Array.isArray(slugs)) return [];
  return slugs.filter(
    (value, index, values): value is string =>
      typeof value === "string"
      && value.trim().length > 0
      && values.indexOf(value) === index,
  );
}

function normalizeLocalToolConnections(connections: unknown): McpToolConnection[] {
  if (!Array.isArray(connections)) return [];
  return connections
    .map(normalizeToolConnection)
    .filter((connection): connection is McpToolConnection => connection !== null);
}

function removeMalformedStorageValue(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures for convenience state.
  }
}

function scopedToolsStorageKey(baseKey: string, userId?: string | null): string {
  return accountScopedStorageKey(baseKey, userId ?? null);
}

function loadToolsStorageValue(baseKey: string, userId?: string | null): string | null {
  return localStorage.getItem(accountScopedStorageReadKey(baseKey, userId));
}

function removeToolsStorageValue(baseKey: string, userId?: string | null): void {
  const scopedKey = scopedToolsStorageKey(baseKey, userId);
  removeMalformedStorageValue(scopedKey);
  if (scopedKey !== baseKey) removeMalformedStorageValue(baseKey);
}

function writeScopedToolsStorageValue(baseKey: string, stored: string | null, value: unknown, userId?: string | null): void {
  const scopedKey = scopedToolsStorageKey(baseKey, userId);
  const normalizedJson = JSON.stringify(value);
  if (stored === normalizedJson && localStorage.getItem(scopedKey) === normalizedJson) return;
  try {
    localStorage.setItem(scopedKey, normalizedJson);
    if (scopedKey !== baseKey) localStorage.removeItem(baseKey);
  } catch {
    // Ignore storage write failures for convenience state.
  }
}

function writeNormalizedStorageValue(key: string, stored: string, value: unknown): void {
  const normalizedJson = JSON.stringify(value);
  if (stored === normalizedJson) return;
  try {
    localStorage.setItem(key, normalizedJson);
  } catch {
    // Ignore storage write failures for convenience state.
  }
}

function normalizeToolUsageRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entryValue]): Array<[string, number]> => {
      const normalizedKey = key.trim();
      return normalizedKey && typeof entryValue === "number" && Number.isFinite(entryValue) && entryValue >= 0
        ? [[normalizedKey, entryValue]]
        : [];
    }),
  );
}

export function loadToolUseCount(toolId: string, now = new Date(), userId?: string | null): number {
  try {
    const raw = loadToolsStorageValue(TOOL_USAGE_KEY, userId);
    if (!raw) return 0;
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeToolsStorageValue(TOOL_USAGE_KEY, userId);
      return 0;
    }
    const normalized = normalizeToolUsageRecord(parsed.value);
    writeScopedToolsStorageValue(TOOL_USAGE_KEY, raw, normalized, userId);
    const weekKey = `${toolId}_${now.toISOString().slice(0, 7)}`;
    const value = normalized[weekKey];
    return value ?? 0;
  } catch {
    removeToolsStorageValue(TOOL_USAGE_KEY, userId);
    return 0;
  }
}

export function loadRecentlyUsedToolSlugs(userId?: string | null): string[] {
  try {
    const raw = loadToolsStorageValue(RECENTLY_USED_KEY, userId);
    if (!raw) return [];
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeToolsStorageValue(RECENTLY_USED_KEY, userId);
      return [];
    }
    const normalized = normalizeRecentlyUsedToolSlugs(parsed.value);
    writeScopedToolsStorageValue(RECENTLY_USED_KEY, raw, normalized, userId);
    return normalized;
  } catch {
    removeToolsStorageValue(RECENTLY_USED_KEY, userId);
    return [];
  }
}

export function recordRecentlyUsedToolSlug(slug: string, userId?: string | null): string[] {
  const normalizedSlug = slug.trim();
  const next = loadRecentlyUsedToolSlugs(userId).filter((value) => value !== normalizedSlug);
  next.unshift(normalizedSlug);
  const trimmed = next.slice(0, RECENTLY_USED_LIMIT);
  writeScopedToolsStorageValue(RECENTLY_USED_KEY, null, normalizeRecentlyUsedToolSlugs(trimmed), userId);
  return normalizeRecentlyUsedToolSlugs(trimmed);
}

export function loadLocalToolConnections(userId: string | null): McpToolConnection[] {
  try {
    const raw = loadToolsStorageValue(LOCAL_CONNECTIONS_KEY, userId);
    if (!raw) return [];
    const parsed = parseJsonValue(raw);
    if (!parsed.ok) {
      removeToolsStorageValue(LOCAL_CONNECTIONS_KEY, userId);
      return [];
    }
    const normalized = normalizeLocalToolConnections(parsed.value);
    writeScopedToolsStorageValue(LOCAL_CONNECTIONS_KEY, raw, normalized, userId);
    return normalized;
  } catch {
    removeToolsStorageValue(LOCAL_CONNECTIONS_KEY, userId);
    return [];
  }
}

export function saveLocalToolConnections(userId: string | null, connections: McpToolConnection[]) {
  writeScopedToolsStorageValue(LOCAL_CONNECTIONS_KEY, null, normalizeLocalToolConnections(connections), userId);
}

export function clearLocalToolConnections(userId: string | null) {
  removeToolsStorageValue(LOCAL_CONNECTIONS_KEY, userId);
}
