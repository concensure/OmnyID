import { For, Show } from "solid-js";
import type {
  ClosureStatusPresentation,
  QuotationClosureAction,
  QuotationDecisionClosureProjection,
  QuotationSourceReference,
} from "@/lib/quotationDecisionClosureState";

export type QuotationClosureTimelineProps = {
  projection: QuotationDecisionClosureProjection;
  busy?: boolean;
  error?: string | null;
  onAction: (action: QuotationClosureAction) => void;
  onOpenSource?: (source: QuotationSourceReference, trigger: HTMLButtonElement) => void;
};

const ICONS: Record<ClosureStatusPresentation["icon"], string> = {
  choice: "●",
  document: "▤",
  review: "✓",
  calendar: "◷",
  receipt: "$",
  booking: "★",
  cancelled: "×",
  refund: "↩",
  superseded: "⇄",
};

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "Not recorded";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "Structured value";
  }
}

function readableKey(value: string): string {
  return value.replaceAll("_", " ").replaceAll(".", " · ");
}

function SourceButton(props: {
  source: QuotationSourceReference;
  onOpenSource?: QuotationClosureTimelineProps["onOpenSource"];
}) {
  const label = () => `${props.source.media_type} ${props.source.source_id}`;
  return props.onOpenSource ? (
    <button
      type="button"
      class="min-h-11 rounded-lg border px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
      onClick={(event) => props.onOpenSource?.(props.source, event.currentTarget)}
    >
      View source: {label()}
    </button>
  ) : <span class="text-xs text-slate-600">Source: {label()}</span>;
}

export default function QuotationClosureTimeline(props: QuotationClosureTimelineProps) {
  const headingId = () => `quotation-closure-${props.projection.stateId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const consequenceId = () => `${headingId()}-consequence`;
  return (
    <article aria-labelledby={headingId()} class="w-full max-w-3xl space-y-5 rounded-2xl border bg-white p-4 shadow-sm">
      <header class="space-y-1">
        <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Decision record</p>
        <h2 id={headingId()} class="text-lg font-semibold">Booking progress</h2>
        <Show when={props.projection.status} fallback={<p class="text-sm text-slate-700">No vendor has been selected.</p>}>
          {(status) => (
            <p class="flex items-center gap-2 text-sm font-medium" data-status-icon={status().icon}>
              <span aria-hidden="true">{ICONS[status().icon]}</span>
              {status().label}
            </p>
          )}
        </Show>
      </header>

      <Show when={props.projection.staleReason}>
        {(reason) => <p role="alert" class="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{reason()}</p>}
      </Show>

      <Show when={props.projection.timeline.length > 0}>
        <ol aria-label="Booking status history" class="space-y-3">
          <For each={props.projection.timeline}>{(item) => (
            <li aria-current={item.current ? "step" : undefined} class="rounded-xl border p-3">
              <div class="flex items-start gap-3">
                <span aria-hidden="true" class="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border">{ICONS[item.icon]}</span>
                <div class="min-w-0 flex-1">
                  <p class="font-medium">{item.label}{item.current ? " · Current" : ""}</p>
                  <p class="text-xs text-slate-600">{item.occurredAt}</p>
                  <Show when={item.evidence.length > 0}>
                    <div class="mt-2 flex flex-wrap gap-2">
                      <For each={item.evidence}>{(source) => <SourceButton source={source} onOpenSource={props.onOpenSource} />}</For>
                    </div>
                  </Show>
                </div>
              </div>
            </li>
          )}</For>
        </ol>
      </Show>

      <Show when={props.projection.materialChanges.length > 0}>
        <section aria-labelledby={`${headingId()}-changes`} class="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <h3 id={`${headingId()}-changes`} class="font-semibold text-amber-950">Review material contract changes</h3>
          <p class="mt-1 text-sm text-amber-950">Review the source-linked before and after values before acknowledging the contract.</p>
          <ul class="mt-3 space-y-3">
            <For each={props.projection.materialChanges}>{(change) => (
              <li class="rounded-lg bg-white p-3 text-sm">
                <p class="font-medium">{readableKey(change.path)}</p>
                <dl class="mt-2 grid gap-2 sm:grid-cols-2">
                  <div><dt class="text-xs text-slate-500">Before</dt><dd class="break-words">{displayValue(change.before)}</dd></div>
                  <div><dt class="text-xs text-slate-500">After</dt><dd class="break-words">{displayValue(change.after)}</dd></div>
                </dl>
                <div class="mt-2 flex flex-wrap gap-2">
                  <For each={change.evidence}>{(source) => <SourceButton source={source} onOpenSource={props.onOpenSource} />}</For>
                </div>
              </li>
            )}</For>
          </ul>
        </section>
      </Show>

      <Show when={props.projection.vendorPreview}>
        {(preview) => (
          <section aria-labelledby={`${headingId()}-vendor-preview`} class="rounded-xl border p-3">
            <h3 id={`${headingId()}-vendor-preview`} class="font-semibold">What the vendor will see</h3>
            <p class="mt-1 text-sm text-slate-600">Only the fields below will be shared with {preview().recipientVendorId} for {readableKey(preview().purpose)}.</p>
            <dl class="mt-3 divide-y">
              <For each={preview().fields}>{(field) => (
                <div class="grid gap-1 py-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
                  <dt class="font-medium">{readableKey(field.key)}</dt>
                  <dd class="break-words text-sm text-slate-700">
                    {displayValue(field.value)}
                  </dd>
                </div>
              )}</For>
            </dl>
            <Show when={preview().provenanceRefs.length > 0}>
              <p class="mt-2 text-xs text-slate-500">Sources: {preview().provenanceRefs.join(", ")}</p>
            </Show>
            <p class="mt-2 text-xs text-slate-500">Grant revision {preview().grantRevision}{preview().expiresAt ? ` · Expires ${preview().expiresAt}` : ""}</p>
          </section>
        )}
      </Show>

      <div class="rounded-xl bg-slate-50 p-3">
        <p class="font-medium">Records only — OmnyID will not make a payment.</p>
        <p class="mt-1 text-sm text-slate-600">Deposit and refund entries describe evidence of money moved elsewhere.</p>
      </div>

      <Show when={props.error}>
        {(error) => <p role="alert" class="text-sm text-red-700">{error()}</p>}
      </Show>

      <Show when={props.projection.action}>
        {(action) => (
          <div class="space-y-2" data-swipe-ignore="true" style={{ "touch-action": "manipulation" }}>
            <button
              type="button"
              disabled={props.busy}
              aria-describedby={consequenceId()}
              class="min-h-11 w-full rounded-lg bg-slate-900 px-4 py-2 text-white disabled:opacity-50 sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
              onClick={() => props.onAction(action())}
            >
              {props.busy ? "Saving…" : action().label}
            </button>
            <p id={consequenceId()} class="text-sm text-slate-600">{action().effect}</p>
          </div>
        )}
      </Show>
    </article>
  );
}
