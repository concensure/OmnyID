// @locs-version: 1.0
export function localRouterForcedRefreshOutcomeLabel(outcome) {
  if (outcome.clearedWarning) return "cleared warning state";
  if (outcome.reducedWarning) return "reduced warning pressure";
  return "did not reduce warning pressure";
}

export function localRouterRecoveryFeedback(copy) {
  if (!copy.available) {
    return "Local index is unavailable on this device.";
  }
  if (copy.warningCleared) {
    return copy.refreshedPreview
      ? "Local index refreshed, preview reran, and warning state cleared."
      : "Local index refreshed and warning state cleared.";
  }
  if (copy.reducedWarning) {
    return copy.refreshedPreview
      ? "Local index refreshed, preview reran, and warning pressure reduced."
      : "Local index refreshed and warning pressure reduced.";
  }
  if (copy.stillWarning) {
    return copy.refreshedPreview
      ? "Local index refreshed and preview reran, but broad refresh pressure remains."
      : "Local index refreshed, but broad refresh pressure remains.";
  }
  return copy.refreshedPreview ? "Local index and preview refreshed." : "Local index refreshed.";
}

export function localRouterBroadRefreshRecommendation(copy) {
  if (copy.recentManualRefreshFailed) {
    return "A recent manual local-index refresh did not reduce warning pressure. Re-sync the replica or inspect high-churn threads before relying on instant local previews.";
  }
  if (copy.lastChangedCount >= 100) {
    return "Local index refreshes are repeatedly broad. Let sync settle or narrow active workspace churn before relying on instant local previews.";
  }
  if (copy.hadRecentPartialRecovery) {
    return "Local index refreshes are repeatedly broad again after a recent partial recovery. Re-sync the replica or inspect high-churn threads before relying on instant local previews.";
  }
  return "Local index refreshes are repeatedly broad. If this persists, re-sync the replica or inspect high-churn threads before relying on instant local previews.";
}

export function localRouterRecoveryStatusBadge(copy) {
  if (copy.refreshingPreview) {
    return { label: "Preview rerunning", tone: "info" };
  }
  if (copy.refreshingIndex) {
    return { label: "Index refreshing", tone: "info" };
  }
  if (copy.lastWarningPersists) {
    return { label: "Warning persists", tone: "warning" };
  }
  if (copy.feedback === "Local index refresh failed.") {
    return { label: "Refresh failed", tone: "warning" };
  }
  if (copy.feedback === "Local index is unavailable on this device.") {
    return { label: "Index unavailable", tone: "warning" };
  }
  if (copy.feedback?.includes("warning state cleared")) {
    return { label: "Recovered", tone: "success" };
  }
  if (copy.feedback?.includes("Local index and preview refreshed.") || copy.feedback?.includes("Local index refreshed.")) {
    return { label: "Index refreshed", tone: "success" };
  }
  return null;
}

export function localRouterPreviewFreshnessBadge(copy) {
  if (!copy.previewFreshnessMeta) return null;
  if (copy.previewFreshnessMeta === "Preview predates the latest local index refresh.") {
    return { label: "Preview stale", tone: "warning" };
  }
  if (copy.previewFreshnessMeta === "Preview reflects the latest local index.") {
    if (copy.lastPreviewRefreshKind === "preview_only") {
      return { label: "Preview refreshed", tone: "success" };
    }
    return { label: "Preview current", tone: "success" };
  }
  return null;
}

export function localRouterPreviewFreshnessState(copy) {
  const freshnessBadge = localRouterPreviewFreshnessBadge({
    previewFreshnessMeta: copy.previewFreshnessMeta,
    lastPreviewRefreshKind: copy.lastPreviewRefreshKind,
  });
  const refreshRecencyBadge = localRouterPreviewRefreshRecencyBadge({
    lastPreviewRefreshKind: copy.lastPreviewRefreshKind,
    lastPreviewRefreshAt: copy.lastPreviewRefreshAt,
    now: copy.now,
  });
  const refreshAction = localRouterPreviewRefreshAction({
    canRerunPreview: copy.canRerunPreview,
    previewFreshnessBadge: freshnessBadge,
    lastPreviewRefreshKind: copy.lastPreviewRefreshKind,
    lastPreviewRefreshAt: copy.lastPreviewRefreshAt,
    now: copy.now,
  });
  const recoveryMeta = localRouterRecoveryMeta({
    lastPreviewRefreshAt: copy.lastPreviewRefreshAt,
    lastPreviewRefreshKind: copy.lastPreviewRefreshKind,
    now: copy.now,
  });
  return {
    freshnessBadge,
    refreshRecencyBadge,
    refreshAction,
    recoveryMeta,
  };
}

export function localRouterPreviewRefreshCooldownActive(copy) {
  if (
    copy.lastPreviewRefreshKind !== "preview_only"
    || !copy.lastPreviewRefreshAt
  ) {
    return false;
  }
  const lastPreviewRefreshAt = new Date(copy.lastPreviewRefreshAt);
  const now = copy.now ? new Date(copy.now) : new Date();
  if (
    Number.isNaN(lastPreviewRefreshAt.getTime())
    || Number.isNaN(now.getTime())
  ) {
    return false;
  }
  return (now.getTime() - lastPreviewRefreshAt.getTime()) < 15_000;
}

export function localRouterPreviewRefreshAction(copy) {
  if (!copy.canRerunPreview || !copy.previewFreshnessBadge) return null;
  if (localRouterPreviewRefreshCooldownActive(copy)) {
    return null;
  }
  return {
    label: "Refresh preview",
    tone: copy.previewFreshnessBadge.tone === "warning" ? "warning" : "info",
  };
}

export function localRouterPreviewRefreshRecencyBadge(copy) {
  if (!localRouterPreviewRefreshCooldownActive(copy)) {
    return null;
  }
  return { label: "Preview just refreshed", tone: "success" };
}

export function localRouterRecoveryButtonLabel(copy) {
  if (copy.refreshingPreview) return "Refreshing local preview...";
  if (copy.refreshingIndex) return "Refreshing local index...";
  return "Refresh local index";
}

export function localRouterStatusSectionPresence(copy) {
  return {
    showCapabilityBadges: copy.capabilityBadges.length > 0,
    showExecutionBadges: copy.executionBadges.length > 0,
    showProjectionBadges: copy.projectionBadges.length > 0,
    showProjectionDetail: Boolean(copy.projectionDetail),
    showProjectionMeta: Boolean(copy.projectionMeta),
    showPreviewFreshnessMeta: Boolean(copy.previewFreshnessMeta),
    showPreviewFreshnessBadge: Boolean(copy.previewFreshnessBadge),
    showPreviewRefreshRecencyBadge: Boolean(copy.previewRefreshRecencyBadge),
    showPreviewRefreshAction: Boolean(copy.previewRefreshAction),
    showProjectionRecommendation: Boolean(copy.projectionRecommendation),
    showSkipBadges: copy.skipBadges.length > 0,
    showDensityBadges: copy.densityBadges.length > 0,
    showBudgetDetail: Boolean(copy.budgetDetail),
    showBudgetBadges: copy.budgetBadges.length > 0,
  };
}

export function localRouterRecoveryMeta(copy) {
  if (!copy.lastPreviewRefreshAt) return null;
  const timestamp = new Date(copy.lastPreviewRefreshAt);
  if (Number.isNaN(timestamp.getTime())) return null;
  if (localRouterPreviewRefreshCooldownActive(copy)) {
    return "Preview reran just now.";
  }
  return `Preview reran ${timestamp.toLocaleString()}.`;
}

export function localRouterProjectionMeta(copy) {
  if (!copy.refreshedAt) return null;
  const timestamp = new Date(copy.refreshedAt);
  if (Number.isNaN(timestamp.getTime())) return null;
  return `Index refreshed ${timestamp.toLocaleString()}. ${copy.sourceMessageCount} indexed row${copy.sourceMessageCount === 1 ? "" : "s"}.`;
}

export function localRouterPreviewFreshnessMeta(copy) {
  if (!copy.indexRefreshedAt || !copy.lastPreviewRefreshAt) return null;
  const indexTimestamp = new Date(copy.indexRefreshedAt);
  const previewTimestamp = new Date(copy.lastPreviewRefreshAt);
  if (Number.isNaN(indexTimestamp.getTime()) || Number.isNaN(previewTimestamp.getTime())) return null;
  if (previewTimestamp.getTime() >= indexTimestamp.getTime()) {
    return "Preview reflects the latest local index.";
  }
  return "Preview predates the latest local index refresh.";
}
