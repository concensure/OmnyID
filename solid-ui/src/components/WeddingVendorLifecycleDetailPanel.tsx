// @locs-version: 1.0
import { createMemo, createSignal, For, Show } from "solid-js";

import { WeddingDashboardIcon } from "@/components/WeddingDashboardIcons";
import { WeddingNormalizedQuoteSummary } from "@/components/WeddingNormalizedQuoteSummary";
import { WeddingQuoteEvidenceComparison } from "@/components/WeddingQuoteEvidenceComparison";
import { renderMarkdown } from "@/lib/markdownRenderer";
import type { AfpMessage } from "@/lib/api";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingVendorLifecycleRecord } from "@/lib/weddingVendorLifecycleState";
import {
  weddingVendorLifecycleBookingSummary,
  weddingVendorLifecycleMessageRows,
  weddingVendorQuoteArtifacts,
  weddingVendorTermsArtifacts,
} from "@/lib/weddingVendorLifecycleDetailState";

type DetailTab = "message" | "quote" | "booking";

function formatDate(value: string | number): string {
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function QuoteDocument(props: {
  artifact: WeddingWorkspaceArtifactPreview;
  onOpenArtifact: (artifactId: string) => void;
}) {
  const quote = () => props.artifact.preview?.kind === "quote" ? props.artifact.preview : null;
  return <article class="min-w-0 rounded-lg border border-wedding-border bg-wedding-page p-3">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="break-words text-sm font-bold text-wedding-ink">{props.artifact.title}</p>
        <p class="mt-1 text-xs text-wedding-ink/60">Saved {formatDate(props.artifact.createdAt)}</p>
      </div>
      <Show when={quote()}>{(item) => <span class="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-wedding-primary">{item().amountLabel || "Price not confirmed"}</span>}</Show>
    </div>
    <Show when={quote()}>{(item) => <div class="mt-3 grid gap-2 text-xs text-wedding-ink/75 sm:grid-cols-2">
      <p><span class="font-semibold text-wedding-ink">Package:</span> {item().packageLabel || "Not stated"}</p>
      <p><span class="font-semibold text-wedding-ink">Availability:</span> {item().availabilityLabel || "Not confirmed"}</p>
      <p><span class="font-semibold text-wedding-ink">Deposit:</span> {item().depositLabel || "Not stated"}</p>
      <p><span class="font-semibold text-wedding-ink">Valid until:</span> {item().validUntil || "Not stated"}</p>
    </div>}</Show>
    <Show when={quote()}>{(item) => <div class="mt-3"><WeddingNormalizedQuoteSummary quote={item()} compact onOpenSource={() => props.onOpenArtifact(props.artifact.artifactId)} /></div>}</Show>
    <div class="prose prose-sm mt-3 max-h-80 max-w-none overflow-y-auto break-words text-wedding-ink" innerHTML={renderMarkdown(props.artifact.bodyText || props.artifact.emptyBodyLabel)} />
    <div class="mt-3 flex flex-wrap gap-2">
      <button type="button" class="min-h-11 rounded-lg border border-wedding-secondary bg-white px-3 text-sm font-semibold text-wedding-secondary" onClick={() => props.onOpenArtifact(props.artifact.artifactId)}>Open in Documents</button>
      <Show when={quote()?.attachmentUrl}>{(url) => <a class="inline-flex min-h-11 items-center rounded-lg border border-wedding-border bg-white px-3 text-sm font-semibold text-wedding-ink" href={url()} target="_blank" rel="noreferrer">Open original quote</a>}</Show>
    </div>
  </article>;
}

export function WeddingVendorLifecycleDetailPanel(props: {
  vendor: WeddingVendorLifecycleRecord;
  messages: readonly AfpMessage[];
  artifacts: readonly WeddingWorkspaceArtifactPreview[];
  allArtifacts: readonly WeddingWorkspaceArtifactPreview[];
  imageUrl?: string | null;
  imageAlt?: string | null;
  weddingDate?: string | null;
  onOpenArtifact: (artifactId: string) => void;
}) {
  const [tab, setTab] = createSignal<DetailTab>("message");
  const [quotePickerOpen, setQuotePickerOpen] = createSignal(false);
  const [quoteSearch, setQuoteSearch] = createSignal("");
  const [selectedQuoteId, setSelectedQuoteId] = createSignal<string | null>(null);
  const [comparisonQuoteIds, setComparisonQuoteIds] = createSignal<string[]>([]);
  const messageRows = createMemo(() => weddingVendorLifecycleMessageRows(props.messages));
  const quoteArtifacts = createMemo(() => weddingVendorQuoteArtifacts(props.artifacts));
  const selectedQuote = createMemo(() => quoteArtifacts().find((item) => item.artifactId === selectedQuoteId()) ?? quoteArtifacts()[0] ?? null);
  const selectedQuotePreview = createMemo(() => {
    const preview = selectedQuote()?.preview;
    return preview?.kind === "quote" ? preview : null;
  });
  const otherQuotes = createMemo(() => {
    const query = quoteSearch().trim().toLowerCase();
    return weddingVendorQuoteArtifacts(props.allArtifacts).filter((artifact) => {
      if (quoteArtifacts().some((current) => current.artifactId === artifact.artifactId)) return false;
      const quote = artifact.preview?.kind === "quote" ? artifact.preview : null;
      return !query || `${artifact.title} ${quote?.vendorName ?? ""}`.toLowerCase().includes(query);
    });
  });
  const comparisonQuotes = createMemo(() => comparisonQuoteIds()
    .map((id) => weddingVendorQuoteArtifacts(props.allArtifacts).find((item) => item.artifactId === id))
    .filter((item): item is WeddingWorkspaceArtifactPreview => Boolean(item))
    .slice(0, 2));
  const comparisonArtifacts = createMemo(() => [selectedQuote(), ...comparisonQuotes()]
    .filter((item): item is WeddingWorkspaceArtifactPreview => Boolean(item))
    .slice(0, 3));
  function toggleComparisonQuote(artifactId: string) {
    setComparisonQuoteIds((current) => current.includes(artifactId)
      ? current.filter((id) => id !== artifactId)
      : [...current, artifactId].slice(-2));
  }
  const termsArtifacts = createMemo(() => weddingVendorTermsArtifacts(props.artifacts));
  const booking = createMemo(() => weddingVendorLifecycleBookingSummary(props.vendor));
  const tabs: ReadonlyArray<{ id: DetailTab; label: string }> = [
    { id: "message", label: "Message" },
    { id: "quote", label: "Quote" },
    { id: "booking", label: "Booking" },
  ];

  return <section class="min-w-0 overflow-hidden rounded-lg border border-wedding-border bg-white">
    <Show when={props.imageUrl} fallback={<div class="flex h-40 items-center justify-center bg-wedding-slate text-wedding-ink/55" aria-label={`No saved photo for ${props.vendor.vendorName}`}><WeddingDashboardIcon id="search" class="h-9 w-9" /></div>}>
      {(url) => <img class="h-48 w-full object-cover" src={url()} alt={props.imageAlt || `${props.vendor.vendorName} photo`} loading="lazy" decoding="async" />}
    </Show>
    <div class="grid grid-cols-3 border-b border-wedding-border" role="tablist" aria-label={`${props.vendor.vendorName} details`}>
      <For each={tabs}>{(item) => <button
        id={`vendor-${props.vendor.key}-${item.id}-tab`}
        type="button"
        role="tab"
        aria-selected={tab() === item.id}
        aria-controls={`vendor-${props.vendor.key}-${item.id}-panel`}
        class={`min-h-12 border-b-2 px-2 text-sm font-bold ${tab() === item.id ? "border-wedding-primary bg-wedding-page text-wedding-primary" : "border-transparent text-wedding-ink/65"}`}
        onClick={() => setTab(item.id)}
      >{item.label}</button>}</For>
    </div>
    <div class="p-3 sm:p-4">
      <div id={`vendor-${props.vendor.key}-message-panel`} role="tabpanel" aria-labelledby={`vendor-${props.vendor.key}-message-tab`} hidden={tab() !== "message"}>
        <Show when={messageRows().length > 0} fallback={<p class="rounded-lg bg-wedding-page p-3 text-sm leading-6 text-wedding-ink/70">No message has been sent yet. A prepared enquiry will appear here as a clearly labelled draft.</p>}>
          <div class="space-y-3"><For each={messageRows()}>{(message) => <article class={`rounded-lg border p-3 ${message.state === "draft" ? "border-amber-300 bg-amber-50" : "border-wedding-border bg-wedding-page"}`}>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class={`rounded-full px-2.5 py-1 text-xs font-bold ${message.state === "draft" ? "bg-amber-100 text-amber-900" : "bg-white text-wedding-primary"}`}>{message.stateLabel}</span>
              <span class="text-xs text-wedding-ink/55">{formatDate(message.timestamp)}</span>
            </div>
            <Show when={message.subject}><p class="mt-2 text-sm font-bold text-wedding-ink">{message.subject}</p></Show>
            <div class="prose prose-sm mt-2 max-w-none break-words text-wedding-ink" innerHTML={renderMarkdown(message.body)} />
          </article>}</For></div>
        </Show>
      </div>

      <div id={`vendor-${props.vendor.key}-quote-panel`} role="tabpanel" aria-labelledby={`vendor-${props.vendor.key}-quote-tab`} hidden={tab() !== "quote"}>
        <Show when={quoteArtifacts().length > 0} fallback={<p class="rounded-lg bg-wedding-page p-3 text-sm leading-6 text-wedding-ink/70">No quote has been received from this vendor yet.</p>}>
          <Show when={quoteArtifacts().length > 1}><label class="mb-3 block text-sm font-semibold text-wedding-ink">Quote document
            <select class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3" value={selectedQuote()?.artifactId ?? ""} onChange={(event) => setSelectedQuoteId(event.currentTarget.value)}>
              <For each={quoteArtifacts()}>{(artifact) => <option value={artifact.artifactId}>{artifact.title}</option>}</For>
            </select>
          </label></Show>
          <Show when={selectedQuote()}>{(artifact) => <QuoteDocument artifact={artifact()} onOpenArtifact={props.onOpenArtifact} />}</Show>
          <button type="button" class="mt-3 min-h-11 rounded-lg border border-wedding-secondary bg-white px-3 text-sm font-bold text-wedding-secondary" aria-expanded={quotePickerOpen()} onClick={() => setQuotePickerOpen((open) => !open)}>{quotePickerOpen() ? "Close quote picker" : "Add another vendor quote"}</button>
          <Show when={quotePickerOpen()}><div class="mt-3 rounded-lg border border-wedding-border bg-wedding-page p-3">
            <label class="block text-sm font-semibold text-wedding-ink">Find a received quote
              <input class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3" type="search" value={quoteSearch()} onInput={(event) => setQuoteSearch(event.currentTarget.value)} placeholder="Search vendor or quote title" />
            </label>
            <fieldset class="mt-3"><legend class="text-sm font-semibold text-wedding-ink">Quotes to compare <span class="font-normal text-wedding-ink/55">(up to two more)</span></legend>
              <div class="mt-2 grid gap-2"><For each={otherQuotes()}>{(artifact) => <label class="flex min-h-11 items-center gap-2 rounded-lg border border-wedding-border bg-white px-3 text-sm text-wedding-ink"><input type="checkbox" checked={comparisonQuoteIds().includes(artifact.artifactId)} onChange={() => toggleComparisonQuote(artifact.artifactId)} />{artifact.title}</label>}</For></div>
            </fieldset>
            <Show when={otherQuotes().length === 0}><p class="mt-2 text-xs text-wedding-ink/65">No other received quote matches this search.</p></Show>
          </div></Show>
          <WeddingQuoteEvidenceComparison artifacts={comparisonArtifacts()} onOpenArtifact={props.onOpenArtifact} />
        </Show>
      </div>

      <div id={`vendor-${props.vendor.key}-booking-panel`} role="tabpanel" aria-labelledby={`vendor-${props.vendor.key}-booking-tab`} hidden={tab() !== "booking"}>
        <div class="rounded-lg bg-wedding-page p-3">
          <p class="text-sm font-bold text-wedding-primary">{booking().statusLabel}</p>
          <p class="mt-1 text-sm leading-6 text-wedding-ink/70">{booking().detailLabel}</p>
          <dl class="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt class="font-semibold text-wedding-ink">Relevant date</dt><dd class="text-wedding-ink/70">{props.weddingDate || "Not recorded"}</dd></div>
            <div><dt class="font-semibold text-wedding-ink">Vendor</dt><dd class="text-wedding-ink/70">{props.vendor.vendorName}</dd></div>
            <Show when={selectedQuotePreview()}>{(quote) => <>
              <div><dt class="font-semibold text-wedding-ink">Accepted price evidence</dt><dd class="text-wedding-ink/70">{quote().amountLabel || "Not confirmed"}</dd></div>
              <div><dt class="font-semibold text-wedding-ink">Quote validity</dt><dd class="text-wedding-ink/70">{quote().validUntil || "Not stated"}</dd></div>
            </>}</Show>
          </dl>
        </div>
        <div class="mt-3">
          <p class="text-xs font-bold uppercase tracking-wide text-wedding-ink/60">Terms and conditions</p>
          <Show when={termsArtifacts().length > 0} fallback={<p class="mt-2 rounded-lg border border-wedding-border p-3 text-sm text-wedding-ink/65">No booking terms are attached yet. A quote alone does not confirm the booking.</p>}>
            <For each={termsArtifacts()}>{(artifact) => <article class="mt-2 rounded-lg border border-wedding-border p-3">
              <p class="text-sm font-bold text-wedding-ink">{artifact.title}</p>
              <div class="prose prose-sm mt-2 max-h-64 max-w-none overflow-y-auto break-words text-wedding-ink" innerHTML={renderMarkdown(artifact.bodyText || artifact.emptyBodyLabel)} />
              <button type="button" class="mt-2 min-h-11 rounded-lg border border-wedding-secondary bg-white px-3 text-sm font-semibold text-wedding-secondary" onClick={() => props.onOpenArtifact(artifact.artifactId)}>Open in Documents</button>
            </article>}</For>
          </Show>
        </div>
      </div>
    </div>
  </section>;
}
