# WED-300 Wedding interaction release evidence

Date: 2026-10-29 (Australia/Sydney)

## Frozen candidate

- Worktree: `C:\Users\ozans\AppData\Local\Temp\omnyid-wed300-9d7543c`
- Branch source: `agent/codex/WED-300`
- Application commit: `9d7543cce53808d4a9cedcd2ae2707bfba19e03c`
- Candidate status before build and deployment: clean
- Simulated data: excluded
- Existing Oracle environment: preserved
- Release Policy V2 and vendor-mail rollout flags: not changed

## Delivered behavior

- Wedding publishing policy now requires rich article taxonomy and reconciliation with `blog-publication-catalogue.csv`.
- The public four-step Wedding explanation is a responsive vertical stepper and its FAQ explains the relationship between tasks and the Today focus card.
- Custom Wedding tasks carry both required planner supertags, refresh reliably, and remain visible in the selected stage and Tasks projection.
- Owner selection is stable and contact-backed, with inline contact creation preserved.
- The unknown-cost task has contextual help, and the completion action says `Move back to to-do` rather than `Reopen`.
- The redundant Vendors overview tile and two receipt-bound operator-test follow-ups were removed without deleting either vendor listing.
- Follow-up reminders save only on the explicit action and accept today or future dates.
- The Today decision card no longer exposes internal queue-mechanics copy.
- Vendor comparisons describe confirmed preference matches and retain checked, unknown, and conflicting evidence rows.
- The enquiry rich-text toolbar has a reactive ready state; typing no longer remounts the home section; attachments are snapshotted before input reset and show an approval-aware confirmation.

## Exact-candidate verification

- TypeScript typecheck: pass
- Wedding site smoke: pass
- New-file line budget: pass
- Wedding suite: 2,044 passed, 0 failed
- Rust database and migration tests: 63 passed, 0 failed
- Production UI build: pass (the existing large-chunk warning remains)
- Dependency install: pass; the UI audit still reports the inherited 38 moderate and 1 high dependency advisories, with no automatic audit rewrite applied

## Oracle deployment and hosted verification

- Guarded preflight: pass
- Homeserver, UI, backup, and Caddy images: built and restarted
- Caddy workspace smoke and CSP check: pass
- Read-only post-deploy production proof with the duplicate restore step skipped: pass
- Backup service: running
- Homeserver: running
- Latest backup manifest verification: pass
- The initial post-deploy proof launched its isolated restore drill, which exited and removed its temporary containers; the local PowerShell wrapper did not return afterward. It was stopped only after the remote restore processes had ended, then the remaining proof was rerun successfully with `-SkipRestoreDrill`. No restore-drill pass is inferred from the wrapper stall.
- Public Wedding page: HTTP 200; four step cards, the vertical-stepper hook, and the architecture FAQ are present
- Public workspace shell: HTTP 200
- Hosted workspace bundle contains `Move back to to-do`, the matched-preference fallback, attachment approval confirmation, and no old urgency sentence or `Based on 0 checked facts` string
- Exact fixture-row count after migration: 0
- External health URLs are authentication-protected and return HTTP 401; production proof and the active runtime container are the health authorities used here
- Settled root disk during verification: 83% used, 37 GB of 45 GB, 7.8 GB free

Local proof artifacts are under `%TEMP%\oracle-production-proof-wed300-9d7543c`. They are operational evidence, not source files.

## Residual verification boundary

Authenticated production mutations were not repeated against a real couple account merely for release evidence. Reminder, task, editor, and attachment behavior is covered by the exact-candidate tests; the hosted bundle and database migration were checked read-only after deployment.
