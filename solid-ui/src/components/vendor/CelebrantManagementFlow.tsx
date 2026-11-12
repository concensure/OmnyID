import { createSignal, For, onMount, Show } from "solid-js";

import {
  commandCelebrantManagement,
  exchangeCelebrantManagementLink,
  getCelebrantManagementSession,
  type CelebrantManagementSession,
  type CelebrantManagementWindow,
} from "@/lib/celebrantManagementApi";

const csrfKey = "omnyid.celebrantManagement.csrf";
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function CelebrantManagementFlow(props: { token: string }) {
  const [session, setSession] = createSignal<CelebrantManagementSession | null>(null);
  const [csrf, setCsrf] = createSignal("");
  const [busy, setBusy] = createSignal(true);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [kind, setKind] = createSignal<"recurring" | "exception_open" | "exception_closed">("recurring");
  const [weekday, setWeekday] = createSignal(1);
  const [date, setDate] = createSignal("");
  const [start, setStart] = createSignal("17:30");
  const [end, setEnd] = createSignal("19:30");
  const [duration, setDuration] = createSignal(60);
  const [callCap, setCallCap] = createSignal(3);
  const [callbackPhoneConfirmed, setCallbackPhoneConfirmed] = createSignal(false);

  const load = async () => {
    setBusy(true); setError("");
    try {
      if (props.token) {
        const exchanged = await exchangeCelebrantManagementLink(props.token);
        sessionStorage.setItem(csrfKey, exchanged.csrf_token); setCsrf(exchanged.csrf_token);
        history.replaceState(null, "", `${location.pathname}${location.search}`);
      } else setCsrf(sessionStorage.getItem(csrfKey) ?? "");
      const current = await getCelebrantManagementSession();
      setSession(current);
      setCallbackPhoneConfirmed(current.profile?.callback_phone_confirmed ?? false);
    } catch (reason) {
      if (!props.token) sessionStorage.removeItem(csrfKey);
      setError(reason instanceof Error ? reason.message : "This celebrant calendar link is unavailable.");
    } finally { setBusy(false); }
  };
  onMount(() => void load());

  const run = async (input: Record<string, unknown>, success: string) => {
    if (!csrf() || busy()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await commandCelebrantManagement(csrf(), input);
      const current = await getCelebrantManagementSession();
      setSession(current); setCallbackPhoneConfirmed(current.profile?.callback_phone_confirmed ?? false); setNotice(success);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "That availability change could not be saved."); }
    finally { setBusy(false); }
  };
  const addWindow = () => run({
    operation: "window_add", kind: kind(), weekday: kind() === "recurring" ? weekday() : null,
    local_date: kind() === "recurring" ? null : date(), starts_at: start(), ends_at: end(),
  }, "Consultation availability saved.");
  const windowLabel = (window: CelebrantManagementWindow) => window.kind === "recurring"
    ? `${days[(window.weekday ?? 1) - 1]} · ${window.starts_at}–${window.ends_at}`
    : `${window.local_date} · ${window.kind === "exception_closed" ? "Unavailable" : `${window.starts_at}–${window.ends_at}`}`;

  return <main class="min-h-screen bg-wedding-surface px-4 py-6 text-wedding-text sm:px-6">
    <section class="mx-auto w-full max-w-3xl rounded-xl bg-white p-5 shadow-sm sm:p-7" aria-labelledby="celebrant-management-title">
      <p class="text-xs font-bold uppercase tracking-[0.16em] text-wedding-accent">Private celebrant link</p>
      <h1 id="celebrant-management-title" class="mt-2 text-2xl font-bold">Manage consultation availability</h1>
      <p class="mt-2 text-sm leading-6 text-wedding-muted">This link is scoped to one celebrant. It can change consultation hours and live status only; it cannot open couple details, messages, phone numbers or another listing.</p>
      <Show when={busy() && !session()}><p class="mt-6" role="status">Opening your secure calendar…</p></Show>
      <Show when={error()}><p class="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{error()}</p></Show>
      <Show when={notice()}><p class="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900" role="status">{notice()}</p></Show>
      <Show when={session()} keyed>{(current) => <div class="mt-6 space-y-6">
        <header class="rounded-xl border border-wedding-muted p-4"><h2 class="text-xl font-bold">{current.vendor.name}</h2><p class="mt-1 text-sm text-wedding-muted">{current.vendor.service_area}</p><p class="mt-3 text-sm"><strong>Register check:</strong> <span class="capitalize">{(current.profile?.register_status ?? "pending").replaceAll("_", " ")}</span></p><p class="mt-2 text-xs text-wedding-muted">{current.capabilities.notice}</p><Show when={!current.profile?.phone_configured}><p class="mt-2 text-sm text-amber-800">A claimed owner must add a nominated business phone before live callbacks can be enabled.</p></Show></header>
        <section class="rounded-xl border border-wedding-muted p-4" aria-labelledby="consultation-participation-title"><h2 id="consultation-participation-title" class="text-lg font-bold">Choose whether to participate</h2><p class="mt-1 text-sm leading-6 text-wedding-muted">Accepting lets you publish optional ten-minute consultation hours. Declining or pausing hides consultation availability and stops live callbacks; it does not change your listing or wedding-date calendar.</p><p class="mt-2 text-sm"><strong>Current choice:</strong> <span class="capitalize">{(current.profile?.participation_status ?? "not_asked").replaceAll("_", " ")}</span></p>
          <label class="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" class="mt-1" disabled={!current.profile?.phone_configured || busy()} checked={callbackPhoneConfirmed()} onChange={(event) => setCallbackPhoneConfirmed(event.currentTarget.checked)} /><span>Use my nominated business phone for callbacks. It remains private and is not shown to couples.</span></label>
          <div class="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy()} class="min-h-11 rounded-lg bg-wedding-accent px-4 font-bold text-white disabled:opacity-50" onClick={() => void run({ operation: "participation_update", participation_status: "accepted", callback_phone_confirmed: callbackPhoneConfirmed() }, "Consultation participation accepted.")}>Accept participation</button><button type="button" disabled={busy()} class="min-h-11 rounded-lg border bg-white px-4 font-semibold disabled:opacity-50" onClick={() => void run({ operation: "participation_update", participation_status: "paused", callback_phone_confirmed: callbackPhoneConfirmed() }, "Consultation participation paused.")}>Pause</button><button type="button" disabled={busy()} class="min-h-11 rounded-lg border border-red-300 bg-white px-4 font-semibold text-red-800 disabled:opacity-50" onClick={() => void run({ operation: "participation_update", participation_status: "declined", callback_phone_confirmed: false }, "Consultation participation declined.")}>Decline</button></div>
          <Show when={current.profile?.participation_status === "declined" || current.profile?.participation_status === "paused"}><p class="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">You can return through this unexpired private link and choose Accept participation to resume. If the link expires, ask OmnyID for a replacement; your saved hours stay private in the meantime.</p></Show>
        </section>
        <section><h2 class="text-lg font-bold">Weekly and one-off hours</h2><div class="mt-3 grid gap-3 rounded-xl border border-wedding-muted p-4 sm:grid-cols-2">
          <label class="text-sm font-semibold">Availability type<select class="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal" value={kind()} onChange={(event) => setKind(event.currentTarget.value as "recurring" | "exception_open" | "exception_closed")}><option value="recurring">Weekly hours</option><option value="exception_open">Open one date</option><option value="exception_closed">Unavailable one date</option></select></label>
          <Show when={kind() === "recurring"} fallback={<label class="text-sm font-semibold">Date<input type="date" min={new Date().toISOString().slice(0, 10)} class="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal" value={date()} onInput={(event) => setDate(event.currentTarget.value)} /></label>}><label class="text-sm font-semibold">Day<select class="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal" value={weekday()} onChange={(event) => setWeekday(Number(event.currentTarget.value))}><For each={days}>{(day, index) => <option value={index() + 1}>{day}</option>}</For></select></label></Show>
          <label class="text-sm font-semibold">From<input type="time" class="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal" value={start()} onInput={(event) => setStart(event.currentTarget.value)} /></label>
          <label class="text-sm font-semibold">Until<input type="time" class="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal" value={end()} onInput={(event) => setEnd(event.currentTarget.value)} /></label>
          <button type="button" disabled={busy() || current.profile?.participation_status !== "accepted" || (kind() !== "recurring" && !date())} class="min-h-11 rounded-lg bg-wedding-accent px-4 font-bold text-white disabled:opacity-50 sm:col-span-2" onClick={() => void addWindow()}>Add availability</button>
        </div><div class="mt-3 grid gap-2"><For each={current.windows} fallback={<p class="rounded-lg bg-wedding-surface p-3 text-sm text-wedding-muted">No consultation hours have been added.</p>}>{(window) => <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-wedding-surface p-3 text-sm"><span>{windowLabel(window)}</span><button type="button" disabled={busy()} class="min-h-10 rounded-lg border bg-white px-3 font-semibold" onClick={() => void run({ operation: "window_remove", window_id: window.window_id }, "Availability removed.")}>Remove</button></div>}</For></div></section>
        <section class="border-t pt-5"><h2 class="text-lg font-bold">Available now for a 10-minute call</h2><p class="mt-1 text-sm text-wedding-muted">Live availability expires automatically. It becomes public only after participation, register, private callback-phone and rollout gates pass.</p><Show when={current.live && !current.live.paused && new Date(current.live.expires_at) > new Date()} fallback={<div class="mt-3 flex flex-wrap gap-3"><label class="text-sm font-semibold">Minutes<input type="number" min="10" max="240" step="10" class="mt-1 min-h-11 w-28 rounded-lg border px-3 font-normal" value={duration()} onInput={(event) => setDuration(Number(event.currentTarget.value))} /></label><label class="text-sm font-semibold">Call cap<input type="number" min="1" max="20" step="1" class="mt-1 min-h-11 w-24 rounded-lg border px-3 font-normal" value={callCap()} onInput={(event) => setCallCap(Number(event.currentTarget.value))} /></label><button type="button" disabled={busy() || current.profile?.participation_status !== "accepted" || current.profile?.register_status !== "verified" || !current.profile?.phone_configured || !current.profile?.callback_phone_confirmed} class="min-h-11 self-end rounded-lg bg-wedding-accent px-4 font-bold text-white disabled:opacity-50" onClick={() => void run({ operation: "live_start", duration_minutes: duration(), call_cap: callCap() }, "Live consultation availability started.")}>Go live</button></div>}><div class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-50 p-3 text-sm"><strong>Live until {new Date(current.live!.expires_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}</strong><button type="button" disabled={busy()} class="min-h-11 rounded-lg border bg-white px-4 font-semibold" onClick={() => void run({ operation: "live_pause" }, "Live availability paused.")}>Pause now</button></div></Show></section>
      </div>}</Show>
    </section>
  </main>;
}
