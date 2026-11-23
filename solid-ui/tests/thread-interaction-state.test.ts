import test from "node:test";
import assert from "node:assert/strict";

import {
  loadThreadRelatedContextState,
  mergeSelectedThreadsState,
  submitThreadReplyState,
  threadRelatedContextLoadingState,
  threadRelatedContextResolvedState,
  toggleThreadReplyComposerState,
} from "../src/lib/threadInteractionState.ts";

test("thread related context state helpers preserve loading and resolved entries", () => {
  const loading = threadRelatedContextLoadingState(new Map(), "thread-1");
  assert.deepEqual(loading.get("thread-1"), { loading: true, items: [] });

  const resolved = threadRelatedContextResolvedState(loading, "thread-1", [
    { id: "ctx-1", label: "Preference card", type: "knowledge_card" },
  ]);
  assert.deepEqual(resolved.get("thread-1"), {
    loading: false,
    items: [{ id: "ctx-1", label: "Preference card", type: "knowledge_card" }],
  });
});

test("loadThreadRelatedContextState resolves fetched context items", async () => {
  const result = await loadThreadRelatedContextState(
    {
      current: new Map(),
      threadId: "thread-1",
      messageId: "msg-1",
    },
    {
      async loadRelatedContext(messageId, request) {
        assert.equal(messageId, "msg-1");
        assert.equal(request.limit, 5);
        assert.equal(request.type, "knowledge_card");
        return [{ id: "ctx-2", label: "Trip preference", type: "knowledge_card" }];
      },
    },
  );

  assert.deepEqual(result.get("thread-1"), {
    loading: false,
    items: [{ id: "ctx-2", label: "Trip preference", type: "knowledge_card" }],
  });
});

test("loadThreadRelatedContextState falls back to an empty related context list on failure", async () => {
  const result = await loadThreadRelatedContextState(
    {
      current: new Map(),
      threadId: "thread-2",
      messageId: "msg-2",
    },
    {
      async loadRelatedContext() {
        throw new Error("network error");
      },
    },
  );

  assert.deepEqual(result.get("thread-2"), { loading: false, items: [] });
});

test("mergeSelectedThreadsState validates local selection before queueing", async () => {
  const preflight = await mergeSelectedThreadsState(["thread-1"]);
  assert.equal(preflight.kind, "preflight");
  assert.equal(preflight.shouldClearSelection, false);

  const calls: string[] = [];
  const success = await mergeSelectedThreadsState(["thread-1", "thread-2"], {
    async queueCommand(payload) {
      calls.push(`${payload.intent}:${payload.thread_ids?.join(",")}`);
      return undefined;
    },
  });
  assert.equal(success.kind, "success");
  assert.equal(success.shouldClearSelection, true);
  assert.deepEqual(calls, ["merge_threads:thread-1,thread-2"]);
});

test("mergeSelectedThreadsState returns a merge receipt on failure", async () => {
  const result = await mergeSelectedThreadsState(["thread-1", "thread-2"], {
    async queueCommand() {
      throw new Error("403 forbidden");
    },
  });

  assert.equal(result.kind, "failure");
  assert.equal(result.shouldClearSelection, false);
  assert.equal(result.error?.tone, "danger");
  assert.match(result.error?.title ?? "", /before merging threads/i);
});

test("submitThreadReplyState preserves draft during preflight and clears after success", async () => {
  const preflight = await submitThreadReplyState({
    threadId: "thread-1",
    replyDraft: "   ",
    replyingToThreadId: "thread-1",
    submittingThreadId: null,
  });
  assert.equal(preflight.kind, "preflight");
  assert.equal(preflight.nextReplyDraft, "   ");
  assert.equal(preflight.nextReplyingThreadId, "thread-1");

  const calls: string[] = [];
  const success = await submitThreadReplyState(
    {
      threadId: "thread-1",
      replyDraft: "Ship the summary",
      replyingToThreadId: "thread-1",
      submittingThreadId: null,
    },
    {
      async queueCommand(payload) {
        calls.push(`${payload.intent}:${payload.thread_id}:${String(payload.content?.text)}`);
        return undefined;
      },
    },
  );
  assert.equal(success.kind, "success");
  assert.equal(success.nextReplyDraft, "");
  assert.equal(success.nextReplyingThreadId, null);
  assert.deepEqual(calls, ["reply:thread-1:Ship the summary"]);
});

test("submitThreadReplyState preserves the composer and returns a receipt on failure", async () => {
  const result = await submitThreadReplyState(
    {
      threadId: "thread-4",
      replyDraft: "Need a follow-up",
      replyingToThreadId: "thread-4",
      submittingThreadId: null,
    },
    {
      async queueCommand() {
        throw new Error("network timeout");
      },
    },
  );

  assert.equal(result.kind, "failure");
  assert.equal(result.nextReplyDraft, "Need a follow-up");
  assert.equal(result.nextReplyingThreadId, "thread-4");
  assert.equal(result.error?.tone, "warning");
  assert.match(result.error?.title ?? "", /could not complete the reply/i);
});

test("toggleThreadReplyComposerState toggles the same thread closed and another thread open", () => {
  assert.equal(toggleThreadReplyComposerState(null, "thread-1"), "thread-1");
  assert.equal(toggleThreadReplyComposerState("thread-1", "thread-1"), null);
  assert.equal(toggleThreadReplyComposerState("thread-1", "thread-2"), "thread-2");
});
