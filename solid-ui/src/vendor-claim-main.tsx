import { render } from "solid-js/web";

import { VendorClaimFlow } from "@/components/vendor/VendorClaimFlow";
import { readSession } from "@/lib/api";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Vendor portal root is missing");

render(() => readSession()
  ? <VendorClaimFlow />
  : <main class="mx-auto flex min-h-screen max-w-lg items-center bg-wedding-surface px-5 text-wedding-text"><section class="w-full rounded-2xl border border-wedding-muted bg-white p-6 text-center shadow-sm"><p class="text-xs font-bold uppercase tracking-[0.16em] text-wedding-accent">Vendor portal</p><h1 class="mt-2 text-2xl font-bold">Sign in to claim your listing</h1><p class="mt-3 text-sm text-wedding-muted">Use your OmnyID account, then return here to start or manage your vendor claim.</p><a class="btn btn-primary mt-6 inline-flex min-h-11 items-center justify-center px-5" href="/workspace/?auth=signin&source=vendor_claim">Vendor sign in</a></section></main>, root);
