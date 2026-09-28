import test from "node:test";
import assert from "node:assert/strict";

import {
  attachmentPreviewDownloadUrl,
  attachmentPreviewInlineBytes,
  readAttachmentPreviewBytes,
} from "../src/lib/attachmentPreviewSource.ts";

test("attachment preview source reads inline bytes and preferred download urls", async () => {
  const inlineAttachment = {
    storage: {
      type: "inline",
      data: "SGVsbG8=",
    },
  } as const;

  const inlineBytes = attachmentPreviewInlineBytes(inlineAttachment);
  assert.ok(inlineBytes);
  assert.equal(new TextDecoder().decode(inlineBytes), "Hello");
  assert.equal(attachmentPreviewDownloadUrl({ storage: { url: " https://example.test/file.pdf " } }), "https://example.test/file.pdf");

  const previewBytes = await readAttachmentPreviewBytes(inlineAttachment);
  assert.equal(new TextDecoder().decode(previewBytes), "Hello");
});

test("attachment preview source fetches remote bytes and rejects missing sources", async () => {
  const remoteAttachment = {
    storage: {
      download_url: "https://example.test/file.txt",
    },
  } as const;

  const previewBytes = await readAttachmentPreviewBytes(
    remoteAttachment,
    async (input) => {
      assert.equal(input, "https://example.test/file.txt");
      return {
        ok: true,
        status: 200,
        async arrayBuffer() {
          return new TextEncoder().encode("world").buffer;
        },
      };
    },
  );
  assert.equal(new TextDecoder().decode(previewBytes), "world");

  await assert.rejects(
    readAttachmentPreviewBytes({ storage: {} }),
    /No download source available/,
  );

  await assert.rejects(
    readAttachmentPreviewBytes(
      remoteAttachment,
      async () => ({
        ok: false,
        status: 404,
        async arrayBuffer() {
          return new ArrayBuffer(0);
        },
      }),
    ),
    /Fetch failed: HTTP 404/,
  );
});
