// @locs-version: 2.0
export const WEDDING_WORKSPACE_REFRESH_PAGE_SIZE = 96;

export type WeddingWorkspaceRefreshPaginationState = {
  pageSize: number;
  offset: number;
  loadedCount: number;
  hasMore: boolean;
  nextOffset: number | null;
  summary: string;
  readiness: "oracle_ready" | "needs_more_backend_proof";
};

export function buildWeddingWorkspaceRefreshPaginationState(input: {
  requestedLimit?: number | null;
  responseLimit?: number | null;
  responseOffset?: number | null;
  loadedCount: number;
  hasMore?: boolean | null;
  nextOffset?: number | null;
}): WeddingWorkspaceRefreshPaginationState {
  const pageSize = Math.min(
    100,
    Math.max(1, Math.trunc(input.responseLimit ?? input.requestedLimit ?? WEDDING_WORKSPACE_REFRESH_PAGE_SIZE)),
  );
  const offset = Math.max(0, Math.trunc(input.responseOffset ?? 0));
  const loadedCount = Math.max(0, Math.trunc(input.loadedCount));
  const hasMore = Boolean(input.hasMore);
  const nextOffset = hasMore
    ? Math.max(offset + pageSize, Math.trunc(input.nextOffset ?? offset + pageSize))
    : null;

  return {
    pageSize,
    offset,
    loadedCount,
    hasMore,
    nextOffset,
    summary: hasMore
      ? `Loaded ${loadedCount} saved wedding workspace messages from page ${offset}-${offset + pageSize - 1}; more saved context is available.`
      : `Loaded ${loadedCount} saved wedding workspace messages in a bounded refresh page.`,
    readiness: hasMore ? "needs_more_backend_proof" : "oracle_ready",
  };
}
