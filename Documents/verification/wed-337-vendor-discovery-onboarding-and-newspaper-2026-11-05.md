# WED-337 vendor discovery, onboarding and newspaper verification

Date: 2026-11-05

## Scope

- Add Linda Dagher Music and Jessica Zammit to the existing claimable Wedding vendor authority.
- Make descriptive vendor searches reach Ranking Policy V2 with a query-responsive candidate pool.
- Reconcile the 2026-11-05 vendor-journey UX report against the current architecture and fix defects that still reproduce.
- Publish the Wedding newspaper article through the existing public-site catalogue, taxonomy and sitemap.

## Vendor source record

The idempotent migration `0147_wedding_musician_vendor_listings.sql` records:

- Linda Dagher Music: official website and supplied business email, Sydney and Greater NSW, with official service labels for live music, acoustic duo/trio, singer, DJ and MC.
- Jessica Zammit: official Instagram, supplied business email and phone, Sydney, with official profile evidence for vocal and piano wedding/event performance.

Both are `unclaimed`. Source verification does not claim availability, pricing or suitability. A disposable pgvector database applied every embedded migration, replayed migration 0147, and retained exactly two vendor rows and three source-backed attribute rows.

## Ranking defect and correction

The directory previously returned the first five category matches and treated their count as proof that a descriptive query had been answered. A request such as “rustic country micro-wedding venues in Sydney” could therefore skip live discovery before Ranking Policy V2 received query-relevant evidence. The same five inputs naturally produced the same shortlist.

The correction keeps one authority and one V2 ranking path:

- the directory supplies a bounded wider candidate pool rather than five alphabetic rows;
- generic category rows no longer count as query coverage for descriptive requests;
- live discovery may run until at least three cached candidates carry requested distinctive evidence;
- V2 still owns final scoring, preserves unknowns and never treats source verification as suitability verification.

The production build must set `VITE_WEDDING_VENDOR_RANKING_POLICY_V2=true`; hosted release verification must confirm that flag rather than relying on a local default.

## UX report reconciliation

The report inspected `agent/claude/WED-178` at `e7d947b`, not the current release line. Current code already includes verified ownership methods, fuzzy business-name selection, preserved claim hand-off, listing proposals, profile/contact editing, a vendor inbox, quote construction, booking responses and scoped no-account response capabilities.

Current issues fixed in this slice:

- public owner photos now require a verified claim, so pending or revoked claim assets cannot replace curated photos;
- claim lookup gives a visible no-claim result;
- vendor actions use the Wedding button tokens rather than missing marketing classes;
- photo uploads surface bounded server text errors;
- the licence placeholder is replaced by `privacy@omnyid.com`, with a new version and server-pinned digest;
- expired sessions present a sign-in recovery link that preserves the selected listing;
- the destructive photo action meets the 44 px touch target and published-photo copy no longer exposes image-processing implementation detail.

The larger photo-manager improvements in the report—multi-select upload, reordering, cover editing and removal undo—remain product enhancements rather than blockers for the verified single-photo flow.

## Local evidence

- `cargo test --test wedding_vendor_ownership_api -- --nocapture`: 2 passed against disposable Postgres.
- Migration 0147 replay: 2 vendor rows, 3 attribute rows, both claims `unclaimed`.
- Migration catalogue parity: passed.
- Descriptive-query coverage units: 2 passed.
- Licence digest pin unit: passed.
- Query intent and Ranking Policy V2 frontend units: 13 passed.
- Full Wedding frontend suite: 2,215 passed.
- TypeScript typecheck: passed.
- Source and Wedding line budgets: passed; every new file is below 1,000 lines.
- Public Wedding site, metadata, CSP, quiz, confirmation, blog catalogue, lead-magnet and countdown checks: passed.
- Production frontend build: passed.

## Hosted release evidence

- Released application SHA: `a3deb39343e4c81a00489b8209c573ec10ce4f97` from clean checkout `C:\temp\wt\omnyid-wed337-release-a3deb39`.
- Oracle `SOURCE_COMMIT` and `oracle-runtime-manifest.json` both name that exact SHA.
- Migration `0147_wedding_musician_vendor_listings` is applied once. Production contains exactly two matching vendor rows and three matching attribute rows; both claims are `unclaimed`.
- `https://omnyid.com/wedding/directory/linda-dagher-music` and `https://omnyid.com/wedding/directory/jessica-zammit-music` return `200` with their business names and claim actions.
- `https://omnyid.com/wedding/blog/how-to-make-a-wedding-newspaper.html` and its blog-index card return `200`.
- Oracle has `VITE_WEDDING_VENDOR_RANKING_POLICY_V2=true`; the JavaScript served from `/srv/workspace` contains `VITE_WEDDING_VENDOR_RANKING_POLICY_V2:\"true\"`, and the served workspace index digest matches the final UI image.
- An authenticated hosted `online_capable` search for “rustic country micro-wedding venues in Sydney” performed live discovery and returned The Rustic Nest Yarramalong as query-specific evidence. A waterfront-harbour search did not spend another provider call because at least three relevant cached waterfront candidates already covered it. The evidence paths therefore differ instead of treating any five category rows as equivalent query coverage.
- Final production proof passed: homeserver and backup service running, backup manifest and script integrity passed, latest backup age zero days and backup verification passed. The restore drill was skipped because this release did not alter backup or restore contracts.
- Root disk was 93% used with 3.5 GB free after the build. A bounded dangling-image prune reclaimed `0 B`; no volumes, backups, current images or rollback tags were removed.
