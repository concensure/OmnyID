// @locs-version: 1.0
import type { WeddingVendorSearchResultAction } from "@/lib/weddingVendorSearchResultActionState";

export type WeddingVendorSearchSession = {
  query: string;
  resultAction: WeddingVendorSearchResultAction | null;
  status: "edited" | "completed";
  updatedAt: string;
};

export function editedWeddingVendorSearchSession(query: string): Omit<WeddingVendorSearchSession, "updatedAt"> {
  return { query, resultAction: null, status: "edited" };
}

export function completedWeddingVendorSearchSession(
  query: string,
  resultAction: WeddingVendorSearchResultAction | null,
): Omit<WeddingVendorSearchSession, "updatedAt"> {
  return { query, resultAction, status: resultAction ? "completed" : "edited" };
}

const STORAGE_PREFIX = "omnyid.wedding.vendor-search-session.v1";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function storageKey(responseWorkspaceId: string, userId?: string | null): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(clean(userId) || "guest")}:${encodeURIComponent(clean(responseWorkspaceId))}`;
}

function normalizeAction(value: unknown): WeddingVendorSearchResultAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const artifactId = clean(source.artifactId);
  const sourceArtifactId = clean(source.sourceArtifactId);
  if (!artifactId || !sourceArtifactId) return null;
  return {
    label: clean(source.label) || "Show full search result",
    detail: clean(source.detail) || "Suitable vendor choices found from this search.",
    artifactId,
    sourceArtifactId,
    menu: "documents",
  };
}

export function normalizeWeddingVendorSearchSession(value: unknown): WeddingVendorSearchSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const query = clean(source.query);
  const resultAction = normalizeAction(source.resultAction);
  const status = source.status === "completed" && resultAction ? "completed" : "edited";
  return {
    query,
    resultAction: status === "completed" ? resultAction : null,
    status,
    updatedAt: clean(source.updatedAt) || new Date(0).toISOString(),
  };
}

export function loadWeddingVendorSearchSession(
  responseWorkspaceId: string | null | undefined,
  storage: Pick<Storage, "getItem"> = localStorage,
  userId?: string | null,
): WeddingVendorSearchSession | null {
  const workspaceId = clean(responseWorkspaceId);
  if (!workspaceId) return null;
  try {
    const raw = storage.getItem(storageKey(workspaceId, userId));
    return raw ? normalizeWeddingVendorSearchSession(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveWeddingVendorSearchSession(
  responseWorkspaceId: string | null | undefined,
  session: Omit<WeddingVendorSearchSession, "updatedAt"> & { updatedAt?: string },
  storage: Pick<Storage, "setItem"> = localStorage,
  userId?: string | null,
): WeddingVendorSearchSession | null {
  const workspaceId = clean(responseWorkspaceId);
  if (!workspaceId) return null;
  const normalized = normalizeWeddingVendorSearchSession({
    ...session,
    updatedAt: clean(session.updatedAt) || new Date().toISOString(),
  });
  if (!normalized) return null;
  try {
    storage.setItem(storageKey(workspaceId, userId), JSON.stringify(normalized));
  } catch {
    // Search still works for this mounted page when convenience storage is unavailable.
  }
  return normalized;
}
