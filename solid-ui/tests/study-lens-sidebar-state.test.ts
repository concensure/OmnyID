import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStudyAcademicDeadlineReviewQueueState,
  buildStudyAcademicIntegrationState,
} from "../src/lib/studyAcademicIntegrationState.ts";
import type { StudyAttempt } from "../src/lib/studyAttemptLocalState.ts";
import type { StudyCourse } from "../src/lib/studyCourseLocalState.ts";
import type { StudyDeadline } from "../src/lib/studyDeadlineLocalState.ts";
import type { MedicalMissedQuestionTopic } from "../src/lib/medicalMissedQuestionLocalState.ts";
import type { MedicalFactVerificationRecord } from "../src/lib/medicalFactVerificationState.ts";
import {
  buildStudyLensSidebarSections,
} from "../src/lib/studyLensSidebarState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";
import type { StudySession } from "../src/lib/studySessionLocalState.ts";

function course(): StudyCourse {
  return {
    id: "course",
    name: "Biology 101",
    courseTag: "course:bio101",
    termLabel: "Term 1",
    institutionLabel: null,
    source: "manual",
    createdAt: 1,
  };
}

function artifact(overrides: Partial<StudyReportArtifact> = {}): StudyReportArtifact {
  return {
    id: "artifact",
    title: "Flashcards",
    filename: "cards.md",
    markdown: "# Flashcards",
    mimeType: "text/markdown;charset=utf-8",
    reportKind: "flashcard_deck",
    reportLabel: null,
    outputFormat: "flashcards",
    sourceLabels: ["Lecture 1"],
    policyLabel: null,
    courseTag: "course:bio101",
    sectionCount: 1,
    createdAt: 1,
    ...overrides,
  };
}

function deadline(overrides: Partial<StudyDeadline> = {}): StudyDeadline {
  return {
    id: "deadline",
    title: "Final exam",
    kind: "exam",
    courseTag: "course:bio101",
    dueLabel: "Friday",
    dueAt: null,
    source: "manual",
    createdAt: 2,
    ...overrides,
  };
}

function attempt(): StudyAttempt {
  return {
    id: "attempt",
    mode: "quiz",
    title: "Quiz attempt",
    artifactId: null,
    courseTag: "course:bio101",
    totalItems: 10,
    correctItems: 8,
    durationSeconds: 600,
    source: "manual",
    createdAt: 3,
  };
}

function session(): StudySession {
  return {
    id: "session",
    title: "Guided review",
    status: "planned",
    duration: "20_min",
    courseTag: "course:bio101",
    sourceCount: 1,
    deadlineCount: 1,
    attemptCount: 1,
    nextAction: null,
    source: "study_lens",
    createdAt: 4,
  };
}

function missedTopic(overrides: Partial<MedicalMissedQuestionTopic> = {}): MedicalMissedQuestionTopic {
  return {
    id: "medical_missed:course:bio101:heart-failure",
    topic: "ACE inhibitor contraindications",
    qbankProvider: "uworld",
    userQuestionId: "U-123",
    courseTag: "course:bio101",
    systemTag: "cardio",
    unitTag: "unit:cardiology",
    chapterTag: "chapter:heart-failure",
    conceptTags: ["pharm", "contraindication"],
    source: "study_lens",
    createdAt: 5,
    ...overrides,
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
    summary: "Supported by lecture and trusted review.",
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
    scopeLabels: ["course:bio101", "chapter:endocrine-pharm"],
    verificationDepth: "standard",
    verifiedAt: 1_000,
    manualReviewer: null,
    ...overrides,
  };
}

test("buildStudyLensSidebarSections summarizes course evidence and actions", () => {
  const courses = [course()];
  const deadlines = [deadline()];
  const attempts = [attempt()];
  const sessions = [session()];
  const artifacts = [artifact()];
  const integrations = buildStudyAcademicIntegrationState({ courses, deadlines, connectedAppIds: [] });
  const sidebar = buildStudyLensSidebarSections({
    artifacts,
    courses,
    deadlines,
    attempts,
    sessions,
    course: courses[0]!,
    integrations,
    deadlineReviewQueue: buildStudyAcademicDeadlineReviewQueueState({ deadlines }),
    medicalStudentEligibility: {
      eligible: true,
      source: "profile",
      evidenceLabel: "Medical student status found in profile",
      medicalStudyArtifactCount: 0,
    },
  });

  assert.deepEqual(sidebar.map((section) => section.title), [
    "Courses",
    "Source context",
    "Saved study outputs",
    "Medical readiness",
    "Deadline queue",
    "LMS and calendar",
    "Study sessions",
    "Attempt evidence",
  ]);
  assert.match(sidebar.find((section) => section.title === "Courses")?.items[0] ?? "", /Biology 101/);
  assert.deepEqual(sidebar.find((section) => section.title === "Source context")?.items, ["Lecture 1"]);
  assert.equal(
    sidebar.find((section) => section.title === "Medical readiness")?.action.reportIntent?.academicKind,
    "medical_cloze_vignette",
  );
  assert.equal(sidebar.find((section) => section.title === "Attempt evidence")?.action.reportIntent?.preferredKind, "practice_questions");
});

test("buildStudyLensSidebarSections exposes imported deadline review queue", () => {
  const deadlines = [
    deadline({
      id: "calendar-deadline",
      title: "Imported exam",
      source: "calendar",
      providerId: "google-calendar",
      providerRecordId: "event-1",
      reviewStatus: "needs_review",
    }),
  ];
  const integrations = buildStudyAcademicIntegrationState({
    deadlines,
    connectedAppIds: ["google-calendar"],
  });
  const sidebar = buildStudyLensSidebarSections({
    artifacts: [],
    courses: [],
    deadlines,
    attempts: [],
    sessions: [],
    course: null,
    integrations,
    deadlineReviewQueue: buildStudyAcademicDeadlineReviewQueueState({ deadlines }),
  });
  const lms = sidebar.find((section) => section.title === "LMS and calendar");

  assert.match(lms?.items.join(" ") ?? "", /needs review/i);
  assert.equal(lms?.action.view, "connected_apps");
});

test("buildStudyLensSidebarSections hides medical readiness when the student is not medical", () => {
  const sidebar = buildStudyLensSidebarSections({
    artifacts: [artifact({
      academicKind: "medical_cloze_vignette",
      markdown: "Cloze rows with vignette stems.",
    })],
    courses: [],
    deadlines: [],
    attempts: [],
    sessions: [],
    course: null,
    integrations: buildStudyAcademicIntegrationState({ courses: [], deadlines: [], connectedAppIds: [] }),
    deadlineReviewQueue: buildStudyAcademicDeadlineReviewQueueState({ deadlines: [] }),
    medicalStudentEligibility: {
      eligible: false,
      source: "not_detected",
      evidenceLabel: "No medical student evidence detected",
      medicalStudyArtifactCount: 0,
    },
  });

  assert.equal(sidebar.some((section) => section.title === "Medical readiness"), false);
});

test("buildStudyLensSidebarSections surfaces medical trusted reference detail for eligible students", () => {
  const sidebar = buildStudyLensSidebarSections({
    artifacts: [artifact({
      academicKind: "medical_cloze_vignette",
      markdown: [
        "Medical detail zoom: fine detail.",
        "Trusted medical grounding: use retained student uploads and source locators first; if trusted open-reference snippets are available, cite them.",
        "Source integrity: never treat LLM internal knowledge as source evidence.",
      ].join("\n"),
    })],
    courses: [],
    deadlines: [],
    attempts: [],
    sessions: [],
    course: null,
    integrations: buildStudyAcademicIntegrationState({ courses: [], deadlines: [], connectedAppIds: [] }),
    deadlineReviewQueue: buildStudyAcademicDeadlineReviewQueueState({ deadlines: [] }),
    medicalStudentEligibility: {
      eligible: true,
      source: "profile",
      evidenceLabel: "Medical student status found in profile",
      medicalStudyArtifactCount: 0,
    },
  });
  const medical = sidebar.find((section) => section.title === "Medical readiness");

  assert.match(medical?.items.join(" ") ?? "", /Detail zoom: fine detail/i);
  assert.match(medical?.items.join(" ") ?? "", /Trusted reference supported/i);
  assert.match(medical?.items.join(" ") ?? "", /Student-source primary/i);
});

test("buildStudyLensSidebarSections surfaces prior medical fact verification evidence", () => {
  const sidebar = buildStudyLensSidebarSections({
    artifacts: [artifact({ academicKind: "medical_cloze_vignette" })],
    courses: [course()],
    deadlines: [],
    attempts: [],
    sessions: [],
    course: course(),
    integrations: buildStudyAcademicIntegrationState({ courses: [], deadlines: [], connectedAppIds: [] }),
    deadlineReviewQueue: buildStudyAcademicDeadlineReviewQueueState({ deadlines: [] }),
    medicalFactVerifications: [factVerification()],
    medicalStudentEligibility: {
      eligible: true,
      source: "profile",
      evidenceLabel: "Medical student status found in profile",
      medicalStudyArtifactCount: 0,
    },
  });
  const medical = sidebar.find((section) => section.title === "Medical readiness");

  assert.match(medical?.items.join(" ") ?? "", /Fact verification: partially verified/i);
  assert.match(medical?.items.join(" ") ?? "", /medium, 2 sources/i);
});

test("buildStudyLensSidebarSections surfaces medical card-bloat quality action", () => {
  const shallowRows = Array.from({ length: 12 }, (_, index) =>
    `- cloze_text: Definition ${index} | answer: fact | quality_flag: shallow | reasoning_order: first_order`
  ).join("\n");
  const sidebar = buildStudyLensSidebarSections({
    artifacts: [
      artifact({
        academicKind: "medical_cloze_vignette",
        structuredItemCount: 30,
        markdown: shallowRows,
      }),
    ],
    courses: [course()],
    deadlines: [],
    attempts: [],
    sessions: [],
    course: course(),
    integrations: buildStudyAcademicIntegrationState({ courses: [], deadlines: [], connectedAppIds: [] }),
    deadlineReviewQueue: buildStudyAcademicDeadlineReviewQueueState({ deadlines: [] }),
    medicalStudentEligibility: {
      eligible: true,
      source: "profile",
      evidenceLabel: "Medical student status found in profile",
      medicalStudyArtifactCount: 0,
    },
  });
  const medical = sidebar.find((section) => section.title === "Medical readiness");

  assert.match(medical?.items.join(" ") ?? "", /upgrade shallow first-order cards into vignette\/application prompts/i);
  assert.equal(medical?.action.label, "Upgrade shallow cards");
  assert.equal(medical?.action.reportIntent?.preferredKind, "practice_questions");
  assert.match(medical?.action.reportIntent?.searchQuery ?? "", /medical shallow first-order card upgrade/i);
  assert.match(medical?.action.reportIntent?.zettelkastenNextAction ?? "", /Upgrade shallow first-order medical cards/i);
  assert.ok(medical?.action.reportIntent?.knowledgeGraphLinkTags.includes("quality_action:upgrade_first_order"));
});

test("buildStudyLensSidebarSections routes medical missed topics into gated cloze reports", () => {
  const sidebar = buildStudyLensSidebarSections({
    artifacts: [artifact({ academicKind: "medical_cloze_vignette" })],
    courses: [course()],
    deadlines: [],
    attempts: [],
    sessions: [],
    course: course(),
    integrations: buildStudyAcademicIntegrationState({ courses: [], deadlines: [], connectedAppIds: [] }),
    deadlineReviewQueue: buildStudyAcademicDeadlineReviewQueueState({ deadlines: [] }),
    medicalMissedQuestionTopics: [missedTopic()],
    medicalStudentEligibility: {
      eligible: true,
      source: "profile",
      evidenceLabel: "Medical student status found in profile",
      medicalStudyArtifactCount: 0,
    },
  });
  const medical = sidebar.find((section) => section.title === "Medical readiness");

  assert.equal(medical?.action.label, "Make cards from missed topics");
  assert.equal(medical?.action.reportIntent?.academicKind, "medical_cloze_vignette");
  assert.equal(medical?.action.reportIntent?.courseTag, "course:bio101");
  assert.equal(medical?.action.reportIntent?.chapterTag, "chapter:heart-failure");
  assert.match(medical?.items.join(" ") ?? "", /1 missed topic, 1 needs cards, 0 already covered/i);
  assert.match(medical?.items.join(" ") ?? "", /Needs cards/i);
  assert.match(medical?.items.join(" ") ?? "", /ACE inhibitor contraindications/i);
  assert.ok(medical?.action.reportIntent?.knowledgeGraphLinkTags.includes("qbank:uworld"));
});

test("buildStudyLensSidebarSections carries topology source-only gaps into medical cloze reports", () => {
  const sidebar = buildStudyLensSidebarSections({
    artifacts: [
      artifact({
        id: "medical-source",
        title: "Cardiology retained source summary",
        reportKind: "lecture_summary",
        reportLabel: "lecture summary report",
        academicKind: "medical_cloze_vignette",
        markdown: "Retained cardiology source. system_tag: system:cardiovascular concept_tags: pharm; management",
        sourceLabels: ["Cardio lecture"],
        unitTag: "unit:cardiology",
        chapterTag: "chapter:heart-failure",
        structuredItemCount: 0,
      }),
    ],
    courses: [course()],
    deadlines: [],
    attempts: [],
    sessions: [],
    course: course(),
    integrations: buildStudyAcademicIntegrationState({ courses: [], deadlines: [], connectedAppIds: [] }),
    deadlineReviewQueue: buildStudyAcademicDeadlineReviewQueueState({ deadlines: [] }),
    medicalStudentEligibility: {
      eligible: true,
      source: "profile",
      evidenceLabel: "Medical student status found in profile",
      medicalStudyArtifactCount: 0,
    },
  });
  const medical = sidebar.find((section) => section.title === "Medical readiness");

  assert.equal(medical?.action.label, "Make cloze/vignette cards for gaps");
  assert.equal(medical?.action.reportIntent?.preferredKind, "flashcard_deck");
  assert.equal(medical?.action.reportIntent?.unitTag, "unit:cardiology");
  assert.equal(medical?.action.reportIntent?.chapterTag, "chapter:heart-failure");
  assert.match(medical?.action.reportIntent?.searchQuery ?? "", /system:cardiovascular/i);
  assert.ok(medical?.action.reportIntent?.knowledgeGraphLinkTags.includes("medical_topology_coverage"));
  assert.ok(medical?.action.reportIntent?.knowledgeGraphLinkTags.includes("readiness:Source only"));
  assert.ok(medical?.action.reportIntent?.knowledgeGraphLinkTags.includes("topology_gap:source_only"));
  assert.ok(medical?.action.reportIntent?.knowledgeGraphLinkTags.includes("pharm"));
  assert.match(medical?.items.join(" ") ?? "", /medical topology coverage node/i);
});

test("buildStudyLensSidebarSections does not route covered medical missed topics into duplicate card generation", () => {
  const sidebar = buildStudyLensSidebarSections({
    artifacts: [
      artifact({
        academicKind: "medical_cloze_vignette",
        markdown: "Cloze deck covers ACE inhibitor contraindications. chapter:heart-failure",
        chapterTag: "chapter:heart-failure",
      }),
    ],
    courses: [course()],
    deadlines: [],
    attempts: [],
    sessions: [],
    course: course(),
    integrations: buildStudyAcademicIntegrationState({ courses: [], deadlines: [], connectedAppIds: [] }),
    deadlineReviewQueue: buildStudyAcademicDeadlineReviewQueueState({ deadlines: [] }),
    medicalMissedQuestionTopics: [missedTopic()],
    medicalStudentEligibility: {
      eligible: true,
      source: "profile",
      evidenceLabel: "Medical student status found in profile",
      medicalStudyArtifactCount: 0,
    },
  });
  const medical = sidebar.find((section) => section.title === "Medical readiness");

  assert.notEqual(medical?.action.label, "Make cards from missed topics");
  assert.match(medical?.items.join(" ") ?? "", /1 missed topic, 0 need cards, 1 already covered/i);
  assert.match(medical?.items.join(" ") ?? "", /Covered: ACE inhibitor contraindications/i);
});

test("buildStudyLensSidebarSections surfaces medical concept relationship evidence", () => {
  const sidebar = buildStudyLensSidebarSections({
    artifacts: [
      artifact({
        academicKind: "medical_cloze_vignette",
        markdown: "- cloze_text: ACE inhibitors are contraindicated in {{c1::pregnancy}} | answer: pregnancy | source_label: Heart failure lecture | source_locator: slide 24 | course_tag: course:bio101 | system_tag: cardio | unit_tag: unit:cardiology | chapter_tag: chapter:heart-failure | concept_tags: pharm; contraindication | reasoning_order: second_order",
        chapterTag: "chapter:heart-failure",
        unitTag: "unit:cardiology",
      }),
    ],
    courses: [course()],
    deadlines: [],
    attempts: [],
    sessions: [],
    course: course(),
    integrations: buildStudyAcademicIntegrationState({ courses: [], deadlines: [], connectedAppIds: [] }),
    deadlineReviewQueue: buildStudyAcademicDeadlineReviewQueueState({ deadlines: [] }),
    medicalStudentEligibility: {
      eligible: true,
      source: "profile",
      evidenceLabel: "Medical student status found in profile",
      medicalStudyArtifactCount: 0,
    },
  });
  const medical = sidebar.find((section) => section.title === "Medical readiness");

  assert.match(medical?.items.join(" ") ?? "", /1 medical concept relationship across 1 chapter/i);
});

test("buildStudyLensSidebarSections routes medical concept edges into regenerative review when no missed topics need cards", () => {
  const sidebar = buildStudyLensSidebarSections({
    artifacts: [
      artifact({
        id: "medical-deck",
        academicKind: "medical_cloze_vignette",
        markdown: "- vignette_stem: A patient with heart failure develops cough after starting therapy. What mechanism explains this presentation? | answer: bradykinin accumulation | source_label: Heart failure lecture | source_locator: slide 26 | course_tag: course:bio101 | system_tag: cardio | unit_tag: unit:cardiology | chapter_tag: chapter:heart-failure | concept_tags: pathophys; presentation | reasoning_order: third_order",
        chapterTag: "chapter:heart-failure",
        unitTag: "unit:cardiology",
      }),
    ],
    courses: [course()],
    deadlines: [],
    attempts: [],
    sessions: [],
    course: course(),
    integrations: buildStudyAcademicIntegrationState({ courses: [], deadlines: [], connectedAppIds: [] }),
    deadlineReviewQueue: buildStudyAcademicDeadlineReviewQueueState({ deadlines: [] }),
    medicalStudentEligibility: {
      eligible: true,
      source: "profile",
      evidenceLabel: "Medical student status found in profile",
      medicalStudyArtifactCount: 0,
    },
  });
  const medical = sidebar.find((section) => section.title === "Medical readiness");

  assert.equal(medical?.action.label, "Regenerate edge questions");
  assert.equal(medical?.action.reportIntent?.preferredKind, "practice_questions");
  assert.equal(medical?.action.reportIntent?.academicKind, "medical_cloze_vignette");
  assert.match(medical?.action.reportIntent?.zettelkastenNextAction ?? "", /freshly phrased cloze and vignette/i);
  assert.ok(medical?.action.reportIntent?.knowledgeGraphLinkTags.includes("score_band:unattempted"));
  assert.match(medical?.items.join(" ") ?? "", /1 concept-edge review target, 1 high priority/i);
  assert.match(medical?.items.join(" ") ?? "", /1 high-yield concept edge not attempted yet/i);
});

test("buildStudyLensSidebarSections downgrades reviewed medical concept edges from high priority", () => {
  const sidebar = buildStudyLensSidebarSections({
    artifacts: [
      artifact({
        id: "medical-deck",
        academicKind: "medical_cloze_vignette",
        markdown: "- vignette_stem: A patient with heart failure develops cough after starting therapy. What mechanism explains this presentation? | answer: bradykinin accumulation | source_label: Heart failure lecture | source_locator: slide 26 | course_tag: course:bio101 | system_tag: cardio | unit_tag: unit:cardiology | chapter_tag: chapter:heart-failure | concept_tags: pathophys; presentation | reasoning_order: third_order",
        chapterTag: "chapter:heart-failure",
        unitTag: "unit:cardiology",
      }),
    ],
    courses: [course()],
    deadlines: [],
    attempts: [],
    sessions: [],
    course: course(),
    integrations: buildStudyAcademicIntegrationState({ courses: [], deadlines: [], connectedAppIds: [] }),
    deadlineReviewQueue: buildStudyAcademicDeadlineReviewQueueState({ deadlines: [] }),
    medicalConceptEdgeAttempts: [{
      id: "edge-attempt",
      relationshipId: "medical-deck:0:pathophys_to_presentation:pathophys",
      courseTag: "course:bio101",
      totalItems: 4,
      correctItems: 4,
      source: "focused_screen",
      createdAt: 10,
    }],
    medicalStudentEligibility: {
      eligible: true,
      source: "profile",
      evidenceLabel: "Medical student status found in profile",
      medicalStudyArtifactCount: 0,
    },
  });
  const medical = sidebar.find((section) => section.title === "Medical readiness");

  assert.equal(medical?.action.label, "Review concept edges");
  assert.match(medical?.items.join(" ") ?? "", /1 concept-edge review target, 0 high priority/i);
  assert.match(medical?.items.join(" ") ?? "", /Concept edges ready for varied phrasing review/i);
  assert.match(medical?.items.join(" ") ?? "", /Edge attempt \(course:bio101\): pathophys -> presentation - 4\/4 \(100%\), focused screen/i);
});

test("buildStudyLensSidebarSections routes repaired concept edges to attempt capture instead of duplicate regeneration", () => {
  const sidebar = buildStudyLensSidebarSections({
    artifacts: [
      artifact({
        id: "medical-deck",
        academicKind: "medical_cloze_vignette",
        markdown: "- vignette_stem: A patient with heart failure develops cough after starting therapy. What mechanism explains this presentation? | answer: bradykinin accumulation | source_label: Heart failure lecture | source_locator: slide 26 | course_tag: course:bio101 | system_tag: cardio | unit_tag: unit:cardiology | chapter_tag: chapter:heart-failure | concept_tags: pathophys; presentation | reasoning_order: third_order",
        chapterTag: "chapter:heart-failure",
        unitTag: "unit:cardiology",
      }),
      artifact({
        id: "medical-repair",
        title: "Cardiology concept-edge repair set",
        filename: "cardiology-concept-edge-repair.md",
        academicKind: "medical_cloze_vignette",
        reportKind: "practice_questions",
        markdown: [
          "Medical concept-edge repair queue: use relationship ID, score band, and graph tags.",
          "medical_edge_attempt | relationship_id: medical-deck:0:pathophys_to_presentation:pathophys | total_items: 5 | correct_items: 2 | course_tag: course:bio101",
          "score_band:weak",
        ].join("\n"),
        chapterTag: "chapter:heart-failure",
        unitTag: "unit:cardiology",
        createdAt: 20,
      }),
    ],
    courses: [course()],
    deadlines: [],
    attempts: [],
    sessions: [],
    course: course(),
    integrations: buildStudyAcademicIntegrationState({ courses: [], deadlines: [], connectedAppIds: [] }),
    deadlineReviewQueue: buildStudyAcademicDeadlineReviewQueueState({ deadlines: [] }),
    medicalConceptEdgeAttempts: [{
      id: "edge-attempt",
      relationshipId: "medical-deck:0:pathophys_to_presentation:pathophys",
      courseTag: "course:bio101",
      totalItems: 5,
      correctItems: 2,
      source: "focused_screen",
      createdAt: 10,
    }],
    medicalStudentEligibility: {
      eligible: true,
      source: "profile",
      evidenceLabel: "Medical student status found in profile",
      medicalStudyArtifactCount: 0,
    },
  });
  const medical = sidebar.find((section) => section.title === "Medical readiness");

  assert.equal(medical?.action.label, "Record edge attempt");
  assert.match(medical?.items.join(" ") ?? "", /repaired concept edge needs attempt evidence/i);
  assert.match(medical?.action.reportIntent?.zettelkastenNextAction ?? "", /Repair output already exists/i);
  assert.match(medical?.action.reportIntent?.zettelkastenNextAction ?? "", /Use the saved repair output/i);
  assert.doesNotMatch(medical?.action.reportIntent?.zettelkastenNextAction ?? "", /^Regenerate/i);
  assert.ok(medical?.action.reportIntent?.knowledgeGraphLinkTags.includes("repair_status:pending_attempt"));
});
