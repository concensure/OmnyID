// @locs-version: 1.0
import type {
  StudyAcademicDeadlineReviewQueueState,
  StudyAcademicIntegrationState,
} from "@/lib/studyAcademicIntegrationState";
import type { StudyAttempt } from "@/lib/studyAttemptLocalState";
import type { StudyCourse } from "@/lib/studyCourseLocalState";
import type { StudyDeadline } from "@/lib/studyDeadlineLocalState";
import {
  buildMedicalMissedQuestionReportIntent,
  type MedicalMissedQuestionTopic,
} from "@/lib/medicalMissedQuestionLocalState";
import type { MedicalConceptEdgeAttempt } from "@/lib/medicalConceptEdgeAttemptLocalState";
import type { MedicalFactVerificationRecord } from "@/lib/medicalFactVerificationState";
import { medicalConceptEdgeAttemptLabels } from "@/lib/medicalConceptEdgeAttemptPresentationState";
import { buildMedicalConceptRelationshipState } from "@/lib/medicalConceptRelationshipState";
import {
  buildMedicalConceptReviewQueueState,
  buildMedicalConceptReviewReportIntent,
} from "@/lib/medicalConceptReviewQueueState";
import { buildMedicalMissedTopicQueueState } from "@/lib/medicalMissedTopicQueueState";
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";
import type { StudySession } from "@/lib/studySessionLocalState";
import {
  buildMedicalAnkiReadinessState,
  type MedicalStudentEligibilityState,
} from "@/lib/medicalAnkiStudyState";
import { buildMedicalTrustedReferenceArtifactState } from "@/lib/medicalTrustedReferenceState";
import {
  buildStudyLensConnectedAppsAction,
  buildStudyLensFileAction,
  buildStudyLensMedicalClozeAction,
  buildStudyLensReportAction,
  type StudyLensDashboardAction,
} from "@/lib/studyLensDashboardActionState";
import { buildStudyLensAttemptReportIntent } from "@/lib/studyLensNavigationState";
import { studyLensCourseLabels } from "@/lib/studyLensCourseContextState";
import {
  studyLensAttemptLabels,
  studyLensDeadlineLabels,
  studyLensSavedOutputLabels,
  studyLensSessionLabels,
  uniqueStudySourceLabels,
} from "@/lib/studyLensLabelState";

export type StudyLensSidebarSection = {
  title: string;
  items: string[];
  emptyLabel: string;
  action: StudyLensDashboardAction;
};

export function buildStudyLensSidebarSections(input: {
  artifacts: readonly StudyReportArtifact[];
  courses: readonly StudyCourse[];
  deadlines: readonly StudyDeadline[];
  attempts: readonly StudyAttempt[];
  sessions: readonly StudySession[];
  course: StudyCourse | null;
  integrations: StudyAcademicIntegrationState;
  deadlineReviewQueue: StudyAcademicDeadlineReviewQueueState;
  courseArtifacts?: readonly StudyReportArtifact[];
  medicalStudentEligibility?: MedicalStudentEligibilityState | null;
  medicalMissedQuestionTopics?: readonly MedicalMissedQuestionTopic[] | null;
  medicalConceptEdgeAttempts?: readonly MedicalConceptEdgeAttempt[] | null;
  medicalFactVerifications?: readonly MedicalFactVerificationRecord[] | null;
}): StudyLensSidebarSection[] {
  const courseArtifacts = input.courseArtifacts ?? input.artifacts;
  const sources = uniqueStudySourceLabels(input.artifacts);
  const courseItems = studyLensCourseLabels({
    courses: input.courses,
    deadlines: input.deadlines,
    attempts: input.attempts,
    artifacts: courseArtifacts,
  });
  const deadlineItems = studyLensDeadlineLabels(input.artifacts, input.deadlines);
  const attemptItems = studyLensAttemptLabels(input.attempts);
  const sessionItems = studyLensSessionLabels(input.sessions);
  const savedOutputs = studyLensSavedOutputLabels(input.artifacts);
  const medicalStudentEligible = input.medicalStudentEligibility?.eligible === true;
  const medicalMissedTopics = medicalStudentEligible
    ? (input.medicalMissedQuestionTopics ?? []).filter((topic) =>
      !input.course?.courseTag || topic.courseTag === input.course.courseTag || !topic.courseTag
    )
    : [];
  const medicalMissedTopicQueue = medicalStudentEligible
    ? buildMedicalMissedTopicQueueState({
      topics: medicalMissedTopics,
      artifacts: input.artifacts,
      courseTag: input.course?.courseTag ?? null,
    })
    : null;
  const medicalConceptRelationships = medicalStudentEligible
    ? buildMedicalConceptRelationshipState({
      artifacts: input.artifacts,
      courseTag: input.course?.courseTag ?? null,
    })
    : null;
  const medicalConceptReviewQueue = medicalConceptRelationships
    ? buildMedicalConceptReviewQueueState({
      relationships: medicalConceptRelationships.relationships,
      attempts: input.attempts,
      edgeAttempts: input.medicalConceptEdgeAttempts,
      repairArtifacts: input.artifacts,
    })
    : null;
  const medicalConceptReviewIntent = medicalConceptReviewQueue
    ? buildMedicalConceptReviewReportIntent({
      queue: medicalConceptReviewQueue,
      courseTag: input.course?.courseTag ?? null,
    })
    : null;
  const medicalMissedTopicsNeedingCards = medicalMissedTopicQueue
    ? medicalMissedTopics.filter((topic) =>
      medicalMissedTopicQueue.items.some((item) => item.topicId === topic.id && item.status === "needs_cards")
    )
    : [];
  const medicalMissedTopicIntent = input.medicalStudentEligibility
    ? buildMedicalMissedQuestionReportIntent({
      topics: medicalMissedTopicsNeedingCards,
      eligibility: input.medicalStudentEligibility,
    })
    : null;
  const medicalMissedTopicLabels = (medicalMissedTopicQueue?.items ?? [])
    .slice(0, 2)
    .map((item) => {
      const status = item.status === "needs_cards" ? "Needs cards" : "Covered";
      return `${status}: ${item.topic}${item.scopeLabel ? ` (${item.scopeLabel})` : ""}`;
    });
  const medicalEdgeAttemptLabels = medicalStudentEligible
    ? medicalConceptEdgeAttemptLabels({
      attempts: input.medicalConceptEdgeAttempts ?? [],
      courseTag: input.course?.courseTag ?? null,
      limit: 2,
    })
    : [];
  const medicalTrustedReferenceLabels = medicalStudentEligible
    ? courseArtifacts
      .flatMap((artifact) => buildMedicalTrustedReferenceArtifactState(artifact).labels)
      .filter((label) =>
        /^Detail zoom:/i.test(label)
        || /^Trusted reference supported$/i.test(label)
        || /^Student-source primary$/i.test(label)
        || /^Clinical dataset restricted$/i.test(label)
      )
      .filter((label, index, labels) => labels.findIndex((item) => item.toLowerCase() === label.toLowerCase()) === index)
      .slice(0, 3)
    : [];
  const medicalFactVerificationLabels = medicalStudentEligible
    ? (input.medicalFactVerifications ?? [])
      .filter((record) =>
        !input.course?.courseTag || record.scopeLabels.includes(input.course.courseTag)
      )
      .slice(0, 2)
      .map((record) => {
        const sourceCount = record.sourceEvidence.length;
        const sourceLabel = `${sourceCount} source${sourceCount === 1 ? "" : "s"}`;
        return `Fact verification: ${record.status.replace(/_/g, " ")} (${record.confidenceLabel}, ${sourceLabel})`;
      })
    : [];
  const medicalReadiness = medicalStudentEligible
    ? buildMedicalAnkiReadinessState({
      artifacts: input.artifacts,
      attempts: input.attempts,
      deadlines: input.deadlines,
      sessions: input.sessions,
      courseTag: input.course?.courseTag ?? null,
    })
    : null;
  const medicalReadinessItems = medicalReadiness
    ? [
      input.medicalStudentEligibility?.evidenceLabel ?? null,
      medicalMissedTopicQueue && medicalMissedTopicQueue.totalCount > 0 ? medicalMissedTopicQueue.summaryLabel : null,
      ...medicalMissedTopicLabels,
      ...medicalTrustedReferenceLabels,
      ...medicalFactVerificationLabels,
      medicalConceptRelationships && medicalConceptRelationships.totalRelationships > 0 ? medicalConceptRelationships.summaryLabel : null,
      medicalConceptReviewQueue && medicalConceptReviewQueue.totalCount > 0 ? medicalConceptReviewQueue.summaryLabel : null,
      medicalConceptReviewQueue && medicalConceptReviewQueue.totalCount > 0 ? medicalConceptReviewQueue.repairSummaryLabel : null,
      ...medicalEdgeAttemptLabels,
      medicalConceptRelationships?.hasRegenerativeBasis ? "Graph-regenerated question basis detected" : null,
      medicalReadiness.reviewLoadInterventionLabel,
      ...medicalReadiness.topologyLabels.slice(0, 2),
      `${medicalReadiness.readinessLabel}: ${medicalReadiness.headline}`,
      ...medicalReadiness.evidenceLabels.slice(0, 3),
      ...medicalReadiness.gapLabels.slice(0, 2),
      medicalReadiness.reviewLoadLabel,
    ].filter((item): item is string => Boolean(item)).slice(0, 6)
    : [];
  const medicalReadinessAction: StudyLensDashboardAction | null = medicalReadiness
    ? medicalMissedTopicIntent
      ? { label: medicalMissedTopicQueue?.nextActionLabel ?? "Make cards from missed topics", reportIntent: medicalMissedTopicIntent, view: "reports" }
      : medicalReadiness.nextActionLabel === "Upgrade shallow cards"
        ? buildStudyLensMedicalClozeAction(medicalReadiness.nextActionLabel, input.course, medicalReadiness.topologyActionFocus)
      : medicalConceptReviewIntent
        ? { label: medicalConceptReviewQueue?.nextActionLabel ?? "Review concept edges", reportIntent: medicalConceptReviewIntent, view: "reports" }
        : buildStudyLensMedicalClozeAction(medicalReadiness.nextActionLabel, input.course, medicalReadiness.topologyActionFocus)
    : null;

  return [
    {
      title: "Courses",
      items: courseItems,
      emptyLabel: "No course context captured yet",
      action: buildStudyLensReportAction("Plan course", "course_builder", input.course),
    },
    {
      title: "Source context",
      items: sources,
      emptyLabel: "No course material retained yet",
      action: buildStudyLensFileAction("Open Files", input.course),
    },
    {
      title: "Saved study outputs",
      items: savedOutputs,
      emptyLabel: "No quizzes, cards, plans, or reports saved yet",
      action: { label: "Open Reports", view: "reports" },
    },
    ...(medicalReadiness
      ? [{
        title: "Medical readiness",
        items: medicalReadinessItems,
        emptyLabel: "No medical cloze, vignette, or attempt evidence yet",
        action: medicalReadinessAction!,
      }]
      : []),
    {
      title: "Deadline queue",
      items: deadlineItems,
      emptyLabel: "No exam or assignment deadline captured yet",
      action: buildStudyLensReportAction("Add deadline", "day_schedule", input.course),
    },
    {
      title: "LMS and calendar",
      items: [
        ...(input.deadlineReviewQueue.totalCount > 0 ? [input.deadlineReviewQueue.summaryLabel] : []),
        ...input.deadlineReviewQueue.reviewItems.map((item) => `${item.title}: ${item.statusLabel} (${item.providerLabel})`),
        ...input.deadlineReviewQueue.acceptedItems.slice(0, 2).map((item) => `${item.title}: planning-ready (${item.scopeLabel})`),
        ...input.integrations.providers.map((provider) => `${provider.name}: ${provider.evidenceLabel}`),
      ].slice(0, 6),
      emptyLabel: "No LMS or Google Calendar provider configured yet",
      action: buildStudyLensConnectedAppsAction(
        input.deadlineReviewQueue.totalCount > 0
          ? input.deadlineReviewQueue.nextActionLabel
          : input.integrations.nextActionLabel,
      ),
    },
    {
      title: "Study sessions",
      items: sessionItems,
      emptyLabel: "No guided study session started yet",
      action: buildStudyLensReportAction("Start session", "guided_study_session", input.course),
    },
    {
      title: "Attempt evidence",
      items: attemptItems,
      emptyLabel: "No quiz, card, or exam attempt recorded yet",
      action: input.attempts[0]
        ? { label: "Target weak areas", reportIntent: buildStudyLensAttemptReportIntent(input.attempts[0]), view: "reports" }
        : buildStudyLensReportAction("Record attempt", "practice_questions", input.course),
    },
  ];
}
