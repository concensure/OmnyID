import test from "node:test";
import assert from "node:assert/strict";

import { buildStudyAttachmentPlanState } from "../src/lib/studyAttachmentPlanState.ts";

function mockFile(name: string, type: string): File {
  return {
    name,
    type,
    size: 1024,
  } as File;
}

test("buildStudyAttachmentPlanState describes mixed attachment readiness and retention", () => {
  const state = buildStudyAttachmentPlanState({
    files: [
      mockFile("week3-slides.pdf", "application/pdf"),
      mockFile("voice-memo.m4a", "audio/mp4"),
      mockFile("old-lecture.doc", "application/msword"),
    ],
    capabilities: {
      image_ocr_supported: false,
      pdf_server_processing_supported: true,
      legacy_office_supported: false,
    },
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
  });

  assert.equal(state.readableCount, 2);
  assert.equal(state.deferredCount, 1);
  assert.equal(state.skippedCount, 1);
  assert.match(state.headline, /partly ready now/i);
  assert.match(state.supportingText, /unsupported files will be skipped/i);
  assert.equal(state.items[0]?.readinessLabel, "Ready now");
  assert.equal(state.items[1]?.readinessLabel, "Readable after upload");
  assert.equal(state.items[2]?.readinessLabel, "Skipped for study synthesis");
  assert.match(state.items[0]?.retentionLabel ?? "", /extracted content, supertags, and links remain searchable/i);
  assert.match(state.items[0]?.organizationLabel ?? "", /connected notes/i);
});

test("buildStudyAttachmentPlanState describes no-retention zettelkasten runs clearly", () => {
  const state = buildStudyAttachmentPlanState({
    files: [mockFile("idea-note.txt", "text/plain")],
    capabilities: null,
    knowledgeMode: "zettelkasten",
    retentionMode: "keep_nothing",
  });

  assert.equal(state.readableCount, 1);
  assert.equal(state.deferredCount, 0);
  assert.equal(state.skippedCount, 0);
  assert.match(state.headline, /ready for immediate grounded study synthesis/i);
  assert.match(state.items[0]?.organizationLabel ?? "", /zettelkasten/i);
  assert.match(state.items[0]?.retentionLabel ?? "", /neither the file nor extracted content stays/i);
  assert.match(state.items[0]?.nextStepLabel ?? "", /will not be retained afterward/i);
});
