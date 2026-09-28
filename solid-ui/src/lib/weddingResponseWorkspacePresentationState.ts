// @locs-version: 1.0
import {
  weddingArtifactEvidenceStatus,
  type WeddingArtifactInput,
  type WeddingArtifactSourceLink,
  type WeddingArtifactSummary,
} from "@/lib/weddingArtifactState";
import {
  buildWeddingApprovalRequestState,
  buildWeddingIntegrationReadinessState,
  type WeddingApprovalRequestState,
} from "@/lib/weddingApprovalState";
import {
  buildWeddingArtifactExportManifest,
  type WeddingArtifactExportManifest,
} from "@/lib/weddingExportState";
import {
  buildWeddingArtifactPreviewState,
  type WeddingArtifactQuotePreview,
  type WeddingArtifactPreviewState,
} from "@/lib/weddingArtifactPreviewState";
import type { WeddingNeedToKnowProjectionContext } from "@/lib/weddingNeedToKnowAfpProjectionState";
import type {
  WeddingPersistedApprovalReceipt,
  WeddingPersistedDecisionRecord,
} from "@/lib/weddingPersistedWorkspaceState";
import type {
  WeddingPlanningScheduleItem,
  WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";
import {
  buildWeddingExpectedBehaviorAuditState,
  type WeddingExpectedBehaviorAuditItem,
} from "@/lib/weddingExpectedBehaviorAuditState";
import { buildWeddingExpectedBehaviorTaskItems } from "@/lib/weddingExpectedBehaviorTaskState";
import type { WeddingSecondOrderLoopCard } from "@/lib/weddingSecondOrderLoopState";
import {
  buildWeddingOutreachEscalationStateFromVendorContact,
  type WeddingOutreachEscalationStage,
  type WeddingVendorContactOutreachVendor,
} from "@/lib/weddingOutreachEscalationState";
import type { WeddingArtifactKind, WeddingApprovalState } from "@/lib/weddingPlanningTemplateState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import type { WeddingResponseWorkspaceState } from "@/lib/weddingResponseWorkspaceState";
import type { WeddingRecommendationExplanation } from "@/lib/weddingRecommendationExplanationState";
import {
  buildWeddingVendorQuoteReplyFlowState,
  type WeddingVendorQuoteReplyFlowState,
} from "@/lib/weddingVendorQuoteReplyFlowState";
import type {
  WeddingApprovalReceiptCard,
  WeddingArtifactEvidenceSummary,
  WeddingDecisionRecordCard,
  WeddingExpectedBehaviorAuditCard,
  WeddingNeedToKnowContextCard,
  WeddingVendorContactWorkspaceCard,
  WeddingWorkspaceArtifactPreview,
  WeddingWorkspaceFilterChip,
  WeddingWorkspaceFilterKind,
  WeddingWorkspaceRecommendationCard,
} from "@/lib/weddingResponseWorkspaceViewState";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

export function buildFilterChips(artifacts: readonly WeddingArtifactSummary[]): WeddingWorkspaceFilterChip[] {
  return [
    ...chipsFromValues(artifacts, "artifact_kind", (artifact) => [artifact.kind]),
    ...chipsFromValues(artifacts, "approval_state", (artifact) => [artifact.approvalState]),
    ...chipsFromValues(artifacts, "export_target", (artifact) => artifact.exportTargets),
    ...chipsFromValues(artifacts, "evidence_status", (artifact) => [weddingArtifactEvidenceStatus(artifact)]),
    ...chipsFromValues(artifacts, "vendor", (artifact) => artifact.vendorLabels),
    ...chipsFromValues(artifacts, "location", (artifact) => artifact.locationLabels),
  ];
}

export function contextCards(contextItems: readonly WeddingNeedToKnowProjectionContext[] | null | undefined): WeddingNeedToKnowContextCard[] {
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

function approvalReceiptDetailLabel(receipt: WeddingPersistedApprovalReceipt): string {
  if (receipt.externalId) return `External ID: ${receipt.externalId}`;
  const blockedReason = approvalReceiptUserLabel(receipt.blockedReason);
  if (blockedReason) return blockedReason;
  return `${receipt.actionKind.replace(/_/g, " ")} at ${receipt.createdAt}`;
}

function approvalReceiptUserLabel(value: string | null): string | null {
  const label = clean(value)
    .replace(/\bNo executor is connected for this wedding action\b/gi, "No connected app is ready for this wedding action")
    .replace(/\bNo executor is connected\b/gi, "No connected app is ready")
    .replace(/\bprovider executor\b/gi, "connected app")
    .replace(/\bexecutor\b/gi, "connected app")
    .replace(/\bprovider\b/gi, "connected app");
  return label || null;
}

function approvalReceiptBlockLabel(value: string | null): string | null {
  const label = clean(value).replace(/_/g, " ");
  if (!label) return null;
  if (label === "provider missing") return "connected app missing";
  return label;
}

export function approvalReceiptCards(receipts: readonly WeddingPersistedApprovalReceipt[] | null | undefined): WeddingApprovalReceiptCard[] {
  return (receipts ?? []).slice(0, 5).map((receipt) => ({
    id: receipt.id,
    title: receipt.title,
    statusLabel: receipt.status === "executed" ? "Executed" : "Blocked",
    detailLabel: approvalReceiptDetailLabel(receipt),
    blockLabel: approvalReceiptBlockLabel(receipt.blockKind),
    metadataLabels: [
      receipt.actionKind.replace(/_/g, " "),
      receipt.providerCapability ? `app type: ${receipt.providerCapability.replace(/_/g, " ")}` : null,
      receipt.requiredProvider,
      receipt.providerExecutorStatus ? `app action: ${receipt.providerExecutorStatus.replace(/_/g, " ")}` : null,
      receipt.providerCredentialStatus ? `sign-in: ${receipt.providerCredentialStatus.replace(/_/g, " ")}` : null,
      receipt.providerSetupView ? `setup page: ${receipt.providerSetupView.replace(/_/g, " ")}` : null,
      receipt.externalProviderRequired && !receipt.providerExecutorConnected ? "connected app needed" : null,
      receipt.createdAt,
      receipt.artifactIds.length > 0 ? `${receipt.artifactIds.length} artifact link${receipt.artifactIds.length === 1 ? "" : "s"}` : null,
      receipt.scheduleItemIds.length > 0 ? `${receipt.scheduleItemIds.length} date link${receipt.scheduleItemIds.length === 1 ? "" : "s"}` : null,
      receipt.taskItemIds.length > 0 ? `${receipt.taskItemIds.length} task link${receipt.taskItemIds.length === 1 ? "" : "s"}` : null,
    ].filter((label): label is string => Boolean(label)).slice(0, 10),
    riskLabels: receipt.riskLabels.map(approvalReceiptUserLabel).filter((label): label is string => Boolean(label)).slice(0, 3),
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

function vendorContactPrimaryActionLabel(stage: WeddingOutreachEscalationStage): string {
  if (stage === "initial_outreach") return "Review and approve outreach";
  if (stage === "follow_up_due") return "Review and approve follow-up";
  if (stage === "escalate_to_user") return "Choose next step";
  if (stage === "mark_unresponsive") return "Review alternatives";
  if (stage === "waiting_for_reply") return "Open follow-up task";
  if (stage === "closed") return "View response";
  return "Review vendor";
}

export function vendorContactCards(input: {
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
        primaryActionLabel: vendorContactPrimaryActionLabel(state.stage),
        actionMode: state.stage === "closed"
          ? "reply_recorded"
          : state.stage === "waiting_for_reply"
            ? "waiting"
            : "follow_up",
        lastContactLabel,
        followUpDueLabel: followUpLabel,
        replyLabel,
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

export function expectedBehaviorAuditCard(input: {
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

export function decisionRecordCards(records: readonly WeddingPersistedDecisionRecord[] | null | undefined): WeddingDecisionRecordCard[] {
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

export function decisionActionMetadata(records: readonly WeddingPersistedDecisionRecord[] | null | undefined): Record<string, unknown> | undefined {
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

export function decisionContextLabels(records: readonly WeddingPersistedDecisionRecord[] | null | undefined): string[] {
  return (records ?? [])
    .slice(0, 6)
    .map((record) => `Selected ${record.artifactKind.replace(/_/g, " ")}: ${record.selectedOptionLabel}`);
}

export function decisionBundleScopes(records: readonly WeddingPersistedDecisionRecord[] | null | undefined) {
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

function inputMetadataForArtifact(artifact: WeddingArtifactSummary, inputs: readonly WeddingArtifactInput[]): Record<string, unknown> {
  const match = inputs.find((input) => clean(input.id) === artifact.id);
  return match?.metadata && typeof match.metadata === "object" && !Array.isArray(match.metadata)
    ? match.metadata as Record<string, unknown>
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(clean).filter(Boolean)
    : [];
}

function vendorComparisonHandoffForArtifact(metadata: Record<string, unknown>): WeddingWorkspaceArtifactPreview["vendorComparisonHandoff"] {
  const handoff = metadata.vendorComparisonHandoff;
  if (!handoff || typeof handoff !== "object" || Array.isArray(handoff)) return null;
  const record = handoff as Record<string, unknown>;
  const recommendationLabel = clean(record.recommendationLabel);
  const whyLabels = stringArray(record.whyLabels).slice(0, 5);
  const confidenceLabel = clean(record.confidenceLabel);
  const nextActionLabel = clean(record.nextActionLabel);
  if (!recommendationLabel || whyLabels.length === 0 || !confidenceLabel) return null;
  return {
    recommendationLabel,
    whyLabels,
    confidenceLabel,
    nextActionLabel: nextActionLabel || "Select one or more vendors for approval-gated follow-up.",
  };
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

export function previewForArtifact(
  artifact: WeddingArtifactSummary | null,
  inputs: readonly WeddingArtifactInput[],
  decisionRecords?: readonly WeddingPersistedDecisionRecord[] | null,
): WeddingWorkspaceArtifactPreview | null {
  if (!artifact) return null;
  const exportManifest = buildWeddingArtifactExportManifest(artifact);
  const bodyText = bodyTextForArtifact(artifact, inputs);
  const inputMetadata = inputMetadataForArtifact(artifact, inputs);
  const approvalRequest = approvalForArtifact(artifact, decisionRecords);
  return {
    artifactId: artifact.id,
    title: artifactTitleForDisplay(artifact),
    kind: artifact.kind,
    category: artifact.category,
    createdAt: artifact.createdAt,
    approvalState: artifact.approvalState,
    metadataLabels: exportManifest.metadataLabels,
    sourceLabels: sourceLabelsForDisplay(artifact),
    sourceLinks: sourceLinksForDisplay(artifact),
    vendorComparisonHandoff: vendorComparisonHandoffForArtifact(inputMetadata),
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

function vendorNameTokens(vendorName: string): string[] {
  const words = vendorName.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const noise = new Set(["and", "the", "co", "company", "pty", "ltd"]);
  return words.filter((word) => word.length > 2 && !noise.has(word));
}

function scoreVendorQuoteDraftMatch(draft: WeddingWorkspaceArtifactPreview, vendorName: string): number {
  const email = draft.preview?.kind === "email" ? draft.preview : null;
  if (!email) return 0;
  const vendorKey = vendorName.toLowerCase();
  const tokens = vendorNameTokens(vendorName);
  const primaryToken = tokens[0] ?? "";
  const strongHaystack = [
    draft.title,
    email.recipient,
    email.subject,
  ].join(" ").toLowerCase();
  const bodyHaystack = clean(email.body).toLowerCase();
  const fullHaystack = `${strongHaystack} ${bodyHaystack}`;
  let score = 0;

  if (strongHaystack.includes(vendorKey)) score += 120;
  if (bodyHaystack.includes(vendorKey)) score += 50;
  if (tokens.length > 0 && tokens.every((token) => strongHaystack.includes(token))) score += 90;
  if (tokens.length > 0 && tokens.every((token) => fullHaystack.includes(token))) score += 35;
  if (primaryToken && strongHaystack.includes(primaryToken)) score += 30;
  if (primaryToken && bodyHaystack.includes(primaryToken)) score += 12;
  if (score > 0 && /\b(reply|draft|quote|floral|vendor)\b/.test(strongHaystack)) score += 8;

  return score;
}

function bestVendorQuoteDraft(
  emailDrafts: readonly WeddingWorkspaceArtifactPreview[],
  vendorName: string,
): WeddingWorkspaceArtifactPreview | null {
  const ranked = emailDrafts
    .map((draft, index) => ({
      draft,
      index,
      score: scoreVendorQuoteDraftMatch(draft, vendorName),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) =>
      b.score - a.score
      || b.draft.createdAt - a.draft.createdAt
      || a.index - b.index
    );
  return ranked[0]?.draft ?? null;
}

function fallbackVendorQuoteReplyDraft(quote: WeddingArtifactQuotePreview): string {
  const inclusions = quote.inclusions.slice(0, 3);
  const budgetLabel = clean(quote.budgetDeltaLabel);
  const budgetDelta = typeof quote.budgetDeltaAmount === "number" ? quote.budgetDeltaAmount : null;
  const labelSaysUnderBudget = /\bunder budget|below budget|within budget|on budget\b/i.test(budgetLabel);
  const labelSaysOverBudget = /\bover budget|above budget|exceeds budget|higher than budget\b/i.test(budgetLabel);
  const appearsUnderBudget = labelSaysUnderBudget || (!labelSaysOverBudget && budgetDelta !== null && budgetDelta < 0);
  const appearsOverBudget = labelSaysOverBudget || (!labelSaysUnderBudget && budgetDelta !== null && budgetDelta > 0);
  const bodyLines = [
    `Hi ${quote.vendorName},`,
    "",
    `Thanks for sending the quote for ${quote.amountLabel}.`,
  ];
  if (inclusions.length > 0) {
    bodyLines.push(`We have noted that it includes ${inclusions.join(", ")}${quote.inclusions.length > 3 ? ", and the other listed items" : ""}.`);
  }
  if (budgetLabel) {
    if (appearsUnderBudget) {
      bodyLines.push(`This appears to be ${budgetLabel}, so we are leaning positive subject to availability, deposit terms, and the inclusions staying as listed.`);
    } else if (appearsOverBudget) {
      bodyLines.push(`This appears to be ${budgetLabel}, so before we can confirm, could you suggest any package adjustments or optional items that would reduce the total while keeping the core service?`);
    } else {
      bodyLines.push(`We are checking the ${budgetLabel} budget impact before confirming.`);
    }
  }
  if (quote.validUntil) {
    bodyLines.push(`We also noted the quote is valid until ${quote.validUntil}.`);
  }
  bodyLines.push("");
  if (appearsUnderBudget) {
    bodyLines.push("Could you please confirm whether you can hold the date provisionally while we review the payment schedule?");
  } else {
    bodyLines.push("Could you please confirm your availability for the date before we make a decision?");
  }
  bodyLines.push(
    "Please also confirm deposit amount, payment milestones, cancellation terms, overtime or travel fees, and anything that is excluded from the quote.",
    "",
    "Thank you.",
  );
  return bodyLines.join("\n");
}

export function vendorQuoteReplyFlowsFromPreviews(input: {
  previews: readonly WeddingWorkspaceArtifactPreview[];
  metadata?: unknown;
  approvalReceipts?: readonly WeddingPersistedApprovalReceipt[] | null;
}): WeddingVendorQuoteReplyFlowState[] {
  const emailDrafts = input.previews.filter((preview) => preview.preview?.kind === "email");
  const flows: WeddingVendorQuoteReplyFlowState[] = [];
  for (const preview of input.previews) {
    if (preview.preview?.kind !== "quote") continue;
    const quote = preview.preview;
    const matchingDraft = bestVendorQuoteDraft(emailDrafts, quote.vendorName);
    const email = matchingDraft?.preview?.kind === "email" ? matchingDraft.preview : null;
    const draftBody = clean(email?.body)
      || fallbackVendorQuoteReplyDraft(quote);
    const provisionalFlow = buildWeddingVendorQuoteReplyFlowState({
      quote,
      metadata: input.metadata,
      recipient: clean(email?.recipient),
      subject: clean(email?.subject) || `${quote.vendorName} quote`,
      draftBody,
      quoteMessageId: preview.artifactId,
      draftMessageId: matchingDraft?.artifactId ?? null,
    });
    const receipt = (input.approvalReceipts ?? []).find((item) => {
      if (item.actionKind === "unknown") return false;
      if (item.requestId === provisionalFlow.approvalRequest.id) return true;
      return item.actionKind === "send_email" && item.deliveryThreadId === provisionalFlow.threadId;
    });
    const receiptActionKind = receipt?.actionKind === "unknown" ? null : receipt?.actionKind ?? null;
    const hasDurableReceiptId = Boolean(
      clean(receipt?.externalId)
        || clean(receipt?.providerReceiptId)
        || clean(receipt?.providerMessageId)
        || clean(receipt?.messageId),
    );
    const receiptDeliveryProven = receipt?.status === "executed"
      && hasDurableReceiptId
      && receipt.missingDurableProviderReceipt !== true
      && receipt.externalDeliveryPerformed !== false;
    const reconstructedStatus = receipt
      ? receiptDeliveryProven ? "executed" : "blocked"
      : null;
    const reconstructedMessage = reconstructedStatus === "executed"
      ? "Sent."
      : receipt && !hasDurableReceiptId
        ? "Delivery is missing a provider receipt."
        : "Delivery did not complete.";
    flows.push(buildWeddingVendorQuoteReplyFlowState({
      quote,
      metadata: input.metadata,
      recipient: provisionalFlow.recipient,
      subject: provisionalFlow.subject,
      draftBody,
      quoteMessageId: preview.artifactId,
      draftMessageId: matchingDraft?.artifactId ?? null,
      approvedWording: receiptDeliveryProven,
      budgetImpactAcknowledged: receiptDeliveryProven,
      execution: receipt && receiptActionKind
        ? {
          requestId: receipt.requestId,
          actionKind: receiptActionKind,
          status: reconstructedStatus ?? receipt.status,
          canRetry: reconstructedStatus !== "executed",
          externalId: receipt.externalId,
          message: reconstructedMessage,
          receipt: {
            id: receipt.id,
            requestId: receipt.requestId,
            actionKind: receiptActionKind,
            title: receipt.title,
            status: reconstructedStatus ?? receipt.status,
            createdAt: receipt.createdAt,
            disclosureLines: receipt.disclosureLines,
            riskLabels: receipt.riskLabels,
            metadata: {
              external_id: receipt.externalId,
              provider_receipt_id: receipt.providerReceiptId ?? null,
              provider_message_id: receipt.providerMessageId ?? null,
              message_id: receipt.messageId ?? null,
              client_message_id: receipt.clientMessageId ?? null,
              delivery_channel: receipt.deliveryChannel ?? null,
              delivery_subject: receipt.deliverySubject ?? null,
              delivery_thread_id: receipt.deliveryThreadId ?? null,
              delivery_in_reply_to: receipt.deliveryInReplyTo ?? null,
              delivery_references: receipt.deliveryReferences ?? [],
              delivery_recipients: receipt.deliveryRecipients ?? [],
              execution_mode: receipt.executionMode,
              provider_capability: receipt.providerCapability,
              provider_result_ok: receipt.providerResultOk,
              external_delivery_performed: receipt.externalDeliveryPerformed,
              missing_durable_provider_receipt: receipt.missingDurableProviderReceipt,
            },
          },
        }
        : null,
    }));
  }
  return flows.slice(0, 3);
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

export function recommendationCards(
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

export function sidebarActions(input: {
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
