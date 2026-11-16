// @module-id: wedding.vendor-claim-flow
// @primary-capability: mobile-vendor-claim-and-photo-management
// @locs-version: 1.0
// @stability: beta
// @owner: omnyid
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";

import { VendorOwnershipProofPanel } from "@/components/vendor/VendorOwnershipProofPanel";
import { VendorProfileDashboard } from "@/components/vendor/VendorProfileDashboard";
import { getVendorClaim, getVendorClaimSuggestions, getVendorListingProposalCapabilities, proposeVendorListing, startVendorClaim, type VendorClaim, type VendorClaimSuggestion } from "@/lib/vendorClaimApi";

const slugFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  return (params.get("vendor_slug") ?? params.get("vendor") ?? "").trim().toLowerCase();
};

export function VendorClaimFlow() {
  const [vendorSlug, setVendorSlug] = createSignal(slugFromUrl());
  const [businessName, setBusinessName] = createSignal(slugFromUrl().replace(/-/g, " "));
  const [suggestions, setSuggestions] = createSignal<VendorClaimSuggestion[]>([]);
  const [suggestionsBusy, setSuggestionsBusy] = createSignal(false);
  const [role, setRole] = createSignal("owner");
  const [claim, setClaim] = createSignal<VendorClaim | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [claimNotice, setClaimNotice] = createSignal<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = createSignal(false);
  const [proposalEnabled, setProposalEnabled] = createSignal(false);
  const [showProposal, setShowProposal] = createSignal(false);
  const [category, setCategory] = createSignal("");
  const [serviceArea, setServiceArea] = createSignal("");
  const [websiteUrl, setWebsiteUrl] = createSignal("");
  const [businessEmail, setBusinessEmail] = createSignal("");
  let suggestionTimer: number | undefined;

  const showRequestError = (reason: unknown, fallback: string) => {
    const message = reason instanceof Error ? reason.message : fallback;
    if (/unauthori[sz]ed|session.*(?:expired|missing)|sign[ -]?in/i.test(message)) {
      setNeedsSignIn(true);
      setError("Your vendor session has expired. Sign in again to continue with this listing.");
      return;
    }
    setNeedsSignIn(false);
    setError(message || fallback);
  };

  const searchSuggestions = (value: string) => {
    setBusinessName(value);
    setVendorSlug("");
    setError(null);
    window.clearTimeout(suggestionTimer);
    if (value.trim().length < 2) { setSuggestions([]); return; }
    suggestionTimer = window.setTimeout(async () => {
      setSuggestionsBusy(true);
      try { setSuggestions(await getVendorClaimSuggestions(value.trim())); }
      catch { setSuggestions([]); }
      finally { setSuggestionsBusy(false); }
    }, 180);
  };
  const selectSuggestion = (suggestion: VendorClaimSuggestion) => {
    setBusinessName(suggestion.vendor_name);
    setVendorSlug(suggestion.vendor_slug);
    setSuggestions([]);
  };

  const loadExisting = async () => {
    const slug = vendorSlug().trim();
    if (!slug) return;
    setBusy(true);
    setError(null);
    setNeedsSignIn(false);
    setClaimNotice(null);
    try {
      const existing = await getVendorClaim(slug);
      setClaim(existing);
      if (!existing) setClaimNotice(`No ownership proof has been started for ${businessName().trim() || "this business"}. You can start one below.`);
    } catch (reason) {
      showRequestError(reason, "Could not check this vendor claim.");
    } finally {
      setBusy(false);
    }
  };
  const begin = async () => {
    const slug = vendorSlug().trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setError("Choose your business from the suggestions before starting ownership proof.");
      return;
    }
    setBusy(true);
    setError(null);
    setNeedsSignIn(false);
    setClaimNotice(null);
    try {
      setClaim(await startVendorClaim({ vendorSlug: slug, declaredRole: role() }));
      window.history.replaceState(null, "", `?vendor_slug=${encodeURIComponent(slug)}`);
    } catch (reason) {
      showRequestError(reason, "Could not start this claim.");
    } finally {
      setBusy(false);
    }
  };
  const propose = async () => {
    setBusy(true);
    setError(null);
    setNeedsSignIn(false);
    try {
      const response = await proposeVendorListing({
        businessName: businessName(), category: category(), serviceArea: serviceArea(),
        websiteUrl: websiteUrl(), businessEmail: businessEmail(), declaredRole: role(),
      });
      setClaim(response);
      setShowProposal(false);
      window.history.replaceState(null, "", `?vendor_slug=${encodeURIComponent(response.vendor_slug)}`);
    } catch (reason) {
      showRequestError(reason, "Could not submit this listing for review.");
    } finally {
      setBusy(false);
    }
  };
  onMount(() => {
    void getVendorListingProposalCapabilities().then(setProposalEnabled).catch(() => setProposalEnabled(false));
    if (vendorSlug()) void loadExisting();
  });
  onCleanup(() => window.clearTimeout(suggestionTimer));

  return (
    <main class="mx-auto min-h-screen max-w-6xl bg-wedding-surface px-4 py-8 text-wedding-text sm:px-6">
      <a href="/wedding/vendors.html" class="text-sm font-semibold text-wedding-accent">← Wedding vendor directory</a>
      <header class="mt-6">
        <p class="text-xs font-bold uppercase tracking-[0.16em] text-wedding-accent">Vendor portal</p>
        <h1 class="mt-2 text-3xl font-bold">Claim and manage your listing</h1>
        <p class="mt-2 text-sm leading-6 text-wedding-muted">Prove ownership, correct your public details, manage licensed photos, and answer private quotation requests.</p>
      </header>
      <Show when={!claim()}>
        <section class="mt-6 rounded-2xl border border-wedding-muted bg-white p-5 shadow-sm">
          <h2 class="text-lg font-semibold">1. Find your listing</h2>
          <label class="mt-4 block text-sm font-medium" for="vendor-business-name">Business name</label>
          <div class="relative mt-1">
            <input id="vendor-business-name" class="min-h-11 w-full rounded-lg border border-wedding-muted px-3" value={businessName()} placeholder="Start typing your business name" disabled={busy()} autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="vendor-business-suggestions" aria-expanded={suggestions().length > 0} onInput={(event) => searchSuggestions(event.currentTarget.value)} />
            <Show when={suggestionsBusy()}><span class="absolute right-3 top-3 text-xs text-wedding-muted" role="status">Searching…</span></Show>
            <Show when={suggestions().length > 0}>
              <ul id="vendor-business-suggestions" role="listbox" class="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-wedding-muted bg-white p-1 shadow-lg">
                <For each={suggestions()}>{(suggestion) => <li role="option" aria-selected={vendorSlug() === suggestion.vendor_slug}>
                  <button type="button" class="min-h-11 w-full rounded-md px-3 py-2 text-left hover:bg-wedding-surface-blush focus:bg-wedding-surface-blush" onClick={() => selectSuggestion(suggestion)}>
                    <span class="block font-semibold">{suggestion.vendor_name}</span><span class="block text-xs text-wedding-muted">{[suggestion.category, suggestion.service_area].filter(Boolean).join(" · ")}</span>
                  </button>
                </li>}</For>
              </ul>
            </Show>
          </div>
          <p class="mt-2 text-xs leading-5 text-wedding-muted">Choose one of the closest matches. Small spelling differences are okay; only active listings are suggested.</p>
          <Show when={proposalEnabled() && businessName().trim().length >= 2 && !vendorSlug()}>
            <button type="button" class="mt-3 min-h-11 font-semibold text-wedding-accent underline underline-offset-4" aria-expanded={showProposal()} onClick={() => setShowProposal((value) => !value)}>
              My business is not listed
            </button>
          </Show>
          <label class="mt-4 block text-sm font-medium">Your role
            <select class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted px-3" value={role()} disabled={busy()} onChange={(event) => setRole(event.currentTarget.value)}>
              <option value="owner">Business owner</option><option value="manager">Manager</option><option value="marketing">Marketing contact</option><option value="other">Other authorised representative</option>
            </select>
          </label>
          <Show when={showProposal()}>
            <fieldset class="mt-4 grid gap-3 rounded-xl border border-wedding-muted bg-wedding-surface p-4">
              <legend class="px-1 text-sm font-bold">Propose a private listing</legend>
              <p class="text-xs leading-5 text-wedding-muted">This stays out of public search until ownership and the listing are reviewed.</p>
              <label class="text-sm font-medium">Category<input class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted bg-white px-3" value={category()} maxlength="80" onInput={(event) => setCategory(event.currentTarget.value)} /></label>
              <label class="text-sm font-medium">Service area<input class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted bg-white px-3" value={serviceArea()} maxlength="180" onInput={(event) => setServiceArea(event.currentTarget.value)} /></label>
              <label class="text-sm font-medium">Business website<input class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted bg-white px-3" type="url" inputmode="url" placeholder="https://" value={websiteUrl()} onInput={(event) => setWebsiteUrl(event.currentTarget.value)} /></label>
              <label class="text-sm font-medium">Business email<input class="mt-1 min-h-11 w-full rounded-lg border border-wedding-muted bg-white px-3" type="email" inputmode="email" value={businessEmail()} onInput={(event) => setBusinessEmail(event.currentTarget.value)} /></label>
              <button type="button" class="min-h-11 rounded-lg bg-wedding-accent px-4 font-bold text-white disabled:opacity-60" disabled={busy() || !category().trim() || !serviceArea().trim() || !websiteUrl().trim() || !businessEmail().trim()} onClick={() => void propose()}>
                {busy() ? "Submitting…" : "Submit and prove ownership"}
              </button>
            </fieldset>
          </Show>
          <div class="mt-5 grid gap-2 sm:grid-cols-2">
            <button class="min-h-11 rounded-lg border border-wedding-accent px-4 font-bold text-wedding-accent" type="button" disabled={busy() || !vendorSlug()} onClick={() => void loadExisting()}>Check existing claim</button>
            <button class="min-h-11 rounded-lg bg-wedding-accent px-4 font-bold text-white disabled:opacity-60" type="button" disabled={busy() || !vendorSlug()} onClick={() => void begin()}>{busy() ? "Working…" : "Start ownership proof"}</button>
          </div>
          <Show when={claimNotice()}>{(message) => <p class="mt-3 rounded-lg bg-wedding-surface p-3 text-sm text-wedding-muted" role="status">{message()}</p>}</Show>
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
      <Show when={error()}>{(message) => <div class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
        <p>{message()}</p>
        <Show when={needsSignIn()}><a class="mt-2 inline-flex min-h-11 items-center font-bold underline underline-offset-4" href={`/workspace/?auth=signin&source=vendor_claim${vendorSlug() ? `&vendor_slug=${encodeURIComponent(vendorSlug())}` : ""}`}>Sign in again</a></Show>
      </div>}</Show>
    </main>
  );
}
