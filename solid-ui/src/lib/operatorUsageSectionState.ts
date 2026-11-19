// @locs-version: 1.0
import type {
  OperatorRuntimeRemediationReceipt,
  OperatorProfitAdminSummary,
  OperatorRuntimeRemediationHistoryResponse,
  OperatorUserDetail,
  OperatorUsersResponse,
} from "@/lib/api";
import { readBillingOperationalGuidanceCard } from "@/lib/billingOperationalGuidanceState";
import {
  readOperatorLoadFailureCard,
  readOperatorOperationalGuidanceCardModel,
  readOperatorOverviewCardModels,
  readOperatorSessionCardModel,
  readOperatorSupportAccessCardModel,
  readOperatorTopWorkflowSummary,
  readSupportAccessHistoryHeading,
  readTimestampSummaryLine,
} from "@/lib/operatorAdminPresentationState";
import {
  countRuntimeRemediationDraftReceipts,
  readFeaturedRuntimeRemediationSectionModel,
  readFeaturedRuntimeRemediationCardModel,
  readRuntimeRemediationExecutionModeLabel,
  readRuntimeRemediationFeedRow,
  readRuntimeRemediationFilterForReceipt,
  readRuntimeRemediationHistoryPanelModel,
  readRuntimeRemediationLifecycleLabel,
  readRuntimeRemediationRowModel,
  runtimeRemediationReceiptsShareId,
  selectFeaturedRuntimeRemediationReceipt,
  sortOperatorRuntimeRemediationEntries,
  filterOperatorRuntimeRemediationEntries,
  prioritizeRuntimeRemediationEntriesWithDrafts,
} from "@/lib/operatorRuntimeRemediationViewState";
import { readRuntimeRemediationReceiptMetaLine } from "@/lib/usageViewFormattingState";
import type { UsageFeaturedRuntimeRemediationCardProps } from "@/components/UsageFeaturedRuntimeRemediationCard";
import type { UsageOperatorMetricsGridProps } from "@/components/UsageOperatorMetricsGrid";
import type { UsageOperatorOverviewSectionProps } from "@/components/UsageOperatorOverviewSection";
import type { UsageOperatorProfitabilityPanelProps } from "@/components/UsageOperatorProfitabilityPanel";
import type { UsageOperatorUserDetailPanelProps } from "@/components/UsageOperatorUserDetailPanel";
import type { UsageOperatorUserFilterFormProps } from "@/components/UsageOperatorUserFilterForm";
import type { UsageOperatorUserSummaryPanelProps } from "@/components/UsageOperatorUserSummaryPanel";
import type { UsageAdminWeddingOpsPanelProps } from "@/components/UsageAdminWeddingOpsPanel";
import type { UsageRuntimeRemediationFeedProps } from "@/components/UsageRuntimeRemediationFeed";
import type { UsageRuntimeRemediationHistoryPanelProps } from "@/components/UsageRuntimeRemediationHistoryPanel";

export function readOperatorDerivedState(args: {
  hasSessionToken: boolean;
  usersLoading: boolean;
  profitLoading: boolean;
  remediationHistoryLoading: boolean;
  usersValue: OperatorUsersResponse | null | undefined;
  profitValue: OperatorProfitAdminSummary | null | undefined;
  remediationHistoryValue: OperatorRuntimeRemediationHistoryResponse | null | undefined;
  usersError: unknown;
  profitError: unknown;
  remediationHistoryError: unknown;
  formatMoneyLabel: (amount: number | null | undefined) => string;
  formatArtifactSummary: (args: { generatedAt?: string | null | undefined; source?: string | null | undefined }) => string | null;
  runtimeRemediationBusy: boolean;
}) {
  const operatorUsersList = args.usersValue?.users ?? [];
  const operatorProfitUsers = args.profitValue?.users ?? [];
  const operatorWorkflowRows = args.profitValue?.by_workflow ?? [];
  const operatorDailyCostRows = args.profitValue?.daily_cost ?? [];
  const operatorOperationalGuidanceCard = readBillingOperationalGuidanceCard({
    operational_guidance: args.profitValue?.operational_guidance,
  });
  const operatorSectionVisible = args.hasSessionToken
    && (
      args.usersValue != null
      || args.profitValue != null
      || args.remediationHistoryValue != null
    );
  const operatorLoadError = args.usersError ?? args.profitError ?? args.remediationHistoryError ?? null;
  const operatorMonthlyCost = operatorProfitUsers.reduce((sum, row) => sum + row.cost_usd, 0);
  const operatorMonthlyRevenue = operatorProfitUsers.reduce((sum, row) => sum + row.revenue_usd, 0);
  const operatorMonthlyMargin = operatorProfitUsers.reduce((sum, row) => sum + row.margin_usd, 0);
  const operatorLatestDailyCost = operatorDailyCostRows[0] ?? null;
  const operatorTopWorkflow = operatorWorkflowRows[0] ?? null;

  return {
    operatorUsersValue: args.usersValue ?? null,
    operatorUsersList,
    operatorProfitUsers,
    operatorWorkflowRows,
    operatorDailyCostRows,
    operatorOperationalGuidanceCard,
    operatorSectionVisible,
    operatorLoadError,
    operatorTopWorkflowSummary: readOperatorTopWorkflowSummary({
      workflowId: operatorTopWorkflow?.workflow_id,
      costLabel: args.formatMoneyLabel(operatorTopWorkflow?.cost_usd ?? 0),
      eventCount: operatorTopWorkflow?.events,
    }),
    operatorOperationalGuidanceViewModel: readOperatorOperationalGuidanceCardModel({
      title: operatorOperationalGuidanceCard?.title,
      detail: operatorOperationalGuidanceCard?.detail,
      tone: operatorOperationalGuidanceCard?.tone,
      command: operatorOperationalGuidanceCard?.command,
      artifactSummary: args.formatArtifactSummary({
        generatedAt: operatorOperationalGuidanceCard?.generatedAt,
        source: operatorOperationalGuidanceCard?.source,
      }),
      issueReceiptBusy: args.runtimeRemediationBusy,
    }),
    operatorOverviewCardModels: readOperatorOverviewCardModels({
      userRowCount: operatorUsersList.length,
      monthlyCostLabel: args.formatMoneyLabel(operatorMonthlyCost),
      monthlyMarginLabel: args.formatMoneyLabel(operatorMonthlyMargin),
      monthlyRevenueLabel: args.formatMoneyLabel(operatorMonthlyRevenue),
      latestDailyCostLabel: args.formatMoneyLabel(operatorLatestDailyCost?.cost_usd ?? 0),
      latestDailyCostDayLabel: operatorLatestDailyCost?.day,
    }),
    operatorLoadFailureCard: operatorLoadError ? readOperatorLoadFailureCard(operatorLoadError) : null,
  };
}

export function readOperatorRuntimeRemediationDerivedState(args: {
  history: OperatorRuntimeRemediationHistoryResponse | null | undefined;
  activeReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
  pinnedReceiptId: string | null | undefined;
  currentFilter: UsageRuntimeRemediationHistoryPanelProps["currentFilter"];
  outcomeNotes: Readonly<Record<string, string>>;
  proofReferences: Readonly<Record<string, string>>;
  completionBusyReceiptId: string | null | undefined;
}) {
  const entries = sortOperatorRuntimeRemediationEntries(args.history?.entries ?? []);
  const openEntries = filterOperatorRuntimeRemediationEntries(entries, "open");
  const completedEntries = filterOperatorRuntimeRemediationEntries(entries, "completed");
  const draftEntries = filterOperatorRuntimeRemediationEntries(entries, "drafts", {
    outcomeNotes: args.outcomeNotes,
    proofReferences: args.proofReferences,
  });
  const visibleEntries = prioritizeRuntimeRemediationEntriesWithDrafts({
    entries: filterOperatorRuntimeRemediationEntries(entries, args.currentFilter, {
      outcomeNotes: args.outcomeNotes,
      proofReferences: args.proofReferences,
    }),
    outcomeNotes: args.outcomeNotes,
    proofReferences: args.proofReferences,
  });
  const featuredReceipt = selectFeaturedRuntimeRemediationReceipt({
    activeReceipt: args.activeReceipt,
    pinnedReceiptId: args.pinnedReceiptId,
    entries,
    filter: args.currentFilter,
    outcomeNotes: args.outcomeNotes,
    proofReferences: args.proofReferences,
  });
  const featuredReceiptId = featuredReceipt?.receipt_id ?? null;
  const latestReceiptVisible = !args.activeReceipt?.receipt_id
    || visibleEntries.some((entry) => entry.receipt_id === args.activeReceipt?.receipt_id);
  const featuredReceiptVisible = !featuredReceiptId
    || runtimeRemediationReceiptsShareId(args.activeReceipt, featuredReceipt)
    || visibleEntries.some((entry) => entry.receipt_id === featuredReceiptId);

  return {
    entries,
    openEntries,
    completedEntries,
    draftEntries,
    visibleEntries,
    retention: args.history?.retention,
    featuredReceipt,
    featuredReceiptId,
    localDraftCount: countRuntimeRemediationDraftReceipts({
      outcomeNotes: args.outcomeNotes,
      proofReferences: args.proofReferences,
    }),
    featuredCardModel: readFeaturedRuntimeRemediationCardModel({
      featuredReceipt,
      latestReceipt: args.activeReceipt,
      pinnedReceiptId: args.pinnedReceiptId,
      outcomeNotes: args.outcomeNotes,
      proofReferences: args.proofReferences,
      completionBusyReceiptId: args.completionBusyReceiptId,
    }),
    historyPanelModel: readRuntimeRemediationHistoryPanelModel({
      openCount: openEntries.length,
      completedCount: completedEntries.length,
      draftCount: draftEntries.length,
      totalCount: entries.length,
      currentFilter: args.currentFilter,
      retention: args.history?.retention,
      latestReceipt: args.activeReceipt,
      featuredReceipt,
      latestReceiptVisible,
      featuredReceiptVisible,
      outcomeNotes: args.outcomeNotes,
      proofReferences: args.proofReferences,
    }),
    nextFilterForReceipt: (receipt: OperatorRuntimeRemediationReceipt | null | undefined) => readRuntimeRemediationFilterForReceipt({
      receipt,
      outcomeNotes: args.outcomeNotes,
      proofReferences: args.proofReferences,
    }),
  };
}

export function readOperatorOverviewSectionModel(
  args: Omit<UsageOperatorOverviewSectionProps, "onRefresh" | "onCopyCommand" | "onIssueReceipt">,
) {
  return args;
}

export function readOperatorHistoryPanelState(
  args: Omit<
    UsageRuntimeRemediationHistoryPanelProps,
    "onSelectFilter" | "onClearAllDrafts" | "onFocusLatest" | "onFocusFeatured"
  >,
) {
  return args;
}

export function readOperatorRemediationFeedState(
  args: Omit<
    UsageRuntimeRemediationFeedProps,
    "onIssueReceipt" | "onSelectFilter" | "onPinSummary" | "onCopyCommand" | "onOutcomeDraftChange"
    | "onProofDraftChange" | "onCompleteReceipt" | "onClearDraft"
  >,
) {
  return args;
}

export function readOperatorUserFilterFormModel(
  args: Omit<UsageOperatorUserFilterFormProps, "onQueryDraftChange" | "onSubmit" | "onKeyDown" | "onClear">,
) {
  return args;
}

export function readOperatorUserSummaryPanelModel(
  args: Omit<UsageOperatorUserSummaryPanelProps, "onInspectUser" | "onRunAction">,
) {
  return args;
}

export function readOperatorUserDetailPanelState(
  args: Omit<UsageOperatorUserDetailPanelProps, "onClose">,
) {
  return args;
}

export function readOperatorUserDetailCardModel(args: {
  detail: OperatorUserDetail | null | undefined;
  title: string;
  subtitle: string;
  loadingLabel: string;
  accountStatusToneClass: string;
  sessionsEmptyState: string;
  supportHistoryEmptyState: string;
  formatDateTimeLabel: (value: string | null | undefined) => string | null | undefined;
}) {
  const supportAccessCardModel = readOperatorSupportAccessCardModel({
    status: args.detail?.support_access?.status,
    accessScope: args.detail?.support_access?.access_scope,
  });

  return {
    title: args.title,
    subtitle: args.subtitle,
    loadingLabel: args.loadingLabel,
    authProviderLabel: args.detail?.auth_provider ?? "unknown",
    authJoinedSummary: readTimestampSummaryLine({
      prefix: "Joined",
      mountedLabel: args.formatDateTimeLabel(args.detail?.created_at),
      fallback: args.detail?.created_at,
    }),
    accountStatusLabel: args.detail?.account_status ?? "unknown",
    accountStatusToneClass: args.accountStatusToneClass,
    accountReasonLabel: args.detail?.account_status_reason ?? "No account-status reason recorded.",
    supportStatusLabel: supportAccessCardModel.statusLabel,
    supportScopeSummary: supportAccessCardModel.scopeSummary,
    sessions: (args.detail?.sessions ?? []).slice(0, 6).map((session) => {
      const sessionCardModel = readOperatorSessionCardModel({
        tokenPreview: session.token_preview,
        createdAtLabel: args.formatDateTimeLabel(session.created_at),
        createdAtFallback: session.created_at,
        expiresAtLabel: args.formatDateTimeLabel(session.expires_at),
        expiresAtFallback: session.expires_at,
      });
      return {
        tokenPreview: sessionCardModel.tokenPreview,
        createdSummary: sessionCardModel.createdSummary,
        expiresSummary: sessionCardModel.expiresSummary,
      };
    }),
    sessionsEmptyState: args.sessionsEmptyState,
    supportHistory: (args.detail?.support_access_history ?? []).slice(0, 6).map((entry) => ({
      heading: readSupportAccessHistoryHeading({
        status: entry.status,
        accessScope: entry.access_scope,
      }),
      grantedSummary: readTimestampSummaryLine({
        prefix: "Granted",
        mountedLabel: args.formatDateTimeLabel(entry.granted_at),
        fallback: entry.granted_at,
      }),
      expiresSummary: readTimestampSummaryLine({
        prefix: "Expires",
        mountedLabel: args.formatDateTimeLabel(entry.expires_at),
        fallback: entry.expires_at,
      }),
      reason: entry.reason ?? null,
    })),
    supportHistoryEmptyState: args.supportHistoryEmptyState,
  };
}

export function readOperatorRemediationFeedRows(args: {
  entries: OperatorRuntimeRemediationReceipt[];
  pinnedReceiptId: string | null | undefined;
  latestReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
  outcomeNotes: Record<string, string>;
  proofReferences: Record<string, string>;
  completionBusyReceiptId: string | null | undefined;
  formatDateTimeLabel: (value: string | null | undefined) => string | null | undefined;
  formatArtifactSummaryLine: (args: {
    artifactGeneratedAt: string | null | undefined;
    source: string | null | undefined;
  }) => string | null;
  formatPressureLine: (args: {
    pressureTotalRows: number | null | undefined;
    cleanupMode: string | null | undefined;
  }) => string | null;
}) {
  return args.entries.map((entry) => {
    const rowModel = readRuntimeRemediationRowModel({
      receipt: entry,
      pinnedReceiptId: args.pinnedReceiptId,
      latestReceipt: args.latestReceipt,
      outcomeNotes: args.outcomeNotes,
      proofReferences: args.proofReferences,
      completionBusyReceiptId: args.completionBusyReceiptId,
    });
    return readRuntimeRemediationFeedRow({
      entry,
      rowModel,
      receiptMetaLine: readRuntimeRemediationReceiptMetaLine({
        action: entry.action,
        issuedAtLabel: args.formatDateTimeLabel(entry.issued_at) ?? entry.issued_at,
      }),
      executionModeLabel: readRuntimeRemediationExecutionModeLabel(entry.execution_mode),
      artifactSummaryLine: args.formatArtifactSummaryLine({
        artifactGeneratedAt: entry.artifact_generated_at,
        source: entry.source,
      }),
      pressureLine: args.formatPressureLine({
        pressureTotalRows: entry.pressure_total_rows,
        cleanupMode: entry.cleanup_mode,
      }),
      completedAtLabel: entry.completed_at
        ? args.formatDateTimeLabel(entry.completed_at) ?? entry.completed_at
        : null,
      outcomeNoteDraft: args.outcomeNotes[entry.receipt_id] ?? "",
      proofReferenceDraft: args.proofReferences[entry.receipt_id] ?? "",
    });
  });
}

export function readOperatorFeaturedReceiptSection(args: {
  featuredReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
  cardModel: UsageFeaturedRuntimeRemediationCardProps["cardModel"] | null;
  formatDateTimeLabel: (value: string | null | undefined) => string | null | undefined;
}): Omit<UsageFeaturedRuntimeRemediationCardProps, "onAction" | "onDraftAction"> | null {
  if (!args.featuredReceipt || !args.cardModel) return null;
  return readFeaturedRuntimeRemediationSectionModel({
    featuredReceipt: args.featuredReceipt,
    cardModel: args.cardModel,
    issuedAtLabel: args.formatDateTimeLabel(args.featuredReceipt.issued_at) ?? args.featuredReceipt.issued_at,
    lifecycleLabel: readRuntimeRemediationLifecycleLabel(args.featuredReceipt?.lifecycle_status),
    completedAtLabel: args.featuredReceipt?.completed_at
      ? args.formatDateTimeLabel(args.featuredReceipt.completed_at) ?? args.featuredReceipt.completed_at
      : null,
  });
}

export function readOperatorProfitabilityPanelModel(
  args: UsageOperatorProfitabilityPanelProps,
) {
  return args;
}

export function readOperatorSectionModel(args: {
  overviewSection: Omit<UsageOperatorOverviewSectionProps, "onRefresh" | "onCopyCommand" | "onIssueReceipt">;
  featuredReceipt: Omit<UsageFeaturedRuntimeRemediationCardProps, "onAction" | "onDraftAction"> | null;
  historyPanel: Omit<
    UsageRuntimeRemediationHistoryPanelProps,
    "onSelectFilter" | "onClearAllDrafts" | "onFocusLatest" | "onFocusFeatured"
  >;
  remediationFeed: Omit<
    UsageRuntimeRemediationFeedProps,
    "onIssueReceipt" | "onSelectFilter" | "onPinSummary" | "onCopyCommand" | "onOutcomeDraftChange"
    | "onProofDraftChange" | "onCompleteReceipt" | "onClearDraft"
  >;
  metricsCards: UsageOperatorMetricsGridProps["cards"];
  adminWeddingOpsPanel: UsageAdminWeddingOpsPanelProps["state"];
  userFilterForm: Omit<UsageOperatorUserFilterFormProps, "onQueryDraftChange" | "onSubmit" | "onKeyDown" | "onClear">;
  userSummaryPanel: Omit<UsageOperatorUserSummaryPanelProps, "onInspectUser" | "onRunAction">;
  userDetailPanel: Omit<UsageOperatorUserDetailPanelProps, "onClose">;
  profitabilityPanel: UsageOperatorProfitabilityPanelProps;
}) {
  return args;
}
