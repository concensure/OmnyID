import { For, Show } from "solid-js";
import { closureActions, depositBudgetLabels, type QuotationClosureState } from "@/lib/quotationClosureState";

export type QuotationClosureCardProps = {
  state: QuotationClosureState;
  onAction: (actionId: string) => void;
};

export default function QuotationClosureCard(props: QuotationClosureCardProps) {
  const labels = () => depositBudgetLabels(props.state);
  return (
    <article aria-labelledby="quotation-closure-title" class="w-full max-w-2xl space-y-4 rounded-2xl border bg-white p-4 shadow-sm">
      <header>
        <h2 id="quotation-closure-title" class="text-lg font-semibold">Booking progress</h2>
        <p class="text-sm text-slate-600">Current status: {props.state.status.replaceAll("_", " ")}</p>
      </header>
      <Show when={props.state.changedTerms.length && !props.state.changedTermsReviewed}>
        <div role="alert" class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Contract terms changed. Review them before confirming this booking.
          <ul class="mt-2 list-disc pl-5"><For each={props.state.changedTerms}>{(term) => <li>{term}</li>}</For></ul>
        </div>
      </Show>
      <Show when={labels().cashFlow}><p class="text-sm">{labels().cashFlow}</p></Show>
      <Show when={labels().addedCost}><p class="text-sm font-medium">{labels().addedCost}</p></Show>
      <Show when={props.state.deadlineAt}><p class="text-sm">Next deadline: {props.state.deadlineAt}</p></Show>
      <div class="flex flex-wrap gap-2">
        <For each={closureActions(props.state)}>{(action) => (
          <button type="button" disabled={!action.enabled} onClick={() => props.onAction(action.id)} class="min-h-11 rounded-lg border px-4 disabled:opacity-50">{action.label}</button>
        )}</For>
      </div>
      <p class="text-xs text-slate-500">Recording a deposit does not send or execute a payment.</p>
    </article>
  );
}
