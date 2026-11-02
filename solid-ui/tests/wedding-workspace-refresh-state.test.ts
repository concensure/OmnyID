import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage, SupertagMessagesResponse } from "@/lib/api";
import { weddingNeedToKnowContextToAfpMessage } from "@/lib/weddingNeedToKnowAfpProjectionState";
import {
  loadWeddingWorkspaceRefreshState,
  weddingWorkspaceRefreshScopeMatches,
} from "@/lib/weddingWorkspaceRefreshState";
import { normalizeWeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";

const metadata = normalizeWeddingPlanningMetadata({
  weddingPlanId: "wedding_plan:refresh",
  responseWorkspaceId: "response_workspace:refresh",
  sourceResponseId: "response:refresh",
  supertags: ["template:wedding_planning", "event:wedding"],
});

const contextMessage = weddingNeedToKnowContextToAfpMessage({
  metadata,
  planningContext: {
    dateOrSeason: "Spring 2027",
    location: "Melbourne VIC",
    guestCount: 70,
    budgetComfort: "Careful",
    topPriorities: ["food"],
    countryCode: "AU",
  },
  answeredLabels: ["Date/season: Spring 2027"],
  nextQuestionLabel: "Ready to generate recommendations.",
  readyForFirstRecommendations: true,
}, "2026-09-11T00:00:00.000Z") as AfpMessage;

test("loadWeddingWorkspaceRefreshState fetches wedding-tagged messages and scopes by workspace", async () => {
  const otherMessage = {
    ...contextMessage,
    id: "other-context",
    content: { ...contextMessage.content, response_workspace_id: "response_workspace:other" },
    metadata: { ...contextMessage.metadata, response_workspace_id: "response_workspace:other" },
  };
  const calls: Array<{ tags: string[]; opts: Record<string, unknown> | undefined }> = [];
  const loadMessages = async (tags: string[], opts?: Record<string, unknown>): Promise<SupertagMessagesResponse> => {
    calls.push({ tags, opts });
    return {
      tags,
      match: opts?.match === "all" ? "all" : "any",
      count: 2,
      messages: [otherMessage, contextMessage],
    };
  };

  const state = await loadWeddingWorkspaceRefreshState({
    signedIn: true,
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
    loadMessages,
  });

  assert.equal(state.status, "loaded");
  assert.equal(state.weddingPlanId, metadata.weddingPlanId);
  assert.equal(state.responseWorkspaceId, metadata.responseWorkspaceId);
  assert.equal(state.sourceResponseId, metadata.sourceResponseId);
  assert.equal(weddingWorkspaceRefreshScopeMatches(state, metadata), true);
  assert.equal(weddingWorkspaceRefreshScopeMatches(state, {
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: "response_workspace:another",
  }), false);
  assert.equal(state.messageCount, 1);
  assert.equal(state.persisted.hasPersistedData, true);
  assert.equal(state.persisted.contextItems[0]?.planningContext.location, "Melbourne VIC");
  assert.deepEqual(calls[0]?.tags, ["template:wedding_planning", "event:wedding"]);
  assert.equal(calls[0]?.opts?.match, "all");
  assert.equal(calls[0]?.opts?.offset, 0);
  assert.equal(calls[0]?.opts?.limit, 96);
  assert.equal(calls[0]?.opts?.expandHierarchy, true);
  assert.equal(state.pagination.hasMore, false);
  assert.equal(state.pagination.readiness, "oracle_ready");
});

test("loadWeddingWorkspaceRefreshState surfaces bounded partial refresh state", async () => {
  const loadMessages = async (tags: string[], opts?: Record<string, unknown>): Promise<SupertagMessagesResponse> => ({
    tags,
    match: opts?.match === "all" ? "all" : "any",
    count: 96,
    limit: 96,
    offset: 0,
    next_offset: 96,
    has_more: true,
    messages: [contextMessage],
  });

  const state = await loadWeddingWorkspaceRefreshState({
    signedIn: true,
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    sourceResponseId: metadata.sourceResponseId,
    loadMessages,
  });

  assert.equal(state.status, "loaded");
  assert.equal(state.pagination.hasMore, true);
  assert.equal(state.pagination.nextOffset, 96);
  assert.equal(state.pagination.readiness, "needs_more_backend_proof");
  assert.match(state.detail, /more saved context is available/);
});

test("loadWeddingWorkspaceRefreshState skips backend fetch for guest mode", async () => {
  let called = false;
  const state = await loadWeddingWorkspaceRefreshState({
    signedIn: false,
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    fallbackMessages: [contextMessage],
    loadMessages: async () => {
      called = true;
      throw new Error("should not fetch");
    },
  });

  assert.equal(called, false);
  assert.equal(state.status, "skipped");
  assert.equal(state.messageCount, 1);
  assert.equal(state.persisted.hasPersistedData, true);
});

test("loadWeddingWorkspaceRefreshState falls back to bootstrap messages on refresh failure", async () => {
  const state = await loadWeddingWorkspaceRefreshState({
    signedIn: true,
    weddingPlanId: metadata.weddingPlanId,
    responseWorkspaceId: metadata.responseWorkspaceId,
    fallbackMessages: [contextMessage],
    loadMessages: async () => {
      throw new Error("network unavailable");
    },
  });

  assert.equal(state.status, "error");
  assert.equal(state.messageCount, 1);
  assert.equal(state.persisted.hasPersistedData, true);
  assert.match(state.detail, /Could not refresh/);
});
