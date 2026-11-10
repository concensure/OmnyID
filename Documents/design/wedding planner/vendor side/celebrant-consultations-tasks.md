# Celebrant consultations delivery tasks

Task: WED-359
Dependency order is authoritative; unchecked items are not release claims.

## CCB-01 — Contracts and evidence

- [x] Convert `celebrant.md` into an architecture, privacy and lifecycle specification.
- [x] Verify the official Australian celebrant-register source and separate register evidence from live readiness.
- [x] Define callback, scheduled-call and outcome states plus the content-light AFP event contract.

## CCB-02 — Canonical persistence

- [x] Add celebrant pilot settings keyed to the canonical vendor record.
- [x] Add recurring consultation windows, exceptions and bounded live sessions.
- [x] Add verification sessions, callback requests and lifecycle events with deletion cascades.
- [x] Enforce one active scheduled reservation per celebrant/start and support atomic live-capacity holds.
- [x] Encrypt verified phone numbers at rest and retain only keyed digests for lookup/rate limiting.

Depends on CCB-01.

## CCB-03 — Public verification and callback APIs

- [x] Add no-account list/next-availability API with false-default rollout control and `no-store` responses.
- [x] Add Twilio Verify start/check endpoints without persisting codes.
- [x] Add idempotent immediate and scheduled request creation.
- [x] Add token-authorised status and couple-reported outcome endpoints.
- [x] Rate limit list, verification and request operations independently and fail closed when secrets are absent.

Depends on CCB-02.

## CCB-04 — Vendor consultation authority

- [x] Permit only verified Celebrant vendors with owner/calendar/enquiry permissions.
- [x] Add recurring hours, topics, intent, buffer and live-session commands to the existing Availability area.
- [x] Add upcoming callback/scheduled-call projection with Accept, Pass, cancel/reschedule and outcome commands. The first UI exposes accept/pass/cancel/outcome; reschedule is API-ready.
- [x] Reveal the callback number only after successful acceptance.
- [ ] Extend the scoped calendar-management capability with consultation-only permissions or document a release blocker.

Depends on CCB-02.

## CCB-05 — Public and vendor interfaces

- [x] Publish the public **Talk to a celebrant** page with empty, live and next-time states.
- [x] Keep the intake short, label Sydney time and distinguish questions from hiring intent.
- [x] Add labelled links from the celebrant directory and relevant ceremony-planning decision surface.
- [x] Add the celebrant-only **Phone consultations** panel beside canonical Wedding dates in the vendor portal.
- [x] Preserve mobile keyboard, focus, status and error accessibility.

Depends on CCB-03 and CCB-04.

## CCB-06 — Existing lead-inbox bridge

- [x] Return Save and Ask about my wedding date only after a call outcome.
- [ ] Require explicit couple approval before creating a canonical vendor enquiry.
- [ ] Link the enquiry and consultation by opaque references without copying private call intake.

Depends on CCB-03.

## CCB-07 — Verification and release evidence

- [x] Unit-test live expiry/capacity, topic/intent eligibility, phone normalisation and static privacy boundaries.
- [ ] Integration-test unauthorised vendor access, invalid tokens, rate limits, duplicate idempotency and concurrent capacity.
- [x] Verify statically that raw phone values and codes are absent from audit/event rows; runtime log inspection remains a hosted check.
- [x] Run frontend typecheck/build and the public Wedding website smoke suite.
- [ ] Run a Twilio sandbox verification and a controlled Sydney pilot callback before enabling the false-default flag.
- [ ] Record source commit, deployed SHA and runtime health; do not call provider acceptance a connected call.

Depends on CCB-03 through CCB-06.

## Deliberate follow-ons

- Masked calling, call recording and transcription are out of scope. Recording would require a separate consent design.
- Multi-region/timezone expansion follows Sydney pilot evidence.
- Automated register refresh follows operator-reviewed pilot verification.
- SMS/email reminders follow the existing outbound delivery authority and bounce/receipt evidence.
