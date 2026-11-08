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
- [x] Add migration-catalog parity and disposable Postgres migration tests.
  Migrations 0149 through 0151 replay twice on disposable pgvector without
  duplicating authority, and the maintenance transition test uses that harness.
- [x] Implement pure validation/state-transition policy: draft → active,
  available/enquiry/hold/booked, stale auto-pause, hold expiry, withdrawal and
  optimistic revision conflicts.
- [x] Implement couple-safe projection that cannot serialize private pricing.
- [x] Test invalid dates, session overlap, stale publication, unsupported
  currencies, missing mandatory-cost state and false discount claims.

## Phase 2 — verified vendor commands

- [x] Reuse claim/ownership authority to list and edit only the caller's vendor.
- [x] Create offer/slot draft commands with bounded fields and idempotency keys.
- [x] Let each date/space/session carry maximum capacity, minimum spend,
  indicative price per head, inclusions and public conditions, with offer-level
  values serving only as defaults.
- [x] Add preview, explicit approval/publish, pause, withdraw and reconfirm.
- [x] Add enquiry-received, provisional-hold, hold-expiry and booked commands.
- [x] Record actor, source, revision and AFP/operational event for every command.
- [x] Add cross-vendor and swapped-ID adversarial guards and tests.

## Phase 3 — secure management link

- [x] Reuse the invite-proposal/quotation capability primitives for a 256-bit,
  digest-only, expiring and revocable vendor-management grant.
- [x] Add short-lived exchange session, CSRF, replay protection, rate limits,
  no-store/noindex/no-referrer and generation rotation.
- [x] Route link and authenticated portal commands through the same service
  functions; do not implement two state machines.
- [x] Add forged token, expired, revoked, replay, scope escalation and
  cross-vendor tests.

## Phase 4 — stale and failure automation

- [x] Add bounded worker to mark expired confirmations stale and expire holds.
- [x] Do not write repeated no-op AFP/audit events.
- [x] Pause affected discovery immediately and project open-enquiry warnings.
- [x] Add delivery/update failure projection. Retry remains couple-owned so an
  operator cannot turn a previous approval into another external send.
- [x] Add retention for high-volume operational events without deleting AFP
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
- [x] Support explicit flexible-date windows and explain rank changes caused by
  a special date.
- [x] Attach exact slot/package details only after top-three selection.
- [x] Add fixed-date, flexible-date, over-budget-to-within-budget, unknown-cost,
  stale and commercial-influence regression tests.

## Phase 6 — couple discovery API

- [x] Add authenticated `private, no-store` discovery query by date/category
  and optional location/radius.
- [x] Return safe markers from vendor coordinates and licensed photos only.
- [x] Return exact offer details only for the ranked top three.
- [x] Add pagination/bounds and server clustering inputs; do not expose a full
  calendar through repeated range probing.
- [x] Add cross-tenant and enumeration-resistance guards and tests.

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

- [x] Map `Prepare enquiry` to the existing vendor-card consequence state.
- [x] Recheck slot revision/state server-side immediately before provider send.
- [x] Prefill offer/date/space plus canonical guests, category budget,
  requirements and sharing controls.
- [x] On explicit approval, create one idempotent existing enquiry envelope and
  link it to offer/slot.
- [x] Reuse couple mask, provider delivery, registered-vendor AFP delivery and
  unclaimed-vendor referral capability.
- [x] Test duplicate/retry, unavailable-after-preview and provider failure.
  Actual receipt and correlated reply remain hosted acceptance evidence rather
  than a separate Limited-Specials mail implementation.

## Phase 9 — vendor portal A2UI

- [x] Add compact offer list, create/edit, slot controls, freshness and affected
  enquiry counts to the existing vendor portal.
- [x] Add preview of exact public/couple projections and private pricing
  boundary.
- [x] Add large confirmation dialogs for hold/withdraw/booked and conflict recovery.
- [x] Keep mobile actions reachable, labelled and touch-friendly.

## Phase 10 — admin, outcome and pilot

- [x] Add admin category/status/freshness/failure aggregates without secret or
  couple content.
- [x] Connect quote/tour/hold/booking/lost/unknown outcomes to existing AFP
  conversation and booking projections.
- [ ] Prove one-venue pilot end to end with publication flags false by default.
- [ ] Complete security/privacy/accessibility review, legal copy approval,
  hosted shadow run, controlled email receipt and vendor/couple usability.
- [x] Freeze exact SHA, build from a clean release checkout, deploy and record
  runtime/backup/restore evidence before cohort activation.

## Phase 11 — operator adoption and evidence-state controls

- [x] Show recent vendor claims, per-vendor generated-link counts, unique
  exchanged-link visits and genuinely new account signups attributed to a link
  in the existing operator dashboard without exposing bearer secrets.
- [x] Let an operator select a vendor with an availability offer and issue the
  same expiring, revocable, operation-scoped management capability used by the
  vendor portal. Generate the shareable QR code locally in the admin browser.
- [x] Let the vendor distinguish calendar-open evidence from a direct vendor
  confirmation, while preserving the existing bounded 48-hour hold and
  confirmed-booking transitions.
- [x] Keep the couple projection explicit: calendar open, vendor confirmed,
  temporary hold and confirmed booking are separate dated evidence states.
- [x] Extend protected RSVP invitations with an optional validated Loom share
  link and account-scoped suggestions from prior invitations.
- [x] Keep mobile category discovery compact with Venue, Photographer and a
  `See all` expansion into the full existing category catalogue.

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

The completion slice adds the authenticated top-three reveal and synchronized
map/detail card, a 31-day bounded flexible-date window, verified-vendor and
link-only mobile editors, explicit 48-hour (maximum seven-day) provisional
holds, expiry/staleness maintenance, content-light failure/admin projections,
and the existing explicitly-approved enquiry path. The AFP draft and sent
receipt carry the exact offer, slot and revision. A private outcome projection
joins later quote, tour, hold, booking and lost evidence by the same tenant and
conversation thread. It does not copy message bodies or create a second
booking ledger.

The implementation remains false-default. Application SHA
`77c1b05e059d0a0113e7a6c7d1f83dadd63ec48d` was built from a clean detached
checkout and deployed with matching `SOURCE_COMMIT` and runtime manifest.
Backup verification and an isolated restore drill pass. The two remaining
Phase 10 checkboxes are activation evidence: a real participating vendor pilot
and feature-specific hosted acceptance review. They do not justify bypassing
the allowlist or inventing a vendor publication during deployment.
