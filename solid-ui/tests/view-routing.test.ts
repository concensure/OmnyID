import test from "node:test";
import assert from "node:assert/strict";

import type { AfpMessage } from "../src/lib/api.ts";
import { KNOWN_VIEW_FORMATS, pickView } from "../src/lib/api.ts";
import { heuristicFormat } from "../src/lib/viewRouting.ts";

function messageWithView(format: string): AfpMessage {
  return {
    id: "msg-1",
    thread_id: "thread-1",
    from: "agent://test",
    to: [],
    timestamp: "2026-07-04T00:00:00.000Z",
    type: "agent",
    content: {},
    views: [{ format, content: {}, priority: 10 }],
    attachments: [],
  };
}

test("pickView accepts explicit structured renderer formats used by ViewDispatcher", () => {
  for (const format of [
    "ledger_diff",
    "ledger_board",
    "multi_edit",
    "shell_result",
    "planning_result",
    "export_request",
    "export_result",
    "inbox_canvas",
    "inbox_thread_dashboard",
    "parsed_document",
    "transcript",
    "supertag_grid",
    "a2ui_render",
  ]) {
    assert.equal(
      pickView(messageWithView(format), [...KNOWN_VIEW_FORMATS])?.format,
      format,
      `expected ${format} to be recognized as a known explicit view format`,
    );
  }
});

test("view routing uses an encrypted placeholder instead of inspecting encrypted content", () => {
  const message = messageWithView("a2ui_render");
  message.type = "task";
  message.content = {
    kind: "note",
    view_id: "inbox_canvas",
    bullets: ["Hidden"],
    ciphertext: "abc123",
    nonce: "nonce123",
  };
  message.encryption = { scheme: "xchacha20-poly1305", key_id: "device-key" } as any;

  assert.equal(heuristicFormat(message), "encrypted_placeholder");
});
