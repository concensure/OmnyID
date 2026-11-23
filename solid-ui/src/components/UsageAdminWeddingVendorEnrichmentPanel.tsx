import { For, Show, createMemo, createSignal } from "solid-js";

import type { WeddingVendor } from "@/lib/api";
import {
  applyAdminWeddingVendorEnrichment,
  fetchAdminWeddingVendorEnrichmentCoverage,
  proposeAdminWeddingVendorEnrichment,
  type AdminWeddingVendorEnrichmentCoverage,
  type WeddingVendorEnrichmentProposal,
} from "@/lib/weddingVendorEnrichmentApi";

function proposalLabel(proposal: WeddingVendorEnrichmentProposal): string {
  return proposal.key.replace(/_/g, " ");
}

export default function UsageAdminWeddingVendorEnrichmentPanel(props: {
  vendors: WeddingVendor[];
  disabled?: boolean;
  onApplied: () => void;
}) {
  const venues = createMemo(() => props.vendors.filter((vendor) => vendor.category.toLowerCase() === "venue"));
  const [selectedVendorIds, setSelectedVendorIds] = createSignal<string[]>([]);
  const [proposals, setProposals] = createSignal<WeddingVendorEnrichmentProposal[]>([]);
  const [approved, setApproved] = createSignal<Set<number>>(new Set());
  const [approvalToken, setApprovalToken] = createSignal<string | null>(null);
  const [coverage, setCoverage] = createSignal<AdminWeddingVendorEnrichmentCoverage | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const approvedProposals = createMemo(() => proposals().filter((_, index) => approved().has(index)));

  function toggleVendor(vendorId: string, checked: boolean) {
    setSelectedVendorIds((current) => {
      if (!checked) return current.filter((id) => id !== vendorId);
      return current.includes(vendorId) || current.length >= 25 ? current : [...current, vendorId];
    });
  }

  function toggleApproved(index: number, checked: boolean) {
    setApproved((current) => {
      const next = new Set(current);
      if (checked) next.add(index);
      else next.delete(index);
      return next;
    });
  }

  async function loadCoverage() {
    setBusy(true);
    setError(null);
    try { setCoverage(await fetchAdminWeddingVendorEnrichmentCoverage()); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load catalog coverage."); }
    finally { setBusy(false); }
  }

  async function propose() {
    if (selectedVendorIds().length === 0) {
      setError("Select one to 25 venues to propose enrichment.");
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await proposeAdminWeddingVendorEnrichment(selectedVendorIds());
      setProposals(result.proposals);
      setApproved(new Set<number>());
      setApprovalToken(result.approvalToken ?? null);
      setMessage(result.status === "proposed"
        ? `${result.proposals.length} evidence-bounded proposals are ready for review${result.model ? ` (${result.model})` : ""}.`
        : "No proposals were produced; the deterministic catalog is unchanged.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not propose catalog enrichment.");
    } finally { setBusy(false); }
  }

  async function applyApproved() {
    const token = approvalToken();
    if (!token || approvedProposals().length === 0) {
      setError("Approve at least one proposal from the current reviewed batch.");
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await applyAdminWeddingVendorEnrichment(token, approvedProposals());
      setMessage(`${approvedProposals().length} approved proposals were submitted. Stronger catalog evidence remains protected.`);
      setProposals([]);
      setApproved(new Set<number>());
      setApprovalToken(null);
      props.onApplied();
      void loadCoverage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply the reviewed catalog proposals.");
    } finally { setBusy(false); }
  }

  return (
    <section class="mt-4 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p class="text-sm font-semibold text-slate-950">Venue catalog enrichment</p>
          <p class="mt-1 text-xs leading-5 text-slate-700">Select venues, review exact evidence quotes, then approve the unchanged attributes to apply. This pass is venues only.</p>
        </div>
        <button type="button" class="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-60" disabled={busy() || props.disabled} onClick={() => void loadCoverage()}>Coverage report</button>
      </div>
      <Show when={message()}>{(value) => <p class="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900" aria-live="polite">{value()}</p>}</Show>
      <Show when={error()}>{(value) => <p class="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900" role="alert">{value()}</p>}</Show>
      <Show when={coverage()}>{(report) => <p class="mt-3 text-xs text-slate-700">Active venues: {report().activeVenues}. Facets {report().coverage.styleFacets}, capacity {report().coverage.capacity}, price {report().coverage.price}, coordinates {report().coverage.coordinates}.</p>}</Show>
      <div class="mt-3 grid max-h-44 gap-1 overflow-y-auto rounded-lg border border-amber-100 bg-white p-2 sm:grid-cols-2">
        <For each={venues()} fallback={<p class="p-2 text-xs text-slate-600">No venues in the loaded catalog.</p>}>
          {(venue) => <label class="flex min-w-0 items-center gap-2 rounded px-2 py-1 text-xs text-slate-800">
            <input type="checkbox" checked={selectedVendorIds().includes(venue.vendorId)} disabled={busy() || props.disabled || (!selectedVendorIds().includes(venue.vendorId) && selectedVendorIds().length >= 25)} onChange={(event) => toggleVendor(venue.vendorId, event.currentTarget.checked)} />
            <span class="truncate">{venue.vendorName}</span>
          </label>}
        </For>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" class="rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60" disabled={busy() || props.disabled} onClick={() => void propose()}>{busy() ? "Working..." : `Propose for ${selectedVendorIds().length} venue${selectedVendorIds().length === 1 ? "" : "s"}`}</button>
        <Show when={proposals().length > 0}><span class="text-xs text-slate-600">Changes are never auto-applied or editable after sealing.</span></Show>
      </div>
      <Show when={proposals().length > 0}>
        <div class="mt-4 overflow-x-auto rounded-lg border border-amber-100 bg-white">
          <table class="min-w-full text-left text-xs">
            <thead class="bg-amber-50 text-slate-700"><tr><th class="p-2">Approve</th><th class="p-2">Venue</th><th class="p-2">Attribute</th><th class="p-2">Value</th><th class="p-2">Evidence quote</th></tr></thead>
            <tbody><For each={proposals()}>{(proposal, index) => <tr class="border-t border-slate-100 align-top">
              <td class="p-2"><input aria-label={`Approve ${proposalLabel(proposal)}`} type="checkbox" checked={approved().has(index())} disabled={busy() || props.disabled} onChange={(event) => toggleApproved(index(), event.currentTarget.checked)} /></td>
              <td class="p-2 font-medium text-slate-900">{props.vendors.find((vendor) => vendor.vendorId === proposal.vendorId)?.vendorName ?? proposal.vendorId}</td>
              <td class="p-2">{proposalLabel(proposal)}<br /><span class="text-slate-500">{proposal.sourceKind}, {Math.round(proposal.confidence * 100)}%</span></td>
              <td class="p-2"><code class="break-words text-[11px]">{JSON.stringify(proposal.value)}</code></td>
              <td class="max-w-sm p-2 leading-5 text-slate-700"><mark class="rounded bg-amber-100 px-1 text-slate-900">{proposal.quote}</mark></td>
            </tr>}</For></tbody>
          </table>
        </div>
        <button type="button" class="mt-3 rounded-lg border border-emerald-300 bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60" disabled={busy() || props.disabled || approvedProposals().length === 0 || !approvalToken()} onClick={() => void applyApproved()}>Apply approved ({approvedProposals().length})</button>
      </Show>
    </section>
  );
}
