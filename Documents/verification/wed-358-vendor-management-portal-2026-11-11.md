# WED-358 vendor management portal verification — 2026-11-11

## Candidate scope

- Field-level profile visibility and revisioned publication now extend the canonical verified-vendor owner profile. Contact-only changes can publish immediately; changed descriptions enter the operator review queue while the prior accepted snapshot remains public.
- Directory, vendor search, comparison, public photo and Limited Specials projections read the accepted publication snapshot and visibility choices rather than unreviewed draft fields.
- Named vendor resources extend `wedding_vendor_rooms`. Bounded multi-date calendar changes reuse the existing Limited Specials offer/slot authority, reject stale revisions and cannot replace confirmed bookings.
- Vendor team invitations activate only after a matching verified email signs in. Server-side roles independently scope profile publication, calendars, enquiries and read-only access; only the verified owner manages the team.
- Notification preferences keep operational/security delivery outside the optional controls. Named resources, bulk calendar editing and teams use the canonical active Founding/Pro entitlement without deleting state after downgrade.
- Portal audit events are idempotent and content-light: they record actor, vendor, action, subject reference and bounded operational metadata, but not descriptions, contact values, messages or pricing.

## Local evidence

- `npm run typecheck`: pass.
- `npm run test:line-budget`: pass, including the focused 1,000-line Wedding limit.
- `node --test tests/wedding-vendor-portal-launch.test.ts`: 4/4 pass.
- `npm run test:wedding`: 2,268/2,268 pass.
- `npm run build`: pass when run sequentially.
- `CARGO_TARGET_DIR=C:\\cargo-target cargo check --lib`: pass.
- `CARGO_TARGET_DIR=C:\\cargo-target cargo test wedding_vendor_portal_routes --lib`: 7/7 pass (2,729 filtered out).
- `git diff --check`: pass. Git emitted only the repository's expected LF-to-CRLF notices.

The first concurrent Vite/Rust verification attempt exhausted the Windows compiler process and ended with `STATUS_ACCESS_VIOLATION`. Both commands passed when rerun sequentially; this was resource pressure, not a product test failure.

Docker Desktop was unavailable for a disposable local Postgres migration run. Migration application, table/column inspection, runtime provenance and hosted route checks therefore remain required from the clean exact-SHA Oracle release.

## Release evidence

Pending the frozen implementation commit and exact-SHA Oracle deployment. The deployed SHA, clean release checkout, proof directory, migration evidence and runtime health will be appended after release.
