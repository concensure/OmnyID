// @locs-version: 1.0
import type { StudyAttempt } from "@/lib/studyAttemptLocalState";
import {
  buildStudyAcademicDeadlineReviewQueueState,
  buildStudyAcademicIntegrationState,
  type StudyAcademicDeadlineReviewQueueState,
  type StudyAcademicIntegrationState,
} from "@/lib/studyAcademicIntegrationState";
import type { StudyCourse } from "@/lib/studyCourseLocalState";
import type { StudyDeadline } from "@/lib/studyDeadlineLocalState";
import type { MedicalMissedQuestionTopic } from "@/lib/medicalMissedQuestionLocalState";
import type { MedicalConceptEdgeAttempt } from "@/lib/medicalConceptEdgeAttemptLocalState";
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";
import type { StudySession } from "@/lib/studySessionLocalState";
import {
  buildMedicalStudentEligibilityState,
  type MedicalStudentEligibilityInput,
} from "@/lib/medicalAnkiStudyState";
import {
  buildStudyLensEvidenceState,
  type StudyLensEvidenceState,
} from "@/lib/studyLensEvidenceState";
import {
  buildStudyLensProgressMetrics,
  type StudyLensProgressMetric,
} from "@/lib/studyLensProgressState";
import {
  buildStudyLensSessionPlan,
  type StudyLensSessionPlan,
} from "@/lib/studyLensSessionPlanState";
import {
  buildStudyLensNextAction,
  type StudyLensNextAction,
} from "@/lib/studyLensNextActionState";
import {
  buildStudyLensDashboardCards,
  type StudyLensDashboardCard,
  type StudyLensDashboardCardKind,
} from "@/lib/studyLensCardState";
import {
  buildStudyLensSidebarSections,
  type StudyLensSidebarSection,
} from "@/lib/studyLensSidebarState";
import {
  buildStudyLensFocusedModeContracts,
  type StudyLensFocusedScreen,
  type StudyLensModeKind,
} from "@/lib/studyLensFocusedModeState";
import {
  activeStudyCourse,
  artifactsForStudyLensCoursePreference,
  studyLensCourseOptions,
  type StudyLensCourseOption,
} from "@/lib/studyLensCourseContextState";
import {
  buildStudyLensAttemptReportIntent,
  buildStudyLensReportIntent,
} from "@/lib/studyLensNavigationState";
import {
  buildStudyLensFileAction,
  buildStudyLensReportAction,
  type StudyLensDashboardAction,
} from "@/lib/studyLensDashboardActionState";

export {
  buildStudyLensAttemptReportIntent,
  buildStudyLensCourseReportIntent,
  buildStudyLensFileLibraryIntent,
  buildStudyLensKnowledgeGraphIntent,
  buildStudyLensReportIntent,
} from "@/lib/studyLensNavigationState";

export const STUDY_LENS_KEY = "omnyid.study-lens.enabled";
export const STUDY_LENS_EVENT = "omnyid:study-lens";

export type { StudyLensDashboardCard, StudyLensDashboardCardKind } from "@/lib/studyLensCardState";

export type { StudyLensDashboardAction } from "@/lib/studyLensDashboardActionState";
export type { StudyLensSidebarSection } from "@/lib/studyLensSidebarState";

export type StudyLensModeLauncher = {
  kind: StudyLensModeKind;
  label: string;
  description: string;
  readiness: string;
  screen: StudyLensFocusedScreen;
  action: StudyLensDashboardAction;
};

export type { StudyLensFocusedScreen, StudyLensModeKind };

export type { StudyLensSessionPlan, StudyLensSessionPlanItem } from "@/lib/studyLensSessionPlanState";
export type { StudyLensNextAction } from "@/lib/studyLensNextActionState";

export type StudyLensDashboardState = {
  enabled: boolean;
  headline: string;
  summary: string;
  cards: StudyLensDashboardCard[];
  progress: StudyLensProgressMetric[];
  sidebar: StudyLensSidebarSection[];
  courseOptions: StudyLensCourseOption[];
  modes: StudyLensModeLauncher[];
  sessionPlan: StudyLensSessionPlan | null;
  nextAction: StudyLensNextAction;
  academicIntegrations: StudyAcademicIntegrationState;
  academicDeadlineReviewQueue: StudyAcademicDeadlineReviewQueueState;
  hasSavedStudyOutputs: boolean;
};

export type StudyLensDashboardInput = {
  enabled: boolean;
  savedReportArtifacts?: readonly StudyReportArtifact[] | null;
  courses?: readonly StudyCourse[] | null;
  deadlines?: readonly StudyDeadline[] | null;
  attempts?: readonly StudyAttempt[] | null;
  sessions?: readonly StudySession[] | null;
  medicalMissedQuestionTopics?: readonly MedicalMissedQuestionTopic[] | null;
  medicalConceptEdgeAttempts?: readonly MedicalConceptEdgeAttempt[] | null;
  connectedAppIds?: readonly string[] | null;
  localOnlyConnectedApps?: boolean;
  medicalStudentEvidence?: Omit<MedicalStudentEligibilityInput, "artifacts"> | null;
  now?: number;
};

function safeStorageGet(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeStorageSet(storage: Storage | undefined, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // ignore unavailable storage
  }
}

export function loadStudyLensEnabled(storage: Storage | undefined = globalThis.localStorage): boolean {
  return safeStorageGet(storage, STUDY_LENS_KEY) === "true";
}

export function saveStudyLensEnabled(
  enabled: boolean,
  storage: Storage | undefined = globalThis.localStorage,
): boolean {
  safeStorageSet(storage, STUDY_LENS_KEY, enabled ? "true" : "false");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STUDY_LENS_EVENT, { detail: { enabled } }));
  }
  return enabled;
}

function buildModes(
  artifacts: readonly StudyReportArtifact[],
  deadlines: readonly StudyDeadline[],
  attempts: readonly StudyAttempt[],
  course: StudyCourse | null,
): StudyLensModeLauncher[] {
  return buildStudyLensFocusedModeContracts({ artifacts, deadlines, attempts }).map((contract): StudyLensModeLauncher => ({
    kind: contract.kind,
    label: contract.label,
    description: contract.description,
    readiness: contract.readiness,
    screen: contract.screen,
    action: contract.actionView === "files"
      ? buildStudyLensFileAction(contract.actionLabel, course)
      : buildStudyLensReportAction(contract.actionLabel, contract.actionReportKind ?? "course_builder", course),
  }));
}

export function buildStudyLensDashboardState(input: StudyLensDashboardInput): StudyLensDashboardState {
  const artifacts = [...(input.savedReportArtifacts ?? [])];
  const courses = [...(input.courses ?? [])];
  const deadlines = [...(input.deadlines ?? [])];
  const attempts = [...(input.attempts ?? [])];
  const sessions = [...(input.sessions ?? [])];
  const medicalMissedQuestionTopics = [...(input.medicalMissedQuestionTopics ?? [])];
  const medicalConceptEdgeAttempts = [...(input.medicalConceptEdgeAttempts ?? [])];
  const now = input.now ?? Date.now();
  const academicIntegrations = buildStudyAcademicIntegrationState({
    connectedAppIds: input.connectedAppIds,
    courses,
    deadlines,
    localOnlyMode: input.localOnlyConnectedApps,
  });
  const academicDeadlineReviewQueue = buildStudyAcademicDeadlineReviewQueueState({ deadlines });
  const course = activeStudyCourse({ courses, deadlines, attempts, artifacts });
  const scopedArtifacts = artifactsForStudyLensCoursePreference(artifacts, course);
  const medicalStudentEligibility = buildMedicalStudentEligibilityState({
    ...(input.medicalStudentEvidence ?? {}),
    artifacts,
  });
  const evidence = buildStudyLensEvidenceState({
    artifacts: scopedArtifacts,
    deadlines,
    attempts,
    sessions,
  });
  const cards = buildStudyLensDashboardCards({
    artifacts: scopedArtifacts,
    attempts,
    course,
    academicIntegrations,
    now,
  });

  return {
    enabled: input.enabled,
    headline: "Study Lens",
    summary: input.enabled
      ? "Student workflows are surfaced on top of the same personal agent memory."
      : "Turn on Study Lens to reveal student controls without changing the base agent.",
    cards: input.enabled ? cards.slice(0, 5) : [],
    progress: input.enabled ? buildStudyLensProgressMetrics(scopedArtifacts, sessions, evidence) : [],
    sidebar: input.enabled ? buildStudyLensSidebarSections({
      artifacts: scopedArtifacts,
      courses,
      deadlines,
      attempts,
      sessions,
      course,
      integrations: academicIntegrations,
      deadlineReviewQueue: academicDeadlineReviewQueue,
      courseArtifacts: artifacts,
      medicalStudentEligibility,
      medicalMissedQuestionTopics,
      medicalConceptEdgeAttempts,
    }) : [],
    courseOptions: input.enabled ? studyLensCourseOptions({ courses, deadlines, attempts, artifacts }) : [],
    modes: input.enabled ? buildModes(scopedArtifacts, deadlines, attempts, course) : [],
    sessionPlan: input.enabled ? buildStudyLensSessionPlan(sessions, course, evidence) : null,
    nextAction: input.enabled
      ? buildStudyLensNextAction(course, academicIntegrations, evidence)
      : {
        title: "Turn on Study Lens",
        detail: "Reveal student workflows on top of the same personal agent.",
        reason: "The base agent stays general-purpose until the lens is active.",
        priority: "planning",
        action: { label: "Study Lens off" },
    },
    academicIntegrations,
    academicDeadlineReviewQueue,
    hasSavedStudyOutputs: artifacts.length > 0,
  };
}
