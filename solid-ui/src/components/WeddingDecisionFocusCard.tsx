// @locs-version: 1.0
import { createMemo, createSignal, For, Show } from "solid-js";
import { DecisionCard } from "@/components/DecisionCard";

import {
  buildWeddingDecisionDeferSidebarAction,
  buildWeddingDecisionFocusSidebarAction,
} from "@/lib/weddingDecisionFocusActionState";
import { buildWeddingDecisionFocusDisplayState } from "@/lib/weddingDecisionFocusDisplayState";
import { decisionCardFromWeddingFocus } from "@/lib/decisionCardState";
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
import {
  dispatchWeddingVendorSearchLaunch,
  saveWeddingVendorSearchLaunch,
  weddingVendorSearchQueryFromIntake,
} from "@/lib/weddingVendorSearchLaunchState";

export function WeddingDecisionFocusCard(props: {
  state: WeddingResponseWorkspaceViewState;
  onSidebarAction: (action: WeddingWorkspaceSidebarAction) => void;
}) {
  const [locallyDeferredIds, setLocallyDeferredIds] = createSignal<Set<string>>(new Set());
  const [expandedTaskId, setExpandedTaskId] = createSignal<string | null>(null);
  const [expandedWhyItemId, setExpandedWhyItemId] = createSignal<string | null>(null);
  const [assignmentDrafts, setAssignmentDrafts] = createSignal<Record<string, string>>({});
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
  function taskFor(itemId: string) {
    const taskId = itemId.replace(/^task:/, "");
    return props.state.planningTaskItems.find((task) => task.id === taskId) ?? null;
  }
  function hasChosenCelebrant() {
    return props.state.contextCards.some((card) => {
      const path = String(card.planningContext?.celebrantPath ?? "").trim().toLowerCase();
      return path === "own_celebrant" || (path.length > 0 && !["need_options", "public_or_registry_celebrant"].includes(path));
    }) || props.state.vendorContactCards.some((card) => /celebrant|officiant/i.test(card.categoryLabel));
  }
  function launchCelebrantSearch() {
    const context = props.state.contextCards.map((card) => card.planningContext).find((item) => item && (item.location || item.topPriorities?.length || item.atmosphereDescription)) ?? null;
    const query = weddingVendorSearchQueryFromIntake({
      vendorLabels: ["authorised wedding celebrant"],
      location: context?.location,
      priorities: (context?.topPriorities ?? []).join(", ") || context?.vendorPreferences,
      atmosphere: context?.atmosphereDescription,
    });
    const launch = saveWeddingVendorSearchLaunch(query, { source: "wedding_home" });
    if (launch) dispatchWeddingVendorSearchLaunch(launch);
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
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <button type="button" class="rounded-2xl border border-pink-100 bg-white/75 px-3 py-2 text-left transition hover:border-pink-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-accent focus-visible:ring-offset-2" title="Open wedding budget" onClick={openBudget}>
            <p class="text-xs font-semibold text-pink-950/80">Budget status</p>
            <p class="mt-1 break-words text-2xl font-semibold text-pink-950">{budgetRemaining()}</p>
          </button>
          <button type="button" class="rounded-2xl border border-pink-100 bg-white/75 px-3 py-2 text-left transition hover:border-pink-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-accent focus-visible:ring-offset-2" title={calendarActionLabel(props.state)} onClick={openCalendar}>
            <p class="text-xs font-semibold text-pink-950/80">Days to wedding</p>
            <p class="mt-1 break-words text-2xl font-semibold text-pink-950">{countdown()}</p>
            <p class="mt-1 text-xs leading-5 text-pink-950/80">{weddingDayCountdownDetail(props.state)}</p>
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
                const expandedTask = () => expandedTaskId() === item.id ? taskFor(item.id) : null;
                return (
                <div class="space-y-2">
                  <DecisionCard
                    card={decisionCardFromWeddingFocus(card)}
                    mode="standard"
                    showWhyItMatters={false}
                    onAction={(action) => {
                      if (action.id === "later") {
                        deferItem(item);
                      } else if (action.id === "why") {
                        setExpandedWhyItemId((current) => current === item.id ? null : item.id);
                      } else if (action.id === "open" && item.sourceSurface === "tasks") {
                        setExpandedTaskId((current) => current === item.id ? null : item.id);
                      } else {
                        props.onSidebarAction(buildWeddingDecisionFocusSidebarAction(
                          { ...props.state.personalOsProjection.decisionLoadRelief, focusItems: [item], backlogCount: 0 },
                          action.id === "why" ? "explain_item" : "open_item",
                        ));
                      }
                    }}
                  />
                  <Show when={expandedWhyItemId() === item.id}>
                    <p class="rounded-xl border border-pink-100 bg-white/75 px-3 py-2 text-xs leading-5 text-pink-950/80">
                      {card.whyNowLabel}
                    </p>
                  </Show>
                  <Show when={expandedTask()} fallback={expandedTaskId() === item.id ? <p class="rounded-xl border border-pink-100 bg-white/75 px-3 py-2 text-xs leading-5 text-pink-950/75">This task is no longer active.</p> : undefined}>
                    {(task) => (
                      <section class="rounded-xl border border-pink-200 bg-white px-3 py-3 text-pink-950" aria-label={`Task: ${task().title}`}>
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0">
                            <p class="text-xs font-semibold uppercase tracking-wide text-pink-900/70">Active to-do</p>
                            <h4 class="mt-1 break-words text-sm font-semibold">{task().title}</h4>
                          </div>
                          <button type="button" class="min-h-9 rounded-full border border-pink-200 bg-pink-50 px-3 text-xs font-semibold text-pink-950" onClick={() => setExpandedTaskId(null)}>Close</button>
                        </div>
                        <Show when={task().notes}><p class="mt-2 break-words text-xs leading-5 text-pink-950/75">{task().notes}</p></Show>
                        <div class="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium text-pink-950/75">
                          <Show when={task().dueLabel}><span class="rounded-full bg-pink-50 px-2 py-1">{task().dueLabel}</span></Show>
                          <Show when={task().priority}><span class="rounded-full bg-pink-50 px-2 py-1">{task().priority} priority</span></Show>
                          <Show when={task().assignee}><span class="rounded-full bg-pink-50 px-2 py-1">{task().assignee}</span></Show>
                        </div>
                        <div class="mt-3 flex flex-wrap items-center gap-2">
                          <input
                            aria-label={`Assign ${task().title}`}
                            class="min-h-9 min-w-0 flex-1 rounded-lg border border-pink-200 bg-white px-2 text-xs text-pink-950 placeholder:text-pink-950/45"
                            placeholder="Assign to someone"
                            value={assignmentDrafts()[task().id] ?? task().assignee ?? ""}
                            onInput={(event) => setAssignmentDrafts((current) => ({ ...current, [task().id]: event.currentTarget.value }))}
                          />
                          <button type="button" class="min-h-9 rounded-full bg-pink-700 px-3 text-xs font-semibold text-white transition hover:bg-pink-800" onClick={() => {
                            const assignee = (assignmentDrafts()[task().id] ?? task().assignee ?? "").trim();
                            if (!assignee) return;
                            props.onSidebarAction({ kind: "assign_task", label: "Assign task", enabled: true, reason: null, metadata: { task_id: task().id, task_title: task().title, task_priority: task().priority ?? "normal", assignee } });
                          }}>Assign</button>
                        </div>
                        <Show when={/celebrant/i.test(`${task().title} ${task().notes ?? ""}`) && !hasChosenCelebrant()}>
                          <button type="button" class="mt-3 min-h-9 rounded-full border border-pink-300 bg-pink-100 px-3 text-xs font-semibold text-pink-950 transition hover:bg-pink-200" onClick={launchCelebrantSearch}>
                            Find an authorised celebrant
                          </button>
                        </Show>
                      </section>
                    )}
                  </Show>
                </div>
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
        <button type="button" disabled={display().reviewDisabled} aria-disabled={display().reviewDisabled} title={display().reviewDisabled ? "There are no decisions ready to review." : "Review the current decision focus."} class="mt-3 w-full rounded-full border border-pink-200 bg-white/75 px-3 py-2 text-xs font-semibold text-pink-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:py-1.5" onClick={() => props.onSidebarAction(decisionFocusAction())}>
          Review top decisions
        </button>
      </div>
    </Show>
  );
}
