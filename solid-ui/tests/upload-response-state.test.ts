import test from "node:test";
import assert from "node:assert/strict";

import {
  parseUploadAttachmentPayload,
  parseUploadErrorDetail,
  parseUploadMessageIdPayload,
} from "../src/lib/uploadResponseState.ts";

test("parseUploadErrorDetail reads supported error fields", () => {
  assert.equal(parseUploadErrorDetail({ error: " quota exceeded " }), "quota exceeded");
  assert.equal(parseUploadErrorDetail({ message: "try again" }), "try again");
  assert.equal(parseUploadErrorDetail({ error: "", message: "" }), "");
});

test("parseUploadMessageIdPayload accepts only non-empty message ids", () => {
  assert.equal(parseUploadMessageIdPayload({ message_id: " msg-1 " }), "msg-1");
  assert.equal(parseUploadMessageIdPayload({ message_id: "" }), null);
  assert.equal(parseUploadMessageIdPayload({ message_id: 7 }), null);
});

test("parseUploadAttachmentPayload accepts complete attachment metadata only", () => {
  assert.deepEqual(
    parseUploadAttachmentPayload({
      attachment: {
        id: "att-1",
        name: "file.pdf",
        mime_type: "application/pdf",
        size_bytes: 123,
        storage: { path: "x" },
        encryption: {},
        sha256: " abc ",
      },
    }),
    {
      id: "att-1",
      name: "file.pdf",
      mime_type: "application/pdf",
      size_bytes: 123,
      storage: { path: "x" },
      encryption: {},
      sha256: "abc",
    },
  );
  assert.equal(parseUploadAttachmentPayload({ attachment: { id: "att-1" } }), null);
  assert.equal(parseUploadAttachmentPayload({ attachment: { size_bytes: -1 } }), null);
});
