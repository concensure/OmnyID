# GROWTH-06 KPI engine progress — 2026-11-04

Worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`

Branch: `agent/codex/GROWTH-001`

Base SHA: `9e44301e106f7da21ba14beb48951d710e53ef2d`

## Completed implementation

- Added exact Australia/Sydney daily and trailing report windows plus equal-length previous periods.
- DST tests prove the 5 April 2026 day is 25 hours and 4 October 2026 is 23 hours.
- Added typed `available`, `unavailable` and `provisional` KPI results carrying numerator,
  denominator, value/unit or maturity date rather than silently returning zero.
- Cost-per-unit uses AUD minor units. A$200 / 100 sessions returns A$2 per visit; zero and
  incomplete inputs return typed unavailable states.
- Weekly days-one-to-seven return cohorts deduplicate by canonical Wedding, merge duplicate source
  observations, exclude activation day, and exclude immature Weddings from final denominators.
- Meta-reported landing views remain a separate count and cannot enter the first-party visit
  denominator.
- Added six server-side KPI outputs for current and equal-length previous periods: cost per
  first-party landing session, signup rate, seven-day activation, cost per activated Wedding,
  days-one-to-seven return and 30-day paid CAC.
- Added migration `0142_growth_daily_rollups.sql` with content-free daily aggregates and one
  projector checkpoint. Incremental runs revisit the trailing 30 days and any earlier corrected
  payment/spend day; full rebuild remains deterministic over the supplied range.

## Verification

Five focused KPI/window/cohort tests pass. A fresh loopback-only tmpfs pgvector PostgreSQL 16
container applied all registered migrations and passed a fixture covering a first-party landing
view, a separate 900-view Meta report, registration, activation, later-day return and A$200 spend.
Deleting only the aggregate/checkpoint and running the incremental projector produced rows exactly
equal to the full rebuild. Migration-catalog parity and compilation pass. New files are 402, 528
and 31 lines, below the 999-line ceiling.

## Boundary

This work does not enable the admin panel or expose a route. Meta-reported landing views remain
context only. Historical raw attribution can expire under the reviewed retention policy while
already-produced de-identified date aggregates remain; a future operator rebuild must disclose
source coverage rather than replacing unavailable history with zeros.
