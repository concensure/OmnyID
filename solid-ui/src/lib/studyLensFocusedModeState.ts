// @locs-version: 1.0
import type { StudyAttempt, StudyAttemptMode } from "@/lib/studyAttemptLocalState";
import type { StudyDeadline } from "@/lib/studyDeadlineLocalState";
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";
import type { ReportKind } from "@/lib/reportGeneratorState";

export type StudyLensModeKind = "flashcards" | "quiz" | "exam" | "planning" | "source_review";

export type StudyLensFocusedScreen = {
  layout: "card_flip" | "single_question" | "timed_exam" | "planning_queue" | "source_review";
  primaryAction: string;
  progressLabel: string;
  bottomControls: string[];
  accessibilityFallback: string;
  guardrail: string;
};

export type StudyLensFocusedModeContract = {
  kind: StudyLensModeKind;
  label: string;
  description: string;
  readiness: string;
  screen: StudyLensFocusedScreen;
  actionLabel: string;
  actionReportKind?: ReportKind;
  actionView: "reports" | "files";
};

function latestArtifactOfKind(
  artifacts: readonly StudyReportArtifact[],
  kinds: readonly ReportKind[],
): StudyReportArtifact | null {
  return artifacts.find((artifact) => artifact.reportKind && kinds.includes(artifact.reportKind)) ?? null;
}

function latestAttemptForMode(attempts: readonly StudyAttempt[], mode: StudyAttemptMode): StudyAttempt | null {
  return attempts.find((attempt) => attempt.mode === mode) ?? null;
}

function attemptScoreLabel(attempt: StudyAttempt): string {
  const percent = attempt.totalItems > 0
    ? Math.round((attempt.correctItems / attempt.totalItems) * 100)
    : 0;
  return `${attempt.correctItems}/${attempt.totalItems} correct (${percent}%)`;
}

function attemptDurationLabel(attempt: StudyAttempt): string | null {
  if (!attempt.durationSeconds) return null;
  const minutes = Math.round(attempt.durationSeconds / 60);
  return minutes > 0 ? `${minutes}m` : `${attempt.durationSeconds}s`;
}

function latestAttemptProgressLabel(attempt: StudyAttempt | null): string | null {
  if (!attempt) return null;
  const duration = attemptDurationLabel(attempt);
  return duration ? `${attemptScoreLabel(attempt)} in ${duration}` : attemptScoreLabel(attempt);
}

function countStructuredItems(markdown: string, patterns: readonly RegExp[]): number {
  const counts = patterns.map((pattern) => markdown.match(pattern)?.length ?? 0);
  return Math.max(0, ...counts);
}

function artifactItemProgress(
  artifact: StudyReportArtifact | null,
  kindLabel: string,
  patterns: readonly RegExp[],
): string {
  if (!artifact) return `No ${kindLabel} generated yet`;
  if (artifact.structuredItemCount && artifact.structuredItemCount > 0) {
    return `${artifact.structuredItemCount} structured ${kindLabel} item${artifact.structuredItemCount === 1 ? "" : "s"}`;
  }
  const itemCount = countStructuredItems(artifact.markdown, patterns);
  if (itemCount > 0) return `${itemCount} detected ${kindLabel} item${itemCount === 1 ? "" : "s"}`;
  return `${kindLabel[0]?.toUpperCase() ?? ""}${kindLabel.slice(1)} saved; item count not measured`;
}

function uniqueSourceLabels(artifacts: readonly StudyReportArtifact[]): string[] {
  return [...new Set(
    artifacts
      .flatMap((artifact) => artifact.sourceLabels)
      .map((label) => label.trim())
      .filter((label) => label.length > 0),
  )].slice(0, 6);
}

export function buildStudyLensFocusedModeContracts(input: {
  artifacts?: readonly StudyReportArtifact[] | null;
  deadlines?: readonly StudyDeadline[] | null;
  attempts?: readonly StudyAttempt[] | null;
}): StudyLensFocusedModeContract[] {
  const artifacts = input.artifacts ?? [];
  const deadlines = input.deadlines ?? [];
  const attempts = input.attempts ?? [];
  const latestDeck = latestArtifactOfKind(artifacts, ["flashcard_deck"]);
  const latestQuiz = latestArtifactOfKind(artifacts, ["quiz_generator", "practice_questions"]);
  const latestExam = latestArtifactOfKind(artifacts, ["exam_preparation"]);
  const latestPlan = latestArtifactOfKind(artifacts, ["course_builder", "day_schedule", "weekly_revision"]);
  const sourceCount = uniqueSourceLabels(artifacts).length;
  const hasDeck = Boolean(latestDeck);
  const hasQuiz = Boolean(latestQuiz);
  const hasExam = Boolean(latestExam);
  const hasPlan = Boolean(latestPlan);
  const hasSources = sourceCount > 0;

  return [
    {
      kind: "flashcards",
      label: "Flashcard mode",
      description: "One card at a time with source, difficulty, Know it, and Review later controls.",
      readiness: hasDeck ? "Deck available" : "Needs deck",
      screen: {
        layout: "card_flip",
        primaryAction: "Answer one card",
        progressLabel: latestAttemptProgressLabel(latestAttemptForMode(attempts, "flashcards"))
          ?? artifactItemProgress(latestDeck, "card", [
            /^\s*(?:[-*]\s*)?(?:front|q|question)\s*:/gim,
            /^#{2,4}\s+(?:card|flashcard)\b/gim,
          ]),
        bottomControls: ["Flip", "Know it", "Review later"],
        accessibilityFallback: "Buttons mirror swipe and tap gestures.",
        guardrail: "Do not infer mastery from flips alone; require explicit answer history.",
      },
      actionLabel: hasDeck ? "Open cards" : "Generate deck",
      actionReportKind: "flashcard_deck",
      actionView: "reports",
    },
    {
      kind: "quiz",
      label: "Quiz mode",
      description: "Single-question screen with feedback, hint on mistake, retry path, and progress.",
      readiness: hasQuiz ? "Quiz available" : "Needs quiz",
      screen: {
        layout: "single_question",
        primaryAction: "Answer next question",
        progressLabel: latestAttemptProgressLabel(latestAttemptForMode(attempts, "quiz"))
          ?? artifactItemProgress(latestQuiz, "question", [
            /^\s*(?:[-*]\s*)?(?:q|question)\s*\d*\s*[:.)-]/gim,
            /^#{2,4}\s+(?:question|quiz)\b/gim,
          ]),
        bottomControls: ["Submit answer", "Show hint", "Retry missed item"],
        accessibilityFallback: "A persistent Next button is required; keyboard-only flow cannot rely on swipes.",
        guardrail: "Show immediate feedback, but keep source caveats visible for inferred questions.",
      },
      actionLabel: hasQuiz ? "Open quiz" : "Generate quiz",
      actionReportKind: "quiz_generator",
      actionView: "reports",
    },
    {
      kind: "exam",
      label: "Exam mode",
      description: "Timer, question palette, flag-for-review, submit flow, and readiness summary.",
      readiness: hasExam ? "Prep baseline exists" : "Needs exam prep",
      screen: {
        layout: "timed_exam",
        primaryAction: "Answer current exam question",
        progressLabel: latestAttemptProgressLabel(latestAttemptForMode(attempts, "exam"))
          ?? (hasExam ? "Prep baseline saved; timed score not measured" : "No exam baseline generated yet"),
        bottomControls: ["Next", "Flag for review", "Submit exam"],
        accessibilityFallback: "Question palette and submit controls must be button-accessible.",
        guardrail: "Do not show exam-readiness percentages until timed attempts or explicit self-assessment exist.",
      },
      actionLabel: hasExam ? "Review prep" : "Create exam prep",
      actionReportKind: "exam_preparation",
      actionView: "reports",
    },
    {
      kind: "planning",
      label: "Planning mode",
      description: "Weekly plan, deadline capture, energy constraints, and next-action persistence.",
      readiness: hasPlan ? "Plan available" : "Needs plan",
      screen: {
        layout: "planning_queue",
        primaryAction: "Choose next study block",
        progressLabel: deadlines.length > 0
          ? `${deadlines.length} captured deadline${deadlines.length === 1 ? "" : "s"}`
          : hasPlan ? "Plan saved; deadline queue empty" : "No study plan generated yet",
        bottomControls: ["Start 20 min", "Start 45 min", "Update plan"],
        accessibilityFallback: "Time-box choices must remain explicit buttons.",
        guardrail: "Plans should stay feasible from deadlines, retained sources, and personal constraints.",
      },
      actionLabel: hasPlan ? "Update plan" : "Build plan",
      actionReportKind: "course_builder",
      actionView: "reports",
    },
    {
      kind: "source_review",
      label: "Source mode",
      description: "Coverage, unreadable-file warnings, retention policy, and citation confidence.",
      readiness: hasSources ? "Sources detected" : "Needs source",
      screen: {
        layout: "source_review",
        primaryAction: "Check source coverage",
        progressLabel: hasSources
          ? `${sourceCount} retained source label${sourceCount === 1 ? "" : "s"} detected`
          : "No retained source labels detected",
        bottomControls: ["Open Files", "Show graph", "Generate summary"],
        accessibilityFallback: "Source and graph navigation must be available as standard buttons.",
        guardrail: "Unreadable or temporary sources must be labelled before reports reuse them.",
      },
      actionLabel: hasSources ? "Open sources" : "Add sources",
      actionView: "files",
    },
  ];
}
