# WED-314 Family request lifecycle assurance

Date: 2026-11-01

Implementation SHA: `de3e9bb6f74e47c7f2b2f356a821b6205c44e538`

Branch: `agent/codex/WED-308`

Implementation worktree: `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`

Clean verifier: `C:\Users\ozans\AppData\Local\Temp\omnyid-wed314-verify-de3e9bb`

## Outcome

The remaining autonomous Family lifecycle slice is complete. Couple-captured
requests persist as AFP-backed drafts and do not appear in the decision queue
until explicitly submitted. The authenticated server command evaluates the
current active rules, not client-supplied policy metadata, and returns pending,
auto-blocked or expired state without modifying any connected Wedding record.
Draft and submitted requests can be withdrawn through the same versioned,
idempotent command boundary. Withdrawal is confirmed in the UI and terminal.

## Security and data-integrity checks

| Control | Evidence |
|---|---|
| Tenant isolation | Commands derive account and wedding scope from the authenticated principal; cross-tenant records are not addressable. |
| Optimistic concurrency | The expected request version must match the latest AFP successor. |
| Retry safety | Exact idempotency-key retries return the original receipt rather than creating another transition. |
| Current policy | Submission resolves the latest active blocking rules on the server. |
| Non-mutation | Submit and withdraw do not alter guests, invitations, RSVP responses, budget, seating or vendor records. |
| Terminal states | Approved, declined, withdrawn, expired and auto-blocked requests cannot transition again. |
| Decision-queue discipline | Drafts are excluded; only reviewable pending states project into the queue. |
| Accessible withdrawal | The mobile control requires an inline large-button `alertdialog` confirmation. |

## Exact-SHA verification

All commands below ran from the clean verifier at the full implementation SHA.

- Solid typecheck: passed.
- Wedding frontend tests: **2,134 passed**.
- New-file line-budget checks: **2 passed**.
- Production frontend build: passed.
- Family browser checks: **2 passed**.
- Rust request-lifecycle unit tests: **2 passed**.
- Disposable-PostgreSQL Family integration suite: **7 passed**.
- The disposable `omnyid_test` database was terminated and dropped after the run.

The database suite covers exact retry, stale versions, terminal transitions,
cross-tenant isolation, current-rule auto-blocking, withdrawal and absence of
connected mutations alongside the existing Family governance scenarios.

## Release boundary

No deployment was requested or performed. Oracle remains on
`eb398ebfecaec6a0277d7fe634e6c97198b44afe`.
`OMNYID_WEDDING_BOUNDARY_HELPERS_ENABLED` and
`OMNYID_WEDDING_BOUNDARY_DELEGATES_ENABLED` remain false. Couple usability,
delegated-helper usability, a separately authorised allowlisted cohort and
promotion after objective cohort criteria are still external rollout gates.
