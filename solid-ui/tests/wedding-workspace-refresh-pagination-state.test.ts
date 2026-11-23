import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingWorkspaceRefreshPaginationState } from "@/lib/weddingWorkspaceRefreshPaginationState";

test("buildWeddingWorkspaceRefreshPaginationState clamps page size and offset", () => {
  const state = buildWeddingWorkspaceRefreshPaginationState({
    requestedLimit: 500,
    responseOffset: -10,
    loadedCount: 3,
  });

  assert.equal(state.pageSize, 100);
  assert.equal(state.offset, 0);
  assert.equal(state.loadedCount, 3);
  assert.equal(state.hasMore, false);
});

test("buildWeddingWorkspaceRefreshPaginationState exposes next page when backend has more", () => {
  const state = buildWeddingWorkspaceRefreshPaginationState({
    responseLimit: 25,
    responseOffset: 50,
    loadedCount: 25,
    hasMore: true,
    nextOffset: 75,
  });

  assert.equal(state.hasMore, true);
  assert.equal(state.nextOffset, 75);
  assert.equal(state.readiness, "needs_more_backend_proof");
  assert.match(state.summary, /more saved context is available/);
});

test("buildWeddingWorkspaceRefreshPaginationState marks complete bounded page oracle-ready", () => {
  const state = buildWeddingWorkspaceRefreshPaginationState({
    responseLimit: 96,
    responseOffset: 0,
    loadedCount: 12,
    hasMore: false,
  });

  assert.equal(state.nextOffset, null);
  assert.equal(state.readiness, "oracle_ready");
});
