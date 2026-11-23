// @locs-version: 1.0
import type { ExternalToolBillingStatus } from "@/lib/api";
import {
  buildAdminThirdPartyToolPolicyState,
  type AdminThirdPartyToolPolicyRecord,
} from "@/lib/adminThirdPartyToolPolicyState";
import type { WeddingApiStackState } from "@/lib/weddingApiStackState";
import { buildCostTrustGuidance } from "@/lib/costTrustState";
import {
  readExternalToolCostTrustPanelModel,
  readExternalToolEstimateDetail,
  readExternalToolMeasurementLabel,
  readExternalToolRetentionDetail,
  readExternalToolSettlementLabel,
} from "@/lib/externalToolBillingCoverageState";
import {
  readExternalToolBillingOverviewCardModels,
  readExternalToolBillingSectionIntro,
  readExternalToolBuiltInLineItemsEmptyState,
  readExternalToolBuiltInUsageEmptyState,
  readExternalToolCategoryTotalCardModels,
  readExternalToolCategoryTotalsEmptyState,
  readExternalToolConnectedLineItemsEmptyState,
  readExternalToolConnectionCards,
  readExternalToolConnectedProvidersEmptyState,
  readExternalToolConnectedUsageEmptyState,
  readExternalToolUsageEventCardModels,
  readExternalToolUsageLineItemRowModels,
} from "@/lib/externalToolBillingViewState";
import {
  quantityLabel,
  readMountedDateLabel,
  readMountedDateTimeLabel,
  sumEstimatedCost,
} from "@/lib/usageViewSharedState";
import {
  readUsageCategorySummaryLine,
  readUsageEventSummaryLine,
  readUsageQuantitySummaryLine,
} from "@/lib/usageViewFormattingState";
import type UsageExternalToolBillingSection from "@/components/UsageExternalToolBillingSection";

type ExternalToolBillingSectionProps = Parameters<typeof UsageExternalToolBillingSection>[0];

export function readExternalToolDerivedState(args: {
  billing: ExternalToolBillingStatus | null | undefined;
  quotaState: string | null | undefined;
  weddingApiStack?: WeddingApiStackState | null;
  adminThirdPartyToolPolicies?: readonly AdminThirdPartyToolPolicyRecord[] | null;
  adminThirdPartyToolPolicySourceLabel?: string | null;
  formatCostLabel: (amount: number | null | undefined) => string;
}) {
  const externalToolBilling = args.billing ?? null;
  const externalToolCategories = externalToolBilling?.categories ?? [];
  const externalToolItems = externalToolBilling?.items ?? [];
  const externalToolEvents = externalToolBilling?.recent_events ?? [];
  const connectedBillableTools = externalToolBilling?.connected_tools ?? [];
  const connectedToolItems = externalToolItems.filter((item) => item.provider_origin === "connected");
  const builtInToolItems = externalToolItems.filter((item) => item.provider_origin !== "connected");
  const connectedToolEvents = externalToolEvents.filter((event) => event.provider_origin === "connected");
  const builtInToolEvents = externalToolEvents.filter((event) => event.provider_origin !== "connected");
  const externalToolCoverage = externalToolBilling?.coverage;
  const connectedToolSpend = externalToolBilling?.connected_estimated_cost_usd ?? sumEstimatedCost(connectedToolItems);
  const builtInToolSpend = externalToolBilling?.built_in_estimated_cost_usd ?? sumEstimatedCost(builtInToolItems);
  const estimateDetail = readExternalToolEstimateDetail({
    coverageSummary: externalToolCoverage?.coverage_summary,
    currentMonthStartLabel: readMountedDateLabel(externalToolBilling?.current_month_start),
  });
  const settlementLabel = readExternalToolSettlementLabel(externalToolCoverage?.settlement_state);
  const measurementLabel = readExternalToolMeasurementLabel(externalToolCoverage?.measurement_state);
  const retentionDetail = readExternalToolRetentionDetail({
    maxEventAgeDays: externalToolCoverage?.retention?.max_event_age_days,
    maxEventRowsPerUser: externalToolCoverage?.retention?.max_event_rows_per_user,
  });
  const costTrustGuidance = buildCostTrustGuidance({
    billingStatusAvailable: true,
    hostedBudgetCents: null,
    quotaState: args.quotaState,
  });
  const adminThirdPartyToolPolicy = buildAdminThirdPartyToolPolicyState({
    apiStack: args.weddingApiStack,
    billing: externalToolBilling,
    policies: args.adminThirdPartyToolPolicies,
    policySourceLabel: args.adminThirdPartyToolPolicySourceLabel,
    formatCostLabel: args.formatCostLabel,
  });

  return {
    externalToolBilling,
    externalToolCategories,
    externalToolItems,
    externalToolEvents,
    connectedBillableTools,
    connectedToolItems,
    builtInToolItems,
    connectedToolEvents,
    builtInToolEvents,
    overviewCards: readExternalToolBillingOverviewCardModels({
      connectedProviderCount: connectedBillableTools.length,
      builtInProviderCount: builtInToolItems.length,
      categoryCount: externalToolCategories.length,
      eventCount: externalToolEvents.length,
      connectedSpendLabel: args.formatCostLabel(connectedToolSpend),
      builtInSpendLabel: args.formatCostLabel(builtInToolSpend),
      settlementLabel,
      measurementLabel,
      retentionDetail,
    }),
    categoryCards: readExternalToolCategoryTotalCardModels({
      entries: externalToolCategories,
      formatCostLabel: args.formatCostLabel,
      formatCategorySummaryLine: (entry) => readUsageCategorySummaryLine({
        quantityLabel: quantityLabel(entry.total_quantity),
        usageUnit: "units",
        eventCount: entry.event_count,
      }),
    }),
    connectionCards: readExternalToolConnectionCards({
      entries: connectedBillableTools,
    }),
    connectedLineItems: readExternalToolUsageLineItemRowModels({
      entries: connectedToolItems,
      formatUsageSummary: (entry) => readUsageQuantitySummaryLine({
        quantityLabel: quantityLabel(entry.total_quantity),
        usageUnit: entry.usage_unit,
      }),
      formatCostLabel: args.formatCostLabel,
    }),
    connectedUsageEvents: readExternalToolUsageEventCardModels({
      entries: connectedToolEvents,
      formatCostLabel: args.formatCostLabel,
      formatSummaryLine: (entry) => readUsageEventSummaryLine({
        quantityLabel: quantityLabel(entry.quantity),
        usageUnit: entry.usage_unit,
        billingCategory: entry.billing_category,
        source: entry.source,
      }),
      formatOccurredAtLabel: readMountedDateTimeLabel,
      limit: 8,
    }),
    builtInLineItems: readExternalToolUsageLineItemRowModels({
      entries: builtInToolItems,
      formatUsageSummary: (entry) => readUsageQuantitySummaryLine({
        quantityLabel: quantityLabel(entry.total_quantity),
        usageUnit: entry.usage_unit,
      }),
      formatCostLabel: args.formatCostLabel,
    }),
    builtInUsageEvents: readExternalToolUsageEventCardModels({
      entries: builtInToolEvents,
      formatCostLabel: args.formatCostLabel,
      formatSummaryLine: (entry) => readUsageEventSummaryLine({
        quantityLabel: quantityLabel(entry.quantity),
        usageUnit: entry.usage_unit,
        billingCategory: entry.billing_category,
        source: entry.source,
      }),
      formatOccurredAtLabel: readMountedDateTimeLabel,
      limit: 8,
    }),
    costTrustPanel: readExternalToolCostTrustPanelModel({
      estimateDetail,
      guidanceCoverage: costTrustGuidance.coverage,
      guidanceCaveats: costTrustGuidance.caveats,
      externalCoverageCaveats: externalToolCoverage?.caveats ?? [],
    }),
    adminThirdPartyToolPolicy,
    estimatedToolSpendLabel: args.formatCostLabel(externalToolBilling?.total_estimated_cost_usd ?? 0),
    estimateDetail,
  };
}

export function readExternalToolUsageSectionModel(
  args: ExternalToolBillingSectionProps,
) {
  return args;
}

export function readExternalToolSectionModel(args: {
  estimatedToolSpendLabel: string;
  estimateDetail: string;
  overviewCards: ExternalToolBillingSectionProps["overviewCards"];
  categoryCards: ExternalToolBillingSectionProps["categoryCards"];
  connectionCards: ExternalToolBillingSectionProps["connectionCards"];
  connectedLineItems: ExternalToolBillingSectionProps["connectedLineItems"];
  connectedUsageEvents: ExternalToolBillingSectionProps["connectedUsageEvents"];
  builtInLineItems: ExternalToolBillingSectionProps["builtInLineItems"];
  builtInUsageEvents: ExternalToolBillingSectionProps["builtInUsageEvents"];
  costTrustPanel: ExternalToolBillingSectionProps["costTrustPanel"];
  adminThirdPartyToolPolicy?: ExternalToolBillingSectionProps["adminThirdPartyToolPolicy"];
  onToggleAdminThirdPartyTool?: ExternalToolBillingSectionProps["onToggleAdminThirdPartyTool"];
  adminThirdPartyToolPolicyNotice?: string | null;
  adminThirdPartyToolPolicyError?: string | null;
  adminThirdPartyToolPolicyBusyKey?: string | null;
}) {
  const model = {
    intro: readExternalToolBillingSectionIntro(),
    estimatedToolSpendLabel: args.estimatedToolSpendLabel,
    estimateDetail: args.estimateDetail,
    overviewCards: args.overviewCards,
    categoryCards: args.categoryCards,
    categoryEmptyState: readExternalToolCategoryTotalsEmptyState(),
    connectionCards: args.connectionCards,
    connectionEmptyState: readExternalToolConnectedProvidersEmptyState(),
    connectedLineItemsEmptyState: readExternalToolConnectedLineItemsEmptyState(),
    connectedLineItems: args.connectedLineItems,
    connectedUsageEmptyState: readExternalToolConnectedUsageEmptyState(),
    connectedUsageEvents: args.connectedUsageEvents,
    builtInLineItemsEmptyState: readExternalToolBuiltInLineItemsEmptyState(),
    builtInLineItems: args.builtInLineItems,
    builtInUsageEmptyState: readExternalToolBuiltInUsageEmptyState(),
    builtInUsageEvents: args.builtInUsageEvents,
    costTrustPanel: args.costTrustPanel,
  };
  return readExternalToolUsageSectionModel({
    ...model,
    ...(args.adminThirdPartyToolPolicy ? { adminThirdPartyToolPolicy: args.adminThirdPartyToolPolicy } : {}),
    ...(args.onToggleAdminThirdPartyTool ? { onToggleAdminThirdPartyTool: args.onToggleAdminThirdPartyTool } : {}),
    ...(args.adminThirdPartyToolPolicyNotice ? { adminThirdPartyToolPolicyNotice: args.adminThirdPartyToolPolicyNotice } : {}),
    ...(args.adminThirdPartyToolPolicyError ? { adminThirdPartyToolPolicyError: args.adminThirdPartyToolPolicyError } : {}),
    ...(args.adminThirdPartyToolPolicyBusyKey ? { adminThirdPartyToolPolicyBusyKey: args.adminThirdPartyToolPolicyBusyKey } : {}),
  });
}
