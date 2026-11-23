# WED-334 vendor search and lifecycle release evidence

Date: 2026-11-05  
Application SHA: `04357129a4f407ad9974976f66ff6d0ac33ffd8e`  
Release checkout: `C:\temp\wt\omnyid-wed334-release-0435712`

## Shipped behavior

- A vendor category is passed as a structured constraint and no longer replaces the couple's typed
  wording.
- Supported query descriptors such as rustic, country and micro wedding join saved Wedding
  preferences in search and evidence-backed ranking.
- A completed vendor search suppresses the readiness-only notice and reveals its comparison in
  place.
- A selected lifecycle vendor retains About and Conversation history. Its companion panel shows a
  vendor photo and accessible Message, Quote and Booking tabs sourced from the existing AFP and
  document projections.
- Message distinguishes unsent drafts from sent and received history. Quote preserves the original
  document, normalized analysis and an in-place received-quote comparison. Booking reports only
  evidence-backed state, date and terms.

## Exact-SHA verification

The clean detached checkout reported the expected full SHA and no tracked modifications before
build or deployment.

- `npm run test:wedding:ci`: pass
  - TypeScript typecheck: pass
  - General and Wedding line budgets: pass
  - Public Wedding site, metadata and CSP checks: pass across 74 sitemap pages
  - Wedding tests: 2,206 passed, 0 failed
- `npm run build`: pass
- Focused state/source suite: 23 passed
- Chromium at 320, 390 and 1280 pixels: query remains intact after category selection, no serious
  or critical axe findings, and no horizontal overflow.

## Oracle evidence

The clean candidate was deployed with the existing remote environment. Oracle reports the same
full SHA in both `SOURCE_COMMIT` and `oracle-runtime-manifest.json`, and the public workspace
returned HTTP 200.

The cold build recreated 6.605 GB of unused Docker builder cache and the first restore preflight
was 1.58 GiB below its safety threshold. Only that unused builder cache was pruned. No volume,
backup, running image or application data was removed.

The repeated `oracle-production-proof.ps1` result is `pass`:

- manifest verification: passed
- runtime script integrity: pass
- homeserver and backup service: running
- backup verification: pass
- isolated restore drill: pass
- root filesystem use: 75 percent

## Rollout boundary

This release does not enable multi-recipient Invite Proposals delivery. The existing proposal UI
still saves a private draft with `external_action: false`. Recipient eligibility, per-vendor
approval conversion, idempotent delivery and false-default rollout remain WED-333 work.
