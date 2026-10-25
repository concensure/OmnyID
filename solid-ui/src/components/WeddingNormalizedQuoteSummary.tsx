import { For, Show } from "solid-js";

import type { WeddingArtifactQuotePreview } from "@/lib/weddingArtifactPreviewState";
import { buildWeddingNormalizedQuoteState } from "@/lib/weddingNormalizedQuoteState";

export function WeddingNormalizedQuoteSummary(props: { quote: WeddingArtifactQuotePreview; compact?: boolean }) {
  const state = () => buildWeddingNormalizedQuoteState(props.quote);
  const statusClass = () => state().completeness === "complete"
    ? "bg-emerald-100 text-emerald-950"
    : state().completeness === "needs_clarification"
      ? "bg-amber-100 text-amber-950"
      : "bg-slate-200 text-slate-800";
  const list = (title: string, items: string[]) => (
    <Show when={items.length > 0}>
      <section class="rounded-lg border border-wedding-border bg-white p-3">
        <h5 class="text-xs font-bold uppercase tracking-[0.08em] text-wedding-ink/65">{title}</h5>
        <ul class="mt-2 space-y-1">
          <For each={items}>{(item) => <li class="break-words text-sm leading-5 text-wedding-ink/80">{item}</li>}</For>
        </ul>
      </section>
    </Show>
  );
  return (
    <section class="rounded-xl border border-wedding-border bg-wedding-page p-4" aria-label={`Normalized quote from ${state().vendorName}`}>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs font-bold uppercase tracking-[0.08em] text-wedding-primary">Normalized quote</p>
          <h4 class="mt-1 text-lg font-bold text-wedding-ink">{state().vendorName}</h4>
          <p class="mt-1 text-sm text-wedding-ink/65">{state().totalBasisLabel}</p>
        </div>
        <div class="text-right">
          <p class="text-xl font-extrabold text-wedding-ink">{state().comparableTotalLabel}</p>
          <span class={`mt-1 inline-flex rounded-lg px-2 py-1 text-xs font-bold ${statusClass()}`}>{state().completenessLabel}</span>
        </div>
      </div>
      <dl class="mt-4 grid gap-2 sm:grid-cols-3">
        <For each={state().eventBasis}>{(item) => (
          <div class="rounded-lg border border-wedding-border bg-white p-3">
            <dt class="text-xs font-bold uppercase tracking-[0.08em] text-wedding-ink/60">{item.label}</dt>
            <dd class={`mt-1 break-words text-sm font-semibold ${item.confirmed ? "text-wedding-ink" : "text-amber-900"}`}>{item.value}</dd>
          </div>
        )}</For>
      </dl>
      <Show when={!props.compact}>
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          {list("Included", state().inclusions)}
          {list("Required adjustments", state().adjustments)}
          {list("Not included or unclear", state().exclusions)}
          {list("Payment terms", state().paymentTerms)}
        </div>
      </Show>
      <div class={`mt-3 rounded-lg border p-3 ${state().recommendationReady ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <p class="text-xs font-bold uppercase tracking-[0.08em] text-wedding-ink/65">Recommendation</p>
        <p class="mt-1 text-sm font-bold text-wedding-ink">{state().recommendationLabel}</p>
        <p class="mt-1 text-sm leading-6 text-wedding-ink/75">{state().recommendationDetail}</p>
      </div>
      <Show when={!props.compact && state().questions.length > 0}>
        <div class="mt-3">
          <p class="text-xs font-bold uppercase tracking-[0.08em] text-wedding-ink/60">Still to confirm</p>
          <ul class="mt-1 list-disc space-y-1 pl-5 text-sm text-wedding-ink/75">
            <For each={state().questions}>{(item) => <li>{item}</li>}</For>
          </ul>
        </div>
      </Show>
    </section>
  );
}
