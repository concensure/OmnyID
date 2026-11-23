import { Show } from "solid-js";

export type QuotationSourcePreviewProps = {
  excerpt: string;
  locatorLabel: string;
  sourceAvailable: boolean;
};

export default function QuotationSourcePreview(props: QuotationSourcePreviewProps) {
  return (
    <section aria-label="Quotation source preview" class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">{props.locatorLabel}</p>
      <Show
        when={props.sourceAvailable}
        fallback={<p role="status" class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">The source preview is unavailable. You can still mark this field unknown or enter it manually.</p>}
      >
        <pre class="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm text-slate-800">{props.excerpt}</pre>
      </Show>
    </section>
  );
}
