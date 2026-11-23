import test from "node:test";
import assert from "node:assert/strict";

import {
  localRouterBroadRefreshRecommendation,
  localRouterForcedRefreshOutcomeLabel,
  localRouterPreviewFreshnessBadge,
  localRouterPreviewFreshnessState,
  localRouterPreviewRefreshCooldownActive,
  localRouterPreviewRefreshRecencyBadge,
  localRouterPreviewRefreshAction,
  localRouterPreviewFreshnessMeta,
  localRouterRecoveryButtonLabel,
  localRouterRecoveryFeedback,
  localRouterRecoveryMeta,
  localRouterRecoveryStatusBadge,
  localRouterProjectionMeta,
  localRouterStatusSectionPresence,
} from "../src/lib/localRouterCopy.js";

test("local router copy formats recovery feedback consistently", () => {
  assert.equal(
    localRouterRecoveryFeedback({
      available: true,
      refreshedPreview: true,
      warningCleared: true,
      reducedWarning: false,
      stillWarning: false,
    }),
    "Local index refreshed, preview reran, and warning state cleared.",
  );
  assert.equal(
    localRouterRecoveryFeedback({
      available: true,
      refreshedPreview: false,
      warningCleared: false,
      reducedWarning: false,
      stillWarning: true,
    }),
    "Local index refreshed, but broad refresh pressure remains.",
  );
  assert.equal(
    localRouterRecoveryFeedback({
      available: false,
      refreshedPreview: false,
      warningCleared: false,
      reducedWarning: false,
      stillWarning: false,
    }),
    "Local index is unavailable on this device.",
  );
});

test("local router copy formats forced refresh outcomes and broad-refresh recommendations", () => {
  assert.equal(
    localRouterForcedRefreshOutcomeLabel({ clearedWarning: true, reducedWarning: false }),
    "cleared warning state",
  );
  assert.equal(
    localRouterForcedRefreshOutcomeLabel({ clearedWarning: false, reducedWarning: true }),
    "reduced warning pressure",
  );
  assert.equal(
    localRouterForcedRefreshOutcomeLabel({ clearedWarning: false, reducedWarning: false }),
    "did not reduce warning pressure",
  );
  assert.equal(
    localRouterBroadRefreshRecommendation({
      lastChangedCount: 5,
      hadRecentPartialRecovery: false,
      recentManualRefreshFailed: true,
    }),
    "A recent manual local-index refresh did not reduce warning pressure. Re-sync the replica or inspect high-churn threads before relying on instant local previews.",
  );
  assert.equal(
    localRouterBroadRefreshRecommendation({
      lastChangedCount: 120,
      hadRecentPartialRecovery: false,
      recentManualRefreshFailed: false,
    }),
    "Local index refreshes are repeatedly broad. Let sync settle or narrow active workspace churn before relying on instant local previews.",
  );
});

test("local router copy formats compact recovery status badges", () => {
  assert.deepEqual(
    localRouterRecoveryStatusBadge({
      refreshingIndex: true,
      refreshingPreview: false,
      lastWarningPersists: false,
      feedback: null,
    }),
    { label: "Index refreshing", tone: "info" },
  );
  assert.deepEqual(
    localRouterRecoveryStatusBadge({
      refreshingIndex: false,
      refreshingPreview: true,
      lastWarningPersists: false,
      feedback: null,
    }),
    { label: "Preview rerunning", tone: "info" },
  );
  assert.deepEqual(
    localRouterRecoveryStatusBadge({
      refreshingIndex: false,
      refreshingPreview: false,
      lastWarningPersists: true,
      feedback: "Local index refreshed, but broad refresh pressure remains.",
    }),
    { label: "Warning persists", tone: "warning" },
  );
  assert.deepEqual(
    localRouterRecoveryStatusBadge({
      refreshingIndex: false,
      refreshingPreview: false,
      lastWarningPersists: false,
      feedback: "Local index refreshed, preview reran, and warning state cleared.",
    }),
    { label: "Recovered", tone: "success" },
  );
  assert.equal(
    localRouterRecoveryButtonLabel({
      refreshingIndex: true,
      refreshingPreview: false,
    }),
    "Refreshing local index...",
  );
  assert.equal(
    localRouterRecoveryButtonLabel({
      refreshingIndex: false,
      refreshingPreview: true,
    }),
    "Refreshing local preview...",
  );
  assert.equal(
    localRouterRecoveryButtonLabel({
      refreshingIndex: false,
      refreshingPreview: false,
    }),
    "Refresh local index",
  );
  assert.deepEqual(
    localRouterPreviewFreshnessBadge({
      previewFreshnessMeta: "Preview reflects the latest local index.",
      lastPreviewRefreshKind: "preview_only",
    }),
    { label: "Preview refreshed", tone: "success" },
  );
  assert.deepEqual(
    localRouterPreviewFreshnessBadge({
      previewFreshnessMeta: "Preview reflects the latest local index.",
      lastPreviewRefreshKind: "with_index",
    }),
    { label: "Preview current", tone: "success" },
  );
  assert.deepEqual(
    localRouterPreviewFreshnessBadge({
      previewFreshnessMeta: "Preview predates the latest local index refresh.",
    }),
    { label: "Preview stale", tone: "warning" },
  );
  assert.equal(localRouterPreviewFreshnessBadge({ previewFreshnessMeta: null }), null);
  assert.deepEqual(
    localRouterPreviewFreshnessState({
      previewFreshnessMeta: "Preview reflects the latest local index.",
      canRerunPreview: true,
      lastPreviewRefreshKind: "preview_only",
      lastPreviewRefreshAt: "2026-06-26T10:00:10.000Z",
      now: "2026-06-26T10:00:20.000Z",
    }),
    {
      freshnessBadge: { label: "Preview refreshed", tone: "success" },
      refreshRecencyBadge: { label: "Preview just refreshed", tone: "success" },
      refreshAction: null,
      recoveryMeta: "Preview reran just now.",
    },
  );
  assert.equal(
    localRouterPreviewRefreshCooldownActive({
      lastPreviewRefreshKind: "preview_only",
      lastPreviewRefreshAt: "2026-06-26T10:00:10.000Z",
      now: "2026-06-26T10:00:20.000Z",
    }),
    true,
  );
  assert.equal(
    localRouterPreviewRefreshCooldownActive({
      lastPreviewRefreshKind: "preview_only",
      lastPreviewRefreshAt: "2026-06-26T10:00:10.000Z",
      now: "2026-06-26T10:00:30.000Z",
    }),
    false,
  );
  assert.deepEqual(
    localRouterPreviewRefreshRecencyBadge({
      lastPreviewRefreshKind: "preview_only",
      lastPreviewRefreshAt: "2026-06-26T10:00:10.000Z",
      now: "2026-06-26T10:00:20.000Z",
    }),
    { label: "Preview just refreshed", tone: "success" },
  );
  assert.equal(
    localRouterPreviewRefreshRecencyBadge({
      lastPreviewRefreshKind: "preview_only",
      lastPreviewRefreshAt: "2026-06-26T10:00:10.000Z",
      now: "2026-06-26T10:00:30.000Z",
    }),
    null,
  );
  assert.deepEqual(
    localRouterPreviewRefreshAction({
      canRerunPreview: true,
      previewFreshnessBadge: { label: "Preview stale", tone: "warning" },
    }),
    { label: "Refresh preview", tone: "warning" },
  );
  assert.deepEqual(
    localRouterPreviewRefreshAction({
      canRerunPreview: true,
      previewFreshnessBadge: { label: "Preview current", tone: "success" },
      lastPreviewRefreshKind: "with_index",
    }),
    { label: "Refresh preview", tone: "info" },
  );
  assert.equal(
    localRouterPreviewRefreshAction({
      canRerunPreview: true,
      previewFreshnessBadge: { label: "Preview refreshed", tone: "success" },
      lastPreviewRefreshKind: "preview_only",
      lastPreviewRefreshAt: "2026-06-26T10:00:10.000Z",
      now: "2026-06-26T10:00:20.000Z",
    }),
    null,
  );
  assert.deepEqual(
    localRouterPreviewRefreshAction({
      canRerunPreview: true,
      previewFreshnessBadge: { label: "Preview refreshed", tone: "success" },
      lastPreviewRefreshKind: "preview_only",
      lastPreviewRefreshAt: "2026-06-26T10:00:10.000Z",
      now: "2026-06-26T10:00:30.000Z",
    }),
    { label: "Refresh preview", tone: "info" },
  );
  assert.equal(
    localRouterPreviewRefreshAction({
      canRerunPreview: false,
      previewFreshnessBadge: { label: "Preview current", tone: "success" },
    }),
    null,
  );
});

test("local router copy computes shared status stack section presence", () => {
  assert.deepEqual(
    localRouterStatusSectionPresence({
      capabilityBadges: ["Local index"],
      executionBadges: [],
      projectionBadges: [{ label: "Index refresh: partial", tone: "info" }],
      projectionDetail: "Last index refresh was partial.",
      projectionMeta: "Index refreshed 6/26/2026, 10:00:00 AM. 2 indexed rows.",
      previewFreshnessMeta: "Preview reflects the latest local index.",
      previewFreshnessBadge: { label: "Preview current", tone: "success" },
      previewRefreshRecencyBadge: { label: "Preview just refreshed", tone: "success" },
      previewRefreshAction: { label: "Refresh preview", tone: "info" },
      projectionRecommendation: null,
      skipBadges: [],
      densityBadges: ["2 local sources"],
      budgetDetail: null,
      budgetBadges: ["Latency cap reached"],
    }),
    {
      showCapabilityBadges: true,
      showExecutionBadges: false,
      showProjectionBadges: true,
      showProjectionDetail: true,
      showProjectionMeta: true,
      showPreviewFreshnessMeta: true,
      showPreviewFreshnessBadge: true,
      showPreviewRefreshRecencyBadge: true,
      showPreviewRefreshAction: true,
      showProjectionRecommendation: false,
      showSkipBadges: false,
      showDensityBadges: true,
      showBudgetDetail: false,
      showBudgetBadges: true,
    },
  );
  assert.equal(
    localRouterRecoveryMeta({
      lastPreviewRefreshAt: "2026-06-26T12:34:56.000Z",
      lastPreviewRefreshKind: "preview_only",
      now: "2026-06-26T12:35:05.000Z",
    }),
    "Preview reran just now.",
  );
  const previewMeta = localRouterRecoveryMeta({
    lastPreviewRefreshAt: "2026-06-26T12:34:56.000Z",
    lastPreviewRefreshKind: "preview_only",
    now: "2026-06-26T12:35:20.000Z",
  });
  assert.equal(typeof previewMeta, "string");
  assert.ok(previewMeta?.startsWith("Preview reran "));
  assert.equal(localRouterRecoveryMeta({ lastPreviewRefreshAt: null }), null);
  const projectionMeta = localRouterProjectionMeta({
    refreshedAt: "2026-06-26T10:00:00.000Z",
    sourceMessageCount: 2,
  });
  assert.equal(typeof projectionMeta, "string");
  assert.ok(projectionMeta?.startsWith("Index refreshed "));
  assert.ok(projectionMeta?.includes("2 indexed rows."));
  assert.equal(localRouterProjectionMeta({ refreshedAt: null, sourceMessageCount: 0 }), null);
  assert.equal(
    localRouterPreviewFreshnessMeta({
      indexRefreshedAt: "2026-06-26T10:00:00.000Z",
      lastPreviewRefreshAt: "2026-06-26T10:05:00.000Z",
    }),
    "Preview reflects the latest local index.",
  );
  assert.equal(
    localRouterPreviewFreshnessMeta({
      indexRefreshedAt: "2026-06-26T10:05:00.000Z",
      lastPreviewRefreshAt: "2026-06-26T10:00:00.000Z",
    }),
    "Preview predates the latest local index refresh.",
  );
  assert.equal(
    localRouterPreviewFreshnessMeta({
      indexRefreshedAt: null,
      lastPreviewRefreshAt: "2026-06-26T10:00:00.000Z",
    }),
    null,
  );
});
