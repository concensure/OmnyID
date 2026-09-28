// @locs-version: 1.0
import type { UsageBillingSectionProps } from "@/components/UsageBillingSection";
import type { UsageOperatorSectionProps } from "@/components/UsageOperatorSection";

export function readUsageBillingSectionProps(
  props: UsageBillingSectionProps,
): UsageBillingSectionProps {
  return props;
}

export function readUsageOperatorSectionProps(
  props: UsageOperatorSectionProps,
): UsageOperatorSectionProps {
  return props;
}

export function readUsageViewOperatorMountedSectionProps(args: {
  operatorSectionModel: Pick<
    UsageOperatorSectionProps,
    | "overviewSection"
    | "featuredReceipt"
    | "historyPanel"
    | "remediationFeed"
    | "metricsCards"
    | "adminWeddingOpsPanel"
    | "userFilterForm"
    | "userSummaryPanel"
    | "userDetailPanel"
    | "profitabilityPanel"
  >;
  onKeyDown: UsageOperatorSectionProps["onKeyDown"];
  onRefresh: UsageOperatorSectionProps["onRefresh"];
  onCopyOverviewCommand: UsageOperatorSectionProps["onCopyOverviewCommand"];
  onIssueReceipt: UsageOperatorSectionProps["onIssueReceipt"];
  onFeaturedAction: UsageOperatorSectionProps["onFeaturedAction"];
  onFeaturedDraftAction: UsageOperatorSectionProps["onFeaturedDraftAction"];
  onSelectHistoryFilter: UsageOperatorSectionProps["onSelectHistoryFilter"];
  onClearAllDrafts: UsageOperatorSectionProps["onClearAllDrafts"];
  onFocusLatest: UsageOperatorSectionProps["onFocusLatest"];
  onFocusFeatured: UsageOperatorSectionProps["onFocusFeatured"];
  onPinSummary: UsageOperatorSectionProps["onPinSummary"];
  onCopyFeedCommand: UsageOperatorSectionProps["onCopyFeedCommand"];
  onToggleWeddingAiRouting: UsageOperatorSectionProps["onToggleWeddingAiRouting"];
  onOutcomeDraftChange: UsageOperatorSectionProps["onOutcomeDraftChange"];
  onProofDraftChange: UsageOperatorSectionProps["onProofDraftChange"];
  onCompleteReceipt: UsageOperatorSectionProps["onCompleteReceipt"];
  onClearDraft: UsageOperatorSectionProps["onClearDraft"];
  onUserFilterDraftChange: UsageOperatorSectionProps["onUserFilterDraftChange"];
  onUserFilterSubmit: UsageOperatorSectionProps["onUserFilterSubmit"];
  onUserFilterKeyDown: UsageOperatorSectionProps["onUserFilterKeyDown"];
  onClearUserFilter: UsageOperatorSectionProps["onClearUserFilter"];
  onInspectUser: UsageOperatorSectionProps["onInspectUser"];
  onRunUserAction: UsageOperatorSectionProps["onRunUserAction"];
  onCloseUserDetail: UsageOperatorSectionProps["onCloseUserDetail"];
}): UsageOperatorSectionProps {
  return {
    onKeyDown: args.onKeyDown,
    overviewSection: args.operatorSectionModel.overviewSection,
    onRefresh: args.onRefresh,
    onCopyOverviewCommand: args.onCopyOverviewCommand,
    onIssueReceipt: args.onIssueReceipt,
    featuredReceipt: args.operatorSectionModel.featuredReceipt,
    onFeaturedAction: args.onFeaturedAction,
    onFeaturedDraftAction: args.onFeaturedDraftAction,
    historyPanel: args.operatorSectionModel.historyPanel,
    onSelectHistoryFilter: args.onSelectHistoryFilter,
    onClearAllDrafts: args.onClearAllDrafts,
    onFocusLatest: args.onFocusLatest,
    onFocusFeatured: args.onFocusFeatured,
    remediationFeed: args.operatorSectionModel.remediationFeed,
    onPinSummary: args.onPinSummary,
    onCopyFeedCommand: args.onCopyFeedCommand,
    adminWeddingOpsPanel: args.operatorSectionModel.adminWeddingOpsPanel,
    onToggleWeddingAiRouting: args.onToggleWeddingAiRouting,
    onOutcomeDraftChange: args.onOutcomeDraftChange,
    onProofDraftChange: args.onProofDraftChange,
    onCompleteReceipt: args.onCompleteReceipt,
    onClearDraft: args.onClearDraft,
    metricsCards: args.operatorSectionModel.metricsCards,
    userFilterForm: args.operatorSectionModel.userFilterForm,
    onUserFilterDraftChange: args.onUserFilterDraftChange,
    onUserFilterSubmit: args.onUserFilterSubmit,
    onUserFilterKeyDown: args.onUserFilterKeyDown,
    onClearUserFilter: args.onClearUserFilter,
    userSummaryPanel: args.operatorSectionModel.userSummaryPanel,
    onInspectUser: args.onInspectUser,
    onRunUserAction: args.onRunUserAction,
    userDetailPanel: args.operatorSectionModel.userDetailPanel,
    onCloseUserDetail: args.onCloseUserDetail,
    profitabilityPanel: args.operatorSectionModel.profitabilityPanel,
  };
}
