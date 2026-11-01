# WED-312 Family Boundary Access Assurance

Date: 2026-11-01

## Candidate

- Implementation SHA: `a1e4023fba9d276f26b3d911fd7c404ed3346d84`
- Branch: `agent/codex/WED-308`
- Implementation worktree: `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`
- Clean verification worktree: `C:\Users\ozans\AppData\Local\Temp\omnyid-wed312-verify-a1e4023`
- Production SHA remained `eb398ebfecaec6a0277d7fe634e6c97198b44afe`; WED-312 was not deployed.

The clean worktree was detached at the exact implementation SHA and had no tracked changes before verification. Local dependency directories were junctioned into the clean checkout; they were ignored build inputs, not candidate source changes.

## Completed behavior

- The couple can inspect, create and revoke Family helper links and authenticated Planner or RSVP-guest grants from one owner-facing surface.
- Link helpers and account-bound delegates are labelled separately. Helper capability material is shown once after creation and is not returned by the grant list.
- Planner and RSVP-guest grants use minimum-necessary roles and proposal rights. They do not receive couple approval, invitation-send, spend or vendor-contract authority.
- The capability endpoint reports only whether helper and authenticated-delegate rollout is enabled. It returns no owner, account or grant identifiers.
- Allocation rules require a bounded guest count, deadline rules require a date, and non-wedding scopes require a scope identifier. The client and server independently validate these conditions.
- Only pending and partially approved requests enter the decision queue. Approved, declined, withdrawn, expired and auto-blocked requests remain terminal.
- An elapsed request deadline projects as expired. A decision attempted after expiry records the terminal successor and does not apply a guest, invitation, RSVP, budget or vendor mutation.

## Security and privacy review

| Boundary | Evidence | Result |
|---|---|---|
| Tenant and Wedding scope | Real-Postgres tests exercise tenant-private household, rule, delegate and request access | Refuses cross-scope use |
| Forwarded helper material | Capability lookup remains digest-based and exact-scope; raw material is never listed again | Fails closed outside its grant |
| Delegate privilege | Unit and database tests constrain Planner and RSVP-guest projections and actions | No couple approval authority |
| Private data | Projection tests exclude private notes and logistics-only fields outside their role | Minimum-necessary projection |
| Revocation and expiry | Grant revocation and deadline expiry are checked at use time | No stale access or mutation |
| Duplicate and stale commands | Idempotency receipts and expected revisions are exercised by database tests | Exact replay returns one result |
| Rollout | `helper_links_enabled` and `authenticated_delegates_enabled` are false without their explicit switches | False by default |

No capability token, digest, credential, account identifier or private guest content is included in this evidence file.

## Exact-candidate verification

All commands below ran against the exact implementation SHA in the clean verification worktree.

- Solid typecheck: passed.
- Wedding frontend tests: 2,124 passed.
- Line-budget tests: 2 passed.
- Production frontend build: passed.
- Focused Family Boundary Rust unit tests: 13 passed.
- `wedding_boundary_postgres` against disposable PostgreSQL: 6 passed.
- `wedding_boundary_rule_postgres` against disposable PostgreSQL: 1 passed.

The disposable PostgreSQL container used a temporary filesystem and was removed after the run.

## Rollout decision

This evidence completes the autonomous WED-312 implementation and security-assurance slice. It does not authorise public Family helper or delegate access. Keep `OMNYID_WEDDING_BOUNDARY_HELPERS_ENABLED=false` and `OMNYID_WEDDING_BOUNDARY_DELEGATES_ENABLED=false` until the remaining hosted keyboard/screen-reader/usability checks and a separately authorised, narrow allowlisted cohort pass.

## Remaining roadmap work

- Hosted checks at 320 px, 375 px and 200% text zoom with keyboard and screen-reader coverage.
- Couple and deliberately restricted delegate usability sessions.
- CSV/table household import through the existing quarantined import/review pipeline.
- Shared Plan/day-details meal editor, structured quote menu mapping and impact review before replacing a catalogue used by RSVP responses.
- A controlled Family helper/delegate cohort followed by an explicit promotion decision.
