// @locs-version: 2.0
import {
  buildWeddingBackgroundAutomationTaskItems,
  type WeddingBackgroundAutomationCoverageState,
} from "@/lib/weddingBackgroundAutomationCoverageState";
import {
  buildWeddingBudgetPaymentTaskItems,
  buildWeddingBudgetQuoteTaskItems,
  buildWeddingBudgetVendorOutreachTaskItems,
  type WeddingBudgetTrackingState,
} from "@/lib/weddingBudgetTrackingState";
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import type { WeddingDecisionProjectionInput } from "@/lib/weddingDecisionAfpProjectionState";
import {
  buildWeddingDelegationTaskItems,
  type WeddingDelegationState,
} from "@/lib/weddingDelegationState";
import { buildWeddingFinalPhaseTaskItems } from "@/lib/weddingFinalPhaseCoordinationState";
import {
  buildWeddingGuestFinalCountDecisionTaskItems,
  buildWeddingGuestFollowUpTaskItems,
  type WeddingGuestTrackingState,
} from "@/lib/weddingGuestTrackingState";
import {
  buildWeddingImportParserTaskItems,
  type WeddingImportParserReadinessState,
} from "@/lib/weddingImportParserReadinessState";
import {
  buildWeddingInspirationTaskItems,
  type WeddingInspirationState,
} from "@/lib/weddingInspirationState";
import { buildWeddingLegalAdministrationTaskItems } from "@/lib/weddingLegalAdministrationState";
import {
  buildWeddingVendorContactOutreachTaskItems,
  type WeddingVendorContactOutreachVendor,
} from "@/lib/weddingOutreachEscalationState";
import {
  buildWeddingOracleUpdateTaskItems,
  type WeddingOracleUpdatePlanState,
} from "@/lib/weddingOracleUpdatePlanState";
import type { WeddingProductionRemainingWorkState } from "@/lib/weddingProductionRemainingWorkState";
import type { WeddingPersistedApprovalReceipt } from "@/lib/weddingPersistedWorkspaceState";
import { buildWeddingPostWeddingWrapUpTaskItems } from "@/lib/weddingPostWeddingWrapUpState";
import { buildWeddingProviderHandoffTaskItems } from "@/lib/weddingProviderHandoffTaskState";
import {
  buildWeddingSeatingActionTaskItems,
  type WeddingSeatingPlanState,
} from "@/lib/weddingSeatingPlanState";
import { buildWeddingVendorSearchTaskItems } from "@/lib/weddingVendorSearchArtifactState";
import { buildWeddingVendorLeadTimeTaskItems } from "@/lib/weddingVendorLeadTimeState";
import { buildWeddingVendorSeedTaskItems } from "@/lib/weddingVendorSeedState";
import { buildWeddingVowPlanningTaskItems } from "@/lib/weddingVowPlanningState";

export type WeddingWorkspaceGeneratedTaskItemsInput = {
  artifacts?: readonly WeddingArtifactInput[] | null;
  selectedDecisionItems?: readonly WeddingDecisionProjectionInput[] | null;
  baseTaskItems?: readonly WeddingPlanningTaskItem[] | null;
  loopTaskItems?: readonly WeddingPlanningTaskItem[] | null;
  budgetTracking?: WeddingBudgetTrackingState | null;
  guestTracking?: WeddingGuestTrackingState | null;
  seatingPlan?: WeddingSeatingPlanState | null;
  inspiration?: WeddingInspirationState | null;
  importParserReadiness?: WeddingImportParserReadinessState | null;
  backgroundAutomationCoverage?: WeddingBackgroundAutomationCoverageState | null;
  delegation?: WeddingDelegationState | null;
  preparationTaskItems?: readonly WeddingPlanningTaskItem[] | null;
  auditTaskItems?: readonly WeddingPlanningTaskItem[] | null;
  oracleUpdatePlan?: WeddingOracleUpdatePlanState | null;
  productionRemainingWork?: WeddingProductionRemainingWorkState | null;
  approvalReceipts?: readonly WeddingPersistedApprovalReceipt[] | null;
  weddingVendors?: readonly WeddingVendorContactOutreachVendor[] | null;
  weddingDateOrSeason?: string | null;
  vendorCategoryIds?: readonly unknown[] | null;
  skippedVendorCategoryIds?: readonly unknown[] | null;
  now?: string | null;
  metadata?: unknown;
};

export function buildWeddingWorkspaceGeneratedTaskItems(input: WeddingWorkspaceGeneratedTaskItemsInput): WeddingPlanningTaskItem[] {
  const baseTaskItems = [...(input.baseTaskItems ?? [])];
  const generatedTaskItems = [
    ...buildWeddingBudgetQuoteTaskItems({
      budgetTracking: input.budgetTracking,
      metadata: input.metadata,
      existingTaskItems: baseTaskItems,
    }),
    ...buildWeddingBudgetVendorOutreachTaskItems({
      budgetTracking: input.budgetTracking,
      metadata: input.metadata,
      existingTaskItems: baseTaskItems,
    }),
    ...buildWeddingBudgetPaymentTaskItems({
      budgetTracking: input.budgetTracking,
      metadata: input.metadata,
      existingTaskItems: baseTaskItems,
    }),
    ...buildWeddingGuestFollowUpTaskItems({
      guestTracking: input.guestTracking,
      metadata: input.metadata,
      existingTaskItems: baseTaskItems,
    }),
    ...buildWeddingGuestFinalCountDecisionTaskItems({
      guestTracking: input.guestTracking,
      metadata: input.metadata,
      existingTaskItems: baseTaskItems,
    }),
    ...buildWeddingSeatingActionTaskItems({
      seatingPlan: input.seatingPlan,
      metadata: input.metadata,
      existingTaskItems: baseTaskItems,
    }),
    ...buildWeddingInspirationTaskItems({
      inspiration: input.inspiration,
      metadata: input.metadata,
      existingTaskItems: baseTaskItems,
    }),
    ...buildWeddingImportParserTaskItems({
      importParserReadiness: input.importParserReadiness,
      metadata: input.metadata,
      existingTaskItems: baseTaskItems,
    }),
    ...buildWeddingBackgroundAutomationTaskItems({
      backgroundAutomationCoverage: input.backgroundAutomationCoverage,
      metadata: input.metadata,
      existingTaskItems: baseTaskItems,
    }),
    ...buildWeddingDelegationTaskItems({
      delegation: input.delegation,
      metadata: input.metadata,
      existingTaskItems: baseTaskItems,
    }),
    ...buildWeddingFinalPhaseTaskItems({
      artifacts: input.artifacts,
      metadata: input.metadata,
      existingTaskItems: baseTaskItems,
    }),
    ...buildWeddingLegalAdministrationTaskItems({
      artifacts: input.artifacts,
      metadata: input.metadata,
      existingTaskItems: baseTaskItems,
    }),
    ...buildWeddingVendorSearchTaskItems({
      artifacts: input.artifacts,
      selectedDecisionItems: input.selectedDecisionItems,
      metadata: input.metadata,
      existingTaskItems: baseTaskItems,
    }),
    ...buildWeddingVendorLeadTimeTaskItems({
      weddingDateOrSeason: input.weddingDateOrSeason,
      selectedCategoryIds: input.vendorCategoryIds,
      skippedCategoryIds: input.skippedVendorCategoryIds,
      artifacts: input.artifacts,
      selectedDecisionItems: input.selectedDecisionItems,
      metadata: input.metadata,
      now: input.now,
      existingTaskItems: baseTaskItems,
    }),
    ...buildWeddingVendorSeedTaskItems({
      artifacts: input.artifacts,
      metadata: input.metadata,
      existingTaskItems: baseTaskItems,
    }),
    ...buildWeddingVendorContactOutreachTaskItems({
      vendors: input.weddingVendors,
      metadata: input.metadata,
      now: input.now,
      existingTaskItems: baseTaskItems,
    }),
    ...buildWeddingPostWeddingWrapUpTaskItems({
      artifacts: input.artifacts,
      metadata: input.metadata,
      existingTaskItems: baseTaskItems,
    }),
    ...buildWeddingVowPlanningTaskItems({
      artifacts: input.artifacts,
      metadata: input.metadata,
      existingTaskItems: baseTaskItems,
    }),
    ...buildWeddingOracleUpdateTaskItems({
      oracleUpdatePlan: input.oracleUpdatePlan,
      metadata: input.metadata,
      existingTaskItems: baseTaskItems,
    }),
    ...buildWeddingProviderHandoffTaskItems({
      approvalReceipts: input.approvalReceipts,
      metadata: input.metadata,
      existingTaskItems: baseTaskItems,
    }),
  ];
  return [
    ...baseTaskItems,
    ...(input.loopTaskItems ?? []),
    ...generatedTaskItems,
    ...(input.preparationTaskItems ?? []),
    ...(input.auditTaskItems ?? []),
  ];
}
