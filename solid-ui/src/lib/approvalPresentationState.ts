// @locs-version: 1.0
import type { ApprovalReviewLike, AutonomyDecisionLike } from "afp-ts/continuity";
import type { AfpMessage, AfpView } from "@/lib/api";
import {
  approvalReviewForMessage,
  autonomyDecisionForMessage,
  approvalReviewFromUnknown,
  autonomyDecisionWithTierFallback,
  simulatorApprovalPreviewStateFromUnknown,
} from "@/lib/approvalReviewState";
import { isRecord } from "@/lib/eventDetail";
import {
  trustFieldFromRecord,
  trustSummaryStateFromExplicitFields,
  type TrustSummaryState,
} from "@/lib/trustFieldState";

export type ApprovalItem = {
  messageId: string;
  threadId: string;
  actionType: string;
  title: string;
  summary: string;
  status: "pending" | "approved" | "rejected" | string;
  requestedBy: string;
  previewOnly?: boolean;
  previewBoundarySummary?: string | null;
  boundedReason?: string | null;
  selectionReason?: string | null;
  consequencePreview?: string | null;
  provenanceCue?: string | null;
  sourceSummary?: string | null;
  approvalReview?: ApprovalReviewLike;
  autonomyDecision?: AutonomyDecisionLike;
  trustSummary: TrustSummaryState;
};

function approvalItemWithTrustSummary(
  item: Omit<ApprovalItem, "trustSummary">,
): ApprovalItem {
  return {
    ...item,
    trustSummary: trustSummaryStateFromExplicitFields({
      boundedReason: item.boundedReason ?? item.summary,
      selectionReason: item.selectionReason ?? null,
      consequencePreview: item.consequencePreview ?? null,
      provenanceCue: item.provenanceCue ?? null,
    }),
  };
}

function previewApprovalItem(props: {
  message: AfpMessage;
  previewState: NonNullable<ReturnType<typeof simulatorApprovalPreviewStateFromUnknown>>;
}): ApprovalItem {
  const { message, previewState } = props;
  return approvalItemWithTrustSummary({
    messageId: message.id,
    threadId: message.thread_id,
    actionType: "simulator_preview",
    title: previewState.title,
    summary: previewState.summary,
    status: "preview",
    requestedBy: message.from,
    previewOnly: true,
    previewBoundarySummary: previewState.previewBoundarySummary,
    boundedReason: previewState.boundedReason,
    selectionReason: previewState.selectionReason,
    consequencePreview: previewState.consequencePreview,
    provenanceCue: previewState.provenanceCue,
    sourceSummary: previewState.sourceSummary,
    approvalReview: previewState.approvalReview ?? undefined,
    autonomyDecision: previewState.autonomyDecision ?? undefined,
  });
}

function defaultApprovalItem(props: {
  message: AfpMessage;
  rawContent: Record<string, unknown>;
  view?: AfpView;
}): ApprovalItem {
  const { message, rawContent, view } = props;
  return approvalItemWithTrustSummary({
    messageId: message.id,
    threadId: message.thread_id,
    actionType: message.type,
    title:
      (rawContent.title as string | undefined)
      ?? (rawContent.subject as string | undefined)
      ?? message.type,
    summary:
      (rawContent.summary as string | undefined)
      ?? (rawContent.body as string | undefined)
      ?? "Agent action awaiting review.",
    status: (rawContent.status as string | undefined) ?? "pending",
    requestedBy: message.from,
    boundedReason: trustFieldFromRecord(rawContent, ["boundedReason", "bounded_reason"]) ?? null,
    selectionReason: trustFieldFromRecord(rawContent, ["selectionReason", "selection_reason"]) ?? null,
    consequencePreview: trustFieldFromRecord(
      rawContent,
      ["consequencePreview", "approval_or_reversibility_hint", "consequence_preview"],
    ) ?? null,
    provenanceCue: trustFieldFromRecord(rawContent, ["provenanceCue", "provenance_cue"]) ?? null,
    sourceSummary: trustFieldFromRecord(rawContent, ["sourceSummary", "source_summary"]) ?? null,
    approvalReview: approvalReviewForMessage(message, view) ?? undefined,
    autonomyDecision:
      autonomyDecisionForMessage(message, view)
      ?? autonomyDecisionWithTierFallback(rawContent.autonomy_decision, rawContent.autonomy_tier)
      ?? undefined,
  });
}

function approvalItemFromRecord(message: AfpMessage, rawItem: Record<string, unknown>): ApprovalItem {
  return approvalItemWithTrustSummary({
    messageId: typeof rawItem.messageId === "string" ? rawItem.messageId : message.id,
    threadId: typeof rawItem.threadId === "string" ? rawItem.threadId : message.thread_id,
    actionType:
      typeof rawItem.actionType === "string"
        ? rawItem.actionType
        : typeof rawItem.action_type === "string"
          ? rawItem.action_type
          : message.type,
    title:
      typeof rawItem.title === "string"
        ? rawItem.title
        : typeof rawItem.subject === "string"
          ? rawItem.subject
          : message.type,
    summary:
      typeof rawItem.summary === "string"
        ? rawItem.summary
        : typeof rawItem.body === "string"
          ? rawItem.body
          : "Agent action awaiting review.",
    status: typeof rawItem.status === "string" ? rawItem.status : "pending",
    requestedBy:
      typeof rawItem.requestedBy === "string"
        ? rawItem.requestedBy
        : typeof rawItem.requested_by === "string"
          ? rawItem.requested_by
          : message.from,
    previewOnly: rawItem.previewOnly === true || rawItem.preview_only === true,
    previewBoundarySummary: trustFieldFromRecord(
      rawItem,
      ["previewBoundarySummary", "preview_boundary_summary"],
    ) ?? null,
    boundedReason: trustFieldFromRecord(rawItem, ["boundedReason", "bounded_reason"]) ?? null,
    selectionReason: trustFieldFromRecord(rawItem, ["selectionReason", "selection_reason"]) ?? null,
    consequencePreview: trustFieldFromRecord(
      rawItem,
      ["consequencePreview", "approval_or_reversibility_hint", "consequence_preview"],
    ) ?? null,
    provenanceCue: trustFieldFromRecord(rawItem, ["provenanceCue", "provenance_cue"]) ?? null,
    sourceSummary: trustFieldFromRecord(rawItem, ["sourceSummary", "source_summary"]) ?? null,
    approvalReview: approvalReviewFromUnknown(rawItem.approvalReview ?? rawItem.approval_review) ?? undefined,
    autonomyDecision: autonomyDecisionWithTierFallback(
      rawItem.autonomyDecision ?? rawItem.autonomy_decision,
      rawItem.autonomyTier ?? rawItem.autonomy_tier,
    ) ?? undefined,
  });
}

export function approvalItemsForMessage(props: {
  message: AfpMessage;
  rawContent: Record<string, unknown>;
  view?: AfpView;
}): ApprovalItem[] {
  const { message, rawContent, view } = props;
  const previewState = simulatorApprovalPreviewStateFromUnknown(rawContent);
  if (previewState) {
    return [previewApprovalItem({ message, previewState })];
  }

  const rawItems = rawContent.items;
  if (Array.isArray(rawItems)) {
    return rawItems.filter(isRecord).map((item) => approvalItemFromRecord(message, item));
  }

  return [defaultApprovalItem({ message, rawContent, view })];
}
