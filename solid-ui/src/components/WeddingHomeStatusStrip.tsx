// @locs-version: 1.0
import { For } from "solid-js";

import {
  buildWeddingHomeStatusState,
  type WeddingHomeStatusTone,
} from "@/lib/weddingHomeOverviewState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

function shellClass(tone: WeddingHomeStatusTone): string {
  if (tone === "risk") return "border-red-100 bg-red-50/80";
  if (tone === "attention") return "border-amber-100 bg-amber-50/80";
  return "border-emerald-100 bg-emerald-50/80";
}

function metricClass(tone: WeddingHomeStatusTone): string {
  if (tone === "risk") return "border-red-200 bg-white/80 text-red-700";
  if (tone === "attention") return "border-amber-200 bg-white/80 text-amber-900";
  return "border-emerald-200 bg-white/80 text-emerald-950";
}

export function WeddingHomeStatusStrip(props: {
  state: WeddingResponseWorkspaceViewState;
  onSelectMenu?: (menu: WeddingWorkspaceMenuId) => void;
}) {
  const status = () => buildWeddingHomeStatusState(props.state);
  return (
    <section class={`rounded-[24px] border p-4 shadow-card ${shellClass(status().tone)}`}>
      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div class="min-w-0">
          <p class="text-base font-semibold text-on-surface">{status().title}</p>
          <p class="mt-1 text-sm leading-6 text-on-surface-variant">{status().detail}</p>
        </div>
        <button
          type="button"
          class="min-h-10 shrink-0 rounded-full border border-indigo-200 bg-white px-3 text-xs font-semibold text-indigo-950 transition hover:bg-indigo-50"
          onClick={() => props.onSelectMenu?.(status().menuId)}
        >
          {status().actionLabel}
        </button>
      </div>
      <div class="mt-3 grid gap-2 sm:grid-cols-4">
        <For each={status().metrics}>
          {(metric) => (
            <button
              type="button"
              class={`min-w-0 rounded-2xl border px-3 py-2 text-left transition hover:bg-white ${metricClass(metric.tone)}`}
              onClick={() => props.onSelectMenu?.(metric.menuId)}
            >
              <p class="truncate text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70">{metric.label}</p>
              <p class="mt-1 truncate text-sm font-bold">{metric.value}</p>
            </button>
          )}
        </For>
      </div>
    </section>
  );
}

