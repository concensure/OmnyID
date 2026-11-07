import { createResource, createSignal, For, Show } from "solid-js";

import {
  commandClaimedVendorOffer,
  commandClaimedVendorSlot,
  createClaimedVendorSpecialManagementLink,
  createClaimedVendorSpecial,
  editClaimedVendorSpecial,
  listClaimedVendorSpecials,
  type VendorSpecialOffer,
  type VendorSpecialSlot,
  type VendorSpecialManagementLink,
} from "@/lib/vendorSpecialsApi";

const dollars = (value: string): number | null => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
};

export function VendorSpecialOffersPanel(props: { vendorSlug: string }) {
  const [offers, { refetch }] = createResource(() => props.vendorSlug, (vendorSlug) => listClaimedVendorSpecials(vendorSlug));
  const [showForm, setShowForm] = createSignal(false);
  const [editing, setEditing] = createSignal<{ offer: VendorSpecialOffer; slot: VendorSpecialSlot } | null>(null);
  const [title, setTitle] = createSignal("");
  const [summary, setSummary] = createSignal("");
  const [date, setDate] = createSignal("");
  const [capacity, setCapacity] = createSignal("");
  const [minimumSpend, setMinimumSpend] = createSignal("");
  const [perHead, setPerHead] = createSignal("");
  const [inclusions, setInclusions] = createSignal("");
  const [conditions, setConditions] = createSignal("");
  const [mandatoryChargesKnown, setMandatoryChargesKnown] = createSignal(false);
  const [managementLink, setManagementLink] = createSignal<VendorSpecialManagementLink | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal("");

  const createOffer = async () => {
    if (!title().trim() || !summary().trim() || !date() || busy()) return;
    setBusy(true); setNotice("");
    try {
      const values = {
        vendorSlug: props.vendorSlug, title: title().trim(), summary: summary().trim(), date: date(),
        maximumCapacity: capacity() ? Number(capacity()) : null,
        minimumSpendCents: minimumSpend() ? dollars(minimumSpend()) : null,
        indicativePerHeadCents: perHead() ? dollars(perHead()) : null,
        inclusions: inclusions().split(/[,\n]/).map((value) => value.trim()).filter(Boolean).slice(0, 40),
        publicConditions: conditions().trim() || null,
        mandatoryChargesKnown: mandatoryChargesKnown(),
      };
      const current = editing();
      if (current) await editClaimedVendorSpecial({ ...values, ...current });
      else await createClaimedVendorSpecial(values);
      setShowForm(false); setEditing(null); setTitle(""); setSummary(""); setDate(""); setCapacity(""); setMinimumSpend(""); setPerHead(""); setInclusions(""); setConditions(""); setMandatoryChargesKnown(false);
      await refetch(); setNotice(current ? "Draft changes saved. Review them before publishing again." : "Draft saved. Preview it below, then publish when every date and price is accurate.");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "The special could not be saved."); }
    finally { setBusy(false); }
  };

  const startEdit = (offer: VendorSpecialOffer) => {
    const slot = offer.slots[0];
    if (!slot) return;
    setEditing({ offer, slot }); setTitle(offer.title); setSummary(offer.summary); setDate(slot.local_date);
    setCapacity(slot.maximum_capacity == null ? "" : String(slot.maximum_capacity));
    setMinimumSpend(slot.minimum_spend_cents == null ? "" : String(slot.minimum_spend_cents / 100));
    setPerHead(slot.indicative_per_head_cents == null ? "" : String(slot.indicative_per_head_cents / 100));
    setInclusions(slot.inclusions.join(", ")); setConditions(slot.public_conditions ?? ""); setShowForm(true);
  };

  const offerAction = async (offer: VendorSpecialOffer, action: "publish" | "pause" | "withdraw" | "reconfirm") => {
    if (busy() || ((action === "withdraw") && !confirm("Withdraw this offer and hide its dates from couples?"))) return;
    setBusy(true); setNotice("");
    try { await commandClaimedVendorOffer({ vendorSlug: props.vendorSlug, offerId: offer.offer_id, revision: offer.revision, action }); await refetch(); setNotice("Offer updated."); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "The offer could not be updated."); }
    finally { setBusy(false); }
  };

  const createManagementLink = async (offer: VendorSpecialOffer) => {
    if (busy() || !confirm("Create a new private management link? Any previous link for this offer will stop working.")) return;
    setBusy(true); setNotice(""); setManagementLink(null);
    try {
      const link = await createClaimedVendorSpecialManagementLink({ vendorSlug: props.vendorSlug, offerId: offer.offer_id });
      setManagementLink(link);
      setNotice("Private link created. Copy it now; OmnyID will not show its secret again after you leave this page.");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "The private management link could not be created."); }
    finally { setBusy(false); }
  };

  const slotAction = async (offer: VendorSpecialOffer, slot: VendorSpecialSlot, action: "place_hold" | "mark_booked" | "reopen_cancelled_booking" | "pause" | "withdraw" | "reconfirm") => {
    if (busy() || ((action === "mark_booked" || action === "withdraw") && !confirm(action === "mark_booked" ? "Mark this date booked and remove it from discovery?" : "Withdraw this date?"))) return;
    const reason = action === "reopen_cancelled_booking"
      ? prompt("Why is this booked date available again? This reason is retained in the audit history.", "Booking cancelled by the client")?.trim()
      : undefined;
    if (action === "reopen_cancelled_booking" && (!reason || reason.length < 10)) {
      setNotice("Add a short reason before reopening a booked date.");
      return;
    }
    setBusy(true); setNotice("");
    try {
      const holdExpiresAt = action === "place_hold" ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() : undefined;
      await commandClaimedVendorSlot({ vendorSlug: props.vendorSlug, offerId: offer.offer_id, slotId: slot.slot_id, revision: slot.revision, action, holdExpiresAt, reason });
      await refetch();
      setNotice(action === "place_hold" ? "The date is held for 48 hours and hidden from new discovery." : "Available date updated.");
    }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "The date could not be updated."); }
    finally { setBusy(false); }
  };

  return <section class="rounded-xl border border-wedding-muted bg-white p-5 shadow-sm" aria-labelledby="vendor-specials-title">
    <div class="flex flex-wrap items-start justify-between gap-3"><div><h2 id="vendor-specials-title" class="text-lg font-semibold">Limited-date specials</h2><p class="mt-1 text-sm text-wedding-muted">Publish quiet dates with indicative terms. Couples see them only when the date is fresh and your business ranks in their top matches.</p></div><button type="button" class="min-h-11 rounded-lg bg-wedding-accent px-4 font-bold text-white" onClick={() => { if (showForm()) { setShowForm(false); setEditing(null); } else setShowForm(true); }}>{showForm() ? "Close form" : "Add available date"}</button></div>
    <Show when={showForm()}><div class="mt-4 grid gap-3 rounded-xl border border-wedding-muted bg-wedding-surface p-4 sm:grid-cols-2">
      <label class="text-sm font-semibold">Offer title<input class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" maxlength="160" value={title()} onInput={(event) => setTitle(event.currentTarget.value)} /></label>
      <label class="text-sm font-semibold">Available date<input class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" type="date" min={new Date().toISOString().slice(0, 10)} value={date()} onInput={(event) => setDate(event.currentTarget.value)} /></label>
      <label class="text-sm font-semibold sm:col-span-2">What is included and why this date is useful<textarea class="mt-1 w-full rounded-lg border bg-white p-3 font-normal" rows={3} maxlength="1200" value={summary()} onInput={(event) => setSummary(event.currentTarget.value)} /></label>
      <label class="text-sm font-semibold">Maximum capacity<input class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" type="number" min="1" max="5000" value={capacity()} onInput={(event) => setCapacity(event.currentTarget.value)} /></label>
      <label class="text-sm font-semibold">Minimum spend (AUD)<input class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" type="number" min="0" step="1" value={minimumSpend()} onInput={(event) => setMinimumSpend(event.currentTarget.value)} /></label>
      <label class="text-sm font-semibold">Indicative price per head (AUD)<input class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" type="number" min="0" step="1" value={perHead()} onInput={(event) => setPerHead(event.currentTarget.value)} /></label>
      <label class="text-sm font-semibold">Inclusions, comma separated<input class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" value={inclusions()} onInput={(event) => setInclusions(event.currentTarget.value)} /></label>
      <label class="text-sm font-semibold sm:col-span-2">Public conditions<input class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" maxlength="1200" value={conditions()} onInput={(event) => setConditions(event.currentTarget.value)} /></label>
      <label class="flex min-h-11 items-start gap-3 rounded-lg border border-wedding-muted bg-white p-3 text-sm font-semibold sm:col-span-2"><input class="mt-1 h-5 w-5" type="checkbox" checked={mandatoryChargesKnown()} onChange={(event) => setMandatoryChargesKnown(event.currentTarget.checked)} /><span>All mandatory charges are included in the figures above<span class="mt-1 block text-xs font-normal text-wedding-muted">Leave this unticked if levies, staffing, security, cleaning or other required charges are not yet confirmed. Couples will see that the total is incomplete.</span></span></label>
      <p class="text-xs leading-5 text-wedding-muted sm:col-span-2">Preview values are indicative and subject to your confirmation. Do not describe a saving unless you can support its reference price.</p>
      <button type="button" disabled={busy() || !title().trim() || !summary().trim() || !date() || (!minimumSpend() && !perHead())} class="min-h-11 rounded-lg bg-wedding-accent px-4 font-bold text-white disabled:opacity-50 sm:col-span-2" onClick={() => void createOffer()}>{busy() ? "Saving…" : editing() ? "Save draft changes" : "Save draft"}</button>
    </div></Show>
    <Show when={notice()}><p class="mt-3 rounded-lg bg-wedding-surface p-3 text-sm" role="status">{notice()}</p></Show>
    <Show when={managementLink()} keyed>{(link) => <div class="mt-3 rounded-xl border border-wedding-accent bg-wedding-surface p-3"><p class="text-sm font-semibold">Private management link</p><p class="mt-1 break-all text-xs text-wedding-muted">{link.management_url}</p><p class="mt-1 text-xs text-wedding-muted">Expires {new Date(link.expires_at).toLocaleString("en-AU")}. Anyone with this link can perform only the listed offer actions until it expires or is rotated.</p><button type="button" class="mt-2 min-h-11 rounded-lg border bg-white px-4 text-sm font-bold" onClick={() => void navigator.clipboard.writeText(link.management_url).then(() => setNotice("Private management link copied."))}>Copy private link</button></div>}</Show>
    <Show when={offers.loading}><p class="mt-4 text-sm" role="status">Loading available dates…</p></Show>
    <div class="mt-4 grid gap-3"><For each={offers()} fallback={<p class="rounded-lg bg-wedding-surface p-3 text-sm text-wedding-muted">No limited-date special has been added yet.</p>}>{(offer) => <article class="rounded-xl border border-wedding-muted p-4">
      <div class="flex flex-wrap justify-between gap-2"><div><h3 class="font-bold">{offer.title}</h3><p class="mt-1 text-sm text-wedding-muted">{offer.summary}</p></div><span class="h-fit rounded-full bg-wedding-surface px-3 py-1 text-xs font-bold capitalize">{offer.publication_state}</span></div>
      <div class="mt-3 flex flex-wrap gap-2"><Show when={offer.publication_state === "draft" || offer.publication_state === "paused"}><button disabled={busy()} class="min-h-11 rounded-lg border px-3 font-semibold" onClick={() => startEdit(offer)}>Edit draft</button><button disabled={busy()} class="min-h-11 rounded-lg bg-wedding-accent px-3 font-bold text-white" onClick={() => void offerAction(offer, offer.publication_state === "draft" ? "publish" : "reconfirm")}>{offer.publication_state === "draft" ? "Publish after review" : "Reconfirm offer"}</button></Show><Show when={offer.publication_state === "active"}><button disabled={busy()} class="min-h-11 rounded-lg border px-3 font-semibold" onClick={() => void offerAction(offer, "pause")}>Pause offer</button></Show><button disabled={busy()} class="min-h-11 rounded-lg border px-3 font-semibold" onClick={() => void createManagementLink(offer)}>Create staff link</button><button disabled={busy()} class="min-h-11 rounded-lg border border-red-300 px-3 font-semibold text-red-800" onClick={() => void offerAction(offer, "withdraw")}>Withdraw</button></div>
      <For each={offer.slots}>{(slot) => <div class="mt-3 rounded-lg bg-wedding-surface p-3">
        <div class="flex flex-wrap justify-between gap-2">
          <strong>{new Date(`${slot.local_date}T12:00:00`).toLocaleDateString("en-AU", { dateStyle: "long" })}</strong>
          <span class="capitalize">{slot.state.replaceAll("_", " ")}</span>
        </div>
        <p class="mt-1 text-xs text-wedding-muted">Capacity {slot.maximum_capacity ?? "not supplied"} · Minimum {slot.minimum_spend_cents == null ? "not supplied" : `$${Math.round(slot.minimum_spend_cents / 100).toLocaleString()}`} · {slot.indicative_per_head_cents == null ? "No per-head guide" : `$${Math.round(slot.indicative_per_head_cents / 100)} per head`}</p>
        <p class="mt-1 text-xs text-wedding-muted">Confirmed until {new Date(slot.confirmation_expires_at).toLocaleDateString("en-AU", { dateStyle: "medium" })}</p>
        <Show when={slot.operator_warning}><p class="mt-2 text-xs font-semibold text-amber-800">{slot.operator_warning}</p></Show>
        <div class="mt-2 flex flex-wrap gap-2">
          <Show when={!["booked", "withdrawn", "provisional_hold"].includes(slot.state)}><button disabled={busy()} class="min-h-11 rounded-lg border bg-white px-3 text-sm font-semibold" onClick={() => void slotAction(offer, slot, "reconfirm")}>Confirm available</button></Show>
          <Show when={slot.state === "enquiry_received"}><button disabled={busy()} class="min-h-11 rounded-lg border bg-white px-3 text-sm font-semibold" onClick={() => confirm("Hold this date for 48 hours? New couples will not see it during the hold.") && void slotAction(offer, slot, "place_hold")}>Hold 48 hours</button></Show>
          <Show when={!["booked", "withdrawn"].includes(slot.state)}><button disabled={busy()} class="min-h-11 rounded-lg border bg-white px-3 text-sm font-semibold" onClick={() => void slotAction(offer, slot, "pause")}>Pause</button><button disabled={busy()} class="min-h-11 rounded-lg border bg-white px-3 text-sm font-semibold" onClick={() => void slotAction(offer, slot, "mark_booked")}>Mark booked</button><button disabled={busy()} class="min-h-11 rounded-lg border border-red-300 bg-white px-3 text-sm font-semibold text-red-800" onClick={() => void slotAction(offer, slot, "withdraw")}>Withdraw date</button></Show>
          <Show when={slot.state === "booked"}><button disabled={busy()} class="min-h-11 rounded-lg border bg-white px-3 text-sm font-semibold" onClick={() => void slotAction(offer, slot, "reopen_cancelled_booking")}>Reopen cancelled booking</button></Show>
        </div>
      </div>}</For>
    </article>}</For></div>
  </section>;
}
