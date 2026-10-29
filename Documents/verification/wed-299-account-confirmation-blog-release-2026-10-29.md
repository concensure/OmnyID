# WED-299 account confirmation and Wedding blog release evidence

Date: 2026-10-29 Australia/Sydney

Application commit: `1176aa171909ebdadac100bd5d689522479b9c60`

Release checkout: `C:\Users\ozans\AppData\Local\Temp\omnyid-wed299-release-1176aa1`

Branch: `agent/codex/WED-299`

## Released scope

- Source-aware Wedding and generic account-confirmation experiences.
- Fixed, server-classified confirmation destinations rather than caller-provided redirects.
- Optimized local Wedding and generic community imagery with attribution.
- Forty reconciled Wedding blog articles, a publication CSV and searchable rich taxonomy.
- No transactional-provider credential, vendor-mail flag or ranking-policy change.

## Frozen-candidate checks

All release checks ran from the clean detached checkout of the application SHA:

- TypeScript typecheck: pass.
- Wedding tests: 2,042 passed, 0 failed.
- Wedding website, CSP, animal quiz, confirmation and blog catalogue smoke: pass.
- Source and Wedding line-budget guards: pass.
- Production UI build: pass; only the existing large-chunk advisory remains.
- Verification-source Rust tests: 2 passed, 0 failed.
- SMTP-out Rust tests: 7 passed, 0 failed.

The clean typecheck requires dependency installation in both `typescript-sdk` and `solid-ui`; installing only the latter leaves the linked SDK's `zod/v3` types unresolved.

## Confirmation contract

The backend reduces registration/resend source values to either `wedding` or `generic`. Unknown and missing values select generic. The source only changes page presentation and chooses one of two fixed destinations:

- Wedding: `/workspace/?auth=signin&source=wedding&verified=1`.
- Generic: `/workspace/?auth=signin&verified=1`.

The success page removes the token from browser history, announces an eight-second transition and offers `Stay on this page`. Invalid, missing or expired tokens show a recoverable failure and do not redirect.

The Wedding image is a 19,616-byte WebP and the generic image is a 26,116-byte WebP. Both are served locally; the page retains source attribution.

## Blog reconciliation

- Static published articles: 40.
- Editorial mirror articles: 40.
- CSV records: 40.
- Taxonomy covers all six planning stages.
- Each article has stakeholder, stage and emotion tags, plus location tags where relevant.
- Catalogue cards retain their existing featured category; richer tags are visible inside the article and included in search metadata.

The reconciliation script is idempotent and validates one-to-one article/taxonomy coverage before updating the catalogue and CSV.

## Oracle release proof

- Deployment used the existing remote environment and excluded simulated data.
- Preflight proof: pass.
- Homeserver, backup service and runtime-integrity read-only post-deploy proof: pass.
- Backup verification: pass.
- The isolated restore drill ran to completion and its temporary data was removed. The deploy polling wrapper did not emit its local final file after the remote process exited, so it was stopped; restore was not repeated. A fresh proof then passed with restore explicitly skipped.
- Six representative deployed source/static hashes match the clean candidate.

Hosted checks:

- Verification HTML, CSS and JavaScript: HTTP 200.
- Both optimized confirmation images: HTTP 200.
- Wedding blog catalogue and two newly reconciled celebrant guides: HTTP 200.
- Workspace: HTTP 200.
- Mobile Chromium at 390 px: no horizontal overflow and no console errors.
- Search query `celebrants`: seven visible matching article cards.

## Settled disk state

- Root filesystem: 45 GB total, 36 GB used, 8.2 GB available, 82% used.
- Docker images: 14.3 GB, of which 11.47 GB is reclaimable.
- Docker build cache: 9.798 GB, of which 6.681 GB is reclaimable.
- `/var/backups/omnyid`: 6.4 GB.
- System journal: 217.1 MB.

This is safe for the completed release but warrants reviewed image/cache and backup retention before disk pressure returns.

## Provenance note

Oracle runs application commit `1176aa171909ebdadac100bd5d689522479b9c60`. The following coordination/evidence commit changes only this report and agent state; it is not a new application candidate.
