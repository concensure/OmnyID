// @module-id: wedding.vendor-profile-dashboard
// @primary-capability: verified-vendor-profile-quick-actions-and-preview
// @locs-version: 1.0
import { createMemo, createResource, createSignal, For, Show } from "solid-js";

import { VendorPhotoUploadPanel } from "@/components/vendor/VendorPhotoUploadPanel";
import { VendorPortalSettingsPanel } from "@/components/vendor/VendorPortalSettingsPanel";
import { VendorPublicationPanel } from "@/components/vendor/VendorPublicationPanel";
import { VendorQuotationResponsePanel } from "@/components/vendor/VendorQuotationResponsePanel";
import { VendorResourcesPanel } from "@/components/vendor/VendorResourcesPanel";
import { VendorProposalOpportunitiesPanel } from "@/components/vendor/VendorProposalOpportunitiesPanel";
import { VendorSpecialOffersPanel } from "@/components/vendor/VendorSpecialOffersPanel";
import { VendorCelebrantConsultationsPanel } from "@/components/vendor/VendorCelebrantConsultationsPanel";
import { VendorSalesOperationsPanel } from "@/components/vendor/VendorSalesOperationsPanel";
import { VendorWorkflowGuide } from "@/components/vendor/VendorWorkflowGuide";
import {
  getVendorOwnerProfile,
  updateVendorOwnerProfile,
  type VendorOwnerProfile,
} from "@/lib/vendorClaimApi";

type EditableProfile = Pick<VendorOwnerProfile,
  "description" | "contact_email" | "contact_phone" | "website_url" | "instagram_url" | "facebook_url">;

export function VendorProfileDashboard(props: { vendorSlug: string }) {
  const [profile, { mutate, refetch }] = createResource(() => props.vendorSlug, getVendorOwnerProfile);
  const [draft, setDraft] = createSignal<EditableProfile | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [saved, setSaved] = createSignal(false);
  const initialSection = new URLSearchParams(window.location.search).get("section");
  const allowedSections = ["overview", "workflows", "sales", "availability", "enquiries", "profile", "settings"] as const;
  type Section = typeof allowedSections[number];
  const [section, setSection] = createSignal<Section>(allowedSections.includes(initialSection as Section) ? initialSection as Section : "overview");
  const navigation = [
    { id: "overview" as const, label: "Overview" },
    { id: "workflows" as const, label: "How it works" },
    { id: "sales" as const, label: "Sales & records" },
    { id: "availability" as const, label: "Availability" },
    { id: "enquiries" as const, label: "Enquiries" },
    { id: "profile" as const, label: "Public profile" },
    { id: "settings" as const, label: "Settings" },
  ];

  const edit = (key: keyof EditableProfile, value: string) => {
    const source = draft() ?? profile();
    if (!source) return;
    setDraft({
      description: source.description ?? "",
      contact_email: source.contact_email ?? "",
      contact_phone: source.contact_phone ?? "",
      website_url: source.website_url ?? "",
      instagram_url: source.instagram_url ?? "",
      facebook_url: source.facebook_url ?? "",
      [key]: value,
    });
    setSaved(false);
  };

  async function save() {
    const changes = draft();
    if (!changes || busy()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateVendorOwnerProfile(props.vendorSlug, changes);
      mutate(updated);
      setDraft(null);
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Profile changes could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const value = (key: keyof EditableProfile) => String(draft()?.[key] ?? profile()?.[key] ?? "");
  const changeSection = (next: Section) => {
    setSection(next);
    const url = new URL(window.location.href);
    url.searchParams.set("section", next);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  };
  const nextActions = createMemo(() => {
    const current = profile();
    if (!current) return [];
    const actions: { label: string; section: Section; detail: string }[] = [];
    if (current.completion_percent < 100) actions.push({ label: "Complete public profile", section: "profile", detail: `${current.completion_percent}% complete` });
    if (current.photo_count < 3) actions.push({ label: "Add service photos", section: "profile", detail: `${current.photo_count} published` });
    actions.push(
      { label: "Review sales journey", section: "sales", detail: "History, exceptions, totals and room calendar" },
      { label: "Check available dates", section: "availability", detail: "Publish or update date evidence" },
      { label: "Review enquiries", section: "enquiries", detail: "Messages, proposals and quotes" },
    );
    return actions;
  });

  return (
    <div class="mt-6 grid gap-6">
      <Show when={profile.loading}><p class="text-sm text-wedding-muted" role="status">Loading your verified listing…</p></Show>
      <Show when={profile.error}><p class="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">The verified profile could not be loaded.</p></Show>
      <Show when={profile()}>{(current) => <>
        <section class="rounded-xl border border-emerald-200 bg-emerald-50 p-5" aria-labelledby="verified-listing-title">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800">Verified business</p>
              <h2 id="verified-listing-title" class="mt-1 text-xl font-semibold">{current().vendor_name}</h2>
              <p class="mt-1 text-sm text-emerald-950/75">{current().category} · {current().service_area}</p>
            </div>
            <span class="rounded-full bg-white px-3 py-1 text-sm font-bold text-emerald-800" aria-label="Verified Business badge">✓ Verified Business</span>
          </div>
          <div class="mt-4" aria-label={`Profile ${current().completion_percent}% complete`}>
            <div class="flex justify-between text-sm"><span>Profile completeness</span><strong>{current().completion_percent}%</strong></div>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-white"><div class="h-full rounded-full bg-wedding-accent" style={{ width: `${current().completion_percent}%` }} /></div>
            <Show when={current().photo_count < 3}><p class="mt-2 text-sm">Add {3 - current().photo_count} more gallery photo{3 - current().photo_count === 1 ? "" : "s"} to give couples a clearer picture of your work.</p></Show>
          </div>
        </section>

        <nav class="overflow-x-auto rounded-xl border border-wedding-muted bg-white p-2 shadow-sm lg:fixed lg:left-4 lg:top-24 lg:z-20 lg:w-52 lg:overflow-visible" aria-label="Vendor management">
          <div class="flex min-w-max gap-1 lg:min-w-0 lg:flex-col" role="tablist" aria-label="Vendor portal sections">
            <For each={navigation}>{(item) => <button type="button" role="tab" aria-selected={section() === item.id} class={`min-h-11 rounded-lg px-4 text-sm font-bold ${section() === item.id ? "bg-wedding-accent text-white" : "text-wedding-text hover:bg-wedding-surface"}`} onClick={() => changeSection(item.id)}><Show when={item.id === "workflows"}><span class="mr-2" aria-hidden="true">↝</span></Show>{item.label}</button>}</For>
          </div>
        </nav>

        <Show when={section() === "overview"}>
          <section class="rounded-xl border border-wedding-muted bg-white p-5 shadow-sm" aria-labelledby="vendor-overview-title">
            <p class="text-xs font-bold uppercase tracking-[0.16em] text-wedding-accent">Management portal</p>
            <h2 id="vendor-overview-title" class="mt-1 text-xl font-semibold">Keep the listing useful and enquiries moving</h2>
            <p class="mt-2 text-sm leading-6 text-wedding-muted">Contact details, public photos, date evidence, proposals, messages and quotes stay connected to this verified business.</p>
            <div class="mt-4 grid gap-3 sm:grid-cols-2"><For each={nextActions()}>{(item) => <button type="button" class="min-h-24 rounded-xl border border-wedding-muted bg-wedding-surface p-4 text-left hover:border-wedding-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-wedding-accent" onClick={() => changeSection(item.section)}><span class="block font-bold">{item.label}</span><span class="mt-1 block text-sm text-wedding-muted">{item.detail}</span></button>}</For></div>
          </section>
        </Show>

        <Show when={section() === "workflows"}><VendorWorkflowGuide /></Show>

        <Show when={section() === "sales"}><VendorSalesOperationsPanel vendorSlug={props.vendorSlug} /></Show>

        <Show when={section() === "profile"}><section class="rounded-xl border border-wedding-muted bg-white p-5 shadow-sm" aria-labelledby="profile-editor-title">
          <h2 id="profile-editor-title" class="text-lg font-semibold">Quick profile updates</h2>
          <p class="mt-1 text-sm text-wedding-muted">We’ve pre-filled what is already on the listing. Your verified updates are stored separately from source records.</p>
          <label class="mt-4 block text-sm font-medium">Business description
            <textarea class="mt-1 w-full rounded-lg border border-wedding-muted p-3" rows={4} maxLength={4000} value={value("description")} onInput={(event) => edit("description", event.currentTarget.value)} />
          </label>
          <div class="mt-4 grid gap-4 sm:grid-cols-2">
            <label class="text-sm font-medium">Public email<input class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" type="email" value={value("contact_email")} onInput={(event) => edit("contact_email", event.currentTarget.value)} /></label>
            <label class="text-sm font-medium">Public phone<input class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" value={value("contact_phone")} onInput={(event) => edit("contact_phone", event.currentTarget.value)} /></label>
            <label class="text-sm font-medium">Website<input class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" type="url" value={value("website_url")} onInput={(event) => edit("website_url", event.currentTarget.value)} /></label>
            <label class="text-sm font-medium">Instagram<input class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" type="url" value={value("instagram_url")} onInput={(event) => edit("instagram_url", event.currentTarget.value)} /></label>
            <label class="text-sm font-medium sm:col-span-2">Facebook Page<input class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" type="url" value={value("facebook_url")} onInput={(event) => edit("facebook_url", event.currentTarget.value)} /></label>
          </div>
          <button type="button" class="mt-4 min-h-11 rounded-lg bg-wedding-accent px-5 font-bold text-white disabled:opacity-50" disabled={!draft() || busy()} onClick={() => void save()}>{busy() ? "Saving…" : "Save profile"}</button>
          <Show when={saved()}><p class="mt-3 text-sm text-emerald-800" role="status">Draft saved. Review the preview, then publish the fields you want couples to see.</p></Show>
          <Show when={error()}>{(message) => <p class="mt-3 text-sm text-red-800" role="alert">{message()}</p>}</Show>
        </section></Show>

        <Show when={section() === "profile"}><section class="rounded-xl border border-wedding-muted bg-wedding-surface p-5" aria-labelledby="profile-preview-title">
          <p class="text-xs font-bold uppercase tracking-[0.16em] text-wedding-accent">Draft preview</p>
          <h2 id="profile-preview-title" class="mt-1 text-xl font-semibold">{current().vendor_name} <span class="text-sm text-emerald-800">✓ Verified</span></h2>
          <p class="mt-2 text-sm leading-6 text-wedding-muted">{value("description") || "Add a description to help couples understand your service."}</p>
          <dl class="mt-4 grid gap-2 text-sm sm:grid-cols-2"><div><dt class="font-semibold">Area</dt><dd>{current().service_area}</dd></div><div><dt class="font-semibold">Contact</dt><dd>{value("contact_email") || value("contact_phone") || "Add public contact details"}</dd></div></dl>
          <p class="mt-4 rounded-lg bg-white p-3 text-xs leading-5 text-wedding-muted">Eligible saved fields and licensed live photos feed the existing public directory and comparison-card projections. Verification, independent reviews and ranking methodology remain platform-controlled.</p>
        </section>

        <VendorPublicationPanel vendorSlug={props.vendorSlug} />
        <section><h2 class="mb-3 text-lg font-semibold">Gallery photos</h2><VendorPhotoUploadPanel vendorSlug={props.vendorSlug} onPublished={() => void refetch()} /></section></Show>
        <Show when={section() === "availability"}><section class="rounded-xl border border-wedding-muted bg-wedding-surface p-4"><h2 class="text-xl font-semibold">Availability</h2><p class="mt-1 text-sm leading-6 text-wedding-muted">Manage indicative dates here or create a scoped staff link. Calendar-open, vendor-confirmed, temporary hold and confirmed booking remain different evidence states.</p></section><VendorResourcesPanel vendorSlug={props.vendorSlug} /><VendorSpecialOffersPanel vendorSlug={props.vendorSlug} /><Show when={current().category.toLowerCase().includes("celebrant")}><VendorCelebrantConsultationsPanel vendorSlug={props.vendorSlug} /></Show></Show>
        <Show when={section() === "enquiries"}><section class="rounded-xl border border-wedding-muted bg-wedding-surface p-4"><h2 class="text-xl font-semibold">Enquiries and quotes</h2><p class="mt-1 text-sm leading-6 text-wedding-muted">Review authorised couple context, respond in the existing conversation and prepare an itemised quote. A draft is never sent without your approval.</p></section><VendorProposalOpportunitiesPanel vendorSlug={props.vendorSlug} /><VendorQuotationResponsePanel /></Show>
        <Show when={section() === "settings"}><VendorPortalSettingsPanel vendorSlug={props.vendorSlug} /></Show>
      </>}</Show>
    </div>
  );
}
