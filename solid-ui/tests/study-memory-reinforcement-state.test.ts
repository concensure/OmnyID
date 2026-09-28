import assert from "node:assert/strict";
import test from "node:test";

import type { AttachmentGroundingEvidence } from "../src/lib/attachmentGroundingEvidence.ts";
import { buildStudyMemoryReinforcementState } from "../src/lib/studyMemoryReinforcementState.ts";

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

test("buildStudyMemoryReinforcementState marks keep-nothing runs as one-off", () => {
  const state = buildStudyMemoryReinforcementState(
    evidence({ retentionMode: "keep_nothing" }),
  );

  assert.equal(state?.grade, "one_off");
  assert.match(state?.headline ?? "", /did not reinforce long-term study memory/i);
  assert.match(state?.signals[1]?.value ?? "", /Keep extracted notes/i);
});

test("buildStudyMemoryReinforcementState marks single-source retained material as fragile", () => {
  const state = buildStudyMemoryReinforcementState(evidence());

  assert.equal(state?.grade, "fragile");
  assert.match(state?.detail ?? "", /reinforcement is still shallow/i);
  assert.match(state?.signals[0]?.label ?? "", /Anchor coverage/i);
});

test("buildStudyMemoryReinforcementState marks repeated multi-source course threads as reinforced", () => {
  const state = buildStudyMemoryReinforcementState(
    evidence({
      sourceCount: 3,
      selectedFileCount: 3,
      sourceLabels: ["Week 3 Lecture.pdf", "Week 3 Reading.pdf", "Week 3 Tutorial Notes.md"],
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
          title: "Week 3 Reading.pdf",
          kindLabel: "Uploaded study source - parsed document",
          academicKind: "reading",
          academicSummary: "reading organized for study retrieval",
          courseTag: "course:bio101",
          weekTag: "week:3",
          lectureTag: null,
          zettelkastenStage: null,
        },
        {
          title: "Week 3 Tutorial Notes.md",
          kindLabel: "Uploaded study source - knowledge card",
          academicKind: "study_notes",
          academicSummary: "tutorial notes organized for study retrieval",
          courseTag: "course:bio101",
          weekTag: "week:3",
          lectureTag: null,
          zettelkastenStage: "literature_note",
        },
      ],
    }),
  );

  assert.equal(state?.grade, "reinforced");
  assert.match(state?.headline ?? "", /reusable study memory trail/i);
  assert.match(state?.signals[0]?.value ?? "", /repeated course anchor/i);
  assert.match(state?.signals[1]?.value ?? "", /study source types/i);
});

test("buildStudyMemoryReinforcementState marks zettelkasten carryover as developing when anchors are shallow", () => {
  const state = buildStudyMemoryReinforcementState(
    evidence({
      sourceDescriptors: [
        {
          title: "Biochem note.md",
          kindLabel: "Uploaded study source - knowledge card",
          academicKind: "study_notes",
          academicSummary: "study notes organized for study retrieval",
          courseTag: "course:biochem200",
          weekTag: null,
          lectureTag: null,
          zettelkastenStage: "source_note_review_pending",
        },
        {
          title: "Biochem recap.txt",
          kindLabel: "Uploaded study source",
          academicKind: "study_notes",
          academicSummary: "recap notes organized for study retrieval",
          courseTag: "course:biochem200",
          weekTag: null,
          lectureTag: null,
          zettelkastenStage: "literature_note",
        },
      ],
      sourceCount: 2,
      selectedFileCount: 2,
      sourceLabels: ["Biochem note.md", "Biochem recap.txt"],
      knowledgeMode: "zettelkasten",
    }),
  );

  assert.equal(state?.grade, "developing");
  assert.match(state?.signals[1]?.label ?? "", /Source mix/i);
  assert.match(state?.signals[2]?.value ?? "", /Zettelkasten stages/i);
});
