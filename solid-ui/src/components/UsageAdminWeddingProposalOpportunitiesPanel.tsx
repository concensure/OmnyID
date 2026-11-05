import { createResource, For, Show } from "solid-js";

import { apiFetch } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";

type Row = { category: string; opportunities: number; replies: number; claimedVendorViews: number; shares: number };
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;

async function loadRows(): Promise<Row[]> {
  const result = await apiFetch<Record<string, unknown>>("/admin/wedding/proposal-opportunities");
  return (Array.isArray(result.categories) ? result.categories : []).flatMap((value) => {
    const row = isRecord(value) ? value : {};
    const category = clean(row.category);
    return category ? [{
      category, opportunities: count(row.opportunities), replies: count(row.replies),
      claimedVendorViews: count(row.claimed_vendor_views), shares: count(row.shares),
    }] : [];
  });
}

export default function UsageAdminWeddingProposalOpportunitiesPanel() {
  const [rows, { refetch }] = createResource(loadRows);
  return <section class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="admin-proposal-opportunities-title">
    <div class="flex flex-wrap items-start justify-between gap-3"><div><h2 id="admin-proposal-opportunities-title" class="font-semibold text-slate-950">Wedding proposal opportunities</h2><p class="mt-1 text-sm text-slate-600">Privacy-bounded category activity. Couple details and proposal content are not shown here.</p></div><button type="button" class="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold" onClick={() => void refetch()}>Refresh</button></div>
    <Show when={!rows.loading} fallback={<p class="mt-3 text-sm">Loading proposal activity…</p>}>
      <Show when={(rows()?.length ?? 0) > 0} fallback={<p class="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No proposal opportunities have been published.</p>}>
        <div class="mt-3 overflow-x-auto"><table class="min-w-full text-left text-sm"><thead><tr class="border-b border-slate-200"><th class="p-2">Category</th><th class="p-2">Waiting</th><th class="p-2">Replies</th><th class="p-2">Claimed vendor views</th><th class="p-2">Secure links</th></tr></thead><tbody><For each={rows()}>{(row) => <tr class="border-b border-slate-100"><th class="p-2 font-semibold">{row.category}</th><td class="p-2">{row.opportunities}</td><td class="p-2">{row.replies}</td><td class="p-2">{row.claimedVendorViews}</td><td class="p-2">{row.shares}</td></tr>}</For></tbody></table></div>
      </Show>
    </Show>
  </section>;
}
