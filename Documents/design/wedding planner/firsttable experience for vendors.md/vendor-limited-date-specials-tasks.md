# Vendor limited-date specials — dependency-ordered tasks

Task group: WED-340
Authority: `vendor-limited-date-specials-spec.md`

The order below is deliberate. UI tasks must not invent local availability or
pricing state before the authoritative commands and safe projections exist.

## Phase 0 — reuse inventory and contracts

- [x] Identify existing vendor directory, photos, rooms, coordinates,
  couple-scoped availability, Ranking Policy V2, invitation opportunities,
  quotation capabilities, masked mail, enquiry envelopes, Leaflet map and AFP
  lifecycle components.
- [x] Define the boundary between couple availability evidence and
  vendor-published supply.
- [x] Define public, couple-private, vendor-private and admin projections.
- [x] Add architecture decision and schema/event version constants.

## Phase 1 — persistence and pure policy

- [x] Add migration for offers, slots, private pricing, management grants,
  offer-enquiry links and append-only events.
- [x] Add indexes for active/fresh date-category discovery and vendor portal
  management without enabling public enumeration.
- [ ] Add migration-catalog parity and disposable Postgres migration tests.
  Catalogue parity passes; the disposable PostgreSQL execution remains open
  because the local Docker Desktop daemon could not start on 2026-11-06.
- [x] Implement pure validation/state-transition policy: draft → active,
  available/enquiry/hold/booked, stale auto-pause, hold expiry, withdrawal and
  optimistic revision conflicts.
- [x] Implement couple-safe projection that cannot serialize private pricing.
- [x] Test invalid dates, session overlap, stale publication, unsupported
  currencies, missing mandatory-cost state and false discount claims.

## Phase 2 — verified vendor commands

- [ ] Reuse claim/ownership authority to list and edit only the caller's vendor.
- [x] Create offer/slot draft commands with bounded fields and idempotency keys.
- [x] Let each date/space/session carry maximum capacity, minimum spend,
  indicative price per head, inclusions and public conditions, with offer-level
  values serving only as defaults.
- [x] Add preview, explicit approval/publish, pause, withdraw and reconfirm.
- [ ] Add enquiry-received, provisional-hold, hold-expiry and booked commands.
- [x] Record actor, source, revision and AFP/operational event for every command.
- [ ] Add cross-vendor and swapped-ID adversarial tests.

## Phase 3 — secure management link

- [x] Reuse the invite-proposal/quotation capability primitives for a 256-bit,
  digest-only, expiring and revocable vendor-management grant.
- [x] Add short-lived exchange session, CSRF, replay protection, rate limits,
  no-store/noindex/no-referrer and generation rotation.
- [x] Route link and authenticated portal commands through the same service
  functions; do not implement two state machines.
- [ ] Add forged token, expired, revoked, replay, scope escalation and
  cross-vendor tests.

## Phase 4 — stale and failure automation

- [ ] Add bounded worker to mark expired confirmations stale and expire holds.
- [ ] Do not write repeated no-op AFP/audit events.
- [ ] Pause affected discovery immediately and project open-enquiry warnings.
- [ ] Add delivery/update failure projection and operator retry controls.
- [ ] Add retention for high-volume operational events without deleting AFP
  authority records.

## Phase 5 — ranking and top-three reveal

- [x] Extend canonical search source with a server-verified, privacy-bounded
  active-offer signal for the couple's exact selected date.
- [x] Compute approved effective price for selected date/guest count without
  budget-based price discrimination.
- [x] Show the date-specific indicative total as `max(minimum spend, guests ×
  per-head price)` plus only approved known mandatory charges, and explain when
  a guest count exceeds that date's capacity.
- [x] Add availability, freshness and effective-price evidence to Ranking
  Policy V2 with confidence/unknown handling.
  The exact-date discovery route now performs the bounded server-side V2 stage
  and computes approved price guidance before serializing at most three exact
  details. Unknown price is uncertainty rather than a negative score.
- [ ] Support explicit flexible-date windows and explain rank changes caused by
  a special date.
- [x] Attach exact slot/package details only after top-three selection.
- [ ] Add fixed-date, flexible-date, over-budget-to-within-budget, unknown-cost,
  stale and commercial-influence regression tests.

## Phase 6 — couple discovery API

- [x] Add authenticated `private, no-store` discovery query by date/category
  and optional location/radius.
- [x] Return safe markers from vendor coordinates and licensed photos only.
- [x] Return exact offer details only for the ranked top three.
- [x] Add pagination/bounds and server clustering inputs; do not expose a full
  calendar through repeated range probing.
- [ ] Add cross-tenant and enumeration-resistance tests.

## Phase 7 — Limited Specials A2UI surface

- [x] Add `Limited Specials` as the third option beside Find Vendors and Invite
  Proposals using the existing vendor home component.
- [x] Prefill the date filter from canonical Wedding context without rewriting
  it when the filter changes.
- [x] Add category dropdown and explicit `Use my location`; default to Sydney
  and handle denied/unsupported geolocation calmly.
- [x] Reuse Leaflet/OSM provider configuration and add clustered circular photo
  markers with category fallback icons.
- [x] Add synchronized accessible results list, keyboard operation, visible
  attribution, loading/empty/failure states and mobile full-width layout.
- [x] Show freshness and “indicative, subject to vendor confirmation” beside
  every actionable result.

## Phase 8 — enquiry reuse

- [ ] Map `Prepare enquiry` to the existing vendor-card consequence state.
- [ ] Recheck slot revision/state server-side before opening approval.
- [ ] Prefill offer/date/space plus canonical guests, category budget,
  requirements and sharing controls.
- [ ] On explicit approval, create one idempotent existing enquiry envelope and
  link it to offer/slot.
- [ ] Reuse couple mask, provider delivery, registered-vendor AFP delivery and
  unclaimed-vendor referral capability.
- [ ] Test duplicate/retry, unavailable-after-preview, provider failure,
  actual receipt and correlated reply.

## Phase 9 — vendor portal A2UI

- [ ] Add compact offer list, create/edit, slot controls, freshness and affected
  enquiry counts to the existing vendor portal.
- [ ] Add preview of exact public/couple projections and private pricing
  boundary.
- [ ] Add large confirmation dialogs for withdraw/booked and conflict recovery.
- [ ] Keep mobile actions reachable, labelled and touch-friendly.

## Phase 10 — admin, outcome and pilot

- [ ] Add admin category/status/freshness/failure aggregates without secret or
  couple content.
- [ ] Connect quote/tour/hold/booking/lost/unknown outcomes to existing AFP
  conversation and booking projections.
- [ ] Prove one-venue pilot end to end with publication flags false by default.
- [ ] Complete security/privacy/accessibility review, legal copy approval,
  hosted shadow run, controlled email receipt and vendor/couple usability.
- [ ] Freeze exact SHA, build from a clean release checkout, deploy and record
  runtime/backup/restore evidence before cohort activation.

## Implemented slices

WED-340 begins with Phase 1: additive schema, pure state policy and safe
projection tests. No public offer is enabled merely by applying the migration.

The second slice adds allowlisted verified-vendor list/create/publish and state
commands. Date rows carry their own capacity, minimum spend, indicative
per-head amount, inclusions and conditions. The vendor preview calculates the
indicative total for a supplied guest count. Couple discovery, top-three search
integration, the management capability and portal A2UI remain deliberately
open; these routes do not make an offer public while the rollout flag is off.

The third slice adds an offer-scoped management capability for verified owners
or allowlisted operators to share with unclaimed vendors. The 256-bit secret is
kept in the URL fragment, stored only as a keyed digest and exchanged once for
a 30-minute HttpOnly session plus CSRF token. Creating a new generation rotates
older links and consumes their sessions. The mobile vendor surface exposes only
the bound offer and uses the same publish and state command services as the
claimed portal. Disposable-database adversarial route proof remains open.

The fourth slice carries an exact canonical date and guest count through the
existing search request. When a separate false-default discovery rollout is
allowlisted, the server attaches only a fresh vendor-confirmed opening signal
to matching directory candidates. Stale, withdrawn, unpublished, out-of-range
and over-capacity rows do not project. Ranking Policy V2 treats the signal as
actionable availability and explains it in couple-facing language. Offer and
slot identifiers, title, pricing, inclusions, conditions and the wider calendar
remain absent pending the authenticated server-side top-three reveal.
