// @locs-version: 1.0
export function joinWorkflowHistorySegments(
  parts: readonly (string | null | undefined)[],
): string {
  return parts
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" · ");
}

export function workflowHistoryPauseResumeLabel(
  pauseCount: number,
  resumeCount: number,
): string {
  return joinWorkflowHistorySegments([
    `${pauseCount} pause${pauseCount === 1 ? "" : "s"}`,
    resumeCount > 0 ? `${resumeCount} resume${resumeCount === 1 ? "" : "s"}` : null,
  ]);
}

export function workflowHistoryReplayDiffDetailText(
  changes: ReadonlyArray<{ field: string; current?: string | null; next?: string | null }>,
): string {
  return joinWorkflowHistorySegments(
    changes.map((change) =>
      `${change.field.replaceAll("_", " ")} ${change.current ?? "unset"} -> ${change.next ?? "unset"}`),
  );
}

export function workflowHistoryStartedText(
  relativeText: string | null,
  absoluteText: string | null,
): string {
  return joinWorkflowHistorySegments([
    relativeText ? `started ${relativeText}` : null,
    absoluteText,
  ]);
}

export function workflowHistoryReplayDriftLabel(
  replayNodeCount: number,
  replayEdgeCount: number,
): string {
  return joinWorkflowHistorySegments([
    `${replayNodeCount} node drift`,
    `${replayEdgeCount} edge drift`,
  ]);
}
