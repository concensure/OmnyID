import assert from "node:assert/strict";
import test from "node:test";

import type { AttachmentGroundingEvidence } from "../src/lib/attachmentGroundingEvidence.ts";
import { buildStudyResultMomentumState } from "../src/lib/studyResultMomentumState.ts";

function evidence(overrides: Partial<AttachmentGroundingEvidence> = {}): AttachmentGroundingEvidence {
  return {
    sourceCount: 1,
    selectedFileCount: 1,
    skippedFileCount: 0,
    unreadableFileCount: 0,
    sourceLabels: ["Week 3 Lecture.pdf"],
    footerLabel: "Based on 1 uploaded source",
    coverageStatus: "complete",
    coverageLabel: "Coverage complete for 1 uploaded file",
    retentionMode: "keep_extracted_only",
    retentionLabel: "Keep extracted notes only",
    knowledgeMode: "connected_notes",
    knowledgeLabel: "Connected notes",
    policyLabel: "Connected notes - Keep extracted notes only",
    policyOutcome: "Only extracted notes remain available for future study sessions.",
    cleanupStatus: "not_needed",
    cleanupLabel: null,
    sourceLinks: [],
    sourceDescriptors: [
      {
        title: "Week 3 Lecture.pdf",
        kindLabel: "Uploaded study source - parsed document",
        academicKind: "lecture_slides",
        academicSummary: "lecture slides organized for study retrieval",
        courseTag: "course:bio101",
        weekTag: "week:3",
        lectureTag: "lecture:week_3",
        zettelkastenStage: null,
      },
    ],
    ...overrides,
  };
}

test("buildStudyResultMomentumState flags session-only answers as one-off", () => {
  const state = buildStudyResultMomentumState(evidence({ retentionMode: "keep_nothing" }));
  assert.equal(state?.grade, "one_off");
  assert.equal(state?.primaryActionLabel, "Rerun with retention");
});

test("buildStudyResultMomentumState recognizes reusable connected study packs", () => {
  const state = buildStudyResultMomentumState(
    evidence({
      sourceCount: 2,
      sourceDescriptors: [
        {
          title: "Week 3 Lecture.pdf",
          kindLabel: "Uploaded study source - parsed document",
          academicKind: "lecture_slides",
          academicSummary: "lecture slides organized for study retrieval",
          courseTag: "course:bio101",
          weekTag: "week:3",
          lectureTag: "lecture:week_3",
          zettelkastenStage: null,
        },
        {
          title: "Chapter 4 Reading.pdf",
          kindLabel: "Uploaded study source - parsed document",
          academicKind: "reading",
          academicSummary: "reading organized for study retrieval",
          courseTag: "course:bio101",
          weekTag: "week:3",
          lectureTag: null,
          zettelkastenStage: null,
        },
      ],
    }),
  );
  assert.equal(state?.grade, "reusable");
  assert.equal(state?.primaryActionLabel, "Open Linked ideas");
});

test("buildStudyResultMomentumState recognizes zettelkasten progress", () => {
  const state = buildStudyResultMomentumState(
    evidence({
      knowledgeMode: "zettelkasten",
      sourceDescriptors: [
        {
          title: "Source note",
          kindLabel: "Uploaded study source - knowledge card",
          academicKind: null,
          academicSummary: null,
          courseTag: null,
          weekTag: null,
          lectureTag: null,
          zettelkastenStage: "source_note",
        },
      ],
    }),
  );
  assert.equal(state?.grade, "reusable");
  assert.equal(state?.primaryActionLabel, "Open Zettelkasten view");
});
