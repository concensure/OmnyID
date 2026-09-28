// @locs-version: 1.0
export function localRouterForcedRefreshOutcomeLabel(outcome: {
  clearedWarning: boolean;
  reducedWarning: boolean;
}): string;

export function localRouterRecoveryFeedback(copy: {
  available: boolean;
  refreshedPreview: boolean;
  warningCleared: boolean;
  reducedWarning: boolean;
  stillWarning: boolean;
}): string;

export function localRouterBroadRefreshRecommendation(copy: {
  lastChangedCount: number;
  hadRecentPartialRecovery: boolean;
  recentManualRefreshFailed: boolean;
}): string;

export function localRouterRecoveryStatusBadge(copy: {
  refreshingIndex: boolean;
  refreshingPreview: boolean;
  lastWarningPersists: boolean;
  feedback: string | null;
}): {
  label: string;
  tone: "info" | "warning" | "success";
} | null;

export function localRouterRecoveryButtonLabel(copy: {
  refreshingIndex: boolean;
  refreshingPreview: boolean;
}): string;

export function localRouterPreviewFreshnessBadge(copy: {
  previewFreshnessMeta: string | null;
  lastPreviewRefreshKind?: "preview_only" | "with_index" | null;
}): {
  label: string;
  tone: "warning" | "success";
} | null;

export function localRouterPreviewFreshnessState(copy: {
  previewFreshnessMeta: string | null;
  canRerunPreview: boolean;
  lastPreviewRefreshKind?: "preview_only" | "with_index" | null;
  lastPreviewRefreshAt?: string | null;
  now?: string | null;
}): {
  freshnessBadge: { label: string; tone: "warning" | "success" } | null;
  refreshRecencyBadge: { label: string; tone: "success" } | null;
  refreshAction: { label: string; tone: "warning" | "info" } | null;
  recoveryMeta: string | null;
};

export function localRouterPreviewRefreshCooldownActive(copy: {
  lastPreviewRefreshKind?: "preview_only" | "with_index" | null;
  lastPreviewRefreshAt?: string | null;
  now?: string | null;
}): boolean;

export function localRouterPreviewRefreshAction(copy: {
  canRerunPreview: boolean;
  previewFreshnessBadge: { label: string; tone: "warning" | "success" } | null;
  lastPreviewRefreshKind?: "preview_only" | "with_index" | null;
  lastPreviewRefreshAt?: string | null;
  now?: string | null;
}): {
  label: string;
  tone: "warning" | "info";
} | null;

export function localRouterPreviewRefreshRecencyBadge(copy: {
  lastPreviewRefreshKind?: "preview_only" | "with_index" | null;
  lastPreviewRefreshAt?: string | null;
  now?: string | null;
}): {
  label: string;
  tone: "success";
} | null;

export function localRouterStatusSectionPresence(copy: {
  capabilityBadges: string[];
  executionBadges: string[];
  projectionBadges: Array<unknown>;
  projectionDetail: string | null;
  projectionMeta: string | null;
  previewFreshnessMeta: string | null;
  previewFreshnessBadge: { label: string; tone: string } | null;
  previewRefreshRecencyBadge: { label: string; tone: string } | null;
  previewRefreshAction: { label: string; tone: string } | null;
  projectionRecommendation: string | null;
  skipBadges: string[];
  densityBadges: string[];
  budgetDetail: string | null;
  budgetBadges: string[];
}): {
  showCapabilityBadges: boolean;
  showExecutionBadges: boolean;
  showProjectionBadges: boolean;
  showProjectionDetail: boolean;
  showProjectionMeta: boolean;
  showPreviewFreshnessMeta: boolean;
  showPreviewFreshnessBadge: boolean;
  showPreviewRefreshRecencyBadge: boolean;
  showPreviewRefreshAction: boolean;
  showProjectionRecommendation: boolean;
  showSkipBadges: boolean;
  showDensityBadges: boolean;
  showBudgetDetail: boolean;
  showBudgetBadges: boolean;
};

export function localRouterRecoveryMeta(copy: {
  lastPreviewRefreshAt: string | null;
  lastPreviewRefreshKind?: "preview_only" | "with_index" | null;
  now?: string | null;
}): string | null;

export function localRouterProjectionMeta(copy: {
  refreshedAt: string | null;
  sourceMessageCount: number;
}): string | null;

export function localRouterPreviewFreshnessMeta(copy: {
  indexRefreshedAt: string | null;
  lastPreviewRefreshAt: string | null;
}): string | null;
