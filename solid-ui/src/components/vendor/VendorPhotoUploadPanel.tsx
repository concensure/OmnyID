// @module-id: wedding.vendor-photo-upload-panel
// @primary-capability: licensed-vendor-photo-publication
// @locs-version: 2.0
// @stability: draft
// @owner: omnyid
import { createEffect, createSignal, For, Show } from "solid-js";

import {
  VENDOR_PHOTO_LICENCE_VERSION,
  VendorPhotoLicenceConsent,
} from "@/components/vendor/VendorPhotoLicenceConsent";
import {
  acceptVendorPhotoLicence,
  listVendorManagedPhotos,
  scheduleVendorPhotoRemoval,
  uploadLicensedVendorPhoto,
  type VendorManagedPhoto,
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
  const [photos, setPhotos] = createSignal<VendorManagedPhoto[]>([]);

  const refreshPhotos = async () => {
    try {
      setPhotos(await listVendorManagedPhotos(props.vendorSlug));
    } catch {
      // The photo-management list is an enhancement; keep upload available.
    }
  };
  createEffect(() => void refreshPhotos());

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
      await refreshPhotos();
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
      <Show when={photos().length > 0}>
        <div class="rounded-2xl border border-wedding-muted bg-white p-4">
          <h3 class="text-sm font-semibold text-wedding-text">Published photos</h3>
          <div class="mt-3 grid grid-cols-2 gap-3">
            <For each={photos()}>
              {(photo) => (
                <article class="overflow-hidden rounded-lg border border-wedding-muted">
                  <img class="aspect-square w-full object-cover" src={photo.url} alt={photo.alt_text ?? "Vendor photo"} />
                  <div class="space-y-2 p-2">
                    <Show when={photo.status === "live"} fallback={<p class="text-xs text-wedding-muted">Hidden; permanently removed after 14 days.</p>}>
                      <button
                        class="min-h-10 w-full rounded-md border border-red-300 px-2 text-xs font-semibold text-red-700"
                        type="button"
                        disabled={busy()}
                        onClick={() => void (async () => {
                          if (!window.confirm("Remove this photo from the public listing? It will be permanently deleted after 14 days.")) return;
                          setBusy(true);
                          setError(null);
                          try {
                            await scheduleVendorPhotoRemoval(props.vendorSlug, photo.asset_id);
                            setSuccess("Photo removed from the public listing. It will be permanently deleted after 14 days.");
                            await refreshPhotos();
                          } catch (reason) {
                            setError(reason instanceof Error ? reason.message : "Could not schedule the photo removal.");
                          } finally {
                            setBusy(false);
                          }
                        })()}
                      >
                        Remove photo
                      </button>
                    </Show>
                  </div>
                </article>
              )}
            </For>
          </div>
        </div>
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
