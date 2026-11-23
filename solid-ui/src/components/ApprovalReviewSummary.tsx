// @locs-version: 1.0
import { createMemo, For, Show } from "solid-js";
import {
  approvalDraftPreviewLines,
  approvalReviewKindLabel,
  type ApprovalDraftPreview,
  type ApprovalReviewLike,
  type AutonomyDecisionLike,
} from "afp-ts/continuity";
import { TrustSummaryBlocks } from "@/components/renderers/TrustSummaryBlocks";
import { approvalReviewTrustBlockState } from "@/lib/approvalReviewSummaryState";

type ApprovalReviewSummaryProps = {
  approvalReview?: ApprovalReviewLike | null;
  autonomyDecision?: AutonomyDecisionLike | null;
  fallbackReason?: string | null;
  class?: string;
  chipClass?: string;
  confidenceClass?: string;
  titleClass?: string;
  listClass?: string;
  summaryClass?: string;
  previewClass?: string;
};

type ApprovalReviewSummaryState = {
  showSummary: boolean;
  className: string;
  titleClassName: string;
  titleText: string;
  kindLabel: string | null;
  showKindLabel: boolean;
  chipClassName: string;
  confidenceText: string | null;
  showConfidence: boolean;
  confidenceClassName: string;
  boundedReason: string | null;
  consequencePreview: string | null;
  provenanceCue: string | null;
  sourceSummary: string | null;
  visibleDetailLines: string[];
  showDetailLines: boolean;
  listClassName: string;
  draftPreview: ApprovalDraftPreview | null;
  showDraftPreview: boolean;
  previewClassName: string;
  previewLabelText: string | null;
  showPreviewLabel: boolean;
  previewContentText: string | null;
  previewContentType: string | null;
  previewLines: string[];
  showCodePreview: boolean;
  showLinePreview: boolean;
  showParagraphPreview: boolean;
};

const APPROVAL_REVIEW_SUMMARY_CLASS =
  "space-y-2 rounded-xl border border-white/20 bg-white/25 px-3 py-3";
const APPROVAL_REVIEW_TITLE_CLASS =
  "flex min-w-0 flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-outline";
const APPROVAL_REVIEW_CHIP_CLASS =
  "max-w-full rounded-full border border-white/20 bg-white/30 px-2 py-1 normal-case tracking-normal text-on-surface-variant break-words";
const APPROVAL_REVIEW_CONFIDENCE_CLASS =
  "max-w-full rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-1 normal-case tracking-normal text-amber-700 break-words";
const APPROVAL_REVIEW_LIST_CLASS = "space-y-1 text-xs text-on-surface-variant break-words";
const APPROVAL_REVIEW_PREVIEW_CLASS = "rounded-lg border border-white/20 bg-white/15";
const APPROVAL_REVIEW_PREVIEW_LABEL_CLASS =
  "border-b border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-outline";
const APPROVAL_REVIEW_PREVIEW_CODE_CLASS =
  "overflow-x-auto px-3 py-2 text-xs font-mono text-on-surface-variant whitespace-pre-wrap break-words";
const APPROVAL_REVIEW_PREVIEW_LIST_CLASS =
  "space-y-1 px-3 py-2 text-xs text-on-surface-variant";
const APPROVAL_REVIEW_PREVIEW_LINE_CLASS = "leading-relaxed break-words";
const APPROVAL_REVIEW_PREVIEW_TEXT_CLASS =
  "px-3 py-2 text-xs text-on-surface-variant leading-relaxed whitespace-pre-wrap break-words";

function approvalReviewSummaryState(
  props: ApprovalReviewSummaryProps,
): ApprovalReviewSummaryState {
  const draftPreview = props.approvalReview?.draft_preview ?? null;
  const previewLines = approvalDraftPreviewLines(draftPreview);
  const trustBlocks = approvalReviewTrustBlockState({
    approvalReview: props.approvalReview,
    autonomyDecision: props.autonomyDecision,
    fallbackReason: props.fallbackReason,
  });
  const kindLabel = approvalReviewKindLabel(props.approvalReview?.approval_kind) ?? null;
  const previewContentText = draftPreview?.content ?? null;
  const previewContentType = draftPreview?.content_type ?? null;
  const showCodePreview = previewContentType === "code";
  const showLinePreview = !showCodePreview && previewLines.length > 1;

  return {
    showSummary: Boolean(props.approvalReview || props.autonomyDecision),
    className: props.class ?? APPROVAL_REVIEW_SUMMARY_CLASS,
    titleClassName: props.titleClass ?? APPROVAL_REVIEW_TITLE_CLASS,
    titleText: props.approvalReview?.title ?? "Approval review",
    kindLabel,
    showKindLabel: Boolean(kindLabel),
    chipClassName: props.chipClass ?? APPROVAL_REVIEW_CHIP_CLASS,
    confidenceText: props.approvalReview?.confidence
      ? `${props.approvalReview.confidence} confidence`
      : null,
    showConfidence: Boolean(props.approvalReview?.confidence),
    confidenceClassName: props.confidenceClass ?? APPROVAL_REVIEW_CONFIDENCE_CLASS,
    boundedReason: trustBlocks.boundedReason,
    consequencePreview: trustBlocks.consequencePreview,
    provenanceCue: trustBlocks.provenanceCue,
    sourceSummary: trustBlocks.sourceSummary,
    visibleDetailLines: trustBlocks.detailLines.slice(0, 4),
    showDetailLines: trustBlocks.detailLines.length > 0,
    listClassName: props.listClass ?? APPROVAL_REVIEW_LIST_CLASS,
    draftPreview,
    showDraftPreview: Boolean(previewContentText),
    previewClassName: props.previewClass ?? APPROVAL_REVIEW_PREVIEW_CLASS,
    previewLabelText: draftPreview?.label ?? null,
    showPreviewLabel: Boolean(draftPreview?.label),
    previewContentText,
    previewContentType,
    previewLines,
    showCodePreview,
    showLinePreview,
    showParagraphPreview: Boolean(previewContentText) && !showCodePreview && !showLinePreview,
  };
}

export function ApprovalReviewSummary(props: ApprovalReviewSummaryProps) {
  const summaryState = createMemo(() => approvalReviewSummaryState(props));

  return (
    <Show when={summaryState().showSummary}>
      <div class={summaryState().className}>
        <div class={summaryState().titleClassName}>
          <span class="min-w-0 break-words">{summaryState().titleText}</span>
          <Show when={summaryState().showKindLabel}>
            <span class={summaryState().chipClassName}>{summaryState().kindLabel}</span>
          </Show>
          <Show when={summaryState().showConfidence}>
            <span class={summaryState().confidenceClassName}>
              {summaryState().confidenceText}
            </span>
          </Show>
        </div>
        <div class="grid gap-2 sm:grid-cols-2">
          <TrustSummaryBlocks
            boundedReason={summaryState().boundedReason}
            consequencePreview={summaryState().consequencePreview}
            provenanceCue={summaryState().provenanceCue}
            sourceSummary={summaryState().sourceSummary}
            blockSummaryClass={props.summaryClass}
          />
        </div>
        <Show when={summaryState().showDetailLines}>
          <ul class={summaryState().listClassName}>
            <For each={summaryState().visibleDetailLines}>
              {(line) => <li>{line}</li>}
            </For>
          </ul>
        </Show>
        <Show when={summaryState().showDraftPreview}>
          <div class={summaryState().previewClassName}>
            <Show when={summaryState().showPreviewLabel}>
              <div class={APPROVAL_REVIEW_PREVIEW_LABEL_CLASS}>
                {summaryState().previewLabelText}
              </div>
            </Show>
            <Show when={summaryState().showCodePreview}>
              <pre class={APPROVAL_REVIEW_PREVIEW_CODE_CLASS}>
                {summaryState().previewContentText}
              </pre>
            </Show>
            <Show when={summaryState().showLinePreview}>
              <ul class={APPROVAL_REVIEW_PREVIEW_LIST_CLASS}>
                <For each={summaryState().previewLines}>
                  {(line) => <li class={APPROVAL_REVIEW_PREVIEW_LINE_CLASS}>{line}</li>}
                </For>
              </ul>
            </Show>
            <Show when={summaryState().showParagraphPreview}>
              <p class={APPROVAL_REVIEW_PREVIEW_TEXT_CLASS}>
                {summaryState().previewContentText}
              </p>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
}
