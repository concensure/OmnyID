// @locs-version: 2.0
import {
  weddingArtifactEvidenceStatus,
  type WeddingArtifactSourceLink,
  type WeddingArtifactSummary,
} from "@/lib/weddingArtifactState";
import {
  buildWeddingApprovalRequestState,
  buildWeddingIntegrationReadinessState,
  type WeddingIntegrationReadinessState,
  type WeddingApprovalRequestState,
} from "@/lib/weddingApprovalState";
import {
  buildWeddingArtifactExportManifest,
  buildWeddingPacketExportCapabilityState,
  type WeddingArtifactExportManifest,
  type WeddingPacketExportCapabilityState,
} from "@/lib/weddingExportState";
import type {
  WeddingRecommendationExplanation,
  WeddingRecommendationExplanationState,
} from "@/lib/weddingRecommendationExplanationState";
import type { WeddingGeneratedArtifact } from "@/lib/weddingArtifactGenerationState";
import type { WeddingDecisionProjectionInput } from "@/lib/weddingDecisionAfpProjectionState";
import {
  buildWeddingDecisionSelectionState,
  loadWeddingDecisionSelection,
} from "@/lib/weddingDecisionSelectionState";
import type {
  WeddingPlanningScheduleItem,
  WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";
import type { WeddingNeedToKnowProjectionContext } from "@/lib/weddingNeedToKnowAfpProjectionState";
import type {
  WeddingPersistedApprovalReceipt,
  WeddingPersistedDecisionRecord,
} from "@/lib/weddingPersistedWorkspaceState";
import type { WeddingProjectionQueueViewState } from "@/lib/weddingProjectionQueueViewState";
import { buildWeddingResponseWorkspaceProjectionQueueState } from "@/lib/weddingResponseWorkspaceProjectionQueueState";
import {
  buildWeddingArtifactPreviewState,
  type WeddingArtifactPreviewState,
} from "@/lib/weddingArtifactPreviewState";
import {
  buildWeddingExpectedBehaviorAuditState,
  type WeddingExpectedBehaviorAuditItem,
} from "@/lib/weddingExpectedBehaviorAuditState";
import {
  buildWeddingExpectedBehaviorTaskItems,
  buildWeddingPreparationChecklistTaskItems,
} from "@/lib/weddingExpectedBehaviorTaskState";
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
  type WeddingProductionReadinessState,
  type WeddingWorkspaceProductionReadinessInput,
} from "@/lib/weddingResponseWorkspaceProductionReadinessState";
import { buildWeddingProjectionScheduleState } from "@/lib/weddingProjectionScheduleState";
import {
  buildWeddingBudgetTrackingState,
  type WeddingBudgetTrackingState,
} from "@/lib/weddingBudgetTrackingState";
import {
  buildWeddingGuestTrackingState,
  type WeddingGuestTrackingState,
} from "@/lib/weddingGuestTrackingState";
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
import {
  buildWeddingOutreachEscalationStateFromVendorContact,
  type WeddingOutreachEscalationStage,
  type WeddingVendorContactOutreachVendor,
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
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";
import type { WeddingArtifactKind, WeddingApprovalState } from "@/lib/weddingPlanningTemplateState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";

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
  approvalState: WeddingApprovalState;
  metadataLabels: string[];
  sourceLabels: string[];
  sourceLinks: WeddingArtifactSourceLink[];
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
  metadataLabels: string[];
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
  categoryRail: Array<{ id: WeddingArtifactKind; label: string; count: number; active: boolean }>;
  filterChips: WeddingWorkspaceFilterChip[];
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
  providerHandoffAuditCard: WeddingProviderHandoffAuditCard | null;
  expectedBehaviorAuditCard: WeddingExpectedBehaviorAuditCard;
  decisionRecordCards: WeddingDecisionRecordCard[];
  budgetTracking: WeddingBudgetTrackingState;
  guestTracking: WeddingGuestTrackingState;
  seatingPlan: WeddingSeatingPlanState;
  importParserReadiness: WeddingImportParserReadinessState;
  backgroundAutomationCoverage: WeddingBackgroundAutomationCoverageState;
  collaboration: WeddingCollaborationState;
  boundaryState: WeddingBoundaryState;
  boundaryTopology: WeddingBoundaryTopologyState;
  planningTaskItems: WeddingPlanningTaskItem[];
  helperContactNames: string[];
  recommendationCards: WeddingWorkspaceRecommendationCard[];
  secondOrderLoopCards: WeddingSecondOrderLoopCard[];
  adminDataConsent: WeddingAdminDataConsentState;
  delegation: WeddingDelegationState;
  ganttTimeline: WeddingGanttTimelineState;
  productionReadinessEvidence: WeddingProductionReadinessEvidenceState | null;
  productionGoNoGoPacket: WeddingProductionGoNoGoPacketState | null;
  productionReadiness: WeddingProductionReadinessState;
  oracleUpdatePlan: WeddingOracleUpdatePlanState;
  personalOsProjection: WeddingPersonalOsProjectionState;
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
    .filter((value) => /^https?:\/\//i.test(value));
}

function privateImportSourceUrl(value: string): boolean {
  return /\b(?:upload|uploads|attachment|attachments|storage|parser|source-file|source_file)\b/i.test(value)
    || /\b[^/?#]+\.(?:csv|tsv|xlsx?|ods)(?:$|[?#/])/i.test(value);
}
function labelForKind(kind: WeddingWorkspaceFilterKind, value: string): string {
  if (kind === "artifact_kind") return value.replace(/_/g, " ");
  if (kind === "approval_state") return value.replace(/_/g, " ");
  if (kind === "export_target") return value.replace(/_/g, " ");
  if (kind === "evidence_status") return value.replace(/_/g, " ");
  return value;
}

function chipsFromValues(
  artifacts: readonly WeddingArtifactSummary[],
  kind: WeddingWorkspaceFilterKind,
  valuesFor: (artifact: WeddingArtifactSummary) => readonly string[],
): WeddingWorkspaceFilterChip[] {
  const counts = new Map<string, number>();
  for (const artifact of artifacts) {
    for (const value of valuesFor(artifact).map(clean).filter(Boolean)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 16)
    .map(([value, count]) => ({
      id: `${kind}:${value}`,
      kind,
      label: labelForKind(kind, value),
      query: value,
      count,
    }));
}

function buildFilterChips(artifacts: readonly WeddingArtifactSummary[]): WeddingWorkspaceFilterChip[] {
  return [
    ...chipsFromValues(artifacts, "artifact_kind", (artifact) => [artifact.kind]),
    ...chipsFromValues(artifacts, "approval_state", (artifact) => [artifact.approvalState]),
    ...chipsFromValues(artifacts, "export_target", (artifact) => artifact.exportTargets),
    ...chipsFromValues(artifacts, "evidence_status", (artifact) => [weddingArtifactEvidenceStatus(artifact)]),
    ...chipsFromValues(artifacts, "vendor", (artifact) => artifact.vendorLabels),
    ...chipsFromValues(artifacts, "location", (artifact) => artifact.locationLabels),
  ];
}

function contextCards(contextItems: readonly WeddingNeedToKnowProjectionContext[] | null | undefined): WeddingNeedToKnowContextCard[] {
  return (contextItems ?? []).slice(0, 4).map((item) => ({
    id: item.metadata.responseWorkspaceId,
    title: "Key wedding details",
    statusLabel: item.projectionSaved
      ? "Saved context"
      : item.readyForFirstRecommendations ? "Ready for recommendations" : "Needs more context",
    answeredLabels: item.answeredLabels.slice(0, 8),
    nextQuestionLabel: item.nextQuestionLabel,
    metadataLabels: [
      item.metadata.weddingPlanId,
      item.metadata.responseWorkspaceId,
      item.readyForFirstRecommendations ? "recommendations ready" : "recommendations not ready",
    ],
  }));
}

function approvalReceiptCards(receipts: readonly WeddingPersistedApprovalReceipt[] | null | undefined): WeddingApprovalReceiptCard[] {
  return (receipts ?? []).slice(0, 5).map((receipt) => ({
    id: receipt.id,
    title: receipt.title,
    statusLabel: receipt.status === "executed" ? "Executed" : "Blocked",
    detailLabel: receipt.externalId
      ? `External ID: ${receipt.externalId}`
      : receipt.blockedReason ?? `${receipt.actionKind.replace(/_/g, " ")} at ${receipt.createdAt}`,
    blockLabel: receipt.blockKind ? receipt.blockKind.replace(/_/g, " ") : null,
    metadataLabels: [
      receipt.actionKind.replace(/_/g, " "),
      receipt.providerCapability ? `provider: ${receipt.providerCapability.replace(/_/g, " ")}` : null,
      receipt.requiredProvider,
      receipt.providerExecutorStatus ? `executor: ${receipt.providerExecutorStatus.replace(/_/g, " ")}` : null,
      receipt.providerCredentialStatus ? `credential: ${receipt.providerCredentialStatus.replace(/_/g, " ")}` : null,
      receipt.providerSetupView ? `setup: ${receipt.providerSetupView.replace(/_/g, " ")}` : null,
      receipt.externalProviderRequired && !receipt.providerExecutorConnected ? "external handoff pending" : null,
      receipt.createdAt,
      receipt.artifactIds.length > 0 ? `${receipt.artifactIds.length} artifact link${receipt.artifactIds.length === 1 ? "" : "s"}` : null,
      receipt.scheduleItemIds.length > 0 ? `${receipt.scheduleItemIds.length} date link${receipt.scheduleItemIds.length === 1 ? "" : "s"}` : null,
      receipt.taskItemIds.length > 0 ? `${receipt.taskItemIds.length} task link${receipt.taskItemIds.length === 1 ? "" : "s"}` : null,
    ].filter((label): label is string => Boolean(label)).slice(0, 10),
    riskLabels: receipt.riskLabels.slice(0, 3),
  }));
}

function shortDateLabel(value: unknown): string | null {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function vendorContactTone(stage: WeddingOutreachEscalationStage): WeddingVendorContactWorkspaceCard["tone"] {
  if (stage === "closed") return "closed";
  if (stage === "waiting_for_reply") return "waiting";
  if (stage === "follow_up_due") return "due";
  if (stage === "escalate_to_user" || stage === "mark_unresponsive") return "urgent";
  return "neutral";
}

function vendorContactCards(input: {
  metadata?: unknown;
  vendors?: readonly WeddingVendorContactOutreachVendor[] | null;
  nowIso?: string | null;
}): WeddingVendorContactWorkspaceCard[] {
  return (input.vendors ?? [])
    .map((vendor, index): WeddingVendorContactWorkspaceCard => {
      const state = buildWeddingOutreachEscalationStateFromVendorContact({
        metadata: input.metadata,
        vendor,
        now: input.nowIso,
      });
      const contact = vendor.userContact ?? null;
      const lastContactLabel = shortDateLabel(contact?.lastContactAt);
      const followUpLabel = shortDateLabel(contact?.followUpDueAt);
      const replyLabel = shortDateLabel(contact?.responseReceivedAt);
      const categoryLabel = clean(vendor.category) || "Vendor";
      const vendorName = clean(vendor.vendorName) || state.vendorLabel;
      const metadataLabels = [
        categoryLabel,
        contact?.contactMethod ? contact.contactMethod.replace(/_/g, " ") : null,
        lastContactLabel ? `last contacted ${lastContactLabel}` : null,
        followUpLabel && state.stage !== "closed" ? `follow-up ${followUpLabel}` : null,
        replyLabel ? `reply ${replyLabel}` : null,
        contact?.threadId ? `thread ${contact.threadId}` : null,
      ].filter((label): label is string => Boolean(label)).slice(0, 5);

      return {
        id: clean(vendor.vendorId) || `vendor-contact:${index}:${vendorName.toLowerCase()}`,
        vendorId: clean(vendor.vendorId) || null,
        vendorName,
        categoryLabel,
        statusLabel: state.stageLabel,
        stage: state.stage,
        tone: vendorContactTone(state.stage),
        detailLabel: state.decisionPrompt,
        nextActionLabel: state.options[0]?.label ?? "Review vendor",
        metadataLabels,
      };
    })
    .sort((left, right) => {
      const rank: Record<WeddingVendorContactWorkspaceCard["tone"], number> = {
        urgent: 0,
        due: 1,
        neutral: 2,
        waiting: 3,
        closed: 4,
      };
      return rank[left.tone] - rank[right.tone] || left.vendorName.localeCompare(right.vendorName);
    })
    .slice(0, 8);
}

function expectedBehaviorAuditCard(input: {
  artifacts: readonly WeddingArtifactInput[];
  artifactSummaries: readonly WeddingArtifactSummary[];
  contextItems?: readonly WeddingNeedToKnowProjectionContext[] | null;
  approvalReceipts?: readonly WeddingPersistedApprovalReceipt[] | null;
  decisionRecords?: readonly WeddingPersistedDecisionRecord[] | null;
  scheduleItems: readonly WeddingPlanningScheduleItem[];
  taskItems: readonly WeddingPlanningTaskItem[];
  secondOrderLoopCards: readonly WeddingSecondOrderLoopCard[];
}): WeddingExpectedBehaviorAuditCard {
  const artifactBodies = input.artifacts.map((artifact) => clean(artifact.bodyText).toLowerCase()).join("\n");
  const artifactTitles = input.artifactSummaries.map((artifact) => artifact.title.toLowerCase()).join("\n");
  const artifactKinds = new Set(input.artifactSummaries.map((artifact) => artifact.kind));
  const externalReceipts = (input.approvalReceipts ?? []).filter((receipt) => receipt.externalProviderRequired);
  const providerExecutorsReady = externalReceipts.length > 0 && externalReceipts.every((receipt) =>
    receipt.providerExecutorConnected && receipt.providerExecutorStatus === "available"
  );
  const hasLifecycleTask = input.taskItems.some((task) =>
    ["rsvp", "seating", "vendor_coordination", "contract_review"].includes(task.kind)
  );
  const hasFinalPhase = artifactKinds.has("timeline") || input.taskItems.some((task) =>
    ["run_sheet", "weather_contingency"].includes(task.kind)
  );
  const hasLegal = artifactKinds.has("legal") || input.taskItems.some((task) =>
    task.kind === "legal" || task.kind === "document_checklist"
  );
  const hasVendorPlanning = artifactKinds.has("vendor_table")
    || input.artifactSummaries.some((artifact) => artifact.vendorLabels.length > 0)
    || /vendor|photographer|venue|celebrant|caterer|florist|band|dj/.test(artifactBodies);
  const hasWeather = input.secondOrderLoopCards.some((card) => card.id === "second_order:weather_backup")
    || input.taskItems.some((task) => task.kind === "weather_contingency");
  const hasDayOfExecutionEvidence = /day-of|day of|real-time|real time|live update|vendor delay|no-show|lost item|transport/i.test(artifactBodies);
  const hasGuestMessagingEvidence = /e2ee|guest-safe|guest safe|live update|lost item|transport/i.test(artifactBodies);
  const hasPaymentVerificationEvidence = /payment receipt|receipt evidence|payment verification|final payment confirmed/i.test(artifactBodies);
  const hasPostWeddingWrapUp = /post-wedding|post wedding|thank-you|thank you/i.test(`${artifactTitles}\n${artifactBodies}`)
    || input.taskItems.some((task) => /thank-you|thank you|post-wedding|post wedding/i.test(`${task.title} ${task.notes ?? ""}`));
  const hasPostWeddingFeedbackCollection = /vendor feedback|rate your experience|rating|private feedback/i.test(artifactBodies)
    || input.taskItems.some((task) => task.kind === "vendor_follow_up" && /feedback|rating|review/i.test(`${task.title} ${task.notes ?? ""}`));
  const hasPostWeddingKeepsakeExport = /keepsake|digital scrapbook|secure pdf|wedding log/i.test(`${artifactTitles}\n${artifactBodies}`)
    || input.artifactSummaries.some((artifact) =>
      artifact.exportTargets.includes("browser_pdf") && artifact.exportTargets.includes("bundle_planned")
    );
  const audit = buildWeddingExpectedBehaviorAuditState({
    hasPlanningContext: Boolean(input.contextItems?.length),
    hasDecisionProjection: Boolean((input.decisionRecords ?? []).length || input.scheduleItems.length || input.taskItems.length),
    hasNeedToKnowProbing: Boolean(input.contextItems?.length),
    hasVendorChecklist: hasVendorPlanning,
    hasVendorSearchPlanning: hasVendorPlanning,
    vendorSearchProviderReady: input.artifactSummaries.some((artifact) => artifact.kind === "vendor_table" && artifact.sourceLinks.length > 0),
    approvalUiReady: externalReceipts.length > 0,
    providerExecutorsReady,
    hasLegalAdministration: hasLegal,
    hasAustralianLegalSetup: hasLegal && /australian|noim|attorney-general|marriage\.ag\.gov/.test(`${artifactTitles}\n${artifactBodies}`),
    hasFinalPhaseCoordination: hasFinalPhase,
    hasLifecycleManagement: hasLifecycleTask,
    weatherProviderReady: hasWeather && input.artifactSummaries.some((artifact) =>
      artifact.sourceLabels.some((label) => /weather|bom|forecast/i.test(label))
      || artifact.sourceLinks.some((source) => /weather|bom|forecast/i.test(`${source.label} ${source.url}`))
    ),
    rsvpProviderReady: input.artifactSummaries.some((artifact) => artifact.kind === "guest_list" && artifact.sourceLinks.length > 0),
    seatingCanvasReady: artifactBodies.includes("seating chart") || input.taskItems.some((task) => task.kind === "seating"),
    liveRunSheetExecutionReady: hasDayOfExecutionEvidence && providerExecutorsReady,
    guestMessagingProviderReady: hasGuestMessagingEvidence && providerExecutorsReady,
    paymentVerificationProviderReady: hasPaymentVerificationEvidence,
    hasPostWeddingWrapUp,
    hasPostWeddingFeedbackCollection,
    hasPostWeddingKeepsakeExport,
  });
  const readyItems = audit.items.filter((item) => item.status === "in_place");
  const blockedItems = audit.items.filter((item) => item.status !== "in_place");
  const suggestedTaskItems = buildWeddingExpectedBehaviorTaskItems({
    metadata: input.artifacts[0]?.metadata,
    blockedItems,
    existingTaskItems: input.taskItems,
  });
  return {
    id: "expected-behaviour-audit",
    title: "Automation health check",
    statusLabel: blockedItems.length === 0 ? "Ready" : "Needs setup",
    detailLabel: blockedItems.length === 0
      ? "Lifecycle, legal, vendor, outreach, RSVP, seating, and weather helpers have the details they need."
      : "Some wedding helpers still need connected apps, dates, or clearer details before they can run safely.",
    readyCountLabel: `${readyItems.length}/${audit.items.length} ready`,
    blockerCountLabel: `${blockedItems.length} gap${blockedItems.length === 1 ? "" : "s"}`,
    readyItems,
    blockedItems,
    suggestedTaskItems,
    metadataLabels: audit.summaryLabels,
    action: {
      kind: "open_tasks",
      label: "Review setup gaps",
      enabled: blockedItems.length > 0,
      reason: blockedItems.length > 0 ? null : "All expected wedding helpers have the details they need.",
      metadata: {
        expected_behavior_audit: {
          ready_count: readyItems.length,
          blocked_count: blockedItems.length,
          suggested_task_count: suggestedTaskItems.length,
          blocked_capabilities: blockedItems.map((item) => item.capability),
          suggested_task_ids: suggestedTaskItems.map((task) => task.id),
          suggested_task_titles: suggestedTaskItems.map((task) => task.title),
          blocker_labels: audit.productionBlockerLabels.slice(0, 12),
        },
      },
      contextLabels: blockedItems.map((item) => item.title).slice(0, 5),
    },
  };
}

function decisionRecordCards(records: readonly WeddingPersistedDecisionRecord[] | null | undefined): WeddingDecisionRecordCard[] {
  return (records ?? []).slice(0, 6).map((record) => ({
    id: record.id,
    title: record.selectedOptionLabel,
    statusLabel: "Decision scope saved",
    detailLabel: record.selectedOptionDetail,
    metadataLabels: [
      decisionArtifactTitleForDisplay(record),
      record.artifactKind.replace(/_/g, " "),
      record.source ? `source: ${record.source}` : null,
      ...(record.sourceProviderLabels ?? []).map((label) => `provider: ${label}`),
      record.createdAt,
      ...decisionMetadataLabelsForDisplay(record),
    ].filter((label): label is string => Boolean(label)).slice(0, 6),
    evidenceLabels: record.selectedOptionCells.slice(0, 4),
  }));
}

function decisionActionMetadata(records: readonly WeddingPersistedDecisionRecord[] | null | undefined): Record<string, unknown> | undefined {
  const scopes = (records ?? []).slice(0, 8).map((record) => ({
    decision_id: record.id,
    artifact_id: record.artifactId,
    artifact_title: decisionArtifactTitleForDisplay(record),
    artifact_kind: record.artifactKind,
    selected_option_id: record.selectedOptionId,
    selected_option_label: record.selectedOptionLabel,
    selected_option_detail: record.selectedOptionDetail,
    source_labels: decisionSourceLabelsForDisplay(record),
    source_urls: decisionSourceUrlsForDisplay(record),
    source_provider_labels: record.sourceProviderLabels ?? [],
  }));
  return scopes.length > 0 ? { decision_scopes: scopes } : undefined;
}

function decisionContextLabels(records: readonly WeddingPersistedDecisionRecord[] | null | undefined): string[] {
  return (records ?? [])
    .slice(0, 6)
    .map((record) => `Selected ${record.artifactKind.replace(/_/g, " ")}: ${record.selectedOptionLabel}`);
}

function decisionBundleScopes(records: readonly WeddingPersistedDecisionRecord[] | null | undefined) {
  return (records ?? []).slice(0, 8).map((record) => ({
    title: record.selectedOptionLabel,
    detail: record.selectedOptionDetail,
    artifactTitle: decisionArtifactTitleForDisplay(record),
    metadataLabels: [
      record.artifactKind.replace(/_/g, " "),
      record.source ? `source: ${record.source}` : null,
      ...(record.sourceProviderLabels ?? []).map((label) => `provider: ${label}`),
      record.createdAt,
      ...decisionMetadataLabelsForDisplay(record),
    ].filter((label): label is string => Boolean(label)),
    sourceLabels: decisionSourceLabelsForDisplay(record),
    sourceUrls: decisionSourceUrlsForDisplay(record),
    sourceProviderLabels: record.sourceProviderLabels ?? [],
  }));
}

function approvalForArtifact(
  artifact: WeddingArtifactSummary,
  decisionRecords?: readonly WeddingPersistedDecisionRecord[] | null,
): WeddingApprovalRequestState | null {
  if (artifact.approvalState !== "pending_user_approval") return null;
  const decisionScopes = (decisionRecords ?? [])
    .filter((record) => record.artifactId === artifact.id)
    .slice(0, 4)
    .map((record) => ({
      title: record.selectedOptionLabel,
      detail: record.selectedOptionDetail,
      artifactId: record.artifactId,
      artifactTitle: decisionArtifactTitleForDisplay(record),
    }));
  return buildWeddingApprovalRequestState({
    actionKind: artifact.kind === "email_draft" ? "send_email" : "share_artifact",
    title: `Approve ${artifactTitleForDisplay(artifact)}`,
    metadata: artifact.metadata,
    artifacts: [artifact],
    decisionScopes,
  });
}

function bodyTextForArtifact(artifact: WeddingArtifactSummary, inputs: readonly WeddingArtifactInput[]): string | null {
  const match = inputs.find((input) => clean(input.id) === artifact.id);
  return clean(match?.bodyText) || null;
}

function uniqueLabels(labels: readonly string[]): string[] {
  return Array.from(new Set(labels.map(clean).filter(Boolean)));
}

function isImportedPrivateDecisionLabel(value: string): boolean {
  return /^wedding_import(?:$|:)/i.test(value)
    || /original upload/i.test(value)
    || /\b(?:csv|tsv|excel|xlsx?|ods) import:/i.test(value)
    || /\bsource:\s*[^,]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value)
    || /\b[^,\s]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value);
}

function isImportedPrivateDecision(record: WeddingPersistedDecisionRecord): boolean {
  return [
    record.artifactId,
    record.artifactTitle,
    ...(record.sourceLabels ?? []),
    ...(record.metadataLabels ?? []),
  ].map(clean).some(isImportedPrivateDecisionLabel);
}

function decisionArtifactTitleForDisplay(record: WeddingPersistedDecisionRecord): string {
  return isImportedPrivateDecision(record) ? "Imported private planning file" : record.artifactTitle;
}

function decisionSourceLabelsForDisplay(record: WeddingPersistedDecisionRecord): string[] {
  const labels = uniqueLabels(record.sourceLabels ?? []);
  if (!isImportedPrivateDecision(record)) return labels;
  return labels.length > 0 ? ["Imported private planning file"] : [];
}

function decisionSourceUrlsForDisplay(record: WeddingPersistedDecisionRecord): string[] {
  const sourceUrls = usableSourceUrls(record.sourceUrls);
  if (!isImportedPrivateDecision(record)) return sourceUrls;
  return sourceUrls.filter((url) => !privateImportSourceUrl(url));
}

function decisionMetadataLabelsForDisplay(record: WeddingPersistedDecisionRecord): string[] {
  const labels = uniqueLabels(record.metadataLabels ?? []);
  if (!isImportedPrivateDecision(record)) return labels;
  return labels.filter((label) => !isImportedPrivateDecisionLabel(label));
}

function isImportedPrivateArtifact(artifact: WeddingArtifactSummary): boolean {
  return artifact.metadata.supertags.some((tag) => /^wedding_import(?:$|:)/i.test(tag))
    || artifact.id.startsWith("wedding_import:")
    || artifact.sourceLabels.some((label) => (
      /^wedding_import(?:$|:)/i.test(label)
      || /original upload/i.test(label)
      || /\b(?:csv|tsv|excel|xlsx?|ods) import:/i.test(label)
      || /\bsource:\s*[^,]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(label)
    ));
}

function sourceLabelsForDisplay(artifact: WeddingArtifactSummary): string[] {
  const sourceLabels = uniqueLabels(artifact.sourceLabels);
  if (!isImportedPrivateArtifact(artifact)) return sourceLabels;
  return sourceLabels.length > 0 ? ["Imported private planning file"] : [];
}

function sourceLinksForDisplay(artifact: WeddingArtifactSummary): WeddingArtifactSourceLink[] {
  return isImportedPrivateArtifact(artifact) ? [] : artifact.sourceLinks;
}

function artifactTitleForDisplay(artifact: WeddingArtifactSummary): string {
  return isImportedPrivateArtifact(artifact) ? "Imported private planning file" : artifact.title;
}

function evidenceSummaryForArtifact(artifact: WeddingArtifactSummary): WeddingArtifactEvidenceSummary {
  const sourceLabels = sourceLabelsForDisplay(artifact);
  const sourceLinks = sourceLinksForDisplay(artifact);
  const sourceLinkLabels = uniqueLabels(sourceLinks.map((source) => source.label));
  const sourceCount = uniqueLabels(artifact.sourceLabels).length + artifact.sourceLinks.length;
  const evidenceStatus = weddingArtifactEvidenceStatus(artifact);
  const statusLabel = evidenceStatus === "source_linked"
    ? "Links included"
    : evidenceStatus === "source_labelled" ? "Sources named" : "Needs a fact check";
  const warningLabel = evidenceStatus === "source_linked"
    ? null
    : evidenceStatus === "source_labelled"
      ? "Check prices, availability, legal details, and vendor claims before using this."
      : "This is a planning draft. Confirm the facts before you rely on it.";
  const labels = uniqueLabels([
    ...sourceLinkLabels.map((label) => `Link: ${label}`),
    ...sourceLabels.map((label) => `Source: ${label}`),
    artifact.approvalState.replace(/_/g, " "),
  ]).slice(0, 6);

  return {
    statusLabel,
    sourceCountLabel: sourceCount === 0 ? "No sources listed yet" : `${sourceCount} source${sourceCount === 1 ? "" : "s"} listed`,
    warningLabel,
    labels,
  };
}

function previewForArtifact(
  artifact: WeddingArtifactSummary | null,
  inputs: readonly WeddingArtifactInput[],
  decisionRecords?: readonly WeddingPersistedDecisionRecord[] | null,
): WeddingWorkspaceArtifactPreview | null {
  if (!artifact) return null;
  const exportManifest = buildWeddingArtifactExportManifest(artifact);
  const bodyText = bodyTextForArtifact(artifact, inputs);
  const approvalRequest = approvalForArtifact(artifact, decisionRecords);
  return {
    artifactId: artifact.id,
    title: artifactTitleForDisplay(artifact),
    kind: artifact.kind,
    category: artifact.category,
    approvalState: artifact.approvalState,
    metadataLabels: exportManifest.metadataLabels,
    sourceLabels: sourceLabelsForDisplay(artifact),
    sourceLinks: sourceLinksForDisplay(artifact),
    evidenceSummary: evidenceSummaryForArtifact(artifact),
    bodyText,
    preview: buildWeddingArtifactPreviewState({
      artifactKind: artifact.kind,
      bodyText,
    }),
    exportManifest,
    approvalRequest,
    integrationReadiness: buildWeddingIntegrationReadinessState(approvalRequest),
    emptyBodyLabel: bodyText
      ? "Planning document text is ready."
      : "Preview text is still loading; summary details and actions are available now.",
  };
}

function graphMetadataForRecommendation(recommendation: WeddingRecommendationExplanation): Record<string, unknown> {
  return {
    graph_context: {
      recommendation_id: recommendation.id,
      recommendation_kind: recommendation.kind,
      recommendation_title: recommendation.title,
      source_node_ids: recommendation.sourceNodeIds,
      edge_ids: recommendation.edgeIds,
      next_action_label: recommendation.nextActionLabel,
    },
  };
}

function recommendationCards(
  recommendations: readonly WeddingRecommendationExplanation[],
): WeddingWorkspaceRecommendationCard[] {
  return recommendations.slice(0, 5).map((recommendation) => {
    const nodeCount = recommendation.sourceNodeIds.length;
    const edgeCount = recommendation.edgeIds.length;
    return {
      ...recommendation,
      graphContextLabels: [
        recommendation.kind.replace(/_/g, " "),
        nodeCount > 0 ? `${nodeCount} related detail${nodeCount === 1 ? "" : "s"}` : "no related details yet",
        edgeCount > 0 ? `${edgeCount} connection${edgeCount === 1 ? "" : "s"}` : "no connections yet",
      ],
      graphAction: {
        kind: "open_graph",
        label: "Show related details",
        enabled: true,
        reason: null,
        metadata: graphMetadataForRecommendation(recommendation),
        contextLabels: [recommendation.evidenceLabel, recommendation.nextActionLabel],
      },
    };
  });
}

function decisionProjectionItems(
  artifacts: readonly WeddingArtifactInput[],
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
    const selectedOptionId = loadWeddingDecisionSelection(artifactId, storage);
    if (!selectedOptionId) return [];
    const decision = buildWeddingDecisionSelectionState({
      artifactId,
      artifactKind,
      table: preview,
      selectedOptionId,
      preferenceText: bodyText,
    });
    if (!decision.selectedOption) return [];
    return [{
      id: `wedding_decision:${artifactId}:${decision.selectedOption.id}`,
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
      selectedOption: decision.selectedOption,
      source: "local_selection",
    }];
  });
}

function sidebarActions(input: {
  workspace: WeddingResponseWorkspaceState;
  preview: WeddingWorkspaceArtifactPreview | null;
  recommendations: readonly WeddingWorkspaceRecommendationCard[];
  decisionRecords?: readonly WeddingPersistedDecisionRecord[] | null;
}): WeddingWorkspaceSidebarAction[] {
  const primaryRecommendation = input.recommendations[0] ?? null;
  const decisionMetadata = decisionActionMetadata(input.decisionRecords);
  const selectedDecisionLabels = decisionContextLabels(input.decisionRecords);
  return [
    {
      kind: "continue_chat",
      label: "Ask planner about this",
      enabled: true,
      reason: "Continues with this wedding plan and the selected document.",
      metadata: decisionMetadata,
      contextLabels: selectedDecisionLabels,
    },
    {
      kind: "open_graph",
      label: "Show related details",
      enabled: input.recommendations.length > 0,
      reason: input.recommendations.length > 0 ? null : "Related details are not available yet.",
      metadata: {
        ...(primaryRecommendation ? graphMetadataForRecommendation(primaryRecommendation) : {}),
        ...(decisionMetadata ?? {}),
      },
      contextLabels: [
        ...(primaryRecommendation?.graphContextLabels ?? []),
        ...selectedDecisionLabels,
      ],
    },
    {
      kind: "open_calendar",
      label: "Open wedding calendar",
      enabled: input.workspace.results.some((artifact) => artifact.linkedCalendarEventIds.length > 0),
      reason: "Add or select a document with a wedding date first.",
      metadata: decisionMetadata,
      contextLabels: selectedDecisionLabels,
    },
    {
      kind: "open_tasks",
      label: "Open wedding tasks",
      enabled: input.workspace.results.some((artifact) => artifact.linkedTaskIds.length > 0),
      reason: "Add or select a document with a wedding task first.",
      metadata: decisionMetadata,
      contextLabels: selectedDecisionLabels,
    },
    {
      kind: "export_bundle",
      label: "Download wedding plan",
      enabled: input.workspace.totalArtifacts > 0,
      reason: input.workspace.totalArtifacts > 0 ? null : "No wedding documents exist yet.",
      metadata: decisionMetadata,
      contextLabels: selectedDecisionLabels,
    },
    {
      kind: "approve_action",
      label: "Review before sending",
      enabled: Boolean(input.preview?.approvalRequest),
      reason: input.preview?.approvalRequest ? null : "This document does not need approval before it is used.",
      metadata: decisionMetadata,
      contextLabels: selectedDecisionLabels,
    },
  ];
}

export type WeddingResponseWorkspaceViewInput = WeddingWorkspaceProductionReadinessInput & {
  metadata?: unknown;
  artifacts?: readonly WeddingArtifactInput[] | null;
  query?: string | null;
  activeArtifactId?: string | null;
  adminDataConsentEnabled?: boolean | null;
  collaboratorInvites?: readonly WeddingCollaboratorInviteInput[] | null;
  boundaryObjects?: readonly WeddingBoundaryLedgerObject[] | null;
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
  generatedArtifacts?: readonly WeddingGeneratedArtifact[] | null;
  scheduleItems?: readonly WeddingPlanningScheduleItem[] | null;
  taskItems?: readonly WeddingPlanningTaskItem[] | null;
  weddingVendors?: readonly WeddingVendorContactOutreachVendor[] | null;
  weddingImportBinaryParserReady?: boolean | null;
  nowIso?: string | null;
  projectionStorage?: Storage | null;
};

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
  const decisionScopes = decisionBundleScopes(input.decisionRecords);
  const packetExportCapability = buildWeddingPacketExportCapabilityState({
    title: "Wedding planning bundle",
  });
  const cards = recommendationCards(input.recommendations?.recommendations ?? []);
  const decisions = decisionProjectionItems(artifacts, input.projectionStorage);
  const budgetTracking = buildWeddingBudgetTrackingState({
    decisionRecords: input.decisionRecords,
    selectedDecisionItems: decisions,
    artifacts,
  });
  const guestTracking = buildWeddingGuestTrackingState({ artifacts });
  const seatingPlan = buildWeddingSeatingPlanState({ artifacts, guestTracking });
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
    oracleUpdatePlan,
  } = buildWeddingResponseWorkspaceProductionReadinessState({
    ...input,
    productionReadinessEvidence: {
      ...(input.productionReadinessEvidence ?? {}),
      importParserReadiness,
    },
  });
  const projectionTaskItems = buildWeddingWorkspaceGeneratedTaskItems({
    artifacts,
    baseTaskItems: taskItems,
    loopTaskItems,
    budgetTracking,
    guestTracking,
    seatingPlan,
    importParserReadiness,
    backgroundAutomationCoverage,
    delegation,
    preparationTaskItems,
    auditTaskItems: auditCard.suggestedTaskItems,
    oracleUpdatePlan,
    approvalReceipts: input.approvalReceipts,
    weddingVendors: input.weddingVendors,
    now: input.nowIso,
    metadata: input.metadata ?? artifacts[0]?.metadata,
  });
  const userFacingProjectionTaskItems = projectionTaskItems.filter(isUserFacingWeddingPlanningTask);
  const personalOsProjection = buildWeddingPersonalOsProjectionState({
    taskItems: userFacingProjectionTaskItems,
    scheduleItems: projectionScheduleItems,
    decisionItems: decisions,
    approvalReceipts: input.approvalReceipts,
    now: input.nowIso ? new Date(input.nowIso) : null,
    limit: 40,
  });
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
    decisionItems: decisions,
    artifacts: generatedArtifacts,
    scheduleItems: projectionScheduleItems,
    taskItems: projectionTaskItems,
    collaborationInvites: collaboration.invites,
    collaborationMetadata: input.metadata ?? artifacts[0]?.metadata,
    boundaryObjects,
    boundaryMetadata: input.metadata ?? artifacts[0]?.metadata,
    nowIso: input.nowIso,
    storage: input.projectionStorage,
  });

  return {
    workspace,
    categoryRail: workspace.categories.map((category) => ({
      id: category.id,
      label: category.label,
      count: category.count,
      active: category.artifacts.some((artifact) => artifact.id === workspace.activeArtifact?.id),
    })),
    filterChips: buildFilterChips(workspace.results),
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
    providerHandoffAuditCard: buildWeddingProviderHandoffAuditCard(input.approvalReceipts),
    expectedBehaviorAuditCard: auditCard,
    decisionRecordCards: decisionRecordCards(input.decisionRecords),
    budgetTracking,
    guestTracking,
    seatingPlan,
    importParserReadiness,
    backgroundAutomationCoverage,
    collaboration,
    boundaryState,
    boundaryTopology,
    planningTaskItems: userFacingProjectionTaskItems,
    helperContactNames,
    recommendationCards: cards,
    secondOrderLoopCards: loopCards,
    adminDataConsent,
    delegation,
    ganttTimeline,
    productionReadinessEvidence,
    productionGoNoGoPacket,
    productionReadiness,
    oracleUpdatePlan,
    personalOsProjection,
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
