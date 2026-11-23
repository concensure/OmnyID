// @locs-version: 1.0
export type RuntimeBackupControlsState = {
  controlsDisabled: boolean;
  retentionBusy: boolean;
  snapshotBusy: boolean;
  snapshotLabel: string;
  manifestReviewDisabled: boolean;
  manifestReviewLabel: string;
  drillDisabled: boolean;
  drillBusy: boolean;
  drillLabel: string;
};

export type RuntimeRecoveryPacketControlsState = {
  busy: boolean;
  disabled: boolean;
  previewLabel: string;
  downloadLabel: string;
};

export function runtimeBackupControlsState(args: {
  busy: "retention" | "snapshot" | null;
  manifestBusyId: string | null;
  latestBackupId: string | null;
  hasBackupEntries: boolean;
  drillBusyBackupId: string | null;
}): RuntimeBackupControlsState {
  const controlsDisabled = args.busy !== null;
  const snapshotBusy = args.busy === "snapshot";
  const drillBusy = args.drillBusyBackupId !== null;
  return {
    controlsDisabled,
    retentionBusy: args.busy === "retention",
    snapshotBusy,
    snapshotLabel: snapshotBusy ? "Creating snapshot..." : "Create snapshot",
    manifestReviewDisabled: args.manifestBusyId !== null || !args.hasBackupEntries,
    manifestReviewLabel: args.manifestBusyId ? "Loading manifest..." : "Review latest manifest",
    drillDisabled: drillBusy || !args.latestBackupId || !args.hasBackupEntries,
    drillBusy,
    drillLabel: drillBusy ? "Running drill..." : "Run drill from latest snapshot",
  };
}

export function runtimeRecoveryPacketControlsState(
  busy: boolean,
): RuntimeRecoveryPacketControlsState {
  return {
    busy,
    disabled: busy,
    previewLabel: busy ? "Preparing packet..." : "Preview recovery packet",
    downloadLabel: busy ? "Preparing packet..." : "Download recovery packet",
  };
}
