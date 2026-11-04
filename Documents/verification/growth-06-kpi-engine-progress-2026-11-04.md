# GROWTH-06 KPI engine progress — 2026-11-04

Worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`

Branch: `agent/codex/GROWTH-001`

Base SHA: `9e44301e106f7da21ba14beb48951d710e53ef2d`

## Completed slice

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

## Verification

Four focused KPI/window/cohort tests pass. The module has no external calls and stores no Wedding
content. `chrono-tz` supplies the reviewed IANA Sydney timezone rules.

## Remaining GROWTH-06 work

Add migration-backed daily rollups, incremental checkpoints and full rebuild comparison; assemble
all six KPI outputs for current/previous periods; then run the disposable Postgres, migration,
compile and line-budget gates. GROWTH-06 remains `in_progress`.
