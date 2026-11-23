import { createEffect, createResource, createSignal, For, onCleanup, Show } from "solid-js";

import { apiFetch } from "@/lib/api";
import type { WeddingVendorChoiceCardData } from "@/components/WeddingVendorChoiceCard";
import type { WeddingCelebrantConsultationDraftContext } from "@/lib/weddingCelebrantConsultationDraftState";

type PublicCelebrant = {
  vendor_slug: string;
  name: string;
  service_area: string;
  available_now: boolean;
  next_available_at: string | null;
  available_slots: string[];
};

type AvailabilityResponse = {
  timezone: string;
  consultation_minutes: number;
  phone_verification_configured: boolean;
  cards: PublicCelebrant[];
};

type ConsultationReceipt = {
  request_id: string;
  status: string;
  approval_state: string;
  scheduled_start: string | null;
  status_token?: string;
  celebrant_name?: string | null;
  accepted_at?: string | null;
};

const localTime = (value: string) => new Date(value).toLocaleString("en-AU", {
  weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney",
});

async function loadAvailability(slugs: string[]): Promise<AvailabilityResponse> {
  const responses = await Promise.all(slugs.map((slug) => apiFetch<AvailabilityResponse>(
    `/api/public/wedding/celebrant-consultations?vendor_slug=${encodeURIComponent(slug)}`,
  )));
  return {
    timezone: "Australia/Sydney",
    consultation_minutes: 10,
    phone_verification_configured: responses.every((response) => response.phone_verification_configured),
    cards: responses.flatMap((response) => response.cards),
  };
}

export function WeddingCelebrantConsultationShortlistPanel(props: {
  cards: WeddingVendorChoiceCardData[];
  requestedVendorSlug?: string | null;
  onPrepareDraft?: (card: WeddingVendorChoiceCardData, context: WeddingCelebrantConsultationDraftContext) => void;
}) {
  const celebrantCards = () => props.cards.slice(0, 3).filter((card) => /celebrant/i.test(card.category ?? "") && Boolean(card.vendorSlug));
  const slugs = () => celebrantCards().map((card) => card.vendorSlug!).sort();
  const [availability] = createResource(() => slugs().join("|"), async (value) => value ? loadAvailability(value.split("|")) : null);
  const [selectedSlug, setSelectedSlug] = createSignal("");
  const [selectedSlot, setSelectedSlot] = createSignal("");
  const [phone, setPhone] = createSignal("");
  const [verificationId, setVerificationId] = createSignal("");
  const [code, setCode] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const [receipt, setReceipt] = createSignal<ConsultationReceipt | null>(null);
  const [confirmedSlot, setConfirmedSlot] = createSignal("");
  let statusTimer: number | undefined;

  const stopStatusPolling = () => {
    if (statusTimer !== undefined) window.clearTimeout(statusTimer);
    statusTimer = undefined;
  };
  const pollRequestStatus = async (current: ConsultationReceipt) => {
    if (!current.status_token) return;
    try {
      const updated = await apiFetch<ConsultationReceipt>(`/api/public/wedding/celebrant-consultations/requests/${encodeURIComponent(current.request_id)}?token=${encodeURIComponent(current.status_token)}`);
      setReceipt({ ...current, ...updated, status_token: current.status_token });
      if (updated.status === "accepted") {
        setNotice(`${updated.celebrant_name || "The celebrant"} approved this consultation. It is now in your Calendar and a confirmation email is being delivered.`);
        return stopStatusPolling();
      }
      if (["passed", "expired", "cancelled", "connected", "not_connected"].includes(updated.status)) return stopStatusPolling();
    } catch {
      // A transient status failure must not discard the submitted request.
    }
    statusTimer = window.setTimeout(() => void pollRequestStatus(receipt() ?? current), 5000);
  };
  onCleanup(stopStatusPolling);

  createEffect(() => {
    const requested = props.requestedVendorSlug;
    const first = availability()?.cards.find((card) => card.vendor_slug === requested) ?? availability()?.cards[0];
    if (first && selectedSlug() !== first.vendor_slug && (requested || !selectedSlug())) setSelectedSlug(first.vendor_slug);
  });
  const selected = () => availability()?.cards.find((card) => card.vendor_slug === selectedSlug()) ?? null;
  createEffect(() => {
    const firstSlot = selected()?.available_slots[0] ?? "";
    if (!selected()?.available_slots.includes(selectedSlot())) setSelectedSlot(firstSlot);
    if (confirmedSlot() && confirmedSlot() !== selectedSlot()) setConfirmedSlot("");
  });

  const confirmSlotAndPrepareDraft = () => {
    const card = celebrantCards().find((item) => item.vendorSlug === selectedSlug());
    if (!card || !selectedSlot()) return;
    setConfirmedSlot(selectedSlot());
    setNotice("This time is confirmed for the draft. Review the message before sending or requesting the consultation.");
    props.onPrepareDraft?.(card, {
      vendorSlug: selectedSlug(),
      scheduledStart: selectedSlot(),
      timezone: "Australia/Sydney",
      consultationMinutes: 10,
    });
  };

  const startVerification = async () => {
    if (!phone().trim() || busy()) return;
    setBusy(true); setNotice("");
    try {
      const result = await apiFetch<{ verification_id: string }>("/api/public/wedding/celebrant-consultations/verify/start", {
        method: "POST", bodyJson: { phone: phone().trim() },
      });
      setVerificationId(result.verification_id);
      setNotice("Verification code sent. It expires in ten minutes.");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "The verification code could not be sent."); }
    finally { setBusy(false); }
  };

  const verifyAndRequest = async () => {
    if (!verificationId() || !code().trim() || !selectedSlot() || busy()) return;
    setBusy(true); setNotice("");
    try {
      const verified = await apiFetch<{ verification_token: string }>("/api/public/wedding/celebrant-consultations/verify/check", {
        method: "POST", bodyJson: { verification_id: verificationId(), code: code().trim() },
      });
      const result = await apiFetch<ConsultationReceipt>("/api/public/wedding/celebrant-consultations/requests", {
        method: "POST",
        bodyJson: {
          verification_id: verificationId(), verification_token: verified.verification_token,
          idempotency_key: `ranked-celebrant-${crypto.randomUUID()}`, vendor_slug: selectedSlug(), first_available: false,
          request_mode: "scheduled", intent: "prospective_client", topic: "finding_celebrant",
          location: null, wedding_date: null, scheduled_start: selectedSlot(),
        },
      });
      setReceipt(result);
      setNotice("Request sent. This time is awaiting the celebrant’s approval; it is not booked yet.");
      stopStatusPolling();
      statusTimer = window.setTimeout(() => void pollRequestStatus(result), 5000);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "The consultation request could not be sent."); }
    finally { setBusy(false); }
  };

  return <Show when={celebrantCards().length > 0 && Boolean(props.requestedVendorSlug)}>
    <section id="ranked-celebrant-consultation" class="mt-4 rounded-2xl border border-teal-200 bg-white p-4" aria-labelledby="ranked-celebrant-consultation-title">
      <p class="text-xs font-bold uppercase tracking-[0.14em] text-teal-800">Consultation times</p>
      <h3 id="ranked-celebrant-consultation-title" class="mt-1 text-lg font-semibold text-teal-950">Choose a 10-minute phone consultation first</h3>
      <p class="mt-1 text-sm leading-6 text-teal-900/75">These times belong only to the celebrant you selected. Confirm one to prepare an editable enquiry draft that includes it.</p>
      <Show when={availability.loading}><p class="mt-3 text-sm" role="status">Checking these celebrants’ current times…</p></Show>
      <Show when={availability.error}><p class="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="alert">Consultation availability could not be checked just now. The vendor comparison is unchanged.</p></Show>
      <Show when={availability()}>{(current) => <>
        <Show when={selected()}>{(card) => <div class="mt-4 grid gap-3 rounded-xl bg-teal-50/70 p-3 sm:grid-cols-2">
          <div class="text-sm"><strong class="block">{card().name}</strong><span class="mt-1 block text-xs text-teal-900/70">Wedding-date availability: {celebrantCards().find((item) => item.vendorSlug === card().vendor_slug)?.availabilityLabel ?? "Not checked"}</span></div>
          <label class="text-sm font-semibold">Consultation time<select class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" value={selectedSlot()} onChange={(event) => setSelectedSlot(event.currentTarget.value)}><For each={card().available_slots}>{(slot) => <option value={slot}>{localTime(slot)}</option>}</For></select></label>
          <Show when={card().available_slots.length > 0 && !confirmedSlot()} fallback={<Show when={card().available_slots.length === 0}><p class="sm:col-span-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This celebrant has not published a consultation time yet. Their wedding-date availability remains separate and unconfirmed.</p></Show>}>
            <button type="button" class="sm:col-span-2 min-h-11 rounded-lg bg-teal-800 px-4 font-bold text-white" onClick={confirmSlotAndPrepareDraft}>Confirm this time and prepare draft</button>
          </Show>
          <Show when={confirmedSlot() && !receipt()}><Show when={current().phone_verification_configured} fallback={<p class="sm:col-span-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Your draft is ready, but phone verification is not configured on this server yet. No consultation request can be submitted until that boundary is available.</p>}>
            <p class="sm:col-span-2 rounded-lg border border-teal-200 bg-white p-3 text-sm text-teal-950"><strong>Draft prepared for {localTime(confirmedSlot())}.</strong> Review and edit it in the celebrant card, then verify your phone to request the time.</p>
            <label class="text-sm font-semibold">Your mobile number<input type="tel" autocomplete="tel" class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" placeholder="+61 4…" value={phone()} onInput={(event) => setPhone(event.currentTarget.value)} /></label>
            <Show when={!verificationId()} fallback={<label class="text-sm font-semibold">Verification code<input inputmode="numeric" autocomplete="one-time-code" class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" value={code()} onInput={(event) => setCode(event.currentTarget.value)} /></label>}><button type="button" disabled={busy() || !phone().trim() || !selectedSlot()} class="min-h-11 self-end rounded-lg bg-teal-800 px-4 font-bold text-white disabled:opacity-50" onClick={() => void startVerification()}>Send verification code</button></Show>
            <Show when={verificationId()}><button type="button" disabled={busy() || !code().trim() || !selectedSlot()} class="min-h-11 self-end rounded-lg bg-teal-800 px-4 font-bold text-white disabled:opacity-50" onClick={() => void verifyAndRequest()}>Verify and request this time</button></Show>
          </Show></Show>
          <Show when={receipt()}>{(saved) => <div class="sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"><strong>{saved().status === "accepted" ? "Consultation approved" : "Awaiting celebrant approval"}</strong><p class="mt-1">{saved().status === "accepted" ? `${saved().celebrant_name || "The celebrant"} confirmed ${saved().scheduled_start ? localTime(saved().scheduled_start!) : "the consultation"}. Check your Calendar and confirmation email.` : `Requested ${saved().scheduled_start ? localTime(saved().scheduled_start!) : "consultation time"}. This panel checks for approval automatically; you will also receive email confirmation and a Calendar event.`}</p></div>}</Show>
        </div>}</Show>
      </>}</Show>
      <Show when={notice()}><p class="mt-3 text-sm" role="status">{notice()}</p></Show>
    </section>
  </Show>;
}
