// @locs-version: 1.0
import type { ReportKind } from "@/lib/reportGeneratorState";
import type { StudyAttempt, StudyAttemptMode } from "@/lib/studyAttemptLocalState";
import { buildStudyArtifactSearchResults } from "@/lib/studyArtifactSearchResultState";
import type { StudyCourse } from "@/lib/studyCourseLocalState";
import type { StudyDeadline } from "@/lib/studyDeadlineLocalState";
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";
import type { StudySession } from "@/lib/studySessionLocalState";

export function studyLensSourceLabel(artifact: StudyReportArtifact | null): string {
  if (!artifact) return "No retained course source yet";
  if (artifact.sourceLabels.length === 0) return "Saved OmnyID context";
  if (artifact.sourceLabels.length === 1) return artifact.sourceLabels[0]!;
  return `${artifact.sourceLabels[0]} +${artifact.sourceLabels.length - 1} source${artifact.sourceLabels.length === 2 ? "" : "s"}`;
}

export function studyLensCreatedLabel(artifact: StudyReportArtifact | null, now: number): string {
  if (!artifact) return "Start now";
  const ageMs = Math.max(0, now - artifact.createdAt);
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) return "Saved just now";
  if (minutes < 60) return `Saved ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Saved ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Saved ${days}d ago`;
}

export function studyAttemptScoreLabel(attempt: StudyAttempt): string {
  const percent = attempt.totalItems > 0
    ? Math.round((attempt.correctItems / attempt.totalItems) * 100)
    : 0;
  return `${attempt.correctItems}/${attempt.totalItems} correct (${percent}%)`;
}

export function studyAttemptDurationLabel(attempt: StudyAttempt): string | null {
  if (!attempt.durationSeconds) return null;
  const minutes = Math.round(attempt.durationSeconds / 60);
  return minutes > 0 ? `${minutes}m` : `${attempt.durationSeconds}s`;
}

export function studyAttemptModeLabel(mode: StudyAttemptMode): string {
  switch (mode) {
    case "flashcards":
      return "Flashcards";
    case "quiz":
      return "Quiz";
    case "exam":
      return "Exam";
  }
}

export function studyAttemptReportKind(mode: StudyAttemptMode): ReportKind {
  switch (mode) {
    case "flashcards":
      return "flashcard_deck";
    case "quiz":
      return "practice_questions";
    case "exam":
      return "exam_preparation";
  }
}

export function studyLensAttemptLabels(attempts: readonly StudyAttempt[]): string[] {
  return attempts.slice(0, 5).map((attempt) => {
    const course = attempt.courseTag ? ` (${attempt.courseTag})` : "";
    const duration = studyAttemptDurationLabel(attempt);
    const suffix = duration ? `, ${duration}` : "";
    return `${studyAttemptModeLabel(attempt.mode)}${course}: ${studyAttemptScoreLabel(attempt)}${suffix}`;
  });
}

export function studyLensMasteryEstimate(
  artifacts: readonly StudyReportArtifact[],
  attempts: readonly StudyAttempt[],
): string {
  const attemptCount = attempts.filter((attempt) =>
    attempt.mode === "flashcards" || attempt.mode === "quiz" || attempt.mode === "exam"
  ).length;
  if (attemptCount > 0) return `${attemptCount} recorded attempt${attemptCount === 1 ? "" : "s"}`;
  const drillCount = artifacts.filter((artifact) =>
    artifact.reportKind === "flashcard_deck"
    || artifact.reportKind === "quiz_generator"
    || artifact.reportKind === "practice_questions"
  ).length;
  if (drillCount >= 3) return "Evidence exists across multiple drill outputs";
  if (drillCount > 0) return "Early evidence from saved drill output";
  return "No mastery evidence yet";
}

export function uniqueStudySourceLabels(artifacts: readonly StudyReportArtifact[]): string[] {
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

export function studyLensDeadlineLabels(
  artifacts: readonly StudyReportArtifact[],
  deadlines: readonly StudyDeadline[],
): string[] {
  return [...new Set([
    ...deadlines.map(manualDeadlineLabel),
    ...inferredDeadlineLabels(artifacts),
  ])].slice(0, 5);
}

export function studySessionDurationLabel(session: StudySession): string {
  switch (session.duration) {
    case "45_min":
      return "45m";
    case "custom":
      return "custom";
    case "20_min":
      return "20m";
  }
}

export function latestStudySessionForCourse(
  sessions: readonly StudySession[],
  course: StudyCourse | null,
): StudySession | null {
  if (!course?.courseTag) return sessions[0] ?? null;
  return sessions.find((session) => session.courseTag === course.courseTag) ?? sessions[0] ?? null;
}

export function studyLensSessionLabels(sessions: readonly StudySession[]): string[] {
  return sessions.slice(0, 5).map((session) => {
    const course = session.courseTag ? ` (${session.courseTag})` : "";
    const evidence = [
      session.sourceCount > 0 ? `${session.sourceCount} source${session.sourceCount === 1 ? "" : "s"}` : null,
      session.deadlineCount > 0 ? `${session.deadlineCount} deadline${session.deadlineCount === 1 ? "" : "s"}` : null,
      session.attemptCount > 0 ? `${session.attemptCount} attempt${session.attemptCount === 1 ? "" : "s"}` : null,
    ].filter((value): value is string => Boolean(value));
    const evidenceLabel = evidence.length > 0 ? ` - ${evidence.join(", ")}` : "";
    return `${session.status === "completed" ? "Completed" : "Planned"} ${studySessionDurationLabel(session)}${course}: ${session.title}${evidenceLabel}`;
  });
}

export function studyLensSavedOutputLabels(artifacts: readonly StudyReportArtifact[]): string[] {
  return buildStudyArtifactSearchResults(artifacts, null, 5).map((result) => {
    const exportCue = result.actions.includes("download_csv") ? "CSV-ready" : "exportable";
    const repairCue = result.badges.find((badge) => /^Medical .* repair$/i.test(badge));
    const workflowCue = result.badges.find((badge) => /^Medical graph-gap cloze deck$/i.test(badge) || /^Medical vignette block$/i.test(badge));
    const topologyCue = result.badges.find((badge) => /^Medical topology coverage$/i.test(badge));
    const referenceCue = result.badges.find((badge) => /^Medical trusted grounding$/i.test(badge));
    const detailZoomCue = result.badges.find((badge) => /^Detail zoom:/i.test(badge));
    const repair = repairCue ? ` - ${repairCue}` : "";
    const workflow = !repairCue && workflowCue ? ` - ${workflowCue}` : "";
    const topology = !repairCue && !workflowCue && topologyCue ? ` - ${topologyCue}` : "";
    const reference = !repairCue && !workflowCue && referenceCue ? ` - ${referenceCue}` : "";
    const detailZoom = !repairCue && !workflowCue && detailZoomCue ? ` - ${detailZoomCue}` : "";
    const [, ...scopeParts] = result.subtitle.split(" - ");
    const scope = scopeParts.length > 0 ? ` - ${scopeParts.join(" - ")}` : "";
    return `${result.title}${scope}${repair}${workflow}${topology}${reference}${detailZoom} - ${exportCue}`;
  });
}
