import assert from "node:assert/strict";
import test from "node:test";

import {
  hasPreparedDraftThreadRetrievalState,
  hasThreadRetrievalState,
  preparedDraftThreadRetrievalState,
  threadRetrievalState,
} from "../src/lib/threadRetrievalState.ts";

test("thread retrieval helpers provide stable null fallbacks", () => {
  assert.equal(threadRetrievalState(null), null);
  assert.equal(preparedDraftThreadRetrievalState(null), null);
  assert.equal(hasThreadRetrievalState(null), false);
  assert.equal(hasPreparedDraftThreadRetrievalState(null), false);
});

test("thread retrieval helpers expose normalized state for queue-style payloads", () => {
  const retrievalState = {
    summary: "Matched recent supplier thread",
    badges: ["Recent", "Reply ready"],
  };

  assert.deepEqual(
    threadRetrievalState({ thread_retrieval_state: retrievalState }),
    retrievalState,
  );
  assert.equal(hasThreadRetrievalState({ thread_retrieval_state: retrievalState }), true);
  assert.deepEqual(
    preparedDraftThreadRetrievalState({
      prepared_draft_thread_retrieval_state: retrievalState,
    }),
    retrievalState,
  );
  assert.equal(
    hasPreparedDraftThreadRetrievalState({
      prepared_draft_thread_retrieval_state: retrievalState,
    }),
    true,
  );
});
