import assert from "node:assert/strict";
import test from "node:test";

import type { AttachmentGroundingEvidence } from "../src/lib/attachmentGroundingEvidence.ts";
import { buildStudyAttachmentActionState } from "../src/lib/studyAttachmentActionState.ts";

function buildEvidence(
  overrides: Partial<AttachmentGroundingEvidence> = {},
): AttachmentGroundingEvidence {
  return {
    sourceCount: 1,
    selectedFileCount: 1,
    skippedFileCount: 0,
    unreadableFileCount: 0,
    sourceLabels: ["week3.pdf"],
    footerLabel: "Based on 1 uploaded source",
    coverageStatus: "complete",
    coverageLabel: "Coverage complete for 1 uploaded file",
    retentionMode: "keep_extracted_only",
    retentionLabel: "Keep extracted notes only",
    knowledgeMode: "connected_notes",
    knowledgeLabel: "Connected notes",
    policyLabel: "Connected notes + Keep extracted notes only",
    policyOutcome: "Outcome",
    cleanupStatus: "not_needed",
    cleanupLabel: null,
    sourceLinks: [],
    sourceDescriptors: [
      {
        title: "week3.pdf",
        kindLabel: "Uploaded study source - parsed document",
        academicKind: "lecture slides",
        academicSummary: "lecture slides for week 3",
        courseTag: "course:bio101",
        weekTag: "week:3",
        lectureTag: "lecture:3",
        zettelkastenStage: null,
      },
    ],
    ...overrides,
  };
}

test("buildStudyAttachmentActionState favors study-specific copy for extracted academic uploads", () => {
  const state = buildStudyAttachmentActionState(buildEvidence());
  assert.deepEqual(state, {
    fileActionLabel: "Browse extracted study notes",
    graphActionLabel: "Open related study graph",
  });
});

test("buildStudyAttachmentActionState treats chapter and unit metadata as academic context", () => {
  const state = buildStudyAttachmentActionState(buildEvidence({
    sourceDescriptors: [
      {
        title: "chapter-notes.pdf",
        kindLabel: "Uploaded study source - parsed document",
        academicKind: null,
        academicSummary: null,
        courseTag: null,
        unitTag: "unit:2",
        chapterTag: "chapter:4",
        weekTag: null,
        lectureTag: null,
        zettelkastenStage: null,
      },
    ],
  }));

  assert.deepEqual(state, {
    fileActionLabel: "Browse extracted study notes",
    graphActionLabel: "Open related study graph",
  });
});

test("buildStudyAttachmentActionState emphasizes packs and strong links for multi-source connected notes", () => {
  const state = buildStudyAttachmentActionState(buildEvidence({
    sourceCount: 3,
    sourceLabels: ["week3.pdf", "lecture.m4a", "reading.pdf"],
  }));
  assert.deepEqual(state, {
    fileActionLabel: "Browse extracted study pack",
    graphActionLabel: "Inspect strongest links",
  });
});

test("buildStudyAttachmentActionState emphasizes source notes and chains for zettelkasten", () => {
  const state = buildStudyAttachmentActionState(buildEvidence({
    sourceCount: 2,
    knowledgeMode: "zettelkasten",
    knowledgeLabel: "Zettelkasten",
    policyLabel: "Zettelkasten + Keep extracted notes only",
  }));
  assert.deepEqual(state, {
    fileActionLabel: "Browse extracted source notes",
    graphActionLabel: "Inspect note chains",
  });
});

test("buildStudyAttachmentActionState hides file action when nothing is retained", () => {
  const state = buildStudyAttachmentActionState(buildEvidence({
    retentionMode: "keep_nothing",
    retentionLabel: "Keep nothing",
    policyLabel: "Connected notes + Keep nothing",
  }));
  assert.deepEqual(state, {
    fileActionLabel: null,
    graphActionLabel: "Open related study graph",
  });
});
