// @locs-version: 2.0
import { For, Show } from "solid-js";

import { WeddingDashboardIcon } from "@/components/WeddingDashboardIcons";
import type { WeddingGuestTrackingState } from "@/lib/weddingGuestTrackingState";

export function WeddingGuestOperationsCard(props: {
  state: WeddingGuestTrackingState;
}) {
  return (
    <div class="min-w-0 rounded-[24px] border border-sky-100/80 bg-sky-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style="background-color: #0F766E" aria-hidden="true">
            <WeddingDashboardIcon id="users" class="h-4 w-4" />
          </span>
          <p class="text-lg font-bold tracking-tight text-sky-950">Guests</p>
        </div>
        <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-sky-900">
          {props.state.guestRowCount} guest{props.state.guestRowCount === 1 ? "" : "s"}
        </span>
      </div>
      <p class="mt-2 text-sm leading-6 text-sky-900/75">{props.state.summaryLabel}</p>
      <div class="mt-3 grid grid-cols-3 gap-2">
        <div class="rounded-2xl border border-sky-100 bg-white/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-sky-950/65">Attending</p>
          <p class="mt-1 text-2xl font-semibold text-sky-950">{props.state.attendingCount}</p>
        </div>
        <div class="rounded-2xl border border-sky-100 bg-white/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-sky-950/65">Pending</p>
          <p class="mt-1 text-2xl font-semibold text-sky-950">{props.state.pendingCount}</p>
        </div>
        <div class="rounded-2xl border border-sky-100 bg-white/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-sky-950/65">Needs</p>
          <p class="mt-1 text-2xl font-semibold text-sky-950">
            {props.state.dietaryCount + props.state.accessibilityCount}
          </p>
        </div>
      </div>
      <Show
        when={props.state.warningLabels.length > 0}
        fallback={
          <p class="mt-3 rounded-2xl border border-sky-100 bg-white/70 px-2.5 py-2 text-sm leading-6 text-sky-950/75">
            No guest follow-ups needed right now.
          </p>
        }
      >
        <div class="mt-3 flex flex-wrap gap-1.5">
          <For each={props.state.warningLabels}>
            {(label) => (
              <span class="max-w-full break-words rounded-full border border-sky-100 bg-white/80 px-2 py-1 text-xs font-semibold text-sky-950/75">
                {label}
              </span>
            )}
          </For>
        </div>
      </Show>
      <Show when={props.state.finalCountOptions.length > 0}>
        <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
          <p class="text-xs font-semibold text-sky-950/70">Final guest count options</p>
          <div class="mt-2 space-y-2">
            <For each={props.state.finalCountOptions}>
              {(option) => (
                <article class="rounded-xl border border-sky-100 bg-sky-50/60 px-2.5 py-2">
                  <div class="flex items-start justify-between gap-2">
                    <p class="min-w-0 break-words text-sm font-semibold text-sky-950">{option.label}</p>
                    <span class="shrink-0 rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-sky-900">
                      {option.headcount}
                    </span>
                  </div>
                  <p class="mt-1 text-xs leading-5 text-sky-950/70">{option.recommendationLabel}</p>
                  <p class="mt-1 text-xs leading-5 text-sky-950/60">{option.riskLabel}</p>
                </article>
              )}
            </For>
          </div>
        </div>
      </Show>
      <Show when={props.state.followUpTaskCandidates.length > 0}>
        <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
          <p class="text-xs font-semibold text-sky-950/70">Guest follow-ups</p>
          <ul class="mt-2 space-y-1">
            <For each={props.state.followUpTaskCandidates}>
              {(task) => (
                <li class="text-xs leading-5 text-sky-950/70">
                  <span class="font-semibold">{task.title}</span> - {task.priorityLabel}
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
      <Show when={props.state.sourceLabels.length > 0}>
        <p class="mt-3 text-xs leading-5 text-sky-950/65">
          Sources: {props.state.sourceLabels.slice(0, 3).join(", ")}
        </p>
      </Show>
    </div>
  );
}
