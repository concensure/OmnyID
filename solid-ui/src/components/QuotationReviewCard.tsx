import { For, Show } from "solid-js";
import { evidencePresentation, type QuotationEvidenceView } from "@/lib/quotationEvidenceState";
import type { QuotationReviewAction, QuotationReviewField } from "@/lib/quotationReviewState";

export type QuotationReviewCardProps = {
  title: string;
  parserStatus: "ready" | "blocked" | "manual_review_required";
  fields: QuotationReviewField[];
  busy?: boolean;
  onAction: (action: QuotationReviewAction) => void;
  onOpenEvidence: (field: QuotationReviewField, trigger: HTMLElement) => void;
};

function EvidenceLabel(props: { evidence: QuotationEvidenceView }) {
  const presentation = () => evidencePresentation(props.evidence);
  return <span aria-label={presentation().label}>{presentation().icon} {presentation().label}</span>;
}

export default function QuotationReviewCard(props: QuotationReviewCardProps) {
  return (
    <article aria-labelledby="quotation-review-title" class="w-full max-w-3xl space-y-4 rounded-2xl border bg-white p-4 shadow-sm">
      <header>
        <h2 id="quotation-review-title" class="text-lg font-semibold">{props.title}</h2>
        <Show when={props.parserStatus !== "ready"}>
          <p role="status" class="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Automatic extraction is unavailable. Review the source or enter the quotation manually.</p>
        </Show>
      </header>
      <ul class="space-y-3">
        <For each={props.fields}>{(field) => {
          const presentation = () => evidencePresentation(field.evidence);
          return (
            <li class="rounded-xl border p-3">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p class="font-medium">{field.label}</p>
                  <p class="text-sm text-slate-700">{field.valueLabel}</p>
                  <p class="mt-1 text-xs text-slate-600"><EvidenceLabel evidence={field.evidence} /></p>
                </div>
                <Show when={presentation().canOpenSource}>
                  <button type="button" class="min-h-11 rounded-lg border px-3" onClick={(event) => props.onOpenEvidence(field, event.currentTarget)}>View source</button>
                </Show>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <button disabled={props.busy} type="button" class="min-h-11 rounded-lg bg-slate-900 px-3 text-white disabled:opacity-50" onClick={() => props.onAction({ action: "confirm_line", line_id: field.id })}>Confirm</button>
                <button disabled={props.busy} type="button" class="min-h-11 rounded-lg border px-3 disabled:opacity-50" onClick={() => props.onAction({ action: "mark_unknown", line_id: field.id, reason: "Not confirmed during review" })}>Mark unknown</button>
                <button disabled={props.busy} type="button" class="min-h-11 rounded-lg border px-3 disabled:opacity-50" onClick={() => props.onAction({ action: "mark_not_applicable", line_id: field.id, reason: "Marked not applicable during review" })}>Not applicable</button>
              </div>
            </li>
          );
        }}</For>
      </ul>
    </article>
  );
}
