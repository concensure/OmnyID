import { render } from "solid-js/web";

import { VendorClaimFlow } from "@/components/vendor/VendorClaimFlow";
import { readSession } from "@/lib/api";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Vendor portal root is missing");
const params = new URLSearchParams(window.location.search);
const vendorSlug = (params.get("vendor_slug") ?? params.get("vendor") ?? "").trim().toLowerCase();
const signInHref = `/workspace/?auth=signin&source=vendor_claim${vendorSlug ? `&vendor_slug=${encodeURIComponent(vendorSlug)}` : ""}`;

render(() => readSession()
  ? <VendorClaimFlow />
  : <main class="mx-auto flex min-h-screen max-w-lg items-center bg-wedding-surface px-5 text-wedding-text"><section class="w-full rounded-2xl border border-wedding-muted bg-white p-6 text-center shadow-sm"><p class="text-xs font-bold uppercase tracking-[0.16em] text-wedding-accent">Vendor portal</p><h1 class="mt-2 text-2xl font-bold">Sign in to claim your listing</h1><p class="mt-3 text-sm text-wedding-muted">Continue with Google or your verified business email. Your selected listing will be waiting after sign-in.</p><a class="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-wedding-accent px-5 font-bold text-white shadow-sm hover:bg-wedding-accent-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wedding-accent" href={signInHref}>Continue to sign in</a></section></main>, root);
