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
      });
      setSession(await getVendorSpecialSession());
      setNotice("The availability was updated. Couples will only see current, confirmed details.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The availability could not be updated.");
    } finally {
      setBusy(false);
    }
  };

  return <main class="min-h-screen bg-wedding-surface px-4 py-6 text-wedding-text sm:px-6">
    <section class="mx-auto w-full max-w-3xl rounded-xl bg-white p-5 shadow-sm sm:p-7" aria-labelledby="special-management-title">
      <p class="text-xs font-bold uppercase tracking-[0.16em] text-wedding-accent">Private vendor link</p>
      <h1 id="special-management-title" class="mt-2 text-2xl font-bold">Manage limited-date availability</h1>
      <p class="mt-2 text-sm text-wedding-muted">This link manages only the offer it was issued for. Availability remains indicative until you confirm it.</p>
      <Show when={busy() && !session()}><p class="mt-6" role="status">Opening your secure offer…</p></Show>
      <Show when={error()}><p class="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{error()}</p></Show>
      <Show when={notice()}><p class="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900" role="status">{notice()}</p></Show>
      <Show when={session()} keyed>{(current) => <div class="mt-6 space-y-5">
        <header class="rounded-xl border border-wedding-muted p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div><h2 class="text-xl font-bold">{current.offer.title}</h2><p class="mt-1 text-sm text-wedding-muted">{current.offer.summary}</p></div>
            <span class="rounded-full bg-wedding-surface px-3 py-1 text-sm font-semibold capitalize">{current.offer.publication_state}</span>
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
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
            <div class="mt-4 flex flex-wrap gap-2">
              <Show when={permitted("slot_reconfirm")}><button disabled={busy()} class="min-h-11 rounded-lg bg-wedding-accent px-4 font-bold text-white disabled:opacity-50" onClick={() => void run("slot_reconfirm", slot.revision, slot)}>Confirm available</button></Show>
              <Show when={permitted("slot_pause")}><button disabled={busy()} class="min-h-11 rounded-lg border border-wedding-muted px-4 font-semibold disabled:opacity-50" onClick={() => void run("slot_pause", slot.revision, slot)}>Pause date</button></Show>
              <Show when={permitted("slot_mark_booked")}><button disabled={busy()} class="min-h-11 rounded-lg border border-wedding-muted px-4 font-semibold disabled:opacity-50" onClick={() => confirm("Mark this date booked? It will no longer appear available.") && void run("slot_mark_booked", slot.revision, slot)}>Mark booked</button></Show>
              <Show when={permitted("slot_withdraw")}><button disabled={busy()} class="min-h-11 rounded-lg border border-red-300 px-4 font-semibold text-red-800 disabled:opacity-50" onClick={() => confirm("Withdraw this available date?") && void run("slot_withdraw", slot.revision, slot)}>Withdraw date</button></Show>
            </div>
          </article>}</For>
        </div>
      </div>}</Show>
    </section>
  </main>;
}
