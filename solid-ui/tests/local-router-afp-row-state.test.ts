import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeLocalRouterAfpAttachments,
  normalizeLocalRouterAfpReferences,
  normalizeLocalRouterAfpViews,
  rowToLocalRouterAfpMessage,
} from "../src/lib/localRouterAfpRowState.ts";

test("normalizeLocalRouterAfpViews keeps valid view descriptors only", () => {
  assert.deepEqual(
    normalizeLocalRouterAfpViews([
      { format: " table ", content: { rows: [] }, priority: 2 },
      { format: "", content: { ignored: true } },
      { format: "canvas", content: "bad", priority: Infinity },
    ]),
    [
      { format: "table", content: { rows: [] }, priority: 2 },
      { format: "canvas", content: {}, priority: undefined },
    ],
  );
});

test("normalizeLocalRouterAfpAttachments keeps complete attachment descriptors only", () => {
  assert.deepEqual(
    normalizeLocalRouterAfpAttachments([
      {
        id: " att-1 ",
        name: "file.txt",
        mime_type: "text/plain",
        size_bytes: 12,
        storage: { path: "x" },
        encryption: {},
        sha256: " hash ",
      },
      { id: "att-2", name: "bad", mime_type: "text/plain", size_bytes: -1 },
    ]),
    [{
      id: "att-1",
      name: "file.txt",
      mime_type: "text/plain",
      size_bytes: 12,
      storage: { path: "x" },
      encryption: {},
      sha256: "hash",
    }],
  );
});

test("normalizeLocalRouterAfpReferences keeps complete references only", () => {
  assert.deepEqual(
    normalizeLocalRouterAfpReferences([
      { type: " thread ", target: "t1", label: " Thread ", metadata: { rank: 1 } },
      { type: "thread", target: "" },
    ]),
    [{ type: "thread", target: "t1", label: "Thread", metadata: { rank: 1 } }],
  );
});

test("rowToLocalRouterAfpMessage normalizes malformed row arrays and records", () => {
  assert.deepEqual(
    rowToLocalRouterAfpMessage({
      id: "m1",
      thread_id: "t1",
      from_agent: "user",
      to_agents: [" agent ", "", 7],
      timestamp: "2026-08-12T00:00:00Z",
      type: "note",
      subtype: " summary ",
      content: "bad",
      metadata: "bad",
      views: [{ format: "rich_text", content: { title: "A" } }],
      references: [{ type: "thread", target: "t2" }],
      attachments: [{ id: "bad" }],
      encryption: { kind: "none" },
    }),
    {
      id: "m1",
      thread_id: "t1",
      from: "user",
      to: ["agent"],
      timestamp: "2026-08-12T00:00:00Z",
      type: "note",
      subtype: "summary",
      content: {},
      metadata: null,
      views: [{ format: "rich_text", content: { title: "A" }, priority: undefined }],
      attachments: [],
      references: [{ type: "thread", target: "t2", label: undefined, metadata: undefined }],
      encryption: { kind: "none" },
    },
  );
});
