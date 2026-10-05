// @locs-version: 2.0
import { For, Show, createMemo } from "solid-js";
import { latestWatcherSignalSummaryFromMessages } from "afp-ts/continuity";
import { ConversationAttentionSurface } from "@/components/ConversationAttentionSurface";
import type { DashboardBootstrap } from "@/lib/api";
import { ContextPackSurface } from "@/components/ContextPackSurface";
import { DecisionQueueSurface } from "@/components/DecisionQueueSurface";
import { OperationalLanesSurface } from "@/components/OperationalLanesSurface";
import { PreparedDraftSurface } from "@/components/PreparedDraftSurface";
import { ResponseQueueSurface } from "@/components/ResponseQueueSurface";
import { StateFieldStrip } from "@/components/StateFieldStrip";
import {
  preparedDraftDestinationForItems,
  preparedDraftActionLabel,
} from "afp-ts/continuity";
import {
  type DecisionOsStateFieldItem,
  summarizeDecisionOsStateFields,
} from "@/lib/decisionosContinuity";
import {
  navigateToView,
} from "@/lib/decisionosNavigation";
import {
  decisionOsQueueCompanionState,
  decisionOsQueueBootstrapState,
  decisionOsQueueHasVisibleWork,
} from "@/lib/decisionOsQueueBootstrapState";
import { decisionOsContinuityTrendState } from "@/lib/decisionosContinuityTrendState";
import {
  dashboardBootstrapConversationAttentionItems,
  dashboardBootstrapConversationAttentionSummary,
  dashboardBootstrapContinuityStateFields,
  dashboardBootstrapContinuityWatcherSignals,
  dashboardBootstrapHasSampleMessages,
  dashboardBootstrapMessages,
  dashboardBootstrapThreadSummaries,
} from "@/lib/dashboardBootstrapState";
import { decisionOsWatcherSignalState } from "@/lib/decisionosWatcherSignalState";

const QUEUES_KICKER_LABEL = "Queues";
const QUEUES_TITLE_LABEL = "Decision and response queues";
const QUEUES_SUMMARY_LABEL = "Surfaced from continuity state";
const FULL_QUEUE_ACTION_LABEL = "Open full queue";
const WORKSPACE_ACTION_LABEL = "Open workspace";
const HOME_QUEUES_SECTION_CLASS = "view-enter space-y-3";
const HOME_QUEUES_HEADER_CLASS = "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between";
const HOME_QUEUES_KICKER_CLASS =
  "font-mono text-[11px] uppercase tracking-[0.18em] text-on-surface-variant";
const HOME_QUEUES_TITLE_CLASS = "mt-1 text-sm font-semibold text-on-surface";
const HOME_QUEUES_WATCHER_SUMMARY_CLASS =
  "mt-1 max-w-3xl text-xs leading-5 text-on-surface-variant";
const HOME_QUEUES_WATCHER_CHIPS_CLASS = "mt-2 flex flex-wrap gap-2";
const HOME_QUEUES_TREND_ROW_CLASS = "mt-2 grid max-w-xl gap-2 sm:grid-cols-3";
const HOME_QUEUES_TREND_BAR_CLASS = "h-1.5 overflow-hidden rounded-full bg-black/10";
const HOME_QUEUES_TREND_TONE_CLASS = {
  high: "bg-rose-500/75",
  medium: "bg-amber-500/75",
  low: "bg-emerald-500/70",
} as const;
const HOME_QUEUES_OVERFLOW_NOTE_CLASS =
  "mt-2 max-w-3xl text-[11px] leading-5 text-on-surface-variant";
const HOME_QUEUES_SUMMARY_BADGE_CLASS =
  "rounded-full border border-black/10 bg-white/60 px-3 py-1 text-[11px] text-on-surface-variant";
const HOME_QUEUES_SAMPLE_BANNER_CLASS =
  "rounded-2xl border border-amber-200/70 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 shadow-sm";
const HOME_QUEUES_SURFACES_GRID_CLASS =
  "grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)]";
const WATCHER_CHIP_TONE_CLASS = {
  urgent: "border-rose-300/40 bg-rose-100/70 text-rose-900",
  warning: "border-amber-300/50 bg-amber-100/70 text-amber-900",
  quiet: "border-emerald-300/45 bg-emerald-100/65 text-emerald-900",
  muted: "border-black/10 bg-white/55 text-on-surface-variant",
} as const;
const HOME_QUEUES_COMPACT = true;

type HomeQueuesSectionProps = {
  bootstrap?: DashboardBootstrap | null;
};

export function HomeQueuesSection(props: HomeQueuesSectionProps) {
  const bootstrap = createMemo(() => props.bootstrap);
  const openView = (view: Parameters<typeof navigateToView>[0]) => navigateToView(view);
  const sectionState = createMemo(() => {
    const bootstrapValue = bootstrap();
    const queueState = decisionOsQueueBootstrapState(bootstrapValue);
    const queueCompanion = decisionOsQueueCompanionState(bootstrapValue);
    const bootstrapMessages = dashboardBootstrapMessages(bootstrapValue);
    const bootstrapThreadSummaries = dashboardBootstrapThreadSummaries(bootstrapValue);
    const responseItems = queueCompanion.responseItems;
    const preparedDraftItems = queueCompanion.preparedDraftItems;
    const contextPackItems = queueCompanion.contextPackItems;
    const conversationAttentionItems = dashboardBootstrapConversationAttentionItems(bootstrapValue);
    const conversationAttentionSummary = dashboardBootstrapConversationAttentionSummary(bootstrapValue);
    const stateFieldSummary = summarizeDecisionOsStateFields<DecisionOsStateFieldItem>(
      dashboardBootstrapContinuityStateFields(bootstrapValue),
    );
    const watcherSignalState = decisionOsWatcherSignalState(
      dashboardBootstrapContinuityWatcherSignals(bootstrapValue),
    );
    const continuityTrendState = decisionOsContinuityTrendState({
      messages: bootstrapMessages,
      watcherSignals: dashboardBootstrapContinuityWatcherSignals(bootstrapValue),
    });
    const preparedDraftDestination = preparedDraftDestinationForItems(preparedDraftItems);
    const preparedDraftActionText = preparedDraftActionLabel(preparedDraftItems);
    const hasDecisionQueueVisibleWork = decisionOsQueueHasVisibleWork(queueState);
    const hasSampleData = dashboardBootstrapHasSampleMessages(bootstrapValue);
    const watcherSummaryText = latestWatcherSignalSummaryFromMessages(
      bootstrapMessages,
    );
    const visibleResponseCount = responseItems.length;
    const visiblePreparedDraftCount = preparedDraftItems.length;
    const visibleContextPackCount = contextPackItems.length;
    const visibleConversationAttentionCount = conversationAttentionItems.length;
    const openPreparedDraftView = () => {
      if (preparedDraftDestination) navigateToView(preparedDraftDestination);
    };
    const queueOverflowSummary =
      queueState.queueActionOverflowSummary
      ?? (queueState.queueActionOverflowCount > 0
        ? `${queueState.queueActionOverflowCount} more queued item${queueState.queueActionOverflowCount === 1 ? "" : "s"} remain outside the home shortlist.`
        : null);

    return {
      showQueuesSection:
        hasDecisionQueueVisibleWork ||
        visibleResponseCount > 0 ||
        visiblePreparedDraftCount > 0 ||
        visibleConversationAttentionCount > 0 ||
        visibleContextPackCount > 0 ||
        stateFieldSummary.count > 0,
      showWatcherSummary: Boolean(watcherSummaryText),
      showWatcherSignalChips: watcherSignalState.hasSignals,
      showContinuityTrend: continuityTrendState.hasTrend,
      showSampleBanner: hasSampleData,
      showQueueOverflowSummary: Boolean(queueOverflowSummary),
      showOperationalLanesSurface: Boolean(bootstrapValue),
      showQueueSurfaceGrid: hasDecisionQueueVisibleWork || visibleResponseCount > 0,
      showStateFieldStrip: stateFieldSummary.count > 0,
      showPreparedDraftSurface: visiblePreparedDraftCount > 0,
      showConversationAttentionSurface: visibleConversationAttentionCount > 0,
      showContextPackSurface: visibleContextPackCount > 0,
      watcherSummaryText,
      watcherSignalState,
      continuityTrendState,
      queueOverflowSummary,
      operationalLanesSurfaceState: {
        bootstrap: bootstrapValue,
        queueState,
        queueCompanionState: queueCompanion,
      },
      decisionQueueSurfaceState: {
        queueState,
        messages: bootstrapMessages,
        threadSummaries: bootstrapThreadSummaries,
        compact: HOME_QUEUES_COMPACT,
        actionLabel: FULL_QUEUE_ACTION_LABEL,
        onAction: () => openView("decision_queue"),
      },
      responseQueueSurfaceState: {
        queueCompanionState: queueCompanion,
        compact: HOME_QUEUES_COMPACT,
        actionLabel: FULL_QUEUE_ACTION_LABEL,
        onAction: () => openView("response_queue"),
      },
      preparedDraftSurfaceState: {
        queueCompanionState: queueCompanion,
        compact: HOME_QUEUES_COMPACT,
        actionLabel: preparedDraftActionText,
        onAction: openPreparedDraftView,
      },
      conversationAttentionSurfaceState: {
        items: conversationAttentionItems,
        summary: conversationAttentionSummary,
        compact: HOME_QUEUES_COMPACT,
      },
      contextPackSurfaceState: {
        queueCompanionState: queueCompanion,
        compact: HOME_QUEUES_COMPACT,
        actionLabel: WORKSPACE_ACTION_LABEL,
        onAction: () => openView("home"),
      },
      stateFieldSummary,
    };
  });

  return (
    <Show when={sectionState().showQueuesSection}>
      <section class={HOME_QUEUES_SECTION_CLASS}>
        <div class={HOME_QUEUES_HEADER_CLASS}>
          <div>
            <p class={HOME_QUEUES_KICKER_CLASS}>{QUEUES_KICKER_LABEL}</p>
            <h2 class={HOME_QUEUES_TITLE_CLASS}>{QUEUES_TITLE_LABEL}</h2>
            <Show when={sectionState().showWatcherSummary}>
              <p class={HOME_QUEUES_WATCHER_SUMMARY_CLASS}>
                {sectionState().watcherSummaryText}
              </p>
            </Show>
            <Show when={sectionState().showWatcherSignalChips}>
              <div class={HOME_QUEUES_WATCHER_CHIPS_CLASS}>
                <For each={sectionState().watcherSignalState.chips}>
                  {(chip) => (
                    <span
                      class={`rounded-full border px-2.5 py-1 text-[10px] font-medium ${WATCHER_CHIP_TONE_CLASS[chip.tone]}`}
                      title={chip.title ?? undefined}
                    >
                      {chip.label}
                    </span>
                  )}
                </For>
              </div>
            </Show>
            <Show when={sectionState().showContinuityTrend}>
              <div
                class={HOME_QUEUES_TREND_ROW_CLASS}
                title={[
                  sectionState().continuityTrendState.summaryText,
                  sectionState().continuityTrendState.calibrationText,
                  sectionState().continuityTrendState.calibrationReview.note,
                ].filter(Boolean).join(" ") || undefined}
              >
                <For each={sectionState().continuityTrendState.bars}>
                  {(bar) => (
                    <div class="min-w-0">
                      <div class="mb-1 flex items-center justify-between gap-2 text-[10px] text-on-surface-variant/70">
                        <span>{bar.label}</span>
                        <span>{bar.percent}%</span>
                      </div>
                      <div class={HOME_QUEUES_TREND_BAR_CLASS}>
                        <div
                          class={`h-full rounded-full ${HOME_QUEUES_TREND_TONE_CLASS[bar.tone]}`}
                          style={{ width: `${bar.percent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
            <Show when={sectionState().showQueueOverflowSummary}>
              <p class={HOME_QUEUES_OVERFLOW_NOTE_CLASS}>
                {sectionState().queueOverflowSummary}
              </p>
            </Show>
          </div>
          <span class={HOME_QUEUES_SUMMARY_BADGE_CLASS}>
            {QUEUES_SUMMARY_LABEL}
          </span>
        </div>

        <Show when={sectionState().showSampleBanner}>
          <div class={HOME_QUEUES_SAMPLE_BANNER_CLASS}>
            Queue preview includes <span class="font-semibold">sample continuity items</span> while live decision and response signals are still sparse.
            These preview items are replaced as your real queue state becomes available.
          </div>
        </Show>

        <Show when={sectionState().showOperationalLanesSurface}>
          <OperationalLanesSurface
            bootstrap={sectionState().operationalLanesSurfaceState.bootstrap}
            queueState={sectionState().operationalLanesSurfaceState.queueState}
            queueCompanionState={sectionState().operationalLanesSurfaceState.queueCompanionState}
          />
        </Show>

        <Show when={sectionState().showQueueSurfaceGrid}>
          <div class={HOME_QUEUES_SURFACES_GRID_CLASS}>
            <DecisionQueueSurface
              queueState={sectionState().decisionQueueSurfaceState.queueState}
              messages={sectionState().decisionQueueSurfaceState.messages}
              threadSummaries={sectionState().decisionQueueSurfaceState.threadSummaries}
              compact={sectionState().decisionQueueSurfaceState.compact}
              actionLabel={sectionState().decisionQueueSurfaceState.actionLabel}
              onAction={sectionState().decisionQueueSurfaceState.onAction}
            />
            <ResponseQueueSurface
              queueCompanionState={sectionState().responseQueueSurfaceState.queueCompanionState}
              compact={sectionState().responseQueueSurfaceState.compact}
              actionLabel={sectionState().responseQueueSurfaceState.actionLabel}
              onAction={sectionState().responseQueueSurfaceState.onAction}
            />
          </div>
        </Show>

        <Show when={sectionState().showStateFieldStrip}>
          <StateFieldStrip summary={sectionState().stateFieldSummary} compact />
        </Show>

        <Show when={sectionState().showPreparedDraftSurface}>
          <PreparedDraftSurface
            queueCompanionState={sectionState().preparedDraftSurfaceState.queueCompanionState}
            compact={sectionState().preparedDraftSurfaceState.compact}
            actionLabel={sectionState().preparedDraftSurfaceState.actionLabel}
            onAction={sectionState().preparedDraftSurfaceState.onAction}
          />
        </Show>

        <Show when={sectionState().showConversationAttentionSurface}>
          <ConversationAttentionSurface
            items={sectionState().conversationAttentionSurfaceState.items}
            summary={sectionState().conversationAttentionSurfaceState.summary}
            compact={sectionState().conversationAttentionSurfaceState.compact}
          />
        </Show>

        <Show when={sectionState().showContextPackSurface}>
          <ContextPackSurface
            queueCompanionState={sectionState().contextPackSurfaceState.queueCompanionState}
            compact={sectionState().contextPackSurfaceState.compact}
            actionLabel={sectionState().contextPackSurfaceState.actionLabel}
            onAction={sectionState().contextPackSurfaceState.onAction}
          />
        </Show>
      </section>
    </Show>
  );
}
