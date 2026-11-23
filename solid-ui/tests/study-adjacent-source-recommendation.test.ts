import assert from "node:assert/strict";
import test from "node:test";

import type { AttachmentGroundingEvidence } from "../src/lib/attachmentGroundingEvidence.ts";
import { buildStudyAdjacentSourceRecommendation } from "../src/lib/studyAdjacentSourceRecommendation.ts";

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

test("buildStudyAdjacentSourceRecommendation suggests a complementary source for lecture-only runs", () => {
  const recommendation = buildStudyAdjacentSourceRecommendation(evidence());

  assert.equal(recommendation?.anchorLabel, "course:bio101 · week:3 · lecture:week_3");
  assert.match(recommendation?.nextSourceLabel ?? "", /reading|tutorial sheet|rough note/i);
  assert.match(recommendation?.recommendedUploadLabel ?? "", /course:bio101/i);
});

test("buildStudyAdjacentSourceRecommendation blocks broadening when retention is off", () => {
  const recommendation = buildStudyAdjacentSourceRecommendation(
    evidence({ retentionMode: "keep_nothing" }),
  );

  assert.match(recommendation?.nextSourceLabel ?? "", /Reuse the same files first/i);
  assert.match(recommendation?.helperLabel ?? "", /Keep extracted notes on/i);
});
