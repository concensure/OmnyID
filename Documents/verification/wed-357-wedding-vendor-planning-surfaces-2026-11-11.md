# WED-357 Wedding vendor and planning surfaces — release evidence

Date: 11 November 2026 (Australia/Sydney)

## Released candidate

- Branch: `agent/codex/WED-357`
- Source commit: `2eabb74290945029eded686ccbb950da332b2ea5`
- Clean release checkout: `C:\temp\wt\omnyid-wed357-release-2eabb74`
- Oracle proof: `C:\temp\wt\proofs\wed357-2eabb74\postdeploy`

The Oracle `SOURCE_COMMIT` marker and `oracle-runtime-manifest.json` both name
the full source commit above. The runtime was staged from that detached clean
checkout with simulated data disabled and the existing remote environment;
no local environment file was uploaded.

## Verification

- `npm --prefix solid-ui run test:wedding:ci`: passed.
  - TypeScript passed.
  - anti-monolith and Wedding line budgets passed.
  - Wedding public-site, metadata, CSP, quiz, confirmation, blog, magnet,
    countdown and quote-decoder smoke tests passed.
  - Wedding tests: 2,267 passed, 0 failed.
- `cargo test wedding_vendor_record_maps_to_admin_database_source --lib`:
  1 passed, 0 failed using shared `C:\cargo-target`.
- `npm --prefix solid-ui run build`: passed; 1,806 modules transformed.
- Oracle deployment preflight: passed.
- Oracle post-deploy proof: passed.
  - homeserver running
  - backup service running
  - runtime script integrity passed
  - backup verification passed
  - restore drill passed
  - manifest verification passed
  - root and `/var` usage: 80%
- Hosted `https://omnyid.com/workspace/`: HTTP 200.
- Hosted Wedding workspace chunk: HTTP 200 and contains the new photo-card
  controls and inline Nominatim/OpenStreetMap integration.

The public API health routes require a session token; the authenticated
deployment proof is the authority for homeserver health/readiness.

## Scope now live

- category-correct vendor search icons and canonical musician query
- desktop-safe Wedding navigation
- non-duplicated, formatted vendor lifecycle evidence
- actionable website, email, phone and address research contacts
- specific vendor-comparison recommendations and compact rationale control
- smoother seating-table movement and guest seat transfer/snap feedback
- account-scoped mutable Wedding presentation state
- date, budget and guest setup as ranked decisions, with decision focus first
- RSVP meal/detail and response-change actions opening in place
- optimized, contain-fit, reorderable and resizable Today photo cards
- readable opaque Wedding storage-upgrade panel

## Deliberate follow-ons

The reviewed vendor management portal first-release boundary (VMP-01 through
VMP-06) is live. The following remain P1 server-authority work and were not
represented as complete in the browser:

- VMP-07: field-level publication choices and revision history
- VMP-08: named-resource and safe bulk calendar editing
- VMP-09: vendor teams, notification preferences and entitlements
