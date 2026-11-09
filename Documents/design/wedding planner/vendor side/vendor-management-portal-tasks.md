# Vendor management portal — dependency-ordered implementation tasks

Status: active first-release plan (WED-347)  
Source: `vendor management portal spec.md` in the canonical project documents  
Rule: extend existing AFP, claim, directory, availability, media, messaging and quotation authorities; do not create a parallel CRM or ledger.

## Reuse and extension matrix

| Need | Existing authority | Decision |
|---|---|---|
| Vendor sign-in and return | shared auth, `source=vendor_claim`, `/workspace/vendor.html` | Extend email-verification source preservation; reuse sessions unchanged. |
| Find, propose and claim listing | `VendorClaimFlow`, ownership proof routes and canonical `wedding_vendors` row | Reuse unchanged; no duplicate organisation record. |
| Business/contact details | `VendorProfileDashboard` and owner profile route | Reuse; present as the Public profile section. |
| Licensed photos | `VendorPhotoUploadPanel`, licence receipts and managed object storage | Reuse; present in Public profile. |
| Availability and staff links | `VendorSpecialOffersPanel`, scoped capability service and AFP events | Reuse; present as Availability. |
| Enquiries and messages | `VendorQuotationResponsePanel`, sender identity and canonical conversation | Reuse; present as Enquiries. |
| Proposal opportunities | `VendorProposalOpportunitiesPanel` | Reuse inside Enquiries. |
| Quote construction | existing vendor quote draft/response controls | Reuse inside Enquiries; never send without vendor approval. |
| Directory/comparison preview | verified owner profile projection | Extend the existing preview to explain which saved fields are public; keep platform verification/ranking read-only. |
| Billing/team/external calendars | no complete reviewed surface | Defer; do not imply availability in the first release. |

## Dependency order

### VMP-01 — Preserve vendor acquisition context through authentication (P0)

- Recognise `vendor_claim` as a bounded server-side verification experience.
- Put only `source=vendor_claim` in the verification return URL; never put a listing, token or email in it.
- After verification and sign-in, return to `/workspace/vendor.html`, retaining only the validated listing slug already present in the browser deep link.
- Suppress generic guided-tour, profiling and student fast-path onboarding for this source.
- Tests: source normalisation, token experience, action URL, Google/password immediate login and email-verification return.

### VMP-02 — Coherent portal shell over existing modules (P0)

- Add mobile-first Overview, Availability, Enquiries, Public profile and Settings navigation.
- Overview shows completion and the next useful management actions, not duplicated records.
- Availability mounts `VendorSpecialOffersPanel`; Enquiries mounts proposal and quotation panels; Public profile mounts contact, preview and photo controls.
- Keep claim/ownership proof before the shell. A session alone never grants listing access.
- Use native buttons, keyboard-operable tabs, visible focus, 44px targets and in-place status messages.

### VMP-03 — Publishing clarity (P0)

- Explain that saved eligible contact/description/photo fields feed the canonical directory and comparison projections.
- Show the current couple-facing preview from the same owner profile projection.
- Keep independent reviews, verification and ranking methodology outside vendor control.
- Do not invent field-level publication authority where the backend does not yet support it; record that as VMP-07.

### VMP-04 — Availability release (P0)

- Record the owner's explicit Limited Specials release authority.
- Support a reviewed wildcard allowlist value only when the feature flag is also true; all routes remain authenticated, ownership-scoped, rate-limited and revision checked.
- Enable management and discovery in production; preserve the capability pepper and existing revocation/expiry controls.
- Hosted smoke: anonymous refusal, signed-in discovery, cross-vendor denial, claimed portal management, secure-link exchange and no secret in logs.

### VMP-05 — Public venue quote decoder (P0)

- Publish `/wedding/compare-wedding-venue-quotes.html` using a deterministic browser-only engine.
- One or two proposals; shared guest count/hours; stated totals, minimum-spend shortfall, GST, service, overtime, inclusions, unknowns and follow-up questions.
- `Not stated` never becomes zero. Results describe differences and never declare a winner.
- Paste suggestions require an explicit Apply action. Supported local text files never leave the device; unsupported/scanned formats receive an honest fallback.
- Add canonical/schema/Open Graph metadata, sitemap entry, mobile/keyboard coverage and public smoke tests.

### VMP-06 — First-release verification and release (P0)

- TypeScript, focused vendor/auth/static tests, all Wedding tests, line budgets, Rust auth/rollout tests, production build and public website smoke.
- Build and deploy only from a clean exact-SHA release checkout.
- Verify Oracle `SOURCE_COMMIT`, runtime manifest, health, route availability and enabled rollout values without printing secrets.

### VMP-07 — Field-level publication revisions (P1)

- Extend the canonical vendor profile with eligible directory/comparison visibility choices and revision history.
- Add moderation only to fields that genuinely require it; preserve currently published values until approval.
- Invalidate both directory and comparison projections from the same accepted revision.

### VMP-08 — Resource calendar and bulk editing (P1)

- Extend the current date/offer authority to named resources and bounded date ranges.
- Never let a bulk edit silently replace a confirmed booking.
- Add concurrency, stale evidence and multi-resource tests before exposing the UI.

### VMP-09 — Team, notifications and entitlements (P1)

- Reuse existing grants, notification delivery and entitlement infrastructure.
- Add vendor staff roles, preferences and free/premium boundaries only after server-side permission tests.

## First-release acceptance

The release is acceptable when a vendor-source registrant reaches the vendor portal without generic study onboarding; a verified claimant can update public contact details, upload licensed photos, preview the listing, manage date offers or a secure staff link, review enquiries and construct a quote; the public quote decoder remains local and careful; Limited Specials is active only behind its existing authenticated authorities; and exact-SHA production evidence matches the deployed commit.

