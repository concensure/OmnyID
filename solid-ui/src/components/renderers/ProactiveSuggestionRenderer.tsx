// @locs-version: 1.0
import { createMemo, createSignal, For, Show } from "solid-js";
import {
  artifactSummaryDisplayedLines,
  artifactSummaryScopeCue,
  evidenceKindsSummary,
  type ApprovalReviewLike,
  preparedDraftActionLabel,
  priorityRationaleSummary,
  sourceCountSummary,
} from "afp-ts/continuity";
import { memoryScopeFromMetadata, recordProactiveOutcome, sendAfpPayloadMessage, type AfpMessage } from "@/lib/api";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import { approvalDraftPreviewFromUnknown, approvalReviewFromUnknown, proactiveSuggestionApprovalReviewPanelStateFromUnknown, simulatorApprovalReviewFromUnknown, simulatorPreviewKindFromUnknown, simulatorPreviewLinesFromUnknown, simulatorReviewSurfaceStateFromUnknown } from "@/lib/approvalReviewState";
import type { DecisionOsProactiveSuggestion } from "@/lib/decisionosContinuity";
import { ApprovalReviewSummary } from "@/components/ApprovalReviewSummary";
import { TrustSummaryBlocks } from "@/components/renderers/TrustSummaryBlocks";
import { toast } from "@/components/Toast";
import { simulatorPreviewBadgeLabel, simulatorPreviewBoundaryFallback, simulatorPreviewOnlyBadgeLabel, simulatorPreviewToggleLabel } from "@/lib/simulatorPreviewCopy";
import { decisionOsProactivePrimaryTrustBlockState, decisionOsProactiveTrustState } from "@/lib/decisionOsProactiveTrustState";
import { proactiveSuggestionContextArtifactPreviewState } from "@/lib/proactiveSuggestionContextArtifactPreviewState";
import { proactiveSuggestionFooterState } from "@/lib/proactiveSuggestionFooterState";
import { proactiveSuggestionSimulatorPreviewPanelState } from "@/lib/proactiveSuggestionSimulatorPreviewState";
import {
  decisionOsDestinationLabel,
  decisionOsProactiveSuggestionDestination,
  navigateToView,
} from "@/lib/decisionosNavigation";
import { decisionOsContextPackTrustState } from "@/lib/decisionOsContextPackPresentationState";
import { isRecord } from "@/lib/eventDetail";
import { afpRecord } from "@/lib/afpMessageRecord";

const COMPARISON_VALUE_SEPARATOR = " · ";

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function suggestionTone(content: Record<string, unknown>): string {
  if (simulatorPreviewKindFromUnknown(content) === "approval") {
    return "border-amber-400/25 bg-amber-400/10";
  }
  if (simulatorPreviewKindFromUnknown(content) === "reversible") {
    return "border-teal-400/25 bg-teal-400/10";
  }
  if (simulatorPreviewKindFromUnknown(content) === "fusion") {
    return "border-violet-400/25 bg-violet-400/10";
  }
  if (content["is_pack_suggestion"] === true) {
    return "border-violet-400/20 bg-violet-400/10";
  }
  const urgency = asString(content["urgency"]).toLowerCase();
  if (urgency === "high" || urgency === "urgent") {
    return "border-amber-400/25 bg-amber-400/10";
  }
  return "border-sky-400/20 bg-sky-400/10";
}

function confidenceLabel(content: Record<string, unknown>): string {
  const raw = content["confidence"];
  if (typeof raw === "string" && raw) return `${raw} confidence`;
  const numeric = asNumber(raw, -1);
  if (numeric >= 0) {
    const pct = numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric);
    return `${pct}% confidence`;
  }
  return "";
}

function artifactLines(content: Record<string, unknown>): string[] {
  const selectionReason = asString(content["selection_reason"]);
  return simulatorPreviewLinesFromUnknown(content)
    .length > 0
    ? simulatorPreviewLinesFromUnknown(content)
    .filter((line): line is string => Boolean(line))
    .filter((line) => line !== selectionReason && !line.startsWith("Scope: "))
    : artifactSummaryDisplayedLines({
      artifact_summary_lines: asStringArray(content["artifact_summary_lines"]),
      description: asString(content["description"]),
      draft_preview: approvalDraftPreviewFromUnknown(content["draft_preview"]),
    })
      .filter((line): line is string => Boolean(line))
      .filter((line) => line !== selectionReason && !line.startsWith("Scope: "))
      .slice(0, 3);
}

function scopeCueLabel(content: Record<string, unknown>): string | null {
  const explicit = artifactSummaryScopeCue({
    artifact_summary_lines: asStringArray(content["artifact_summary_lines"]),
    description: asString(content["description"]),
    draft_preview: approvalDraftPreviewFromUnknown(content["draft_preview"]),
  });
  if (explicit) return explicit.replace(/^Scope:\s*/, "").trim();

  const memorySpace = asString(content["memory_space"]).trim();
  const authorType = asString(content["author_type"]).trim();
  const humanGrounded = content["human_only"] === true
    || content["is_human_authored"] === true
    || authorType === "human";

  if (memorySpace && humanGrounded) return `${memorySpace} context, human-grounded`;
  if (memorySpace) return `${memorySpace} context`;
  if (humanGrounded) return "human-grounded";
  return null;
}

function trustReasonLines(content: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const sourceCount = sourceCountValue(content);
  if (sourceCount > 0) {
    lines.push(`Based on ${sourceCount} source${sourceCount === 1 ? "" : "s"}`);
  }
  const evidenceLine = evidenceKindsSummary(asStringArray(content["evidence_kinds"]));
  if (evidenceLine) {
    lines.push(evidenceLine);
  }
  return lines;
}

type ComparisonRow = { label: string; values: string[] };

function comparisonRows(content: Record<string, unknown>): ComparisonRow[] {
  const raw = content["comparison_rows"];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!isRecord(row)) return null;
      const record = row;
      return {
        label: asString(record["label"]),
        values: Array.isArray(record["values"])
          ? record["values"].map((value) => asString(value)).filter(Boolean)
          : [],
      };
    })
    .filter((row): row is ComparisonRow => Boolean(row?.label));
}

function outcomeFeedback(content: Record<string, unknown>): Record<string, unknown> | null {
  const raw = content["outcome_feedback"];
  return isRecord(raw) ? raw : null;
}

function sourceCountValue(content: Record<string, unknown>): number {
  const direct = asNumber(content["source_count"], 0);
  if (direct > 0) return direct;
  return asStringArray(content["source_refs"]).length;
}

function outcomeFeedbackLabel(content: Record<string, unknown>): string | null {
  const feedback = outcomeFeedback(content);
  const status = asString(feedback?.["status"]);
  const scope = asString(feedback?.["scope"]);
  if (!status) return null;
  if (status === "cooldown_recommended" && scope === "family") return "family cooldown";
  if (status === "cautious") return "caution";
  if (status === "reinforced" && scope === "family") return "trusted family";
  return status.replaceAll("_", " ");
}

function outcomeFeedbackTone(content: Record<string, unknown>): string {
  const status = asString(outcomeFeedback(content)?.["status"]);
  if (status === "reinforced" || status === "trusted") {
    return "border-emerald-300/20 bg-emerald-400/12 text-emerald-50";
  }
  if (status === "cooldown_recommended" || status === "cautious") {
    return "border-amber-300/20 bg-amber-400/12 text-amber-50";
  }
  if (status === "suppressed") {
    return "border-rose-300/20 bg-rose-400/12 text-rose-50";
  }
  return "border-white/15 bg-white/15 text-on-surface-variant/85";
}

function outcomeFeedbackDetail(content: Record<string, unknown>): string | null {
  const feedback = outcomeFeedback(content);
  if (!feedback) return null;
  const status = asString(feedback["status"]);
  const scope = asString(feedback["scope"]);
  const rate = asNumber(feedback["acceptance_rate"], -1);
  const acceptancePct = rate >= 0 ? Math.round(rate * 100) : null;
  if (scope === "family" && (status === "cooldown_recommended" || status === "cautious")) {
    return acceptancePct === null
      ? "Similar variants were dismissed often, so this was cooled down."
      : `Similar variants were accepted ${acceptancePct}% of the time, so this was cooled down.`;
  }
  if (status === "trusted" || status === "reinforced") {
    return acceptancePct === null
      ? "This pattern has been accepted reliably."
      : `This pattern has been accepted ${acceptancePct}% of the time.`;
  }
  return null;
}

function adaptationSignalDetail(content: Record<string, unknown>): string | null {
  const feedback = outcomeFeedback(content);
  if (!feedback || typeof feedback !== "object") return null;

  const signals = Array.isArray(feedback["adaptation_signals"])
    ? feedback["adaptation_signals"].filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
  const delta = typeof feedback["threshold_delta"] === "number" && Number.isFinite(feedback["threshold_delta"])
    ? feedback["threshold_delta"]
    : null;
  const reason = typeof feedback["adaptation_reason"] === "string" ? feedback["adaptation_reason"] : null;
  const status = typeof feedback["status"] === "string" ? feedback["status"] : null;
  if (!status) return null;

  const thresholdLine = delta === null || Math.abs(delta) < 0.01
    ? null
    : delta > 0
      ? "Adaptive feedback tightened the interruption threshold slightly."
      : "Adaptive feedback relaxed the interruption threshold slightly.";

  const reasonLine = (() => {
    switch (reason) {
      case "suppression_active":
        return "Adaptive suppression remains active for this pattern.";
      case "cooldown_active":
        return "Adaptive cooldown remains active for this pattern.";
      case "trust_building":
        return "Adaptive trust is building for this pattern.";
      case "reinforced":
        return "Adaptive trust is reinforced for this pattern.";
      default:
        return null;
    }
  })();

  const signalLine = signals.length > 0
    ? `Adjusted using live signals: ${signals.join(", ")}.`
    : null;

  const parts = [thresholdLine, signalLine, reasonLine].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

export function ProactiveSuggestionRenderer(props: { message: AfpMessage }) {
  const [feedbackState, setFeedbackState] = createSignal<"accepted" | "dismissed" | null>(null);
  const [feedbackPending, setFeedbackPending] = createSignal(false);
  const [artifactPreviewOpen, setArtifactPreviewOpen] = createSignal(false);
  const [artifactPromotionPending, setArtifactPromotionPending] = createSignal(false);
  const [artifactPromotionMessageId, setArtifactPromotionMessageId] = createSignal<string | null>(null);
  const content = () => afpRecord(decryptedDisplayContent(props.message));
  const metadata = () => afpRecord(props.message.metadata);
  const presentationRecord = () => ({ ...metadata(), ...content() });
  const proactiveSuggestion = () => content() as unknown as DecisionOsProactiveSuggestion;
  const label = () =>
    simulatorPreviewKind()
      ? simulatorPreviewBadgeLabel(simulatorPreviewKind()!)
      : content()["is_pack_suggestion"] === true
      ? "pack suggestion"
      : asString(content()["draft_class"]).replaceAll("_", " ") || "proactive suggestion";
  const title = () =>
    asString(content()["title"]) ||
    asString(content()["action_label"]) ||
    "Proactive suggestion";
  const description = () => asString(content()["description"]);
  const actionLabel = () => {
    const item = proactiveSuggestion();
    if (item.kind === "prepared_draft" && item.draft_class) {
      return preparedDraftActionLabel([{ draft_class: item.draft_class }]);
    }
    if (
      item.kind === "continuity_priority"
      || item.kind === "context_pack"
      || item.kind === "context_ready"
      || Boolean(item.destination_view)
      || Boolean(item.panel_kind)
      || Boolean(item.surface_hint)
    ) {
      return `Open ${decisionOsDestinationLabel(
        decisionOsProactiveSuggestionDestination(item),
      )}`;
    }
    return item.action_label || "Open workspace";
  };
  const packId = () => asString(content()["pack_id"]);
  const lines = () => artifactLines(content());
  const comparisons = () => comparisonRows(content());
  const comparisonPreviewRows = () => comparisons().slice(0, 2);
  const confidence = () => confidenceLabel(content());
  const urgency = () => asString(content()["urgency"]);
  const suggestionDestination = () =>
    decisionOsProactiveSuggestionDestination(proactiveSuggestion());
  const destinationLabel = () =>
    decisionOsDestinationLabel(suggestionDestination());
  const scopeCue = () => scopeCueLabel(content());
  const sourceRefs = () => asStringArray(presentationRecord()["source_refs"]);
  const sourceCount = () => sourceCountValue(presentationRecord());
  const sourceSummary = () => sourceCountSummary(sourceRefs());
  const strategicPolicy = () => asRecord(presentationRecord()["strategic_policy"]);
  const strategicAction = () => asString(strategicPolicy()?.["action"]);
  const feedbackLabel = () => outcomeFeedbackLabel(content());
  const feedbackDetail = () => outcomeFeedbackDetail(content());
  const adaptationDetail = () => adaptationSignalDetail(content());
  const selectionReason = () =>
    asString(presentationRecord()["selection_reason"]);
  const proactiveTrustState = () =>
    decisionOsProactiveTrustState({
      kind: asString(presentationRecord()["kind"]) || null,
      pack_kind: asString(presentationRecord()["pack_kind"]) || null,
      draft_class: asString(presentationRecord()["draft_class"]) || null,
      selection_reason: selectionReason() || null,
      requires_approval: presentationRecord()["requires_approval"] === true,
      readiness: asString(presentationRecord()["readiness"]) || null,
      response_due_hint: asString(presentationRecord()["response_due_hint"]) || null,
      source_refs: sourceRefs(),
      evidence_kinds: asStringArray(presentationRecord()["evidence_kinds"]),
      approval_or_reversibility_hint: asString(presentationRecord()["approval_or_reversibility_hint"]) || null,
      provenance_cue: asString(presentationRecord()["provenance_cue"]) || null,
      autonomy_tier: asString(presentationRecord()["autonomy_tier"]) || null,
      autonomy_decision: presentationRecord()["autonomy_decision"],
      simulator_source_summary: simulatorReviewSurface()?.sourceSummary ?? null,
    });
  const boundedReason = () => proactiveTrustState().boundedReasonText || "";
  const distinctSelectionReason = () => proactiveTrustState().distinctSelectionReasonText || "";
  const priorityReason = () => proactiveTrustState().priorityRationaleText || "";
  const consequencePreview = () => proactiveTrustState().consequenceSummaryText || "";
  const previewBoundarySummary = () => asString(content()["preview_boundary_summary"]);
  const provenanceCue = () => proactiveTrustState().provenanceSummaryText || "";
  const trustReasons = () => trustReasonLines(content());
  const simulatorPreviewKind = () => simulatorPreviewKindFromUnknown(content());
  const simulatorReviewSurface = () => simulatorReviewSurfaceStateFromUnknown(content());
  const isSimulatorApprovalPreview = () => simulatorPreviewKind() === "approval";
  const isSimulatorReversiblePreview = () => simulatorPreviewKind() === "reversible";
  const isSimulatorFusionPreview = () => simulatorPreviewKind() === "fusion";
  const isSimulatorReviewPreview = () =>
    isSimulatorApprovalPreview()
    || isSimulatorReversiblePreview()
    || isSimulatorFusionPreview();
  const simulatorDraftPreview = () => simulatorReviewSurface()?.draftPreview ?? null;
  const approvalReview = (): ApprovalReviewLike | null => {
    if (!isSimulatorApprovalPreview()) return null;
    return simulatorApprovalReviewFromUnknown(content())
      ?? approvalReviewFromUnknown({
        title: title(),
        reason: description() || selectionReason(),
        confidence: asString(content()["confidence"]) || undefined,
        approval_kind: asString(content()["approval_kind"]) || undefined,
        draft_preview: simulatorDraftPreview() ?? undefined,
        consequence_summary_lines: lines(),
        source_refs: sourceRefs(),
      });
  };
  const heuristicId = () => asString(content()["heuristic_id"]);
  const actionPayload = () => asRecord(content()["action_afp_payload"]);
  const actionPayloadContent = () => asRecord(actionPayload()?.["content"]);
  const actionPayloadMetadata = () => asRecord(actionPayload()?.["metadata"]);
  const actionPayloadTitle = () =>
    asString(actionPayloadContent()?.["title"])
    || asString(actionPayloadContent()?.["summary"])
    || asString(actionPayloadContent()?.["subject"])
    || "Prepared artifact";
  const actionPayloadSummary = () =>
    asString(actionPayloadContent()?.["summary"])
    || asString(actionPayloadContent()?.["body"]);
  const actionPayloadBody = () => asString(actionPayloadContent()?.["body"]);
  const actionPayloadDraftClass = () => asString(actionPayloadContent()?.["draft_class"]);
  const actionPayloadSimulatorPromoted = () =>
    actionPayloadMetadata()?.["simulator_preview_promoted"] === true;
  const actionPayloadThreadId = () => asString(actionPayload()?.["thread_id"]);
  const actionPayloadLinkedToSuggestion = () =>
    actionPayloadMetadata()?.["originating_proactive_suggestion_id"] === props.message.id;
  const actionPayloadReadyForPromotion = () => {
    const payload = actionPayload();
    return Boolean(
      payload
      && asString(payload["thread_id"])
      && asString(payload["from"])
      && asString(payload["type"])
      && Array.isArray(payload["to"]),
    );
  };
  const contextArtifactPreviewAvailable = () =>
    (asString(content()["kind"]) === "context_ready" || asString(content()["kind"]) === "context_pack")
    && (
      lines().length > 0
      || asStringArray(content()["reference_labels"]).length > 0
      || asStringArray(content()["object_labels"]).length > 0
      || asStringArray(content()["file_labels"]).length > 0
      || asStringArray(content()["file_refs"]).length > 0
      || asStringArray(content()["anchor_refs"]).length > 0
      || asStringArray(content()["evidence_kinds"]).length > 0
      || sourceCount() > 0
    );
  const simulatorPreviewReviewAvailable = () =>
    isSimulatorReviewPreview() && Boolean(simulatorReviewSurface()?.reviewAvailable);
  const reviewArtifactAvailable = () =>
    Boolean(actionPayload())
    || contextArtifactPreviewAvailable()
    || simulatorPreviewReviewAvailable();
  const reviewToggleLabel = () =>
    isSimulatorReviewPreview() ? simulatorPreviewToggleLabel(false) : "Review artifact";
  const contextArtifactTitle = () =>
    asString(content()["kind"]) === "context_ready" ? "Prepared context packet" : "Context pack";
  const contextReferenceLabels = () => asStringArray(content()["reference_labels"]);
  const contextObjectLabels = () => asStringArray(content()["object_labels"]);
  const contextFileLabels = () => asStringArray(content()["file_labels"]);
  const contextAnchorRefs = () => asStringArray(content()["anchor_refs"]);
  const contextEvidenceKinds = () => asStringArray(content()["evidence_kinds"]);
  const contextSourceSummary = () => sourceCountSummary(sourceRefs());
  const simulatorPreviewPrimarySourceRef = () => simulatorReviewSurface()?.primarySourceRef ?? null;
  const simulatorPersistenceReason = () => simulatorReviewSurface()?.persistenceReason ?? null;
  const simulatorRolloutSummary = () => simulatorReviewSurface()?.rolloutSummary ?? null;
  const simulatorDraftPreviewTitle = () =>
    null;
  const simulatorDraftPreviewSummary = () => simulatorReviewSurface()?.draftPreviewSummary ?? null;
  const simulatorApprovalKindLabel = () => simulatorReviewSurface()?.approvalKindLabel ?? null;
  const canRecordFeedback = () => heuristicId().length > 0 && !feedbackPending();
  const canPromoteArtifact = () =>
    actionPayloadReadyForPromotion() && !artifactPromotionPending() && !artifactPromotionMessageId();
  const displayState = createMemo(() => {
    const labelText = label();
    const urgencyText = urgency();
    const packIdText = packId();
    const feedbackLabelText = feedbackLabel();
    const descriptionText = description();
    const boundedReasonText = boundedReason();
    const scopeCueText = scopeCue();
    const selectionReasonText = distinctSelectionReason();
    const priorityReasonText = priorityReason();
    const consequencePreviewText = consequencePreview();
    const provenanceCueText = provenanceCue();
    const feedbackDetailText = feedbackDetail();
    const adaptationDetailText = adaptationDetail();
    const confidenceText = confidence();
    const destinationText = destinationLabel();
    const sourceSummaryText = proactiveTrustState().sourceSummaryText || sourceSummary();
    const artifactLineItems = lines();
    const trustReasonTexts = trustReasons();
    const comparisonRowsPreview = comparisonPreviewRows();
    const simulatorReviewPreview = isSimulatorReviewPreview();
    const previewOpen = artifactPreviewOpen();
    const suggestionActionText = actionLabel();

    return {
      shellClass: `space-y-3 rounded-2xl border p-4 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.4)] ${suggestionTone(content())}`,
      labelText,
      urgencyText,
      packIdText,
      feedbackLabelText,
      feedbackToneClass: outcomeFeedbackTone(content()),
      titleText: title(),
      descriptionText,
      boundedReasonText,
      scopeCueText,
      selectionReasonText,
      priorityReasonText,
      consequencePreviewText,
      provenanceCueText,
      feedbackDetailText,
      adaptationDetailText,
      confidenceText,
      destinationText,
      sourceSummaryText,
      artifactLineItems,
      trustReasonTexts,
      comparisonRowsPreview,
      suggestionActionText,
      previewToggleText: previewOpen
        ? simulatorReviewPreview ? simulatorPreviewToggleLabel(true) : "Hide artifact"
        : simulatorReviewPreview ? reviewToggleLabel() : "Review artifact",
      canRecordFeedback: canRecordFeedback(),
      canPromoteArtifact: canPromoteArtifact(),
      feedbackStatus: feedbackState(),
      feedbackPending: feedbackPending(),
      artifactPromotionPending: artifactPromotionPending(),
      promotedArtifactMessageId: artifactPromotionMessageId(),
      promotedArtifactThreadId: actionPayloadThreadId(),
      actionPayloadPromotionReady: actionPayloadReadyForPromotion(),
      showUrgency: Boolean(urgencyText),
      showPackId: Boolean(packIdText),
      showFeedbackLabel: Boolean(feedbackLabelText),
      showDescription: Boolean(descriptionText),
      showScopeCue: Boolean(scopeCueText),
      showPriorityReason: Boolean(priorityReasonText),
      showFeedbackDetail: Boolean(feedbackDetailText),
      showAdaptationDetail: Boolean(adaptationDetailText),
      showConfidence: primaryTrustBlockState().showHeaderConfidence,
      showHeaderActions: Boolean(suggestionActionText && destinationText),
      showReviewArtifactToggle: reviewArtifactAvailable(),
      showArtifactLines: artifactLineItems.length > 0,
      showTrustReasons: trustReasonTexts.length > 0,
      showComparisonPreview: comparisonRowsPreview.length > 0,
      showSourceSummary: primaryTrustBlockState().showFooterSourceSummary,
      showDestinationLabel: Boolean(destinationText),
    };
  });
  const artifactPayloadPreviewState = createMemo(() => {
    const promotedArtifactMessageId = artifactPromotionMessageId();
    const promotedArtifactThreadId = actionPayloadThreadId();
    const payloadSummaryText = actionPayloadSummary();
    const payloadBodyText = actionPayloadBody();
    const draftClassText = actionPayloadDraftClass();
    return {
      showPanel: artifactPreviewOpen() && Boolean(actionPayload()),
      draftClassText,
      showDraftClass: Boolean(draftClassText),
      showSimulatorPromoted: actionPayloadSimulatorPromoted(),
      titleText: actionPayloadTitle(),
      payloadSummaryText,
      showSummary: Boolean(payloadSummaryText),
      promotedArtifactMessageId,
      showPromotedArtifactMessage: Boolean(promotedArtifactMessageId),
      promotedArtifactThreadId,
      showPromotedArtifactThread: Boolean(promotedArtifactMessageId && promotedArtifactThreadId),
      showLinkedBackMessage: Boolean(promotedArtifactMessageId || actionPayloadLinkedToSuggestion()),
      payloadBodyText,
      showBody: Boolean(payloadBodyText) && payloadBodyText !== payloadSummaryText,
    };
  });
  const contextArtifactPreviewState = createMemo(() => {
    const evidenceSummaryText = evidenceKindsSummary(contextEvidenceKinds());
    const contextSourceSummaryText = contextSourceSummary();
    const scopeCueText = scopeCue();
    const artifactLineItems = lines();
    const referenceLabels = contextReferenceLabels();
    const objectLabels = contextObjectLabels();
    const fileLabels = contextFileLabels();
    const anchorRefs = contextAnchorRefs();
    const trustState =
      asString(content()["kind"]) === "context_ready" || asString(content()["kind"]) === "context_pack"
        ? decisionOsContextPackTrustState({
            kind: asString(content()["kind"]) === "context_ready" ? "context_ready" : "context_pack",
            pack_kind: asString(content()["pack_kind"]) || "",
            why_surfaced: asString(content()["selection_reason"]) || null,
            source_refs: sourceRefs(),
            retrieval_mode: asString(content()["retrieval_mode"]) || null,
            deeper_retrieval_recommended: content()["deeper_retrieval_recommended"] === true,
            readiness_reason: asString(content()["readiness_reason"]) || null,
            topology_budget_used: asNumber(content()["topology_budget_used"], 0),
            working_set_count: asNumber(content()["working_set_count"], 0),
            active_topic_count: asNumber(content()["active_topic_count"], 0),
          })
        : null;
    return proactiveSuggestionContextArtifactPreviewState({
      artifactPreviewOpen: artifactPreviewOpen(),
      hasActionPayload: Boolean(actionPayload()),
      contextArtifactPreviewAvailable: contextArtifactPreviewAvailable(),
      titleText: contextArtifactTitle(),
      evidenceSummaryText,
      sourceSummaryText: contextSourceSummaryText,
      scopeCueText,
      artifactLineItems,
      referenceLabels,
      objectLabels,
      fileLabels,
      anchorRefs,
      readinessReasonText: trustState?.readinessReasonText ?? null,
      retrievalModeText: trustState?.retrievalModeText ?? null,
      consequenceSummaryText: trustState?.consequenceSummaryText ?? null,
      provenanceSummaryText: trustState?.provenanceSummaryText ?? null,
      topologyBudgetText: trustState?.topologyBudgetText ?? null,
      workingSetText: trustState?.workingSetText ?? null,
      activeTopicText: trustState?.activeTopicText ?? null,
    });
  });
  const simulatorPreviewPanelState = createMemo(() => {
    return proactiveSuggestionSimulatorPreviewPanelState({
      artifactPreviewOpen: artifactPreviewOpen(),
      hasActionPayload: Boolean(actionPayload()),
      simulatorPreviewReviewAvailable: simulatorPreviewReviewAvailable(),
      showApprovalPreview: isSimulatorApprovalPreview(),
      showReversiblePreview: isSimulatorReversiblePreview(),
      showFusionPreview: isSimulatorFusionPreview(),
      approvalKindLabelText: simulatorApprovalKindLabel(),
      boundarySummaryText: previewBoundarySummary() || simulatorPreviewBoundaryFallback(),
      sourceSummaryText: proactiveTrustState().sourceSummaryText,
      persistenceReasonText: simulatorPersistenceReason(),
      rolloutSummaryText: simulatorRolloutSummary(),
      consequencePreviewText: consequencePreview(),
      provenanceCueText: provenanceCue(),
      draftPreviewTitleText: simulatorDraftPreviewTitle(),
      draftPreviewSummaryText: simulatorDraftPreviewSummary(),
      primarySourceRef: simulatorPreviewPrimarySourceRef(),
      approvalReview: approvalReviewState().reviewValue,
      autonomyDecision: approvalReviewState().autonomyDecision,
      fallbackReasonText: approvalReviewState().fallbackReasonText,
    });
  });
  const footerState = createMemo(() => {
    return proactiveSuggestionFooterState({
      artifactLineItems: lines(),
      trustReasonTexts: trustReasons(),
      comparisonRowsPreview: comparisonPreviewRows(),
      sourceSummaryText: displayState().sourceSummaryText,
      destinationText: destinationLabel(),
      provenanceCueText: provenanceCue(),
      surfacePolicy: asString(presentationRecord()["surface_policy"]),
      approvalPolicy: asString(presentationRecord()["approval_policy"]),
      strategicAction: strategicAction(),
      showSourceSummaryCandidate: displayState().showSourceSummary,
      contextArtifactShowsSourceSummary: contextArtifactPreviewState().showPanel
        && contextArtifactPreviewState().showSharedTrustBlocks,
      simulatorPreviewShowsSourceSummary: simulatorPreviewPanelState().showPanel
        && simulatorPreviewPanelState().showSourceSummary,
    });
  });
  const actionState = createMemo(() => {
    const heuristicIdText = heuristicId();
    return {
      showFeedbackActions: Boolean(heuristicIdText),
      showPromotedArtifactOpen:
        Boolean(displayState().promotedArtifactMessageId && displayState().promotedArtifactThreadId),
    };
  });
  const approvalReviewState = createMemo(() => {
    return proactiveSuggestionApprovalReviewPanelStateFromUnknown(presentationRecord());
  });
  const primaryTrustBlockState = createMemo(() => {
    return decisionOsProactivePrimaryTrustBlockState({
      boundedReasonText: boundedReason(),
      selectionReasonText: distinctSelectionReason(),
      consequencePreviewText: consequencePreview(),
      provenanceCueText: provenanceCue(),
      sourceSummaryText: sourceSummary(),
      confidenceText: confidence(),
      hasApprovalReview: approvalReviewState().showPanel,
      isSimulatorReviewPreview: isSimulatorReviewPreview(),
    });
  });
  const reversiblePreviewState = createMemo(() => {
    const boundarySummaryText = previewBoundarySummary();
    const consequencePreviewText = consequencePreview();
    return {
      showPanel: isSimulatorReversiblePreview(),
      boundarySummaryText:
        boundarySummaryText
        || simulatorPreviewBoundaryFallback(),
      consequencePreviewText,
      showConsequencePreview: Boolean(consequencePreviewText),
    };
  });

  async function submitOutcomeFeedback(accepted: boolean) {
    if (!heuristicId()) {
      toast.warning("This suggestion does not expose a heuristic id for feedback yet.");
      return;
    }
    if (feedbackPending()) return;
    setFeedbackPending(true);
    try {
      await recordProactiveOutcome({
        suggestion_id: props.message.id,
        accepted,
        heuristic_id: heuristicId(),
        memory_scope: memoryScopeFromMetadata(props.message.metadata, {
          author_type: "human",
          is_human_authored: true,
        }),
      });
      setFeedbackState(accepted ? "accepted" : "dismissed");
      toast.success(
        accepted
          ? "Recorded as helpful human feedback."
          : "Recorded as not useful human feedback.",
      );
    } catch {
      toast.error("Could not record proactive feedback.");
    } finally {
      setFeedbackPending(false);
    }
  }

  async function promoteArtifact() {
    const payload = actionPayload();
    if (!payload || !actionPayloadReadyForPromotion()) {
      toast.warning("This suggestion does not expose a promotable artifact payload yet.");
      return;
    }
    if (artifactPromotionPending() || artifactPromotionMessageId()) return;
    setArtifactPromotionPending(true);
    try {
      const existingMetadata = asRecord(payload["metadata"]) ?? {};
      const existingReferences = Array.isArray(payload["references"])
        ? payload["references"].filter((value): value is Record<string, unknown> =>
            Boolean(value) && typeof value === "object" && !Array.isArray(value))
        : [];
      const response = await sendAfpPayloadMessage({
        ...payload,
        metadata: {
          ...existingMetadata,
          originating_proactive_suggestion_id: props.message.id,
          originating_proactive_thread_id: props.message.thread_id,
          promoted_from_proactive_suggestion: true,
        },
        references: [
          ...existingReferences,
          {
            type: "message",
            target: props.message.id,
            metadata: {
              relation: "proactive_source",
              thread_id: props.message.thread_id,
            },
          },
        ],
      });
      setArtifactPromotionMessageId(response.message_id);
      if (heuristicId()) {
        try {
          await recordProactiveOutcome({
            suggestion_id: props.message.id,
            accepted: true,
            heuristic_id: heuristicId(),
            memory_scope: memoryScopeFromMetadata(props.message.metadata, {
              author_type: "human",
              is_human_authored: true,
            }),
          });
          setFeedbackState("accepted");
        } catch {
          // Artifact promotion is the primary action; feedback reinforcement stays best-effort.
        }
      }
      toast.success("Promoted artifact into the workspace ledger.");
    } catch {
      toast.error("Could not promote artifact.");
    } finally {
      setArtifactPromotionPending(false);
    }
  }

  function openPromotedArtifact() {
    const threadId = actionPayloadThreadId();
    const messageId = artifactPromotionMessageId();
    if (!threadId || !messageId) {
      toast.warning("The promoted artifact does not expose a thread destination.");
      return;
    }
    navigateToView("threads", { threadId, messageId });
  }

  function openSimulatorPreviewSource() {
    const messageId = simulatorPreviewPrimarySourceRef();
    if (!messageId) {
      toast.warning("This preview does not expose a source thread yet.");
      return;
    }
    navigateToView("threads", { messageId });
  }

  return (
    <div class={displayState().shellClass}>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="rounded-full border border-white/15 bg-white/15 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/85">
              {displayState().labelText}
            </span>
            <Show when={displayState().showUrgency}>
              <span class="rounded-full border border-white/15 bg-white/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant/85">
                {displayState().urgencyText}
              </span>
            </Show>
            <Show when={displayState().showPackId}>
              <span class="rounded-full border border-violet-300/20 bg-violet-400/12 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-100">
                {displayState().packIdText}
              </span>
            </Show>
            <Show when={displayState().showFeedbackLabel}>
              <span class={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${displayState().feedbackToneClass}`}>
                {displayState().feedbackLabelText}
              </span>
            </Show>
          </div>
          <h3 class="text-sm font-semibold text-on-surface">{displayState().titleText}</h3>
          <Show when={displayState().showDescription}>
            <p class="text-sm leading-6 text-on-surface-variant">{displayState().descriptionText}</p>
          </Show>
          <Show when={displayState().showScopeCue}>
            <div class="pt-0.5">
              <span class="rounded-full border border-emerald-300/20 bg-emerald-400/12 px-2 py-1 text-[10px] font-medium text-emerald-50">
                {displayState().scopeCueText}
              </span>
            </div>
          </Show>
          <Show when={primaryTrustBlockState().showSharedTrustBlocks}>
            <div class="grid gap-2 pt-1 sm:grid-cols-2">
              <TrustSummaryBlocks
                boundedReason={primaryTrustBlockState().boundedReasonText}
                selectionReason={primaryTrustBlockState().selectionReasonText}
                showSelectionReason={Boolean(primaryTrustBlockState().selectionReasonText)}
                consequencePreview={primaryTrustBlockState().consequencePreviewText}
                provenanceCue={primaryTrustBlockState().provenanceCueText}
                sourceSummary={primaryTrustBlockState().sourceSummaryText}
                confidence={primaryTrustBlockState().confidenceText}
              />
            </div>
          </Show>
          <Show when={displayState().showPriorityReason}>
            <p class="text-xs leading-5 text-on-surface-variant/80">{displayState().priorityReasonText}</p>
          </Show>
          <Show when={displayState().showFeedbackDetail}>
            <p class="text-xs leading-5 text-on-surface-variant/80">{displayState().feedbackDetailText}</p>
          </Show>
          <Show when={displayState().showAdaptationDetail}>
            <p class="text-xs leading-5 text-on-surface-variant/80">{displayState().adaptationDetailText}</p>
          </Show>
        </div>
        <div class="flex flex-col items-end gap-2">
          <Show when={displayState().showConfidence}>
            <span class="rounded-full border border-white/15 bg-white/15 px-2.5 py-1 text-[10px] font-medium text-on-surface-variant/85">
              {displayState().confidenceText}
            </span>
          </Show>
          <Show when={actionState().showFeedbackActions}>
            <div class="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={!displayState().canRecordFeedback || displayState().feedbackStatus === "accepted"}
                onClick={() => void submitOutcomeFeedback(true)}
                class="rounded-full border border-emerald-300/20 bg-emerald-400/12 px-3 py-1.5 text-[11px] font-medium text-emerald-50 transition enabled:hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {displayState().feedbackStatus === "accepted" ? "Helpful recorded" : displayState().feedbackPending ? "Saving..." : "Helpful"}
              </button>
              <button
                type="button"
                disabled={!displayState().canRecordFeedback || displayState().feedbackStatus === "dismissed"}
                onClick={() => void submitOutcomeFeedback(false)}
                class="rounded-full border border-rose-300/20 bg-rose-400/12 px-3 py-1.5 text-[11px] font-medium text-rose-50 transition enabled:hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {displayState().feedbackStatus === "dismissed" ? "Not useful recorded" : displayState().feedbackPending ? "Saving..." : "Not useful"}
              </button>
            </div>
          </Show>
          <Show when={displayState().showHeaderActions}>
            <div class="flex flex-wrap justify-end gap-2">
              <Show when={displayState().showReviewArtifactToggle}>
                <button
                  type="button"
                  onClick={() => setArtifactPreviewOpen((open) => !open)}
                  class="rounded-full border border-white/15 bg-white/12 px-3 py-1.5 text-[11px] font-medium text-on-surface transition hover:bg-white/18"
                >
                  {displayState().previewToggleText}
                </button>
              </Show>
              <Show when={displayState().actionPayloadPromotionReady}>
                <button
                  type="button"
                  disabled={!displayState().canPromoteArtifact}
                  onClick={() => void promoteArtifact()}
                  class="rounded-full border border-emerald-300/20 bg-emerald-400/12 px-3 py-1.5 text-[11px] font-medium text-emerald-50 transition enabled:hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {displayState().promotedArtifactMessageId
                    ? "Artifact promoted"
                    : displayState().artifactPromotionPending
                      ? "Promoting..."
                      : "Promote artifact"}
                </button>
              </Show>
              <Show when={actionState().showPromotedArtifactOpen}>
                <button
                  type="button"
                  onClick={openPromotedArtifact}
                  class="rounded-full border border-sky-300/20 bg-sky-400/12 px-3 py-1.5 text-[11px] font-medium text-sky-50 transition hover:bg-sky-400/20"
                >
                  Open promoted artifact
                </button>
              </Show>
              <button
                type="button"
                onClick={() =>
                  navigateToView(suggestionDestination())
                }
                class="rounded-full bg-white/85 px-3 py-1.5 text-[11px] font-medium text-slate-900 transition hover:bg-white"
              >
                {displayState().suggestionActionText}
              </button>
            </div>
          </Show>
        </div>
      </div>

      <Show when={artifactPayloadPreviewState().showPanel}>
        <div class="space-y-2 rounded-xl border border-white/12 bg-white/8 px-3 py-3">
          <div class="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/80">
            <span>Artifact preview</span>
            <Show when={artifactPayloadPreviewState().showDraftClass}>
              <span class="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 normal-case tracking-normal text-on-surface-variant">
                {artifactPayloadPreviewState().draftClassText}
              </span>
            </Show>
            <Show when={artifactPayloadPreviewState().showSimulatorPromoted}>
              <span class="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 normal-case tracking-normal text-amber-50">
                simulator promoted preview
              </span>
            </Show>
          </div>
          <p class="text-xs font-medium leading-5 text-on-surface">{artifactPayloadPreviewState().titleText}</p>
          <Show when={artifactPayloadPreviewState().showSummary}>
            <p class="text-xs leading-5 text-on-surface-variant/85">{artifactPayloadPreviewState().payloadSummaryText}</p>
          </Show>
          <Show when={artifactPayloadPreviewState().showPromotedArtifactMessage}>
            <p class="text-xs leading-5 text-emerald-100/90">
              Promoted into the workspace ledger as {artifactPayloadPreviewState().promotedArtifactMessageId}.
            </p>
          </Show>
          <Show when={artifactPayloadPreviewState().showPromotedArtifactThread}>
            <p class="text-xs leading-5 text-on-surface-variant/80">
              Stored in thread {artifactPayloadPreviewState().promotedArtifactThreadId}.
            </p>
          </Show>
          <Show when={artifactPayloadPreviewState().showLinkedBackMessage}>
            <p class="text-xs leading-5 text-on-surface-variant/80">
              Linked back to this proactive suggestion for provenance.
            </p>
          </Show>
          <Show when={artifactPayloadPreviewState().showBody}>
            <div class="rounded-lg border border-white/10 bg-white/6 px-3 py-2">
              <p class="text-xs leading-5 whitespace-pre-wrap text-on-surface-variant">
                {artifactPayloadPreviewState().payloadBodyText}
              </p>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={contextArtifactPreviewState().showPanel}>
        <div class="space-y-2 rounded-xl border border-white/12 bg-white/8 px-3 py-3">
          <div class="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/80">
            <span>Artifact preview</span>
            <span class="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 normal-case tracking-normal text-on-surface-variant">
              {contextArtifactPreviewState().titleText}
            </span>
            <Show when={contextArtifactPreviewState().showEvidenceSummary}>
              <span class="rounded-full border border-sky-300/25 bg-sky-300/10 px-2 py-0.5 normal-case tracking-normal text-sky-50">
                {contextArtifactPreviewState().evidenceSummaryText}
              </span>
            </Show>
          </div>
          <Show when={contextArtifactPreviewState().showSharedTrustBlocks}>
            <div class="grid gap-2 sm:grid-cols-2">
              <TrustSummaryBlocks
                sourceSummary={contextArtifactPreviewState().sourceSummaryText}
                consequencePreview={contextArtifactPreviewState().consequenceSummaryText}
                provenanceCue={contextArtifactPreviewState().provenanceSummaryText}
              />
            </div>
          </Show>
          <Show when={contextArtifactPreviewState().showScopeCue}>
            <p class="text-xs leading-5 text-emerald-100/90">Scope: {contextArtifactPreviewState().scopeCueText}</p>
          </Show>
          <Show when={contextArtifactPreviewState().showReadinessReason}>
            <p class="text-xs leading-5 text-on-surface-variant/85">{contextArtifactPreviewState().readinessReasonText}</p>
          </Show>
          <Show when={contextArtifactPreviewState().showRetrievalMode}>
            <p class="text-xs leading-5 text-on-surface-variant/85">{contextArtifactPreviewState().retrievalModeText}</p>
          </Show>
          <Show when={contextArtifactPreviewState().showTopologyBudget}>
            <p class="text-xs leading-5 text-on-surface-variant/85">{contextArtifactPreviewState().topologyBudgetText}</p>
          </Show>
          <Show when={contextArtifactPreviewState().showWorkingSet}>
            <p class="text-xs leading-5 text-on-surface-variant/85">{contextArtifactPreviewState().workingSetText}</p>
          </Show>
          <Show when={contextArtifactPreviewState().showActiveTopicCount}>
            <p class="text-xs leading-5 text-on-surface-variant/85">{contextArtifactPreviewState().activeTopicText}</p>
          </Show>
          <Show when={contextArtifactPreviewState().showArtifactLines}>
            <div class="space-y-1">
              <For each={contextArtifactPreviewState().artifactLineItems}>
                {(line) => <p class="text-xs leading-5 text-on-surface-variant/85">{line}</p>}
              </For>
            </div>
          </Show>
          <Show when={contextArtifactPreviewState().showReferenceLabels}>
            <div class="space-y-1">
              <p class="text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/75">References</p>
              <p class="text-xs leading-5 text-on-surface-variant/85">{contextArtifactPreviewState().referenceLabels.join(", ")}</p>
            </div>
          </Show>
          <Show when={contextArtifactPreviewState().showObjectLabels}>
            <div class="space-y-1">
              <p class="text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/75">Object anchors</p>
              <p class="text-xs leading-5 text-on-surface-variant/85">{contextArtifactPreviewState().objectLabels.join(", ")}</p>
            </div>
          </Show>
          <Show when={contextArtifactPreviewState().showFileLabels}>
            <div class="space-y-1">
              <p class="text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/75">File anchors</p>
              <p class="text-xs leading-5 text-on-surface-variant/85">{contextArtifactPreviewState().fileLabels.join(", ")}</p>
            </div>
          </Show>
          <Show when={contextArtifactPreviewState().showAnchorRefs}>
            <div class="space-y-1">
              <p class="text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/75">Anchor refs</p>
              <p class="text-xs leading-5 text-on-surface-variant/85">{contextArtifactPreviewState().anchorRefs.slice(0, 3).join(", ")}</p>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={simulatorPreviewPanelState().showPanel}>
        <div class="space-y-2 rounded-xl border border-white/12 bg-white/8 px-3 py-3">
          <div class="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/80">
            <span>Preview review</span>
            <span class="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 normal-case tracking-normal text-amber-50">
              {simulatorPreviewOnlyBadgeLabel()}
            </span>
            <Show when={simulatorPreviewPanelState().showApprovalPreview}>
              <span class="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 normal-case tracking-normal text-on-surface-variant">
                {simulatorPreviewBadgeLabel("approval")}
              </span>
            </Show>
            <Show when={simulatorPreviewPanelState().showReversiblePreview}>
              <span class="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 normal-case tracking-normal text-on-surface-variant">
                {simulatorPreviewBadgeLabel("reversible")}
              </span>
            </Show>
            <Show when={simulatorPreviewPanelState().showFusionPreview}>
              <span class="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 normal-case tracking-normal text-on-surface-variant">
                {simulatorPreviewBadgeLabel("fusion")}
              </span>
            </Show>
            <Show when={simulatorPreviewPanelState().showApprovalKindLabel}>
              <span class="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 normal-case tracking-normal text-on-surface-variant">
                {simulatorPreviewPanelState().approvalKindLabelText}
              </span>
            </Show>
          </div>
          <Show when={simulatorPreviewPanelState().showPersistenceReason}>
            <p class="text-xs leading-5 text-on-surface-variant/85">{simulatorPreviewPanelState().persistenceReasonText}</p>
          </Show>
          <Show when={simulatorPreviewPanelState().showRolloutSummary}>
            <p class="text-xs leading-5 text-on-surface-variant/85">{simulatorPreviewPanelState().rolloutSummaryText}</p>
          </Show>
          <div class="grid gap-2 sm:grid-cols-2">
            <TrustSummaryBlocks
              previewBoundarySummary={
                simulatorPreviewPanelState().showBoundarySummary
                  ? simulatorPreviewPanelState().boundarySummaryText
                  : null
              }
              sourceSummary={
                simulatorPreviewPanelState().showSourceSummary
                  ? simulatorPreviewPanelState().sourceSummaryText
                  : null
              }
              consequencePreview={
                simulatorPreviewPanelState().showConsequencePreview
                  ? simulatorPreviewPanelState().consequencePreviewText
                  : null
              }
              provenanceCue={
                simulatorPreviewPanelState().showProvenanceCue
                  ? simulatorPreviewPanelState().provenanceCueText
                  : null
              }
            />
          </div>
          <Show when={simulatorPreviewPanelState().showDraftPreviewTitle}>
            <div class="rounded-lg border border-white/10 bg-white/6 px-3 py-2">
              <p class="text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/75">Draft preview</p>
              <p class="mt-1 text-xs font-medium leading-5 text-on-surface">{simulatorPreviewPanelState().draftPreviewTitleText}</p>
              <Show when={simulatorPreviewPanelState().showDraftPreviewSummary}>
                <p class="mt-1 text-xs leading-5 text-on-surface-variant/85">{simulatorPreviewPanelState().draftPreviewSummaryText}</p>
              </Show>
            </div>
          </Show>
          <Show when={simulatorPreviewPanelState().showPrimarySourceRef}>
            <div class="flex justify-end">
              <button
                type="button"
                onClick={openSimulatorPreviewSource}
                class="rounded-full border border-white/15 bg-white/12 px-3 py-1.5 text-[11px] font-medium text-on-surface transition hover:bg-white/18"
              >
                Open source thread
              </button>
            </div>
          </Show>
        </div>
      </Show>

      <Show when={approvalReviewState().showPanel}>
        <ApprovalReviewSummary
          approvalReview={approvalReviewState().reviewValue}
          fallbackReason={approvalReviewState().fallbackReasonText}
          autonomyDecision={approvalReviewState().autonomyDecision}
          class="space-y-2 rounded-xl border border-amber-300/20 bg-white/10 px-3 py-3"
          titleClass="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/80"
          chipClass="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 normal-case tracking-normal text-on-surface-variant"
          confidenceClass="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 normal-case tracking-normal text-amber-50"
          summaryClass="text-xs text-on-surface-variant/85"
          listClass="space-y-1 text-xs text-on-surface-variant/80"
          previewClass="rounded-lg border border-white/15 bg-white/8"
        />
      </Show>

      <Show when={reversiblePreviewState().showPanel}>
        <div class="space-y-2 rounded-xl border border-teal-300/20 bg-white/10 px-3 py-3">
          <div class="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/80">
            <span>Reversible preview</span>
            <span class="rounded-full border border-teal-300/25 bg-teal-300/10 px-2 py-0.5 normal-case tracking-normal text-teal-50">
              {simulatorPreviewOnlyBadgeLabel()}
            </span>
          </div>
          <div class="grid gap-2 sm:grid-cols-2">
            <TrustSummaryBlocks
              previewBoundarySummary={reversiblePreviewState().boundarySummaryText}
              consequencePreview={
                reversiblePreviewState().showConsequencePreview
                  ? reversiblePreviewState().consequencePreviewText
                  : null
              }
            />
          </div>
        </div>
      </Show>

      <Show when={footerState().showArtifactLines}>
        <div class="rounded-xl border border-white/12 bg-white/8 px-3 py-2.5">
          <For each={footerState().artifactLineItems}>
            {(line) => <p class="text-xs leading-5 text-on-surface-variant">{line}</p>}
          </For>
        </div>
      </Show>

      <Show when={footerState().showTrustReasons}>
        <div class="rounded-xl border border-white/12 bg-white/8 px-3 py-2.5">
          <For each={footerState().trustReasonTexts}>
            {(line) => <p class="text-xs leading-5 text-sky-100/90">{line}</p>}
          </For>
        </div>
      </Show>

      <Show when={footerState().showComparisonPreview}>
        <div class="rounded-xl border border-white/12 bg-white/8 px-3 py-2.5">
          <For each={footerState().comparisonRowsPreview}>
            {(row) => (
              <div class="flex items-center justify-between gap-2 text-xs leading-5 text-on-surface-variant">
                <span class="font-medium text-on-surface">{row.label}</span>
                <span>{row.values.slice(0, 2).join(COMPARISON_VALUE_SEPARATOR)}</span>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={footerState().showProvenanceLines}>
        <div class="rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2.5">
          <For each={footerState().provenanceLineItems}>
            {(line) => <p class="text-xs leading-5 text-emerald-50/90">{line}</p>}
          </For>
        </div>
      </Show>

      <div class="flex flex-wrap items-center gap-2 text-[10px] text-on-surface-variant/75">
        <Show when={footerState().showSourceSummary}>
          <span>{footerState().sourceSummaryText}</span>
        </Show>
        <Show when={footerState().showDestinationLabel}>
          <span>routes to {footerState().destinationText}</span>
        </Show>
      </div>
    </div>
  );
}
