// @locs-version: 2.0
import { For, Show } from "solid-js";

import type {
  WeddingProductionGoNoGoPacketState,
} from "@/lib/weddingWorkspaceProductionReadinessState";
import { buildWeddingProductionGatePresentationState } from "@/lib/weddingProductionGatePresentationState";

export function WeddingProductionGateCard(props: {
  packet: WeddingProductionGoNoGoPacketState | null;
}) {
  const presentation = () => buildWeddingProductionGatePresentationState(props.packet);
  return (
    <Show when={presentation().visible}>
      <div class={`min-w-0 rounded-[24px] border p-3 shadow-card sm:rounded-[28px] sm:p-4 ${presentation().containerClass}`}>
          <div class="flex items-start justify-between gap-2">
            <p class={presentation().titleClass}>
              Launch readiness
            </p>
            <span class={`max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold ${presentation().statusClass}`}>
              {presentation().statusLabel}
            </span>
          </div>
          <p class={presentation().summaryClass}>
            {presentation().summary}
          </p>
          <Show when={presentation().gateCountLabel}>
            {(gateCountLabel) => (
              <p class="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                {gateCountLabel()}
              </p>
            )}
          </Show>
          <div class="mt-3 grid gap-2 sm:grid-cols-3">
            <For each={presentation().gates}>
              {(gate) => (
                <article class="rounded-2xl border border-white/70 bg-white/75 p-2.5">
                  <p class="break-words text-[10px] font-semibold text-slate-900">{gate.title}</p>
                  <p class="mt-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">{gate.status}</p>
                </article>
              )}
            </For>
          </div>
          <Show when={presentation().blockerLabels.length > 0}>
            <ul class="mt-3 space-y-1">
              <For each={presentation().blockerLabels}>
                {(label) => <li class="text-[10px] leading-4 text-red-950/70">{label}</li>}
              </For>
            </ul>
          </Show>
          <Show when={presentation().nextActionLabels.length > 0}>
            <div class="mt-3 rounded-2xl border border-white/70 bg-white/75 px-2.5 py-2">
              <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Next</p>
              <ul class="mt-1 space-y-1">
                <For each={presentation().nextActionLabels}>
                  {(nextActionLabel) => <li class="text-[10px] leading-4 text-slate-700">{nextActionLabel}</li>}
                </For>
              </ul>
            </div>
          </Show>
          <Show when={presentation().guardrailLabels.length > 0}>
            <div class="mt-3 flex flex-wrap gap-1.5">
              <For each={presentation().guardrailLabels}>
                {(label) => (
                  <span class="max-w-full break-words rounded-full border border-white/70 bg-white/75 px-2 py-1 text-[10px] font-semibold text-slate-700">
                    {label}
                  </span>
                )}
              </For>
            </div>
          </Show>
        </div>
    </Show>
  );
}
