// @locs-version: 2.0
import { For, Show } from "solid-js";

import type { WeddingBackgroundAutomationCoverageState } from "@/lib/weddingBackgroundAutomationCoverageState";

export function WeddingBackgroundAutomationCard(props: {
  state: WeddingBackgroundAutomationCoverageState;
}) {
  return (
    <div class="min-w-0 rounded-[24px] border border-indigo-100/80 bg-indigo-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
      <div class="flex items-start justify-between gap-2">
        <p class="text-sm font-semibold text-indigo-950">What's running automatically</p>
        <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold text-indigo-900">
          {props.state.matchedCount}/{props.state.items.length} active
        </span>
      </div>
      <p class="mt-2 text-[11px] leading-5 text-indigo-900/75">{props.state.summaryLabel}</p>
      <div class="mt-3 space-y-2">
        <For each={props.state.items}>
          {(item) => (
            <article class="rounded-2xl border border-indigo-100 bg-white/75 p-3">
              <div class="flex items-start justify-between gap-2">
                <p class="break-words text-xs font-semibold text-indigo-950">{item.title}</p>
                <span class="max-w-full break-words rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-900">
                  {item.status}
                </span>
              </div>
              <p class="mt-1 text-[10px] leading-4 text-indigo-950/70">{item.detailLabel}</p>
              <Show when={item.nextActionLabel}>
                {(label) => <p class="mt-1 text-[10px] leading-4 text-indigo-950/60">Next: {label()}</p>}
              </Show>
            </article>
          )}
        </For>
      </div>
      <Show when={props.state.omnyidDifferentiatorLabels.length > 0}>
        <div class="mt-3 flex flex-wrap gap-1.5">
          <For each={props.state.omnyidDifferentiatorLabels.slice(0, 3)}>
            {(label) => (
              <span class="max-w-full break-words rounded-full border border-indigo-100 bg-white/75 px-2 py-1 text-[10px] text-indigo-950/70">
                {label}
              </span>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
