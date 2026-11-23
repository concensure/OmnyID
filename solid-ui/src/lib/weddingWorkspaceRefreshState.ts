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
import { fetchWeddingBudgetProjectionMessages } from "@/lib/weddingBudgetProjectionApi";
import {
  fetchWeddingSeatingProjectionMessages,
  isWeddingSeatingProjection,
} from "@/lib/weddingSeatingProjectionApi";

export type WeddingWorkspaceRefreshScope = {
  weddingPlanId: string;
  responseWorkspaceId: string;
  sourceResponseId: string | null;
};

export type WeddingWorkspaceRefreshState = WeddingWorkspaceRefreshScope & (
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
    }
);

export function weddingWorkspaceRefreshScopeMatches(
  left: Pick<WeddingWorkspaceRefreshScope, "weddingPlanId" | "responseWorkspaceId">,
  right: Pick<WeddingWorkspaceRefreshScope, "weddingPlanId" | "responseWorkspaceId">,
): boolean {
  return left.weddingPlanId === right.weddingPlanId
    && left.responseWorkspaceId === right.responseWorkspaceId;
}

type LoadMessages = typeof fetchMessagesBySupertags;
type LoadBudgetMessages = typeof fetchWeddingBudgetProjectionMessages;
type LoadSeatingMessages = typeof fetchWeddingSeatingProjectionMessages;

const emptyBudgetMessages: LoadBudgetMessages = async () => ({
  tags: ["wedding_budget"], match: "all", count: 0, messages: [],
});
const emptySeatingMessages: LoadSeatingMessages = async () => ({
  tags: ["wedding_seating"], match: "all", count: 0, messages: [],
});

function distinctMessages(messages: readonly AfpMessage[]): AfpMessage[] {
  const seen = new Set<string>();
  return messages.filter((message) => {
    if (!message.id || seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  });
}

function isBudgetProjectionMessage(message: AfpMessage): boolean {
  return message.supertags?.includes("wedding_budget") === true;
}

export async function loadWeddingWorkspaceRefreshState(input: {
  signedIn: boolean;
  weddingPlanId: string;
  responseWorkspaceId: string;
  sourceResponseId?: string | null;
  fallbackMessages?: readonly AfpMessage[] | null;
  loadMessages?: LoadMessages;
  loadBudgetMessages?: LoadBudgetMessages;
  loadSeatingMessages?: LoadSeatingMessages;
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
      weddingPlanId: input.weddingPlanId,
      responseWorkspaceId: input.responseWorkspaceId,
      sourceResponseId: input.sourceResponseId ?? null,
      status: "skipped",
      messages: fallbackMessages,
      persisted: fallbackPersisted,
      messageCount: fallbackPersisted.sourceMessageIds.length,
      detail: "Workspace refresh is unavailable in guest mode; showing bootstrap planning messages.",
    };
  }

  const loadMessages = input.loadMessages ?? fetchMessagesBySupertags;
  const loadBudgetMessages = input.loadBudgetMessages
    ?? (input.loadMessages ? emptyBudgetMessages : fetchWeddingBudgetProjectionMessages);
  const loadSeatingMessages = input.loadSeatingMessages
    ?? (input.loadMessages ? emptySeatingMessages : fetchWeddingSeatingProjectionMessages);
  try {
    const [result, budgetResult, seatingResult]: [SupertagMessagesResponse, SupertagMessagesResponse, SupertagMessagesResponse] = await Promise.all([
      loadMessages(["template:wedding_planning", "event:wedding"], {
        match: "all",
        limit: WEDDING_WORKSPACE_REFRESH_PAGE_SIZE,
        offset: 0,
        expandHierarchy: true,
      }),
      loadBudgetMessages({
        weddingPlanId: input.weddingPlanId,
        responseWorkspaceId: input.responseWorkspaceId,
      }),
      loadSeatingMessages({
        weddingPlanId: input.weddingPlanId,
        responseWorkspaceId: input.responseWorkspaceId,
      }),
    ]);
    const messages = distinctMessages([
      ...result.messages.filter((message) => !isBudgetProjectionMessage(message) && !isWeddingSeatingProjection(message)),
      ...budgetResult.messages,
      ...seatingResult.messages,
    ]);
    const persisted = buildWeddingPersistedWorkspaceState({
      messages,
      weddingPlanId: input.weddingPlanId,
      responseWorkspaceId: input.responseWorkspaceId,
      sourceResponseId: input.sourceResponseId,
    });
    const pagination = buildWeddingWorkspaceRefreshPaginationState({
      requestedLimit: WEDDING_WORKSPACE_REFRESH_PAGE_SIZE,
      responseLimit: result.limit,
      responseOffset: result.offset,
      loadedCount: messages.length,
      hasMore: result.has_more || budgetResult.has_more || seatingResult.has_more,
      nextOffset: result.next_offset,
    });
    return {
      weddingPlanId: input.weddingPlanId,
      responseWorkspaceId: input.responseWorkspaceId,
      sourceResponseId: input.sourceResponseId ?? null,
      status: "loaded",
      messages,
      persisted,
      messageCount: persisted.sourceMessageIds.length,
      pagination,
      detail: persisted.hasPersistedData
        ? `${pagination.summary} ${persisted.sourceMessageIds.length} saved planning message${persisted.sourceMessageIds.length === 1 ? "" : "s"} matched this wedding plan.`
        : "Refresh completed; no saved planning messages were found for this wedding plan yet.",
    };
  } catch (error) {
    return {
      weddingPlanId: input.weddingPlanId,
      responseWorkspaceId: input.responseWorkspaceId,
      sourceResponseId: input.sourceResponseId ?? null,
      status: "error",
      messages: fallbackMessages,
      persisted: fallbackPersisted,
      messageCount: fallbackPersisted.sourceMessageIds.length,
      detail: "Could not refresh saved wedding planning messages; showing starter planning messages.",
      error,
    };
  }
}
