// @locs-version: 2.0
import type { WeddingArtifactInput, WeddingArtifactSourceLink, WeddingArtifactSummary } from "@/lib/weddingArtifactState";
import type { AfpMessage } from "@/lib/api";
import type { WeddingVendorRankingCardFields } from "@/lib/weddingVendorRankingState";
import type { WeddingIntegrationReadinessState, WeddingApprovalRequestState } from "@/lib/weddingApprovalState";
import {
  buildWeddingPacketExportCapabilityState,
  type WeddingArtifactExportManifest,
  type WeddingPacketExportCapabilityState,
} from "@/lib/weddingExportState";
import type { WeddingRecommendationExplanation, WeddingRecommendationExplanationState } from "@/lib/weddingRecommendationExplanationState";
import type { WeddingGeneratedArtifact } from "@/lib/weddingArtifactGenerationState";
import type { WeddingDecisionProjectionInput } from "@/lib/weddingDecisionAfpProjectionState";
import {
  buildWeddingDecisionSelectionState,
  loadWeddingDecisionSelections,
} from "@/lib/weddingDecisionSelectionState";
import type { WeddingPlanningScheduleItem, WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import type { WeddingNeedToKnowProjectionContext } from "@/lib/weddingNeedToKnowAfpProjectionState";
import type {
  WeddingPersistedApprovalReceipt,
  WeddingPersistedDecisionDeferral,
  WeddingPersistedDecisionRecord,
} from "@/lib/weddingPersistedWorkspaceState";
import type { WeddingSeatingDraftArchiveRecord } from "@/lib/weddingSeatingDraftArchiveState";
import {
  buildWeddingInspirationState,
  type WeddingInspirationItem,
  type WeddingInspirationState,
} from "@/lib/weddingInspirationState";
import {
  buildWeddingExperienceModelState,
  type WeddingExperienceModelState,
} from "@/lib/weddingExperienceModelState";
import type { WeddingProjectionQueueViewState } from "@/lib/weddingProjectionQueueViewState";
import { buildWeddingResponseWorkspaceProjectionQueueState } from "@/lib/weddingResponseWorkspaceProjectionQueueState";
import {
  buildWeddingArtifactPreviewState,
  type WeddingArtifactPreviewState,
} from "@/lib/weddingArtifactPreviewState";
import type { WeddingExpectedBehaviorAuditItem } from "@/lib/weddingExpectedBehaviorAuditState";
import { buildWeddingPreparationChecklistTaskItems } from "@/lib/weddingExpectedBehaviorTaskState";
import {
  buildWeddingWorkspaceBundleExportPayload,
  type WeddingWorkspaceBundleExportPayload,
} from "@/lib/weddingArtifactExportPayloadState";
import {
  buildWeddingResponseWorkspaceState,
  type WeddingResponseWorkspaceState,
} from "@/lib/weddingResponseWorkspaceState";
import {
  buildWeddingSecondOrderLoopCards,
  type WeddingSecondOrderLoopCard,
} from "@/lib/weddingSecondOrderLoopState";
import {
  buildWeddingAdminDataConsentState,
  type WeddingAdminDataConsentState,
} from "@/lib/weddingAdminDataConsentState";
import {
  buildWeddingDelegationState,
  type WeddingDelegateInput,
  type WeddingDelegationState,
} from "@/lib/weddingDelegationState";
import {
  buildWeddingGanttTimelineState,
  type WeddingGanttTimelineState,
} from "@/lib/weddingGanttTimelineState";
import {
  buildWeddingProviderHandoffAuditCard,
  type WeddingProviderHandoffAuditCard,
} from "@/lib/weddingProviderHandoffAuditState";
import {
  buildWeddingPersonalOsProjectionState,
  type WeddingPersonalOsProjectionState,
} from "@/lib/weddingPersonalOsProjectionState";
import {
  type WeddingOracleUpdatePlanState,
  buildWeddingResponseWorkspaceProductionReadinessState,
  type WeddingProductionGoNoGoPacketState,
  type WeddingProductionReadinessEvidenceState,
  type WeddingProductionRemainingWorkState,
  type WeddingProductionReadinessState,
  type WeddingWorkspaceProductionReadinessInput,
} from "@/lib/weddingResponseWorkspaceProductionReadinessState";
import { buildWeddingProjectionScheduleState } from "@/lib/weddingProjectionScheduleState";
import {
  buildWeddingBudgetTrackingState,
  type WeddingBudgetTrackingState,
} from "@/lib/weddingBudgetTrackingState";
import { loadWeddingBudgetAllocationPendingDecision } from "@/lib/weddingBudgetAllocationState";
import {
  buildWeddingGuestTrackingState,
  type WeddingGuestTrackingState,
} from "@/lib/weddingGuestTrackingState";
import { weddingEstimatedCostPerGuest } from "@/lib/weddingGuestBudgetImpactState";
import {
  buildWeddingSeatingPlanState,
  type WeddingSeatingPlanState,
} from "@/lib/weddingSeatingPlanState";
import {
  buildWeddingBackgroundAutomationCoverageState,
  type WeddingBackgroundAutomationCoverageState,
} from "@/lib/weddingBackgroundAutomationCoverageState";
import {
  buildWeddingImportParserReadinessState,
  type WeddingImportParserReadinessState,
} from "@/lib/weddingImportParserReadinessState";
import { buildWeddingWorkspaceGeneratedTaskItems } from "@/lib/weddingWorkspaceGeneratedTaskItemsState";
import type {
  WeddingOutreachEscalationStage,
  WeddingVendorContactOutreachVendor,
} from "@/lib/weddingOutreachEscalationState";
import {
  buildWeddingCollaborationState,
  type WeddingCollaboratorInviteInput,
  type WeddingCollaborationState,
} from "@/lib/weddingCollaborationState";
import {
  buildWeddingBoundaryState,
  type WeddingBoundaryLedgerObject,
  type WeddingBoundaryState,
} from "@/lib/weddingBoundaryLedgerState";
import {
  buildWeddingBoundaryTopologyState,
  type WeddingBoundaryTopologyState,
} from "@/lib/weddingBoundaryTopologyState";
import { buildWeddingBoundaryStarterObjects } from "@/lib/weddingBoundaryDefaultsState";
import {
  normalizeWeddingPlanningMetadata,
  type WeddingArtifactKind,
  type WeddingApprovalState,
} from "@/lib/weddingPlanningTemplateState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import type { WeddingSeatingConstraintAction } from "@/lib/weddingSeatingConstraintActionState";
import type { WeddingSeatingOptimizationResult } from "@/lib/weddingSeatingOptimizationState";
import {
  buildWeddingSeatingDraftCards,
  type WeddingSeatingDraftCard,
} from "@/lib/weddingSeatingDraftCardState";
import {
  buildWeddingResilienceDisplayState,
  type WeddingResilienceDisplayState,
} from "@/lib/weddingResilienceDisplayState";
import { buildWeddingResilienceLedgerState } from "@/lib/weddingResilienceLedgerState";
import type { WeddingVendorQuoteReplyFlowState } from "@/lib/weddingVendorQuoteReplyFlowState";
import {
  buildWeddingVendorQuoteAttachmentParserState,
  weddingVendorQuoteAttachmentParserStateWithExtractedEvidence,
  type WeddingVendorQuoteAttachmentParserState,
} from "@/lib/weddingVendorQuoteAttachmentParserState";
import {
  buildWeddingVendorPursuitLogCards,
  type WeddingVendorPursuitLogCard,
} from "@/lib/weddingVendorPursuitLogPresentationState";
import type { WeddingTemplateDeepLinkLaunchState } from "@/lib/weddingTemplateDeepLinkLaunchState";
import type { WeddingTemplateLaunchState } from "@/lib/weddingTemplateLaunchState";
import { shouldShowWeddingFirstRunIntake } from "@/lib/weddingFirstRunIntakeGateState";
import { buildWeddingTemplateProductionReadinessState } from "@/lib/weddingTemplateProductionReadinessState";
import {
  approvalReceiptCards,
  buildFilterChips,
  contextCards,
  decisionBundleScopes,
  decisionRecordCards,
  expectedBehaviorAuditCard,
  previewForArtifact,
  recommendationCards,
  sidebarActions,
  vendorContactCards,
  vendorQuoteReplyFlowsFromPreviews,
} from "@/lib/weddingResponseWorkspacePresentationState";

export type WeddingWorkspaceFilterKind =
  | "artifact_kind"
  | "approval_state"
  | "export_target"
  | "evidence_status"
  | "vendor"
  | "location";
export type WeddingWorkspaceFilterChip = {
  id: string;
  kind: WeddingWorkspaceFilterKind;
  label: string;
  query: string;
  count: number;
};
export type WeddingWorkspaceArtifactPreview = {
  artifactId: string;
  title: string;
  kind: WeddingArtifactKind;
  category: string;
  createdAt: number;
  approvalState: WeddingApprovalState;
  metadataLabels: string[];
  sourceLabels: string[];
  sourceLinks: WeddingArtifactSourceLink[];
  vendorComparisonHandoff: {
    recommendationLabel: string;
    whyLabels: string[];
    confidenceLabel: string;
    nextActionLabel: string;
  } | null;
  vendorComparisonCards: Array<{
    choiceId: string;
    rank: number;
    title: string;
    imageUrl: string | null;
    imageAlt: string | null;
    scoreLabel: string;
    provider: string;
    sourceUrl: string | null;
    websiteUrl: string | null;
    mapUrl: string | null;
    instagramUrl: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    rationaleLabels: string[];
    preferenceMatch: string;
    situationFit: string;
    verificationLabel: string;
  } & WeddingVendorRankingCardFields>;
  persistedSelectedVendorChoices: Array<{
    optionId: string;
    label: string;
  }>;
  a2uiContent: Record<string, unknown> | null;
  evidenceSummary: WeddingArtifactEvidenceSummary;
  bodyText: string | null;
  preview: WeddingArtifactPreviewState | null;
  exportManifest: WeddingArtifactExportManifest;
  approvalRequest: WeddingApprovalRequestState | null;
  integrationReadiness: WeddingIntegrationReadinessState;
  emptyBodyLabel: string;
};
export type WeddingArtifactEvidenceSummary = {
  statusLabel: string;
  sourceCountLabel: string;
  warningLabel: string | null;
  labels: string[];
};
export type WeddingNeedToKnowContextCard = {
  id: string;
  title: string;
  statusLabel: string;
  planningContext: WeddingNeedToKnowProjectionContext["planningContext"];
  answeredLabels: string[];
  nextQuestionLabel: string;
  metadataLabels: string[];
};
export type WeddingApprovalReceiptCard = {
  id: string;
  title: string;
  statusLabel: string;
  detailLabel: string;
  blockLabel: string | null;
  metadataLabels: string[];
  riskLabels: string[];
};
export type WeddingVendorContactWorkspaceCard = {
  id: string;
  vendorId: string | null;
  vendorName: string;
  categoryLabel: string;
  statusLabel: string;
  stage: WeddingOutreachEscalationStage;
  tone: "neutral" | "waiting" | "due" | "urgent" | "closed";
  detailLabel: string;
  nextActionLabel: string;
  primaryActionLabel: string;
  actionMode: "follow_up" | "waiting" | "reply_recorded";
  lastContactLabel: string | null;
  followUpDueLabel: string | null;
  replyLabel: string | null;
  metadataLabels: string[];
  contactChips: Array<{ kind: "address" | "email" | "phone"; label: string; value: string | null }>;
};
export type WeddingExpectedBehaviorAuditCard = {
  id: string;
  title: string;
  statusLabel: string;
  detailLabel: string;
  readyCountLabel: string;
  blockerCountLabel: string;
  readyItems: WeddingExpectedBehaviorAuditItem[];
  blockedItems: WeddingExpectedBehaviorAuditItem[];
  suggestedTaskItems: WeddingPlanningTaskItem[];
  metadataLabels: string[];
  action: WeddingWorkspaceSidebarAction;
};
export type WeddingDecisionRecordCard = {
  id: string;
  title: string;
  statusLabel: string;
  detailLabel: string;
  metadataLabels: string[];
  evidenceLabels: string[];
};
export type WeddingWorkspaceRecommendationCard = WeddingRecommendationExplanation & {
  graphAction: WeddingWorkspaceSidebarAction;
  graphContextLabels: string[];
};
export type WeddingResponseWorkspaceViewState = {
  workspace: WeddingResponseWorkspaceState;
  afpMessages: readonly AfpMessage[];
  categoryRail: Array<{ id: WeddingArtifactKind; label: string; count: number; active: boolean }>;
  filterChips: WeddingWorkspaceFilterChip[];
  artifactPreviews: WeddingWorkspaceArtifactPreview[];
  activePreview: WeddingWorkspaceArtifactPreview | null;
  bundleExportPayload: WeddingWorkspaceBundleExportPayload;
  htmlBundleExportPayload: WeddingWorkspaceBundleExportPayload;
  wordBundleExportPayload: WeddingWorkspaceBundleExportPayload;
  sensitiveBundleExportPayload: WeddingWorkspaceBundleExportPayload;
  sensitiveHtmlBundleExportPayload: WeddingWorkspaceBundleExportPayload;
  sensitiveWordBundleExportPayload: WeddingWorkspaceBundleExportPayload;
  packetExportCapability: WeddingPacketExportCapabilityState;
  contextCards: WeddingNeedToKnowContextCard[];
  approvalReceiptCards: WeddingApprovalReceiptCard[];
  vendorContactCards: WeddingVendorContactWorkspaceCard[];
  vendorQuoteReplyFlows: WeddingVendorQuoteReplyFlowState[];
  activeVendorQuoteReplyFlows: WeddingVendorQuoteReplyFlowState[];
  vendorQuoteReplyLogFlows: WeddingVendorQuoteReplyFlowState[];
  vendorQuoteAttachmentParserStates: WeddingVendorQuoteAttachmentParserState[];
  providerHandoffAuditCard: WeddingProviderHandoffAuditCard | null;
  expectedBehaviorAuditCard: WeddingExpectedBehaviorAuditCard;
  decisionRecordCards: WeddingDecisionRecordCard[];
  budgetTracking: WeddingBudgetTrackingState;
  guestTracking: WeddingGuestTrackingState;
  seatingPlan: WeddingSeatingPlanState;
  seatingDraftCards: WeddingSeatingDraftCard[];
  inspiration: WeddingInspirationState;
  experienceModel: WeddingExperienceModelState;
  importParserReadiness: WeddingImportParserReadinessState;
  backgroundAutomationCoverage: WeddingBackgroundAutomationCoverageState;
  collaboration: WeddingCollaborationState;
  boundaryState: WeddingBoundaryState;
  boundaryTopology: WeddingBoundaryTopologyState;
  planningTaskItems: WeddingPlanningTaskItem[];
  vendorPursuitLogTaskItems: WeddingPlanningTaskItem[];
  vendorPursuitLogCards: WeddingVendorPursuitLogCard[];
  helperContactNames: string[];
  recommendationCards: WeddingWorkspaceRecommendationCard[];
  secondOrderLoopCards: WeddingSecondOrderLoopCard[];
  adminDataConsent: WeddingAdminDataConsentState;
  delegation: WeddingDelegationState;
  ganttTimeline: WeddingGanttTimelineState;
  productionReadinessEvidence: WeddingProductionReadinessEvidenceState | null;
  productionGoNoGoPacket: WeddingProductionGoNoGoPacketState | null;
  productionReadiness: WeddingProductionReadinessState;
  productionRemainingWork: WeddingProductionRemainingWorkState;
  oracleUpdatePlan: WeddingOracleUpdatePlanState;
  personalOsProjection: WeddingPersonalOsProjectionState;
  resilience: WeddingResilienceDisplayState;
  projectionQueue: WeddingProjectionQueueViewState | null;
  sidebarActions: WeddingWorkspaceSidebarAction[];
  headerTitle: string;
  headerSubtitle: string;
};
function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isUserFacingWeddingPlanningTask(task: WeddingPlanningTaskItem): boolean {
  const metadata = record(task.metadata);
  return !(
    metadata.oracle_update_plan_task === true
    || metadata.background_automation_task === true
    || metadata.provider_handoff_task === true
    || metadata.expected_behavior_gap === true
  );
}

function isClosedVendorPursuitTask(task: WeddingPlanningTaskItem): boolean {
  const metadata = record(task.metadata);
  return metadata.vendor_outreach_pursuit_status === "not_pursuing"
    || (
      metadata.outreach_escalation_stage === "closed"
      && Boolean(clean(metadata.vendor_outreach_line_item_id))
      && task.reviewStatus === "ignored"
    );
}

function closedVendorPursuitLineItemIds(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const ids = new Set<string>();
  for (const task of taskItems) {
    if (!isClosedVendorPursuitTask(task)) continue;
    const metadata = record(task.metadata);
    const lineItemId = clean(metadata.vendor_outreach_line_item_id) || clean(metadata.budget_line_item_id);
    if (lineItemId) ids.add(lineItemId);
  }
  return ids;
}

function uniqueHelperNames(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const label = clean(value);
    const key = label.toLowerCase();
    if (!label || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result.slice(0, 40);
}

function weddingHelperContactNamesFromAfpMessages(messages: readonly AfpMessage[] | null | undefined): string[] {
  return uniqueHelperNames((messages ?? []).flatMap((message) => {
    const content = record(message.content);
    const metadata = record(message.metadata);
    const supertags = message.supertags ?? [];
    const isHelperContact = message.kind === "wedding_helper_contact"
      || message.subtype === "wedding_helper_contact_upsert"
      || supertags.includes("wedding_helper_contact");
    if (!isHelperContact) return [];
    return [
      content.name,
      content.helper_name,
      metadata.helper_name,
      metadata.contact_name,
    ];
  }));
}

function parsedDocumentAttachmentEvidenceFromAfpMessages(
  messages: readonly AfpMessage[] | null | undefined,
): Map<string, string[]> {
  const evidence = new Map<string, string[]>();
  for (const message of messages ?? []) {
    const content = record(message.content);
    const metadata = record(message.metadata);
    const tokens = [
      message.type,
      message.kind,
      message.subtype,
      ...(Array.isArray(message.supertags) ? message.supertags : []),
    ].map((value) => clean(value).toLowerCase()).join(" ");
    if (!tokens.includes("parsed_document")) continue;
    const parsed = record(content.parsed_document);
    const attachmentId = clean(content.source_attachment_id)
      || clean(parsed.source_attachment_id)
      || clean(metadata.source_attachment_id);
    if (!attachmentId) continue;
    const parserLabel = clean(content.parser_used)
      || clean(parsed.parser_used)
      || clean(metadata.extraction_mode)
      || "document parser";
    const title = clean(content.title) || clean(parsed.title) || clean(metadata.source_file_name);
    const labels = [
      `Extracted by ${parserLabel}.`,
      title ? `Parsed source: ${title}.` : null,
    ].filter((label): label is string => Boolean(label));
    evidence.set(attachmentId, [...(evidence.get(attachmentId) ?? []), ...labels]);
  }
  return evidence;
}

function guestNamesFromArtifacts(artifacts: readonly WeddingArtifactInput[]): string[] {
  return artifacts
    .filter((artifact) => artifact.kind === "guest_list")
    .flatMap((artifact) => {
      const body = clean(artifact.bodyText);
      const lines = body.split(/\r?\n/).filter((line) => line.trim().startsWith("|"));
      if (lines.length < 3) return [];
      const headers = lines[0]!.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
      const nameIndex = headers.findIndex((header) => /\b(name|guest)\b/i.test(header));
      if (nameIndex < 0) return [];
      return lines.slice(2).map((line) => line.replace(/^\|/, "").replace(/\|$/, "").split("|")[nameIndex]?.trim());
    });
}

function usableSourceUrls(values: readonly unknown[] | null | undefined): string[] {
  return (values ?? [])
    .map((value) => clean(value))
    .filter(remoteHttpUrl);
}

function remoteHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return hostname !== "localhost"
      && hostname !== "127.0.0.1"
      && hostname !== "0.0.0.0"
      && hostname !== "::1"
      && hostname !== "[::1]";
  } catch {
    return false;
  }
}

function privateImportSourceUrl(value: string): boolean {
  return /\b(?:upload|uploads|attachment|attachments|storage|parser|source-file|source_file)\b/i.test(value)
    || /\b[^/?#]+\.(?:csv|tsv|xlsx?|ods)(?:$|[?#/])/i.test(value);
}

function firstWeddingPlanningContextValue(
  contexts: readonly WeddingNeedToKnowProjectionContext[] | null | undefined,
  key: "dateOrSeason" | "vendorCategories",
): unknown {
  for (const context of contexts ?? []) {
    const value = context.planningContext?.[key];
    if (Array.isArray(value) ? value.length > 0 : clean(value)) return value;
  }
  return null;
}

function decisionProjectionItems(
  artifacts: readonly WeddingArtifactInput[],
  experienceModel?: Pick<WeddingExperienceModelState, "traits"> | null,
  storage?: Storage | null,
): WeddingDecisionProjectionInput[] {
  return artifacts.flatMap((artifact): WeddingDecisionProjectionInput[] => {
    const artifactId = clean(artifact.id);
    const artifactTitle = clean(artifact.title);
    const artifactKind = artifact.kind;
    const bodyText = clean(artifact.bodyText);
    if (!artifactId || !artifactTitle || !artifactKind || !bodyText) return [];
    const preview = buildWeddingArtifactPreviewState({
      artifactKind,
      bodyText,
    });
    if (!preview || preview.kind !== "table") return [];
    const selectedOptionIds = loadWeddingDecisionSelections(artifactId, storage);
    if (selectedOptionIds.length === 0) return [];
    const decision = buildWeddingDecisionSelectionState({
      artifactId,
      artifactKind,
      table: preview,
      selectedOptionIds,
      preferenceText: bodyText,
      experienceModel,
    });
    if (decision.selectedOptions.length === 0) return [];
    return decision.selectedOptions.map((selectedOption) => ({
      id: `wedding_decision:${artifactId}:${selectedOption.id}`,
      metadata: artifact.metadata,
      artifactId,
      artifactTitle,
      artifactKind,
      sourceLabels: artifact.sourceLabels ?? [],
      sourceUrls: (artifact.sourceLinks ?? []).map((source) => source.url),
      sourceProviderLabels: Array.isArray((artifact.metadata as Record<string, unknown>).sourceProviderLabels)
        ? (artifact.metadata as Record<string, unknown>).sourceProviderLabels as string[]
        : [],
      sourceCountsByProvider: (artifact.metadata as Record<string, unknown>).sourceCountsByProvider && typeof (artifact.metadata as Record<string, unknown>).sourceCountsByProvider === "object"
        ? (artifact.metadata as Record<string, unknown>).sourceCountsByProvider as Record<string, unknown>
        : null,
      selectedOption,
      source: "local_selection",
    }));
  });
}

export type WeddingResponseWorkspaceViewInput = WeddingWorkspaceProductionReadinessInput & {
  metadata?: unknown;
  artifacts?: readonly WeddingArtifactInput[] | null;
  query?: string | null;
  activeArtifactId?: string | null;
  adminDataConsentEnabled?: boolean | null;
  collaboratorInvites?: readonly WeddingCollaboratorInviteInput[] | null;
  boundaryObjects?: readonly WeddingBoundaryLedgerObject[] | null;
  seatingConstraints?: readonly WeddingSeatingConstraintAction[] | null;
  seatingOptimizations?: readonly WeddingSeatingOptimizationResult[] | null;
  seatingDraftArchives?: readonly WeddingSeatingDraftArchiveRecord[] | null;
  inspirationItems?: readonly WeddingInspirationItem[] | null;
  collaborationBackendReady?: boolean | null;
  collaborationEncryptionReady?: boolean | null;
  collaborationAuditReady?: boolean | null;
  collaborationConflictPolicyReady?: boolean | null;
  delegatedResponsibilities?: readonly WeddingDelegateInput[] | null;
  ganttCategoryColors?: Record<string, string> | null;
  recommendations?: WeddingRecommendationExplanationState | null;
  contextItems?: readonly WeddingNeedToKnowProjectionContext[] | null;
  approvalReceipts?: readonly WeddingPersistedApprovalReceipt[] | null;
  decisionRecords?: readonly WeddingPersistedDecisionRecord[] | null;
  decisionDeferrals?: readonly WeddingPersistedDecisionDeferral[] | null;
  generatedArtifacts?: readonly WeddingGeneratedArtifact[] | null;
  scheduleItems?: readonly WeddingPlanningScheduleItem[] | null;
  taskItems?: readonly WeddingPlanningTaskItem[] | null;
  weddingVendors?: readonly WeddingVendorContactOutreachVendor[] | null;
  afpMessages?: readonly AfpMessage[] | null;
  weddingImportBinaryParserReady?: boolean | null;
  templateDeepLinkLaunch?: WeddingTemplateDeepLinkLaunchState | null;
  templateLaunch?: WeddingTemplateLaunchState | null;
  hasTemplateLaunch?: boolean | null;
  hasPersistedWorkspaceContent?: boolean | null;
  followUpRequested?: boolean | null;
  templateLaunchProofRef?: string | null;
  templateLaunchProofReferencePolicy?: "optional" | "required" | null;
  nowIso?: string | null;
  projectionStorage?: Storage | null;
};

function derivedTemplateLaunchReadiness(input: WeddingResponseWorkspaceViewInput) {
  if (input.productionReadinessEvidence?.templateLaunchReadiness) {
    return input.productionReadinessEvidence.templateLaunchReadiness;
  }
  if (!input.templateDeepLinkLaunch && !input.templateLaunch && input.hasTemplateLaunch !== true) return null;
  const hasPersistedWorkspaceContent = input.hasPersistedWorkspaceContent
    ?? Boolean((input.artifacts ?? []).length || (input.generatedArtifacts ?? []).length);
  return buildWeddingTemplateProductionReadinessState({
    deepLinkLaunch: input.templateDeepLinkLaunch,
    templateLaunch: input.templateLaunch,
    firstRunIntakeVisible: shouldShowWeddingFirstRunIntake({
      hasTemplateLaunch: input.hasTemplateLaunch ?? Boolean(input.templateDeepLinkLaunch || input.templateLaunch),
      hasPersistedWorkspaceContent,
      followUpRequested: input.followUpRequested === true,
    }),
    proofReferencePolicy: input.templateLaunchProofReferencePolicy,
    proofRef: input.templateLaunchProofRef,
  });
}

export function buildWeddingResponseWorkspaceViewState(input: WeddingResponseWorkspaceViewInput): WeddingResponseWorkspaceViewState {
  const artifacts = input.artifacts ?? [];
  const generatedArtifacts = input.generatedArtifacts ?? [];
  const scheduleItems = input.scheduleItems ?? [];
  const taskItems = input.taskItems ?? [];
  const projectionSchedule = buildWeddingProjectionScheduleState({
    scheduleItems,
    taskItems,
  });
  const projectionScheduleItems = projectionSchedule.scheduleItems;
  const workspace = buildWeddingResponseWorkspaceState(input);
  const adminDataConsent = buildWeddingAdminDataConsentState({
    enabled: input.adminDataConsentEnabled,
    workspaceId: workspace.metadata.responseWorkspaceId,
    planId: workspace.metadata.weddingPlanId,
    submittedResponseCount: artifacts.length,
  });
  const delegation = buildWeddingDelegationState(input.delegatedResponsibilities ?? []);
  const ganttTimeline = buildWeddingGanttTimelineState({
    categoryColors: input.ganttCategoryColors,
    items: [
      ...projectionScheduleItems.map((item) => ({
        id: item.id,
        title: item.title,
        category: item.kind,
        startAt: item.startAt,
        endAt: item.endAt,
        dueLabel: item.dateLabel,
        status: item.reviewStatus ?? item.approvalState ?? null,
        linkedArtifactId: item.linkedArtifactId,
      })),
      ...taskItems.map((item) => ({
        id: item.id,
        title: item.title,
        category: item.kind,
        dueDate: item.dueAt,
        dueLabel: item.dueLabel,
        status: item.reviewStatus ?? item.approvalState ?? item.priority ?? null,
        linkedArtifactId: item.linkedArtifactId,
      })),
    ],
  });
  const activePreview = previewForArtifact(workspace.activeArtifact, artifacts, input.decisionRecords);
  const artifactPreviews = workspace.results
    .map((artifact) => previewForArtifact(artifact, artifacts, input.decisionRecords))
    .filter((preview): preview is WeddingWorkspaceArtifactPreview => preview !== null);
  const vendorQuoteReplyFlows = vendorQuoteReplyFlowsFromPreviews({
    previews: artifactPreviews,
    metadata: input.metadata ?? artifacts[0]?.metadata,
    approvalReceipts: input.approvalReceipts,
  });
  const activeVendorQuoteReplyFlows = vendorQuoteReplyFlows.filter((flow) => flow.stage !== "sent");
  const vendorQuoteReplyLogFlows = vendorQuoteReplyFlows.filter((flow) => flow.stage === "sent");
  const responseWorkspaceId = normalizeWeddingPlanningMetadata(input.metadata ?? artifacts[0]?.metadata).responseWorkspaceId;
  const parsedDocumentAttachmentEvidence = parsedDocumentAttachmentEvidenceFromAfpMessages(input.afpMessages);
  const vendorQuoteAttachmentParserStates = (input.afpMessages ?? [])
    .filter((message) => {
      const scopedToWorkspace = message.thread_id.includes(responseWorkspaceId)
        || message.metadata?.response_workspace_id === responseWorkspaceId
        || message.metadata?.responseWorkspaceId === responseWorkspaceId
        || record(message.content).response_workspace_id === responseWorkspaceId;
      const tokens = [
        message.type,
        message.kind,
        message.subtype,
        ...(Array.isArray(message.supertags) ? message.supertags : []),
      ].map((value) => clean(value).toLowerCase()).join(" ");
      return scopedToWorkspace && tokens.includes("wedding_vendor_quote_received");
    })
    .map(buildWeddingVendorQuoteAttachmentParserState)
    .map((parser) => {
      const attachmentId = parser.attachmentId ?? "";
      const evidenceLabels = attachmentId ? parsedDocumentAttachmentEvidence.get(attachmentId) : null;
      return evidenceLabels
        ? weddingVendorQuoteAttachmentParserStateWithExtractedEvidence(parser, evidenceLabels)
        : parser;
    });
  const decisionScopes = decisionBundleScopes(input.decisionRecords);
  const packetExportCapability = buildWeddingPacketExportCapabilityState({
    title: "Wedding planning bundle",
  });
  const cards = recommendationCards(input.recommendations?.recommendations ?? []);
  const inspiration = buildWeddingInspirationState(input.inspirationItems);
  const experienceModel = buildWeddingExperienceModelState(inspiration);
  const decisions = decisionProjectionItems(artifacts, experienceModel, input.projectionStorage);
  const closedVendorLineItemIds = closedVendorPursuitLineItemIds(taskItems);
  const activeDecisions = decisions.filter((decision) => !closedVendorLineItemIds.has(clean(decision.id)));
  const activeDecisionRecords = (input.decisionRecords ?? []).filter((decision) =>
    !closedVendorLineItemIds.has(clean(decision.id))
  );
  const metadataForLocalState = normalizeWeddingPlanningMetadata(input.metadata ?? artifacts[0]?.metadata);
  const localBudgetDecision = input.projectionStorage
    ? loadWeddingBudgetAllocationPendingDecision(metadataForLocalState.weddingPlanId, input.projectionStorage)
    : null;
  const budgetDecisionItems = localBudgetDecision
    ? [...activeDecisions, localBudgetDecision]
    : activeDecisions;
  const budgetTracking = buildWeddingBudgetTrackingState({
    decisionRecords: activeDecisionRecords,
    selectedDecisionItems: budgetDecisionItems,
    artifacts,
  });
  const persistedBoundaryObjects = input.boundaryObjects ?? null;
  const guestTrackingWithoutBudget = buildWeddingGuestTrackingState({
    artifacts,
    boundaryObjects: persistedBoundaryObjects,
  });
  const guestTracking = buildWeddingGuestTrackingState({
    artifacts,
    boundaryObjects: persistedBoundaryObjects,
    estimatedCostPerGuest: weddingEstimatedCostPerGuest({
      budgetTracking,
      guestTracking: guestTrackingWithoutBudget,
    }),
  });
  const seatingPlan = buildWeddingSeatingPlanState({
    artifacts,
    boundaryObjects: persistedBoundaryObjects,
    seatingConstraints: input.seatingConstraints,
    seatingOptimizations: input.seatingOptimizations,
    guestTracking,
  });
  const importParserReadiness = buildWeddingImportParserReadinessState({
    artifacts,
    binarySpreadsheetParserReady: input.weddingImportBinaryParserReady,
  });
  const backgroundAutomationCoverage = buildWeddingBackgroundAutomationCoverageState({
    guestTracking,
    budgetTracking,
    seatingPlan,
    approvalReceipts: input.approvalReceipts,
    scheduleItems: projectionScheduleItems,
  });
  const collaboration = buildWeddingCollaborationState({ invites: input.collaboratorInvites, backendReady: input.collaborationBackendReady, encryptionReady: input.collaborationEncryptionReady, auditReady: input.collaborationAuditReady, conflictPolicyReady: input.collaborationConflictPolicyReady });
  const helperContactNames = uniqueHelperNames([
    ...delegation.items.map((item) => item.personName),
    ...collaboration.invites.map((invite) => invite.displayName),
    ...weddingHelperContactNamesFromAfpMessages(input.afpMessages),
    ...taskItems.map((item) => item.assignee),
    ...guestNamesFromArtifacts(artifacts),
  ]);
  const boundaryObjects = input.boundaryObjects ?? buildWeddingBoundaryStarterObjects({
    metadata: input.metadata ?? artifacts[0]?.metadata,
    guestNames: guestNamesFromArtifacts(artifacts),
    helperNames: helperContactNames,
    collaboratorInvites: collaboration.invites,
  });
  const boundaryState = buildWeddingBoundaryState({
    metadata: input.metadata ?? artifacts[0]?.metadata,
    objects: boundaryObjects,
  });
  const boundaryTopology = buildWeddingBoundaryTopologyState({
    metadata: input.metadata ?? artifacts[0]?.metadata,
    objects: boundaryObjects,
  });
  const loopCards = buildWeddingSecondOrderLoopCards({
    metadata: input.metadata,
    artifacts,
    taskItems,
    scheduleItems: projectionScheduleItems,
    approvalReceipts: input.approvalReceipts,
    decisionRecords: input.decisionRecords,
  });
  const loopTaskItems = loopCards.flatMap((card): WeddingPlanningTaskItem[] => card.suggestedTask ? [card.suggestedTask] : []);
  const preparationTaskItems = buildWeddingPreparationChecklistTaskItems({
    metadata: input.metadata ?? artifacts[0]?.metadata,
    existingTaskItems: taskItems,
  });
  const auditCard = expectedBehaviorAuditCard({
    artifacts,
    artifactSummaries: workspace.artifacts,
    contextItems: input.contextItems,
    approvalReceipts: input.approvalReceipts,
    decisionRecords: input.decisionRecords,
    scheduleItems,
    taskItems,
    secondOrderLoopCards: loopCards,
  });
  const {
    productionReadinessEvidence,
    productionGoNoGoPacket,
    productionReadiness,
    productionRemainingWork,
    oracleUpdatePlan,
  } = buildWeddingResponseWorkspaceProductionReadinessState({
    ...input,
    productionReadinessEvidence: {
      ...(input.productionReadinessEvidence ?? {}),
      importParserReadiness,
      templateLaunchReadiness: derivedTemplateLaunchReadiness(input),
    },
  });
  const projectionTaskItems = buildWeddingWorkspaceGeneratedTaskItems({
    artifacts,
    selectedDecisionItems: activeDecisions,
    baseTaskItems: taskItems,
    loopTaskItems,
    budgetTracking,
    guestTracking,
    seatingPlan,
    inspiration,
    importParserReadiness,
    backgroundAutomationCoverage,
    delegation,
    preparationTaskItems,
    auditTaskItems: auditCard.suggestedTaskItems,
    oracleUpdatePlan,
    productionRemainingWork,
    approvalReceipts: input.approvalReceipts,
    weddingVendors: input.weddingVendors,
    weddingDateOrSeason: clean(firstWeddingPlanningContextValue(input.contextItems, "dateOrSeason")),
    vendorCategoryIds: Array.isArray(firstWeddingPlanningContextValue(input.contextItems, "vendorCategories"))
      ? firstWeddingPlanningContextValue(input.contextItems, "vendorCategories") as readonly unknown[]
      : [],
    now: input.nowIso,
    metadata: input.metadata ?? artifacts[0]?.metadata,
  });
  const activeProjectionTaskItems = projectionTaskItems.filter((task) => !isClosedVendorPursuitTask(task));
  const userFacingProjectionTaskItems = activeProjectionTaskItems.filter(isUserFacingWeddingPlanningTask);
  const vendorPursuitLogTaskItems = projectionTaskItems.filter(isClosedVendorPursuitTask);
  const vendorPursuitLogCards = buildWeddingVendorPursuitLogCards(vendorPursuitLogTaskItems);
  const personalOsProjection = buildWeddingPersonalOsProjectionState({
    taskItems: userFacingProjectionTaskItems,
    scheduleItems: projectionScheduleItems,
    decisionItems: activeDecisions,
    approvalReceipts: input.approvalReceipts,
    decisionDeferrals: input.decisionDeferrals,
    now: input.nowIso ? new Date(input.nowIso) : null,
    limit: 40,
  });
  const resilience = buildWeddingResilienceDisplayState(buildWeddingResilienceLedgerState({
    messages: input.afpMessages,
    responseWorkspaceId: workspace.metadata.responseWorkspaceId,
  }));
  const decisionFocus = {
    summaryLabel: personalOsProjection.decisionLoadRelief.summaryLabel,
    backlogCount: personalOsProjection.decisionLoadRelief.backlogCount,
    focusItems: personalOsProjection.decisionLoadRelief.focusItems.map((item) => ({
      title: item.title,
      pressureFamily: item.pressureFamily,
      sourceSurface: item.sourceSurface,
      dueLabel: item.dueLabel,
      evidenceLabels: item.evidenceLabels,
    })),
    reliefLabels: personalOsProjection.decisionLoadRelief.reliefLabels,
  };
  const bundleExportPayload = buildWeddingWorkspaceBundleExportPayload({
    title: "Wedding planning bundle",
    artifacts,
    decisionScopes,
    decisionFocus,
    targetId: "markdown",
  });
  const htmlBundleExportPayload = buildWeddingWorkspaceBundleExportPayload({
    title: "Wedding planning bundle",
    artifacts,
    decisionScopes,
    decisionFocus,
    targetId: "html",
  });
  const wordBundleExportPayload = buildWeddingWorkspaceBundleExportPayload({
    title: "Wedding planning bundle",
    artifacts,
    decisionScopes,
    decisionFocus,
    targetId: "word_doc",
  });
  const sensitiveBundleExportPayload = buildWeddingWorkspaceBundleExportPayload({
    title: "Wedding planning bundle",
    artifacts,
    includeSensitive: true,
    decisionScopes,
    decisionFocus,
    targetId: "markdown",
  });
  const sensitiveHtmlBundleExportPayload = buildWeddingWorkspaceBundleExportPayload({
    title: "Wedding planning bundle",
    artifacts,
    includeSensitive: true,
    decisionScopes,
    decisionFocus,
    targetId: "html",
  });
  const sensitiveWordBundleExportPayload = buildWeddingWorkspaceBundleExportPayload({
    title: "Wedding planning bundle",
    artifacts,
    includeSensitive: true,
    decisionScopes,
    decisionFocus,
    targetId: "word_doc",
  });
  const projectionQueue = buildWeddingResponseWorkspaceProjectionQueueState({
    contextItems: input.contextItems,
    decisionItems: activeDecisions,
    artifacts: generatedArtifacts,
    scheduleItems: projectionScheduleItems,
    taskItems: activeProjectionTaskItems,
    collaborationInvites: collaboration.invites,
    collaborationMetadata: input.metadata ?? artifacts[0]?.metadata,
    boundaryObjects,
    boundaryMetadata: input.metadata ?? artifacts[0]?.metadata,
    nowIso: input.nowIso,
    storage: input.projectionStorage,
  });

  return {
    workspace,
    afpMessages: input.afpMessages ?? [],
    categoryRail: workspace.categories.map((category) => ({
      id: category.id,
      label: category.label,
      count: category.count,
      active: category.artifacts.some((artifact) => artifact.id === workspace.activeArtifact?.id),
    })),
    filterChips: buildFilterChips(workspace.results),
    artifactPreviews,
    activePreview,
    bundleExportPayload,
    htmlBundleExportPayload,
    wordBundleExportPayload,
    sensitiveBundleExportPayload,
    sensitiveHtmlBundleExportPayload,
    sensitiveWordBundleExportPayload,
    packetExportCapability,
    contextCards: contextCards(input.contextItems),
    approvalReceiptCards: approvalReceiptCards(input.approvalReceipts),
    vendorContactCards: vendorContactCards({
      metadata: input.metadata ?? artifacts[0]?.metadata,
      vendors: input.weddingVendors,
      nowIso: input.nowIso,
    }),
    vendorQuoteReplyFlows,
    activeVendorQuoteReplyFlows,
    vendorQuoteReplyLogFlows,
    vendorQuoteAttachmentParserStates,
    providerHandoffAuditCard: buildWeddingProviderHandoffAuditCard(input.approvalReceipts),
    expectedBehaviorAuditCard: auditCard,
    decisionRecordCards: decisionRecordCards(input.decisionRecords),
    budgetTracking,
    guestTracking,
    seatingPlan,
    seatingDraftCards: buildWeddingSeatingDraftCards(
      input.seatingOptimizations,
      input.seatingDraftArchives?.map((archive) => archive.fingerprint),
    ),
    inspiration,
    experienceModel,
    importParserReadiness,
    backgroundAutomationCoverage,
    collaboration,
    boundaryState,
    boundaryTopology,
    planningTaskItems: userFacingProjectionTaskItems,
    vendorPursuitLogTaskItems,
    vendorPursuitLogCards,
    helperContactNames,
    recommendationCards: cards,
    secondOrderLoopCards: loopCards,
    adminDataConsent,
    delegation,
    ganttTimeline,
    productionReadinessEvidence,
    productionGoNoGoPacket,
    productionReadiness,
    productionRemainingWork,
    oracleUpdatePlan,
    personalOsProjection,
    resilience,
    projectionQueue,
    sidebarActions: sidebarActions({
      workspace,
      preview: activePreview,
      recommendations: cards,
      decisionRecords: input.decisionRecords,
    }),
    headerTitle: "Wedding documents",
    headerSubtitle: workspace.summaryLabel,
  };
}
