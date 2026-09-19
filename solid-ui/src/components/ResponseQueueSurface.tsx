// @locs-version: 1.0
// @module-id: ui.response-queue-surface
// @primary-capability: response-queue-dashboard
// @stability: beta
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { subscribeMagicActionEvent } from "@/lib/magicActionEvent";
import { EmptyState } from "@/components/EmptyState";
import { readSession } from "@/lib/api";
import {
  outcomeFeedbackDetail,
  outcomeFeedbackLabel,
  outcomeFeedbackTone,
  preparedDraftClassLabel,
  responseItemPreparedDraftAnchorSummary,
  responseItemPreparedDraftDisplayedSummaryLines,
  resolveResponseNavigationTarget,
  responseItemOutcomeFeedbackForItem,
} from "afp-ts/continuity";
import { ThreadDiscoveryStateSummary } from "@/components/ThreadDiscoveryStateSummary";
import { TrustSummaryBlocks } from "@/components/renderers/TrustSummaryBlocks";
import {
  decisionOsDestinationLabel,
  openDecisionOsResponseTarget,
} from "@/lib/decisionosNavigation";
import {
  type DecisionOsQueueCompanionState,
} from "@/lib/decisionOsQueueBootstrapState";
import {
  inferResponseRelationship,
  loadResponseQueuePolicy,
  rankResponseItems,
} from "@/lib/responseQueuePolicy";
import {
  loadResponseQueueSoundEnabled,
  saveResponseQueueSoundEnabled,
} from "@/lib/responseQueueSoundPreference";
import {
  hasPreparedDraftThreadRetrievalState,
  preparedDraftThreadRetrievalState,
} from "@/lib/threadRetrievalState";
import { decisionOsResponsePreparedDraftPresentationState } from "@/lib/decisionosPreparedWorkState";
import { responseQueueCardTrustState } from "@/lib/responseQueueCardTrustState";

function playUrgentDing() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.45);
    setTimeout(() => ctx.close(), 600);
  } catch {
    // AudioContext unavailable.
  }
}

function responseUrgencyTone(urgency: string): string {
  if (urgency === "urgent") return "border-rose-200/70 bg-rose-50/80 text-rose-700";
  if (urgency === "today") return "border-amber-200/70 bg-amber-50/80 text-amber-700";
  return "border-slate-200/70 bg-slate-50/80 text-slate-600";
}

function draftReadinessTone(readiness?: string | null): string {
  if (readiness === "ready_now") return "border-emerald-200/70 bg-emerald-50/80 text-emerald-700";
  return "border-emerald-100/70 bg-emerald-50/60 text-emerald-700";
}

const RESPONSE_QUEUE_EMPTY_STATE_CLASS = "bg-white/70";
const RESPONSE_QUEUE_EMPTY_STATE_TITLE = "Response queue is clear";
const RESPONSE_QUEUE_EMPTY_STATE_BODY =
  "No conversations currently need a reply from you. When the workspace detects a thread that needs attention, it will appear here with urgency and draft context.";
const RESPONSE_QUEUE_LABEL = "Response Queue";
const RESPONSE_QUEUE_TITLE = "Conversations waiting on you";
const RESPONSE_QUEUE_SUBTITLE =
  "Ranked by urgency first, then expected reply window from your response policy.";
const RESPONSE_QUEUE_LABEL_CLASS =
  "font-mono text-[10px] uppercase tracking-[0.22em] text-sky-700/70";
const RESPONSE_QUEUE_TITLE_H1_CLASS = "mt-1 text-lg font-semibold text-on-surface";
const RESPONSE_QUEUE_TITLE_H2_CLASS = "mt-1 text-sm font-semibold text-on-surface";
const RESPONSE_QUEUE_HEADER_ACTIONS_CLASS = "flex flex-wrap items-center gap-2";
const RESPONSE_QUEUE_HEADER_GAP_CLASS = {
  compact: "gap-3",
  comfortable: "gap-4",
} as const;
const RESPONSE_QUEUE_SUBTITLE_CLASS = {
  compact: "mt-2 text-[11px] text-sky-800/70",
  comfortable: "mt-2 text-sm text-sky-800/70",
} as const;
const RESPONSE_QUEUE_GRID_CLASS = {
  compact: "grid mt-3 gap-2",
  comfortable: "grid mt-5 gap-3",
} as const;
const RESPONSE_QUEUE_CARD_ROW_CLASS = {
  compact: "flex flex-wrap items-start justify-between gap-2",
  comfortable: "flex flex-wrap items-start justify-between gap-3",
} as const;
const RESPONSE_QUEUE_CARD_TITLE_CLASS = {
  compact:
    "min-w-0 break-words text-sm font-medium text-on-surface",
  comfortable:
    "min-w-0 break-words text-base font-medium text-on-surface",
} as const;
const RESPONSE_QUEUE_CARD_METADATA_CLASS = {
  compact: "mt-2 flex flex-wrap items-center gap-2 text-[11px] text-on-surface-variant/70",
  comfortable: "mt-2 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant/70",
} as const;
const RESPONSE_QUEUE_CARD_BODY_CLASS = {
  compact: "mt-1 text-[10px]",
  comfortable: "mt-1 text-[11px]",
} as const;
const RESPONSE_QUEUE_CARD_CLASS = {
  compact:
    "group rounded-2xl border border-white/70 bg-white/80 px-3 py-3 text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sky-200/80",
  comfortable:
    "group rounded-2xl border border-white/70 bg-white/80 px-4 py-4 text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sky-200/80",
} as const;
const RESPONSE_QUEUE_PILL_SIZE_CLASS = {
  compact: "px-2 py-1 text-[10px]",
  comfortable: "px-2.5 py-1 text-[11px]",
} as const;
const RESPONSE_QUEUE_CHANNEL_PILL_CLASS = {
  compact:
    "max-w-full break-words rounded-full border border-sky-200/60 bg-sky-50/80 px-2 py-1 uppercase tracking-wide text-[10px] text-sky-700",
  comfortable:
    "max-w-full break-words rounded-full border border-sky-200/60 bg-sky-50/80 px-2.5 py-1 uppercase tracking-wide text-[11px] text-sky-700",
} as const;
const RESPONSE_QUEUE_RELATIONSHIP_PILL_CLASS = {
  compact:
    "max-w-full break-words rounded-full border border-slate-200/60 bg-slate-50/80 px-2 py-1 uppercase tracking-wide text-[10px] text-slate-600",
  comfortable:
    "max-w-full break-words rounded-full border border-slate-200/60 bg-slate-50/80 px-2.5 py-1 uppercase tracking-wide text-[11px] text-slate-600",
} as const;
const RESPONSE_QUEUE_URGENCY_PILL_CLASS = {
  compact: "px-2.5 py-1 text-[10px]",
  comfortable: "px-3 py-1 text-[11px]",
} as const;
const RESPONSE_QUEUE_SUMMARY_CLASS = {
  compact: "mt-2 break-words text-[11px] text-emerald-800/75",
  comfortable: "mt-2 break-words text-xs text-emerald-800/75",
} as const;
const RESPONSE_QUEUE_OPEN_TEXT_CLASS = "mt-3 text-[11px] text-on-surface-variant/60";
const RESPONSE_QUEUE_ACTION_BUTTON_CLASS = {
  compact:
    "rounded-full border border-sky-200/70 bg-white/85 px-3 py-2 text-[11px] font-medium text-sky-700 transition hover:bg-white sm:py-1",
  comfortable:
    "rounded-full border border-sky-200/70 bg-white/85 px-4 py-2 text-sm font-medium text-sky-700 transition hover:bg-white",
} as const;
const RESPONSE_QUEUE_COUNT_BADGE_CLASS = {
  compact:
    "rounded-full border border-sky-200/70 bg-white/80 px-3 py-2 text-[11px] text-sky-700 sm:py-1",
  comfortable:
    "rounded-full border border-sky-200/70 bg-white/80 px-4 py-2 text-sm text-sky-700",
} as const;

export function ResponseQueueSurface(props: {
  queueCompanionState: DecisionOsQueueCompanionState;
  focusTick?: number;
  compact?: boolean;
  titleTag?: "h1" | "h2";
  actionLabel?: string;
  onAction?: () => void;
  class?: string;
}) {
  const sessionUserId = readSession()?.user?.id ?? null;
  const policy = loadResponseQueuePolicy(sessionUserId);
  const [isFocused, setIsFocused] = createSignal(false);
  const [soundEnabled, setSoundEnabled] = createSignal(loadResponseQueueSoundEnabled());
  const queueCompanionState = () => props.queueCompanionState;
  const focusTick = () => props.focusTick ?? 0;
  const titleTag = () => props.titleTag ?? "h2";
  const compact = () => props.compact ?? false;
  const sectionOverrideClass = () => props.class;
  const headerAction = () => props.onAction;
  const headerActionLabel = () => props.actionLabel ?? null;
  const responseItems = () => queueCompanionState().responseItems;
  const proactiveSuggestions = () => queueCompanionState().proactiveSuggestions;
  const surfaceState = createMemo(() => {
    const rankedItems = rankResponseItems(responseItems(), policy);
    const totalCount = rankedItems.length;
    return {
      rankedItems,
      urgentItemCount: rankedItems.filter((item) => item.urgency === "urgent").length,
      totalCount,
      totalCountLabel: `${totalCount} item${totalCount === 1 ? "" : "s"}`,
      showHeaderAction: Boolean(headerAction() && headerActionLabel()),
      headerActionLabel: headerActionLabel(),
    };
  });

  let isFirstSoundRun = true;
  const [prevUrgentCount, setPrevUrgentCount] = createSignal(0);

  createEffect(() => {
    const urgentCount = surfaceState().urgentItemCount;
    if (isFirstSoundRun) {
      isFirstSoundRun = false;
      setPrevUrgentCount(urgentCount);
      return;
    }
    if (soundEnabled() && urgentCount > prevUrgentCount()) playUrgentDing();
    setPrevUrgentCount(urgentCount);
  });

  const sectionClass = () =>
    sectionOverrideClass()
    ?? `min-w-0 rounded-[24px] border p-3 backdrop-blur-sm transition-all duration-300 sm:rounded-[28px] sm:p-4 ${
      isFocused()
        ? "border-sky-300/90 bg-[linear-gradient(135deg,rgba(224,242,254,0.98),rgba(255,255,255,0.98))] shadow-[0_0_0_3px_rgba(14,165,233,0.12),0_22px_60px_-28px_rgba(14,116,144,0.42)]"
        : "border-sky-100/80 bg-[linear-gradient(135deg,rgba(240,249,255,0.92),rgba(255,255,255,0.94))] shadow-[0_18px_50px_-28px_rgba(14,116,144,0.35)]"
    }`;
  const compactMode = () => (compact() ? "compact" : "comfortable");
  const headerClass = () => `flex min-w-0 flex-col ${RESPONSE_QUEUE_HEADER_GAP_CLASS[compactMode()]} sm:flex-row sm:flex-wrap sm:items-start sm:justify-between`;
  const subtitleClass = () => RESPONSE_QUEUE_SUBTITLE_CLASS[compactMode()];
  const actionButtonClass = () => RESPONSE_QUEUE_ACTION_BUTTON_CLASS[compactMode()];
  const countBadgeClass = () => RESPONSE_QUEUE_COUNT_BADGE_CLASS[compactMode()];
  const gridClass = () => RESPONSE_QUEUE_GRID_CLASS[compactMode()];
  const titleClass = () => (titleTag() === "h1" ? RESPONSE_QUEUE_TITLE_H1_CLASS : RESPONSE_QUEUE_TITLE_H2_CLASS);
  const cardRowClass = () => RESPONSE_QUEUE_CARD_ROW_CLASS[compactMode()];
  const cardTitleClass = () => RESPONSE_QUEUE_CARD_TITLE_CLASS[compactMode()];
  const cardMetadataClass = () => RESPONSE_QUEUE_CARD_METADATA_CLASS[compactMode()];
  const cardBodyTextClass = (tone: string) => `${RESPONSE_QUEUE_CARD_BODY_CLASS[compactMode()]} ${tone}`;
  const cardClass = () => RESPONSE_QUEUE_CARD_CLASS[compactMode()];
  const pillSizeClass = () => RESPONSE_QUEUE_PILL_SIZE_CLASS[compactMode()];
  const channelPillClass = () => RESPONSE_QUEUE_CHANNEL_PILL_CLASS[compactMode()];
  const relationshipPillClass = () => RESPONSE_QUEUE_RELATIONSHIP_PILL_CLASS[compactMode()];
  const urgencyPillClass = (tone: string) => `rounded-full border font-medium ${tone} ${RESPONSE_QUEUE_URGENCY_PILL_CLASS[compactMode()]}`;
  const summaryClass = () => RESPONSE_QUEUE_SUMMARY_CLASS[compactMode()];
  const soundToggleTitle = createMemo(() =>
    soundEnabled()
      ? "Urgent sound cue on (click to mute)"
      : "Enable sound cue for new urgent items (opt-in)",
  );
  const soundToggleLabel = createMemo(() => (soundEnabled() ? "sound on" : "sound off"));
  const soundToggleClass = createMemo(
    () =>
      `rounded-full border px-2.5 py-1 text-[10px] font-medium transition ${
        soundEnabled()
          ? "border-sky-300/60 bg-sky-100/80 text-sky-700"
          : "border-black/10 bg-white/60 text-on-surface-variant/50 hover:bg-white/80"
      }`,
  );
  const toggleSoundEnabled = () => {
    const next = !soundEnabled();
    setSoundEnabled(next);
    saveResponseQueueSoundEnabled(next);
  };

  createEffect(() => {
    if (focusTick() <= 0) return;
    document.getElementById("decisionos-response-queue")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    setIsFocused(true);
    const timer = window.setTimeout(() => setIsFocused(false), 1800);
    onCleanup(() => window.clearTimeout(timer));
  });

  onMount(() => {
    const unsubscribeMagicActionEvent = subscribeMagicActionEvent(({ action, msgId }) => {
      if (action !== "open" || !msgId?.startsWith("rq-")) return;
      const idx = parseInt(msgId.slice(3), 10);
      const item = surfaceState().rankedItems[idx];
      if (item) openDecisionOsResponseTarget([item]);
    });
    onCleanup(() => unsubscribeMagicActionEvent());
  });

  return (
    <section
      id="decisionos-response-queue"
      class={sectionClass()}
    >
      <div class={headerClass()}>
        <div>
          <p class={RESPONSE_QUEUE_LABEL_CLASS}>{RESPONSE_QUEUE_LABEL}</p>
          <Show
            when={titleTag() === "h1"}
            fallback={<h2 class={titleClass()}>{RESPONSE_QUEUE_TITLE}</h2>}
          >
            <h1 class={titleClass()}>{RESPONSE_QUEUE_TITLE}</h1>
          </Show>
          <p class={subtitleClass()}>
            {RESPONSE_QUEUE_SUBTITLE}
          </p>
        </div>
        <div class={RESPONSE_QUEUE_HEADER_ACTIONS_CLASS}>
          <button
            type="button"
            title={soundToggleTitle()}
            aria-pressed={soundEnabled()}
            class={soundToggleClass()}
            onClick={toggleSoundEnabled}
          >
            {soundToggleLabel()}
          </button>
          <Show when={surfaceState().showHeaderAction}>
            <button
              type="button"
              onClick={() => headerAction()?.()}
              class={actionButtonClass()}
            >
              {surfaceState().headerActionLabel}
            </button>
          </Show>
          <div class={countBadgeClass()}>
            {surfaceState().totalCountLabel}
          </div>
        </div>
      </div>

      <div class={gridClass()}>
        <For
          each={surfaceState().rankedItems}
          fallback={
            <EmptyState
              icon="RQ"
              title={RESPONSE_QUEUE_EMPTY_STATE_TITLE}
              body={RESPONSE_QUEUE_EMPTY_STATE_BODY}
              class={RESPONSE_QUEUE_EMPTY_STATE_CLASS}
            />
          }
        >
          {(item, index) => {
            const feedback = responseItemOutcomeFeedbackForItem(item, proactiveSuggestions());
            const responseCardState = (() => {
              const preparedDraftDisplayedSummaryLines =
                responseItemPreparedDraftDisplayedSummaryLines(item);
              const preparedDraftLeadSummary = preparedDraftDisplayedSummaryLines[0] ?? null;
              const preparedDraftSupportingSummaryLines =
                preparedDraftDisplayedSummaryLines.slice(1, 3);
              const presentationState = decisionOsResponsePreparedDraftPresentationState(item);
              const trustState = responseQueueCardTrustState({
                boundedReasonText: presentationState.boundedReason,
                selectionReasonText: presentationState.distinctSelectionReason,
                showSelectionReasonCandidate: Boolean(presentationState.distinctSelectionReason),
                confidenceText: item.confidence ? `${item.confidence} confidence` : null,
                sourceSummaryText: presentationState.sourceSummary,
                consequencePreviewText: presentationState.consequencePreview,
                provenanceCueText: presentationState.provenanceCue,
              });
              const objectAnchorSummary = responseItemPreparedDraftAnchorSummary({
                prepared_draft_summary_lines: item.prepared_draft_summary_lines,
                prepared_draft_object_labels: item.prepared_draft_object_labels,
                prefix: "Anchors",
                limit: 2,
              });
              const navigationTarget = resolveResponseNavigationTarget([item]);
              const openDestinationLabel = decisionOsDestinationLabel(
                navigationTarget?.view ?? "response_queue",
              );
              const feedbackLabel = outcomeFeedbackLabel(feedback);
              const feedbackDetail = outcomeFeedbackDetail(feedback);
              return {
                title: item.title,
                channel: item.channel,
                urgencyLabel: item.urgency === "today" ? "due soon" : item.urgency,
                urgencyTone: responseUrgencyTone(item.urgency),
                draftReadinessLabel:
                  item.prepared_draft_readiness === "ready_now" ? "draft ready" : "draft available",
                feedbackLabel,
                feedbackDetail,
                feedbackToneClass: outcomeFeedbackTone(feedback),
                relationshipLabel: inferResponseRelationship(item),
                displacedDraftLabel: item.prepared_draft_class
                  ? `Reply draft displaced by ${preparedDraftClassLabel(item.prepared_draft_class)}`
                  : "",
                confidenceSummary: trustState.trustBlocks.confidence ?? null,
                sourceSummary: trustState.trustBlocks.sourceSummary ?? null,
                consequencePreview: trustState.trustBlocks.consequencePreview ?? null,
                provenanceCue: trustState.trustBlocks.provenanceCue ?? null,
                autonomySummary: presentationState.autonomySummary,
                objectAnchorSummary,
                boundedReason: trustState.boundedReasonText,
                preparedDraftSelectionReason: trustState.selectionReasonText,
                preparedDraftLeadSummary,
                preparedDraftSupportingSummaryLines,
                openDestinationText:
                  !compact() && item.source_refs.length > 0 ? `Open ${openDestinationLabel}` : null,
                responseDueSummaryText: item.response_due_hint,
                suggestedActionText: item.suggested_action,
                showPreparedDraftBadge: Boolean(item.prepared_draft_available),
                showFeedbackBadge: Boolean(feedbackLabel),
                showDisplacedDraftLabel: Boolean(
                  item.prepared_draft_available
                    && item.prepared_draft_class
                    && item.prepared_draft_class !== "communication_reply",
                ),
                showSourceSummary: Boolean(presentationState.sourceSummary),
                showConsequencePreview: Boolean(presentationState.consequencePreview),
                showProvenanceCue: Boolean(presentationState.provenanceCue),
                showAutonomySummary: Boolean(presentationState.autonomySummary),
                showPreparedDraftLeadSummary: Boolean(preparedDraftLeadSummary),
                showObjectAnchorSummary: Boolean(
                  objectAnchorSummary
                    && !preparedDraftDisplayedSummaryLines.includes(objectAnchorSummary),
                ),
                showPreparedDraftThreadRetrievalState: Boolean(
                  hasPreparedDraftThreadRetrievalState(item)
                    && preparedDraftDisplayedSummaryLines.length === 0,
                ),
                showOpenDestinationText: Boolean(
                  !compact() && item.source_refs.length > 0 ? `Open ${openDestinationLabel}` : null,
                ),
                showResponseDueSummaryText: Boolean(item.response_due_hint),
                showSuggestedActionText: Boolean(presentationState.distinctSuggestedAction),
                showFeedbackDetail: Boolean(feedbackDetail),
                hasDistinctSelectionReason: trustState.showSelectionReason,
              };
            })();
            const openResponseItem = () => openDecisionOsResponseTarget([item]);

            return (
              <button
                type="button"
                onClick={openResponseItem}
                class={cardClass()}
                data-magic-action="open"
                data-magic-icon="response"
                data-magic-label={responseCardState.showPreparedDraftBadge ? "Review draft" : "Open response"}
                data-magic-id={`rq-${index()}`}
              >
                <div class={cardRowClass()}>
                  <div class="min-w-0 flex-1">
                    <p class={cardTitleClass()} title={responseCardState.title}>{responseCardState.title}</p>
                    <div class={cardMetadataClass()}>
                      <span class={channelPillClass()}>
                        {responseCardState.channel}
                      </span>
                      <Show when={responseCardState.showPreparedDraftBadge}>
                        <span class={`rounded-full border uppercase tracking-wide ${draftReadinessTone(item.prepared_draft_readiness)} ${pillSizeClass()}`}>
                          {responseCardState.draftReadinessLabel}
                        </span>
                      </Show>
                      <Show when={responseCardState.showFeedbackBadge}>
                        <span class={`rounded-full border uppercase tracking-wide ${responseCardState.feedbackToneClass} ${pillSizeClass()}`}>
                          {responseCardState.feedbackLabel}
                        </span>
                      </Show>
                      <span class={relationshipPillClass()}>
                        {responseCardState.relationshipLabel}
                      </span>
                      <Show when={responseCardState.showResponseDueSummaryText}>
                        <span>{responseCardState.responseDueSummaryText}</span>
                      </Show>
                      <Show when={responseCardState.showSuggestedActionText}>
                        <span>{responseCardState.suggestedActionText}</span>
                      </Show>
                    </div>
                    <Show when={responseCardState.boundedReason}>
                      <p class={cardBodyTextClass("text-sky-900/72")}>
                        {responseCardState.boundedReason}
                      </p>
                    </Show>
                    <Show when={responseCardState.showPreparedDraftLeadSummary}>
                      <p class={summaryClass()}>
                        {responseCardState.preparedDraftLeadSummary}
                      </p>
                    </Show>
                    <For each={responseCardState.preparedDraftSupportingSummaryLines}>
                      {(line) => (
                        <p class={cardBodyTextClass("text-on-surface-variant/65")}>
                          {line}
                        </p>
                      )}
                    </For>
                    <Show when={responseCardState.hasDistinctSelectionReason}>
                      <p class={cardBodyTextClass("text-emerald-800/75")}>
                        {responseCardState.preparedDraftSelectionReason}
                      </p>
                    </Show>
                    <Show when={responseCardState.showObjectAnchorSummary}>
                      <p class={cardBodyTextClass("text-on-surface-variant/65")}>
                        {responseCardState.objectAnchorSummary}
                      </p>
                    </Show>
                    <Show when={responseCardState.showPreparedDraftThreadRetrievalState}>
                      <ThreadDiscoveryStateSummary
                        class="mt-2 rounded-xl border border-sky-100/80 bg-sky-50/55 px-2.5 py-2 shadow-none"
                        state={preparedDraftThreadRetrievalState(item)}
                      />
                    </Show>
                    <Show when={responseCardState.showDisplacedDraftLabel}>
                      <p class={cardBodyTextClass("text-on-surface-variant/70")}>
                        {responseCardState.displacedDraftLabel}
                      </p>
                    </Show>
                    <Show when={responseCardState.showFeedbackDetail}>
                        <p class={cardBodyTextClass("text-on-surface-variant/65")}>
                          {responseCardState.feedbackDetail}
                        </p>
                    </Show>
                    <div class="mt-2 space-y-2">
                      <TrustSummaryBlocks
                        confidence={responseCardState.confidenceSummary}
                        sourceSummary={responseCardState.sourceSummary}
                        consequencePreview={responseCardState.consequencePreview}
                        provenanceCue={responseCardState.provenanceCue}
                      />
                    </div>
                    <Show when={responseCardState.showAutonomySummary}>
                      <p class={cardBodyTextClass("text-on-surface-variant/65")}>
                        {responseCardState.autonomySummary}
                      </p>
                    </Show>
                  </div>
                  <span class={urgencyPillClass(responseCardState.urgencyTone)}>
                    {responseCardState.urgencyLabel}
                  </span>
                </div>
                <Show when={responseCardState.showOpenDestinationText}>
                  <div class={RESPONSE_QUEUE_OPEN_TEXT_CLASS}>
                    {responseCardState.openDestinationText}
                  </div>
                </Show>
              </button>
            );
          }}
        </For>
      </div>
    </section>
  );
}
