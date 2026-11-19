import UsageAdminVendorCalendars from "./UsageAdminVendorCalendars";
import QRCode from "qrcode";
import { createMemo, createResource, createSignal, For, Show } from "solid-js";

import { apiFetch } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";

type Vendor = {
  vendorId: string; vendorSlug: string; vendorName: string; serviceArea: string;
  claimStatus: string; listingStatus: string; registerStatus: string; registerType: string | null;
  registerSourceUrl: string | null; registerEvidenceRef: string | null; registerCheckedAt: string | null;
  participationStatus: string; outreachChannel: string | null; outreachStatus: string | null;
  outreachSentAt: string | null; followUpDueAt: string | null; optedOutAt: string | null;
  generatedLinks: number; openedLinks: number;
  latestOpenedAt: string | null; activeGrantId: string | null; activeLinkExpiresAt: string | null;
};
type Link = { grant_id: string; vendor_id: string; vendor_name: string; management_url: string; expires_at: string; rotated_previous_links: boolean };
type BatchReply = { created: Link[]; skipped: Array<{ vendor_id: string; status: number; reason: string }>; notice: string };
type MetricDay = { day: string; qualifiedCouples: number; availabilityVendorsMaintained: number; completedVenueEnquiries: number };
type Metrics = {
  windowDays: number; freshAvailabilityVendors: number; qualifiedCouples: number;
  availabilityVendorsMaintained: number; completedVenueEnquiries: number;
  series: MetricDay[]; definitions: Record<string, string>; generatedAt: string;
  celebrantFunnel: Record<string, number>;
};
type Readiness = { managementLinksConfigured: boolean; consultationsEnabled: boolean; phoneVerificationConfigured: boolean; notice: string };
type Dashboard = { vendors: Vendor[]; metrics: Metrics; readiness: Readiness };
type ListingPreview = {
  candidate: { vendor_name: string; service_area: string; source_url: string };
  duplicates: Array<{ vendor_id: string; vendor_name: string; category: string; status: string }>;
  can_create: boolean;
  notice: string;
};
const OFFICIAL_REGISTER_URL = "https://www.ag.gov.au/families-and-marriage/marriage/find-marriage-celebrant";
const text = (value: unknown) => typeof value === "string" ? value : "";
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;

async function load(days: number): Promise<Dashboard> {
  const payload = await apiFetch<Record<string, unknown>>(`/admin/wedding/celebrant-management?days=${days}`);
  const vendors = (Array.isArray(payload.vendors) ? payload.vendors : []).flatMap((candidate) => {
    const row = isRecord(candidate) ? candidate : {}; const vendorId = text(row.vendor_id); const vendorName = text(row.vendor_name);
    return vendorId && vendorName ? [{
      vendorId, vendorName, vendorSlug: text(row.vendor_slug), serviceArea: text(row.service_area),
      claimStatus: text(row.claim_status), listingStatus: text(row.listing_status) || "active",
      registerStatus: text(row.register_status) || "pending", registerType: text(row.register_type) || null,
      registerSourceUrl: text(row.register_source_url) || null, registerEvidenceRef: text(row.register_evidence_ref) || null,
      registerCheckedAt: text(row.register_checked_at) || null, participationStatus: text(row.participation_status) || "not_asked",
      outreachChannel: text(row.outreach_channel) || null, outreachStatus: text(row.outreach_status) || null,
      outreachSentAt: text(row.outreach_sent_at) || null, followUpDueAt: text(row.follow_up_due_at) || null,
      optedOutAt: text(row.opted_out_at) || null,
      generatedLinks: count(row.generated_links), openedLinks: count(row.opened_links), latestOpenedAt: text(row.latest_opened_at) || null,
      activeGrantId: text(row.active_grant_id) || null, activeLinkExpiresAt: text(row.active_link_expires_at) || null,
    }] : [];
  });
  const metrics = isRecord(payload.metrics) ? payload.metrics : {};
  const readiness = isRecord(payload.readiness) ? payload.readiness : {};
  const definitions = isRecord(metrics.definitions) ? Object.fromEntries(Object.entries(metrics.definitions).map(([key, value]) => [key, text(value)])) : {};
  const series = (Array.isArray(metrics.series) ? metrics.series : []).flatMap((candidate) => {
    const row = isRecord(candidate) ? candidate : {}; const day = text(row.day);
    return day ? [{ day, qualifiedCouples: count(row.qualified_couples), availabilityVendorsMaintained: count(row.availability_vendors_maintained), completedVenueEnquiries: count(row.completed_venue_enquiries) }] : [];
  });
  return { vendors, readiness: {
    managementLinksConfigured: readiness.management_links_configured === true,
    consultationsEnabled: readiness.consultations_enabled === true,
    phoneVerificationConfigured: readiness.phone_verification_configured === true,
    notice: text(readiness.notice),
  }, metrics: {
    windowDays: count(metrics.window_days) || days, freshAvailabilityVendors: count(metrics.fresh_availability_vendors),
    qualifiedCouples: count(metrics.qualified_couples), availabilityVendorsMaintained: count(metrics.availability_vendors_maintained),
    completedVenueEnquiries: count(metrics.completed_venue_enquiries), series, definitions, generatedAt: text(metrics.generated_at),
    celebrantFunnel: isRecord(metrics.celebrant_funnel) ? Object.fromEntries(Object.entries(metrics.celebrant_funnel).map(([key, value]) => [key, count(value)])) : {},
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
  const [batchSelection, setBatchSelection] = createSignal<string[]>([]);
  const [batchLinks, setBatchLinks] = createSignal<Link[]>([]);
  const [workflowFilter, setWorkflowFilter] = createSignal("all");
  const [registerStatus, setRegisterStatus] = createSignal("requires_review");
  const [registerEvidence, setRegisterEvidence] = createSignal("");
  const [outreachChannel, setOutreachChannel] = createSignal("email");
  const [outreachStatus, setOutreachStatus] = createSignal("planned");
  const [outreachSentAt, setOutreachSentAt] = createSignal("");
  const [followUpDueAt, setFollowUpDueAt] = createSignal("");
  const [listingName, setListingName] = createSignal("");
  const [listingSource, setListingSource] = createSignal("");
  const [listingArea, setListingArea] = createSignal("Sydney NSW");
  const [listingPreview, setListingPreview] = createSignal<ListingPreview | null>(null);
  const selected = () => vendors().find((vendor) => vendor.vendorId === vendorId());
  const eligibleForLink = (vendor: Vendor) => !vendor.activeGrantId && vendor.outreachStatus !== "opted_out";
  const filteredVendors = createMemo(() => vendors().filter((vendor) => {
    if (workflowFilter() === "follow_up_due") return vendor.outreachStatus === "follow_up_due" || Boolean(vendor.followUpDueAt && new Date(vendor.followUpDueAt) <= new Date());
    if (workflowFilter() === "unopened") return vendor.generatedLinks > 0 && vendor.openedLinks === 0;
    if (workflowFilter() === "opened_not_configured") return vendor.openedLinks > 0 && vendor.participationStatus === "not_asked";
    if (workflowFilter() === "opted_out") return vendor.outreachStatus === "opted_out";
    if (workflowFilter() === "exceptions") return vendor.registerStatus !== "verified" || vendor.participationStatus === "paused" || vendor.listingStatus !== "active";
    return true;
  }));
  const iso = (value: string) => value ? new Date(value).toISOString() : null;
  const verifyRegister = async () => {
    const vendor = selected(); if (!vendor || busy()) return;
    setBusy(true); setNotice("");
    try {
      await apiFetch("/admin/wedding/celebrant-consultations/verification", { method: "POST", bodyJson: {
        vendor_slug: vendor.vendorSlug, status: registerStatus(),
        register_type: registerStatus() === "verified" ? "commonwealth" : null,
        evidence_ref: registerEvidence().trim() || null,
      } });
      setNotice(`${vendor.vendorName}'s official-register status was recorded with source and operator audit.`);
      await refetch();
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Register status could not be saved."); }
    finally { setBusy(false); }
  };
  const saveOutreach = async () => {
    const vendor = selected(); if (!vendor || busy()) return;
    setBusy(true); setNotice("");
    try {
      await apiFetch("/admin/wedding/celebrant-management/outreach", { method: "POST", bodyJson: {
        vendor_id: vendor.vendorId, channel: outreachChannel(), status: outreachStatus(),
        sent_at: iso(outreachSentAt()), follow_up_due_at: iso(followUpDueAt()),
      } });
      setNotice(outreachStatus() === "opted_out" ? "Opt-out recorded and every active management link revoked." : "Content-light outreach status saved. No message content was stored.");
      await refetch();
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Outreach status could not be saved."); }
    finally { setBusy(false); }
  };
  const previewListing = async () => {
    if (busy()) return; setBusy(true); setNotice(""); setListingPreview(null);
    try {
      const preview = await apiFetch<ListingPreview>("/admin/wedding/celebrant-management/listings/preview", { method: "POST", bodyJson: {
        business_name: listingName(), source_url: listingSource(), service_area: listingArea(),
      } });
      setListingPreview(preview); setNotice(preview.notice);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Listing preview could not be prepared."); }
    finally { setBusy(false); }
  };
  const createListing = async () => {
    if (!listingPreview()?.can_create || busy()) return; setBusy(true); setNotice("");
    try {
      const created = await apiFetch<{ vendor_name: string; notice: string }>("/admin/wedding/celebrant-management/listings", { method: "POST", bodyJson: {
        business_name: listingName(), source_url: listingSource(), service_area: listingArea(), confirm_unpublished: true,
      } });
      setNotice(`${created.vendor_name}: ${created.notice}`); setListingPreview(null); setListingName(""); setListingSource(""); await refetch();
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Unpublished listing could not be created."); }
    finally { setBusy(false); }
  };
  const generate = async () => {
    if (!vendorId() || busy()) return; setBusy(true); setNotice(""); setLink(null); setQr("");
    try {
      const created = await apiFetch<Link>("/admin/wedding/celebrant-management/links", { method: "POST", bodyJson: { vendor_id: vendorId(), expires_in_days: 14 } });
      setLink(created); setQr(await QRCode.toDataURL(created.management_url, { errorCorrectionLevel: "M", margin: 2, width: 320 }));
      setNotice("Private celebrant calendar link created. Valid earlier links remain usable and renew for 14 days when opened."); await refetch();
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
  const toggleBatch = (id: string) => setBatchSelection((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length < 100 ? [...current, id] : current);
  const generateBatch = async () => {
    const ids = batchSelection(); if (!ids.length || busy()) return;
    setBusy(true); setNotice(""); setBatchLinks([]);
    try {
      const result = await apiFetch<BatchReply>("/admin/wedding/celebrant-management/links/batch", { method: "POST", bodyJson: { vendor_ids: ids, expires_in_days: 14, replace_active: false } });
      setBatchLinks(result.created); setBatchSelection([]);
      setNotice(`${result.created.length} private link${result.created.length === 1 ? "" : "s"} created${result.skipped.length ? `; ${result.skipped.length} existing or ineligible record${result.skipped.length === 1 ? " was" : "s were"} left unchanged` : ""}. Copy them now; plaintext links are not stored.`);
      await refetch();
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "The batch links could not be created."); }
    finally { setBusy(false); }
  };
  const invitationFor = (created: Link) => `Hi ${created.vendor_name}! I'm building OmnyID Weddings in Sydney and would love to invite you to manage your wedding-date availability and optional 10-minute consultation times.\n\nI've prepared one private setup link for both calendars: ${created.management_url}\n\nNo account is needed to publish availability. The link is scoped only to your celebrant listing and expires ${new Date(created.expires_at).toLocaleDateString("en-AU")}. Couple request details and approval remain in your claimed vendor account. Interested?`;
  const copyBatchInvitations = () => navigator.clipboard.writeText(batchLinks().map(invitationFor).join("\n\n---\n\n"));
  return <section class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="admin-celebrants-title">
    <div class="flex flex-wrap items-start justify-between gap-3"><div><h2 id="admin-celebrants-title" class="font-semibold text-slate-950">Celebrant profiles and availability calendars</h2><p class="mt-1 text-sm text-slate-600">Generate one expiring, vendor-scoped link per celebrant. The same link manages wedding-date evidence and 10-minute consultation times while keeping the two calendars distinct.</p></div><button type="button" class="min-h-11 rounded-lg border px-3 text-sm font-semibold" onClick={() => void refetch()}>Refresh</button></div>
    <Show when={!dashboard.loading} fallback={<p class="mt-3 text-sm">Loading celebrants…</p>}>
      <Show when={dashboard()?.readiness}>{(readiness) => <div class={`mt-3 rounded-xl border p-3 text-sm ${readiness().managementLinksConfigured && readiness().consultationsEnabled && readiness().phoneVerificationConfigured ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}><strong class="block">Runtime readiness</strong><p class="mt-1">{readiness().notice}</p><ul class="mt-2 flex flex-wrap gap-2 text-xs"><li class="rounded-full bg-white/80 px-2 py-1">Links {readiness().managementLinksConfigured ? "ready" : "not configured"}</li><li class="rounded-full bg-white/80 px-2 py-1">Consultations {readiness().consultationsEnabled ? "enabled" : "disabled"}</li><li class="rounded-full bg-white/80 px-2 py-1">Phone verification {readiness().phoneVerificationConfigured ? "ready" : "not configured"}</li></ul></div>}</Show>
      <div class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3" aria-labelledby="wedding-commercial-funnel-title"><div class="flex flex-wrap items-end justify-between gap-3"><div><h3 id="wedding-commercial-funnel-title" class="font-semibold text-slate-950">Wedding commercial funnel</h3><p class="mt-1 text-xs text-slate-600">Content-free server evidence in Australia/Sydney time. Drafts and provider acceptance are not completed enquiries.</p></div><label class="text-xs font-semibold">Reporting window<select class="ml-2 min-h-10 rounded-lg border bg-white px-2 font-normal" value={days()} onChange={(event) => setDays(Number(event.currentTarget.value))}><option value="30">30 days</option><option value="90">90 days</option><option value="365">365 days</option></select></label></div>
        <div class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Qualified couples" value={metrics()?.qualifiedCouples ?? 0} detail={metrics()?.definitions.qualified_couples} /><MetricCard label="Fresh availability" value={metrics()?.freshAvailabilityVendors ?? 0} detail={metrics()?.definitions.fresh_availability_vendors} /><MetricCard label="Availability maintained" value={metrics()?.availabilityVendorsMaintained ?? 0} detail={metrics()?.definitions.availability_vendors_maintained} /><MetricCard label="Completed venue enquiries" value={metrics()?.completedVenueEnquiries ?? 0} detail={metrics()?.definitions.completed_venue_enquiries} /></div>
        <details class="mt-3"><summary class="cursor-pointer text-sm font-semibold">Daily evidence</summary><div class="mt-2 max-h-72 overflow-auto"><table class="min-w-full text-left text-xs"><thead class="sticky top-0 bg-slate-50"><tr><th class="p-2">Sydney day</th><th class="p-2">Qualified</th><th class="p-2">Availability vendors</th><th class="p-2">Venue enquiries</th></tr></thead><tbody><For each={(metrics()?.series ?? []).slice().reverse()}>{(row) => <tr class="border-t"><td class="p-2">{new Date(`${row.day}T12:00:00`).toLocaleDateString("en-AU")}</td><td class="p-2">{row.qualifiedCouples}</td><td class="p-2">{row.availabilityVendorsMaintained}</td><td class="p-2">{row.completedVenueEnquiries}</td></tr>}</For></tbody></table></div></details>
      </div>
      <section class="mt-4 rounded-xl border border-slate-200 p-3" aria-labelledby="celebrant-onboarding-funnel-title">
        <div class="flex flex-wrap items-end justify-between gap-3"><div><h3 id="celebrant-onboarding-funnel-title" class="font-semibold text-slate-950">Celebrant onboarding funnel</h3><p class="mt-1 text-xs text-slate-600">Content-free operational facts. A link open is not consent, publication or a completed call.</p></div><label class="text-xs font-semibold">Show<select class="ml-2 min-h-10 rounded-lg border bg-white px-2 font-normal" value={workflowFilter()} onChange={(event) => setWorkflowFilter(event.currentTarget.value)}><option value="all">All records</option><option value="follow_up_due">Follow-up due</option><option value="unopened">Invited but unopened</option><option value="opened_not_configured">Opened, not configured</option><option value="opted_out">Opted out</option><option value="exceptions">Verification or setup exceptions</option></select></label></div>
        <div class="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-5"><For each={["discovered", "invited", "opened", "configured", "opted_in", "published", "engaged", "exceptions"]}>{(key) => <MetricCard label={key.replaceAll("_", " ")} value={metrics()?.celebrantFunnel[key] ?? 0} />}</For></div>
      </section>
      <details class="mt-4 rounded-xl border border-slate-200 p-3"><summary class="cursor-pointer font-semibold text-slate-950">Add a minimal unpublished celebrant listing</summary><p class="mt-2 text-xs leading-5 text-slate-600">Searches canonical vendors first. Creation never verifies, claims or publishes the celebrant.</p><div class="mt-3 grid gap-2 lg:grid-cols-3"><label class="text-xs font-semibold">Business name<input class="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal" value={listingName()} onInput={(event) => setListingName(event.currentTarget.value)} /></label><label class="text-xs font-semibold">Public source URL<input type="url" class="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal" value={listingSource()} onInput={(event) => setListingSource(event.currentTarget.value)} /></label><label class="text-xs font-semibold">Service area<input class="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal" value={listingArea()} onInput={(event) => setListingArea(event.currentTarget.value)} /></label></div><button type="button" disabled={!listingName().trim() || !listingSource().trim() || busy()} class="mt-3 min-h-11 rounded-lg border px-4 text-sm font-semibold disabled:opacity-50" onClick={() => void previewListing()}>Check duplicates and preview</button><Show when={listingPreview()}>{(preview) => <div class="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><p><strong>{preview().candidate.vendor_name}</strong> · {preview().candidate.service_area}</p><p class="mt-1 text-xs">{preview().duplicates.length ? `${preview().duplicates.length} possible duplicate(s) found. Open the existing record instead.` : "No exact name or source URL duplicate found."}</p><Show when={preview().duplicates.length}><ul class="mt-2 list-disc pl-5 text-xs"><For each={preview().duplicates}>{(duplicate) => <li>{duplicate.vendor_name} · {duplicate.category} · {duplicate.status}</li>}</For></ul></Show><button type="button" disabled={!preview().can_create || busy()} class="mt-3 min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void createListing()}>Create unpublished listing</button></div>}</Show></details>
      <div class="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><label class="text-sm font-semibold">Celebrant<select class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" value={vendorId()} onChange={(event) => setVendorId(event.currentTarget.value)}><option value="">Choose a celebrant</option><For each={vendors()}>{(vendor) => <option value={vendor.vendorId}>{vendor.vendorName} · {vendor.serviceArea}</option>}</For></select></label><button type="button" disabled={!vendorId() || busy()} class="min-h-11 self-end rounded-lg bg-slate-900 px-4 font-semibold text-white disabled:opacity-50" onClick={() => void generate()}>{busy() ? "Working…" : "Generate link + QR"}</button><button type="button" disabled={!selected()?.activeGrantId || busy()} class="min-h-11 self-end rounded-lg border border-red-300 px-4 font-semibold text-red-800 disabled:opacity-50" onClick={() => confirm("Revoke this celebrant's active calendar link?") && void revoke()}>Revoke active link</button></div>
      <Show when={selected()}>{(vendor) => <div class="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-2"><section aria-labelledby="register-workflow-title"><div class="flex flex-wrap items-center justify-between gap-2"><h3 id="register-workflow-title" class="font-semibold">Official register check</h3><a class="text-xs font-semibold underline" href={vendor().registerSourceUrl || OFFICIAL_REGISTER_URL} target="_blank" rel="noreferrer">Open official register</a></div><p class="mt-1 text-xs text-slate-600">Current: <strong>{vendor().registerStatus.replaceAll("_", " ")}</strong><Show when={vendor().registerCheckedAt}> · checked {new Date(vendor().registerCheckedAt!).toLocaleDateString("en-AU")}</Show></p><div class="mt-2 grid gap-2 sm:grid-cols-2"><label class="text-xs font-semibold">Decision<select class="mt-1 min-h-10 w-full rounded-lg border bg-white px-2 font-normal" value={registerStatus()} onChange={(event) => setRegisterStatus(event.currentTarget.value)}><option value="verified">Verified</option><option value="not_found">Not found</option><option value="requires_review">Requires review</option><option value="rejected">Rejected</option><option value="expired">Expired</option></select></label><label class="text-xs font-semibold">Evidence reference<input class="mt-1 min-h-10 w-full rounded-lg border bg-white px-2 font-normal" value={registerEvidence()} onInput={(event) => setRegisterEvidence(event.currentTarget.value)} placeholder="Register result or operator note reference" /></label></div><button type="button" disabled={vendor().listingStatus !== "active" || busy()} class="mt-2 min-h-10 rounded-lg border bg-white px-3 text-xs font-semibold disabled:opacity-50" onClick={() => void verifyRegister()}>Record register decision</button><Show when={vendor().listingStatus !== "active"}><p class="mt-1 text-xs text-amber-800">Activate the canonical listing before recording a register decision.</p></Show></section><section aria-labelledby="outreach-workflow-title"><h3 id="outreach-workflow-title" class="font-semibold">Content-light outreach</h3><p class="mt-1 text-xs text-slate-600">Current: <strong>{vendor().outreachStatus?.replaceAll("_", " ") || "not recorded"}</strong>. Message contents are never stored here.</p><div class="mt-2 grid gap-2 sm:grid-cols-2"><label class="text-xs font-semibold">Channel<select class="mt-1 min-h-10 w-full rounded-lg border bg-white px-2 font-normal" value={outreachChannel()} onChange={(event) => setOutreachChannel(event.currentTarget.value)}><option value="email">Email</option><option value="instagram">Instagram</option><option value="phone">Phone</option><option value="other">Other</option></select></label><label class="text-xs font-semibold">Status<select class="mt-1 min-h-10 w-full rounded-lg border bg-white px-2 font-normal" value={outreachStatus()} onChange={(event) => setOutreachStatus(event.currentTarget.value)}><option value="planned">Planned</option><option value="sent">Sent</option><option value="follow_up_due">Follow-up due</option><option value="responded">Responded</option><option value="opted_out">Opted out</option></select></label><label class="text-xs font-semibold">Sent at<input type="datetime-local" class="mt-1 min-h-10 w-full rounded-lg border bg-white px-2 font-normal" value={outreachSentAt()} onInput={(event) => setOutreachSentAt(event.currentTarget.value)} /></label><label class="text-xs font-semibold">Follow-up due<input type="datetime-local" class="mt-1 min-h-10 w-full rounded-lg border bg-white px-2 font-normal" value={followUpDueAt()} onInput={(event) => setFollowUpDueAt(event.currentTarget.value)} /></label></div><button type="button" disabled={busy()} class={`mt-2 min-h-10 rounded-lg border bg-white px-3 text-xs font-semibold ${outreachStatus() === "opted_out" ? "border-red-300 text-red-800" : ""}`} onClick={() => outreachStatus() !== "opted_out" || confirm("Record opt-out and revoke every active management link for this celebrant?") ? void saveOutreach() : undefined}>Save outreach status</button></section></div>}</Show>
      <Show when={notice()}><p class="mt-2 rounded-lg bg-slate-50 p-3 text-sm" role="status">{notice()}</p></Show>
      <Show when={link()} keyed>{(created) => <div class="mt-3 grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_12rem]"><div><p class="text-sm font-semibold">{created.vendor_name}'s private availability link</p><p class="mt-1 break-all text-xs text-slate-600">{created.management_url}</p><p class="mt-2 text-xs text-slate-600">Expires {new Date(created.expires_at).toLocaleString("en-AU")}. It opens separate wedding-date and phone-consultation calendars for this celebrant only.</p><button type="button" class="mt-3 min-h-11 rounded-lg border px-3 text-sm font-semibold" onClick={() => void navigator.clipboard.writeText(created.management_url)}>Copy link</button></div><Show when={qr()}>{(src) => <div><img class="mx-auto aspect-square w-48" src={src()} alt={`QR code for ${created.vendor_name}'s private availability calendars`} /><a class="mt-2 block text-center text-xs font-semibold underline" href={src()} download={`${created.vendor_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-calendar.png`}>Download QR code</a></div>}</Show></div>}</Show>
      <UsageAdminVendorCalendars />
      <section class="mt-4 rounded-xl border border-slate-200 p-3" aria-labelledby="celebrant-batch-links-title"><div class="flex flex-wrap items-start justify-between gap-2"><div><h3 id="celebrant-batch-links-title" class="font-semibold text-slate-950">Prepare several outreach links</h3><p class="mt-1 text-xs leading-5 text-slate-600">Select up to 100 celebrants without an active link. Existing links are kept; each new bearer link is shown once and never written to analytics or an ordinary export.</p></div><div class="flex flex-wrap gap-2"><button type="button" class="min-h-10 rounded-lg border px-3 text-xs font-semibold" onClick={() => setBatchSelection(vendors().filter(eligibleForLink).slice(0, 100).map((vendor) => vendor.vendorId))}>Select linkless</button><button type="button" disabled={!batchSelection().length || busy()} class="min-h-10 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-50" onClick={() => void generateBatch()}>Generate {batchSelection().length || "selected"}</button></div></div>
        <div class="mt-3 grid max-h-64 gap-2 overflow-auto sm:grid-cols-2"><For each={vendors()}>{(vendor) => <label class={`flex min-h-11 items-center gap-2 rounded-lg border p-2 text-sm ${eligibleForLink(vendor) ? "bg-white" : "bg-slate-50 text-slate-500"}`}><input type="checkbox" disabled={!eligibleForLink(vendor) || busy()} checked={batchSelection().includes(vendor.vendorId)} onChange={() => toggleBatch(vendor.vendorId)} /><span><strong class="block text-slate-900">{vendor.vendorName}</strong><span class="text-xs">{vendor.outreachStatus === "opted_out" ? "Opted out — links blocked" : vendor.activeGrantId ? "Active link kept" : `${vendor.serviceArea} · ready to generate`}</span></span></label>}</For></div>
        <Show when={batchLinks().length > 0}><div class="mt-3 rounded-lg bg-amber-50 p-3"><div class="flex flex-wrap items-center justify-between gap-2"><p class="text-sm font-semibold text-amber-950">Copy these {batchLinks().length} invitations before leaving this page.</p><button type="button" class="min-h-10 rounded-lg border border-amber-400 bg-white px-3 text-xs font-semibold" onClick={() => void copyBatchInvitations()}>Copy all invitations</button></div><div class="mt-2 grid gap-2"><For each={batchLinks()}>{(created) => <details class="rounded-lg bg-white p-2"><summary class="cursor-pointer text-sm font-semibold">{created.vendor_name}</summary><p class="mt-2 whitespace-pre-wrap break-all text-xs leading-5 text-slate-700">{invitationFor(created)}</p><button type="button" class="mt-2 min-h-10 rounded-lg border px-3 text-xs font-semibold" onClick={() => void navigator.clipboard.writeText(invitationFor(created))}>Copy this invitation</button></details>}</For></div></div></Show>
      </section>
      <div class="mt-4 overflow-x-auto"><table class="min-w-full text-left text-sm"><thead><tr class="border-b"><th class="p-2">Celebrant</th><th class="p-2">Listing</th><th class="p-2">Register</th><th class="p-2">Outreach</th><th class="p-2">Participation</th><th class="p-2">Links / opened</th><th class="p-2">Active until</th></tr></thead><tbody><For each={filteredVendors()}>{(vendor) => <tr class="border-b"><th class="p-2"><button type="button" class="text-left font-semibold underline-offset-2 hover:underline" onClick={() => setVendorId(vendor.vendorId)}>{vendor.vendorName}</button><span class="block text-xs font-normal text-slate-500">{vendor.serviceArea}</span></th><td class="p-2 capitalize">{vendor.listingStatus} · {vendor.claimStatus}</td><td class="p-2 capitalize">{vendor.registerStatus.replaceAll("_", " ")}<Show when={vendor.registerCheckedAt}><span class="block text-xs text-slate-500">{new Date(vendor.registerCheckedAt!).toLocaleDateString("en-AU")}</span></Show></td><td class="p-2 capitalize">{vendor.outreachStatus?.replaceAll("_", " ") || "—"}<Show when={vendor.followUpDueAt}><span class="block text-xs text-slate-500">Due {new Date(vendor.followUpDueAt!).toLocaleDateString("en-AU")}</span></Show></td><td class="p-2 capitalize">{vendor.participationStatus.replaceAll("_", " ")}</td><td class="p-2">{vendor.generatedLinks} / {vendor.openedLinks}<Show when={vendor.latestOpenedAt}><span class="block text-xs text-slate-500">Opened {new Date(vendor.latestOpenedAt!).toLocaleDateString("en-AU")}</span></Show></td><td class="p-2">{vendor.activeLinkExpiresAt ? new Date(vendor.activeLinkExpiresAt).toLocaleDateString("en-AU") : "—"}</td></tr>}</For></tbody></table><Show when={!filteredVendors().length}><p class="p-4 text-sm text-slate-600">No celebrants match this operational filter.</p></Show></div>
    </Show>
  </section>;
}

function MetricCard(props: { label: string; value: number; detail?: string }) {
  return <div class="rounded-xl border border-slate-200 bg-white p-3" title={props.detail ?? ""}><p class="text-xs font-semibold uppercase tracking-wide text-slate-600">{props.label}</p><p class="mt-1 text-2xl font-bold text-slate-950">{props.value.toLocaleString("en-AU")}</p><Show when={props.detail}><p class="mt-1 text-[11px] leading-4 text-slate-500">{props.detail}</p></Show></div>;
}
