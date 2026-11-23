import { createResource, createSignal, For, Show } from "solid-js";

import {
  loadPublicVendorProposalLeadFeed,
  submitPublicVendorLeadResponse,
  type VendorProposalOpportunity,
} from "@/lib/vendorProposalOpportunityApi";

type ResponseKind = "proposal" | "available_date" | "notify_couple";

export function PublicVendorProposalLeadFeed(props: { token: string }) {
  const [feed, { refetch }] = createResource(() => props.token, loadPublicVendorProposalLeadFeed);
  const [selected, setSelected] = createSignal<VendorProposalOpportunity | null>(null);
  const [responseKind, setResponseKind] = createSignal<ResponseKind>("proposal");
  const [message, setMessage] = createSignal("");
  const [availableDate, setAvailableDate] = createSignal("");
  const [amount, setAmount] = createSignal("");
  const [validUntil, setValidUntil] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);

  async function submit() {
    const item = selected();
    if (!item || !message().trim() || busy()) return;
    setBusy(true); setNotice(null);
    try {
      await submitPublicVendorLeadResponse({
        token: props.token, opportunityId: item.opportunityId, responseKind: responseKind(),
        message: message().trim(), availableDate: availableDate() || undefined,
        amount: amount() ? Number(amount()) : undefined, currency: "AUD", validUntil: validUntil() || undefined,
      });
      setNotice("Your private response is ready for the couple to review. No booking or date hold was created.");
      setSelected(null); setMessage(""); setAvailableDate(""); setAmount(""); setValidUntil("");
      await refetch();
    } catch { setNotice("The response could not be sent. Check the fields or ask OmnyID for a fresh link."); }
    finally { setBusy(false); }
  }

  return <main class="mx-auto min-h-screen max-w-4xl bg-wedding-surface px-3 py-6 text-wedding-text sm:px-5">
    <section class="rounded-2xl border border-wedding-muted bg-white p-4 shadow-sm sm:p-7">
      <p class="text-xs font-bold uppercase tracking-[0.16em] text-wedding-accent">Private vendor lead view</p>
      <Show when={!feed.loading} fallback={<p class="mt-4" role="status">Checking this secure vendor link…</p>}>
        <Show when={!feed.error && feed()} fallback={<p class="mt-4 rounded-lg bg-amber-50 p-3 text-amber-900">This vendor lead link has expired or was revoked.</p>}>
          {(value) => <>
            <h1 class="mt-2 text-2xl font-bold">Proposal leads for {value().vendorName}</h1>
            <p class="mt-2 text-sm leading-6 text-wedding-muted">Only open briefs matching this listing's category and service area appear here. This link expires {new Date(value().expiresAt).toLocaleDateString()} and does not sign you into OmnyID.</p>
            <Show when={value().opportunities.length > 0} fallback={<p class="mt-5 rounded-xl bg-wedding-surface p-4 text-sm">No matching proposal briefs are open right now. You can return with the same link until it expires.</p>}>
              <div class="mt-5 grid gap-3"><For each={value().opportunities}>{(item) => <article class="rounded-xl border border-wedding-muted p-4">
                <div class="flex flex-wrap items-start justify-between gap-3"><div><h2 class="font-semibold">{item.category}</h2><p class="mt-1 text-xs text-wedding-muted">{item.location ?? "Location kept private"} · closes {new Date(item.expiresAt).toLocaleDateString()}</p></div><button type="button" class="min-h-11 rounded-lg bg-wedding-accent px-4 text-sm font-bold text-white" onClick={() => { setSelected(item); setNotice(null); }}>Respond privately</button></div>
                <p class="mt-3 whitespace-pre-wrap text-sm leading-6">{item.briefText}</p>
                <Show when={Object.keys(item.sharedContext).length > 0}><dl class="mt-3 grid gap-2 rounded-lg bg-wedding-surface p-3 text-sm sm:grid-cols-3"><For each={Object.entries(item.sharedContext)}>{([key, field]) => <div><dt class="text-xs font-semibold uppercase text-wedding-muted">{key.replaceAll("_", " ")}</dt><dd class="mt-1">{typeof field === "string" || typeof field === "number" ? String(field) : Array.isArray(field) ? field.join(", ") : "Shared by the couple"}</dd></div>}</For></dl></Show>
              </article>}</For></div>
            </Show>
          </>}
        </Show>
      </Show>
      <Show when={selected()}>{(item) => <form class="mt-5 rounded-xl border border-wedding-accent/30 bg-wedding-surface p-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <h2 class="font-semibold">Private response for {item().category}</h2>
        <fieldset class="mt-3"><legend class="text-sm font-semibold">How would you like to respond?</legend><div class="mt-2 grid gap-2 sm:grid-cols-3">
          {([['proposal','Send a proposal'],['available_date','Offer a suitable date'],['notify_couple','Ask OmnyID to notify the couple']] as const).map(([kind, label]) => <label class="flex min-h-11 items-center gap-2 rounded-lg border border-wedding-muted bg-white px-3 text-sm"><input type="radio" name="response-kind" checked={responseKind() === kind} onChange={() => setResponseKind(kind)} />{label}</label>)}
        </div></fieldset>
        <Show when={responseKind() === "available_date"}><label class="mt-3 block text-sm font-medium">Suitable date<input required type="date" value={availableDate()} onInput={(event) => setAvailableDate(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted bg-white px-3" /></label></Show>
        <label class="mt-3 block text-sm font-medium">Message to the couple<textarea required maxLength={12000} rows={6} value={message()} onInput={(event) => setMessage(event.currentTarget.value)} class="mt-1 w-full rounded-lg border border-wedding-muted bg-white p-3" /></label>
        <Show when={responseKind() === "proposal"}><div class="mt-3 grid gap-3 sm:grid-cols-2"><label class="text-sm font-medium">Indicative total (AUD)<input type="number" min="0" step="0.01" value={amount()} onInput={(event) => setAmount(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted bg-white px-3" /></label><label class="text-sm font-medium">Valid until<input type="date" value={validUntil()} onInput={(event) => setValidUntil(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted bg-white px-3" /></label></div></Show>
        <p class="mt-3 text-xs leading-5 text-wedding-muted">The couple receives this in their private Wedding workspace. An offered date is indicative until the vendor separately confirms or holds it.</p>
        <div class="mt-3 flex flex-wrap gap-2"><button type="submit" disabled={busy()} class="min-h-11 rounded-lg bg-wedding-accent px-4 font-bold text-white disabled:opacity-50">{busy() ? "Sending…" : responseKind() === "notify_couple" ? "Notify couple" : "Send response"}</button><button type="button" class="min-h-11 rounded-lg border border-wedding-muted bg-white px-4 font-semibold" onClick={() => setSelected(null)}>Cancel</button></div>
      </form>}</Show>
      <Show when={notice()}>{(text) => <p class="mt-4 rounded-lg bg-wedding-surface p-3 text-sm" role="status">{text()}</p>}</Show>
    </section>
  </main>;
}
