import { createSignal, For, onMount, Show } from "solid-js";

import {
  commandVendorSpecial,
  exchangeVendorSpecialLink,
  getVendorSpecialSession,
  type VendorSpecialOperation,
  type VendorSpecialSession,
  type VendorSpecialSlot,
} from "@/lib/vendorSpecialsApi";

const csrfStorageKey = "omnyid.vendorSpecials.csrf";
const money = (cents: number | null, currency: string) => cents == null
  ? "Not provided"
  : new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
const dedupe = (operation: string, target: string) => `${operation}-${target}-${crypto.randomUUID()}`;
const cents = (value: string) => value.trim() && Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) : null;

function CapabilityOfferEditor(props: {
  session: VendorSpecialSession;
  busy: boolean;
  onSave: (input: Parameters<typeof commandVendorSpecial>[0]["edit"], slot: VendorSpecialSlot) => void;
}) {
  const slot = props.session.offer.slots[0];
  const [open, setOpen] = createSignal(false);
  const [title, setTitle] = createSignal(props.session.offer.title);
  const [summary, setSummary] = createSignal(props.session.offer.summary);
  const [date, setDate] = createSignal(slot?.local_date ?? "");
  const [capacity, setCapacity] = createSignal(slot?.maximum_capacity == null ? "" : String(slot.maximum_capacity));
  const [minimum, setMinimum] = createSignal(slot?.minimum_spend_cents == null ? "" : String(slot.minimum_spend_cents / 100));
  const [perHead, setPerHead] = createSignal(slot?.indicative_per_head_cents == null ? "" : String(slot.indicative_per_head_cents / 100));
  const [inclusions, setInclusions] = createSignal(slot?.inclusions.join(", ") ?? "");
  const [conditions, setConditions] = createSignal(slot?.public_conditions ?? "");
  if (!slot) return null;
  return <Show when={open()} fallback={<button type="button" class="min-h-11 rounded-lg border border-wedding-muted px-4 font-semibold" onClick={() => setOpen(true)}>Edit date and terms</button>}>
    <div class="mt-4 grid gap-3 rounded-xl border border-wedding-muted bg-wedding-surface p-4 sm:grid-cols-2">
      <label class="text-sm font-semibold">Offer title<input class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" value={title()} onInput={(event) => setTitle(event.currentTarget.value)} /></label>
      <label class="text-sm font-semibold">Available date<input type="date" min={new Date().toISOString().slice(0, 10)} class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" value={date()} onInput={(event) => setDate(event.currentTarget.value)} /></label>
      <label class="text-sm font-semibold sm:col-span-2">Summary<textarea rows={3} class="mt-1 w-full rounded-lg border bg-white p-3 font-normal" value={summary()} onInput={(event) => setSummary(event.currentTarget.value)} /></label>
      <label class="text-sm font-semibold">Maximum capacity<input type="number" min="1" max="5000" class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" value={capacity()} onInput={(event) => setCapacity(event.currentTarget.value)} /></label>
      <label class="text-sm font-semibold">Minimum spend (AUD)<input type="number" min="0" class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" value={minimum()} onInput={(event) => setMinimum(event.currentTarget.value)} /></label>
      <label class="text-sm font-semibold">Indicative per head (AUD)<input type="number" min="0" class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" value={perHead()} onInput={(event) => setPerHead(event.currentTarget.value)} /></label>
      <label class="text-sm font-semibold">Inclusions<input class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" value={inclusions()} onInput={(event) => setInclusions(event.currentTarget.value)} /></label>
      <label class="text-sm font-semibold sm:col-span-2">Public conditions<input class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" value={conditions()} onInput={(event) => setConditions(event.currentTarget.value)} /></label>
      <div class="flex gap-2 sm:col-span-2"><button type="button" class="min-h-11 flex-1 rounded-lg border bg-white font-semibold" onClick={() => setOpen(false)}>Cancel</button><button type="button" disabled={props.busy || !title().trim() || !summary().trim() || !date() || (!minimum() && !perHead())} class="min-h-11 flex-1 rounded-lg bg-wedding-accent font-bold text-white disabled:opacity-50" onClick={() => props.onSave({ title: title().trim(), summary: summary().trim(), slotRevision: slot.revision, localDate: date(), timezone: slot.timezone || "Australia/Sydney", startsAt: slot.starts_at, endsAt: slot.ends_at, spaceLabel: slot.space_label || null, sessionLabel: slot.session_label || null, maximumCapacity: capacity() ? Number(capacity()) : null, minimumSpendCents: cents(minimum()), indicativePerHeadCents: cents(perHead()), inclusions: inclusions().split(/[\n,]/).map((value) => value.trim()).filter(Boolean).slice(0, 40), publicConditions: conditions().trim() || null }, slot)}>Save changes</button></div>
    </div>
  </Show>;
}

export function VendorSpecialManagementFlow(props: { token: string }) {
  const [session, setSession] = createSignal<VendorSpecialSession | null>(null);
  const [csrfToken, setCsrfToken] = createSignal("");
  const [busy, setBusy] = createSignal(true);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      if (props.token) {
        const exchanged = await exchangeVendorSpecialLink(props.token);
        sessionStorage.setItem(csrfStorageKey, exchanged.csrf_token);
        setCsrfToken(exchanged.csrf_token);
        history.replaceState(null, "", `${location.pathname}${location.search}`);
      } else {
        setCsrfToken(sessionStorage.getItem(csrfStorageKey) ?? "");
      }
      setSession(await getVendorSpecialSession());
    } catch (reason) {
      if (!props.token) sessionStorage.removeItem(csrfStorageKey);
      setError(reason instanceof Error ? reason.message : "This management link is unavailable.");
    } finally {
      setBusy(false);
    }
  };

  onMount(() => void load());

  const permitted = (operation: VendorSpecialOperation) => session()?.allowed_operations.includes(operation) ?? false;
  const run = async (operation: VendorSpecialOperation, revision: number, slot?: VendorSpecialSlot) => {
    if (!csrfToken()) {
      setError("This secure session cannot make changes. Open the original management link again.");
      return;
    }
    const reason = operation === "slot_reopen_cancelled_booking"
      ? prompt("Why is this booked date available again? This reason is retained in the audit history.", "Booking cancelled by the client")?.trim()
      : undefined;
    if (operation === "slot_reopen_cancelled_booking" && (!reason || reason.length < 10)) {
      setError("Add a short reason before reopening a booked date.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await commandVendorSpecial({
        csrfToken: csrfToken(),
        operation,
        expectedRevision: revision,
        idempotencyKey: dedupe(operation, slot?.slot_id ?? session()?.offer.offer_id ?? "offer"),
        slotId: slot?.slot_id,
        holdExpiresAt: operation === "slot_place_hold" ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() : undefined,
        reason,
      });
      setSession(await getVendorSpecialSession());
      setNotice("The availability was updated. Couples will only see current, confirmed details.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The availability could not be updated.");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (edit: Parameters<typeof commandVendorSpecial>[0]["edit"], slot: VendorSpecialSlot) => {
    if (!edit || !csrfToken() || !session()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await commandVendorSpecial({ csrfToken: csrfToken(), operation: "offer_edit", expectedRevision: session()!.offer.revision, idempotencyKey: dedupe("offer-edit", slot.slot_id), slotId: slot.slot_id, edit });
      setSession(await getVendorSpecialSession()); setNotice("The date and indicative terms were updated. Review them before publishing.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The offer details could not be updated."); }
    finally { setBusy(false); }
  };

  return <main class="min-h-screen bg-wedding-surface px-4 py-6 text-wedding-text sm:px-6">
    <section class="mx-auto w-full max-w-3xl rounded-xl bg-white p-5 shadow-sm sm:p-7" aria-labelledby="special-management-title">
      <p class="text-xs font-bold uppercase tracking-[0.16em] text-wedding-accent">Private vendor link</p>
      <h1 id="special-management-title" class="mt-2 text-2xl font-bold">Manage limited-date availability</h1>
      <p class="mt-2 text-sm text-wedding-muted">This link manages only the offer it was issued for. Availability remains indicative until you confirm it.</p>
      <Show when={busy() && !session()}><p class="mt-6" role="status">Opening your secure offer…</p></Show>
      <Show when={error()}><p class="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{error()}</p></Show>
      <Show when={error()}><button type="button" class="mt-3 min-h-11 rounded-lg border border-wedding-muted bg-white px-4 text-sm font-semibold" onClick={() => { sessionStorage.removeItem(csrfStorageKey); location.reload(); }}>Return to vendor portal</button></Show>
      <Show when={notice()}><p class="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900" role="status">{notice()}</p></Show>
      <Show when={session()} keyed>{(current) => <div class="mt-6 space-y-5">
        <header class="rounded-xl border border-wedding-muted p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div><h2 class="text-xl font-bold">{current.offer.title}</h2><p class="mt-1 text-sm text-wedding-muted">{current.offer.summary}</p></div>
            <span class="rounded-full bg-wedding-surface px-3 py-1 text-sm font-semibold capitalize">{current.offer.publication_state}</span>
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            <Show when={permitted("offer_edit") && (current.offer.publication_state === "draft" || current.offer.publication_state === "paused")}><CapabilityOfferEditor session={current} busy={busy()} onSave={(edit, slot) => void saveEdit(edit, slot)} /></Show>
            <Show when={permitted("offer_publish")}><button disabled={busy()} class="min-h-11 rounded-lg bg-wedding-accent px-4 font-bold text-white disabled:opacity-50" onClick={() => void run("offer_publish", current.offer.revision)}>Publish offer</button></Show>
            <Show when={permitted("offer_pause")}><button disabled={busy()} class="min-h-11 rounded-lg border border-wedding-muted px-4 font-semibold disabled:opacity-50" onClick={() => void run("offer_pause", current.offer.revision)}>Pause offer</button></Show>
            <Show when={permitted("offer_reconfirm")}><button disabled={busy()} class="min-h-11 rounded-lg border border-wedding-muted px-4 font-semibold disabled:opacity-50" onClick={() => void run("offer_reconfirm", current.offer.revision)}>Reconfirm dates</button></Show>
            <Show when={permitted("offer_withdraw")}><button disabled={busy()} class="min-h-11 rounded-lg border border-red-300 px-4 font-semibold text-red-800 disabled:opacity-50" onClick={() => confirm("Withdraw this offer from couple discovery?") && void run("offer_withdraw", current.offer.revision)}>Withdraw offer</button></Show>
          </div>
        </header>
        <div class="space-y-3">
          <For each={current.offer.slots}>{(slot) => <article class="rounded-xl border border-wedding-muted p-4">
            <div class="flex flex-wrap items-start justify-between gap-3"><div><h3 class="font-bold">{new Date(`${slot.local_date}T12:00:00`).toLocaleDateString("en-AU", { dateStyle: "long" })}</h3><p class="text-sm text-wedding-muted">{[slot.space_label, slot.session_label].filter(Boolean).join(" · ") || "Date-wide offer"}</p></div><span class="text-sm font-semibold capitalize">{slot.state.replaceAll("_", " ")}</span></div>
            <dl class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt class="text-wedding-muted">Capacity</dt><dd class="font-semibold">{slot.maximum_capacity ?? "Not provided"}</dd></div>
              <div><dt class="text-wedding-muted">Minimum spend</dt><dd class="font-semibold">{money(slot.minimum_spend_cents, current.offer.currency)}</dd></div>
              <div><dt class="text-wedding-muted">Per head</dt><dd class="font-semibold">{money(slot.indicative_per_head_cents, current.offer.currency)}</dd></div>
              <div><dt class="text-wedding-muted">Inclusions</dt><dd class="font-semibold">{slot.inclusions.length || "None listed"}</dd></div>
            </dl>
            <Show when={slot.public_conditions}><p class="mt-3 text-sm">{slot.public_conditions}</p></Show>
            <p class="mt-2 text-xs text-wedding-muted">Confirmed until {new Date(slot.confirmation_expires_at).toLocaleDateString("en-AU", { dateStyle: "medium" })}</p>
            <div class="mt-4 flex flex-wrap gap-2">
              <Show when={permitted("slot_reconfirm") && !["booked", "provisional_hold"].includes(slot.state)}><button disabled={busy()} class="min-h-11 rounded-lg bg-wedding-accent px-4 font-bold text-white disabled:opacity-50" onClick={() => void run("slot_reconfirm", slot.revision, slot)}>Confirm available</button></Show>
              <Show when={permitted("slot_place_hold") && slot.state === "enquiry_received"}><button disabled={busy()} class="min-h-11 rounded-lg border border-wedding-muted px-4 font-semibold disabled:opacity-50" onClick={() => confirm("Hold this date for 48 hours? New couples will not see it during the hold.") && void run("slot_place_hold", slot.revision, slot)}>Hold 48 hours</button></Show>
              <Show when={permitted("slot_pause") && !["booked", "withdrawn"].includes(slot.state)}><button disabled={busy()} class="min-h-11 rounded-lg border border-wedding-muted px-4 font-semibold disabled:opacity-50" onClick={() => void run("slot_pause", slot.revision, slot)}>Pause date</button></Show>
              <Show when={permitted("slot_mark_booked") && !["booked", "withdrawn"].includes(slot.state)}><button disabled={busy()} class="min-h-11 rounded-lg border border-wedding-muted px-4 font-semibold disabled:opacity-50" onClick={() => confirm("Mark this date booked? It will no longer appear available.") && void run("slot_mark_booked", slot.revision, slot)}>Mark booked</button></Show>
              <Show when={permitted("slot_reopen_cancelled_booking") && slot.state === "booked"}><button disabled={busy()} class="min-h-11 rounded-lg border border-wedding-muted px-4 font-semibold disabled:opacity-50" onClick={() => void run("slot_reopen_cancelled_booking", slot.revision, slot)}>Reopen cancelled booking</button></Show>
              <Show when={permitted("slot_withdraw") && slot.state !== "booked"}><button disabled={busy()} class="min-h-11 rounded-lg border border-red-300 px-4 font-semibold text-red-800 disabled:opacity-50" onClick={() => confirm("Withdraw this available date?") && void run("slot_withdraw", slot.revision, slot)}>Withdraw date</button></Show>
            </div>
          </article>}</For>
        </div>
      </div>}</Show>
    </section>
  </main>;
}
