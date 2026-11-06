# Vendor limited-date specials — implementation specification

Status: implementation specification for WED-340
Source guidance: `vendor publishing less booked dates at discount.md`
Scope: extend the existing Wedding vendor, AFP, A2UI, Ranking Policy V2,
quotation, proposal and masked-enquiry systems. This is not a separate booking
marketplace, calendar, quote engine or message ledger.

## 1. Outcome

Enable an authorised vendor to publish a small set of dates, spaces or service
sessions that it wants to fill, optionally with an approved special package or
substantiated price advantage. A couple can discover those opportunities in a
third vendor-search mode, `Limited Specials`, without being told that a date is
booked, held or guaranteed.

The system must help a date-flexible couple find a better fit while preserving
these truths:

- the vendor controls and confirms availability, prices, packages and bookings;
- an enquiry is not a hold, booking or binding quote;
- a displayed date is indicative and subject to vendor confirmation;
- confidential formulas, margins and internal notes never enter couple/public
  projections;
- a discount or savings claim is displayed only when the vendor supplies an
  auditable comparison basis that satisfies the applicable pricing rules;
- the couple still approves the exact recipient, content and shared data before
  an enquiry leaves OmnyID.

## 2. Existing components to reuse

| Required capability | Existing authority to extend |
| --- | --- |
| Vendor identity, category, address and photos | `wedding_vendors`, `wedding_vendor_photos`, directory and claim routes |
| Space/session details | `wedding_vendor_rooms` |
| Coordinates and source authority | `wedding_vendor_attributes` (`latitude`, `longitude`) and attribute catalogue |
| Couple-specific availability evidence | append-only `wedding_vendor_availability` |
| Matching | `weddingVendorRankingState.ts`, Ranking Policy V2 and canonical server search source |
| Existing vendor relationship state | AFP-backed enquiry/favourite/quote/booking projection |
| Couple enquiry | existing outreach draft, approval preview, information-sharing controls, enquiry envelope and delivery paths |
| Protected replies | couple email mask, vendor email thread and registered-agent AFP delivery |
| Unclaimed-vendor access | invite-proposal secure referral grant pattern |
| Claimed-vendor authority | vendor ownership claim and verified owner/session checks |
| Quote preparation | existing quotation response and normalisation workflows |
| Map | existing Leaflet/OSM renderer, provider abstraction and server geocoding |
| UI rendering | existing Wedding A2UI state/projection conventions and Wedding surface tokens |

`wedding_vendor_availability` remains the couple's evidence about a vendor for
one wedding plan. Vendor-published supply is different and therefore receives
new tables; it must not overload or weaken the tenant boundary of the existing
table.

## 3. Domain model

### 3.1 Offer

`wedding_vendor_special_offers` is the vendor-approved commercial definition:

- `offer_id`, `vendor_id`, optional `room_id`;
- category, vendor-facing title and approved couple-facing summary;
- guest minimum/maximum and relevant conditions;
- offer type such as `package`, `minimum_spend`, `per_head`, `hire_fee` or
  `incentive_only`;
- publication state: `draft`, `active`, `paused`, `withdrawn`, `expired`;
- approved package/version reference and explicit approver identity;
- public guidance only: currency, estimated amount/range, minimum spend,
  mandatory-charge summary, inclusions, exclusions and assumptions;
- optional comparison basis and evidence reference for a savings claim;
- created/updated/approved timestamps and optimistic revision number.

Each date/space/session slot may override the offer defaults with its own
maximum capacity, minimum spend, indicative price per head, inclusions and
public conditions. This is necessary because a quiet weekday, winter date or
particular room may have different commercial terms from another date under
the same offer. The couple-facing indicative total is the greater of minimum
spend and price-per-head multiplied by the selected guest count, plus only
approved known mandatory charges. The couple's budget is never an input to
that calculation.

Internal formulas, margins, negotiation notes and unpublished rate cards belong
in `wedding_vendor_special_offer_private_pricing`, encrypted or access-restricted
to the verified vendor and authorised operator. Couple/public list queries must
not join or serialize that table.

### 3.2 Slot

`wedding_vendor_special_offer_slots` binds an offer to a date plus the space and
session being offered:

- `slot_id`, `offer_id`, `vendor_id`;
- local date, IANA timezone, optional start/end local time;
- room/space and session label;
- date-specific maximum capacity, minimum spend, indicative price per head,
  inclusions and public conditions, with offer-level values as defaults;
- state: `available`, `enquiry_received`, `provisional_hold`, `booked`,
  `paused`, `withdrawn`, `stale`;
- hold expiry where relevant;
- last vendor-confirmed timestamp, confirmation expiry and revision;
- who changed the state, source reference and timestamps.

An enquiry does not transition a slot to `provisional_hold`. A hold requires an
explicit vendor action and expiry. A stale, expired, withdrawn or booked slot is
never returned as enquiry-eligible.

### 3.3 Grants and events

`wedding_vendor_special_offer_grants` reuses the secure capability design:

- 256-bit random URL-safe secret; only a keyed digest is stored;
- vendor, allowed operations, expiry, revocation and generation;
- single vendor scope; optional offer scope;
- exchange to a short-lived session with CSRF and replay protection;
- rate limits, no-store/noindex/referrer controls and audit events.

`wedding_vendor_special_offer_events` is append-only operational evidence for
created, approved, published, reconfirmed, paused, withdrawn, viewed, enquired,
held, hold-expired, booked and delivery-failed events. Couple-specific changes
also emit tenant-private AFP messages. The operational table stores routing and
bounded metadata, not couple message bodies.

## 4. Projection boundaries

### Public vendor directory

May show only vendor-approved generic wording such as “Selected quieter dates
may have special packages”, applicable seasons or weekdays, guest range,
material restrictions and approved price guidance. It must not expose a full
availability calendar, internal formula, exact customer booking data or an
unsubstantiated discount.

### Authenticated couple map

The map query is server filtered by selected date, category, status, freshness,
location and basic feasibility. Its base marker projection contains vendor ID,
name, category, coordinates, licensed thumbnail, locality and a generic
“special may apply” state.

Exact available slot details, approved estimate, inclusions and discount basis
are included only for vendors in the couple's current top-three Ranking Policy
V2 result for that category/date/brief. Other markers can be explored without
disclosing the underlying date inventory. This preserves the top-three reveal
rule while still showing geographic distribution.

### Vendor/private

Verified vendor staff and valid management capabilities see their own offer,
slot, status and private pricing inputs. No vendor can enumerate another
vendor's unpublished offers, grants or internal pricing.

### Admin

Admin sees operational status, freshness, evidence and failures. Internal
pricing access is separately authorised and audited; an admin list projection
must not return secrets or capability plaintext.

## 5. Ranking Policy V2 integration

Ranking remains a feasibility-and-utility calculation, not paid placement.
Commercial relationships are disclosed and never silently increase rank.

1. Resolve canonical couple requirements: category, date or flexibility,
   location, guests, category budget, preferences, vision and deal-breakers.
2. Resolve vendor identity, coordinates, capacity, style, source authority and
   active fresh offer slots server-side.
3. Exclude material infeasibility (wrong category, confirmed unavailable,
   guest range failure, hard deal-breaker or out-of-area service constraint).
4. Calculate the approved effective price for the selected date and guest
   count. Never adjust price upward because the couple entered a larger budget.
5. Availability and an evidenced lower effective price may improve utility and
   may bring an otherwise over-budget venue within range. Missing mandatory
   charges or uncertain pricing reduce confidence rather than inventing fit.
6. Apply the existing preference, vision/style, location, evidence-confidence
   and prior-shrinkage components.
7. Select the top three first; only then attach exact offer details to those
   three comparison cards.

If the couple has a fixed date, match only that date. If the couple explicitly
marks the date flexible, search the permitted window and explain when a special
date changed the rank. A date inferred only from browsing must not silently
replace the wedding date in the AFP ledger.

## 6. Limited Specials discovery surface

The existing vendor mode tab list becomes:

1. `Find vendors`
2. `Invite Proposals`
3. `Limited Specials`

The surface includes:

- date input above the map, prefilled from the canonical Wedding projection but
  editable as a search filter without rewriting the Wedding date;
- category dropdown, default `Venues` when opened from the venue context;
- explicit `Use my location` control. Browser geolocation is requested only
  after that action; denial/error falls back calmly to Sydney;
- Sydney default centre (`-33.8688, 151.2093`) when no permitted location is
  available;
- clustered photo markers at low zoom and individual circular photo markers at
  higher zoom;
- accessible list synchronized with map results, so discovery never depends on
  pointer precision, colour or map rendering;
- selected marker/list card with fit summary, freshness, indicative-status
  warning and `Prepare enquiry`/state-appropriate existing enquiry action.

Photo URLs must come from licensed/approved `wedding_vendor_photos`; otherwise
use a category icon, not an unlicensed remote image. Tile attribution remains
visible. Marker and list interactions must be keyboard accessible.

## 7. Enquiry flow

`Prepare enquiry` calls the same consequence-labelled state machine used by a
vendor comparison card. It must not create a second outreach implementation.

1. Recheck slot status and revision server-side.
2. Open the existing draft and approval preview in place.
3. Prefill date/space, guests, category budget, requirements and selected offer
   reference from canonical AFP facts.
4. Preserve per-vendor sharing controls (approximate budget, phone, reminders
   and protected OmnyID replies).
5. On explicit approval, create one idempotent enquiry envelope and link it to
   the offer/slot.
6. Deliver through the couple's mask to the vendor's verified email and, when
   configured, as a tenant-scoped AFP event to the vendor agent.
7. Create/rotate the existing unclaimed-vendor referral capability where the
   vendor has no claimed OmnyID account.
8. Show the enquiry ID and state clearly: “This does not reserve or book the
   date. The vendor will confirm availability and final pricing.”

Duplicate sends, stale slot revisions and booked/withdrawn slots fail closed.
Affected couples receive a clear update and consent-based alternatives; the
system never silently substitutes another date or vendor.

## 8. Vendor management

Claimed vendors manage offers in their existing vendor portal. Unclaimed
vendors receive an expiring, revocable management link scoped to one vendor.
Both paths use the same backend commands and A2UI projection.

Minimum actions:

- create/edit draft offer and slots;
- preview the exact couple/public projections;
- approve/publish, pause, withdraw and reconfirm;
- mark enquiry received, create/expire a hold, or mark booked;
- see last confirmation, stale deadline and affected open-enquiry count;
- acknowledge image licence, package approval and authorised approver.

State updates use optimistic revision checks. A stale client receives current
state and must review it before retrying. Remaining dates auto-pause when their
confirmation expires; reopening requires explicit reconfirmation.

## 9. APIs

Proposed route family (names may follow existing router conventions):

- `GET /wedding/vendor-specials/discovery?date=&category=&lat=&lng=&radius=`
- `GET /wedding/vendor-specials/{offer_id}/top-three-detail`
- `POST /wedding/vendor-specials/{offer_id}/prepare-enquiry`
- claimed vendor: list/create/update/publish/reconfirm/state commands under
  `/wedding/vendor-portal/special-offers`
- secure management capability: exchange/read/command routes under
  `/wedding/vendor-specials/manage/{token}`
- admin aggregate/failure projection under `/admin/wedding/vendor-specials`

Every command is authenticated or capability-authorised, bounded, rate-limited,
idempotent where retried, and emits an audit/AFP event. Discovery responses are
`private, no-store` because they depend on a couple's brief and ranking.

## 10. Safety, privacy and accessibility

- No browser geolocation prompt on page load.
- Coordinates supplied by the browser are used for the current search unless
  the couple explicitly saves them.
- No exact couple location enters vendor/public output.
- No capability plaintext, private pricing or internal customer calendar data
  is logged or serialized.
- Enforce cross-tenant, cross-vendor and swapped-ID tests on every read/command.
- Apply rate limits to discovery, token exchange, commands and enquiry prepare.
- Display indicative/freshness caveats adjacent to availability and CTA.
- Confirm destructive withdrawal and booked-state changes.
- Map has a complete list alternative, visible focus, labelled controls and
  non-colour state cues.

## 11. Rollout

Keep publication false-default. Start with one verified venue and two or three
approved slots. Before cohort activation, prove:

- ownership/approver authority and image/package permission;
- stale auto-pause, withdrawal, hold expiry and optimistic conflict behavior;
- top-three-only exact-detail projection and cross-tenant isolation;
- fixed/flexible-date ranking and budget utility;
- enquiry preview, approval, provider acceptance, actual receipt, AFP delivery,
  retry suppression and unclaimed referral flow;
- unavailable-date rejection and no false booking/hold language;
- mobile map/list accessibility and no-geolocation fallback;
- outcome reporting distinguishes enquiry, quote, tour, hold, booking, lost and
  unknown.

No instant booking, payment collection, public full calendar or guaranteed
savings claim is part of the initial release.
