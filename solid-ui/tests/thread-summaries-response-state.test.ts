import assert from "node:assert/strict";
import test from "node:test";

import {
  buildThreadSummariesSearchRequest,
  isThreadSummariesSearchActive,
  threadSummariesList,
  threadSummariesRetrievalState,
} from "../src/lib/threadSummariesResponseState.ts";

test("thread summaries search activity only turns on for substantive filters", () => {
  assert.equal(
    isThreadSummariesSearchActive({
      query: "a",
      tags: [],
      metadataTerms: [],
      threadIds: [],
      fromAgents: [],
    }),
    false,
  );

  assert.equal(
    isThreadSummariesSearchActive({
      query: "agent handoff",
      tags: [],
      metadataTerms: [],
      threadIds: [],
      fromAgents: [],
    }),
    true,
  );

  assert.equal(
    isThreadSummariesSearchActive({
      query: "",
      tags: ["urgent"],
      metadataTerms: [],
      threadIds: [],
      fromAgents: [],
    }),
    true,
  );
});

test("thread summaries search request normalizes shared fetch inputs", () => {
  assert.deepEqual(
    buildThreadSummariesSearchRequest(
      {
        query: "",
        tags: ["urgent", "ops"],
        metadataTerms: ["memory_space:work"],
        kind: "task",
        threadIds: ["thread-1"],
        fromAgents: ["planner"],
        timeRange: { from: "2026-08-01", to: "2026-08-14" },
      },
      40,
    ),
    {
      query: undefined,
      tags: ["urgent", "ops"],
      kind: "task",
      threadIds: ["thread-1"],
      fromAgents: ["planner"],
      timeFrom: "2026-08-01",
      timeTo: "2026-08-14",
      match: "all",
      limit: 40,
    },
  );
});

test("thread summaries selectors provide stable response fallbacks", () => {
  assert.deepEqual(threadSummariesList(null), []);
  assert.equal(threadSummariesRetrievalState(null), null);

  const response = {
    count: 1,
    thread_summaries: [
      {
        thread_id: "thread-1",
        title: "Ops handoff",
        preview: "Review recovery packet",
        message_count: 3,
        last_message_at: "2026-08-14T06:00:00Z",
        supertags: ["ops"],
        score: 0.88,
      },
    ],
    retrieval_state: {
      summary: "Matched recent ops threads",
      badges: ["Recent", "Thread match"],
    },
  };

  assert.equal(threadSummariesList(response).length, 1);
  assert.deepEqual(threadSummariesRetrievalState(response), {
    summary: "Matched recent ops threads",
    badges: ["Recent", "Thread match"],
  });
});
