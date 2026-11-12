# Celebrant onboarding and bulk availability-link specification

Status: implementation specification
Date: 12 November 2026
Task: WED-365

## 1. Objective

Let an authorised operator find or minimally add Sydney celebrants, record a
manual register check, prepare secure self-service access and track onboarding
without requiring the celebrant to create an account. Reuse existing vendor,
verification, consultation, availability, email and AFP authorities.

## 2. Sources of truth

| Concern | Existing authority | Change |
| --- | --- | --- |
| Vendor identity and provenance | `wedding_vendors`, admin enrichment routes | Reuse; add a minimal Celebrant path only through the same entity |
| Official-register decision | `wedding_celebrant_pilot_profiles` plus operator verification route | Reuse; surface in one workflow |
| Consultation availability | consultation settings/windows/live sessions | Reuse unchanged |
| Wedding-date availability | vendor-special offers/slots | Reuse unchanged; present alongside consultation state only with separate scoped authority |
| No-account authority | celebrant management grants/sessions/events | Extend with bounded batch preparation and future scope manifest |
| Claimed vendor access | vendor ownership/membership and portal | Reuse; no claim required for quick-link actions |
| Operational evidence | management, consultation, enquiry and growth activation events | Reuse content-free aggregates |
| Audit/provenance | existing event rows and AFP-compatible write paths | Extend with reason/status facts, never bearer tokens or message bodies |

## 3. Operator journey

1. Search existing Celebrant rows by name, business or source URL.
2. If absent, use the existing enrichment/create authority to preview a minimal
   unpublished record and confirm likely-duplicate handling.
3. Open the Australian Government register in a new tab, then record
   `verified`, `not_found`, `requires_review` or `pending` with source and date.
4. Keep an existing active link or explicitly replace it. For a campaign,
   select up to 100 linkless eligible records and generate links once.
5. Copy a truthful, personalised manual-social invitation. Mark channel/date
   without auto-sending.
6. Filter by unopened, opened-not-configured, configured, opted-in, declined,
   expired and follow-up-required.

## 4. Link and session contract

- Maximum grant lifetime remains 14 days; default 14 days.
- Only HMAC digests and safe prefixes are stored. Plaintext is returned once.
- One active/exchanged grant per vendor. Batch creation skips an active grant
  unless the operator makes a separate explicit replacement action.
- Exchange produces a short-lived HttpOnly session plus a CSRF secret; the
  bearer fragment is removed from browser history.
- Every command resolves `session -> grant -> exact vendor` server-side.
- Expired/revoked/rotated grants and consumed sessions fail closed with the same
  non-enumerating response.
- Batch output must not be written to logs, analytics, ordinary exports or AFP
  narrative. The operator is warned to copy it before leaving.

## 5. Calendar experience

The initial link truthfully manages consultation hours and optional live-call
status only. The page must say so. Wedding-booking dates remain in the existing
special-offer calendar.

The later unified entry experience may show two modules:

1. `Consultation availability`, backed by existing consultation commands.
2. `Wedding date availability`, backed by the vendor-special slot commands.

The entry session may hold a scope manifest, but a consultation grant must not
implicitly acquire wedding-calendar mutation rights. If only one capability is
issued, only that module appears. No state is copied between calendars.

## 6. Consent and publication

Register verification, vendor publication, consultation opt-in, public phone
confirmation, configured hours and live telephony readiness are independent.
Public UI may say `available now` only from a current, unpaused, unexpired live
session with all gates satisfied. A click on `tel:` is intent evidence, never a
completed call.

## 7. Batch contract

`POST /admin/wedding/celebrant-management/links/batch`

- Auth: canonical operator allowlist.
- Input: 1–100 distinct vendor IDs, 1–14 expiry days and
  `replace_active=false` by default.
- Output: once-only created-link objects and content-light skipped reasons.
- Each item uses the existing single-link grant transaction and event.
- Partial success is explicit; no bulk action verifies a celebrant, publishes a
  listing or overwrites claimed profile data.

## 8. Error and recovery behaviour

- Existing active link: skip and explain; do not rotate in batch.
- Inactive/non-Celebrant/missing listing: bounded `not eligible` result.
- Missing capability pepper: whole operation unavailable; no weak token mode.
- Expired/lost link: operator generates a replacement after confirmation.
- Feature/telephony disabled: calendar editing remains distinct from live-call
  readiness and the UI names the operational gate.

## 9. Tests and release gates

- Unit: token protocol separation, category/vendor binding, dedupe and bounds.
- Database: concurrent generation leaves at most one active grant; batch skips
  an active link; rotation consumes sessions.
- Router: non-operator denied before body parsing; another vendor cannot be
  mutated; expired/revoked token fails.
- Browser: mobile exchange, URL-fragment removal, consultation update, batch
  selection, once-only copy and truthful disabled states.
- Hosted: exact-SHA manifest, feature flags, operator route, link exchange,
  backup verification and restore drill.

P2 co-branded Binder work is explicitly non-blocking and needs a separate
approved brand/logo publication contract.
