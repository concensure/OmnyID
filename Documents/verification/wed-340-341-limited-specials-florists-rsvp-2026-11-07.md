# WED-340 / WED-341 Limited Specials, florists and RSVP evidence

## Candidate scope

- Source worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`
- Branch: `agent/codex/WED-340`
- Exact application SHA: `77c1b05e059d0a0113e7a6c7d1f83dadd63ec48d`
- Public activation: false-default; a participating-vendor pilot remains an
  allowlisted rollout gate.

## Florist import

- The reviewed source bundle contains 35 new florist records.
- `build.py` regenerates the JSON, CSV and cumulative SQL from the hand-written
  source and reports 29 own-site, two own-site search-result and four directory
  contact bases.
- The SQL inserts new vendors with `ON CONFLICT DO NOTHING`. Attribute updates
  cannot overwrite `operator` or `vendor_reply` authority.
- The existing exact `best-buds-sydney-florist` seed-detail row changes from
  `Floral Designer` to `Florist` only when slug, name and old category all
  match. It is not duplicated into the live-vendor table.
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

- Built and tested from clean detached checkout
  `C:\temp\wt\omnyid-wed340-release-77c1b05` at the exact application SHA.
- Oracle `SOURCE_COMMIT` and `oracle-runtime-manifest.json` both contain the
  exact 40-character application SHA. The public workspace returns HTTP 200.
- Migrations 0150 and 0151 are present: the RSVP contact flag, private enquiry
  thread field and outcome view all exist. The RSVP flag default is `false`.
- Production contains 35 distinct florist rows from
  `florists_import_2026_11_06` and 151 related source attributes. The corrected
  cumulative SQL was replayed twice without duplication. The canonical Best
  Buds seed-detail category is `Florist`.
- Both Limited Specials rollout flags are `false`, both allowlists are empty,
  there are zero offers, and an anonymous discovery POST returns 404 with no
  response body. Deploying the code therefore published no offer or cohort.
- The file-backed capability pepper was created directly on Oracle with
  root-owned mode 0600; its value was never printed or copied locally.
- Canonical production proof generated 2026-11-07T14:02:49Z reports runtime
  manifest verification, backup archive verification and the isolated restore
  drill all passing. Homeserver, Caddy, ClamAV, Postgres and backup services
  remained running.
- Backup retention had accumulated 28 full generations. After resolving every
  deletion target under `/var/backups/omnyid`, the three newest generations
  were retained and 25 older generations were removed. Root disk use is now
  48% with about 24 GB free.

Public activation remains deliberately separate: a participating-vendor pilot
and the feature-specific security/privacy/accessibility, legal-copy and
vendor/couple acceptance evidence are still required before enabling either
rollout flag.
