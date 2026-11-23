import assert from "node:assert/strict";
import test from "node:test";

import type { AttachmentGroundingEvidence } from "../src/lib/attachmentGroundingEvidence.ts";
import { studentQuickStartForIntent } from "../src/lib/onboardingQuickStart.ts";
import { buildStudyNextSessionCarryoverState } from "../src/lib/studyNextSessionCarryoverState.ts";

function evidence(overrides: Partial<AttachmentGroundingEvidence> = {}): AttachmentGroundingEvidence {
  return {
    sourceCount: 2,
    selectedFileCount: 2,
    skippedFileCount: 0,
    unreadableFileCount: 0,
    sourceLabels: ["Week 3 Lecture.pdf", "Week 3 Reading.pdf"],
    footerLabel: "Based on 2 uploaded sources",
    coverageStatus: "complete",
    coverageLabel: "Coverage complete for 2 uploaded files",
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
    ],
    ...overrides,
  };
}

test("buildStudyNextSessionCarryoverState describes reusable next-session carryover", () => {
  const state = buildStudyNextSessionCarryoverState({
    evidence: evidence(),
    continuationSeed: studentQuickStartForIntent("compare_sources"),
  });

  assert.equal(state?.badge, "Next session ready");
  assert.match(state?.headline ?? "", /next study session can start from this result/i);
  assert.match(state?.cards[0]?.detail ?? "", /reuse extracted content/i);
  assert.equal(state?.primaryActionLabel, "Load next study run");
});

test("buildStudyNextSessionCarryoverState warns when retention is missing", () => {
  const state = buildStudyNextSessionCarryoverState({
    evidence: evidence({ retentionMode: "keep_nothing" }),
    continuationSeed: studentQuickStartForIntent("first_upload"),
  });

  assert.equal(state?.badge, "Session-only result");
  assert.match(state?.detail ?? "", /retention is the missing piece/i);
  assert.equal(state?.primaryActionLabel, "Rerun with retention");
});

test("buildStudyNextSessionCarryoverState shows normalized report carryover badges", () => {
  const state = buildStudyNextSessionCarryoverState({
    evidence: evidence(),
    continuationSeed: {
      label: "Saved flashcards",
      description: "Continue saved deck.",
      query: "Continue the deck.",
      notice: "Loaded.",
      helper: "Run.",
      valuePromise: "Better recall.",
      recommendedUpload: "Optional lecture.",
      knowledgeMode: "connected_notes",
      retentionMode: "keep_extracted_only",
      originLabel: "From saved report",
      focusBadges: [
        "report_kind:flashcard_deck",
        "course_tag:course:bio101",
        "unit_tag:unit:respiration",
        "chapter_tag:chapter:4",
        "module:Module 2",
        "session:guided-1",
        "route_source:study_lens",
        "source:Week 3 slides.pdf",
      ],
      checklist: [],
      nextSteps: [],
    },
  });

  assert.deepEqual(state?.focusBadges, [
    "flashcard deck report",
    "course:bio101",
    "unit:respiration",
    "chapter:4",
    "Module 2",
    "guided session guided-1",
  ]);
});

test("buildStudyNextSessionCarryoverState filters internal ordinary focus badges", () => {
  const state = buildStudyNextSessionCarryoverState({
    evidence: evidence(),
    continuationSeed: {
      label: "Graph focus",
      description: "Continue linked ideas.",
      query: "Continue.",
      notice: "Loaded.",
      helper: "Run.",
      valuePromise: "Follow the linked ideas.",
      recommendedUpload: "One adjacent source.",
      knowledgeMode: "connected_notes",
      retentionMode: "keep_extracted_only",
      originLabel: "From Knowledge Graph",
      focusBadges: [
        "COURSE:bio101",
        "chapter_tag:chapter:4",
        "unit_tag:unit:respiration",
        "module:Module 2",
        "topic:respiration",
        "readiness:grounded_ready",
        "source_need:lecture notes",
        "lens linked ideas",
      ],
      checklist: [],
      nextSteps: [],
    },
  });

  assert.deepEqual(state?.focusBadges, [
    "course:bio101",
    "unit:respiration",
    "chapter:4",
    "Module 2",
    "topic:respiration",
    "lens linked ideas",
  ]);
});

test("buildStudyNextSessionCarryoverState surfaces medical topology locator carryover", () => {
  const state = buildStudyNextSessionCarryoverState({
    evidence: evidence(),
    continuationSeed: {
      label: "Saved medical topology deck",
      description: "Continue saved deck.",
      query: "Continue topology deck.",
      notice: "Loaded.",
      helper: "Run.",
      valuePromise: "Continue topology-guided recall.",
      recommendedUpload: "Optional cardiology source.",
      knowledgeMode: "connected_notes",
      retentionMode: "keep_extracted_only",
      originLabel: "From saved report",
      focusBadges: [
        "report_kind:flashcard_deck",
        "academic_kind:medical_cloze_vignette",
        "course_tag:course:med101",
        "chapter_tag:chapter:heart-failure",
        "medical_topology_coverage",
        "topology_gap:needs_locator",
      ],
      checklist: [],
      nextSteps: [],
    },
  });

  assert.ok(state?.focusBadges.includes("medical topology coverage"));
  assert.ok(state?.focusBadges.includes("needs source locator"));
  const medical = state?.cards.find((card) => card.label === "Medical topology carryover");
  assert.equal(medical?.tone, "amber");
  assert.match(medical?.detail ?? "", /fix source-locator gaps/i);
  assert.match(medical?.detail ?? "", /source-grounded/i);
});

test("buildStudyNextSessionCarryoverState surfaces medical topology overload carryover", () => {
  const state = buildStudyNextSessionCarryoverState({
    evidence: evidence(),
    continuationSeed: {
      label: "Saved medical topology deck",
      description: "Continue saved deck.",
      query: "Continue topology deck.",
      notice: "Loaded.",
      helper: "Run.",
      valuePromise: "Continue topology-guided recall.",
      recommendedUpload: "Optional cardiology source.",
      knowledgeMode: "connected_notes",
      retentionMode: "keep_extracted_only",
      originLabel: "From saved report",
      focusBadges: [
        "report_kind:flashcard_deck",
        "academic_kind:medical_cloze_vignette",
        "medical_topology_coverage",
        "topology_gap:overload",
      ],
      checklist: [],
      nextSteps: [],
    },
  });

  assert.ok(state?.focusBadges.includes("medical topology coverage"));
  assert.ok(state?.focusBadges.includes("review overload"));
  const medical = state?.cards.find((card) => card.label === "Medical topology carryover");
  assert.equal(medical?.tone, "amber");
  assert.match(medical?.detail ?? "", /reduce review load/i);
  assert.match(medical?.detail ?? "", /instead of expanding card count/i);
});
