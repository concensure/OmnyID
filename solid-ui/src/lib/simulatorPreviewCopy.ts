// @locs-version: 1.0
export type SimulatorPreviewKind = "approval" | "reversible" | "fusion";

export function simulatorPreviewKindFromRaw(
  value: string | null,
): SimulatorPreviewKind | null {
  if (value === "simulator_approval_preview") return "approval";
  if (value === "simulator_reversible_preview") return "reversible";
  if (value === "simulator_conflict_fusion") return "fusion";
  return null;
}

export function simulatorPreviewRawKind(kind: SimulatorPreviewKind): string {
  if (kind === "approval") return "simulator_approval_preview";
  if (kind === "reversible") return "simulator_reversible_preview";
  return "simulator_conflict_fusion";
}

export function simulatorPreviewTitle(kind: SimulatorPreviewKind): string {
  if (kind === "approval") return "Simulator approval preview";
  if (kind === "reversible") return "Simulator reversible preview";
  return "Simulator conflict fusion";
}

export function simulatorPreviewSummary(kind: SimulatorPreviewKind): string {
  if (kind === "approval") {
    return "Bounded simulator projection found an approval-gated path.";
  }
  if (kind === "reversible") {
    return "Bounded simulator projection prepared a reversible internal preview.";
  }
  return "Bounded simulator projection prepared one comparison that keeps approval and reversible paths together.";
}

export function simulatorPreviewReadyTitle(kind: SimulatorPreviewKind): string {
  if (kind === "approval") return "Simulator approval preview ready";
  if (kind === "reversible") return "Simulator reversible preview ready";
  return "Simulator conflict fusion ready";
}

export function simulatorPreviewBadgeLabel(kind: SimulatorPreviewKind): string {
  if (kind === "approval") return "approval preview";
  if (kind === "reversible") return "reversible preview";
  return "fusion preview";
}

export function simulatorPreviewQueuedReason(kind: SimulatorPreviewKind): string {
  if (kind === "approval") return "approval preview queued";
  if (kind === "reversible") return "reversible preview queued";
  return "fusion preview queued";
}

export function simulatorPreviewAvailabilityReason(kind: SimulatorPreviewKind): string {
  if (kind === "approval") return "bounded simulator approval preview available";
  if (kind === "reversible") return "bounded simulator reversible preview available";
  return "bounded simulator fusion preview available";
}

export function simulatorPreviewReviewFooter(kind: SimulatorPreviewKind): string {
  if (kind === "approval") return "Review bounded approval preview";
  if (kind === "reversible") return "Review bounded reversible preview";
  return "Review bounded fusion preview";
}

export function simulatorPreviewToggleLabel(open: boolean): string {
  return open ? "Hide preview" : "Review preview";
}

export function simulatorPreviewOnlyBadgeLabel(): string {
  return "preview only";
}

export function simulatorPreviewBoundaryFallback(): string {
  return "Bounded simulator preview only. This card does not execute or approve external work.";
}

export function simulatorPreviewPersistenceFallback(): string {
  return "Persisted from continuity so this bounded simulator review remains available between refreshes.";
}

export function simulatorPreviewBoundarySentence(): string {
  return "This remains a bounded preview and does not execute external work.";
}

function simulatorRolloutStageLabel(stage: string | null): string | null {
  if (stage === "promotion") return "promotion";
  if (stage === "review") return "review";
  if (stage === "shadow") return "shadow";
  return null;
}

function simulatorCalibrationModeLabel(mode: string | null): string | null {
  if (mode === "sampled_preview") return "sampled preview";
  if (mode === "bounded_deterministic") return "bounded deterministic";
  if (mode === "shadow_only") return "shadow only";
  return null;
}

export function simulatorPreviewRolloutSummary(args: {
  rolloutStage?: string | null;
  calibrationMode?: string | null;
  reviewSurfaceAvailable?: boolean;
}): string | null {
  const stageLabel = simulatorRolloutStageLabel(args.rolloutStage ?? null);
  const modeLabel = simulatorCalibrationModeLabel(args.calibrationMode ?? null);
  if (!stageLabel && !modeLabel) {
    return null;
  }

  const parts: string[] = [];
  if (stageLabel) {
    parts.push(`Rollout stage: ${stageLabel}.`);
  }
  if (modeLabel) {
    parts.push(`Calibration mode: ${modeLabel}.`);
  }
  if (args.reviewSurfaceAvailable === false) {
    parts.push("Review surface remains hidden in this rollout.");
  }
  return parts.join(" ");
}
