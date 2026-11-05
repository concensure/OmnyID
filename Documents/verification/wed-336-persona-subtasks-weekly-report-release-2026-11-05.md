# WED-336 release evidence — 5 November 2026

## Released candidate

- Application commit: `81b99015fa94712a85d3c2c8d0e9c4ea7b2cb06e`
- Release checkout: `C:\temp\wt\omnyid-wed336-release-81b9901`
- Oracle `SOURCE_COMMIT`: exact match
- Oracle `oracle-runtime-manifest.json`: exact match
- Public Wedding and Workspace routes: HTTP 200 after release

## What is live

- Sprout may be hidden from the floating control and restored in mobile-friendly Agent Settings.
- Agent personas accept an account-scoped, bounded user image; remote URLs and SVG payloads are rejected.
- Wedding tasks expose deterministic and user-added child tasks with owner, consult, due date,
  completion, explicit research and removal controls. Child tasks are excluded from the top-level
  queue and from automatic funded research.
- The duplicate officiant task is absent; the Australian celebrant and NOIM work remains.
- A Monday Sydney-time operator report covers aggregate registration, activation, engagement,
  public performance/interruption, Oracle disk and configured credential-expiry metadata.

## Verification

- Focused frontend/state tests: 13 passed.
- Wedding suite: 2,214 passed.
- Public Wedding checks, typecheck, both line budgets and production build: passed.
- Focused Rust tests, `cargo check`, migration-catalog parity and disposable pgvector migration/API
  proof: passed.
- Oracle migration 0146 exposes both required tables and the persona-image column.
- The 2 November report has exactly one production receipt with status `accepted`. This is provider
  acceptance through the authenticated Cloudflare platform sender, not a claim of inbox reading.
- Exact-SHA Oracle proof: backup service and homeserver running, manifest and backup verification
  passed, and the isolated restore drill passed.

## Capacity and cleanup

The release build temporarily raised root use to 91%, so the first restore preflight correctly
refused to run. Only 3.73 GB of unused Docker builder cache, dangling unreferenced images, and five
explicit old `/tmp/omnyid-*` release artifacts were removed. No Docker volumes, backups, running or
rollback images, database rows, or application data were removed. The repeated proof passed with
Oracle root use at 82% (36 GB of 45 GB, 8.2 GB available).

## Operator follow-up

The three credential-expiry environment fields are intentionally blank because no verified expiry
dates were available. The weekly email reports this as “date not recorded”; add dates when provider
records are known rather than inventing reminders.
