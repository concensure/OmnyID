// @locs-version: 1.0
import type { ReportKind } from "@/lib/reportGeneratorState";
import type { StudyAttempt } from "@/lib/studyAttemptLocalState";
import type { StudyDeadline } from "@/lib/studyDeadlineLocalState";
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";
import type { StudySession } from "@/lib/studySessionLocalState";

export type StudyLensEvidenceState = {
  sourceLabels: string[];
  acceptedDeadlineLabels: string[];
  drillOutputCount: number;
  planningOutputCount: number;
  readinessOutputCount: number;
  groundedOutputCount: number;
  drillAttempts: StudyAttempt[];
  examAttempts: StudyAttempt[];
  bestExamAttempt: StudyAttempt | null;
  latestRelevantAttempt: StudyAttempt | null;
  latestSession: StudySession | null;
  hasSources: boolean;
  hasAcceptedDeadline: boolean;
  hasAttempt: boolean;
};

function artifactCountForKinds(artifacts: readonly StudyReportArtifact[], kinds: readonly ReportKind[]): number {
  return artifacts.filter((artifact) => artifact.reportKind && kinds.includes(artifact.reportKind)).length;
}

function uniqueSourceLabels(artifacts: readonly StudyReportArtifact[]): string[] {
  return [...new Set(
    artifacts
      .flatMap((artifact) => artifact.sourceLabels)
      .map((label) => label.trim())
      .filter((label) => label.length > 0),
  )].slice(0, 6);
}

function manualDeadlineLabel(deadline: StudyDeadline): string {
  const course = deadline.courseTag ? ` (${deadline.courseTag})` : "";
  const review = deadline.reviewStatus === "needs_review" ? " [review]" : "";
  return `${deadline.title}${course}: ${deadline.dueLabel}${review}`;
}

function inferredDeadlineLabels(artifacts: readonly StudyReportArtifact[]): string[] {
  const datePattern = /\b(?:exam|assignment|assessment|deadline|due|final|midterm)\b[^.\n]{0,64}/gi;
  return [...new Set(
    artifacts
      .flatMap((artifact) => [artifact.title, artifact.markdown.slice(0, 1200)])
      .flatMap((text) => text.match(datePattern) ?? [])
      .map((match) => match.replace(/\s+/g, " ").trim())
      .filter((match) => match.length > 8),
  )].slice(0, 4);
}

function deadlineLabels(artifacts: readonly StudyReportArtifact[], deadlines: readonly StudyDeadline[]): string[] {
  return [...new Set([
    ...deadlines.map(manualDeadlineLabel),
    ...inferredDeadlineLabels(artifacts),
  ])].slice(0, 5);
}

function acceptedDeadlineLabels(artifacts: readonly StudyReportArtifact[], deadlines: readonly StudyDeadline[]): string[] {
  return deadlineLabels(
    artifacts,
    deadlines.filter((deadline) => deadline.reviewStatus !== "needs_review" && deadline.reviewStatus !== "ignored"),
  );
}

function latestRelevantAttempt(attempts: readonly StudyAttempt[]): StudyAttempt | null {
  return attempts.find((attempt) => attempt.mode === "quiz" || attempt.mode === "exam" || attempt.mode === "flashcards") ?? null;
}

function bestExamAttempt(attempts: readonly StudyAttempt[]): StudyAttempt | null {
  return attempts
    .filter((attempt) => attempt.mode === "exam" && attempt.totalItems > 0)
    .sort((left, right) => (right.correctItems / right.totalItems) - (left.correctItems / left.totalItems))[0] ?? null;
}

export function buildStudyLensEvidenceState(input: {
  artifacts?: readonly StudyReportArtifact[] | null;
  deadlines?: readonly StudyDeadline[] | null;
  attempts?: readonly StudyAttempt[] | null;
  sessions?: readonly StudySession[] | null;
}): StudyLensEvidenceState {
  const artifacts = input.artifacts ?? [];
  const deadlines = input.deadlines ?? [];
  const attempts = input.attempts ?? [];
  const sessions = input.sessions ?? [];
  const sourceLabels = uniqueSourceLabels(artifacts);
  const deadlineEvidence = acceptedDeadlineLabels(artifacts, deadlines);
  const relevantAttempt = latestRelevantAttempt(attempts);

  return {
    sourceLabels,
    acceptedDeadlineLabels: deadlineEvidence,
    drillOutputCount: artifactCountForKinds(artifacts, ["flashcard_deck", "quiz_generator", "practice_questions"]),
    planningOutputCount: artifactCountForKinds(artifacts, ["course_builder", "day_schedule", "weekly_revision"]),
    readinessOutputCount: artifactCountForKinds(artifacts, ["exam_preparation", "guided_study_session"]),
    groundedOutputCount: artifacts.filter((artifact) => artifact.sourceLabels.length > 0).length,
    drillAttempts: attempts.filter((attempt) => attempt.mode === "flashcards" || attempt.mode === "quiz"),
    examAttempts: attempts.filter((attempt) => attempt.mode === "exam"),
    bestExamAttempt: bestExamAttempt(attempts),
    latestRelevantAttempt: relevantAttempt,
    latestSession: sessions[0] ?? null,
    hasSources: sourceLabels.length > 0,
    hasAcceptedDeadline: deadlineEvidence.length > 0,
    hasAttempt: Boolean(relevantAttempt),
  };
}
