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

Pending exact-SHA native ARM64, staging and Oracle evidence.
