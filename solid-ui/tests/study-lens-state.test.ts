import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStudyLensFileLibraryIntent,
  buildStudyLensKnowledgeGraphIntent,
  buildStudyLensAttemptReportIntent,
  buildStudyLensCourseReportIntent,
  buildStudyLensDashboardState,
  buildStudyLensReportIntent,
  loadStudyLensEnabled,
  saveStudyLensEnabled,
  STUDY_LENS_KEY,
} from "../src/lib/studyLensState.ts";
import type { StudyAttempt } from "../src/lib/studyAttemptLocalState.ts";
import type { StudyCourse } from "../src/lib/studyCourseLocalState.ts";
import type { StudyDeadline } from "../src/lib/studyDeadlineLocalState.ts";
import type { MedicalMissedQuestionTopic } from "../src/lib/medicalMissedQuestionLocalState.ts";
import type { StudyReportArtifact } from "../src/lib/studyReportArtifactLocalState.ts";
import type { StudySession } from "../src/lib/studySessionLocalState.ts";

function storageFixture(): Storage {
  const state = new Map<string, string>();
  return {
    get length() {
      return state.size;
    },
    clear() {
      state.clear();
    },
    getItem(key: string) {
      return state.has(key) ? state.get(key)! : null;
    },
    key(index: number) {
      return [...state.keys()][index] ?? null;
    },
    removeItem(key: string) {
      state.delete(key);
    },
    setItem(key: string, value: string) {
      state.set(key, value);
    },
  };
}

function artifact(input: Partial<StudyReportArtifact> & Pick<StudyReportArtifact, "id" | "reportKind" | "title" | "createdAt">): StudyReportArtifact {
  return {
    filename: `${input.id}.md`,
    markdown: `# ${input.title}`,
    mimeType: "text/markdown;charset=utf-8",
    reportLabel: null,
    outputFormat: null,
    sourceLabels: [],
    policyLabel: null,
    sectionCount: 1,
    ...input,
  };
}

function deadline(input: Partial<StudyDeadline> & Pick<StudyDeadline, "id" | "title" | "dueLabel">): StudyDeadline {
  return {
    kind: "exam",
    courseTag: null,
    dueAt: null,
    source: "manual",
    createdAt: 1,
    ...input,
  };
}

function course(input: Partial<StudyCourse> & Pick<StudyCourse, "id" | "name" | "createdAt">): StudyCourse {
  return {
    courseTag: null,
    termLabel: null,
    institutionLabel: null,
    source: "manual",
    ...input,
  };
}

function attempt(input: Partial<StudyAttempt> & Pick<StudyAttempt, "id" | "mode" | "title" | "totalItems" | "correctItems" | "createdAt">): StudyAttempt {
  return {
    artifactId: null,
    courseTag: null,
    durationSeconds: null,
    source: "manual",
    ...input,
  };
}

function session(input: Partial<StudySession> & Pick<StudySession, "id" | "title" | "createdAt">): StudySession {
  return {
    status: "planned",
    duration: "20_min",
    courseTag: null,
    sourceCount: 0,
    deadlineCount: 0,
    attemptCount: 0,
    nextAction: null,
    source: "reports",
    ...input,
  };
}

function medicalMissedTopic(overrides: Partial<MedicalMissedQuestionTopic> = {}): MedicalMissedQuestionTopic {
  return {
    id: "medical_missed:course:med101:beta-blocker-contraindications",
    topic: "Beta blocker contraindications in acute decompensated heart failure",
    qbankProvider: "uworld",
    userQuestionId: "U-123",
    courseTag: "course:med101",
    systemTag: "cardio",
    unitTag: "unit:cardiology",
    chapterTag: "chapter:heart-failure",
    conceptTags: ["pharm", "management"],
    source: "study_lens",
    createdAt: 123,
    ...overrides,
  };
}

test("Study Lens persistence is explicit and storage-safe", () => {
  const storage = storageFixture();

  assert.equal(loadStudyLensEnabled(storage), false);
  assert.equal(saveStudyLensEnabled(true, storage), true);
  assert.equal(storage.getItem(STUDY_LENS_KEY), "true");
  assert.equal(loadStudyLensEnabled(storage), true);
  assert.equal(saveStudyLensEnabled(false, storage), false);
  assert.equal(loadStudyLensEnabled(storage), false);
});

test("Study Lens hides study cards when disabled", () => {
  const state = buildStudyLensDashboardState({
    enabled: false,
    savedReportArtifacts: [
      artifact({
        id: "deck",
        title: "Week 3 cards",
        reportKind: "flashcard_deck",
        createdAt: 1,
      }),
    ],
  });

  assert.equal(state.enabled, false);
  assert.equal(state.cards.length, 0);
  assert.equal(state.progress.length, 0);
  assert.equal(state.sidebar.length, 0);
  assert.equal(state.courseOptions.length, 0);
  assert.equal(state.modes.length, 0);
  assert.equal(state.sessionPlan, null);
  assert.equal(state.nextAction.title, "Turn on Study Lens");
  assert.match(state.summary, /Turn on Study Lens/i);
});

test("Study Lens dashboard exposes compact student workflow cards", () => {
  const state = buildStudyLensDashboardState({
    enabled: true,
    now: 60 * 60 * 1000,
    savedReportArtifacts: [
      artifact({
        id: "exam",
        title: "Biology exam readiness",
        reportKind: "exam_preparation",
        reportLabel: "exam preparation report",
        sourceLabels: ["Week 4.pdf", "Lab notes.md"],
        policyLabel: "Keep extracted notes only",
        createdAt: 30 * 60 * 1000,
      }),
      artifact({
        id: "deck",
        title: "Cell biology deck",
        reportKind: "flashcard_deck",
        markdown: "# Cell biology deck\n\nQ: What is osmosis?\nA: Water movement.\n\nQ: What is mitosis?\nA: Cell division.",
        sourceLabels: ["Week 4.pdf"],
        createdAt: 45 * 60 * 1000,
      }),
    ],
    attempts: [
      attempt({
        id: "deck-attempt",
        mode: "flashcards",
        title: "Cell biology review",
        totalItems: 12,
        correctItems: 9,
        createdAt: 50 * 60 * 1000,
      }),
    ],
  });

  assert.equal(state.enabled, true);
  assert.equal(state.hasSavedStudyOutputs, true);
  assert.equal(state.cards.length, 5);
  assert.equal(state.cards[0]?.kind, "review_deck");
  assert.equal(state.cards[0]?.primaryAction.reportKind, "flashcard_deck");
  assert.match(state.cards[0]?.middle ?? "", /Cell biology deck/i);
  assert.equal(state.cards[2]?.kind, "exam_readiness");
  assert.equal(state.cards[3]?.primaryAction.view, "files");
  assert.equal(state.progress[0]?.label, "Drill coverage");
  assert.equal(state.progress[0]?.value, "1/3");
  assert.equal(state.progress[1]?.value, "Baseline set");
  assert.equal(state.progress[2]?.label, "Session loop");
  assert.equal(state.progress[2]?.value, "0/3");
  assert.equal(state.sessionPlan?.readiness, "ready");
  assert.equal(state.sessionPlan?.items[1]?.phase, "Review");
  assert.equal(state.sessionPlan?.items[1]?.status, "ready");
  assert.equal(state.sessionPlan?.items[2]?.status, "ready");
  assert.equal(state.sidebar[0]?.title, "Courses");
  assert.equal(state.sidebar[1]?.title, "Source context");
  assert.deepEqual(state.sidebar[1]?.items, ["Week 4.pdf", "Lab notes.md"]);
  assert.equal(state.modes.length, 5);
  assert.equal(state.modes[0]?.label, "Flashcard mode");
  assert.equal(state.modes[0]?.readiness, "Deck available");
  assert.equal(state.modes[0]?.screen.layout, "card_flip");
  assert.equal(state.modes[0]?.screen.progressLabel, "9/12 correct (75%)");
  assert.deepEqual(state.modes[0]?.screen.bottomControls, ["Flip", "Know it", "Review later"]);
  assert.equal(state.modes[2]?.readiness, "Prep baseline exists");
  assert.match(state.modes[2]?.screen.guardrail ?? "", /Do not show exam-readiness percentages/i);
  assert.equal(state.nextAction.priority, "planning");
  assert.equal(state.nextAction.action.reportKind, "course_builder");
});

test("Study Lens progress avoids fake mastery when no answer history exists", () => {
  const state = buildStudyLensDashboardState({
    enabled: true,
    savedReportArtifacts: [],
  });

  assert.equal(state.progress[0]?.value, "0/3");
  assert.equal(state.progress[0]?.status, "missing");
  assert.equal(state.progress[1]?.value, "Not measured");
  assert.match(state.progress[1]?.detail ?? "", /before showing a readiness score/i);
  assert.equal(
    state.sidebar.find((section) => section.title === "Deadline queue")?.emptyLabel,
    "No exam or assignment deadline captured yet",
  );
  assert.equal(state.modes[0]?.readiness, "Needs deck");
  assert.equal(state.modes[0]?.screen.progressLabel, "No card generated yet");
  assert.equal(state.modes[4]?.readiness, "Needs source");
  assert.equal(state.modes[4]?.screen.progressLabel, "No retained source labels detected");
  assert.equal(state.nextAction.priority, "source");
  assert.equal(state.nextAction.action.view, "files");
  assert.equal(state.sessionPlan?.readiness, "blocked");
  assert.equal(state.sessionPlan?.action.view, "files");
  assert.equal(state.sessionPlan?.items[1]?.status, "blocked");
  assert.match(state.sessionPlan?.detail ?? "", /retained source context/i);
});

test("Study Lens hides medical readiness until medical student evidence exists", () => {
  const withoutEvidence = buildStudyLensDashboardState({
    enabled: true,
    savedReportArtifacts: [
      artifact({
        id: "medical-card",
        title: "Medical cloze deck",
        reportKind: "flashcard_deck",
        markdown: "Cloze rows with vignette stems.",
        academicKind: "medical_cloze_vignette",
        createdAt: 1,
      }),
    ],
  });

  assert.equal(withoutEvidence.sidebar.some((section) => section.title === "Medical readiness"), false);

  const withProfileEvidence = buildStudyLensDashboardState({
    enabled: true,
    medicalStudentEvidence: {
      profileText: "I am a medical student preparing for cardiology block exams.",
    },
    savedReportArtifacts: [
      artifact({
        id: "medical-card",
        title: "Medical cloze deck",
        reportKind: "flashcard_deck",
        markdown: "Cloze rows with vignette stems.",
        academicKind: "medical_cloze_vignette",
        createdAt: 1,
      }),
    ],
  });
  const medicalSection = withProfileEvidence.sidebar.find((section) => section.title === "Medical readiness");

  assert.equal(medicalSection?.action.reportIntent?.academicKind, "medical_cloze_vignette");
  assert.match(medicalSection?.items.join(" ") ?? "", /profile/i);
});

test("Study Lens infers medical readiness only after repeated medical study uploads", () => {
  const state = buildStudyLensDashboardState({
    enabled: true,
    savedReportArtifacts: [
      artifact({
        id: "cardio",
        title: "Cardiology lecture notes",
        reportKind: "lecture_summary",
        markdown: "Heart failure pathophysiology chapter notes.",
        createdAt: 1,
      }),
      artifact({
        id: "pharm",
        title: "Pharmacology flashcards",
        reportKind: "flashcard_deck",
        markdown: "Beta blocker mechanism of action cloze deck.",
        createdAt: 2,
      }),
      artifact({
        id: "osce",
        title: "OSCE practice questions",
        reportKind: "practice_questions",
        markdown: "Clinical presentation and management practice questions.",
        createdAt: 3,
      }),
    ],
  });

  assert.match(
    state.sidebar.find((section) => section.title === "Medical readiness")?.items.join(" ") ?? "",
    /3 medical study uploads detected/i,
  );
});

test("Study Lens uses medical missed-topic labels only when medical eligibility is present", () => {
  const hidden = buildStudyLensDashboardState({
    enabled: true,
    medicalMissedQuestionTopics: [medicalMissedTopic()],
  });

  assert.equal(hidden.sidebar.some((section) => section.title === "Medical readiness"), false);

  const visible = buildStudyLensDashboardState({
    enabled: true,
    medicalStudentEvidence: {
      profileText: "I am a medical student.",
    },
    medicalMissedQuestionTopics: [medicalMissedTopic()],
    savedReportArtifacts: [
      artifact({
        id: "cardio-source",
        title: "Cardiology lecture",
        reportKind: "lecture_summary",
        sourceLabels: ["Cardio lecture.pdf"],
        courseTag: "course:med101",
        createdAt: 1,
      }),
    ],
  });
  const medical = visible.sidebar.find((section) => section.title === "Medical readiness");

  assert.equal(medical?.action.label, "Make cards from missed topics");
  assert.equal(medical?.action.reportIntent?.academicKind, "medical_cloze_vignette");
  assert.equal(medical?.action.reportIntent?.chapterTag, "chapter:heart-failure");
  assert.match(medical?.action.reportIntent?.zettelkastenNextAction ?? "", /do not reproduce proprietary QBank wording/i);
});

test("Study Lens next action advances after source, deadline, drill, and readiness evidence", () => {
  const sourceOnly = buildStudyLensDashboardState({
    enabled: true,
    savedReportArtifacts: [
      artifact({
        id: "summary",
        title: "Lecture summary",
        reportKind: "lecture_summary",
        sourceLabels: ["Lecture 1.pdf"],
        createdAt: 1,
      }),
    ],
  });
  assert.equal(sourceOnly.nextAction.priority, "integration");
  assert.equal(sourceOnly.nextAction.action.view, "connected_apps");

  const withConnectedProvider = buildStudyLensDashboardState({
    enabled: true,
    connectedAppIds: ["gcal"],
    savedReportArtifacts: [
      artifact({
        id: "summary",
        title: "Lecture summary",
        reportKind: "lecture_summary",
        sourceLabels: ["Lecture 1.pdf"],
        createdAt: 1,
      }),
    ],
  });
  assert.equal(withConnectedProvider.nextAction.priority, "deadline");
  assert.match(withConnectedProvider.nextAction.detail, /Import academic dates/i);

  const withDeadline = buildStudyLensDashboardState({
    enabled: true,
    savedReportArtifacts: [
      artifact({
        id: "schedule",
        title: "Exam deadline next Friday",
        markdown: "# Schedule\nFinal exam due next Friday.",
        reportKind: "day_schedule",
        sourceLabels: ["Syllabus.pdf"],
        createdAt: 2,
      }),
    ],
  });
  assert.equal(withDeadline.sidebar.find((section) => section.title === "Deadline queue")?.items.length, 2);
  assert.equal(withDeadline.nextAction.priority, "drill");

  const withDrill = buildStudyLensDashboardState({
    enabled: true,
    savedReportArtifacts: [
      artifact({
        id: "quiz",
        title: "Exam deadline next Friday quiz",
        markdown: "# Quiz\nFinal exam due next Friday.",
        reportKind: "quiz_generator",
        sourceLabels: ["Syllabus.pdf"],
        createdAt: 3,
      }),
    ],
  });
  assert.equal(withDrill.nextAction.priority, "readiness");

  const withReadiness = buildStudyLensDashboardState({
    enabled: true,
    savedReportArtifacts: [
      artifact({
        id: "exam",
        title: "Exam deadline next Friday readiness",
        markdown: "# Exam prep\nFinal exam due next Friday.",
        reportKind: "exam_preparation",
        sourceLabels: ["Syllabus.pdf"],
        createdAt: 4,
      }),
      artifact({
        id: "quiz",
        title: "Quiz",
        reportKind: "quiz_generator",
        sourceLabels: ["Syllabus.pdf"],
        createdAt: 3,
      }),
    ],
  });
  assert.equal(withReadiness.nextAction.priority, "planning");
});

test("Study Lens manual deadlines fill the deadline queue before LMS sync", () => {
  const state = buildStudyLensDashboardState({
    enabled: true,
    savedReportArtifacts: [
      artifact({
        id: "summary",
        title: "Lecture summary",
        reportKind: "lecture_summary",
        sourceLabels: ["Lecture 1.pdf"],
        createdAt: 1,
      }),
    ],
    deadlines: [
      deadline({
        id: "exam",
        title: "Final exam",
        dueLabel: "Friday 9am",
        courseTag: "course:bio101",
      }),
    ],
  });

  assert.equal(state.sidebar[0]?.items[0], "Inferred course:bio101");
  assert.deepEqual(state.courseOptions, [
    {
      label: "Inferred course:bio101",
      value: "course:bio101",
      source: "inferred_from_activity",
    },
  ]);
  assert.equal(state.sidebar.find((section) => section.title === "Deadline queue")?.items[0], "Final exam (course:bio101): Friday 9am");
  assert.equal(state.modes[3]?.screen.progressLabel, "1 captured deadline");
  assert.equal(state.nextAction.priority, "drill");
  assert.equal(state.nextAction.action.reportIntent?.preferredKind, "flashcard_deck");
  assert.equal(state.nextAction.action.reportIntent?.courseTag, "course:bio101");
  assert.equal(state.sidebar[1]?.action.fileLibraryIntent?.courseTag, "course:bio101");
  assert.equal(state.sidebar[1]?.action.fileLibraryIntent?.tag, "course:bio101");
  assert.equal(state.cards[3]?.secondaryAction?.knowledgeGraphIntent?.courseTag, "course:bio101");
  assert.equal(state.sessionPlan?.title, "Bio101 guided session queue");
  assert.equal(state.sessionPlan?.readiness, "partial");
  assert.equal(state.sessionPlan?.action.reportIntent?.preferredKind, "guided_study_session");
  const lmsSection = state.sidebar.find((section) => section.title === "LMS and calendar");
  const sessionSection = state.sidebar.find((section) => section.title === "Study sessions");
  assert.equal(lmsSection?.action.view, "connected_apps");
  assert.equal(sessionSection?.emptyLabel, "No guided study session started yet");
});

test("Study Lens requires review before ambiguous imported calendar dates drive planning", () => {
  const state = buildStudyLensDashboardState({
    enabled: true,
    connectedAppIds: ["gcal"],
    savedReportArtifacts: [
      artifact({
        id: "summary",
        title: "Lecture summary",
        reportKind: "lecture_summary",
        sourceLabels: ["Lecture 1.pdf"],
        createdAt: 1,
      }),
    ],
    deadlines: [
      deadline({
        id: "calendar:gcal:event-1",
        title: "Possible exam hold",
        dueLabel: "Friday",
        source: "calendar",
        reviewStatus: "needs_review",
      }),
    ],
  });

  assert.equal(state.sidebar.find((section) => section.title === "Deadline queue")?.items[0], "Possible exam hold: Friday [review]");
  assert.equal(state.academicIntegrations.reviewNeededDeadlineCount, 1);
  assert.equal(state.nextAction.priority, "deadline");
  assert.equal(state.nextAction.title, "Review imported academic dates");
  assert.equal(state.sessionPlan?.readiness, "partial");
  assert.equal(state.sessionPlan?.items[0]?.status, "upcoming");
});

test("Study Lens exposes imported deadline review queue in LMS sidebar", () => {
  const state = buildStudyLensDashboardState({
    enabled: true,
    connectedAppIds: ["gcal"],
    savedReportArtifacts: [
      artifact({
        id: "source",
        title: "Lecture source",
        reportKind: "lecture_summary",
        sourceLabels: ["Lecture 1.pdf"],
        createdAt: 1,
      }),
    ],
    deadlines: [
      deadline({
        id: "calendar:gcal:event-review",
        title: "Possible midterm hold",
        kind: "other",
        dueLabel: "2026-10-03",
        dueAt: "2026-10-03T00:00:00.000Z",
        source: "calendar",
        providerId: "gcal",
        reviewStatus: "needs_review",
      }),
      deadline({
        id: "calendar:gcal:event-accepted",
        title: "Final exam",
        kind: "exam",
        courseTag: "course:bio101",
        dueLabel: "2026-10-04",
        dueAt: "2026-10-04T00:00:00.000Z",
        source: "calendar",
        providerId: "gcal",
        reviewStatus: "accepted",
      }),
    ],
  });

  assert.equal(state.academicDeadlineReviewQueue.summaryLabel, "1 accepted / 1 to review / 0 ignored");
  assert.equal(state.academicDeadlineReviewQueue.reviewItems[0]?.primaryAction, "accept");
  const lmsSection = state.sidebar.find((section) => section.title === "LMS and calendar");
  assert.equal(lmsSection?.action.label, "Review imported dates");
  assert.equal(lmsSection?.items[0], "1 accepted / 1 to review / 0 ignored");
  assert.match(lmsSection?.items[1] ?? "", /Possible midterm hold: Needs review \(Google Calendar\)/);
  assert.match(lmsSection?.items[2] ?? "", /Final exam: planning-ready \(course:bio101\)/);
});

test("Study Lens accepts reviewed imported LMS deadlines as planning evidence", () => {
  const state = buildStudyLensDashboardState({
    enabled: true,
    connectedAppIds: ["canvas-lms"],
    savedReportArtifacts: [
      artifact({
        id: "summary",
        title: "Lecture summary",
        reportKind: "lecture_summary",
        sourceLabels: ["Lecture 1.pdf"],
        createdAt: 1,
      }),
    ],
    deadlines: [
      deadline({
        id: "lms:canvas-lms:assignment-1",
        title: "Lab report",
        dueLabel: "Monday",
        source: "lms",
        reviewStatus: "accepted",
      }),
    ],
  });

  assert.equal(state.academicIntegrations.acceptedImportedDeadlineCount, 1);
  assert.equal(state.nextAction.priority, "drill");
  assert.equal(state.sessionPlan?.items[0]?.status, "ready");
});

test("Study Lens does not count ignored imported dates as accepted planning evidence", () => {
  const state = buildStudyLensDashboardState({
    enabled: true,
    connectedAppIds: ["gcal"],
    savedReportArtifacts: [
      artifact({
        id: "summary",
        title: "Lecture summary",
        reportKind: "lecture_summary",
        sourceLabels: ["Lecture 1.pdf"],
        createdAt: 1,
      }),
    ],
    deadlines: [
      deadline({
        id: "calendar:gcal:event-1",
        title: "Personal hold",
        dueLabel: "Friday",
        source: "calendar",
        reviewStatus: "ignored",
      }),
    ],
  });

  assert.equal(state.academicIntegrations.acceptedImportedDeadlineCount, 0);
  assert.equal(state.academicIntegrations.reviewNeededDeadlineCount, 0);
  assert.equal(state.nextAction.priority, "deadline");
  assert.equal(state.nextAction.title, "Import or capture the next deadline");
  assert.equal(state.sessionPlan?.items[0]?.status, "upcoming");
});

test("Study Lens separates explicit course context from source files", () => {
  const state = buildStudyLensDashboardState({
    enabled: true,
    savedReportArtifacts: [
      artifact({
        id: "summary",
        title: "Lecture summary",
        reportKind: "lecture_summary",
        sourceLabels: ["Week 1 slides.pdf"],
        createdAt: 1,
      }),
    ],
    courses: [
      course({
        id: "manual:course-bio101",
        name: "Biology 101",
        courseTag: "course:bio101",
        termLabel: "Term 1",
        createdAt: 2,
      }),
    ],
    deadlines: [
      deadline({
        id: "exam",
        title: "Final exam",
        dueLabel: "Friday",
        courseTag: "course:bio101",
      }),
    ],
    attempts: [
      attempt({
        id: "quiz-attempt",
        mode: "quiz",
        title: "Week 1 quiz",
        totalItems: 10,
        correctItems: 7,
        courseTag: "course:bio101",
        createdAt: 3,
      }),
    ],
    sessions: [
      session({
        id: "guided",
        title: "Biology 101 weak-link repair",
        courseTag: "course:bio101",
        duration: "45_min",
        status: "completed",
        nextAction: "Review osmosis and mitosis before the next quiz.",
        createdAt: 4,
      }),
    ],
  });

  assert.equal(state.sidebar[0]?.title, "Courses");
  assert.deepEqual(state.sidebar[0]?.items, ["Biology 101 (course:bio101) - Term 1"]);
  assert.deepEqual(state.courseOptions, [
    {
      label: "Biology 101 (course:bio101) - Term 1",
      value: "course:bio101",
      source: "manual",
    },
  ]);
  assert.equal(state.sidebar[0]?.action.reportIntent?.preferredKind, "course_builder");
  assert.equal(state.sidebar[0]?.action.reportIntent?.courseTag, "course:bio101");
  assert.equal(state.nextAction.action.reportIntent?.preferredKind, "flashcard_deck");
  assert.equal(state.nextAction.action.reportIntent?.courseTag, "course:bio101");
  assert.equal(state.cards[0]?.primaryAction.reportIntent?.preferredKind, "flashcard_deck");
  assert.equal(state.cards[0]?.primaryAction.reportIntent?.courseTag, "course:bio101");
  assert.equal(state.cards[1]?.primaryAction.reportIntent?.preferredKind, "quiz_generator");
  assert.equal(state.cards[2]?.secondaryAction?.reportIntent?.preferredKind, "guided_study_session");
  assert.equal(state.cards[4]?.primaryAction.reportIntent?.preferredKind, "course_builder");
  assert.equal(state.modes[0]?.action.reportIntent?.preferredKind, "flashcard_deck");
  assert.equal(state.modes[1]?.action.reportIntent?.preferredKind, "quiz_generator");
  assert.equal(state.modes[2]?.action.reportIntent?.preferredKind, "exam_preparation");
  assert.equal(state.sessionPlan?.title, "Biology 101 guided session queue");
  assert.equal(state.sessionPlan?.readiness, "ready");
  assert.match(state.sessionPlan?.detail ?? "", /Last completed session: Biology 101 weak-link repair \(45m\)/);
  assert.match(state.sessionPlan?.detail ?? "", /Review osmosis and mitosis/i);
  assert.equal(state.progress[2]?.value, "1/3");
  assert.match(state.progress[2]?.detail ?? "", /Biology 101 weak-link repair/i);
  assert.deepEqual(state.sessionPlan?.durationOptions, ["20 min", "45 min"]);
  assert.equal(state.sessionPlan?.action.reportIntent?.preferredKind, "guided_study_session");
  assert.equal(state.sessionPlan?.action.reportIntent?.courseTag, "course:bio101");
  assert.equal(state.sessionPlan?.items[0]?.label, "Scope Biology 101");
  assert.equal(state.sessionPlan?.items[2]?.status, "ready");
  assert.equal(state.sidebar[1]?.title, "Source context");
  assert.deepEqual(state.sidebar[1]?.items, ["Week 1 slides.pdf"]);
  const lmsSection = state.sidebar.find((section) => section.title === "LMS and calendar");
  const sessionSection = state.sidebar.find((section) => section.title === "Study sessions");
  assert.equal(lmsSection?.title, "LMS and calendar");
  assert.equal(sessionSection?.items[0], "Completed 45m (course:bio101): Biology 101 weak-link repair");
  assert.equal(state.cards[0]?.secondaryAction?.fileLibraryIntent?.courseTag, "course:bio101");
  assert.equal(state.cards[3]?.primaryAction.fileLibraryIntent?.courseTag, "course:bio101");
  assert.equal(state.cards[3]?.secondaryAction?.knowledgeGraphIntent?.activeTag, "course:bio101");
  assert.equal(state.cards[3]?.secondaryAction?.knowledgeGraphIntent?.activeLens, "study_materials");
  assert.equal(state.modes[4]?.action.fileLibraryIntent?.courseTag, "course:bio101");
  assert.equal(state.sidebar[1]?.action.fileLibraryIntent?.notice, "Showing retained Files context for Study Lens course \"Biology 101\".");
});

test("Study Lens uses course-tagged saved outputs as course evidence and scopes cards", () => {
  const state = buildStudyLensDashboardState({
    enabled: true,
    savedReportArtifacts: [
      artifact({
        id: "bio-deck",
        title: "Biology deck",
        reportKind: "flashcard_deck",
        courseTag: "course:bio101",
        sourceLabels: ["Bio week 1.pdf"],
        createdAt: 3,
      }),
      artifact({
        id: "econ-deck",
        title: "Economics deck",
        reportKind: "flashcard_deck",
        courseTag: "course:econ101",
        sourceLabels: ["Econ week 1.pdf"],
        createdAt: 4,
      }),
    ],
  });

  assert.equal(state.sidebar[0]?.items[0], "Inferred course:bio101");
  assert.equal(state.courseOptions.some((option) => option.value === "course:econ101"), true);
  assert.match(state.cards[0]?.middle ?? "", /Biology deck/);
  assert.deepEqual(state.sidebar[1]?.items, ["Bio week 1.pdf"]);
  assert.equal(state.cards[0]?.primaryAction.reportIntent?.courseTag, "course:bio101");
});

test("Study Lens saved-output sidebar exposes scope and export readiness", () => {
  const state = buildStudyLensDashboardState({
    enabled: true,
    savedReportArtifacts: [
      artifact({
        id: "law-quiz",
        title: "Chapter 4 contracts quiz",
        markdown: "# Quiz generator report\n\n- Question 1: Define consideration. Answer: Value exchanged. source: Chapter 4.pdf",
        reportKind: "quiz_generator",
        reportLabel: "quiz generator report",
        courseTag: "course:law101",
        unitTag: "unit:contracts",
        chapterTag: "chapter:4",
        moduleLabel: "Module 2",
        dueLabel: "2026-10-03T22:00:00.000Z",
        deadlineId: "deadline-42",
        providerId: "gcal",
        sourceLabels: ["Chapter 4.pdf"],
        answersIncluded: true,
        structuredItemCount: 1,
        createdAt: 3,
      }),
      artifact({
        id: "law-summary",
        title: "Chapter 4 summary",
        markdown: "# Lecture summary report\n\nContract formation.",
        reportKind: "lecture_summary",
        reportLabel: "lecture summary report",
        courseTag: "course:law101",
        unitTag: "unit:contracts",
        chapterTag: "chapter:4",
        sourceLabels: ["Chapter 4.pdf"],
        createdAt: 2,
      }),
    ],
  });

  const savedOutputs = state.sidebar.find((section) => section.title === "Saved study outputs");

  assert.equal(savedOutputs?.items[0], "Chapter 4 contracts quiz - course:law101 - unit:contracts - chapter:4 - Module 2 - 2026-10-03T22:00:00.000Z - gcal - CSV-ready");
  assert.equal(savedOutputs?.items[1], "Chapter 4 summary - course:law101 - unit:contracts - chapter:4 - exportable");
  assert.equal(savedOutputs?.action.view, "reports");
});

test("Study Lens mode screens expose accessible focused-mode contracts", () => {
  const state = buildStudyLensDashboardState({
    enabled: true,
    savedReportArtifacts: [
      artifact({
        id: "quiz",
        title: "Week 2 quiz",
        markdown: "# Week 2 quiz\n\nQuestion 1: Define precedent.\n\nQuestion 2: Apply precedent to a case.",
        reportKind: "quiz_generator",
        sourceLabels: ["Tutorial 2.md"],
        createdAt: 2,
      }),
      artifact({
        id: "exam",
        title: "Midterm exam prep",
        reportKind: "exam_preparation",
        sourceLabels: ["Tutorial 2.md"],
        createdAt: 1,
      }),
    ],
  });

  const quizMode = state.modes.find((mode) => mode.kind === "quiz");
  const examMode = state.modes.find((mode) => mode.kind === "exam");

  assert.equal(quizMode?.screen.layout, "single_question");
  assert.equal(quizMode?.screen.primaryAction, "Answer next question");
  assert.equal(quizMode?.screen.progressLabel, "2 detected question items");
  assert.match(quizMode?.screen.accessibilityFallback ?? "", /keyboard-only/i);
  assert.equal(examMode?.screen.layout, "timed_exam");
  assert.deepEqual(examMode?.screen.bottomControls, ["Next", "Flag for review", "Submit exam"]);
  assert.match(examMode?.screen.progressLabel ?? "", /timed score not measured/i);
});

test("Study Lens mode progress prefers saved structured drill item counts", () => {
  const state = buildStudyLensDashboardState({
    enabled: true,
    savedReportArtifacts: [
      artifact({
        id: "cards",
        title: "Chapter 4 flashcards",
        markdown: "# Chapter 4 flashcards\n\n- Front: Duty of care | Back: Avoid foreseeable harm.",
        reportKind: "flashcard_deck",
        structuredItemCount: 18,
        sourceLabels: ["Chapter 4.pdf"],
        createdAt: 2,
      }),
      artifact({
        id: "quiz",
        title: "Chapter 4 quiz",
        markdown: "# Chapter 4 quiz\n\nQuestion 1: Define consideration.",
        reportKind: "quiz_generator",
        structuredItemCount: 12,
        sourceLabels: ["Chapter 4.pdf"],
        createdAt: 1,
      }),
    ],
  });

  assert.equal(state.modes.find((mode) => mode.kind === "flashcards")?.screen.progressLabel, "18 structured card items");
  assert.equal(state.modes.find((mode) => mode.kind === "quiz")?.screen.progressLabel, "12 structured question items");
});

test("Study Lens uses recorded attempts before showing readiness scores", () => {
  const withoutAttempt = buildStudyLensDashboardState({
    enabled: true,
    savedReportArtifacts: [
      artifact({
        id: "exam",
        title: "Exam prep",
        reportKind: "exam_preparation",
        sourceLabels: ["Lecture 1.pdf"],
        createdAt: 1,
      }),
    ],
  });

  assert.equal(withoutAttempt.progress[1]?.value, "Baseline set");
  assert.equal(withoutAttempt.modes[2]?.screen.progressLabel, "Prep baseline saved; timed score not measured");

  const withAttempt = buildStudyLensDashboardState({
    enabled: true,
    savedReportArtifacts: [
      artifact({
        id: "exam",
        title: "Exam prep",
        reportKind: "exam_preparation",
        sourceLabels: ["Lecture 1.pdf"],
        createdAt: 1,
      }),
    ],
    attempts: [
      attempt({
        id: "exam-attempt",
        mode: "exam",
        title: "Mock exam",
        totalItems: 40,
        correctItems: 31,
        durationSeconds: 2400,
        createdAt: 2,
      }),
    ],
  });

  assert.equal(withAttempt.cards[2]?.metadata[0], "1 recorded attempt");
  assert.equal(withAttempt.progress[1]?.value, "31/40 correct (78%)");
  assert.match(withAttempt.progress[1]?.detail ?? "", /Mock exam/i);
  const attemptEvidence = withAttempt.sidebar.find((section) => section.title === "Attempt evidence");
  assert.equal(attemptEvidence?.items[0], "Exam: 31/40 correct (78%), 40m");
  assert.equal(attemptEvidence?.action.label, "Target weak areas");
  assert.equal(attemptEvidence?.action.reportIntent?.preferredKind, "exam_preparation");
  assert.equal(attemptEvidence?.action.reportIntent?.activeTag, "study_attempt:exam");
  assert.equal(withAttempt.modes[2]?.screen.progressLabel, "31/40 correct (78%) in 40m");
});

test("Study Lens treats manual drill attempts as partial evidence without saved drill reports", () => {
  const state = buildStudyLensDashboardState({
    enabled: true,
    attempts: [
      attempt({
        id: "quiz-attempt",
        mode: "quiz",
        title: "Manual quiz",
        totalItems: 10,
        correctItems: 6,
        createdAt: 1,
      }),
    ],
  });

  assert.equal(state.progress[0]?.value, "0/3");
  assert.equal(state.progress[0]?.detail, "1 recorded drill attempt");
  assert.equal(state.progress[0]?.status, "partial");
  const attemptEvidence = state.sidebar.find((section) => section.title === "Attempt evidence");
  assert.equal(attemptEvidence?.items[0], "Quiz: 6/10 correct (60%)");
  assert.equal(attemptEvidence?.action.reportIntent?.preferredKind, "practice_questions");
  assert.equal(state.modes[1]?.screen.progressLabel, "6/10 correct (60%)");
});

test("Study Lens report actions launch existing Reports intents", () => {
  const intent = buildStudyLensReportIntent("quiz_generator");

  assert.equal(intent.source, "study_lens");
  assert.equal(intent.preferredKind, "quiz_generator");
  assert.match(intent.goalHint, /source-grounded quiz/i);
});

test("Study Lens report actions can carry active course context", () => {
  const intent = buildStudyLensReportIntent("exam_preparation", course({
    id: "course",
    name: "Law 101",
    courseTag: "course:law101",
    termLabel: "Term 2",
    source: "manual",
    createdAt: 1,
  }));

  assert.equal(intent.source, "study_lens");
  assert.equal(intent.preferredKind, "exam_preparation");
  assert.equal(intent.academicKind, "study_course");
  assert.equal(intent.courseTag, "course:law101");
  assert.equal(intent.activeTag, "course:law101");
  assert.deepEqual(intent.knowledgeGraphLinkTags, ["course_source:manual", "term:Term 2"]);
  assert.match(intent.zettelkastenNextAction ?? "", /Law 101/);
});

test("Study Lens attempt report intent routes weak evidence back through Reports", () => {
  const intent = buildStudyLensAttemptReportIntent(attempt({
    id: "quiz-attempt",
    mode: "quiz",
    title: "Torts practice quiz",
    totalItems: 20,
    correctItems: 11,
    durationSeconds: 900,
    courseTag: "course:law101",
    createdAt: 1,
  }));

  assert.equal(intent.source, "study_lens");
  assert.equal(intent.preferredKind, "practice_questions");
  assert.equal(intent.courseTag, "course:law101");
  assert.equal(intent.academicKind, "study_attempt");
  assert.equal(intent.activeTag, "study_attempt:quiz");
  assert.deepEqual(intent.knowledgeGraphLinkTags, ["attempt:quiz", "score:11/20"]);
  assert.match(intent.zettelkastenNextAction ?? "", /Torts practice quiz/);
});

test("Study Lens course report intent routes course context through Reports", () => {
  const intent = buildStudyLensCourseReportIntent(course({
    id: "course",
    name: "Biology 101",
    courseTag: "course:bio101",
    termLabel: "Term 1",
    institutionLabel: "Example Uni",
    source: "manual",
    createdAt: 1,
  }));

  assert.equal(intent.source, "study_lens");
  assert.equal(intent.preferredKind, "course_builder");
  assert.equal(intent.academicKind, "study_course");
  assert.equal(intent.courseTag, "course:bio101");
  assert.equal(intent.activeTag, "course:bio101");
  assert.deepEqual(intent.knowledgeGraphLinkTags, ["course_source:manual", "term:Term 1"]);
  assert.match(intent.zettelkastenNextAction ?? "", /Biology 101/);
});

test("Study Lens course source actions route course context through Files and Knowledge Graph", () => {
  const activeCourse = course({
    id: "course",
    name: "Biology 101",
    courseTag: "course:bio101",
    termLabel: "Term 1",
    source: "manual",
    createdAt: 1,
  });
  const fileIntent = buildStudyLensFileLibraryIntent(activeCourse);
  const graphIntent = buildStudyLensKnowledgeGraphIntent(activeCourse);

  assert.equal(fileIntent.query, "Biology 101 Term 1");
  assert.equal(fileIntent.tag, "course:bio101");
  assert.equal(fileIntent.courseTag, "course:bio101");
  assert.equal(fileIntent.academicKind, "study_course");
  assert.equal(fileIntent.studyReadiness, "ready_now");
  assert.deepEqual(fileIntent.knowledgeGraphLinkTags, ["course:bio101", "course_source:manual", "term:Term 1"]);
  assert.match(fileIntent.zettelkastenNextAction ?? "", /retained sources/i);

  assert.equal(graphIntent.activeLens, "study_materials");
  assert.equal(graphIntent.preferredConnectionStrength, "high");
  assert.equal(graphIntent.activeTag, "course:bio101");
  assert.equal(graphIntent.courseTag, "course:bio101");
  assert.equal(graphIntent.academicKind, "study_course");
  assert.deepEqual(graphIntent.knowledgeGraphLinkTags, ["course:bio101", "course_source:manual", "term:Term 1"]);
  assert.match(graphIntent.zettelkastenNextAction ?? "", /graph clusters/i);
});
