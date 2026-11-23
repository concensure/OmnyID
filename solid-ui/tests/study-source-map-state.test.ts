import assert from "node:assert/strict";
import test from "node:test";

import { summarizeStudySourceMap } from "../src/lib/studySourceMapState.ts";
import type { AttachmentGroundingEvidence } from "../src/lib/attachmentGroundingEvidence.ts";

function buildEvidence(
  overrides: Partial<AttachmentGroundingEvidence> = {},
): AttachmentGroundingEvidence {
  return {
    sourceCount: 2,
    selectedFileCount: 2,
    skippedFileCount: 0,
    unreadableFileCount: 0,
    sourceLabels: ["Week 3 Lecture.pdf", "Week 3 Reading.pdf"],
    footerLabel: "Based on 2 uploaded sources",
    coverageStatus: "complete",
    coverageLabel: "Coverage complete for 2 uploaded files",
    retentionMode: "keep_extracted_only",
    retentionLabel: "Keep extracted notes only",
    knowledgeMode: "connected_notes",
    knowledgeLabel: "Connected notes",
    policyLabel: "Connected notes + Keep extracted notes only",
    policyOutcome: "Outcome: OmnyID keeps the extracted notes, supertags, and knowledge links, but removes the original file.",
    cleanupStatus: "not_needed",
    cleanupLabel: null,
    sourceLinks: [],
    sourceDescriptors: [
      {
        title: "Week 3 Lecture.pdf",
        kindLabel: "Uploaded study source - parsed document",
        academicKind: "lecture_slides",
        academicSummary: "lecture slides Â· course econ101 Â· week 3 organized for study retrieval.",
        courseTag: "course:econ101",
        weekTag: "week:3",
        lectureTag: "lecture:3",
        chapterTag: null,
        unitTag: null,
        zettelkastenStage: null,
      },
      {
        title: "Week 3 Reading.pdf",
        kindLabel: "Uploaded study source - parsed document",
        academicKind: "reading",
        academicSummary: "assigned reading Â· course econ101 Â· week 3 organized for study retrieval.",
        courseTag: "course:econ101",
        weekTag: "week:3",
        lectureTag: null,
        chapterTag: null,
        unitTag: null,
        zettelkastenStage: null,
      },
    ],
    ...overrides,
  };
}

test("summarizeStudySourceMap explains retained connected-note study sets", () => {
  const summary = summarizeStudySourceMap(buildEvidence());
  assert.ok(summary);
  assert.equal(summary?.descriptorCount, 2);
  assert.deepEqual(summary?.courseTags, ["course:econ101"]);
  assert.deepEqual(summary?.weekTags, ["week:3"]);
  assert.match(summary?.headline ?? "", /course:econ101/i);
  assert.match(summary?.retrievalSummary ?? "", /Files and Linked ideas stay searchable/i);
  assert.match(summary?.nextStepSummary ?? "", /open Linked ideas/i);
});

test("summarizeStudySourceMap explains zettelkasten follow-up when relevant", () => {
  const summary = summarizeStudySourceMap(buildEvidence({
    sourceCount: 1,
    sourceLabels: ["Biochem note.md"],
    knowledgeMode: "zettelkasten",
    sourceDescriptors: [
      {
        title: "Biochem note.md",
        kindLabel: "Uploaded study source",
        academicKind: "study_notes",
        academicSummary: "study notes Â· course biochem200 organized for study retrieval.",
        courseTag: "course:biochem200",
        weekTag: null,
        lectureTag: null,
        chapterTag: null,
        unitTag: null,
        zettelkastenStage: "source_note_review_pending",
      },
    ],
  }));
  assert.ok(summary);
  assert.deepEqual(summary?.zettelkastenStages, ["source_note_review_pending"]);
  assert.match(summary?.retrievalSummary ?? "", /Zettelkasten stages/i);
  assert.match(summary?.nextStepSummary ?? "", /open the Zettelkasten lens/i);
});

test("summarizeStudySourceMap exposes uploaded chapter and unit focus for study generation", () => {
  const summary = summarizeStudySourceMap(buildEvidence({
    sourceCount: 1,
    sourceLabels: ["Contracts Chapter 4.pdf"],
    sourceDescriptors: [
      {
        title: "Contracts Chapter 4.pdf",
        kindLabel: "Uploaded study source - parsed document",
        academicKind: "reading",
        academicSummary: "assigned reading with course, unit, and chapter scope.",
        courseTag: "course:law101",
        weekTag: null,
        lectureTag: null,
        chapterTag: "chapter:4",
        unitTag: "unit:contracts",
        zettelkastenStage: null,
      },
    ],
  }));

  assert.ok(summary);
  assert.deepEqual(summary?.unitTags, ["unit:contracts"]);
  assert.deepEqual(summary?.chapterTags, ["chapter:4"]);
  assert.match(summary?.headline ?? "", /course:law101.*unit:contracts.*chapter:4/i);
  assert.match(summary?.retrievalSummary ?? "", /filtered by unit or chapter/i);
  assert.match(summary?.nextStepSummary ?? "", /quiz, flashcards, or exam prep/i);
});

test("summarizeStudySourceMap warns when uploads are session-only", () => {
  const summary = summarizeStudySourceMap(buildEvidence({
    retentionMode: "keep_nothing",
  }));
  assert.ok(summary);
  assert.match(summary?.retrievalSummary ?? "", /nothing will be retained/i);
  assert.match(summary?.nextStepSummary ?? "", /rerun the upload with Keep extracted notes/i);
});
