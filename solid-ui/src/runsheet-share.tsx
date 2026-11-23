import { createSignal, For, Match, onMount, Show, Switch } from "solid-js";
import { render } from "solid-js/web";
import {
  acknowledgeWeddingRunSheetShare, openWeddingRunSheetShare,
  type WeddingRunSheetHostedView,
} from "@/lib/weddingRunSheetShareApi";
import "./index.css";

const labels: Record<string, string> = {
  start_at: "Start", end_at: "End", title: "Item", location: "Place", owner_refs: "Owner",
  participant_refs: "Participants", status: "Status",
};

function valueText(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "object" ? "Structured detail" : String(value);
}

function ProtectedRunSheet() {
  const [view, setView] = createSignal<WeddingRunSheetHostedView | null>(null);
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(true);
  const [actor, setActor] = createSignal("");
  const [note, setNote] = createSignal("");
  const [ackBusy, setAckBusy] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  let token = "";

  onMount(async () => {
    token = window.location.hash.slice(1).trim();
    if (token) history.replaceState(null, "", `${location.pathname}${location.search}`);
    if (!token) { setError("This protected run-sheet link is incomplete."); setBusy(false); return; }
    try { setView(await openWeddingRunSheetShare(token)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "This protected run sheet is not available."); }
    finally { setBusy(false); }
  });

  async function respond(status: "acknowledged" | "changes_requested") {
    if (ackBusy() || !actor().trim()) { setNotice("Add your name or business name first."); return; }
    setAckBusy(true); setNotice("");
    try {
      const acknowledgement = await acknowledgeWeddingRunSheetShare({
        token, status, actorLabel: actor(), note: note(),
        idempotencyKey: `ack-${crypto.randomUUID()}`,
      });
      setView((current) => current ? { ...current, grant: { ...current.grant, acknowledgement } } : current);
      setNotice(status === "acknowledged" ? "Final run sheet acknowledged." : "Your requested changes were sent to the couple.");
    } catch (caught) { setNotice(caught instanceof Error ? caught.message : "Your response could not be recorded."); }
    finally { setAckBusy(false); }
  }

  return <main class="min-h-screen bg-wedding-bg px-4 py-8 text-wedding-text sm:px-6">
    <div class="mx-auto max-w-5xl">
      <p class="text-sm font-semibold text-wedding-action">OmnyID Wedding</p>
      <Switch>
        <Match when={busy()}><div class="mt-5 rounded-xl border border-wedding-border bg-white p-6" role="status">Opening the protected run sheet…</div></Match>
        <Match when={error()}><div class="mt-5 rounded-xl border border-red-200 bg-white p-6"><h1 class="text-2xl font-bold">Run sheet unavailable</h1><p class="mt-2 text-sm text-wedding-muted">{error()}</p></div></Match>
        <Match when={view()}>{(loaded) => <>
          <header class="mt-4 rounded-xl border border-wedding-border bg-white p-5 sm:p-7">
            <h1 class="text-2xl font-bold sm:text-3xl">{loaded().view_name} run sheet</h1>
            <p class="mt-2 text-sm text-wedding-muted">Shared with {loaded().grant.recipient_label} · Expires {new Date(loaded().grant.expires_at).toLocaleString()}</p>
            <p class="mt-3 text-xs leading-5 text-wedding-muted">This is a protected live projection. It contains only the fields the couple previewed. Ask the couple before forwarding it.</p>
          </header>
          <section class="mt-4 overflow-hidden rounded-xl border border-wedding-border bg-white" aria-label="Shared wedding run sheet">
            <div class="overflow-x-auto" tabIndex={0}><table class="w-full min-w-[44rem] border-collapse text-left text-sm">
              <thead><tr class="border-b-2 border-wedding-text bg-wedding-bg"><For each={loaded().columns}>{(column) => <th class="p-3">{labels[column] ?? column}</th>}</For></tr></thead>
              <tbody><For each={loaded().rows}>{(row) => <tr class="border-b border-wedding-border"><For each={loaded().columns}>{(column) => <td class="p-3 align-top">{valueText(row.values[column])}</td>}</For></tr>}</For></tbody>
            </table></div>
          </section>
          <Show when={loaded().grant.signoff_required}><section class="mt-4 rounded-xl border border-wedding-border bg-white p-5" aria-labelledby="signoff-title">
            <h2 id="signoff-title" class="text-xl font-bold">Final vendor sign-off</h2>
            <p class="mt-1 text-sm text-wedding-muted">Due {loaded().grant.signoff_due_at ? new Date(loaded().grant.signoff_due_at!).toLocaleString() : "before expiry"}. Confirm the timing is workable, or request a change.</p>
            <Show when={loaded().grant.acknowledgement} fallback={<div class="mt-4 grid gap-3">
              <label class="text-sm font-medium">Your name or business name<input value={actor()} onInput={(event) => setActor(event.currentTarget.value)} maxlength="120" class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border px-3" /></label>
              <label class="text-sm font-medium">Note (optional)<textarea value={note()} onInput={(event) => setNote(event.currentTarget.value)} maxlength="1000" rows="3" class="mt-1 w-full rounded-lg border border-wedding-border p-3" /></label>
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2"><button disabled={ackBusy()} onClick={() => void respond("changes_requested")} class="min-h-12 rounded-lg border-2 border-wedding-action font-bold text-wedding-action">Request changes</button><button disabled={ackBusy()} onClick={() => void respond("acknowledged")} class="min-h-12 rounded-lg bg-wedding-action font-bold text-white">Acknowledge final run sheet</button></div>
            </div>}><p class="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-medium">Response recorded: {loaded().grant.acknowledgement?.status === "acknowledged" ? "Acknowledged" : "Changes requested"}.</p></Show>
            <Show when={notice()}><p role="status" class="mt-3 text-sm">{notice()}</p></Show>
          </section></Show>
        </>}</Match>
      </Switch>
    </div>
  </main>;
}

render(() => <ProtectedRunSheet />, document.getElementById("root")!);
