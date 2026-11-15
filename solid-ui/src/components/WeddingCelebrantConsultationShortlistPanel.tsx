import { createEffect, createResource, createSignal, For, Show } from "solid-js";

import { apiFetch } from "@/lib/api";
import type { WeddingVendorChoiceCardData } from "@/components/WeddingVendorChoiceCard";

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

export function WeddingCelebrantConsultationShortlistPanel(props: { cards: WeddingVendorChoiceCardData[] }) {
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

  createEffect(() => {
    const first = availability()?.cards[0];
    if (!selectedSlug() && first) setSelectedSlug(first.vendor_slug);
  });
  const selected = () => availability()?.cards.find((card) => card.vendor_slug === selectedSlug()) ?? null;
  createEffect(() => {
    const firstSlot = selected()?.available_slots[0] ?? "";
    if (!selected()?.available_slots.includes(selectedSlot())) setSelectedSlot(firstSlot);
  });

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
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "The consultation request could not be sent."); }
    finally { setBusy(false); }
  };

  return <Show when={celebrantCards().length > 0}>
    <section class="mt-4 rounded-2xl border border-teal-200 bg-white p-4" aria-labelledby="ranked-celebrant-consultation-title">
      <p class="text-xs font-bold uppercase tracking-[0.14em] text-teal-800">Top-three celebrant availability</p>
      <h3 id="ranked-celebrant-consultation-title" class="mt-1 text-lg font-semibold text-teal-950">Request a 10-minute phone consultation</h3>
      <p class="mt-1 text-sm leading-6 text-teal-900/75">Choose a published time without leaving this comparison. Your phone is verified first and revealed only after this celebrant approves.</p>
      <Show when={availability.loading}><p class="mt-3 text-sm" role="status">Checking these celebrants’ current times…</p></Show>
      <Show when={availability.error}><p class="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="alert">Consultation availability could not be checked just now. The vendor comparison is unchanged.</p></Show>
      <Show when={availability()}>{(current) => <>
        <div class="mt-3 grid gap-2 sm:grid-cols-3"><For each={current().cards}>{(card) => {
          const ranked = () => celebrantCards().find((item) => item.vendorSlug === card.vendor_slug);
          return <button type="button" class={`min-h-20 rounded-xl border p-3 text-left ${selectedSlug() === card.vendor_slug ? "border-teal-700 bg-teal-50" : "border-teal-100"}`} aria-pressed={selectedSlug() === card.vendor_slug} onClick={() => setSelectedSlug(card.vendor_slug)}><strong class="block text-sm">{card.name}</strong><span class="mt-1 block text-xs text-teal-900/70">{card.available_now ? "Available now" : card.next_available_at ? `Next: ${localTime(card.next_available_at)}` : "No consultation time published"}</span><span class="mt-1 block text-xs">Wedding date: {ranked()?.availabilityLabel ?? "Not checked"}</span></button>;
        }}</For></div>
        <Show when={selected()}>{(card) => <div class="mt-4 grid gap-3 rounded-xl bg-teal-50/70 p-3 sm:grid-cols-2">
          <label class="text-sm font-semibold">Celebrant<select class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" value={selectedSlug()} onChange={(event) => setSelectedSlug(event.currentTarget.value)}><For each={current().cards}>{(item) => <option value={item.vendor_slug}>{item.name}</option>}</For></select></label>
          <label class="text-sm font-semibold">Consultation time<select class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" value={selectedSlot()} onChange={(event) => setSelectedSlot(event.currentTarget.value)}><For each={card().available_slots}>{(slot) => <option value={slot}>{localTime(slot)}</option>}</For></select></label>
          <Show when={!receipt()}><Show when={current().phone_verification_configured} fallback={<p class="sm:col-span-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Phone verification is not configured on this server yet. No request can be submitted until that boundary is available.</p>}>
            <label class="text-sm font-semibold">Your mobile number<input type="tel" autocomplete="tel" class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" placeholder="+61 4…" value={phone()} onInput={(event) => setPhone(event.currentTarget.value)} /></label>
            <Show when={!verificationId()} fallback={<label class="text-sm font-semibold">Verification code<input inputmode="numeric" autocomplete="one-time-code" class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" value={code()} onInput={(event) => setCode(event.currentTarget.value)} /></label>}><button type="button" disabled={busy() || !phone().trim() || !selectedSlot()} class="min-h-11 self-end rounded-lg bg-teal-800 px-4 font-bold text-white disabled:opacity-50" onClick={() => void startVerification()}>Send verification code</button></Show>
            <Show when={verificationId()}><button type="button" disabled={busy() || !code().trim() || !selectedSlot()} class="min-h-11 self-end rounded-lg bg-teal-800 px-4 font-bold text-white disabled:opacity-50" onClick={() => void verifyAndRequest()}>Verify and request this time</button></Show>
          </Show></Show>
          <Show when={receipt()}>{(saved) => <div class="sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"><strong>Awaiting celebrant approval</strong><p class="mt-1">Requested {saved().scheduled_start ? localTime(saved().scheduled_start!) : "consultation time"}. You will receive email confirmation and a Calendar event after approval.</p></div>}</Show>
        </div>}</Show>
      </>}</Show>
      <Show when={notice()}><p class="mt-3 text-sm" role="status">{notice()}</p></Show>
    </section>
  </Show>;
}
