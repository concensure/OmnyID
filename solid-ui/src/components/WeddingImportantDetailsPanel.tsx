// @locs-version: 2.1
import { For } from "solid-js";

import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import { weddingImportantDetailsActionLabel } from "@/lib/weddingRecommendationGenerationActionState";

export function WeddingImportantDetailsPanel(props: {
  cards: WeddingResponseWorkspaceViewState["contextCards"];
  onGenerateRecommendations?: (cardTitle: string, nextQuestionLabel: string) => void;
}) {
  return (
    <div class="min-w-0 rounded-[24px] border border-rose-100/80 bg-rose-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
      <p class="text-base font-semibold text-rose-950">Important details</p>
      <div class="mt-3 space-y-2">
        <For each={props.cards}>
          {(card) => (
            <article class="rounded-2xl border border-rose-100 bg-white/75 p-3">
              <div class="flex items-start justify-between gap-2">
                <p class="break-words text-xs font-semibold text-rose-950">{card.title}</p>
                <span class="max-w-full break-words rounded-full bg-rose-50 px-2 py-1 text-xs font-medium text-rose-900">
                  {card.statusLabel}
                </span>
              </div>
              <div class="mt-2 flex flex-wrap gap-1.5">
                <For each={card.metadataLabels.slice(0, 3)}>
                  {(label) => (
                    <span class="max-w-full break-words rounded-full border border-rose-100 bg-rose-50/70 px-2 py-1 text-xs text-rose-900/80">
                      {label}
                    </span>
                  )}
                </For>
              </div>
              <ul class="mt-2 space-y-1">
                <For each={card.answeredLabels.slice(0, 5)}>
                  {(label) => <li class="text-xs leading-5 text-rose-900/75">{label}</li>}
                </For>
              </ul>
              <p class="mt-2 rounded-xl border border-rose-100 bg-rose-50/70 px-2.5 py-2 text-xs leading-5 text-rose-950/80">
                Next: {card.nextQuestionLabel}
              </p>
              <button
                type="button"
                disabled={!props.onGenerateRecommendations}
                class="mt-2 rounded-full bg-rose-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-45"
                onClick={() => props.onGenerateRecommendations?.(card.title, card.nextQuestionLabel)}
              >
                {weddingImportantDetailsActionLabel(card.nextQuestionLabel)}
              </button>
            </article>
          )}
        </For>
      </div>
    </div>
  );
}
