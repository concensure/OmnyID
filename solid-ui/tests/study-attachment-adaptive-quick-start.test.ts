import assert from "node:assert/strict";
import test from "node:test";

import {
  selectAdaptiveStudyAttachmentQuickStart,
  UNREADABLE_STUDY_ATTACHMENT_QUICK_START,
} from "../src/lib/studyAttachmentAdaptiveQuickStart.ts";

test("selectAdaptiveStudyAttachmentQuickStart returns null with no files", () => {
  assert.equal(
    selectAdaptiveStudyAttachmentQuickStart({ files: [], supportedCount: 0 }),
    null,
  );
});

test("selectAdaptiveStudyAttachmentQuickStart chooses conversion-first path when no files are readable", () => {
  const seed = selectAdaptiveStudyAttachmentQuickStart({
    files: [{ name: "lecture.pages", type: "application/octet-stream" }],
    supportedCount: 0,
  });
  assert.equal(seed?.label, UNREADABLE_STUDY_ATTACHMENT_QUICK_START.label);
});

test("selectAdaptiveStudyAttachmentQuickStart chooses file-aware study path when readable material exists", () => {
  const seed = selectAdaptiveStudyAttachmentQuickStart({
    files: [{ name: "Week 3 Lecture Slides.pdf", type: "application/pdf" }],
    supportedCount: 1,
  });
  assert.equal(seed?.label, "Summarize week 3");
});

test("selectAdaptiveStudyAttachmentQuickStart honors a zettelkasten preference when readable material exists", () => {
  const seed = selectAdaptiveStudyAttachmentQuickStart({
    files: [{ name: "Week 3 Lecture Slides.pdf", type: "application/pdf" }],
    supportedCount: 1,
    preferredKnowledgeMode: "zettelkasten",
  });
  assert.equal(seed?.label, "Start a source-note chain");
  assert.equal(seed?.knowledgeMode, "zettelkasten");
});
