import assert from "node:assert/strict";
import test from "node:test";

import { buildStudyResultValuePathState } from "../src/lib/studyResultValuePathState.ts";
import type { AttachmentGroundingEvidence } from "../src/lib/attachmentGroundingEvidence.ts";
import { buildReportQuickStartSeed } from "../src/lib/reportGeneratorState.ts";

function baseEvidence(
  overrides: Partial<AttachmentGroundingEvidence> = {},
): AttachmentGroundingEvidence {
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
    retentionLabel: "Keep extracted content only",
    knowledgeMode: "connected_notes",
    knowledgeLabel: "Connected notes",
    policyLabel: "Connected notes + keep extracted content",
    policyOutcome: "Retain extracted content only",
    cleanupStatus: "not_needed",
    cleanupLabel: null,
    sourceLinks: [],
    sourceDescriptors: [{
      title: "Week 3 Lecture.pdf",
      kindLabel: "Uploaded study source - parsed document",
      academicKind: "lecture_slides",
      academicSummary: "Week 3 market failures lecture.",
      courseTag: "ECON101",
      weekTag: "Week 3",
      lectureTag: "Lecture 3",
      zettelkastenStage: null,
      knowledgeGraphGroupKey: "week:3",
      knowledgeGraphLinkTags: ["course:econ101", "week:3", "topic:market_failures"],
    }],
    ...overrides,
  };
}

test("buildStudyResultValuePathState prioritizes retention repair", () => {
  const state = buildStudyResultValuePathState({
    evidence: baseEvidence({ retentionMode: "keep_nothing", cleanupStatus: "pending" }),
    continuationSeed: null,
  });

  assert.equal(state?.grade, "fix_retention");
  assert.equal(state?.primaryActionId, "search");
  assert.match(state?.detail ?? "", /Files, supertags, and linked retrieval/i);
});

test("buildStudyResultValuePathState treats multi-source academic runs as connected packs", () => {
  const state = buildStudyResultValuePathState({
    evidence: baseEvidence({
      sourceCount: 2,
      sourceLabels: ["Week 3 Lecture.pdf", "Tutorial Notes.md"],
      sourceDescriptors: [
        baseEvidence().sourceDescriptors[0],
        {
          title: "Tutorial Notes.md",
          kindLabel: "Uploaded study source",
          academicKind: "tutorial_notes",
          academicSummary: "Tutorial comparisons for week 3.",
          courseTag: "ECON101",
          weekTag: "Week 3",
          lectureTag: "Tutorial 3",
          zettelkastenStage: null,
          knowledgeGraphGroupKey: "week:3",
          knowledgeGraphLinkTags: ["course:econ101", "week:3", "topic:market_failures"],
        },
      ],
    }),
    continuationSeed: null,
  });

  assert.equal(state?.grade, "connected_pack_ready");
  assert.equal(state?.primaryActionId, "graph");
  assert.match(state?.cards[0]?.detail ?? "", /graph anchor week:3/i);
  assert.match(state?.cards[0]?.detail ?? "", /topic:market_failures/i);
  assert.match(state?.cards[1]?.detail ?? "", /supertags/i);
});

test("buildStudyResultValuePathState prefers zettelkasten continuation when note stages exist", () => {
  const state = buildStudyResultValuePathState({
    evidence: baseEvidence({
      knowledgeMode: "zettelkasten",
      knowledgeLabel: "Zettelkasten",
      policyLabel: "Zettelkasten + keep extracted content",
      sourceDescriptors: [{
        ...baseEvidence().sourceDescriptors[0],
        zettelkastenStage: "source_note_review_pending",
        zettelkastenNextAction: "Promote the market failure contrast into one permanent note.",
        knowledgeGraphGroupKey: "topic:market_failures",
        knowledgeGraphLinkTags: ["topic:market_failures", "course:econ101"],
      }],
    }),
    continuationSeed: {
      query: "Continue this source note",
      notice: "Loaded",
      helper: "Helper",
      label: "Continue this branch",
      description: "Desc",
      valuePromise: "Promote stronger notes from the same branch.",
      recommendedUpload: "One adjacent reading",
      knowledgeMode: "zettelkasten",
      retentionMode: "keep_extracted_only",
      checklist: [],
      nextSteps: [],
      focusBadges: ["market failures branch"],
    },
  });

  assert.equal(state?.grade, "zettelkasten_ready");
  assert.equal(state?.primaryActionId, "graph");
  assert.match(state?.cards[0]?.detail ?? "", /graph anchor topic:market_failures/i);
  assert.match(state?.cards[2]?.detail ?? "", /Next note move/i);
  assert.match(state?.cards[2]?.detail ?? "", /permanent note/i);
});

test("buildStudyResultValuePathState gives single-source connected-notes next step", () => {
  const state = buildStudyResultValuePathState({
    evidence: baseEvidence(),
    continuationSeed: null,
  });

  assert.equal(state?.grade, "single_source_ready");
  assert.equal(state?.primaryActionId, "files");
  assert.equal(state?.secondaryActionId, "search");
});

test("buildStudyResultValuePathState preserves report follow-through guidance", () => {
  const state = buildStudyResultValuePathState({
    evidence: baseEvidence(),
    continuationSeed: buildReportQuickStartSeed({
      kind: "exam_preparation",
      goal: "Prepare for my economics exam.",
      messages: [],
    }),
  });

  assert.equal(state?.grade, "single_source_ready");
  assert.match(state?.detail ?? "", /exam preparation report/i);
  assert.match(state?.detail ?? "", /lecture or tutorial notes/i);
});

test("buildStudyResultValuePathState preserves report follow-through for connected packs", () => {
  const state = buildStudyResultValuePathState({
    evidence: baseEvidence({
      sourceCount: 2,
      sourceLabels: ["Assignment Brief.pdf", "Rubric.pdf"],
      sourceDescriptors: [
        {
          ...baseEvidence().sourceDescriptors[0],
          title: "Assignment Brief.pdf",
          academicKind: "assignment_brief",
          knowledgeGraphGroupKey: "topic:essay",
          knowledgeGraphLinkTags: ["course:eng101", "topic:essay"],
        },
        {
          title: "Rubric.pdf",
          kindLabel: "Uploaded study source",
          academicKind: "rubric",
          academicSummary: "Marking criteria.",
          courseTag: "ENG101",
          weekTag: null,
          lectureTag: null,
          zettelkastenStage: null,
          knowledgeGraphGroupKey: "topic:essay",
          knowledgeGraphLinkTags: ["course:eng101", "topic:essay"],
        },
      ],
    }),
    continuationSeed: buildReportQuickStartSeed({
      kind: "assignment_plan",
      goal: "Plan my essay assignment.",
      messages: [],
    }),
  });

  assert.equal(state?.grade, "connected_pack_ready");
  assert.match(state?.detail ?? "", /assignment plan report/i);
  assert.match(state?.detail ?? "", /assignment brief or rubric/i);
});

test("buildStudyResultValuePathState avoids raw report badges in best next move", () => {
  const state = buildStudyResultValuePathState({
    evidence: baseEvidence({
      knowledgeMode: "zettelkasten",
      knowledgeLabel: "Zettelkasten",
      policyLabel: "Zettelkasten + keep extracted content",
      sourceDescriptors: [{
        ...baseEvidence().sourceDescriptors[0],
        zettelkastenStage: "source_note",
        zettelkastenNextAction: null,
      }],
    }),
    continuationSeed: {
      query: "Continue saved report",
      notice: "Loaded",
      helper: "Helper",
      label: "Saved flashcards",
      description: "Desc",
      valuePromise: "Continue the saved report.",
      recommendedUpload: "One adjacent source",
      knowledgeMode: "zettelkasten",
      retentionMode: "keep_extracted_only",
      checklist: [],
      nextSteps: [],
      focusBadges: [
        "report_kind:flashcard_deck",
        "course_tag:course:bio101",
        "source_need:lecture notes",
      ],
    },
  });

  assert.match(state?.cards[2]?.detail ?? "", /course:bio101/i);
  assert.doesNotMatch(state?.cards[2]?.detail ?? "", /report_kind:/i);
  assert.doesNotMatch(state?.cards[2]?.detail ?? "", /source_need:/i);
});
