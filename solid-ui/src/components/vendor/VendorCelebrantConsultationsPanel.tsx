import { createEffect, createResource, createSignal, For, Show } from "solid-js";

import {
  actionCelebrantRequest,
  addCelebrantWindow,
  getCelebrantDashboard,
  removeCelebrantWindow,
  saveCelebrantSettings,
  setCelebrantLive,
  type CelebrantRequest,
} from "@/lib/celebrantConsultationApi";

const TOPICS = [
  ["ceremony_process", "How the ceremony works"],
  ["paperwork", "Paperwork"],
  ["ceremony_ideas", "Ceremony ideas"],
  ["finding_celebrant", "Finding a celebrant"],
] as const;
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function VendorCelebrantConsultationsPanel(props: { vendorSlug: string }) {
  const [dashboard, { refetch }] = createResource(() => props.vendorSlug, getCelebrantDashboard);
  const [phone, setPhone] = createSignal("");
  const [regions, setRegions] = createSignal("Sydney");
  const [languages, setLanguages] = createSignal("English");
  const [topics, setTopics] = createSignal<string[]>(TOPICS.map(([value]) => value));
  const [intents, setIntents] = createSignal<string[]>(["general_question", "prospective_client"]);
  const [buffer, setBuffer] = createSignal(5);
  const [weekday, setWeekday] = createSignal(1);
  const [startsAt, setStartsAt] = createSignal("17:30");
  const [endsAt, setEndsAt] = createSignal("19:30");
  const [liveMinutes, setLiveMinutes] = createSignal(60);
  const [callCap, setCallCap] = createSignal(3);
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const [callbackNumber, setCallbackNumber] = createSignal("");
  const [initialised, setInitialised] = createSignal(false);

  createEffect(() => {
    const profile = dashboard()?.profile;
    if (!profile || initialised()) return;
    setRegions(profile.service_regions.join(", "));
    setLanguages(profile.languages.join(", "));
    setTopics(profile.topics);
    setIntents(profile.accepted_intents);
    setBuffer(profile.buffer_minutes);
    setInitialised(true);
  });

  const toggle = (current: string[], value: string, update: (next: string[]) => void) => update(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const act = async (work: () => Promise<unknown>, success: string) => {
    if (busy()) return;
    setBusy(true); setNotice(""); setCallbackNumber("");
    try { await work(); await refetch(); setNotice(success); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "That change could not be saved."); }
    finally { setBusy(false); }
  };
  const save = () => act(() => saveCelebrantSettings(props.vendorSlug, {
    expectedRevision: dashboard()?.profile?.revision,
    serviceRegions: regions().split(/[,\n]/).map((value) => value.trim()).filter(Boolean),
    languages: languages().split(/[,\n]/).map((value) => value.trim()).filter(Boolean),
    topics: topics(), acceptedIntents: intents(), businessPhone: phone(), bufferMinutes: buffer(),
  }), "Phone consultation settings saved.");
  const requestAction = async (request: CelebrantRequest, action: "accept" | "pass" | "cancel" | "connected" | "not_connected") => {
    if (busy()) return;
    setBusy(true); setNotice(""); setCallbackNumber("");
    try {
      const result = await actionCelebrantRequest(props.vendorSlug, request, action);
      if (result.callback_phone) setCallbackNumber(result.callback_phone);
      await refetch(); setNotice(action === "accept" ? "Callback accepted. The verified number is shown only in this session below." : "Call updated.");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "The call could not be updated."); }
    finally { setBusy(false); }
  };

  return <section class="rounded-xl border border-wedding-muted bg-white p-5 shadow-sm" aria-labelledby="celebrant-consultations-title">
    <p class="text-xs font-bold uppercase tracking-[0.16em] text-wedding-accent">Phone consultations</p>
    <h2 id="celebrant-consultations-title" class="mt-1 text-lg font-semibold">Offer ten-minute calls without exposing your number</h2>
    <p class="mt-1 text-sm leading-6 text-wedding-muted">Wedding-date availability stays in Wedding dates above. This view controls question and prospective-client calls in Sydney time.</p>
    <Show when={dashboard.loading}><p class="mt-4 text-sm" role="status">Loading consultation settings…</p></Show>
    <Show when={dashboard.error}><p class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">Phone consultations could not be loaded.</p></Show>
    <Show when={dashboard()}>{(current) => <>
      <div class="mt-4 rounded-xl bg-wedding-surface p-4">
        <div class="flex flex-wrap items-center justify-between gap-3"><div><strong>Register check: <span class="capitalize">{current().profile?.register_status ?? "pending"}</span></strong><p class="mt-1 text-xs text-wedding-muted">Registration evidence and live readiness are separate. You cannot go live until an operator records the official check.</p></div><Show when={current().profile?.register_checked_at}><span class="text-xs text-wedding-muted">Checked {new Date(current().profile!.register_checked_at!).toLocaleDateString("en-AU")}</span></Show></div>
      </div>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <label class="text-sm font-semibold">Nominated business phone<input type="tel" autocomplete="tel" class="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal" value={phone()} onInput={(event) => setPhone(event.currentTarget.value)} placeholder={current().profile?.business_phone_configured ? "Saved securely · enter only to replace" : "+61 4…"} /></label>
        <label class="text-sm font-semibold">Buffer between calls<input type="number" min="0" max="60" step="1" class="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal" value={buffer()} onInput={(event) => setBuffer(Number(event.currentTarget.value))} /></label>
        <label class="text-sm font-semibold">Service regions<input class="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal" value={regions()} onInput={(event) => setRegions(event.currentTarget.value)} /></label>
        <label class="text-sm font-semibold">Languages<input class="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal" value={languages()} onInput={(event) => setLanguages(event.currentTarget.value)} /></label>
      </div>
      <fieldset class="mt-4"><legend class="text-sm font-semibold">Topics you can help with</legend><div class="mt-2 grid gap-2 sm:grid-cols-2"><For each={TOPICS}>{([value, label]) => <label class="flex min-h-11 items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={topics().includes(value)} onChange={() => toggle(topics(), value, setTopics)} />{label}</label>}</For></div></fieldset>
      <fieldset class="mt-4"><legend class="text-sm font-semibold">Calls you accept</legend><div class="mt-2 flex flex-wrap gap-2"><label class="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm"><input type="checkbox" checked={intents().includes("general_question")} onChange={() => toggle(intents(), "general_question", setIntents)} />General questions</label><label class="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm"><input type="checkbox" checked={intents().includes("prospective_client")} onChange={() => toggle(intents(), "prospective_client", setIntents)} />Prospective clients</label></div></fieldset>
      <button type="button" disabled={busy() || (!phone().trim() && !current().profile?.business_phone_configured) || !topics().length || !intents().length} class="mt-4 min-h-11 rounded-lg bg-wedding-accent px-4 font-bold text-white disabled:opacity-50" onClick={() => void save()}>Save consultation settings</button>

      <div class="mt-6 border-t pt-5"><h3 class="font-semibold">Weekly hours</h3><p class="mt-1 text-sm text-wedding-muted">Times are shown to couples in Australia/Sydney.</p><div class="mt-3 grid gap-3 sm:grid-cols-4"><label class="text-sm">Day<select class="mt-1 min-h-11 w-full rounded-lg border px-3" value={weekday()} onChange={(event) => setWeekday(Number(event.currentTarget.value))}><For each={DAYS}>{(day, index) => <option value={index() + 1}>{day}</option>}</For></select></label><label class="text-sm">From<input type="time" class="mt-1 min-h-11 w-full rounded-lg border px-3" value={startsAt()} onInput={(event) => setStartsAt(event.currentTarget.value)} /></label><label class="text-sm">Until<input type="time" class="mt-1 min-h-11 w-full rounded-lg border px-3" value={endsAt()} onInput={(event) => setEndsAt(event.currentTarget.value)} /></label><button type="button" disabled={busy()} class="min-h-11 self-end rounded-lg border px-3 font-semibold" onClick={() => void act(() => addCelebrantWindow(props.vendorSlug, { kind: "recurring", weekday: weekday(), localDate: null, startsAt: startsAt(), endsAt: endsAt() }), "Weekly hours added.")}>Add hours</button></div>
        <div class="mt-3 grid gap-2"><For each={current().windows}>{(window) => <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-wedding-surface p-3 text-sm"><span>{window.kind === "recurring" ? DAYS[(window.weekday ?? 1) - 1] : window.local_date} · {window.starts_at}–{window.ends_at}</span><button type="button" class="min-h-10 rounded-lg border bg-white px-3 font-semibold" onClick={() => void act(() => removeCelebrantWindow(props.vendorSlug, window.window_id), "Hours removed.")}>Remove</button></div>}</For></div>
      </div>

      <div class="mt-6 border-t pt-5"><h3 class="font-semibold">Available now</h3><p class="mt-1 text-sm text-wedding-muted">A live check-in expires automatically. Couples only see Available now while capacity remains.</p><Show when={current().live && !current().live?.paused && new Date(current().live!.expires_at) > new Date()} fallback={<div class="mt-3 flex flex-wrap gap-3"><label class="text-sm">Live for minutes<input type="number" min="10" max="240" step="10" class="mt-1 min-h-11 w-28 rounded-lg border px-3" value={liveMinutes()} onInput={(event) => setLiveMinutes(Number(event.currentTarget.value))} /></label><label class="text-sm">Call cap<input type="number" min="1" max="20" step="1" class="mt-1 min-h-11 w-24 rounded-lg border px-3" value={callCap()} onInput={(event) => setCallCap(Number(event.currentTarget.value))} /></label><button type="button" disabled={busy() || current().profile?.register_status !== "verified"} class="min-h-11 self-end rounded-lg bg-wedding-accent px-4 font-bold text-white disabled:opacity-50" onClick={() => void act(() => setCelebrantLive(props.vendorSlug, "start", liveMinutes(), callCap()), "You are live for callbacks.")}>Go live</button></div>}><div class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-50 p-3 text-sm"><strong>Live until {new Date(current().live!.expires_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}</strong><button type="button" disabled={busy()} class="min-h-11 rounded-lg border bg-white px-4 font-semibold" onClick={() => void act(() => setCelebrantLive(props.vendorSlug, "pause"), "Live callbacks paused.")}>Pause now</button></div></Show></div>

      <div class="mt-6 border-t pt-5"><h3 class="font-semibold">Upcoming and waiting calls</h3><Show when={callbackNumber()}><p class="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm"><strong>Verified callback number:</strong> <a class="underline" href={`tel:${callbackNumber()}`}>{callbackNumber()}</a><span class="mt-1 block text-xs">Shown only after you accepted this request. Call from your nominated business phone.</span></p></Show><div class="mt-3 grid gap-3"><For each={current().requests.filter((request) => ["waiting_acceptance", "scheduled", "accepted", "reschedule_requested"].includes(request.status))} fallback={<p class="rounded-lg bg-wedding-surface p-3 text-sm text-wedding-muted">No calls are waiting.</p>}>{(request) => <article class="rounded-xl border p-4"><div class="flex flex-wrap justify-between gap-2"><strong class="capitalize">{request.topic.replaceAll("_", " ")}</strong><span class="rounded-full bg-wedding-surface px-3 py-1 text-xs font-bold capitalize">{request.status.replaceAll("_", " ")}</span></div><p class="mt-2 text-sm text-wedding-muted">{request.intent === "prospective_client" ? "Looking to hire" : "General question"}{request.location ? ` · ${request.location}` : ""}{request.wedding_date ? ` · wedding ${new Date(`${request.wedding_date}T12:00:00`).toLocaleDateString("en-AU")}` : ""}</p><Show when={request.scheduled_start}><p class="mt-1 text-sm">Booked {new Date(request.scheduled_start!).toLocaleString("en-AU")}</p></Show><div class="mt-3 flex flex-wrap gap-2"><Show when={["waiting_acceptance", "scheduled"].includes(request.status)}><button disabled={busy()} class="min-h-11 rounded-lg bg-wedding-accent px-4 font-bold text-white" onClick={() => void requestAction(request, "accept")}>Accept</button></Show><Show when={request.status === "waiting_acceptance"}><button disabled={busy()} class="min-h-11 rounded-lg border px-4 font-semibold" onClick={() => void requestAction(request, "pass")}>Pass</button></Show><Show when={request.status === "accepted"}><button disabled={busy()} class="min-h-11 rounded-lg border px-4 font-semibold" onClick={() => void requestAction(request, "connected")}>Connected</button><button disabled={busy()} class="min-h-11 rounded-lg border px-4 font-semibold" onClick={() => void requestAction(request, "not_connected")}>Did not connect</button></Show><Show when={["scheduled", "accepted"].includes(request.status)}><button disabled={busy()} class="min-h-11 rounded-lg border border-red-300 px-4 font-semibold text-red-800" onClick={() => confirm("Cancel this call? The couple will need to choose another time.") && void requestAction(request, "cancel")}>Cancel</button></Show></div></article>}</For></div></div>
    </>}</Show>
    <Show when={notice()}><p class="mt-4 rounded-lg bg-wedding-surface p-3 text-sm" role="status">{notice()}</p></Show>
  </section>;
}
