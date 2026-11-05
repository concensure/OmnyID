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

Hosted deployment, production database counts, exact-SHA provenance, runtime health and query-sensitive hosted evidence are recorded in the WED-337 handoff after release.
