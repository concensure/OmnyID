# WED-350 venue quote comparison release evidence

## Candidate

- Worktree: `C:\temp\wt\omnyid-wed350-release-f5a9f97`
- Application SHA: `f5a9f971cdcfe8bfc85b7c74492162d26aa61e98`
- Branch: `agent/codex/WED-350`

The release checkout was detached, clean and resolved to the application SHA
before deployment.

## Automated checks

- Focused Rust route tests: 2 passed.
- Wedding CI: typecheck, both line budgets, public-site checks and 2,249
  Wedding tests passed.
- Production Vite build passed.
- Chromium browser smoke passed at 390px and 1440px. It proved that no
  extraction request occurs before explicit analysis, an unchanged quote uses
  local cache, a per-head component does not become a package total, mobile has
  no horizontal overflow, root desktop scale is 1.1 and Wedding desktop scale
  is 1.2.

## Hosted checks

- `https://omnyid.com/`: 200 and deployed desktop scale declaration present.
- `https://omnyid.com/wedding/compare-wedding-venue-quotes.html`: 200 with the
  v2 engine and Analyse quote action present.
- Synthetic extraction fixture: `120 guests x A$275`, GST included. Response
  schema was `quote-extraction.v2`, model was `openai/gpt-5-mini`, pricing model
  was `per_head`, rate was 275, guest count was 120, whole-package amount was
  `not_found`, and `retained_by_omnyid` was false.
- Oracle `SOURCE_COMMIT` and runtime manifest both equal the application SHA.
- The OpenRouter credential is mounted from a root-owned mode-0600 secret
  file. The funded-inference flag is true and weekly maximum is USD 50.
- Final Oracle proof passed: homeserver and backup running, runtime manifest
  verified and current backup verified. Root and `/var` usage were 79%.
  Restore drill was skipped in this quick final proof.

No real couple proposal, quote, budget or vendor content was used in release
testing.
