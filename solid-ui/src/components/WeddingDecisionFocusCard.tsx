// @locs-version: 1.0
import { createMemo, createSignal, For, Show } from "solid-js";

import {
  buildWeddingDecisionDeferSidebarAction,
  buildWeddingDecisionFocusSidebarAction,
} from "@/lib/weddingDecisionFocusActionState";
import { buildWeddingDecisionFocusDisplayState } from "@/lib/weddingDecisionFocusDisplayState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import {
  calendarActionLabel,
  currencyLabel,
  weddingBudgetSidebarAction,
  weddingDayCountdownDetail,
  weddingDayCountdownLabel,
  weddingTimelinePrimarySidebarAction,
} from "@/lib/weddingWorkspaceSidebarActionState";

function pressureLabel(label: string): string {
  if (label === "attention") return "Needs attention";
  if (label === "obligation") return "Must do";
  if (label === "knowledge") return "Needs info";
  if (label === "opportunity") return "Good option";
  return label.replace(/_/g, " ");
}

export function WeddingDecisionFocusCard(props: {
  state: WeddingResponseWorkspaceViewState;
  onSidebarAction: (action: WeddingWorkspaceSidebarAction) => void;
}) {
  const [locallyDeferredIds, setLocallyDeferredIds] = createSignal<Set<string>>(new Set());
  const display = createMemo(() => buildWeddingDecisionFocusDisplayState({
    relief: props.state.personalOsProjection.decisionLoadRelief,
    locallyDeferredIds: locallyDeferredIds(),
  }));
  const decisionFocusAction = () => buildWeddingDecisionFocusSidebarAction({
    ...props.state.personalOsProjection.decisionLoadRelief,
    focusItems: display().visibleFocusItems,
  }, "review_all");
  const budgetRemaining = () => {
    const remaining = props.state.budgetTracking.remainingAmount;
    if (remaining === null) return currencyLabel(null);
    return remaining >= 0 ? currencyLabel(remaining) : `${currencyLabel(Math.abs(remaining))} over`;
  };
  const countdown = () => weddingDayCountdownLabel(props.state);
  function openBudget() {
    props.onSidebarAction(weddingBudgetSidebarAction(props.state));
  }
  function openCalendar() {
    props.onSidebarAction(weddingTimelinePrimarySidebarAction(props.state));
  }
  function deferItem(item: (typeof props.state.personalOsProjection.decisionLoadRelief.focusItems)[number]) {
    setLocallyDeferredIds((current) => new Set([...current, item.id]));
    props.onSidebarAction(buildWeddingDecisionDeferSidebarAction(item));
  }
  return (
    <Show when={props.state.personalOsProjection.hasWeddingPersonalOsSignal}>
      <div class="min-w-0 rounded-[24px] border border-pink-100/80 bg-pink-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
        <div class="flex items-start justify-between gap-2">
          <p class="text-base font-semibold text-pink-950">Three things worth your attention</p>
          <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-pink-900">
            {display().visibleCount} now
          </span>
        </div>
        <p class="mt-2 text-sm leading-6 text-pink-900/75">
          {display().summaryLabel}
        </p>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <button type="button" class="rounded-2xl border border-pink-100 bg-white/75 px-3 py-2 text-left transition hover:border-pink-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300" title="Open wedding budget" onClick={openBudget}>
            <p class="text-xs font-semibold text-pink-950/65">Budget status</p>
            <p class="mt-1 break-words text-2xl font-semibold text-pink-950">{budgetRemaining()}</p>
          </button>
          <button type="button" class="rounded-2xl border border-pink-100 bg-white/75 px-3 py-2 text-left transition hover:border-pink-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300" title={calendarActionLabel(props.state)} onClick={openCalendar}>
            <p class="text-xs font-semibold text-pink-950/65">Days to wedding</p>
            <p class="mt-1 break-words text-2xl font-semibold text-pink-950">{countdown()}</p>
            <p class="mt-1 text-xs leading-5 text-pink-950/60">{weddingDayCountdownDetail(props.state)}</p>
          </button>
        </div>
        <Show when={display().savedForLaterLabel}>
          {(label) => (
          <p class="mt-3 rounded-2xl border border-pink-100 bg-white/75 px-3 py-2 text-sm leading-6 text-pink-950/75">
            {label()}
          </p>
          )}
        </Show>
        <Show when={display().visibleFocusItems.length > 0} fallback={<p class="mt-3 rounded-2xl border border-pink-100 bg-white/70 px-3 py-2 text-sm leading-6 text-pink-950/75">Nothing needs a yes/no right now.</p>}>
          <div class="mt-3 space-y-2">
            <For each={display().itemCards}>
              {(card) => {
                const item = card.item;
                return (
                <article class="rounded-2xl border border-pink-100 bg-white/75 p-3">
                  <div class="flex items-start justify-between gap-2">
                    <p class="break-words text-sm font-semibold text-pink-950">{card.title}</p>
                    <span class="max-w-full break-words rounded-full bg-pink-50 px-2 py-1 text-xs font-medium text-pink-900">{pressureLabel(item.pressureFamily)}</span>
                  </div>
                  <div class="mt-2 grid gap-2 sm:grid-cols-2">
                    <div class="rounded-2xl border border-pink-100 bg-pink-50/60 px-2.5 py-2">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-pink-950/55">Needed by</p>
                      <p class="mt-1 text-xs leading-5 text-pink-950/75">{card.neededByLabel}</p>
                    </div>
                    <div class="rounded-2xl border border-pink-100 bg-pink-50/60 px-2.5 py-2">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-pink-950/55">Next step</p>
                      <p class="mt-1 text-xs leading-5 text-pink-950/75">{card.recommendedActionLabel}</p>
                    </div>
                  </div>
                  <p class="mt-2 text-xs leading-5 text-pink-950/70">{card.whyNowLabel}</p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <For each={item.evidenceLabels.slice(0, 3)}>
                      {(label) => <span class="max-w-full break-words rounded-full border border-pink-100 bg-pink-50/70 px-2 py-1 text-xs text-pink-900/80">{label}</span>}
                    </For>
                  </div>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button type="button" class="rounded-full border border-pink-200 bg-white/85 px-2.5 py-1.5 text-xs font-semibold text-pink-950 transition hover:bg-white" onClick={() => props.onSidebarAction(buildWeddingDecisionFocusSidebarAction({ ...props.state.personalOsProjection.decisionLoadRelief, focusItems: [item], backlogCount: 0 }, "open_item"))}>
                      {card.compareLabel}
                    </button>
                    <button type="button" class="rounded-full border border-pink-200 bg-pink-50 px-2.5 py-1.5 text-xs font-semibold text-pink-950 transition hover:bg-white" title={item.explanation} onClick={() => props.onSidebarAction(buildWeddingDecisionFocusSidebarAction({ ...props.state.personalOsProjection.decisionLoadRelief, focusItems: [item], backlogCount: 0 }, "explain_item"))}>
                      Show me why
                    </button>
                    <button type="button" class="rounded-full border border-pink-100 bg-white/70 px-2.5 py-1.5 text-xs font-semibold text-pink-900/75 transition hover:border-pink-200 hover:bg-white" title="Move this out of the top three for now" onClick={() => deferItem(item)}>
                      Decide later
                    </button>
                  </div>
                </article>
              );}}
            </For>
          </div>
        </Show>
        <Show when={props.state.personalOsProjection.decisionLoadRelief.reliefLabels.length > 0}>
          <ul class="mt-3 space-y-1">
            <For each={props.state.personalOsProjection.decisionLoadRelief.reliefLabels.slice(0, 3)}>
              {(label) => <li class="text-xs leading-5 text-pink-950/70">{label}</li>}
            </For>
          </ul>
        </Show>
        <button type="button" disabled={display().reviewDisabled} class="mt-3 w-full rounded-full border border-pink-200 bg-white/75 px-3 py-2 text-xs font-semibold text-pink-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:py-1.5" onClick={() => props.onSidebarAction(decisionFocusAction())}>
          Review top decisions
        </button>
      </div>
    </Show>
  );
}
