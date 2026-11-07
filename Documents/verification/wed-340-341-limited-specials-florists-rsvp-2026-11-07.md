# WED-340 / WED-341 Limited Specials, florists and RSVP evidence

## Candidate scope

- Source worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`
- Branch: `agent/codex/WED-340`
- Exact application SHA: pending clean release commit
- Public activation: false-default; a participating-vendor pilot remains an
  allowlisted rollout gate.

## Florist import

- The reviewed source bundle contains 35 new florist records.
- `build.py` regenerates the JSON, CSV and cumulative SQL from the hand-written
  source and reports 29 own-site, two own-site search-result and four directory
  contact bases.
- The SQL inserts new vendors with `ON CONFLICT DO NOTHING`. Attribute updates
  cannot overwrite `operator` or `vendor_reply` authority.
- The existing exact `best-buds-sydney-florist` row changes from
  `Floral Designer` to `Florist` only when ID, name and old category all match.
- Disposable pgvector accepted two consecutive SQL runs: 35 new active
  florists, 35 distinct IDs, Best Buds in `Florist`, and 151 source attributes.

## RSVP contact-detail request

- The existing expiring/revocable household capability has an explicit
  `request_contact_details` flag, false by default.
- A couple can open a native email draft to the guest's already-saved address,
  containing the reviewed protected link. Creating a link does not silently
  send anything.
- The public invitation preview does not serialize email addresses. The guest
  page shows the fields only when the server-stored capability requested them.
- Submitted name, email, phone and relationship fields are bounded and become
  a successor `wedding_boundary_guest_profile` AFP event in the same tenant.
  A forged household/invitation selection remains outside the capability.

## Limited Specials completion

- Claimed and secure-link vendors share one optimistic command service for
  create, edit, publish, pause, reconfirm, withdraw, 48-hour hold and booking.
- Discovery is authenticated, private/no-store, false-default and bounded to
  an exact date or maximum 31-day flexible window. Radius and capacity are
  server feasibility gates.
- The marker contract excludes price, inventory identifiers and private data.
  Only server-ranked top-three details carry approved commercial guidance and
  opaque IDs required for pre-send recheck.
- The existing explicit vendor-enquiry composer is reused. The server rechecks
  revision immediately before send and links only a matching tenant AFP
  provider receipt, offer, slot and conversation thread.
- Maintenance writes once for state changes, never on no-op passes; stale dates
  disappear, expired holds reopen only while fresh, and only old high-volume
  operational events are retained out. AFP authority is not deleted.
- Admin sees category/freshness/enquiry/failure and outcome counts only. Quote,
  tour, hold, booking and lost outcomes project from the existing AFP thread
  and slot authority without copying message content.

## Verification before release

- TypeScript typecheck: pass.
- Focused RSVP and Limited Specials frontend contracts: 5 passed.
- Wedding suite: 2,230 passed, 0 failed.
- Source and Wedding 999-line budgets: pass.
- Rust library check: pass.
- Limited Specials Rust policy/capability/discovery/maintenance tests: 28
  passed, 0 failed. The disposable maintenance fixture drains interrupted-run
  residue before asserting its two once-only transitions.
- RSVP Rust contracts: 17 pure route and validation tests passed together.
  Three database proofs then passed against independent disposable pgvector
  databases: tenant isolation and grant rotation/revocation; public submission
  with revoke-race protection; and replay/atomicity/concurrency.
- The database proof found and removed a public-capability privacy regression:
  a couple's saved guest email and phone are not returned to the RSVP browser.
  Guests enter those fields explicitly when the capability requests details.
- Migration 0151 replay: two consecutive disposable runs pass, including the
  private outcome projection.
- Florist generator and Python module compilation: pass.

## Release evidence

Pending the clean exact-SHA build, Oracle deployment, idempotent production
florist load, provenance check and hosted false-default smoke.
