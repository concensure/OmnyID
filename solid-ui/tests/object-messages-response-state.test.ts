import assert from "node:assert/strict";
import test from "node:test";

import {
  buildObjectMessagesSearchRequest,
  objectMessagesActiveFacets,
  objectMessagesFacetNextMoves,
  objectMessagesFocusObjectId,
  objectMessagesFocusThreadId,
  objectMessagesKindCounts,
  objectMessagesList,
  objectMessagesMetadataTermCounts,
  objectMessagesReferenceFacetCounts,
  objectMessagesRetrievalState,
  objectMessagesTagCounts,
} from "../src/lib/objectMessagesResponseState.ts";

test("object message search request normalizes shared structured retrieval inputs", () => {
  assert.deepEqual(
    buildObjectMessagesSearchRequest({
      query: "kind:task #ops",
      focusThreadId: "thread-1",
      focusObjectId: null,
      limit: 30,
    }),
    {
      query: "kind:task #ops",
      focusThreadId: "thread-1",
      focusObjectId: undefined,
      limit: 30,
    },
  );
});

test("object message selectors provide stable response fallbacks", () => {
  assert.deepEqual(objectMessagesList(null), []);
  assert.equal(objectMessagesRetrievalState(null), null);
  assert.equal(objectMessagesFocusThreadId(null), null);
  assert.equal(objectMessagesFocusObjectId(null), null);
  assert.equal(objectMessagesFacetNextMoves(null), null);
});

test("object message selectors resolve active facets and focus ids consistently", () => {
  const result = {
    count: 1,
    messages: [],
    tags: ["ops"],
    reference_targets: ["ticket-42"],
    metadata_keys: ["owner"],
    metadata_values: ["alice"],
    match: "all" as const,
    kind: "task",
    reference_type: "artifact",
    link_type: "depends_on",
    focus_thread_id: "thread-1",
    focus_object_id: "msg-1",
  };

  assert.deepEqual(objectMessagesActiveFacets(result), [
    "kind:task",
    "#ops",
    "target:ticket-42",
    "reftype:artifact",
    "relation:depends_on",
    "key:owner",
    "value:alice",
  ]);
  assert.equal(objectMessagesFocusThreadId(result), "thread-1");
  assert.equal(objectMessagesFocusObjectId(result), "msg-1");
  assert.equal(objectMessagesFocusObjectId(result, "override-id"), "override-id");
});

test("object message selectors derive facet fallbacks from messages when suggestions are absent", () => {
  const result = {
    count: 2,
    match: "any" as const,
    tags: [],
    reference_targets: [],
    metadata_keys: [],
    metadata_values: [],
    messages: [
      {
        id: "msg-1",
        thread_id: "thread-1",
        from: "system",
        timestamp: "2026-08-14T06:00:00Z",
        type: "note",
        kind: "task",
        supertags: ["ops", "urgent"],
        content: { metadata: { owner: "alice" } },
        metadata: { priority: "high" },
        views: [],
        attachments: [],
      },
      {
        id: "msg-2",
        thread_id: "thread-1",
        from: "system",
        timestamp: "2026-08-14T07:00:00Z",
        type: "note",
        kind: "task",
        supertags: ["ops"],
        content: {},
        metadata: null,
        references: [
          { type: "artifact", target: "ticket-42", metadata: { link_type: "depends_on" } },
        ],
        views: [],
        attachments: [],
      },
    ],
  };

  assert.deepEqual(objectMessagesKindCounts(result), [{ kind: "task", count: 2 }]);
  assert.deepEqual(objectMessagesTagCounts(result), [
    { tag: "ops", count: 2 },
    { tag: "urgent", count: 1 },
  ]);
  assert.deepEqual(objectMessagesReferenceFacetCounts(result), {
    targets: [{ value: "ticket-42", count: 1 }],
    referenceTypes: [{ value: "artifact", count: 1 }],
    linkTypes: [{ value: "depends_on", count: 1 }],
  });
  assert.deepEqual(objectMessagesMetadataTermCounts(result), [
    { value: "owner:alice", count: 1 },
    { value: "priority:high", count: 1 },
  ]);
});

test("object message metadata facets ignore encrypted content metadata until local decryption is available", () => {
  const result = {
    count: 1,
    match: "any" as const,
    tags: [],
    reference_targets: [],
    metadata_keys: [],
    metadata_values: [],
    messages: [
      {
        id: "msg-encrypted",
        thread_id: "thread-1",
        from: "system",
        timestamp: "2026-08-14T06:00:00Z",
        type: "note",
        kind: "task",
        supertags: [],
        content: {
          metadata: { hidden_owner: "alice" },
          ciphertext: "abc123",
          nonce: "nonce123",
        },
        encryption: { scheme: "xchacha20-poly1305", key_id: "device-key" },
        metadata: { priority: "high" },
        views: [],
        attachments: [],
      },
    ],
  };

  assert.deepEqual(objectMessagesMetadataTermCounts(result as any), [
    { value: "priority:high", count: 1 },
  ]);
});

test("object message selectors prefer explicit server facet payloads and retrieval state", () => {
  const result = {
    count: 1,
    match: "all" as const,
    tags: [],
    reference_targets: [],
    metadata_keys: [],
    metadata_values: [],
    messages: [],
    retrieval_state: {
      summary: "Found supported indexed matches",
      badges: ["Indexed", "Recent"],
    },
    facet_suggestions: {
      kinds: [{ value: "task", count: 3 }],
      tags: [{ value: "ops", count: 4 }],
      reference_targets: [{ value: "ticket-42", count: 2 }],
      reference_types: [{ value: "artifact", count: 2 }],
      link_types: [{ value: "depends_on", count: 2 }],
      metadata_terms: [{ value: "owner:alice", count: 2 }],
    },
    facet_next_moves: {
      kinds: [{ value: "task", count: 3, score: 0.8, rationale: "Most matches are tasks" }],
      tags: [],
      reference_targets: [],
      reference_types: [],
      link_types: [],
      metadata_terms: [],
    },
  };

  assert.deepEqual(objectMessagesRetrievalState(result), {
    summary: "Found supported indexed matches",
    badges: ["Indexed", "Recent"],
  });
  assert.deepEqual(objectMessagesKindCounts(result), [{ kind: "task", count: 3 }]);
  assert.deepEqual(objectMessagesTagCounts(result), [{ tag: "ops", count: 4 }]);
  assert.deepEqual(objectMessagesReferenceFacetCounts(result), {
    targets: [{ value: "ticket-42", count: 2 }],
    referenceTypes: [{ value: "artifact", count: 2 }],
    linkTypes: [{ value: "depends_on", count: 2 }],
  });
  assert.deepEqual(objectMessagesMetadataTermCounts(result), [{ value: "owner:alice", count: 2 }]);
  assert.deepEqual(objectMessagesFacetNextMoves(result), {
    kinds: [{ value: "task", count: 3, score: 0.8, rationale: "Most matches are tasks" }],
    tags: [],
    reference_targets: [],
    reference_types: [],
    link_types: [],
    metadata_terms: [],
  });
});
