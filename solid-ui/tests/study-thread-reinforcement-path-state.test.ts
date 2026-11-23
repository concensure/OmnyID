import assert from "node:assert/strict";
import test from "node:test";

import type { AttachmentGroundingEvidence } from "../src/lib/attachmentGroundingEvidence.ts";
import { studentQuickStartForIntent } from "../src/lib/onboardingQuickStart.ts";
import { buildStudyThreadReinforcementPathState } from "../src/lib/studyThreadReinforcementPathState.ts";

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

test("buildStudyThreadReinforcementPathState suggests a complementary source for single lecture runs", () => {
  const state = buildStudyThreadReinforcementPathState({
    evidence: evidence(),
    continuationSeed: studentQuickStartForIntent("first_upload"),
  });

  assert.equal(state?.badge, "Reinforcement recipe");
  assert.match(state?.cards[1]?.detail ?? "", /reading|tutorial|rough note/i);
  assert.match(state?.detail ?? "", /course:bio101/i);
});

test("buildStudyThreadReinforcementPathState blocks broadening when retention is missing", () => {
  const state = buildStudyThreadReinforcementPathState({
    evidence: evidence({ retentionMode: "keep_nothing" }),
    continuationSeed: studentQuickStartForIntent("first_upload"),
  });

  assert.equal(state?.badge, "Fix retention first");
  assert.equal(state?.primaryActionLabel, "Rerun with retention");
  assert.match(state?.cards[1]?.detail ?? "", /Reuse the same files first/i);
});
