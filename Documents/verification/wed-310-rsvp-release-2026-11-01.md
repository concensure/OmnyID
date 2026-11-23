# WED-310 RSVP completion and Oracle release evidence

Date: 2026-11-01 (Australia/Sydney)

## Release identity

- Frozen candidate: `eb398ebfecaec6a0277d7fe634e6c97198b44afe`.
- Source worktree: `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`.
- Clean release checkout:
  `C:\Users\ozans\AppData\Local\Temp\omnyid-wed310-release-eb398eb`.
- The clean checkout reported the full SHA above and no tracked or untracked
  release-source changes before build and deployment.
- Simulated data was excluded from the Oracle runtime bundle.

The old server-side `release-manifest.json` still contains a historical source
SHA and is not used as release evidence. This release instead records the clean
checkout SHA and compares selected release-defining source hashes after upload.
The local and Oracle SHA-256 values match for:

- `src/server/wedding_boundary_routes/delegated_access.rs`;
- `src/server/wedding_boundary_routes/private_notes.rs`;
- `postgres/migrations/0129_wedding_boundary_delegates_and_private_notes.sql`;
- `solid-ui/src/lib/accountSessionBoundaryState.ts`;
- `wedding/animal-quiz.html`; and
- `wedding/assets/js/quiz-engine.js`.

## RSVP rollout reconciliation

The remaining RSVP checklist items were already supported by retained evidence:

- WED-303 records the hosted guest flow at 320, 375 and 1280 CSS pixels,
  200% text zoom and an Axe serious/critical scan.
- WED-305 records the authenticated fresh-account mobile flow after the test
  account was recreated.
- WED-305 also records one controlled allowlisted account, one synthetic
  household and one digest-only RSVP capability. Open, response, exact replay,
  revocation and byte-identical environment rollback were verified.

No second external RSVP or capability was created merely to duplicate that
still-valid evidence. The RSVP task checklist now points to those records.

## Exact-candidate local verification

The following ran from the clean release checkout:

- TypeScript typecheck: passed.
- Wedding tests: 2,116 passed.
- Source and Wedding line budgets: 2 passed.
- Production UI build: passed.
- RSVP capability Rust tests: 3 passed.
- RSVP response Rust tests: 10 passed.
- Embedded migration catalogue: 1 passed.
- Disposable PostgreSQL used the local Supabase PostgreSQL image with pgvector:
  all 13 RSVP tests exercised real persistence, and all four Family Boundary
  integration scenarios passed.

The database-backed coverage includes tenant isolation, stale revisions,
idempotent replay, concurrency, capability rotation/revocation, revoke races,
two-partner approval, delegate isolation, ciphertext separation, group
plus-one exceptions and serialized last-seat approval.

## Oracle deployment and hosted checks

`scripts/deploy-oracle.ps1` staged and deployed only the clean exact candidate.
After replacement:

- `/workspace/`: HTTP 200;
- `/workspace/rsvp.html`: HTTP 200;
- `/wedding/animal-quiz.html`: HTTP 200;
- unauthenticated RSVP status: HTTP 404;
- unauthenticated Family delegate route: HTTP 404;
- homeserver, Caddy, Postgres, SeaweedFS, Electric and backup containers are
  running; and
- migration 0129 tables `wedding_boundary_delegated_grants` and
  `wedding_boundary_private_notes` both exist.

The public `/healthz` and `/readyz` routes correctly require a session and
returned HTTP 401. The production-proof authority independently reported the
homeserver running.

## False-default state

The running homeserver reported:

- `OMNYID_WEDDING_RSVP_PUBLIC_ENABLED=false`;
- `OMNYID_WEDDING_RSVP_REMINDER_SEND_ENABLED=false`;
- `OMNYID_WEDDING_RSVP_PILOT_USER_IDS` empty;
- `OMNYID_WEDDING_BOUNDARY_HELPERS_ENABLED` unset, whose code default is false;
  and
- `OMNYID_WEDDING_BOUNDARY_DELEGATES_ENABLED` unset, whose code default is false.

No invitation, capability, reminder, provider email, helper link or delegated
Family session was created during this release.

## Backup, restore and disk

The first post-deploy restore attempt was safety-blocked because the fresh
builder layers left less space than the drill's calculated requirement. It was
not called a pass. Only unused Docker builder cache was pruned; running images,
volumes and rollback data were not removed. This recovered 4.87 GB.

The full production proof was then rerun and passed:

- backup service: running;
- latest archive: `20261101T024144Z`;
- manifest verification: passed;
- Postgres archive and current SeaweedFS mirror state: internally consistent;
- runtime script integrity: passed;
- isolated restore drill: passed; and
- root and `/var`: 79% used, about 9.4 GB free immediately before the rerun.

Machine-readable evidence is in the local ignored artifact directory
`artifacts/oracle-production-proof-wed310-eb398eb/postdeploy/`.

## Remaining boundary work

RSVP collection itself is complete for the approved false-default release.
Family helper/delegate management UI, per-projector acknowledgements,
sent-invitation policy previews, restricted-field audits and any future
allowlisted helper/delegate cohort remain separate Family Boundaries work. The
flags above must stay false until those rollout criteria are met.
