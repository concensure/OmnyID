import { createResource, createSignal, Show } from "solid-js";

import {
  loadPublicVendorProposalOpportunity,
  submitPublicVendorProposal,
} from "@/lib/vendorProposalOpportunityApi";

export function PublicVendorProposalFlow(props: { token: string }) {
  const [opportunity] = createResource(() => props.token, loadPublicVendorProposalOpportunity);
  const [businessName, setBusinessName] = createSignal("");
  const [businessEmail, setBusinessEmail] = createSignal("");
  const [message, setMessage] = createSignal("");
  const [amount, setAmount] = createSignal("");
  const [validUntil, setValidUntil] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [sent, setSent] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function submit() {
    if (busy()) return;
    setBusy(true); setError(null);
    try {
      await submitPublicVendorProposal({
        token: props.token, businessName: businessName(), businessEmail: businessEmail(),
        message: message(), amount: amount() ? Number(amount()) : undefined,
        currency: "AUD", validUntil: validUntil() || undefined,
      });
      setSent(true);
    } catch { setError("The proposal could not be sent. This link may have expired, or the details need checking."); }
    finally { setBusy(false); }
  }

  return <main class="mx-auto min-h-screen max-w-2xl bg-wedding-surface px-4 py-8 text-wedding-text">
    <section class="rounded-2xl border border-wedding-muted bg-white p-5 shadow-sm sm:p-7">
      <p class="text-xs font-bold uppercase tracking-[0.16em] text-wedding-accent">Private proposal invitation</p>
      <Show when={!opportunity.loading} fallback={<p class="mt-4">Checking this secure link…</p>}>
        <Show when={!opportunity.error && opportunity()} fallback={<p class="mt-4 rounded-lg bg-amber-50 p-3 text-amber-900">This proposal link has expired or is no longer available.</p>}>
          {(item) => <><h1 class="mt-2 text-2xl font-bold">{item().category}</h1><p class="mt-1 text-sm text-wedding-muted">{item().location ?? "The couple kept the location private"} · link expires {new Date(item().expiresAt).toLocaleDateString()}</p><p class="mt-4 whitespace-pre-wrap text-sm leading-6">{item().briefText}</p>
          <Show when={!sent()} fallback={<div class="mt-5 rounded-xl bg-emerald-50 p-4"><h2 class="font-semibold text-emerald-950">Proposal received</h2><p class="mt-1 text-sm text-emerald-900">The couple can now review it in OmnyID Wedding. This did not confirm a booking.</p></div>}>
            <form class="mt-5 grid gap-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
              <label class="text-sm font-medium">Business name<input required maxLength={240} value={businessName()} onInput={(event) => setBusinessName(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" /></label>
              <label class="text-sm font-medium">Business email<input required type="email" value={businessEmail()} onInput={(event) => setBusinessEmail(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" /></label>
              <label class="text-sm font-medium">Proposal details<textarea required maxLength={12000} rows={7} value={message()} onInput={(event) => setMessage(event.currentTarget.value)} class="mt-1 w-full rounded-lg border border-wedding-muted p-3" /></label>
              <div class="grid gap-3 sm:grid-cols-2"><label class="text-sm font-medium">Indicative total (AUD)<input type="number" min="0" step="0.01" value={amount()} onInput={(event) => setAmount(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" /></label><label class="text-sm font-medium">Valid until<input type="date" value={validUntil()} onInput={(event) => setValidUntil(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" /></label></div>
              <p class="text-xs leading-5 text-wedding-muted">This private link is not indexed. Your response goes only to this couple's Wedding workspace and does not create a booking.</p>
              <button type="submit" disabled={busy()} class="min-h-11 rounded-lg bg-wedding-accent px-5 font-bold text-white disabled:opacity-50">{busy() ? "Sending…" : "Send proposal"}</button>
            </form>
          </Show></>}
        </Show>
      </Show>
      <Show when={error()}>{(message) => <p class="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-900" role="alert">{message()}</p>}</Show>
    </section>
  </main>;
}
