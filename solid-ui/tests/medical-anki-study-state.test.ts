import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMedicalAnkiReadinessState,
  buildMedicalStudentEligibilityState,
  buildMedicalTopologyCoverageState,
  buildMedicalTopologySearchState,
  medicalAnkiContractPromptLines,
  medicalAnkiFocusPromptLines,
} from "../src/lib/medicalAnkiStudyState.ts";
import type { StudyAttempt } from "../src/lib/studyAttemptLocalState.ts";
import type { StudyDeadline } from "../src/lib/studyDeadlineLocalState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";
import type { StudySession } from "../src/lib/studySessionLocalState.ts";

function artifact(overrides: Partial<StudyReportArtifact> = {}): StudyReportArtifact {
  return {
    id: "artifact",
    title: "Medical cloze deck",
    filename: "medical-cloze.md",
    markdown: "Cloze rows with vignette stems and wrong answer rationales.",
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "flashcard_deck",
    reportLabel: null,
    outputFormat: "csv_flashcards",
    sourceLabels: ["Cardio lecture"],
    policyLabel: null,
    courseTag: "course:med101",
    academicKind: "medical_cloze_vignette",
    structuredItemCount: 24,
    sectionCount: 1,
    createdAt: 1,
    ...overrides,
  };
}

function attempt(overrides: Partial<StudyAttempt> = {}): StudyAttempt {
  return {
    id: "attempt",
    mode: "flashcards",
    title: "Cardio recall",
    artifactId: "artifact",
    courseTag: "course:med101",
    totalItems: 12,
    correctItems: 8,
    durationSeconds: 600,
    source: "manual",
    createdAt: 2,
    ...overrides,
  };
}

function deadline(overrides: Partial<StudyDeadline> = {}): StudyDeadline {
  return {
    id: "deadline",
    title: "Cardio block exam",
    kind: "exam",
    courseTag: "course:med101",
    dueLabel: "next Friday",
    dueAt: null,
    source: "manual",
    createdAt: 3,
    ...overrides,
  };
}

function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: "session",
    title: "20-minute cardio review",
    status: "planned",
    duration: "20_min",
    courseTag: "course:med101",
    sourceCount: 1,
    deadlineCount: 1,
    attemptCount: 1,
    nextAction: "Review weak murmurs",
    source: "study_lens",
    createdAt: 4,
    ...overrides,
  };
}

test("medicalAnkiContractPromptLines only applies to medical cloze/vignette deck outputs", () => {
  assert.deepEqual(medicalAnkiContractPromptLines({
    academicKind: null,
    reportKind: "flashcard_deck",
  }), []);

  const lines = medicalAnkiContractPromptLines({
    academicKind: "medical_cloze_vignette",
    reportKind: "flashcard_deck",
  });

  assert.ok(lines.some((line) => /cloze and short clinical-vignette/i.test(line)));
  assert.ok(lines.some((line) => /chapter_tag/i.test(line)));
  assert.ok(lines.some((line) => /reasoning_order/i.test(line)));
  assert.ok(lines.some((line) => /do not reproduce proprietary UWorld, AMBOSS/i.test(line)));
});

test("medicalAnkiFocusPromptLines treats repaired concept edges as attempt capture before regeneration", () => {
  const lines = medicalAnkiFocusPromptLines({
    academicKind: "medical_cloze_vignette",
    reportKind: "practice_questions",
    searchQuery: "medical concept-edge attempt evidence: pathophys -> presentation",
    activeTag: "medical_edge:medical-deck:0:pathophys_to_presentation:pathophys",
    knowledgeGraphLinkTags: [
      "medical_concept_edge_review",
      "repair_status:pending_attempt",
      "score_band:weak",
    ],
    zettelkastenNextAction: "Use the saved repair output for this concept edge and record a real attempt before generating more variants.",
  });
  const prompt = lines.join("\n");

  assert.match(prompt, /Medical concept-edge attempt capture/i);
  assert.match(prompt, /repair output already exists/i);
  assert.match(prompt, /do not generate additional variants by default/i);
  assert.match(prompt, /medical_edge_attempt \| relationship_id:/i);
  assert.match(prompt, /never infer correctness from a repair artifact/i);
});

test("medicalAnkiFocusPromptLines converts shallow first-order cards into application prompts", () => {
  const lines = medicalAnkiFocusPromptLines({
    academicKind: "medical_cloze_vignette",
    reportKind: "practice_questions",
    searchQuery: "medical shallow first-order card upgrade",
    knowledgeGraphLinkTags: [
      "medical_cloze_vignette",
      "quality_action:upgrade_first_order",
      "chapter:heart-failure",
    ],
    zettelkastenNextAction: "Upgrade shallow first-order medical cards into source-grounded application prompts.",
  });
  const prompt = lines.join("\n");

  assert.match(prompt, /Medical shallow-card upgrade queue/i);
  assert.match(prompt, /without expanding deck volume unnecessarily/i);
  assert.match(prompt, /replacing shallow first-order wording with second- or third-order clinical reasoning prompts/i);
  assert.match(prompt, /chapter:heart-failure/i);
});

test("medicalAnkiFocusPromptLines handles graph-gap cloze deck and vignette block intents", () => {
  const gapDeck = medicalAnkiFocusPromptLines({
    academicKind: "medical_cloze_vignette",
    reportKind: "flashcard_deck",
    searchQuery: "medical cloze vignette deck from graph gaps",
    courseTag: "course:med101",
    unitTag: "unit:cardiology",
    chapterTag: "chapter:heart-failure",
    knowledgeGraphLinkTags: ["medical_cloze_vignette", "medical_gap_cloze_deck"],
  }).join("\n");

  assert.match(gapDeck, /Medical graph-gap cloze deck queue/i);
  assert.match(gapDeck, /Anki-compatible cloze rows/i);
  assert.match(gapDeck, /avoid duplicating already-covered cards/i);
  assert.match(gapDeck, /source locators, chapter\/unit tags, and concept supertags/i);

  const vignetteBlock = medicalAnkiFocusPromptLines({
    academicKind: "medical_cloze_vignette",
    reportKind: "practice_questions",
    searchQuery: "medical vignette block from concept graph",
    courseTag: "course:med101",
    unitTag: "unit:cardiology",
    chapterTag: "chapter:heart-failure",
    knowledgeGraphLinkTags: ["medical_cloze_vignette", "medical_vignette_block"],
  }).join("\n");

  assert.match(vignetteBlock, /Medical vignette block queue/i);
  assert.match(vignetteBlock, /practices reasoning rather than memorized static card wording/i);
  assert.match(vignetteBlock, /vary patient age, presentation, distractor framing, and management step/i);
});

test("medicalAnkiFocusPromptLines handles topology coverage source-only and overload intents", () => {
  const sourceOnly = medicalAnkiFocusPromptLines({
    academicKind: "medical_cloze_vignette",
    reportKind: "flashcard_deck",
    searchQuery: "medical topology coverage course:med101 system:cardiovascular Source only Make cited cloze/vignette cards",
    courseTag: "course:med101",
    unitTag: "unit:cardiology",
    chapterTag: "chapter:heart-failure",
    knowledgeGraphLinkTags: [
      "medical_cloze_vignette",
      "medical_topology_coverage",
      "readiness:Source only",
      "system:cardiovascular",
      "pharm",
      "management",
    ],
    zettelkastenNextAction: "Use medical topology coverage for course:med101 - system:cardiovascular: Source only. Next action: Make cited cloze/vignette cards.",
  }).join("\n");

  assert.match(sourceOnly, /Medical topology coverage queue/i);
  assert.match(sourceOnly, /source exists but card inventory is missing/i);
  assert.match(sourceOnly, /generate cited cloze\/vignette rows for this exact scope/i);
  assert.match(sourceOnly, /system:cardiovascular/i);

  const overload = medicalAnkiFocusPromptLines({
    academicKind: "medical_cloze_vignette",
    reportKind: "practice_questions",
    searchQuery: "medical topology coverage course:med101 Review overload Reduce shallow or duplicate card load",
    knowledgeGraphLinkTags: [
      "medical_cloze_vignette",
      "medical_topology_coverage",
      "readiness:Review overload",
      "pathophys",
    ],
  }).join("\n");

  assert.match(overload, /Medical topology coverage queue/i);
  assert.match(overload, /reduce review load/i);
  assert.match(overload, /do not expand card count unless/i);
});

test("medicalAnkiFocusPromptLines handles stable topology markers without readable readiness labels", () => {
  const sourceOnly = medicalAnkiFocusPromptLines({
    academicKind: "medical_cloze_vignette",
    reportKind: "flashcard_deck",
    searchQuery: "medical topology coverage system:cardiovascular",
    knowledgeGraphLinkTags: [
      "medical_cloze_vignette",
      "medical_topology_coverage",
      "topology_gap:source_only",
      "pharm",
    ],
  }).join("\n");

  assert.match(sourceOnly, /Medical topology coverage queue/i);
  assert.match(sourceOnly, /source exists but card inventory is missing/i);

  const practiceReady = medicalAnkiFocusPromptLines({
    academicKind: "medical_cloze_vignette",
    reportKind: "practice_questions",
    searchQuery: "medical topology coverage system:cardiovascular",
    knowledgeGraphLinkTags: [
      "medical_cloze_vignette",
      "medical_topology_coverage",
      "topology_practice_ready",
      "medical_vignette_block",
    ],
  }).join("\n");

  assert.match(practiceReady, /use existing attempt evidence/i);
});

test("buildMedicalTopologySearchState exposes stable source-only and overload labels", () => {
  const sourceOnly = buildMedicalTopologySearchState({
    id: "source-only",
    title: "Cardiology topology coverage",
    filename: "cardiology.md",
    markdown: "Medical topology coverage readiness:Source only. system_tag: system:cardiovascular concept_tags: pharm; management",
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "flashcard_deck",
    reportLabel: null,
    outputFormat: null,
    sourceLabels: ["Cardio lecture"],
    policyLabel: null,
    courseTag: "course:med101",
    academicKind: "medical_cloze_vignette",
    sectionCount: 1,
    createdAt: 1,
  });
  const overload = buildMedicalTopologySearchState({
    id: "overload",
    title: "Cardiology topology coverage",
    filename: "cardiology.md",
    markdown: "Medical topology coverage topology_gap:overload. system_tag: system:cardiovascular concept_tags: pharm; management",
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "flashcard_deck",
    reportLabel: null,
    outputFormat: null,
    sourceLabels: ["Cardio lecture"],
    policyLabel: null,
    courseTag: "course:med101",
    academicKind: "medical_cloze_vignette",
    sectionCount: 1,
    createdAt: 1,
  });

  assert.ok(sourceOnly.labels.includes("Source-only topology gap"));
  assert.ok(sourceOnly.searchTerms.includes("topology_gap:source_only"));
  assert.ok(overload.labels.includes("Review overload topology gap"));
  assert.ok(overload.searchTerms.includes("topology_gap:overload"));
});

test("buildMedicalAnkiReadinessState treats medical decks as inventory until attempts exist", () => {
  const state = buildMedicalAnkiReadinessState({
    artifacts: [artifact()],
    attempts: [],
    deadlines: [],
    sessions: [],
    courseTag: "course:med101",
  });

  assert.equal(state.readinessLabel, "Inventory ready");
  assert.equal(state.clozeDeckCount, 1);
  assert.equal(state.vignettePromptCount, 1);
  assert.ok(state.evidenceLabels.some((label) => /structured recall row/i.test(label)));
  assert.ok(state.gapLabels.includes("Needs attempt evidence before mastery claims"));
  assert.ok(state.gapLabels.includes("Needs exam/deadline context for urgency"));
});

test("buildMedicalAnkiReadinessState promotes readiness from repeated attempt evidence", () => {
  const state = buildMedicalAnkiReadinessState({
    artifacts: [artifact({ structuredItemCount: 130 })],
    attempts: [
      attempt({ id: "attempt-1", totalItems: 12, correctItems: 8 }),
      attempt({ id: "attempt-2", totalItems: 10, correctItems: 9 }),
    ],
    deadlines: [deadline()],
    sessions: [session()],
    courseTag: "course:med101",
  });

  assert.equal(state.readinessLabel, "Ready for timed block");
  assert.equal(state.attemptCount, 2);
  assert.equal(state.deadlineCount, 1);
  assert.equal(state.scheduledSessionCount, 1);
  assert.match(state.reviewLoadLabel, /overload risk/i);
  assert.equal(state.nextActionLabel, "Run timed vignette block");
});

test("buildMedicalAnkiReadinessState flags shallow first-order card bloat", () => {
  const shallowRows = Array.from({ length: 12 }, (_, index) =>
    `- cloze_text: Definition ${index} | answer: fact | quality_flag: shallow | reasoning_order: first_order`
  ).join("\n");
  const state = buildMedicalAnkiReadinessState({
    artifacts: [artifact({
      structuredItemCount: 30,
      markdown: shallowRows,
    })],
    attempts: [],
    deadlines: [],
    sessions: [],
    courseTag: "course:med101",
  });

  assert.equal(state.shallowRecallCount, 24);
  assert.match(state.reviewLoadInterventionLabel, /upgrade shallow first-order cards into vignette\/application prompts/i);
});

test("buildMedicalTopologyCoverageState creates scoped conservative medical coverage nodes", () => {
  const state = buildMedicalTopologyCoverageState({
    artifacts: [
      artifact({
        id: "hf-deck",
        unitTag: "unit:cardiology",
        chapterTag: "chapter:heart-failure",
        structuredItemCount: 30,
        markdown: [
          "- cloze_text: ACE inhibitors reduce afterload | source_label: Cardio lecture | source_locator: slide 21 | course_tag: course:med101 | system_tag: system:cardiovascular | unit_tag: unit:cardiology | chapter_tag: chapter:heart-failure | concept_tags: pharm; management | reasoning_order: second_order",
          "- vignette_stem: A patient with HFrEF starts therapy. What contraindication matters? | answer: pregnancy | source_locator: slide 24 | concept_tags: pharm; contraindication | reasoning_order: third_order",
        ].join("\n"),
      }),
    ],
    attempts: [attempt({ artifactId: "hf-deck", totalItems: 12, correctItems: 9 })],
    deadlines: [deadline()],
    sessions: [session({ duration: "45_min" })],
    courseTag: "course:med101",
  });

  assert.equal(state.summaryLabel, "1 medical topology coverage node tracked");
  assert.equal(state.nodes.length, 1);
  assert.equal(state.nodes[0]?.scopeLabel, "course:med101 - system:cardiovascular - unit:cardiology - chapter:heart-failure");
  assert.equal(state.nodes[0]?.readinessLabel, "Attempt evidence");
  assert.equal(state.nodes[0]?.cardCount, 30);
  assert.equal(state.nodes[0]?.attemptCount, 1);
  assert.equal(state.nodes[0]?.deadlineCount, 1);
  assert.equal(state.nodes[0]?.scheduledStudyMinutes, 45);
  assert.equal(state.nodes[0]?.sourceLocatorCount, 2);
  assert.ok(state.nodes[0]?.conceptTags.includes("management"));
  assert.equal(state.nodes[0]?.nextAction, "Generate weak-edge variations");
});

test("buildMedicalTopologyCoverageState flags source-only gaps and review overload", () => {
  const sourceOnly = buildMedicalTopologyCoverageState({
    artifacts: [
      artifact({
        id: "source-summary",
        reportKind: "lecture_summary",
        structuredItemCount: 0,
        sourceLabels: ["Renal lecture"],
        markdown: "Renal lecture summary with pathophys and management. system_tag: system:renal",
      }),
    ],
    attempts: [],
    deadlines: [],
    sessions: [],
    courseTag: "course:med101",
  });

  assert.equal(sourceOnly.nodes[0]?.readinessLabel, "Source only");
  assert.match(sourceOnly.topGapLabel ?? "", /Make cited cloze\/vignette cards/i);

  const overload = buildMedicalTopologyCoverageState({
    artifacts: [
      artifact({
        id: "bloated-deck",
        structuredItemCount: 130,
        markdown: Array.from({ length: 22 }, (_, index) =>
          `- cloze_text: Define term ${index} | source_locator: slide ${index} | quality_flag: shallow | reasoning_order: first_order | system_tag: system:cardiovascular`
        ).join("\n"),
      }),
    ],
    attempts: [],
    deadlines: [],
    sessions: [],
    courseTag: "course:med101",
  });

  assert.equal(overload.nodes[0]?.readinessLabel, "Review overload");
  assert.equal(overload.nodes[0]?.nextAction, "Reduce shallow or duplicate card load");
});

test("buildMedicalStudentEligibilityState accepts explicit account profile and master-agent evidence", () => {
  assert.equal(buildMedicalStudentEligibilityState({
    accountMedicalStudentVerified: true,
  }).source, "account_verification");

  assert.equal(buildMedicalStudentEligibilityState({
    profileText: "I am an MD student preparing for Step 1.",
  }).source, "profile");

  assert.equal(buildMedicalStudentEligibilityState({
    masterAgentMedicalStudentDeclared: true,
  }).source, "master_agent");
});

test("buildMedicalStudentEligibilityState infers only from repeated non-personal medical study uploads", () => {
  const inferred = buildMedicalStudentEligibilityState({
    artifacts: [
      artifact({ id: "cardio", title: "Cardiology lecture notes", markdown: "Heart failure pathophysiology chapter notes." }),
      artifact({ id: "pharm", title: "Pharmacology flashcards", markdown: "Beta blocker mechanism of action cloze deck." }),
      artifact({ id: "osce", title: "OSCE practice", markdown: "Clinical presentation and management practice questions." }),
    ],
  });

  assert.equal(inferred.eligible, true);
  assert.equal(inferred.source, "repeated_medical_study_uploads");
  assert.equal(inferred.medicalStudyArtifactCount, 3);

  const personal = buildMedicalStudentEligibilityState({
    artifacts: [
      artifact({
        id: "blood",
        title: "My blood test results",
        filename: "blood-results.md",
        markdown: "My symptoms and GP appointment notes.",
        sourceLabels: ["Patient portal"],
        academicKind: null,
        courseTag: null,
      }),
      artifact({
        id: "scan",
        title: "MRI scan result",
        filename: "mri-result.md",
        markdown: "My specialist referral and medical history.",
        sourceLabels: ["Appointment"],
        academicKind: null,
        courseTag: null,
      }),
      artifact({
        id: "rx",
        title: "Prescription",
        filename: "prescription.md",
        markdown: "My prescription and diagnosis.",
        sourceLabels: ["Doctor"],
        academicKind: null,
        courseTag: null,
      }),
    ],
  });

  assert.equal(personal.eligible, false);
  assert.equal(personal.medicalStudyArtifactCount, 0);
});
