# GROWTH-05 spend import evidence — 2026-11-04

Worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`

Branch: `agent/codex/GROWTH-001`

Base SHA: `733f394d7464ba8caeb9159fa7472cd10b943cc6`

## Implemented

- Migration 0141 adds immutable import receipts, source rows, append-only corrections and operator
  audit records. Source and reviewed AUD values remain separately available.
- Operator-only endpoints preview, commit, submit a one-row manual entry and append a correction.
  The server recomputes every committed preview instead of trusting browser-supplied rows.
- CSV input is capped at 5 MiB, 20,000 rows, 64 columns and 4,096 bytes per cell. Parsing executes
  no spreadsheet content. Formula-like values are neutralised for preview/export presentation.
- File and canonical source-row SHA-256 digests make exact retry and overlapping imports
  idempotent. Unsupported identifiers remain nullable at their available aggregation grain.
- A file containing more than one account/campaign/ad-set/ad/creative/placement grain cannot commit
  without an explicit grain selection. Only rows at that grain commit, preventing total/detail
  double counting.
- Non-AUD rows require a positive operator-reviewed conversion rate, source and date. Corrections
  retain operator, timestamp and reason and cannot make effective spend negative.

## Verification

- 23 Growth tests passed, including four bounded parser/digest/grain/conversion/formula tests.
- The operator route limit and formula-safe preview test passed.
- Migration-catalog parity passed with 141 embedded migrations.
- `cargo check --lib` passed.
- A fresh loopback-only tmpfs `pgvector/pgvector:pg16` database applied all migrations and passed
  exact-file replay, row deduplication, append-only correction, non-negative effective spend and
  cleanup. It ran alongside the GROWTH-04 real database scenario, then the container was removed.
- Solid source and Wedding line budgets passed. New files are below 999 lines; `src/db.rs` and
  `src/server/mod.rs` remain line-neutral.

No Meta API, production database, Oracle deployment or advertising account was accessed.
