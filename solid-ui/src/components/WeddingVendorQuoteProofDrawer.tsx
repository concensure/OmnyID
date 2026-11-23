// @locs-version: 1.0
import { For, Show } from "solid-js";

import {
  buildWeddingVendorQuoteThreadProofDrawerState,
  type WeddingVendorQuoteThreadProofMessageState,
} from "@/lib/weddingVendorQuoteThreadProofState";

export function WeddingVendorQuoteProofDrawer(props: {
  vendorName: string;
  messages: readonly WeddingVendorQuoteThreadProofMessageState[];
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
}) {
  const drawer = () => buildWeddingVendorQuoteThreadProofDrawerState({
    vendorName: props.vendorName,
    messages: props.messages,
    loading: props.loading,
    error: props.error,
  });
  const statusClass = () => {
    if (drawer().statusTone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-950";
    if (drawer().statusTone === "warning") return "border-amber-200 bg-amber-50 text-amber-950";
    return "border-slate-200 bg-slate-50 text-slate-700";
  };
  const headingId = () => `vendor-quote-proof-${props.vendorName.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const countLabel = (count: number, singular: string) => `${count} ${singular}${count === 1 ? "" : "s"}`;
  const statusRole = () => drawer().statusTone === "warning" ? "alert" : "status";
  const ariaLive = () => drawer().statusTone === "warning" ? "assertive" : "polite";
  return (
    <section
      class="rounded-2xl border border-emerald-100 bg-white/90 p-4 shadow-sm xl:col-span-2"
      aria-labelledby={headingId()}
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase text-emerald-800/70">Sent proof</p>
          <h3 id={headingId()} class="mt-1 break-words text-base font-semibold text-emerald-950">
            {drawer().title}
          </h3>
          <p class="mt-1 break-words text-sm leading-6 text-emerald-900/75">
            {drawer().summary}
          </p>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close sent proof drawer"
          class="rounded-full border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
        >
          Close
        </button>
      </div>
      <div class={`mt-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm ${statusClass()}`} role={statusRole()} aria-live={ariaLive()}>
        <span class="font-semibold">{drawer().statusLabel}</span>
        <span>{countLabel(drawer().quoteCount, "quote")}</span>
        <span>{countLabel(drawer().draftCount, "draft")}</span>
        <span>{countLabel(drawer().sentProofCount, "sent proof")}</span>
      </div>
      <Show when={props.loading}>
        <p class="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/75 px-3 py-2 text-sm text-emerald-950" role="status" aria-live="polite">
          Loading saved thread...
        </p>
      </Show>
      <Show when={props.error}>
        {(error) => (
          <p class="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950" role="alert" aria-live="assertive">
            {error()}
          </p>
        )}
      </Show>
      <Show when={!props.loading && !props.error && props.messages.length === 0}>
        <p class="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          No saved messages were returned for this thread yet.
        </p>
      </Show>
      <div class="mt-3 space-y-2">
        <For each={props.messages}>
          {(message) => (
            <article class="min-w-0 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="break-words text-sm font-semibold text-emerald-950">
                  {message.title}
                </p>
                <span class="rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-emerald-950">
                  {message.timestampLabel}
                </span>
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-2">
                <p class="break-words text-xs text-emerald-900/65">
                  {message.typeLabel}
                </p>
                <Show when={message.proofKind === "draft" && message.deliveryReady === true}>
                  <span class="rounded-full border border-emerald-100 bg-white/80 px-2 py-1 text-xs font-semibold text-emerald-950">
                    Delivery-ready draft
                  </span>
                </Show>
                <Show when={message.proofKind === "draft" && message.deliveryReady === false}>
                  <span class="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-950">
                    Incomplete draft{message.deliveryMissingFields.length > 0 ? `: ${message.deliveryMissingFields.join(", ")}` : ""}
                  </span>
                </Show>
              </div>
              <Show when={message.isSentProof}>
                <dl class="mt-2 grid gap-1 rounded-lg border border-emerald-100 bg-white/75 p-2 text-xs text-emerald-950 sm:grid-cols-2">
                  <Show when={message.providerLabel}>
                    {(provider) => <div><dt class="font-semibold">Provider</dt><dd class="break-words">{provider()}</dd></div>}
                  </Show>
                  <Show when={message.receiptId}>
                    {(receiptId) => <div><dt class="font-semibold">{message.receiptIdLabel ?? "Receipt"}</dt><dd class="break-words">{receiptId()}</dd></div>}
                  </Show>
                  <Show when={message.clientMessageId}>
                    {(clientMessageId) => <div><dt class="font-semibold">Local send</dt><dd class="break-words">{clientMessageId()}</dd></div>}
                  </Show>
                  <Show when={message.sentToLabel}>
                    {(sentTo) => <div><dt class="font-semibold">To</dt><dd class="break-words">{sentTo()}</dd></div>}
                  </Show>
                  <Show when={message.subjectLabel}>
                    {(subject) => <div><dt class="font-semibold">Subject</dt><dd class="break-words">{subject()}</dd></div>}
                  </Show>
                  <Show when={message.inReplyToLabel}>
                    {(inReplyTo) => <div><dt class="font-semibold">Reply link</dt><dd class="break-words">{inReplyTo()}</dd></div>}
                  </Show>
                  <Show when={message.deliveryReferencesLabel}>
                    {(references) => <div class="sm:col-span-2"><dt class="font-semibold">Delivery references</dt><dd class="break-words">{references()}</dd></div>}
                  </Show>
                </dl>
              </Show>
              <p class="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words text-sm leading-6 text-emerald-900/80">
                {message.body}
              </p>
            </article>
          )}
        </For>
      </div>
    </section>
  );
}
