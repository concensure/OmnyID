// @module-id: wedding.vendor-ownership-proof-panel
// @primary-capability: fail-closed-low-friction-listing-proof
// @locs-version: 1.0
import { createResource, createSignal, For, Show } from "solid-js";

import {
  createVendorWebsiteChallenge,
  getVendorOwnership,
  releaseVendorOwnershipClaim,
  verifyVendorOwnership,
  type VendorWebsiteChallenge,
} from "@/lib/vendorClaimApi";

export function VendorOwnershipProofPanel(props: {
  vendorSlug: string;
  onVerified: () => void;
  onReleased: () => void;
}) {
  const [status, { refetch }] = createResource(() => props.vendorSlug, getVendorOwnership);
  const [challenge, setChallenge] = createSignal<VendorWebsiteChallenge | null>(null);
  const [busyMethod, setBusyMethod] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [copied, setCopied] = createSignal(false);

  async function verify(method: string) {
    setBusyMethod(method);
    setError(null);
    try {
      await verifyVendorOwnership({
        vendorSlug: props.vendorSlug,
        method,
        token: method === "website_meta" ? challenge()?.token : undefined,
      });
      await refetch();
      props.onVerified();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ownership could not be verified.");
    } finally {
      setBusyMethod(null);
    }
  }

  async function startWebsiteProof() {
    setBusyMethod("website_meta");
    setError(null);
    try {
      setChallenge(await createVendorWebsiteChallenge(props.vendorSlug));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Website verification could not be started.");
    } finally {
      setBusyMethod(null);
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError("Copy is unavailable in this browser. Select and copy the code manually.");
    }
  }

  async function releaseClaim() {
    setBusyMethod("release");
    setError(null);
    try {
      await releaseVendorOwnershipClaim(props.vendorSlug);
      props.onReleased();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The claim attempt could not be released.");
    } finally {
      setBusyMethod(null);
    }
  }

  return (
    <section class="mt-6 rounded-xl border border-wedding-accent/30 bg-white p-5 shadow-sm" aria-labelledby="ownership-proof-title">
      <p class="text-xs font-bold uppercase tracking-[0.16em] text-wedding-accent">Ownership proof</p>
      <h2 id="ownership-proof-title" class="mt-1 text-xl font-semibold">Verify before managing this listing</h2>
      <p class="mt-2 text-sm leading-6 text-wedding-muted">
        Starting a claim does not reserve the listing or grant vendor access. Choose a proof method below.
      </p>

      <Show when={status.loading}><p class="mt-4 text-sm text-wedding-muted" role="status">Checking available proof methods…</p></Show>
      <Show when={status.error}><p class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">Ownership options could not be loaded.</p></Show>
      <Show when={status()}>{(details) => <>
        <div class="mt-4 rounded-lg bg-wedding-surface p-4">
          <p class="font-semibold">{details().listing.vendor_name}</p>
          <p class="mt-1 text-sm text-wedding-muted">{details().listing.category} · {details().listing.service_area}</p>
          <p class="mt-2 text-xs text-wedding-muted">Claim attempt expires {new Date(details().claim.expires_at ?? "").toLocaleString()}.</p>
        </div>

        <div class="mt-4 grid gap-3">
          <For each={details().methods}>{(method) => (
            <article class="rounded-lg border border-wedding-muted p-4">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <h3 class="font-semibold">{method.label}</h3>
                  <p class="mt-1 text-sm leading-5 text-wedding-muted">{method.detail}</p>
                </div>
                <Show when={method.instant}><span class="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">Fast check</span></Show>
              </div>
              <Show when={method.id === "email_domain"}>
                <button type="button" class="mt-3 min-h-11 rounded-lg bg-wedding-accent px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!method.available || busyMethod() !== null} onClick={() => void verify(method.id)}>
                  {busyMethod() === method.id ? "Checking…" : "Verify work email"}
                </button>
              </Show>
              <Show when={method.id === "website_meta"}>
                <button type="button" class="mt-3 min-h-11 rounded-lg border border-wedding-accent px-4 text-sm font-bold text-wedding-accent disabled:cursor-not-allowed disabled:opacity-50" disabled={!method.available || busyMethod() !== null} onClick={() => void startWebsiteProof()}>
                  {busyMethod() === method.id ? "Preparing…" : "Get website verification code"}
                </button>
              </Show>
              <Show when={method.id === "social_business"}>
                <p class="mt-3 text-xs font-semibold text-wedding-muted">Unavailable until an official business-page connection is enabled.</p>
              </Show>
            </article>
          )}</For>
        </div>
      </>}</Show>

      <Show when={challenge()}>{(proof) => (
        <div class="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 class="font-semibold text-amber-950">Add one proof for {proof().target}</h3>
          <ol class="mt-2 list-decimal space-y-2 pl-5 text-sm leading-5 text-amber-950">
            <li>Add this tag inside the website’s <code>&lt;head&gt;</code>, or publish the token as plain text at <code>{proof().well_known_path}</code>.</li>
            <li>Alternatively, add a TXT record named <code>{proof().dns_record_name}</code> with the value <code>{proof().dns_record_value}</code>.</li>
            <li>Keep one proof live until verification succeeds, then you may remove it.</li>
          </ol>
          <code class="mt-3 block overflow-x-auto rounded-md bg-white p-3 text-xs text-wedding-text">{proof().meta_tag}</code>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class="min-h-11 rounded-lg border border-amber-700 px-4 text-sm font-semibold text-amber-900" onClick={() => void copy(proof().meta_tag)}>{copied() ? "Copied" : "Copy tag"}</button>
            <button type="button" class="min-h-11 rounded-lg bg-wedding-accent px-4 text-sm font-bold text-white disabled:opacity-50" disabled={busyMethod() !== null} onClick={() => void verify("website_meta")}>{busyMethod() === "website_meta" ? "Checking…" : "Check website"}</button>
          </div>
          <p class="mt-2 text-xs text-amber-900">This challenge expires {new Date(proof().expires_at).toLocaleTimeString()}.</p>
        </div>
      )}</Show>

      <Show when={error()}>{(message) => <p class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">{message()}</p>}</Show>
      <button type="button" class="mt-4 min-h-11 text-sm font-semibold text-wedding-muted underline" disabled={busyMethod() !== null} onClick={() => void releaseClaim()}>This is not my business â€” release claim</button>
    </section>
  );
}
