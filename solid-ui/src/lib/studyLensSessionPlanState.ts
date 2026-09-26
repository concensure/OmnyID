// @locs-version: 1.0
import type { StudyCourse } from "@/lib/studyCourseLocalState";
import type { StudySession } from "@/lib/studySessionLocalState";
import type { StudyLensEvidenceState } from "@/lib/studyLensEvidenceState";
import {
  latestStudySessionForCourse,
  studyAttemptModeLabel,
  studyAttemptScoreLabel,
  studySessionDurationLabel,
} from "@/lib/studyLensLabelState";
import {
  buildStudyLensFileAction,
  buildStudyLensReportAction,
  type StudyLensDashboardAction,
} from "@/lib/studyLensDashboardActionState";

export type StudyLensSessionPlanItem = {
  phase: "Plan" | "Review" | "Recall" | "Check" | "Next action";
  label: string;
  detail: string;
  status: "ready" | "blocked" | "upcoming";
};

export type StudyLensSessionPlan = {
  title: string;
  detail: string;
  durationOptions: string[];
  readiness: "ready" | "partial" | "blocked";
  items: StudyLensSessionPlanItem[];
  action: StudyLensDashboardAction;
};

export function buildStudyLensSessionPlan(
  sessions: readonly StudySession[],
  course: StudyCourse | null,
  evidence: StudyLensEvidenceState,
): StudyLensSessionPlan {
  const sources = evidence.sourceLabels;
  const deadlineItems = evidence.acceptedDeadlineLabels;
  const latestAttempt = evidence.latestRelevantAttempt;
  const hasSources = evidence.hasSources;
  const hasDeadline = evidence.hasAcceptedDeadline;
  const hasAttempt = evidence.hasAttempt;
  const latestSession = latestStudySessionForCourse(sessions, course);
  const readiness: StudyLensSessionPlan["readiness"] = !hasSources ? "blocked" : hasDeadline && hasAttempt ? "ready" : "partial";
  const title = course ? `${course.name} guided session queue` : "Guided session queue";
  const sourceDetail = hasSources
    ? `Use ${sources.slice(0, 2).join(", ")}${sources.length > 2 ? ` and ${sources.length - 2} more` : ""}.`
    : "Add at least one retained lecture, reading, outline, or note before running a grounded session.";
  const deadlineDetail = hasDeadline
    ? `Prioritize ${deadlineItems[0]}.`
    : "No deadline captured yet; use a general review order until an exam or assignment date exists.";
  const recallDetail = latestAttempt
    ? `Start from ${studyAttemptModeLabel(latestAttempt.mode).toLowerCase()} evidence: ${studyAttemptScoreLabel(latestAttempt)}.`
    : "Generate flashcards or a quiz first, then record an attempt to make recall targeting specific.";

  return {
    title,
    detail: latestSession
      ? `Last ${latestSession.status} session: ${latestSession.title} (${studySessionDurationLabel(latestSession)}). ${latestSession.nextAction ?? "Use the next session to repair weak links and persist a follow-up."}`
      : readiness === "blocked"
        ? "Guided sessions need retained source context before they can avoid generic study advice."
        : readiness === "ready"
          ? "Ready for a source-grounded 20-minute or 45-minute session with deadline and attempt evidence."
          : "Usable now, but deadline or attempt evidence would make the queue more targeted.",
    durationOptions: ["20 min", "45 min"],
    readiness,
    action: readiness === "blocked"
      ? buildStudyLensFileAction("Add sources first", course)
      : buildStudyLensReportAction("Start guided session", "guided_study_session", course),
    items: [
      {
        phase: "Plan",
        label: course ? `Scope ${course.name}` : "Choose source scope",
        detail: course ? `Keep the session inside ${course.courseTag ?? course.name}. ${deadlineDetail}` : deadlineDetail,
        status: hasDeadline ? "ready" : "upcoming",
      },
      {
        phase: "Review",
        label: "Review retained sources",
        detail: sourceDetail,
        status: hasSources ? "ready" : "blocked",
      },
      {
        phase: "Recall",
        label: "Run active recall",
        detail: recallDetail,
        status: hasAttempt ? "ready" : hasSources ? "upcoming" : "blocked",
      },
      {
        phase: "Check",
        label: "Check weak links",
        detail: hasAttempt
          ? "Use missed or low-confidence items as the next repair target."
          : "Do not claim weak-area confidence until a quiz, card, or exam attempt exists.",
        status: hasAttempt ? "ready" : "upcoming",
      },
      {
        phase: "Next action",
        label: "Persist the follow-up",
        detail: "Save the session summary as a report artifact so the next dashboard pass can continue the loop.",
        status: hasSources ? "ready" : "upcoming",
      },
    ],
  };
}
