import { createResource, createSignal, For, Show } from "solid-js";

import { apiFetch } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";

type CategoryRow = { category: string; opportunities: number; replies: number; claimedVendorViews: number; shares: number };
type IntentRow = { opportunityId: string; coupleEmail: string; category: string; location: string; date: string; guests: string; briefText: string; status: string; responses: number; expiresAt: string };
type VendorRow = { slug: string; name: string; category: string; serviceArea: string; claimStatus: string; feedExpiresAt: string; feedLastViewedAt: string };
type AdminState = { categories: CategoryRow[]; intents: IntentRow[]; vendors: VendorRow[] };
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const contextLabel = (context: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = context[key];
    if (typeof value === "string" || typeof value === "number") return String(value).trim();
  }
  return "Not shared";
};

async function loadAdminState(): Promise<AdminState> {
  const result = await apiFetch<Record<string, unknown>>("/admin/wedding/proposal-opportunities");
  const categories = (Array.isArray(result.categories) ? result.categories : []).flatMap((value) => {
    const row = isRecord(value) ? value : {}; const category = clean(row.category);
    return category ? [{ category, opportunities: count(row.opportunities), replies: count(row.replies), claimedVendorViews: count(row.claimed_vendor_views), shares: count(row.shares) }] : [];
  });
  const intents = (Array.isArray(result.opportunities) ? result.opportunities : []).flatMap((value) => {
    const row = isRecord(value) ? value : {}; const opportunityId = clean(row.opportunity_id); const context = isRecord(row.shared_context) ? row.shared_context : {};
    return opportunityId ? [{
      opportunityId, coupleEmail: clean(row.couple_email), category: clean(row.category), location: clean(row.location) || contextLabel(context, ["location"]),
      date: contextLabel(context, ["wedding_date", "date", "date_or_season"]), guests: contextLabel(context, ["guest_count", "guests"]),
      briefText: clean(row.brief_text), status: clean(row.status), responses: count(row.response_count), expiresAt: clean(row.expires_at),
    }] : [];
  });
  const vendors = (Array.isArray(result.vendors) ? result.vendors : []).flatMap((value) => {
    const row = isRecord(value) ? value : {}; const slug = clean(row.vendor_slug);
    return slug ? [{ slug, name: clean(row.vendor_name), category: clean(row.category), serviceArea: clean(row.service_area), claimStatus: clean(row.claim_status), feedExpiresAt: clean(row.feed_expires_at), feedLastViewedAt: clean(row.feed_last_viewed_at) }] : [];
  });
  return { categories, intents, vendors };
}

export default function UsageAdminWeddingProposalOpportunitiesPanel() {
  const [state, { refetch }] = createResource(loadAdminState);
  const [vendorSlug, setVendorSlug] = createSignal("");
  const [leadLink, setLeadLink] = createSignal("");
  const [notice, setNotice] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  async function createLink() {
    if (!vendorSlug() || busy()) return;
    setBusy(true); setNotice(null);
    try {
      const result = await apiFetch<Record<string, unknown>>("/admin/wedding/proposal-lead-link", { method: "POST", bodyJson: { vendor_slug: vendorSlug() } });
      setLeadLink(clean(result.url));
      setNotice(`Private vendor lead link created until ${new Date(clean(result.expires_at)).toLocaleDateString()}. Creating another link for this vendor revokes it.`);
      await refetch();
    } catch { setNotice("The vendor lead link could not be created."); }
    finally { setBusy(false); }
  }

  async function revokeLink() {
    if (!vendorSlug() || busy()) return;
    setBusy(true); setNotice(null);
    try {
      await apiFetch("/admin/wedding/proposal-lead-link/revoke", { method: "POST", bodyJson: { vendor_slug: vendorSlug() } });
      setLeadLink(""); setNotice("The current vendor lead link was revoked."); await refetch();
    } catch { setNotice("The vendor lead link could not be revoked."); }
    finally { setBusy(false); }
  }

  return <section class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="admin-proposal-opportunities-title">
    <div class="flex flex-wrap items-start justify-between gap-3"><div><h2 id="admin-proposal-opportunities-title" class="font-semibold text-slate-950">Wedding proposal opportunities</h2><p class="mt-1 text-sm text-slate-600">Operator-only intent and vendor-link operations. Private plan content outside the couple's submitted proposal context is excluded.</p></div><button type="button" class="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold" onClick={() => void refetch()}>Refresh</button></div>
    <Show when={!state.loading} fallback={<p class="mt-3 text-sm">Loading proposal activity…</p>}>
      <div class="mt-4 grid gap-3 md:grid-cols-4"><For each={state()?.categories}>{(row) => <article class="rounded-xl bg-slate-50 p-3"><p class="font-semibold">{row.category}</p><p class="mt-1 text-sm">{row.opportunities} waiting · {row.replies} replies</p><p class="mt-1 text-xs text-slate-600">{row.claimedVendorViews} claimed views · {row.shares} brief links</p></article>}</For></div>
      <div class="mt-5"><h3 class="font-semibold">Submitted proposal intents</h3><p class="mt-1 text-xs text-slate-600">Email is shown only in this operator view so support can contact the account owner.</p>
        <Show when={(state()?.intents.length ?? 0) > 0} fallback={<p class="mt-3 rounded-lg bg-slate-50 p-3 text-sm">No proposal intents have been submitted.</p>}><div class="mt-3 overflow-x-auto"><table class="min-w-full text-left text-sm"><thead><tr class="border-b border-slate-200"><th class="p-2">Couple</th><th class="p-2">Category</th><th class="p-2">Date</th><th class="p-2">Location</th><th class="p-2">Guests</th><th class="p-2">Status</th><th class="p-2">Replies</th></tr></thead><tbody><For each={state()?.intents}>{(row) => <><tr class="border-b border-slate-100"><td class="p-2">{row.coupleEmail}</td><td class="p-2 font-medium">{row.category}</td><td class="p-2">{row.date}</td><td class="p-2">{row.location}</td><td class="p-2">{row.guests}</td><td class="p-2">{row.status}</td><td class="p-2">{row.responses}</td></tr><tr class="border-b border-slate-100"><td class="px-2 pb-3" colSpan={7}><details><summary class="cursor-pointer text-xs font-semibold text-slate-600">View submitted brief</summary><p class="mt-2 max-w-4xl whitespace-pre-wrap text-sm leading-6">{row.briefText}</p></details></td></tr></>}</For></tbody></table></div></Show>
      </div>
      <div class="mt-5 rounded-xl border border-slate-200 p-4"><h3 class="font-semibold">Generate a vendor lead link</h3><p class="mt-1 text-sm text-slate-600">Select an active listing. The 30-day link shows only matching open intents and grants no account access.</p>
        <label class="mt-3 block max-w-xl text-sm font-medium">Vendor<select value={vendorSlug()} onChange={(event) => { setVendorSlug(event.currentTarget.value); setLeadLink(""); }} class="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3"><option value="">Select vendor</option><For each={state()?.vendors}>{(vendor) => <option value={vendor.slug}>{vendor.name} · {vendor.category} · {vendor.serviceArea}</option>}</For></select></label>
        {vendorSlug() ? (() => { const vendor = state()?.vendors.find((item) => item.slug === vendorSlug()); return <p class="mt-2 text-xs text-slate-600">Claim: {vendor?.claimStatus || "unknown"}{vendor?.feedExpiresAt ? ` · latest link expires ${new Date(vendor.feedExpiresAt).toLocaleDateString()}` : " · no link issued"}{vendor?.feedLastViewedAt ? ` · last opened ${new Date(vendor.feedLastViewedAt).toLocaleString()}` : ""}</p>; })() : null}
        <Show when={leadLink()}>{(url) => <label class="mt-3 block text-sm font-medium">Copy this link now<input readOnly value={url()} onFocus={(event) => event.currentTarget.select()} class="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 font-normal" /></label>}</Show>
        <div class="mt-3 flex flex-wrap gap-2"><button type="button" disabled={!vendorSlug() || busy()} onClick={() => void createLink()} class="min-h-11 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-40">{busy() ? "Working…" : "Generate private link"}</button><button type="button" disabled={!vendorSlug() || busy()} onClick={() => void revokeLink()} class="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold disabled:opacity-40">Revoke current link</button></div>
        <Show when={notice()}>{(text) => <p class="mt-3 rounded-lg bg-slate-50 p-3 text-sm" role="status">{text()}</p>}</Show>
      </div>
    </Show>
  </section>;
}
