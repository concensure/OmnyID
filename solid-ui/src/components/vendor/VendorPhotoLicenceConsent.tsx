// @module-id: wedding.vendor-photo-licence-consent
// @primary-capability: captured-photo-publication-consent
// @locs-version: 2.0
// @stability: draft
// @owner: omnyid
import { createSignal, Show } from "solid-js";

export const VENDOR_PHOTO_LICENCE_VERSION = "vendor-image-licence-2026-11-09";
export const VENDOR_PHOTO_LICENCE_CONSENT = "I confirm that I have read and agree to the Vendor Image Licence Agreement, and that I am authorised to grant the licence above for all Images submitted.";

const CLAUSES = [
  ["1. Grant of Licence", "By ticking this box and submitting images (\"Images\") to the Platform, you (\"Vendor\") grant us a worldwide, royalty-free, non-exclusive licence to:", [
    "host, store, reproduce, display, and publicly perform the Images on the Platform and in connection with the Vendor's listing;",
    "adapt the Images solely as needed for the Platform (e.g. cropping, resizing, compression, thumbnails, and format conversion);",
    "display the Images in Platform marketing and promotional materials, including social media posts, newsletters, and app store listings, with attribution to the Vendor where practicable; and",
    "continue hosting the Images on a read-only archive basis if the Vendor's listing is deactivated.",
  ]],
  ["2. Ownership", "The Vendor retains all ownership of and copyright in the Images. This agreement is a licence only — it does not transfer ownership. We may not sell the Images or license them to third parties for uses unrelated to the Platform."],
  ["3. Licence Duration and Withdrawal", "The licence applies for as long as the Images appear on the Platform, and continues for cached, archived, or already-published marketing copies until removed. The Vendor may request removal of any Image at any time via privacy@omnyid.com. We will remove Images from active display within 14 days of a written request."],
  ["4. Vendor Warranties", "By submitting Images, the Vendor represents and warrants that:", [
    "the Vendor owns the Images, or holds a valid written licence from the copyright owner permitting this submission and licence grant;",
    "the submission, display, and use of the Images under this agreement does not infringe any third party’s copyright, trade mark, privacy, or other rights;",
    "where the Images depict identifiable persons (including couples, guests, or staff), the Vendor has obtained all necessary consents, releases, and permissions for the Images to be published in connection with the Vendor’s listing;",
    "where the Images were created by a photographer or third party, that person has consented to this submission; and",
    "the Images do not contain misleading, defamatory, or unlawful content.",
  ]],
  ["5. Indemnity", "The Vendor indemnifies us against any claims, losses, damages, and reasonable costs (including legal costs) arising from a breach of the warranties in clause 4."],
  ["6. Rights in Third-Party Depictions", "The Vendor acknowledges that the Platform may display the Images alongside comparative information, vendor categories, ratings, and reviews. Nothing in this agreement gives the Platform the right to materially alter the Images so as to misrepresent the Vendor’s work."],
  ["7. Limitation of Liability", "To the maximum extent permitted by law, our aggregate liability arising from the display of the Images is limited to the amount payable by the Vendor to the Platform in the preceding 12 months, or AUD $100, whichever is greater."],
  ["8. Assignment and Future Corporate Structure", "The Vendor acknowledges that the Platform may currently be operated by an individual or unincorporated entity, and that it may later be operated through an incorporated company or other entity (whether by incorporation, transfer of business, restructure, merger, or sale).", [
    "The Vendor consents in advance to the assignment or transfer of all or part of the rights granted under this agreement (including this clause and the benefit of the warranties in clause 4) to: (i) any company incorporated by the Platform operator; and (ii) any successor or purchaser of the Platform business, in each case so that the Images may continue to be used for the same purposes under the same terms.",
    "No further consent from the Vendor is required for a transfer under clause 8(b), but we will notify the Vendor of any change to the entity operating the Platform (e.g. via email or an updated agreement version) where practicable.",
    "The licence terms under this agreement will not become less favourable to the Vendor as a result of any such transfer.",
  ]],
  ["9. General", "This agreement is governed by the laws of NSW, Australia. If any provision is unenforceable, the remaining provisions continue in force. We may update this agreement; the version in force at the time of submission applies to that submission."],
] as const;

export function VendorPhotoLicenceConsent(props: {
  disabled?: boolean;
  onAccepted: () => void;
}) {
  const [readToEnd, setReadToEnd] = createSignal(false);
  const [accepted, setAccepted] = createSignal(false);
  const canAccept = () => readToEnd() && !props.disabled;

  function recordScroll(event: Event) {
    const panel = event.currentTarget as HTMLDivElement;
    const hasScrolled = panel.scrollTop >= 32;
    const atEnd = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 8;
    if (hasScrolled && atEnd) setReadToEnd(true);
  }

  return (
    <section class="rounded-2xl border border-wedding-muted bg-white p-4 shadow-sm" aria-labelledby="vendor-photo-licence-title">
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-wedding-accent">Before publishing photos</p>
      <h3 id="vendor-photo-licence-title" class="mt-1 text-lg font-semibold text-wedding-text">Vendor Image Licence Agreement</h3>
      <p class="mt-1 text-sm leading-6 text-wedding-muted">Sheng-Ming Wu ABN 53648151198 (\"we\", \"us\", \"the Platform\"), operator of omnyid.com.</p>
      <div class="mt-4 h-72 overflow-y-auto rounded-xl border border-wedding-muted bg-wedding-surface-blush p-4 text-sm leading-6 text-wedding-text" onScroll={recordScroll} tabindex="0" aria-label="Vendor Image Licence Agreement. Scroll to the end to enable consent.">
        {CLAUSES.map(([heading, body, points]) => (
          <section class="mb-5 last:mb-0">
            <h4 class="font-semibold text-wedding-text">{heading}</h4>
            <p class="mt-1">{body}</p>
            <Show when={points}>
              <ol class="mt-2 list-[lower-alpha] space-y-1 pl-5">
                {(points ?? []).map((point) => <li>{point}</li>)}
              </ol>
            </Show>
          </section>
        ))}
      </div>
      <Show when={!readToEnd()}>
        <p class="mt-3 text-sm font-medium text-wedding-muted" aria-live="polite">Scroll through the agreement to reach the consent checkbox.</p>
      </Show>
      <label class="mt-4 flex items-start gap-3 rounded-xl border border-wedding-muted bg-white p-3 text-sm leading-6 text-wedding-text" classList={{ "opacity-55": !canAccept() }}>
        <input
          type="checkbox"
          class="mt-1 h-5 w-5 shrink-0 accent-wedding-accent"
          checked={accepted()}
          disabled={!canAccept()}
          onChange={(event) => setAccepted(event.currentTarget.checked)}
        />
        <span>{VENDOR_PHOTO_LICENCE_CONSENT}</span>
      </label>
      <button type="button" class="mt-4 min-h-11 w-full rounded-lg bg-wedding-accent px-4 font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50" disabled={!accepted() || props.disabled} onClick={() => props.onAccepted()}>
        I agree — continue to photo upload
      </button>
    </section>
  );
}
