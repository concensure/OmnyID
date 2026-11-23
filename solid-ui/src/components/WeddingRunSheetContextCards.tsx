import { createMemo, createSignal, For, Show } from "solid-js";

import type {
  WeddingRunSheetBufferSuggestion,
  WeddingRunSheetContextCard,
  WeddingRunSheetIntent,
} from "@/lib/weddingRunSheetIntelligenceState";
import { buildWeddingRunSheetIntelligence } from "@/lib/weddingRunSheetIntelligenceState";
import type { WeddingRunSheetPresentedRow } from "@/lib/weddingRunSheetEditingState";

const toneClass: Record<WeddingRunSheetContextCard["tone"], string> = {
  ready: "border-emerald-200 bg-emerald-50/70",
  attention: "border-amber-200 bg-amber-50/70",
  risk: "border-red-200 bg-red-50/70",
  neutral: "border-wedding-border bg-white",
};

export function WeddingRunSheetContextCards(props: {
  cards: WeddingRunSheetContextCard[];
  onIntent: (intent: WeddingRunSheetIntent) => void;
}) {
  return <section aria-label="Run-sheet guidance">
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <For each={props.cards}>{(card) => <article data-a2ui-schema={String(card.a2ui.schema_version)} class={`flex min-w-0 flex-col rounded-xl border p-4 ${toneClass[card.tone]}`}>
        <h3 class="text-sm font-bold text-wedding-text">{card.title}</h3>
        <p class="mt-1 text-sm leading-5 text-wedding-muted">{card.summary}</p>
        <Show when={card.items.length}><ul class="mt-2 space-y-1 text-xs leading-5 text-wedding-muted"><For each={card.items}>{(item) => <li class="break-words">{item}</li>}</For></ul></Show>
        <Show when={card.intent && card.actionLabel}><button type="button" onClick={() => card.intent && props.onIntent(card.intent)} class="mt-auto min-h-11 self-start pt-3 text-sm font-bold text-wedding-action underline decoration-wedding-action/30 underline-offset-4">{card.actionLabel}</button></Show>
      </article>}</For>
    </div>
  </section>;
}

export function WeddingRunSheetBufferReviewDialog(props: {
  suggestion: WeddingRunSheetBufferSuggestion | null;
  rowLabels: string[];
  busy: boolean;
  error: string;
  onCancel: () => void;
  onApprove: () => void;
}) {
  return <Show when={props.suggestion}>{(suggestion) => <div class="fixed inset-0 z-[225] flex items-end bg-on-surface/30 backdrop-blur-sm sm:items-center sm:justify-center sm:p-3">
    <div role="dialog" aria-modal="true" aria-labelledby="runsheet-buffer-title" class="w-full rounded-t-2xl bg-white p-5 shadow-panel sm:max-w-lg sm:rounded-2xl sm:p-6">
      <h2 id="runsheet-buffer-title" class="text-lg font-bold text-wedding-text">Review this buffer</h2>
      <p class="mt-2 text-sm leading-6 text-wedding-muted">{suggestion().explanation}</p>
      <div class="mt-3 rounded-lg border border-wedding-border bg-wedding-card p-3">
        <p class="text-xs font-bold uppercase tracking-wide text-wedding-muted">Affected items</p>
        <ul class="mt-1 space-y-1 text-sm text-wedding-text"><For each={props.rowLabels}>{(label) => <li>{label}</li>}</For></ul>
      </div>
      <p class="mt-3 text-xs leading-5 text-wedding-muted">Adding the buffer records an approved planning allowance. It does not confirm either item or change an authoritative vendor time.</p>
      <Show when={props.error}><p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{props.error}</p></Show>
      <div class="mt-5 grid grid-cols-2 gap-3">
        <button autofocus type="button" disabled={props.busy} onClick={props.onCancel} class="min-h-12 rounded-lg border-2 border-wedding-action text-base font-bold text-wedding-action">Cancel</button>
        <button type="button" disabled={props.busy} onClick={props.onApprove} class="min-h-12 rounded-lg bg-wedding-action px-3 text-base font-bold text-white disabled:opacity-50">{props.busy ? "Saving…" : `Add ${suggestion().minutes}-minute buffer`}</button>
      </div>
    </div>
  </div>}</Show>;
}

export function WeddingRunSheetIntelligencePanel(props: {
  rows: WeddingRunSheetPresentedRow[];
  archived: boolean;
  onFocusRecords: (recordIds: string[]) => void;
  onShowAttention: () => void;
  onShowAll: () => void;
  onAddItem: (preset: "item" | "milestone") => void;
  onApproveBuffer: (suggestion: WeddingRunSheetBufferSuggestion) => Promise<boolean>;
}) {
  const intelligence = createMemo(() => buildWeddingRunSheetIntelligence({ rows: props.rows }));
  const [pending, setPending] = createSignal<WeddingRunSheetBufferSuggestion | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const labels = () => (pending()?.affectedRecordIds ?? []).map((id) => String(props.rows.find((row) => row.record.id === id)?.record.data.title || "Run-sheet item"));
  function resolve(intent: WeddingRunSheetIntent) {
    if (intent.kind === "focus_records") props.onFocusRecords(intent.recordIds);
    else if (intent.kind === "show_attention") props.onShowAttention();
    else if (intent.kind === "show_all") props.onShowAll();
    else if (intent.kind === "add_item") props.onAddItem(intent.preset);
    else if (!props.archived) setPending(intelligence().bufferSuggestions.find((item) => item.id === intent.suggestionId) ?? null);
  }
  async function approve() {
    const suggestion = pending();
    if (!suggestion || busy()) return;
    setBusy(true); setError("");
    try {
      if (await props.onApproveBuffer(suggestion)) setPending(null);
      else setError("The buffer could not be saved. Please try again.");
    } catch {
      setError("The buffer could not be saved. Please try again.");
    } finally { setBusy(false); }
  }
  return <>
    <WeddingRunSheetContextCards cards={intelligence().cards} onIntent={resolve} />
    <WeddingRunSheetBufferReviewDialog suggestion={pending()} rowLabels={labels()} busy={busy()} error={error()} onCancel={() => { if (!busy()) setPending(null); }} onApprove={() => void approve()} />
  </>;
}
