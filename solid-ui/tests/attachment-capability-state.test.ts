import assert from "node:assert/strict";
import test from "node:test";

import { buildAttachmentCapabilityState } from "../src/lib/attachmentCapabilityState.ts";

test("buildAttachmentCapabilityState describes mixed study ingest readiness", () => {
  const state = buildAttachmentCapabilityState({
    files: [
      new File(["week 3"], "week3.md", { type: "text/markdown" }),
      new File(["audio"], "lecture.m4a", { type: "audio/mp4" }),
      new File(["legacy"], "slides.ppt", { type: "application/vnd.ms-powerpoint" }),
    ],
    capabilities: {
      image_ocr_supported: false,
      pdf_server_processing_supported: true,
      legacy_office_supported: false,
    },
    retentionMode: "keep_extracted_only",
    knowledgeMode: "connected_notes",
  });

  assert.match(state.headline, /mixed|conversion/i);
  assert.equal(state.cards[0]?.count, 1);
  assert.equal(state.cards[1]?.count, 1);
  assert.equal(state.cards[2]?.count, 1);
  assert.match(state.detail, /Supertags/i);
  assert.match(state.valueAfterRun, /Files/i);
});

test("buildAttachmentCapabilityState marks zero-readable batches as blocked", () => {
  const state = buildAttachmentCapabilityState({
    files: [new File(["legacy"], "lecture.ppt", { type: "application/vnd.ms-powerpoint" })],
    capabilities: {
      image_ocr_supported: false,
      pdf_server_processing_supported: false,
      legacy_office_supported: false,
    },
    retentionMode: "keep_nothing",
    knowledgeMode: "zettelkasten",
  });

  assert.match(state.headline, /needs a format fix/i);
  assert.equal(state.badge, "No attached files can contribute yet");
  assert.match(state.detail, /blocked/i);
  assert.match(state.valueAfterRun, /nothing is retained/i);
});
