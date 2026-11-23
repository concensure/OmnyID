// @locs-version: 1.0
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import {
  fetchInlineEntityCurrencyConversion,
  fetchInlineEntityMapLocation,
  safeHref,
  type AfpAttachment,
  type AfpMessage,
} from "@/lib/api";
import { dispatchComposeQueryFragmentEvent } from "@/lib/composeQueryFragmentEvent";
import {
  buildInlineEntityObjectSearchQuery,
  inlineEntityKindLabel,
  type InlineEntityActionDetail,
} from "@/lib/inlineEntityActions";
import { openObjectSearch } from "@/lib/objectSearchNavigation";
import { INLINE_ENTITY_ICONS } from "@/lib/inlineEntityPresentation";
import { loadProductLinkPreference } from "@/lib/inlineEntityLocalState";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";

type ThreadSummary = {
  threadId: string;
  snippet: string;
  count: number;
  firstMessage: AfpMessage;
};

type AttachmentHit = {
  threadId: string;
  attachment: AfpAttachment;
  message: AfpMessage;
};

const CURRENCY_CODES = ["AUD", "USD", "EUR", "GBP", "JPY", "CAD", "NZD", "SGD"];
const CURRENCY_SYMBOLS: Record<string, string> = { "$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY" };
function guessRetailerPreference(): string {
  return loadProductLinkPreference();
}

function parseCurrency(text: string): { amount: number; code: string } | null {
  const symbolMatch = text.match(/([$€£¥])\s?(\d+(?:[.,]\d{1,2})?)/);
  if (symbolMatch) {
    return {
      amount: parseFloat(symbolMatch[2].replace(",", "")),
      code: CURRENCY_SYMBOLS[symbolMatch[1]] ?? "USD",
    };
  }
  const codeMatch = text.match(/\b([A-Z]{3})\s?(\d+(?:[.,]\d{1,2})?)\b/);
  if (codeMatch) {
    return {
      amount: parseFloat(codeMatch[2].replace(",", "")),
      code: codeMatch[1],
    };
  }
  return null;
}

function messagePlainText(message: AfpMessage): string {
  return JSON.stringify(decryptedDisplayContent(message) ?? {}).replaceAll('"', "");
}

function buildSnippet(message: AfpMessage, term: string): string {
  const text = messagePlainText(message);
  const lowered = text.toLowerCase();
  const needle = term.toLowerCase();
  const hit = lowered.indexOf(needle);
  if (hit < 0) return text.slice(0, 180);
  const start = Math.max(0, hit - 50);
  const end = Math.min(text.length, hit + needle.length + 90);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

function messageMatches(messages: AfpMessage[], term: string): AfpMessage[] {
  const lowered = term.toLowerCase();
  return messages.filter((message) => {
    const body = JSON.stringify(decryptedDisplayContent(message) ?? {}).toLowerCase();
    const attachments = JSON.stringify(message.attachments ?? []).toLowerCase();
    return body.includes(lowered) || attachments.includes(lowered) || message.thread_id.toLowerCase().includes(lowered);
  });
}

function summarizeThreads(messages: AfpMessage[], term: string): ThreadSummary[] {
  const grouped = new Map<string, ThreadSummary>();
  for (const message of messages) {
    const existing = grouped.get(message.thread_id);
    if (existing) {
      existing.count += 1;
      continue;
    }
    grouped.set(message.thread_id, {
      threadId: message.thread_id,
      snippet: buildSnippet(message, term),
      count: 1,
      firstMessage: message,
    });
  }
  return [...grouped.values()].slice(0, 8);
}

function attachmentMatches(messages: AfpMessage[], term: string): AttachmentHit[] {
  const lowered = term.toLowerCase();
  const hits: AttachmentHit[] = [];
  for (const message of messages) {
    for (const attachment of message.attachments ?? []) {
      if ((attachment.name ?? "").toLowerCase().includes(lowered)) {
        hits.push({ threadId: message.thread_id, attachment, message });
      }
    }
  }
  return hits.slice(0, 8);
}

function retailerSearchUrl(retailer: string, query: string): string {
  switch (retailer) {
    case "ebay":
      return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}`;
    case "google-shopping":
      return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}`;
    default:
      return `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;
  }
}

async function fetchMapLocation(query: string) {
  const location = await fetchInlineEntityMapLocation(query);
  const deltaLon = 0.08;
  const deltaLat = 0.05;
  return {
    label: location.label,
    lat: location.lat,
    lon: location.lon,
    embedUrl: `https://www.openstreetmap.org/export/embed.html?bbox=${location.lon - deltaLon}%2C${location.lat - deltaLat}%2C${location.lon + deltaLon}%2C${location.lat + deltaLat}&layer=mapnik&marker=${location.lat}%2C${location.lon}`,
    externalUrl: `https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lon}#map=13/${location.lat}/${location.lon}`,
  };
}

async function fetchCurrencyConversion({
  amount,
  from,
  to,
}: {
  amount: number;
  from: string;
  to: string;
}) {
  return fetchInlineEntityCurrencyConversion({ amount, from, to });
}

export function InlineEntityInspector(props: {
  entity: InlineEntityActionDetail;
  messages: AfpMessage[];
  onClose: () => void;
  onOpenThread: (threadId: string) => void;
  onNavigateView: (view: "calendar" | "note" | "threads") => void;
}) {
  const [currencyAmount, setCurrencyAmount] = createSignal(parseCurrency(props.entity.text)?.amount ?? 1);
  const [currencyFrom, setCurrencyFrom] = createSignal(parseCurrency(props.entity.text)?.code ?? "USD");
  const [currencyTo, setCurrencyTo] = createSignal("AUD");

  const title = () => props.entity.value ?? props.entity.text;
  const relatedMessages = createMemo(() => messageMatches(props.messages, title()));
  const relatedThreads = createMemo(() => summarizeThreads(relatedMessages(), title()));
  const matchingAttachments = createMemo(() => attachmentMatches(props.messages, title()));
  const retailerPreference = createMemo(() => guessRetailerPreference());

  const [mapData, { refetch: refetchMapData }] = createResource(
    () =>
      ["place", "city", "landmark", "zip"].includes(props.entity.kind)
        ? title()
        : null,
    async (query) => fetchMapLocation(query),
  );
  const [currencyData, { refetch: refetchCurrencyData }] = createResource(
    () =>
      props.entity.kind === "currency"
        ? {
            amount: currencyAmount(),
            from: currencyFrom(),
            to: currencyTo(),
          }
        : null,
    async (args) => fetchCurrencyConversion(args),
  );

  const isContextEntity = createMemo(() =>
    ["person", "phone", "meeting", "ticket", "invoice", "file", "document"].includes(props.entity.kind),
  );
  const currencyResult = createMemo<{ result: number; date: string } | null>(() => {
    const data = currencyData();
    if (!data || typeof data.result !== "number") return null;
    return {
      result: data.result,
      date: data.date,
    };
  });

  const primaryOpenLabel = createMemo(() => {
    switch (props.entity.kind) {
      case "meeting":
        return "Open meeting context";
      case "ticket":
        return "Open ticket threads";
      case "invoice":
        return "Open invoice thread";
      case "file":
        return "Open file thread";
      case "document":
        return "Open document thread";
      case "person":
      case "phone":
        return "Open contact context";
      default:
        return "Open related thread";
    }
  });
  const entityObjectSearchQuery = createMemo(() => buildInlineEntityObjectSearchQuery(props.entity.kind, title()));

  function openEntityObjectRetrieval() {
    openObjectSearch({
      query: entityObjectSearchQuery(),
      focusThreadId: relatedThreads()[0]?.threadId ?? null,
      launchContext: {
        sourceLabel: "Inline entity",
        reason: `Related objects for ${title() || props.entity.kind}`,
      },
    });
    props.onClose();
  }

  return (
    <div class="fixed inset-0 z-[95] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm" onClick={props.onClose}>
      <div
        class="w-full max-w-3xl rounded-[28px] border border-white/40 bg-white/95 p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-on-surface-variant/55">
              {inlineEntityKindLabel(props.entity.kind)}
            </p>
            <h3 class="mt-1 flex items-center gap-2 text-lg font-semibold text-on-surface">
              <span>{INLINE_ENTITY_ICONS[props.entity.kind]}</span>
              <span>{title()}</span>
            </h3>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              onClick={openEntityObjectRetrieval}
              class="rounded-full border border-primary/20 bg-primary/8 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/14"
            >
              Related objects
            </button>
            <button
              type="button"
              onClick={props.onClose}
              class="rounded-full border border-white/30 bg-white/70 px-3 py-1.5 text-xs text-on-surface-variant transition hover:bg-white"
            >
              Close
            </button>
          </div>
        </div>

        <div class="mt-5 space-y-4">
          <Show when={props.entity.kind === "date"}>
            <div class="rounded-2xl border border-sky-200/70 bg-sky-50/70 p-4">
              <p class="text-sm text-sky-950">Open this in Calendar to create or edit an event around the selected date.</p>
              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="rounded-full bg-sky-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                  onClick={() => {
                    props.onNavigateView("calendar");
                    props.onClose();
                  }}
                >
                  Open calendar
                </button>
                <button
                  type="button"
                  class="rounded-full border border-sky-300/70 bg-white/80 px-4 py-1.5 text-xs font-medium text-sky-900 transition hover:bg-white"
                  onClick={() =>
                    dispatchComposeQueryFragmentEvent({
                      query: `Create a calendar event on ${title()}`,
                      submit: false,
                    })
                  }
                >
                  Draft event request
                </button>
              </div>
            </div>
          </Show>

          <Show when={["place", "city", "landmark", "zip"].includes(props.entity.kind)}>
            <div class="rounded-2xl border border-emerald-200/70 bg-emerald-50/55 p-4">
              <Show when={mapData.loading}>
                <p class="text-sm text-on-surface-variant">Resolving map location...</p>
              </Show>
              <Show when={mapData.error}>
                <div class="space-y-3">
                  <p class="text-sm text-rose-700">{String(mapData.error)}</p>
                  <button
                    type="button"
                    onClick={() => void refetchMapData()}
                    class="rounded-full border border-rose-300/70 bg-white/80 px-4 py-1.5 text-xs font-medium text-rose-900 transition hover:bg-white"
                  >
                    Retry map lookup
                  </button>
                </div>
              </Show>
              <Show when={mapData()}>
                {(map) => (
                  <div class="space-y-3">
                    <p class="text-sm text-on-surface">{map().label}</p>
                    <iframe
                      src={map().embedUrl}
                      class="h-64 w-full rounded-2xl border border-white/60 bg-white"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                    <a
                      href={safeHref(map().externalUrl)}
                      target="_blank"
                      rel="noreferrer noopener"
                      class="inline-flex rounded-full border border-emerald-300/70 bg-white/80 px-4 py-1.5 text-xs font-medium text-emerald-900 transition hover:bg-white"
                    >
                      Open full map
                    </a>
                  </div>
                )}
              </Show>
            </div>
          </Show>

          <Show when={props.entity.kind === "currency"}>
            <div class="rounded-2xl border border-emerald-200/70 bg-emerald-50/55 p-4">
              <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
                <label class="space-y-1">
                  <span class="text-xs font-medium text-on-surface">Amount</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={currencyAmount()}
                    onInput={(event) => setCurrencyAmount(Number(event.currentTarget.value))}
                    class="w-full rounded-xl border border-white/30 bg-white/85 px-3 py-2 text-sm text-on-surface outline-none"
                  />
                </label>
                <label class="space-y-1">
                  <span class="text-xs font-medium text-on-surface">From</span>
                  <select
                    value={currencyFrom()}
                    onChange={(event) => setCurrencyFrom(event.currentTarget.value)}
                    class="w-full rounded-xl border border-white/30 bg-white/85 px-3 py-2 text-sm text-on-surface outline-none"
                  >
                    <For each={CURRENCY_CODES}>{(code) => <option value={code}>{code}</option>}</For>
                  </select>
                </label>
                <label class="space-y-1">
                  <span class="text-xs font-medium text-on-surface">To</span>
                  <select
                    value={currencyTo()}
                    onChange={(event) => setCurrencyTo(event.currentTarget.value)}
                    class="w-full rounded-xl border border-white/30 bg-white/85 px-3 py-2 text-sm text-on-surface outline-none"
                  >
                    <For each={CURRENCY_CODES}>{(code) => <option value={code}>{code}</option>}</For>
                  </select>
                </label>
              </div>
              <Show when={currencyData.loading}>
                <p class="mt-3 text-sm text-on-surface-variant">Loading live exchange rate...</p>
              </Show>
              <Show when={currencyData.error}>
                <div class="mt-3 space-y-3">
                  <p class="text-sm text-rose-700">{String(currencyData.error)}</p>
                  <button
                    type="button"
                    onClick={() => void refetchCurrencyData()}
                    class="rounded-full border border-rose-300/70 bg-white/80 px-4 py-1.5 text-xs font-medium text-rose-900 transition hover:bg-white"
                  >
                    Retry rate lookup
                  </button>
                </div>
              </Show>
              <Show when={currencyResult()}>
                {(data) => {
                  const resolved = data()!;
                  return (
                    <div class="mt-3 rounded-xl border border-white/40 bg-white/85 px-4 py-3">
                      <p class="text-sm font-medium text-on-surface">
                        {currencyAmount().toFixed(2)} {currencyFrom()} = {resolved.result.toFixed(2)} {currencyTo()}
                      </p>
                      <p class="mt-1 text-xs text-on-surface-variant">Rate date: {resolved.date || "live"}</p>
                    </div>
                  );
                }}
              </Show>
              <Show when={!currencyData.loading && !currencyData.error && currencyData() && !currencyResult()}>
                <p class="mt-3 text-sm text-on-surface-variant">
                  No live exchange result is available for this currency pair right now.
                </p>
              </Show>
            </div>
          </Show>

          <Show when={props.entity.kind === "product"}>
            <div class="rounded-2xl border border-amber-200/70 bg-amber-50/55 p-4">
              <p class="text-sm text-on-surface">
                Open this product on your preferred retailer first. Current preference:{" "}
                <strong class="text-on-surface">{retailerPreference()}</strong>
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                <For each={["amazon", "ebay", "google-shopping"]}>
                  {(retailer) => (
                    <a
                      href={retailerSearchUrl(retailer, title())}
                      target="_blank"
                      rel="noreferrer noopener"
                      class={`rounded-full px-4 py-1.5 text-xs font-medium transition ${
                        retailer === retailerPreference()
                          ? "bg-amber-500 text-white"
                          : "border border-amber-300/70 bg-white/80 text-amber-900 hover:bg-white"
                      }`}
                    >
                      {retailer}
                    </a>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <Show when={props.entity.kind === "hashtag"}>
            <div class="rounded-2xl border border-violet-200/70 bg-violet-50/55 p-4">
              <p class="text-sm text-on-surface">Use this tag to jump into supertag-oriented notes and message search.</p>
              <div class="mt-3 flex gap-2">
                <button
                  type="button"
                  class="rounded-full bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                  onClick={() => {
                    props.onNavigateView("note");
                    props.onClose();
                  }}
                >
                  Open Notes
                </button>
                <button
                  type="button"
                  class="rounded-full border border-violet-300/70 bg-white/80 px-4 py-1.5 text-xs font-medium text-violet-900 transition hover:bg-white"
                  onClick={() =>
                    dispatchComposeQueryFragmentEvent({
                      query: `Find messages and notes tagged ${title()}`,
                      submit: true,
                    })
                  }
                >
                  Search this tag
                </button>
              </div>
            </div>
          </Show>

          <Show when={isContextEntity()}>
            <div class="rounded-2xl border border-white/30 bg-white/80 p-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-on-surface">
                    {primaryOpenLabel()}
                  </p>
                  <p class="mt-1 text-xs text-on-surface-variant">
                    {relatedThreads().length} related thread{relatedThreads().length === 1 ? "" : "s"} found in your current OmnyID snapshot.
                  </p>
                </div>
                <Show when={relatedThreads().length > 0}>
                  <button
                    type="button"
                    class="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                    onClick={() => {
                      props.onOpenThread(relatedThreads()[0].threadId);
                      props.onClose();
                    }}
                  >
                    {primaryOpenLabel()}
                  </button>
                </Show>
              </div>

              <Show when={props.entity.kind === "person" || props.entity.kind === "phone"}>
                <div class="mt-3 rounded-xl border border-violet-200/60 bg-violet-50/55 px-4 py-3">
                  <p class="text-sm font-medium text-violet-950">Contact context</p>
                  <p class="mt-1 text-xs leading-5 text-violet-900/75">
                    This view surfaces threads, messages, and attachments mentioning this person or phone number so the user can recover relationship history quickly.
                  </p>
                </div>
              </Show>

              <Show when={props.entity.kind === "meeting"}>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="rounded-full border border-sky-300/70 bg-sky-50/80 px-4 py-1.5 text-xs font-medium text-sky-900 transition hover:bg-sky-100/90"
                    onClick={() => {
                      props.onNavigateView("calendar");
                      props.onClose();
                    }}
                  >
                    Open calendar
                  </button>
                  <button
                    type="button"
                    class="rounded-full border border-white/30 bg-white/85 px-4 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white"
                    onClick={() =>
                      dispatchComposeQueryFragmentEvent({
                        query: `Find emails, notes, and meeting records for ${title()}`,
                        submit: true,
                      })
                    }
                  >
                    Search meeting materials
                  </button>
                </div>
              </Show>

              <Show when={props.entity.kind === "file" || props.entity.kind === "document"}>
                <Show when={matchingAttachments().length > 0}>
                  <div class="mt-3 space-y-2">
                    <p class="text-xs font-semibold text-on-surface">Matching attachments</p>
                    <For each={matchingAttachments()}>
                      {(hit) => (
                        <button
                          type="button"
                          onClick={() => {
                            props.onOpenThread(hit.threadId);
                            props.onClose();
                          }}
                          class="flex w-full items-center justify-between gap-3 rounded-xl border border-white/30 bg-white/85 px-4 py-3 text-left transition hover:bg-white"
                        >
                          <div class="min-w-0">
                            <p class="truncate text-sm font-medium text-on-surface">{hit.attachment.name}</p>
                            <p class="mt-1 text-xs text-on-surface-variant">{hit.threadId}</p>
                          </div>
                          <span class="text-xs text-primary">Open thread</span>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </Show>
            </div>
          </Show>

          <div class="rounded-2xl border border-white/30 bg-white/70 p-4">
            <p class="text-sm font-semibold text-on-surface">Related OmnyID threads</p>
            <Show
              when={relatedThreads().length > 0}
              fallback={<p class="mt-2 text-sm text-on-surface-variant">No related messages were found in the current dashboard snapshot.</p>}
            >
              <div class="mt-3 space-y-2">
                <For each={relatedThreads()}>
                  {(thread) => (
                    <button
                      type="button"
                      onClick={() => {
                        props.onOpenThread(thread.threadId);
                        props.onClose();
                      }}
                      class="flex w-full items-start justify-between gap-3 rounded-2xl border border-white/30 bg-white/85 px-4 py-3 text-left transition hover:bg-white"
                    >
                      <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                          <p class="truncate text-sm font-medium text-on-surface">{thread.threadId}</p>
                          <span class="rounded-full bg-white/70 px-2 py-0.5 text-[10px] text-on-surface-variant">
                            {thread.count} message{thread.count === 1 ? "" : "s"}
                          </span>
                        </div>
                        <p class="mt-1 line-clamp-2 text-xs text-on-surface-variant">{thread.snippet}</p>
                      </div>
                      <span class="shrink-0 text-xs text-primary">Open</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}

