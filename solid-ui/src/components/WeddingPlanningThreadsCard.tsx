// @locs-version: 1.0
import { For, Show, createMemo } from "solid-js";

import { WeddingSemanticSurfaceStrip } from "@/components/WeddingSemanticSurfaceStrip";
import {
  buildWeddingPlanningThreadsState,
  type WeddingPlanningThreadStateTone,
  type WeddingPlanningThreadZoneId,
} from "@/lib/weddingPlanningThreadsState";
import { dispatchWeddingHelperTaskTab } from "@/lib/weddingHelpersNavigationState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import {
  isWeddingWorkspaceMenuId,
  type WeddingWorkspaceMenuId,
} from "@/lib/weddingWorkspaceMenuState";

function zoneClass(id: WeddingPlanningThreadZoneId): string {
  if (id === "needs_you") return "border-rose-100 bg-rose-50/80 text-rose-950";
  if (id === "being_handled") return "border-sky-100 bg-sky-50/80 text-sky-950";
  return "border-emerald-100 bg-emerald-50/80 text-emerald-950";
}

function buttonClass(id: WeddingPlanningThreadZoneId): string {
  if (id === "needs_you") return "border-rose-200 text-rose-950 hover:bg-rose-50";
  if (id === "being_handled") return "border-sky-200 text-sky-950 hover:bg-sky-50";
  return "border-emerald-200 text-emerald-950 hover:bg-emerald-50";
}

function stateTextClass(tone: WeddingPlanningThreadStateTone): string {
  if (tone === "risk") return "text-red-700";
  if (tone === "options") return "text-emerald-700";
  if (tone === "action") return "text-indigo-950";
  return "text-black";
}

function statePillClass(tone: WeddingPlanningThreadStateTone): string {
  if (tone === "risk") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "options") return "border-emerald-300 bg-emerald-100 text-emerald-800";
  if (tone === "action") return "border-indigo-300 bg-indigo-950 text-white";
  return "border-slate-200 bg-white text-black";
}

export function WeddingPlanningThreadsCard(props: {
  state: WeddingResponseWorkspaceViewState;
  onSelectMenu?: (menu: WeddingWorkspaceMenuId) => void;
  onSelectArtifact?: (artifactId: string) => void;
}) {
  const threads = createMemo(() => buildWeddingPlanningThreadsState(props.state));
  function openThreadItem(item: ReturnType<typeof buildWeddingPlanningThreadsState>["zones"][number]["items"][number]) {
    if (item.menuId === "helpers" && item.helperTaskTab) {
      dispatchWeddingHelperTaskTab(item.helperTaskTab);
    }
    if (item.artifactId) props.onSelectArtifact?.(item.artifactId);
    props.onSelectMenu?.(item.menuId);
  }
  return (
    <Show when={threads().shouldShow}>
      <section class="rounded-[24px] border border-white/70 bg-white/80 p-3 shadow-card backdrop-blur sm:rounded-[28px] sm:p-4">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <p class="text-base font-semibold text-on-surface">{threads().title}</p>
            <p class="mt-1 text-sm leading-6 text-on-surface-variant">{threads().summary}</p>
          </div>
          <span class="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
            Follow-through
          </span>
        </div>
        <p class="mt-3 rounded-2xl border border-slate-200 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-900">
          {threads().snapshotLabel}
        </p>
        <WeddingSemanticSurfaceStrip
          state={threads().semanticSurface}
          label="Current planning meaning"
          canUsePrimaryAction={(item) => isWeddingWorkspaceMenuId(item.primaryAction?.targetMenu)}
          onPrimaryAction={(item) => {
            const menuId = item.primaryAction?.targetMenu;
            if (isWeddingWorkspaceMenuId(menuId)) props.onSelectMenu?.(menuId);
          }}
        />
        <div class="mt-3 grid gap-3 lg:grid-cols-3">
          <For each={threads().zones}>
            {(zone) => (
              <article class={`rounded-2xl border p-3 ${zoneClass(zone.id)}`}>
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold">{zone.title}</p>
                    <p class="mt-1 text-xs leading-5 opacity-70">{zone.summary}</p>
                  </div>
                  <span class="rounded-full bg-white/75 px-2 py-1 text-[11px] font-semibold opacity-75">
                    {zone.items.length}
                  </span>
                </div>
                <Show when={zone.items.length > 0} fallback={
                  <p class="mt-3 rounded-xl border border-white/70 bg-white/55 px-2.5 py-2 text-xs leading-5 opacity-70">
                    Nothing to show here yet.
                  </p>
                }>
                  <div class="mt-3 space-y-2">
                    <For each={zone.items}>
                      {(item) => (
                        <button
                          type="button"
                          class={`w-full rounded-xl border bg-white/70 px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${buttonClass(zone.id)}`}
                          onClick={() => openThreadItem(item)}
                          title={item.actionLabel}
                          data-magic-action="open"
                          data-magic-icon="thread"
                          data-magic-label={item.actionLabel}
                          data-magic-id={`wedding:planning-thread:${zone.id}:${item.menuId}:${item.artifactId ?? item.title}`}
                        >
                          <span class="flex items-start justify-between gap-2">
                            <span class="min-w-0 text-xs font-semibold">{item.title}</span>
                            <span class={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statePillClass(item.stateTone)}`}>
                              {item.stateLabel}
                            </span>
                          </span>
                          <span class="mt-1 block text-xs leading-5 opacity-70">{item.detail}</span>
                          <span class="mt-2 flex flex-wrap items-center gap-1.5">
                            <For each={item.steps}>
                              {(step, index) => (
                                <>
                                  <span class={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statePillClass(step.tone)}`}>
                                    {step.label}
                                  </span>
                                  <Show when={index() < item.steps.length - 1}>
                                    <span class="text-[10px] font-semibold text-slate-400">-&gt;</span>
                                  </Show>
                                </>
                              )}
                            </For>
                          </span>
                          <span class={`mt-1 block text-[11px] font-semibold ${stateTextClass(item.stateTone)}`}>{item.stateLabel}</span>
                          <span class="mt-1 block text-[11px] font-semibold opacity-75">{item.actionLabel}</span>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </article>
            )}
          </For>
        </div>
      </section>
    </Show>
  );
}
