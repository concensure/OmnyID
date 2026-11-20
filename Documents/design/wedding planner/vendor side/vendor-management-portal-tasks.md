# Vendor management portal — dependency-ordered implementation tasks

Status: VMP-01–VMP-10 released; VMP-11 implemented on WED-383 with exact-SHA Oracle release pending (audited 20 November 2026)

Source: `vendor management portal spec.md` in the canonical project documents

Rule: extend existing AFP, claim, directory, availability, media, messaging and quotation authorities; do not create a parallel CRM or ledger.

## Implementation audit — 10 November 2026

| Task | Status | Repository evidence |
|---|---|---|
| VMP-01 | Complete | `verification_source.rs`, `auth.rs`, `App.tsx`; vendor-source return is covered by `wedding-vendor-portal-launch.test.ts`. |
| VMP-02 | Complete | `VendorProfileDashboard.tsx` provides the mobile-first Overview, Availability, Enquiries, Public profile and Settings shell over the existing panels. |
| VMP-03 | Complete for first-release authority | The couple-facing preview explains what is published and keeps verification/ranking read-only. Field-level revision history remains VMP-07 rather than being simulated in the browser. |
| VMP-04 | Complete | Authenticated owner management, scoped staff links, explicit release authority, false defaults and discovery are covered by the Limited Specials route and rollout suites. |
| VMP-05 | Complete | The public quote comparison page, deterministic parser/calculation layer, structured extraction and public smoke coverage are present. |
| VMP-06 | Complete | Exact-SHA Oracle deployment/version evidence is recorded in `.agent/HANDOFF.md`; subsequent releases must repeat that evidence rather than inheriting it. |
| VMP-07 | Complete | `0157_wedding_vendor_portal_extensions.sql` and `wedding_vendor_portal_routes/publication.rs` retain draft and accepted revisions, preserve the current public snapshot during review, and feed directory/search projections from the accepted snapshot. |
| VMP-08 | Complete | Named resources extend `wedding_vendor_rooms`; bounded multi-date editing extends the existing Limited Specials authority with stale-revision and confirmed-booking guards. |
| VMP-09 | Complete | Vendor memberships enforce server-side roles, per-user notifications keep security alerts mandatory, and `vendor_subscriptions` controls paid portal features without deleting canonical records on downgrade. |
| VMP-10 | Complete | `0173_wedding_vendor_sales_operations.sql`, `wedding_vendor_portal_routes/operations.rs` and `VendorSalesOperationsPanel.tsx` project dated response history, non-linear journey state, 90-day totals/trends, exception escalation and room-level availability from the existing enquiry, resource and Limited Specials authorities. |
| VMP-11 | Implemented, release pending | WED-383 extends the existing public decoder and authenticated Quotes hub with immutable scenarios, optional-item quantities, minimum-spend floors, viability checks, remaining-budget effects and canonical AFP choices. Oracle still serves WED-377-era public quote scripts; do not mark this row released until exact-SHA runtime evidence exists. |

The first-release and P1 portal boundaries are implemented and were released through WED-347, WED-358 and WED-366. The quote-comparison extension is implemented but not yet released. Hosted evidence remains tied to each exact deployed SHA in `.agent/HANDOFF.md`; later code cannot inherit an earlier release claim.

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
| Couple quote normalisation and comparison | public quote decoder, authenticated Quotes hub, canonical quotation normal form and wedding AFP decision records | Extend in place. Per-vendor `Quote received` remains lifecycle status only; scenarios never mutate source quotes. |
| Directory/comparison preview | verified owner profile projection | Extend the existing preview to explain which saved fields are public; keep platform verification/ranking read-only. |
| Team, entitlements and external calendars | existing grants and `vendor_subscriptions`; no external-calendar authority | Extend canonical roles and entitlement checks for VMP-09; keep external-calendar sync deferred and do not imply it exists. |

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

### VMP-10 — Sales history, records and space operations (P1)

- Project response dates and delivery acknowledgements from canonical encrypted enquiry envelopes; do not copy message or quote bodies into a CRM table.
- Let an authorised vendor record a bounded, non-linear customer state: enquiry, qualification, availability check, tailored quote delivered, tour booked/completed, follow-up, hold, contract, deposit, booked, declined or lost.
- Keep an immutable dated stage history, optimistic revisions and idempotency keys. A stage change is an operational note only; it never sends a message, signs a contract or moves money.
- Provide printable 90-day totals and 12-week trends. Count distinct journeys for stage totals so a repeated or reversed stage does not inflate performance.
- Surface unanswered enquiries, overdue next actions, expiring holds and approaching price reviews as vendor exceptions.
- Project room-level availability from `wedding_vendor_rooms` and Limited Specials slots. Distinguish open, enquiry received, temporary hold, confirmed booking, unknown and set-aside-for-price-review states; unknown never means unavailable.

### VMP-11 — Dedicated couple quote normalisation and live scenarios (P0 quote extension)

- Keep one dedicated authenticated Quotes section separate from per-vendor `Quote received`; reuse the public decoder, canonical quotation normal form, source artifacts, corrections and AFP decision records.
- Accept authenticated PDF/DOCX/text uploads and vendor email/messages. On the public no-login page, read paste, TXT/Markdown/EML and selectable-text PDFs locally; scanned/unreadable PDFs fall back honestly to paste/manual entry.
- Compare on one date, guest count, duration and required scope. Apply per-person, fixed, minimum-spend, add-on, fee and GST rules deterministically and check capacity/date/guest limits before viable language.
- Show included, excluded, optional and unknown gaps; keep deposits separate; expose booking/cancellation/expiry terms; never turn unknown fees into zero.
- Preserve originals while optional items are added, removed or re-quantified. Recalculate both totals, difference and remaining budget live; label edits `Scenario estimate`, protect mandatory/bundled items and require vendor confirmation outside stated terms.
- Update the existing decision projection with the trade-off, conditional recommendation and most material missing fact. Support prefer, confirm and keep-open without implying booking/payment/contact.
- Deterministic tests must cover the 30/40-guest A$120-with-A$5,000-minimum versus A$150 crossover and the A$5,200 less A$400 upgrade yielding a A$5,000 floor.
- Release only from a clean exact-SHA descendant of the completed Runbooks lineage. Verify the public no-login page, authenticated Quotes hub, source/manifest identity and rollback evidence on Oracle.

## First-release acceptance

The portal release is acceptable when a vendor-source registrant reaches the vendor portal without generic study onboarding; a verified claimant can update public contact details, upload licensed photos, preview the listing, manage date offers or a secure staff link, review enquiries and construct a quote; the public quote decoder remains local and careful; Limited Specials is active only behind its existing authenticated authorities; and exact-SHA production evidence matches the deployed commit.

VMP-11 is additionally acceptable when the no-login page and authenticated Quotes hub expose the same deterministic scenario rules, both numeric acceptance cases pass, originals and unknowns remain intact, and Oracle serves the exact reviewed WED-383 descendant rather than the older WED-377 scripts.
