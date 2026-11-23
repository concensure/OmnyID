# WED-410 actionable planner release

## Scope

- Make the Wedding date decision editable and saveable inside its current card.
- Replace empty setup evidence with concrete date, budget and guest guidance.
- Confirm custom decisions without reloading the whole Workspace.
- Restore the Timeline Gantt entry, safe zero-guest seating state, explicit guest-rule scope, readable persona editor and field-aware calendar dictation.
- Let the Wedding assistant expand and prepare account-scoped invite-proposal work through the existing editable and approval-gated flow.
- State the exact seven-day partner-invitation expiry in the email and API.
- Allow an operator to issue private availability links for hidden celebrant records without publishing those records.

## Implementation-worktree evidence

Worktree: `C:/temp/wt/omnyid-wed410`

Base SHA: `2c0333477fff0542c08dcc39ec30e2a93b64a232`

- `npm run typecheck`: passed.
- `npm run test:line-budget`: passed.
- Focused WED-410 frontend contracts: 26 passed.
- `npm run test:wedding`: 2,397 passed.
- `npm run test:wedding-site`: 95 public/security pages passed.
- `npm run build`: passed with 1,862 modules.
- `cargo check --lib`: passed.
- The focused Rust test process cannot complete on this Windows host because `rustc` terminates with an access-violation/heap-corruption status before returning a Rust assertion result. The exact Linux ARM64 candidate workflow is therefore a required release gate.

## Production data preflight

Read-only Oracle inspection found the existing hidden test listing
`qa-test-celebrant` (`[QA] Test Celebrant (do not book)`). No canonical listing for
Double Happiness or Lourde Lam existed before this release. The requested record will
be created hidden, without invented contact or registration claims, before its private
operator capability is issued.

## Candidate, rollout and rollback

To be completed only after a clean exact-SHA candidate passes native ARM64 build,
isolated staging, Caddy validation, disk threshold and hosted smoke checks. Private
bearer URLs are never committed to this file; only their vendor IDs, expiry instants
and production grant evidence may be recorded here.
