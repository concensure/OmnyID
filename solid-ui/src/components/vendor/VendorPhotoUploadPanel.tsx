// @module-id: wedding.vendor-photo-upload-panel
// @primary-capability: licensed-vendor-photo-publication
// @locs-version: 2.0
// @stability: draft
// @owner: omnyid
import { createSignal, Show } from "solid-js";

import {
  VENDOR_PHOTO_LICENCE_VERSION,
  VendorPhotoLicenceConsent,
} from "@/components/vendor/VendorPhotoLicenceConsent";
import {
  acceptVendorPhotoLicence,
  uploadLicensedVendorPhoto,
} from "@/lib/vendorPhotoLicenceApi";

export function VendorPhotoUploadPanel(props: {
  vendorSlug: string;
  onPublished?: (url: string) => void;
}) {
  const [receiptId, setReceiptId] = createSignal<string | null>(null);
  const [file, setFile] = createSignal<File | null>(null);
  const [altText, setAltText] = createSignal("");
  const [isCover, setIsCover] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [success, setSuccess] = createSignal<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const receipt = await acceptVendorPhotoLicence({
        vendorSlug: props.vendorSlug,
        agreementVersion: VENDOR_PHOTO_LICENCE_VERSION,
      });
      setReceiptId(receipt.photo_licence_id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not record licence consent.");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    const selected = file();
    const receipt = receiptId();
    if (!selected || !receipt) return;

    setBusy(true);
    setError(null);
    try {
      const uploaded = await uploadLicensedVendorPhoto({
        vendorSlug: props.vendorSlug,
        photoLicenceId: receipt,
        file: selected,
        altText: altText(),
        isCover: isCover(),
      });
      setSuccess("Photo published. It has been converted to WebP without EXIF metadata.");
      props.onPublished?.(uploaded.url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Photo upload could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="space-y-4" aria-label="Publish vendor photos">
      <Show when={!receiptId()}>
        <VendorPhotoLicenceConsent disabled={busy()} onAccepted={() => void accept()} />
      </Show>
      <Show when={receiptId()}>
        <div class="rounded-2xl border border-wedding-muted bg-white p-4">
          <p class="text-sm font-semibold text-wedding-text">
            Licence recorded. Choose a photo to publish.
          </p>
          <label class="mt-3 block text-sm font-medium text-wedding-text">
            Photo
            <input
              class="mt-1 block w-full text-sm"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy()}
              onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
            />
          </label>
          <label class="mt-3 block text-sm font-medium text-wedding-text">
            Describe this photo for guests
            <input
              class="mt-1 w-full rounded-lg border border-wedding-muted p-2"
              maxlength="500"
              value={altText()}
              disabled={busy()}
              onInput={(event) => setAltText(event.currentTarget.value)}
            />
          </label>
          <label class="mt-3 flex items-center gap-2 text-sm text-wedding-text">
            <input
              type="checkbox"
              checked={isCover()}
              disabled={busy()}
              onChange={(event) => setIsCover(event.currentTarget.checked)}
            />
            Make this the cover photo
          </label>
          <button
            class="btn btn-primary mt-4 w-full"
            type="button"
            disabled={!file() || busy()}
            onClick={() => void publish()}
          >
            {busy() ? "Publishing..." : "Publish photo"}
          </button>
        </div>
      </Show>
      <Show when={error()}>
        {(message) => <p class="text-sm text-red-700" role="alert">{message()}</p>}
      </Show>
      <Show when={success()}>
        {(message) => <p class="text-sm text-emerald-700" role="status">{message()}</p>}
      </Show>
    </section>
  );
}
