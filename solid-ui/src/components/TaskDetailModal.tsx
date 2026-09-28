import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { fetchAgentTaskDetail, fetchThread, subscribeThread, type AfpMessage } from "../lib/api";
import { ApprovalReviewSummary } from "@/components/ApprovalReviewSummary";
import { TrustSummaryBlocks } from "@/components/renderers/TrustSummaryBlocks";
import {
  buildTaskDetailFailureReceipt,
  type TaskDetailFailureReceipt,
} from "@/lib/taskDetailFailureState";
import {
  type AgentTask,
  type TaskDetail,
} from "@/lib/taskDetailResponseState";
import {
  traceMessageState,
  type TraceMessageState,
} from "@/lib/taskDetailTraceMessageState";
import {
  taskCreatedAtText,
  taskDetailTitleText,
} from "@/lib/taskPresentationState";

type Props = {
  task: AgentTask;
  onClose: () => void;
};

type TaskDetailModalState = {
  createdAtText: string;
  showDetailError: boolean;
  showDetailSections: boolean;
  showEmptyTrace: boolean;
  showThreadError: boolean;
  showThreadRetry: boolean;
  showTraceMessages: boolean;
  titleText: string;
};

const TASK_DETAIL_MODAL_BACKDROP_STYLE = {
  position: "fixed",
  inset: "0",
  background: "rgba(0,0,0,0.55)",
  display: "flex",
  "align-items": "center",
  "justify-content": "center",
  padding: "12px",
  "z-index": "50",
} as const;

const TASK_DETAIL_MODAL_PANEL_STYLE = {
  background: "var(--surface, #1a1c1b)",
  border: "1px solid rgba(255,255,255,0.15)",
  "border-radius": "20px",
  padding: "clamp(14px, 4vw, 24px)",
  "max-width": "640px",
  width: "min(100%, 640px)",
  "max-height": "calc(100dvh - 24px)",
  overflow: "auto",
  "box-shadow": "0 24px 64px rgba(0,0,0,0.4)",
} as const;

function activeTaskStatus(status: string): boolean {
  return ["executing", "planning", "pending"].includes(status);
}

function taskDetailModalState(props: {
  task: AgentTask;
  detail: TaskDetail | null;
  detailError: TaskDetailFailureReceipt | null;
  loadingDetail: boolean;
  loadingThread: boolean;
  messages: AfpMessage[];
  threadError: TaskDetailFailureReceipt | null;
}): TaskDetailModalState {
  return {
    createdAtText: taskCreatedAtText(props.task),
    showDetailError: !props.loadingDetail && Boolean(props.detailError),
    showDetailSections: !props.loadingDetail && Boolean(props.detail),
    showEmptyTrace:
      !props.loadingThread && !props.threadError && props.messages.length === 0,
    showThreadError: !props.loadingThread && Boolean(props.threadError),
    showThreadRetry: Boolean(props.task.thread_id),
    showTraceMessages: props.messages.length > 0,
    titleText: taskDetailTitleText(props.task),
  };
}

export function TaskDetailModal(props: Props) {
  const [detail, setDetail] = createSignal<TaskDetail | null>(null);
  const [messages, setMessages] = createSignal<AfpMessage[]>([]);
  const [loadingDetail, setLoadingDetail] = createSignal(true);
  const [loadingThread, setLoadingThread] = createSignal(false);
  const [detailError, setDetailError] = createSignal<TaskDetailFailureReceipt | null>(null);
  const [threadError, setThreadError] = createSignal<TaskDetailFailureReceipt | null>(null);

  const modalState = createMemo(() =>
    taskDetailModalState({
      task: props.task,
      detail: detail(),
      detailError: detailError(),
      loadingDetail: loadingDetail(),
      loadingThread: loadingThread(),
      messages: messages(),
      threadError: threadError(),
    }));

  async function loadDetail() {
    setLoadingDetail(true);
    setDetailError(null);
    try {
      setDetail(await fetchAgentTaskDetail(props.task));
    } catch (error: unknown) {
      setDetail(null);
      setDetailError(
        buildTaskDetailFailureReceipt(
          "Load task detail",
          error instanceof Error ? error.message : "Failed to load task detail.",
        ),
      );
    }
    setLoadingDetail(false);
  }

  async function loadThread(threadId: string) {
    setLoadingThread(true);
    setThreadError(null);
    try {
      const nextMessages = await fetchThread(threadId);
      setMessages(nextMessages);
    } catch (error: unknown) {
      setMessages([]);
      setThreadError(
        buildTaskDetailFailureReceipt(
          "Load reasoning trace",
          error instanceof Error ? error.message : "Failed to load reasoning trace.",
        ),
      );
    }
    setLoadingThread(false);
  }

  onMount(() => {
    void loadDetail();
    if (!props.task.thread_id) return;
    void loadThread(props.task.thread_id);
    if (activeTaskStatus(props.task.status)) {
      const unsubscribe = subscribeThread(
        props.task.thread_id,
        () => void loadThread(props.task.thread_id!),
      );
      onCleanup(unsubscribe);
    }
  });

  return (
    <div
      style={TASK_DETAIL_MODAL_BACKDROP_STYLE}
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div style={TASK_DETAIL_MODAL_PANEL_STYLE}>
        <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-on-surface-variant">
              Task Detail
            </p>
            <h2 class="mt-1 break-words text-sm font-semibold text-on-surface">
              {modalState().titleText}
            </h2>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            class="w-full flex-shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-on-surface-variant hover:bg-white/10 sm:w-auto sm:py-1"
          >
            Close
          </button>
        </div>

        <div class="mb-4 flex flex-wrap gap-3 text-xs text-on-surface-variant">
          <span>
            Status: <span class="font-medium text-on-surface">{props.task.status}</span>
          </span>
          <span>
            Priority: <span class="font-medium text-on-surface">{props.task.priority}</span>
          </span>
          <span>Created: {modalState().createdAtText}</span>
        </div>

        <Show when={modalState().showDetailSections}>
          <Show when={detail()?.plan_json}>
            <div class="mb-4">
              <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                Plan
              </p>
              <pre class="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/20 p-3 font-mono text-[11px] leading-5 text-on-surface-variant">
                {JSON.stringify(detail()!.plan_json, null, 2)}
              </pre>
            </div>
          </Show>

          <Show when={detail()?.result_json}>
            <div class="mb-4">
              <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-green-600">
                Result
              </p>
              <pre class="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-green-500/10 p-3 font-mono text-[11px] leading-5 text-on-surface-variant">
                {JSON.stringify(detail()!.result_json, null, 2)}
              </pre>
            </div>
          </Show>

          <Show when={detail()?.error}>
            <div class="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3">
            <p class="break-words text-xs font-medium text-red-400">{detail()!.error}</p>
            </div>
          </Show>
        </Show>

        <Show when={modalState().showDetailError}>
          <div class="mb-4 rounded-lg border border-white/15 bg-white/5 p-3">
            <p class="text-xs font-semibold text-rose-300">{detailError()?.title}</p>
            <p class="mt-1 break-words text-xs text-on-surface-variant">{detailError()?.summary}</p>
            <p class="mt-1 text-[11px] text-on-surface-variant/80">{detailError()?.nextStep}</p>
            <button
              type="button"
              onClick={() => void loadDetail()}
              class="mt-2 rounded-md border border-white/15 px-2.5 py-1.5 text-[11px] text-on-surface-variant hover:bg-white/10"
            >
              Retry detail
            </button>
          </div>
        </Show>

        <div>
          <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Reasoning Trace
          </p>

          <Show when={loadingThread()}>
            <p class="text-xs text-on-surface-variant">Loading trace...</p>
          </Show>

          <Show when={modalState().showThreadError}>
            <div class="mb-3 rounded-lg border border-white/15 bg-white/5 p-3">
              <p class="text-xs font-semibold text-rose-300">{threadError()?.title}</p>
              <p class="mt-1 break-words text-xs text-on-surface-variant">{threadError()?.summary}</p>
              <p class="mt-1 text-[11px] text-on-surface-variant/80">{threadError()?.nextStep}</p>
              <Show when={modalState().showThreadRetry}>
                <button
                  type="button"
                  onClick={() => props.task.thread_id && void loadThread(props.task.thread_id)}
                  class="mt-2 rounded-md border border-white/15 px-2.5 py-1.5 text-[11px] text-on-surface-variant hover:bg-white/10"
                >
                  Retry trace
                </button>
              </Show>
            </div>
          </Show>

          <Show when={modalState().showEmptyTrace}>
            <p class="text-xs text-on-surface-variant">No trace messages yet.</p>
          </Show>

          <Show when={modalState().showTraceMessages}>
            <div class="space-y-2">
              <For each={messages()}>
                {(message) => {
                  const messageState = createMemo(() => traceMessageState(message));
                  return (
                    <div class="min-w-0 rounded-lg border border-white/10 bg-white/5 p-3">
                      <div class="mb-1 flex flex-wrap items-center gap-2">
                        <span class={`max-w-full rounded-full px-2 py-1 text-[10px] font-medium break-words ${messageState().stepBadgeClassName}`}>
                          {messageState().typeLabelText}
                        </span>
                        <Show when={messageState().showSimulatorApprovalBadge}>
                          <span class="max-w-full rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[10px] font-medium text-amber-300 break-words">
                            approval preview
                          </span>
                        </Show>
                        <Show when={messageState().showSimulatorReversibleBadge}>
                          <span class="max-w-full rounded-full border border-teal-400/20 bg-teal-400/10 px-2 py-1 text-[10px] font-medium text-teal-300 break-words">
                            reversible preview
                          </span>
                        </Show>
                        <Show when={messageState().showSimulatorFusionBadge}>
                          <span class="max-w-full rounded-full border border-violet-400/20 bg-violet-400/10 px-2 py-1 text-[10px] font-medium text-violet-300 break-words">
                            fusion preview
                          </span>
                        </Show>
                        <span class="break-words text-[10px] text-on-surface-variant">
                          {messageState().timestampText}
                        </span>
                      </div>

                      <ApprovalReviewSummary
                        class="mb-2 space-y-2 rounded-lg border border-amber-400/15 bg-amber-400/8 px-3 py-3"
                        titleClass="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/70"
                        chipClass="max-w-full rounded-full border border-white/15 bg-white/10 px-2 py-1 normal-case tracking-normal text-on-surface-variant break-words"
                        confidenceClass="max-w-full rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-1 normal-case tracking-normal text-amber-300 break-words"
                        approvalReview={messageState().approvalReview}
                        autonomyDecision={messageState().autonomyDecision}
                        fallbackReason={messageState().fallbackReasonText}
                      />

                      <Show when={messageState().showApprovalSelectionReason}>
                        <p class="mb-2 break-words text-xs text-on-surface-variant">
                          {messageState().simulatorDetails.selectionReason}
                        </p>
                      </Show>
                      <Show when={messageState().showSimulatorRolloutSummary}>
                        <p class="mb-2 break-words text-xs text-on-surface-variant">
                          {messageState().simulatorDetails.rolloutSummary}
                        </p>
                      </Show>
                      <Show
                        when={
                          messageState().showApprovalConsequencePreview
                          || messageState().showApprovalProvenanceCue
                          || messageState().showApprovalPreviewBoundary
                          || messageState().showApprovalSourceSummary
                        }
                      >
                        <div class="mb-2 space-y-2">
                          <TrustSummaryBlocks
                            consequencePreview={
                              messageState().showApprovalConsequencePreview
                                ? messageState().simulatorDetails.consequencePreview
                                : null
                            }
                            provenanceCue={
                              messageState().showApprovalProvenanceCue
                                ? messageState().simulatorDetails.provenanceCue
                                : null
                            }
                            previewBoundarySummary={
                              messageState().showApprovalPreviewBoundary
                                ? messageState().simulatorDetails.previewBoundarySummary
                                : null
                            }
                            sourceSummary={
                              messageState().showApprovalSourceSummary
                                ? messageState().simulatorDetails.sourceSummary
                                : null
                            }
                          />
                        </div>
                      </Show>

                      <Show when={messageState().showReversiblePreview}>
                        <div class="mb-2 rounded-lg border border-teal-400/15 bg-teal-400/8 px-3 py-3">
                          <Show when={messageState().simulatorDetails.boundedReason}>
                            <p class="mb-2 break-words text-xs text-teal-200/90">
                              {messageState().simulatorDetails.boundedReason}
                            </p>
                          </Show>
                          <Show when={messageState().simulatorDetails.hasDistinctSelectionReason}>
                            <p class="mb-2 break-words text-xs text-on-surface-variant">
                              {messageState().simulatorDetails.selectionReason}
                            </p>
                          </Show>
                          <Show when={messageState().showSimulatorRolloutSummary}>
                            <p class="mb-2 break-words text-xs text-on-surface-variant">
                              {messageState().simulatorDetails.rolloutSummary}
                            </p>
                          </Show>
                          <For each={messageState().simulatorLines}>
                            {(line) => <p class="break-words text-xs text-on-surface-variant">{line}</p>}
                          </For>
                          <div class="mt-2 space-y-2">
                            <TrustSummaryBlocks
                              consequencePreview={messageState().simulatorDetails.consequencePreview}
                              provenanceCue={messageState().simulatorDetails.provenanceCue}
                              previewBoundarySummary={messageState().simulatorDetails.previewBoundarySummary}
                              sourceSummary={messageState().simulatorDetails.sourceSummary}
                            />
                          </div>
                        </div>
                      </Show>

                      <Show when={messageState().showFusionPreview}>
                        <div class="mb-2 rounded-lg border border-violet-400/15 bg-violet-400/8 px-3 py-3">
                          <Show when={messageState().simulatorDetails.boundedReason}>
                            <p class="mb-2 break-words text-xs text-violet-200/90">
                              {messageState().simulatorDetails.boundedReason}
                            </p>
                          </Show>
                          <Show when={messageState().simulatorDetails.hasDistinctSelectionReason}>
                            <p class="mb-2 break-words text-xs text-on-surface-variant">
                              {messageState().simulatorDetails.selectionReason}
                            </p>
                          </Show>
                          <Show when={messageState().showSimulatorRolloutSummary}>
                            <p class="mb-2 break-words text-xs text-on-surface-variant">
                              {messageState().simulatorDetails.rolloutSummary}
                            </p>
                          </Show>
                          <For each={messageState().simulatorLines}>
                            {(line) => <p class="break-words text-xs text-on-surface-variant">{line}</p>}
                          </For>
                          <div class="mt-2 space-y-2">
                            <TrustSummaryBlocks
                              consequencePreview={messageState().simulatorDetails.consequencePreview}
                              provenanceCue={messageState().simulatorDetails.provenanceCue}
                              previewBoundarySummary={messageState().simulatorDetails.previewBoundarySummary}
                              sourceSummary={messageState().simulatorDetails.sourceSummary}
                            />
                          </div>
                        </div>
                      </Show>

                      <Show when={messageState().showRationaleText}>
                        <p class="break-words text-xs text-on-surface-variant">{messageState().rationaleText}</p>
                      </Show>

                      <Show when={messageState().showDescriptionText}>
                        <p class="break-words text-xs text-on-surface-variant">{messageState().descriptionText}</p>
                      </Show>

                      <Show when={messageState().showFinalAnswerText}>
                        <p class="break-words text-xs font-medium text-on-surface">
                          {messageState().finalAnswerText}
                        </p>
                      </Show>

                      <Show when={messageState().capabilityNameText}>
                        <p class="break-all font-mono text-xs text-on-surface-variant">
                          {messageState().capabilityNameText}
                          <Show when={messageState().showCapabilityStatus}>
                            {" | "}
                            <span class="text-on-surface">
                              {messageState().capabilityStatusText}
                            </span>
                          </Show>
                        </p>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
