// @locs-version: 1.0
import { For, createMemo } from "solid-js";

import { buildWeddingVisionState } from "@/lib/weddingVisionState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

function Rating(props: { count: number }) {
  return <span aria-label={`${props.count} out of 5`}>{props.count}/5</span>;
}

export function WeddingVisionPanel(props: {
  state: WeddingResponseWorkspaceViewState;
  onSelectMenu?: (menu: WeddingWorkspaceMenuId) => void;
}) {
  const vision = createMemo(() => buildWeddingVisionState(props.state));
  return (
    <section class="min-w-0 rounded-[24px] border border-rose-100/80 bg-[linear-gradient(135deg,rgba(255,241,242,0.95),rgba(255,255,255,0.94))] p-4 shadow-card sm:rounded-[28px]">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-rose-900/65">Vision</p>
          <h3 class="mt-1 text-xl font-bold text-rose-950">{vision().title}</h3>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-rose-950/75">{vision().intro}</p>
          <p class="mt-2 text-xs font-semibold text-rose-950/70">{vision().confidenceLabel}</p>
        </div>
        <span class="w-fit rounded-full border border-rose-100 bg-white/75 px-3 py-1.5 text-xs font-semibold text-rose-950">
          Living summary
        </span>
      </div>

      <div class="mt-4 grid gap-3 lg:grid-cols-2">
        <div class="rounded-2xl border border-rose-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-rose-950">How it should feel</p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <For each={vision().feelTags}>
              {(tag) => <span class="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-950">{tag}</span>}
            </For>
          </div>
        </div>

        <div class="rounded-2xl border border-rose-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-rose-950">What matters most</p>
          <div class="mt-2 space-y-2">
            <For each={vision().priorityRows}>
              {(row) => (
                <div>
                  <div class="flex items-center justify-between gap-3 text-sm">
                    <span class="font-semibold text-rose-950">{row.label}</span>
                    <span class="text-amber-700"><Rating count={row.rating} /></span>
                  </div>
                  <p class="mt-0.5 text-xs leading-5 text-rose-950/65">{row.reason}</p>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="rounded-2xl border border-rose-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-rose-950">What we do not want</p>
          <ul class="mt-2 space-y-1">
            <For each={vision().avoidLabels}>
              {(label) => <li class="text-xs leading-5 text-rose-950/75">{label}</li>}
            </For>
          </ul>
        </div>

        <div class="rounded-2xl border border-rose-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-rose-950">Important people</p>
          <ul class="mt-2 space-y-1">
            <For each={vision().importantPeopleLabels}>
              {(label) => <li class="text-xs leading-5 text-rose-950/75">{label}</li>}
            </For>
          </ul>
        </div>

        <div class="rounded-2xl border border-rose-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-rose-950">How we decide</p>
          <ul class="mt-2 space-y-1">
            <For each={vision().decisionRules}>
              {(label) => <li class="text-xs leading-5 text-rose-950/75">{label}</li>}
            </For>
          </ul>
        </div>

        <div class="rounded-2xl border border-rose-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-rose-950">Why I think this</p>
          <ul class="mt-2 space-y-1">
            <For each={vision().evidenceLabels}>
              {(label) => <li class="text-xs leading-5 text-rose-950/75">{label}</li>}
            </For>
          </ul>
        </div>

        <div class="rounded-2xl border border-rose-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-rose-950">Evidence used</p>
          <ul class="mt-2 space-y-1">
            <For each={vision().sourceMixLabels}>
              {(label) => <li class="text-xs leading-5 text-rose-950/75">{label}</li>}
            </For>
          </ul>
        </div>

        <div class="rounded-2xl border border-rose-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-rose-950">Still learning</p>
          <ul class="mt-2 space-y-1">
            <For each={vision().learningLabels}>
              {(label) => <li class="text-xs leading-5 text-rose-950/75">{label}</li>}
            </For>
          </ul>
        </div>
      </div>

      <p class="mt-3 rounded-2xl border border-rose-100 bg-white/70 px-3 py-2 text-xs leading-5 text-rose-950/75">
        {vision().correctionPrompt}
      </p>

      <div class="mt-3 grid gap-2 sm:grid-cols-3">
        <For each={vision().actionLabels}>
          {(action) => (
            <button
              type="button"
              disabled={!props.onSelectMenu}
              class="rounded-2xl border border-rose-100 bg-white/75 p-3 text-left transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => props.onSelectMenu?.(action.targetMenu)}
            >
              <span class="text-sm font-semibold text-rose-950">{action.label}</span>
              <span class="mt-1 block text-xs leading-5 text-rose-950/65">{action.detail}</span>
            </button>
          )}
        </For>
      </div>
    </section>
  );
}
