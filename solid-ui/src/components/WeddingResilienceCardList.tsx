// @locs-version: 1.0
import { For, Show } from "solid-js";

import { WeddingSemanticSurfaceStrip } from "@/components/WeddingSemanticSurfaceStrip";
import type {
  WeddingResilienceChainPanelTone,
  WeddingResilienceDisplayState,
  WeddingResilienceFlowStepTone,
} from "@/lib/weddingResilienceDisplayState";
import type { WeddingComparisonColumnState } from "@/lib/weddingComparisonColumnState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";

function toneClass(tone: "urgent" | "review" | "calm"): string {
  if (tone === "urgent") return "border-rose-200 bg-rose-50/85 text-rose-950";
  if (tone === "review") return "border-amber-200 bg-amber-50/85 text-amber-950";
  return "border-sky-200 bg-sky-50/85 text-sky-950";
}

function buttonClass(primary = false): string {
  return primary
    ? "rounded-full border border-pink-200 bg-white px-3 py-1.5 text-xs font-semibold text-pink-950 transition hover:bg-pink-50"
    : "rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-white";
}

function flowStepClass(tone: WeddingResilienceFlowStepTone): string {
  if (tone === "risk") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "options") return "border-emerald-300 bg-emerald-100 text-emerald-800";
  if (tone === "action") return "border-indigo-300 bg-indigo-950 text-white";
  return "border-slate-200 bg-white/75 text-black";
}

function chainPanelClass(tone: WeddingResilienceChainPanelTone): string {
  if (tone === "options") return "border-emerald-300 bg-emerald-50 text-emerald-950";
  if (tone === "action") return "border-indigo-300 bg-indigo-950 text-white";
  return "border-indigo-200 bg-indigo-50 text-indigo-950";
}

function previewHeaderClass(column: WeddingComparisonColumnState): string {
  if (column.tone === "money") return "px-3 py-2 font-semibold text-emerald-950";
  if (column.tone === "match") return "px-3 py-2 font-semibold text-teal-950";
  if (column.tone === "available") return "px-3 py-2 font-semibold text-sky-950";
  if (column.tone === "risk") return "px-3 py-2 font-semibold text-red-700";
  if (column.tone === "action") return "px-3 py-2 font-semibold text-indigo-950";
  return "px-3 py-2 font-semibold text-slate-900";
}

function previewCellClass(column: WeddingComparisonColumnState, value: string): string {
  const base = "max-w-[11rem] break-words px-3 py-2 align-top";
  if (column.tone === "money") return `${base} font-semibold text-emerald-950`;
  if (column.tone === "match") return `${base} text-teal-950`;
  if (column.tone === "available") return /\b(cancel|no response|unavailable|check|hold)\b/i.test(value)
    ? `${base} font-semibold text-red-700`
    : `${base} font-semibold text-sky-950`;
  if (column.tone === "risk") return `${base} font-semibold text-red-700`;
  if (column.tone === "action") return `${base} font-semibold text-indigo-950`;
  return `${base} text-slate-800`;
}

function previewCellFallback(): WeddingComparisonColumnState {
  return {
    header: "",
    kind: "text",
    label: "Detail",
    tone: "status",
  };
}

export function WeddingResilienceCardList(props: {
  state: WeddingResilienceDisplayState;
  onSidebarAction: (action: WeddingWorkspaceSidebarAction) => void;
}) {
  return (
    <Show when={props.state.shouldShow}>
      <section class="rounded-[24px] border border-white/70 bg-white/80 p-3 shadow-card backdrop-blur sm:rounded-[28px] sm:p-4">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <p class="text-base font-semibold text-on-surface">{props.state.title}</p>
            <p class="mt-1 text-sm leading-6 text-on-surface-variant">
              {props.state.summaryLabel}
            </p>
          </div>
          <button
            type="button"
            disabled={!props.state.reviewAllAction.enabled}
            class="rounded-full border border-pink-200 bg-pink-50 px-3 py-2 text-xs font-semibold text-pink-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
            data-magic-action="open"
            data-magic-icon="review"
            data-magic-label={props.state.reviewAllAction.label}
            data-magic-id="wedding:resilience:review-all"
            onClick={() => props.onSidebarAction(props.state.reviewAllAction)}
          >
            {props.state.reviewAllAction.label}
          </button>
        </div>
        <WeddingSemanticSurfaceStrip
          state={props.state.semanticSurface}
          label="Change and disagreement meaning"
          canUsePrimaryAction={(item) => {
            return props.state.cards.some((entry) => entry.id === item.objectId && entry.primaryAction.enabled);
          }}
          onPrimaryAction={(item) => {
            const card = props.state.cards.find((entry) => entry.id === item.objectId);
            if (card?.primaryAction.enabled) props.onSidebarAction(card.primaryAction);
          }}
        />
        <div class="mt-3 grid gap-3 md:grid-cols-2">
          <For each={props.state.cards}>
            {(card) => (
              <article class={`rounded-2xl border p-3 ${toneClass(card.tone)}`}>
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-xs font-semibold uppercase tracking-[0.12em] opacity-65">{card.eyebrowLabel}</p>
                    <p class="mt-1 break-words text-sm font-semibold">{card.title}</p>
                  </div>
                  <span class="rounded-full bg-white/70 px-2 py-1 text-[11px] font-semibold capitalize opacity-80">
                    {card.tone}
                  </span>
                </div>
                <p class="mt-2 text-sm leading-6 opacity-80">{card.detailLabel}</p>
                <p class="mt-2 rounded-2xl border border-white/70 bg-white/55 px-2.5 py-2 text-xs leading-5 opacity-80">
                  {card.statusLabel}
                </p>
                <div class="mt-3 flex flex-wrap items-center gap-1.5" aria-label={`${card.title} planning path`}>
                  <For each={card.flowSteps}>
                    {(step, index) => (
                      <>
                        <Show when={index() > 0}>
                          <span class="text-xs font-semibold opacity-45">→</span>
                        </Show>
                        <span class={`max-w-full break-words rounded-full border px-2 py-1 text-[11px] font-semibold ${flowStepClass(step.tone)}`}>
                          {step.label}
                        </span>
                      </>
                    )}
                  </For>
                </div>
                <p class="mt-2 text-xs leading-5 opacity-70">{card.evidenceLabel}</p>
                <Show when={card.comparisonPreview}>
                  {(preview) => (
                    <div class="mt-3 overflow-hidden rounded-2xl border border-emerald-200 bg-white/70">
                      <p class="border-b border-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-950">
                        {preview().title}
                      </p>
                      <div class="overflow-x-auto">
                        <table class="min-w-full text-left text-xs">
                          <thead class="bg-emerald-50 text-emerald-950">
                            <tr>
                              <For each={preview().columns}>
                                {(column) => <th class={previewHeaderClass(column)}>{column.label}</th>}
                              </For>
                            </tr>
                          </thead>
                          <tbody>
                            <For each={preview().rows}>
                              {(row) => (
                                <tr class="border-t border-emerald-100/80">
                                  <For each={row.cells}>
                                    {(cell, cellIndex) => {
                                      const column = () => preview().columns[cellIndex()] ?? previewCellFallback();
                                      return (
                                        <td class={previewCellClass(column(), cell)}>
                                          <Show when={column().kind === "action"} fallback={cell}>
                                            <button
                                              type="button"
                                              class="rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-950 transition hover:bg-indigo-50"
                                              data-magic-action="open"
                                              data-magic-icon="compare"
                                              data-magic-label={cell}
                                              data-magic-id={`wedding:resilience:${card.id}:comparison-action`}
                                              onClick={() => props.onSidebarAction(card.primaryAction)}
                                            >
                                              {cell}
                                            </button>
                                          </Show>
                                        </td>
                                      );
                                    }}
                                  </For>
                                </tr>
                              )}
                            </For>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </Show>
                <div class="mt-3 grid gap-2 lg:grid-cols-3" aria-label={`${card.title} next steps`}>
                  <For each={card.chainPanels}>
                    {(panel) => (
                      <div class={`rounded-2xl border px-2.5 py-2 ${chainPanelClass(panel.tone)}`}>
                        <p class="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">{panel.label}</p>
                        <p class="mt-1 text-xs font-semibold">{panel.title}</p>
                        <p class="mt-1 text-[11px] leading-5 opacity-80">{panel.detail}</p>
                      </div>
                    )}
                  </For>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    class={buttonClass(true)}
                    data-magic-action="acknowledge"
                    data-magic-icon="check"
                    data-magic-label={card.primaryAction.label}
                    data-magic-id={`wedding:resilience:${card.id}:primary`}
                    onClick={() => props.onSidebarAction(card.primaryAction)}
                  >
                    {card.primaryAction.label}
                  </button>
                  <button
                    type="button"
                    class={buttonClass(false)}
                    data-magic-action="escalate"
                    data-magic-icon="focus"
                    data-magic-label={card.secondaryAction.label}
                    data-magic-id={`wedding:resilience:${card.id}:secondary`}
                    onClick={() => props.onSidebarAction(card.secondaryAction)}
                  >
                    {card.secondaryAction.label}
                  </button>
                </div>
              </article>
            )}
          </For>
        </div>
      </section>
    </Show>
  );
}
