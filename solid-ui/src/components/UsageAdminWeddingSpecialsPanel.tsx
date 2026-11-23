import QRCode from "qrcode";
import { createResource, createSignal, For, Show } from "solid-js";

import { apiFetch } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";

type Row = { category: string; offers: number; active: number; fresh: number; stale: number; enquiries: number; failures: number };
type Outcome = { outcome: string; count: number };
type Vendor = { vendorId: string; vendorName: string; category: string; claimStatus: string; offerId: string | null; generatedLinks: number; visits: number; attributedSignups: number; latestClaimAt: string | null; latestVisitAt: string | null };
type Dashboard = { rows: Row[]; outcomes: Outcome[]; coverage: { active: number; mapped: number }; vendors: Vendor[] };
type GeneratedLink = { management_url: string; expires_at: string };
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const text = (value: unknown) => typeof value === "string" ? value : "";

async function loadRows(): Promise<Dashboard> {
  const value = await apiFetch<Record<string, unknown>>("/admin/wedding/vendor-specials");
  const rows = (Array.isArray(value.categories) ? value.categories : []).flatMap((candidate) => {
    const row = isRecord(candidate) ? candidate : {}; const category = text(row.category).trim();
    return category ? [{ category, offers: count(row.offers), active: count(row.active_offers), fresh: count(row.fresh_dates), stale: count(row.stale_dates), enquiries: count(row.enquiries), failures: count(row.delivery_failures) }] : [];
  });
  const outcomes = (Array.isArray(value.outcomes) ? value.outcomes : []).flatMap((candidate) => {
    const row = isRecord(candidate) ? candidate : {}; const outcome = text(row.outcome).trim(); return outcome ? [{ outcome, count: count(row.count) }] : [];
  });
  const vendors = (Array.isArray(value.vendors) ? value.vendors : []).flatMap((candidate) => {
    const row = isRecord(candidate) ? candidate : {}; const vendorId = text(row.vendor_id); const vendorName = text(row.vendor_name);
    return vendorId && vendorName ? [{ vendorId, vendorName, category: text(row.category), claimStatus: text(row.claim_status), offerId: text(row.offer_id) || null, generatedLinks: count(row.generated_links), visits: count(row.visits), attributedSignups: count(row.attributed_signups), latestClaimAt: text(row.latest_claim_at) || null, latestVisitAt: text(row.latest_visit_at) || null }] : [];
  });
  const coverage = isRecord(value.map_coverage) ? value.map_coverage : {};
  return { rows, outcomes, vendors, coverage: { active: count(coverage.active_vendors), mapped: count(coverage.mapped_vendors) } };
}

export default function UsageAdminWeddingSpecialsPanel() {
  const [dashboard, { refetch }] = createResource(loadRows);
  const [vendorId, setVendorId] = createSignal("");
  const [link, setLink] = createSignal<GeneratedLink | null>(null);
  const [qr, setQr] = createSignal(""); const [notice, setNotice] = createSignal(""); const [busy, setBusy] = createSignal(false);
  const generate = async () => {
    if (!vendorId() || busy()) return; setBusy(true); setNotice(""); setLink(null); setQr("");
    try {
      const created = await apiFetch<GeneratedLink>("/admin/wedding/vendor-specials/management-links", { method: "POST", bodyJson: { vendor_id: vendorId(), expires_in_days: 14 } });
      setLink(created); setQr(await QRCode.toDataURL(created.management_url, { errorCorrectionLevel: "M", margin: 2, width: 320 })); setNotice("Private link and QR code created. Save or share them now; the secret is shown once."); await refetch();
    } catch (error) { setNotice(error instanceof Error ? error.message : "The management link could not be created."); } finally { setBusy(false); }
  };
  return <section class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="admin-specials-title">
    <div class="flex flex-wrap justify-between gap-3"><div><h2 id="admin-specials-title" class="font-semibold text-slate-950">Wedding limited-date specials</h2><p class="mt-1 text-sm text-slate-600">Content-free supply, link visits, claims and attributed signups. QR codes are generated in this browser; the private bearer link is not sent to a third party.</p></div><button type="button" class="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold" onClick={() => void refetch()}>Refresh</button></div>
    <Show when={!dashboard.loading} fallback={<p class="mt-3 text-sm">Loading special-date activity…</p>}>
      <p class="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">Map coverage: <strong>{dashboard()?.coverage.mapped ?? 0}</strong> of <strong>{dashboard()?.coverage.active ?? 0}</strong> active vendors have usable coordinates.</p>
      <div class="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><label class="text-sm font-semibold">Vendor<select class="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal" value={vendorId()} onChange={(event) => setVendorId(event.currentTarget.value)}><option value="">Choose a vendor</option><For each={dashboard()?.vendors}>{(vendor) => <option value={vendor.vendorId} disabled={!vendor.offerId}>{vendor.vendorName} · {vendor.category}{vendor.offerId ? "" : " · add a date first"}</option>}</For></select></label><button type="button" disabled={!vendorId() || busy()} class="min-h-11 self-end rounded-lg bg-slate-900 px-4 font-semibold text-white disabled:opacity-50" onClick={() => void generate()}>{busy() ? "Generating…" : "Generate link + QR"}</button></div>
      <Show when={notice()}><p role="status" class="mt-2 rounded-lg bg-slate-50 p-3 text-sm">{notice()}</p></Show>
      <Show when={link()} keyed>{(created) => <div class="mt-3 grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_12rem]"><div><p class="text-sm font-semibold">Private calendar-management link</p><p class="mt-1 break-all text-xs text-slate-600">{created.management_url}</p><p class="mt-2 text-xs text-slate-600">Expires {new Date(created.expires_at).toLocaleString("en-AU")}.</p><button type="button" class="mt-3 min-h-11 rounded-lg border px-3 text-sm font-semibold" onClick={() => void navigator.clipboard.writeText(created.management_url)}>Copy link</button></div><Show when={qr()}>{(src) => <div><img class="mx-auto aspect-square w-48" src={src()} alt="QR code for this vendor's private calendar-management link" /><a class="mt-2 block text-center text-xs font-semibold underline" href={src()} download="vendor-calendar-link.png">Download QR code</a></div>}</Show></div>}</Show>
      <Show when={(dashboard()?.vendors.length ?? 0) > 0}><div class="mt-4 overflow-x-auto"><table class="min-w-full text-left text-sm"><thead><tr class="border-b"><th class="p-2">Vendor</th><th class="p-2">Signup / claim</th><th class="p-2">Latest signup</th><th class="p-2">Links</th><th class="p-2">Visits</th><th class="p-2">Signups attributed</th><th class="p-2">Latest visit</th></tr></thead><tbody><For each={dashboard()?.vendors}>{(vendor) => <tr class="border-b"><th class="p-2">{vendor.vendorName}<span class="block text-xs font-normal text-slate-500">{vendor.category}</span></th><td class="p-2 capitalize">{vendor.claimStatus.replaceAll("_", " ")}</td><td class="p-2">{vendor.latestClaimAt ? new Date(vendor.latestClaimAt).toLocaleDateString("en-AU") : "—"}</td><td class="p-2">{vendor.generatedLinks}</td><td class="p-2">{vendor.visits}</td><td class="p-2">{vendor.attributedSignups}</td><td class="p-2">{vendor.latestVisitAt ? new Date(vendor.latestVisitAt).toLocaleDateString("en-AU") : "—"}</td></tr>}</For></tbody></table></div></Show>
      <Show when={(dashboard()?.rows.length ?? 0) > 0}><><h3 class="mt-4 font-semibold text-slate-900">Limited Special outcomes</h3><div class="mt-2 overflow-x-auto"><table class="min-w-full text-left text-sm"><thead><tr class="border-b"><th class="p-2">Category</th><th class="p-2">Offers</th><th class="p-2">Active</th><th class="p-2">Fresh dates</th><th class="p-2">Stale</th><th class="p-2">Enquiries</th><th class="p-2">Failures</th></tr></thead><tbody><For each={dashboard()?.rows}>{(row) => <tr class="border-b"><th class="p-2">{row.category}</th><td class="p-2">{row.offers}</td><td class="p-2">{row.active}</td><td class="p-2">{row.fresh}</td><td class="p-2">{row.stale}</td><td class="p-2">{row.enquiries}</td><td class="p-2">{row.failures}</td></tr>}</For></tbody></table></div><div class="mt-3 flex flex-wrap gap-2"><For each={dashboard()?.outcomes}>{(row) => <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize">{row.outcome}: {row.count}</span>}</For></div></></Show>
    </Show>
  </section>;
}
