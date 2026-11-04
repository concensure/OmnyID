import { createMemo, createSignal, Show } from "solid-js";

import { issueQuotationResponseCapability, quotationResponsePortalUrl } from "@/lib/quotationResponseCapabilityApi";
import type { AfpMessage } from "@/lib/api";
import { weddingVendorResponseGrant } from "@/lib/weddingVendorResponseGrantState";

export function WeddingVendorSecureResponseLink(props: {
  messages: readonly AfpMessage[];
  vendorId: string | null;
  vendorName: string;
}) {
  const grant = createMemo(() => weddingVendorResponseGrant(props.messages, props.vendorId));
  const [busy, setBusy] = createSignal(false);
  const [url, setUrl] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);

  async function createLink(): Promise<void> {
    const activeGrant = grant();
    if (!activeGrant || busy()) return;
    setBusy(true); setNotice(null);
    try {
      const capability = await issueQuotationResponseCapability({
        threadId: activeGrant.threadId,
        grantMessageId: activeGrant.grantMessageId,
      });
      const nextUrl = quotationResponsePortalUrl(capability.responseToken);
      setUrl(nextUrl);
      await navigator.clipboard?.writeText(nextUrl).catch(() => undefined);
      setNotice(`Secure link ready. It expires ${new Date(capability.expiresAt).toLocaleString()} and grants access only to this vendor request.`);
    } catch {
      setNotice("A secure response link could not be issued. It may already have an active link, be expired, or need a newly approved request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Show when={grant()}>
      <section class="mt-3 rounded-xl border border-wedding-muted/25 bg-wedding-surface-muted p-3" aria-label={`Secure response link for ${props.vendorName}`}>
        <p class="text-xs font-semibold text-wedding-text">Vendor does not need an OmnyID account</p>
        <p class="mt-1 text-xs leading-5 text-wedding-muted">Create a short-lived link for this approved request only. The vendor cannot see your other vendors, private notes, or full wedding plan.</p>
        <button type="button" disabled={busy()} class="mt-2 min-h-11 rounded-xl border border-wedding-accent bg-white px-3 text-xs font-semibold text-wedding-text disabled:opacity-50" onClick={() => void createLink()}>
          {busy() ? "Creating secure link…" : "Create vendor response link"}
        </button>
        <Show when={url()}>{(value) => (
          <div class="mt-2 flex flex-col gap-2 sm:flex-row">
            <input aria-label="Secure vendor response link" readOnly value={value()} class="min-h-11 min-w-0 flex-1 rounded-lg border border-wedding-muted/35 bg-white px-2 text-xs text-wedding-text" />
            <button type="button" class="min-h-11 rounded-lg border border-wedding-accent bg-white px-3 text-xs font-semibold" onClick={() => void navigator.clipboard?.writeText(value())}>Copy link</button>
          </div>
        )}</Show>
        <Show when={notice()}>{(message) => <p role="status" class="mt-2 text-xs leading-5 text-wedding-text">{message()}</p>}</Show>
      </section>
    </Show>
  );
}
