// @locs-version: 1.0
import type {
  OperatorRuntimeRemediationReceipt,
  OperatorUserDetail,
} from "@/lib/api";
import {
  readOperatorActionFailureCard,
  readOperatorDetailHeader,
  readOperatorDetailLoadingState,
  readOperatorOverviewIntro,
  readOperatorProfitabilityEmptyState,
  readOperatorProfitabilityRow,
  readOperatorRefreshLabel,
  readOperatorSessionsEmptyState,
  readOperatorSupportAccessHistoryEmptyState,
  readOperatorUserDetailPanelModel as readOperatorUserDetailPanelViewModel,
  readOperatorUserRowModel,
  readOperatorUserSummaryEmptyState,
  readOperatorUserSummaryQueryLabel,
  readOperatorUserSummaryTableRow,
} from "@/lib/operatorAdminPresentationState";
import { readOperatorRuntimeRemediationShortcutsHint } from "@/lib/operatorRuntimeRemediationKeyboard";
import {
  readOperatorFeaturedReceiptSection,
  readOperatorHistoryPanelState,
  readOperatorOverviewSectionModel,
  readOperatorProfitabilityPanelModel,
  readOperatorRemediationFeedRows,
  readOperatorRemediationFeedState,
  readOperatorSectionModel,
  readOperatorUserDetailCardModel,
  readOperatorUserDetailPanelState,
  readOperatorUserFilterFormModel,
  readOperatorUserSummaryPanelModel,
  readOperatorDerivedState,
  readOperatorRuntimeRemediationDerivedState,
} from "@/lib/operatorUsageSectionState";
import { readRuntimeRemediationEmptyStateMessage } from "@/lib/operatorRuntimeRemediationViewState";
import {
  readArtifactSourceSummaryLine,
  readRuntimeRemediationPressureLine,
} from "@/lib/usageViewFormattingState";
import { readBillingPlanLabel } from "@/lib/usageBillingSummaryState";
import { operatorStatusToneClass } from "@/lib/usageViewSharedState";
import type { UsageOperatorSectionProps } from "@/components/UsageOperatorSection";
import { buildAdminWeddingOpsPanelState } from "@/lib/adminWeddingOpsState";
import {
  buildAdminWeddingOpsOracleMetricsState,
  type AdminWeddingOpsOracleMetricsPayload,
} from "@/lib/adminWeddingOpsOracleMetricsState";
import {
  buildAdminWeddingAiRoutingPolicyState,
  type AdminWeddingAiRoutingPolicyInput,
} from "@/lib/adminWeddingAiRoutingPolicyState";
import type { AdminWeddingApiStackPayload } from "@/lib/api";
import { buildWeddingApiStackState } from "@/lib/weddingApiStackState";

export function readUsageViewOperatorMountedSectionModel(args: {
  operatorDerivedState: ReturnType<typeof readOperatorDerivedState>;
  operatorRuntimeRemediationDerivedState: ReturnType<typeof readOperatorRuntimeRemediationDerivedState>;
  operatorUserDetail: OperatorUserDetail | null | undefined;
  operatorUsersQuery: string | null | undefined;
  operatorQueryDraft: string;
  operatorQueryApplied: string;
  operatorUsersLoading: boolean;
  operatorProfitLoading: boolean;
  selectedOperatorUserId: string | null | undefined;
  operatorActionBusyUserId: string | null | undefined;
  operatorActionError: string | null | undefined;
  operatorActionNotice: string | null | undefined;
  runtimeRemediationReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
  runtimeRemediationBusy: boolean;
  runtimeRemediationFilter: UsageOperatorSectionProps["historyPanel"]["currentFilter"];
  runtimeRemediationFeaturedReceiptId: string | null | undefined;
  runtimeRemediationOutcomeNotes: Record<string, string>;
  runtimeRemediationProofReferences: Record<string, string>;
  runtimeRemediationCompleteBusyId: string | null | undefined;
  routeWeddingAiThroughAdmin: boolean;
  connectedAppIds?: readonly string[] | null;
  adminWeddingOpsOracleMetricsPayload?: AdminWeddingOpsOracleMetricsPayload | null;
  adminWeddingAiRoutingPolicyPayload?: AdminWeddingAiRoutingPolicyInput | null;
  adminWeddingApiStackPayload?: AdminWeddingApiStackPayload | null;
  formatDateTimeLabel: (value: string | null | undefined) => string | null | undefined;
  formatMoneyLabel: (amount: number | null | undefined) => string;
}) {
  const selectedSummary = args.operatorDerivedState.operatorUsersList.find(
    (user) => user.user_id === args.selectedOperatorUserId,
  ) ?? null;
  const detailHeader = readOperatorDetailHeader({
    selectedEmail: selectedSummary?.email,
    detailEmail: args.operatorUserDetail?.email,
    selectedDisplayName: selectedSummary?.display_name,
    detailDisplayName: args.operatorUserDetail?.display_name,
    selectedUserId: selectedSummary?.user_id,
    fallbackUserId: args.selectedOperatorUserId ?? null,
  });
  const userSummaryRows = args.operatorDerivedState.operatorUsersList.slice(0, 8).map((user) => {
    const rowModel = readOperatorUserRowModel({
      email: user.email,
      displayName: user.display_name,
      userId: user.user_id,
      emailVerified: user.email_verified,
      plan: user.plan,
      billingStatus: user.billing_status,
      accountStatus: user.account_status,
      lastSessionLabel: args.formatDateTimeLabel(user.last_session_at),
      supportStatus: user.support_access_status,
      supportExpiresAtLabel: args.formatDateTimeLabel(user.support_access_expires_at),
      isSelected: args.selectedOperatorUserId === user.user_id,
      isBusy: args.operatorActionBusyUserId === user.user_id,
    });
    return readOperatorUserSummaryTableRow({
      userId: user.user_id,
      planLabel: readBillingPlanLabel({ hasBillingSnapshot: true, plan: user.plan }),
      accountStatusToneClass: operatorStatusToneClass(user.account_status),
      rowModel,
    });
  });
  const profitabilityRows = args.operatorDerivedState.operatorProfitUsers.slice(0, 8).map((user) => readOperatorProfitabilityRow({
    userId: user.user_id,
    planLabel: readBillingPlanLabel({ hasBillingSnapshot: true, plan: user.plan }),
    costLabel: args.formatMoneyLabel(user.cost_usd),
    revenueLabel: args.formatMoneyLabel(user.revenue_usd),
    marginLabel: args.formatMoneyLabel(user.margin_usd),
  }));
  const userDetailPanelModel = readOperatorUserDetailPanelViewModel(readOperatorUserDetailCardModel({
    detail: args.operatorUserDetail,
    title: detailHeader.title,
    subtitle: detailHeader.subtitle,
    loadingLabel: readOperatorDetailLoadingState(),
    accountStatusToneClass: operatorStatusToneClass(args.operatorUserDetail?.account_status),
    sessionsEmptyState: readOperatorSessionsEmptyState(),
    supportHistoryEmptyState: readOperatorSupportAccessHistoryEmptyState(),
    formatDateTimeLabel: args.formatDateTimeLabel,
  }));
  const remediationFeedRows = readOperatorRemediationFeedRows({
    entries: args.operatorRuntimeRemediationDerivedState.visibleEntries,
    pinnedReceiptId: args.runtimeRemediationFeaturedReceiptId,
    latestReceipt: args.runtimeRemediationReceipt,
    outcomeNotes: args.runtimeRemediationOutcomeNotes,
    proofReferences: args.runtimeRemediationProofReferences,
    completionBusyReceiptId: args.runtimeRemediationCompleteBusyId,
    formatDateTimeLabel: args.formatDateTimeLabel,
    formatArtifactSummaryLine: ({ artifactGeneratedAt, source }) => artifactGeneratedAt || source
      ? readArtifactSourceSummaryLine({
        artifactUpdatedLabel: args.formatDateTimeLabel(artifactGeneratedAt) ?? artifactGeneratedAt,
        source,
      })
      : null,
    formatPressureLine: ({ pressureTotalRows, cleanupMode }) =>
      typeof pressureTotalRows === "number" || cleanupMode
        ? readRuntimeRemediationPressureLine({ pressureTotalRows, cleanupMode })
        : null,
  });
  const featuredReceipt = readOperatorFeaturedReceiptSection({
    featuredReceipt: args.operatorRuntimeRemediationDerivedState.featuredReceipt,
    cardModel: args.operatorRuntimeRemediationDerivedState.featuredCardModel,
    formatDateTimeLabel: args.formatDateTimeLabel,
  });

  return readOperatorSectionModel({
    overviewSection: readOperatorOverviewSectionModel({
      shortcutsHint: readOperatorRuntimeRemediationShortcutsHint(),
      intro: readOperatorOverviewIntro(),
      refreshLabel: readOperatorRefreshLabel(args.operatorUsersLoading || args.operatorProfitLoading),
      refreshDisabled: args.operatorUsersLoading || args.operatorProfitLoading,
      loadFailure: args.operatorDerivedState.operatorLoadFailureCard,
      actionFailure: args.operatorActionError ? readOperatorActionFailureCard(args.operatorActionError) : null,
      actionNotice: args.operatorActionNotice ?? null,
      guidance: args.operatorDerivedState.operatorOperationalGuidanceCard
        ? args.operatorDerivedState.operatorOperationalGuidanceViewModel
        : null,
      issueReceiptBusy: args.runtimeRemediationBusy,
    }),
    featuredReceipt,
    historyPanel: readOperatorHistoryPanelState({
      panelModel: args.operatorRuntimeRemediationDerivedState.historyPanelModel,
      currentFilter: args.runtimeRemediationFilter,
      localDraftCount: args.operatorRuntimeRemediationDerivedState.localDraftCount,
      currentOpenCount: args.operatorRuntimeRemediationDerivedState.openEntries.length,
      currentCompletedCount: args.operatorRuntimeRemediationDerivedState.completedEntries.length,
      currentDraftCount: args.operatorRuntimeRemediationDerivedState.draftEntries.length,
      currentTotalCount: args.operatorRuntimeRemediationDerivedState.entries.length,
    }),
    remediationFeed: readOperatorRemediationFeedState({
      rows: remediationFeedRows,
      emptyMessage: readRuntimeRemediationEmptyStateMessage({
        totalCount: args.operatorRuntimeRemediationDerivedState.entries.length,
        filter: args.runtimeRemediationFilter,
      }),
      totalCount: args.operatorRuntimeRemediationDerivedState.entries.length,
      issueReceiptBusy: args.runtimeRemediationBusy,
      recoveryActions: args.operatorRuntimeRemediationDerivedState.historyPanelModel.recoveryActions,
    }),
    metricsCards: args.operatorDerivedState.operatorOverviewCardModels,
    adminWeddingOpsPanel: buildAdminWeddingOpsPanelState({
      operatorUsers: args.operatorDerivedState.operatorUsersValue,
      oracleMetrics: buildAdminWeddingOpsOracleMetricsState(args.adminWeddingOpsOracleMetricsPayload),
      weddingAiRoutingPolicy: buildAdminWeddingAiRoutingPolicyState(
        args.adminWeddingAiRoutingPolicyPayload ?? {},
      ),
      apiStack: buildWeddingApiStackState({
        connectedAppIds: args.adminWeddingApiStackPayload?.connectedAppIds ?? args.connectedAppIds,
      }),
      routeWeddingAiThroughAdmin: args.routeWeddingAiThroughAdmin,
    }),
    userFilterForm: readOperatorUserFilterFormModel({
      queryDraft: args.operatorQueryDraft,
      queryApplied: args.operatorQueryApplied,
      loading: args.operatorUsersLoading,
    }),
    userSummaryPanel: readOperatorUserSummaryPanelModel({
      queryLabel: readOperatorUserSummaryQueryLabel(args.operatorUsersQuery),
      rows: userSummaryRows,
      emptyState: readOperatorUserSummaryEmptyState(),
      loading: args.operatorUsersLoading,
      actionBusy: args.operatorActionBusyUserId !== null,
    }),
    userDetailPanel: readOperatorUserDetailPanelState({
      open: !!args.selectedOperatorUserId,
      hasDetail: !!args.operatorUserDetail,
      model: userDetailPanelModel,
    }),
    profitabilityPanel: readOperatorProfitabilityPanelModel({
      workflowLabel: args.operatorDerivedState.operatorTopWorkflowSummary.workflowLabel,
      workflowDetail: args.operatorDerivedState.operatorTopWorkflowSummary.detail,
      rows: profitabilityRows,
      emptyState: readOperatorProfitabilityEmptyState(),
      loading: args.operatorProfitLoading,
    }),
  });
}
