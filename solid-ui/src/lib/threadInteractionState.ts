// @locs-version: 1.0
import { fetchThreadRelatedContext, queueUiCommand } from "@/lib/api";
import { type ThreadRelatedContextItem } from "@/lib/threadRelatedContextState";
import {
  buildThreadMergeFailureReceipt,
  buildThreadOrchestrationFailureReceipt,
  type ThreadOrchestrationFailureReceipt,
} from "@/lib/threadOrchestrationFailureState";

export type ThreadRelatedContextEntry = {
  loading: boolean;
  items: ThreadRelatedContextItem[];
};

export type ThreadRelatedContextStateMap = ReadonlyMap<string, ThreadRelatedContextEntry>;

export type ThreadMergeStateResult =
  | { kind: "preflight"; shouldClearSelection: false; error: null }
  | { kind: "success"; shouldClearSelection: true; error: null }
  | { kind: "failure"; shouldClearSelection: false; error: ThreadOrchestrationFailureReceipt };

export type ThreadReplyStateResult =
  | {
      kind: "preflight";
      nextReplyDraft: string;
      nextReplyingThreadId: string | null;
      error: null;
    }
  | {
      kind: "success";
      nextReplyDraft: string;
      nextReplyingThreadId: string | null;
      error: null;
    }
  | {
      kind: "failure";
      nextReplyDraft: string;
      nextReplyingThreadId: string | null;
      error: ThreadOrchestrationFailureReceipt;
    };

export function threadRelatedContextLoadingState(
  current: ThreadRelatedContextStateMap,
  threadId: string,
): Map<string, ThreadRelatedContextEntry> {
  const next = new Map(current);
  next.set(threadId, { loading: true, items: [] });
  return next;
}

export function threadRelatedContextResolvedState(
  current: ThreadRelatedContextStateMap,
  threadId: string,
  items: ThreadRelatedContextItem[],
): Map<string, ThreadRelatedContextEntry> {
  const next = new Map(current);
  next.set(threadId, { loading: false, items });
  return next;
}

export async function loadThreadRelatedContextState(
  args: {
    current: ThreadRelatedContextStateMap;
    threadId: string;
    messageId: string;
  },
  deps: {
    loadRelatedContext?: typeof fetchThreadRelatedContext;
  } = {},
): Promise<Map<string, ThreadRelatedContextEntry>> {
  const loadRelatedContext = deps.loadRelatedContext ?? fetchThreadRelatedContext;
  const loadingState = threadRelatedContextLoadingState(args.current, args.threadId);
  try {
    const items = await loadRelatedContext(args.messageId, { limit: 5, type: "knowledge_card" });
    return threadRelatedContextResolvedState(loadingState, args.threadId, items);
  } catch {
    return threadRelatedContextResolvedState(loadingState, args.threadId, []);
  }
}

export async function mergeSelectedThreadsState(
  threadIds: readonly string[],
  deps: {
    queueCommand?: typeof queueUiCommand;
  } = {},
): Promise<ThreadMergeStateResult> {
  if (threadIds.length < 2) {
    return { kind: "preflight", shouldClearSelection: false, error: null };
  }
  const queueCommand = deps.queueCommand ?? queueUiCommand;
  try {
    await queueCommand({ query: "Merge threads", intent: "merge_threads", thread_ids: [...threadIds] });
    return { kind: "success", shouldClearSelection: true, error: null };
  } catch (error) {
    return {
      kind: "failure",
      shouldClearSelection: false,
      error: buildThreadMergeFailureReceipt(error instanceof Error ? error.message : "Failed to merge threads."),
    };
  }
}

export async function submitThreadReplyState(
  args: {
    threadId: string;
    replyDraft: string;
    replyingToThreadId: string | null;
    submittingThreadId: string | null;
  },
  deps: {
    queueCommand?: typeof queueUiCommand;
  } = {},
): Promise<ThreadReplyStateResult> {
  const nextReplyDraft = args.replyDraft;
  if (!args.replyDraft.trim() || args.submittingThreadId === args.threadId) {
    return {
      kind: "preflight",
      nextReplyDraft,
      nextReplyingThreadId: args.replyingToThreadId,
      error: null,
    };
  }
  const queueCommand = deps.queueCommand ?? queueUiCommand;
  try {
    await queueCommand({
      intent: "reply",
      thread_id: args.threadId,
      content: { text: args.replyDraft },
    });
    return {
      kind: "success",
      nextReplyDraft: "",
      nextReplyingThreadId: null,
      error: null,
    };
  } catch (error) {
    return {
      kind: "failure",
      nextReplyDraft,
      nextReplyingThreadId: args.replyingToThreadId,
      error: buildThreadOrchestrationFailureReceipt(
        error instanceof Error ? error.message : "Failed to submit reply.",
      ),
    };
  }
}

export function toggleThreadReplyComposerState(
  currentThreadId: string | null,
  nextThreadId: string,
): string | null {
  return currentThreadId === nextThreadId ? null : nextThreadId;
}
