# WED-291 atomic run-sheet projection evidence

Date: 2026-10-29 (Australia/Sydney)

## Candidate

- Worktree: `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`
- Branch: `agent/codex/WED-291-atomic`
- Exact clean code candidate: `c1ee49a03a50507080f2172f431b49847169ed58`
- Base includes WED-290 generic Database definitions and WED-291 deterministic projector core.
- Deployment: not requested and not performed.

## Implemented boundary

- The browser creates bounded structured projection plans with `model_calls: 0`.
- The server authenticates the account and validates the run-sheet definition, wedding plan, source-message ownership, record contract, receipt coverage and detached-row boundary.
- PostgreSQL locks one account/database/projector checkpoint and commits the AFP record/revision/receipt messages, idempotency receipt and checkpoint together.
- Failed scope validation rolls back the inserted checkpoint. Concurrent writers produce one commit and one conflict. Retrying the winning idempotency key returns the same message IDs with `replayed: true`.
- Projection state reloads through an account/plan-scoped endpoint. Database opens and synchronizes the selected run-sheet profile without affecting generic databases.
- Creating the same registered profile for the same wedding plan selects the existing definition; an archived definition routes to restore.

## Exact-candidate verification

All commands reported the worktree above, exact SHA `c1ee49a03a50507080f2172f431b49847169ed58`, and an empty `git status --short` before execution.

| Check | Result |
|---|---|
| `cargo test wedding_runsheet_projection --lib -- --nocapture` | Pass: 6 focused tests |
| Disposable `pgvector/pgvector:pg18` test with `OMNYID_RUNSHEET_TEST_DATABASE_URL` | Pass: rollback, concurrency and idempotent retry |
| TypeScript typecheck | Pass |
| Database contract/registry and run-sheet projector/API tests | Pass: 19 |
| Source and Wedding line budgets | Pass: 2 |
| Full Wedding frontend suite | Pass: 2,027 |
| Production UI build | Pass |

The production build emitted the existing large-chunk advisory; it did not fail. The disposable database container was removed after the test. No external provider, hosted share route or outbound message was exercised.

## Remaining program work

WED-292 through WED-295 remain separate slices: profile editing controls, saved role views and sharing, deterministic conflict/A2UI rules, then accessibility/performance/shadow hardening. WED-291 does not activate those later capabilities.
