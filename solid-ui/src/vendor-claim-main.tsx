import { render } from "solid-js/web";

import { VendorClaimFlow } from "@/components/vendor/VendorClaimFlow";
import { PublicVendorProposalFlow } from "@/components/vendor/PublicVendorProposalFlow";
import { PublicVendorProposalLeadFeed } from "@/components/vendor/PublicVendorProposalLeadFeed";
import { VendorSpecialManagementFlow } from "@/components/vendor/VendorSpecialManagementFlow";
import { CelebrantManagementFlow } from "@/components/vendor/CelebrantManagementFlow";
import { readSession } from "@/lib/api";
import { attributeVendorSpecialSignup } from "@/lib/vendorSpecialsApi";
import { vendorPortalWorkspaceRedirect } from "@/lib/vendorPortalEntryState";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Vendor portal root is missing");
const params = new URLSearchParams(window.location.search);
const vendorSlug = (params.get("vendor_slug") ?? params.get("vendor") ?? "").trim().toLowerCase();
const vendorReturnKey = "omnyid.vendorClaim.returnTo";
const proposalToken = (params.get("proposal") ?? "").trim();
const fragment = new URLSearchParams(window.location.hash.slice(1));
const proposalFeedToken = (fragment.get("proposal_feed") ?? "").trim();
const specialManagementToken = (fragment.get("special_management") ?? "").trim();
const celebrantManagementToken = (fragment.get("celebrant_management") ?? "").trim();
const sessionValue = (key: string) => {
  try { return sessionStorage.getItem(key); } catch { return null; }
};
const celebrantManagementActive = Boolean(celebrantManagementToken || sessionValue("omnyid.celebrantManagement.csrf"));
const specialManagementActive = Boolean(specialManagementToken || sessionValue("omnyid.vendorSpecials.csrf"));
const signInHref = `/workspace/?auth=signin&source=vendor_claim${vendorSlug ? `&vendor_slug=${encodeURIComponent(vendorSlug)}` : ""}`;
const currentSession = readSession();
const signedIn = Boolean(currentSession);
const adminWorkspaceTarget = vendorPortalWorkspaceRedirect(currentSession);
try {
  if (!signedIn) sessionStorage.setItem(vendorReturnKey, `/workspace/vendor.html${vendorSlug ? `?vendor_slug=${encodeURIComponent(vendorSlug)}` : ""}`);
  else sessionStorage.removeItem(vendorReturnKey);
} catch {
  // Optional continuity only: the source query remains the normal fallback.
}
const referralGrantId = localStorage.getItem("omnyid.vendorSpecials.referralGrantId") ?? "";
if (signedIn && !adminWorkspaceTarget && referralGrantId) {
  void attributeVendorSpecialSignup(referralGrantId).then(() => localStorage.removeItem("omnyid.vendorSpecials.referralGrantId")).catch(() => undefined);
}

if (adminWorkspaceTarget) {
  render(() => <main class="flex min-h-screen items-center justify-center bg-wedding-surface px-5 text-wedding-text">
    <section class="w-full max-w-lg rounded-2xl border border-wedding-muted bg-white p-6 text-center shadow-sm" role="status">
      <p class="text-xs font-bold uppercase tracking-[0.16em] text-wedding-accent">OmnyID workspace</p>
      <h1 class="mt-2 text-2xl font-bold">Opening the admin workspace</h1>
      <p class="mt-3 text-sm text-wedding-muted">This account uses the main Workspace rather than a vendor listing portal.</p>
      <a class="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-wedding-accent px-5 font-bold text-white" href={adminWorkspaceTarget}>Continue</a>
    </section>
  </main>, root);
  window.location.replace(adminWorkspaceTarget);
} else render(() => celebrantManagementActive
  ? <CelebrantManagementFlow token={celebrantManagementToken} />
  : specialManagementActive
  ? <VendorSpecialManagementFlow token={specialManagementToken} />
  : proposalFeedToken
  ? <PublicVendorProposalLeadFeed token={proposalFeedToken} />
  : proposalToken
  ? <PublicVendorProposalFlow token={proposalToken} />
  : signedIn
  ? <VendorClaimFlow />
  : <main class="min-h-screen bg-wedding-surface px-5 py-10 text-wedding-text sm:px-8 lg:flex lg:items-center lg:py-16">
      <div class="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(24rem,0.85fr)] lg:items-center lg:gap-16">
        <section class="max-w-2xl">
          <a href="/wedding/vendors.html" class="text-sm font-semibold text-wedding-accent">← Wedding vendor directory</a>
          <p class="mt-8 text-xs font-bold uppercase tracking-[0.16em] text-wedding-accent">Vendor portal</p>
          <h1 class="mt-3 text-4xl font-bold leading-tight sm:text-5xl">Your listing, enquiries and availability in one place</h1>
          <p class="mt-5 max-w-xl text-base leading-7 text-wedding-muted">Claim an existing OmnyID Weddings listing, prove your connection to the business, then manage the information couples rely on.</p>
          <ul class="mt-7 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <li class="rounded-xl border border-wedding-muted bg-white/70 p-4"><strong class="block">Find</strong><span class="mt-1 block text-wedding-muted">Choose your existing business listing.</span></li>
            <li class="rounded-xl border border-wedding-muted bg-white/70 p-4"><strong class="block">Verify</strong><span class="mt-1 block text-wedding-muted">Complete the ownership checks.</span></li>
            <li class="rounded-xl border border-wedding-muted bg-white/70 p-4"><strong class="block">Manage</strong><span class="mt-1 block text-wedding-muted">Keep details and enquiries current.</span></li>
          </ul>
        </section>
        <section class="w-full rounded-2xl border border-wedding-muted bg-white p-6 text-center shadow-sm sm:p-8">
          <p class="text-xs font-bold uppercase tracking-[0.16em] text-wedding-accent">Secure vendor access</p>
          <h2 class="mt-2 text-2xl font-bold">Sign in to claim your listing</h2>
          <p class="mt-3 text-sm leading-6 text-wedding-muted">Continue with Google or your verified business email. Your selected listing will be waiting after sign-in.</p>
          <a class="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-wedding-accent px-5 font-bold text-white shadow-sm hover:bg-wedding-accent-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wedding-accent sm:w-auto" href={signInHref}>Continue to sign in</a>
          <p class="mt-5 text-xs leading-5 text-wedding-muted">Can’t find your business after signing in? Email <a class="font-semibold text-wedding-accent underline underline-offset-2" href="mailto:hello@omnyid.com?subject=vendor%20listing%20claim">hello@omnyid.com</a> so we can create the listing first.</p>
        </section>
      </div>
    </main>, root);
