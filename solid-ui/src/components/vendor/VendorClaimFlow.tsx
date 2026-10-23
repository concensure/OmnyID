// @module-id: wedding.vendor-claim-flow
// @primary-capability: mobile-vendor-claim-and-photo-management
// @locs-version: 1.0
// @stability: beta
// @owner: omnyid
import { createSignal, onMount, Show } from "solid-js";

import { VendorOwnershipProofPanel } from "@/components/vendor/VendorOwnershipProofPanel";
import { VendorProfileDashboard } from "@/components/vendor/VendorProfileDashboard";
import { getVendorClaim, startVendorClaim, type VendorClaim } from "@/lib/vendorClaimApi";

const slugFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  return (params.get("vendor_slug") ?? params.get("vendor") ?? "").trim().toLowerCase();
};

export function VendorClaimFlow() {
  const [vendorSlug, setVendorSlug] = createSignal(slugFromUrl());
  const [role, setRole] = createSignal("owner");
  const [claim, setClaim] = createSignal<VendorClaim | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const loadExisting = async () => {
    const slug = vendorSlug().trim();
    if (!slug) return;
    setBusy(true);
    setError(null);
    try {
      setClaim(await getVendorClaim(slug));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not check this vendor claim.");
    } finally {
      setBusy(false);
    }
  };
  const begin = async () => {
    const slug = vendorSlug().trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setError("Enter the listing handle from your directory URL (lowercase letters, numbers, and hyphens).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setClaim(await startVendorClaim({ vendorSlug: slug, declaredRole: role() }));
      window.history.replaceState(null, "", `?vendor_slug=${encodeURIComponent(slug)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not start this claim.");
    } finally {
      setBusy(false);
    }
  };
  onMount(() => {
    if (vendorSlug()) void loadExisting();
  });

  return (
    <main class="mx-auto min-h-screen max-w-2xl bg-wedding-surface px-4 py-8 text-wedding-text sm:px-6">
      <a href="/wedding/vendors.html" class="text-sm font-semibold text-wedding-accent">← Wedding vendor directory</a>
      <header class="mt-6">
        <p class="text-xs font-bold uppercase tracking-[0.16em] text-wedding-accent">Vendor portal</p>
        <h1 class="mt-2 text-3xl font-bold">Claim and manage your listing</h1>
        <p class="mt-2 text-sm leading-6 text-wedding-muted">Prove ownership, correct your public details, manage licensed photos, and answer private quotation requests.</p>
      </header>
      <Show when={!claim()}>
        <section class="mt-6 rounded-2xl border border-wedding-muted bg-white p-5 shadow-sm">
          <h2 class="text-lg font-semibold">1. Find your listing</h2>
          <label class="mt-4 block text-sm font-medium">Listing handle
            <input class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" value={vendorSlug()} placeholder="e.g. harbour-view-florist" disabled={busy()} onInput={(event) => setVendorSlug(event.currentTarget.value.toLowerCase())} />
          </label>
          <label class="mt-4 block text-sm font-medium">Your role
            <select class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" value={role()} disabled={busy()} onChange={(event) => setRole(event.currentTarget.value)}>
              <option value="owner">Business owner</option><option value="manager">Manager</option><option value="marketing">Marketing contact</option><option value="other">Other authorised representative</option>
            </select>
          </label>
          <div class="mt-5 grid gap-2 sm:grid-cols-2">
            <button class="min-h-11 rounded-lg border border-wedding-accent px-4 font-bold text-wedding-accent" type="button" disabled={busy() || !vendorSlug()} onClick={() => void loadExisting()}>Check existing claim</button>
            <button class="min-h-11 rounded-lg bg-wedding-accent px-4 font-bold text-white disabled:opacity-60" type="button" disabled={busy()} onClick={() => void begin()}>{busy() ? "Working…" : "Start ownership proof"}</button>
          </div>
        </section>
      </Show>
      <Show when={claim()}>
        {(activeClaim) => <>
          <Show when={activeClaim().ownership_verified} fallback={
            <VendorOwnershipProofPanel vendorSlug={activeClaim().vendor_slug} onVerified={() => void loadExisting()} onReleased={() => setClaim(null)} />
          }>
            <VendorProfileDashboard vendorSlug={activeClaim().vendor_slug} />
          </Show>
        </>}
      </Show>
      <Show when={error()}>{(message) => <p class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{message()}</p>}</Show>
    </main>
  );
}
