import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSpaceAttachmentMessage,
  extractSpaceMessageAttachments,
  extractSpaceMessageText,
} from "../src/lib/spaceMessageContent.ts";

test("extracts the first visible text field in priority order", () => {
  assert.equal(extractSpaceMessageText({ text: "hello", summary: "ignored" }), "hello");
  assert.equal(extractSpaceMessageText({ body: "body text" }), "body text");
  assert.equal(extractSpaceMessageText({ summary: "summary text" }), "summary text");
  assert.equal(extractSpaceMessageText({ title: "title text" }), "title text");
  assert.equal(extractSpaceMessageText({ count: 3 }), null);
});

test("filters malformed attachment payload entries", () => {
  const attachments = extractSpaceMessageAttachments({
    attachments: [
      {
        id: "att_1",
        name: "brief.pdf",
        mime_type: "application/pdf",
        size_bytes: 128,
        storage: { backend: "filesystem" },
        encryption: { scheme: "none" },
      },
      {
        id: "bad_1",
        name: "broken.pdf",
        mime_type: "application/pdf",
        storage: { backend: "filesystem" },
        encryption: { scheme: "none" },
      },
    ],
  });
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0]?.id, "att_1");
});

test("builds a pseudo attachment message with stable ids", () => {
  const message = buildSpaceAttachmentMessage(
    {
      attachments: [
        {
          id: "att_2",
          name: "roadmap.txt",
          mime_type: "text/plain",
          size_bytes: 64,
          storage: { backend: "filesystem" },
          encryption: { scheme: "none" },
        },
      ],
    },
    "file",
    "msg_7",
  );
  assert.equal(message.id, "space-inline-msg_7");
  assert.equal(message.thread_id, "space-inline-msg_7");
  assert.equal(message.attachments.length, 1);
  assert.equal(message.type, "file");
});
