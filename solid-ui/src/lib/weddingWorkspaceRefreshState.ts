// @locs-version: 2.0
import {
  fetchMessagesBySupertags,
  type AfpMessage,
  type SupertagMessagesResponse,
} from "@/lib/api";
import {
  buildWeddingPersistedWorkspaceState,
  type WeddingPersistedWorkspaceState,
} from "@/lib/weddingPersistedWorkspaceState";
import {
  buildWeddingWorkspaceRefreshPaginationState,
  WEDDING_WORKSPACE_REFRESH_PAGE_SIZE,
  type WeddingWorkspaceRefreshPaginationState,
} from "@/lib/weddingWorkspaceRefreshPaginationState";

export type WeddingWorkspaceRefreshState =
  | {
      status: "skipped";
      messages: AfpMessage[];
      persisted: WeddingPersistedWorkspaceState;
      messageCount: number;
      detail: string;
    }
  | {
      status: "loaded";
      messages: AfpMessage[];
      persisted: WeddingPersistedWorkspaceState;
      messageCount: number;
      pagination: WeddingWorkspaceRefreshPaginationState;
      detail: string;
    }
  | {
      status: "error";
      messages: AfpMessage[];
      persisted: WeddingPersistedWorkspaceState;
      messageCount: number;
      detail: string;
      error: unknown;
    };

type LoadMessages = typeof fetchMessagesBySupertags;

export async function loadWeddingWorkspaceRefreshState(input: {
  signedIn: boolean;
  weddingPlanId: string;
  responseWorkspaceId: string;
  sourceResponseId?: string | null;
  fallbackMessages?: readonly AfpMessage[] | null;
  loadMessages?: LoadMessages;
}): Promise<WeddingWorkspaceRefreshState> {
  const fallbackMessages = [...(input.fallbackMessages ?? [])];
  const fallbackPersisted = buildWeddingPersistedWorkspaceState({
    messages: fallbackMessages,
    weddingPlanId: input.weddingPlanId,
    responseWorkspaceId: input.responseWorkspaceId,
    sourceResponseId: input.sourceResponseId,
  });
  if (!input.signedIn) {
    return {
      status: "skipped",
      messages: fallbackMessages,
      persisted: fallbackPersisted,
      messageCount: fallbackPersisted.sourceMessageIds.length,
      detail: "Workspace refresh is unavailable in guest mode; showing bootstrap planning messages.",
    };
  }

  const loadMessages = input.loadMessages ?? fetchMessagesBySupertags;
  try {
    const result: SupertagMessagesResponse = await loadMessages(["template:wedding_planning", "event:wedding"], {
      match: "all",
      limit: WEDDING_WORKSPACE_REFRESH_PAGE_SIZE,
      offset: 0,
      expandHierarchy: true,
    });
    const persisted = buildWeddingPersistedWorkspaceState({
      messages: result.messages,
      weddingPlanId: input.weddingPlanId,
      responseWorkspaceId: input.responseWorkspaceId,
      sourceResponseId: input.sourceResponseId,
    });
    const pagination = buildWeddingWorkspaceRefreshPaginationState({
      requestedLimit: WEDDING_WORKSPACE_REFRESH_PAGE_SIZE,
      responseLimit: result.limit,
      responseOffset: result.offset,
      loadedCount: result.messages.length,
      hasMore: result.has_more,
      nextOffset: result.next_offset,
    });
    return {
      status: "loaded",
      messages: result.messages,
      persisted,
      messageCount: persisted.sourceMessageIds.length,
      pagination,
      detail: persisted.hasPersistedData
        ? `${pagination.summary} ${persisted.sourceMessageIds.length} saved planning message${persisted.sourceMessageIds.length === 1 ? "" : "s"} matched this wedding plan.`
        : "Refresh completed; no saved planning messages were found for this wedding plan yet.",
    };
  } catch (error) {
    return {
      status: "error",
      messages: fallbackMessages,
      persisted: fallbackPersisted,
      messageCount: fallbackPersisted.sourceMessageIds.length,
      detail: "Could not refresh saved wedding planning messages; showing starter planning messages.",
      error,
    };
  }
}
