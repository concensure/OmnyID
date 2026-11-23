// @locs-version: 1.0
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";
import type { StudySession } from "@/lib/studySessionLocalState";
import {
  type StudyLensEvidenceState,
} from "@/lib/studyLensEvidenceState";
import { studyAttemptScoreLabel } from "@/lib/studyLensLabelState";

export type StudyLensProgressMetric = {
  label: string;
  value: string;
  detail: string;
  status: "ready" | "partial" | "missing";
};

export function buildStudyLensProgressMetrics(
  artifacts: readonly StudyReportArtifact[],
  sessions: readonly StudySession[],
  evidence: StudyLensEvidenceState,
): StudyLensProgressMetric[] {
  const latestSession = evidence.latestSession;
  const bestExamAttempt = evidence.bestExamAttempt;

  return [
    {
      label: "Drill coverage",
      value: `${Math.min(evidence.drillOutputCount, 3)}/3`,
      detail: evidence.drillAttempts.length > 0
        ? `${evidence.drillAttempts.length} recorded drill attempt${evidence.drillAttempts.length === 1 ? "" : "s"}`
        : evidence.drillOutputCount > 0 ? `${evidence.drillOutputCount} saved quiz/card/practice output${evidence.drillOutputCount === 1 ? "" : "s"}` : "No generated drill set yet",
      status: evidence.drillOutputCount >= 3 ? "ready" : evidence.drillOutputCount > 0 || evidence.drillAttempts.length > 0 ? "partial" : "missing",
    },
    {
      label: "Exam readiness",
      value: bestExamAttempt ? studyAttemptScoreLabel(bestExamAttempt) : evidence.readinessOutputCount > 0 ? "Baseline set" : "Not measured",
      detail: bestExamAttempt
        ? `Best recorded exam attempt from ${bestExamAttempt.title}`
        : evidence.readinessOutputCount > 0 ? "Readiness exists from exam prep or guided session output" : "Run exam prep before showing a readiness score",
      status: bestExamAttempt || evidence.readinessOutputCount > 0 ? "partial" : "missing",
    },
    {
      label: "Session loop",
      value: `${Math.min(sessions.length, 3)}/3`,
      detail: latestSession
        ? `Latest ${latestSession.status} session: ${latestSession.title}`
        : "No guided study session started yet",
      status: sessions.length >= 3 ? "ready" : sessions.length > 0 ? "partial" : "missing",
    },
    {
      label: "Weekly workflow",
      value: `${Math.min(evidence.planningOutputCount, 3)}/3`,
      detail: evidence.planningOutputCount > 0 ? `${evidence.planningOutputCount} saved plan/schedule/revision output${evidence.planningOutputCount === 1 ? "" : "s"}` : "No course plan, day schedule, or weekly revision yet",
      status: evidence.planningOutputCount >= 3 ? "ready" : evidence.planningOutputCount > 0 ? "partial" : "missing",
    },
    {
      label: "Grounded outputs",
      value: `${evidence.groundedOutputCount}/${artifacts.length || 0}`,
      detail: evidence.groundedOutputCount > 0 ? "Saved outputs include explicit source labels" : "Attach sources before relying on study material",
      status: evidence.groundedOutputCount > 0 ? "partial" : "missing",
    },
  ];
}
