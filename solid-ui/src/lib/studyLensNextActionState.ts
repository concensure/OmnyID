// @locs-version: 1.0
import type { StudyAcademicIntegrationState } from "@/lib/studyAcademicIntegrationState";
import type { StudyCourse } from "@/lib/studyCourseLocalState";
import type { StudyLensEvidenceState } from "@/lib/studyLensEvidenceState";
import {
  buildStudyLensConnectedAppsAction,
  buildStudyLensFileAction,
  buildStudyLensReportAction,
  type StudyLensDashboardAction,
} from "@/lib/studyLensDashboardActionState";

export type StudyLensNextAction = {
  title: string;
  detail: string;
  reason: string;
  priority: "source" | "integration" | "deadline" | "drill" | "readiness" | "planning";
  action: StudyLensDashboardAction;
};

export function buildStudyLensNextAction(
  course: StudyCourse | null,
  integrations: StudyAcademicIntegrationState,
  evidence: StudyLensEvidenceState,
): StudyLensNextAction {
  const sources = evidence.sourceLabels;
  const drillCount = evidence.drillOutputCount;
  const planningCount = evidence.planningOutputCount;
  const readinessCount = evidence.readinessOutputCount;
  const deadlineItems = evidence.acceptedDeadlineLabels;

  if (sources.length === 0) {
    return {
      title: "Add one real course source",
      detail: "Upload a lecture, outline, reading, or assessment brief before generating study material.",
      reason: "Source grounding is the highest-leverage first step and avoids generic output.",
      priority: "source",
      action: buildStudyLensFileAction("Open Files", course),
    };
  }

  if (deadlineItems.length === 0) {
    if (integrations.reviewNeededDeadlineCount > 0) {
      return {
        title: "Review imported academic dates",
        detail: "Imported calendar events need confirmation before they can drive exam prep, quizzes, or study plans.",
        reason: "Ambiguous imported events should stay visible but cannot become planning evidence until reviewed.",
        priority: "deadline",
        action: buildStudyLensReportAction("Review dates", "day_schedule", course),
      };
    }
    if (!integrations.hasConnectedAcademicSource) {
      return {
        title: "Connect LMS or Google Calendar",
        detail: "Connect Canvas, Blackboard, Google Classroom, or Google Calendar so course dates can fill the same deadline queue.",
        reason: "Imported academic dates reduce manual setup, but they are not treated as evidence until imported into local deadlines.",
        priority: "integration",
        action: buildStudyLensConnectedAppsAction("Open Connected Apps"),
      };
    }
    return {
      title: "Import or capture the next deadline",
      detail: integrations.hasImportedAcademicEvidence
        ? "Imported academic context exists, but no reviewed exam or assignment date is available for planning yet."
        : "Import academic dates from the connected provider, or add an exam or assignment date manually.",
      reason: "Deadline context turns generated material into a weekly operating loop.",
      priority: "deadline",
      action: buildStudyLensReportAction("Add deadline", "day_schedule", course),
    };
  }

  if (drillCount === 0) {
    return {
      title: "Generate the first recall set",
      detail: "Create flashcards or a quick quiz from the retained source context.",
      reason: "OmnyID needs drill evidence before it can build a meaningful mastery history.",
      priority: "drill",
      action: buildStudyLensReportAction("Make flashcards", "flashcard_deck", course),
    };
  }

  if (readinessCount === 0) {
    return {
      title: "Create an exam-readiness baseline",
      detail: "Run exam prep from your sources and saved drills before showing readiness scores.",
      reason: "A baseline is required before progress can become outcome evidence.",
      priority: "readiness",
      action: buildStudyLensReportAction("Plan exam prep", "exam_preparation", course),
    };
  }

  return {
    title: planningCount === 0 ? "Build the weekly study loop" : "Continue the weekly study loop",
    detail: planningCount === 0
      ? "Create a course plan or weekly revision plan from sources, deadlines, and saved drills."
      : "Update the plan from the newest saved outputs and source coverage.",
    reason: "Repeated planning plus saved outputs is the workflow moat over one-off processors.",
    priority: "planning",
    action: buildStudyLensReportAction(planningCount === 0 ? "Build course plan" : "Update plan", "course_builder", course),
  };
}
