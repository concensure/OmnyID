import assert from "node:assert/strict";
import test from "node:test";

import {
  buildParaImportClassificationTags,
  formatParaImportKnowledgeModeLabel,
  formatParaImportRetentionModeLabel,
  normalizeParaImportLabel,
  paraTagsIncludePermanentNote,
  paraTagsIncludeReviewPending,
  paraTagsIncludeSourceNote,
  paraTagsMatchResourceLens,
  paraResourceKnowledgeTag,
} from "../src/lib/paraImportMode.ts";

test("normalizeParaImportLabel produces stable para-safe labels", () => {
  assert.equal(normalizeParaImportLabel("Week 3 Lecture Slides.pdf"), "week_3_lecture_slides");
  assert.equal(normalizeParaImportLabel("   "), "imported_item");
});

test("buildParaImportClassificationTags adds resource overlay tags", () => {
  assert.deepEqual(
    buildParaImportClassificationTags("resource", "Week 3 Lecture Slides.pdf", "zettelkasten"),
    ["resource:week_3_lecture_slides", "resource:zettelkasten", "zk:source_note", "zk:review_pending"],
  );
  assert.deepEqual(
    buildParaImportClassificationTags("project", "Sprint Plan.md", "connected_notes"),
    ["project:sprint_plan"],
  );
});

test("para import mode labels stay user readable", () => {
  assert.equal(paraResourceKnowledgeTag("standard"), "resource:reference");
  assert.equal(formatParaImportKnowledgeModeLabel("connected_notes"), "Connected notes");
  assert.equal(formatParaImportKnowledgeModeLabel("zettelkasten"), "Zettelkasten");
  assert.equal(formatParaImportRetentionModeLabel("keep_file"), "Keep file");
  assert.equal(formatParaImportRetentionModeLabel("keep_extracted_only"), "Keep extracted only");
});

test("paraTagsMatchResourceLens recognizes resource overlays", () => {
  const connectedTags = ["resource:week_3_lecture_slides", "resource:connected_notes"];
  const zettelkastenTags = ["resource:biochem_chain", "resource:zettelkasten", "zk:source_note", "zk:review_pending"];
  const referenceTags = ["resource:style_guide", "resource:reference"];

  assert.equal(paraTagsMatchResourceLens(connectedTags, "all"), true);
  assert.equal(paraTagsMatchResourceLens(connectedTags, "connected_notes"), true);
  assert.equal(paraTagsMatchResourceLens(connectedTags, "zettelkasten"), false);
  assert.equal(paraTagsMatchResourceLens(zettelkastenTags, "zettelkasten"), true);
  assert.equal(paraTagsMatchResourceLens(zettelkastenTags, "review_queue"), true);
  assert.equal(paraTagsMatchResourceLens(referenceTags, "reference"), true);
  assert.equal(paraTagsIncludeReviewPending(zettelkastenTags), true);
  assert.equal(paraTagsIncludeSourceNote(zettelkastenTags), true);
  assert.equal(paraTagsIncludePermanentNote(["zk:permanent_note"]), true);
  assert.equal(paraTagsMatchResourceLens(["resource:zettelkasten", "zk:permanent_note"], "permanent_notes"), true);
});
