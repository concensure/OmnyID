# GROWTH-07 authenticated admin API — 2026-11-04

Worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`

Branch: `agent/codex/GROWTH-001`

Base SHA: `ec0b1af7dc9d51c3e2df1127c5fd0adddc6ae983`

## Delivered

- Added false-default operator routes for overview, campaigns, cohorts, benchmarks, data quality
  and formula-safe campaign CSV export.
- Reused authenticated sessions and `operator_access_allowed`; hidden navigation is not an access
  control. Disabled returns 404, anonymous returns 401 and an authenticated ordinary user returns
  403.
- Bounded report ranges to 366 days, page size to 100 and export to 5,000 aggregate rows.
- Responses label `growth-kpi-v1`, Australia/Sydney boundaries, attribution model, filters,
  numerator/denominator state and raw-attribution coverage limits.
- Campaign evidence keeps provider-reported Meta landing views and first-party sessions separate.
  An unmatched spend row remains visibly unmatched rather than being assigned to a campaign.
- Export cells neutralise spreadsheet formula prefixes and every export writes an operator audit
  receipt containing filters, definition version and row count.
- Benchmark read intentionally returns an empty collection with a no-fabrication notice until
  GROWTH-09 adds revisioned operator targets.

## Verification

- `cargo check --lib` passed with the shared target and incremental compilation disabled.
- A fresh loopback-only tmpfs pgvector PostgreSQL 16 database passed the extended GROWTH-06/07
  fixture for overview facts, campaign separation, weekly cohorts, quality and rebuild parity.
- The real test router passed anonymous 401, ordinary-user 403, operator 200, overlong-range 400
  and disabled 404 checks.
- New files are 384, 397 and 137 lines, below the 999-line ceiling. The temporary database was
  removed. No production flag or environment was changed.
