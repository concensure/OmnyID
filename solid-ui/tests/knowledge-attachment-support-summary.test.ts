import assert from "node:assert/strict";
import test from "node:test";

import { summarizeKnowledgeAttachmentSupport } from "../src/lib/knowledgeAttachmentSupportSummary.ts";

test("summarizeKnowledgeAttachmentSupport partitions supported and unsupported files", () => {
  const files = [
    new File(["week 3 notes"], "week3.md", { type: "text/markdown" }),
    new File(["audio"], "lecture.m4a", { type: "audio/mp4" }),
    new File(["legacy"], "lecture-notes.ppt", { type: "application/vnd.ms-powerpoint" }),
  ];

  const summary = summarizeKnowledgeAttachmentSupport(files, {
    image_ocr_supported: false,
    pdf_server_processing_supported: true,
    legacy_office_supported: false,
  });

  assert.equal(summary.inlineCount, 1);
  assert.equal(summary.serverCount, 1);
  assert.equal(summary.unsupportedCount, 1);
  assert.deepEqual(summary.supportedFiles.map((file) => file.name), ["week3.md", "lecture.m4a"]);
  assert.deepEqual(summary.unsupportedFiles.map((file) => file.name), ["lecture-notes.ppt"]);
  assert.deepEqual(summary.unsupportedLabels, ["Legacy gap"]);
  assert.equal(summary.unsupportedDescriptions.length, 1);
});
