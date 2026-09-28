import assert from "node:assert/strict";
import test from "node:test";

import type { AttachmentGroundingEvidence } from "../src/lib/attachmentGroundingEvidence.ts";
import { buildStudyRunOutcomeState } from "../src/lib/studyRunOutcomeState.ts";

function evidence(overrides: Partial<AttachmentGroundingEvidence> = {}): AttachmentGroundingEvidence {
  return {
    sourceCount: 2,
    selectedFileCount: 2,
    skippedFileCount: 0,
    unreadableFileCount: 0,
    sourceLabels: ["Week 3 Lecture.pdf", "Chapter 4 Reading.pdf"],
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
    ...overrides,
  };
}

test("buildStudyRunOutcomeState prioritizes linked graph for connected study memory", () => {
  const state = buildStudyRunOutcomeState(evidence());

  assert.ok(state);
  assert.equal(state!.badge, "Connected study memory");
  assert.equal(state!.primaryActionId, "graph");
  assert.match(state!.cards[2]?.detail ?? "", /Supertags keep related material clustered/i);
  assert.match(state!.nextStepLabel, /strongest supertag cluster/i);
});

test("buildStudyRunOutcomeState handles one-off temporary runs", () => {
  const state = buildStudyRunOutcomeState(
    evidence({
      sourceCount: 1,
      sourceLabels: ["Private note.txt"],
      retentionMode: "keep_nothing",
      retentionLabel: "Do not keep anything",
      knowledgeMode: "connected_notes",
      cleanupStatus: "pending",
    }),
  );

  assert.ok(state);
  assert.equal(state!.badge, "One-off answer");
  assert.equal(state!.primaryActionId, "search");
  assert.match(state!.cards[0]?.detail ?? "", /temporary only|removed/i);
  assert.match(state!.cards[2]?.detail ?? "", /Nothing compounds/i);
});

test("buildStudyRunOutcomeState favors Zettelkasten follow-through when requested", () => {
  const state = buildStudyRunOutcomeState(
    evidence({
      knowledgeMode: "zettelkasten",
      knowledgeLabel: "Zettelkasten",
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

  assert.ok(state);
  assert.equal(state!.badge, "Zettelkasten ready");
  assert.equal(state!.primaryActionId, "graph");
  assert.equal(state!.primaryActionLabel, "Open Zettelkasten view");
  assert.match(state!.cards[1]?.detail ?? "", /note chain|source-note chain/i);
});
