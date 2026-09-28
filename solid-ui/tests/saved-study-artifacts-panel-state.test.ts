import assert from "node:assert/strict";
import test from "node:test";

import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";
import type { MedicalFactVerificationRecord } from "../src/lib/medicalFactVerificationState.ts";
import {
  buildSavedStudyArtifactsPanelState,
} from "../src/lib/savedStudyArtifactsPanelState.ts";

function artifact(input: Partial<StudyReportArtifact> & Pick<StudyReportArtifact, "id" | "title" | "createdAt">): StudyReportArtifact {
  return {
    filename: `${input.id}.md`,
    markdown: `# ${input.title}\n\n- Question 1: Sample? Answer: Sample. source: Chapter 4.pdf`,
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "quiz_generator",
    reportLabel: "quiz generator report",
    outputFormat: "copyable_outline",
    sourceLabels: ["Chapter 4.pdf"],
    policyLabel: "Keep extracted notes only",
    courseTag: "course:law101",
    chapterTag: "chapter:4",
    unitTag: "unit:contracts",
    moduleLabel: "Module 2",
    dueLabel: "2026-10-03T22:00:00.000Z",
    deadlineId: "deadline-42",
    providerId: "gcal",
    academicKind: "study_course",
    sessionId: null,
    routeSource: "study_lens",
    answersIncluded: true,
    structuredItemCount: 1,
    sectionCount: 1,
    ...input,
  };
}

function factVerification(overrides: Partial<MedicalFactVerificationRecord> = {}): MedicalFactVerificationRecord {
  return {
    id: "medical_fact:metformin",
    targetKind: "passage",
    targetText: "Metformin can rarely cause lactic acidosis in renal impairment.",
    targetHash: "metformin",
    status: "partially_verified",
    confidenceScore: 68,
    confidenceLabel: "medium",
    summary: "Supported by endocrine lecture and trusted review.",
    sourceEvidence: [
      {
        label: "Endocrine pharmacology lecture",
        tier: "student_source",
        locator: "slide 44",
        year: 2026,
        supportsClaim: true,
      },
      {
        label: "Trusted pharmacology review",
        tier: "peer_reviewed_review",
        locator: "adverse effects",
        year: 2024,
        supportsClaim: true,
      },
    ],
    flags: ["probabilistic risk retained"],
    scopeLabels: ["course:med101", "unit:endocrine", "chapter:diabetes"],
    verificationDepth: "standard",
    verifiedAt: 1_000,
    manualReviewer: null,
    ...overrides,
  };
}

test("buildSavedStudyArtifactsPanelState summarizes unfiltered saved outputs", () => {
  const state = buildSavedStudyArtifactsPanelState({
    artifacts: [
      artifact({ id: "one", title: "One", createdAt: 3 }),
      artifact({ id: "two", title: "Two", createdAt: 2 }),
      artifact({ id: "three", title: "Three", createdAt: 1 }),
    ],
    previewLimit: 2,
  });

  assert.equal(state.summaryLabel, "3 saved");
  assert.equal(state.totalCount, 3);
  assert.equal(state.resultCount, 2);
  assert.equal(state.hiddenCount, 1);
  assert.equal(state.hasQuery, false);
  assert.equal(state.hasNoMatches, false);
  assert.deepEqual(state.results.map((result) => result.id), ["one", "two"]);
  assert.ok(state.filterChips.some((chip) => chip.query === "chapter:4"));
  assert.ok(state.filterChips.some((chip) => chip.query === "deadline-42"));
  assert.ok(state.filterChips.some((chip) => chip.query === "gcal"));
});

test("buildSavedStudyArtifactsPanelState reports filtered matches using the full result count", () => {
  const state = buildSavedStudyArtifactsPanelState({
    artifacts: [
      artifact({ id: "law", title: "LAW101 Chapter 4 quiz", createdAt: 2 }),
      artifact({
        id: "bio",
        title: "BIO100 Week 2 summary",
        createdAt: 1,
        markdown: "# Lecture summary report\n\nCellular respiration.",
        reportKind: "lecture_summary",
        reportLabel: "lecture summary report",
        sourceLabels: ["Week 2.pdf"],
        courseTag: "course:bio100",
        chapterTag: "chapter:2",
        unitTag: "unit:respiration",
        moduleLabel: null,
        dueLabel: null,
        deadlineId: null,
        providerId: null,
        answersIncluded: null,
        structuredItemCount: 0,
      }),
    ],
    query: "chapter:4 csv",
  });

  assert.equal(state.summaryLabel, "1/2 matched");
  assert.equal(state.resultCount, 1);
  assert.equal(state.results[0]?.id, "law");
  assert.equal(state.results[0]?.actions.includes("download_csv"), true);
});

test("buildSavedStudyArtifactsPanelState exposes no-match copy", () => {
  const state = buildSavedStudyArtifactsPanelState({
    artifacts: [artifact({ id: "law", title: "LAW101 Chapter 4 quiz", createdAt: 1 })],
    query: "psychology",
  });

  assert.equal(state.hasQuery, true);
  assert.equal(state.hasNoMatches, true);
  assert.equal(state.summaryLabel, "0/1 matched");
  assert.equal(state.resultCount, 0);
  assert.match(state.emptyDetail ?? "", /export target/i);
});

test("buildSavedStudyArtifactsPanelState expands up to the configured full limit", () => {
  const artifacts = Array.from({ length: 6 }, (_, index) =>
    artifact({ id: `artifact-${index}`, title: `Artifact ${index}`, createdAt: 10 - index }),
  );

  const preview = buildSavedStudyArtifactsPanelState({ artifacts, previewLimit: 3, fullLimit: 6 });
  const expanded = buildSavedStudyArtifactsPanelState({ artifacts, showAll: true, previewLimit: 3, fullLimit: 6 });

  assert.equal(preview.resultCount, 3);
  assert.equal(preview.hiddenCount, 3);
  assert.equal(expanded.resultCount, 6);
  assert.equal(expanded.hiddenCount, 0);
});

test("buildSavedStudyArtifactsPanelState surfaces medical fact verification matches separately", () => {
  const state = buildSavedStudyArtifactsPanelState({
    artifacts: [artifact({ id: "law", title: "LAW101 Chapter 4 quiz", createdAt: 1 })],
    medicalFactVerifications: [factVerification()],
    query: "metformin peer_reviewed_review",
  });

  assert.equal(state.summaryLabel, "1/2 matched");
  assert.equal(state.resultCount, 0);
  assert.equal(state.medicalFactVerificationTotalCount, 1);
  assert.equal(state.medicalFactVerificationResultCount, 1);
  assert.equal(state.hasNoMatches, false);
  assert.equal(state.medicalFactVerificationResults[0]?.title, "Metformin can rarely cause lactic acidosis in renal impairment.");
  assert.ok(state.medicalFactVerificationResults[0]?.badges.includes("medical fact verification"));
  assert.ok(state.medicalFactVerificationResults[0]?.actions.includes("reuse_in_report"));
  assert.ok(state.medicalFactVerificationResults[0]?.actions.includes("show_sources"));
  assert.equal(state.medicalFactVerificationResults[0]?.fileLibraryIntent.courseTag, "course:med101");
});

test("buildSavedStudyArtifactsPanelState treats verification-only misses as no matches", () => {
  const state = buildSavedStudyArtifactsPanelState({
    artifacts: [],
    medicalFactVerifications: [factVerification()],
    query: "neurology",
  });

  assert.equal(state.totalCount, 0);
  assert.equal(state.medicalFactVerificationTotalCount, 1);
  assert.equal(state.medicalFactVerificationResultCount, 0);
  assert.equal(state.hasNoMatches, true);
});

test("buildSavedStudyArtifactsPanelState shares preview budget with medical fact verifications", () => {
  const state = buildSavedStudyArtifactsPanelState({
    artifacts: [
      artifact({ id: "one", title: "One", createdAt: 3 }),
      artifact({ id: "two", title: "Two", createdAt: 2 }),
    ],
    medicalFactVerifications: [factVerification()],
    previewLimit: 2,
  });

  assert.equal(state.summaryLabel, "3 saved");
  assert.equal(state.resultCount, 2);
  assert.equal(state.medicalFactVerificationResultCount, 0);
  assert.equal(state.hiddenCount, 1);

  const expanded = buildSavedStudyArtifactsPanelState({
    artifacts: [
      artifact({ id: "one", title: "One", createdAt: 3 }),
      artifact({ id: "two", title: "Two", createdAt: 2 }),
    ],
    medicalFactVerifications: [factVerification()],
    previewLimit: 2,
    fullLimit: 3,
    showAll: true,
  });

  assert.equal(expanded.resultCount, 2);
  assert.equal(expanded.medicalFactVerificationResultCount, 1);
  assert.equal(expanded.hiddenCount, 0);
});
