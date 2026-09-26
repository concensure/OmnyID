// @locs-version: 1.0
import type { ReportKind } from "@/lib/reportGeneratorState";
import { reportLabelForKind } from "@/lib/reportSeedMetadata";
import type { StudyAcademicIntegrationState } from "@/lib/studyAcademicIntegrationState";
import type { StudyAttempt } from "@/lib/studyAttemptLocalState";
import type { StudyCourse } from "@/lib/studyCourseLocalState";
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";
import {
  buildStudyLensFileAction,
  buildStudyLensGraphAction,
  buildStudyLensReportAction,
  type StudyLensDashboardAction,
} from "@/lib/studyLensDashboardActionState";
import {
  studyLensCreatedLabel,
  studyLensMasteryEstimate,
  studyLensSourceLabel,
} from "@/lib/studyLensLabelState";

export type StudyLensDashboardCardKind =
  | "review_deck"
  | "quick_quiz"
  | "exam_readiness"
  | "source_coverage"
  | "semester_plan";

export type StudyLensDashboardCard = {
  id: string;
  kind: StudyLensDashboardCardKind;
  top: string;
  middle: string;
  metadata: string[];
  primaryAction: StudyLensDashboardAction;
  secondaryAction?: StudyLensDashboardAction;
};

function latestArtifactOfKind(
  artifacts: readonly StudyReportArtifact[],
  kinds: readonly ReportKind[],
): StudyReportArtifact | null {
  return artifacts.find((artifact) => artifact.reportKind && kinds.includes(artifact.reportKind)) ?? null;
}

export function buildStudyLensDashboardCards(input: {
  artifacts: readonly StudyReportArtifact[];
  attempts: readonly StudyAttempt[];
  course: StudyCourse | null;
  academicIntegrations: StudyAcademicIntegrationState;
  now: number;
}): StudyLensDashboardCard[] {
  const latestExam = latestArtifactOfKind(input.artifacts, ["exam_preparation", "guided_study_session"]);
  const latestDeck = latestArtifactOfKind(input.artifacts, ["flashcard_deck"]);
  const latestQuiz = latestArtifactOfKind(input.artifacts, ["quiz_generator", "practice_questions"]);
  const latestPlan = latestArtifactOfKind(input.artifacts, ["course_builder", "day_schedule", "weekly_revision"]);
  const latestSource = input.artifacts.find((artifact) => artifact.sourceLabels.length > 0) ?? input.artifacts[0] ?? null;

  return [
    {
      id: "today-review-deck",
      kind: "review_deck",
      top: "Today's review deck",
      middle: latestDeck
        ? `Continue ${latestDeck.reportLabel ?? reportLabelForKind("flashcard_deck")}: ${latestDeck.title}`
        : "Create a compact flashcard deck from the current course material.",
      metadata: [
        latestDeck ? "Know it / Review later" : "Active recall",
        studyLensSourceLabel(latestDeck),
        studyLensCreatedLabel(latestDeck, input.now),
      ],
      primaryAction: buildStudyLensReportAction(latestDeck ? "Continue deck" : "Make flashcards", "flashcard_deck", input.course),
      secondaryAction: buildStudyLensFileAction("Open sources", input.course),
    },
    {
      id: "quick-quiz",
      kind: "quick_quiz",
      top: "Quick quiz",
      middle: latestQuiz
        ? `Restart from ${latestQuiz.title} and turn misses into next actions.`
        : "Generate a short quiz with immediate feedback, hints, and source caveats.",
      metadata: ["Single next question", studyLensSourceLabel(latestQuiz), studyLensCreatedLabel(latestQuiz, input.now)],
      primaryAction: buildStudyLensReportAction(latestQuiz ? "Open quiz" : "Start quiz", "quiz_generator", input.course),
    },
    {
      id: "exam-readiness",
      kind: "exam_readiness",
      top: "Exam readiness",
      middle: latestExam
        ? `Use ${latestExam.title} as the next readiness checkpoint.`
        : "Build an exam-prep report before timed exam mode exists.",
      metadata: [
        studyLensMasteryEstimate(input.artifacts, input.attempts),
        studyLensSourceLabel(latestExam),
        studyLensCreatedLabel(latestExam, input.now),
      ],
      primaryAction: buildStudyLensReportAction(latestExam ? "Review readiness" : "Plan exam prep", "exam_preparation", input.course),
      secondaryAction: buildStudyLensReportAction("Study session", "guided_study_session", input.course),
    },
    {
      id: "source-coverage",
      kind: "source_coverage",
      top: "Source coverage",
      middle: latestSource
        ? `Latest grounded output used ${studyLensSourceLabel(latestSource)}. Check gaps before trusting revision material.`
        : "Upload lectures, notes, or outlines so Study Lens can ground the workflow.",
      metadata: [
        input.artifacts.length > 0 ? `${input.artifacts.length} saved study output${input.artifacts.length === 1 ? "" : "s"}` : "No saved outputs",
        latestSource?.policyLabel ?? "Retention not set here",
      ],
      primaryAction: buildStudyLensFileAction(latestSource ? "Open Files" : "Add source", input.course),
      secondaryAction: buildStudyLensGraphAction("Show graph", input.course),
    },
    {
      id: "semester-plan",
      kind: "semester_plan",
      top: "Semester workflow",
      middle: latestPlan
        ? `Keep the plan current from ${latestPlan.title}.`
        : "Create the weekly loop: course plan, deadlines, study sessions, and readiness checks.",
      metadata: [
        "Weekly planning",
        input.academicIntegrations.summaryLabel,
        studyLensSourceLabel(latestPlan),
        studyLensCreatedLabel(latestPlan, input.now),
      ],
      primaryAction: buildStudyLensReportAction(latestPlan ? "Update plan" : "Build course plan", "course_builder", input.course),
    },
  ];
}
