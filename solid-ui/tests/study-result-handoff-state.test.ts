import assert from "node:assert/strict";
import test from "node:test";

import type { AttachmentGroundingEvidence } from "../src/lib/attachmentGroundingEvidence.ts";
import { buildStudyResultHandoffState } from "../src/lib/studyResultHandoffState.ts";

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
        knowledgeGraphGroupKey: "week:3",
        knowledgeGraphLinkTags: ["course:bio101", "week:3", "topic:cellular_respiration"],
      },
    ],
    ...overrides,
  };
}

test("buildStudyResultHandoffState handles one-off retained-nothing answers", () => {
  const state = buildStudyResultHandoffState(
    evidence({ retentionMode: "keep_nothing" }),
  );

  assert.ok(state);
  assert.match(state!.headline, /reusable study memory/i);
  assert.equal(state!.steps.length, 1);
  assert.equal(state!.steps[0]?.actionId, "search");
});

test("buildStudyResultHandoffState prioritizes linked ideas for multi-source connected notes", () => {
  const state = buildStudyResultHandoffState(
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
          knowledgeGraphGroupKey: "week:3",
          knowledgeGraphLinkTags: ["course:bio101", "week:3", "topic:cellular_respiration"],
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
          knowledgeGraphGroupKey: "week:3",
          knowledgeGraphLinkTags: ["course:bio101", "week:3", "topic:mitochondria"],
        },
      ],
    }),
  );

  assert.ok(state);
  assert.equal(state!.steps[0]?.actionId, "graph");
  assert.equal(state!.steps[1]?.actionId, "files");
  assert.equal(state!.steps[2]?.actionId, "search");
  assert.match(state!.steps[0]?.detail ?? "", /graph anchor week:3/i);
  assert.match(state!.steps[0]?.detail ?? "", /topic:mitochondria/i);
});

test("buildStudyResultHandoffState prioritizes files for single-source connected notes", () => {
  const state = buildStudyResultHandoffState(evidence());

  assert.ok(state);
  assert.match(state!.badge, /single-source/i);
  assert.equal(state!.steps[0]?.actionId, "files");
  assert.equal(state!.steps[1]?.actionId, "search");
});

test("buildStudyResultHandoffState adds assignment report follow-through from source metadata", () => {
  const state = buildStudyResultHandoffState(
    evidence({
      sourceDescriptors: [
        {
          ...evidence().sourceDescriptors[0]!,
          title: "Assessment 2 Rubric.pdf",
          academicKind: "rubric",
          academicSummary: "Essay marking criteria and source requirements.",
          knowledgeGraphGroupKey: "topic:essay",
          knowledgeGraphLinkTags: ["course:eng101", "assessment:essay"],
        },
      ],
    }),
  );

  assert.ok(state);
  assert.match(state!.detail, /assignment report/i);
  assert.match(state!.detail, /brief, rubric, and one relevant source/i);
});

test("buildStudyResultHandoffState adds weekly report follow-through for lecture evidence", () => {
  const state = buildStudyResultHandoffState(
    evidence({
      sourceCount: 2,
      sourceDescriptors: [
        evidence().sourceDescriptors[0]!,
        {
          title: "Week 3 Tutorial Notes.md",
          kindLabel: "Uploaded study source - parsed document",
          academicKind: "tutorial_notes",
          academicSummary: "Week 3 tutorial examples.",
          courseTag: "course:bio101",
          weekTag: "week:3",
          lectureTag: null,
          zettelkastenStage: null,
          knowledgeGraphGroupKey: "week:3",
          knowledgeGraphLinkTags: ["course:bio101", "week:3"],
        },
      ],
    }),
  );

  assert.ok(state);
  assert.match(state!.detail, /weekly revision report/i);
  assert.match(state!.detail, /same course\/week/i);
});

test("buildStudyResultHandoffState prioritizes Zettelkasten chain follow-through", () => {
  const state = buildStudyResultHandoffState(
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
          zettelkastenNextAction: "Write one permanent note about the strongest contradiction.",
          knowledgeGraphGroupKey: "topic:epistemology",
          knowledgeGraphLinkTags: ["topic:epistemology"],
        },
      ],
    }),
  );

  assert.ok(state);
  assert.match(state!.headline, /note development|note chain/i);
  assert.equal(state!.steps[0]?.actionId, "graph");
  assert.equal(state!.steps[0]?.actionLabel, "Open Zettelkasten view");
  assert.match(state!.steps[0]?.detail ?? "", /graph anchor topic:epistemology/i);
  assert.match(state!.steps[2]?.detail ?? "", /Next note move/i);
  assert.match(state!.steps[2]?.detail ?? "", /permanent note/i);
});
