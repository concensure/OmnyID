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
- Focused WED-410 frontend contracts are included in the complete Wedding suite.
- `npm run test:wedding`: 2,397 passed.
- `npm run test:wedding-site`: 95 public/security pages passed.
- `npm run build`: passed with 1,862 modules.
- `cargo check --lib`: passed.
- Windows `rustc` intermittently terminated with an access-violation/heap-corruption status. Both focused tests passed under Linux against the exact clean release SHA: the email states its absolute seven-day expiry, and every private hidden-listing exchange/session/scope/mutation check shares the same eligibility rule.
- Isolated staging caught and prevented promotion of the first candidate because link creation accepted hidden listings while exchange and scoped session checks still required public-active status. The shared private capability checks were corrected together; the discarded candidate was never promoted to production.

## Production data preflight

Read-only Oracle inspection found the existing hidden test listing
`qa-test-celebrant` (`[QA] Test Celebrant (do not book)`). No canonical listing for
Double Happiness or Lourde Lam existed before this release. The requested record was
therefore created as `celebrant-double-happiness-lourde-lam`, hidden and not priority
eligible, without invented contact or registration claims. Its evidence explicitly
records Lourde Lam as user supplied and the contact/register checks as pending.

## Candidate, rollout and rollback

- Exact implementation and deployed SHA: `dd19bdc0917b83867ccf5fb322f1315a83bb4ce0`.
- Clean release worktree: `C:/temp/wt/omnyid-wed410-release-dd19bdc0`.
- Native ARM64 workflow `45255791339`, artifact `14859825759`, archive SHA-256 `fd4d8684a26905a5f5fd4dfe1986c4e57fa2c42cc955fe4b43f4f14250dcfffb`; the loaded ARM64 image carries the exact revision and has runtime image ID `sha256:afc4b540c1c61bff7601ebcf43ce291f66d1d4ecb5b623db2672d660f9031fa6`.
- The matching Workspace archive SHA-256 is `bc01a58725dacd48d25e4767ccaf96c5a5cb8ed6a35d3eafb0a76ee3fd3e57fa`; hosted `index.html` matches the clean candidate at `f7027c2b32d704580945e2f71dc123c33bf5ab8dcf8a79ef08c7021dca53cfd2`.
- Isolated staging ran the exact image with zero restarts and passed authenticated health, readiness and database checks before promotion.
- Production `/`, `/wedding/`, `/workspace/` and `/docs/` return 200. The scheduled read-only monitor passes all eight authenticated checks. Caddy validates; homeserver and Caddy have zero restarts. `SOURCE_COMMIT` and the runtime manifest name the exact deployed SHA.
- Rollback is retained at `/home/ubuntu/omnyid-candidates/wed410-dd19bdc0917b83867ccf5fb322f1315a83bb4ce0/rollback`; prior image tag `omnyid-homeserver:pre-wed410-70e7a8c6` points to WED-408 revision `70e7a8c6309b12595c676072b2a1412a201bd390`.
- Root use is 79% with about 9.9 GB free after retaining the candidate and rollback. No running container was removed or repurposed.

## Private capability records

Bearer URLs are intentionally not committed. Production records only the one-way token
digest and auditable grant metadata:

- Double Happiness / Lourde Lam: grant `wcc_grant_cd09524077674b52968ca05cb729baf5`, active, expires `2026-12-07T20:33:53.984648Z`.
- Hidden QA celebrant: grant `wcc_grant_171a75fffae748e4ae3fd716ab893c0d`, exchanged during hosted proof, expires `2026-12-07T20:33:54.393746Z`; exchange and scoped-session endpoints both returned 200.

An initial smoke assertion expected a flat `vendor_id` although the endpoint correctly
returns a nested vendor object. Its inaccessible one-time grants were revoked and their
sessions consumed before the final two grants above were issued. The final plaintext
bearer URLs are returned only to the requesting user.
