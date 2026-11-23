# WED-408 OAuth, Growth and Wedding budget release

Date: 2026-11-23 (Australia/Sydney)

## Scope and diagnosis

- Google Identity script loading and the homeserver's Google token-info request each had a single-attempt failure path. A transient browser, network, rate-limit or upstream server failure therefore made the first click fail even when a later click succeeded.
- `concensure@gmail.com` is already in the production operator allowlist. The Growth route separately returned "Growth analytics is disabled" because the production homeserver did not receive `OMNYID_GROWTH_ANALYTICS_ENABLED=true`; this was a rollout-configuration failure, not an operator-authority failure.
- Wedding preparation templates were being projected into every response workspace as if they were account work. The supplied Chromium audit records the resulting cake, dress and transport tasks as pre-marked work even though the audited account had not selected them.
- The Budget overview target was display-only. Per-category `Use` links silently changed a value with too little explanation, the extra-costs card duplicated evidence, and the fixed category list could not represent a couple's own budget structure.

## Implementation contract

- Google Identity script loading retries once after removing a failed script tag. The credential exchange is guarded against duplicate callbacks. The browser retries one classified transient API failure, while the server independently retries the Google token-info request once with an eight-second timeout for transport, HTTP 429/5xx or malformed-success responses. Authentication rejection and other 4xx responses are never retried.
- Growth remains server-authorized and operator-only. Compose now forwards the existing false-default feature flag; production explicitly enables it. No client email check grants Growth access.
- Preparation templates remain a catalogue. Only persisted, selected or evidence-derived task records project into an account's Wedding overview.
- Both Budget target surfaces open and focus the canonical total-budget editor. The inert per-row `Use` links and `Extra costs to check` card are removed.
- A couple may add up to 12 named categories. Custom and standard allocations must equal the total before Save is enabled. Save continues through the existing revision-aware AFP decision projection; custom category cells round-trip from persisted decision records and remain scoped to the active Wedding workspace.

## Verification

- Focused Google, budget, task-projection and UX contracts: 31 passed.
- Full Wedding suite: 2,393 passed, 0 failed.
- TypeScript: passed.
- Source and Wedding line budgets: 2 passed.
- Public Wedding/security suite: 95 sitemap pages plus all engine checks passed.
- Production frontend build: passed.
- Local focused Rust execution is not release authority on this Windows host because `rustc` terminated with `STATUS_ILLEGAL_INSTRUCTION`; the exact committed source must pass the native ARM64 workflow before promotion.

## Release evidence

- Exact implementation and deployed source SHA: `70e7a8c6309b12595c676072b2a1412a201bd390`; clean candidate: `C:/temp/wt/omnyid-wed408-release-70e7a8c6`.
- Native ARM64 workflow `45167742228` passed for that full SHA. The downloaded archive SHA-256 is `ae9594db28ecbfba70c52f74e1a768fff600ddb7f5c733579c513280877a1252`; its embedded revision is exact. Oracle loaded image id `sha256:201ab8ef3e2b77fdfa1450d7bc7b2c7aa23346261321e0a98bd3600b6aaa804c` and reports architecture `arm64`.
- The clean candidate passed TypeScript, both line budgets, 31 focused Google/budget/task contracts, the 95-page public/security suite and the production frontend build. The implementation worktree passed all 2,393 Wedding tests.
- Isolated staging ran the exact WED-408 image with zero restarts and no startup error before production promotion.
- The Workspace archive SHA-256 is `e560e96ad4e622abb77653b597c19458e63d50621d5b8f0f24ee2e82d859b1ad`; the live `index.html` SHA-256 is `5e82347c63ac84a612022a3bc7e2d9f0f53f0cd8a5d55703b38025ef465b054e`, matching the candidate.
- Production forwards `OMNYID_GROWTH_ANALYTICS_ENABLED=true`. An unauthenticated Growth request gets 401, an authenticated ordinary monitor account gets 403 `operator access required`, and the running server confirms `concensure@gmail.com` remains in `OMNYID_ADMIN_EMAILS`. The operator's real Google session was not impersonated for verification.
- Public Workspace, Wedding and Google-auth configuration routes return 200. The scheduled read-only monitor passed all eight authenticated checks, including password login, bootstrap, health, readiness, database/daemon readiness and the current hashed asset. Caddy validates; homeserver and Caddy have zero restarts.
- `SOURCE_COMMIT` and `oracle-runtime-manifest.json` name the exact deployed SHA. Root use is 72% with about 13 GB free. The unreferenced WED-405 image generation was removed; the WED-407 image remains the rollback.
- Rollback is retained at `/home/ubuntu/omnyid-candidates/wed408-70e7a8c6309b12595c676072b2a1412a201bd390/rollback`, including the prior image tag `omnyid-homeserver:pre-wed408-1cf789ef`, Compose/env/Caddy/source files and the prior Workspace volume archive.
- A real Google account interaction was not automated or impersonated. The deployed Google configuration endpoint is live; the first-attempt recovery paths are covered by focused contracts and the native exact-SHA build.
- GitHub accepted the task branch, but could not create a PR because this repository's task lineage has no history in common with `main`.
