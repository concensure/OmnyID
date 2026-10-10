// @locs-version: 1.0
import { Show } from "solid-js";
import UsageOperatorOverviewSection from "@/components/UsageOperatorOverviewSection";
import type { UsageOperatorOverviewSectionProps } from "@/components/UsageOperatorOverviewSection";
import UsageFeaturedRuntimeRemediationCard from "@/components/UsageFeaturedRuntimeRemediationCard";
import type { UsageFeaturedRuntimeRemediationCardProps } from "@/components/UsageFeaturedRuntimeRemediationCard";
import UsageRuntimeRemediationHistoryPanel from "@/components/UsageRuntimeRemediationHistoryPanel";
import type { UsageRuntimeRemediationHistoryPanelProps } from "@/components/UsageRuntimeRemediationHistoryPanel";
import UsageRuntimeRemediationFeed from "@/components/UsageRuntimeRemediationFeed";
import type { UsageRuntimeRemediationFeedProps } from "@/components/UsageRuntimeRemediationFeed";
import UsageOperatorMetricsGrid from "@/components/UsageOperatorMetricsGrid";
import type { UsageOperatorMetricsGridProps } from "@/components/UsageOperatorMetricsGrid";
import UsageOperatorUserFilterForm from "@/components/UsageOperatorUserFilterForm";
import type { UsageOperatorUserFilterFormProps } from "@/components/UsageOperatorUserFilterForm";
import UsageOperatorUserSummaryPanel from "@/components/UsageOperatorUserSummaryPanel";
import type { UsageOperatorUserSummaryPanelProps } from "@/components/UsageOperatorUserSummaryPanel";
import UsageOperatorUserDetailPanel from "@/components/UsageOperatorUserDetailPanel";
import type { UsageOperatorUserDetailPanelProps } from "@/components/UsageOperatorUserDetailPanel";
import UsageOperatorProfitabilityPanel from "@/components/UsageOperatorProfitabilityPanel";
import type { UsageOperatorProfitabilityPanelProps } from "@/components/UsageOperatorProfitabilityPanel";
import UsageAdminWeddingOpsPanel from "@/components/UsageAdminWeddingOpsPanel";
import type { UsageAdminWeddingOpsPanelProps } from "@/components/UsageAdminWeddingOpsPanel";
import UsageAdminWeddingVendorsPanel from "@/components/UsageAdminWeddingVendorsPanel";
import UsageAdminWeddingNewsletterPanel from "@/components/UsageAdminWeddingNewsletterPanel";
import UsageAdminWeddingWaitlistPanel from "@/components/UsageAdminWeddingWaitlistPanel";

export type UsageOperatorSectionProps = {
  onKeyDown: (event: KeyboardEvent) => void;
  overviewSection: Omit<UsageOperatorOverviewSectionProps, "onRefresh" | "onCopyCommand" | "onIssueReceipt">;
  onRefresh: UsageOperatorOverviewSectionProps["onRefresh"];
  onCopyOverviewCommand: UsageOperatorOverviewSectionProps["onCopyCommand"];
  onIssueReceipt: UsageOperatorOverviewSectionProps["onIssueReceipt"];
  featuredReceipt: Omit<UsageFeaturedRuntimeRemediationCardProps, "onAction" | "onDraftAction"> | null;
  onFeaturedAction: UsageFeaturedRuntimeRemediationCardProps["onAction"];
  onFeaturedDraftAction: UsageFeaturedRuntimeRemediationCardProps["onDraftAction"];
  historyPanel: Omit<
    UsageRuntimeRemediationHistoryPanelProps,
    "onSelectFilter" | "onClearAllDrafts" | "onFocusLatest" | "onFocusFeatured"
  >;
  onSelectHistoryFilter: UsageRuntimeRemediationHistoryPanelProps["onSelectFilter"];
  onClearAllDrafts: UsageRuntimeRemediationHistoryPanelProps["onClearAllDrafts"];
  onFocusLatest: UsageRuntimeRemediationHistoryPanelProps["onFocusLatest"];
  onFocusFeatured: UsageRuntimeRemediationHistoryPanelProps["onFocusFeatured"];
  remediationFeed: Omit<
    UsageRuntimeRemediationFeedProps,
    "onIssueReceipt" | "onSelectFilter" | "onPinSummary" | "onCopyCommand" | "onOutcomeDraftChange"
    | "onProofDraftChange" | "onCompleteReceipt" | "onClearDraft"
  >;
  onPinSummary: UsageRuntimeRemediationFeedProps["onPinSummary"];
  onCopyFeedCommand: UsageRuntimeRemediationFeedProps["onCopyCommand"];
  onOutcomeDraftChange: UsageRuntimeRemediationFeedProps["onOutcomeDraftChange"];
  onProofDraftChange: UsageRuntimeRemediationFeedProps["onProofDraftChange"];
  onCompleteReceipt: UsageRuntimeRemediationFeedProps["onCompleteReceipt"];
  onClearDraft: UsageRuntimeRemediationFeedProps["onClearDraft"];
  metricsCards: UsageOperatorMetricsGridProps["cards"];
  userFilterForm: Omit<UsageOperatorUserFilterFormProps, "onQueryDraftChange" | "onSubmit" | "onKeyDown" | "onClear">;
  onUserFilterDraftChange: UsageOperatorUserFilterFormProps["onQueryDraftChange"];
  onUserFilterSubmit: UsageOperatorUserFilterFormProps["onSubmit"];
  onUserFilterKeyDown: UsageOperatorUserFilterFormProps["onKeyDown"];
  onClearUserFilter: UsageOperatorUserFilterFormProps["onClear"];
  userSummaryPanel: Omit<UsageOperatorUserSummaryPanelProps, "onInspectUser" | "onRunAction">;
  onInspectUser: UsageOperatorUserSummaryPanelProps["onInspectUser"];
  onRunUserAction: UsageOperatorUserSummaryPanelProps["onRunAction"];
  userDetailPanel: Omit<UsageOperatorUserDetailPanelProps, "onClose">;
  onCloseUserDetail: UsageOperatorUserDetailPanelProps["onClose"];
  profitabilityPanel: UsageOperatorProfitabilityPanelProps;
  adminWeddingOpsPanel: UsageAdminWeddingOpsPanelProps["state"];
  onToggleWeddingAiRouting: UsageAdminWeddingOpsPanelProps["onToggleWeddingAiRouting"];
};

export default function UsageOperatorSection(props: UsageOperatorSectionProps) {
  return (
    <div class="mt-4 rounded-2xl border border-slate-300/45 bg-slate-50/70 p-4" onKeyDown={props.onKeyDown}>
      <UsageOperatorOverviewSection
        shortcutsHint={props.overviewSection.shortcutsHint}
        intro={props.overviewSection.intro}
        refreshLabel={props.overviewSection.refreshLabel}
        refreshDisabled={props.overviewSection.refreshDisabled}
        loadFailure={props.overviewSection.loadFailure}
        actionFailure={props.overviewSection.actionFailure}
        actionNotice={props.overviewSection.actionNotice}
        guidance={props.overviewSection.guidance}
        issueReceiptBusy={props.overviewSection.issueReceiptBusy}
        onRefresh={props.onRefresh}
        onCopyCommand={props.onCopyOverviewCommand}
        onIssueReceipt={props.onIssueReceipt}
      />

      <Show when={props.featuredReceipt}>
        {(featured) => (
          <UsageFeaturedRuntimeRemediationCard
            receipt={featured().receipt}
            cardModel={featured().cardModel}
            issuedAtLabel={featured().issuedAtLabel}
            lifecycleLabel={featured().lifecycleLabel}
            completedAtLabel={featured().completedAtLabel}
            onAction={props.onFeaturedAction}
            onDraftAction={props.onFeaturedDraftAction}
          />
        )}
      </Show>

      <UsageRuntimeRemediationHistoryPanel
        panelModel={props.historyPanel.panelModel}
        currentFilter={props.historyPanel.currentFilter}
        localDraftCount={props.historyPanel.localDraftCount}
        currentOpenCount={props.historyPanel.currentOpenCount}
        currentCompletedCount={props.historyPanel.currentCompletedCount}
        currentDraftCount={props.historyPanel.currentDraftCount}
        currentTotalCount={props.historyPanel.currentTotalCount}
        onSelectFilter={props.onSelectHistoryFilter}
        onClearAllDrafts={props.onClearAllDrafts}
        onFocusLatest={props.onFocusLatest}
        onFocusFeatured={props.onFocusFeatured}
      />

      <UsageRuntimeRemediationFeed
        rows={props.remediationFeed.rows}
        emptyMessage={props.remediationFeed.emptyMessage}
        totalCount={props.remediationFeed.totalCount}
        issueReceiptBusy={props.remediationFeed.issueReceiptBusy}
        recoveryActions={props.remediationFeed.recoveryActions}
        onIssueReceipt={props.onIssueReceipt}
        onSelectFilter={props.onSelectHistoryFilter}
        onPinSummary={props.onPinSummary}
        onCopyCommand={props.onCopyFeedCommand}
        onOutcomeDraftChange={props.onOutcomeDraftChange}
        onProofDraftChange={props.onProofDraftChange}
        onCompleteReceipt={props.onCompleteReceipt}
        onClearDraft={props.onClearDraft}
      />

      <UsageOperatorMetricsGrid cards={props.metricsCards} />

      <UsageAdminWeddingOpsPanel
        state={props.adminWeddingOpsPanel}
        onToggleWeddingAiRouting={props.onToggleWeddingAiRouting}
      />

      <UsageAdminWeddingVendorsPanel />

      <UsageAdminWeddingWaitlistPanel />

      <UsageAdminWeddingNewsletterPanel />

      <UsageOperatorUserFilterForm
        queryDraft={props.userFilterForm.queryDraft}
        queryApplied={props.userFilterForm.queryApplied}
        loading={props.userFilterForm.loading}
        onQueryDraftChange={props.onUserFilterDraftChange}
        onSubmit={props.onUserFilterSubmit}
        onKeyDown={props.onUserFilterKeyDown}
        onClear={props.onClearUserFilter}
      />

      <div class="mt-4 grid gap-4 xl:grid-cols-2">
        <div>
          <UsageOperatorUserSummaryPanel
            queryLabel={props.userSummaryPanel.queryLabel}
            rows={props.userSummaryPanel.rows}
            emptyState={props.userSummaryPanel.emptyState}
            loading={props.userSummaryPanel.loading}
            onInspectUser={props.onInspectUser}
            onRunAction={props.onRunUserAction}
            actionBusy={props.userSummaryPanel.actionBusy}
          />

          <UsageOperatorUserDetailPanel
            open={props.userDetailPanel.open}
            hasDetail={props.userDetailPanel.hasDetail}
            model={props.userDetailPanel.model}
            onClose={props.onCloseUserDetail}
          />
        </div>

        <UsageOperatorProfitabilityPanel
          workflowLabel={props.profitabilityPanel.workflowLabel}
          workflowDetail={props.profitabilityPanel.workflowDetail}
          rows={props.profitabilityPanel.rows}
          emptyState={props.profitabilityPanel.emptyState}
          loading={props.profitabilityPanel.loading}
        />
      </div>
    </div>
  );
}
