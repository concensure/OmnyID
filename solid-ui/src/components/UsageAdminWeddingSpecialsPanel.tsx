import { createResource, For, Show } from "solid-js";

import { apiFetch } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";

type Row = { category: string; offers: number; active: number; fresh: number; stale: number; enquiries: number; failures: number };
type Outcome = { outcome: string; count: number };
type MapCoverage = { active: number; mapped: number };
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;

async function loadRows(): Promise<{ rows: Row[]; outcomes: Outcome[]; coverage: MapCoverage }> {
  const value = await apiFetch<Record<string, unknown>>("/admin/wedding/vendor-specials");
  const rows = (Array.isArray(value.categories) ? value.categories : []).flatMap((candidate) => {
    const row = isRecord(candidate) ? candidate : {};
    const category = typeof row.category === "string" ? row.category.trim() : "";
    return category ? [{ category, offers: count(row.offers), active: count(row.active_offers), fresh: count(row.fresh_dates), stale: count(row.stale_dates), enquiries: count(row.enquiries), failures: count(row.delivery_failures) }] : [];
  });
  const outcomes = (Array.isArray(value.outcomes) ? value.outcomes : []).flatMap((candidate) => {
    const row = isRecord(candidate) ? candidate : {};
    const outcome = typeof row.outcome === "string" ? row.outcome.trim() : "";
    return outcome ? [{ outcome, count: count(row.count) }] : [];
  });
  const coverageRow = isRecord(value.map_coverage) ? value.map_coverage : {};
  return { rows, outcomes, coverage: { active: count(coverageRow.active_vendors), mapped: count(coverageRow.mapped_vendors) } };
}

export default function UsageAdminWeddingSpecialsPanel() {
  const [rows, { refetch }] = createResource(loadRows);
  return <section class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="admin-specials-title">
    <div class="flex flex-wrap justify-between gap-3"><div><h2 id="admin-specials-title" class="font-semibold text-slate-950">Wedding limited-date specials</h2><p class="mt-1 text-sm text-slate-600">Content-free supply, freshness, enquiry and failure counts by category. Delivery retries stay with the couple, so an operator cannot turn an old approval into a new send.</p></div><button type="button" class="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold" onClick={() => void refetch()}>Refresh</button></div>
    <Show when={!rows.loading} fallback={<p class="mt-3 text-sm">Loading special-date activity…</p>}><><p class="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">Map coverage: <strong>{rows()?.coverage.mapped ?? 0}</strong> of <strong>{rows()?.coverage.active ?? 0}</strong> active vendors have usable coordinates. Unmapped vendors cannot appear on the Limited Specials map.</p><Show when={(rows()?.rows.length ?? 0) > 0} fallback={<p class="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No special dates have been published.</p>}><><div class="mt-3 overflow-x-auto"><table class="min-w-full text-left text-sm"><thead><tr class="border-b"><th class="p-2">Category</th><th class="p-2">Offers</th><th class="p-2">Active</th><th class="p-2">Fresh dates</th><th class="p-2">Stale</th><th class="p-2">Enquiries</th><th class="p-2">Failures</th></tr></thead><tbody><For each={rows()?.rows}>{(row) => <tr class="border-b"><th class="p-2">{row.category}</th><td class="p-2">{row.offers}</td><td class="p-2">{row.active}</td><td class="p-2">{row.fresh}</td><td class="p-2">{row.stale}</td><td class="p-2">{row.enquiries}</td><td class="p-2">{row.failures}</td></tr>}</For></tbody></table></div><div class="mt-3 flex flex-wrap gap-2" aria-label="Limited Special outcomes"><For each={rows()?.outcomes}>{(row) => <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize">{row.outcome}: {row.count}</span>}</For></div></></Show></></Show>
  </section>;
}
