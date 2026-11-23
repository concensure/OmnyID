// @locs-version: 2.0
import { For, Show } from "solid-js";

import type { WeddingProductionRemainingWorkState } from "@/lib/weddingProductionRemainingWorkState";
import {
  buildWeddingProductionRemainingWorkPresentationState,
} from "@/lib/weddingProductionRemainingWorkPresentationState";

export function WeddingProductionRemainingWorkCard(props: {
  state: WeddingProductionRemainingWorkState | null | undefined;
}) {
  const presentation = () => buildWeddingProductionRemainingWorkPresentationState(props.state);
  return (
    <Show when={presentation().visible}>
      <section class={`min-w-0 rounded-[24px] border p-3 shadow-card sm:rounded-[28px] sm:p-4 ${presentation().containerClass}`}>
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class={`text-sm font-semibold ${presentation().titleClass}`}>Remaining production work</p>
            <p class={`mt-2 text-[11px] leading-5 ${presentation().summaryClass}`}>{presentation().headline}</p>
          </div>
          <span class={`max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold ${presentation().statusClass}`}>
            {presentation().statusLabel}
          </span>
        </div>
        <p class={`mt-2 text-[11px] leading-5 ${presentation().summaryClass}`}>{presentation().summary}</p>
        <div class="mt-3 grid gap-2 sm:grid-cols-3">
          <span class="rounded-2xl border border-white/70 bg-white/75 px-2.5 py-2 text-[10px] font-semibold text-slate-700">
            {presentation().oracleEstimateLabel}
          </span>
          <span class="rounded-2xl border border-white/70 bg-white/75 px-2.5 py-2 text-[10px] font-semibold text-slate-700">
            {presentation().fullEstimateLabel}
          </span>
          <span class="rounded-2xl border border-white/70 bg-white/75 px-2.5 py-2 text-[10px] font-semibold text-slate-700">
            {presentation().nextEstimateLabel}
          </span>
        </div>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <span class="rounded-full border border-white/70 bg-white/75 px-2 py-1 text-[10px] font-semibold text-slate-700">
            {presentation().oracleCountLabel}
          </span>
          <span class="rounded-full border border-white/70 bg-white/75 px-2 py-1 text-[10px] font-semibold text-slate-700">
            {presentation().polishCountLabel}
          </span>
        </div>
        <Show when={presentation().nextItems.length > 0}>
          <div class="mt-3 rounded-2xl border border-white/70 bg-white/75 px-2.5 py-2">
            <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Next Focus</p>
            <ul class="mt-2 space-y-2">
              <For each={presentation().nextItems}>
                {(item) => (
                  <li>
                    <div class="flex items-start justify-between gap-2">
                      <p class="break-words text-[10px] font-semibold text-slate-900">{item.label}</p>
                      <span class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-600">
                        {item.estimateLabel}
                      </span>
                    </div>
                    <p class="mt-0.5 text-[10px] leading-4 text-slate-700">{item.summary}</p>
                    <p class="mt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">{item.tierLabel}</p>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
      </section>
    </Show>
  );
}
