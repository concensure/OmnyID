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
const text = (value: unknown) => typeof value === "string" ? value : "";
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;

async function load(): Promise<Vendor[]> {
  const payload = await apiFetch<Record<string, unknown>>("/admin/wedding/celebrant-management");
  return (Array.isArray(payload.vendors) ? payload.vendors : []).flatMap((candidate) => {
    const row = isRecord(candidate) ? candidate : {}; const vendorId = text(row.vendor_id); const vendorName = text(row.vendor_name);
    return vendorId && vendorName ? [{
      vendorId, vendorName, vendorSlug: text(row.vendor_slug), serviceArea: text(row.service_area),
      claimStatus: text(row.claim_status), registerStatus: text(row.register_status) || "pending",
      generatedLinks: count(row.generated_links), openedLinks: count(row.opened_links), latestOpenedAt: text(row.latest_opened_at) || null,
      activeGrantId: text(row.active_grant_id) || null, activeLinkExpiresAt: text(row.active_link_expires_at) || null,
    }] : [];
  });
}

export default function UsageAdminWeddingCelebrantsPanel() {
  const [vendors, { refetch }] = createResource(load);
  const [vendorId, setVendorId] = createSignal("");
  const [link, setLink] = createSignal<Link | null>(null);
  const [qr, setQr] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const selected = () => vendors()?.find((vendor) => vendor.vendorId === vendorId());
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
    <Show when={!vendors.loading} fallback={<p class="mt-3 text-sm">Loading celebrants…</p>}>
      <div class="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><label class="text-sm font-semibold">Celebrant<select class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" value={vendorId()} onChange={(event) => setVendorId(event.currentTarget.value)}><option value="">Choose a celebrant</option><For each={vendors()}>{(vendor) => <option value={vendor.vendorId}>{vendor.vendorName} · {vendor.serviceArea}</option>}</For></select></label><button type="button" disabled={!vendorId() || busy()} class="min-h-11 self-end rounded-lg bg-slate-900 px-4 font-semibold text-white disabled:opacity-50" onClick={() => void generate()}>{busy() ? "Working…" : "Generate link + QR"}</button><button type="button" disabled={!selected()?.activeGrantId || busy()} class="min-h-11 self-end rounded-lg border border-red-300 px-4 font-semibold text-red-800 disabled:opacity-50" onClick={() => confirm("Revoke this celebrant's active calendar link?") && void revoke()}>Revoke active link</button></div>
      <Show when={notice()}><p class="mt-2 rounded-lg bg-slate-50 p-3 text-sm" role="status">{notice()}</p></Show>
      <Show when={link()} keyed>{(created) => <div class="mt-3 grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_12rem]"><div><p class="text-sm font-semibold">{created.vendor_name}'s private calendar link</p><p class="mt-1 break-all text-xs text-slate-600">{created.management_url}</p><p class="mt-2 text-xs text-slate-600">Expires {new Date(created.expires_at).toLocaleString("en-AU")}.</p><button type="button" class="mt-3 min-h-11 rounded-lg border px-3 text-sm font-semibold" onClick={() => void navigator.clipboard.writeText(created.management_url)}>Copy link</button></div><Show when={qr()}>{(src) => <div><img class="mx-auto aspect-square w-48" src={src()} alt={`QR code for ${created.vendor_name}'s private consultation calendar`} /><a class="mt-2 block text-center text-xs font-semibold underline" href={src()} download={`${created.vendor_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-calendar.png`}>Download QR code</a></div>}</Show></div>}</Show>
      <div class="mt-4 overflow-x-auto"><table class="min-w-full text-left text-sm"><thead><tr class="border-b"><th class="p-2">Celebrant</th><th class="p-2">Listing</th><th class="p-2">Register</th><th class="p-2">Links</th><th class="p-2">Opened</th><th class="p-2">Active until</th></tr></thead><tbody><For each={vendors()}>{(vendor) => <tr class="border-b"><th class="p-2">{vendor.vendorName}<span class="block text-xs font-normal text-slate-500">{vendor.serviceArea}</span></th><td class="p-2 capitalize">{vendor.claimStatus}</td><td class="p-2 capitalize">{vendor.registerStatus}</td><td class="p-2">{vendor.generatedLinks}</td><td class="p-2">{vendor.openedLinks}<Show when={vendor.latestOpenedAt}><span class="block text-xs text-slate-500">{new Date(vendor.latestOpenedAt!).toLocaleDateString("en-AU")}</span></Show></td><td class="p-2">{vendor.activeLinkExpiresAt ? new Date(vendor.activeLinkExpiresAt).toLocaleDateString("en-AU") : "—"}</td></tr>}</For></tbody></table></div>
    </Show>
  </section>;
}
