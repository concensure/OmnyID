import { createMemo, createSignal, For, Show } from "solid-js";
import {
  type ApprovalReviewLike,
  type AutonomyDecisionLike,
  approvalRequestTitle,
} from "afp-ts/continuity";
import type { AfpMessage, AfpView } from "@/lib/api";
import { submitActionDecision } from "@/lib/api";
import {
  approvalMessageContent,
  approvalReviewForMessage,
  autonomyDecisionForMessage,
  approvalReviewFromUnknown,
  autonomyDecisionFromUnknown,
} from "@/lib/approvalReviewState";
import { ApprovalDecisionNotice } from "@/components/ApprovalDecisionNotice";
import { ApprovalReviewSummary } from "@/components/ApprovalReviewSummary";
import { ApprovalDecisionButtons } from "@/components/ApprovalDecisionButtons";
import { TrustSummaryBlocks } from "@/components/renderers/TrustSummaryBlocks";
import { afpRecord } from "@/lib/afpMessageRecord";
import { approvalItemsForMessage, type ApprovalItem } from "@/lib/approvalPresentationState";
import { approvalCardState } from "@/lib/approvalCardState";

type ApprovalsRendererState = {
  titleText: string;
  requestedByText: string;
  items: ApprovalItem[];
};
const APPROVAL_HEADER_SEPARATOR = "|";

function approvalsRendererState(props: {
  message: AfpMessage;
  view?: AfpView;
}): ApprovalsRendererState {
  const rawContent = approvalMessageContent(props.message, props.view);
  return {
    titleText: approvalRequestTitle(),
    requestedByText: props.message.from,
    items: approvalItemsForMessage({ message: props.message, rawContent, view: props.view }),
  };
}

export function ApprovalsRenderer(props: { message: AfpMessage; view?: AfpView }) {
  const rendererState = createMemo(() => approvalsRendererState(props));

  return (
    <div class="space-y-2">
      <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">
        {rendererState().titleText} {APPROVAL_HEADER_SEPARATOR} {rendererState().requestedByText}
      </p>
      <For each={rendererState().items}>
        {(item) => <ApprovalCard item={item} />}
      </For>
    </div>
  );
}

function ApprovalCard(props: { item: ApprovalItem }) {
  const [status, setStatus] = createSignal(props.item.status);
  const [busy, setBusy] = createSignal(false);
  const [feedback, setFeedback] = createSignal("");
  const [decisionFeedback, setDecisionFeedback] = createSignal<"approved" | "rejected" | null>(
    null,
  );

  const cardState = createMemo(() =>
    approvalCardState({
      item: props.item,
      statusText: status(),
      busy: busy(),
      feedbackText: feedback(),
      decisionFeedback: decisionFeedback(),
    }));

  async function decide(decision: "approved" | "rejected") {
    setBusy(true);
    try {
      await submitActionDecision({
        thread_id: props.item.threadId,
        target_message_id: props.item.messageId,
        decision,
      });
      setStatus(decision);
      setDecisionFeedback(decision);
      setFeedback("");
    } catch (error) {
      setDecisionFeedback(null);
      setFeedback((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="rounded-2xl border border-white/30 bg-white/20 px-4 py-3">
      <div class="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div class="min-w-0">
          <p class="break-words font-medium text-on-surface">{cardState().titleText}</p>
          <p class="mt-0.5 break-words font-mono text-[10px] uppercase tracking-[0.15em] text-outline">
            {cardState().actionTypeText} {APPROVAL_HEADER_SEPARATOR} {cardState().requestedByText}
          </p>
        </div>
        <span
          class={`max-w-full break-words rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-wider ${cardState().statusClass}`}
        >
          {cardState().statusText}
        </span>
      </div>
      <p class="mt-2 break-words text-sm leading-6 text-on-surface-variant">{cardState().primaryReasonText}</p>
      <ApprovalReviewSummary
        class="mt-3 space-y-2 rounded-xl border border-white/20 bg-white/25 px-3 py-3"
        approvalReview={props.item.approvalReview}
        autonomyDecision={props.item.autonomyDecision}
        fallbackReason={cardState().primaryReasonText}
      />
      <div class="mt-3 grid gap-2 sm:grid-cols-2">
        <TrustSummaryBlocks
          selectionReason={props.item.trustSummary.selectionReason}
          showSelectionReason={props.item.trustSummary.showSelectionReason}
          consequencePreview={cardState().consequencePreviewText}
          provenanceCue={cardState().provenanceCueText}
          sourceSummary={cardState().sourceSummaryText}
          previewBoundarySummary={props.item.previewOnly ? cardState().previewBoundaryText : null}
        />
      </div>
      <Show when={cardState().showDecisionButtons}>
        <ApprovalDecisionButtons
          class="mt-3 flex gap-2"
          busy={cardState().busy}
          onApprove={() => void decide("approved")}
          onReject={() => void decide("rejected")}
        />
      </Show>
      <Show when={cardState().decisionFeedback}>
        {(decision) => (
          <ApprovalDecisionNotice
            decision={decision()}
            context="queued_execution"
            class="mt-3 border-0 bg-transparent px-0 py-0 text-xs text-on-surface-variant"
            detailClass="text-on-surface-variant/80"
          />
        )}
      </Show>
      <Show when={cardState().showFeedbackText}>
        <p class="mt-2 text-xs text-on-surface-variant">{cardState().feedbackText}</p>
      </Show>
    </div>
  );
}
