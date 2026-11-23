// @locs-version: 1.0
export type DecisionOsTrustLaneSimulatorPreview = {
  title: string;
  detail: string;
  reason: string;
  consequencePreview?: string | null;
  provenanceCue?: string | null;
  sourceSummary?: string | null;
  rolloutSummary?: string | null;
} | null;

export type DecisionOsTrustLaneState = {
  title: string;
  detail: string;
  badge: string;
  reason: string;
};

type DecisionOsTrustLaneStateArgs = {
  simulatorPreviewLane: DecisionOsTrustLaneSimulatorPreview;
  provenanceCount: number;
  actionAuditCount: number;
  failedAuditCount: number;
  pendingAuditCount: number;
  successfulAuditCount: number;
  reversibleActionCount: number;
  undoReadyActionCount: number;
  latestProvenanceActionType: string | null | undefined;
  latestAuditStatus: string;
  latestUndoLabel: string | null | undefined;
  fieldCalibrationNote: string | null;
};

export function decisionOsTrustLaneState(
  args: DecisionOsTrustLaneStateArgs,
): DecisionOsTrustLaneState {
  const {
    simulatorPreviewLane,
    provenanceCount,
    actionAuditCount,
    failedAuditCount,
    pendingAuditCount,
    successfulAuditCount,
    reversibleActionCount,
    undoReadyActionCount,
    latestProvenanceActionType,
    latestAuditStatus,
    latestUndoLabel,
    fieldCalibrationNote,
  } = args;

  const simulatorPreviewDetail = simulatorPreviewLane
    ? [
        simulatorPreviewLane.detail,
        simulatorPreviewLane.rolloutSummary ?? null,
        simulatorPreviewLane.sourceSummary ?? null,
        simulatorPreviewLane.consequencePreview ?? null,
        simulatorPreviewLane.provenanceCue ?? null,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ")
    : null;

  return {
    title: undoReadyActionCount > 0
      ? `${undoReadyActionCount} reversible action${undoReadyActionCount === 1 ? "" : "s"} undo-ready`
      : simulatorPreviewLane
        ? simulatorPreviewLane.title
      : provenanceCount > 0
        ? `${provenanceCount} provenance record${provenanceCount === 1 ? "" : "s"} visible`
      : pendingAuditCount > 0
        ? `${pendingAuditCount} audit entr${pendingAuditCount === 1 ? "y" : "ies"} waiting`
      : actionAuditCount > 0
        ? `${actionAuditCount} action audit entr${actionAuditCount === 1 ? "y" : "ies"} recorded`
        : "No recent trust-trace activity",
    detail: [
      undoReadyActionCount > 0
        ? latestUndoLabel
          ? `${reversibleActionCount} reversible action${reversibleActionCount === 1 ? "" : "s"} are in audit history, most recently offering \"${latestUndoLabel}\".`
          : `${reversibleActionCount} reversible action${reversibleActionCount === 1 ? "" : "s"} are reviewable with explicit undo checkpoints.`
        : simulatorPreviewLane
          ? simulatorPreviewDetail ?? simulatorPreviewLane.detail
        : provenanceCount > 0
          ? latestProvenanceActionType
            ? `Decision lineage is visible, most recently for ${latestProvenanceActionType.replaceAll("_", " ")}.`
            : "Decision lineage and action provenance are visible in the current workspace."
        : pendingAuditCount > 0
          ? latestAuditStatus
            ? `Action audit includes entries still waiting with latest status ${latestAuditStatus}.`
            : "Action audit includes pending or waiting entries that still need resolution."
        : actionAuditCount > 0
          ? failedAuditCount > 0
            ? "Action audit contains failures that should remain reviewable."
            : successfulAuditCount > 0
              ? "Action audit history is available and recent executions are resolving successfully."
              : "Action audit history is available even when provenance records are sparse."
          : "No recent provenance or action-audit activity is visible.",
      fieldCalibrationNote,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" "),
    badge: undoReadyActionCount > 0 ? "undo-ready" : simulatorPreviewLane ? "preview" : provenanceCount > 0 ? "traceable" : pendingAuditCount > 0 ? "waiting" : failedAuditCount > 0 ? "review" : actionAuditCount > 0 ? "audited" : "quiet",
    reason: undoReadyActionCount > 0
      ? "reversible audit boundary available"
      : simulatorPreviewLane
        ? simulatorPreviewLane.reason
      : provenanceCount > 0
        ? "provenance records available"
      : pendingAuditCount > 0
        ? "audit entries still waiting"
      : failedAuditCount > 0
        ? "recent audit failure"
      : actionAuditCount > 0
        ? "audit history recorded"
        : fieldCalibrationNote
          ? "field calibration note available"
          : "no recent trust trace activity",
  };
}
