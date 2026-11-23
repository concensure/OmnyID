// @locs-version: 1.0
export function weddingTimelineStatusLabel(status: string | null | undefined): string {
  const normalized = (status ?? "").trim().toLowerCase();
  if (normalized === "accepted" || normalized === "complete" || normalized === "completed") return "Done";
  if (normalized === "draft") return "Draft";
  if (normalized === "high") return "High";
  if (normalized === "urgent") return "Urgent";
  if (normalized === "normal") return "Normal";
  if (normalized === "low") return "Low";
  if (normalized === "planned") return "Planned";
  if (normalized === "anytime") return "Anytime";
  return status?.trim() || "Planned";
}

export function weddingTimelineBarWidthPercent(input: {
  widthPercent: number;
  offsetPercent?: number | null;
  durationDays?: number | null;
}): number {
  if (!Number.isFinite(input.widthPercent)) return 8;
  const offset = Math.max(0, input.offsetPercent ?? 0);
  const available = Math.max(4, 100 - offset);
  if ((input.durationDays ?? 0) <= 1) {
    return Math.min(Math.max(4, input.widthPercent), Math.min(6, available));
  }
  const normalized = Math.max(8, Math.min(28, input.widthPercent));
  return Math.max(4, Math.min(normalized, available));
}

export type WeddingTimelineFileActionState = {
  enabled: boolean;
  label: string;
  title: string;
  mode: "open_artifact" | "open_files" | "unavailable";
};

export function weddingTimelineFileActionState(input: {
  linkedArtifactId?: string | null;
  canOpenArtifact?: boolean | null;
  canOpenSavedOutputs?: boolean | null;
}): WeddingTimelineFileActionState | null {
  const linkedArtifactId = typeof input.linkedArtifactId === "string" ? input.linkedArtifactId.trim() : "";
  if (!linkedArtifactId) return null;
  if (input.canOpenArtifact) {
    return {
      enabled: true,
      label: "View file",
      title: "Open the linked wedding file",
      mode: "open_artifact",
    };
  }
  if (input.canOpenSavedOutputs) {
    return {
      enabled: true,
      label: "Open files",
      title: "Open wedding documents to find this file",
      mode: "open_files",
    };
  }
  return {
    enabled: false,
    label: "File saved",
    title: "Wedding documents are not available from this view yet",
    mode: "unavailable",
  };
}
