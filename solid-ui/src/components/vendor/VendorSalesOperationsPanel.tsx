import { createMemo, createResource, createSignal, For, Show } from "solid-js";

import {
  getVendorOperations,
  recordVendorSalesStage,
  type VendorOperationsSlot,
  type VendorSalesJourney,
  type VendorSalesStage,
} from "@/lib/vendorPortalApi";

const stages: Array<[VendorSalesStage, string]> = [
  ["enquiry_received", "Enquiry received"],
  ["qualification", "Qualification"],
  ["availability_check", "Availability check"],
  ["tailored_quote", "Tailored quote delivered"],
  ["tour_booking", "Tour booking"],
  ["tour_completed", "Tour completed"],
  ["follow_up", "Follow-up"],
  ["hold", "Temporary hold"],
  ["contract", "Contract"],
  ["deposit", "Deposit"],
  ["booked", "Booked"],
  ["declined", "Declined"],
  ["lost", "Lost"],
];

const stageLabel = (stage: string) => stages.find(([value]) => value === stage)?.[1] ?? stage.replaceAll("_", " ");
const money = (cents?: number | null) => cents == null ? null : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(cents / 100);
const localInput = (value?: string | null) => value ? new Date(value).toISOString().slice(0, 16) : "";
const isoOrNull = (value: string) => value ? new Date(value).toISOString() : null;
const stateStyle: Record<string, string> = {
  available: "bg-emerald-100 text-emerald-900",
  enquiry_received: "bg-sky-100 text-sky-900",
  provisional_hold: "bg-amber-100 text-amber-950",
  booked: "bg-teal-700 text-white",
  price_review: "bg-fuchsia-100 text-fuchsia-950",
  paused: "bg-slate-200 text-slate-800",
  withdrawn: "bg-slate-100 text-slate-500",
  stale: "bg-rose-100 text-rose-900",
};

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cursor <= end && days.length < 42) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function JourneyCard(props: { journey: VendorSalesJourney; canManage: boolean; busy: boolean; onSave: (journey: VendorSalesJourney, stage: VendorSalesStage, nextAction: string) => void }) {
  const [stage, setStage] = createSignal(props.journey.current_stage);
  const [nextAction, setNextAction] = createSignal(localInput(props.journey.next_action_at));
  return <article class="rounded-xl border border-wedding-muted bg-white p-4 print:break-inside-avoid">
    <div class="flex flex-wrap items-start justify-between gap-3"><div><h3 class="font-semibold">{props.journey.customer_label}</h3><p class="mt-1 text-xs text-wedding-muted">Last activity {new Date(props.journey.last_activity_at).toLocaleString("en-AU")} · {props.journey.enquiry_count} received · {props.journey.response_count} sent</p></div><span class="rounded-full bg-wedding-surface px-3 py-1 text-xs font-bold capitalize">{stageLabel(props.journey.current_stage)}</span></div>
    <div class="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
      <label class="text-xs font-semibold">Current sales state<select disabled={!props.canManage || props.busy} class="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal" value={stage()} onChange={(event) => setStage(event.currentTarget.value as VendorSalesStage)}><For each={stages}>{([value, label]) => <option value={value}>{label}</option>}</For></select></label>
      <label class="text-xs font-semibold">Next action due<input disabled={!props.canManage || props.busy} type="datetime-local" class="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal" value={nextAction()} onInput={(event) => setNextAction(event.currentTarget.value)} /></label>
      <button type="button" disabled={!props.canManage || props.busy} class="min-h-11 rounded-lg bg-wedding-accent px-4 text-sm font-bold text-white disabled:opacity-50" onClick={() => props.onSave(props.journey, stage(), nextAction())}>Save state</button>
    </div>
    <details class="mt-3 rounded-lg bg-wedding-surface p-3"><summary class="cursor-pointer text-sm font-semibold">Response and stage history by date</summary><ol class="mt-3 space-y-2"><For each={props.journey.history} fallback={<li class="text-sm text-wedding-muted">No dated history is available.</li>}>{(event) => <li class="border-l-2 border-wedding-accent pl-3 text-sm"><p class="font-semibold">{event.stage ? stageLabel(event.stage) : event.kind === "response_sent" ? "Response sent" : "Enquiry received"}</p><p class="text-xs text-wedding-muted">{new Date(event.occurred_at).toLocaleString("en-AU")}{event.delivered ? " · delivered" : ""}{event.acknowledged ? " · acknowledged" : ""}</p></li>}</For></ol></details>
  </article>;
}

export function VendorSalesOperationsPanel(props: { vendorSlug: string }) {
  const now = new Date();
  const defaultFrom = now.toISOString().slice(0, 10);
  const later = new Date(now); later.setDate(later.getDate() + 35);
  const [from, setFrom] = createSignal(defaultFrom);
  const [to, setTo] = createSignal(later.toISOString().slice(0, 10));
  const [query, setQuery] = createSignal({ slug: props.vendorSlug, from: from(), to: to() });
  const [operations, { refetch }] = createResource(query, (value) => getVendorOperations(value.slug, value.from, value.to));
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const canManage = createMemo(() => Boolean(operations()?.vendor.owner || ["manager", "enquiry_manager"].includes(operations()?.vendor.role ?? "")));
  const calendarDays = createMemo(() => operations() ? daysBetween(operations()!.calendar.from, operations()!.calendar.to) : []);
  const slotByResourceDate = createMemo(() => {
    const map = new Map<string, VendorOperationsSlot>();
    for (const slot of operations()?.calendar.slots ?? []) map.set(`${slot.resource_id ?? ""}:${slot.local_date}`, slot);
    return map;
  });
  const saveStage = async (journey: VendorSalesJourney, stage: VendorSalesStage, nextAction: string) => {
    if (busy()) return;
    setBusy(true); setNotice("");
    try {
      await recordVendorSalesStage({ vendorSlug: props.vendorSlug, threadRef: journey.thread_ref, stage, nextActionAt: isoOrNull(nextAction), expectedRevision: journey.revision });
      await refetch(); setNotice("Customer journey updated. The dated history and exceptions now use this state.");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "The customer journey could not be updated."); }
    finally { setBusy(false); }
  };
  const applyRange = () => setQuery({ slug: props.vendorSlug, from: from(), to: to() });

  return <div class="vendor-sales-operations grid gap-5 print:block">
    <section class="rounded-xl border border-wedding-muted bg-white p-5 shadow-sm print:border-0 print:shadow-none" aria-labelledby="vendor-sales-summary-title">
      <div class="flex flex-wrap items-start justify-between gap-3"><div><p class="text-xs font-bold uppercase tracking-[0.16em] text-wedding-accent">Vendor records</p><h2 id="vendor-sales-summary-title" class="mt-1 text-xl font-semibold">Sales journey and totals at a glance</h2><p class="mt-1 text-sm leading-6 text-wedding-muted">One dated view of enquiry traffic, responses and non-linear sales progress. Message and quote contents remain in their original encrypted records.</p></div><button type="button" class="min-h-11 rounded-lg border border-wedding-accent px-4 font-bold text-wedding-accent print:hidden" onClick={() => window.print()}>Print summary</button></div>
      <Show when={operations.loading}><p class="mt-4 text-sm" role="status">Preparing vendor records…</p></Show>
      <Show when={operations.error}><p class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">Vendor records could not be loaded. Refresh and try again.</p></Show>
      <Show when={operations()}>{(data) => <>
        <p class="mt-3 text-xs text-wedding-muted">90-day totals · generated {new Date(data().generated_at).toLocaleString("en-AU")}</p>
        <dl class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-6"><For each={[["Enquiries", data().summary.enquiries], ["Responses", data().summary.responses], ["Quotes delivered", data().summary.quotes_delivered], ["Tours booked", data().summary.tours_booked], ["Tours completed", data().summary.tours_completed], ["Holds", data().summary.holds], ["Contracts", data().summary.contracts], ["Deposits", data().summary.deposits], ["Bookings", data().summary.bookings]] as Array<[string, number]>}>{([label, value]) => <div class="rounded-lg bg-wedding-surface p-3"><dt class="text-xs font-semibold uppercase text-wedding-muted">{label}</dt><dd class="mt-1 text-2xl font-bold">{value}</dd></div>}</For></dl>
        <p class="mt-3 text-sm"><strong>Average first response:</strong> {data().summary.average_response_minutes == null ? "Not enough completed response pairs" : `${data().summary.average_response_minutes} minutes`}</p>
        <div class="mt-4 overflow-x-auto"><table class="min-w-full text-left text-sm"><caption class="pb-2 text-left font-semibold">12-week enquiry and response trend</caption><thead><tr class="border-b"><th class="p-2">Week</th><th class="p-2">Enquiries</th><th class="p-2">Responses</th><th class="p-2">Response coverage</th></tr></thead><tbody><For each={data().trends} fallback={<tr><td class="p-3 text-wedding-muted" colSpan={4}>No trend data yet.</td></tr>}>{(row) => <tr class="border-b"><td class="p-2">{new Date(`${row.week_start}T12:00:00`).toLocaleDateString("en-AU")}</td><td class="p-2">{row.enquiries}</td><td class="p-2">{row.responses}</td><td class="p-2"><div class="h-2 min-w-24 overflow-hidden rounded-full bg-slate-100"><div class="h-full bg-wedding-accent" style={{ width: `${Math.min(100, row.enquiries ? row.responses / row.enquiries * 100 : 0)}%` }} /></div></td></tr>}</For></tbody></table></div>
      </>}</Show>
    </section>

    <Show when={(operations()?.exceptions.length ?? 0) > 0}><section class="rounded-xl border border-amber-300 bg-amber-50 p-5 print:break-inside-avoid" aria-labelledby="vendor-exceptions-title"><h2 id="vendor-exceptions-title" class="text-lg font-semibold text-amber-950">Needs attention</h2><p class="mt-1 text-sm text-amber-900">Automatically escalated from unanswered enquiries, overdue next actions, expiring holds and approaching price reviews.</p><ul class="mt-3 grid gap-2"><For each={operations()?.exceptions}>{(item) => <li class="rounded-lg bg-white p-3 text-sm"><strong>{item.label}</strong><span class="block text-xs text-wedding-muted">{item.resource_name ? `${item.resource_name} · ` : ""}{new Date(item.due_at).toLocaleString("en-AU")}</span></li>}</For></ul></section></Show>

    <section class="rounded-xl border border-wedding-muted bg-wedding-surface p-5 print:break-before-page" aria-labelledby="vendor-customer-journeys-title"><h2 id="vendor-customer-journeys-title" class="text-xl font-semibold">Customer journeys</h2><p class="mt-1 text-sm leading-6 text-wedding-muted">Stages can move forward, backward or repeat. Saving a stage records who changed it and when; it does not send a message, accept a contract or move money.</p><Show when={!canManage()}><p class="mt-3 rounded-lg bg-white p-3 text-sm">Your portal role can view these records but cannot change sales state.</p></Show><div class="mt-4 grid gap-3"><For each={operations()?.journeys ?? []} fallback={<p class="rounded-lg bg-white p-4 text-sm">No customer enquiry history is available yet.</p>}>{(journey) => <JourneyCard journey={journey} canManage={canManage()} busy={busy()} onSave={saveStage} />}</For></div></section>

    <section class="rounded-xl border border-wedding-muted bg-white p-5 shadow-sm print:break-before-page" aria-labelledby="vendor-resource-calendar-title"><div class="flex flex-wrap items-start justify-between gap-3"><div><h2 id="vendor-resource-calendar-title" class="text-xl font-semibold">Space availability calendar</h2><p class="mt-1 text-sm leading-6 text-wedding-muted">Room-level evidence from the same availability used by Limited Specials. Unknown dates remain blank; they are not treated as unavailable.</p></div><div class="flex flex-wrap items-end gap-2 print:hidden"><label class="text-xs font-semibold">From<input type="date" class="mt-1 min-h-10 rounded-lg border px-2 font-normal" value={from()} onInput={(event) => setFrom(event.currentTarget.value)} /></label><label class="text-xs font-semibold">To<input type="date" class="mt-1 min-h-10 rounded-lg border px-2 font-normal" value={to()} onInput={(event) => setTo(event.currentTarget.value)} /></label><button type="button" class="min-h-10 rounded-lg border border-wedding-accent px-3 text-sm font-bold" onClick={applyRange}>Apply</button></div></div>
      <div class="mt-3 flex flex-wrap gap-2 text-xs"><For each={[["available", "Open"], ["provisional_hold", "Tentative hold"], ["booked", "Booked"], ["price_review", "Price review"], ["enquiry_received", "Enquiry received"]]}>{([state, label]) => <span class={`rounded-full px-2 py-1 ${stateStyle[state]}`}>{label}</span>}</For></div>
      <div class="mt-4 overflow-x-auto"><table class="border-separate border-spacing-1 text-center text-xs"><thead><tr><th class="sticky left-0 z-10 min-w-36 bg-white p-2 text-left">Space</th><For each={calendarDays()}>{(day) => <th class="min-w-12 p-1"><span class="block">{new Date(`${day}T12:00:00`).toLocaleDateString("en-AU", { weekday: "short" })}</span>{new Date(`${day}T12:00:00`).getDate()}</th>}</For></tr></thead><tbody><For each={operations()?.calendar.resources ?? []} fallback={<tr><td class="p-3 text-left text-wedding-muted">Add a named room or resource first.</td></tr>}>{(resource) => <tr><th class="sticky left-0 z-10 bg-white p-2 text-left font-semibold">{resource.name}</th><For each={calendarDays()}>{(day) => { const slot = () => slotByResourceDate().get(`${resource.resource_id}:${day}`); return <td class="p-0"><Show when={slot()} fallback={<span class="block h-9 w-11 rounded bg-slate-50" title="Unknown — no availability evidence" />} >{(item) => <span class={`block h-9 w-11 rounded px-1 py-2 font-bold ${stateStyle[item().state] ?? "bg-slate-100"}`} title={`${stageLabel(item().state)}${money(item().minimum_spend_cents) ? ` · minimum ${money(item().minimum_spend_cents)}` : ""}`}>{item().state === "booked" ? "B" : item().state === "provisional_hold" ? "H" : item().state === "price_review" ? "$" : item().state === "available" ? "O" : "•"}</span>}</Show></td>; }}</For></tr>}</For></tbody></table></div>
      <p class="mt-3 text-xs leading-5 text-wedding-muted">O = open, H = tentative hold, B = confirmed booking, $ = set aside for price review. Availability remains dated evidence and is subject to vendor confirmation.</p>
    </section>
    <Show when={notice()}><p class="rounded-lg bg-wedding-surface p-3 text-sm" role="status">{notice()}</p></Show>
  </div>;
}
