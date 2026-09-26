// @locs-version: 1.0
import { For, createMemo } from "solid-js";

import { buildWeddingNextStepState } from "@/lib/weddingNextStepState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

export function WeddingNextStepCard(props: {
  state: WeddingResponseWorkspaceViewState;
  onSelectMenu?: (menu: WeddingWorkspaceMenuId) => void;
}) {
  const nextStep = createMemo(() => buildWeddingNextStepState(props.state));
  return (
    <section class="min-w-0 rounded-[24px] border border-rose-100/80 bg-[linear-gradient(135deg,rgba(255,241,242,0.92),rgba(255,255,255,0.9))] p-4 shadow-card sm:rounded-[28px]">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-wide text-rose-900/65">Next best step</p>
          <h3 class="mt-1 break-words text-lg font-bold tracking-tight text-rose-950">{nextStep().title}</h3>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-rose-950/75">{nextStep().detail}</p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-full bg-rose-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
          onClick={() => props.onSelectMenu?.(nextStep().menuId)}
        >
          {nextStep().actionLabel}
        </button>
      </div>
      <div class="mt-3 flex flex-wrap gap-1.5">
        <For each={nextStep().secondaryLabels}>
          {(label) => (
            <span class="max-w-full break-words rounded-full border border-rose-100 bg-white/75 px-2.5 py-1 text-xs font-medium text-rose-950/70">
              {label}
            </span>
          )}
        </For>
      </div>
    </section>
  );
}
