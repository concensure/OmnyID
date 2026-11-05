import { createResource, createSignal, For, Show } from "solid-js";

import {
  loadClaimedVendorProposalOpportunities,
  submitClaimedVendorProposal,
  type VendorProposalOpportunity,
} from "@/lib/vendorProposalOpportunityApi";

export function VendorProposalOpportunitiesPanel(props: { vendorSlug: string }) {
  const [items, { refetch }] = createResource(() => props.vendorSlug, loadClaimedVendorProposalOpportunities);
  const [selected, setSelected] = createSignal<VendorProposalOpportunity | null>(null);
  const [message, setMessage] = createSignal("");
  const [amount, setAmount] = createSignal("");
  const [validUntil, setValidUntil] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);

  async function submit() {
    const opportunity = selected();
    if (!opportunity || !message().trim() || busy()) return;
    setBusy(true); setNotice(null);
    try {
      await submitClaimedVendorProposal({
        vendorSlug: props.vendorSlug, opportunityId: opportunity.opportunityId,
        message: message().trim(), amount: amount() ? Number(amount()) : undefined,
        currency: "AUD", validUntil: validUntil() || undefined,
      });
      setNotice("Proposal sent to the couple for review.");
      setSelected(null); setMessage(""); setAmount(""); setValidUntil("");
      await refetch();
    } catch { setNotice("The proposal could not be sent. Check the details and try again."); }
    finally { setBusy(false); }
  }

  return (
    <section class="rounded-xl border border-wedding-muted bg-white p-5 shadow-sm" aria-labelledby="vendor-proposal-opportunities-title">
      <h2 id="vendor-proposal-opportunities-title" class="text-lg font-semibold">Proposal opportunities</h2>
      <p class="mt-1 text-sm leading-6 text-wedding-muted">These private briefs match your verified listing category and service area. The couple sees only the details they chose to share.</p>
      <Show when={items.loading}><p class="mt-4 text-sm" role="status">Checking for matching opportunities…</p></Show>
      <Show when={!items.loading && (items()?.length ?? 0) === 0}><p class="mt-4 rounded-lg bg-wedding-surface p-3 text-sm">No matching proposal opportunities are open right now.</p></Show>
      <div class="mt-4 grid gap-3"><For each={items()}>{(item) => <article class="rounded-xl border border-wedding-muted p-4">
        <div class="flex flex-wrap items-start justify-between gap-2"><div><p class="font-semibold">{item.category}</p><p class="mt-1 text-xs text-wedding-muted">{item.location ?? "Location kept private"} · closes {new Date(item.expiresAt).toLocaleDateString()}</p></div><button type="button" class="min-h-11 rounded-lg bg-wedding-accent px-4 text-sm font-bold text-white" onClick={() => setSelected(item)}>Prepare proposal</button></div>
        <p class="mt-3 whitespace-pre-wrap text-sm leading-6">{item.briefText}</p>
        <Show when={Object.keys(item.sharedContext).length > 0}><dl class="mt-3 grid gap-2 rounded-lg bg-wedding-surface p-3 text-sm sm:grid-cols-2"><For each={Object.entries(item.sharedContext)}>{([key, value]) => <div><dt class="text-xs font-semibold uppercase text-wedding-muted">{key.replaceAll("_", " ")}</dt><dd class="mt-1">{typeof value === "string" || typeof value === "number" ? String(value) : Array.isArray(value) ? value.join(", ") : "Shared by the couple"}</dd></div>}</For></dl></Show>
      </article>}</For></div>
      <Show when={selected()}>{(item) => <form class="mt-4 rounded-xl border border-wedding-accent/30 bg-wedding-surface p-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <h3 class="font-semibold">Proposal for {item().category}</h3>
        <label class="mt-3 block text-sm font-medium">Proposal details<textarea required maxLength={12000} rows={6} value={message()} onInput={(event) => setMessage(event.currentTarget.value)} class="mt-1 w-full rounded-lg border border-wedding-muted bg-white p-3" /></label>
        <div class="mt-3 grid gap-3 sm:grid-cols-2"><label class="text-sm font-medium">Indicative total (AUD)<input type="number" min="0" step="0.01" value={amount()} onInput={(event) => setAmount(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" /></label><label class="text-sm font-medium">Valid until<input type="date" value={validUntil()} onInput={(event) => setValidUntil(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" /></label></div>
        <p class="mt-3 text-xs leading-5 text-wedding-muted">Sending creates a private proposal document for the couple. It does not confirm a booking.</p>
        <div class="mt-3 flex flex-wrap gap-2"><button type="submit" disabled={busy()} class="min-h-11 rounded-lg bg-wedding-accent px-4 font-bold text-white disabled:opacity-50">{busy() ? "Sending…" : "Send proposal"}</button><button type="button" class="min-h-11 rounded-lg border border-wedding-muted bg-white px-4 font-semibold" onClick={() => setSelected(null)}>Cancel</button></div>
      </form>}</Show>
      <Show when={notice()}>{(text) => <p class="mt-3 rounded-lg bg-wedding-surface p-3 text-sm" role="status">{text()}</p>}</Show>
    </section>
  );
}
