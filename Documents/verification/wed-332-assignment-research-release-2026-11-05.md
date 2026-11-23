# WED-332 assignment and research-window release

Date: 2026-11-05 (Australia/Sydney)

## Frozen application candidate

- Commit: `bc7ca659fe4421a3d7dd1d8fc65b1d40485eec5d`
- Branch: `agent/codex/WED-332`
- Clean detached release checkout:
  `C:\temp\wt\omnyid-wed332-release-bc7ca65`
- Oracle `SOURCE_COMMIT`: exact match
- Oracle `oracle-runtime-manifest.json`: exact match

## Implemented behavior

- Funded decision research is limited to the current decision and its immediate successor. Resolving
  or deferring the current item advances the two-item window by one.
- Assigning an active Wedding task saves the existing AFP responsibility record and uses a
  rate-limited server route to email the newest research for that task as a Markdown attachment.
- When the assignee email belongs to another OmnyID user, a bounded A2UI/AFP handoff is also stored
  in that recipient tenant. It grants no access to the source Wedding workspace.
- Delivery receipts are idempotent, retain only the recipient email digest and permit a new
  delivery when the linked research revision changes.
- The selected/current Wedding journey stage uses the same amber as the In progress task rail;
  future stages use a close dashed outline.
- Seating's **Add attending guests** action opens and focuses the existing Guest RSVP quick actions.

## Verification

- TypeScript typecheck: pass.
- Focused current/next, assignment, stepper and seating tests: 4/4 pass.
- Wedding test suite: 2,194/2,194 pass.
- Source and Wedding line budgets: pass.
- Production UI build: pass in the development checkout and clean detached release checkout.
- Rust assignment-route tests: 3/3 pass in both checkouts.
- Migration-catalog parity: pass.
- Migration `0144_wedding_task_assignment_delivery.sql`: applied successfully to disposable tmpfs
  pgvector/Postgres, and the table exists on Oracle after release.

## Oracle operations

The initial post-deploy proof passed backup verification but refused the restore drill because the
image build left 7.91 GB free while the conservative restore preflight required 8.21 GB. No restore
was attempted in that failed proof. Only unused Docker builder cache was pruned (4.85 GB); running
images, containers, volumes and application data were not removed.

The full detached proof was then repeated and reported:

- status: `pass`
- homeserver: running
- latest backup manifest: verified
- runtime-script integrity: pass
- backup verification: pass
- isolated restore drill: pass
- root and `/var` use after proof: 75%

The detached proof created its remote completion and exit markers normally. The local PowerShell
poller did not return after reading the completed job, so it was stopped after the complete remote
report was independently inspected. This is a tooling follow-up, not a runtime or release failure.
