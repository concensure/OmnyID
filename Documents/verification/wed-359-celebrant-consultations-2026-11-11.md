# WED-359 celebrant consultations verification

Date: 11 November 2026

Worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`

Branch: `agent/codex/WED-359`

## Implemented

- Public, account-free Talk to a celebrant page with truthful empty, live and
  scheduled states.
- Twilio Verify boundary before request creation; no verification code is
  stored by OmnyID.
- Encrypted callback phone storage and content-light lifecycle events.
- Atomic live capacity and scheduled-slot reservation.
- First-available reassignment after a pass or expired hold, without silently
  rerouting a visitor who chose a specific celebrant.
- Vendor recurring hours, one-off open/unavailable exceptions, live sessions,
  accept/pass/cancel/outcome controls and proposed rescheduling in the existing
  vendor portal.
- Couple accept/decline response to a proposed new time.
- Official-register evidence remains separate from live consultation readiness
  and wedding-date availability.

## Local evidence

- Solid TypeScript check: pass.
- Vite production build: pass (existing chunk-size warning only).
- Cargo library check using shared target directory: pass.
- Celebrant frontend and contract tests: 3/3 pass.
- Wedding line-budget tests: 2/2 pass.
- Full Wedding test suite: 2,271/2,271 pass.
- Public Wedding smoke suite: pass.
- Public page metadata smoke: 78 pages pass after adding the missing Twitter
  metadata to the celebrant page.
- JavaScript syntax checks for the public celebrant and directory modules: pass.

## Hosted activation boundary

The Oracle environment has the encryption-key file authority, but its current
configuration does not contain the celebrant rollout flag, callback token
pepper, Twilio Account SID, Twilio auth token or Twilio Verify Service SID.
No secret values were printed or copied during this inspection.

The release may safely ship the migration, public resource and false-default
routes. The callback API must remain disabled until the missing secrets are
provided and a controlled Twilio sandbox verification plus real callback are
observed. Provider acceptance alone is not a connected call.

## Deliberately open

- Creating a canonical logged-in vendor enquiry after the visitor explicitly
  approves it; the current post-call surface only offers the next action.
- Disposable-Postgres concurrency evidence and controlled Twilio/phone evidence.
- Operator-selected Sydney pilot cohort and rollout activation.

## Celebrant directory and scoped-calendar continuation

- The approved vendor crawler fetched and extracted all 16 imported official
  URLs without a blocked page. Fifteen sites support a celebrant profile. Enzo
  Weddings Hunter Valley is a venue and is corrected to `Venue` rather than
  inventing a celebrant service.
- Reviewed sources and own-word curation are stored under
  `Documents/design/wedding planner/celebrants-enrichment-2026-11-11/`. Raw
  crawler caches are ignored. Scraped testimonials and unlicensed images are
  not republished; an initials image state remains until owner approval.
- The integrated directory now provides celebrant category filtering, profile
  cards and detail pages with evidence-backed summaries, strengths, ceremony
  types, contacts and consultation status.
- Admin can generate one expiring private link and QR code per celebrant, see
  aggregate link/open status, rotate the prior link and revoke the current
  link. The link manages only that celebrant's consultation windows and live
  state; it cannot access callback leads or another listing.
- Continuation checks pass locally: Cargo library check; 3/3 scoped-management
  Rust contracts; 4/4 existing consultation contracts; Solid TypeScript;
  production Vite build; 2/2 line budgets; public Wedding and metadata smoke;
  public directory JavaScript syntax.
- Docker Desktop was unavailable locally, so migration 0159 was verified on
  the real Oracle Postgres deployment instead of being inferred from source.

## Exact-SHA Oracle release evidence

- Live implementation SHA:
  `1263c8a67c7512864ef20de515cfba857da07cd6`.
- Clean release checkout:
  `C:\temp\wt\omnyid-wed359-release-1263c8a`.
- `SOURCE_COMMIT` and `oracle-runtime-manifest.json` match the full live SHA.
- Migration 0159 is recorded. Counts: 15 Celebrant vendors, 15
  `celebrant_profile` evidence blocks and 15 celebrant pilot profiles. The
  management grant, session and event tables exist. Enzo Weddings Hunter
  Valley is classified as `Venue`.
- `GET /api/public/wedding/vendors?category=Celebrant` returns 15 records.
  `wedding/vendors.html?category=Celebrant` and every one of the 15 celebrant
  detail URLs return HTTP 200 and contain the expected name and ceremony-type
  profile content.
- The admin management endpoint returns 401 without an authenticated operator
  session. An invalid capability exchange returns 404. The hosted vendor bundle
  includes the consultation-availability management surface.
- The capability pepper is configured on Oracle. Its value was never emitted
  to logs or terminal output.
- Production proof: pass. Homeserver and backup service are running; runtime
  manifest verification, backup verification and restore drill all pass;
  `FAILURE_STEP=none`. The proof job wrote remote exit code 0.
- The initial restore preflight was about 78 MB below its safety margin. A safe
  prune removed only 4.824 GB of inactive Docker build cache. No container,
  volume, current image or user data was removed. Root and `/var` use are 75%,
  leaving roughly 12 GB free.

The celebrant directory, integrated profiles and single-celebrant management
links are therefore live. The callback flag remains false by design until the
controlled Twilio and connected-call gates in this document have evidence.

## Call reliability and operator funnel hardening

The next release candidate adds a shared, tested telephone-link policy. A
readable Australian mobile or landline number is emitted as an E.164 `tel:` URI
for the native dialler/calling application. Malformed or incomplete local
numbers remain visible but are not made into a guessed call action. This policy
is used by public celebrant profiles, vendor comparison/research contacts and
the accepted-callback action in the vendor portal.

The authenticated operator panel now reports, for selectable 30-, 90- and
365-day windows:

- distinct wedding plans in the existing activation projection;
- vendors whose authoritative availability remains fresh;
- daily distinct vendors maintaining availability; and
- distinct venue enquiries with delivery or acknowledgement evidence.

The enquiry measure excludes drafts and provider acceptance. These are
content-free projections over canonical server tables; no message content,
phone number, new browser event or visitor cookie is copied into the report.
Migration 0160 adds only supporting indexes.

Pre-release verification:

- `cargo check --lib`: pass.
- focused Rust management/consultation contracts with `cargo check --test`:
  pass.
- phone URI unit tests: 2/2 pass.
- Solid TypeScript: pass.
- Vite production build: pass (existing chunk-size warning only).
- source and Wedding line-budget checks: 2/2 pass.
- Windows execution of the Rust test binaries: blocked by an MSVC `rustc`
  `STATUS_ACCESS_VIOLATION`; no assertion or source diagnostic was produced.

## Exact-SHA call-hardening release evidence

- Live implementation SHA:
  `ffa7415279de30549e3f3f0c3c1e6ab94bb0a194`.
- Clean release checkout:
  `C:\temp\wt\omnyid-wed359-release-ffa7415`.
- Oracle `SOURCE_COMMIT` and `oracle-runtime-manifest.json` both contain that
  full SHA.
- Migration `0160_wedding_vendor_funnel_metric_indexes` is recorded in
  `omnyid_schema_migrations`; all five expected indexes exist in production.
- All fifteen `/wedding/directory/<celebrant-slug>` pages return HTTP 200. Each
  page emits its published Australian phone number as a whitespace-free,
  symbol-free E.164 `tel:+61…` target while retaining readable visible text.
- Anonymous access to `/admin/wedding/celebrant-management` is deliberately
  masked with HTTP 404. The operator-only panel and 30/90/365-day server query
  are in the Linux release. A signed-in administrator browser acceptance is
  still listed separately rather than placing an admin credential in a proof
  script.
- Exact-SHA Linux homeserver and UI builds passed. The post-deploy production
  proof passed backup verification and an isolated restore drill with
  `FAILURE_STEP=none`.
- The first restore preflight found only 6.6 GB free against an 8.0 GB safety
  requirement. Pruning only inactive Docker builder cache recovered about
  4.9 GB. No container, image in use, volume, database or user file was
  removed. Oracle finished at 77% root use with roughly 11 GB free.

The E.164 call path and canonical operator measures are live. The public
callback rollout remains false-default until the controlled Twilio and real
connected-call gates above are satisfied.
