## 2026-10-28 - WED-286 Email Worker operational evidence (Codex, in progress)

Changed:

- Added strict outbound recipient allowlisting, truthful accepted/delivered/
  bounced receipt states, digest-only delivery suppressions and disabled
  Cloudflare bounce/complaint polling with no automatic retry.
- Added authenticated plain-text Worker ingress that appends one encrypted,
  signed, tenant-private AFP event and suppresses exact replay. Attachments stay
  quarantined pending the reviewed processing boundary.
- Added explicit false-defaulted Oracle staging controls and a controlled
  provider evidence plan. Policy V2 remains false.
- Added active/previous ingress HMAC rotation, bounded expiry destruction for
  recipient-encrypted quarantine ciphertext, and expanded PostgreSQL coverage
  for disabled/archived/transferred/cross-tenant routes, scanner failure and
  AFP persistence recovery.

Evidence:

- Disposable ClamAV clean, harmless EICAR and unavailable fail-closed cases,
  focused provider/migration/ingress database tests and Worker tests passed on
  the implementation candidate. Oracle staging flags-off shadow created no
  provider, quarantine or suppression rows.
- Current pre-freeze local verification passed five Worker-auth/ingress unit
  cases, the expanded ingress PostgreSQL case, the hashed idempotent complaint
  suppression case, three live ClamAV cases, seven Worker cases, all 2,010
  Wedding tests, TypeScript typecheck, both line-budget guards and the
  production UI build. `cargo check --lib` and all three Oracle Compose
  profiles also render when their required validation-only inputs are supplied.
  Final commit-bound verification still follows the commit; these local results
  do not change the hosted `9e1be33` identity.
- The requested `concensure+testing@gmail.com` account was created and verified
  only in Oracle staging. Its random password remains in a restricted staging
  secret file and was not printed or committed.
- The replacement account-scoped routing token deployed Worker version
  `30e3e00e-fd04-449a-9f82-b199d3f6932c` from clean exact source `9e1be33`.
  One temporary literal route delivered a synthetic platform message to
  staging; provider event, encrypted quarantine and private AFP counts were one.
  Hosted exact replay produced no second AFP event.
- Restoration removed the literal route and allowlist, returned all staging
  flags false, and left the same eight routing rules plus disabled Drop
  catch-all. The Worker remains deployed but unrouted. Production application
  and database state were not changed.
- A separate send to the controlled Gmail account was accepted into the
  provider queue and reached the controlled mailbox. A human reply advanced
  provider, encrypted-quarantine and recipient-private AFP counts exactly once
  from two to three; the event completed in one attempt without error and the
  provider and AFP identifiers cross-reference. No content or full private
  sender address was recorded.
- The reply window was restored immediately: the literal synthetic route was
  removed, the eight-rule inventory and disabled Drop catch-all were preserved,
  all three staging flags returned false, the shared secret was shredded and
  the disposable scanner was removed. The invalid-domain send still yielded no
  provider-observed bounce or complaint, so that part of the smoke gate is open.

Next:

- Freeze and reverify the final documentation-bound source after the current
  retention/rotation changes; do not reuse the `9e1be33` runtime evidence as
  evidence for a later implementation candidate.
- A separate real provider bounce/complaint remains required; do not infer it
  from provider acceptance or the absence of application retry.
- Do not misclassify vendor-mask inbound enquiries as couple-side vendor
  replies. Implement exact `mail.omnyid.com` mask/thread binding before enabling
  that Response Queue projection. Attachment reuse and the remaining human
  review/cohort gates are still open.

## 2026-10-23 - WED-247 in-context wedding actions, collaborative tasks, seating canvas, and Oracle deployment (Codex, complete)

Changed:

- Kept home vendor queries and category shortcuts on Wedding Home, repaired the dedicated submit
  timing, corrected venue guest/capacity semantics, and made ranking explanations cite confirmed
  user-facing shortlist reasons.
- Added shared task responsibility fields and inline wedding contacts, cross-tab vision persistence
  and descriptor parsing, explicit-load vendor maps, in-place transport sources, dependable rich
  message formatting/paragraph/signature preservation, and a mobile-safe 2D seating canvas.
- Tightened Oracle staging so `postgres/data` is excluded from application bundles while
  `postgres/init.sql` and migrations remain runtime inputs. No photographer source data or importer
  was uploaded or rerun.

Verification:

- Typecheck, production build, 1,962 wedding tests, 20 focused frontend tests, seven SMTP routing
  tests, seven quotation vendor-portal E2E tests, disposable-Postgres API suites, and live clamd
  integration passed. Exact application revision `7fc7172` passed the WED-225 machine checks; the
  later commits only tighten Oracle staging and record the ledger. Readiness remains blocked on
  separately required external/human evidence.
- Oracle deployed commits `245bcf5`, `7fc7172`, and `c3d4f7e`. Production workspace returned 200,
  key application source hashes match the deployment, `postgres/data` is absent, quotation and
  vendor-mail flags are off, and the non-restore production proof passed with backup integrity.
- The bounded isolated restore drill failed after running under temporary disk pressure; its cleanup
  reclaimed the temporary database. This does not invalidate the live application deployment, but
  restore-drill readiness must not be represented as passing.

Unresolved / next:

- Keep WED-225/WED-226 and ranking policy V2 blocked. Independent accuracy/provider,
  security/privacy/accessibility, couple/vendor usability, permission wording, hosted-shadow and
  allowlisted cohort evidence is still required before broad release.
- Diagnose Oracle restore-drill duration/space independently of this UI slice, then rerun the full
  proof. Human reviewers can use the existing commit-bound review form; do not fabricate records.

## 2026-10-18 - WED-228/WED-229 zoom hardening, gap plan, and local service evidence (Codex, review)

Changed:

- Fixed vendor comparison reflow at 400%-equivalent zoom by removing the evidence-chip min-content
  squeeze and making the card, title, badge and evidence rows shrink and wrap within the viewport.
- Added a detailed WED-230 through WED-240 implementation plan from both ideal-agent briefs. It
  builds on WED-215, uses template-neutral AFP contracts and current DecisionOS/A2UI/OCR/outreach
  foundations, limits vendor context by permission, and keeps each proposed file below 1000 lines.
- Started isolated healthy Docker endpoints: PostgreSQL `127.0.0.1:55432/omnyid_test` and clamd
  `127.0.0.1:33310`. Live tests fixed recursive quotation fixture source binding, aligned the test
  router with production quotation modules, and made AFP signatures stable across PostgreSQL's
  timestamp representation and microsecond rounding.

Verification:

- Solid typecheck, 1,887 wedding tests, production build, and focused Playwright at 320x720,
  360x740 and 1280x800 passed. Browser assertions cover decoded photos, readable title geometry,
  evidence-specific copy, retained post-send comparison, overflow, and serious/critical Axe issues.
- `cargo test --lib crypto::tests`, disposable-Postgres `api_flows`, response-capability API and
  vendor-response API tests passed. The opt-in `clamav_live` clean-scan test passed against clamd.
- The task document is 556 lines, the changed card is 351 lines, and `git diff --check` passed.
  Scoped `rustfmt --check` passed for changed Rust files; the repo-wide check still reports inherited
  formatting drift outside this slice. The inherited Rust unused-`user_id` and Vite chunk-size
  warnings remain.

Unresolved / next:

- WED-225 remains blocked on accuracy/provider and independent security/privacy/accessibility,
  couple/vendor usability, wording, hosted-shadow and cohort evidence. The user's independent review
  is still in progress. Keep WED-226 blocked and every release, mail, reconciliation, relay and
  ranking-policy-V2 flag disabled; do not deploy this advanced branch yet.
- Review WED-228 and WED-229, then start WED-230 contract freeze from the reviewed WED-215 commit.

## 2026-10-18 - WED-227 browser acceptance hardening (Codex, review)

Changed:

- Reworked the existing personalised recommendation fixture to use the production DecisionCard plus
  WeddingVendorChoiceCard composition and production recommendation/outreach state helpers.
- Added mobile and desktop browser proof that a decoded vendor photo, a long readable vendor name,
  and an evidence-specific recommendation remain visible after an enquiry reaches sent state; the
  comparison keeps both cards mounted instead of being replaced by the receipt.
- Registered WED-226/DBV-11 in the canonical ledger as blocked behind WED-225, WED-213, and WED-185.
  No rollout work, provider mutation, flag activation, or Oracle deployment ran.
- A final read-only prerequisite audit found no TEST_DATABASE_URL, DATABASE_URL, or CLAMD_HOST. The
  Docker 29.2.1 client is present but cannot reach its daemon; local vendor-mail and ranking-V2
  overrides are unset, the Oracle example keeps release flags false, and this branch has no CI run.

Verification:

- Solid typecheck passed; the focused Playwright target passed two cases at 360x740 and 1280x800,
  including decoded-image, name-geometry, comparison-retention, overflow, and Axe assertions.
- All 1,887 wedding tests passed and the production Solid build passed with the inherited chunk-size
  advisory. Visual inspection of the mobile post-send artifact confirmed the intended composition.
- The generic source line budget passed. The focused wedding line-budget assertion still reports
  only the inherited 1,108-line WeddingResponseWorkspaceView and 1,041-line view-state file; neither
  file was modified in this hardening slice, and both new/changed test files remain below 250 lines.

Next:

- Independent review can close WED-227. WED-225 still needs disposable Postgres/clamd, provider,
  security/privacy/accessibility, usability/wording, and hosted cohort evidence.
- Keep WED-226 blocked and every release flag off until the readiness digest is verified and the
  applicable WED-213/WED-185 gates and explicit rollout authorization are recorded.

## 2026-10-18 - WED-227 selective WED-187 reconciliation (Codex, review)

Changed:

- Proved `agent/codex/WED-187` is already an ancestor and has no missing committed changes. No
  wholesale merge, copy, or cherry-pick ran. R10, R11, R12, and mail review landed as atomic commits
  `58838df`, `4802cde`, `c97d171`, and `6ccd7b9`.
- Added result-only Wedding Understanding import with privacy disclosure and deterministic AFP
  retry identity. Added operator-only venue enrichment with exact source/numeric/date validation,
  conservative authority, sealed review tokens, existing LLM metering, and authority-ranked upsert.
- Added immutable plan-private preference feedback to the current home/search registry. Current
  directory photos replace stale card media, long names get the full card width, recommendations
  identify checked evidence, and comparisons stay visible beside outreach drafts and receipts.
- Rejected the candidate blanket vendor-mail interception and scalar-only Cloudflare payload. The
  existing structured payload keeps the supported recipient array, inbound shared-secret readiness
  remains required, and transactional account mail can no longer fall back to vendor-relay secrets.

Verification:

- Read-only Oracle SQL returned exactly 93 distinct photographer vendor IDs and 441 attributes;
  the wider photographer listing count is 109. No source corpus, importer, or database write ran.
- R10: typecheck, wedding-site smoke, 1,879 wedding tests, focused auth Rust test, and production
  build passed. R11: typecheck, 1,879 wedding tests, four focused enrichment tests, cargo check, and
  build passed. R12: typecheck, 1,887 wedding tests, 66 vendor-search Rust tests, and build passed.
- Mail: exact `cargo test --lib gateway::smtp_out -- --nocapture` passed 7 tests; vendor-provider
  readiness passed 3 tests; typecheck, 1,887 wedding tests, cargo check, and build also passed.
  The inherited unused `user_id` warning and Vite large-chunk advisory remain.
- Every new file is at most 480 lines. Existing Rust files above 999 lines are line-neutral; the
  oversized wedding workspace component is smaller than before R12 and its view-state is neutral.

Unresolved / next:

- The exposed Cloudflare token remains recorded as invalid from the 2026-10-17 read-only check
  (`401`, Cloudflare error `1000`) and was not used. Vendor mail and ranking policy V2 remain off.
- No Oracle application deployment ran. WED-225 remains blocked on real Postgres/clamd/provider
  evidence, independent security/privacy/accessibility review, usability/wording review, and hosted
  cohort evidence. Do not deploy this advanced branch or enable release flags until those gates pass.

## 2026-10-18 - WED-224 email and AFP response convergence (Codex, review)

Changed:

- Approved clarification mail now includes only the hash-bound, denylist-checked context and
  reviewed questions. The existing deterministic Message-ID, pre-send reservation, provider
  reconciliation, and receipt flow is unchanged.
- Gmail sync has a separately release-gated quotation adapter. It requires exact recipient plus
  `In-Reply-To`/`References` binding to one sent clarification, reloads the active approved grant,
  rejects ambiguous/stale/revoked/terminal authority, and never uses the generic sender fallback.
- Matched bodies and bounded MIME attachments become a deterministic tenant-private AFP source.
  Safe attachments reuse the WED-223 validation, ClamAV, owner quota/storage, shared readability/
  image OCR, and manual-review fallback. PDF/DOCX bytes are preserved for review when safe inline
  extraction is unavailable; they are never lossily decoded as text.
- Email, portal, and verified AFP plaintext converge through the canonical vendor-response/source
  fingerprint. Exact cross-channel material deduplicates without a new review; changed material is
  parent-linked. Claimed AFP transport acceptance now records only `delivery_accepted`; an
  authenticated owner convergence route must match the stored signed routing fingerprint before a
  canonical review event can be appended.

Verification:

- `scripts/verify-quotation-readiness.ps1` passed with `CARGO_BUILD_JOBS=2`: 99 Rust quotation
  integration tests, conditional API flow, 31 quotation unit tests, shared ingest/Gmail/MIME/
  federation/LLM tests, `cargo check`, six SDK tests plus typecheck/build, and 44 Solid tests.
- The first full run hit a Windows `rustc` `STATUS_ACCESS_VIOLATION`; reducing build parallelism
  produced a clean full pass. The only compiler warning remains the inherited unused `user_id` in
  `email_group_routes.rs`. New files are 863 and 648 physical lines; the bounded route is 748.
- `TEST_DATABASE_URL` and `CLAMD_HOST` are unset, so the real Postgres HTTP convergence round trip,
  clean-daemon attachment scan, and separately authorized allowlisted provider smoke are not
  claimed. Cloudflare/AFP relay, email reconciliation, release gate, and all quotation feature
  flags remain off; no provider, Oracle, Cloudflare, payment, email, or deployment mutation ran.

Next:

- Run the owner-scoped Gmail/AFP convergence matrix on disposable Postgres with clamd, then obtain
  independent security/privacy review. Do not enable the email reconciliation, claimed-vendor, or
  relay flags before that evidence and the WED-185 relay gates pass.

## 2026-10-18 - WED-223 vendor quotation revision ingestion (Codex, review)

Changed:

- Added a capability-scoped multipart revision route and optional portal upload component for one
  PDF, DOCX, PNG, JPEG, WebP, or text file. Typed draft state is independent from upload state and
  remains intact after scanner, parser, quota, or network failure.
- Reused existing owner attachment persistence/quota, ClamAV, PDF.js/Mammoth preparation, shared
  readability/image OCR, source receipts, quotation extraction ladder, exact-anchor validation,
  and canonical vendor response/review contracts. No parallel OCR, parser, storage, or extraction
  stack was introduced.
- Added deterministic server-derived source/attachment/session/grant/vendor/quotation bindings,
  strict signature and active-content policy, fail-closed malware scanning, exact retry receipts,
  tenant-private AFP lineage, and final response source references. Upload/extraction cannot create
  a successor, booking, acceptance, or payment.
- Refactored the existing authenticated quotation proposal handler into a shared internal helper so
  vendor documents use the same feature gates, model ladder, registry, validation, and metering.

Verification:

- `scripts/verify-quotation-readiness.ps1 -IncludeBrowser` passed: 97 quotation integration tests,
  the conditional API-flow target, 20 focused quotation library tests, shared ingest/Gmail/LLM
  tests, `cargo check`, six TypeScript SDK tests plus typecheck/build, 44 Solid tests, and ten
  Playwright cases at mobile/desktop sizes with Axe and overflow checks.
- `npm run build` passed. Its existing large-chunk advisory remains. Rust retains the inherited
  unused `user_id` warning in `email_group_routes.rs`.
- New files are 535 lines or fewer. Registration-only changes touched `src/server/mod.rs`; three
  helper visibilities changed in the existing upload route without adding a second storage path.
- `TEST_DATABASE_URL` and `CLAMD_HOST` are unset, so real-Postgres persistence and an actual clean
  ClamAV daemon round trip remain review evidence, not claimed passes. All quotation/vendor flags
  remain off; no external provider, Oracle, Cloudflare, payment, email, or deployment mutation ran.

Next:

- Run the scoped upload path against disposable Postgres plus clamd and complete independent
  security/privacy review before considering the response-capability flag.
- Continue with DBV-09/WED-224 email and federation convergence. It must reuse the same canonical
  response/source reconciliation and existing Gmail/federation receipt boundaries.

## 2026-10-18 - WED-222 scoped vendor response portal (Codex)

- Added `/workspace/quotation-response.html` as a standalone, mobile-first transaction
  surface. It reads the opaque token only from the URL fragment, removes all token-shaped
  URL data before exchange, stores no commercial draft locally, renders approved context
  with A2UI-compatible stat/callout nodes, provides typed response controls and exact
  preview, and keeps the email alternative visible.
- The token-only exchange retains exact optional binding checks and returns a scoped
  HttpOnly/Secure/SameSite=Strict session. Exchange and consume responses now enforce
  no-store, no-referrer, frame denial, restrictive CSP, and permissions policy. Expired,
  revoked, stale, disputed, terminal, CSRF, nonce, and out-of-grant failures remain the
  same generic unavailable response.
- Secure-link inputs converge on the WED-220 canonical response. The server derives all
  authority/transport fields, appends a tenant-private AFP response plus review proposal,
  and records that the source is a capability rather than a signed vendor Agent. Exact
  retries return one receipt; changed replays fail. No response can accept a contract,
  book, or execute payment.
- Verification: the full quotation verifier passed 97 Rust integration tests, 14 focused
  quotation library tests, cargo check, six SDK tests plus typecheck/build, 43 Solid tests,
  and nine Playwright checks across 360px/desktop with Axe, Referer/token, failure-copy,
  and overflow assertions. The Solid production build passed; the inherited large-chunk
  advisory remains. The generic source line budget passed; the separate wedding budget
  still reports the two inherited oversized WED-187 files not touched here.
- `TEST_DATABASE_URL` is unset, so the real disposable-Postgres body compiled but skipped.
  Independent security/privacy review also remains required. WED-222 is in review and the
  existing secure-link capability flag remains off. No Oracle, provider, Cloudflare,
  email, payment, or release-flag mutation was made.
- Recommended next action: run the WED-219/WED-222 HTTP matrix on disposable Postgres and
  obtain independent security/privacy sign-off before any canary; otherwise continue to
  WED-223 structured quotation revision ingestion while all flags remain dark.

## 2026-10-17 - WED-213 quotation intelligence dark Oracle release (Codex)

- Released the WED-202 quotation intelligence line through commits `4c7454d` and
  `50d92d6`. All local, Oracle, and staging Compose profiles now pass the versioned
  release gate and independent quotation flags to the homeserver with disabled
  defaults.
- The first Oracle image build failed before replacing a service because the Docker
  context omitted compile-time `schemas/quotation` registries. `Dockerfile` and the
  runtime stage now include `schemas/`; the packaging self-test asserts the registry
  and all 54 runtime paths before deployment.
- The scoped retry rebuilt and recreated only `homeserver` and the one-shot `ui`
  asset job. Caddy was not reloaded because the approved staging-password source is
  still absent. The temporary inert Compose interpolation value was removed after
  the run and the original remote env restored.
- Oracle verification: the deployed `src/quotation/mod.rs` SHA-256 matches the local
  checkout (`2b827e05e770b0349c288a67642b238119a999d4f02cd9f66b56d12a6d75c189`);
  all nine quotation env controls are present and disabled; the state route returns
  401 without authentication; homepage, Wedding, and workspace return HTTP 200.
  The full remote post-deploy audit reported backup verification pass, restore drill
  pass, and `FAILURE_STEP=none`. A synchronous collection pass also reports
  `status=pass`, both core services running, runtime-script integrity pass, and 81%
  root usage; its restore step was skipped because the immediately preceding full
  drill had passed.
- Release-candidate verification: 57 quotation integration tests, compiled API-flow
  target, 29 focused Rust unit executions, 23 Solid tests, Solid typecheck, cargo
  check, whitespace checks, and Playwright at 360px and desktop passed. The Oracle
  stage self-test also passed with 54 paths.
- WED-213 remains `in_progress`, and every product switch remains off. Outstanding
  gates are real hosted shadow-extraction metrics, a Postgres-backed HTTP run (the
  local target compiled but had no `TEST_DATABASE_URL`), the broader hosted browser
  security matrix, a live gated provider smoke, and the seven-day allowlisted cohort.
  Do not enable recommendation, extraction, clarification send, closure, or vendor
  grants until their evidence is independently verified.

## 2026-10-13 - WED-181 Stripe one-off checkout webhook rollout (Codex)

- Confirmed the Wedding upgrade is a `mode=payment` one-off Checkout flow, so Stripe `subscription_data` must not be sent: it is valid only for a recurring Price and would reject the AUD 39 purchase.
- Made paid `checkout.session.completed` / async success handling explicit: Stripe session `status: complete` maps to the account entitlement status `active`. Added a regression fixture with the real `complete` session status.
- Verification: focused billing test passed; `cargo check` passed.
- Released commits `480c37a` and `3269ba1` to Oracle. The workspace returns HTTP 200 and serves `main-DXv7pLra.js`; Caddy, UI, and homeserver are running. The release helper now uses bounded non-interactive SSH connections to prevent a stalled release client.
- The signing secret was not read, copied, logged, or committed; the release used the existing Oracle `.env.oracle`.
# Handoff

## 2026-10-27 - WED-285 Oracle deployment continuation (Codex)

The user superseded the earlier GitHub request: deploy this candidate directly to Oracle for human
gate testing. GitHub rejected both branch publications because the OAuth credential lacked workflow
scope; no branch or PR was created. The device authorization flow was cancelled. No further GitHub
publication is planned. Existing unreferenced uploaded Git objects do not constitute publication.

Oracle preflight evidence is in the primary checkout's ignored
`artifacts/oracle-wed285-6c7454e842a0/preflight`: backup integrity and service checks passed; the
restore drill was intentionally deferred until after the build. The existing release-manifest SHA
is stale relative to the last deployed source, so it cannot prove runtime identity for this review.

Fixed the Oracle runtime staging allowlist to include `solid-ui/practice.html`, required by the
WED-276 Vite entry. The staging regression self-test passed, including this entry without simulated
data. The deployment must use the clean committed task checkout, existing remote environment, no
simulated/source dataset, and unchanged disabled release flags. Collect source hashes, running
image and UI evidence, and the full post-deployment proof before claiming the candidate is hosted.
No human approvals, provider receipt, full accuracy corpus or cohort approval are implied.

This section supersedes the earlier GitHub publication and deployment-not-authorised next steps
below. Final deployment evidence and full SHA belong in the external candidate bundle and primary
coordination handoff, preserving the frozen deployed commit.

## 2026-10-27 - WED-285 existing-release human-gate candidate (Codex)

The user explicitly selected preparation of the existing email/quotation release for its three
human-gate workbooks, and requested commit/push plus the full final SHA. This continuation is on
`agent/codex/WED-285` in `C:/Users/ozans/Desktop/projects/OmnyID-WED-275`, based on `06b4a0f`.
WED-275/276 remain included and dark; WED-277 is not implemented. Eight professional slices remain.

Changed and why:

- The three pages in `Documents/issues/wedding planner/` and their shared `gate-execution.js` now
  require each report's source commit and hosted URL. Changing the candidate/environment cannot
  silently reuse prior passing answers. Earlier drafts remain accessible; v3 exports include the
  new bindings. Sign-off binds the current context and requires an owner and valid hosted URL.
- Candidate query links propagate the full source SHA between all three pages. The clear dialog
  traps keyboard focus and returns it on cancellation. None of these controls constitutes a
  cryptographic signature or automatic deployment verification.
- `scripts/prepare-human-gate-candidate.ps1` creates an immutable source archive, six workbook
  assets, manifest digests and candidate-linked START-HERE page from a clean expected commit. It
  refuses dirty/wrong source and overwrite. Evidence attachments are hashed without inventing
  pass results. Its isolated self-test exercises those boundaries and verifies artifact hashes.
- `tests/clamav_live.rs` adds the standard harmless EICAR fixture in memory beside the clean scan.
  `solid-ui/tests/e2e/wedding-human-review-form.spec.ts` covers all three workbooks, source/host
  changes, final export, persistent drafts and focus. The new candidate guide documents exact
  paths, package creation, hosted prerequisites, evidence boundaries and rollback.

Local evidence:

- Candidate packager self-test passed. Eight workbook browser cases passed; all eleven existing
  quotation browser cases passed. Seven SDK quotation tests, SDK typecheck/build, Solid typecheck,
  both line budgets, all 2,010 Wedding tests and production UI build passed. Existing Vite chunk
  advisories remain. Browser workflows are synthetic; no real vendor or mail delivery was used.
- Worker tests passed 7/7, ingress unit tests 4/4 and SMTP unit tests 12/12. The disposable pgvector
  PostgreSQL 18 HTTP test passed 1/1 after applying the embedded migration catalog. It exercises
  encrypted quarantine, exact retry, changed-content conflict, unknown mask, connected-email and
  disabled-mask rejection. Its scanner is mocked, not proof of live provider receipt or full malware
  handling. Logs are under `artifacts/wed285/` and remain external to source.

- Both live ClamAV cases passed against disposable localhost:33310, using the actual ClamAV daemon
  for clean text and the standard harmless EICAR fixture. This verifies the shared INSTREAM boundary,
  not a complete live-ingress attachment corpus. The disposable test services are removed on closeout.

Outstanding gates and release limits:

- No hosted deployment, runtime identity/config verification, flags-off hosted shadow, representative
  production accuracy corpus, complete adversarial/provider matrix, live provider smoke, independent
  security/privacy/accessibility acceptance or cohort approval is claimed. The broad readiness
  verifiers were not rerun as complete exact-commit release evaluations in this slice. The focused
  checks above must not be represented as those full reports. Workbook autonomous blockers remain
  active; working evidence is usable, final signed release export remains blocked.
- The desired human test must use a separately authorised hosted review deployment of the final
  pushed SHA. Do not copy the source SHA into the runtime field without independent runtime proof.
  Build/Worker/gateway versions, flags and configuration inventory need separate evidence.
- GitHub's latest prior runs are older failed commits and Deployments API returned no records.
  A push to the task branch alone does not trigger this repository's main/master-only CI workflow.
  Publish the WED-276 base and WED-285 candidate, then use a draft PR for the focused review delta;
  a narrow PR to that task base likewise has no configured hosted CI. No CI pass is inferred.
- The requested primary path had an extra separator before `.html`; all three actual pages are
  directly in `Documents/issues/wedding planner/`. Mirror only the four changed workbook files and
  the guide after comparing the primary files with the starting checkpoint. Preserve other work.
- Next: use the final candidate package/full SHA, complete outstanding machine/hosted evidence,
  then let the named authorities perform their gates. No routing/provider/cohort flags were changed.

## 2026-10-27 - WED-276 dark practice shell and bootstrap (Codex)

Branch: `agent/codex/WED-276`, at `C:/Users/ozans/Desktop/projects/OmnyID-WED-275`, continued from
`11740c5` and the WED-275 contract implementation `c46e506`. Implementation remains isolated from the
dirty primary and WED-215 checkouts. The latter's Cargo target cache was reused, not its source.

Changed and why:

- `src/practice/bootstrap*.rs` and the authority/module wiring add exact-account dark entitlement,
  current-membership/client projection, scoped summaries and deterministic priority ordering.
- `src/server/practice_routes*.rs`, minimal server registration, migration 0122 and catalog entry
  add authenticated `/practice/bootstrap`, a repeatable-read snapshot and private/no-store responses.
  Empty rebuildable indexes have positive revisions and strict summary keys. No grant write API exists.
- `solid-ui/src/components/practice/`, `weddingPractice*.ts`, practice HTML/main/CSS, Vite entry and
  two NavBar lines add responsive navigation, explicit personal/Wedding/practice selection, Home,
  typed A2UI next action, agenda/count source links, scoped client summaries and empty/error recovery.
- URL filters and full owner/plan/thread deep links survive refresh. Abort generations discard old
  requests. Hidden tabs clear detail; active tabs revalidate every 30 seconds. Back rechecks authority
  before restoring scroll. Fixed a real race where loading could overwrite saved scroll with zero.
- Fixtures, state tests and browser cases cover scope, stale requests, recovery and navigation.
  Both requested design documents now show the remaining count; the contract inventory adds the
  integration boundary and corrects the vendor UI source path.

Verification evidence (local only):

- `cargo test --lib practice:: -j1`: 17 tests passed, including WED-275 contracts and five new
  entitlement/projection tests. Focused HTTP test, run alone with `--include-ignored --test-threads=1`,
  passed against disposable pgvector PostgreSQL 18 at localhost:55433. It applies the registered
  migrations, reruns 0122, rejects forbidden summary keys, exercises authentication/allowlist,
  redaction, forged practice selection and immediate denial on subsequent reads after revocation.
  The first DB attempt lacked the vector extension; replacing only the disposable DB resolved it.
- Final `cargo check --lib -j1` passed. The disposable test container was removed after verification.
- All 2,010 Wedding tests passed, including six new practice state cases. Typecheck, both line-budget
  checks and production UI build passed. Vite retains its existing large-chunk advisory.
- Seven Playwright cases passed: 1280/360/320 CSS-pixel layouts (320px reflow equivalent to 1280px at
  400% zoom), linked counts, context switching, deep-link refresh/denial, revoked/error recovery,
  keyboard entry and Back search/scroll restoration. Axe found no serious/critical violations in
  the checked workspace states. Mobile screenshot was inspected. This does not claim native browser
  zoom controls, screen-reader review or production integration coverage.
- Local logs: `artifacts/wed276/wedding-tests.log`, `artifacts/wed276/ui-build.log`; Playwright artifacts
  are under `solid-ui/test-results/`. These generated files are intentionally uncommitted.

Limits, rollout and next action:

- Keep `OMNYID_WEDDING_PRO_PRACTICE_ENABLED` and `OMNYID_WEDDING_PRO_ACCOUNT_ALLOWLIST` unset. The
  migration creates no practice or grant. WED-277 must resolve source ownership and transactionally
  project authorised AFP grants/revocations before any real account is enabled. Never seed live grants
  manually. Browser tests use fixtures; the HTTP test inserts synthetic rows only in its disposable DB.
- Rollback disables the flag and reverts consumers; retain the additive tables. No AFP history is
  rewritten. No external email, hold conversion, booking, payment or deployment occurred.
- Client destinations currently display authorised summaries; normal Wedding editing is WED-277.
  Inbox/calendar/supplier destinations are summary entry points for WED-278/279/280. Live source
  writers, push revocation and broader security/release evidence remain later work.
- Eight major implementation slices remain: WED-277 through WED-284. WED-275/276 are ready for review,
  not marked done. Next implement WED-277 on this lineage and preserve existing owner-only routes
  until explicit plan-bound collaboration is enforced.
- Latest GitHub runs remain older failed commits (509dc31 and 69fbc2b); no CI result covers this local
  branch. The advanced base is unpublished, so a useful PR awaits publication/review of that base.
  No deployment status is inferred from local checks. See the prior handoff for the empty Deployments
  API and base Checks API 422. No hosted runtime/version verification was attempted for this dark slice.

## 2026-10-27 - WED-275 professional practice contract foundation (Codex)

Implementation: `c46e506` on `agent/codex/WED-275`, isolated at
`C:/Users/ozans/Desktop/projects/OmnyID-WED-275`. Base `f1f9c82` contains required ancestor `6af9203`.
The dirty Claude and WED-215 checkouts were not copied or modified for implementation.

Changed and why:

- Added `src/practice/` and its `src/lib.rs` registration: strict versioned contracts for identity,
  membership/collaboration, the client index, assignment, availability, holds, quote/booking links
  and payment tracking. Existing quotation Money, itemisation, revision and closure evidence remain
  canonical. No professional route, UI, persistence, migration or runtime flag is introduced.
- Added server-side pure authority checks that intersect role ceilings, explicit membership and
  plan grants, subject/context binding, validity and current authority revisions. Vendor proofs
  are resource-bound. Every read surface uses the same policy, including cached index projection.
- Index projection removes inaccessible counts, next actions and finance summaries. Typed command
  hashing binds actor/context/revisions/payload; revision and retry helpers distinguish stale
  writes, exact retry and conflicting reuse of a key. Transactional storage is later work.
- Added the path/test reuse inventory and integration contract beside the two requested design
  documents; updated both documents with an explicit first-slice checkpoint. Mirrored those three
  documents to the exact requested primary-checkout folder after comparing it to the base.
- Registered WED-275 and the architecture decision. Repaired 16 existing unquoted backtick-leading
  YAML scalar entries in this branch's task ledger, preserving their text. The committed baseline
  failed PyYAML parsing at line 1108; the repaired ledger parses and has unique task IDs.

Verification:

- First `cargo test --lib practice:: -j 1`: 10 passed, including all 8 roles x 18 resources x 8
  actions and negative cases for revocation, expiry, cross-plan access, schema/version rejection,
  unallowlisted index fields, money bounds and hold confirmation references.
- Final `cargo test --lib practice:: -j 1`: 12 passed, including added digest-binding and
  vendor/couple proof-isolation cases. `cargo check --lib -j 1` passed on the final implementation.
- SDK build, UI typecheck, both line-budget tests, all 2,004 Wedding tests and production UI build
  passed locally. Vite reports its existing large-chunk advisory. No UI source changed.
- Scoped rustfmt, diff whitespace, task YAML/unique IDs, document fences/links and every new file's
  strict sub-1,000-line limit passed. No migration or browser test applies to this route-free slice.

Limits and next action:

- The contract tests do not prove live revocation, websocket cancellation or cache purging. WED-277
  must resolve owner/plan/thread mapping server-side, replay grants, store revisions and receipts
  atomically, and reauthorise every delivery/download/export. Existing owner-only thread reads must
  remain intact. Structural reference validation is not proof of quote/booking/evidence ownership.
- WED-276 through WED-284 remain pending: shell, live grants, inbox, calendar, supplier/quote flows,
  booking/payment tracking, integrated security/release evidence and the allowlisted cohort.
- GitHub Checks for the base returned 422 because that local commit is absent remotely. Recent CI
  entries were older failed commits; the Deployments API returned no records. No hosted result or
  deployed SHA is asserted. No deployment occurred. The task branch is local; a PR against the
  intended advanced base awaits publishing/review of that base, rather than targeting unrelated main.
- Review `c46e506` using the companion contracts document, then implement WED-276/277 on this lineage
  with new flags dark and the transaction/invalidation requirements intact.

## 2026-10-15 - WED-185 account-verification delivery and exact vendor lookup (Codex)

- Registration no longer presents a contradictory waiting-for-email state after a known delivery failure. The server retries verification/password-reset delivery through a separately mounted Resend credential when the legacy gateway fails; the vendor relay remains disabled and still rejects Gmail/SMTP as a provider.
- Exact free-text directory searches no longer apply `Custom vendor search` as a category, fixing Mackay Family Estate being discarded from its own named lookup.
- Imported the supplied 2026-10-15 venue data into Oracle conservatively: new rows were added and existing rows gained only non-destructive enrichment evidence. Directory-host websites were not added as vendor websites.
- Local verification: `cargo test gateway::smtp_out::tests --lib` (5 passed), `npm run test:wedding --prefix solid-ui` (1,833 passed), and `npm run build --prefix solid-ui` passed. Commit `41c0986` is live on Oracle with scoped homeserver/UI services; subsequent compose-only commits `06c1618`, `79a0d88`, and `396ca39` make the bind-mounted runtime wrapper resilient to Windows file modes/line endings. The protected Caddy checksum remains `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.
- Oracle reports the Resend credential mounted and the homeserver running. Transactional mail now uses `hello@mail.omnyid.com`, so only the mail subdomain needs verification. Resend lists both `omnyid.com` and `mail.omnyid.com` as `not_started`; its DNS verification records cannot be published because the supplied Cloudflare token still receives HTTP 403 on a DNS-record read. Consequently, the code now gives a non-contradictory failure and a Resend retry path, but actual verification delivery remains externally gated until those DNS records are published and Resend reports `verified`.

## 2026-10-15 - WED-185 mobile vendor and outreach refinement (Codex)

- Fixed the mobile vendor-search Enter path so it remains a form submission rather than being intercepted as a home-navigation magic action. Mobile decision cards now keep touch gestures in the card, tolerate pointer-capture gaps in WebViews, and accept a fast downward approval swipe.
- Vendor comparison guidance now compares the highest-ranked option with the next option using saved priorities and ranking evidence. Hosted outreach drafts require readable paragraphs and normalise one-line provider output into paragraphs.
- Added and registered the ACO On The Pier directory migration plus the exact `mailto:Bianca.Astwood@aco.com.au?subject=Pier%202F3%20Venue%20Hire` hand-off. Oracle’s existing ACO row was updated and verified with that address.
- Verification: `npm run test:wedding --prefix solid-ui` (1,833 passing), `npm run build --prefix solid-ui`, focused Rust outreach tests (13 passing), and migration-catalog test passed. Released commits `5d74e13` and `34177ec`; `https://omnyid.com/wedding/` returned HTTP 200. Caddy was not reloaded; checksum remains `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.

## 2026-10-14 - WED-185 relay persistence foundation (Codex)

- Added migration `0108_wedding_vendor_email_relay_foundation` and catalog registration. It creates `wedding_agent_identity_masks`, `wedding_vendor_email_threads`, `wedding_vendor_email_provider_events`, and `wedding_vendor_email_read_projection` with lifecycle, tenant, uniqueness, dedupe, and lookup indexes.
- The mask domain is constrained to `mail.omnyid.com`; relay thread address data is only `BYTEA` ciphertext plus keyed digest. The migration contains no subject, body, HTML, preview, filename, or plaintext address column.
- Legacy Gmail contact data is intentionally not copied: the existing `wedding_vendor_user_contacts.vendor_email` field is plaintext, so a later reviewed encryption/backfill service must own any migration of unambiguous records.
- Verification: `cargo test migration_list --lib` passed (32 tests). The workspace has no local `psql` executable, so live Postgres application of the new SQL remains a pre-deployment requirement. No Oracle deployment or provider/routing change was made.

## 2026-10-14 - WED-185 AFP relay contract foundation (Codex)

- Added matching TypeScript and Rust contracts for `wedding_vendor_email/v1`, `email_read/v1`, delivery-status, and bounce decrypted payloads, while retaining the existing generic AFP message/protobuf shape unchanged.
- Relay envelopes require `type=email`, `kind=communication`, approved subtypes, `wedding_vendor_email` supertag, an exact encrypted-content marker, a non-empty encryption envelope, and content-free metadata. The allowlist rejects unapproved fields and `@`-bearing metadata values.
- Read events require both relay/read supertags and an explicit `message` reference to their `parent_id`; their metadata is restricted to schema plus opaque idempotency key. Deterministic SHA-256 helpers deliberately do not replace AFP ULIDs.
- Verification: `npm run typecheck`, `npm run build`, and `node --test tests/vendor-email-contract.test.mjs` passed in `typescript-sdk`; `cargo test wedding_vendor_email_contract --lib` and `cargo test vendor_mail_provider --lib` each passed (3 tests).
- No Oracle deployment or external mail-provider change: this is a disabled SDK/server validation layer only. Next safe dependency slice is RELAY-03 additive mask/thread/event/read-projection persistence design and migrations.

## 2026-10-14 - WED-185 disabled vendor-relay configuration foundation (Codex)

- Recorded the owner-approved temporary continuity exception: existing Gmail wiring remains live while Cloudflare Email Routing API access is unavailable. The new vendor relay is still disabled, and Gmail is not a selectable relay provider or fallback.
- Added `OMNYID_VENDOR_MAIL_*` example variables and file-backed Oracle secret-sync mappings for Cloudflare, Resend, Worker, and Resend webhook credentials. The compose service receives them separately from the existing Gmail/SMTP values.
- Added a fail-closed `vendor_mail_provider` configuration module: only `cloudflare_email_sending` and `resend` are accepted; enabling either without its platform credentials reports content-free non-readiness; Gmail/SMTP/Outlook names are rejected. No outbound provider call or routing change exists in this slice.
- Added the RELAY-01 threat-model draft, including trust boundaries, explicitly non-E2EE privacy language, residual risks, and the required independent-review release blockers.
- Local TypeScript SDK typecheck passed. `cargo test gateway::vendor_mail_provider --lib` is compiling under the shared artifact lock at handoff time; repository-wide `cargo fmt --check` reports pre-existing unrelated formatting drift, while the new Rust module was formatted independently. No deployment was attempted because this disabled configuration foundation has no live behavior change.

## 2026-10-14 - WED-185 regression repair and Wedding blog release (Codex)

- Released `f13f551` to Oracle. The vendor-search field now holds its draft while typing, avoiding the first-character viewport jump; it commits on blur or explicit search.
- The Wedding overview's **Track vendors** tile stays within the wedding home and scrolls to the real vendor-follow-up panel, instead of opening the unrelated generic Response Queue.
- Published the two requested WED-178 articles: **Fake wedding exits: are they worth it?** and **When a fake exit goes wrong, and how to run one well**. `blog.html` now includes both cards and a client-side guide search, including celebrant advice.
- Verification: `node wedding/tests/wedding-website-smoke.mjs`, `npm run typecheck`, `npm run build`, and `npm run test:wedding` (1,820 tests) passed. Oracle served-content checks passed for the index, both article URLs, blog search markup, and the deployed search-field source.
- Deployment was UI-only with Caddy reload disabled. The Caddyfile SHA-256 remained `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`; the StrollerCheck block and running Caddy/homeserver remained intact.
- WED-185 remains in progress: Cloudflare Email Routing inventory is still blocked by API permission error 10000, so no routing or DNS mutation has been made.

## 2026-10-12 - WED-183 workspace recovery and core view verification (Codex)

- Fixed the production `Cannot access lexical declaration ... before initialization` failure caused by eager Solid memos being declared before their sources in Database, Notes, and the workflow composer.
- Workflows now keeps its editor mounted and shows a retryable failure receipt if the initial workflow API call fails instead of allowing the resource rejection to trip the application error boundary.
- Wedding vendor smoke fixtures are selectively removed from the matching signed-in browser workspace and no longer show the internal cleanup directive or block a real search.
- Local signed-session browser checks confirmed Database, Notes, and Workflows render without the global error boundary. Database's existing `database_record` AFP save path was inspected; its networked write needs an authenticated homeserver session for end-to-end production exercise.
- Verification run: `npm run typecheck`, `npm run build`, focused Node tests for database failure handling, vendor smoke fixture cleanup, workflow editor failures, and workflow wait/resume failures (15 passed).
- Released as `b7cf8c1` (`fix(WED-183): recover workspace core views`). Oracle deployment used the existing remote environment; its scripted post-deploy proof passed at `artifacts/oracle-production-proof-wed183-deploy/postdeploy`.
- A clean production Chromium check passed against `https://omnyid.com/workspace/?auth=signin&source=wedding` (HTTP 200, no page errors). The deployed workspace references `main-BOriMZtG.js`.

## 2026-10-12 - WED-180 inspiration, calendar and timeline polish (Codex)

- WED-178 committed changes were reviewed as a separate public-site/newsletter slice and are retained as safe release ancestors of this branch.
- Removed inspiration storage caveats, redundant image label and item tags; removed Calendar knowledge setup and hides an AI summary when it repeats event context.
- Connected Google Calendar now refreshes automatically every ten minutes while the calendar stays open. Mobile timeline has compact filters, vertical connector nodes and hides secondary row actions.

## 2026-10-12 - WED-179 people, guest, contact, and vendor response usability (Codex)

- Removed internal-facing lifecycle copy from the helper/outreach path and simplified the People label.
- Vendor response cards now use an editable email composer, category-focused labels, a native date-picker follow-up field, and vendor-response AFP message kinds. Future scheduled follow-ups are withheld from the response queue until due.
- Guest drafts collapse behind a show/hide link, can be reopened for editing, summary counters filter visible guest rows, and invitation toggles have stronger visual affordance. Guest-rule saving now explains its effect.
- Contacts no longer expose local-sync implementation copy; role controls provide tap-friendly wedding role suggestions.
- `npm run typecheck` and `npm run build` were attempted in `solid-ui`; both stop at the existing missing `zod` dependency imported by `typescript-sdk/src/workflows.ts`.

## 2026-10-10 - WED-153 vendor rooms: API, card, comparison and operator editor (Claude -> Codex: please merge)

Merge request for Codex:

- Please review and merge these four commits, in order, on `agent/codex/WED-161` (they sit on top of `f3c6784`):
  - `8805290` `chore: apply rustfmt to server files` - formatting only, six `src/server/` files that were left modified in the shared worktree.
  - `92ed73f` `feat(WED-153): expose vendor rooms via API`
  - `1e67eea` `fix(WED-153): keep storage keys server-side`
  - `9d9eddd` `feat(WED-153): show vendor rooms in cards and admin`
- They cannot be cherry-picked onto `main` alone: they build on `3c6dd08` (WED-153 persistence) and on the WED-169 photo helpers. The branch is about 69 commits ahead of `main`, so merge the branch through the normal PR/squash path rather than these four on their own.
- Task WED-153 is set to `review` in `TASKS.yaml`; mark it `done` after the merge. Nothing is deployed.

What changed:

- `WeddingVendorRecord` now carries `rooms` (loaded in `list_wedding_vendors` and `list_active_wedding_vendors_for_user`), and directory search sources carry a `rooms` array. Stored room photos resolve to `/api/public/wedding/vendor/room-photos/{room_id}/{slot}`; bucket and key are `skip_serializing`, clients see a `stored` flag.
- New operator routes in `src/server/user_management_routes/wedding_rooms.rs`: `PUT /admin/wedding/vendors/{vendor_id}/rooms` (upsert by vendor + room name; evidence is merged, not replaced), `DELETE .../rooms/{room_id}` (also removes the stored objects), `PUT .../rooms/{room_id}/photos/{slot}` (raw JPEG/PNG/WebP body, re-encoded to WebP via the WED-169 helpers, stored in Seaweed FS), and the public photo route. The WED-169 helpers `decode_upload`, `encode_webp`, `FULL_EDGE` and `MAX_IMAGE_BYTES` are now `pub(super)`.
- UI: rooms flow `source.rooms` -> ranked candidate -> persisted card `rooms` rows (display strings only, so saved comparisons do not change when room data does). `WeddingVendorChoiceCard` shows a Rooms and pricing block; the comparison table has a Rooms and pricing row; the operator vendor panel has a rooms editor with photo upload.
- Also fixed a pre-existing test compile error: `wedding_vendor_photo_routes.rs` tests used `Cursor` without importing it, so `cargo test --lib` did not compile at `f3c6784`.

Verification (all run on this branch):

- `cargo check` passed; `cargo test --lib wedding_` 127 passed; the gated Postgres round trip (`OMNYID_RUN_DB_SMOKE=1 cargo test --lib local_postgres_room`) passed against local Postgres, covering upsert-by-name, photo replace, foreign-vendor rejection, hidden-vendor photo lookup and delete.
- `npm --prefix solid-ui exec tsc -- --noEmit`, `npm --prefix solid-ui run build`, and `typescript-sdk` `tsc --noEmit` passed; `npm --prefix solid-ui run test:wedding` 1812 passed.
- `npm --prefix solid-ui run test:line-budget` still fails only for the two pre-existing files (`WeddingResponseWorkspaceView.tsx` 1042, `weddingResponseWorkspaceViewState.ts` 1038). No file touched here is over budget.
- Not exercised: the new operator HTTP routes and the Seaweed FS upload/serve path against a running server, and the editor in a browser. They compile and their validation is unit-tested, but run one real upload before relying on them.

Remaining (also in `TASKS.yaml`):

- Redeploy so the rooms API and editor ship (the tables already exist on Oracle). Use a clean release worktree; the shared worktree has many unrelated untracked files.
- No room photos exist yet. Upload through the operator rooms editor once `OMNYID_SEAWEEDFS_*` is configured in the target environment.
- Add the Grange packages PDF and Somersby Canva guide rooms and prices (needs the source documents read).
- `A2UIRenderer` recommendation cards do not show rooms; the comparison table row does.

## 2026-10-09 - WED-177 confirmed vendor selection and directory seed (Codex)

- Vendor comparison ticking is now pending-only. The explicit **Save selected vendors** action writes the existing contact-reference AFP messages, preserving the saved vendor set for unsent follow-up flows instead of writing on every click.
- Added migration `0106` and catalog registration to make `Mackay Family Estate` a production directory record, rather than relying on the unexecuted operator data-load file. A `Mackay` directory query now has a matching active, contactable source.
- Verification: Solid typecheck, `cargo check`, focused vendor-search tests, and diff hygiene passed.
- Release packaging follow-up: add `solid-ui/vendor.html` to the Oracle runtime staging allowlist; otherwise the production Vite build cannot resolve the new entry module.

## 2026-10-09 - WED-169 vendor claim portal and WED-176 mobile polish (Codex)

What changed:

- Added a dedicated Vite entry at `/workspace/vendor.html`, linked from the wedding directory as “Vendor sign in” and “Claim your profile”. The portal keeps the oversized `App.tsx` untouched, captures a claimant’s listing handle and role, then mounts the existing scroll-gated licensed upload panel.
- Extended claimant photo management. `GET /api/wedding/vendor/photos` lists owner images; `DELETE /api/wedding/vendor/photos/{asset_id}` hides a live image immediately and schedules retention expiry. Migration `0105` adds the removal timestamps, and a six-hour server worker removes all three SeaweedFS variants once their fourteen-day grace period ends.
- Phone decision triage now applies and persists the choice locally when account projection saving is temporarily unavailable, retains a Retry action, and does not falsely show the generic unsaved failure. Failed vendor-availability drafts now offer Retry draft.
- Removed internal live-search copy, positioned Search vendors below the field, tightened mobile overview tile hierarchy, and moved calendar knowledge setup into a small component that installs the baseline taxonomy by default.

Verification:

- `npm --prefix solid-ui run typecheck` passed.
- `npm --prefix solid-ui run build` passed (including `vendor.html`).
- `cargo check` passed.
- `node wedding/tests/wedding-website-smoke.mjs` passed.
- Focused vendor-search action-state tests passed.

Remaining:

- The vendor portal links to the existing account sign-in page when unauthenticated; the shared account-auth flow does not yet return a newly authenticated user directly to `/workspace/vendor.html`.
- Not deployed in this change set. Use a clean release worktree: this shared workspace has unrelated modifications in auth and vendor-search backend files.

## 2026-10-09 - WED-167 vendor photo licence consent (Codex)

What changed:

- Added migration `0104`: append-only, versioned photo-licence acceptance receipts; a new `live` owner asset must reference one. Existing early rows are preserved by a `NOT VALID` constraint while new publications are enforced.
- Added authenticated `POST /api/wedding/vendor/photo-licence`, limited to the active claimant. The server selects the current agreement version and SHA-256 itself and records consent copy, time, hashed forwarded IP and bounded user agent. `GET` exposes the current agreement metadata.
- Added the exact agreement as a responsive public page and a reusable phone-ready Solid consent component. Its checkbox stays disabled until the vendor scrolls to the end of the agreement; the button cannot continue without the exact supplied consent text being ticked.

Verification:

- `node wedding/tests/wedding-website-smoke.mjs` passed, including the new public agreement document.
- Focused TypeScript compile for `VendorPhotoLicenceConsent.tsx` passed; formatting and `git diff --check` passed.
- `cargo check`, the focused licence-receipt test, and the migration-catalog test passed after the Cargo queue cleared.

Remaining:

- The owner photo upload/re-encode pipeline is now implemented in the follow-up below. The claim/editor wizard still does not exist: mount `VendorPhotoUploadPanel` there rather than placing it in the already oversized `App.tsx`. The server-side upload path verifies a client-supplied receipt against its vendor, claimant, current version, and hash.

## 2026-10-09 - WED-167 licensed vendor photo publication follow-up (Codex)

What changed:

- Added protected multipart publishing at `POST /api/wedding/vendor/photos`. It accepts only the active claimant's current licence receipt, accepts JPEG/PNG/WebP up to 15 MB, applies source dimension and decoded-memory limits, re-encodes three WebP variants (removing original EXIF/metadata), rolls back stored objects on a database failure, and enforces the 10/30 tier caps.
- Added immutable, public WebP delivery at `GET /api/public/wedding/vendor/photos/{asset_id}/{full|medium|thumb}`. An image is not publicly available until its vendor is active and claimed or verified. Directory responses prefer live owner images over seed images.
- Added `VendorPhotoUploadPanel`, a small responsive Solid component that forces the scroll-gated licence acceptance flow before allowing a photo upload. It is deliberately not mounted in `App.tsx`, which already exceeds the project line budget; the planned vendor wizard is its mount point.

Verification:

- `cargo check -j 1` passed before the final decode-limit hardening edit; the focused WebP and alt-text tests passed from the compiled library test binary. Re-run `cargo check -j 1` after the shared Cargo queue clears to validate the final hardening edit.
- `npm --prefix solid-ui run typecheck` and `node wedding/tests/wedding-website-smoke.mjs` passed.
- `npm --prefix solid-ui run test:line-budget` reports two pre-existing unrelated failures: `WeddingResponseWorkspaceView.tsx` (1042) and `weddingResponseWorkspaceViewState.ts` (1038). All WED-167 files are below 1000 lines.
- Oracle deployment used an isolated clean worktree pinned to `5bc8ad8`, so unrelated shared-worktree changes were excluded. The Linux Docker release build passed, services restarted, and live checks returned `200` for both `/api/wedding/vendor/photo-licence` (including the pinned version/hash) and `/wedding/vendor-image-licence.html`. The deploy script's longer detached backup/restore audit remains in progress after the release.

## 2026-10-09 - WED-168 AgentCard and browser key-custody foundation (Codex)

What changed:

- Added an optional `encryption_public_key_hex` to AgentCard. It is included in the signature only when present, preserving verification of legacy cards while detecting a substituted or removed encryption key.
- Added a rate-limited authenticated AgentCard publish endpoint. It accepts only a self-signed card for the deterministic managed vendor Agent ID, requires both enquiry capabilities and a 32-byte X25519 public key, and never accepts a private key. Public card discovery is served from the standard well-known route only after the listing is claimed or verified.
- Added browser-side key custody in `solid-ui/src/lib/vendorAgentKeys.ts`: temporary extractable generation is used only to create the encrypted recovery backup, then private Ed25519/X25519 keys are re-imported non-extractable and stored in IndexedDB.
- Directory cards advertise secure enquiry only once a public AgentCard URL is present; otherwise they link to the vendor website rather than promising an unavailable conversation.

Verification:

- Focused TypeScript compile of `vendorAgentKeys.ts` passed.
- Wedding static-site smoke test passed.
- Rust formatting and `git diff --check` passed. Full Rust test commands are still draining from a shared Cargo target-directory queue; do not treat them as completed until their final output is captured.

Release status:

- Not deployed. The claim verification transition and ciphertext-only enquiry relay remain incomplete, so direct vendor enquiries must remain gated.

This file is for agent commentary, session notes, and coordination details.
It is not project truth. Keep durable facts in `.agent/PROJECT_STATE.md`, task
ownership in `.agent/TASKS.yaml`, and architecture decisions in
`.agent/DECISIONS.md`.

## 2026-10-09 - WED-161 vendor claim and enquiry schema foundation (Codex)

What changed:

- Added migrations `0101`–`0103` and registered them in the migration catalogue.
- The schema separates owner-managed public listing data from sourced seed data, records
  claim status/history and one-active-claim enforcement, and makes the proposed A2A
  relay ciphertext-only by schema (no plaintext enquiry fields exist).
- Updated WED-161 to `in_progress` on `agent/codex/WED-161`; WED-153 is now present
  in the branch ancestry, so its former dependency block is resolved.

Verification:

- `git diff --check` passed.
- `cargo check` passed.
- The focused migration-catalog test is queued behind an unrelated running full Cargo
  test process holding the shared target-directory lock.
- Oracle read-only preflight passed with the restore drill deliberately skipped:
  `artifacts/oracle-production-proof-wed161-preflight`.

Release status:

- Not deployed. Production has no Vendor Login, public vendor directory, claim wizard,
  or encrypted enquiry routes yet. Do not advertise or release the schema alone.

Next action:

- Finish and review WED-161, then implement WED-162 through WED-170 before any
  customer-facing Vendor Login or A2A enquiry launch.

## 2026-10-09 - WED-164/165 public directory and vendor entry started (Codex)

What changed:

- Added `src/server/wedding_vendor_claim_routes.rs`, kept under 1,000 lines, and
  merged its routes into the homeserver. It exposes active-only public listing
  responses without vendor email or phone fields and creates rate-limited,
  transactional claim-intake records for authenticated vendors.
- Added `wedding/vendors.html` plus dedicated small CSS and JS assets. The page is
  one-column at phone width, uses 44 px actions, and builds cards with DOM APIs so
  directory text is not injected as HTML.
- Added a separate `Vendor login` link to every wedding header at runtime. It routes
  to `/workspace/?auth=signin&source=vendor_claim`, rather than the couple flow.

Verification:

- `node wedding/tests/wedding-website-smoke.mjs` passed.
- Rust formatting and `git diff --check` passed for this slice.
- `cargo check` and the focused route tests are waiting behind a concurrently running
  full Cargo test job that holds the shared target lock; do not interpret that as a
  completed Rust verification.

Release status:

- Not deployed. The intake creates a pending claim but the vendor role landing,
  signed AgentCard publishing, and encrypted A2A envelopes are not yet present.

## 2026-10-09 - UX-MPR-01 mobile UI principles pass on wedding phone views (Claude)

For Codex - merge notes:

- Branch `agent/claude/UX-MPR-01`, cut from `agent/codex/AGM-00` at `e99e846`. It only touches
  files listed in the UX-MPR-01 task. Merge or cherry-pick that single commit; there is no overlap
  with the mesh Rust/SDK files, `.agent` task ids other than the new UX-MPR-01 entry, or staging files.
- Likely conflict spots if you changed these in parallel: `MobileFocusDeck.tsx` (bottom bar rewritten),
  `WeddingMobileFocusHome.tsx` (header title, Home button, save-failure notices),
  `WeddingBudgetTrackerCard.tsx` (scenario block rewritten, panel classes), and
  `AgentPersonaFAB.tsx` (two `phone:` position classes). Keep both sides' behaviour; do not revert the
  `phone:` classes.
- `WeddingResponseWorkspaceView.tsx` is still 1,042 lines (existing line-budget failure); this change
  kept it flat. Do not let it grow while merging.

What changed (source: `Documents/UI/mobile UI design principles.md`):

- Budget: Safe/Balanced/Stretch is a single radio list; Balanced is marked Recommended, the chosen
  row is solid-bordered, others are muted, and detail copy shows only on the chosen row. Removed the
  repeated "left in this version" and "still has room" filler; with nothing selected it reads "No
  choices counted yet". The outer budget card is flat on phones.
- Vendor search: removed the duplicated "‹ Home" (the header now shows the section title and the body
  keeps one SVG back button); flattened nested cards on phones; inputs and buttons are 44px.
- Deck: bottom bar is Later (secondary) plus Approve (primary); Prev/Next became icon buttons above it.
- Errors: new `friendlyErrorText` maps protocol/network text such as "Invalid AFP message" to plain
  language. Used in vendor search, mobile triage saves, outreach drafts and guest saves.
- Floating agent button is lifted above the phone action bar (`phone:` variant) and focus-home scroll
  areas have bottom padding so the last control can scroll clear of it.

Tests performed: `npx tsc --noEmit`, `npm run test:wedding` (1,804 passing), focused
visible-error and budget tests, `npm run build` (pass). `npm run test:line-budget` still fails only on
the two pre-existing files above. No device or browser check was run; not deployed.

Not done: other wedding views (guest list, timeline, tasks) were not audited against the principles.

## 2026-10-09 - UX-MPR-01 follow-up: guest list, timeline, tasks (Claude)

For Codex - merge notes:

- Same branch `agent/claude/UX-MPR-01`, second commit. Only
  `WeddingGuestOperationsCard.tsx`, `WeddingTimelinePanel.tsx` and `WeddingTaskStageView.tsx` changed.
  If you edited these, keep both sides and do not revert the `phone:` classes.
- Guests: add-guest toggles are switch rows, RSVP quick actions are a three-way radio control,
  rows are divider-separated on phones, primary/secondary buttons and inputs are 44px.
- Timeline: one solid primary button; removed the subtitle and empty-state text that repeated button
  labels; the date label that duplicated "View date" is plain text; undated items are stacked rows;
  Gantt rows are 44px tall.
- Tasks: 44px circular completion control (role checkbox, same data-magic ids), segmented To do /
  Done control, stage groups lose their tinted box on phones, the expanded panel keeps only the due
  date, and the Home/Budget/Timeline/Documents shortcut pills are hidden on phones (the phone menu and
  back button cover them).

Tests performed: `npx tsc --noEmit`, `npm run test:wedding` (1,804 passing), `npm run build` (pass).
`npm run test:line-budget` fails only on the same two pre-existing files. No device check; not deployed.

Not done: `WeddingBoundaryManagementCard.tsx` (family boundaries, shown with Guests) was not changed.

## 2026-10-08 - Oracle staging stack, www redirect, strict production policy (Claude)

What changed:

- Added the isolated `omnyid-staging` compose project (`docker-compose.oracle.staging.yml`,
  `scripts/staging-up.sh`) on the Oracle host: own Postgres volume, fresh keys, seed user, resource
  caps, no mail provider or paid API keys. It serves `staging.omnyid.com` through the existing Caddy.
- Caddy now redirects `www.omnyid.com` to the apex (it returned 525) and restricts the staging
  origin to Cloudflare IP ranges. Basic auth gates only the staging dashboard shell because the app's
  Bearer tokens share the `Authorization` header.
- Production now runs with `OMNYID_ENV=production` and a new `omnyid_delegation_master_key_hex`
  secret file. The policy was rehearsed in a one-off container with production's real inputs first;
  the previous image is tagged `omnyid-homeserver:prev-20261008` and the prior compose file is
  `docker-compose.oracle.minimal.yml.pre-strict` on the server.
- Oracle housekeeping: build cache and stale runtimes pruned, `OMNYID_BACKUP_RETAIN=3` (days).

Open items:

- Cloudflare Zero Trust is enabled (team `omnyid`, `omnyid.cloudflareaccess.com`) with no apps,
  identity providers or clients yet, so nothing needs migrating. The staging API is not behind
  Cloudflare Access until an Access app for `staging.omnyid.com` is created; the API token is
  read-only for Access (`auth.forbidden` on create), and the origin lock is already in place.
- The Gmail sync reports `auth_invalid` (permanent); the refresh token needs re-authorising.
- The 89k ingested emails in `public.messages` and heavy bloat in the owner's message table and
  `daemon_heartbeats` are unresolved; nothing was deleted or vacuumed.
- Nothing was pushed; `origin/main` is an unrelated history.

## 2026-10-08 - Mesh/staging ownership coordination

User requests local-only release/tag and Oracle runtime verification; no push/PR/origin-main changes.
Mesh implementation continues in sibling `OmnyID-agm`, now on `agent/codex/AGM-06`.
Local checkpoints: storage `6969576`, policy `4e40df4`, lifecycle `206ed81`, archive/derived state
`a86db76`. None is a release candidate. AGM-05 has local PostgreSQL contracts, 2,327 library tests
and binary compile evidence. AGM-06 extraction is in progress; later integration gates remain open.
That session owns mesh Rust/SDK modules and its coordination records. The user's other session
owns the active primary-worktree Caddy/Compose/.gitignore and staging setup changes. Mesh work
will consume their committed staging implementation without overwriting it or restarting services.

## 2026-10-08 - AGM-00 agent mesh implementation and production closure plan (Codex)

What changed:

- Added `Documents/design/agent/Agent mesh integration production task plan.md`, using the proposed
  Agent Mesh Integration Spec as direction while separating verified repository facts from claims
  that must be re-audited on each task branch.
- Defined dependency-ordered AGM-00 through AGM-14 work covering repository/task reconciliation,
  tenant agent storage, daemon policy, suggestion cutover, append-only retention, event pipeline,
  synthesizer/projection/heartbeats, mobile controls, integrated validation, staging, rollback, and
  Oracle production promotion.
- Recommended `gpt-6-astra` at medium reasoning as the normal executor, with high reasoning limited
  to bounded storage, security, migration, or failed-release reviews.
- Made safe worktree reconciliation and closure of the seven existing `in_progress` tasks explicit
  release gates. Secrets and generated artifacts must be relocated/ignored rather than blindly
  committed. PARA receives compatibility smoke coverage but is not a feature-priority dependency.

Validation performed:

- Re-read the 502-line direction spec and inspected the referenced current symbols, schemas,
  migration tail, large-file line counts, task ledger, Git ancestry/status, GitHub CI/deployment
  visibility, Oracle rollout runbook, deploy script, and recent production handoff evidence.
- Confirmed the plan contains the model directive, baseline worktree/task counts, secret-safe
  reconciliation, staging, rollback, exact-SHA production proof, and PARA compatibility gates.
- `git diff --check -- .agent/TASKS.yaml` completed without whitespace errors (Git reported only the
  existing Windows line-ending conversion warning).

Not changed:

- No agent-mesh implementation, migration, environment, staging, or production deployment was
  performed; this task only creates the implementation/release plan.
- None of the 448 pre-existing untracked entries was staged, edited, removed, or committed. The
  referenced direction spec remains user-owned and untracked.

Recommended next action:

- Claim AGM-01 only after AGM-00's live repository/worktree reconciliation steps are executed and
  the release base is agreed. Do not start storage migration work from the current dirty primary
  worktree.

## 2026-10-08 - WED-175 wedding home mobile gestures and schedule chart (Codex)

What changed:

- Mobile vendor buttons no longer compete with the deck pointer capture. Swipe movement locks to
  one axis, tracks the finger with directional tilt, animates out on a completed gesture, and does
  not accidentally commit on pointer cancellation.
- Successfully saved mobile vendor/decision triage now has a workspace-scoped local mirror, so a
  cleared recommendation stays cleared when returning to Wedding Home before the AFP refresh lands.
- Wedding overview action tiles are substantially larger touch targets on mobile.
- Timeline omits demo/seed review tasks. Its Gantt range runs from saved planning start to wedding
  date plus one day, includes the generated project lead-time plan, and preserves explicit task
  dates as editable overrides. Major axis ticks use that full window.

Tests performed:

- `npm run typecheck` — pass.
- `npm run build` — pass (Vite emitted the existing `min-*`/`max-*` Tailwind configuration warning).
- `npm run test:wedding` — 1,804 passing.

Next action:

- Deploy through the normal reviewed release path when production rollout is requested.

## 2026-10-08 - Oracle release of WED-153 and WED-174 (Codex)

What changed:

- Committed the pending WED-153 vendor enrichment/rooms work as `3c6dd08`, on top of the
  WED-174 persistence release `885636a`.
- Deployed the current branch to Oracle with the existing secret-file-backed remote environment.
  The staged `0100_wedding_vendor_rooms.sql` hash matches the copy on Oracle.

Verification evidence:

- `cargo test wedding_vendor --lib --quiet` — 107 passed.
- `cargo check` — passed.
- Oracle deployment rebuilt the homeserver and UI, recreated homeserver/Caddy/backup, and the
  workspace smoke check returned HTTP 200 with the expected CSP.
- The remote Oracle production proof completed with `STATUS=pass`: homeserver and backup service
  running, backup verification passed, runtime-script integrity passed, and the restore drill
  passed.

Operational follow-up:

- The existing Oracle `.env.oracle` does not set `OMNYID_ENV=production`, and the compose file
  does not pass that variable to the homeserver. The release retained the known working environment;
  enabling strict production startup policy needs a separate, reviewed secret/config hardening
  change. The attempted in-place preflight correction was restored because host-side validation
  cannot read the container-only `/run/secrets` paths and exposed additional missing policy inputs.
- Oracle proof reports root and `/var` usage at 91%; treat storage remediation as urgent before
  another large runtime upload or restore drill.

## 2026-10-08 - WED-174 wedding guest and calendar persistence (Codex)

What changed:

- The guest card now immediately includes a successfully saved local guest in its total, attending,
  and pending figures until the refreshed AFP projection arrives, without double counting it after
  the server-backed row appears.
- Wedding guest and family-boundary projections now translate their readable logical identifiers to
  the ULID-format message and thread IDs required by the authenticated AFP store, while preserving
  the logical thread ID in metadata. This unblocks saving boundary rules and guest records.
- Calendar Knowledge Setup reads the authenticated user's stored supertag definitions on mount, so
  a completed default install remains marked Installed after returning to Calendar. The endpoint now
  skips already stored defaults rather than writing duplicate taxonomy definitions.

Tests performed:

- Focused TypeScript tests: 38 passing (guest display, guest/boundary projection, and boundary state).
- `npm run typecheck` and `npm run build` in `solid-ui` passed.
- `cargo check` passed.

Next action:

- Changes are local on `agent/codex/WED-174`; production deployment was not requested in this turn.

## 2026-10-08 - WED-173 wedding planner correctness fixes (Codex)

What changed:

- Outreach drafting now draws date, location and preferences from the persisted wedding workspace
  context and falls back to the committed budget target. It no longer requires an intake-profile
  thread message to use existing wedding basics.
- Directory search prioritises the exact user query before a broad category fallback, so a
  `mackay` search can return Mackay Family Estate before generic venues. Generic directory records
  such as VenueGuide.au and Easy Weddings are excluded server-side; old persisted comparison cards
  filter those aggregate identities on read as well.
- The People picker inside an expanded task in the decision-focus card includes an inline Add a new
  contact form. A saved person is immediately selected in the assignee field.
- The Wedding Timeline now has a Show Gantt chart control. Its all-task horizontal chart carries a
  labelled major date axis and preserves calendar navigation from task names and bars.

Tests performed:

- Focused TypeScript wedding tests: 11 pass (outreach context, persisted directory exclusion, and
  Gantt date axis).
- `npm run typecheck` and `npm run build` in `solid-ui` pass.
- Two focused Rust directory tests pass (exact-query ordering and generic-directory exclusion).
- `cargo fmt --check` is still blocked by unrelated pre-existing formatting differences in shared
  Rust files; no formatter was run over those files.

Next action:

- No deployment was requested. Preserve WED-153's uncommitted database/migration files; WED-161
  remains blocked until that owner commits them.

## 2026-10-08 - WED-160 Sydney-only wedding home copy (Codex)

What changed:

- Updated `wedding/index.html` so the planning strip lists Sydney only.
- Changed the Byron Bay and Melbourne testimonial captions to "Sydney planning scenario".
- Added exact-copy assertions to `wedding/tests/wedding-website-smoke.mjs`.

Why:

- Implements the accepted Claim Your Profile spec §2 / decision D6 without changing the
  Hunter Valley scenario or any other page copy.

Tests performed:

- `node wedding/tests/wedding-website-smoke.mjs` — pass.
- `cd solid-ui && npm run typecheck` — pass.
- `cd solid-ui && npm run test:wedding:ci` — blocked at its line-budget phase by
  pre-existing violations in `src/db.rs` (17,990 / 17,986),
  `solid-ui/src/components/WeddingResponseWorkspaceView.tsx` (1,042 / 999), and
  `solid-ui/src/lib/weddingResponseWorkspaceViewState.ts` (1,002 / 999). The scoped
  website smoke test passes.

Next action:

- WED-161 remains blocked until WED-153 commits its `src/db.rs`, migration-catalog and
  migration-0100 changes. Do not stage or alter those files.

## 2026-10-08 - WED-160..172 vendor "Claim Your Profile" handed to Codex (Claude)

What changed:

- Wrote the spec and the task/handoff doc for the wedding vendor claim directory, AFP
  enquiries, vendor dashboard and tiers. No code changed.
- Registered WED-160..172 in `.agent/TASKS.yaml`, owner `codex`.
- Recorded the architecture in `.agent/DECISIONS.md` ("2026-10-08: Wedding Vendor Claim
  Directory").

Why:

- The user wants unclaimed seeded vendor listings to become vendor-owned, with E2EE AFP
  enquiries. Codex implements and Claude reviews.

Files changed:

- `Documents/design/wedding planner/wedding-vendor-claim-your-profile-spec.md`
- `Documents/design/wedding planner/wedding-vendor-claim-your-profile-tasks.md`
- `.agent/TASKS.yaml`, `.agent/DECISIONS.md`, `.agent/HANDOFF.md`

Tests performed:

- None; documentation only.
- New `TASKS.yaml` entries were checked by hand for YAML scalar pitfalls. No YAML parser
  is installed locally.

User decisions (2026-10-08):

- Couples enquire from a free account.
- Byron Bay and Melbourne testimonial captions become "Sydney planning scenario".
- Oracle has enough disk for this work.
- Pricing: Starter free, Pro AUD 79/month or 790/year, Founding AUD 39/month or 390/year
  locked for life (first 100 vendors or until 2027-03-31). Claude proposed these prices
  for 1,000 couples a month.

Unresolved:

- Stripe price IDs must be created by the user in the Stripe dashboard.
- Competitor price comparison in spec §7.4 is a market impression and should be
  checked before launch.

Coordination (important):

- `agent/codex/WED-150` is 44 commits ahead of `main` and unmerged. Branch
  `agent/codex/WED-160` from it.
- WED-153 (claude, in_progress) has uncommitted `src/db.rs`,
  `src/db/migration_catalog.rs`, `src/db/wedding_vendor_evidence.rs` and an untracked
  migration 0100. WED-161 is `blocked` until those are committed. Do not touch them.

Next action:

- Codex: read section 1 of the tasks doc, then start WED-160, which has no dependencies.

## 2026-10-06 - WED-150 wedding vendor production-closure implementation

What changed:

- Reworked wedding action styling to outlined, readable 44px controls and added a real-browser
  contrast/target-size plus axe gate at 360×740 and 1280×800. The fixture covers the full comparison,
  persisted draft, explicit send, receipt, inbound reply/quote, durable defer/reload/resolve,
  category replacement from both entry points, blocked shortfall/retry, and second-context bounds.
- Split every reported oversized wedding/Rust module without raising caps. Added durable AFP triage,
  honest save failure/retry, comparison reopen, a database-backed shortlist run claim, semantic vendor
  action intents in AFP, and an in-deck mobile comparison/draft/send/receipt flow. Saved outreach drafts
  and receipts now reconstruct from AFP after reload.
- Added attribute-catalog v2 keys, validation (including 1–5 operator scores and coordinates), grouped
  admin editing, provenance-aware coverage reporting, ranking-v2 pure helpers, deterministic
  interleaving/MMR, Q/S/Value and seasonal/location models, and a fail-closed NDCG gate evaluator.
  Ranking v2 remains default-off; cards show honest placeholders until the real-catalog gate passes.
- Added the guarded operational worksheets for monthly catalog benchmarks, hosted canary/provider
  drills, 14-day SLO evidence, manual WCAG acceptance, moderated usability, staged rollout, and the
  release proof packet. CI installs Playwright Chromium and runs the wedding browser gate.

Tests performed from the working tree:

- `npm run typecheck` (pass)
- `npm run test:line-budget` (2 passing; no cap change)
- `npm run test:wedding` (1,791 passing)
- `npm run test:decisionos-navigation` (7 passing)
- `npm run test:wedding:e2e` (4 passing across both viewports)
- `npm run build` (pass)
- `cd typescript-sdk && npx tsc --noEmit` (pass)
- `cargo check` (pass after the Rust module split)
- `cargo test --quiet` (pass: 2,322 library tests, 3 taxonomy tests, 12 API-flow tests,
  and 1 doctest; 11 doctests ignored)
- `git diff --check` (pass; line-ending warnings only)

Open production gates:

- C6/C13: no real Oracle corpus or two independent judges were supplied. The required 40-case NDCG
  report, calibration review, and canary-only activation therefore remain open; no synthetic fixture
  was represented as human relevance evidence.
- C8: bulk catalog geocoding/enrichment needs explicit approval for each write batch. Coverage has not
  been asserted against Oracle.
- C15: no deployment was performed. It needs fresh authorisation, ≥25% Oracle disk headroom, guarded
  ancestry containing `a95514e`/`7e1880d`, controlled-mailbox hosted lineage, replay, and provider
  drills. The last recorded proof had only 18% free disk.
- C16/C17: security-owner disposition of residual JS advisories, authorised hosted scans and
  rollback/restore drills, 14 consecutive SLO days, human WCAG/usability sessions, rollout decisions,
  and named approvals cannot be agent-closed.
- CI has been updated but this uncommitted working tree has no release-candidate GitHub Check; local
  Playwright success is not described as CI success.

Assumptions and next action:

- The supplied closure spec is authoritative, AFP remains append-only, external send stays
  user-triggered, ranking v1 remains active, and the existing 1 GiB free / 2 GiB paid account-storage
  policy is unchanged. Do not deploy this working tree merely to collect evidence.
- Review and commit the agent-closable slice, obtain approval for a sanitised read-only Oracle catalog
  export and the first enrichment batch, arrange two human judges, then run C6/C13. Only after those
  gates and disk remediation should an authorised guarded canary begin C15.

## 2026-10-05 - UX-MFH-01 decision confirmation and home return

What changed:

- A downward mobile-deck swipe now opens an explicit confirmation rather than
  routing straight into a vendor response workflow. Confirmation appends the
  existing `decision_triage` projection and removes the resolved decision so
  the next unresolved card becomes visible.
- The response/deck and compact quote card now expose an explicit **Open agent
  draft** entry point for the existing Tiptap reply editor. Opening it is
  review-only; the existing send confirmation remains the only send path.
- Deferring remains on Wedding Home, and every non-home wedding workspace page
  now has a **Wedding Home** return control.

Tests performed:

- `solid-ui: npm run typecheck` (pass)
- focused swipe/mobile/quote-reply suite (38 passing)
- `solid-ui: npm run build` (pass; existing Browserslist freshness and
  Tailwind min/max screen-variant warnings)
- `solid-ui: npm run test:line-budget` (baseline failure: existing oversized
  Rust and wedding files; no changed file is a new violation)

Deployment:

- Committed as `af9e93b fix(UX-MFH-01): confirm wedding deck decisions`.
- The normal all-services Oracle deployment was stopped before container
  replacement when the root disk filled while exporting a rebuilt homeserver
  image. Docker build cache was safely pruned (98% to 87% root use), then the
  completed frontend image was deployed directly to `omnyid-ui-1`. Caddy and
  homeserver remained running; the local proxy returned the expected HTTPS 308.
- No database or Docker volume was removed. The host needs a capacity/retention
  remediation before a future full all-services rebuild.

## 2026-10-06 - SEC-001 Caddy-only Oracle rollout

What changed:

- Deployed Caddyfile from clean detached commit `7e1880d` only. No application
  image was rebuilt and no application service was recreated.
- Validated the candidate inside the running Caddy image, then recreated only
  the Caddy service after detecting its file bind mount held an old inode.

Machine-derived verification:

- External HTTPS: `/privacy.html` and `/.well-known/security.txt` returned
  200; the known internal Markdown and TypeScript paths at both `/` and
  `/docs/` returned 404.
- Remote loopback checks returned `local_public=200` and `local_blocked=404`.
- Postgres, homeserver, backup, Electric, and SeaweedFS remained running;
  Caddy is running with the mounted guard configuration. Root disk remained
  70% used with 14 GB available.

Operational note:

- A normal deployment from a working tree without `7e1880d` would overwrite
  the Caddyfile and remove this guard. Merge/cherry-pick this branch before
  such a deployment.

## 2026-10-05 - UX-MFH-01 Master Agent result visibility repair

What changed:

- Direct Master Agent commands now remain on the Search surface after the
  response arrives. A `suggested_view` can still seed a workflow handoff, but
  no longer clears the just-finished command result before it renders.
- Rich previews continue to decrypt only in browser memory. If the device
  cannot unlock one, the renderer now shows the response's safe summary and an
  explicit local unlock notice instead of a blank/locked-only result area.
- Added focused unit coverage for decrypted and locked-preview selection.

Why:

- A working BYOK provider could still appear to return nothing because the UI
  immediately followed a model navigation suggestion and cleared search state.

Tests performed:

- `solid-ui: npm run typecheck` (pass)
- focused command preview tests (19 passing)
- `solid-ui: npm run build` (pass; pre-existing Browserslist freshness and
  Tailwind min/max screen-variant warnings)
- `git diff --check` (pass)

Deployment:

- Committed as `4445f38 fix(UX-MFH-01): keep master agent results visible`.
- Oracle deployment completed with the existing production environment; UI,
  homeserver, backup, and Caddy were recreated and the workspace HTTP smoke
  returned `200`.

Remaining verification:

- An authenticated browser smoke with the user's BYOK account is still needed
  to exercise a real provider response end-to-end. The UI repair is deployed.

## 2026-10-05 - DEV-001

What changed:

- Added `AGENTS.md` as the shared Claude/Codex session protocol.
- Established `.agent/` as the canonical coordination directory.
- Added compatibility pointers at root for `PROJECT_STATE.md`, `TASKS.yaml`,
  `DECISIONS.md`, and `HANDOFF.md`.
- Added follow-up tasks for machine-readable ops state, runtime version/health
  endpoints, project MCP tooling, and an AFP development event ledger.

Why:

- Every agent session needs the same startup context, file ownership map, and
  finish checklist.
- Build/test/deploy/production health must come from machine authorities rather
  than hand-written status claims.
- Claude and Codex should coordinate through artifacts and observable events,
  not conversation history.

Files changed:

- `AGENTS.md`
- `.agent/PROJECT_STATE.md`
- `.agent/TASKS.yaml`
- `.agent/DECISIONS.md`
- `.agent/HANDOFF.md`
- root compatibility files
- `README.md`
- `CLAUDE.md`
- `Documents/README.md`

Tests performed:

- Inspected `git status --short --branch`.
- Inspected recent git log.
- Confirmed existing backend health routes include `/healthz` and `/readyz`.
- Performed a lightweight structure check for `TASKS.yaml`.

Unresolved problems:

- CI/deployment status is not yet queried through a shared project tool.
- `/api/version` and richer `/api/health` are planned but not implemented in
  this pass.
- No PR was created from this local workspace.

Assumptions:

- The user's new `.agent/` convention supersedes the earlier root-file-only
  layout.
- Documentation/process changes do not require a full Rust/UI build.
- Commit creation should wait for an explicit task-branch workflow or user
  request because the current worktree has many unrelated changes.

Recommended next action:

- Move implementation work off `main` onto task branches, then implement
  `DEV-002` so agents can query CI and deployment state directly.

## 2026-10-05 - WED-145

What changed:

- Committed the tracked implementation and coordination changes as
  `42304ae feat(WED-145): begin directory-first wedding vendor MVP`.
- Created `agent/codex/WED-145` and added the WED-145 task to the canonical task ledger.
- Added the pure `weddingVendorShortlistPolicyState` contract and table-driven tests.
  It chooses a single category, fingerprints material intake, filters/uniquely
  selects exactly three suitable ranked candidates, reports shortfall/blocked
  outcomes, and makes media truth explicit.
- Added optional `source_policy` support to the existing vendor-search API,
  executor adapter, and Rust route. A `directory_only` request returns before
  HTTP provider client construction, metering, or online fallbacks.
- Added focused Rust and TypeScript policy/adapter tests.

Why:

- The MVP requires a directory-only first pass and policy-backed exact-three
  selection without replacing the existing ranking/evidence system.

Tests performed:

- `solid-ui: npm run typecheck` (pass)
- focused shortlist/executor/artifact tests (pass)
- `cargo check` (pass)
- `cargo test wedding_vendor_search_routes::source_policy --lib` (pass)
- `solid-ui: npm run test:line-budget` (baseline failure: pre-existing legacy
  monoliths and seven pre-existing wedding files are over their caps)

Unresolved problems:

- M3 still needs the policy wired into the active comparison renderer and the
  existing photo-admin lifecycle.
- M4–M6 (onboarding coordinator, persisted-before-visible outreach drafts, and
  quote-to-DecisionOS projection) remain unimplemented.
- The worktree contains 48 modified, 11 deleted, and 414 untracked top-level
  paths (over 12,000 untracked files) before the commit. The tracked work and
  the required `.agent/` protocol files are in `42304ae`; the remaining
  untracked paths are editor/session artifacts, transient outputs, or unrelated
  documentation and were deliberately not staged blindly.
- No deploy has been attempted: the end-to-end MVP and required production
  verification are not complete.

Recommended next action:

- Extract the current ResponseQueue vendor orchestration into a focused owner,
  call `directory_only`, apply this policy, then make one `online_capable`
  retry only for a suitable-candidate shortfall.

## 2026-10-05 - WED-145 continuation

What changed:

- Wired strict exactly-three comparison rendering and truthful media states
  into the existing live vendor-search path.
- Added an instrumented directory-first executor: it calls `directory_only`,
  ranks the result, and makes at most one online-capable retry only for a
  suitable-candidate shortfall. When paid providers are unavailable it still
  makes the directory request and reports the shortfall without an online call.
- Added a fingerprinted onboarding coordinator which selects one category and
  launches the existing search while preserving the home surface. It records
  a browser-storage run claim to avoid reload/second-tab duplicates.
- Made vendor outreach durable-first: the generated AFP draft is appended
  before the composer moves to its sendable state.
- Wired unresolved quote flows to the existing AFP save/refresh path using a
  stable quote decision idempotency key and persisted-message dedupe.

Tests performed:

- `solid-ui: npm run typecheck` (pass)
- focused MVP policy/search/outreach/quote suite: 36 passing tests
- `cargo check` (pass)
- `solid-ui: npm run test:line-budget` (baseline failure: the three existing
  Rust monoliths and seven pre-existing wedding files remain over cap)
- `git diff --check` (pass; CRLF conversion warnings only)

Unresolved problems:

- M3 photo-admin add/replace/provenance lifecycle has not yet been proven in
  this pass; the comparison renderer has the truthful fallback only.
- M6 still needs durable resolution/deferral successor wiring so a resolved
  quote deterministically leaves DecisionOS.
- Full build, complete wedding suite, full Rust suite, CI/deployment checks,
  and Oracle production smoke remain outstanding. The Vite build began but the
  local command runner cut it off before an exit status; do not treat it as a
  passing build or deploy this checkpoint.
- Existing line-budget failures remain baseline defects; neither cap was raised.

Recommended next action:

- Complete the existing photo-admin lifecycle and quote resolution successor,
  then run M7's full verification matrix before an Oracle deployment.

## 2026-10-05 - WED-145 quote closure continuation

What changed:

- A reply which reaches the existing sent/log flow now projects an append-only
  `decision_result` successor for the same stable quote decision id.
- The dispatcher deduplicates both `decision_request` and `decision_result`
  records using their persisted idempotency keys.

Tests performed:

- focused quote DecisionOS projector/dispatcher tests: 5 passing tests.

Unresolved problems:

- Photo provenance fields (source URL, retrieval time, and licence/use data)
  still need an additive record/migration path; current stable photo slots only
  retain URL, alt text, and source label.
- Full M7 verification and deployment remain outstanding.

## 2026-10-05 - WED-145 photo provenance foundation

What changed:

- Added migration `0095_wedding_vendor_photo_provenance.sql`. It extends the
  existing stable `(vendor_id, slot)` photo rows with nullable `source_url`,
  `retrieved_at`, and JSONB `licence_metadata`; it does not create a second
  photo table or rewrite current rows.

Tests performed:

- `git diff --check` (pass).

Next action:

- Thread these optional fields through the existing admin DTO, DB read/write
  path, and form, then add migration-backed API tests before deployment.

## 2026-10-05 - WED-145 photo provenance DTO continuation

What changed:

- Extended the existing photo request, database records/upserts, list queries,
  and write transaction for optional source URL, retrieval time, and licence
  metadata.
- Existing operator form writes preserve a vendor's already-entered source
  label/URL/check date for each photo without changing the stable vendor/slot
  identity or adding a media store.

Tests performed:

- `solid-ui: npm run typecheck` (pass)
- `solid-ui: wedding-admin-vendor-form-state.test.ts` (4 passing tests)

## 2026-10-05 - WED-145 Oracle vendor directory compatibility

What changed:

- Registered the existing `0095_wedding_vendor_photo_provenance` migration in
  the embedded startup catalog, so source URL, retrieval time, and licence
  metadata reach Oracle on the next application deployment.
- Added migration `0096_wedding_vendor_directory_export.sql`, exposing the
  downloaded Oracle CSV's exact eight-column shape. `photo_count` is computed
  from stable photo slots rather than stored as a stale duplicate.
- Updated photo-provenance Rust fixtures that the full test compilation found
  incomplete.
- Extracted wedding-vendor record DTOs into `src/db/wedding_vendor_directory.rs`
  so the existing database monolith is smaller than it was before this work.
- Preserved the existing backend-validated Google Places photo proxy as a
  verified provider photo in the exactly-three card policy; it is not a
  placeholder merely because it is a same-origin relative URL.

Evidence:

- Read-only Oracle query: production currently has 130 vendor rows and the
  CSV-compatible normalized projection hashes identically to
  `Documents/design/wedding planner/wedding-vendor-database-oracle.csv`
  (`f3cd92e4e975f3952d69aa924c97a345`).
# 2026-10-05 - SEC-001 static docs exposure remediation

What changed:

- Added a Caddy rejection handler for Markdown, TypeScript, SQL, review, and
  CSV files before either `/` or `/docs/` static resolution.
- Versioned the existing Oracle legal-page assets, public security contact,
  Genesis logo script, OmnyID logo, wedding images, and the historical
  production-applied venue-photo seed migration.

Validation:

- `caddy validate` passed in the pinned Caddy 2 container with placeholder
  domain and ACME-email values.
- An isolated Caddy route check returned 200 for `/privacy.html` and
  `/.well-known/security.txt`, and 404 for the previously exposed root and
  `/docs/` Markdown paths plus both TypeScript paths.
- The `0092b` SQL file has one terminating venue-photo `INSERT` statement and
  no migration-catalog entry, so it remains recoverable source history without
  becoming a new automatic migration.
- The untracked Python SDK capability/prototype paths remain deliberately
  unstaged: production uses `runtime-templates/python-runner-chat`; the new
  SDK modules are neither registered nor tested as a shipped runner feature.

Deployment note:

- Do not rely on the normal archive deploy to remove old `docs/` files: it
  intentionally preserves the live bind-mounted directory. Remove the named
  internal files on Oracle after this Caddy change is deployed.

---

- Snapshot validation: 130 unique vendor IDs; all statuses valid; no missing
  required values; `photo_count` values are non-negative (36 zero, 94 three).
- Oracle is currently at migrations through `0094`; `0095` and `0096` are
  pending and the export view is absent until deployment. This is expected and
  has not been papered over in project state.
- `cargo check` (pass)
- focused migration-catalog test (pass)
- focused Rust vendor write and source-mapping tests (3 passing tests)
- `solid-ui: npm run typecheck` (pass)
- `solid-ui: wedding-admin-vendor-form-state.test.ts` (4 passing tests)
- `solid-ui: npm run test:wedding` (1,757 passing tests)

Recommended next action:

- Finish M7 verification, then deploy the task branch's application image to
  Oracle. Startup will apply `0095` and `0096`; re-run the read-only shape and
  hash query afterward before declaring production current.

## 2026-10-05 - WED-145 production deployment

What changed:

- Deployed the clean, committed WED-145 checkout at `608bd6a` to Oracle. The
  release bundle was staged from the explicit runtime contract, excluding the
  dirty workspace's unrelated `Documents/`, artifacts, build outputs, and Git
  metadata.
- Application startup applied migrations `0095_wedding_vendor_photo_provenance`
  and `0096_wedding_vendor_directory_export`.

Machine-derived evidence:

- Oracle post-deploy proof at
  `artifacts/oracle-production-proof-wed145-postdeploy/` passed with
  `homeserver_running=true` and `backup_verify_status=pass` (restore drill
  deliberately skipped for the direct non-invasive proof).
- External workspace smoke check during deployment returned HTTP 200.
- The live directory export has 130 rows and still hashes to
  `f3cd92e4e975f3952d69aa924c97a345`, exactly matching the supplied Oracle
  CSV snapshot. The export view exists and all three photo-provenance columns
  are present.

Deployment-wrapper note:

- The original background deploy wrapper completed the remote build, service
  recreation, and workspace smoke check but became locally inert before
  emitting its post-deploy receipt. With no child or remote audit process, it
  was stopped and replaced by the successful direct post-deploy proof above.
- `cargo check` (pass)

Unresolved problems:

- The operator UI still needs separate per-photo provenance inputs instead of
  inheriting vendor-level source fields.
- Focused Rust admin-route tests were started but did not finish before the
  local command runner's 30-second cutoff.

## 2026-10-05 - WED-145 per-photo provenance editor

What changed:

- Added independent source URL, retrieval date, and licence JSON fields for
  each existing photo slot in the operator vendor editor.
- The form round-trips those fields through the existing vendor/slot write
  contract and rejects malformed source URLs, dates, or licence JSON before
  any API call.

Tests performed:

- `solid-ui: npm run typecheck` (pass)
- `solid-ui: wedding-admin-vendor-form-state.test.ts` (4 passing tests)

## 2026-10-05 - WED-146 planner recovery and visibility polish

What changed:

- Guarded the home Operational Lanes projection so an absent memo value cannot
  make the wedding planner error screen's Back to Home recovery route throw.
- Google Places vendor photos now load through the authenticated API fetch path
  and a temporary browser object URL rather than a bare image request that
  cannot attach the workspace Bearer token.
- Moved Show guide, Upload files, and the density control immediately after
  Setup checks in the planner toolbar; removed duplicated decision-copy; and
  strengthened the response-card action and label contrast.

Evidence and checks:

- Production read-only database check: 282 non-empty photo rows, all Google
  proxy URLs; 94 vendors have three photos. Seaweed FS is not the source of
  these provider photos.
- Focused UI guard/photo tests: 10 passing.
- Wedding test suite: 1,757 passing.
- TypeScript compiler check completed without diagnostics.
- Oracle deploy of `d16a552` completed from a clean detached worktree.
  `artifacts/oracle-production-proof-wed146-postdeploy/` reports passed with
  homeserver and backup services running and backup verification passed;
  restore drill was deliberately skipped for the direct non-invasive proof.
  The remote staged source contains `fetchGoogleWeddingVendorPhoto`, and the
  workspace HTTP smoke returned `200`.

Deployment-wrapper note:

- After remote build/recreation, the local deploy wrapper became inert with no
  child process. It was stopped only after the services and deployed source
  marker were verified, then replaced with the successful direct proof above.

Coordination note:

- WED-146 was expanded concurrently with separate AI-routing acceptance
  criteria. Its task remains `in_progress`; this handoff covers only the
  completed production-recovery and planner-polish slice.
# 2026-10-05 - UX-MFH-01 local output and mobile focus home

Changed:
- Direct `/ui/command` preview messages now use the same in-memory local
  decryption path as dashboard AFP messages before the Master Agent renderer
  receives them. Plaintext is not persisted.
- Added the phone (<640px) wedding focus deck, menu sheet, overview density,
  safe gesture/button/keyboard triage controls, AFP triage builder, source
  previews, and the requested contrast improvements.
- The adapter reads existing wedding DecisionOS/quote projections and leaves
  vendor search, ranking, three-choice comparison, outreach approval, and
  quote projection ownership unchanged per the governing architecture.

Verification:
- `npm run typecheck` passed.
- Focused Node tests passed: 23/23, including swipe thresholds, privacy
  minimisation, ordering, daily streak compatibility, and palette contrast.
- `npm run build` passed. It emitted the pre-existing Browserslist freshness
  warning and the repository-wide Tailwind min/max-variant configuration
  warning; the new mobile rules use the configured `phone:` breakpoint.
- `git diff --check` passed.
- Deployed commit `cc12b86` to the Oracle host with the existing production
  environment. Docker rebuilt the UI, homeserver, and backup images; the UI and
  homeserver containers were recreated; the post-deploy workspace HTTP check
  returned `200`.

Open follow-up:
- The task remains in progress pending device/browser smoke testing and a
  production rollout. Historic GitHub CI runs visible at session start are
  failed and do not correspond to this unpushed local SHA.

# 2026-10-05 - WED-146 model-status and wedding-AI production repair

What changed:

- Renamed the search-bar pill to `Saved model` and distinguished a saved BYOK
  preference from a missing model and from a model that did not return a usable
  Master Agent response.
- Added an explicit, fail-closed policy for platform-funded wedding vendor
  outreach: routing and audit flags, an enforced 60-request/day production
  cap, and a persisted tenant-scoped usage receipt for each successful draft.
- Added the three policy variables to the homeserver compose environment; they
  were previously present in the production env file but not passed into the
  container.

Production evidence:

- Deployed commits `82b5911` and `808bf73` to Oracle.
- Live container inspection: routing=`true`, audit receipts=`true`, daily
  request limit=`60`; protected `/healthz` returned HTTP 401, confirming the
  running endpoint was reachable without exposing the operational token.
- `scripts/oracle-production-proof.ps1 -SkipRestoreDrill` wrote
  `artifacts/oracle-production-proof-wed146-ai-routing-final/` with
  homeserver and backup service running plus `backup_verify_status=pass`.

Tests performed:

- `cargo check --quiet`
- focused wedding policy, outreach, shared-tool metering, and command-route
  Rust tests (20 passing)
- `solid-ui: npm run typecheck`
- `solid-ui: ui-command-fallback-state.test.ts` (5 passing)
- `solid-ui: npm run build`

Unresolved problems:

- The full restore drill was intentionally not repeated in the final proof;
  its machine result remains separate from this targeted deployment.
- WED-146 remains in progress for its pre-existing planner recovery and polish
  acceptance criteria.

# 2026-10-06 - WED-147 wedding vendor production release candidate

What changed:

- Merged required security/Caddy guard commit `a95514e` (including `7e1880d`) through merge commit
  `6cc32e7` before deployment. The deployed release commit is `f0eeb43`.
- Added controlled `wedding.vendor_selection@1` and `wedding.vendor_quote_response@1` patterns,
  deterministic verification, server insert-time quote projection, five-minute reconciliation,
  stable identities, four safety dates, deferral/resurface, supersession, replay, and approval/send
  payload-hash binding.
- Added provider/enrichment/shortlist/send/projection kill switches, deterministic quality corpus,
  metrics, SLO policy, threat model, rollout gates, and operator runbooks.
- Changed authoritative account storage policy and all affected product copy/tests from 5/15 GB to
  1 GiB for new/free accounts and 2 GiB for upgraded accounts. The explicit 10 GiB add-on remains.
- Refreshed Rust and JavaScript dependency locks. Reachable Rust advisories were removed; CI retains
  one documented unreachable lockfile-only RSA exception.

Deployment evidence:

- Oracle runtime inventory: root filesystem 70% before build with 14 GiB free; runtime script
  integrity passed. Its synthetic-message and operational-history subqueries returned unavailable
  because of existing shell/`psql` quoting defects and were not represented as passing.
- The normal deployment used the existing remote production env and explicit 50-path runtime
  manifest. UI, homeserver, backup, and Caddy were rebuilt/recreated. Public workspace smoke is HTTP
  200; an internal Markdown URL is HTTP 404, proving the Caddy guard remained active.
- `artifacts/oracle-production-proof-wed147-deploy/postdeploy/` reports `status=pass`, homeserver and
  backup running, backup verification pass, restore drill pass, and root `/var` use at 82%.
- Live staged source contains `FREE_STORAGE_BYTES = GIB_BYTES` and
  `PAID_STORAGE_BYTES = 2 * GIB_BYTES`; the running homeserver image is the release image built at
  deployment time.
- The deploy and detached-proof wrappers both reached their known inert local post-remote state with
  no child/remote process. Only those inert local wrappers were stopped; the authoritative proof was
  rerun synchronously and passed.

Tests and gates:

- `cargo check` passed after the dependency refresh.
- Full `cargo test` passed: 2,321 library, 12 API-flow, 3 taxonomy, and 1 doctest; 11 doctests ignored.
- `cargo audit --ignore RUSTSEC-2023-0071` passed with one allowed `lru` warning. `rsa` and
  `sqlx-mysql` are absent from the resolved build graph.
- Fresh-lock UI install, `npm run typecheck`, `npm run build`, `npm run test:wedding` (1,766), and
  `npm run test:decisionos-navigation` (7) passed. TypeScript SDK `npx tsc --noEmit` passed.
- The first fresh-lock wedding run hit a one-millisecond pre-existing outreach timestamp assertion
  and a deliberately incomplete temporary config copy; both focused tests and the complete rerun
  passed after the policy fixture was present.
- Tracked secret-pattern scan returned no matches.
- `npm run test:line-budget` remains red on committed/pre-existing oversized files; no cap was
  raised and every new WED-147 source/test module is below 999 lines.

Unresolved production/GA gates:

- Manual WCAG 2.2 AA/device/usability acceptance, controlled Gmail/provider canaries, stable hosted
  SLO windows, later rollout cohorts, and named product/engineering/security/privacy/operations
  approvals remain required. The task list deliberately leaves those boxes unchecked.
- JavaScript audit still reports the upstream TipTap 2 moderate advisory and high `image-size`
  JXL/HEIF/ICNS denial-of-service advisories inherited through `pptxgenjs`. The wedding path does not
  invoke that parser, but security must formally accept reachability or adopt patched upstream
  packages before GA.
- Oracle inventory synthetic/operational-history queries need a separate quoting repair.

Recommended next action:

- Hold at developer canary. Collect quote-projection/provider/SLO evidence, complete the manual
  accessibility and security reviews, repair the line-budget baseline and inventory queries, then
  advance through the documented internal/beta/percentage stages only with named approvals.

# 2026-10-06 - WED-148 global mobile navigation and Oracle rollout

What changed:

- Added one application-shell mobile menu trigger that remains reachable from every phone view,
  retains the wedding attention badge, and replaces the duplicate wedding-home-only control.
- Expanded the drawer to the supported desktop destinations, including feature-gated Study, PARA,
  and Runner entries, searchable groups, current-page state, and persisted cross-page wedding menu
  intent.
- Added Escape/backdrop dismissal, a keyboard focus trap, trigger focus restoration, background
  scroll lock, safe-area spacing, 48px targets, auto-fitting controls for 200% zoom, and destination
  focus/scroll reset.

Deployment evidence:

- Deployed implementation commit `9b609c9` to Oracle with the existing remote production env and a
  UI-scoped image build; Caddy was recreated from the guarded configuration.
- Required guard commit `a95514e` (including `7e1880d`) is an ancestor of the deployed commit.
- Public workspace probe returned HTTP 200. The internal
  `/docs/PRODUCTION_ROLLOUT_RUNBOOK.md` probe returned HTTP 404.
- `artifacts/oracle-production-proof-wed148-postdeploy-retry/` reports `status=pass`, homeserver and
  backup running, manifest and runtime-script integrity pass, backup verification pass, and restore
  drill pass. Root and `/var` usage were 86% after proof.
- The first proof attempt ended on an SSH connection reset before producing evidence. A clean SSH
  check and synchronous retry completed successfully; no failed attempt was represented as passing.

Tests performed:

- mobile navigation/focus/wedding-menu focused suites: 21 passing
- `npm run test:decisionos-navigation`: 7 passing
- `npm run test:wedding`: 1,766 passing
- `npm run typecheck`
- `npm run build`, locally and in the Oracle UI image build
- `npm run test:line-budget` remains red only on the previously recorded oversized baseline files;
  both new WED-148 source modules and tests are below 999 lines and no cap changed.

Unresolved production/GA gates:

- The vendor production checklist still correctly leaves manual WCAG/device/usability review,
  security disposition of upstream JavaScript advisories, hosted canary/SLO windows, legacy file
  decomposition, and named rollout approvals open. Those external/human gates were not fabricated.
- Oracle inventory still emits the known synthetic/operational-history shell/`psql` quoting errors;
  runtime-script integrity passes, but those two unavailable query results need a separate repair.
- Oracle root usage is 86%; schedule evidence-aware backup/build-cache retention work before the next
  full rebuild rather than deleting shared-host data ad hoc.

Recommended next action:

- Perform the named mobile WCAG/device review against the live build, then collect canary SLO and
  provider evidence before advancing beyond the documented developer-canary stage.

# 2026-10-06 - WED-149 wedding routing, vendor comparison, and Decision Cards

What changed:

- Mobile wedding destinations now preserve inner intent: **Wedding Home** opens overview,
  **Live vendor research** opens the `vendor_search` home card, every other wedding destination
  clears stale card selection, and published home cards route correctly from any application page.
- The inline laptop vendor-search result now renders the persisted top-three comparison through
  `WeddingVendorChoiceCard`, matching the mobile artifact state and retaining photos, truthful
  placeholders, evidence, availability, contact details, and approval-gated outreach.
- Fixed Google Places photos by preserving the validated relative proxy path until the choice card
  performs its authenticated fetch and creates a temporary object URL.
- Added the typed `content.decision_card` contract, eight pattern identifiers, validation, and one
  native Solid renderer with wedding/general themes and glance/compact/standard/full modes.
  General DecisionOS queue cards, wedding focus cards, mobile focus cards, and vendor comparison
  now consume that shared primitive while retaining their existing durable/safe action flows.

Tests performed:

- `npm run typecheck` (pass)
- `npm run test:wedding` (1,766 passing)
- `npm run test:decisionos-navigation` (7 passing)
- decision-card, live-vendor rendering, and mobile destination focused tests (9 passing)
- `npm run build` locally and in the Oracle UI image build (pass)
- `git diff --check` (pass)
- `npm run test:line-budget` remains red only on the recorded pre-existing oversized baseline
  files; the already-large wedding workspace component is 18 lines smaller than at task start.

Deployment evidence:

- Implementation commit `f326068` was deployed through the scoped Oracle UI build; Caddy was
  force-recreated from the guarded configuration. Required guard commit `a95514e` (including
  `7e1880d`) is an ancestor of the deployed commit.
- Public root returned HTTP 200 and `/docs/PRODUCTION_ROLLOUT_RUNBOOK.md` returned HTTP 404.
- The initial detached audit completed remotely with status/exit 0, but its local deploy wrapper
  did not collect the finished report and was stopped only after the remote job had completed.
- A clean synchronous proof at `artifacts/oracle-production-proof-wed149-postdeploy-retry/` reports
  `status=pass`, homeserver and backup running, manifest/runtime integrity pass, backup verification
  pass, restore drill pass, and root plus `/var` usage at 82%.
- Live staged source preserves the relative authenticated Google photo proxy and the authoritative
  `FREE_STORAGE_BYTES = GIB_BYTES` / `PAID_STORAGE_BYTES = 2 * GIB_BYTES` policy.

Unresolved production/GA gates:

- The pre-existing manual WCAG/device/usability sign-off, JavaScript advisory disposition,
  hosted canary/SLO windows, and named rollout approvals remain external gates; none were
  represented as complete by this UI rollout.

Recommended next action:

- Perform an authenticated phone/laptop acceptance pass on real wedding data, then continue the
  documented canary evidence collection before broadening rollout.

# 2026-10-06 - WED-150/WED-151 closure rollout and production visibility repair

What changed:

- Completed the agent-closable wedding production closure work: durable shortlist claims,
  persisted outreach/reply projections, deterministic three-card mobile deck, ranking-v2 policy
  modules and fail-closed evaluation gate, shared decision triage, source splits, operational
  evidence contracts, and four Playwright/axe scenarios at 360px and 1280px.
- Fixed the production-only invisible text regression. Oracle runtime staging now includes
  `solid-ui/tailwind.config.cjs` and `solid-ui/postcss.config.cjs`, so the deployed build generates
  the wedding text/background/border utilities used by buttons and follow-up tags.
- Removed the internal **Update availability** selector from vendor recommendation cards. The card
  still shows the provider-derived availability status and routes the primary action appropriately.
- Reduced seeded demo messages to one clearly labelled item. New accounts receive one signed Demo
  welcome message; migration 0099 removes redundant legacy seeds, while the UI labels and supplies
  exactly one fallback without rewriting a retained signed payload.
- Added a plain, always-visible Master Agent response panel before the enhanced AFP preview so a
  completed search cannot disappear because a rich renderer returns no visible surface.

Tests performed:

- `npm run test:wedding`: 1,791 passing
- `npm run test:wedding:e2e`: 4 passing at mobile and desktop widths
- focused Master Agent/demo tests: 11 passing
- `npm run typecheck`, `npm run build`, `npm run test:line-budget`: passing
- `scripts/stage-oracle-runtime-pwsh-selftest.ps1`: passing with 52/51 expected staged paths
- `cargo check` and full `cargo test --quiet`: 2,320 core tests plus integration/doctests passing
- `git diff --check` and LOCS commit guard: passing

Deployment evidence:

- Deployed implementation commit `b8fee60` using the existing Oracle production environment with
  scoped UI and homeserver rebuilds and guarded Caddy recreation. Required commit `a95514e`
  (including `7e1880d`) is an ancestor.
- Public `/`, `/workspace/`, and `/wedding/` return HTTP 200. Live CSS contains
  `.text-wedding-text`, `.bg-wedding-accent`, and `.border-wedding-muted`; live JavaScript contains
  the Master Agent response and Demo welcome, retains **Check availability**, and does not contain
  **Update availability**.
- Migrations `0098_wedding_vendor_shortlist_run_claims` and `0099_single_demo_seed_message` are
  applied. Existing tenant schemas contain no redundant server demo seeds.
- `artifacts/oracle-production-proof-wed151-postdeploy-sync/` reports `status=pass`, homeserver and
  backup running, runtime integrity pass, backup verification pass, restore drill pass, and no
  failure step.
- The deploy wrapper's detached proof completed remotely with status/exit 0 but left a literal `$!`
  PID and continued polling. Only the local polling wrapper was interrupted; the synchronous proof
  was then run to completion and is the authoritative local artifact.

Remaining external gates and next action:

- WED-150's human judging/NDCG corpus, named accessibility/usability sessions, security-owner
  disposition, 14-day SLO window, and rollout approvals remain intentionally open; local code does
  not fabricate those results.
- Oracle is now 82% used (about 8.7 GB free). Before another normal deployment, perform the existing
  evidence-aware cleanup procedure until at least 25% is free; do not bypass the preflight gate.
- Perform one authenticated phone/laptop acceptance pass using real wedding data and a real Master
  Agent query, then continue the documented canary evidence collection.

# 2026-10-06 - WED-152 vendor-search and browser-navigation reliability

What changed:

- Vendor search is a native form, so Enter and **Search vendors** execute the same guarded action.
- Strict directory-first search still attempts the one permitted online fallback, but a remaining
  shortfall no longer discards suitable evidence. One or two source-backed vendors are persisted and
  rendered immediately, with explicit shortlist status, shortfall, and reason metadata.
- **Show full search result** now expands the saved Vendor search notes body directly below the
  result and can be hidden or closed without switching to Documents.
- Primary application views now push typed browser-history entries and restore them on Back/Forward.
  Existing query/hash context remains intact.
- Template launch waits for the destination chunk before changing view; the wedding intent is then
  dispatched against the mounted planner, removing the observed transient render/retry race.

Tests performed:

- focused vendor-search/history tests: 30 passing, plus the final 24-test interaction regression run
- `npm run test:wedding`: 1,793 passing
- `npm run typecheck`: pass
- `npm run test:line-budget`: pass
- `npm run build`: pass locally and in the Oracle UI image
- `git diff --check` and LOCS commit guard: pass

Deployment evidence:

- Implementation commit `db6d2c6` includes required guard ancestor `a95514e` (and `7e1880d`).
- Read-only inventory measured 82% root use. The evidence-aware cleanup removed 5.36 GB of Docker
  build cache only; no containers, volumes, backups, or shared review targets were deleted. Its
  optional journal vacuum failed, but fresh inventory measured 71% use / 13 GB free before deploy.
- Guarded UI deployment used the existing remote environment, rebuilt only `ui`, and force-recreated
  Caddy from the staged guarded configuration. Root, `/workspace/`, and `/wedding/` return HTTP 200.
- Live workspace assets contain the browser-history marker, **Show full search result**, and the
  honest partial-shortlist copy; the former **Open in Documents** result action is absent.
- `artifacts/oracle-production-proof-wed152-deploy/postdeploy/` reports `status=pass`, homeserver and
  backup running, manifest/backup verification pass, restore drill pass, runtime integrity pass,
  and root plus `/var` usage at 73%.

Remaining external gates:

- WED-150 human ranking judges, named accessibility/usability sessions, security disposition,
  14-day SLO window, and staged rollout approvals remain external and intentionally open.
- An authenticated human acceptance pass should verify the exact provider result and browser history
  on the target phone/laptop, because the automated and public checks do not use the user's account.

## 2026-10-06 Claude: vendor email enrichment, directory cleanup, rooms model (WED-153)

Done (applied directly to local Postgres and Oracle production Postgres via psql; the homeserver
was NOT redeployed):

- Added venues from the user's 2026-10-06 enquiry replies: Yarramalong Valley Farmstay
  (Harvest Haven $15,500 for ~100 guests, midweek micro from $5,000, Nov 5-7/26-28 and all Dec
  2027 available), Somersby Gardens Estate (no minimum spend, 4-part payment plan, Nov and early
  Dec 2027 available, price only in a Canva guide), The Grange Wollongong (all-inclusive packages;
  deposit, minimum spend, availability unanswered; pricing is in a SharePoint PDF not yet read).
- Deleted 14 directory/listicle rows from production (ids in
  `postgres/data/2026-10-06_vendor_email_enrichment.sql`). Production now has 118 active and 2
  hidden vendors. St Siandra and SRG Hospitality were kept deliberately.
- Migration `0100_wedding_vendor_rooms` creates `wedding_vendor_rooms` and
  `wedding_vendor_room_photos`; registered in `migration_catalog.rs`. Three Yarramalong rooms
  were loaded. `src/db/wedding_vendor_rooms.rs` has the records and `Db::list_wedding_vendor_rooms`;
  `cargo check` passes. No route, UI, or upsert uses it yet.
- Photo facts: production has 282 photos across 94 vendors (max 3 each); local dev has 0 photos
  (0092b never applied). DB photos reach search via `source.photo_url`; the placeholder renders
  only when there is no photo or it fails to load.

Open / for Codex:

- No room photos exist yet. Upload to Seaweed FS (`OMNYID_SEAWEEDFS_*`), add an authenticated
  serving route, then insert `wedding_vendor_room_photos` rows.
- Expose rooms in the vendor API and render in the card/comparison; add admin editing.
- Read the Grange packages PDF and Somersby Canva guide and add their rooms and prices.
- Stop search-cache ingestion from re-adding directory/listicle pages as hidden vendors.
- PLYNLIMMON 1860 Heritage Cottage still has an Easy Weddings URL as its website_url.
- All changes above are uncommitted in the working tree.

### 2026-10-07 Claude follow-up (WED-153)

- Resolved the open item "search cache can re-add directory pages". `upsert_discovered_wedding_vendor`
  (`src/db/wedding_vendor_evidence.rs`) now resolves an incoming vendor to an existing row by slug,
  normalised name+category, website host, or phone digits before inserting. A match is merged
  (existing values win; only missing address/phone/email/website/source and empty photo slots are
  filled), so a discovery never creates a duplicate and only adds genuinely new details.
- Added wedlockers, hitchbird, tagvenue, weddinghero, weddingvenues.com, hiddencitysecrets and
  weddedwonderland to `DIRECTORY_DOMAINS` so they classify as directory/listicle, which the
  persister already skips. Directory profile pages of a real venue can still enter as hidden
  vendors if they are not duplicates.
- Smoke test `local_postgres_discovered_vendor_merges_duplicates_and_fills_gaps` passes against local
  Postgres. 22 other `local_postgres_*` server tests fail in this environment; not investigated and
  not related to these files.
- PLYNLIMMON 1860 website in `Documents/design/wedding planner/oracle-venue-export-2026-10-06.csv`
  is now the official site; the Oracle DB row still holds the Easy Weddings URL (not updated).

### 2026-10-07 Claude: listing enrichment (WED-153)

- Applied `postgres/data/2026-10-07_vendor_listing_enrichment.sql` to local and Oracle Postgres.
  New vendors: The Tea Room QVB, Zest Boathouse at The Spit, Waterview in Bicentennial Park, Crowne
  Plaza Hawkesbury Valley, Mackay Family Estate. Yarramalong Valley Farmstay enriched; PLYNLIMMON
  website_url fixed in Oracle.
- Facts live in catalog attribute keys (`style_tags`, `editorial_summary`, capacities, `price_per_head_aud`,
  `curfew_time`, booleans, `inclusions`) with authority `directory`; the upsert only replaces rows whose
  authority is already `directory`, so vendor_reply values are kept. Packages for Yarramalong are in
  `wedding_vendors.evidence.packages`. Crowne Plaza and Waterview have per-room rows (hire fee in
  `price_from_cents`, ceremony fees in `pricing_label`).
- Mackay Family Estate photos are served as static files from Caddy at
  `https://omnyid.com/wedding/assets/venue-photos/mackay-family-estate-{1,2}.png` (copied to
  `/home/ubuntu/omnyid/wedding/assets/venue-photos/` on Oracle and to `wedding/assets/venue-photos/` in
  the repo so a deploy keeps them). This is public static hosting, not Seaweed FS.
- Not provided in the pasted listings: Tea Room QVB, Zest and Crowne Plaza websites/phones; Mackay
  details beyond address, website, phone and photos.

## 2026-10-12 - WED-181 storage and database editor repair

Changed:

- Enforced 50 MiB standard / 100 MiB paid Wedding storage on billing status and file routes; configured operator emails are exempt.
- Added a clear Profile upgrade card for the supplied AUD 39 one-off OmnyID Wedding Stripe Payment Link. No Stripe key was written to source control or frontend code.
- Made Database immediately project successful row, cell, import, and new-field saves; field definitions persist as `database_schema_update` AFP messages. Removed the internal-facing Database subtitle.

Verification:

- `cargo check` passed.
- `cargo test server::billing::tests --lib` passed (20 tests).
- Focused UI state tests passed (24 tests), `npm run typecheck` passed, and `npm run build` passed after installing the workspace SDK dependencies.
- `git diff --check` passed.

Open:

- Existing wedding collaboration UI is explicitly a scaffold: durable partner co-ownership still needs backend ACLs, shared-key distribution, per-collaborator audit, and conflict handling. Do not represent its current invite controls as live shared access.

## 2026-10-12 - WED-181 Stripe Checkout completion

Changed: replaced the reusable Payment Link with authenticated server-created one-off Stripe Checkout; added restricted-key/Product-ID support; passed Stripe configuration only to the Oracle homeserver; made file-backed webhook secrets work; normalized workspace returns; and repaired a calendar null-safety type error.

Verification: `cargo check` and `cargo test server::billing::tests --lib` passed (21 tests). `npm run typecheck` passed; rerun `npm run build` once more before deployment.

Open: subscribe the Stripe destination to `checkout.session.async_payment_succeeded` if delayed payment methods are enabled. Partner co-ownership still requires backend ACL/shared-key/audit/conflict contracts and must not be presented as live shared data access.

Deployment: release commit `fc93467` was staged to Oracle. The initial compose recreate encountered a verified stale generated UI-container-name conflict; the exact exited `omnyid-ui-1` container was removed and the scoped homeserver/UI start then completed. Oracle Stripe secrets were written after staging (the deployment prune removes `.secrets`), are mode `0600`, and are loaded by the homeserver entrypoint. The public workspace probe returned HTTP 200. The synchronous Oracle production proof passed with homeserver and backup service running, backup verification passing, and restore-drill status passing. `/readyz` is authentication-protected (HTTP 401 without its operational credential), so it was not treated as a failed health assertion.

## 2026-10-12 - WED-182 custom-email confirmation and Master Agent travel fallback

Changed:

- Password registration no longer tells a user to check their inbox after the server's transactional confirmation delivery has already failed. It returns a generic retry state that remains safe against account enumeration.
- Master Agent task output that consists only of unavailable weather/map/tool status now becomes a clear, actionable travel-planning fallback. A partial answer that already includes useful guidance is left intact.

Verification:

- `cargo test registration_delivery_failure_is_honest_without_revealing_account_state --lib` passed.
- `cargo test travel_tool_outage_is_replaced_with_actionable_planning_guidance --lib` passed.
- `cargo test travel_answer_with_guidance_is_not_replaced_when_one_tool_is_unavailable --lib` passed.
- `cargo check` and `git diff --check` passed.

Operational finding:

- Oracle has the Gmail OAuth client and both file-backed Gmail secrets, and `OMNYID_BASE_URL` is set to the expected public origin. Its refresh-token exchange returns HTTP 400. A fresh user-authorized Gmail refresh token must be installed securely before confirmation mail can be delivered and the full registration flow can be verified; no credential was printed, copied, or committed.

Deployment:

- Commit `09d338f` was staged through the scoped Oracle homeserver/UI deployment. The running homeserver restarted with the source markers for both the email-delivery response and travel fallback; `https://omnyid.com/workspace/` returned HTTP 200.
- `artifacts/oracle-production-proof-wed182-postdeploy/oracle-production-proof.json` reports `status=pass` with `failure_step=none` after the synchronous Oracle audit and restore drill.
# 2026-10-13 - WED-185 relay foundation and wedding response hotfix

Changed:

- Added a Cloudflare Email Routing inventory/rollback capture script and a
  RELAY-00 decision record. The selected address domain is `mail.omnyid.com`;
  Cloudflare Email Sending is primary and Resend fallback. Wedding relay has
  no Gmail or personal-mailbox fallback.
- Removed sample-dashboard merging for authenticated workspaces. The generic
  Greenfield queue content can no longer mask real user content.
- Made the Track vendors tile open the existing wedding vendor-follow-up panel,
  which owns the wedding vendor reply projection, instead of the unrelated
  general Response Queue.
- Dashboard loading now obtains the local encryption key before attempting to
  decrypt its AFP messages. An encrypted envelope that cannot be opened now
  says the device must be unlocked rather than claiming it is still decrypting.

Cloudflare control-plane result:

- The supplied token verifies for basic zone/account reads, but Email Routing
  rules reads return Cloudflare error `10000`. No Email Routing or DNS change
  was made, and the incomplete capture artifact is intentionally not committed.

Verification:

- `node --import ./tests/node-ts-specifier-hooks.mjs --experimental-strip-types --test tests/decrypted-display-state.test.ts tests/wedding-home-overview-state.test.ts` (19 passed).
- `npm run typecheck` (passed).
- `npm run build` (passed; existing Tailwind/chunk-size warnings only).

Remaining:

- Cloudflare needs the Email Routing Rules and Email Sending API permissions
  required to capture the mandatory inventory and run the external smoke.
- RELAY-01 onward, including authenticated gateway routes and the transport
  retrofit, remain in progress; live vendor relay is deliberately disabled.

# 2026-10-14 - WED-185 wedding reply and catalogue repair

Changed:

- The vendor follow-up reply action now receives a deterministic, editable
  draft if the optional hosted Anthropic draft call is unavailable. It still
  persists through the existing AFP projection before display and still
  requires explicit user approval before the existing Gmail send path runs.
- Directory-only searches retain a couple's exact free-text query, fixing
  searches such as Mackay when no online provider is configured.
- Vendor comparison cards accept only direct images.unsplash.com photo URLs;
  all other external and legacy proxy image URLs are omitted.
- Removed the Wedding planner guide's automatic display and entry point.

Production investigation:

- Oracle has active venue-mackay-family-estate with a phone number and two
  photo records; migration 0106_wedding_vendor_mackay_family_estate is
  already applied. The missing result was the client query plan, not absent
  catalogue data.
- Homeserver logs show the reply failure was caused by Anthropic returning an
  insufficient-credit response, not a lost browser connection.
- Recorded pre-release Caddy SHA-256
  06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40.
  The release must use a scoped homeserver/UI deployment with Caddy reload
  skipped.

Verification:

- focused Solid tests: 29 passing
- Solid typecheck: passed
- focused Rust outreach tests: 11 passing
- focused Rust vendor-search tests: 22 passing
- git diff --check: passed

Open:

- The repository-wide cargo fmt --check still reports pre-existing formatting
  drift in unrelated files. Changed Rust files were formatted directly.
- Relay live transport remains disabled pending the documented Cloudflare
  inventory and security gates; existing Gmail remains the owner-approved
  temporary transport.

Deployment correction:

- The disabled relay's optional secret-file paths must default to empty in
  Compose. A fixed default path made the runtime entrypoint require relay
  secrets even while OMNYID_VENDOR_MAIL_ENABLED=false; this is corrected in
  the follow-up deployment commit.

Production release:

- Released `050f652` and the Compose correction `db32e0a` to Oracle on
  2026-10-14 using the existing production environment. The initial scoped
  release built the new homeserver and UI assets, but exposed the optional
  secret-path error above. The Compose-only recovery then recreated
  `homeserver` without rebuilding or changing Caddy.
- Verified `omnyid-homeserver-1` is running, logs `Omnyid HTTP listening on
  0.0.0.0:8080`, the configured Gmail sync scheduler is active, and
  `https://omnyid.com/wedding/` returns HTTP 200. Caddy still has SHA-256
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.

Follow-up UI hardening:

- Persisted comparison artifacts and shortlist-card media had a separate
  permissive image policy, including the legacy Google photo proxy. They now
  use the same direct `images.unsplash.com` allowlist as live vendor search;
  all other image URLs resolve to the existing honest placeholder. Focused
  comparison/shortlist/search tests (25) and Solid typecheck pass.
- Released `0ef2673` as a scoped Oracle `ui` build on 2026-10-14. The asset
  copy completed (`UI assets ready at /srv/workspace`), the homeserver stayed
  up, `/wedding/` returned HTTP 200, and Caddy's SHA-256 remained
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.

Provider and Cloudflare follow-up:

- Wedding vendor drafts now cascade Cerebras -> Mistral -> Anthropic and only
  then use the deterministic review-before-send template. Successful provider
  calls are metered by their actual provider; model output is no longer logged.
  The local Cerebras credential was moved to
  `.secrets/omnyid_cerebras_api_key` and is ready for Oracle sync.
- Cerebras authentication and model discovery work, but its currently exposed
  `qwen-3.8-27b` completion returned HTTP 402. The supplied local `.env` has
  no parseable Mistral key, so the Mistral leg remains unconfigured until the
  owner supplies `MISTRAL_API_KEY` or `OMNYID_MISTRAL_API_KEY`.
- `artifacts/cloudflare-email-routing-inventory-20261014` contains rules,
  catch-all, rollback, destination-address inventory, and explicit error
  records. Routing-status and DNS export remain `403/10000`; no routing/DNS
  mutation occurred. A deliberately invalid, non-sending Email Sending request
  returned `400/10001`, proving this account/token is entitled (not `10105`).
- Released `807fe72` to Oracle on 2026-10-14. The homeserver rebuilt and is
  running with the file-backed Cerebras key; its HTTP listener and the public
  wedding page returned normally. Caddy was not reloaded and still has SHA-256
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.
- The local Oracle environment is missing the staging-only Caddy password
  interpolation value. A transient inert value was used only to let Compose
  validate while recreating `homeserver`; Caddy was untouched. Do not perform a
  Caddy restart/reload through Compose until that source environment value is
  restored through its approved secret path.

Current WED-185 follow-up (pending release):

- Vendor Follow-up has native, selectable draft and email controls; the source
  rationale is collapsed until requested. The date field can be typed directly
  and has an explicit calendar button. A missing directory email is shown
  truthfully, with a stored official vendor-website link when one exists.
- Thread rendering treats legacy empty encryption `{}` as plaintext, while
  non-empty encryption envelopes still require in-memory client decryption.
  `daemon_heartbeat` is excluded in both the authenticated thread endpoint and
  client render state.
- The owner-confirmed `MISTRAL_API_KEY` was migrated from the local `.env` to
  the gitignored file-backed secret `.secrets/omnyid_mistral_api_key`; its
  Oracle reference already exists in `oracle-cloud.local.env` and Compose.
- Verification: Solid typecheck; focused Solid tests (28 passing); focused
  Rust provider-order and thread-merge tests passing; Solid production build;
  `git diff --check` passing. Repository-wide `cargo fmt --check` continues to
  report unrelated existing drift; `src/server/auth.rs` was formatted directly.
- Next: commit the code, install the Mistral secret on Oracle, then scope the
  deployment to `homeserver` and `ui` with `OMNYID_STAGING_PASSWORD_HASH=disabled` only for Compose interpolation. Do not reload Caddy.

Release completion (2026-10-14):

- Released `da42505` to Oracle. The scoped `ui` asset job completed with exit
  code 0 and the homeserver is running on its rebuilt image, logging its HTTP
  listener on `0.0.0.0:8080`.
- The Mistral file-backed secret is present at the mounted container path;
  neither its name beyond the configured file key nor its content was logged.
  The configured draft order remains Cerebras, Mistral, then Anthropic.
- `https://omnyid.com/wedding/` returned HTTP 200. Caddy remained running
  throughout and its Caddyfile SHA-256 is unchanged at
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.
- The manual Windows archive transfer required normalizing the remote
  `runtime-env-entrypoint.sh` to LF before restarting homeserver; normal
  `deploy-oracle.ps1` already performs that normalization after extraction.
  Caddy was never reloaded.

Current WED-185 UI clarity follow-up (pending release):

- Removed implementation-only mailbox caveats from Email and kept the
  temporary Connect Gmail action available. Vendor follow-up now derives a
  compact practical summary from the persisted inbound vendor-reply note,
  rather than a generic instruction to continue from a response.
- Decision Focus has an on-demand past-decision and background-agent record
  view. Wedding documents add the compared vendor category without changing
  stored artifact titles, and the comparison panel has a readable light
  surface. Master Agent result links are visible when a search returns them.
- Restored directory photo display only through direct Unsplash URLs or the
  authenticated bounded Google Places proxy. The backend rejects arbitrary
  image URLs and unsafe proxy forms. Exact directory search terms still reach
  the Mackay Family Estate migration record.
- Verification before release: `npm run test:wedding --prefix solid-ui` (1823
  passing), `cargo test wedding_vendor_search_routes --lib` (65 passing),
  `npm run build --prefix solid-ui`, and `git diff --check` all pass.

Release completion (2026-10-14):

- Released `aca37c1` with scoped `homeserver` and `ui` Compose targets. The UI
  build completed and the homeserver release build completed in the Oracle
  Docker cache before both targets were recreated.
- Verified `omnyid-homeserver-1` is running and logs `Omnyid HTTP listening on
  0.0.0.0:8080`; `https://omnyid.com/wedding/` returned HTTP 200.
- Production Postgres returns `Mackay Family Estate` from `wedding_vendors`,
  confirming that the directory migration data required by the exact-query
  search is present.
- Caddy was not restarted or reloaded. Its Caddyfile SHA-256 remains
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.

Current WED-185 mobile and Places release completion (2026-10-14):

- Released `2dce677` with only `homeserver` and `ui`. Mobile Wedding now gives
  the clear-decision state the available view above the tab bar; Timeline has one
  mobile title, a visible rail, correctly filtered completed items, and touch
  navigation to the task action. The Vendors tab renders the existing live vendor
  search surface again, including for older vendor-research tasks without a menu
  marker.
- Copied the supplied local `GOOGLE_PLACES_API_KEY` only into the gitignored,
  file-backed Oracle secret. The running homeserver PID 1 exposes
  `OMNYID_GOOGLE_PLACES_API_KEY`; no credential was committed or logged. A new
  `docker exec` shell intentionally does not inherit entrypoint-derived values.
- Local evidence: Solid typecheck, full wedding test suite, production build, and
  `git diff --check` passed. Oracle evidence: UI job exited 0, homeserver recreated
  and logged its HTTP listener, `https://omnyid.com/wedding/` returned HTTP 200,
  and Caddy's SHA-256 is unchanged at
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.
- The relay remains disabled while Cloudflare ingress/control-plane and the
  independent RELAY security gates remain unresolved; temporary Gmail continuity
  is unchanged and was not used as a relay fallback.

Follow-up UI release (2026-10-14):

- Released `4254dce` as a scoped `ui` asset update. The mobile clear-decision
  state now suppresses the otherwise empty focus header and fills the entire
  available content area above the persistent tab bar. The UI job exited 0;
  `/wedding/` remains HTTP 200, the homeserver remains healthy with the Places
  key, and Caddy was not reloaded (SHA unchanged).

Current guest and directory follow-up (pending release):

- Vendor reply summaries no longer show raw `Subject:` text. Where a body
  excerpt was not available from Gmail, the UI states the enquiry type rather
  than presenting routing metadata.
- RSVP quick actions persist immediately to Wedding; the misleading local-only
  copy is removed. Saving a guest now creates its household ledger record,
  allowing Family Boundaries to show groups and the guest list to render the
  household display name. The guest UI explicitly supports grouping a saved
  guest by exact name and household.
- Helper fallbacks are `You` and `Your partner`, with unassigned work assigned
  to the first (account-owner) person. Wedding tooltips use a portal above the
  navigation surface. Comparable categories normalize at persistence and in
  the existing directory; A2Z Weddings is migrated to `photographer`.
- Local verification: Solid typecheck, `npm run test:wedding --prefix solid-ui`
  (1823 passing), `cargo test wedding_vendor_search_routes --lib` (65 passing),
  production UI build, and `git diff --check` pass.
- Production audit before this release: vendor records do have photo rows, but
  the homeserver reports `OMNYID_GOOGLE_PLACES_API_KEY` missing. The
  authenticated Places proxy therefore cannot retrieve those photos. Do not
  weaken the media allowlist or expose Google resource names; install the key
  through the approved file-backed Oracle secret path before claiming live
  directory photos are restored.

Release completion (2026-10-14):

- Released `8bd182f` to Oracle using only `homeserver` and `ui` Compose
  targets. Both images rebuilt and both targets were recreated successfully.
- Verified the homeserver listener on `0.0.0.0:8080`, public
  `https://omnyid.com/wedding/` HTTP 200, and production query result
  `A2Z Weddings|photographer` after migration `0109`.
- Caddy was not reloaded. Its Caddyfile SHA-256 remains
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.

## 2026-10-14 - WED-185 Inspiration and persona interaction release (Codex)

Changed:

- The Inspiration working model is calculated from the current combined local and saved evidence. Any two photos/screenshots now produce an explainable visual-direction trait even if filenames carry no useful text; the most recent note becomes a clearly labelled planning instruction.
- Inspiration uses the available page width and its duplicate mobile app-bar title is suppressed. Important details now presents plain status text rather than internal-looking tag pills.
- Generate recommendations no longer depends on stale browser intake fields once its context card is ready. Vision notes update the active wedding compass after a durable save (or explicitly state the local-only state), and a failed save leaves the note in the field.
- Template installation from the sprout persona switcher keeps the activated persona visible through a delayed list read and confirms that it was installed and activated.

Verification:

- `npm run typecheck --prefix solid-ui`, `npm run test:wedding --prefix solid-ui`, `npm run build --prefix solid-ui`, and `git diff --check` passed locally.
- Released code commit `cb2ef81` as a scoped Oracle `ui` build. The asset job exited 0, `https://omnyid.com/wedding/` returned HTTP 200, and `omnyid-homeserver-1` remained running.
- Caddy was not restarted or reloaded; its SHA-256 remains `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.

Remaining:

- The vendor relay stays disabled. The partially captured Cloudflare routing/DNS inventory and independent RELAY security gates remain blockers; existing Gmail continuity is unchanged and is not a relay fallback.

## 2026-10-14 - WED-185 search and decision-sync repair

Changed:

- The vendor query input selects the current request on focus and on touch completion. Provider readiness no longer disables a named directory lookup: an exact query such as `Mackay` skips optional live-provider intake, retains its exact local directory query, and does not broaden into an online search.
- Source-only/older cached vendor-search packets normalise a missing comparison-card list before rendering, so a valid one-result lookup cannot crash the wedding planner.
- The mobile Decision Focus AFP message now has a deterministic ULID-shaped transport thread ID. The former readable `decision_triage:...` thread string was rejected by the authenticated `/send` endpoint and caused the local-only retry notice. The logical scope remains in minimised metadata; the component also passes the authenticated account identity to the sender.
- The legacy task router recognises plural vendor categories such as `photographers`, preserving the direct mobile Vendors action.

Verification:

- Focused Solid tests: 24 passing.
- Full Wedding suite: 1,830 passing.
- Solid typecheck and production build passed; `git diff --check` passed.
- Released `e4fa5f9` as a scoped Oracle `ui` build. `omnyid-ui-1` exited 0
  after copying its assets, `omnyid-homeserver-1` remained up, and
  `https://omnyid.com/wedding/` returned HTTP 200. Caddy was not restarted or
  reloaded; its Caddyfile SHA-256 remains
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.

Remaining:

- This is UI/AFP projection work only. It does not enable the vendor email relay. RELAY-04 through RELAY-17 remain gated by gateway-key, signed-inbound, attachment, authenticated API, security-review, and production rollout work; RELAY-00 has an incomplete Cloudflare routing/DNS inventory capture and RELAY-01 needs independent sign-off.

## 2026-10-14 - WED-185 approved-enquiry and Sprout recovery

Changed:

- Fixed approved vendor enquiry delivery: the browser had sent an internal AFP
  tracking thread ID to Gmail's `threadId` field. A new message has no Gmail
  thread ID yet, so Gmail rejected it. The send now leaves that provider field
  absent and continues to retain the AFP draft/sent relationship separately.
- A2UI comparison views can now select one or several vendors and explicitly
  add them to follow-up. The stale transient `Done` button and internal photo
  placeholder sentence are removed.
- A template row in the sprout picker now activates an existing installed
  persona instead of doing nothing. Custom card data persists as the requested
  text/callout/stats/table shape; image cards accept a local image, compress it
  when necessary, persist it locally, and remain draggable.

Verification:

- `npm run typecheck --prefix solid-ui`
- focused card/persona/outreach tests: 22 passing
- full `npm run test:wedding --prefix solid-ui`: 1,830 passing
- `npm run build --prefix solid-ui` and `git diff --check`
- released `0973aab` with the scoped Oracle `ui` service. The build completed,
  `https://omnyid.com/wedding/` returned HTTP 200, the homeserver remained up,
  and Caddy's SHA-256 remains
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.

Deployment correction:

- The browser-side omission exposed a second copy of the same defect: the
  server filled a missing Gmail thread with an OmnyID `compose:<user>` value.
  Commit `9eb57aa` changes that default to empty, so Gmail receives no
  `threadId` for a new enquiry and creates the provider conversation itself.
- The scoped homeserver release build completed on Oracle, then recreated only
  `omnyid-homeserver-1`. It is running, `https://omnyid.com/wedding/` returns
  HTTP 200, and Caddy was not restarted or reloaded (SHA-256 unchanged at
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`).

Follow-up card calculation:

- A stats-card request now asks the open Wedding workspace for aggregate-only
  values before rendering. Invitation-vs-RSVP cards use the saved guest count
  and the sum of attending plus declined RSVP records; no guest identity or
  contact data is passed into the custom-card surface. Commit `00fcc19` was
  released with the scoped Oracle UI service. Its asset build completed,
  `/wedding/` remains HTTP 200, the homeserver remains up, and Caddy is still
  unchanged.

Remaining:

- The external email relay remains disabled behind its Cloudflare inventory and
  independent security gates. This repair only restores the temporarily
  owner-approved Gmail continuity path for explicit user-approved enquiries.

## 2026-10-14 - WED-185 agent setup gate and vendor-reply correction (Codex)

Changed:

- Master Agent commands now require a usable configured AI provider before a
  deterministic plan/A2UI card can be produced. An unconfigured account sees a
  clear “Connect AI model first” boundary with a route to Agent Settings,
  rather than a malformed pseudo-plan.
- Natural-language submissions no longer pass through the boolean-search
  normaliser, so normal requests such as a family-trip plan retain their
  original phrasing.
- The LORA/soul editor now uses a native, focusable textarea rather than the
  unstable rich-text overlay; keyboard saving remains supported.
- Voice start requests microphone permission directly from the click gesture,
  stops the short permission probe, and feeds recognised speech into the
  Master Agent text field instead of attaching an audio file.
- Decision Focus follow-up now opens an actionable vendor-outreach path (or a
  useful vendor-search handoff when no comparison artifact exists).
- Removed the known synthetic A2Z reply projection. A vendor response now
  needs inbound provenance: an authenticated Gmail inbound record, an explicit
  vendor-reply event, or a known contact match. The scoped migration removes
  only the historic null-email A2Z synthetic row.

Verification:

- `npm run typecheck --prefix solid-ui`, `npm run test:wedding --prefix
  solid-ui` (1,831 tests), `cargo test
  ui_command_requires_a_usable_model_before_deterministic_planning_routes
  --lib`, `npm run build --prefix solid-ui`, and `git diff --check` passed.
- Released code commit `1e9be62` as a scoped Oracle `homeserver` and `ui`
  build. Both services recreated and are running; `https://omnyid.com/wedding/`
  returned HTTP 200. The private homeserver health endpoint returned its
  expected authentication boundary (401), not an unauthenticated health
  payload. Caddy was neither restarted nor reloaded; its SHA-256 remains
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.

Relay status:

- Re-captured the Cloudflare routing inventory without changing routing. The
  token can list the seven routing rules, disabled catch-all, and four
  destination addresses; routing-status and DNS-export reads still return
  Cloudflare 403/10000. The saved catch-all rollback JSON remains in the
  untracked evidence artifact. No external email was sent and no Cloudflare
  routing/DNS state was changed.
- RELAY-00 remains incomplete until those inventory reads succeed; RELAY-01
  needs independent security/privacy sign-off. RELAY-04 through RELAY-17
  remain gated by the gateway capsule, signed inbound receiver, attachment
  isolation, authenticated read projection, security review, and canary.

## 2026-10-14 - WED-185 documents, vision, and vendor-media repair (Codex)

Changed:

- Wedding Documents now uses the interactive, light vendor comparison cards in
  place of the persisted generic A2UI action layer. Vendor selection is inside
  each card, saves immediately (and can be deselected), and the existing
  approval-gated generated outreach composer remains available there.
- The vendor photo policy now accepts bounded first-party admin listing assets
  under `/wedding/assets/venue-photos/`, in addition to Unsplash and the
  authenticated Google Places proxy. Saved comparison cards can rehydrate a
  missing image from the current directory. No placeholder claims that an image
  is pending.
- Shared AFP send normalisation preserves readable identifiers as metadata while
  supplying the required ULID transport identifiers. This restores account saves
  for Vision notes and comparison selection rather than reporting a false
  connection failure.
- Inspiration validation is now actionable: Yes confirms locally without an
  agent request; Mostly applies 80% evidence weight; Not really opens a
  correction field and debounces an authenticated agent command.

Verification:

- `npm run typecheck --prefix solid-ui`
- `npm run test:wedding --prefix solid-ui` (1,833 passing)
- `cargo test --lib wedding_vendor_search_routes::tests::couple_facing_vendor_photos_allow_approved_public_or_first_party_assets`
- `npm run build --prefix solid-ui` and `git diff --check`

Deployment:

- Released commit `5178725` through a scoped Oracle `homeserver` and `ui`
  build. The `ui` compose service exits successfully after copying its static
  assets to the shared serving volume; the active homeserver is running.
  `https://omnyid.com/wedding/` returned HTTP 200 and the private health route
  returned its expected unauthenticated 401 boundary on port 18080.
- Caddy was not restarted or reloaded. Its SHA-256 remained
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.

Remaining:

- The relay remains disabled. Cloudflare routing status and DNS export reads still
  fail with 403/10000, leaving RELAY-00 incomplete; RELAY-01 remains pending
  independent security/privacy review and RELAY-04 through RELAY-17 stay gated.

## 2026-10-15 - WED-185 workspace interaction repair (Codex)

Changed:

- Thread opening now resolves magic actions to a real thread identifier and keeps
  the authenticated dashboard snapshot as a read-only fallback if the thread fetch
  races empty. Thread-row action controls have larger 2x touch targets.
- Notes now has a node-and-edge SVG knowledge graph, functional AI Groups
  filtering, an explicit rich-text toolbar with heading and font-size controls,
  and working reminder, meeting-follow-up, and task actions saved as AFP records.
- Database shows a usable blank first row, supports direct cell entry and save,
  and exposes existing table browsing plus new-table creation.
- Oracle compose accepts `COMPOSIO_API_KEY_FILE`; the user-provided project key was
  migrated to the existing local file-backed secret and referenced by the local
  Oracle environment. The project credential does not change per-user connection
  ownership.

Verification:

- `npm run test:wedding --prefix solid-ui` (1,833 passing)
- `npm run build --prefix solid-ui` (passing)
- `npm run typecheck --prefix solid-ui` still reports two pre-existing wedding
  component contract errors in `WeddingDecisionFocusCard.tsx` and
  `WeddingWorkspaceDocumentsPanel.tsx`; none originate in these files.
- `git diff --check` passed.

Next:

- Released scoped source commit `247a222` to Oracle. The homeserver was rebuilt
  and is running; the UI asset-sync job completed successfully (its normal exit
  status is 0). `https://omnyid.com/wedding/` returned HTTP 200, the private
  `/healthz` boundary returned expected HTTP 401 without a session, and the
  container can read `/run/secrets/composio_api_key` through
  `COMPOSIO_API_KEY_FILE`.
- Caddy was neither restarted nor reloaded; its SHA-256 remained
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.
- The Composio status API is intentionally authenticated, so provider usability
  still needs to be observed from a signed-in user session; configuration and
  secret-mount evidence are confirmed server-side.

## 2026-10-15 - WED-185 Cloudflare transactional primary and comparison refresh (Codex)

Changed:

- Account verification and reset mail attempts Cloudflare Email Sending first,
  then Resend; it only reaches the legacy mailbox gateway when neither
  platform provider is configured. The Cloudflare token is file-backed and the
  account ID is process-scoped in Oracle.
- Saved comparison cards refresh from the current approved vendor directory
  photo and replace the legacy generic “Start by reviewing” copy with the
  saved per-vendor fit evidence.

Verification and deployment:

- Cloudflare reported both `omnyid.com` and `mail.omnyid.com` sending
  subdomains enabled. Two authorised test sends to `concensure@gmail.com`, one
  from each subdomain address, were accepted and queued by Cloudflare.
- `cargo test gateway::smtp_out::tests --lib` (5 tests), `npm run
  test:wedding --prefix solid-ui` (1,834 tests), `npm run build --prefix
  solid-ui`, and `git diff --check` completed locally. Typecheck still exposes
  the two pre-existing contract errors noted in the earlier handoff.
- Commit `c73ac17` was deployed as scoped `homeserver` and `ui` builds.
  `https://omnyid.com/wedding/` and a first-party venue image both returned
  HTTP 200; the homeserver process has the non-secret Cloudflare account ID and
  a non-empty transactional token. Caddy was not reloaded and its SHA-256
  remains `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.

External state:

- Resend reports `mail.omnyid.com` as `pending`; it remains a fallback until
  DNS verification completes. The Cloudflare sending test demonstrates that
  account mail does not need to wait on that DNS step.

## 2026-10-15 - WED-185 mobile interaction and decision-focus regression repair (Codex)

Changed:

- Restored a safe phone position for the Sprout control and bounded its panel to
  the visible viewport. Persona template installation now recovers and activates a
  matching persona if an earlier create request succeeded server-side but its
  response was lost.
- Decision focus is constrained to three ranked items throughout the projection
  and display layers. The mobile decision deck no longer mixes in vendor cards.
  Wedding-ring decisions now expose an inline jeweller research action and open
  the vendor-search tab with that concrete query; no vendor is selected or sent
  automatically.
- Native text controls now take priority over Magic Pointer keyboard actions,
  preventing Enter in vendor search from executing an armed global action and
  returning to Wedding Home. Mobile Timeline opens in the scaled schedule chart
  and applies its completed filter to that chart.
- Restored the `WeddingArtifactDetailPanel` directory-media prop path, clearing
  the outstanding UI typecheck contract error.

Verification:

- `npm run test:wedding --prefix solid-ui` (1,836 passing)
- `npm run typecheck --prefix solid-ui` (passing)
- `npm run build --prefix solid-ui` (passing)
- `git diff --check` (passing)

Deployment:

- Commit `fdcceea` was deployed as a scoped `ui` asset build. The UI seed job
  completed normally, `https://omnyid.com/workspace/` and
  `https://omnyid.com/wedding/` returned HTTP 200, and the served dynamic
  ResponseQueue bundle contains the ring-research code path.
- Homeserver remained running. Caddy was neither restarted nor reloaded; its
  SHA-256 remains
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.

## 2026-10-15 - WED-185 vendor-search continuity and People mobile layout (Codex)

Changed:

- A user-initiated vendor search now stays in the Vendors workspace through
  launch and result rendering. Automatic background shortlists remain Home
  updates, so they do not interrupt active work.
- Rebuilt the People summary for narrow screens: title, description, and
  status badges stack cleanly; Guests and Seating each have a separate card
  with a full-width bottom CTA. Mobile page padding now clears the persistent
  tab bar and floating Sprout control.

Verification:

- `npm run test:wedding --prefix solid-ui` (1,840 passing)
- `npm run typecheck --prefix solid-ui` (passing)
- `npm run build --prefix solid-ui` (passing)
- `git diff --check` (passing)

Deployment:

- Commit `3521a81` was deployed as a scoped UI asset update. The UI asset-sync
  job exited 0, `https://omnyid.com/workspace/` and
  `https://omnyid.com/wedding/` returned HTTP 200, and the public dynamic
  ResponseQueue bundle contains the updated vendor-search and People-card
  source labels.
- Homeserver remained running. Caddy was neither reloaded nor restarted; its
  SHA-256 remains
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.

## 2026-10-15 - WED-187 personalised recommendation baseline (Codex, in progress)

Changed:

- Created `agent/codex/WED-187` from `agent/codex/WED-185` at `81eef59` in the isolated
  `.worktrees/WED-187` worktree, leaving the active WED-178 checkout untouched.
- Updated the personalised recommendation spec and plan: a valid browser-held Wedding
  Understanding result imports idempotently after account creation **or any later sign-in**;
  venue style facets are first, and photographers follow only after the venue pass stabilises.
- Added a consent-safe sparse Bondi fixture and regression test that locks the current v1
  `38 fit`, `Matches 1/2 of your priorities`, and `Strong on: Location` output.
- Added a 360x740 Playwright deck fixture. Its captured image is at
  `solid-ui/test-results/wedding-personalised-recom-a3d82-ndi-vendor-ranking-baseline/bondi-v1-mobile-baseline.png`.

Verification:

- Focused R0 ranking regression: passing.
- `npm run test:wedding --prefix solid-ui`: 1,852 passing.
- The 360x740 Playwright screenshot test: passing.
- `npm run typecheck --prefix solid-ui`: completed successfully before the build command.
- `npm run test:line-budget --prefix solid-ui`: fails on two pre-existing files not touched by
  WED-187: `WeddingResponseWorkspaceView.tsx` (1,090 lines) and
  `weddingResponseWorkspaceViewState.ts` (1,040 lines), both over the 999-line limit.
- Build and Rust checks require a rerun: the initial frontend build lacked the worktree-local
  TypeScript SDK dependencies; after installing the locked SDK dependencies, concurrent existing
  Cargo work held the shared target lock. No source change was made to address either condition.

Next action:

- Re-run build and Rust checks once the shared Cargo target lock is free, then continue R0 only
  after recording the evidence; R1 and R2 remain dependent on the completed baseline.

## 2026-10-15 - WED-185 mobile Documents and decision-surface refinement (Codex)

Changed:

- Removed redundant mobile wedding/decision chrome and surrounding card shells;
  the focused decision remains the prominent content above the tab bar, while
  desktop controls remain available at larger breakpoints.
- Reworked the phone Documents presentation without changing its actions:
  consistent upload/research/visibility controls, neutral anonymized-sharing
  row, grouped export controls, an accessible search affordance, and clear
  space beneath scrollable content for Sprout.
- Removed technical provider-readiness copy from couple decisions, removed a
  provider-only internal task, made timeline lead-time actions concise, and
  filtered synthetic contribution conditions from the budget surface.

Verification:

- `npm run test:wedding --prefix solid-ui` (1,851 passing)
- `npm run typecheck --prefix solid-ui` (passing)
- `npm run build --prefix solid-ui` (passing; existing chunk-size warnings)
- `git diff --check` (passing)

Deployment:

- Commit `255f99a` was released as a scoped `ui` asset build. The one-shot UI
  job exited 0; `https://omnyid.com/workspace/` and
  `https://omnyid.com/wedding/` returned HTTP 200, and the public dynamic
  ResponseQueue bundle contains the Documents export and upload controls.
- Homeserver remained running. Caddy was neither reloaded nor restarted; its
  SHA-256 remains
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.

## 2026-10-15 - WED-185 stable wedding selection and planning actions (Codex)

Changed:

- Choosing or removing a vendor for follow-up now immediately updates only the
  selection highlight and writes the existing vendor-contact AFP projection in
  the background. It no longer refreshes/remounts the active comparison card.
- Phone schedule labels no longer truncate their left edge. Information tips
  now use a portal position and height clamped to the visible viewport, which
  covers the Timeline and Budget controls.
- Weekly agenda `Confirm status` is now an immediate on-track confirmation;
  it remains visibly confirmed and writes a wedding-responsibility AFP record.
  `Add due date` opens a date picker prefilled from the task's current date or
  a priority/category lead-time estimate, and persists the selected due date
  through that same AFP responsibility projection.
- Budget contribution entry accepts typed names or existing people from its
  list. `Add a contact` creates a local contact, selects it in the form, and
  sends its contact AFP projection without remounting the budget form.

Verification:

- `npm run test:wedding --prefix solid-ui` (1,848 passing)
- `npm run typecheck --prefix solid-ui` (passing)
- `npm run build --prefix solid-ui` (passing)
- `git diff --check` (passing)

Deployment:

- Commit `d8f3541` was released as a scoped `ui` asset build. The UI seed job
  exited 0; `https://omnyid.com/workspace/` and `https://omnyid.com/wedding/`
  returned HTTP 200. The served ResponseQueue bundle contains the quiet
  selection, agenda confirmation, contact-picker, and viewport-clamp paths.
- Homeserver remained running. Caddy was neither reloaded nor restarted; its
  SHA-256 remains
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.

## 2026-10-15 - WED-185 Sprout, outreach, and mobile interaction repair (Codex)

Changed:

- Fixed the Sprout persona loader deadlock: the initial signed-in persona
  request is now allowed to start, so template Install controls become usable.
- Successful vendor sends now display a provider-confirmed, encouraging status.
  Draft text is normalized into editable paragraphs before it is displayed,
  persisted, and sent.
- Live Vendor results now use the same persisted follow-up selection path on
  mobile as saved comparison documents. Phone info tips flip within the
  viewport, and custom image cards drag from the whole image tile.

Verification:

- `npm run test:wedding --prefix solid-ui` (1,845 passing)
- `npm run typecheck --prefix solid-ui` (passing)
- `npm run build --prefix solid-ui` (passing)
- `git diff --check` (passing)

Deployment:

- Commit `798605d` was deployed as a scoped UI asset update. The UI asset-sync
  job exited 0, `https://omnyid.com/workspace/` and
  `https://omnyid.com/wedding/` returned HTTP 200, and the served dynamic
  bundle contains the delivery confirmation and image-card touch-drag code.
- Homeserver remained running. Caddy was neither reloaded nor restarted; its
  SHA-256 remains
  `06c79d0b5178f836a9f82b27a0a0902478ba9eca1f6d285c41390a0ae773cb40`.

## 2026-10-15 - WED-187/188 personalised vendor recommendation baseline and truthful cards (Codex)

Changed:

- Added a consent-safe Bondi Icebergs sparse-evidence fixture, locked the v1 rank output, and
  captured the 360x740 vendor-card regression scenario.
- Implemented conservative v1 anchor rows: missing style keywords remain unconfirmed rather than
  becoming a negative; unresolved rows produce at most three draft-only verification questions.
- Reworked comparison presentation to use count-aware, evidence-backed language; a one-candidate
  decision has no recommendation projection. The mobile card has its semantic primary action,
  Website, Contact, and local-only Not for us controls.
- Added the optional `verify_questions` request field through the client and outreach endpoint.
  Questions are appended to a generated draft only; sending remains approval-gated.
- Updated the planning documents for idempotent next-sign-in quiz import and venue-first facet
  rollout before photographers.

Verification:

- `npm run typecheck` (solid-ui): passed.
- `npm run test:wedding` (solid-ui): 1,855 passed.
- Focused copy/anchor tests: passed.
- `npx playwright test --config playwright.config.ts tests/e2e/wedding-personalised-recommendation-baseline.spec.ts`: passed.
- `npx tsc --noEmit` (typescript-sdk): passed.
- `cargo check`: passed, with the pre-existing unused `user_id` warning in `email_group_routes.rs`.
- `npm run test:line-budget`: blocked by existing oversized `WeddingResponseWorkspaceView.tsx`
  (1,090) and `weddingResponseWorkspaceViewState.ts` (1,040); this change does not add to
  that inherited failure.
- `cargo test wedding_`: did not complete before the shared Cargo artifact lock/compile window;
  rerun it before commit. UI build was not rerun in this pass.

Next:

- Continue with WED-189 by extracting the existing outreach provider ladder into the shared
  wedding ladder, then rerun the remaining build and Rust test gates.

## 2026-10-15 - WED-189 shared wedding LLM ladder (Codex, in progress)

Changed:

- Extracted the wedding provider order, feature-aware model resolution, per-provider timeout,
  response validation fallback, and attempt receipts into `wedding_llm_ladder.rs`.
- Outreach now invokes the shared ladder and retains its deterministic, no-send draft fallback and
  existing durable usage-metering receipt.
- Set the shared Anthropic default and all documented feature overrides to `claude-haiku-5-5`.
  The outreach route is now 835 lines.

Verification:

- `cargo check`: passed; only the existing `email_group_routes.rs` unused-variable warning.
- The authenticated Anthropic `/v1/models` check was attempted but skipped because the local
  checkout has no hosted Anthropic key. No secret or response body was emitted.
- `cargo test --lib wedding_llm_ladder`: 6 passed.
- `cargo test --lib wedding_`: 148 passed.
- `npm run typecheck` (solid-ui): passed.
- `npm run build` (solid-ui): started Vite production transformation but did not return a final
  result within the command window; rerun before release.

Next:

- Obtain a completed UI build and review the provider model id with an operator environment that
  has the hosted Anthropic key before release. Then continue R3.

## 2026-10-15 - WED-190 ranking policy-v2 connection (Codex)

Changed:

- Moved the policy-1 evidence components into `weddingVendorUtilityComponentsState.ts`; the
  ranking orchestrator is 783 lines and continues to own only eligibility, availability, grouping,
  and policy dispatch.
- Added the opt-in policy-2 path, including prior-shrunk fit, effective-cost, coordinate-or-token
  location, quality/sentiment, confidence-aware bounds, and demand-aware availability priors.
- The UI derives the policy version from the disabled-by-default Vite flag for both ranking and
  fingerprinted search receipts. Policy 1 remains byte-stable; the Bondi v2 probe is 42, not 38.

Verification:

- `npm run typecheck` (solid-ui): passed.
- `npm run test:wedding -- --runInBand` (solid-ui): 1,855 passed.
- Focused policy-v2, baseline, and shortlist coordinator tests: passed.
- `git diff --check`: passed.
- `npm run build` began Vite transformation but did not report final completion in the command
  window; it remains a release gate.

Next:

- Continue R4 with the venue-only facet vocabulary. Do not enable policy 2 or deploy it before
  R8/R13 evaluation and release gates.

## 2026-10-15 - WED-191 facet vocabulary foundation (Codex, in progress)

Changed:

- Added shared `wedding_facets.v1` JSON (45 v1 facet ids), a TypeScript whole-word/phrase lookup
  module, and its vocabulary integrity test.
- Added `style_facets` to the Rust catalog. Admin writes now reject an unknown id with both that
  id and the vocabulary version in the error. Docker copies the JSON for Rust's compile-time read.
- The operator attribute editor now renders `style_facets` as a multi-select of couple-facing
  labels instead of an arbitrary comma-separated free-text field.

Verification:

- `node --import ./tests/node-ts-specifier-hooks.mjs --experimental-strip-types --test tests/wedding-facet-vocabulary-state.test.ts`: passed.
- `npm run typecheck` (solid-ui): passed.
- `cargo test --lib wedding_vendor_search_routes::attribute_catalog::tests::style_facets_are_limited_to_the_shared_versioned_vocabulary -- --nocapture`: passed, with the existing unused `user_id` warning.

Remaining:

- Split the oversized Rust catalog test module below its line budget.
- Move experience-model and decision-fit synonym matching onto the vocabulary without changing its
  public test behaviour. R5 must not begin until those R4 contracts are complete.

## 2026-10-15 - WED-191 facet vocabulary completion (Codex)

Changed:

- Split `attribute_catalog` tests into a sibling module, leaving the production catalog at 860
  lines. Its `style_facets` validation still reads the shared vocabulary and rejects unknown ids.
- Replaced the experience model's duplicated synonym regexes with vocabulary facet ids for both
  inspiration traits and decision-fit checks. Existing experience-model behaviour remains covered.

Verification:

- Focused inspiration, decision-selection, and facet-vocabulary tests: 24 passed.
- `npm run typecheck` (solid-ui): passed.
- `cargo test --lib wedding_vendor_search_routes::attribute_catalog -- --nocapture`: 11 passed,
  with the existing unused `user_id` warning.

Next:

- Implement R5 deterministic venue facet derivation, using the new vocabulary and never storing
  rank-time derived facets.

## 2026-10-15 - WED-192 deterministic facet derivation (Codex, in progress)

Changed:

- Added a pure, rank-time venue facet derivation function for setting-class, boolean, tag,
  stored-facet, room, and capacity evidence. Merged facets retain all evidence and their highest
  confidence; it makes no writes.
- Bondi derives waterfront, beach, and views facets without a scale guess. Capacity and room tests
  cover large and intimate scale outcomes.

Verification:

- `tests/wedding-vendor-facet-derivation-state.test.ts`: 3 passed.
- `npm run typecheck` (solid-ui): passed.
- `git diff --check`: passed.

Remaining:

- The requested `oracle-venue-export-2026-10-07-enriched.csv` and sanitised attribute snapshot
  are not present locally, so the target active-venue coverage report cannot be produced yet.

## 2026-10-16 - WED-193 profile and policy-v2 facet integration (Codex, complete)

Changed:

- Added confidence-aware partial matching for related vocabulary facets and stable profile-weight
  ordering, alongside the existing deterministic profile and decisive must-have veto.
- Policy 2 now gives the facet-match component its 0.20 base weight. A mapped top priority shifts
  at most 0.06 from the remaining components, with signed shifts retained on the candidate.
- The ledger now retains one strongest facet row per couple anchor, adds provenance-backed
  location/cost/capacity/quality rows, and drops/counts any unsupported pro or con.

Verification:

- Focused profile, derivation, and policy tests: 12 passed.
- `npm run typecheck` (solid-ui): passed.
- `git diff --check`: passed.

Next:

- Start R7 ledger-driven card rendering. The R5 active-venue coverage report remains blocked on
  the absent sanitised Oracle export; it is a release gate, not a reason to change the ranker.

## 2026-10-16 - WED-194 ledger-driven card checkpoint (Codex, in progress)

Changed:

- Policy-2 anchor rows and outreach questions now come from the reason ledger. Legacy candidates
  still use the existing R1 rows without any changed interpretation.
- Card projections include related facet labels, confidence-gated fit wording, a provenance-backed
  “Worth knowing” line, vocabulary version, optional profile reference, and matching facet tags.
  The A2UI desktop table now renders anchor rows instead of duplicate preference/situation rows.

Verification:

- Focused anchor-row, copy-guard, artifact, and policy tests: 14 passed.
- `npm run typecheck` (solid-ui): passed.
- `git diff --check`: passed.

Remaining:

- Add executable near-miss/widen actions without persisting a changed profile, then run the
  mobile/axe evidence and legacy-artifact regression for R7.

## 2026-10-16 - WED-194 near-miss and widening checkpoint (Codex, in progress)

Changed:

- Added pure near-miss and widen-action state. A widening action clones requirements/profile,
  invokes the deterministic ranker, and returns the new result; it never writes the saved plan or
  profile. Seated-capacity widening switches to cocktail/standing capacity.
- Comparison artifacts and A2UI now carry bounded near misses and serialized widen actions for the
  workspace caller. Optional radius, unknown-price and must-to-strong inputs are represented for
  the matching search/workspace integration.

Verification:

- Focused ledger/card/widen tests: 5 passed.
- `npm run typecheck` (solid-ui): passed.
- Playwright 360x740 sparse-Bondi baseline with axe: passed.
- `git diff --check`: passed.

Remaining:

- Connect serialized widen actions to a workspace rerun callback and add a three-result mobile
  evidence fixture. Do not advertise the serialized action as an already-persisted profile change.

## 2026-10-16 - WED-195 evaluation preparation (Codex, in progress)

Changed:

- Added a JSON-based sanitised-catalog corpus builder that produces 40 ranker-blind cases spanning
  guest count, budget, season, region and priority slices.
- Added independent Markdown judging-sheet rendering for Casper and Iris. It intentionally does
  not include rank order or scores.

Verification:

- Both scripts' `--help` paths execute successfully.
- `git diff --check`: passed.

Remaining:

- Supply the sanitised active catalog, collect the two independent human score sheets, resolve
  flagged disagreements, and generate the machine gate report. The policy-v2 flag stays off until
  that evidence exists.

## 2026-10-16 - WED-196 preference interpreter and confirmation checkpoint (Codex, in progress)

Changed:

- Added authenticated `POST /wedding/preference-profile/interpret` behind the existing shared
  Cerebras -> Mistral -> Anthropic interpreter ladder. The route is 451 lines, rate-limited and
  metered, and returns `{status:"fallback"}` with no facets whenever the ladder is unavailable or
  exhausted.
- Provider output is parsed as JSON and rejects unknown vocabulary ids, anchors that are not
  case-insensitive substrings of submitted input, unknown hard-constraint keys, and an otherwise
  empty result. Facets, trade-offs, readings, and questions are bounded.
- Added deterministic-first client orchestration and material/version cache helpers, immutable
  profile AFP send inputs with successor lineage, profile/version fingerprint inputs, and
  confirmation chips on the intake home and above vendor comparisons. Chips are non-blocking and
  use 44px minimum targets; confirmation creates a user-authority (confidence 1.0) successor.
- Checked `typescript-sdk/src/workflows.ts`: no existing workflow daemon emits
  `wedding_preference_profile`, so no outbound allowlist or output-contract change is needed.

Verification:

- `cargo test --lib wedding_preference_routes -- --nocapture`: 3 passed (existing unused
  `email_group_routes` variable warning only).
- `npm run typecheck` (solid-ui): passed.
- `npm run test:wedding` (solid-ui): 1,874 passed.
- `git diff --check`: passed.

Remaining:

- The authenticated production route needs Oracle runtime verification with the existing hosted
  provider keys; do not copy a hosted key into the local checkout.
- R5 catalog coverage, R7 interactive widen invocation/three-card mobile evidence, R8 real catalog
  scoring, R10–R13, build/CI, and all production release gates remain. Do not enable policy 2 or
  deploy it yet.

## 2026-10-17 - WED-202/203/206/207/209/212 quotation intelligence core (Codex, complete)

Branch/worktree:

- `agent/codex/WED-202`
- `C:\Users\ozans\Desktop\projects\OmnyID-WED-202`
- based on `ac5b529343df6267afb64ece298f235ef5a3eb96`

Changed:

- Added a consent-safe corpus of 12 synthetic documents/24 versions and compatibility baselines
  for existing quote DecisionOS and supersession behaviour.
- Added strict template-neutral Rust/TypeScript contracts, shared JSON schema, and versioned
  generic/venue registries. A shared non-wedding fixture proves both SDKs parse the same wire data.
- Added checked integer calculation, canonicalisation, discounts, minimum spends, tax, optional
  selections, material changes, gap ranking, conservative comparison, and formula traces.
- Added private append-only AFP normalisation/comparison projection and replay that is stable under
  duplicate/shuffled delivery and suppresses stale-version comparisons.
- Added fact-level vendor-context grants and revocations with target, purpose, expiry, scope,
  approval receipt, denylist, deterministic projection, and read-time enforcement.
- Added DecisionOS/A2UI adapters using existing review/clarify/compare patterns and existing A2UI
  primitives. Shared renderers and oversized wedding workspace files were not edited.

Commits in dependency order:

- `d089982` WED-202 establish quotation baseline corpus
- `ce20b32` WED-203 add generic quotation contracts
- `80bac0a` WED-206 add deterministic quotation engine
- `beb4aa9` WED-207 add quotation AFP replay
- `baff67c` WED-212 add vendor context permission boundary
- `e0de345` WED-209 add quotation DecisionOS adapters

Verification:

- targeted `rustfmt --check`: passed for all quotation Rust sources/tests.
- `cargo check`: passed; inherited `email_group_routes.rs` unused-variable warning only.
- focused Rust quotation suite: 31 passed.
- TypeScript SDK typecheck and quotation tests: passed (2 tests).
- Solid UI typecheck, quotation adapter tests (4), and production build: passed.
- fixture secret/email scan, `git diff --check`, and all-new-file 999-line budget: passed.
- repository line-budget check remains red only for inherited
  `WeddingResponseWorkspaceView.tsx` (1141) and `weddingResponseWorkspaceViewState.ts` (1041);
  neither was edited.
- `npm ci` reported 51 dependency audit findings (42 moderate, 7 high, 2 critical) in the existing
  Solid UI dependency graph; no dependency version or lockfile was changed by this work.

Assumptions and remaining integration:

- The dirty WED-187 implementation and human-judge work remains untouched. These commits are
  predominantly new modules/files and can be merged or cherry-picked after WED-187 is completed;
  `.agent/TASKS.yaml`/handoff reconciliation is the expected coordination conflict.
- The specification/task documents remain uncommitted in the dirty WED-187 worktree. Preserve and
  commit them when reconciling the branches.
- The current delivery is the deterministic quotation foundation, AFP/replay, permission boundary,
  and UI projection. Source-service extraction from oversized `ingest_routes.rs`, reuse of the
  existing OCR/PDF adapters, shared-LLM extraction, authenticated routes, review/correction UI,
  clarification send/reply, and booking closure remain later tasks.
- Start those integration tasks only after WED-187 is reconciled because its current uncommitted
  work overlaps `src/server/mod.rs`, `wedding_llm_ladder.rs`, shared wedding UI state, and related
  route files. Do not implement another OCR, mail sender, decision-card foundation, or wedding-only
  quotation store.

## 2026-10-17 - WED-204 shared quotation source bridge (Codex, complete)

Changed:

- Extracted the existing document parser/OCR implementation into
  `src/server/document_ingest_service.rs`; ordinary `/ingest/*` calls delegate to it and the large
  ingest route file is smaller than before.
- Added authenticated `/quotation/sources/prepare`, which can resolve only a message or attachment
  in a thread visible to the current user. It returns a stable metadata receipt and transient parsed
  text without logging the source or copying its body into a ledger payload.
- Added typed capability/source state for client preflight and revision-exact receipt matching.

Verification:

- shared service unit tests: 3 passed.
- inherited missing-PDF-parser selection regression: 1 passed.
- Solid UI type checking and quotation source state tests: 3 passed.
- `cargo check`: passed before the final unused-import cleanup; inherited `email_group_routes.rs`
  unused-variable warning only.

Remaining:

- WED-205 schema-bound shared-ladder extraction is next. The WED-204 route wiring is deliberately
  three small additions in `src/server/mod.rs`, so it can be replayed after the dirty WED-187 work.

## 2026-10-17 - WED-205 schema-bound quotation extraction (Codex, complete)

Changed:

- Added registry-derived, injection-resistant quotation prompts plus strict JSON proposal parsing.
- Added exact-excerpt, locator, type, date, numeric range, currency, unit, and price-basis
  validation. Invalid supported-looking values become unknown and cannot enter calculation as
  confirmed facts.
- Extended the existing Cerebras -> Mistral -> Anthropic ladder with an independent quotation
  feature and zero-temperature entry point while preserving 0.6 for all existing callers.
- Added authenticated `/quotation/normalisation/propose`, privacy-minimised extraction receipts,
  usage metering, fail-closed manual review, and a deterministic structured-submission path.

Verification:

- quotation extraction integration tests: 5 passed.
- shared ladder unit tests: 7 passed.
- quotation normalisation route validation test: 1 passed.
- inherited `email_group_routes.rs` unused-variable warning remains.

Remaining:

- WED-208 review/correction successors, WED-210 clarification, WED-211 closure, and WED-213 release
  gates remain. Durable generic quotation API persistence must bind these proposal receipts to the
  existing AFP normalisation events before a user decision can depend on them.

## 2026-10-17 - WED-208 quotation review successors (Codex, complete)

Changed:

- Added immutable, revision-bound review commands and deterministic successors for confirm,
  correct, unknown, not-applicable, and extraction rejection actions.
- Added a fail-closed gate for unreviewed or uncertain high-materiality facts.
- Added pure client reconciliation/grouping/evidence state plus bounded review card, evidence
  drawer, and escaped-text source preview components. Oversized wedding workspace files remain
  untouched.

Verification:

- quotation review Rust tests: 4 passed.
- quotation review Solid state tests: 3 passed.
- Solid UI type checking: passed.
- inherited `email_group_routes.rs` unused-variable warning remains.

Remaining:

- Persist review commands as AFP events in the generic quotation API when the final route/store
  adapter is added. WED-210 clarification and WED-211 closure may now consume the material gate.

## 2026-10-17 - WED-210 clarification contract checkpoint (Codex, in progress)

Changed:

- Added three-question unanswered-gap draft construction, structured outbound privacy denial,
  exact approval/hash/revision/expiry validation, send idempotency, and provider-receipt replay.
- Added exact-excerpt reply anchoring and deterministic post-reply material-change/total projection.
- Added editable client state, private/E2EE AFP draft and approval inputs, and a bounded accessible
  clarification card. No mail sender was added.

Verification:

- quotation clarification Rust tests: 5 passed.
- quotation clarification Solid state tests: 3 passed.
- Solid UI type checking: passed.
- inherited `email_group_routes.rs` unused-variable warning remains.

Remaining:

- After reconciling WED-187, connect `ClarificationSendDecision::Approved` to the existing generic
  approval/send executor and connect inbound reply matching to `reply_anchors`. Do not mark WED-210
  done until those adapters and their provider-receipt regression are exercised.

## 2026-10-17 - WED-211 closure contract checkpoint (Codex, in progress)

Changed:

- Added an evidence-backed closure transition table, deterministic replay, quote-to-contract change
  gate, deposit cash-flow/fee split, booking-only budget commitment, deadlines, cancellation/refund,
  and supersession.
- Added private AFP transition input, record/approve-act UI state, existing-primitive A2UI projection,
  and an accessible closure card. Every projection explicitly keeps payment execution false.

Verification:

- quotation closure Rust tests: 6 passed.
- quotation closure Solid state tests: 4 passed.
- Solid UI type checking: passed.
- inherited `email_group_routes.rs` unused-variable warning remains.

Remaining:

- After WED-187 reconciliation, add the small wedding budget/timeline adapter that persists the
  generic `BudgetCommitment`. Do not mark WED-211 done until that idempotency integration is tested.

## 2026-10-17 - WED-214 generic quotation persistence API (Codex, complete)

Changed:

- Added authenticated normalisation, review, comparison, and state routes over tenant-private AFP.
- Normalisations require tenant-visible sources and valid supersession lineage. Reviews apply only
  to replay-derived active versions, store a compact audit event, and append the validated successor.
- Comparisons recalculate totals/ranking server-side from active versions and source-linked
  requirements. State reads use the existing deterministic replay and suppress stale comparisons.

Verification:

- quotation route unit test: 1 passed.
- quotation AFP/replay tests: 5 passed after adding the compact review event assertion.
- `cargo check`: passed; inherited `email_group_routes.rs` unused-variable warning only.

Remaining:

- HTTP integration coverage against a temporary Postgres instance is still desirable in CI. The
  route uses the existing authenticated thread lookup and private AFP store rather than a parallel
  quotation table.

## 2026-10-17 - WED-213 readiness and release-control checkpoint (Codex, in progress)

Changed:

- Added fixed fail-closed thresholds, aggregate-only metrics, readiness status, and independent
  feature switches requiring a versioned verified-evidence digest. Defaults remain off.
- Extraction and recommendation routes enforce the controls; source preparation rechecks remote
  URLs with the existing public-HTTP SSRF guard.
- Added a reproducible PowerShell verifier and readiness document. The document intentionally says
  `untested for release`; no flag or deployment was changed.

Verification:

- reproducible verifier: 57 Rust integration tests and 19 Solid tests passed.
- Solid UI type checking, `cargo check`, and `git diff --check`: passed.
- focused shared source service, LLM ladder, and quotation route/prompt unit suites: 15 passed; the
  verifier includes those filters for subsequent runs.
- inherited `email_group_routes.rs` unused-variable warning remains.

Remaining:

- WED-213 remains in progress until hosted shadow metrics, temporary-Postgres tenant tests,
  accessibility/security browser evidence, existing wedding regressions, the WED-210/WED-211
  adapters, and a seven-day allowlisted cohort are complete. Do not set the release gate to verified.

## 2026-10-17 - WED-210 clarification communication adapter (Codex, complete)

Changed:

- Added authenticated `/quotation/clarifications/send`. It reloads tenant-visible persisted draft
  and approval events, checks exact hash/parent/expiry plus active quotation/comparison revisions,
  reserves the idempotency key, and delegates to the existing Gmail transport.
- Added deterministic Gmail Message-ID headers and AFP external-email references so the existing
  inbound gateway matches replies to the original quotation thread. Plain incoming email bodies can
  now be prepared through the shared quotation source/parser path.
- Added reusable Solid persistence/send calls plus editable recipient and subject fields. Any edit
  invalidates prior approval. No parallel sender, reply matcher, parser, or OCR was introduced.
- Delivery-ambiguous attempts remain reserved and fail closed instead of risking a duplicate send;
  explicit provider-receipt reconciliation is the recovery path.

Verification:

- clarification integration tests: 5 passed; quotation route/source/prompt unit tests: 9 passed.
- Gmail transport/threading unit tests: 7 passed; shared source tests: 3 passed.
- quotation Solid suite includes 4 clarification state tests; type checking passed.

## 2026-10-17 - WED-211 wedding closure consumer adapter (Codex, complete)

Changed:

- Added a small wedding adapter that accepts only an evidence-backed `booking_confirmed` generic
  commitment and reuses the existing wedding decision/budget projection. Stable commitment,
  quotation-version, and booking-evidence references are retained.
- Added contract/deposit deadline mapping to existing wedding task/reminder projections. Booking,
  cancellation, refund, and supersession do not leave open deadline tasks; payment execution stays
  false.

Verification:

- 3 focused adapter tests passed, including actual wedding budget aggregation and deadline AFP.
- New files are 408 lines or fewer. The inherited focused line-budget test still fails only for
  `WeddingResponseWorkspaceView.tsx` (1141) and `weddingResponseWorkspaceViewState.ts` (1041);
  neither file was changed.

## 2026-10-17 - WED-213 local readiness follow-up (Codex, still in progress)

Verification:

- Reproducible verifier passed: 57 quotation Rust integration tests, 26 focused Rust unit tests,
  23 Solid tests, Solid type checking, `cargo check`, and `git diff --check`.
- The full existing wedding suite passed (1,874 tests) and the Vite production UI build passed. Its
  existing large-chunk and Tailwind screen-variant warnings remain non-blocking.
- No live provider, deployment, feature enablement, or production-state claim was made. The sole
  compiler warning remains the inherited unused `user_id` in `email_group_routes.rs`.

Remaining:

- Hosted shadow-model metrics, temporary-Postgres tenant HTTP tests, browser accessibility/security
  evidence, a gated live Gmail smoke/reconciliation exercise, and the seven-day allowlisted cohort.
  Keep all quotation feature flags off until that evidence is recorded and hashed.

## 2026-10-17 - WED-213 focused browser evidence (Codex, local checkpoint)

Changed:

- Added a real Solid quotation fixture covering review, escaped source evidence, editable
  clarification approval, send receipt state, and closure/deposit actions.
- Added Playwright checks at 360x740 and 1280x800 for serious/critical Axe violations, horizontal
  overflow, source HTML non-execution, drawer focus return, approval invalidation, receipt state,
  and explicit non-payment copy.
- The browser run exposed a real defect: `QuotationEvidenceDrawer` evaluated its conditional only on
  initial render. It now uses a reactive `Show` boundary, so opening/closing and focus restoration
  work as designed.
- `verify-quotation-readiness.ps1 -IncludeBrowser` reproduces the focused browser evidence without
  making live-provider calls.

Verification:

- Focused Playwright: 2 passed (mobile and desktop); Solid type checking passed before the run.
- Temporary-Postgres HTTP tests could not run locally: `DATABASE_URL` is unset and Docker Desktop's
  engine is unavailable. This is an environment evidence gap, not a code pass/fail claim.
- GitHub Actions was queried read-only. The latest visible `main` CI run is failed at remote SHA
  `509dc31b` (run `23703104075`, 2026-03-29); its Rust job failed before exposing steps and the log
  endpoint now returns HTTP 410. It predates this branch/base, so it is not evidence about these
  commits and no CI/production pass is claimed.
- Reconciliation audit against the still-dirty WED-187 worktree found 48 dirty paths and only six
  exact path overlaps with this branch: the three `.agent/` ledgers, `.gitignore`,
  `src/server/auth.rs`, and `src/server/mod.rs`. The two code overlaps are small and intentional
  (`store_private_app_message` now returns its atomic insert outcome; server route registration was
  added). Once WED-187 is committed, preserve both sides while resolving those files; no dirty
  WED-187 file was modified from this worktree.

## 2026-10-17 - WED-213 Postgres HTTP evidence lane (Codex, local checkpoint)

Changed:

- Restored the missing `tests/api_flows.rs` target expected by the existing Postgres CI job with a
  focused authenticated quotation flow. It covers tenant-private source visibility, cross-tenant
  read/write denial, duplicate normalisation replay, server-derived totals, the default-off
  recommendation gate, and stale review rejection.
- Extended only the test router with the production `/send` and quotation routes; production route
  composition is unchanged.
- Fixed release-blocking AFP mismatches found by the HTTP test: server-generated quotation events
  declared `afp/1.0` and used readable IDs, while the storage boundary requires `afp-v1` and ULIDs.
  They now use the canonical protocol plus deterministic, thread-scoped ULIDs while preserving
  domain identifiers in payloads and references.
- Added the HTTP target to the quotation verifier. The existing `rust-api-flows` CI job supplies its
  disposable `omnyid_test` Postgres URL, so no new service or parallel persistence layer was added.

Verification:

- `cargo test --test api_flows --quiet`: compiled and passed locally with the single database test
  skipped because `TEST_DATABASE_URL` is unset.
- `cargo test --test quotation_afp --quiet`: 5 passed; the focused canonical protocol/ULID helper
  unit test also passed.
- Docker Desktop remains unavailable locally, so the Postgres assertions are executable but not yet
  locally observed. Do not call this hosted evidence verified until the CI job records a pass.

Remaining:

- Run and retain the Postgres CI result, hosted shadow extraction metrics, broader hosted browser and
  security matrix, gated Gmail ambiguity/reconciliation smoke, and seven-day allowlisted cohort.
  All quotation release flags remain off.

## 2026-10-17 - WED-213 Gmail ambiguity reconciliation (Codex, local checkpoint)

Changed:

- A retry with an exact persisted clarification-send reservation now searches the connected Gmail
  sent mailbox by the deterministic RFC Message-ID. Exactly one matching Gmail message supplies the
  provider receipt and is projected through the existing append-only AFP sent event.
- No match remains reserved and returns conflict; multiple/invalid results fail closed. A retry
  reloads the reservation after an insert race and rejects any non-matching reservation payload.
- Recovery audits an already-authorized reservation before current revision/expiry checks, so an
  actual ambiguous delivery can be reconciled later without allowing an expired approval to create
  a new send. The existing Gmail OAuth client and sender remain the only provider integration.

Verification:

- Gmail API unit filter: 8 passed, including zero/one/multiple search-result handling.
- Clarification route unit filter: 4 passed, including exact reservation recovery after expiry and
  rejection of a tampered reservation.
- Quotation clarification integration tests: 5 passed; `cargo check` passed with the inherited
  `email_group_routes.rs` unused-variable warning only.
- The complete quotation verifier also passed: 57 quotation integration tests, the compiled
  API-flow target, 29 focused Rust unit executions, 23 Solid tests, Solid type checking, cargo
  check, and whitespace checks.

Remaining:

- The gated live Gmail smoke must still exercise success, timeout-with-provider-acceptance recovery,
  and true no-delivery conflict against an allowlisted account. No live message was sent here.

## 2026-10-17 - WED-215 quotation vendor-response foundation audit (Codex, DBV-00 complete)

Changed:

- Created clean `agent/codex/WED-215` from exact base
  `052acc73316f864500703cb975f72a77e889ee82` and brought only the two completed WED-215
  planning documents across from dirty WED-187.
- Audited the claim portal, ownership checks, AgentCard/browser keys, mail provider boundary,
  quotation persistence, closure, vendor grants, Gmail reconciliation, and A2UI/DecisionOS
  foundations against source and tests rather than task-ledger claims.
- Recorded that WED-170's enquiry runtime and WED-171's local-first vendor inbox are absent.
  The current vendor page is a partial claim/photo workspace, not a response portal.
- Froze the template-neutral `quotation.vendor_response.v1` payload, AFP kinds/reference
  roles, existing closure states and grant purposes, singular route namespace, A2UI actions,
  and independent fail-closed rollout flags. No new foundational card type is required.
- Added eight synthetic golden scenarios for claimed AFP, secure-link, and email responses,
  quote revision, contract change, booking confirmation, revocation, and replay.
- Recorded the exposed Cloudflare token's 2026-10-17 HTTP 401 / error 1000 result. It remains
  invalid; no token rotation, routing mutation, or live provider call occurred.

Files:

- `Documents/design/wedding planner/wedding-quotation-decision-booking-vendor-portal-spec.md`
- `Documents/design/wedding planner/wedding-quotation-decision-booking-vendor-portal-tasks.md`
- `Documents/verification/quotation-vendor-portal-baseline.md`
- `tests/fixtures/quotation/vendor_response_closure_golden.json`
- `.agent/TASKS.yaml`, `.agent/DECISIONS.md`, `.agent/HANDOFF.md`

Verification:

- Full no-provider quotation verifier passed: 57 Rust integration tests, compiled API-flow
  lane, 29 focused Rust unit executions, `cargo check`, Solid type checking, 23 Solid tests,
  and whitespace checks.
- `TEST_DATABASE_URL` was unset, so the API target is not evidence of real Postgres
  assertions. The inherited `email_group_routes.rs` unused-variable warning remains.
- Fresh-worktree setup required `npm ci` in `solid-ui` and `typescript-sdk`. The Solid audit
  reported inherited dependency advisories; no automatic dependency changes were made.
- All new files remain under 1,000 lines and oversized application/server source files were
  not modified.

Next:

- Implement DBV-01/WED-216 as authenticated decision and closure subroutes using existing
  tenant-private AFP storage and replay. Keep WED-187 isolated until its active work is
  committed and the shared auth/registration overlaps can be reviewed deliberately.

## 2026-10-17 - WED-216 decision and closure persistence checkpoint (Codex, code complete locally)

Changed:

- Added small authenticated `/quotation/decisions` and
  `/quotation/closure-transitions` submodules; the existing route file only registers them.
- Selection reloads the exact active comparison/version/vendor from tenant-private AFP,
  binds explicit user authority and idempotency, stores `quotation_vendor_selected`, and
  starts a separate `selected` closure event. Retry repairs a missing initial closure without
  duplicating the selection.
- Closure reloads active selection/comparison/quote/expected state, checks source-message
  visibility, runs the existing deterministic transition machine, and stores a compact AFP
  successor. Stable retries return the original result; changed payloads under one key fail.
- Extended generic replay with comparison message revisions, historical/active selections,
  closure transitions/snapshots, successor invalidation, divergent-selection diagnostics,
  and thread-local source enforcement. State hides active decision/closure projections while
  the existing closure release flag is off.
- AFP builders use canonical `afp-v1` deterministic ULIDs, equal canonical/typed refs,
  tenant-private E2EE metadata, parent linkage, and `payment_execution: false`.

Verification:

- Updated no-provider verifier passed: 64 Rust quotation integration tests, compiled API
  flow, 29 focused Rust unit executions, `cargo check`, Solid type checking, 23 Solid tests,
  and whitespace checks.
- New focused tests: 7 passed for deterministic selection/closure replay, quote-successor
  invalidation, explicit authority, invalid leaps, invisible evidence, booking commitment,
  and non-payment deposit records; 5 existing quotation AFP tests also pass.
- The Postgres HTTP test now exercises authenticated selection/duplicate replay,
  cross-tenant denial, contract receipt/duplicate replay, and invalid booking leap when CI
  supplies `TEST_DATABASE_URL`. It compiled locally but skipped its database body because
  that variable is unset; WED-216 stays in progress until observed Postgres evidence exists.
- Repo-wide `cargo fmt --all --check` has unrelated pre-existing drift, so only touched Rust
  files were formatted. The inherited email-group unused-variable warning remains.
- New files are at most 291 lines. Oversized source files received registration-only changes.

Next:

- Run the updated API flow against disposable Postgres, then mark WED-216 done if it passes.
- Proceed to DBV-02/WED-217 using the replayed decision/closure fields and existing A2UI
  primitives; do not create a new foundational card.

## 2026-10-17 - WED-217 DecisionOS/A2UI closure integration (Codex, complete)

Changed:

- Added a template-neutral replay projector that produces the existing Decision Card model,
  existing A2UI primitives, a source-linked closure timeline, material contract diffs, and
  the exact server-produced "What the vendor will see" field preview.
- Added one-action closure controls for contract, deposit, booking, and refund recording.
  Each control explains its consequence and the UI always states that OmnyID will not make
  a payment. Booking, cancellation, refund, and supersession use distinct labels and icons.
- Added a client adapter for quotation state, selection, and closure commands. Closure
  commands now send the exact predecessor event revision; the server verifies and stores
  that revision in addition to the comparison revision and expected state.
- Added stale-successor replacement with a refresh-only action and recoverable client errors.
- Added a small wedding template adapter over the generic projection; no wedding-specific
  state entered quotation core and no foundational card or A2UI renderer was added.
- Added isolated mobile/desktop fixtures and tests for keyboard operation, Axe, overflow,
  source navigation, vendor field minimisation, swipe isolation, and stale refresh recovery.
- Extended the canonical quotation verifier to include the new Solid and browser coverage.

Verification:

- `scripts/verify-quotation-readiness.ps1 -IncludeBrowser` passed: 64 quotation Rust
  integration tests, the compiled conditional API-flow target, 29 focused Rust unit
  executions, `cargo check`, 32 Solid tests, Solid type checking, whitespace checks, and
  four Playwright cases at 360px and desktop.
- The complete wedding unit suite passed 1,874 tests and the production Solid build passed.
- The focused line-budget command still fails on pre-existing
  `WeddingResponseWorkspaceView.tsx` (1,141 lines) and
  `weddingResponseWorkspaceViewState.ts` (1,041 lines); neither was modified. Every new file
  is below 500 physical lines.
- The broader nine-case wedding browser run passed five cases, including every new closure
  case, but four unrelated `wedding-contrast.spec.ts` cases fail because their fixture does
  not expose the expected `Check availability` and category controls.
- `TEST_DATABASE_URL` remains unset, so the HTTP test compiled and returned through its
  existing conditional path rather than executing real Postgres assertions. The inherited
  `email_group_routes.rs` unused-variable warning remains.

Next:

- Run WED-216/WED-217 authenticated HTTP coverage against disposable Postgres.
- Continue with DBV-03/WED-218 contract/deposit evidence ingestion and generic template
  projections; keep OCR/PDF work behind the existing shared document-ingest service.

## 2026-10-17 - WED-218 closure evidence and template projections (Codex, complete)

Changed:

- Added a template-neutral closure-evidence validator for contract, deposit request/payment,
  booking confirmation, cancellation, and refund sources. It binds the active selected quotation,
  prepared source/version/content hash, exact excerpts, money, and dates and fails to manual review
  when extraction or conservative support is unavailable.
- Reused the authenticated shared quotation source preparation helper and therefore the existing
  parser/OCR selection. No parser or OCR implementation was added, and parsed text is not stored in
  the new private AFP evidence receipt.
- Added deterministic `quotation_closure_evidence_validated` AFP receipts with equal canonical and
  typed references, E2EE/private metadata, source-version lineage, and no payment execution.
- Hardened `/quotation/closure-transitions`: it now requires a visible validated evidence message
  and derives sources, target support, contract differences, deposit data, fee/refundability, and
  deadlines server-side. Contract review must reuse the received contract evidence and explicitly
  acknowledge material changes.
- Added a generic template deadline adapter with stable task identity and revision-bound successor
  IDs. Wedding projection reuses the existing task contract and archives terminal successors;
  a non-wedding production-hire fixture proves generic consumption. Booking commitment behaviour
  remains unchanged and only activates from evidence-backed `booking_confirmed`.

Verification:

- `scripts/verify-quotation-readiness.ps1` passed: 71 quotation Rust integration tests, the
  conditional API-flow target, 30 focused Rust unit executions, `cargo check`, Solid type checking,
  whitespace checks, and 35 Solid tests.
- The full wedding unit suite passed 1,874 tests and the production Solid build passed.
- `TEST_DATABASE_URL` was unset, so the API target returned through its conditional no-database
  path; real Postgres assertions remain outstanding. The inherited `email_group_routes.rs`
  unused-variable warning remains.
- The line-budget test reports only inherited
  `WeddingResponseWorkspaceView.tsx` (1,141 lines) and
  `weddingResponseWorkspaceViewState.ts` (1,041 lines); neither was modified. New files are 437,
  235, 53, 327, and 49 physical lines.
- Release flags remain off. No provider, payment, legal, deployment, Cloudflare, or Oracle action
  occurred.

Next:

- Run the authenticated WED-216/WED-218 HTTP flow against disposable Postgres when
  `TEST_DATABASE_URL` is available.
- Begin DBV-04/WED-219 response-capability and least-privilege vendor-context hardening from this
  commit; do not enable closure or vendor-response release flags yet.

## 2026-10-17 - WED-219 response capability security-model checkpoint (Codex, in progress)

Changed:

- Extended generic vendor-context grants with exact quotation version, response recipient,
  optional target Agent ID, allowed questions/actions, not-before, and approved projection
  fingerprint. Canonical delivered bytes must reproduce that approved fingerprint.
- Added authoritative shareable-field classes in addition to the existing key denylist, so
  prohibited competitor, score, private-note, hidden-preference, full-plan, and unapproved fields
  cannot be projected through a tampered fact id.
- Added a 570-line generic response-capability engine: 256-bit raw secrets returned once,
  HMAC-only records, exact access/authority checks, generic unavailable errors, short-lived strict
  transaction cookies, CSRF and one-time nonce verification, consume/revoke/rotate lifecycle,
  content-free audit events, and token-prefix/IP-hash/vendor/thread rate-limit decisions.
- Added migration 0112 for response capabilities, transaction sessions, content-free audit, and
  keyed rate counters. It is deliberately separate from `auth_magic_links`; session rows enforce
  `account_access = FALSE` and no table has a raw-token column.
- Corrected vendor-context grant/revocation AFP message ids to deterministic AFP-valid ULIDs.

Verification:

- Six `quotation_vendor_context` tests and six `quotation_response_capability` tests pass.
- The canonical verifier passes 77 Rust integration tests, the conditional API-flow target, 30
  focused Rust unit executions, `cargo check`, Solid type checking, whitespace checks, and 35
  Solid tests. The embedded migration-catalog test also passes. The inherited email-group
  unused-variable warning remains.
- New files are 570, 316, and 72 physical lines, below the 999-line limit. Release flags remain
  off and no route, provider, database, deployment, Cloudflare, or Oracle mutation occurred.

Remaining:

- Add small persistence methods outside oversized `db.rs`, then authenticated issue/revoke/rotate
  and public exchange/consume routes behind a new independent fail-closed feature flag.
- Enforce real token-prefix/IP-hash/vendor/thread counters, claim/grant/quotation/closure state on
  every exchange and consume, and generic not-found responses.
- Add disposable-Postgres cross-tenant/vendor/thread tests and log capture proving secrets and
  projection fields never enter logs. Complete the independent security checklist before enabling
  any response-capability flag.

## 2026-10-18 - WED-219 persisted response-capability boundary (Codex, review)

Changed:

- Added isolated capability persistence with atomic issue, exchange, session creation, consume,
  revoke, rotate, expiry audit, single-use replay checks, and keyed four-dimensional rate counters.
- Added authenticated issue/revoke/rotate routes and public exchange/consume routes behind
  `OMNYID_QUOTATION_VENDOR_RESPONSE_CAPABILITIES_ENABLED`, the existing quotation release gate,
  a base64url 256-bit pepper, and the configured server signing key.
- Capability authority now reloads the owner's AFP thread on every transition, verifies the signed
  human approval receipt and exact grant parent, and rechecks vendor, active quote/version,
  projection, action/question scopes, revocation, disputed claim, and terminal closure.
- Private grant AFP now includes the exact canonical approved projection. Validation recomputes the
  fingerprint, enforces approved fact subsets and prohibited field classes/keys, and bounds grant
  duration, list sizes, field values, and total projection bytes.
- Added explicit `expired` lifecycle/audit constraints in additive migration 0113, leaving the
  already-committed 0112 migration stable.
- Added a conditional Postgres HTTP matrix and always-run log-boundary guard, plus
  `Documents/security/quotation-response-capability-security-review.md` for independent sign-off.

Verification:

- `scripts/verify-quotation-readiness.ps1` passed: 82 quotation Rust integration tests, the
  conditional API-flow targets, 30 focused Rust units, `cargo check`, Solid type checking,
  whitespace checks, and 35 Solid tests.
- `TEST_DATABASE_URL` was unset. The new API target compiled and its always-run logging assertion
  passed, but its database-backed test returned through the explicit conditional skip; do not count
  that as real Postgres evidence.
- The only compiler warning is the inherited unused `user_id` in `email_group_routes.rs`.
- New files are 772 physical lines or fewer. Only registration lines touched oversized `src/db.rs` and
  `src/server/mod.rs`. Release flags remain off; no external provider, Cloudflare, Oracle, payment,
  or deployment action occurred.
- The latest visible GitHub CI runs are stale failures on unrelated `main` SHAs from March 2026;
  this local branch has not been pushed and has no machine-owned CI result yet.

Remaining:

- Run `cargo test --test quotation_response_capability_api` with `TEST_DATABASE_URL` pointing to
  disposable local `omnyid_test`, then record the evidence.
- Obtain independent security sign-off in the checklist. Keep the capability flag disabled until
  both gates pass.
- After review, start WED-220/DBV-05 canonical vendor response contracts. Do not make the WED-219
  consume endpoint accept response payloads; that belongs to the next canonical contract.

## 2026-10-18 - WED-220 canonical vendor response contract (Codex, complete)

Changed:

- Added `quotation.vendor_response.v1` in Rust, JSON Schema, and TypeScript/Zod with strict unknown
  field rejection and bounded question answers, typed commercial facts, availability, explanation,
  sources, attachments, channel receipts, lifecycle, and vendor attestation.
- Added channel-independent canonicalisation and SHA-256 fingerprinting. Content-hash-backed source
  identity, timestamps, media types, hash casing, and collection ordering normalise across AFP,
  secure-link, upload, and email transport differences.
- Added duplicate/successor reconciliation. Material successors require exact parent linkage and
  cannot change vendor, thread, grant, quotation/version, or projection fingerprint.
- Added a generic review proposal projection. Exact-evidence facts may remain confirmed; proposed
  vendor facts enter review as unknown and always require user review.
- Added an explicit response lifecycle with no acceptance, booking, payment, or wedding-plan state.
- Added one shared non-wedding fixture with the same hard-coded fingerprint in Rust and TypeScript.

Verification:

- Expanded `scripts/verify-quotation-readiness.ps1` passed: 90 Rust integration tests, conditional
  API-flow targets, 30 focused Rust units, `cargo check`, 6 TypeScript SDK tests and typecheck/build,
  Solid typecheck, whitespace checks, and 35 Solid tests.
- The inherited `email_group_routes.rs` unused-variable warning remains. `TEST_DATABASE_URL` remains
  unset, so the WED-219 database-backed HTTP matrix is still a documented review gate.
- New files are at most 720 physical lines; the extended TypeScript quotation module is 468 lines.
- No provider, database, release flag, deployment, Cloudflare, Oracle, payment, or legal action was
  performed.

Next:

- Begin WED-221/DBV-06 claimed-vendor AFP response transport using this contract and the existing
  claim/AgentCard/encrypted enquiry foundations. Do not create a wedding-specific response schema.
- Keep WED-219 capability rollout disabled until disposable-Postgres evidence and independent
  security sign-off are recorded.

## 2026-10-18 - WED-221 claimed-vendor AFP response flow (Codex, review)

Changed:

- Added strict claimed-vendor AFP response validation, migration 0114 ciphertext routing/receipt
  sidecars, isolated persistence, and authenticated invitation/inbox/submission routes.
- Authority is re-evaluated against active claim ownership, deterministic linked Agent ID, current
  verified AgentCard capability/key, owner-approved grant, active quotation version, exact
  projection, expiry, revocation, and non-terminal closure.
- Added local browser X25519/XChaCha20-Poly1305 decrypt/encrypt and Ed25519 AFP signing using the
  existing non-extractable vendor keys. Plaintext commercial response content does not enter the
  API or `wedding_enquiry_envelopes`.
- Added deterministic durable accepted/rejected receipts, exact retry behavior, material-fingerprint
  dedupe, nonce/response/request collision handling, and key-rotation invalidation.
- Added the minimal own-transaction vendor panel to the existing claim portal. Approved questions
  have an A2UI-compatible projection; competitor/private fields, booking, payment, and account-wide
  inbox behavior are absent.

Verification:

- `scripts/verify-quotation-readiness.ps1` passed: 97 Rust integration tests, conditional API-flow
  targets, 30 focused Rust library tests, `cargo check`, six TypeScript SDK tests plus typecheck/build,
  and 38 Solid tests.
- `npx playwright test tests/e2e/quotation-vendor-response.spec.ts --config playwright.config.ts`
  passed at 360px and 1280px with accessibility and overflow assertions.
- All 32 migration-catalog integrity tests and the Solid production build passed; the build retains
  its inherited large-chunk advisory.
- The inherited `email_group_routes.rs` unused-variable warning remains. `TEST_DATABASE_URL` is
  unset, so the disposable-Postgres persistence body compiled but skipped.
- Every new file is at most 574 physical lines. The independent claimed-vendor response flag remains
  off; no provider, payment, Cloudflare, Oracle, deployment, or production configuration changed.

Remaining:

- Run `cargo test --test quotation_vendor_response_api` against disposable local `omnyid_test` and
  record the real-Postgres evidence.
- Obtain independent security review for claim/key rotation, ciphertext/AAD, replay, IDOR, and
  durable rejected-receipt behavior. Do not enable
  `OMNYID_QUOTATION_CLAIMED_VENDOR_RESPONSES_ENABLED` before both gates pass.
- After review, start WED-222/DBV-07 using the existing scoped response-capability session and this
  canonical response/receipt contract; do not broaden the claimed account into a general CRM.
## 2026-10-18 - WED-225 quotation closure and vendor portal readiness (Codex, blocked)

Changed:

- Added a 484-line template-neutral end-to-end target for all seven DBV scenarios: stale decision,
  changed contract, claimed AFP response, secure link, ordinary email response, booking/refund, and
  permission minimisation. It exercises deterministic shuffled/duplicate replay and preserves AFP
  history without granting vendor responses booking or payment authority.
- Replaced free-form quotation metric labels with closed enums. Aggregate counts and bounded
  latency answer the four investment questions without raw IDs, content, tokens, email addresses,
  URLs, or commercial values. Existing WED-213 accuracy/safety thresholds are unchanged.
- Extended the portal browser test with URL/storage/cache residue and vendor-controlled XSS checks.
  Added a reproducible fail-closed readiness script, commit-bound external sign-off contract,
  scoped line-budget check, artifact digest, and evidence index.

Verification:

- `scripts/verify-quotation-vendor-portal-readiness.ps1` completed with local checks passing and
  readiness `blocked`; artifact digest is
  `d1365f92c1f4717250141313a1d34619b4a3d57fba8eb408f8a9ebba61b857cf`.
- Passed 106 Rust quotation integration tests (including seven scenario tests), the conditional API
  flow, 31 quotation units, shared ingest/Gmail/MIME/federation/LLM checks, `cargo check`, six SDK
  tests plus typecheck/build, 44 Solid tests plus typecheck, 11 Playwright cases, the real one-test
  migration-catalog filter, 1,874 wedding tests, the Solid production build, and WED-225 line
  budgets. The build retains its inherited large-chunk advisory and Rust retains the inherited
  unused `email_group_routes.rs` variable warning.
- The first consolidated attempts revealed and then fixed a PowerShell SHA compatibility issue,
  named-parameter forwarding bug, zero-test migration filter, and coordination-ledger false line
  budget failure. Only the final blocked manifest above is valid evidence.

Blocked:

- `TEST_DATABASE_URL` and `CLAMD_HOST` are unset. No current-commit accuracy corpus, clean clamd,
  allowlisted provider, independent security/privacy or hosted accessibility review, couple/vendor
  usability, human booking/permission wording, hosted shadow, or cohort sign-off was supplied.
- Every quotation/relay flag remains false or unset. No provider, Oracle, Cloudflare, email,
  payment, release, or deployment mutation occurred. Do not begin WED-226 dark deployment until
  WED-225 is independently reviewed; do not enable any feature until the manifest is verified.

Next:

- Run the conditional HTTP suites with disposable Postgres and a clean clamd service, collect the
  exact external sign-off JSON records described in the readiness document, and rerun the verifier.
  After independent review, WED-226 may deploy the same artifact dark with every flag off and prove
  runtime SHA/configuration before any separately authorised canary.
## 2026-10-18 - WED-230 planning-intelligence contract freeze (Codex, review)

Changed:

- Added six strict, versioned, template-neutral Rust/JSON Schema/TypeScript contracts for planning
  constraints, evaluations, cost trade-offs, milestone dependencies, vendor changes, and decision
  interventions. They carry bounded typed values, source anchors, privacy, authority, and lineage.
- Added one shared home-renovation fixture corpus with valid/invalid cases and canonical SHA-256
  fingerprints. Rust and TypeScript parse the same cases and fail closed on unknown fields,
  unsupported versions, unsafe authority/privacy claims, and incomplete evidence.
- Added default-off feature configuration for each future planning-intelligence slice and exported
  the TypeScript boundary through both the package root and `afp-ts/planning-intelligence`.

Verification:

- `cargo test --lib planning_intelligence -- --nocapture` passed 5 tests; `cargo check` passed.
- SDK typecheck and clean build passed; the focused fixture and package export run passed 48 tests.
- `git diff --check` passed before coordination updates. Every new source/schema/fixture file is at
  most 446 lines; no existing oversized production source grew. The inherited unused `user_id`
  warning in `email_group_routes.rs` remains.

Unresolved / next:

- Review WED-230, then implement WED-231 as an authenticated, plan-private, append-only constraint
  ledger and deterministic projector over this frozen contract. Preserve exact anchors and observed
  times, reject forged authority/privacy and cross-tenant reads, and cover retry/replay in real
  Postgres where applicable.
- WED-225/WED-226 remain review-gated. Do not resume quote normalisation or week 3-6 closure work,
  deploy, or enable quotation/vendor-mail/relay/ranking-policy-V2 flags until the requested human
  judge evidence and the existing rollout criteria are supplied.
## 2026-10-18 - WED-231 append-only constraint ledger (Codex, review)

Changed:

- Reused tenant-private AFP storage for strict planning-constraint envelopes with deterministic
  fingerprint-derived message IDs. Added order-independent projection of active, superseded, and
  removed history, including fork/cycle/divergent-identity rejection and successor tombstones.
- Added default-off authenticated list/append routes. They project only the owner's private table,
  bind the exact source message/version/excerpt, enforce closed proposal/user-confirm/remove
  authority, require couple-private pseudonymous person references, and preserve observed time.
- Added transaction-scoped PostgreSQL advisory locking around read-project-write so concurrent
  appends cannot create two accepted successors. No table, migration, wedding-only store, or
  history backfill was added.

Verification:

- Ten planning-intelligence unit tests and the focused route unit test passed; cargo check passed.
- The disposable-Postgres HTTP test passed against 127.0.0.1:55432/omnyid_test, covering the
  disabled flag, auth, tenant denial, retry, source binding, successor, authority forgery, removal,
  and evidence persistence. The isolated clamd endpoint at 127.0.0.1:33310 remained healthy.
- Solid typecheck, all 1,887 wedding tests, and the production build passed. The inherited Vite
  chunk-size advisory and Rust unused user_id warning remain.
- Every new file is at most 384 lines, src/server/mod.rs is line-neutral, and git diff --check
  passes.

Unresolved / next:

- Review commits 200bbac (WED-230) and the WED-231 commit, then continue with WED-232 bounded,
  confirmable remark capture over this ledger. Keep extracted/imported facts proposed until user
  confirmation and reuse the existing metered LLM/OCR paths rather than adding a new OCR service.
- WED-225/WED-226 remain blocked for human-judge and other rollout evidence. Quote normalisation,
  week 3-6 closure/vendor work, Oracle deployment, vendor mail, relay, and ranking-policy V2 remain
  untouched and disabled.

## 2026-10-19 - WED-241 mobile-first wedding home refresh (Codex, review)

Changed:

- Applied the approved Gen-Z direction to the current wedding home: a combined vendor-search field,
  one-tap horizontally scrolling category chips, task-derived progress ring, dark countdown hero,
  number-first budget/guest/seating/vendor tiles, standard status pills, and warmer decision cards.
- Added a wedding-specific copy boundary so protocol/backend/search diagnostics and machine planning
  labels do not leak into notices, tooltips, or wedding decision-card text.
- Preserved the existing five-item fixed mobile navigation and its keyboard avoidance. No routing,
  AFP, A2UI, provider, quotation, release flag, or deployment behavior changed.
- Hardened older vendor-card rendering for absent evidence/room arrays and made compact Website and
  Contact controls meet 44px touch-target requirements.

Verification:

- Solid typecheck, all 1,892 wedding tests, the focused 999-line guard, and the production build
  passed. The inherited Vite large-chunk advisory remains.
- The new home Playwright fixture passed at 320x720, 390x844, and 1280x800 with no horizontal
  overflow, five mobile tabs, technical-copy exclusion, and no serious/critical Axe result.
- The personalised vendor-comparison suite passed at 320/360/1280, and the existing contrast/touch
  target suite passed at 360/1280 after its stale fixture was aligned with the current card shape.
- Every new source/test file is at most 133 lines. The inherited 1,108-line workspace view and
  1,041-line state builder are unchanged and now have exact no-growth caps.

Next:

- Review WED-241, then continue WED-232 from `ideal-agent-gap-implementation-tasks.md`: bounded,
  confirmable remark capture into the WED-231 private constraint ledger, reusing current metered LLM
  and OCR paths. Keep machine/import extraction proposed until explicit user confirmation.
- WED-225/WED-226 and quotation/week-3-to-6 work remain review-gated. Do not deploy or enable
  quotation, relay, vendor-mail, ranking-policy-V2, or planning-intelligence flags.

## 2026-10-19 - WED-232 confirmable planning-remark capture (Codex, review)

Changed:

- Added a reusable deterministic-first capture core over the frozen planning constraint contract.
  Supported operational remarks map to closed typed values with exact source anchors; ambiguous,
  injection-shaped, sensitive-only, or unknown content creates no typed record.
- Added an authenticated `/planning/constraints/capture` route. It validates the exact owned AFP
  source/version, falls back to the current metered wedding LLM ladder only after deterministic
  no-match, emits user-safe A2UI state, and never returns provider/model/attempt details.
- Added a build-flagged wedding home/intake card. It saves the remark privately, clearly separates
  must-haves from preferences, and uses the WED-231 append route only after an explicit tap. The
  existing five-tab mobile menu and all current workspace contracts remain intact.

Verification:

- `cargo check`, 17 planning-intelligence library tests, the focused capture/LLM/metering route
  tests, the existing disposable-Postgres ledger API test, and the new disposable-Postgres capture
  API test passed. The latter covers flags-off, tenant isolation, sensitive-anchor removal,
  ambiguity, hard proposal state, confirmation, and deterministic retry.
- Solid typecheck, line-budget checks, all 1,896 wedding tests, and the production build passed.
  The focused Playwright confirmation flow passed at 320x720 and 390x844 without horizontal
  overflow or serious/critical Axe findings. The inherited Vite chunk advisory and Rust unused
  `email_group_routes.rs` variable warning remain.
- New files are at most 852 lines. The inherited 1,108-line workspace view and 1,041-line state
  builder are unchanged. Disposable Postgres used 127.0.0.1:55432/omnyid_test and the healthy
  ClamAV test endpoint remained at 127.0.0.1:33310; credentials were not printed or persisted.

Unresolved / next:

- Review WED-232, then implement WED-233 decision-time constraint evaluation from the frozen plan.
  Keep unknown vendor/candidate evidence unknown, keep conflict checks pure, and reuse existing
  Decision Cards/A2UI instead of introducing a parallel recommendation surface.
- Enable the capture UI only with `VITE_PLANNING_CONSTRAINT_CAPTURE_ENABLED` and the backend only
  with both `OMNYID_PLANNING_CONSTRAINT_LEDGER_ENABLED` and
  `OMNYID_PLANNING_CONSTRAINT_CAPTURE_ENABLED`; all remain off. No Oracle deployment ran.
- WED-225/WED-226 quotation and week-3-to-6 work remain paused for the user's human-judge review.
  Vendor mail, relay, ranking-policy-V2, and all release flags remain disabled.

## 2026-10-19 - WED-233 revision-bound evaluator checkpoint (Codex, in progress)

Changed:

- Added a pure evaluator for active confirmed constraints and immutable candidate evidence
  snapshots. Explicit evidence can satisfy or conflict; missing, mismatched, or contradictory
  evidence remains unknown. Evaluation identity and currency bind to the candidate revision.
- Added privacy-safe presentation state: private person constraints produce aggregate requirement
  counts without names or source text. Added `constraint_conflict` to the current wedding
  recommendation domain with source-facing evidence and no parallel card system.

Verification:

- `cargo check` and eight focused evaluator tests pass, covering centrepiece height, step-free
  absence, venue travel, unknown and contradictory evidence, deterministic ordering, private
  aggregates, stale revisions, and superseded history.
- Eight focused recommendation tests, all 1,898 wedding tests, Solid typecheck, both line-budget
  checks, and the production build pass. The presentation adapter replaces technical transport copy
  with plain planning language. New Rust files remain below 300 lines. No feature flag was enabled
  and no provider/deployment action ran.

Unresolved / next:

- WED-233 remains in progress. Add the directory-evidence projector and a default-off workspace API
  adapter that feeds these records into the existing recommendation state; do not introduce a
  parallel card system.
- Do not place private constraint excerpts in metrics or vendor context. Keep stale revisions
  visible only as history and unknown evidence unknown. Quotation/week-3-to-6 work remains paused
  for human-judge review; ranking-policy-V2 and all release flags remain disabled.

## 2026-10-19 - WED-233 private quotation evaluation route checkpoint (Codex, in progress)

Changed:

- Added a deterministic quotation projector and authenticated
  `POST /planning/constraint-evaluations` route. It binds active constraints to the exact active
  quotation revision and immutable comparison message in the owner's private AFP thread.
- The route accepts no browser-provided facts. Stored hard conflicts are decisive; missing, unknown,
  soft, and unmeasured numeric evidence stays unknown. Response presentation excludes source
  excerpts and private vendor context. Both ledger and evaluation flags are required.

Verification:

- `cargo check` passes. All 27 planning-intelligence unit tests pass.
- Disposable PostgreSQL at `127.0.0.1:55432/omnyid_test` passes the existing ledger and capture API
  suites plus the new evaluation API suite (default-off, tenant isolation, active revision,
  conflict projection, privacy-safe output). Credentials were neither printed nor persisted.
- Configured ClamAV at `127.0.0.1:33310` passes the bounded clean INSTREAM test. New files are 374,
  179, and 282 lines; no large file was expanded with a new block.

Unresolved / next:

- WED-233 remains in progress for directory-revision evidence and the default-off frontend API
  adapter into the existing recommendation/Decision Card state. Keep the evaluation flag off.
- Quote normalization/week-3-to-6 work remains paused for human-judge review. Ranking-policy-V2,
  vendor mail, relay, provider, and deployment flags remain disabled; no Oracle deployment ran.

## 2026-10-19 - WED-233 directory evaluation and workspace adapter (Codex, review)

Changed:

- Added a generic directory evidence projector with fingerprinted material/freshness revisions.
  Only exact known service booleans, positive style tags, service area and category are decisive;
  missing, estimated, expired, unsupported or semantically wider evidence remains unknown.
- Added authenticated `POST /planning/directory-constraint-evaluations`, scoped to the owner's
  private constraint thread and an active exact vendor ID. No vendor name, source URL, note or
  private source excerpt enters the response.
- Added a default-off frontend adapter for quotation/directory evaluation responses and passed
  validated revision-bound results into the existing wedding presentation recommendation cards.

Verification:

- `cargo check`, all 31 planning-intelligence tests, the ledger/capture/quotation-evaluation/
  directory-evaluation disposable-Postgres API suites, and configured ClamAV test pass.
- Twenty focused frontend tests, all 1,899 wedding tests, Solid typecheck, line budgets and the
  production build pass. The inherited Rust unused-parameter and Vite chunk advisories remain.
- New files are 426, 157, 281, 126 and 94 lines. Credentials were not printed or persisted. No
  rollout flag, provider, Oracle deployment, policy V2, vendor mail or quote release state changed.

Next:

- Independently review WED-233. Keep `OMNYID_PLANNING_EVALUATION_ENABLED` and
  `VITE_PLANNING_CONSTRAINT_EVALUATION_ENABLED` off until review and release evidence permit them.
- Continue with WED-234 approval-safe conflict interventions over these immutable evaluations.
  Quote-normalisation/week-3-to-6 tasks remain paused for the user's human-judge review.

## 2026-10-19 - WED-234 approval-safe intervention core (Codex, in progress)

Changed:

- Added a deterministic conflict intervention projector over confirmed WED-233 quotation conflicts.
  It emits four bounded choices through the frozen DecisionIntervention contract and prepares the
  existing quotation ClarificationDraft rather than introducing a new mail/send contract.
- The couple projection retains the exact remembered statement and a current evidence label. The
  vendor draft includes only a closed requirement kind and bounded question, with no person ID,
  private excerpt or conflict-evidence text.
- Currentness binds the constraint, evaluation, quotation, comparison, optional grant and draft
  hash. Any material successor or draft change invalidates the prepared action.

Verification:

- Six focused intervention tests pass, including private-text exclusion, deterministic output,
  stale revision/hash rejection and proof that the existing clarification authoriser refuses to
  send without a separate approval receipt. `cargo check` passes with the inherited unused
  `email_group_routes.rs` parameter warning. Scoped rustfmt and `git diff --check` pass; a global
  rustfmt check continues to report unrelated legacy formatting drift and was not applied.

Next:

- Persist explicit option selection as an append-only tenant-private decision event, then expose a
  default-off authenticated adapter and existing Decision Card/A2UI presentation. Do not mutate
  constraints or hide quotation/comparison history.
- Keep all planning, quotation, vendor-mail, relay and ranking-policy-V2 flags off. Human-judge
  gated quotation/week-3-to-6 tasks remain paused and no Oracle/provider action has run.

## 2026-10-19 - WED-234 intervention persistence and presentation (Codex, review)

Changed:

- Added default-off authenticated prepare/select endpoints. Preparation replays the owner's current
  constraint, quotation and comparison state; no browser evaluation is accepted. An optional grant
  must be an active owned grant for the exact vendor, quotation revision, question and answer action.
- Split legacy comparison ID from the immutable comparison message revision. Both are bound through
  intervention identity, clarification context and selection decisions, while the existing sender
  continues to receive its expected logical comparison ID.
- Added append-only private AFP intervention decisions with deterministic ULID retries, advisory
  serialization, content fingerprints and stale/divergent rejection. Constraint, quotation and
  comparison history is never edited or hidden.
- Selecting ask-vendor persists the canonical quotation clarification-draft event before recording
  the decision. It still requires the existing separate approval receipt and provider-confirmed
  send flow. The vendor draft contains only a closed requirement label and bounded question.
- Added a fail-closed frontend adapter behind `VITE_PLANNING_CONSTRAINT_INTERVENTION_ENABLED`, with
  safe error/copy mapping and projections into the existing Decision Card and A2UI nodes. No new
  card renderer was introduced.

Verification:

- Real disposable Postgres at `127.0.0.1:55432/omnyid_test` passes the intervention API flow for
  flags-off, cross-tenant denial, deterministic preparation, private-text exclusion, first append,
  exact replay, persisted clarification draft and divergent retry conflict. Credentials were not
  printed or persisted.
- `cargo check`, 40 planning-intelligence tests, 5 quotation clarification tests, Solid typecheck,
  8 focused evaluation/intervention tests, all 1,899 wedding tests, line budgets and the production
  build pass. New files are at most 397 lines and all source files remain below the applicable line
  budget. Only the inherited unused Rust parameter and Vite chunk-size advisories remain.

Next:

- Independently review WED-234. Keep `OMNYID_PLANNING_INTERVENTIONS_ENABLED` and
  `VITE_PLANNING_CONSTRAINT_INTERVENTION_ENABLED` off until review and release evidence permit them.
- Proceed to WED-235 priority-weighted cost trade-offs from the committed WED-234 boundary. Keep
  quotation-normalisation/week-3-to-6 work paused for the user's human-judge review; do not enable
  ranking-policy-V2, vendor mail, relay, provider or Oracle deployment flags.

## 2026-10-19 - WED-235 priority-weighted continuous budget advice (Codex, review)

Changed:

- Added a template-neutral, currency-safe cost-advice projector. It binds the active candidate,
  latest budget evidence, confirmed category-priority constraints and all cost source revisions.
  Exact, ranged and unknown cost remain distinct; checked arithmetic fails closed.
- Added default-off authenticated prepare/acknowledge routes. Candidate cost is re-derived from the
  active normalised-quotation comparison and budget state from the latest strict tenant-private AFP
  cost-evidence message. Browser requests contain references rather than editable cost figures.
- Added deterministic append-only acknowledgements for over-budget choices. They do not select,
  allocate, book, pay or contact a vendor, and any bound revision successor prevents advancement.
- Added existing Decision Card and A2UI projections with plain-language forecasts, evidenced
  lower-priority offsets and bounded unknowns. Added only unlabelled accepted/corrected counters;
  no amount, category, identity or user text enters metrics.

Verification:

- Real disposable PostgreSQL at `127.0.0.1:55432/omnyid_test` passed flags-off, tenant isolation,
  source-derived quote cost, current budget evidence, append, exact retry and stale-budget cases.
  Credentials were derived in-process and were not printed or persisted.
- `cargo check`, 52 planning-intelligence tests and the focused metrics test passed. Solid typecheck,
  five focused cost-advice tests, all 1,899 wedding tests, both line-budget checks and the production
  build passed. New files are at most 570 lines; the 45,696-line server module stayed line-neutral.
  Only the inherited Rust unused-parameter and Vite large-chunk advisories remain.

Next:

- Independently review WED-235. Keep `OMNYID_PLANNING_COST_TRADEOFFS_ENABLED` and
  `VITE_PLANNING_COST_TRADEOFFS_ENABLED` off until review and release evidence permit them. A later
  wedding adapter may emit the strict AFP cost-evidence snapshot when the current budget projection
  is saved; do not infer figures from display strings.
- Continue WED-236 milestone dependencies from the reviewed WED-235 boundary. Quotation/week-3-to-6
  work remains paused for the user's human-judge review. Ranking-policy-V2, vendor mail, relay,
  provider and Oracle deployment flags remain disabled; no deployment ran.

## 2026-10-19 - WED-236 milestone dependency core (Codex, in progress)

Changed:

- Added a deterministic generic dependency projector and versioned wedding adapter covering guest
  counts, accommodation, stationery, invitations, vendor final counts and event readiness.
- Linked task/calendar evidence is explicit. Manual dates override template suggestions with their
  source reference; duplicate or unresolved evidence blocks rather than choosing one record.
- Earliest/latest dates and slack use conservative maximum lead times. Critical urgency exists only
  at zero/negative slack, and only one selected item may receive a data-only research/compare action.
- Completed/waived milestones remain visible but leave the active path. Cycles, missing predecessors,
  blocked ancestors and a missing event horizon remain typed blockers.

Verification:

- Ten focused milestone tests pass for the graph, date, state, blocker, criticality, action-safety and
  determinism invariants. The only warning is the inherited unused email-group parameter.

Next:

- Add an authenticated default-off adapter that reads owned linked task/calendar evidence and current
  wedding date without accepting editable graph facts from the browser. Then project one safe item
  through existing Decision Card/A2UI primitives. Keep every rollout/provider flag disabled.

## 2026-10-19 - WED-236 milestone projection integration (Codex, review)

Changed:

- Added a default-off authenticated projection endpoint. It reads only the signed-in tenant's
  wedding-tagged AFP task/calendar/date-decision messages and accepts only a closed explicit
  `wedding_milestone_key`; task titles and browser-provided graph facts are not classification input.
- Source revisions are deduplicated by stable task/calendar reference. Concordant mirrors merge;
  differing states or dates block. The latest append-only wedding-date decision is authoritative,
  with the existing calendar projection as compatibility fallback.
- Passed explicit milestone links through the existing task/calendar AFP adapter without adding a
  new task model. The 982-line adapter remains below the 1000-line wedding budget.
- Added a fail-closed frontend normalizer and projections into the existing Decision Card and A2UI
  primitives. At most one item appears, critical copy requires non-positive computed slack, private
  titles/technical diagnostics stay hidden, and prepared actions only open internal search/compare.

Verification:

- Real disposable PostgreSQL passed flags-off, tenant isolation, current wedding-date selection,
  completed task state, manual calendar-date precedence, private-title exclusion and deterministic
  replay. Credentials were derived in-process and not printed or persisted.
- `cargo check`, 63 planning-intelligence tests, Solid typecheck, 8 focused frontend tests, all 1,899
  wedding tests, both line-budget checks and the production build pass. New files are at most 864
  lines and the large server module stayed line-neutral. Only inherited unused-parameter and Vite
  chunk-size advisories remain.

Next:

- Independently review WED-236. Keep `OMNYID_PLANNING_CRITICAL_PATH_ENABLED` and
  `VITE_PLANNING_CRITICAL_PATH_ENABLED` off until release evidence permits them. The projection does
  not invoke vendor search, messaging, booking or payment.
- Continue WED-237 vendor-change interpretation unless the user supplies the pending human-judge
  review first. Quotation/week-3-to-6 work remains paused; all provider, vendor-mail, relay and
  ranking-policy-V2 flags remain disabled and no Oracle deployment ran.

## 2026-10-19 - WED-237 canonical vendor-change interpreter (Codex, in progress)

Changed:

- Added a pure classifier/interpreter over the established WED-220 canonical vendor response and
  active normalised quotation. No email, portal, upload or AFP transport is reparsed.
- A closed exact fact vocabulary supports item unavailability, substitutions, price/scope changes,
  term timing and explicit deadlines. Multiple anchored substitutions become one bounded review
  change, while ordinary answers/quote facts classify without inventing a change.
- Proposed/unanchored facts, stale quotation binding, missing object/original evidence, ambiguous
  replacements/deadlines and currency mismatch remain typed blockers. The output always states that
  the quotation was not mutated.
- Price direction remains visible in anchored original/replacement terms; the frozen contract's
  non-negative delta field carries exact magnitude for both increases and decreases.

Verification:

- `cargo check`, seven focused vendor-change tests and all 70 planning-intelligence tests pass. New
  files are at most 535 lines. The inherited unused email-group parameter warning remains.

Next:

- Add current-response replay plus constraint/style/budget/event-date evaluation behind the existing
  default-off vendor-change flag. Preparation must remain review-only; explicit acceptance must call
  the existing quotation review successor path and preserve stale-decision invalidation.
- Keep all planning, quotation, vendor-mail, relay, provider and ranking-policy-V2 flags disabled.
  Quotation-normalisation/week-3-to-6 work remains paused pending the user's human-judge review.

## 2026-10-19 - WED-237 revision-bound replacement review core (Codex, in progress)

Changed:

- Added a pure review projection over the canonical vendor-change interpretation. Every anchored
  replacement has a stable option reference and independent constraint, aesthetic/palette and
  budget outcomes; missing evidence remains unknown.
- Bound evaluations to current confirmed constraint IDs, exact replacement option and source
  revision. Identical retries deduplicate; conflicting, malformed, stale or source-mismatched
  records become blockers. Hard conflict is derived from the current constraint strength rather
  than trusting presentation severity.
- Added exact calendar-day projections for explicit event dates and vendor deadlines. Invalid dates,
  budget evidence and reference times block; no urgency or deadline is inferred.
- Added currentness checks across response ID/fingerprint, quotation, constraints, budget and event
  date. Review output is always non-mutating and provides no acceptance or booking authority.

Verification:

- Seven focused replacement-review tests and all 77 planning-intelligence tests pass; `cargo check`
  passes. New files are 597 and 345 lines. The inherited unused email-group parameter warning
  remains. A crate-wide formatter traversal was detected and fully reversed before this handoff.

Next:

- Add the default-off authenticated adapter that replays the tenant-owned current canonical vendor
  response and active quotation, supplies only server-owned current constraint/budget/event evidence,
  and projects review-safe output. Do not accept browser-authored evaluations or infer style from
  response prose.
- Then wire a fail-closed Decision Card/A2UI projection and explicit acceptance through the existing
  quotation successor/stale-decision lifecycle. Keep all provider, vendor-mail, relay and
  ranking-policy-V2 flags disabled; no Oracle deployment has run.

## 2026-10-19 - WED-237 guarded prepare API and UI projection (Codex, in progress)

Changed:

- Added `/planning/vendor-changes/prepare` behind the existing vendor-change plus constraint-ledger
  and evaluation flags. It authenticates the user and reads only their requested AFP thread.
- Replays the active normalised quotation and canonical vendor response. Same-material channel
  duplicates converge on one fingerprint/review identity; a different-fingerprint response child or
  active quotation successor makes the requested review stale.
- Derives optional same-currency budget headroom from current cost evidence only when both ranges
  cite that AFP revision. Derives the event date from current wedding decision/calendar evidence.
  Browser-authored evaluations, amounts and dates are not accepted.
- Added a fail-closed frontend normalizer and existing Decision Card/A2UI projection. Exact excerpts,
  internal blocker kinds and revision IDs do not enter visible copy. No replacement is recommended;
  the only prepared action opens review and explicitly carries no acceptance, send, booking or
  payment authority.

Verification:

- Real disposable PostgreSQL passed feature-off, tenant-isolation, current quotation/response,
  channel deduplication, price-range budget, event/deadline timing and response-successor rejection.
- All 77 planning-intelligence tests, the focused API test, five focused UI tests, typecheck, both
  line-budget checks, all 1,899 wedding tests and the production build pass. New API/UI files are at
  most 387 lines; the 45,696-line server module stayed line-neutral. Only the inherited unused Rust
  parameter and Vite large-chunk advisories remain.

Next:

- Implement explicit user acceptance by converting the selected anchored replacement into the
  existing quotation review successor command, under an advisory lock and idempotency key. Re-run
  prepare inside the transaction and reject stale response/quotation/constraint/budget/event
  bindings. Do not add a parallel quote edit or transport acceptance state.
- Keep all planning flags default off. Vendor mail, relay, providers and ranking-policy-V2 remain
  disabled; no Oracle deployment has run. Quotation-normalisation/week-3-to-6 work remains paused
  pending the user's human-judge review.

## 2026-10-19 - WED-237 guarded vendor-change acceptance (Codex, review)

Changed:

- Added `/planning/vendor-changes/accept` behind the same default-off planning gates. It authenticates
  the owner, serializes the prepared review, reloads tenant-private evidence and recomputes the review
  before accepting one exact option.
- Added guarded quotation-review actions for line-item and commercial-term changes. They bind the
  planning review, option, canonical response fingerprint and exact response source, then create the
  existing immutable quotation successor. The parent and its source list remain unchanged.
- The generic `/quotation/reviews` route rejects these guarded actions. Hard constraint conflicts,
  exceeded budgets, stale bindings and any review blocker fail closed. No send, provider, booking,
  payment, signature or transport-state mutation occurs.
- Acceptance is idempotent without persisting the caller's raw key. Exact retries validate the stored
  action/successor and can repair a missing successor after partial persistence; different keys cannot
  fork an accepted parent.

Verification:

- Passed all 77 planning-intelligence and 33 quotation library tests, seven focused quotation-review
  tests, and the expanded disposable-Postgres vendor-change API test covering flags-off behavior,
  tenant isolation, deduplication, acceptance, retry, key misuse, exact evidence, successor state and
  stale-parent rejection.
- Passed Solid typecheck, both line-budget checks, wedding site smoke, all 1,899 wedding tests and the
  production build. The largest changed focused file is 786 lines. Only the inherited unused
  email-group parameter and Vite large-chunk advisory remain.

Next:

- Independently review WED-237, then continue WED-238. WED-239 owns the unified intervention selection
  UI; the current vendor-change card intentionally opens review and does not silently call acceptance.
- Keep every planning, quotation, vendor-mail, relay, provider and ranking-policy-V2 flag disabled.
  No Oracle deployment ran. Quotation-normalisation/week-3-to-6 work remains paused for the user's
  human-judge review.

## 2026-10-19 - WED-238 preference-conflict lifecycle completed (Codex, review)

Changed:

- Added explicit `Resolved together` and `Not a conflict` controls to the existing resilience card.
  They persist append-only, couple-private AFP lifecycle successors tied to the exact conflict source
  message and active preference-signal revision.
- Terminal records contain closed outcomes only and set `creates_planning_rule: false`; they do not
  infer partner consent, select a compromise or copy private rationale/source text.
- Replay hides an exactly resolved or dismissed revision. A constraint successor changes the
  revision, reopens the card and can be projected even when the prior revision has a local sent
  marker. Review Later retains its separate temporary, dependency-bound deferral semantics.
- Save orchestration lives in a small lifecycle owner; the already-large response workspace
  component remains under its frozen line budget.

Verification:

- Focused lifecycle, action, display, ledger, queue and workspace replay tests pass, including both
  terminal outcomes, malformed successor rejection, offline failure, exact replay and changed-
  revision reopening.
- Solid typecheck, both line-budget checks, wedding site smoke, all 1,914 wedding tests and the
  production build pass. New lifecycle files are at most 246 lines; the response workspace component
  is 1,107 lines against its frozen 1,108-line budget. Only the inherited Vite chunk advisories remain.

Next:

- Independently review WED-238, then begin WED-239's unified intervention projection through the
  existing shared Decision Card/A2UI contracts. Do not add another card owner.
- Keep all planning, quotation, vendor-mail, relay, provider and ranking-policy-V2 flags disabled.
  No Oracle deployment ran. Quotation-normalisation/week-3-to-6 work remains paused for the user's
  human-judge review.

## 2026-10-19 - WED-239 unified intervention presentation (Codex, review)

Changed:

- Added a strict `decision.intervention.v1` frontend normalizer and one shared presentation adapter
  over the existing Decision Card and A2UI primitives. It separates recommendation, reasons, cost,
  timing, unknowns and evidence, preserves explicit currency labels and suppresses technical copy.
- Constraint interventions retain and project the frozen contract. Cost, milestone and vendor-change
  workflows retain their domain-specific execution semantics while sharing the A2UI projector.
  Preference conflicts keep their existing couple-private resilience owner and persist the same typed
  presentation metadata through AFP replay.
- Standard/full Decision Cards now show every alternative, recommendation reasons and review items.
  A2UI structured action objects now retain their labels, and comparison tables use contained
  horizontal overflow plus a stable minimum width so 320 CSS-pixel / 400%-equivalent zoom does not
  produce vertical character stripes or page overflow.
- Actions remain bounded to one primary plus at most three secondary choices. Their copy states that
  nothing is sent, booked or paid automatically, and prepared-only workflows retain that marker.

Verification:

- Passed Solid typecheck and 37 focused intervention, producer, preference-AFP and reflow tests.
- Passed both line-budget checks, wedding site smoke, all 1,921 wedding tests and the production build.
  The new shared adapter is 453 lines and both new tests are below 150 lines. Only the inherited Vite
  screen-variant and large-chunk advisories remain.

Next:

- Independently review WED-239 and visually confirm the Decision Card/A2UI comparison at 320 CSS px
  and 400% browser zoom before enabling its independent flag in any environment.
- Keep all planning, quotation, vendor-mail, relay, provider and ranking-policy-V2 flags disabled.
  No Oracle deployment ran. Quotation-normalisation/week-3-to-6 work remains paused pending the
  user's human-judge review.

## 2026-10-19 - WED-240 machine-evaluation foundation (Codex, in progress)

Changed:

- Added `planning.ideal_agent_evaluation.v1`, covering all nine golden scenarios with explicit
  producer, authority, privacy, automated-evidence and human-review fields. Rust and Solid audits
  require every referenced evidence path to exist and keep the scenario/review vocabularies closed.
- Explicitly dark-packaged all seven backend and seven frontend planning flags in `.env.example`,
  the UI Docker build and each Oracle compose variant. No flag was enabled and no deployment ran.
- Enforced rollout order from dark package to synthetic tenant, allowlisted couple and permissioned
  vendor. The final stage requires WED-225, WED-226 and mail/provider gates; kill switches preserve
  AFP history and evaluation metrics remain content-free.

Verification:

- Passed 77 planning-intelligence units, shared-schema/adversarial/deterministic replay coverage,
  migration catalog, three manifest audits and three frontend dark-package audits.
- Against isolated local Docker only, passed all seven authenticated planning API suites plus live
  clean ClamAV and infected/error boundary units. No Oracle or persistent application database was
  used.
- Passed four focused Playwright cases at 320, 360, 390 and 1280 CSS pixels, Solid typecheck, wedding
  site smoke, both line budgets, all 1,924 wedding tests and the production build. Compose structure
  validates for production, minimal, QUIC and staging without interpolating secrets. Only inherited
  Rust unused-variable, Tailwind screen-variant and Vite chunk advisories remain.
- The exact-commit verifier reports machine `verified` for
  `f71dba5d86b2b07e764e7fdce32243b01582609a`, artifact digest
  `49a75251f9b1a7faca2fe9d894f26b515ea01e5edd369f14659527c9c4913945`, with all 12 checks passed.
  Human and release remain `blocked`: all nine human-review records are missing and WED-225/WED-226
  remain blocked.

Next:

- Ingest independent human-review evidence when supplied. WED-240 cannot move to review or release
  while the nine human dimensions and WED-225/WED-226 remain unresolved.
- Keep every planning, quotation, mail, provider, relay and ranking-policy-V2 flag disabled. Do not
  deploy to Oracle or advance a canary from this machine-only evidence.

## 2026-10-20 - WED-242 teal wedding surface alignment (Codex, review)

Changed:

- Confirmed `e3f04a9` is already in this branch's ancestry and selectively retained its useful
  mobile/search behavior without cherry-picking it or copying the WED-187 worktree. Later WED-239
  recommendation reasons, review items, full alternatives and zoom reflow fixes remain intact.
- Added design-system section 11 and the matching CLAUDE guidance. New named tokens implement Deep
  Teal, Warm Porcelain, Ink Blue, white cards, warm borders/ink and warm slate without globally
  changing legacy wedding flows.
- Reworked the touched home/search/comparison/decision surfaces to 8-12px radii, rectangular actions,
  white cards and semantic status tints. Vendor images, readable wrapped names, selected comparison
  state and post-outreach comparison persistence are preserved.
- Replaced the dark decorative ring with a task-derived journey stepper and added a desktop up-next /
  saved-vendor rail that stacks on mobile. The stepper is horizontally contained and keyboard
  focusable at narrow widths. The existing five-item mobile bottom navigation remains mounted.
- Expanded the WED-240 and WED-225 verification guides with the nine human-review meanings, exact
  record workflow and external portal evidence expectations. No reviewer evidence was invented.

Verification:

- Solid typecheck passed. Thirty-nine focused home/search/decision/outreach tests and all 1,929
  wedding tests passed. Both line-budget checks passed; the largest touched focused file is 438 lines.
- The focused Playwright home suite passed at 320, 390 and 1280 CSS pixels with exact computed token
  colors/radii, no page overflow, no serious/critical Axe finding and the five mobile tabs intact.
- Production UI build passed. Only the inherited Tailwind object-screen advisory and Vite large-chunk
  advisory remain. No Rust contract changed, so no new Rust test lane was required for this UI slice.
- The full clean-worktree WED-240 verifier then passed all 12 machine lanes for
  `c89dec605cc84102bd1cd680fc35f39c9f99202e`, including planning Rust, disposable PostgreSQL,
  live disposable ClamAV, SDK, UI, browser and compose checks. Its artifact digest is
  `eb3885f4806e1b3b5934ac95eca4975e579b3a9e4ea6f867cf579e8c5d62dbc3`; human and release status
  remain blocked, flags were unchanged and no deployment ran.

Unresolved / next:

- WED-240 still needs nine independent, exact-commit human-review JSON records. The records are not
  repository fixtures; reviewers create them after producing and hashing durable evidence.
- WED-225 still needs all commit-bound external sign-offs accepted by its verifier. WED-226 remains
  blocked by WED-225 plus WED-213 and WED-185; vendor mail, email reconciliation, quotation rollout,
  relay and ranking-policy V2 stay disabled. No Oracle deployment or provider mutation ran.

## 2026-10-20 - WED-225 current-head line-budget repair (Codex, blocked)

Changed:

- Ran the WED-225 readiness workflow against the isolated local PostgreSQL and ClamAV endpoints.
  Every functional lane passed. The aggregator and a final non-fail-fast audit exposed four line-budget issues:
  the later structured A2UI action normalizer had grown the already-oversized renderer by eight
  lines, the expanded test-router registrations had grown the oversized server module by four, and
  the planning-intelligence SDK barrel export and its package test had grown their oversized files.
- Compacted only that normalizer without changing its accepted array/map shapes or label trimming.
  `A2UIRenderer.tsx` is now line-neutral at 1,983 lines against the 1,983-line baseline.
- Grouped only the existing test-router merge chain without adding, removing or reordering a route.
  `src/server/mod.rs` is now line-neutral at its 45,692-line WED-225 baseline.
- Grouped the two adjacent SDK barrel exports on one physical line without changing either export;
  `typescript-sdk/src/index.ts` is line-neutral at its 2,521-line baseline.
- Compacted the same four package-export assertions without changing their values; the 2,140-line
  package-export test is also baseline-neutral.

Verification before the clean-commit rerun:

- Seven focused unified-intervention/A2UI reflow tests pass and Solid typecheck passes.
- Both full verifier attempts passed the quotation suite, real disposable-Postgres API path, SDK,
  44 Solid quotation tests, 11 Playwright cases, migration catalog, all 1,929 wedding tests and the
  production build; each fail-fast line-budget finding is now repaired.

Unresolved / next:

- Re-run the complete verifier on the clean repair commit and use its generated manifest as the
  current machine record. WED-225 must remain blocked because all ten exact-commit external records
  are still absent; a successful local ClamAV test is not the independent clean-scan sign-off.
- WED-226, vendor mail, email reconciliation, quotation release, relay and ranking-policy V2 remain
  disabled. No Oracle deployment or live provider action is authorized.

## 2026-10-21 - WED-243 decision-aware Tasks and Budget evidence hub (Codex, review)

Changed:

- Replaced the empty Active To-Dos body with a compact decision-aware Tasks surface. It reads existing
  AFP task revisions and explicitly linked/nested decision evidence, provides distinct labelled status
  filters and expands each task into its ordered decisions, available options and chosen option.
- Added a fail-closed visible-copy boundary for task/decision details. Missing options remain stated as
  missing; protocol, provider, database and identifier diagnostics are not rendered as user copy.
- Added responsive Overview, Quotes, Contracts, Deposits, Payments and Forecast tabs above the existing
  Budget tracker. Existing allocation, contribution and insight workflows remain mounted unchanged.
- Contracts and quote files remain canonical in Documents. Budget rows only project their state and the
  open action now selects the source artifact and navigates to Documents rather than Home.
- No backend, AFP schema, A2UI authority or rollout flag changed. All planning, quotation, vendor-mail,
  relay, provider and ranking-policy-V2 gates remain disabled by their fail-closed compose defaults.

Verification:

- `npm run test:wedding:ci` passed: typecheck, both line-budget audits, wedding site smoke and all 1,934
  wedding tests. New focused state/source tests are included in that total.
- Focused Playwright passed at 320 and 1280 CSS pixels with task disclosure, two sequential decisions,
  chosen options, contract opening, no page overflow, no serious/critical Axe findings and all five
  mobile navigation tabs intact.
- `npm run build` passed. Only the inherited Tailwind screen-variant and Vite chunk-size advisories remain.
- No Rust contract changed, so no Rust lane was required for this UI-only projection slice.
- New files are at most 236 lines; `App.tsx` shrank by 118 lines and no oversized owner grew.
- The first guarded Oracle build was stopped when concurrent build/restore-drill containers drove root
  storage to 98%; stopping only those two transient containers restored it to 84% while production
  homeserver, Caddy and backup containers stayed up. A scoped UI retry then proved the staging bundle
  omitted Vite's required `quotation-response.html` entry. The staging manifest and its self-test now
  include that entry (55 paths with simulated data, 54 without).

Next:

- Commit WED-243, then deploy that exact dark-safe commit through the guarded Oracle runtime script with
  simulated/source data excluded. Record the post-deploy proof externally; do not enable any blocked
  planning, quotation, vendor-mail, relay, provider or ranking-policy-V2 flag.
- Independent WED-225/WED-240 human evidence remains outstanding and must not be inferred from this UI work.

## 2026-10-22 - WED-244 vendor relevance and outreach correction (Codex, review)

Changed:

- Changed the top-comparison primary action to `Reach out`; removed the live synthetic workspace
  fallback; legacy venue comparisons now hide known photography cards such as A2Z Weddings.
- Added current-query intent extraction for venue category, East Suburbs/beach location, guest count,
  budget, priorities and atmosphere. Comparison anchors, questions and user-facing ranking reasons now
  use that request instead of stale Photos/venue intake labels.
- Limited `Not for us` reasons to supported context. `Too big` appears only when the couple actually
  asks for an intimate, small, micro or boutique option.
- Reused the shared TipTap email editor with headings, sizes, bold, italic, lists and sanitized HTML.
  Drafts use readable paragraphs, `AUD $` currency, no duplicate `budget`, plain capacity/price topic
  wording and an onboarding-derived sign-off without inventing a name.
- Kept future vendor follow-ups visible and added controlled calendar/typed input, explicit save state
  and an authenticated schedule-only database/API route. Rescheduling does not alter last-contact,
  reply, contact-method or provider-receipt evidence.
- Recorded the first three supplied venue-ranking reviews and the ordered location/capacity/budget/
  priority rubric in `Documents/verification/wedding-vendor-ranking-human-review-partial.md`. This is
  partial first-judge evidence, not the separate WED-240 nine-dimension review.

Verification:

- Solid typecheck, both line-budget checks, wedding website smoke, 74 focused UI tests and all 1,943
  wedding tests pass. The production build passes with inherited Tailwind and Vite advisories.
- Four Playwright comparison cases pass at 360 and 1280 CSS pixels with Axe/contrast checks.
- Fourteen wedding-outreach Rust tests and twenty user-management route tests pass. The only compiler
  warning is the inherited unused `user_id` in `email_group_routes.rs`.
- `rustfmt --edition 2024 --check src/db/wedding_vendor_contact_schedule.rs` and `git diff --check`
  pass. Repository-wide `cargo fmt --check` remains red on extensive pre-existing formatting drift;
  no unrelated files were reformatted.
- Every new file is below 1000 lines. The 2,136-line ResponseQueue owner shrank by 46 lines, the
  1,001-line user-management route owner shrank by 13, and no oversized UI owner exceeds its line
  budget. The outreach Rust owner is 997 lines.

Unresolved / next:

- The supplied first three ranking reviews still need the remaining corpus and an independent second
  judge before ranking policy V2 can meet its existing rollout criteria.
- The nine WED-240 ideal-agent human dimensions and WED-225/WED-226 gates remain independently blocked.
  No feature flag was enabled and no Oracle or provider mutation was performed in this slice.

## 2026-10-22 - WED-245 current wedding UX walkthrough remediation (Codex, review)

Changed:

- Audited all observations in the 2026-10-21 mobile production walkthrough against the current
  WED-215 implementation. The disposition record is
  `Documents/verification/wedding-ux-walkthrough-current-implementation-audit.md`.
- Kept the user's outreach-failure exclusion and did not alter session persistence from a scripted
  reload observation that is not reproduced by the current same-tab storage contract.
- Removed generic onboarding, persona/customizer and Response Queue leaks from wedding entry; reduced
  the wedding More sheet to relevant pages while retaining the existing five-tab mobile navigation.
- Made wizard navigation persist progress, made completion duplicate-safe, improved step hierarchy,
  auth/session/verification/error copy, zero-result guidance, dismissal recovery, decision labels,
  document filters/refresh state and Calendar diagnostics.
- Migrated owned intake, timeline and leading budget surfaces to wedding brand tokens and 8-12px
  radii, and prevented the dedicated wedding landing wordmark from shrinking at phone widths.
- No AFP/A2UI contract, Rust API, provider authority, source data, Oracle runtime or rollout flag
  changed. The shared generic Calendar palette remains unchanged pending an explicit theme input.

Verification:

- `npm run typecheck` passed.
- 28 focused session, error, wedding copy, document-label and outreach/source tests passed.
- `npm run test:line-budget` and `npm run test:wedding-site` passed.
- `npm run test:wedding` passed all 1,945 tests after updating the decision-card source contract to
  preserve its three-reason bound while filtering a duplicated explanation.
- `npx playwright test tests/e2e/wedding-home-genz-ui.spec.ts --config playwright.config.ts` passed
  at 320, 390 and 1280 CSS pixels.
- `npm run build` passed. Only inherited Tailwind object-screen and Vite chunk-size advisories remain.

Next:

- Independent review should compare the current built UI, not the walkthrough's expected UI, with
  special attention to wedding deep-link first-run state and a real mobile browser.
- WED-225/WED-226 and policy-V2 remain blocked by their existing criteria. No deployment was requested
  or performed for WED-245.

## 2026-10-22 - WED-246 wedding continuity repairs (Codex, review)

Changed:

- Bound vendor-search results to the exact account, response workspace and current query. Editing or
  retrying clears the prior result, successful manual searches restore their own comparison, and the
  old newest-artifact fallback no longer revives unrelated seeded cards after navigation.
- Let deliberate freeform search use its parsed category, location, guest and preference context while
  preserving omitted date/budget facts as unknowns. Complete intake remains required for unattended
  shortlist automation.
- Added template-aware breadcrumbs and a wedding Tasks subpage. Wedding task actions remain inside the
  planner, and Tasks plus People share `planningTaskItems`, completion storage and AFP responsibility
  projection; linked decision options and chosen values remain inspectable.
- Kept the home logistics prompt on Timeline. Seating apply now persists and confirms the suggested
  assignment in place; no 2D seat-map editor exists in the repository, so none is implied.
- Extracted the desktop wedding-menu configuration so the 2,138-line ResponseQueue owner shrank rather
  than grew. App also shrank, and every new file remains below 170 lines.

Verification:

- `npm run typecheck`, both line-budget checks and wedding-site smoke passed.
- All 1,955 wedding tests and 51 focused continuity/search/task tests passed.
- Five Playwright checks passed at 320, 390 and 1280 CSS pixels with the existing Axe assertions.
- `cargo test --lib wedding_vendor -- --nocapture` passed 125 tests; only the inherited unused
  `user_id` warning remains.
- `npm run build` passed with only inherited Tailwind object-screen and Vite chunk-size advisories.

Next:

- Commit and deploy this exact dark-safe application through the guarded Oracle path, excluding source
  data and leaving planning, quotation, vendor-mail, relay, provider and ranking-policy-V2 flags off.
- The nine WED-240 human dimensions plus WED-225/WED-226 remain release blockers; the HTML form is a
  record generator, not a substitute for scenario execution by an independent reviewer.

## 2026-10-23 - WED-248 vendor acquisition and persona landing pages (Codex, complete)

Changed:

- Selectively integrated only the three static Wedding frontend files from `a36e25b` as `6b21a71`,
  preserving the plain Understanding error and indicative cost-breakdown changes without taking any
  backend, workspace or worktree state.
- Added `/vendors` with evidence-led copy for faster high-intent lead handling, authentic proof,
  mobile planning, useful price clarity and vendor-private commercial methodology. Easy Weddings and
  Marketing Mag are named in-page without source backlinks; vendor review and permission boundaries
  are explicit.
- Added the three requested Gen Z persona listicles beneath `/wedding/`, with the supplied titles,
  7/5/6-item structures, persona-specific CTA, product relief, objections, FAQ, final conversion,
  privacy/control reassurance and the existing Wedding logo.
- Added shared responsive styling, static content/link contracts and rendered 390px/1280px browser
  coverage. The browser checks found and fixed mobile CTA/grid overflow and two WCAG contrast misses.

Verification:

- `node --check wedding/assets/js/main.js`, `npm --prefix solid-ui run test:wedding-site`,
  `test:line-budget`, `typecheck` and `build` pass. The build retains only the inherited Tailwind
  object-screen and Vite chunk-size advisories.
- Eight Playwright cases pass across all four new pages at 390px and 1280px, including overflow,
  mobile CTA and serious/critical Axe checks. Every new file is below 1000 lines.
- Commit `62a4813` contains the page slice. Six new static files were staged, SHA-256 checked and
  atomically promoted on Oracle. The three pre-existing Wedding files match `6b21a71`; no rebuild was
  required. All four public routes return HTTP 200 with expected content and the source names remain
  unlinked as requested.
- No workspace/backend container, database, mail setting, feature flag or vendor source record was
  changed. Remote `postgres/data` is absent and the deployment staging directory was removed.

Next:

- Campaign analytics and experiment assignment were deliberately not added without an approved
  consent, privacy and credential design. They can be introduced as a separate reviewed task.

## 2026-10-24 - WED-249 reviewed ranking corpus and dark rehearsal (Codex, complete)

Changed:

- Added a deterministic generator and 41-line JSONL projection of both private ranking workbooks.
  It records 40 cases, 480 scores per reviewer, 477 exact agreements, three unresolved score
  disagreements and one invalid ideal-order reference without copying source facts or comments.
- Documented that Iris has no ideal top-three records, judge independence is not attested, and the
  corpus cannot satisfy the distinct quotation-normalisation accuracy gate. Policy V2 remains off.
- Recorded a live clean scan against the disposable local ClamAV daemon and a full dark quotation
  rehearsal against local Docker PostgreSQL/ClamAV. No hosted/provider/Oracle/mail/payment action ran.
- Added the supplied human-review form to this isolated worktree and fixed focus loss after radio
  selection plus overlapping async package downloads, with focused Chromium coverage.

Verification:

- Three corpus contract tests and two human-review-form Playwright tests pass.
- The corpus regenerates byte-for-byte with SHA-256
  `1845d1ecd74f139539918167e572fbe98937ff18ae87dfd34ffeb284344b2885`.
- The local live ClamAV test passes 1/1, parser boundaries pass 3/3, and the full quotation readiness
  verifier passes its Rust, disposable-Postgres, SDK, Solid and 11-browser-test lanes with flags off.
- Solid typecheck, both line-budget checks and production build pass. Only inherited Tailwind and
  bundle-size advisories remain.

Unresolved:

- Ranking rollout still requires resolution of three score disagreements, correction/confirmation
  of the eval-01 order reference, complete ordering review and independent provenance.
- WED-225 still needs a quotation-specific reviewed accuracy corpus and its external, independent,
  hosted and cohort records. Local ClamAV and local dark rehearsal are not those sign-offs, so
  WED-225/WED-226 remain blocked and no feature flag changed.

## 2026-10-24 - WED-250 audited surfaces and vendor ownership (Codex, complete)

Changed:

- Routed every Wedding vendor login/claim action to the existing vendor portal, preserving the
  listing slug through shared authentication. Verified vendors reuse the existing private quotation
  response UI.
- Added migration 0115 and fail-closed ownership routes. Intake no longer reserves listings or
  grants roles. Verified work email, HTTPS meta/well-known, DNS TXT and operator review are supported
  with expiry, attempt, dispute, release and private AFP receipt boundaries. Social proof is disabled
  until an official provider connection exists.
- Added a verified prefilled profile dashboard with contact/social edits, preview, badge, licensed
  photo management and calculated completion guidance. Welcome email is default-off.
- Removed persisted browser bearer credentials, added cookie-authenticated WebSockets, and added a
  conditional state/nonce-bound Apple web flow over the existing verified-token backend.
- Added Cloudflare-only Caddy handling, strict trusted proxies, HSTS/common headers, narrowed CSP,
  compiled docs CSS and deterministic inline-script hash regression coverage.
- Upgraded actionable Rust, Solid, Markdown, PPTX/image and SDK dependencies. Repaired the audited
  auth/tour dialogs, labels, landmarks, editor semantics, live region, target sizes and targeted
  contrast. Detailed classification is in
  `Documents/verification/security-privacy-accessibility-audit-remediation.md`.

Verification:

- Disposable PostgreSQL migration applied successfully; ownership API 2/2 passed.
- Ownership units 3/3, Apple token units 5/5, relay units 9/9 and cookie-header unit 1/1 passed.
- Wedding tests 1,962/1,962, session tests 13/13, both line-budget guards, typecheck, website/CSP
  smoke, SDK typecheck/build, Caddy validation, cargo check and frontend production build passed.
- `npm audit --omit=dev` has 0 high/critical findings. Cargo audit's actionable audited findings
  are cleared; the no-fix RSA lock-resolution advisory and constrained AWS `lru` warning remain
  documented. The inherited unrelated `email_group_routes.rs` unused-variable warning remains.

Unresolved/operations:

- This task was not deployed. After deployment, verify direct-origin rejection and distinct proxied
  rate-limit identity, and add Oracle network-layer Cloudflare-only ingress as defence in depth.
- Configure an Apple Services ID/registered HTTPS return URL before setting the new Apple variables.
  Do not enable social ownership proof without provider-signed page authority.
- TipTap's remaining moderate advisory requires a separately tested major editor migration.
- Repeat hosted accessibility/security testing. WED-225's independent evidence and WED-226 release
  gate remain unchanged; policy V2 and the vendor welcome-email flag remain disabled.

## 2026-10-24 - WED-251 People hub and review-candidate preparation (Codex, complete)

Changed:

- Replaced the old amber People summary with the section-11 wedding surface: a short page intro,
  icon-and-label neutral/attention/resolved indicators and existing Guests/Seating destinations.
- Extracted the hub into a focused component. Its two single-destination cards are equal-height,
  whole-card keyboard/touch controls with bottom-aligned concise CTAs and list-form metadata.
- Extended the existing aggregate A2UI projection with structured status targets, metadata items and
  action labels. No guest, seating, task, AFP or navigation owner changed.
- Added the reusable hierarchy, semantic status, card alignment, touch, mobile and WCAG contrast rules
  to `docs/DESIGN_SYSTEM.md` section 11.

Verification:

- Seven focused aggregate/render tests pass.
- Two Playwright cases pass at 320px and 1280px, covering shortcut navigation, brand values, desktop
  CTA alignment, overflow, persistent mobile navigation and no serious/critical Axe findings.
- Typecheck, both line-budget guards, Wedding site/CSP smoke, all 1,963 wedding tests and the Solid
  production build pass. The build retains only its inherited large-chunk advisory.

Operations and next:

- The six new WED-225 review files are protocols only; the user explicitly reports that none has been
  executed. Do not mark hosted accessibility, couple/vendor usability, permission wording, provider
  smoke or the seven-day cohort verified from this machine evidence.
- The exposed legacy Cloudflare token remains invalid (`401`, error `1000`), exists only in the local
  original worktree and has no matching secret file or env binding on Oracle. Revoke it in Cloudflare,
  create a least-privilege replacement, and install the replacement only through the documented
  file-backed vendor-mail secret path before an authorised smoke test.
- Commit this slice, tag that exact clean revision as the human-review candidate, rerun the readiness
  verifier against local disposable PostgreSQL and ClamAV with all consequential flags off, and give
  the user the frozen SHA plus machine manifest. WED-225/WED-226 and policy V2 remain blocked.

Verifier follow-up:

- The first frozen-commit run passed every functional lane but the WED-225 line-budget helper falsely
  treated generated `Cargo.lock` growth from the WED-250 dependency upgrades as handwritten source
  bloat. The helper now excludes only `Cargo.lock` and `package-lock.json`; a static regression test
  protects those exact exclusions while Rust/TypeScript/TSX files remain covered.
- A second exact-commit audit found inherited WED-250 additions had taken `api.ts`, `auth.rs`,
  `mod.rs` and `TiptapEditor.tsx` above their frozen owner ceilings. Session-credential state and
  Apple configuration are now extracted into focused files, and repetitive registrations/attributes
  are line-neutral. The targeted 21 frontend tests and 64 auth units pass, as do cargo check,
  all 1,964 wedding tests, site/CSP smoke, line budgets and the production build. Recreate the review
  tag on the resulting commit and use only the final exact-commit manifest for human review.

## 2026-10-24 - WED-252 hosted gate preflight (Codex, blocked)

Changed/evidence:

- Read the hosted-accessibility and couple-usability protocols in full. The implementing agent cannot
  supply either required independent judgment or a real/recruited couple session.
- Oracle's release manifest reports `67c1559e0ad5b3760620674fed86a987d8bafc11`, not frozen candidate
  `4a4712f76024705eb32c8e860b669860cd1a58ff`. Current production is therefore ineligible evidence.
- Signed in with the supplied synthetic account while keeping its password in process memory only.
  The older hosted surface reproduced serious auth naming/interaction, editor naming, ARIA and 2.52:1
  contrast defects plus duplicate/nested main landmarks and no h1. It did reflow without page overflow
  at 320px, exposed the skip link first, and kept the no-token vendor response generic and detail-free.
- No required quotation fixture or secure links were present, no couple participated, and no outbound
  vendor/payment action ran. Reports are
  `Documents/verification/wed-225-hosted-accessibility-preflight-4a4712f76024.md` and
  `Documents/verification/wed-225-couple-usability-preflight-4a4712f76024.md`; neither is gate evidence
  and no pointer file was created.
- The replacement Cloudflare value is present in the original repo's gitignored `.env`, but
  `OMNYID_CLOUDFLARE_API_KEY` is not read by current mail code and its Bearer verification returned
  HTTP 401. No secret value was printed, copied to Oracle or enabled.

Blocked/next:

- Host the exact candidate for allowlisted test accounts, seed the synthetic three-quote workspace,
  issue disposable valid/expired/revoked links, and then give the accessibility protocol to an
  independent reviewer and the usability protocol to a recruited couple with facilitator/observer.
- For provider work, replace the unsupported generic env name with the reviewed file-backed vendor or
  transactional token binding only after confirming whether the new Cloudflare credential is an API
  token or a legacy global key. Do not enable vendor mail from the current 401 result.

## 2026-10-24 - WED-253 verified vendor sender identities (Codex, complete)

Changed:

- Added migration 0116 and tenant-scoped APIs for a verified claimed vendor to reserve and select either
  its connected Gmail business address or a stable `<vendor>_<locality>@omnyid.com` identity. Arbitrary
  addresses, unverified claims, stale ownership and cross-tenant IDs fail closed. Reserved operational
  aliases and sensitive/internal identifiers cannot enter a mask; neutral words resolve collisions.
- Bound the selected identity into the encrypted quotation response transport and validated it again at
  submission. Identity changes emit private replay-stable AFP audit receipts. They do not change the
  commercial response fingerprint or imply a booking, payment, contract or separate email send.
- Added the accessible response-form picker, A2UI state, schema/SDK support, database contracts and
  responsive Axe coverage. Existing couple relay identities remain isolated at `mail.omnyid.com`.
- Extended vendor-mail configuration to require a controlled From address, account ID, file-backed API
  token and Worker secret before Cloudflare can report ready. Gmail/Outlook remain forbidden as the
  platform relay provider and all rollout flags default off.

Operational evidence:

- The replacement `cfat_` credential is an active account-owned token (token ID suffix `07b5`). It can
  read the `omnyid.com` zone and Email Routing rules and reach the Email Sending API; DNS record and
  destination-address reads are denied. The exact token label/policy cannot be read with this token.
- `privacy@omnyid.com` routes to `concensure+omnyid@gmail.com`. The apex catch-all remains disabled and
  drops unmatched mail; existing explicit aliases therefore remain untouched.
- Oracle now has a root-owned 0600 token file and `.env.oracle` uses `hello@omnyid.com`, a file-backed
  token path and explicit disabled flags. Backup: `.env.oracle.bak.wed253-20261024T100803Z`. No process
  was restarted, no code was deployed and no email was sent.

Verification:

- Pass: typecheck; TypeScript SDK build/tests; 1,964 wedding tests; wedding site/CSP smoke; line budgets;
  production UI build; two 360/1280 Playwright+Axe checks; SMTP 7/7; sender/provider/reconciliation unit
  tests; and disposable-Postgres response/identity integration suites (9/9, 2/2 and 2/2).
- Full `cargo test --lib`: 2,500 passed and three inherited source-text assertions failed in unchanged
  `master_orchestrator.rs`, `conversion_routes.rs` and `user_integrations/`. All changed Rust suites pass.

Next:

- Do not enable `OMNYID_VENDOR_MAIL_ENABLED`, `OMNYID_VENDOR_SENDER_MASK_ENABLED`, the Cloudflare provider,
  an apex catch-all or policy V2 yet. External mask receive/reply needs the reviewed Worker, ingress-secret
  verification, abuse/rate controls, DNS/security review and the remaining WED-225 human/provider gates.
- Any WED-225 human review must freeze and host the new exact commit; the older 4a4712f evidence remains a
  non-gate preflight only.

## 2026-10-25 - WED-255 Email Worker ingress foundation (Codex, in progress)

Changed:

- Wrote the Email Worker/ingress specification and task ledger under
  `Documents/engineering/email inbox`, based on frozen candidate `0dc247f`.
- Added a dependency-light Cloudflare Email Worker with exact-byte forwarding, deterministic event ID,
  timestamp/nonce/digest-bound HMAC, fixed HTTPS target, bounded timeout and immutable 10 MiB ceiling.
  `wrangler.jsonc` intentionally has no `addresses`, so code deployment cannot alter routing.
- Added migration 0117 and authenticated gateway ingress. It resolves only active selected
  `omnyid_mask` identities still attached to active verified owners, claims provider events atomically,
  encrypts raw RFC 822 with a dedicated file-backed key and acknowledges only after quarantine commit.
- Added file-backed secret packaging and three independent dark gates. No Cloudflare, Oracle, DNS,
  catch-all, provider, mail, sender-mask, policy-V2 or production state was changed.

Verification:

- Worker 7/7; ingress units 3/3; provider readiness 4/4; migration catalog 1/1; SMTP inbound 5/5 and
  outbound 7/7; clean throwaway PostgreSQL ingress 1/1 including full migration application,
  encrypted storage, exact replay, conflict, unknown/connected identity and flags-off behavior.
- Cargo check, Solid typecheck, both line budgets, Wedding site/CSP smoke, all 1,964 Wedding tests and
  production UI build pass. Both Oracle compose files validate; minimal compose required its normal
  placeholder staging password during config-only validation. The inherited unused `user_id` warning
  and Vite chunk advisory remain.

Next:

- Implement the scanner/processor that claims quarantine, decrypts in short-lived memory, reuses
  ClamAV and `smtp_in`, stores safe attachments through the existing path and appends one encrypted,
  tenant-bound AFP message transactionally.
- Then add the distinct `mail.omnyid.com` couple-thread resolver, bounce/complaint handling, expiry,
  key rotation and operations packet. Do not enable routing or any three ingress flags before the
  independent security/privacy, provider, hosted-shadow, usability, permission and cohort gates.

## 2026-10-25 - WED-256 curator containment and Oracle storage recovery (Codex, in progress)

Changed:

- Fixed the curator retry contract: ineligible/noise/short/ephemeral sources now receive one private
  content-free skip marker and do not emit repeated `skipped` audit rows.
- Replaced the permissive daemon-kind fallback with an exact persisted-kind lookup. Legacy
  `background_watcher` and `state_synthesizer` rows can no longer impersonate `knowledge_curator`.
- Added indexed seven-day `curator_run_audit` retention to health maintenance with 5,000-row commits
  and a 100,000-row per-pass ceiling, migration 0118, a focused operations script and regression tests.
- Preserved line budgets: the already-large curator and daemon runtime owners have net line reductions;
  every new file is below 1,000 lines.

Oracle operations:

- Paused the affected `concensure@gmail.com` curator, watcher and synthesizer registrations. This is
  deliberate containment until a reviewed release includes WED-256; do not restart the current old
  homeserver and assume the pause will survive its startup registration repair.
- Pruned 9.72 GB of build cache and only the reviewed obsolete application tags. Running images,
  staging `release-67c1559...`, `latest`, and `rollback-before-wed-179-180` were retained.
- Deleted 1,942,708 audit rows older than a fixed seven-day cutoff in 195 committed batches and ran
  `VACUUM (FULL, ANALYZE)` only on `curator_run_audit`. It fell from 6.526 GB to 2.522 GB.
- Kept the newest three backup archives (2.6 GB), made three-day backup retention active, created and
  verified a post-cleanup database backup, and reduced the journal from 479.9 MB to 98.7 MB.
- Root disk moved from 87% used (6.1 GB free) to 52% used (22 GB free). The affected account produced
  zero new audit rows in the final two-minute observation. Full evidence is in
  `Documents/verification/wed-256-oracle-storage-cleanup-2026-10-25.md`.

Verification:

- Pass: 22 curator units, 9 daemon-registry units, migration-catalog contract, disposable-Postgres
  exact-kind/one-time-marker/no-audit/no-retry regression, `cargo check`, targeted rustfmt, shell
  syntax, operations-script dry-run, `git diff --check`, and new-file line budgets.
- The inherited unused `user_id` warning in `email_group_routes.rs` remains unchanged.
- Application containers remained running; Electric remained healthy. `/healthz` and `/readyz` are
  intentionally session-protected in this deployed revision and returned unauthenticated 401.

Next:

- Review and promote the committed WED-256 slice from the advanced branch before resuming the three
  paused registrations. The storage operation intentionally did not deploy unrelated in-progress
  WED-255 Email Worker work, and no mail, catch-all, sender-mask, policy-V2 or release flag changed.

## 2026-10-25 - WED-257 recipient encryption and SeaweedFS boundary (Codex, in progress)

Changed:

- Replaced the server-held vendor-email quarantine key with recipient-only X25519 envelopes derived
  from the signed verified vendor AgentCard. Added recipient agent/key database binding and fail-closed
  ClamAV scanning before persistence.
- Aligned browser and Rust envelope derivation on a fixed HKDF-SHA-256 vector and reject a mismatched
  browser key version before decryption.
- Replaced SeaweedFS credential defaults/environment injection with file-backed app/admin identities,
  bucket-scoped application actions, an internal storage network and authenticated readiness.
- Documented the important boundary: this slice protects newly retained vendor email, not all legacy
  AFP, and cannot hide plaintext from a malicious live email/gateway operator.

Verification:

- Pass: recipient crypto 2/2; browser derivation 2/2 plus typecheck; vendor provider 4/4; ingress units
  3/3; migration catalog 1/1; database-backed ingress 1/1; four Compose renders; entrypoint syntax;
  disposable SeaweedFS access rehearsal. Evidence is in
  `Documents/verification/wed-257-recipient-storage-security-2026-10-25.md`.
- Oracle inspection was read-only. Current storage has no public port and restrictive host file modes,
  but the running container remains on the broad default network with environment credentials.

Next:

- Design and implement account/device key registration, multi-device recovery, revocation and legacy
  AFP migration before claiming product-wide operator-resistant messaging. Rehearse the existing 2 GB
  SeaweedFS volume migration and rollback before any production restart. Keep mail and policy V2 off.

## 2026-10-25 - WED-258 safe enquiry attachments and evidence-led labels (Codex, complete)

Changed:

- Added couple-enquiry and claimed-vendor-response attachments for PDF, DOCX, TXT, JPEG, PNG and WebP,
  capped at five files. Uploads are purpose-bound and private; send/submit revalidates tenant or
  invitation ownership, size, SHA-256 and type and rescans with ClamAV before use.
- Added attachment delivery to Gmail, Graph and SMTP without accepting browser file paths or storage
  credentials. Vendor response ciphertext carries only the corresponding IDs, hashes and source refs.
- Replaced ambiguous comparison actions with consequence-led enquiry/conversation/quote/booking labels,
  and separated suitability evidence from business-source verification.
- Added a reproducible five-fixture quote comparison runner and user-facing fairness report. It keeps
  all options conditional while availability is unknown, corrects a mandatory security charge, exposes
  a deposit mismatch and does not equate estimated or "from" prices with complete totals.

Verification:

- Pass: `cargo check --lib`; quotation 14/14; vendor-response transport 7/7; wedding attachment 1/1;
  Gmail MIME 2/2; frontend typecheck; focused frontend 42/42; full wedding 1968/1968; production Vite
  build; both line-budget guards. New files range from 33 to 296 lines, except the 211-line example.
- Policy V2 and all rollout flags remain unchanged. No deployment was performed. The pre-existing
  untracked `artifacts/oracle-production-proof-deploy/` directory remains untouched.

Next:

- Review the committed WED-258 slice, then exercise real Gmail/Graph/SMTP sends with clean and infected
  fixtures in an authorized environment before rollout. Continue WED-257's broader device-key and
  legacy-AFP design separately; this slice does not claim product-wide operator-resistant messaging.

## 2026-10-25 - WED-259 normalized quotes and actionable six-stage journey (Codex, complete)

Changed:

- Added one evidence-led normalized quote projection to the inline vendor response card and Documents,
  while retaining the original quote attachment as separate evidence. A recommendation stays
  conditional until the event basis, availability, comparable total and material terms are present.
- Replaced the cosmetic stepper with the six requested stages and an in-place, categorized,
  chronological task list. Stage selection does not navigate away from Wedding Home.
- Classified existing tasks, added missing research-backed task templates, and corrected recognized
  late-stage prebuilt deadlines relative to the wedding date without changing user-created deadlines.
- Added AFP-backed task creation with stage/deadline to Tasks and Timeline, deadline editing in both,
  and a shared completion projection/event used by Home, Timeline, Tasks and People.
- Updated wedding design-system guidance and regression coverage. Policy V2 and rollout flags were not
  changed; the pre-existing Oracle proof artifact directory and noisy Rust line-ending paths remain
  untouched.

Verification:

- Pass: Solid typecheck; focused quote/journey/persistence tests; all 1,974 wedding tests; production Vite build;
  both line-budget guards; 33 Rust quotation tests; `git diff --check` (line-ending notices only).
- All new files are below 1,000 lines. The large existing response/quote state owners remain within
  their enforced grandfathered budgets and were not expanded beyond them.

Next:

- Review the committed WED-259 UI in a real account with an extracted quote containing the wedding
  date, 90-guest basis, confirmed availability, deposit/payment schedule and exclusions. Confirm that
  Home and Documents show the same normalized facts and that the original file opens separately.
- Exercise task create/date/complete from Home, Timeline, Tasks and People after a refresh to verify
  server persistence in the target environment. No deployment was performed in this slice.

## 2026-10-25 - WED-260 continuous wedding focus and responsibility (Codex, complete)

Changed:

- Added a compact owner control to task rows on the Home journey, Tasks, Timeline and the generic
  wedding task board. It accepts saved people or a typed name, persists immediate local state and emits
  the existing AFP wedding-helper responsibility record. The decision-focus assignment path now uses
  the same contract.
- Projected the latest AFP responsibility and task-completion records back into canonical task items,
  so owner and done status survive refresh and completed tasks leave the decision queue.
- Removed the wedding three-item cap and the vendor-response three-flow truncation. Desktop presents
  one next card; the mobile deck is sequential and cannot browse to a false end state. Other pending
  queue work and deferred items remain explicit before the true all-clear state.
- Added `Documents/wedding research/wedding-planner-ux-value-opportunities-2026-10-25.md`. It recommends
  a versioned, recipient-scoped, revocable run sheet as the next value/virality slice, followed by
  critical-path, compressed-plan, RSVP and day-of exception improvements.

Verification:

- Pass: Solid typecheck; all 1,977 wedding tests; focused assignment, queue and mobile tests; production
  Vite build; both line-budget guards; `git diff --check` except expected Windows line-ending notices.
- New files are 82, 109, 73 and 40 lines. The already-large workspace state remains exactly its prior
  line count, and the assignment refactor shrinks the large workspace component. Policy V2 and rollout
  flags are unchanged.

Next:

- Review assignment and sequential focus with a real couple account across a reload and a second
  browser/device. The next product slice should specify and prototype the controlled run-sheet share
  flow before adding external delivery or vendor editing. No deployment was requested or performed.

## 2026-10-26 - WED-261 bounded wedding AI and consent-first enquiries (Codex, complete)

Changed:

- Added account and wedding-plan cost/token gates backed by existing budget configuration and the
  append-only provider usage ledger. Outreach can fall back to a grounded deterministic draft; quote
  normalization stops for manual review rather than using weaker inference.
- Made saved AFP enquiry drafts the tenant-scoped generation cache. The draft stores bounded sources,
  grounded fields, input/prompt fingerprints, model/tokens/cost, approval and revision lineage. Opening,
  editing or reopening does not call the model; explicit meaningful regeneration creates a successor.
- Added consent-first enquiry controls and exact preview. Protected replies default on; budget and phone
  sharing default off; reminders default on. External send requires recipient/content/shared-information
  acknowledgement, and protected delivery remains blocked while the reviewed relay is unavailable.
- Added contextual trust disclosures at vendor selection, normalized quote and unanswered follow-up, plus
  an expanded public Wedding FAQ. Updated the wedding quotation/booking design specification with the
  five AI context and cost rules.
- Froze the review instructions on product commit
  `7b754338fb1e6b777158e517733f028b5aa4d281`. Updated all three workbooks in the user-requested root
  Documents folder and the tracked human-review form with concrete consent, trust, bounded-AI and audit
  scenarios. Existing browser answers for known stale candidates reset instead of being carried forward.

Verification:

- Pass: `cargo check --lib`; Rust outreach 10/10; quotation 33/33; Solid typecheck; focused consent and
  outreach 26/26; all 1,984 wedding tests; Wedding site/CSP smoke; production Vite build; both line-budget
  guards; review-page script syntax; tracked human-review Playwright 2/2.
- New files are 30â€“111 lines; the expanded design specification is 723 lines and the extracted outreach
  route is 790 lines. Policy V2 and all mail/relay rollout flags remain unchanged. No deployment occurred.

Next:

- Human reviewers can use the three HTML workbooks, but must test a hosted runtime whose SHA matches the
  frozen candidate. The Email Worker/reply relay, provider smoke, independent security/privacy,
  accessibility/usability/wording, hosted shadow and cohort evidence remain external gates; do not enable
  protected external delivery based on local test success alone.

## 2026-10-26 - WED-262 granular enquiry disclosure and quiz profile handoff (Codex, complete)

Changed:

- Added vendor-scoped, mobile-first disclosure choices directly below the editable enquiry message for
  date/season, general location, estimated guest count, style/priorities and approximate category budget.
  Phone, reminder and protected-reply choices remain explicit per vendor. A changed disclosure fingerprint
  invalidates the reviewed draft until the user explicitly regenerates it from only the allowed facts.
- Hardened the static Wedding Animal Quiz: no API transport or embedded backend/secret, bounded local and
  hash input, no names/budget/full brief in public share hashes, and no silent profile import. The explicit
  account action creates a minimal expiring handoff which the workspace validates, writes to the existing
  private AFP preference/intake profiles without overwriting current facts, and then consumes.
- Tracked and published the requested article, quiz and local assets. Versioned quiz asset URLs bypass the
  superseded Cloudflare cache entry without broad cache invalidation.
- Added the vendor onboarding/value-discovery specification and dependency-ordered WED-263-WED-270 task
  plan. It builds on claim, ownership, enquiry, quote, attachment, sender and billing foundations; AFP stays
  canonical, A2UI is used where its allowlist fits, and paid conversion follows demonstrated value.
- During Oracle release, completed the previously reviewed file-backed SeaweedFS credential migration with
  fresh root-owned mode-0600 app/admin credentials. Added a CRLF-safe launcher to all Compose profiles after
  a Windows bind-mounted shell script exposed the missing guard. No credential value was logged or copied.

Verification:

- Pass before release: typecheck; 20 focused disclosure/quiz tests; all 1,987 Wedding tests; Wedding
  site/CSP/quiz smoke; production Vite build; line-budget check. Final regression after the storage guard:
  all 1,991 Wedding tests, typecheck and both line-budget checks.
- Pass after hotfix: four Compose configurations; secure-entrypoint regression 4/4; authenticated Oracle
  production proof with backup verification; public 200/CSP checks for the article and quiz; hardened quiz
  asset cache MISS with explicit handoff/account source and no network APIs; live workspace chunk contains
  vendor-scoped information, budget, phone, reminder, protected-reply and draft-update controls.
- Production application/static commit: `f6b00e8a4dabf319ac7a8aefd7cece87cb9c89a9`. Policy V2 and all
  mail/relay rollout flags remain unchanged. The Cloudflare token can read the zone but lacks cache-purge
  permission; no token value was exposed.

Next:

- Implement WED-263 first from the nominated build base, then the value-first claim/onboarding slices in
  dependency order. Do not enable protected external replies or paid vendor features until their existing
  security, provider, usability and cohort gates pass.

## 2026-10-26 - WED-271 onboarding, deal-breakers, durable publishing and relay hardening (Codex, complete)

Changed:

- Added eight sub-30-KiB local WebP choice cards to wedding onboarding, with dimensions, async decode,
  first-row eager loading and later lazy loading. The chosen words remain editable.
- Added one private AFP/A2UI deal-breaker ledger and editor to Vision, vendor enquiry preparation and
  quote review. Enquiry drafting uses disclosed deal-breakers as questions to confirm, never as proven fit.
- Added a reusable accessible large-action confirmation dialog and persistent inline help. Applied it to
  clearing onboarding vendors, seating changes/draft hiding, deal-breaker removal and global vendor deletion.
- Added migration 0120, a focused DB owner, sanitized admin HTML publishing, public DB-backed article/list
  routes, static journal projection and Caddy precedence. Articles survive source tree/deployment changes.
- Hardened Worker ingress with strict RFC822 media type, digest-keyed recipient throttling, pre-scan exact
  replay short-circuit and accurate post-scan quarantine state. Flags and Cloudflare routing remain off.

Verification:

- Pass: `npm run typecheck`; all 1,996 wedding tests; Wedding site/CSP/quiz smoke; production build; both
  line-budget checks; `cargo check`; migration catalog; focused sanitizer/blog, relay HMAC, deterministic
  outreach, SMTP-in and SMTP-out tests; Worker 7/7; published-blog JS syntax; `git diff --check`.
- Docker Desktop was unreachable, so migration 0120 was not applied to disposable Postgres. The catalog
  embeds it and compiles, but a DB apply remains the first pre-deploy check.
- No deployment, provider send, Cloudflare routing mutation or rollout-flag change occurred. Existing
  unrelated line-ending-only dirty paths and the Oracle proof artifact directory were left unstaged.

Next:

- Start Docker and apply all migrations to disposable Postgres, then exercise admin draft/publish/update,
  public list/article and sanitization rejection paths. Continue WED-263 vendor activation only after that
  proof; do not enable relay or policy V2 before the existing human/hosted gates pass.

## 2026-10-27 - WED-272 public quote study and executable human gates (Codex, complete)

Changed:

- Added the public Wedding quote-intelligence article, upload/paste interface and blog index card. The
  requested OpenRouter `openai/gpt-5-mini` editorial call succeeded using the root environment secret;
  no credential entered source, output, browser code or logs.
- Added migration 0121, a focused DB owner, a dark-by-default public submission/deletion route and an
  operator-only admin panel. Submission requires current explicit consent and authority, strict file
  verification, fail-closed malware scanning and SeaweedFS-only raw storage. Analysis reuses the existing
  venue/generic registries and labels inferred content instead of presenting it as a confirmed quote fact.
- Added per-client/global cost limits, hashed deletion receipts, source-metadata scrubbing on deletion,
  Caddy body/routing rules, no-store authenticated downloads and server-only OpenRouter processing.
- Rebuilt all three review workbooks around the supplied Human Gate Execution Protocol. Each has at most
  three real human gates with objective evidence fields; signed export is impossible until autonomous
  work is cleared. Mirrored the pages and shared assets to the exact root Documents folder.

Verification:

- Pass: `cargo check --lib`; quote-study Rust tests 3/3; embedded migration catalog 1/1; disposable
  Postgres schema replay through 0121 with 15 quote-study constraints. The legacy `0092b` photo
  enrichment was explicitly omitted because an empty DB lacks its production vendor seed rows.
- Pass: Solid typecheck; all 1,999 Wedding tests; focused study tests 3/3; Wedding site/CSP/quiz smoke;
  production build; source/Wedding line budgets; Caddy validation; review Playwright 3/3; JS syntax,
  focused secret scan and `git diff --check`.
- Docker had Postgres available but no running ClamAV or SeaweedFS service, so a real public-route upload
  was not claimed. Direct GPT-5-mini access was verified, while the product study flag remains false.
- No deployment, provider mutation, relay/mail enablement or policy-V2 change occurred. Unrelated dirty
  source files and `artifacts/oracle-production-proof-deploy/` were left unstaged.

Next:

- Before enabling the study, configure server-side OpenRouter/SeaweedFS secrets, start ClamAV, apply 0121
  to the target DB and run one consented disposable TXT plus PDF through submit, admin download and token
  deletion. Keep the flag false if any scanner/storage/model/deletion step fails.
- Continue autonomous evidence named in the review pages. Only after it is removed from `remaining` and
  committed should a reviewer freeze that exact SHA and begin the grouped human gates.

## 2026-10-27 - WED-273 vendor discovery, claim matching and lifecycle release (Codex, complete)

Changed:

- Corrected solo Wedding Animal Quiz sharing to say “my wedding” and removed emoji-dependent share
  symbols; replaced the legacy Wedding Understanding home form with a distinct quiz entry.
- Made the public vendor directory database-backed for the complete bounded active catalogue, with nine
  category filters and canonical claim links. The authenticated claim flow now labels the field Business
  name and offers at most eight rate-limited fuzzy matches before ownership proof begins.
- Added one account-scoped AFP projection for enquired, favourited, quote-received, booked and reminder
  status. Wedding Home and Response Queue consume it; quote-backed booking is explicit and records no
  payment, while future reminders stay hidden from Home until due.
- Made the public quote-study consent notice available without JavaScript and its detailed privacy text
  expandable. Added `.seaweedfs-admin-secrets` to `.dockerignore` after the first build correctly refused
  to read that root-owned runtime secret directory.

Verification and release:

- Pass: typecheck; focused lifecycle/static tests 8/8; all 2,004 Wedding tests; Wedding site/CSP/quiz
  checks; vendor-claim Rust tests 4/4; rustfmt; production build and line budget. The catalogue-cap follow-up
  reran all 2,004 Wedding tests and the four Rust tests successfully.
- Deployed from an isolated detached worktree, ending at `bc1318d`. The first successful release completed
  a full backup verification and restore drill with `STATUS=pass`; the final three-line catalogue-cap
  release passed a fresh runtime/backup proof with restore skipped because no schema or storage changed.
- Live HTTP checks confirm the corrected quiz copy with no replacement character, the home quiz entry,
  category controls, static/expandable quote consent, Business name claim copy and authenticated 401 on
  anonymous fuzzy-suggestion access. The built Response Queue chunk contains Remind plus Enquired,
  Favourited and Quote received lifecycle controls.
- Read-only Oracle SQL reports 455 active vendors. The public API returns exactly 455 unique slugs across
  nine categories. The pre-existing photographer evidence remains exactly 93 distinct vendor IDs and 441
  attributes; no source data or importer was uploaded or rerun.
- `OMNYID_VENDOR_MAIL_ENABLED=false`; quote-study, Email Worker ingress and ranking-policy-v2 flags remain
  absent/default-off. Unrelated dirty Rust work and existing proof artifacts were not committed.

Next:

- Human review may exercise the live reminder/booking flows with a signed-in couple and fuzzy claim lookup
  with a signed-in vendor. Do not enable mail/relay, quote-study or ranking-policy-v2 from this release.

## 2026-10-27 - WED-274 professional planner workspace specification (Codex, complete)

Changed:

- Added a professional wedding planner workspace specification based on an inspection of the live Weddly
  PWA and the supplied supplier promises. It adapts the useful workflow concepts to OmnyID rather than
  copying pages or introducing a parallel CRM.
- Defined an opt-in practice shell over ordinary Wedding templates: one AFP ledger per client, explicit
  collaboration grants, a permission-safe practice index, role-appropriate projections and A2UI only for
  allowlisted contextual surfaces.
- Defined cohesive mobile/desktop navigation and enquiry, capacity, hold, supplier profile, itemised quote,
  booking, deposit and balance journeys. Quote acceptance, booking confirmation and payment evidence remain
  separate authoritative states.
- Added a detailed dependency-ordered WED-275 through WED-284 task plan covering contracts, practice mode,
  client grants, inbox, calendar/holds, suppliers, quotes, closure, hardening and an allowlisted cohort.
- Mirrored both documents to the exact requested root `Documents/design/wedding planner/wedding planner`
  folder while keeping the committed copies in this advanced isolated worktree.

Verification:

- Both documents are below the 1,000-line limit (545 and 619 lines).
- Root and worktree copies match after newline normalization.
- `git diff --check` passes for the WED-274 scoped paths.
- This documentation-only slice did not alter executable code, run an application build or deploy.
- Unrelated dirty Rust/test files and Oracle proof artifacts remain unstaged and out of scope.

Next:

- Begin WED-275 with a repository-level reuse and authority inventory before adding any migration or UI.
  Reserve WED-275 through WED-284 in the canonical task ledger as each slice starts and keep all new flags
  dark until the WED-283 evidence gates and WED-284 allowlisted cohort are complete.
## 2026-10-28 - WED-287 task interaction and category-budget reconciliation (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch `agent/codex/WED-287`; implementation SHA `83cb8d02aed5fd2bb8850bb7e38c84b7d2d0e473`.

- Seeded five early-bound run-sheet handoffs, added in-stage AFP task creation with owner/deadline, dropdown assignment, shared completion behavior and labelled status rails. Assign/Reopen no longer force the full refresh that moved focus or made Home appear frozen.
- A successful deal-breaker save hides the Home prompt immediately while the Inspiration editor remains available. Vendor drafts now use the matching category allocation, keep total-budget fallback only when necessary, and clear every budget field on opt-out.
- Evidence-backed booking reconciliation now carries a visible explanation for linked booking, budget, task and decision projections; quote acceptance alone still cannot confirm booking. Policy V2 remains disabled and nothing was deployed.
- Pre-freeze evidence: 2,012 Wedding tests, 13 focused frontend tests, five focused Rust outreach tests, TypeScript typecheck, production UI build and both line-budget guards passed. Final clean-SHA verification follows the coordination commit.

## 2026-10-29 - WED-288 Master Agent conversation and run-sheet database design (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch `agent/codex/WED-288`, based on `cddee82000ae344b057d7d7fdca84addc281403a`.

- Master Agent commands now dispatch planning and delegated calls through the account's exact resolved backend and model, including supported OpenAI-compatible and Ollama configurations. Continuity, approval and direct orchestration use the same contract.
- The visible result is a safe two-turn conversation surface that preserves paragraphs, bounded bullets and safe links. Plain provider output remains visible; malformed output and provider failures use non-technical UI copy and do not expose response bodies or credentials.
- The Settings connection test now makes a bounded eight-token request against the selected model. Provider-specific defaults are shared with config persistence, and a provider change without a new key no longer reuses the previous provider's encrypted key.
- Added `Documents/design/database/wedding-runsheet-database-spec.md` and `wedding-runsheet-database-tasks.md`. They define `wedding_runsheet.v1` as a profile of the existing generic Database surface, preserve arbitrary user-created databases, project incrementally from the wedding AFP ledger, and split implementation into WED-289 through WED-295.
- Verification passed: two conversation-state tests, two focused Master Agent render guards, TypeScript typecheck, production UI build, source and Wedding line budgets, `git diff --check`, and the focused Rust provider/orchestrator suites recorded in the final handoff commit evidence.
- No live provider key was called during development, no production configuration changed, policy V2 remains disabled and nothing was deployed. The run-sheet implementation itself remains future work under WED-289 through WED-295.
- The full `master-agent-render-guard.test.ts` still contains an unrelated pre-existing `Show guide` expectation for the current Response Queue; only the WED-288 Master Agent cases were selected here.

## 2026-10-29 - WED-289 database contract freeze and email-gate simulation audit (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch `agent/codex/WED-289`, based on WED-288 commit `5b51eeb724303b49e914e3623789c61bfb8f633d`.

- Added a versioned Rust and TypeScript contract registry for database records, revisions, schema, definitions, profiles, saved views, archive events and projection receipts. Canonical rows carry database/record identity, revisions, action idempotency and source references.
- Extracted canonical AFP commands from the oversized Database view. Database create/import/edit/schema and Bento Data Quick Add now use one writer; the old neutral `database` family remains read compatibility only.
- Added deterministic compatibility projection for legacy/mounted records, out-of-order revisions, exact retry deduplication, tombstones, orphan/conflicting revisions and cross-database denial. Unsupported or incomplete canonical versions fail closed.
- The Database view is 60 physical lines smaller than its starting version; all new files are below 1,000 lines. No run-sheet page, relational row store or dual-write was introduced.
- A read-only aggregate Oracle query inspected only database-family type/kind/version counts across public and account message stores and observed zero rows. No production record content or identity was exported and no migration/rewrite was created.
- Gate audit: Gate 2 is not passable by implementing-agent simulation because it requires independent security/privacy authority. Gate 3 has real prior route/receipt/reply/replay/restoration evidence at `9e1be33`, but still lacks a provider-observed bounce, saved SPF/DKIM/DMARC original, couple-facing identity-separation confirmation and one operator-signed digest-bound report for the frozen candidate.
- Safe reruns passed: 7 Worker tests, 7 provider units, 4 ingress units, 7 SMTP-out units, one disposable-Postgres complaint/no-retry integration and 3 live disposable ClamAV cases. These remain autonomous evidence, not substitutes for the missing external/human proof.
- WED-289 verification passed 6 Rust contract tests, 13 frontend database tests, TypeScript typecheck, all 2,012 Wedding tests, production UI build and both line-budget checks. The build reports only the existing large-chunk warning.
- No Cloudflare/provider/routing/allowlist/Oracle write, production flag change, deployment or policy-V2 enablement occurred. Next dependency-ready slice is WED-290 generic database definitions, creation and switching.
## 2026-10-29 - WED-296 owner-authorized Wedding release candidate (Codex, in progress)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch `agent/codex/WED-296`, based on WED-289 commit `259c0a5e0175a30131d95eea841fafb2b51abd3c`.

- Recorded the owner's explicit statement that every human review in the three Wedding workbooks is complete and that Policy V2, quotation intelligence and their remaining workbook-gated capabilities are approved for release. The record does not invent reviewer names, private reports or signatures.
- Cleared the workbooks' stale autonomous-work lists only after the underlying Worker/SMTP/provider, disposable ClamAV/Postgres, quotation, Wedding, browser, build and line-budget evidence had repeatable coverage. The workbooks still require exact candidate/runtime identity, report digests, named authority and final sign-off context.
- Repaired Policy V2 rollout wiring to use the architecture-defined `VITE_WEDDING_VENDOR_RANKING_POLICY_V2` build flag, and added its default-off Docker/Oracle build boundary. Added the three missing vendor-response quotation capability flags to every Oracle homeserver profile, also default-off.
- Added a reproducible clean-commit evidence-record generator for the ten WED-225 verifier inputs. The owner authorization and release assessment explicitly preserve the corpus and earlier live-provider evidence limitations instead of silently rewriting them.
- Pre-freeze verification passed: 2,014 Wedding tests, focused Policy V2/release-wiring tests, TypeScript, Policy-V2 production build, eight workbook Playwright cases, both line budgets, three Compose parses, seven quotation-readiness tests, four Worker ingress tests, five SMTP-in tests, seven SMTP-out tests, seven provider tests, one disposable-Postgres complaint/no-retry test, and three live disposable-ClamAV tests.
- Oracle read-only preflight found 12 GB free (75% used) and all three vendor-mail kill switches false. No production flag, route, provider, allowlist or deployment changed during candidate preparation.
- The first frozen-candidate verifier passed the quotation/browser/migration/2,014-Wedding-test/build and every external evidence gate, then correctly rejected the candidate because the already oversized shared API module had grown by 40 lines. Vendor transaction upload and vendor-outreach request clients were extracted into focused modules; `api.ts` is now 45 lines below its WED-225 baseline, typecheck and 35 focused tests pass, and no behavior or release flag changed.
- The next exact verifier passed those same checks but surfaced four physical lines of unrelated historical growth in `daemon_runtime.rs`; its existing retention logging match was compacted without changing behavior so the global guard remains authoritative.
- The subsequent exact verifier again passed all functional/evidence checks and exposed the final two-line historical overage in `db.rs`; two separator-only blank lines were removed, with no executable change.

Next: freeze the candidate commit, generate commit-bound evidence, run the full WED-225 verifier, inspect non-secret production provider readiness, then deploy and enable only controls whose runtime prerequisites are present. Exact-recipient allowlisting remains mandatory. After production health/identity proof, begin WED-290.
