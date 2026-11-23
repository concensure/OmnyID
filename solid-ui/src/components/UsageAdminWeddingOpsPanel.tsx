// @locs-version: 2.0
import { For } from "solid-js";
import type { AdminWeddingOpsPanelState } from "@/lib/adminWeddingOpsState";

export type UsageAdminWeddingOpsPanelProps = {
  state: AdminWeddingOpsPanelState;
  onToggleWeddingAiRouting: (enabled: boolean) => void;
};

function statusClass(status: "ready" | "needs_backend" | "local_only"): string {
  if (status === "ready") return "border-emerald-200 bg-emerald-50/80 text-emerald-900";
  if (status === "local_only") return "border-sky-200 bg-sky-50/80 text-sky-900";
  return "border-amber-200 bg-amber-50/80 text-amber-900";
}

export default function UsageAdminWeddingOpsPanel(props: UsageAdminWeddingOpsPanelProps) {
  return (
    <section class="mt-4 min-w-0 rounded-2xl border border-rose-200/70 bg-rose-50/60 p-3 sm:p-4">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div class="min-w-0">
          <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-rose-700/70">Wedding ops</p>
          <h4 class="mt-1 break-words text-base font-semibold text-slate-950">{props.state.title}</h4>
          <p class="mt-1 max-w-3xl break-words text-sm leading-6 text-slate-700">{props.state.intro}</p>
        </div>
        <label class="flex w-full min-w-0 items-start justify-between gap-3 rounded-xl border border-white/70 bg-white/80 px-3 py-3 text-sm text-slate-800 lg:w-auto lg:min-w-0 lg:max-w-sm">
          <span class="min-w-0">
            <span class="block break-words font-semibold">{props.state.toggle.label}</span>
            <span class="block break-words text-xs text-slate-500">{props.state.toggle.statusLabel}</span>
          </span>
          <input
            type="checkbox"
            class="h-5 w-5 accent-rose-600"
            checked={props.state.toggle.enabled}
            aria-label={props.state.toggle.label}
            onChange={(event) => props.onToggleWeddingAiRouting(event.currentTarget.checked)}
          />
        </label>
      </div>

      <div class="mt-4 grid gap-3 md:grid-cols-3">
        <For each={props.state.metrics}>
          {(metric) => (
            <div class={`min-w-0 rounded-xl border p-3 ${statusClass(metric.status)}`}>
              <p class="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-75">{metric.title}</p>
              <p class="mt-1 break-words text-lg font-semibold">{metric.value}</p>
              <p class="mt-1 break-words text-xs leading-5 opacity-80">{metric.detail}</p>
            </div>
          )}
        </For>
      </div>

      <div class="mt-4 rounded-xl border border-amber-200/70 bg-amber-50/80 p-3">
        <p class="break-words text-sm font-semibold text-amber-950">{props.state.toggle.statusLabel}</p>
        <p class="mt-1 break-words text-xs leading-5 text-amber-900">{props.state.toggle.detail}</p>
        <p class="mt-2 break-words text-xs leading-5 text-amber-900">{props.state.toggle.warning}</p>
      </div>

      <ul class="mt-3 grid gap-2 text-xs leading-5 text-slate-700 md:grid-cols-2">
        <For each={props.state.guardrails}>
          {(guardrail) => <li class="break-words rounded-lg border border-white/60 bg-white/70 px-3 py-2">{guardrail}</li>}
        </For>
      </ul>
    </section>
  );
}
