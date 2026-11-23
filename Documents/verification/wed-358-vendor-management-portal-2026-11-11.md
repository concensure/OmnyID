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

- Frozen implementation SHA: `51eacb09afbc297080e4aa573dcc0036eb2f9230`.
- Clean detached release checkout: `C:\temp\wt\omnyid-wed358-release-51eacb0`.
- Exact-SHA TypeScript, focused portal tests, Vite production build and Rust `cargo check --lib` passed. The Oracle Linux build completed the optimized Rust release binary successfully.
- The first Compose activation was blocked because the existing ClamAV daemon had died after a signature database test was OOM-killed, leaving its outer container running but unhealthy. No second build was started. ClamAV was restarted, reached `healthy`, and the already-built exact-SHA UI, homeserver and Caddy were activated with `--no-build`.
- Recovered production proof passed with homeserver running, backup verification `pass` and restore drill `pass`: `C:\temp\wt\proofs\wed358-51eacb0\postdeploy-recovered`.
- Oracle `SOURCE_COMMIT` and `oracle-runtime-manifest.json` both contain the full frozen SHA.
- `omnyid_schema_migrations` contains `0157_wedding_vendor_portal_extensions` once. The publication revisions, memberships, notification preferences and content-light event tables all exist; the five required owner-profile publication columns exist.
- The seven long-running services are up; ClamAV and Electric report healthy. `https://omnyid.com/` and `/workspace/vendor.html` return 200. Anonymous vendor publication and admin-review calls return 401.
- The hosted vendor bundle contains the `Publish your listing`, `Publication history`, named-resource, team and notification controls.
- No simulated data or local environment file was uploaded.
