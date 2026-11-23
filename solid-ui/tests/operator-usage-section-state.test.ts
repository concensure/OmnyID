import assert from "node:assert/strict";
import test from "node:test";

import {
  readOperatorDerivedState,
  readOperatorFeaturedReceiptSection,
  readOperatorHistoryPanelState,
  readOperatorOverviewSectionModel,
  readOperatorProfitabilityPanelModel,
  readOperatorRuntimeRemediationDerivedState,
  readOperatorRemediationFeedRows,
  readOperatorRemediationFeedState,
  readOperatorSectionModel,
  readOperatorUserDetailCardModel,
  readOperatorUserDetailPanelState,
  readOperatorUserFilterFormModel,
  readOperatorUserSummaryPanelModel,
} from "../src/lib/operatorUsageSectionState.ts";

test("operator derived state centralizes visibility, profitability rollups, and guidance", () => {
  const derived = readOperatorDerivedState({
    hasSessionToken: true,
    usersLoading: false,
    profitLoading: false,
    remediationHistoryLoading: false,
    usersValue: {
      users: [{ user_id: "usr_123" }, { user_id: "usr_456" }],
      query: "pro",
    },
    profitValue: {
      users: [{
        cost_usd: 12.5,
        revenue_usd: 40,
        margin_usd: 27.5,
      }],
      by_workflow: [{
        workflow_id: "wf_123",
        cost_usd: 12.5,
        events: 3,
      }],
      daily_cost: [{
        day: "2026-08-31",
        cost_usd: 4.2,
      }],
      operational_guidance: {
        status: "no_go",
        summary: "Archive backlog exceeded threshold.",
        command: "./cleanup.ps1",
        pressure_status: "threshold_exceeded",
        pressure_total_rows: 1200,
        cleanup_mode: "archive_only",
        generated_at: "2026-08-31T10:00:00Z",
        source: "daemon_heartbeats",
      },
    },
    remediationHistoryValue: { entries: [] },
    usersError: null,
    profitError: null,
    remediationHistoryError: null,
    formatMoneyLabel: (amount) => `$${Number(amount ?? 0).toFixed(2)}`,
    formatArtifactSummary: ({ generatedAt, source }) => `${generatedAt} | ${source}`,
    runtimeRemediationBusy: false,
  });

  assert.equal(derived.operatorSectionVisible, true);
  assert.equal(derived.operatorUsersList.length, 2);
  assert.equal(derived.operatorProfitUsers.length, 1);
  assert.equal(derived.operatorTopWorkflowSummary.workflowLabel, "wf_123");
  assert.equal(derived.operatorTopWorkflowSummary.detail, "$12.50 across 3 events");
  assert.equal(derived.operatorOverviewCardModels.length, 4);
  assert.equal(derived.operatorOverviewCardModels[0]?.value, "2");
  assert.equal(derived.operatorLoadFailureCard, null);
  assert.equal(derived.operatorOperationalGuidanceCard?.title, "Operational cleanup required");
  assert.equal(derived.operatorOperationalGuidanceViewModel.command, "./cleanup.ps1");
  assert.equal(derived.operatorOperationalGuidanceViewModel.artifactSummary, "2026-08-31T10:00:00Z | daemon_heartbeats");
});

test("operator runtime remediation derived state centralizes selection, filtering, and history panel counts", () => {
  const derived = readOperatorRuntimeRemediationDerivedState({
    history: {
      entries: [{
        receipt_id: "receipt-open",
        action: "archive_backlog",
        lifecycle_status: "open",
        execution_mode: "manual",
        issued_at: "2026-08-31T10:00:00Z",
        completed_at: null,
        command: "./cleanup-open.ps1",
        source: "daemon_heartbeats",
        artifact_generated_at: null,
        pressure_total_rows: 100,
        cleanup_mode: "archive_only",
        approval_status: "not_required",
      }, {
        receipt_id: "receipt-completed",
        action: "archive_backlog",
        lifecycle_status: "completed",
        execution_mode: "manual",
        issued_at: "2026-08-30T10:00:00Z",
        completed_at: "2026-08-30T11:00:00Z",
        command: "./cleanup-done.ps1",
        source: "daemon_heartbeats",
        artifact_generated_at: null,
        pressure_total_rows: null,
        cleanup_mode: null,
        approval_status: "not_required",
      }],
      retention: {
        max_receipts_per_operator: 100,
        max_age_days: 30,
        rollover_behavior: "oldest_pruned_first",
      },
    },
    activeReceipt: null,
    pinnedReceiptId: null,
    currentFilter: "open",
    outcomeNotes: {},
    proofReferences: {},
    completionBusyReceiptId: null,
  });

  assert.equal(derived.entries.length, 2);
  assert.equal(derived.openEntries.length, 1);
  assert.equal(derived.completedEntries.length, 1);
  assert.equal(derived.draftEntries.length, 0);
  assert.equal(derived.visibleEntries.length, 1);
  assert.equal(derived.featuredReceipt?.receipt_id, "receipt-open");
  assert.equal(derived.featuredReceiptId, "receipt-open");
  assert.equal(derived.localDraftCount, 0);
  assert.match(derived.historyPanelModel.historySummary, /1 open/);
  assert.equal(derived.nextFilterForReceipt(derived.featuredReceipt), "open");
});

test("operator detail and remediation builders centralize panel and feed mapping", () => {
  const detailModel = readOperatorUserDetailCardModel({
    detail: {
      user_id: "usr_123",
      email: "ada@example.com",
      display_name: "Ada",
      auth_provider: "google",
      created_at: "2026-08-01T00:00:00Z",
      account_status: "active",
      account_status_reason: null,
      email_verified: true,
      support_access: {
        status: "enabled",
        access_scope: "runtime_metadata_only",
        expires_at: null,
      },
      sessions: [{
        token_preview: "tok_123",
        created_at: "2026-08-02T00:00:00Z",
        expires_at: "2026-09-02T00:00:00Z",
      }],
      support_access_history: [{
        status: "enabled",
        access_scope: "runtime_metadata_only",
        granted_at: "2026-08-02T00:00:00Z",
        expires_at: "2026-09-02T00:00:00Z",
        reason: "Support investigation",
      }],
    },
    title: "ada@example.com",
    subtitle: "Ada",
    loadingLabel: "Loading user detail...",
    accountStatusToneClass: "text-emerald-700",
    sessionsEmptyState: "No active sessions remain for this user.",
    supportHistoryEmptyState: "No support access grants have been recorded for this user.",
    formatDateTimeLabel: (value) => value,
  });

  assert.equal(detailModel.authProviderLabel, "google");
  assert.equal(detailModel.accountStatusLabel, "active");
  assert.equal(detailModel.accountReasonLabel, "No account-status reason recorded.");
  assert.equal(detailModel.sessions.length, 1);
  assert.equal(detailModel.supportHistory.length, 1);

  const feedRows = readOperatorRemediationFeedRows({
    entries: [{
      receipt_id: "receipt-1",
      action: "archive_backlog",
      lifecycle_status: "open",
      execution_mode: "manual",
      issued_at: "2026-08-31T10:00:00Z",
      completed_at: null,
      command: "./cleanup.ps1",
      source: "daemon_heartbeats",
      artifact_generated_at: "2026-08-31T10:00:00Z",
      pressure_total_rows: 1200,
      cleanup_mode: "archive_only",
      approval_status: "not_required",
    }],
    pinnedReceiptId: null,
    latestReceipt: null,
    outcomeNotes: {},
    proofReferences: {},
    completionBusyReceiptId: null,
    formatDateTimeLabel: (value) => value,
    formatArtifactSummaryLine: ({ artifactGeneratedAt, source }) => `${artifactGeneratedAt} | ${source}`,
    formatPressureLine: ({ pressureTotalRows, cleanupMode }) => `${pressureTotalRows} | ${cleanupMode}`,
  });

  assert.equal(feedRows.length, 1);
  assert.equal(feedRows[0]?.receiptMetaLine, "archive backlog | 2026-08-31T10:00:00Z");
  assert.equal(feedRows[0]?.artifactSummaryLine, "2026-08-31T10:00:00Z | daemon_heartbeats");
  assert.equal(feedRows[0]?.pressureLine, "1200 | archive_only");

  const featured = readOperatorFeaturedReceiptSection({
    featuredReceipt: {
      receipt_id: "receipt-1",
      action: "archive_backlog",
      lifecycle_status: "open",
      execution_mode: "manual",
      issued_at: "2026-08-31T10:00:00Z",
      completed_at: null,
      command: "./cleanup.ps1",
      source: "daemon_heartbeats",
      artifact_generated_at: null,
      pressure_total_rows: null,
      cleanup_mode: null,
      approval_status: "not_required",
    },
    cardModel: {
      receiptId: "receipt-1",
      outcomeDraft: "",
      proofDraft: "",
      hasLocalDraft: false,
      heading: "Open receipt",
      sourceLabel: "Latest",
      approvalLabel: "No approval required",
      localDraftBadgeLabel: "Local draft saved",
      receiptSectionTitle: "Receipt",
      lifecycleSectionTitle: "Lifecycle",
      completionSectionTitle: "Completion",
      localDraftSectionTitle: "Local draft",
      proofLabelPrefix: "Proof:",
      draftActions: [],
      actions: [],
    },
    formatDateTimeLabel: (value) => value,
  });

  assert.equal(featured?.issuedAtLabel, "2026-08-31T10:00:00Z");
});

test("operator usage section builders preserve the mounted section contracts", () => {
  const overviewSection = readOperatorOverviewSectionModel({
    shortcutsHint: "Alt+I issue receipt",
    intro: "Operator-only overview",
    refreshLabel: "Reload operator data",
    refreshDisabled: false,
    loadFailure: null,
    actionFailure: null,
    actionNotice: "Cleanup receipt issued.",
    guidance: {
      title: "Operational guidance active",
      detail: "Archive backlog exceeded threshold.",
      tone: "warning",
      artifactSummary: "Updated 8/31/2026 | daemon_heartbeats",
      command: "./cleanup.ps1",
      copyCommandLabel: "Copy cleanup command",
      issueReceiptLabel: "Issue cleanup receipt",
    },
    issueReceiptBusy: false,
  });
  const historyPanel = readOperatorHistoryPanelState({
    panelModel: {
      title: "Receipt history",
      summary: "2 open | 1 completed | 1 with drafts | 3 total",
      retention: {
        windowLabel: "30 day window",
        rowCapLabel: "Up to 100 receipts per operator",
        rolloverLabel: "oldest receipts pruned first",
      },
      filters: [
        { filter: "open", label: "Open", count: 2, selected: true },
        { filter: "completed", label: "Completed", count: 1, selected: false },
      ],
      noticeStrip: {
        latestNotice: null,
        featuredNotice: null,
      },
      recoveryActions: [{ filter: "all", label: "Show all receipts" }],
    },
    currentFilter: "open",
    localDraftCount: 1,
    currentOpenCount: 2,
    currentCompletedCount: 1,
    currentDraftCount: 1,
    currentTotalCount: 3,
  });
  const remediationFeed = readOperatorRemediationFeedState({
    rows: [{ receiptId: "receipt-1" }],
    emptyMessage: "No receipts match the current filter.",
    totalCount: 3,
    issueReceiptBusy: false,
    recoveryActions: [{ filter: "open", label: "Show open receipts" }],
  });
  const userFilterForm = readOperatorUserFilterFormModel({
    queryDraft: "pro",
    queryApplied: "pro",
    loading: false,
  });
  const userSummaryPanel = readOperatorUserSummaryPanelModel({
    queryLabel: 'Filtered by "pro"',
    rows: [{ userId: "usr_123" }],
    emptyState: "No operator user rows matched the current filter.",
    loading: false,
    actionBusy: false,
  });
  const userDetailPanel = readOperatorUserDetailPanelState({
    open: true,
    hasDetail: true,
    model: { title: "ada@example.com" },
  });
  const profitabilityPanel = readOperatorProfitabilityPanelModel({
    workflowLabel: "wf_123",
    workflowDetail: "$12.50 across 3 events",
    rows: [{ userId: "usr_123" }],
    emptyState: "No profitability rows are available for the current month.",
    loading: false,
  });

  assert.deepEqual(
    readOperatorSectionModel({
      overviewSection,
      featuredReceipt: { receiptId: "receipt-1" },
      historyPanel,
      remediationFeed,
      metricsCards: [{ title: "User rows", value: "3", detail: "Current bounded admin query result." }],
      userFilterForm,
      userSummaryPanel,
      userDetailPanel,
      profitabilityPanel,
    }),
    {
      overviewSection,
      featuredReceipt: { receiptId: "receipt-1" },
      historyPanel,
      remediationFeed,
      metricsCards: [{ title: "User rows", value: "3", detail: "Current bounded admin query result." }],
      userFilterForm,
      userSummaryPanel,
      userDetailPanel,
      profitabilityPanel,
    },
  );
});


test("operator panels wait for a successful authorized response", () => {
  for (const value of [undefined, null]) {
    const state = readOperatorDerivedState({
      hasSessionToken: true, usersLoading: value === undefined,
      profitLoading: value === undefined, remediationHistoryLoading: value === undefined,
      usersValue: value, profitValue: value, remediationHistoryValue: value,
      usersError: null, profitError: null, remediationHistoryError: null,
      formatMoneyLabel: () => "", formatArtifactSummary: () => null,
      runtimeRemediationBusy: false,
    });
    assert.equal(state.operatorSectionVisible, false);
  }
});
