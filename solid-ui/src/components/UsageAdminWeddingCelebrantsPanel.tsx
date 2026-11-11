import QRCode from "qrcode";
import { createResource, createSignal, For, Show } from "solid-js";

import { apiFetch } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";

type Vendor = {
  vendorId: string; vendorSlug: string; vendorName: string; serviceArea: string;
  claimStatus: string; registerStatus: string; generatedLinks: number; openedLinks: number;
  latestOpenedAt: string | null; activeGrantId: string | null; activeLinkExpiresAt: string | null;
};
type Link = { grant_id: string; vendor_name: string; management_url: string; expires_at: string; rotated_previous_links: boolean };
type MetricDay = { day: string; qualifiedCouples: number; availabilityVendorsMaintained: number; completedVenueEnquiries: number };
type Metrics = {
  windowDays: number; freshAvailabilityVendors: number; qualifiedCouples: number;
  availabilityVendorsMaintained: number; completedVenueEnquiries: number;
  series: MetricDay[]; definitions: Record<string, string>; generatedAt: string;
};
type Dashboard = { vendors: Vendor[]; metrics: Metrics };
const text = (value: unknown) => typeof value === "string" ? value : "";
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;

async function load(days: number): Promise<Dashboard> {
  const payload = await apiFetch<Record<string, unknown>>(`/admin/wedding/celebrant-management?days=${days}`);
  const vendors = (Array.isArray(payload.vendors) ? payload.vendors : []).flatMap((candidate) => {
    const row = isRecord(candidate) ? candidate : {}; const vendorId = text(row.vendor_id); const vendorName = text(row.vendor_name);
    return vendorId && vendorName ? [{
      vendorId, vendorName, vendorSlug: text(row.vendor_slug), serviceArea: text(row.service_area),
      claimStatus: text(row.claim_status), registerStatus: text(row.register_status) || "pending",
      generatedLinks: count(row.generated_links), openedLinks: count(row.opened_links), latestOpenedAt: text(row.latest_opened_at) || null,
      activeGrantId: text(row.active_grant_id) || null, activeLinkExpiresAt: text(row.active_link_expires_at) || null,
    }] : [];
  });
  const metrics = isRecord(payload.metrics) ? payload.metrics : {};
  const definitions = isRecord(metrics.definitions) ? Object.fromEntries(Object.entries(metrics.definitions).map(([key, value]) => [key, text(value)])) : {};
  const series = (Array.isArray(metrics.series) ? metrics.series : []).flatMap((candidate) => {
    const row = isRecord(candidate) ? candidate : {}; const day = text(row.day);
    return day ? [{ day, qualifiedCouples: count(row.qualified_couples), availabilityVendorsMaintained: count(row.availability_vendors_maintained), completedVenueEnquiries: count(row.completed_venue_enquiries) }] : [];
  });
  return { vendors, metrics: {
    windowDays: count(metrics.window_days) || days, freshAvailabilityVendors: count(metrics.fresh_availability_vendors),
    qualifiedCouples: count(metrics.qualified_couples), availabilityVendorsMaintained: count(metrics.availability_vendors_maintained),
    completedVenueEnquiries: count(metrics.completed_venue_enquiries), series, definitions, generatedAt: text(metrics.generated_at),
  } };
}

export default function UsageAdminWeddingCelebrantsPanel() {
  const [days, setDays] = createSignal(90);
  const [dashboard, { refetch }] = createResource(days, load);
  const vendors = () => dashboard()?.vendors ?? [];
  const metrics = () => dashboard()?.metrics;
  const [vendorId, setVendorId] = createSignal("");
  const [link, setLink] = createSignal<Link | null>(null);
  const [qr, setQr] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const selected = () => vendors().find((vendor) => vendor.vendorId === vendorId());
  const generate = async () => {
    if (!vendorId() || busy()) return; setBusy(true); setNotice(""); setLink(null); setQr("");
    try {
      const created = await apiFetch<Link>("/admin/wedding/celebrant-management/links", { method: "POST", bodyJson: { vendor_id: vendorId(), expires_in_days: 14 } });
      setLink(created); setQr(await QRCode.toDataURL(created.management_url, { errorCorrectionLevel: "M", margin: 2, width: 320 }));
      setNotice("Private celebrant calendar link created. Any earlier link for this celebrant is now invalid."); await refetch();
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "The celebrant link could not be created."); }
    finally { setBusy(false); }
  };
  const revoke = async () => {
    const vendor = selected(); if (!vendor?.activeGrantId || busy()) return;
    setBusy(true); setNotice("");
    try {
      await apiFetch(`/admin/wedding/celebrant-management/links/${encodeURIComponent(vendor.activeGrantId)}/revoke`, { method: "POST", bodyJson: { vendor_id: vendor.vendorId } });
      setLink(null); setQr(""); setNotice("The active celebrant calendar link and its sessions were revoked."); await refetch();
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "The link could not be revoked."); }
    finally { setBusy(false); }
  };
  return <section class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="admin-celebrants-title">
    <div class="flex flex-wrap items-start justify-between gap-3"><div><h2 id="admin-celebrants-title" class="font-semibold text-slate-950">Celebrant profiles and consultation calendars</h2><p class="mt-1 text-sm text-slate-600">Generate one expiring link per celebrant. The link can change that celebrant's consultation hours and live status only.</p></div><button type="button" class="min-h-11 rounded-lg border px-3 text-sm font-semibold" onClick={() => void refetch()}>Refresh</button></div>
    <Show when={!dashboard.loading} fallback={<p class="mt-3 text-sm">Loading celebrants…</p>}>
      <div class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3" aria-labelledby="wedding-commercial-funnel-title"><div class="flex flex-wrap items-end justify-between gap-3"><div><h3 id="wedding-commercial-funnel-title" class="font-semibold text-slate-950">Wedding commercial funnel</h3><p class="mt-1 text-xs text-slate-600">Content-free server evidence in Australia/Sydney time. Drafts and provider acceptance are not completed enquiries.</p></div><label class="text-xs font-semibold">Reporting window<select class="ml-2 min-h-10 rounded-lg border bg-white px-2 font-normal" value={days()} onChange={(event) => setDays(Number(event.currentTarget.value))}><option value="30">30 days</option><option value="90">90 days</option><option value="365">365 days</option></select></label></div>
        <div class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Qualified couples" value={metrics()?.qualifiedCouples ?? 0} detail={metrics()?.definitions.qualified_couples} /><MetricCard label="Fresh availability" value={metrics()?.freshAvailabilityVendors ?? 0} detail={metrics()?.definitions.fresh_availability_vendors} /><MetricCard label="Availability maintained" value={metrics()?.availabilityVendorsMaintained ?? 0} detail={metrics()?.definitions.availability_vendors_maintained} /><MetricCard label="Completed venue enquiries" value={metrics()?.completedVenueEnquiries ?? 0} detail={metrics()?.definitions.completed_venue_enquiries} /></div>
        <details class="mt-3"><summary class="cursor-pointer text-sm font-semibold">Daily evidence</summary><div class="mt-2 max-h-72 overflow-auto"><table class="min-w-full text-left text-xs"><thead class="sticky top-0 bg-slate-50"><tr><th class="p-2">Sydney day</th><th class="p-2">Qualified</th><th class="p-2">Availability vendors</th><th class="p-2">Venue enquiries</th></tr></thead><tbody><For each={(metrics()?.series ?? []).slice().reverse()}>{(row) => <tr class="border-t"><td class="p-2">{new Date(`${row.day}T12:00:00`).toLocaleDateString("en-AU")}</td><td class="p-2">{row.qualifiedCouples}</td><td class="p-2">{row.availabilityVendorsMaintained}</td><td class="p-2">{row.completedVenueEnquiries}</td></tr>}</For></tbody></table></div></details>
      </div>
      <div class="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><label class="text-sm font-semibold">Celebrant<select class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" value={vendorId()} onChange={(event) => setVendorId(event.currentTarget.value)}><option value="">Choose a celebrant</option><For each={vendors()}>{(vendor) => <option value={vendor.vendorId}>{vendor.vendorName} · {vendor.serviceArea}</option>}</For></select></label><button type="button" disabled={!vendorId() || busy()} class="min-h-11 self-end rounded-lg bg-slate-900 px-4 font-semibold text-white disabled:opacity-50" onClick={() => void generate()}>{busy() ? "Working…" : "Generate link + QR"}</button><button type="button" disabled={!selected()?.activeGrantId || busy()} class="min-h-11 self-end rounded-lg border border-red-300 px-4 font-semibold text-red-800 disabled:opacity-50" onClick={() => confirm("Revoke this celebrant's active calendar link?") && void revoke()}>Revoke active link</button></div>
      <Show when={notice()}><p class="mt-2 rounded-lg bg-slate-50 p-3 text-sm" role="status">{notice()}</p></Show>
      <Show when={link()} keyed>{(created) => <div class="mt-3 grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_12rem]"><div><p class="text-sm font-semibold">{created.vendor_name}'s private calendar link</p><p class="mt-1 break-all text-xs text-slate-600">{created.management_url}</p><p class="mt-2 text-xs text-slate-600">Expires {new Date(created.expires_at).toLocaleString("en-AU")}.</p><button type="button" class="mt-3 min-h-11 rounded-lg border px-3 text-sm font-semibold" onClick={() => void navigator.clipboard.writeText(created.management_url)}>Copy link</button></div><Show when={qr()}>{(src) => <div><img class="mx-auto aspect-square w-48" src={src()} alt={`QR code for ${created.vendor_name}'s private consultation calendar`} /><a class="mt-2 block text-center text-xs font-semibold underline" href={src()} download={`${created.vendor_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-calendar.png`}>Download QR code</a></div>}</Show></div>}</Show>
      <div class="mt-4 overflow-x-auto"><table class="min-w-full text-left text-sm"><thead><tr class="border-b"><th class="p-2">Celebrant</th><th class="p-2">Listing</th><th class="p-2">Register</th><th class="p-2">Links</th><th class="p-2">Opened</th><th class="p-2">Active until</th></tr></thead><tbody><For each={vendors()}>{(vendor) => <tr class="border-b"><th class="p-2">{vendor.vendorName}<span class="block text-xs font-normal text-slate-500">{vendor.serviceArea}</span></th><td class="p-2 capitalize">{vendor.claimStatus}</td><td class="p-2 capitalize">{vendor.registerStatus}</td><td class="p-2">{vendor.generatedLinks}</td><td class="p-2">{vendor.openedLinks}<Show when={vendor.latestOpenedAt}><span class="block text-xs text-slate-500">{new Date(vendor.latestOpenedAt!).toLocaleDateString("en-AU")}</span></Show></td><td class="p-2">{vendor.activeLinkExpiresAt ? new Date(vendor.activeLinkExpiresAt).toLocaleDateString("en-AU") : "—"}</td></tr>}</For></tbody></table></div>
    </Show>
  </section>;
}

function MetricCard(props: { label: string; value: number; detail?: string }) {
  return <div class="rounded-xl border border-slate-200 bg-white p-3" title={props.detail ?? ""}><p class="text-xs font-semibold uppercase tracking-wide text-slate-600">{props.label}</p><p class="mt-1 text-2xl font-bold text-slate-950">{props.value.toLocaleString("en-AU")}</p><Show when={props.detail}><p class="mt-1 text-[11px] leading-4 text-slate-500">{props.detail}</p></Show></div>;
}
