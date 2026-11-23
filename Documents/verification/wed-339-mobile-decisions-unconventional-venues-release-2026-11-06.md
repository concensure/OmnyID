# WED-339 mobile decisions and unconventional venues Oracle release

## Released candidate

- Application SHA: `6a6dc45def278938a06fcbb85574d255a1bb3877`
- Branch: `agent/codex/WED-339`
- Source worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`
- Clean release checkout: `C:\temp\wt\omnyid-wed339-release-6a6dc45`
- Oracle `SOURCE_COMMIT`: exact match
- Oracle `oracle-runtime-manifest.json`: exact match

## User-visible result

- The mobile Today decision surface uses the viewport above a shorter safe-area
  navigation bar and removes redundant outer gutters.
- Swipe guidance appears above the first decision only. The mobile-only
  `Decision focus` heading and the repeated footer guidance are gone.
- An upward swipe defers the current decision. A downward swipe executes its
  recommendation through the existing AFP decision path.
- Only the current and immediate-next decisions receive funded background
  research. Supplier decisions reuse live vendor search and Ranking Policy V2
  to prepare three options and a personalised top choice.
- Vendor research, the shortlist, task assignment and other secondary action
  surfaces still open in place beneath the focused decision.

## Venue import

- Loaded the WeddingNSW prerequisite, the Wedlockers/Urban List prerequisite,
  and the cumulative unconventional-venue import in that order.
- Replayed the cumulative unconventional import a second time successfully to
  prove production idempotence.
- Added 57 new venue rows. Existing or staged rows were blank-filled and tagged
  without overwriting populated values.
- Live special-category totals after the replay:

  | Special category | Count |
  | --- | ---: |
  | boat | 13 |
  | botanical | 15 |
  | entertainment | 15 |
  | gallery | 5 |
  | library | 2 |
  | museum | 8 |
  | warehouse | 12 |
  | zoo_aquarium | 8 |

- Existing rows are resolved by canonical vendor ID first and stable slug
  second. This prevents staged import IDs from creating duplicate or detached
  enrichment data.
- WILD LIFE Sydney Zoo is linked to its official wedding page, with current
  official evidence for weddings, packages, tailored planning and catering.
  It retains `verify-before-booking`; current price, availability and capacity
  must be reconfirmed before a couple relies on them.

## Exact-candidate verification

- TypeScript typecheck: pass.
- Anti-monolith and Wedding 999-line budgets: pass.
- Public Wedding metadata, CSP, catalogue, quiz, confirmation, lead-magnet and
  countdown checks: pass.
- Wedding suite: 2,222 passed, 0 failed.
- Production Vite build: pass.
- Focused 375 x 812 mobile decision swipe journey: pass on the feature commit;
  the later candidates changed only import resolution and generated SQL.
- Focused Rust vendor-search tests: 70 passed on the feature commit; Rust source
  is unchanged in the released candidate.
- Disposable pgvector import proof: ordered prerequisite loads plus two
  cumulative replays passed with the exact eight expected category totals.

## Oracle evidence

- `/workspace/` returned HTTP 200 after promotion.
- Homeserver, Caddy, Postgres, backup, Electric and SeaweedFS are running;
  ClamAV is healthy.
- Authenticated production proof: pass.
- Backup verification: pass.
- Isolated restore drill: pass.
- Unused Docker builder cache reclaimed after the build: 4.8 GB.
- Final root use: 82%, with 8.0 GB available.
- Release-specific SQL staging files were removed after the audited replay.

## Remaining work

The user-facing and operational follow-ups are recorded in
`Documents/issues/wedding planner/2026-11-06-wedding-planner-strengthening-report.md`.
Imported venues carrying `verify-before-booking`, `verify-trading` or contact
lookup flags must remain visibly provisional until reviewed from primary
sources or direct vendor evidence.
