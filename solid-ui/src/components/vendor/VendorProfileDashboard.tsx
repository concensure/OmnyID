// @module-id: wedding.vendor-profile-dashboard
// @primary-capability: verified-vendor-profile-quick-actions-and-preview
// @locs-version: 1.0
import { createResource, createSignal, Show } from "solid-js";

import { VendorPhotoUploadPanel } from "@/components/vendor/VendorPhotoUploadPanel";
import { VendorQuotationResponsePanel } from "@/components/vendor/VendorQuotationResponsePanel";
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

        <section class="rounded-xl border border-wedding-muted bg-white p-5 shadow-sm" aria-labelledby="profile-editor-title">
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
          <Show when={saved()}><p class="mt-3 text-sm text-emerald-800" role="status">Profile saved and preview updated.</p></Show>
          <Show when={error()}>{(message) => <p class="mt-3 text-sm text-red-800" role="alert">{message()}</p>}</Show>
        </section>

        <section class="rounded-xl border border-wedding-muted bg-wedding-surface p-5" aria-labelledby="profile-preview-title">
          <p class="text-xs font-bold uppercase tracking-[0.16em] text-wedding-accent">Couple-facing preview</p>
          <h2 id="profile-preview-title" class="mt-1 text-xl font-semibold">{current().vendor_name} <span class="text-sm text-emerald-800">✓ Verified</span></h2>
          <p class="mt-2 text-sm leading-6 text-wedding-muted">{value("description") || "Add a description to help couples understand your service."}</p>
          <dl class="mt-4 grid gap-2 text-sm sm:grid-cols-2"><div><dt class="font-semibold">Area</dt><dd>{current().service_area}</dd></div><div><dt class="font-semibold">Contact</dt><dd>{value("contact_email") || value("contact_phone") || "Add public contact details"}</dd></div></dl>
          <div class="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Optional profile upgrades">
            <span class="rounded-lg border border-dashed border-wedding-muted bg-white p-3 text-xs text-wedding-muted">Direct messaging · planned</span>
            <span class="rounded-lg border border-dashed border-wedding-muted bg-white p-3 text-xs text-wedding-muted">Featured placement · optional plan</span>
            <span class="rounded-lg border border-dashed border-wedding-muted bg-white p-3 text-xs text-wedding-muted">Video embeds · optional plan</span>
          </div>
        </section>

        <section><h2 class="mb-3 text-lg font-semibold">Gallery photos</h2><VendorPhotoUploadPanel vendorSlug={props.vendorSlug} onPublished={() => void refetch()} /></section>
        <VendorQuotationResponsePanel />
      </>}</Show>
    </div>
  );
}
