import test from "node:test";
import assert from "node:assert/strict";

import {
  loadDashboardFeedMetadataState,
  loadDashboardFeedSupertagDefinitionsState,
  loadDashboardFeedTopSupertagsState,
  loadDashboardFeedTopicBaseState,
  loadDashboardFeedTopicLensState,
  loadDashboardFeedTopicSelectionState,
} from "../src/lib/dashboardFeedResourceState.ts";

test("dashboard feed resource state returns stable empty results when signed out", async () => {
  assert.deepEqual(await loadDashboardFeedTopSupertagsState(false), []);
  assert.deepEqual(await loadDashboardFeedSupertagDefinitionsState(false), []);
  assert.equal(await loadDashboardFeedTopicBaseState(false, "launch"), null);
  assert.equal(await loadDashboardFeedTopicSelectionState(false, { tag: "launch", kind: "thread" }), null);
});

test("dashboard feed resource state loads top supertags and definitions through typed helpers", async () => {
  const supertags = await loadDashboardFeedTopSupertagsState(true, {
    async loadTopSupertags(limit) {
      assert.equal(limit, 8);
      return { supertags: [{ tag: "launch", count: 4 }] };
    },
  });
  assert.deepEqual(supertags, [{ tag: "launch", count: 4 }]);

  const definitions = await loadDashboardFeedSupertagDefinitionsState(true, {
    async loadDefinitions() {
      return {
        definitions: [{
          definition_id: "def-1",
          tag_name: "launch",
          keywords: ["launch"],
          folder_scope: [],
          parent_tags: [],
          alias_tags: [],
          hierarchy_mode: "flat",
          afp_message_id: "msg-1",
          created_at: "2026-09-01T10:00:00Z",
        }],
      };
    },
  });
  assert.equal(definitions[0]?.tag_name, "launch");
});

test("dashboard feed metadata state preserves partial failures across tag metadata resources", async () => {
  const metadata = await loadDashboardFeedMetadataState(true, {
    async loadTopSupertags() {
      return { supertags: [{ tag: "launch", count: 4 }] };
    },
    async loadDefinitions() {
      throw new Error("definitions timeout");
    },
  });

  assert.deepEqual(metadata.supertags, [{ tag: "launch", count: 4 }]);
  assert.deepEqual(metadata.definitions, []);
  assert.equal(metadata.supertagsError, null);
  assert.match(String(metadata.definitionsError), /definitions timeout/);
});

test("dashboard feed topic loaders preserve null selections and scope the message request", async () => {
  assert.equal(await loadDashboardFeedTopicBaseState(true, null), null);
  assert.equal(await loadDashboardFeedTopicSelectionState(true, null), null);

  const calls: string[] = [];
  const base = await loadDashboardFeedTopicBaseState(true, "launch", {
    async loadMessages(tags, options) {
      calls.push(`${tags.join(",")}:${String(options.kind)}:${options.limit}:${String(options.expandHierarchy)}`);
      return {
        tags,
        count: 1,
        match: "any",
        messages: [{ id: "msg-1", kind: "thread", type: "email", thread_id: "thread-1", content: {} }],
      };
    },
  });
  assert.equal(base?.tag, "launch");
  assert.equal(base?.messages[0]?.id, "msg-1");

  const scoped = await loadDashboardFeedTopicSelectionState(true, { tag: "launch", kind: "note" }, {
    async loadMessages(tags, options) {
      calls.push(`${tags.join(",")}:${String(options.kind)}:${options.limit}:${String(options.expandHierarchy)}`);
      return {
        tags,
        kind: options.kind,
        count: 1,
        match: "any",
        messages: [{ id: "msg-2", kind: "note", type: "note", thread_id: "thread-2", content: {} }],
      };
    },
  });
  assert.equal(scoped?.tag, "launch");
  assert.equal(scoped?.kind, "note");
  assert.equal(scoped?.messages[0]?.id, "msg-2");
  assert.deepEqual(calls, [
    "launch:undefined:48:true",
    "launch:note:48:true",
  ]);
});

test("dashboard feed topic lens state preserves partial failures across base and scoped topic loads", async () => {
  const calls: string[] = [];
  const state = await loadDashboardFeedTopicLensState(true, { tag: "launch", kind: "note" }, {
    async loadMessages(tags, options) {
      calls.push(`${tags.join(",")}:${String(options.kind)}`);
      if (options.kind === undefined) {
        throw new Error("base timeout");
      }
      return {
        tags,
        kind: options.kind,
        count: 1,
        match: "any",
        messages: [{ id: "msg-2", kind: "note", type: "note", thread_id: "thread-2", content: {} }],
      };
    },
  });

  assert.equal(state?.base, null);
  assert.equal(state?.selection?.messages[0]?.id, "msg-2");
  assert.match(String(state?.baseError), /base timeout/);
  assert.equal(state?.selectionError, null);
  assert.deepEqual(calls, ["launch:undefined", "launch:note"]);
});
