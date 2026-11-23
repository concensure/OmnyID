# Celebrant workflow implementation audit

Date: 12 November 2026
Task: WED-365
Branch inspected: `agent/codex/WED-360` at `97c2c1c34b65e5d7139bd7ba779300564574effa`

## Outcome

The target branch already has a secure, no-account management capability for
one active Celebrant listing at a time. It exchanges a high-entropy, HMAC-bound
bearer token for a 30-minute cookie session and CSRF token. The session can
change only that celebrant's consultation windows and live-call status. It
cannot read leads, couple data, contacts, another listing or account data.

The current link is not a wedding-booking availability calendar. Wedding-date
availability and limited-date offers use the separate, existing vendor-special
slot authority. A combined entry experience can present both authorities, but
must not copy their state or silently broaden the consultation capability.

## Verified inventory

| Capability | Classification | Evidence |
| --- | --- | --- |
| Operator celebrant dashboard and metrics | Confirmed implemented | `solid-ui/src/components/UsageAdminWeddingCelebrantsPanel.tsx`; `GET /admin/wedding/celebrant-management` in `src/server/wedding_celebrant_management_link_routes.rs` |
| One secure link per active Celebrant | Confirmed implemented | `POST /admin/wedding/celebrant-management/links`; unique active-grant index in migration `0159_wedding_celebrant_profiles_and_management_links.sql` |
| Link rotation and revocation | Confirmed implemented | creation rotates prior grants and consumes sessions; explicit revoke route is vendor- and grant-scoped |
| No-account mobile self-service | Confirmed implemented | `CelebrantManagementFlow.tsx`, exchange/session/command routes and `celebrantManagementApi.ts` |
| Consultation weekly/exception windows | Confirmed implemented | canonical `wedding_celebrant_consultation_windows`; management commands add/disable existing rows |
| Immediate-call window and call cap | Implemented, rollout-dependent | live-session commands require verified register status, configured phone and consultation/telephony runtime gates |
| Operator register decision | Confirmed implemented | `POST /admin/wedding/celebrant-consultations/verification` in `wedding_celebrant_consultation_routes.rs`; remains a deliberate operator action |
| Link-use and availability audit | Confirmed implemented | `wedding_celebrant_management_events`; no token or phone plaintext in event metadata |
| Qualified-couple, maintained-availability and completed-enquiry metrics | Confirmed implemented | content-free SQL projection in the admin management dashboard |
| Public celebrant profiles | Confirmed implemented for curated records | migration 0159, public vendor directory/profile routes and Wedding public pages |
| Wedding-date availability | Confirmed in another authority | `wedding_vendor_special_offer_slots` and `wedding_vendor_special_offer_routes`; not currently granted by a celebrant consultation link |
| Rapid minimal listing creation in this panel | Partially implemented | vendor enrichment/admin creation exists elsewhere; the panel currently selects existing active records only |
| Outreach status and opt-out lifecycle | Not found in this panel | link events show creation/open/configuration, but manual social outreach state is not a canonical celebrant funnel yet |
| Batch link preparation | Partially implemented in WED-365 | new bounded endpoint/UI reuses the single-link authority, preserves active links by default and returns plaintext links once |
| Co-branded binder | Requires further verification/P2 | existing Binder delivery exists, but no verified celebrant-brand configuration is connected to it |

## Security and privacy findings

- Tokens are random, stored only as HMAC digests with a short prefix, have a
  maximum 14-day lifetime and are removed from browser history after exchange.
- Sessions are vendor-scoped, short-lived, CSRF-bound and consumed on rotation
  or revocation. Database foreign keys and route queries bind every command to
  the grant's exact vendor.
- An active vendor record is required, but active status and public
  consultation eligibility remain separate. Verification alone does not opt a
  celebrant into consultations.
- A batch workflow must not persist plaintext links, log them, place them in
  analytics or regenerate an existing active link without an explicit choice.
- A single combined token would broaden authority. The minimum-change design is
  a landing session that exposes separately scoped calendar actions only after
  the appropriate capability is present.

## Minimum-change recommendation

Extend `UsageAdminWeddingCelebrantsPanel` into the acquisition workspace. Keep
`wedding_vendors` as identity authority, the consultation tables as call
availability authority, and special-offer slots as wedding-date availability
authority. Add batch preparation, outreach state and minimal listing/enrichment
through the existing admin routes. Introduce no celebrant CRM and no second
calendar.
