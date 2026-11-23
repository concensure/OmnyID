import assert from "node:assert/strict";
import test from "node:test";

import type { AttachmentGroundingEvidence } from "../src/lib/attachmentGroundingEvidence.ts";
import { buildStudyResultRetentionMapState } from "../src/lib/studyResultRetentionMapState.ts";
import type { StudySourceMapSummary } from "../src/lib/studySourceMapState.ts";

function baseEvidence(overrides: Partial<AttachmentGroundingEvidence> = {}): AttachmentGroundingEvidence {
  return {
    sourceCount: 1,
    selectedFileCount: 1,
    skippedFileCount: 0,
    unreadableFileCount: 0,
    sourceLabels: ["Week 3 lecture.pdf"],
    footerLabel: "Based on 1 uploaded source",
    coverageStatus: "complete",
    coverageLabel: "Coverage complete for 1 uploaded file",
    retentionMode: "keep_extracted_only",
    retentionLabel: "Keep extracted content only",
    knowledgeMode: "connected_notes",
    knowledgeLabel: "Connected notes",
    policyLabel: "Connected notes + keep extracted content only",
    policyOutcome: "Extracted content will be retained.",
    cleanupStatus: "not_needed",
    cleanupLabel: null,
    sourceLinks: [],
    sourceDescriptors: [{
      title: "Week 3 lecture.pdf",
      kindLabel: "Uploaded study source - parsed document",
      academicKind: "lecture_slides",
      academicSummary: "Week 3 lecture on market failure.",
      courseTag: "ECON101",
      weekTag: "Week 3",
      lectureTag: "Lecture 3",
      zettelkastenStage: null,
      knowledgeGraphGroupKey: "week:3",
      knowledgeGraphLinkTags: ["course:econ101", "week:3", "topic:market_failure"],
    }],
    ...overrides,
  };
}

function baseSummary(overrides: Partial<StudySourceMapSummary> = {}): StudySourceMapSummary {
  return {
    descriptorCount: 1,
    academicKinds: ["lecture_slides"],
    courseTags: ["ECON101"],
    weekTags: ["Week 3"],
    lectureTags: ["Lecture 3"],
    zettelkastenStages: [],
    headline: "ECON101 · Week 3 organized for grounded study retrieval.",
    retrievalSummary: "Retained through supertags and study classifications so Files and Linked ideas stay searchable.",
    nextStepSummary: "Next best step: open Files to review the retained source and continue from the linked study graph.",
    ...overrides,
  };
}

test("buildStudyResultRetentionMapState marks keep-nothing runs as transient", () => {
  const state = buildStudyResultRetentionMapState({
    evidence: baseEvidence({
      retentionMode: "keep_nothing",
      retentionLabel: "Do not keep anything",
      policyLabel: "Connected notes + keep nothing",
      cleanupStatus: "pending",
      cleanupLabel: "Temporary cleanup pending",
    }),
    summary: baseSummary(),
  });

  assert.equal(state?.tone, "amber");
  assert.equal(state?.primaryActionId, "search");
  assert.match(state?.headline ?? "", /did not start reusable study memory/i);
  assert.match(state?.cards[1]?.detail ?? "", /Files|Linked ideas/i);
});

test("buildStudyResultRetentionMapState sends single retained sources to Files first", () => {
  const state = buildStudyResultRetentionMapState({
    evidence: baseEvidence(),
    summary: baseSummary(),
  });

  assert.equal(state?.tone, "sky");
  assert.equal(state?.primaryActionId, "files");
  assert.equal(state?.secondaryActionId, "search");
  assert.match(state?.cards[2]?.detail ?? "", /supertags/i);
  assert.match(state?.cards[2]?.detail ?? "", /graph anchor week:3/i);
  assert.match(state?.cards[2]?.detail ?? "", /topic:market_failure/i);
});

test("buildStudyResultRetentionMapState prioritizes linked ideas for connected packs", () => {
  const state = buildStudyResultRetentionMapState({
    evidence: baseEvidence({
      sourceCount: 3,
      selectedFileCount: 3,
      sourceLabels: ["Week 3 lecture.pdf", "tutorial notes.md", "reading.pdf"],
      footerLabel: "Based on 3 uploaded sources",
      coverageLabel: "Coverage complete for 3 uploaded files",
      sourceDescriptors: [
        baseEvidence().sourceDescriptors[0],
        {
          title: "tutorial notes.md",
          kindLabel: "Uploaded study source",
          academicKind: "rough_notes",
          academicSummary: "Tutorial notes on week 3 examples.",
          courseTag: "ECON101",
          weekTag: "Week 3",
          lectureTag: null,
          zettelkastenStage: null,
          knowledgeGraphGroupKey: "week:3",
          knowledgeGraphLinkTags: ["course:econ101", "week:3", "topic:market_failure"],
        },
        {
          title: "reading.pdf",
          kindLabel: "Uploaded study source - parsed document",
          academicKind: "reading",
          academicSummary: "Reading on market failure and public goods.",
          courseTag: "ECON101",
          weekTag: "Week 3",
          lectureTag: null,
          zettelkastenStage: null,
          knowledgeGraphGroupKey: "week:3",
          knowledgeGraphLinkTags: ["course:econ101", "week:3", "topic:public_goods"],
        },
      ],
    }),
    summary: baseSummary({
      descriptorCount: 3,
      headline: "3 study sources linked into one connected study set.",
    }),
  });

  assert.equal(state?.tone, "emerald");
  assert.equal(state?.primaryActionId, "graph");
  assert.equal(state?.secondaryActionId, "files");
  assert.match(state?.detail ?? "", /immediate value/i);
  assert.match(state?.cards[1]?.detail ?? "", /graph anchor week:3/i);
  assert.match(state?.cards[1]?.detail ?? "", /topic:public_goods/i);
});

test("buildStudyResultRetentionMapState supports retained zettelkasten branches", () => {
  const state = buildStudyResultRetentionMapState({
    evidence: baseEvidence({
      knowledgeMode: "zettelkasten",
      knowledgeLabel: "Zettelkasten",
      policyLabel: "Zettelkasten + keep extracted content only",
      sourceDescriptors: [{
        title: "Week 3 lecture.pdf",
        kindLabel: "Uploaded study source - parsed document",
        academicKind: "lecture_slides",
        academicSummary: "Week 3 lecture on market failure.",
        courseTag: "ECON101",
        weekTag: "Week 3",
        lectureTag: "Lecture 3",
        zettelkastenStage: "source_note",
        zettelkastenNextAction: "Promote the market failure contrast into a permanent note.",
        knowledgeGraphGroupKey: "topic:market_failure",
        knowledgeGraphLinkTags: ["topic:market_failure", "course:econ101"],
      }],
    }),
    summary: baseSummary({
      zettelkastenStages: ["source_note"],
      retrievalSummary: "Retained through supertags and Zettelkasten stages such as source_note.",
    }),
  });

  assert.equal(state?.tone, "violet");
  assert.equal(state?.primaryActionLabel, "Open Zettelkasten view");
  assert.equal(state?.secondaryActionId, "files");
  assert.match(state?.cards[1]?.detail ?? "", /graph anchor topic:market_failure/i);
  assert.match(state?.cards[2]?.detail ?? "", /stage|supertags/i);
  assert.match(state?.cards[2]?.detail ?? "", /Next note move/i);
  assert.match(state?.cards[2]?.detail ?? "", /permanent note/i);
});
