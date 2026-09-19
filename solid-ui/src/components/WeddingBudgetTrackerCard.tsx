// @locs-version: 2.0
import { For, Show } from "solid-js";

import type { WeddingBudgetTrackingState } from "@/lib/weddingBudgetTrackingState";

function moneyLabel(amount: number, currency: string): string {
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

export function WeddingBudgetTrackerCard(props: {
  state: WeddingBudgetTrackingState;
}) {
  const currency = props.state.lineItems[0]?.currency ?? "AUD";

  return (
    <div class="min-w-0 rounded-[24px] border border-emerald-100/80 bg-emerald-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
      <div class="flex items-start justify-between gap-2">
        <p class="text-base font-semibold text-emerald-950">Budget</p>
        <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-emerald-900">
          {props.state.lineItems.length} selected
        </span>
      </div>
      <p class="mt-2 text-sm leading-6 text-emerald-900/75">{props.state.summaryLabel}</p>
      <div class="mt-3 rounded-2xl border border-emerald-100 bg-white/75 px-2.5 py-2">
        <p class="text-xs font-semibold text-emerald-950/65">Budget target</p>
        <p class="mt-1 text-sm leading-6 text-emerald-950/75">{props.state.budgetStatusLabel}</p>
        <Show when={props.state.budgetTargetAmount !== null}>
          <p class="mt-1 text-xs leading-5 text-emerald-900/65">
            Target {moneyLabel(props.state.budgetTargetAmount ?? 0, currency)}
            <Show when={props.state.budgetUtilizationPercent !== null}>
              {" "}- {props.state.budgetUtilizationPercent}% used by selected vendors
            </Show>
          </p>
        </Show>
      </div>
      <div class="mt-3 grid grid-cols-3 gap-2">
        <div class="rounded-2xl border border-emerald-100 bg-white/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-emerald-950/65">Known</p>
          <p class="mt-1 break-words text-xl font-semibold text-emerald-950">
            {moneyLabel(props.state.totalKnownAmount, currency)}
          </p>
        </div>
        <div class="rounded-2xl border border-emerald-100 bg-white/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-emerald-950/65">Quoted</p>
          <p class="mt-1 break-words text-xl font-semibold text-emerald-950">
            {moneyLabel(props.state.totalQuotedAmount, currency)}
          </p>
        </div>
        <div class="rounded-2xl border border-emerald-100 bg-white/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-emerald-950/65">Projected</p>
          <p class="mt-1 break-words text-xl font-semibold text-emerald-950">
            {moneyLabel(props.state.totalProjectedAmount, currency)}
          </p>
        </div>
      </div>
      <Show when={props.state.warningLabels.length > 0}>
        <div class="mt-3 flex flex-wrap gap-1.5">
          <For each={props.state.warningLabels}>
            {(label) => (
              <span class="max-w-full break-words rounded-full border border-emerald-100 bg-white/80 px-2 py-1 text-xs font-semibold text-emerald-950/75">
                {label}
              </span>
            )}
          </For>
        </div>
      </Show>
      <Show when={props.state.categoryRollups.length > 0}>
        <div class="mt-3 rounded-2xl border border-emerald-100 bg-white/75 p-3">
          <p class="text-xs font-semibold text-emerald-950/65">Top categories</p>
          <div class="mt-2 space-y-1.5">
            <For each={props.state.categoryRollups.slice(0, 3)}>
              {(rollup) => (
                <div class="flex items-center justify-between gap-2 text-xs text-emerald-950/75">
                  <span class="min-w-0 break-words font-semibold">{rollup.categoryLabel}</span>
                  <span class="shrink-0">{moneyLabel(rollup.amount, rollup.currency)} - {rollup.itemCount}</span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
      <Show when={props.state.quoteTaskCandidates.length > 0}>
        <div class="mt-3 rounded-2xl border border-emerald-100 bg-white/75 p-3">
          <p class="text-xs font-semibold text-emerald-950/70">Quotes to check</p>
          <ul class="mt-2 space-y-1">
            <For each={props.state.quoteTaskCandidates.slice(0, 3)}>
              {(task) => (
                <li class="text-xs leading-5 text-emerald-950/70">
                  <span class="font-semibold">{task.title}</span> - {task.priorityLabel}
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
      <Show
        when={props.state.lineItems.length > 0}
        fallback={
          <p class="mt-3 rounded-2xl border border-emerald-100 bg-white/70 px-2.5 py-2 text-sm leading-6 text-emerald-950/75">
            Tick a vendor decision from a comparison table to add its quote or projected price here.
          </p>
        }
      >
        <div class="mt-3 space-y-2">
          <For each={props.state.lineItems.slice(0, 5)}>
            {(item) => (
              <article class="rounded-2xl border border-emerald-100 bg-white/75 p-3">
                <div class="flex items-start justify-between gap-2">
                  <p class="break-words text-sm font-semibold text-emerald-950">{item.vendorName}</p>
                  <span class="max-w-full break-words rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900">
                    {item.priceStatus}
                  </span>
                </div>
                <p class="mt-1 text-sm leading-6 text-emerald-900/75">
                  {item.categoryLabel} - {item.amount === null ? "Amount needed" : moneyLabel(item.amount, item.currency)}
                </p>
                <Show when={item.warningLabels.length > 0}>
                  <ul class="mt-2 space-y-1">
                    <For each={item.warningLabels}>
                      {(label) => <li class="text-xs leading-5 text-emerald-950/65">{label}</li>}
                    </For>
                  </ul>
                </Show>
              </article>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
