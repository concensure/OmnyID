import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFileLibraryIntentFromAttachmentGrounding,
  buildFileLibraryIntentFromKnowledgeGraphFocus,
  consumeFileLibraryNavigationIntent,
  saveFileLibraryNavigationIntent,
} from "../src/lib/fileLibraryNavigationState.ts";
import type { AttachmentGroundingEvidence } from "../src/lib/attachmentGroundingEvidence.ts";

function buildEvidence(
  overrides: Partial<AttachmentGroundingEvidence> = {},
): AttachmentGroundingEvidence {
  return {
    sourceCount: 2,
    selectedFileCount: 2,
    skippedFileCount: 0,
    unreadableFileCount: 0,
    sourceLabels: ["Week 3 market failures.pdf", "lecture-audio.m4a"],
    footerLabel: "Based on 2 uploaded sources",
    coverageStatus: "complete",
    coverageLabel: "Coverage complete for 2 uploaded files",
    retentionMode: "keep_extracted_only",
    retentionLabel: "Keeps extracted notes only",
    knowledgeMode: "connected_notes",
    knowledgeLabel: "Connected notes organization",
    policyLabel: "Keeps extracted notes only - Connected notes organization",
    cleanupStatus: "not_needed",
    cleanupLabel: null,
    sourceLinks: [],
    policyOutcome: "Only extracted notes remain available for future study sessions.",
    sourceDescriptors: [],
    ...overrides,
  };
}

test("buildFileLibraryIntentFromAttachmentGrounding returns retention-aware browse intent", () => {
  const keepFileIntent = buildFileLibraryIntentFromAttachmentGrounding(
    buildEvidence({
      sourceCount: 1,
      sourceLabels: ["Week 3 market failures.pdf"],
      retentionMode: "keep_file",
      retentionLabel: "Keeps files and extracted notes",
    }),
  );
  assert.deepEqual(keepFileIntent, {
    query: "Week 3 market failures.pdf",
    tag: null,
    knowledgeMode: "connected_notes",
    retentionMode: "keep_file",
    sourceCount: 1,
    studyReadiness: "ready_now",
    academicKind: null,
    courseTag: null,
    unitTag: null,
    chapterTag: null,
    weekTag: null,
    lectureTag: null,
    zettelkastenStage: null,
    zettelkastenEntryType: null,
    zettelkastenNextAction: null,
    knowledgeGraphGroupKey: null,
    knowledgeGraphLinkTags: [],
    notice: "Showing the files retained from your latest upload.",
  });

  const extractedOnlyIntent = buildFileLibraryIntentFromAttachmentGrounding(
    buildEvidence({
      sourceDescriptors: [
        {
          title: "Week 3 market failures.pdf",
          kindLabel: "Uploaded study source - parsed document",
          academicKind: "lecture_slides",
          academicSummary: "lecture slides · course econ101 · week 3 organized for study retrieval.",
          courseTag: "course:econ101",
          unitTag: "unit:2",
          chapterTag: "chapter:4",
          weekTag: "week:3",
          lectureTag: "lecture:3",
          zettelkastenStage: null,
          knowledgeGraphGroupKey: "course:econ101",
          knowledgeGraphLinkTags: ["course:econ101", "week:3", "topic:market-failures"],
        },
        {
          title: "lecture-audio.m4a",
          kindLabel: "Uploaded study source - transcript",
          academicKind: "transcript",
          academicSummary: "lecture recording · course econ101 · week 3 organized for study retrieval.",
          courseTag: "course:econ101",
          unitTag: "unit:2",
          chapterTag: "chapter:4",
          weekTag: "week:3",
          lectureTag: null,
          zettelkastenStage: "source_note_review_pending",
          zettelkastenEntryType: "source_note",
          zettelkastenNextAction: "Promote this source note into one permanent note.",
          knowledgeGraphGroupKey: "course:econ101",
          knowledgeGraphLinkTags: ["course:econ101", "week:3", "topic:market-failures"],
        },
      ],
    }),
  );
  assert.deepEqual(extractedOnlyIntent, {
    query: "course:econ101",
    tag: "course:econ101",
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    sourceCount: 2,
    studyReadiness: "ready_now",
    courseTag: "course:econ101",
    unitTag: "unit:2",
    chapterTag: "chapter:4",
    weekTag: "week:3",
    lectureTag: "lecture:3",
    notice: "Showing the extracted study sources retained from your latest upload.",
    academicKind: null,
    zettelkastenStage: "source_note_review_pending",
    zettelkastenEntryType: "source_note",
    zettelkastenNextAction: "Promote this source note into one permanent note.",
    knowledgeGraphGroupKey: "course:econ101",
    knowledgeGraphLinkTags: ["course:econ101", "week:3", "topic:market-failures"],
  });
});

test("buildFileLibraryIntentFromAttachmentGrounding skips session-only uploads", () => {
  const intent = buildFileLibraryIntentFromAttachmentGrounding(
    buildEvidence({
      retentionMode: "keep_nothing",
      retentionLabel: "Keeps nothing after this run",
      cleanupStatus: "pending",
      cleanupLabel: "Temporary cleanup pending",
    }),
  );
  assert.equal(intent, null);
});

test("consumeFileLibraryNavigationIntent clears saved state after one read", () => {
  saveFileLibraryNavigationIntent({
    query: "economics",
    knowledgeMode: "zettelkasten",
    retentionMode: "keep_extracted_only",
    studyReadiness: "developing",
    academicKind: "lecture_slides",
    courseTag: "course:econ101",
    unitTag: "unit:2",
    chapterTag: "chapter:4",
    weekTag: "week:3",
    lectureTag: "lecture:3",
    zettelkastenStage: "source_note",
    zettelkastenEntryType: "source_note",
    zettelkastenNextAction: "Write the permanent note.",
    knowledgeGraphGroupKey: "course:econ101",
    knowledgeGraphLinkTags: ["course:econ101"],
    notice: "Showing the extracted study sources retained from your latest upload.",
  });

  assert.deepEqual(consumeFileLibraryNavigationIntent(), {
    query: "economics",
    knowledgeMode: "zettelkasten",
    retentionMode: "keep_extracted_only",
    studyReadiness: "developing",
    academicKind: "lecture_slides",
    courseTag: "course:econ101",
    unitTag: "unit:2",
    chapterTag: "chapter:4",
    weekTag: "week:3",
    lectureTag: "lecture:3",
    zettelkastenStage: "source_note",
    zettelkastenEntryType: "source_note",
    zettelkastenNextAction: "Write the permanent note.",
    knowledgeGraphGroupKey: "course:econ101",
    knowledgeGraphLinkTags: ["course:econ101"],
    notice: "Showing the extracted study sources retained from your latest upload.",
  });
  assert.equal(consumeFileLibraryNavigationIntent(), null);
});

test("buildFileLibraryIntentFromKnowledgeGraphFocus preserves study filters across surfaces", () => {
  assert.deepEqual(
    buildFileLibraryIntentFromKnowledgeGraphFocus({
      searchQuery: "market failures",
      activeTag: "topic:market-failures",
      activeLens: "study_materials",
      academicKind: "lecture_slides",
      courseTag: "course:econ101",
      unitTag: "unit:2",
      chapterTag: "chapter:4",
      weekTag: "week:3",
      lectureTag: "lecture:3",
      zettelkastenStage: null,
    }),
    {
      query: "market failures",
      tag: "topic:market-failures",
      knowledgeMode: "connected_notes",
      studyReadiness: "ready_now",
      sourceKind: "parsed_document",
      academicKind: "lecture_slides",
      courseTag: "course:econ101",
      unitTag: "unit:2",
      chapterTag: "chapter:4",
      weekTag: "week:3",
      lectureTag: "lecture:3",
      zettelkastenStage: null,
      zettelkastenEntryType: null,
      zettelkastenNextAction: null,
      knowledgeGraphGroupKey: null,
      knowledgeGraphLinkTags: [],
      notice: "Showing files that match your current knowledge-graph focus.",
    },
  );

  assert.deepEqual(
    buildFileLibraryIntentFromKnowledgeGraphFocus({
      activeLens: "review_queue",
      zettelkastenStage: "review_pending",
    }),
    {
      query: undefined,
      tag: null,
      knowledgeMode: "zettelkasten",
      studyReadiness: "developing",
      sourceKind: undefined,
      academicKind: null,
      courseTag: null,
      unitTag: null,
      chapterTag: null,
      weekTag: null,
      lectureTag: null,
      zettelkastenStage: "review_pending",
      zettelkastenEntryType: null,
      zettelkastenNextAction: null,
      knowledgeGraphGroupKey: null,
      knowledgeGraphLinkTags: [],
      notice: "Showing files that match your current knowledge-graph focus.",
    },
  );
});
