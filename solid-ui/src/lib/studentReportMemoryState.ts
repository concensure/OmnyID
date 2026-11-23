// @locs-version: 1.0
import type { OnboardingQuickStartSeed } from "@/lib/onboardingQuickStart";
import type { StudyArtifactSearchResultAction } from "@/lib/studyArtifactExportActionState";
import {
  buildStudyArtifactSearchResults,
} from "@/lib/studyArtifactSearchResultState";
import {
  buildStudyReportArtifactContinuationSeed,
  type StudyReportArtifact,
} from "@/lib/studyReportArtifactLocalState";

export type StudentReportMemoryRecoveryItem = {
  id: string;
  title: string;
  subtitle: string;
  detail: string;
  chips: string[];
  actions: StudyArtifactSearchResultAction[];
  quickStartSeed: OnboardingQuickStartSeed;
};

export type StudentReportMemoryState = {
  savedCount: number;
  latestTitle: string;
  headline: string;
  detail: string;
  chips: string[];
  primaryActionLabel: string;
  primaryQuickStartSeed: OnboardingQuickStartSeed;
  recoveryItems: StudentReportMemoryRecoveryItem[];
};

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatReportKind(value: string | null | undefined): string | null {
  const label = clean(value);
  return label ? label.replace(/_/g, " ") : null;
}

function uniqueFirst(values: Array<string | null | undefined>, limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

export function buildStudentReportMemoryState(
  artifacts: readonly StudyReportArtifact[],
): StudentReportMemoryState | null {
  if (artifacts.length === 0) return null;
  const sorted = [...artifacts].sort((left, right) => right.createdAt - left.createdAt);
  const latest = sorted[0];
  if (!latest) return null;
  const recoveryItems = buildStudyArtifactSearchResults(sorted, null, 3).map((result) => ({
    id: result.id,
    title: result.title,
    subtitle: result.subtitle,
    detail: result.description,
    chips: result.badges,
    actions: result.actions,
    quickStartSeed: buildStudyReportArtifactContinuationSeed(result.artifact),
  }));

  const reportLabels = sorted.map((artifact) =>
    artifact.reportLabel ?? formatReportKind(artifact.reportKind),
  );
  const courseLabels = sorted.map((artifact) => artifact.courseTag);
  const chapterLabels = sorted.map((artifact) => artifact.chapterTag);
  const unitLabels = sorted.map((artifact) => artifact.unitTag);
  const sessionLabels = sorted.map((artifact) => artifact.sessionId ? "guided session linked" : null);
  const sourceLabels = sorted.flatMap((artifact) => artifact.sourceLabels);
  const outputFormats = sorted.map((artifact) => formatReportKind(artifact.outputFormat));
  const recoveryChips = recoveryItems.flatMap((item) => item.chips);
  const chips = uniqueFirst([
    ...reportLabels,
    ...courseLabels,
    ...unitLabels,
    ...chapterLabels,
    ...sessionLabels,
    ...sourceLabels,
    ...outputFormats,
    ...recoveryChips,
  ], 12);
  const primaryQuickStartSeed =
    recoveryItems[0]?.quickStartSeed ?? buildStudyReportArtifactContinuationSeed(latest);

  return {
    savedCount: sorted.length,
    latestTitle: latest.title,
    headline: sorted.length === 1
      ? "A saved study output is already waiting."
      : `${sorted.length} saved study outputs are already waiting.`,
    detail: `Latest: ${latest.title}. Open Reports to continue from saved exam prep, quizzes, cheatsheets, schedules, or Zettelkasten synthesis instead of starting from a blank prompt.`,
    chips,
    primaryActionLabel: "Continue latest output",
    primaryQuickStartSeed,
    recoveryItems,
  };
}
