import test from "node:test";
import assert from "node:assert/strict";

import {
  readUsageBillingSectionProps,
  readUsageOperatorSectionProps,
  readUsageViewOperatorMountedSectionProps,
} from "../src/lib/usageViewSectionPropsState.ts";

test("readUsageBillingSectionProps preserves the mounted billing section contract", () => {
  const props = {
    summaryCards: [],
    billingLoadWarning: null,
    operationalGuidance: null,
    onCopyOperationalCommand: () => {},
    modeError: null,
    billingActionError: null,
    upgradeNotice: null,
    operationalCommandNotice: null,
    storagePolicy: {
      storageTierLabel: "Free",
      quotaStateLabel: "Healthy",
      nextUpgradeLabel: "Pro",
      archiveOnlyToggleLabel: "Enable archive-only mode",
      archiveOnlyActiveLabel: "Archive-only mode disabled",
      archiveOnlyWarningText: null,
      showWarning: false,
      toggleDisabled: false,
      onToggle: () => {},
    },
    paymentSetup: {
      detail: "Stripe ready",
      identityCards: [],
      upgradePathHeadline: "Upgrade",
      upgradePathDetail: "Upgrade detail",
      manualRequestLabel: "Email support",
      canStartSelfServeCheckout: true,
      hasCheckoutAvailabilitySignal: true,
      upgradeMailtoHref: "mailto:test@example.com",
      checkoutButtonLabel: "Start checkout",
      copyButtonLabel: "Copy request",
      billingPortalHeadline: "Portal",
      billingPortalDetail: "Portal detail",
      billingPortalAvailable: true,
      portalButtonLabel: "Open portal",
      actionsDisabled: false,
      onStartCheckout: () => {},
      onCopyUpgradeRequest: () => {},
      onOpenBillingPortal: () => {},
    },
  } satisfies Parameters<typeof readUsageBillingSectionProps>[0];

  assert.equal(readUsageBillingSectionProps(props), props);
});

test("readUsageOperatorSectionProps preserves the mounted operator section contract", () => {
  const props = {
    onKeyDown: (_event: KeyboardEvent) => {},
    overviewSection: {
      shortcutsHint: "Alt+R issue cleanup receipt",
      intro: "Overview",
      refreshLabel: "Refresh",
      refreshDisabled: false,
      loadFailure: null,
      actionFailure: null,
      actionNotice: null,
      guidance: null,
      issueReceiptBusy: false,
    },
    onRefresh: () => {},
    onCopyOverviewCommand: (_command: string | null | undefined) => {},
    onIssueReceipt: () => {},
    featuredReceipt: null,
    onFeaturedAction: (_actionKind, _receiptId) => {},
    onFeaturedDraftAction: (_actionKind, _receiptId) => {},
    historyPanel: {
      panelModel: {
        historySummary: "0 open | 0 completed | 0 with drafts | 0 total",
        filterOptions: [],
        recoveryActions: [],
        retentionSummary: null,
        noticeStrip: {
          latestNotice: null,
          featuredNotice: null,
        },
      },
      currentFilter: "open",
      localDraftCount: 0,
      currentOpenCount: 0,
      currentCompletedCount: 0,
      currentDraftCount: 0,
      currentTotalCount: 0,
    },
    onSelectHistoryFilter: (_filter) => {},
    onClearAllDrafts: () => {},
    onFocusLatest: () => {},
    onFocusFeatured: () => {},
    remediationFeed: {
      rows: [],
      emptyMessage: "Empty",
      totalCount: 0,
      issueReceiptBusy: false,
      recoveryActions: [],
    },
    onPinSummary: (_receiptId) => {},
    onCopyFeedCommand: (_command) => {},
    adminWeddingOpsPanel: {
      title: "Admin wedding operations",
      intro: "Wedding ops",
      metrics: [],
      toggle: {
        enabled: false,
        label: "Route wedding template AI via admin API",
        statusLabel: "User-scoped by default",
        detail: "Wedding background only",
        warning: "Do not route Master Agent queries.",
      },
      guardrails: [],
    },
    onToggleWeddingAiRouting: (_enabled) => {},
    onOutcomeDraftChange: (_receiptId, _value) => {},
    onProofDraftChange: (_receiptId, _value) => {},
    onCompleteReceipt: (_receiptId) => {},
    onClearDraft: (_receiptId) => {},
    metricsCards: [],
    userFilterForm: {
      queryDraft: "",
      queryApplied: "",
      loading: false,
    },
    onUserFilterDraftChange: (_value) => {},
    onUserFilterSubmit: (_event) => {},
    onUserFilterKeyDown: (_event) => {},
    onClearUserFilter: () => {},
    userSummaryPanel: {
      queryLabel: "All users",
      rows: [],
      emptyState: "No users",
      loading: false,
      actionBusy: false,
    },
    onInspectUser: (_userId) => {},
    onRunUserAction: (_userId, _action) => {},
    userDetailPanel: {
      model: {
        title: "User detail",
        subtitle: "None selected",
        loadingLabel: "Loading",
        authProviderLabel: "Unknown",
        authJoinedSummary: "Joined unknown",
        accountStatusLabel: "Unknown",
        accountStatusToneClass: "text-slate-500",
        accountReasonLabel: "No reason",
        supportStatusLabel: "Unknown",
        supportScopeSummary: "No scope",
        sessions: [],
        sessionsEmptyState: "No sessions",
        supportHistory: [],
        supportHistoryEmptyState: "No support history",
      },
      open: false,
      hasDetail: false,
    },
    onCloseUserDetail: () => {},
    profitabilityPanel: {
      workflowLabel: "Top workflow",
      workflowDetail: "None",
      rows: [],
      emptyState: "No profitability data",
      loading: false,
    },
  } satisfies Parameters<typeof readUsageOperatorSectionProps>[0];

  assert.equal(readUsageOperatorSectionProps(props), props);
});

test("readUsageViewOperatorMountedSectionProps assembles operator handlers around the mounted section model", () => {
  const onKeyDown = (_event: KeyboardEvent) => {};
  const onRefresh = () => {};
  const onCopyOverviewCommand = (_command: string | null | undefined) => {};
  const onIssueReceipt = () => {};
  const onFeaturedAction = (_actionKind: "show_queue" | "copy_command" | "clear_summary_pin", _receiptId: string | null) => {};
  const onFeaturedDraftAction = (_actionKind: "complete_from_draft" | "show_drafts" | "clear_local_draft", _receiptId: string | null) => {};
  const onSelectHistoryFilter = (_filter: "open" | "completed" | "drafts" | "all") => {};
  const onClearAllDrafts = () => {};
  const onFocusLatest = () => {};
  const onFocusFeatured = () => {};
  const onPinSummary = (_receiptId: string | null) => {};
  const onCopyFeedCommand = (_command: string | null | undefined) => {};
  const onToggleWeddingAiRouting = (_enabled: boolean) => {};
  const onOutcomeDraftChange = (_receiptId: string, _value: string) => {};
  const onProofDraftChange = (_receiptId: string, _value: string) => {};
  const onCompleteReceipt = (_receiptId: string) => {};
  const onClearDraft = (_receiptId: string) => {};
  const onUserFilterDraftChange = (_value: string) => {};
  const onUserFilterSubmit = (_event: Event) => {};
  const onUserFilterKeyDown = (_event: KeyboardEvent) => {};
  const onClearUserFilter = () => {};
  const onInspectUser = (_userId: string) => {};
  const onRunUserAction = (_userId: string, _action: "revoke_all_sessions" | "revoke_support_access" | "suspend_account" | "reactivate_account") => {};
  const onCloseUserDetail = () => {};

  const props = readUsageViewOperatorMountedSectionProps({
    operatorSectionModel: {
      overviewSection: {
        shortcutsHint: "Alt+R issue cleanup receipt",
        intro: "Overview",
        refreshLabel: "Refresh",
        refreshDisabled: false,
        loadFailure: null,
        actionFailure: null,
        actionNotice: null,
        guidance: null,
        issueReceiptBusy: false,
      },
      featuredReceipt: null,
      historyPanel: {
        panelModel: {
          historySummary: "0 open | 0 completed | 0 with drafts | 0 total",
          filterOptions: [],
          recoveryActions: [],
          retentionSummary: null,
          noticeStrip: {
            latestNotice: null,
            featuredNotice: null,
          },
        },
        currentFilter: "open",
        localDraftCount: 0,
        currentOpenCount: 0,
        currentCompletedCount: 0,
        currentDraftCount: 0,
        currentTotalCount: 0,
      },
      remediationFeed: {
        rows: [],
        emptyMessage: "Empty",
        totalCount: 0,
        issueReceiptBusy: false,
        recoveryActions: [],
      },
      adminWeddingOpsPanel: {
        title: "Admin wedding operations",
        intro: "Wedding ops",
        metrics: [],
        toggle: {
          enabled: false,
          label: "Route wedding template AI via admin API",
          statusLabel: "User-scoped by default",
          detail: "Wedding background only",
          warning: "Do not route Master Agent queries.",
        },
        guardrails: [],
      },
      metricsCards: [],
      userFilterForm: {
        queryDraft: "",
        queryApplied: "",
        loading: false,
      },
      userSummaryPanel: {
        queryLabel: "All users",
        rows: [],
        emptyState: "No users",
        loading: false,
        actionBusy: false,
      },
      userDetailPanel: {
        model: {
          title: "User detail",
          subtitle: "None selected",
          loadingLabel: "Loading",
          authProviderLabel: "Unknown",
          authJoinedSummary: "Joined unknown",
          accountStatusLabel: "Unknown",
          accountStatusToneClass: "text-slate-500",
          accountReasonLabel: "No reason",
          supportStatusLabel: "Unknown",
          supportScopeSummary: "No scope",
          sessions: [],
          sessionsEmptyState: "No sessions",
          supportHistory: [],
          supportHistoryEmptyState: "No support history",
        },
        open: false,
        hasDetail: false,
      },
      profitabilityPanel: {
        workflowLabel: "Top workflow",
        workflowDetail: "None",
        rows: [],
        emptyState: "No profitability data",
        loading: false,
      },
    },
    onKeyDown,
    onRefresh,
    onCopyOverviewCommand,
    onIssueReceipt,
    onFeaturedAction,
    onFeaturedDraftAction,
    onSelectHistoryFilter,
    onClearAllDrafts,
    onFocusLatest,
    onFocusFeatured,
    onPinSummary,
    onCopyFeedCommand,
    onToggleWeddingAiRouting,
    onOutcomeDraftChange,
    onProofDraftChange,
    onCompleteReceipt,
    onClearDraft,
    onUserFilterDraftChange,
    onUserFilterSubmit,
    onUserFilterKeyDown,
    onClearUserFilter,
    onInspectUser,
    onRunUserAction,
    onCloseUserDetail,
  });

  assert.equal(props.onKeyDown, onKeyDown);
  assert.equal(props.onRefresh, onRefresh);
  assert.equal(props.onCopyOverviewCommand, onCopyOverviewCommand);
  assert.equal(props.onIssueReceipt, onIssueReceipt);
  assert.equal(props.onFeaturedAction, onFeaturedAction);
  assert.equal(props.onFeaturedDraftAction, onFeaturedDraftAction);
  assert.equal(props.onSelectHistoryFilter, onSelectHistoryFilter);
  assert.equal(props.onClearAllDrafts, onClearAllDrafts);
  assert.equal(props.onFocusLatest, onFocusLatest);
  assert.equal(props.onFocusFeatured, onFocusFeatured);
  assert.equal(props.onPinSummary, onPinSummary);
  assert.equal(props.onCopyFeedCommand, onCopyFeedCommand);
  assert.equal(props.onToggleWeddingAiRouting, onToggleWeddingAiRouting);
  assert.equal(props.onOutcomeDraftChange, onOutcomeDraftChange);
  assert.equal(props.onProofDraftChange, onProofDraftChange);
  assert.equal(props.onCompleteReceipt, onCompleteReceipt);
  assert.equal(props.onClearDraft, onClearDraft);
  assert.equal(props.onUserFilterDraftChange, onUserFilterDraftChange);
  assert.equal(props.onUserFilterSubmit, onUserFilterSubmit);
  assert.equal(props.onUserFilterKeyDown, onUserFilterKeyDown);
  assert.equal(props.onClearUserFilter, onClearUserFilter);
  assert.equal(props.onInspectUser, onInspectUser);
  assert.equal(props.onRunUserAction, onRunUserAction);
  assert.equal(props.onCloseUserDetail, onCloseUserDetail);
  assert.equal(props.overviewSection.refreshLabel, "Refresh");
  assert.equal(props.historyPanel.currentFilter, "open");
  assert.equal(props.profitabilityPanel.workflowLabel, "Top workflow");
});
