## WED-377 deployed and verified — 2026-11-19 09:14 UTC

Live application source b9ead5298fb0cff77ef552c1dc4281e6d35c6bc8. Clean verification:
C:/temp/wt/omnyid-wed377-verify. Implementation: C:/temp/wt/omnyid-wed376,
agent/codex/WED-376 (later commits are coordination/evidence only).
Image sha256:a086dba378880b9a8d19e68dfc403efa27356c0ecee5e136755edc0bddff4fa6.
Machine release evidence: Documents/verification/WED-377-release-evidence.json,
C:/temp/wt/wed377-production-release-evidence.json and Oracle candidate
/home/ubuntu/omnyid-candidates/wed377-b9ead529/production-release-evidence.json.
Live release-manifest.json matches the actual running image and verified source.

Quote fallback preserves both saved proposal totals/GST, excludes wrapped hourly extras,
and withholds comparison prices for conflicting totals. Changed guest counts require
revised package pricing. Versioned scripts prevent prior cached Sprout/directory/quote
assets. Sprout now opens /workspace/?auth=signin&source=wedding, with visible email/password
and Google button. All91 changed static files deployed; Caddy remained unchanged.

Evidence: 2312 Wedding tests, typecheck, line budget, public-site checks, frontend build,
mobile browser test, optimized native ARM build, seven Rust quote tests, five staged HTTP
quote cases and browser use of all five responses across8/24/60/120/180guests. Native test
compile took14m17s; all7 tests passed. Postdeploy authenticated health200 and five public
browser paths200. Sprout click-through reaches active workspace form. Live bev search has
six matching names including Celebrations By Bev; beva haszero; videographer chip countone.
Initial directory smoke sampled pre-debounce results; the final check awaited the query
response and matching rendered count. Google account completion is still not tested.

Rollback: previous image sha256:88b5883d3a326608d6107a049c2931ea6dc9dbe1761fb4774199861633bd6024,
tag omnyid-homeserver:wed377-rollback-1e79ec2c. Candidate rollback/ contains current runtime
compose snapshots, Caddyfile.before and web-before.tar.gz. Restore homeserver with saved
rollback compose (--no-build --no-deps --force-recreate), then restore saved static files;
Caddy unchanged. No new migrations, no pruning and no outreach/paid model calls.

WED-377 is complete. WED-376 remains open for actual Google account-selection error
verification; the earlier async request for error detail has no reply. WED-375 retains
five hosted/model/provider rollout gates. GitHub push/PR could not complete: OAuth
credential lacks workflow scope for inherited .github/workflows/ci.yml changes. Local
commits preserved; do not bypass permission or rewrite history to conceal the rejection.
Recommended next work: obtain Google error details/owned browser completion and arrange
hosted Runbook shadow/deterministic cohort evidence before any model/tool promotion.

## WED-377 native build and staging quote/UI checks complete; Rust test compile pending

Application source b9ead5298fb0cff77ef552c1dc4281e6d35c6bc8, verification worktree
C:/temp/wt/omnyid-wed377-verify. Native optimized ARM build completed in16m51s.
Binary SHA256 77d2dc08fa1ea73a77b91be820945d7ff74db1bf6b78d02d53050005c9a19db5.
Candidate image sha256:a086dba378880b9a8d19e68dfc403efa27356c0ecee5e136755edc0bddff4fa6
is running on isolated staging only. Production remains1e79ec2c.

Oracle candidate wed377-b9ead529/staging-quote-evidence.json records five successful
HTTP checks: both existing samples preserve51110/31096.4, GSTincluded and120guests;
conflicting totals clear monetary inputs; wrapped extras do not become base prices.
Authenticated staging health200. Browser exercised all five captured hosted responses,
manual field application, Compare stated terms and guest counts8/24/60/120/180.
Machine output C:/temp/wt/wed377-hosted-quote-browser-retry.log; exit0. Initial browser
harness missed the Compare button; retained failed harness log, corrected harness passes.
Both samples remain priced only at their quoted120guests; conflicts remain unpriced.

Native cargo test --release --lib server::wedding_quote_decoder_routes is still compiling
in omnyid-wed377-candidate-tests. Source unchanged; target cache retained. The encompassing
build.exit is written after tests, so its absence is expected until then. No production
switch until build.exit and tests.exit both0. Stage helper was permitted to overlap
isolated test compilation after the optimized binary was copied and hashed; production
helper explicitly checks both final exit files. Current live rollback image1e79ec2c
is tagged omnyid-homeserver:wed377-rollback-1e79ec2c, snapshots in candidate rollback/.
GitHub push remains permission-rejected; details below. Google account completion remains
unverified and five Runbook rollout gates stay open.

## WED-377 reviewed follow-up b9ead529: verification and release pending — 2026-11-19

Frozen source b9ead5298fb0cff77ef552c1dc4281e6d35c6bc8; clean verification
C:/temp/wt/omnyid-wed377-verify. Implementation C:/temp/wt/omnyid-wed376,
agent/codex/WED-376. Production remains WED-376 1e79ec2c until release evidence says otherwise.
Review found wrapped/plural hourly extras and conflicting-total/GST cases. The parser
now rejects supplemental adjacent context and suppresses every monetary comparison input
when proposal totals conflict. Mixed GST wording remains unknown. Independent read-only
review found no further concrete blocker. Added sample and adversarial regressions.

Machine-collected local evidence C:/temp/wt/wed377-b9ead529-local-evidence.json records
2312 Wedding tests, public site suite, line budget, typecheck, frontend build and mobile
browser checks, all exit0. Earlier 05e33078 local Rust attempt received SIGKILL under the
4GiB WSL host; it is a failed attempt, not passing evidence. Native ARM release followed
by targeted release-profile Rust tests now runs in isolated Oracle candidate
/home/ubuntu/omnyid-candidates/wed377-b9ead529. Poll build.log/build.exit and tests.log/tests.exit.
Do not ship unless both exit files exist and equal0. Source archive hash
9aa940ce23a93aa8b4d97991ae1134d2a16b0fe37e3db0612d103096222b6d86; omitted external
include files were restored from git show at the same SHA, recorded with hashes in
supplemental-source-manifest.json. No source edits in candidate. Persistent isolated
8GiB tmpfs target and registry cache retained. Build bounded to2CPUs/12GiB; no pruning.

Preflight-evidence.json records91 static hashes, zero live drift, unchanged validated
Caddy, >4GiB disk headroom and no migration change. Current production/staging runtime
compose snapshots, Caddy and static backup are in this candidate's rollback directory.
Use C:/temp/wt/wed377-stage.py only after native build/tests pass, then
wed377-staged-quotes.py (five bounded quote calls, no model spend). Deployment helper
wed377-production-deploy.py needs test credentials injected in memory; never store them
in this handoff. Actual Playwright public smoke follows origin authenticated health;
rollback if it fails. Versioned static URLs are still pending release.

Git push was rejected by GitHub: connected OAuth credential lacks workflow scope to
update .github/workflows/ci.yml in inherited branch history. No remote branch/PR created;
local commits preserved. Do not bypass this permission by rewriting history. Latest CI
runs returned failures for other SHAs, so local checks do not imply CI passed.
Workspace browser presently renders email/password inputs and Google iframe; actual
Google account completion remains unverified. Five WED-375 hosted/model/provider gates
remain open. No external outreach, paid calls or Runbook action rollout enabled.

## WED-376 live; WED-377 exact-source follow-up builds running — 2026-11-19

Production application: 1e79ec2c2397929680e1bd662e6f7123c22ba9d9; release evidence at
C:/temp/wt/wed376-production-release-evidence.json and Oracle candidate directory
/home/ubuntu/omnyid-candidates/wed376-1e79ec2c/production-release-evidence.json.
Image sha256:88b5883d3a326608d6107a049c2931ea6dc9dbe1761fb4774199861633bd6024.
First deployment auto-rolled back after Python urllib hit Cloudflare 1010. No browser
outage was observed. Retry passed actual Playwright browser checks for five public
paths and authenticated backend health. Imported 1915 records; 1927 workbook rows
resolved. Live search bev returns six including Celebrations By Bev; beva returns zero.
Preserve rollback directory; no prune/deletion performed. ClamAV remains repaired.

Current follow-up source e9c4abb6a508c354c089ca83c4060d0c47db7fb5 on
C:/temp/wt/omnyid-wed376 branch agent/codex/WED-376. Verification worktree is currently
still on preceding 05e33078 while its Rust unit compile runs; do not change it until
that compile ends. Then checkout frozen e9c4abb6 and rerun affected checks/build.
Quote implementation is in src/server/wedding_quote_decoder_routes/fallback.rs with
real sample and supplemental-rate regression tests; UI engine refuses fixed-total
comparison across different guest counts. Sprout directs to the active workspace form.
The earlier 05e33078 static agent.js hotfix is on origin but CDN may cache old unversioned
asset for four hours; e9c4abb6 versions all public agent URLs, directory and quote engine.
Deploy the versioned HTML/scripts after clean verification, then browser click through
must reach visible workspace email/Google form (Docs query alone is a retired surface).

Local 05e33078 frontend/typecheck/site/browser/linebudget checks pass. Docker Desktop
was stopped; normal application startup restored it. First Rust run failed pipe missing;
retry container omnyid-wed377-tests is compiling unit tests, log
C:/temp/wt/wed377-05e33078-rust-retry.log. Do not treat missing exit file as pass.
Native ARM frozen e9c4abb6 build is running outside the live tree in
/home/ubuntu/omnyid-candidates/wed377-e9c4abb6; poll build.log/build.exit.
Bounded builder: 2 CPUs, 12 GiB, Rust1.94, -j2, release root codegen64. Reuses a new
isolated exec tmpfs at /home/ubuntu/omnyid-candidates/wed377-target-cache (8 GiB) and
Docker registry volume omnyid-wed377-cargo-registry. Keep caches; no automatic prune.
Remote disk was 91%, 4.4 GiB free; deployment threshold98%, monitor before more copies.
Earlier 05e build was intentionally stopped to freeze versioned scripts; caches persist.
Real Google account completion is still unverified; workspace GIS button renders but
browser automation has no signed-in Google account. Do not claim that end-to-end passed.
Five WED-375 model/provider/hosted rollout gates remain; no paid calls/execution enabled.

## WED-376 Oracle release in progress; WED-377 sample quote finding - 2026-11-19

Implementation: C:/temp/wt/omnyid-wed376, agent/codex/WED-376.
Frozen release source: 1e79ec2c2397929680e1bd662e6f7123c22ba9d9.
Clean verification: C:/temp/wt/omnyid-wed376-verify.
Local logs C:/temp/wt/wed376-1e79ec2c-*: 2312 Wedding tests, site suite,
line budget, typecheck, frontend build, browser checks, 12 Rust contract/API tests.
Native ARM release and isolated staging at /home/ubuntu/omnyid-candidates/wed376-1e79ec2c.
Runtime manifest and staging-workflow-evidence.json there record full source/image hashes.
Staging workflow generated 1953 links over 20 pages; category filter, independent links,
14-day renewal, CSRF, date updates, non-celebrant restriction and revocation exercised.
Phone-bearing workbook staging import is idempotent. Production dry run: 1927 rows,
12 exact-ID matches, 1915 creations, no non-ID matches. Review flagged potential name-only
collisions in general; production wrapper rejects all non-ID mappings before insertion.
Existing five test accounts authenticated. New private synthetic intake scenarios saved
through /send; all owner reads succeed and all tested cross-owner reads return 404.
Evidence C:/temp/wt/wed376-account-scenario-results.json; no credentials committed.

Production scanner was already OOM/unhealthy. Raised only ClamAV to 3 GiB and persisted
OMNYID_CLAMAV_MEM_LIMIT=3g in private .env.oracle. Healthcheck, clean stream and EICAR
stream scans passed. Previous config/limits at wed376-412c0753/rollback.
Final release rollback snapshots at wed376-1e79ec2c/rollback include 707275478-byte
validated pg_dump, Caddy, runtime compose snapshots, workspace/public archives.
Previous image sha256:94f267dc1cccc2445e84f9391d3164d2ef1b1e47654a5c31e32d9aad1c17b039,
retained tag omnyid-homeserver:wed376-rollback-5536b83b.
Caddy candidate validates; only three policy lines change. Static drift differences
were CRLF only; normalized content matches the integrated SEO baseline.
Deployment was started; inspect production-release-evidence.json and running image
before claiming completion. Caddy must be recreated. User already authorized deployment.

WED-377: two existing fictional quotes exposed an older fallback extraction defect.
HTTP 200 alone is not quote correctness: extra beverage-hour $14 was misclassified as
base per-person price and explicit TOTAL/GST wording was missed. Fix separately and
retest samples plus changed guest counts; never declare quote evaluation passed yet.
Five WED-375 hosted/model/provider rollout gates remain separately tracked.
Google real-account selection remains unproven; candidate fixes demonstrated GIS CSP.

## WED-376 candidate verification in progress - 2026-11-19

Implementation: C:/temp/wt/omnyid-wed376, agent/codex/WED-376.
Frozen source: 2618fead7556ac8bfde987be7879a85247ef382e.
Verification: C:/temp/wt/omnyid-wed376-verify (clean detached).
User authorizes test-account creation if required, commits and Oracle release.
Five existing saved test accounts returned 200 with sessions. Existing quote
samples are in Documents/testing/venue-quote-samples. No credentials recorded.
Current production application manifest: 5536b83b2f9d2f58488a075f383c24f8f4f73d6c;
loopback port 18080. Existing isolated staging uses port 18081.

Candidate fixes public Google GIS CSP, adds accessible public Sprout entrypoints,
adds bounded all/category vendor calendar issuance preserving valid older grants,
renews only valid links, restricts non-celebrants to dates, serializes mutations,
curates default celebrants, supports literal partial-name search and deduplicates
category labels. Import tool prepares transactional reconciliation without
publishing workbook contact details. Spreadsheet has 1927 phone-bearing rows;
12 vendor references match current production IDs. Import not yet applied.

Cross-review caught and corrected request-generation and vendor/grant lock races.
Google policy source: https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
Preflight found ClamAV unhealthy (update database test killed by signal 9),
root disk 83%. Resolve scanner and confirm headroom before deploying. No live
configuration, database import, provider calls or release performed yet.

## 2026-11-19: WED-375 local pinned verification complete; five hosted gates remain

Implementation worktree: `C:/temp/wt/omnyid-runbooks`, branch `agent/codex/WED-375`.
Frozen application source: `61fcdf0bb5c2f2f87e36c1203e8fedf454661d29`.
Clean verification worktree: `C:/temp/wt/omnyid-runbooks-verify-43d7c830`.
This pass changes coordination/checklist documentation only; no application source.
Checklist: **112 complete / 5 remaining of 117**.

Machine-collected local evidence: `C:/temp/wt/runbook-61fcdf0b-pinned-evidence.json`.
It records the source SHA, clean checkout, builder image identity, Rust 1.94.0,
19 successful log hashes and optimized release binary hash. Pinned compiler
checks: 124 integrations and 385 distinct selected units, including migrations,
policy, Watcher, Synthesizer, approvals, quote ingress and shared funding.
Exact-source frontend evidence is reused with log hashes rechecked: 2312 Wedding
tests, five Runbook state tests, 15 browser scenarios including accessibility,
typecheck, both line budgets and production frontend build.
Optimized backend build: cargo +1.94.0 build --release -j1, root package
codegen-units=64, library and homeserver binary. This is local evidence, not CI.
Manifest SHA-256: `3f9a4bda621c3a5868ed10b77b1fdc58144962140cce3b4fdb176750ff1a1557`.
The dedicated `omnyid-runbook-wed375-pg` test database is stopped.
No shared containers, volumes, caches or worktrees were deleted.

Earlier integration/release attempts ended with Docker exit 125 during local
engine unresponsiveness. Normal Docker Desktop start recovered the engine;
no all-WSL shutdown or WSL configuration change occurred. First bounded retry
was killed with exit 101 because swap allowance was too small. Final integration
and release jobs ran sequentially with --memory 2800m --memory-swap 6g --cpus 1,
using existing WSL swap. Failed logs remain separate; none are counted as passes.
Unrelated Agenton services cannot resolve their pre-existing stopped PostgreSQL
dependency (Exited 127 seven months ago); left untouched. No production outage
or production change occurred. Earlier recovery/pending notes below are history.

Next: supply a hosted staging target and test-owner references, model/provider
sandbox with bounded funding, and an appropriate private review/CI repository.
The configured public concensure/OmnyID repository contains the old public core;
its candidate Actions query returned zero runs and environments were empty.
No push/PR was made because it would publish accumulated private workspace
history. Hosted shadow, deterministic cohort, model evaluation, sandbox actions
and final release/deployment evidence remain open. No execution entrypoint or
cohort was enabled. Production deployment still requires the AGENTS.md gate and
the user's go-ahead for the concrete candidate. Keep the source SHA unchanged
when consuming this evidence; a source change requires new candidate checks.

## 2026-11-19 resource-containment follow-up

The first bounded pinned integration retry exited 101 after rustc received
SIGKILL at the container limit. Docker stayed responsive. Host inspection found
WSL memory=4GB and swap=4GB, with about 3.5GB swap free. The initial container
--memory-swap=3g total allowed too little swap for this crate. No WSL settings
were changed. A sequential retry now uses --memory 2800m --memory-swap 6g
--cpus 1, allowing existing swap while bounding resident memory. A live cgroup
read showed about 1.2GB swap in use and zero oom/oom_kill events.

Current runner: C:/temp/wt/verify-runbook-pinned-swap.ps1; evidence prefix
C:/temp/wt/runbook-61fcdf0b-linux-rust1940-swap-tests. Only if this succeeds,
run C:/temp/wt/verify-runbook-release-swap.ps1 -Mode build at the same frozen
SHA, sequentially. Release retains optimization and sets root codegen-units=64.
Do not reuse the killed bounded attempt or the engine-interrupted attempts.

## 2026-11-19 recovery update (supersedes pending-shutdown note below)

After the failed restart, `docker desktop status` could no longer reach its
control service. `docker desktop start --timeout 90` succeeded and the engine
responded at version 29.9.2. No all-WSL shutdown was performed or is now needed;
the earlier confirmation request is withdrawn. Old verification containers
were removed during engine recovery. Existing local services restarted via their
policies; agenton-homeserver-1 initially reported restarting, so do not infer
all unrelated local services are healthy. Follow-up read-only logs show both
agenton-homeserver-1 and agenton-electric-1 fail to resolve their postgres
dependency; agenton-postgres-1 reports Exited (127) seven months ago. That
pre-existing stopped dependency was left unchanged. Production was not touched.

The dedicated PostgreSQL container was restarted for a sequential bounded
integration retry at the unchanged frozen source. Runner:
C:/temp/wt/verify-runbook-pinned-bounded.ps1. Evidence prefix:
C:/temp/wt/runbook-61fcdf0b-linux-rust1940-bounded-tests.
Do not overlap the optimized release build with another compiler job.

## 2026-11-19: WED-375 pinned compiler verification; local Docker recovery pending

Implementation: `C:/temp/wt/omnyid-runbooks`, `agent/codex/WED-375`.
Frozen source remains `61fcdf0bb5c2f2f87e36c1203e8fedf454661d29`.
Verification checkout: `C:/temp/wt/omnyid-runbooks-verify-43d7c830`, clean at that
SHA. No application source, deployment configuration or production service changed.
Checklist remains **111 complete / 6 remaining of 117**.

Built isolated local image omnyid-wed375-builder:rust1.94.0 from the existing
omnyid-wed318-builder-test:a42db33 builder. Installed compiler reports
rustc 1.94.0 (4a4ef493e 2026-03-02), matching rust-toolchain.toml.
All 385 selected distinct unit regressions completed with exit zero on this
compiler: eight Runbook tests plus workflow, proactive, Watcher, Synthesizer,
autonomy, approvals, tenant, inference-resolution, migration and quote coverage.
Machine-collected partial proof: C:/temp/wt/runbook-61fcdf0b-pinned-unit-evidence.json.
It hashes all eleven completed check logs and the compiler installation log.
The earlier full Rust 1.94.1/UI proof remains separate and is not relabelled.

An optimized release build and pinned integration run did NOT record successful
completion. Docker/WSL became unresponsive during compilation near the VM's
memory limit. Docker API calls, including a stop of only the owned integration
container, returned HTTP 500. A read-only WSL command failed with 0x8007274c.
The Docker Desktop restart attempt failed after its 120-second timeout, reporting
that Desktop/backend/WSL processes remained running. This is a LOCAL runtime
incident, not a production deployment/outage. Other local container state cannot
currently be verified. Do not describe the database or builds as stopped.

Owned containers whose state must be checked on recovery:
- omnyid-runbooks-61fcdf0b-rust1940-tests
- omnyid-runbooks-61fcdf0b-rust1940-release-build
- omnyid-runbook-wed375-pg

The release container was briefly paused to serialize compilation, then explicitly
unpaused when the Cargo lock showed it was ahead of integrations. No worktrees,
volumes, images or caches were deleted. Container/database state remains unknown; build success must not be inferred
from client exit or silence.
Incomplete logs were snapshotted and hashed in the partial evidence manifest.
Both verification Docker clients subsequently exited 125; these exits are
recorded in the partial manifest and are not successful compiler/test results.

User confirmation was requested before shutting down ALL WSL and restarting
Docker, since that broader recovery also interrupts the separate Ubuntu distro
and potentially another agent's work. No confirmation has arrived. Do not infer
it from elapsed time. On recovery, first stop/inspect the owned old jobs, then
run verification sequentially with resource containment. External runners now
use --memory 2800m --memory-swap 3g --cpus 1. The release retry also uses package
codegen-units=64 while retaining release optimization; record that build setting.
Runners: C:/temp/wt/verify-runbook-pinned.ps1, verify-runbook-pinned-regressions.ps1,
and verify-runbook-release.ps1. Never reuse incomplete results as pass evidence.

The checklist now leads with its current count rather than the historical 109/8
summary. No parent closed this pass. Accessible concensure repositories showed
only the public OmnyID core repository, and its deployment-environment list was
empty. Hosted target/test accounts, model evaluation/provider sandbox and the
intended private review/CI target remain unresolved. No push, PR or deployment.
Next: obtain WSL recovery confirmation, recover local tooling, rerun the pinned
integration and bounded release build, then address the five hosted/release gates.

## 2026-11-19: WED-375 canonical quote ingress and shared inference closure

Implementation: `C:/temp/wt/omnyid-runbooks`, `agent/codex/WED-375`.
Frozen source: `61fcdf0bb5c2f2f87e36c1203e8fedf454661d29`.
Verification: `C:/temp/wt/omnyid-runbooks-verify-43d7c830`, clean detached at
that SHA. Later documentation commits do not replace the source candidate.
Checklist: **111 complete / 6 remaining of 117**. WED-375 remains in progress.

Canonical quotation persistence now bridges an authenticated private record to
a deterministic reference-only receipt under existing hook flags/allowlist.
Replays retain one normalization/event/instance. Exact canonical evidence can
bypass generic relevance scoring, never owner, byte or decrypt budgets. Empty
or null encryption envelopes match private-message persistence semantics.
Missing dates pause through the existing question flow. Existing canonical
Documents/Responses projection remains draft-only, with no booking/payment grant.

Shared inference is a separate trusted opt-in; default construction remains
BYOK-only. Both funding flags, account allowlist and explicit compatible hosted
configuration are required. Retain Luna/Sol policy and central secret handling.
The existing funded ledger/global lock reserves full attempt exposure before I/O,
rechecks locked account policy and subtracts existing monthly account usage.
Only validated responses reconcile estimates; unknown outcomes retain exposure.
Account erasure removes funding owner links/correlation fields while preserving
anonymous cost totals and uncertain reservations. No worker/route enables this.

Changed files: src/runbook_hooks.rs and quote.rs child; src/runbook_evidence.rs;
src/server/quotation_routes.rs; tests/runbook_quote_ingress_postgres.rs;
src/inference/runbook.rs and transport.rs child; src/server/llm_resolution.rs;
src/server/openrouter_funded_inference.rs and runbook.rs/tests.rs children;
src/db.rs account erasure; canonical task/checklist/decision/rollout docs.

Machine-collected evidence: C:/temp/wt/runbook-61fcdf0b-evidence.json. It validates
clean full-SHA provenance and 19 check exit codes/log hashes, with builder image
identity and compiled unit-binary hash. Exact-candidate logs report 124 integration
tests across 25 binaries, 385 distinct unit regressions (including migrations,
Watcher, Synthesizer, proactive policy, workflows, approvals, tenant and inference
resolution), 2312 Wedding tests, five Runbook state tests, 15 browser scenarios,
typecheck, both line budgets, frontend production build and standalone Rust
library/homeserver dev build. All selected checks exited zero; no real provider
calls were made. Backend source mounted read-only in the existing pinned builder;
Rust 1.94.1, debug=0, codegen-units=64, -j1, incremental off, 512 MiB compiler stack.
Repository compiler pin is unchanged: this is local evidence, not pinned CI proof.
The dedicated omnyid-runbook-wed375-pg database is now stopped. Other containers,
worktrees, volumes and caches were not removed.

Earlier c41e9d8e had 124 passing integrations but was superseded after review
found missing prior-account-usage subtraction. d9ac6ec1 was superseded by erasure
cleanup. Their queued builds were stopped; do not reuse their results. Earlier
quote fixture/format corrections are committed; final source repeats all checks.

GitHub queries return no candidate CI/deployments. Configured origin is PUBLIC
concensure/OmnyID at 509dc31b1423d87c52fbebe5ab85efffacd0c750, the initial core
release; local history is over 1000 commits ahead with a different lineage.
No push/PR was attempted because this is not an established review destination
for the accumulated workspace history. The intended private review/CI target was
requested, alongside staging, internal test accounts and provider sandbox details.

Six parents remain: full release verification, hosted flags-off shadow, internal
deterministic allowlist, representative Luna/Sol evaluation and draft rollout,
security/provider-sandbox approval-gated tool rollout, and final frozen release
with matching deployment evidence. Do not close these from local tests. No
production configuration, live service, sitemap or other agent worktree changed.
Production/shared-stack deploy still requires AGENTS.md gates and a go-ahead for
the concrete candidate. Recommended next action: resolve the review/staging
inputs and pinned compiler gate, then execute the separate rollout-evidence gates.

## 2026-11-19: WED-375 canonical quotation workspace projection

Implementation: `C:/temp/wt/omnyid-runbooks`, `agent/codex/WED-375`.
Frozen source: `96cab816b9bfb5d4a39514c28683fcedb82c28c5`.
Verification: `C:/temp/wt/omnyid-runbooks-verify-43d7c830`, clean detached at
that SHA. Documentation commits do not replace the source candidate.
Checklist remains **109 complete / 8 remaining of 117**; no parent is closed
by this partial quote integration.

Canonical confirmed/corrected quotations now project into the existing Wedding
Documents/Responses artifact path, retaining canonical message/version/source
identities and uncertainty. Every source must be visible, unambiguous, in the
same thread and explicitly bound to the current plan/workspace. Locked content,
metadata-only payloads, missing/foreign sources and malformed display contracts
fail closed. The projection remains private/draft and cannot create a quote reply,
booking or payment approval. No comparable total is invented. New Wedding quote
records receive existing template/event tags for workspace discovery; historical
records are not rewritten. Partial source pages may intentionally omit a review.

Files: src/quotation/afp.rs; tests/quotation_afp.rs;
solid-ui/src/lib/weddingCanonicalQuoteProjectionState.ts;
solid-ui/src/lib/weddingPersistedWorkspaceState.ts;
solid-ui/tests/wedding-canonical-quote-projection-state.test.ts; canonical docs.

Verification complete for this change: exact-candidate frontend typecheck, 2312 Wedding tests,
both line budgets, production build and 15 Runbook browser scenarios completed
with exit zero. Six new frontend regressions cover provenance, replay, foreign
and missing sources, malformed data, locked content, corrections and authority.
An additional view-level check confirms the canonical artifact reaches Wedding
Documents with a document preview, draft status and no vendor reply flow.
That check initially used noncanonical workspace IDs; the corrected normalized
fixture passes. Initial source 0fb2df18 also exposed a protocol-field TypeScript
mismatch; the frozen successor removes reliance on the absent UI type field.
All 18 backend quotation/event/transform contract tests completed with exit zero.
The standalone Rust library/binary dev build also completed with exit zero.
Evidence prefix: C:/temp/wt/runbook-96cab816- (.log and .exit).
Machine-collected manifest: C:/temp/wt/runbook-96cab816-evidence.json. It checks
clean exact source identity, eight check exit codes and log hashes. The dedicated
omnyid-runbook-wed375-pg test container was stopped after verification; no
worktrees, containers belonging to others, volumes or caches were removed.

GitHub returned no CI runs or deployments for this candidate. No push, PR or
deployment was performed; the configured remote lineage remains unsuitable for
blind task-branch publication. Local compiler remains the documented 1.94.1
workaround, not proof of the project-pinned CI/release compiler gate.

Next local work: connect canonical private quotation ingress to the bounded
persisted Runbook event adapter, mapping date/context facts from reviewed source
authority and respecting encrypted evidence selection. Current private quote
metadata does not meet generic Watcher relevance selection; do not bypass this
by inventing urgency. The stored-quote Runbook regression remains separate from
the new UI projection and does not prove a complete canonical ingress path.
Shared-model policy and approved sandbox/staging target questions remain pending.
Hosted shadow/allowlist/model/security/provider rollout evidence and final release
are still open. Production/shared-stack deployment requires the AGENTS.md gate
and a go-ahead for the concrete frozen candidate. No production settings changed.

## 2026-11-19: WED-375 lifecycle closure and bounded owner model adapter

Implementation: `C:/temp/wt/omnyid-runbooks`, `agent/codex/WED-375`.
Frozen source: `77c58b5c215f4e19b706922f5be121176991f681`.
Verification: `C:/temp/wt/omnyid-runbooks-verify-43d7c830`, clean detached at
that SHA. Later documentation commits do not replace this source candidate.
Checklist: **109 complete / 8 remaining of 117**. WED-375 remains in progress.

Implemented three-failure/hour owner/runbook cooldown at dispatch and start;
definition successors cannot bypass it. Exact replay remains unchanged and
unknown tool outcomes are never resent. Added wait-phase traces/provenance in
the same transaction as every schedule revision, with separate identities from
the canonical completion trace. Tests cover all wait phases and injected trace
write rollback. Exact tool provenance hashes are checked against stored ground
truth, including the real approval and explicit absent packet.

Added OwnerRunbookModelProvider under src/inference/runbook.rs and child modules.
It reuses server/llm_resolution, requires active owner and compatible OpenAI BYOK
Luna configuration, validates owner/schema/prompt/model policy, and uses bounded
strict-JSON transport with usage/cost checks. Sol medium requires trusted policy;
runtime additionally requires acceptance failure, retry allowance and budget.
No public execution route or worker enables it. The shared ladder currently
selects other model families and is explicitly denied, not silently overridden.
No real provider call was made; tests use dummy credentials and loopback HTTP.

Added a frozen normalized quote review regression (no booking/payment authority).
Moved unchanged tenant identifier helpers and alias validation into small modules
to restore line budgets. Fixed a date-dependent Wedding fixture, a stale copy
assertion, and two pre-existing Unix-only workflow test name-resolution errors.
Defined separate reversible-action acceptance/undo/error/cost gates in
Documents/design/runbooks/rollout-evidence.md. No migrations, dependencies,
production configuration or other agent's sitemap/primary files were changed.

Files: src/runbook_runtime/failure_cooldown.rs; src/runbook_runtime.rs;
src/runbook_schedule.rs and trace.rs child; src/inference.rs and runbook children;
src/runbook_llm_step.rs; src/db.rs and tenant_names.rs child; src/server/mod.rs,
alias_validation.rs and tests/workflow_trigger_tests.rs; focused Runbook test
files/children; two Wedding test fixtures; canonical task/checklist/decision notes.

Local verification at the frozen source has exit 0 evidence: 116 integration
tests across 23 binaries; 384 distinct unit regressions, including seven Runbook
tests, seven workflow tests, 40 migration checks and related policy/Watcher/
Synthesizer/approval/tenant/provider/quote coverage; frontend typecheck; both
line budgets; 2306 Wedding tests; five Runbook state tests; 15 browser scenarios;
production frontend build; and standalone Rust library plus homeserver binary
dev-profile build. No ignored Rust tests were reported in these selected suites.
This is candidate verification, not completion of the remaining integration,
release or hosted rollout gates. The project-pinned compiler/CI release gate has
not been established by the local Rust 1.94.1 workaround.

Machine-collected local manifest: C:/temp/wt/runbook-77c58b5c-evidence.json.
It validates clean source identity, all 19 selected check-log exit codes, log
SHA-256 hashes, 116 integration results, 384 unique unit names, unit-binary hash,
builder image identity, and empty candidate CI/deployment query results.

Evidence prefix: C:/temp/wt/runbook-77c58b5c- with .log/.exit files for each
check. Backend runner: C:/temp/wt/verify-runbook-candidate.ps1; verifies exact
root/SHA/clean status before running. Linux Rust 1.94.1, pinned builder image
omnyid-wed318-builder-test:a42db33, read-only source bind, dedicated disposable
PostgreSQL, shared cargo caches, -j1, incremental off, debug=0, package codegen
units=64, RUST_MIN_STACK=536870912 and core dumps disabled. Project compiler pin
is unchanged. These are local artifacts, not GitHub Checks or deployment proof.
The compiled unit binary was reused directly for filtered regressions, with the
exact source mounted read-only at /workspace and that working directory selected.
Its SHA-256 before and after those runs was
5dace124b84981f322a8c7cd4901a470b93faa96fa2312e8b74f5222b7ae77f1.
This avoids repeating Cargo fingerprint scans, not compilation or test coverage.
The dedicated omnyid-runbook-wed375-pg container is stopped. Ephemeral verification
containers removed themselves; no worktrees, volumes or caches were pruned.

Superseded candidates: 8c036c26 passed 113 integrations; 9dc0ce57 passed 115;
93325904 passed 116. The 227ffd14 compile found a misplaced module inner
attribute (fixed in 9dc0ce57). The 93325904 unit build found existing Linux test
references (fixed in 85467be4). Superseded queued/failed builds were stopped;
retain their logs rather than presenting them as final candidate results.
85467be4 passed integration, Runbook units and standalone build. Wider tests then
found a wrong-path permissions fixture, corrected in 77c58b5c. An initial direct
migration-test invocation omitted /workspace; rerunning with the exact source
mount passed all 40 checks. Final source repeats those checks with the mount.

Open tasks: shared model compatibility/funding policy; canonical quote event
through normalization and Documents/response projection with separate booking
approval; full release verification; hosted flags-off shadow; deterministic
allowlist metrics; representative model evaluation/rollout; reviewed sandbox
tool rollout; final release/deployment evidence. The quote fixture covers only
frozen normalized review, not that entire canonical pipeline. Shared model policy
and sandbox/staging details were requested asynchronously; no answer received yet.
Tool rollout still includes trusted application composition, reviewed capability
and evidence-to-argument mapping, and provider-evidence reconciliation. Approval
alone does not complete those integrations or make an Unknown result safe to retry.

GitHub queries for this SHA returned no CI runs and no deployments. The existing
remote lineage remains unsuitable for push/PR; no PR or push was created. No
deployment or production-health assertion. Production go-ahead is not inferred
from the request to finish implementation. Next: resolve the shared-model choice
and canonical quote integration, then satisfy the staged evidence gates. Never
enable tools/models or deploy from the dirty implementation checkout.

## 2026-11-19: WED-375 secret-service factory and abandoned tool closure

Implementation: `C:/temp/wt/omnyid-runbooks`, `agent/codex/WED-375`.
Frozen source: `f30d31a365bc9a68b00d4fde16412a3df77abb95`.
Verification: `C:/temp/wt/omnyid-runbooks-verify-43d7c830`, clean detached at
that source SHA. Documentation follow-ups do not change the source candidate.
Two integration subtasks implemented; parent count **101 complete / 16 remaining
of 117**, unchanged. WED-375 remains in progress.

McpRunbookProvider::from_secret_backend reuses SecretBackend and the existing
MCP HKDF domain/version. Only reported absence of the primary encryption root
permits signing-root compatibility. Malformed/zero/missing roots and backend
errors fail closed with sanitized errors and a ten-second lookup deadline.
Legacy storage and backend resolution behavior are unchanged; callers must
supply the application's trusted backend and reviewed targets. This factory
is not yet composed into an execution route or worker.

RunbookRuntime::abandon_tool_attempt requires an owner-bound proposal, durable
reservation and current revision. It atomically records an Unknown receipt,
trace, provenance and Failed state for a still-current running attempt. Cancelled
instances remain cancelled. Completion and abandonment now share the owner-
serialized result writer: first receipt wins, late provider output cannot
advance an abandoned run, and replay returns the existing receipt. A failed
transaction leaves the reservation intact. No resend, automatic timeout cleanup,
public endpoint, external cancellation or provider reconciliation is claimed.

Files: src/runbook_tool_execution.rs; src/tool_dispatch/runbook_provider.rs and
new runbook_provider/credentials.rs; tests/runbook_tool_provider_postgres.rs;
tests/runbook_tool_runtime_postgres.rs and new child recovery.rs; canonical
coordination and runbook contract/checklist notes. Corrected the previous test
header to say loopback providers are invoked. No dependencies, migrations,
frontend, sitemap or production configuration changes. Other agent's primary
checkout remains untouched (extensive frontend/static changes, no src/tests diff).

Verification at the frozen source:
- 112 tests passed in 22 integration binaries, exit 0; compilation 8m 52s.
- Five new tests cover secret-service derivation/failure handling and recovery:
  missing reservation, cross-owner rejection, stale revision, transactional
  rollback, concurrent/replayed abandonment, late success, completed receipt
  preservation and cancellation remaining terminal.
- Standalone library build passed, exit 0, 1m 03s. Evidence:
  C:/temp/wt/runbook-f30d31a3-linux-build.log/.exit.
- git diff --check passes; frontend unchanged, so no frontend rebuild this pass.
Initial 256 MiB RUST_MIN_STACK compilation crashed with SIGSEGV and rustc's
suggestion to use 512 MiB. Stopped that container after the crash (exit 137);
retained its log and retried the exact source with RUST_MIN_STACK=536870912 and
core dumps disabled. No test failure was reported by the crashed compiler. The 512 MiB retry
compiled the library but caught a test-only Result alias conflict (exit 101).
Commit f30d31a3 qualifies the SecretBackend fixture result types; verification
was restarted from that new frozen source.
Superseded evidence: C:/temp/wt/runbook-4e36fd13- linux-tests.log/.exit and
linux-tests-stack512.log/.exit. Final candidate evidence uses
C:/temp/wt/runbook-f30d31a3- linux-tests.log/.exit and line-budget.log/.exit.
Linux Rust 1.94.1, builder omnyid-wed318-builder-test:a42db33, image
sha256:21fe7471679891c3a083d0c167ee660873a8be66223ad205dd05405164c1f0fa;
read-only source bind, shared cargo caches, -j1, CARGO_INCREMENTAL=0,
test/dev debug=0, root codegen-units=64. Root/SHA/status printed before checks.
Line budget reports only existing server/mod.rs 45734/45717 and db.rs
18045/17986 failures; Wedding budget passes.

GitHub runs still show failures at unrelated 509dc31b and 69fbc2b2; actual remote
concensure/OmnyID has zero deployment records. An initial deployments query to
an incorrect repository returned 404 and was corrected. No candidate CI evidence;
remote lineage remains unsuitable for push/PR. No push or PR was created.
No real provider calls, deployment or production health assertion. Tests use
dummy secrets, in-memory SecretBackend and disposable PostgreSQL/loopback fixtures.
Dedicated test PostgreSQL is stopped; ephemeral build containers auto-remove.

Next: provider sandbox/account compatibility and trusted application composition;
evidence-to-argument mapping and usage accounting. Unknown receipts now support
explicit local closure, but provider-evidence reconciliation remains separate.
Do not expose abandonment without authenticated owner/revision checks and clear
notice that the external action may still occur. Do not reinterpret Unknown as
NotSent or permission to retry. Remaining model/rollout/release gates stay open.

## 2026-11-19: WED-375 credential-bound direct MCP adapter

Implementation: `C:/temp/wt/omnyid-runbooks`, branch `agent/codex/WED-375`.
Frozen source: `70ed7eb487b3fafae62e691bf8456d607be0713c`.
Verification: `C:/temp/wt/omnyid-runbooks-verify-43d7c830`, clean detached at
that SHA. Documentation follow-ups do not change the source candidate.
Parent checklist: **101 complete / 16 remaining of 117**. Closes capability
dispatch/AFP persistence reuse for direct MCP; WED-375 remains in progress.

Added a trusted internal McpRunbookProvider using existing canonical owner
connections/grants, strict encrypted credential decryption, bounded MCP transport
and the runtime's one-shot reservation/private AFP result/provenance persistence.
Request hash v3 binds a bounded ciphertext fingerprint, so same-second credential
rotation invalidates pending approvals. Old v2 proposals need a fresh run/review.
The adapter revalidates the active owner and exact connection/grant under locks,
then releases the transaction before network I/O. No plaintext fallback.

Explicit reviewed HTTPS targets pin public IPv4 addresses while retaining hostname
TLS checks. URL credentials/query/fragment, private/reserved pins and IPv6 are
rejected; redirects, retries and inherited proxies remain disabled. A separate
literal-loopback HTTP constructor supports local sandbox tests. No route, worker
or environment default instantiates this adapter. Composio is unsupported.

Files: src/tool_dispatch/runbook_registry.rs, runbook_contract.rs, new
runbook_provider.rs; src/tool_dispatch.rs; src/mcp_client/bounded.rs and new
bounded/destination.rs; new tests/runbook_tool_provider_postgres.rs; canonical
coordination and runbook design/checklist documents. No migrations, dependencies,
frontend, sitemap or deployment configuration changes. Other agents' work intact.

Verification at the clean frozen SHA, with root/SHA/status printed:
- 107 tests passed in 22 Rust integration binaries, exit 0. Five new scenarios
  cover exact approval/send/receipt/replay; unchanged-timestamp credential rotation;
  wrong keys/plaintext/revoked grants/unreviewed targets; unsupported transports
  and deleted owners; HTTPS/public-pin constructor boundaries.
- Standalone Rust library build passed, exit 0, 58.73s.
- Linux Rust 1.94.1, omnyid-wed318-builder-test:a42db33, image
  sha256:21fe7471679891c3a083d0c167ee660873a8be66223ad205dd05405164c1f0fa.
  Read-only source bind, shared cargo caches, -j1, CARGO_INCREMENTAL=0,
  RUST_MIN_STACK=268435456, test/dev debug=0, root codegen-units=64.
- Evidence: C:/temp/wt/runbook-70ed7eb4-linux-tests.log/.exit,
  C:/temp/wt/runbook-70ed7eb4-linux-build.log/.exit and
  C:/temp/wt/runbook-70ed7eb4-line-budget.log/.exit.
- Line budget still reports unchanged server/mod.rs 45734/45717 and
  db.rs 18045/17986 failures; Wedding budget passes.
- GitHub queries returned failed runs at unrelated SHAs 509dc31b and 69fbc2b2,
  no deployments and no candidate CI. Configured remote lineage remains unsuitable
  for a meaningful push/PR; neither was created. Windows compiler issue not retried.

Only disposable PostgreSQL, dummy credentials and loopback providers were used.
Constructor tests do not establish external HTTPS/provider sandbox compatibility.
The test file's copied introductory comment saying no provider is invoked is
outdated: its fixture invokes a local loopback provider only. No actual provider
traffic, deployment or production health assertion. Dedicated test PostgreSQL
stopped after verification; build containers auto-remove.

Next: wire a trusted credential-service factory supplying the correct KEK and
reviewed targets; verify real provider/account compatibility in a sandbox. Existing
legacy credential loading has fallback behavior and must not replace this strict
path. Evidence-to-argument mapping, usage accounting, normalized provider
projections and unknown-outcome reconciliation remain open. Preserve reservation
as admission boundary: cancellation after admission cannot undo an external call.
No automatic retries after unknown outcomes. Hosted rollout/security/evaluation
and exact release gates remain separate checklist parents.

## 2026-11-19: WED-375 exact tool review queue UI

Implementation: `C:/temp/wt/omnyid-runbooks`, branch `agent/codex/WED-375`.
Frozen source: `bb68a33c2d59c5ffe213b353008390f42cad413a`.
Verification checkout: `C:/temp/wt/omnyid-runbooks-verify-43d7c830`, clean detached
at that SHA. Documentation follow-ups do not change the source candidate.
Parent checklist unchanged: **100 complete / 17 remaining of 117**. This closes
the tool review projection/UI integration subtask; WED-375 remains in progress.

Owner activity and Decision Queue now show separate tool action review cards.
Summaries omit arguments/provider outputs and include exact proposal identity,
capability, expiry and historical decision state. Exact arguments load only on
explicit review, from the authenticated endpoint, and must match the summary.
They render as escaped text with bounded scrolling. Approve/reject requires
confirmation and exact current revision; expiry is checked again at confirmation.
Expired pending proposals remain rejectable. Flags control review availability,
account changes clear private detail/confirmation, and errors require refresh.
Pending approvals share bounded queue-page priority with unanswered questions.
Nothing calls a provider; the existing private-review boundary remains separate.

Files: src/runbook_activity.rs, src/runbook_tool_runtime.rs,
src/server/runbook_routes.rs and runbook_routes/tool_review.rs;
solid-ui/src/components/RunbookPanel.tsx and new RunbookToolReviewCard.tsx;
solid-ui/src/lib/runbookState.ts; runbook-state.test.ts, new browser
runbook-tools.spec.ts, tests/runbook_tool_runtime_postgres.rs; canonical
coordination and runbook design/checklist documents. No migrations, dependencies,
provider adapter, sitemap or production configuration changes. Other agents'
primary/SEO work was untouched.

Verification from clean frozen checkout, with root/SHA/status printed:
- 102 backend tests in 21 integration binaries passed, exit 0; compilation 8m 36s.
  HTTP scenario now verifies pending/approved projection, argument omission and
  review availability flag alongside existing authority/replay checks.
- Five frontend state tests passed; TypeScript passed (exit 0).
- All 15 Playwright scenarios passed, 39.7s. Three new scenarios cover exact
  detail before approval, dedicated endpoint/payload, confirmation/focus return,
  escaped false/zero/HTML-looking arguments, 320px layout, axe serious/critical
  violations absent, expiry/rejection, flag off, sanitized errors and account
  switch clearing. Prior private-review and question scenarios still pass.
- Frontend production build passed, exit 0, 40.31s. Existing Tailwind screen
  configuration warning retained.
- Standalone Rust library build passed, exit 0, 7m 40s (fresh compilation).
- Rust Linux 1.94.1 in omnyid-wed318-builder-test:a42db33; image identity
  sha256:21fe7471679891c3a083d0c167ee660873a8be66223ad205dd05405164c1f0fa;
  read-only source mount, shared cargo caches, -j1, CARGO_INCREMENTAL=0,
  RUST_MIN_STACK=268435456, test/dev debug=0, root codegen-units=64.
- Evidence prefix C:/temp/wt/runbook-bb68a33c-: linux-tests, linux-build,
  typecheck, browser, ui-build and line-budget .log/.exit files. Five state
  tests reported in the command transcript (exit 0).
- Line budget retains only unchanged server/mod.rs 45734/45717 and
  db.rs 18045/17986 failures; Wedding budget passes. git diff --check passed.
- GitHub queries show failed runs at unrelated SHAs 509dc31b and 69fbc2b2, no
  deployments and no candidate CI evidence. Unsuitable configured remote lineage
  still prevents a meaningful push/PR. No push/PR created; local checks do not
  assert hosted health. Prior Windows compiler limitation was not retried.

Only disposable PostgreSQL and mock/loopback providers were used. No deployment,
real provider call or production health assertion. Dedicated test PostgreSQL is
stopped after verification; ephemeral Docker build containers auto-remove.

Next: connect ToolProvider to an account-bound credential adapter, preserving
reservation/approval hash semantics and credential-rotation checks. Existing
runbook_registry.rs deliberately excludes api_key_enc; do not replace it with
unbound credential lookup. Review destination isolation/provider compatibility
before rollout. Evidence-to-argument mapping, normalized provider projections
and explicit crash/unknown-outcome reconciliation remain open. Keep flags off.

## 2026-11-19: WED-375 authenticated tool review API verified

Implementation worktree: `C:/temp/wt/omnyid-runbooks`, branch `agent/codex/WED-375`.
Frozen source: `211386468b4f6db1b82aec67411d68c7316fb889`.
Verification checkout: `C:/temp/wt/omnyid-runbooks-verify-43d7c830`, clean detached
at that SHA. Documentation-only follow-ups do not change the source candidate.
Checklist unchanged: **100 complete / 17 remaining of 117**. This closes an
integration subtask, not an additional parent. WED-375 remains in progress.

Added POST exact proposal, GET immutable proposal and POST decision routes under
/runbooks/instances/{id}/tools. Both management and new default-off tool-review
flags are required. Identity comes from authentication; unknown request fields
are rejected. Approvals (including replay) require the shared recent-session
policy. Rejection remains available to an older valid session after revocation.
The runtime still enforces exact owner, proposal, revision, expiry and policy.
GET is historical retrieval, not current eligibility. All responses inherit
no-store/body limits; routes share the management rate limit and never call a
provider. Every success response reports execution_available=false.

Files: src/server/runbook_routes.rs, new runbook_routes/tool_review.rs,
src/runbook_tool_runtime.rs, tests/runbook_tool_runtime_postgres.rs, canonical
coordination and runbook design/checklist documents. No frontend, migration,
dependency, sitemap, provider adapter or production configuration changes.
Primary checkout and other agents' work remain untouched.

Verification from clean frozen source with root/SHA/status printed:
- 102 tests passed in 21 integration binaries, exit 0; compilation 6m 56s.
  New HTTP scenario covers both dark flags, missing authentication, cross-owner
  proposal/read/decision, forged fields, exact replay, stale session/revision,
  conflicting decision, rejection after revocation and zero provider calls.
  All previous 101 runbook regression tests also passed.
- Standalone cargo build --lib passed, exit 0, 39.92s.
- Linux Rust 1.94.1; omnyid-wed318-builder-test:a42db33, image identity
  sha256:21fe7471679891c3a083d0c167ee660873a8be66223ad205dd05405164c1f0fa;
  read-only source mount, existing caches, -j1, CARGO_INCREMENTAL=0,
  RUST_MIN_STACK=268435456, test/dev debug=0, root codegen-units=64.
- Evidence: C:/temp/wt/runbook-21138646-linux-tests.log and .exit;
  C:/temp/wt/runbook-21138646-linux-build.log and .exit.
- Line-budget check still fails only unchanged server/mod.rs 45734/45717 and
  db.rs 18045/17986; Wedding-specific budget passes. git diff --check passed.
- GitHub queries show three failed runs at unrelated SHAs (509dc31b, 69fbc2b2,
  24bb0286), no deployments and no candidate CI evidence. Existing configured
  remote lineage remains unsuitable; no push/PR created. These local results
  do not assert GitHub Checks, deployment or runtime health. Windows compiler
  limitation was not retried; Linux evidence only.

Dedicated disposable Postgres is stopped after verification. Only local mock
providers were used by the regression suite; the HTTP test makes zero calls.
No deployment and no production health assertion.

Next: project separate tool review cards into Runbook activity/queue, showing
exact saved arguments, current revision and expiry; use the new endpoints.
Existing RunbookPanel private-review cards intentionally use /actions/decision
and must not silently become tool authority. Then implement the live account-
bound credential adapter and review destination isolation/provider compatibility.
Evidence-to-argument mapping, normalized provider projections and explicit
crash/unknown-outcome reconciliation remain. Keep rollout flags off.

## 2026-11-19: WED-375 durable tool lifecycle verified

Implementation: `C:/temp/wt/omnyid-runbooks`, branch `agent/codex/WED-375`.
Frozen source: `489b13f11968dced83a13e085dc619e00ff76771`.
Verification: `C:/temp/wt/omnyid-runbooks-verify-43d7c830`, clean detached at that
exact SHA. Subsequent documentation commits do not change the source candidate.
Parent checklist: **100 complete / 17 remaining of 117**; the deterministic
backend step implementation parent closes. WED-375 remains in progress.

Implemented exact tool proposals, separate approval decisions, one-shot durable
reservations, and atomic private signed/encrypted results, traces and provenance.
Approval and reservation recheck canonical grants and policy. Reservation commits
before provider I/O without holding database locks across the network. No retry
is inferred from missing results. Cancellation/revocation prevents continuation
but cannot undo a previously admitted external effect. Completion requires the
saved applied tool receipt, not just a successful trace. Private-review approvals
remain distinct from tool authority. ToolProvider is a trusted internal seam;
no authenticated route, live credential adapter or production hook enables it.

Changed: new src/runbook_tool_records.rs, runbook_tool_runtime.rs and
runbook_tool_execution.rs; registrations in lib.rs; runbook_store.rs record
validation, runbook_provenance.rs decision binding, runbook_complete.rs receipt
validation; tool_dispatch/runbook_registry.rs and runbook_contract.rs transaction
preparation; new tests/runbook_tool_runtime_postgres.rs; canonical coordination
and runbook design/checklist docs. No migrations, dependencies, frontend,
sitemap or production configuration changed. Other agents' work was untouched.

Verification from the clean frozen checkout, with root/SHA/status printed:
- 101 tests passed in 21 integration binaries, exit 0 (92 prior plus nine new).
  Lifecycle coverage includes concurrent proposals/approvals/execution, owner
  isolation, stale revisions/grants, revocation, cancellation during I/O,
  abandoned execution, schema failure, rollback on result persistence failure,
  rejection, missing receipt at completion, replay and sanitized provider errors.
- Standalone cargo build --lib passed, exit 0, 38.09s.
- Linux Rust 1.94.1; image omnyid-wed318-builder-test:a42db33, identity
  sha256:21fe7471679891c3a083d0c167ee660873a8be66223ad205dd05405164c1f0fa.
  Read-only source mount, existing cargo caches, -j1, CARGO_INCREMENTAL=0,
  RUST_MIN_STACK=268435456; global test/dev debug=0 and root codegen-units=64.
- Evidence: C:/temp/wt/runbook-489b13f1-linux-tests.log and .exit;
  C:/temp/wt/runbook-489b13f1-linux-build.log and .exit.
- Final line budget retains only existing server/mod.rs 45734/45717 and
  db.rs 18045/17986 failures; Wedding-specific budget passes.
- GitHub run/deployment queries returned no records. Configured remote lineage
  is unsuitable for this private work; no push/PR created. Local evidence above
  is not a GitHub Checks/build/deployment health assertion.

Earlier attempts are superseded: 1f2510ff was stopped for receipt validation;
Docker Desktop stopped during 2a26f240 and was restarted; a 128 MiB compiler
stack then SIGSEGV'd, resolved with 256 MiB. The next attempt exposed three
integration-test references to a private schema helper, fixed in 489b13f1 using
the existing disposable-owner schema convention. Earlier logs remain under
C:/temp/wt/runbook-2a26f240-*. Windows compiler limitations were not retried.

Only disposable PostgreSQL and loopback/mock providers were used. The dedicated
test database is stopped after verification; ephemeral build containers auto-remove.
No deployment, real provider call or production health assertion.

Next: authenticated human approval routes/queue and live owner/account-bound
credential adapter; deterministic evidence-to-argument projection; normalized
provider AFP projection; explicit crash/unknown-outcome reconciliation. Current
Tool steps require explicit arguments and reject unsupported input selectors.
Credential rotation/account semantics and DNS/destination isolation still need
integration/security proof. Keep provider/sandbox and rollout parents open.

## 2026-11-19: WED-375 four bounded transport subtasks verified

Implementation: `C:/temp/wt/omnyid-runbooks`, branch `agent/codex/WED-375`.
Frozen source: `fbe1e671ed14df8fc6fb7468c3816d1a781c4460`.
Verification checkout: `C:/temp/wt/omnyid-runbooks-verify-43d7c830`, clean detached
at that exact SHA. Subsequent documentation commits do not change the candidate.
Parent checklist unchanged: **99 complete / 18 remaining of 117**.

Four completed subtasks: exact bounded MCP requests; total deadline and actual
response-byte limits with redirect/retry rejection; correlated strict JSON
receipts and unknown-outcome/schema validation; local adversarial socket tests.
These are prerequisites for the open durable tool execution parent item.

Changed: src/mcp_client.rs module registration, new mcp_client/bounded.rs and
bounded/unique_json.rs; tool_dispatch/runbook_contract.rs receipt validation;
new tests/runbook_tool_transport.rs; registry PostgreSQL test; canonical task,
decision, handoff and runbook design notes. No migration, dependency, runtime
route, frontend, sitemap or production configuration changes.

The opt-in low-level client is not called by production runbooks or old
mcp_client::call_tool callers. It bounds requests before serialization, uses a
fresh JSON-RPC ID, disables redirects/retries/proxy inheritance, bounds total
elapsed time and actual response bytes, and rejects unsupported encodings and
content channels. Object-only exact envelopes and duplicate-free nested JSON
prevent ambiguous results. Opaque receipts bind endpoint/capability/arguments;
prepared tools additionally check their frozen output schema. Fixed error codes
retain no raw provider errors, URLs, credentials or private argument values.
Pre-send validation is NotSent; all failures after transmission starts are
Unknown and do not permit automatic retry. Receipt validation is not durable
approval, owner/account authority, business success or authenticated AFP proof.

Verification from the clean named candidate, with root/SHA/status printed:
- 92 tests passed in 20 integration binaries, exit 0: previous 84 plus seven
  local socket transport tests and one PostgreSQL receipt/schema test. Covers
  exact requests, no credential forwarding, no retries, stalled headers/bodies,
  declared and chunked oversize responses, duplicate keys, positional arrays,
  malformed/wrong-ID/provider-error envelopes and frozen schema/request binding.
- Standalone cargo build --lib completed, exit 0, 42.73s.
- Linux Rust 1.94.1 in omnyid-wed318-builder-test:a42db33; image identity
  sha256:21fe7471679891c3a083d0c167ee660873a8be66223ad205dd05405164c1f0fa.
  Read-only source mount; -j1, CARGO_INCREMENTAL=0, RUST_MIN_STACK=134217728,
  global test/dev debug=0 and root package codegen-units=64. Existing shared
  cargo cache volumes reused. Windows compiler limitation from prior handoff
  was not retried; no Windows build claim.
- Evidence: C:/temp/wt/runbook-fbe1e671-linux-tests.log and .exit;
  C:/temp/wt/runbook-fbe1e671-linux-build.log and .exit.
- The earlier bf6cdf34 attempt was stopped during compilation for the explicit
  object-envelope fix; its evidence is superseded by the frozen SHA above.
- Line-budget check still fails only unchanged server/mod.rs 45734/45717 and
  db.rs 18045/17986. Wedding-specific budget passes. git diff --check completed.
- GitHub run/deployment queries returned no records. Unsuitable configured
  remote lineage prevents a meaningful push/PR boundary; no push/PR created.

Local test database omnyid-runbook-wed375-pg stopped after verification; build
containers removed automatically. Only loopback mock providers were called.
No production deployment, real provider call or production health assertion.
Other agents' primary/SEO worktrees were untouched.

Next: durable exact-action approval and atomic attempt reservation, then dispatch
through this client with live owner/account/grant/policy revalidation, and signed
private AFP tool results/provenance. Define crash/unknown-outcome reconciliation
without blind retries. Current private-review approval is not tool authority.
The existing HTTPS/localhost endpoint guard is retained, not claimed as complete
DNS/destination isolation; provider compatibility and sandbox evidence remain
release prerequisites. No further parent checkbox closes in this batch.

## 2026-11-19: WED-375 four canonical tool prerequisites verified

Implementation: `C:/temp/wt/omnyid-runbooks`, branch `agent/codex/WED-375`.
Frozen source: `9c9eda70785c8a53098ef70f327c1d4d01073f49`.
Verification checkout: `C:/temp/wt/omnyid-runbooks-verify-43d7c830`, clean detached
at that exact source. Documentation commits after it do not change this candidate.
This supersedes the previous batch's full-verification blocker for this source.

Four bounded subtasks: credential-free canonical grant projection; exact
owner/account/schema snapshot binding; current-state preparation revalidation;
PostgreSQL adversarial coverage. Together with the prior schema work this closes
ONE parent checklist entry: **99 complete / 18 remaining of 117**.

Changed: src/tool_dispatch/runbook_registry.rs (new), runbook_contract.rs,
tool_dispatch.rs module declaration, tests/runbook_tool_registry_postgres.rs
(new), canonical task/decision/handoff notes and runbook design docs. No runtime
executor, migration, dependency, frontend, sitemap or deployment config changed.

The preparation-only query requires a matching MCP connection AND canonical
owner grant. It rejects revoked/unhealthy/suggestion-only grants, ambiguous
accounts, wrong credential pointers, mismatched provider actors and stale schema
projections. Credentials are never selected. The request hash binds the exact
account, grant, connection, scopes, approval mode, contract and arguments.
Revalidation reloads current state; it is not atomic execution authority. A
future executor must recheck live policy and reserve an exact approved attempt.
The generic execution registry remains empty and external execution disabled.

Local verification, after printing root, full SHA and clean status:
- 84 tests passed in 19 Rust integration binaries, exit 0. Includes all 17 prior
  runbook binaries, six tool-schema tests and four new PostgreSQL registry tests.
  PostgreSQL ran in disposable omnyid-runbook-wed375-pg; test networking shared
  that container, never production. A local listener assertion verifies no
  provider connection during preparation.
- Standalone cargo build --lib completed, exit 0 (42.28s).
- Linux Rust 1.94.1 in omnyid-wed318-builder-test:a42db33, image identity
  sha256:21fe7471679891c3a083d0c167ee660873a8be66223ad205dd05405164c1f0fa.
  Source mounted read-only. -j1, incremental off, RUST_MIN_STACK=134217728;
  profile.test.debug=0 / profile.dev.debug=0 and root package codegen-units=64.
  Existing cargo cache volumes reused; no production images were built.
- Evidence: C:/temp/wt/runbook-9c9eda70-linux-tests.log and .exit;
  C:/temp/wt/runbook-9c9eda70-linux-build.log and .exit.
- Global line-budget still fails only the unchanged server/mod.rs 45734/45717
  and db.rs 18045/17986 overages. git diff --check completed.
- Windows Rust 1.94.0 also reproduced the prior 1.95 access violation. The first
  Linux attempt hit an LLVM debug-info backtrace in Tokio; global debug=0
  avoided that failure. This verifies the Linux candidate, not a Windows fix.
- GitHub run/deployment queries returned no records. Configured remote lineage
  remains unsuitable for pushing this task; no push/PR/CI record was created.

No deployment or real provider calls occurred. Disposable verification container
removed automatically; database stopped after checks. Other agents' primary and
SEO worktrees were not changed. No production health assertion is made.

Next: durable exact-action approved dispatch and authenticated AFP tool results,
with transport bounds, live policy checks, atomic reservation and crash/unknown
outcome reconciliation. Do not use private-review approval as tool authority.
Credential rotation still lacks a separate revision counter; revalidation must
not be treated as a durable authorization grant. Broader rollout stays gated.

## 2026-11-19: WED-375 tool contracts implemented; full verification blocked

Implementation: `C:/temp/wt/omnyid-runbooks`, branch `agent/codex/WED-375`.
Candidate: `96ce14bdfe5797a5733b1ad20743d1f68af42ec9`.
Verification checkout: `C:/temp/wt/omnyid-runbooks-verify-43d7c830`, restored clean
to that candidate after baseline diagnosis. This candidate is NOT fully verified.
Last fully verified source remains `d8ebd36dbe2e53d1a83dcd7bbb9a85f9fa97e6af`.
Checklist unchanged: **98 complete / 19 remaining of 117**.

Changed: src/runbook_tool_schema.rs; src/tool_dispatch/runbook_contract.rs;
module registrations in lib.rs and tool_dispatch.rs; tests/runbook_tool_schema.rs;
canonical task/decision/handoff notes; design checklist and new
Documents/design/runbooks/tool-contract-boundary.md. No runtime executor, routes,
migrations, dependencies, frontend, sitemap or production configuration changed.

The schema boundary rejects unknown fields/keywords, missing schemas, open
objects, malformed required/enum fields, unbounded arrays/strings, coercion,
unsupported types, provider errors and text fallback. Traversal/depth/node/byte
limits precede recursive parsing. Exact selection rejects unknown/ambiguous
capabilities; hashes bind owner, endpoint/provider, schemas and arguments. The
opaque prepared value retains no API key and cannot execute anything.

Discovery: Db::list_tool_execution_registry at src/db.rs:10849 is an empty stub,
introduced in 02faaf6fb. Consequently all real preparations currently fail closed.
Do not equate MCP connection presence with authority or silently restore global
execution. Registry restoration must cover non-runbook callers too, including
account scope, health/revocation, approval mode and credential handling. No
provider was called and no database was started for this batch.

Verification attempted from clean named SHAs:
- Candidate cargo test --lib --test runbook_tool_schema runbook_: two attempts
  with Rust 1.95.0, -j1, debug=0, codegen-units=8, incremental off, 64 MiB stack;
  another with codegen-units=16 and 128 MiB stack. All crashed compiling the
  library with Windows exit 0xc0000005 STATUS_ACCESS_VIOLATION, no Rust diagnostic.
- Candidate cargo check --lib also crashed. The same check on clean prior
  verified d8ebd36d also crashed. About 11 GiB RAM was free during diagnosis.
  This establishes reproduction without these new source changes, not a pass.
- An isolated rustc probe compiled the exact candidate schema module and six
  integration test functions, substituting only the Result type alias needed
  from the parent contract module. All six passed. Probe artifacts:
  C:/temp/wt/runbook-schema-probe-96ce14bd/probe.rs and probe.exe.
  This is limited schema evidence, NOT whole-project/build evidence. The exact
  selection unit test has not run; the original library build must still pass.
- Global line budget remains failing at server/mod.rs 45734/45717 and db.rs
  18045/17986, unchanged in this batch. git diff --check completed.
- GitHub run and deployment queries returned no records; unsuitable remote
  lineage still prevents a meaningful PR/CI boundary. No push or PR created.

Next: resolve the Windows rustc/build blocker and run the new schema integration
and exact-selection unit tests plus existing tool_dispatch regressions and the
library build. Then restore the canonical execution registry with appropriate
authority tests and implement durable approved dispatch/AFP persistence. Keep
schema/dispatch parent entries open until integrated and verified. No deployment
was attempted. No test/build/production health was manually declared passing.

## 2026-11-19: WED-375 six approval-continuation subtasks verified

Implementation worktree: `C:/temp/wt/omnyid-runbooks`, branch `agent/codex/WED-375`.
Frozen candidate: `d8ebd36dbe2e53d1a83dcd7bbb9a85f9fa97e6af`.
Verification worktree: `C:/temp/wt/omnyid-runbooks-verify-43d7c830` (clean detached).

Completed six bounded subtasks: strict decision contract; atomic approve/reject
and replay; existing authenticated action endpoint integration; private approved
emission, follow-up and completion; Decision Queue confirmations/status; backend
and browser adversarial coverage. This closes one parent entry, no_reply_followup:
**98 complete / 19 remaining of 117**. General tool execution, inference, full
executor/provenance coverage and hosted rollout remain open.

Changed: new src/runbook_review_decision.rs and src/runbook_review_emit.rs;
runbook store, activity, completion, emission and provenance modules; lib module
registration; server runbook_routes.rs plus one hook in server/mod.rs and an
optional request revision in types.rs; RunbookPanel, runbookState, browser tests;
runbook_api_postgres and runbook_starters_postgres; canonical task/decision notes
and the design checklist. No migration/dependency/sitemap changes.

Decisions bind authenticated owner, exact proposal, revision and current policy.
Approvals require recent sessions. A single owner transaction persists decision,
trace, actual-content provenance, instance change and audit projection; missing
pending projections roll everything back. Exact concurrent retries return the
same receipt. Rejection cancels the run even when its definition is disabled.
Private emission/completion require approved evidence. No external action is
authorized, and the generic provider executor is never called for these reviews.

Final candidate verification performed locally, after printing worktree, full SHA
and clean status:
- 74 Rust tests across the 17 runbook integration binaries; library build.
- TypeScript noEmit; 11 state/navigation tests; all 12 Playwright scenarios,
  including approval/rejection, stale refresh, account switch, responsive layout
  and existing accessibility checks; Vite production build.
- git diff --check.

Rust 1.95.0, CARGO_TARGET_DIR=C:/cargo-target, incremental off,
RUST_MIN_STACK=67108864, -j1, package debug=0/codegen-units=8 for test/dev.
Docker was initially stopped; Docker Desktop and the isolated
omnyid-runbook-wed375-pg database were started for verification. The disposable
database is stopped after the checks. No production environment was changed.

Earlier candidate a7fdb3d2636e4ef30fe785367bfa377ecb6bc1d9 passed the backend
suite, but one browser test incorrectly tried another decision while stale-error
controls were disabled. The test now verifies the disabled state and refreshes
before reopening confirmation. All final checks above were rerun on d8ebd36d.
Earlier candidate evidence is not the final build provenance.

Unresolved: global line-budget gate still fails on src/server/mod.rs
45734/45717 (one hook line added this batch; prior 45733) and src/db.rs
18045/17986 (unchanged). Vite retains existing screen/chunk warnings. No broad
Wedding suite or full approval/Watcher/Synthesizer suite was claimed; the parent
release-verification entry remains open. GitHub run/deployment queries returned
no records for this branch. Origin remains the unrelated public-history remote;
a suitable production-lineage PR base is unavailable, so no PR or push was made.
No deployment, live provider evaluation, Caddy change or production-health claim.

Next: implement strict tool schema/result validation and existing dispatch behind
separate action authority; then provider inference/ceilings and Documents
projection. Use the frozen verification SHA for any inspection of this candidate;
the implementation branch also contains subsequent documentation-only commits.

## 2026-11-18: WED-375 six starter/review entries verified

Implementation worktree: `C:/temp/wt/omnyid-runbooks`, branch `agent/codex/WED-375`.
Frozen candidate: `19873160bb5bdf65964c0ecee972c7574ab0d89d`.
Verification worktree: `C:/temp/wt/omnyid-runbooks-verify-43d7c830` (clean detached).

Targets: existing action/approval AFP projection, calendar conflict, quote gaps,
RSVP reminder, runsheet change, and general workflow/file/information-gap flows.
All six existing entries are complete: 97 complete / 20 remaining of 117.

Changes: new runbook_schedule_review.rs and runbook_review_gate.rs; bounded
calendar alternatives; canonical runsheet snapshot timing/duration diffs; strict
permission/exact-question Draft checks; answer-bound generic gap emission;
atomic private action, provenance, waiting trace and existing audit projection;
existing approval summary rendering in RunbookPanel/Decision Queue. Full private
proposal previews are absent from the audit table. Cancellation withdraws pending
reviews. Tests cover starter acceptance, denial, owner isolation, replay and UI.

This is review preparation only. Approval consumption/resume, external execution,
live inference and hosted rollout remain open. No send, publish, booking or retry
was enabled. No migrations/dependency changes or sitemap edits.

Candidate frontend checks completed locally: TypeScript; 11 UI tests; nine
Playwright scenarios including previews, mobile, accessibility and account
switch; Vite production build. Existing line-budget failures remain exactly
src/server/mod.rs 45733/45717 and src/db.rs 18045/17986. Vite reports existing
screen/chunk warnings. All 72 Rust tests in 17 binaries and the library build completed on this exact
source. Focused starter/transform tests: 16; existing regression tests: 56.
Rust 1.95.0, CARGO_TARGET_DIR=C:/cargo-target, incremental off, RUST_MIN_STACK=67108864,
-j1, package debug=0/codegen-units=8 for test/dev. Live release gates remain open.

Earlier candidate compilation caught and fixed a duplicated visibility keyword
and a test-only call to a crate-private schema helper. An obsolete compile was
stopped when the final duration preview changed; it is not test evidence.

PR/CI queries returned no WED-375 PR/runs. origin points at the unrelated public
history; do not push this production lineage there. A suitable review remote/base
is still required. No deployment. Disposable DB omnyid-runbook-wed375-pg on localhost:55475/omnyid_test was used
for verification and is stopped after the completed suite.

Next: owner BYOK/shared inference and existing approval/action/tool authority.
The emission/rendering checklist entry is complete; approval consumption/resume
remains covered by the open executor and authority items. Do not enable execution.
The subsequent coordination commit records evidence; the frozen source above is
the tested code candidate.

## 2026-11-18: WED-375 aggregate model budgets verified

Implementation worktree: `C:/temp/wt/omnyid-runbooks`, branch `agent/codex/WED-375`.
Frozen tested source: `17e49657698f3d325570931b80569fc2e99ac211`.
Verification worktree: `C:/temp/wt/omnyid-runbooks-verify-43d7c830` (clean, detached).

- Completed six implementation items: strict owner policy contracts; durable
  account/Runbook/instance reservations; conservative settlement; visible budget
  pause/resume; concurrency/deletion/replay safeguards; regression tests. These
  complete ONE parent checklist task. Count: 91 complete / 26 remaining of 117.
- Added src/runbook_budget.rs. Updated model runtime, instance contract, private
  store validation, activity, lib export, runbookState.ts and both model/UX tests.
  Policies are encrypted revisioned AFP; default limits are zero. Configuration
  is trusted/internal only. Limits apply to Runbook model spending, and do not
  replace the existing shared-provider funding/billing controls.
- Owner transaction locking serializes reservation with concurrent calls/config.
  Reserve the maximum permitted call/escalation cost before releasing the lock.
  Existing immutable model results settle actual usage. Missing results retain
  full reservation; unknown attempts retain ceilings across UTC midnight. Known
  spend belongs to the reservation's UTC day; instance usage is lifetime.
- Provider over-ceiling responses stop subsequent account model calls pending
  reconciliation. Limits never reset usage. Old reservations without budget
  bindings fail closed for new spending; exact result replay still works.
- Exhaustion creates WaitingForBudget without spending or advancing the step.
  Activity exposes bounded usage, UI labels the pause. Internal resume checks
  revision/enablement/capacity; execution rechecks before reserving. Cancellation
  remains available. No HTTP configuration/resume route or live call path added.
- Final source: all 63 focused Rust tests in 16 binaries completed, including 12
  model/budget tests. Library build, TypeScript, 11 UI tests, eight Playwright
  scenarios (responsive/keyboard/zoom/account isolation) and frontend build also
  completed. Tests use only omnyid-runbook-wed375-pg on localhost:55475/omnyid_test.
- Rust +1.95.0; CARGO_TARGET_DIR=C:/cargo-target; CARGO_INCREMENTAL=0;
  RUST_MIN_STACK=67108864; -j1; package debug=0/codegen-units=8 (test/dev).
  Initial final-source compiler attempt crashed with 0xc0000005; no tests ran in
  that attempt. Same-source retry completed. Earlier candidate 9c97dab7 had also
  completed 34 selected Rust tests, but final evidence above is for 17e49657.
- Line-budget gate still fails only unchanged src/server/mod.rs 45733/45717 and
  src/db.rs 18045/17986. Vite reports existing screen/chunk-size warnings.
  No migrations/dependency changes, live provider calls or deployments.
- PR/CI query returned no WED-375 PR/runs. origin/main is still the unrelated
  public repository history; do not push this production lineage there. A suitable
  integration/review remote/base remains necessary for the repo's PR workflow.
- Next: owner BYOK/shared inference resolution, real provider-enforced cost
  bounds and shared funding integration, then production model policy/evaluation
  and existing approval/action/tool authority. Do not enable execution yet.
  Unknown-spend reconciliation and bounded-ledger archival remain explicit future
  work; never release uncertain funds automatically. Claude retains sitemap work.

## 2026-11-18: WED-375 five model-step implementation tasks completed

Implementation: `C:/temp/wt/omnyid-runbooks`, `agent/codex/WED-375`.
Frozen tested source: `cbd753ebb56a45c2252cb273a5bde9b5ec175d6c`.
Clean verification worktree: `C:/temp/wt/omnyid-runbooks-verify-43d7c830`.

- Added src/runbook_llm_step.rs, src/runbook_model_runtime.rs and
  tests/runbook_model_postgres.rs. Updated lib exports, store validation and
  completion receipt checks. Coordination/checklist/decisions updated separately.
- Closed exactly five checklist items: bounded classify/reason/draft executor;
  strict structured/AFP draft outputs; reusable prefixes/source limits/unchanged
  input suppression; usage/hash/revision/source provenance; mocked-provider tests.
  Checklist now 90 complete / 27 remaining of 117.
- Only a preceding verified Transform receipt can feed a model. Schema/size/source
  validation rejects unknown/duplicate fields, forged citations and draft routing.
  Runtime-generated full AFP draft envelopes are private, owner-addressed and
  approval-required, nested in encrypted results; nothing is sent/published.
  Draft/request/result Debug implementations redact private generated content.
- Reserve in the private ledger before calling, release the transaction for the
  provider, then recheck state/enablement before atomic result/trace/provenance/
  revision persistence. Concurrent/crash retries cannot duplicate calls. Pending
  uncertain calls require future explicit reconciliation. Cancellation, disable
  and account deletion win over late responses. Completion resolves the real
  applied model receipt. Generic local-result callers still cannot create models.
- Request prefixes and owner/schema/model cache keys are reusable; suppression
  is owner/instance/step/frozen-input scoped. No observed provider cache savings
  are claimed. Per-attempt observed usage and unknown-usage flags are preserved;
  unknown timeout/error spend retains its reservation ceiling. Trace counters
  sum observed response usage. One Luna-to-Sol escalation requires a valid but
  below-threshold result plus policy, retry and remaining step-cost allowance.
- Final source completed all 57 focused Rust tests (including six model suites)
  and cargo build --lib. Mock scenarios cover the three output kinds, schema and
  duplicate-field rejection, foreign citations/owners, routing/approval injection,
  timeout/provider failure, cost/token/model mismatch, cache prefix, historical
  replay, escalation denial/caps, interrupted/concurrent calls, cancellation,
  disable, account erasure, encrypted records, provenance and debug redaction.
- Final successful settings: Rust +1.95.0, CARGO_TARGET_DIR=C:/cargo-target,
  CARGO_INCREMENTAL=0, RUST_MIN_STACK=67108864, -j1, package debug=0 and
  codegen-units=8 for both test/dev profiles. Earlier attempts at 16 codegen units
  hit access violations/stack overflow/0x80000004. At 8, a test-binary compiler
  crash was followed by successful same-source retry. Do not count crashed runs
  as test execution. Project toolchain/profile files were not changed.
- Disposable Postgres :55475 was used and stopped after verification. No schema
  migrations, frontend or dependency changes. Frontend suites/build/audit were
  not repeated. Line-budget on final source reports only unchanged server/mod.rs
  45733/45717 and db.rs 18045/17986. Prior dependency advisories remain unresolved.
- No live inference adapter or provider calls, no HTTP/event-hook model execution,
  no rollout flags or deployment. BYOK/shared inference routing, production model
  policy/evaluation and persistent account/runbook/instance budgets remain open.
- GitHub Actions still has no WED-375 run. Unrelated origin/main history prevents
  a suitable PR; no push/unrelated-history merge made. Author retains SEO ownership.
- Next: owner-scoped inference ladder plus durable aggregate budget reservation,
  then existing approval/action/tool integration. Do not connect a live provider
  before those gates. Calendar/runsheet and full Documents projection remain open.

## 2026-11-18: WED-375 quote category-gap assessment

Implementation: `C:/temp/wt/omnyid-runbooks`, `agent/codex/WED-375`.
Frozen tested source: `26d3d5531ec33669d11c72b782f3a4b5d1589c4c`.
Clean verification worktree: `C:/temp/wt/omnyid-runbooks-verify-43d7c830`.

- Changed src/runbook_quote.rs, src/runbook_transform.rs and their two test files.
  Shared the frozen normalized-quote loader with ReviewStoredQuote and implemented
  FindQuoteGaps using the existing generic/venue category registry.
- Required categories are bounded to 32, alias-resolved, sorted and deduplicated;
  unknown categories/registry versions fail closed. Findings distinguish absent,
  uncertain/excluded and recorded facts, retaining structured source paths and
  quote/registry fingerprints. Recorded is not commercial completeness.
- At most three internal question candidates use registry-authored templates.
  Vendor prose is not copied. No normalization, sending, approval grant or action
  dispatch is added; the unchanged missing-items starter stops at Draft.
- All 51 focused Rust tests and the library build completed on the exact source.
  Unit coverage includes aliases, duplicate/unknown/unbounded inputs, tax/validity,
  evidence uncertainty, confirmed exclusion, deterministic ordering and no copied
  vendor instructions. Postgres coverage mutates the source after Read, exercises
  concurrent/foreign/revision retries and confirms emission/completion cannot skip
  Draft; no suggestion/action/approval records are created.
- Rust +1.95.0, -j1, CARGO_INCREMENTAL=0, CARGO_TARGET_DIR=C:/cargo-target,
  package debug=0/codegen-units=16. No compiler crash this batch. Disposable local
  Postgres :55475 used and stopped after verification. Frontend and dependencies
  unchanged, so frontend tests/build and dependency audit were not repeated.
- Checklist stays 85 complete / 32 remaining. This closes the assessment dependency,
  not full draft/approval/provider acceptance. No rollout/deployment or flags changed.
- No WED-375 GitHub Actions runs. Unrelated origin/main history still blocks an
  appropriate PR; no push or unrelated-history merge. Prior dependency advisories
  and line-budget overages remain outside this change.
- Next execution dependency: model/draft output and existing approval/action
  integration. Existing quotation send authority lives in
  src/server/quotation_routes/clarification_routes.rs and src/quotation/clarification.rs;
  it binds draft hash, recipient, quote/comparison revision, expiry and receipt.
  Candidate questions are not a ClarificationDraft and must not bypass those checks.
  Calendar/runsheet transforms and full Documents projection also remain open.
  Claude retains sitemap ownership; prior SEO release unchanged.

## 2026-11-18: WED-375 stored vendor quotation review dependency

Implementation: `C:/temp/wt/omnyid-runbooks`, branch `agent/codex/WED-375`.
Frozen tested source: `1509438f2aa32adb1ec06fe1dcf763c94f0bb0c3`.
Clean verification worktree: `C:/temp/wt/omnyid-runbooks-verify-43d7c830`.

- Added src/runbook_quote.rs and tests/runbook_quote_fixture.json; registered the
  module, extended runbook_transform/runbook_emit and their focused tests.
- ReviewStoredQuote resolves exactly normalised_quote_ref inside the saved owner
  Read packet and reuses NormalisedQuotation plus its existing validator. No
  duplicate normalization, live refetch or fallback to an inline event quote.
  Bounds, exact date syntax, wedding context, missing/duplicate evidence and
  malformed schema/validity are checked. Findings retain the version fingerprint.
- Existing private review emission supports this operation, with lifecycle and
  evidence-review counts. It grants no availability, booking or payment authority.
  The unchanged vendor starter now completes through its real stored review_ref.
- Local evidence on the clean source: all 48 focused Rust tests and library build
  completed. First test compilation crashed with Windows STATUS_ACCESS_VIOLATION
  while building runbook_transform_postgres; retry of identical source succeeded.
  Tests cover malformed/missing/ambiguous/oversized quote evidence and fingerprint
  changes, plus concurrent replay, foreign/stale requests, disable, rollback,
  encrypted review content and absence of task/action/approval creation.
- Used Rust +1.95.0, CARGO_TARGET_DIR=C:/cargo-target, incremental off, -j1 and
  package debug=0/codegen-units=16. Disposable local Postgres :55475 used; stopped
  after verification. Frontend and dependency files unchanged; no frontend rerun.
- Checklist remains 85 complete / 32 remaining. The vendor starter checklist item
  includes Documents/response projection and separate booking approval, so it
  remains open despite the now-verified private review dependency.
- GitHub Actions query returned no WED-375 runs. Existing unrelated origin/main
  history still prevents a suitable PR; no push or unrelated-history merge made.
  No deployment attempted or flags changed. Existing dependency advisories and
  line-budget overages were not addressed by this batch.
- Next: consume existing Documents/quotation response projections and integrate
  existing booking approval authority; then other domain/tool/model dependencies.
  Claude retains ownership of sitemap work. No change to the prior SEO release.

## 2026-11-18: WED-375 private review emission and starter completion

Implementation: `C:/temp/wt/omnyid-runbooks`, `agent/codex/WED-375`.
Frozen source: `2e0583563cdaaba505c8c50638eaf35f5e9ecd7e`.
Clean verification worktree: `C:/temp/wt/omnyid-runbooks-verify-43d7c830`.

- Added src/runbook_emit.rs and tests/runbook_emit_postgres.rs; changed private
  store validation, internal step persistence, completion and activity projection.
  Updated existing RunbookPanel/runbookState and browser scenarios.
- Dedicated Emit consumes frozen transform output and atomically writes the
  existing proactive_suggestion contract plus receipt/provenance/trace/revision.
  No action payload, approval grant or provider dispatch. Generic local-result
  calls still reject Emit. Only supported review operations/selectors are allowed.
- Completion requires the real emission and hash-matching suggestion for review_ref.
  Activity/Fleet/Decision Queue display bounded, escaped, read-only review summaries,
  including completed instances, with account-switch clearing and no execution UI.
- Unmodified budget/task/file starters complete in one integration scenario. It
  covers cross-owner/stale access, disable/reenable, concurrent replay, forced
  trace collision rollback, encrypted content and no task/action/approval creation.
  Budget/task checklist items closed: 85 complete, 32 remaining. File path is
  verified, but the grouped general-starter item remains open for workflow/info-gap.
- Local checks on exact source: 47 Rust tests, library build, TypeScript, 10 focused
  frontend tests, eight Playwright scenarios, production frontend build completed.
  Disposable Postgres container stopped after verification.
  Rust +1.95.0, -j1, CARGO_INCREMENTAL=0, CARGO_TARGET_DIR=C:/cargo-target, package
  debug=0/codegen-units=16. Disposable local Postgres :55475 used for integration.
  Playwright config: solid-ui/playwright.runbooks.config.ts (8 scenarios, includes
  narrow layouts, 200% zoom, serious/critical axe checks and malicious text escaping).
- Initial compiler at 6eb2931f crashed with STATUS_ILLEGAL_INSTRUCTION. Final source
  compiled normally. Initial direct Node test lacked the repo import hook; use
  --import ./tests/node-ts-specifier-hooks.mjs with --experimental-strip-types.
- Line-budget still fails only unchanged server/mod.rs 45733/45717 and db.rs
  18045/17986. No dependencies changed; prior six advisories/five warnings persist.
- No candidate CI or PR: origin/main still has unrelated open-source history,
  so no push or unrelated-history merge. No Runbook deployment/flag changes.
- Next: existing approval/action contracts and tool schema/dispatch integration,
  then remaining domain transforms/model steps. Do not infer approval authority
  from a review, feedback, trace or historical policy receipt. Other agent retains
  sitemap ownership. The prior SEO static release is unaffected.

## 2026-11-18: WED-375 deterministic review and retention continuation

Implementation worktree: `C:/temp/wt/omnyid-runbooks`, branch `agent/codex/WED-375`.
Frozen source SHA: `a9ed13670a74829387dcc8e9892ac61f818a4a9b`.
Verification worktree: `C:/temp/wt/omnyid-runbooks-verify-43d7c830` at that SHA.

- Added runbook_transform/runtime and retention modules; wired private receipt
  validation and default-off allowlisted maintenance retention. Added three test
  files and extended hook flag checks. Immutable private records are retained.
- Eight transforms consume frozen reviewed facts and same-step answers, produce
  review data only, and atomically persist receipt/provenance/trace/advancement.
  Strict typed facts include inactive branches; money uses checked integer units.
- All 46 focused Rust tests and library build completed locally on the clean SHA.
  Rust 1.95.0, one job, CARGO_INCREMENTAL=0, package debug=0 and codegen-units=16;
  CARGO_TARGET_DIR=C:/cargo-target. Test DB was disposable local Postgres :55475.
  Initial 10f82f76 compiler crashed with STATUS_ACCESS_VIOLATION; final candidate
  completed. Toolchain pin remains unchanged. No frontend changes in this batch.
- Retention handles 100 rows per pass, verified with 101 rows, and never deletes
  unproven generic outcomes or private evidence. Recent regret extends retention.
  Histories over 4096 fail closed; sustained rollout needs archival/index design.
- Checklist now 83/117 complete (34 remaining). Four domain transforms and all
  actual model/tool/emit/approval execution plus full starter acceptance remain.
  Internal transform fixture omits Emit and does not close full starter acceptance.
- Existing line-budget gate fails only server/mod.rs 45733/45717 and db.rs
  18045/17986. Prior audit has six advisories/five warnings; no dependencies changed.
  No clean security-gate claim. No Runbook deployment or flag change.
- Disposable test Postgres container stopped after verification. Branch is committed.
- PR/remote CI not completed: GitHub has no PR or run for WED-375, and
  origin/main is unrelated open-source root 509dc31b1423d87c52fbebe5ab85efffacd0c750.
  `git diff origin/main...HEAD` reports no merge base (repository is not shallow).
  Did not push the production lineage into that remote or merge unrelated histories.
  A suitable integration/review remote or base is needed before the PR boundary.
- Next: review this branch, consume existing calendar/quote/runsheet projections,
  and connect existing approval/action contracts before any execution rollout.
  SEO release is separately documented below; do not conflate its static source
  SHA with this application candidate.

## 2026-11-18: SEO-001 static release consumed from Claude

Author snapshot `a2643ce12803ba9defa2cd48a745ee169a2b3adf` was cherry-picked onto
`agent/codex/WED-375` as `7aaa3b4ee42c0e890d587e72d59f68845525ee5b`.
Claude retains ongoing sitemap ownership in `C:/temp/wt/omnyid-seo`.
Static release was packaged from clean detached worktree
`C:/temp/wt/omnyid-runbooks-verify-43d7c830` at that exact SHA.
The verification worktree has since advanced to the Runbook candidate; use the
full static SHA above for reproducing this release, never its current HEAD.

- Four smoke suites (metadata 93 pages, website, catalogue and CSP) and Caddy
  config validation completed. Production Caddy had no server-only blocks.
- Archive preflight initially rejected a Git-versus-archive CRLF hash mismatch
  before changing production. The corrected manifest hashes actual archive bytes
  and separately records Git blob hashes, checking newline-only normalization.
- Static `docs`, `wedding` and Caddy content deployed; Caddy was recreated using
  existing compose/env. Application container ID/image remained unchanged.
- 328 deployed file hashes match the manifest. HTTPS llms/robots/sitemap and
  representative updated pages match origin content after accounting solely for
  Cloudflare email obfuscation. llms is 200 text/plain; llms-full remains 404.
  Python urllib is denied 403 by the edge; curl checks from Oracle completed.
- Public healthz/readyz return 401; this release makes no application-health claim.
- Machine evidence: `C:/temp/wt/seo-001-hosted-verification.json` and
  `C:/temp/wt/seo-001-7aaa3b4e-manifest.json`.
- Retained rollback archive:
  `/home/ubuntu/omnyid-static-backups/seo-001-7aaa3b4ee42c0e890d587e72d59f68845525ee5b/previous.tar`.
  Restore it into `/home/ubuntu/omnyid`, then recreate Caddy with existing compose
  configuration; a reload does not refresh the file bind mount.
- No Runbook application deployment or flag change was part of this release.

## 2026-11-18: SEO-001 integration ownership (Codex)

User supplied Claude handoff at 172a7c80, content a2643ce12803ba9defa2cd48a745ee169a2b3adf.
WED-375 is now committed and clean at a131695c; the earlier dirty-tree warning
is historical. Codex integrates the frozen SEO content snapshot and verifies it;
Claude retains ownership of ongoing sitemap/content changes in omnyid-seo.
No application deployment or Runbook rollout is implied by a static Caddy release.
The supplied handoff requires Caddy recreation, not reload, preserving server-only
configuration. Its full note remains in commit 172a7c80:.agent/HANDOFF.md.

## 2026-11-18 - WED-373 small-wedding alignment and Wedding reliability release candidate (Codex)

Worktree `C:\temp\wt\omnyid-wed373`, branch `agent/codex/WED-373`, based on
production application SHA `402e1f6b8ce5e95a17ff22d1618c4f7ff6f9f615`.

- Lightly aligned the public Wedding hero with personal, right-sized Australian
  weddings without adopting the unrelated draft architecture in the source
  documents. The public cinema-wedding article now links to James Theatre
  Dungog and The Roxy Theatre Bingara. A small idempotent operator SQL load uses
  their official source evidence and retains verify-before-booking caveats.
- Wedding Sprout now uses the server-side OpenAI key for this feature only. It
  retains authenticated per-user rate limiting and the shared USD 50 weekly
  cutoff, rejects unrelated and cross-account prompts before inference, sends
  no wedding ledger content or browser-supplied plan authority to the provider,
  and only returns reviewable navigation/staged field suggestions.
- Removed the remaining legacy global-key fallback from Wedding browser
  mirrors. Pre-session drafts use an anonymous namespace and authenticated data
  uses the immutable account id. The overview now prioritises earlier journey
  stages, restores its due-date label, and retains date/budget/guest setup before
  generic preparation work.
- Budget now has a stronger total field, larger allocation guidance, draggable
  range affordances, summary icons and a quote handoff that focuses the intake
  dialog even when no quote exists. RSVP event creation has a visible suggestion
  select plus free text. Vendor search rotates examples and mode tabs consume
  their click locally instead of navigating/reloading. Timeline and Up Next
  supporting text is larger.
- Secret handling: the supplied plaintext OpenAI value was migrated to the
  existing gitignored local secret-file convention and the Oracle env references
  that file. No value is present in code, Git output or this handoff.
- Evidence: TypeScript passes; 33 focused Wedding tests pass; both focused Rust
  modules pass (4 tests); all public Wedding/metadata/CSP/quiz/magnet/countdown/
  quote site checks pass; the full Wedding suite is 2305/2306 with only the
  pre-existing `wedding-lead-magnet-import-state.test.ts` expected-rejection
  assertion failing. Changed Rust files are formatted and `git diff --check`
  passes; global rustfmt still has unrelated baseline drift.

Release action for this session: commit, build from a clean checkout of the
exact commit, sync the secret file without exposing it, deploy, run the cinema
operator SQL, and verify runtime SHA/health/public assets plus an authenticated
Sprout request. Do not describe inference as reading the user's plan until a
separately authorised server-side context selector exists.

## 2026-11-15 - WED-366 vendor sales operations portal (Codex, released; inbox confirmation pending)

Worktree `C:\temp\wt\omnyid-wed360`, branch `agent/codex/WED-360`.
Application commit `caead2c714a340e511c7edd4f323655d2d218411` was built and released from clean
detached checkout `C:\temp\wt\omnyid-wed366-release-caead2c`.

- Extended the existing vendor portal rather than creating a second CRM. Claimed vendors now have a
  dated response/stage history, non-linear journey stages, current customer state, 90-day totals,
  12-week trends, printable records, computed exception escalation and a named-room availability
  calendar. `price_review` reuses the Limited Specials calendar authority but is excluded from public
  availability discovery.
- Migration `0173_wedding_vendor_sales_operations` stores content-light journey state plus append-only
  events. Private enquiry content remains in its existing encrypted authority; tenant/vendor scope,
  optimistic revision and idempotency checks remain server-enforced.
- Local evidence: Solid UI typecheck and production build pass; five focused vendor-portal contracts
  pass; `cargo check --lib` passes; a clean Linux image build and disposable pgvector/PostgreSQL 18
  startup applied migration 0173 and accepted the new constrained states. The full Wedding run is
  2,283/2,284 with the unrelated pre-existing `wedding-lead-magnet-import-state.test.ts` rejection
  assertion still failing. Linked Windows Rust test binaries crashed inside rustc twice with process
  faults and produced no source diagnostic.
- Hosted evidence: `SOURCE_COMMIT` and `oracle-runtime-manifest.json` both contain the full application
  SHA; production has migration 0173; the unauthenticated operations route returns the expected 401
  boundary rather than 404; and the released `vendor-D4Bhynqh.js` contains the Sales & records surface.
  Caddy and the homeserver are serving, and ClamAV is healthy.
- Oracle reached 100% during the first homeserver rotation because `/var/backups/omnyid` had accumulated
  about 21 GB of repeated generations. Only backups older than 12 Nov were removed after their exact
  paths were enumerated. The six newest generations remain, including the 15 Nov dump whose manifest
  records verification `passed`; root usage is now 66% with about 16 GB free. No database, attachment
  volume, current image or active service data was removed.
- The general deploy wrapper stalled in its post-proof phase and was stopped after direct hosted checks
  passed. The split homeserver/UI builds themselves completed. This is recorded rather than treating the
  wrapper as machine-owned green evidence.
- Controlled mail evidence: Cloudflare Email Sending accepted and queued one production test to
  `casper.wu01@gmail.com` from `hello@omnyid.com`, returning a provider message ID with no immediate
  bounce or suppression. Do not claim inbox delivery until the recipient confirms it.

Recommended next action: have the test vendor confirm receipt, then exercise one authenticated claimed
vendor journey through stage update, printable summary and room price-review state in a browser. Also
add an explicit backup-retention job so repeated deploy proofs cannot refill `/var/backups`.

## 2026-11-12 - WED-365 quote upload, operator authority and bulk celebrant slice (Codex, in progress)

Worktree `C:\temp\wt\omnyid-wed360`, branch `agent/codex/WED-360`.
Implementation commit `2a86946ffe1e2fdf5e9a96fe6336e02300ad06e9` was released from clean
detached checkout `C:\temp\wt\omnyid-wed365-release-2a86946`.

- Oracle `.env.oracle` and the recreated homeserver now agree on
  `admin@omnyid.com,concensure@gmail.com`. The container is running and serving
  workload after restart. Hosted health URLs return the environment's 401
  authentication boundary rather than an anonymous health payload; logs show
  active queries and no restart loop. The allowlist is documented without
  secrets in `Documents/operations/oracle/2026-11-12-operator-admin-allowlist.md`.
- The public quote article no longer lets native `required` validation reject
  text loaded by the local file reader. The canonical in-memory text is length
  checked before the rest of the form. A 390px Chromium regression proves one
  explicit extraction request and no request before Analyse quote.
- A selected vendor category is now authoritative for internal directory
  results even when the typed words say generic `wedding vendors`; an external
  fallback is rewritten to `wedding [category] [location]`. Focused Rust and
  TypeScript tests pass.
- Wrote the verified celebrant audit/spec/tasks requested by the bulk brief.
  The first implementation slice adds an operator-only 1-100 batch endpoint
  and selection/copy UI. Existing links are preserved by default, celebrant
  identity locking serialises concurrent first-link creation, and plaintext
  bearer URLs are returned once without entering events/analytics. Runtime
  link, consultation and phone-verification readiness are distinct facts.
- Wrote `couple-coworking-spec.md` and `couple-coworking-tasks.md`, extending
  migration 0168 membership and selected-contact grants rather than proposing
  another wedding ledger.
- Evidence: quote browser smoke passes; Solid UI typecheck passes; vendor-query
  tests pass (10 TypeScript, 2 Rust); celebrant management tests pass (5
  contracts and one disposable-Postgres concurrent API test). Global
  `cargo fmt --check` remains red on large pre-existing formatting drift, while
  changed Rust files are formatted and `git diff --check` passes.
- Hosted evidence: both Oracle `SOURCE_COMMIT` and
  `oracle-runtime-manifest.json` name the full implementation SHA; Caddy and the
  homeserver restarted; the public quote upload-only Chromium journey passes at
  390 px; and the batch celebrant route is present and rejects an unauthenticated
  caller with 401 rather than 404. Runtime-script integrity and backup
  verification pass. The post-deploy restore drill is capacity-blocked because
  it calculated about 8.0 GB required while only about 4.2 GB was free during
  the check; no user data, volume or active image was removed to force it.
- Remaining: review invitations, author appeal, DecisionOS dated evidence,
  content-free review analytics and human five-venue pilot gate; later
  celebrant workflow tasks are register controls, outreach status/opt-out,
  minimal listing preview and separately scoped wedding-date authority.

## 2026-11-12 - WED-360 evidence lifecycle and Wedding regression slice (Codex, in progress)

Worktree `C:\temp\wt\omnyid-wed360`, branch `agent/codex/WED-360`;
implementation commit `8cd29692db80aa95730238d97a0db3eb0132b9b6`.

- Saved seating-canvas assignments now feed the canonical seating projection,
  so an already seated attending guest no longer produces an assignment
  decision. Generic Wedding-vendor searches use a bounded whole-directory pass;
  official/source-page-backed records remain eligible. Explicit category
  searches are hard constraints, preventing hair/makeup evidence and Amy Chan
  recommendations from leaking into venue comparisons.
- The public celebrant page now explains and exposes the real phone-verification
  action. It opens the requested celebrant's published consultation time, stays
  honest when no time exists and never silently substitutes another celebrant.
- Migration 0162 and the operator evidence routes extend the existing private
  upload authority. Access requires an enumerated purpose, mints the existing
  short-lived signed attachment URL and writes a content-free audit. Purge is
  scheduled first and records success only after object and tenant attachment
  deletion; failures remain retryable. Review rollout remains false-default.
- Evidence: TypeScript typecheck, full 2,273-test Wedding suite, public Wedding
  site suite, JS syntax check, line budgets and 17 focused frontend regressions
  pass. `cargo check --lib`, nine review contract tests and two evidence-route
  unit tests pass. Disposable PostgreSQL 18/pgvector applied migrations 0161-0162;
  the real router proved concurrent retry convergence, partner duplicate refusal,
  proof linking, purpose-bound access, one access audit, scheduled purge, byte
  deletion and terminal purged state. The exact disposable container was removed.
- WED-360 is not complete and was not deployed. Remaining dependencies are
  claim-specific eligibility, author correction/withdrawal and status UI,
  invitation handling, moderation/publication and disputes, vendor replies,
  deterministic public aggregates/DecisionOS evidence, analytics, accessibility
  and exact-SHA hosted false-default/pilot checks. `Read the couple's story`
  remains deferred until a real couple grants separate permission.

## 2026-11-10 - WED-354 Database, account isolation and quote sharing (Codex, release candidate)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/WED-354`, based on deployed WED-353 SHA
`d5c996dd1a19936aef5c3a8c51248aa5b9f6dbe2`.

- Database fullscreen now uses the native browser API and keeps a visible,
  scrollable fixed-layout fallback. The Wedding projection adds a Run sheet
  sourced from the same ledger and can derive source-linked confirmed vendor
  arrival times from messages.
- Edit Profile exposes the canonical Profile Ledger profiling switch. The
  encrypted ledger, consent and key material are account scoped; authenticated
  local state no longer falls back to ambiguous browser-global keys. Explicit
  6px/7px typography was raised to the eight-pixel floor.
- Workflows catches temporary API failures inside the editor and has a local
  retry/back boundary for unexpected render faults. Firefox's null WebAssembly
  source-map console entry is a developer-tools warning rather than the runtime
  error and is not treated as application health evidence.
- The public venue quote tool now applies safe structured extraction to the
  commercial fields, uses integer steppers, labels manual mapping clearly,
  shows grounded selections in yellow, keeps gateway HTML out of the UI and
  can email an auditable PDF. The PDF and recipient stay out of storage; the
  operator dashboard gets only successful-share counts and a tool link.
- Evidence: `npm --prefix solid-ui run test:wedding:ci` passes line budgets,
  public-site checks and all 2,252 Wedding tests; focused account-state tests
  pass; quote Chromium smoke passes extraction/cache/source/share/mobile
  assertions; `cargo test --lib wedding_quote_decoder_routes` passes three
  tests; `cargo check --lib` and TypeScript pass. The next action is the clean
  exact-SHA UI build, Oracle deployment and hosted provenance/route checks.

## 2026-11-10 - WED-350 source-grounded venue quote comparison (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/WED-350`; exact deployed application SHA
`f5a9f971cdcfe8bfc85b7c74492162d26aa61e98`. Clean release checkout:
`C:\temp\wt\omnyid-wed350-release-f5a9f97`.

- Enlarged desktop `omnyid.com` to 1.1 scale and public Wedding pages to 1.2;
  the breakpoint leaves phone scale unchanged. Chromium confirms the quote
  page has no horizontal overflow at 390px.
- Replaced public regex guesses with an explicit, privacy-disclosed,
  source-grounded extraction route. Exact server-side snippet/type/range
  validation, three evidence states, commercial terms, editable line items,
  ambiguity choices, source navigation, local structured cache and re-paste
  changes are implemented. Manual comparison still works without inference.
- All totals are deterministic. The hosted synthetic `120 guests x A$275`
  smoke returned pricing model `per_head`, rate 275, guest count 120 and
  `whole_package_amount=not_found`. The public server reported no retention.
- OpenRouter is mounted from a root-owned mode-0600 Oracle secret file. Funded
  inference is enabled under the existing hard USD 50 weekly ceiling. Usage
  accounting no longer stores prompt-derived fingerprints.
- Added the dedicated v2 spec/task plan and recorded the already-published
  Budget Reality Check source contract in the requested magnet folder.
- Exact-SHA evidence: two focused Rust route tests pass; Wedding CI passes both
  line budgets and all 2,249 tests; production Vite build passes; browser smoke
  proves explicit activation, local cache, component-total protection, mobile
  layout and both desktop scales.
- Oracle `SOURCE_COMMIT` and `oracle-runtime-manifest.json` match the deployed
  SHA. Final production proof reports homeserver and backup running, manifest
  verification and backup verification passing, and 79% root/var use. The
  restore drill was deliberately skipped in the final quick proof; the deploy
  wrapper's detached post-proof was interrupted after it failed to return, as
  in WED-349. Evidence is under
  `C:\temp\wt\proofs\wed350-release-f5a9f97`.

## 2026-11-09 - WED-349 consented analytics and quote-decoder release (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/WED-349`; exact deployed application SHA
`9d1c6341ca69fd55d004239d2a974f02d42a9d00`. Clean release checkout:
`C:\temp\wt\omnyid-wed349-release-9d1c634`.

- Added a permanent redirect from the reported doubled Wedding quote-decoder
  path to the existing canonical page. Hosted checks return 308 then 200.
- Added one privacy-preference controller across the public Wedding site.
  Essential service is always available; optional Analytics is false by
  default, changeable, and disabled by GPC/DNT. Both first-party measurement
  and the Ahrefs declaration remain inert until opt-in.
- Kept public-site analytics separate from the signed-in, wedding-scoped
  `Share content-free progress statistics with OmnyID` choice. It is unticked,
  records consent revisions, limits growth projection to four content-free AFP
  event kinds, excludes private values/content, and deletes the plan projection
  plus rebuilds aggregates on withdrawal.
- Updated the public privacy explanation and wrote the evidence/limitations
  audit at
  `Documents/issues/wedding planner/2026-11-09-wedding-consent-analytics-privacy-audit.md`.
  It describes observed boundaries and questions for an Australian privacy
  professional; it does not declare legal compliance.
- Exact-SHA `npm run test:wedding:ci` and `npm run build` pass. Hosted privacy
  browser smoke confirms no Ahrefs request before consent, essential quote-tool
  use while declined, one load after opt-in, withdrawal, and GPC enforcement.
  CSP permits Ahrefs only so the consent controller can activate it.
- Full Rust result: 2,721 passed, 4 failed, 1 ignored. The four failures are
  brittle source-text assertions in untouched auth, conversion, orchestration
  and integration-alias modules. The one task-caused Vendor Image Licence
  digest failure was corrected and its focused test passes. Docker Desktop's
  local engine was unavailable, so the disposable PostgreSQL consent
  integration test was not exercised locally; migration catalog tests pass and
  production accepted migration 0153.
- Oracle `SOURCE_COMMIT` and `oracle-runtime-manifest.json` match the exact SHA.
  The detached machine audit reports homeserver and backup service running,
  manifest and backup verification passing, restore drill passing, and 75%
  root/var use. The local deploy wrapper failed to collect the already-complete
  detached result and was stopped after hosted verification; the untouched
  machine output and hashes are preserved under
  `C:\temp\wt\proofs\wed349-release-9d1c634\postdeploy-detached`.

## 2026-11-09 - WED-348 Limited Specials recovery (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/WED-348`, based on deployed SHA
`b0d08b0ffc2c9ff3e4be571e7103bf3f74024a85`.

- Reproduced the hosted Limited Specials error using the real sign-in UI. The
  discovery POST returned 415 because four client requests used a JSON string
  without the shared client's JSON content-type path. They now use `bodyJson`.
- Kept resource errors within the map and added a useful no-specials path:
  select a directory vendor and date, then enter the existing reviewed enquiry
  composer. Missing evidence remains unknown and never becomes a booking claim.
- Added Australian state-labelled fuzzy location suggestions to the existing
  Invite Proposals location editor. Directory locations enrich a bounded local
  seed; the existing wedding-context AFP record remains authoritative.
- Added a desktop More category control while preserving the typed query and
  the existing mobile Venue/Photographer/See all pattern.
- Sent the authorised controlled 6HEAD enquiry for 30 November 2026 to
  `concensure@gmail.com`; Cloudflare accepted it. Redacted evidence is in
  `Documents/verification/wed-348-limited-specials-date-enquiry-2026-11-09.md`.
- Released exact application SHA
  `8ddf8832b241fa1f00c5e12912da19bc52460626` from clean detached worktree
  `C:\temp\wt\omnyid-wed348-release-8ddf883`. Oracle `SOURCE_COMMIT` and
  `oracle-runtime-manifest.json` match. Production proof and backup verification
  pass. Exact-SHA TypeScript, 2,249 Wedding tests, two line-budget tests and the
  production build pass.
- Authenticated hosted discovery now returns 200 JSON for the request shape that
  failed with 415. The live bundle contains the fallback enquiry, Ryde NSW and
  desktop More controls. Production has active directory vendor `6HEAD Sydney`.
- The controlled account's fresh headless browser session rendered the generic
  response queue rather than Wedding visual navigation. Do not represent this
  run as a complete visual click-through; retain it as account/deep-link
  regression evidence in the next account-boundary/onboarding task.

## 2026-11-09 - WED-346 quote intake and RSVP seating continuation (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/WED-346`, based on `59501fbe42e81271dacb1e3b19c31900e5d344d6`.

- Extended Budget at a glance rather than adding a parallel quote store.
  Quotes accepts multiple PDF/DOC/DOCX/TXT/Markdown uploads through the
  existing Documents import, identifies likely vendor email/agent messages,
  and records a user classification as a source reference without copying the
  message body. Extracted quotes have list, normalized reading and up-to-four
  comparison modes with source links.
- Made Forecast range open the same quote intake surface.
- Preserved natural Master Agent questions such as “Anything I should follow
  up next week?” instead of displaying or submitting Boolean-expanded prose.
- Continued the existing seating canvas with a wedding-scoped three-step guide,
  seated/unassigned/table counts, accessible placement feedback and a way to
  return selected seated guests to the unassigned list.
- Added `rsvp-guest-coordination-seating-spec.md` and its dependency-ordered
  task plan. They reuse RSVP, guest, Family Boundaries, provider approval and
  seating AFP authorities; broader response reconciliation/reminder phases
  remain explicitly planned rather than being claimed complete.
- The operator confirmed Gmail received the WED-345 controlled message; its
  evidence report now records that independent observation.
- Verification: TypeScript; 23 focused search/quote/budget/seating tests; all
  2,244 Wedding tests; both line-budget tests; and production Vite build pass.
  The build required `NODE_OPTIONS=--max-old-space-size=8192`; the default
  process exited during transform without a compiler diagnostic.

## 2026-11-09 - WED-345 hosted wedding reliability release (Codex, complete)

- Released clean application SHA `7ae96fa2a67fe14c941657ddeb5fec31f7981c88`
  from `C:\temp\wt\omnyid-wed345-release-7ae96fa`. Oracle
  `SOURCE_COMMIT` and `oracle-runtime-manifest.json` match it.
- Fixed and released the requested Wedding reliability surfaces: delayed More
  dismissal; non-admin Setup Checks/Cost Dashboard guards; safe original-file
  previews; helper rollout wiring; canonical RSVP defaults and inline events;
  full seating navigation/edit/assignment controls; scoped Limited Specials
  failure handling; browser-memory Chat decryption; and an absolute Google
  Calendar OAuth return path.
- Ran an actual Cloudflare provider send to the reviewed Casper address. The
  provider accepted it, the exact replay was suppressed, and the tenant AFP
  ledger held one reservation, one receipt and one retry decision. The operator
  subsequently confirmed Gmail receipt on 2026-11-09 without sharing mailbox
  credentials or message content.
- Exercised the claimed-vendor portal and a fresh expiring availability link:
  one-time exchange, scoped session/CSRF, `vendor_confirmed` to
  `calendar_open`, then restoration to `vendor_confirmed`. Limited Specials
  discovery opened under Ranking Policy V2. Helper/delegate capabilities were
  true only for the reviewed account cohort.
- Removed the synthetic vendor, offer, claim, grants and AFP fixture rows after
  recording evidence. No test vendor remains in the directory.
- Tests: 2,241 Wedding tests, TypeScript, both line budgets, production Vite
  build and focused Rust provider/OAuth/startup tests passed. The synchronous
  production proof passed manifest, runtime-script and backup verification;
  restore drill skipped. Details:
  `Documents/verification/wed-345-hosted-wedding-workflows-2026-11-09.md`.

## 2026-11-05 - WED-337 vendor discovery, onboarding and newspaper release (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/WED-337`; exact deployed application SHA
`a3deb39343e4c81a00489b8209c573ec10ce4f97`. Clean release checkout:
`C:\temp\wt\omnyid-wed337-release-a3deb39`.

- Added Linda Dagher Music and Jessica Zammit to the existing claimable vendor
  authority through idempotent migration 0147. Production has exactly two new
  rows, three source attributes and both listings remain `unclaimed`.
- Fixed the repeated-shortlist cause: descriptive requests now receive a
  bounded wider directory pool, and a raw category count cannot suppress live
  discovery unless at least three candidates carry the requested distinctive
  evidence. Ranking Policy V2 remains the final suitability authority.
- Reconciled the vendor-journey report against the current portal and fixed the
  current verified-claim photo boundary, claim lookup feedback, button tokens,
  bounded upload errors, licence identity/digest, expired-session recovery,
  touch target and implementation-copy leak.
- Published `wedding/blog/how-to-make-a-wedding-newspaper.html` with its index
  card, metadata, taxonomy, catalogue, sitemap and public checks.
- Exact-SHA typecheck, production build, line budgets, 2,215 Wedding tests,
  public-site suites, focused frontend/Rust tests and disposable pgvector proof
  passed. Oracle provenance matches the deployed SHA; the served bundle embeds
  V2 `true`; hosted rustic and waterfront searches took different evidence
  paths; and final backup/runtime proof passed with the restore drill skipped.
- Root disk is 93% used with 3.5 GB free. A dangling-image-only prune reclaimed
  nothing and did not touch volumes, backups, current images or rollback tags.
  Optional future portal enhancements are multi-photo selection, ordering,
  cover editing and removal undo; they do not block the verified single-photo
  journey.

Evidence: `Documents/verification/wed-337-vendor-discovery-onboarding-and-newspaper-2026-11-05.md`.

## 2026-11-01 - WED-314 Family request lifecycle (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch
`agent/codex/WED-308`; exact implementation SHA
`de3e9bb6f74e47c7f2b2f356a821b6205c44e538`. Clean verifier:
`C:\Users\ozans\AppData\Local\Temp\omnyid-wed314-verify-de3e9bb`.

- Couple-captured requests now save as drafts outside the decision queue.
- Added authenticated tenant-scoped, version-checked and idempotent submit and
  withdraw commands. Submit evaluates current rules and does not mutate guests,
  invitations, RSVP, budget, seating or vendor state; withdrawal is confirmed
  and terminal.
- Exact-SHA typecheck, 2,134 Wedding tests, two line-budget tests, production
  build, two browser cases, two Rust units and seven disposable-Postgres Family
  scenarios pass. The temporary database was dropped.
- No deployment was requested. Oracle remains
  `eb398ebfecaec6a0277d7fe634e6c97198b44afe`; helper and delegate switches stay
  false.
- Autonomous Family implementation is complete. Remaining release work is
  couple usability, restricted delegated-helper usability, a separately
  authorised allowlisted cohort and promotion only after its criteria pass.

Evidence: `Documents/verification/wed-314-family-request-lifecycle-2026-11-01.md`.

## 2026-11-01 - WED-313 Family meal, import and accessibility assurance (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch
`agent/codex/WED-308`; exact implementation SHA
`0a889ffeaba142027fb6b3a124e549aed3b117bc`. Clean verifier:
`C:\Users\ozans\AppData\Local\Temp\omnyid-wed313-verify-0a889ff`.

- Plan and RSVP now edit one source-referenced AFP meal catalogue. Explicit
  structured quote/conversation/run-sheet arrays are reviewable; prose is not.
- Replacements identify affected attending responses and require confirmation
  without copying guest identity, meal answers or health facts into the review
  receipt.
- Reviewed guest-list tables project invitation-group households while
  omitting contact, dietary, allergy and private columns.
- Exact-SHA typecheck, 2,131 Wedding tests, line budgets, production build and
  two real-browser 320/375 px plus 200% zoom cases pass.
- No deployment was requested. Oracle and both false-default Family rollout
  switches are unchanged. The autonomous request draft/submit/withdraw slice
  is next; couple/helper usability and a cohort remain gated.

Evidence: `Documents/verification/wed-313-family-meal-import-accessibility-2026-11-01.md`.

## 2026-11-01 - WED-312 Family access management and assurance (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch
`agent/codex/WED-308`; exact implementation SHA
`a1e4023fba9d276f26b3d911fd7c404ed3346d84`. Clean verification worktree:
`C:\Users\ozans\AppData\Local\Temp\omnyid-wed312-verify-a1e4023`.

- Added one owner-facing surface for Family helper links and authenticated
  Planner/RSVP-guest grants. It distinguishes the authority types, reveals a
  helper capability once, lists no secret material and requires explicit
  revocation confirmation.
- Enforced structured allocation, deadline and scoped-rule conditions in the
  UI and server. Only pending/partially-approved requests remain reviewable;
  elapsed deadlines close without applying connected mutations.
- Exact-SHA typecheck, 2,124 Wedding tests, two line-budget tests, production
  build, 13 focused Rust unit tests and seven disposable-Postgres scenarios
  pass. The temporary database was removed.
- No deployment was requested. Production remains
  `eb398ebfecaec6a0277d7fe634e6c97198b44afe`; both Family rollout switches
  remain false. Hosted accessibility/usability, CSV import, shared meal
  catalogue editing/impact review and a separately authorised cohort remain.

Evidence: `Documents/verification/wed-312-family-boundary-access-assurance-2026-11-01.md`.

## 2026-10-31 - WED-306 native mobile, sourced meals and family-boundary first slice (Codex, in progress)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch
`agent/codex/WED-306`; exact deployed application release
`3c626dd149d61ae57c739fa90cd26acecb0109aa`. Clean release checkout:
`C:\Users\ozans\AppData\Local\Temp\omnyid-wed306-release-3c626dd`.

- Removed the desktop glass frame/inset from authenticated Wedding mobile
  surfaces while preserving internal card boundaries. The onboarding photo
  prompt no longer exposes WebP implementation detail and exact selections
  can be selected again to remove them.
- Added one workspace-scoped, source-labelled and couple-confirmed meal-choice
  catalogue projection. It reads only explicit structured fields from venue
  packages/quotes, vendor conversations or the run sheet; prose is not treated
  as authoritative. RSVP and guest entry use the same AFP catalogue.
- Reworked Family boundaries into a compact Requests/Households summary over
  the existing AFP boundary state. Existing request, rule and visibility
  controls remain behind an accessible disclosure.
- Fixed the vendor quote frontend to call the deployed protected
  `/quotation/vendor-transactions/*` endpoints instead of nonexistent
  `/api/quotation/vendor-transactions/*` paths.
- Exact-SHA typecheck, ten focused tests, both line budgets, all 2,101 Wedding
  tests, production build and the 320 px/desktop People Playwright checks pass.
  Oracle deployment and post-deploy backup/restore proof pass. Hosted bundles
  contain the new intake/family/meal markers and no old WebP copy; the correct
  quote inbox route returns 401 without a session while the old path returns
  404. All approved quotation flags remain true and public RSVP remains false.
  Root disk returned to 83% after the isolated restore drill was removed.

Evidence: `Documents/verification/wed-306-native-mobile-meal-family-boundaries-2026-10-31.md`.
WED-306 remains in progress: implement the remaining dependency-ordered
household/rule/grant/atomic-decision/reconciliation work in
`Documents/design/wedding planner/wedding planner/family-boundary-tasks.md`.

## 2026-10-31 - WED-303/WED-305 release and allowlisted pilot (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch
`agent/codex/WED-303`; exact deployed release
`77b4bb0868017e0e295811d2722257f276faea8b`. Clean release checkout:
`C:\Users\ozans\AppData\Local\Temp\omnyid-wed305-release-77b4bb0`.

- Account-scoped onboarding and intake prevent a recreated email from reading
  deleted-account browser state. Account deletion now purges external objects
  before tenant/profile/ledger/quota removal and returns an explicit receipt.
- Connected mobile decision, vendor lifecycle/favourite, automatic import and
  quote-acceptance projections are live.
- Compose now passes the RSVP public switch and account allowlist to every
  homeserver profile with false/empty defaults.
- Exact-SHA typecheck, 2,095 Wedding tests, line budgets, build, cargo check,
  Compose validation and Oracle preflight/backup/restore proof pass. Root and
  `/var` are 81% used.
- The controlled one-account RSVP pilot wrote one response and one impact
  receipt, suppressed an identical replay, revoked the link, and restored the
  byte-identical environment. Hosted status is false, there are no live grants
  and `/healthz` returns 200. Raw credentials and capability tokens were not
  retained.

Evidence: `Documents/verification/wed-305-account-isolation-mobile-projections-2026-10-31.md`.
General public RSVP remains deliberately disabled; no WED-303/WED-305 code
work remains.

## 2026-10-30 - WED-303 canonical RSVP response and capability boundary (Codex, in progress)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch
`agent/codex/WED-303`; exact clean code candidate
`fdc06a854c4331a6051aee3f5727356c30408ba0` before this coordination commit.

Changed:

- Extracted the authenticated RSVP command behind a directly testable tenant
  service and corrected its latest-response scope placeholders. Response plus
  impact receipt remain one AFP transaction with revision and idempotency
  guards.
- Added migration 0127 and a separate household/invitation capability service:
  256-bit token, digest-only storage, exact account/wedding/workspace/household
  scope, expiry, rotation, revocation, constant unavailable responses and
  bounded open/create rates.
- Capability opening reprojects only invitation-safe fields from the owner's
  tenant AFP ledger. Grant/open/rotate/revoke/expiry lifecycle events are AFP
  records without the raw token or digest. The public RSVP flag remains false.

Evidence:

- Ten combined RSVP Rust tests pass against local disposable Postgres,
  including cross-account/wedding/household refusal, forged references,
  collision, replay, concurrent response revision, expiry, rotation,
  revocation, atomic response receipts and AFP secret scanning.
- The migration catalog test, TypeScript, both line budgets, Wedding site
  smoke, all 2,070 Wedding tests and production UI build pass.
- Failed-test fixtures were removed from `omnyid_test`; the final inspection
  found zero matching RSVP users or schemas. No production database, flag or
  deployment changed.

Remaining:

- Finish WED-303B controlled-question/required-field entitlement checks as part
  of WED-303D setup rather than accepting arbitrary fields.
- Build WED-303D controlled RSVP setup/preview in the existing Guests surface,
  then WED-303E's public mobile page against this capability boundary. Keep
  `OMNYID_WEDDING_RSVP_PUBLIC_ENABLED` false until those slices and hosted
  accessibility/privacy evidence pass.

## 2026-10-29 - WED-293 saved views and safe print preview (Codex, in progress)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch `agent/codex/WED-293`; exact clean code candidate `65eeda8573de6c8686512259dab1f2397d409c41`.

Changed:

- Extended V1 saved views with bounded profile revision and field policy in Rust/TypeScript, retaining compatibility defaults.
- Seeded Master, Vendor, Photo/video, VIP, Guest and Print projections over the same source run-sheet record IDs. Non-master views exclude private/contact/internal fields and do not resolve contact refs.
- Added responsive exact-content preview, page-one owner labels and colour-independent browser print styling. Print records only the view, visible columns and source record IDs in private AFP before opening the print dialog.
- Preview/save has no recipient side effect. Hosted links remain unavailable and no sharing flag or route changed.

Evidence:

- Exact candidate passed six Rust contract tests, TypeScript, 17 focused tests, both line budgets, all 2,036 Wedding tests and production build.
- Playwright/Axe passed at 320px, 375px and 1280px with no serious/critical findings; vendor preview retained two explicitly visible source IDs and excluded the private fixture note.
- Evidence: `Documents/verification/WED-293-SAVED-VIEW-PREVIEW-2026-10-29.md`.

Remaining:

- WED-293 stays in progress. Add the false-default expiring/revocable hosted grant boundary and its AFP lifecycle events, the 7–10 day vendor sign-off acknowledgement projection, and visual PDF pagination proof. Do not treat local preview/print as hosted-sharing approval.

## 2026-10-29 - WED-292 run-sheet profile editing (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch `agent/codex/WED-292`; exact clean code candidate `8c9923361eac1cca0396c68803b2e2a5e601fe3f`.

Changed:

- Added a generic Database profile plug-in and Wedding run-sheet day/status/attention controls, chronological time rail, desktop grid integration, and mobile cards.
- Added DST-aware time parsing, relative-anchor recomputation, confirmed-drift conflicts, explicit connected-time confirmation, labelled run-sheet overrides, and safe canonical linked-task date updates.
- Added detached manual items with place, owner, participants and visibility. Owners, participants, dependencies, buffers and source/override state remain visible.
- Made desktop cells keyboard-editable with focus restoration; dialogs restore their trigger; the horizontal rail is keyboard-scrollable; earlier/later actions avoid drag-only operation.

Evidence:

- Exact candidate passed TypeScript, 29 focused database/run-sheet tests, both line budgets, all 2,033 Wedding tests and the production UI build.
- Three Playwright/Axe checks passed at 320px, 375px and 1280px with no serious/critical violations. The 320px case covers 400% equivalent reflow from 1280 CSS pixels.
- Evidence: `Documents/verification/WED-292-RUNSHEET-PROFILE-EDITING-2026-10-29.md`.
- No deployment, provider action, hosted share or rollout flag change occurred.

Next:

- Begin WED-293 saved role views, exact-content preview and accessible print. Keep hosted grants false-default and do not send anything merely by creating or previewing a view.

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

## 2026-11-02 - WED-317 disposable full-account Wedding harness (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-317`, branch `agent/codex/WED-317`, based on
`726bc483c51f417d1e45a00d7871c288a8320204`; full clean-stack evidence was produced at
`c58d8637860a6bcbb8347bfc4138e65d18605d21`.

- Added a guarded PowerShell harness that launches tmpfs pgvector on a random loopback port, the real
  production homeserver and a production-built Solid UI. It creates Mia, Jordan, Priya, Sam and Alex
  through `/auth/register`, seeds deterministic two-couple AFP fixtures, and tears down all services.
- Added five isolated Playwright contexts covering draft submit/withdraw, catering-only helper and
  delegated grants, delegated proposal and owner approval, cross-couple grant-ID substitution,
  revocation and denial after revocation. Synthetic `@omnyid.test` identities and external-send-off
  guards prevent production effects.
- Fixed a privacy issue discovered by the journey: the service worker cached unclassified Wedding GET
  responses and could replay a private pre-revocation or previous-account view. Account-scoped routes
  are now network-only, the former API cache is deleted, and delegated views are `private, no-store`.
- The harness has bounded Docker readiness, isolated low-footprint Cargo output, process-tree teardown,
  and deletes large build artifacts on failure. A diagnostic `cargo clean` removed 12.1 GiB of generated
  WED-317 target files after the local drive filled; no source, Docker volume or user data was removed.
- Live DNS inspection explains the Gmail rejection: Cloudflare Email Routing is inbound-only, SPF does
  not authorise Google, no Google DKIM selector exists, and DMARC correctly rejects the unaligned From.
  Do not weaken DMARC or add a second SPF record; use Cloudflare application sending, Google Workspace
  DKIM/SPF, or a verified SMTP provider and verify received headers.
- Checks: full clean browser stack passed at the SHA above; production UI build passed; TypeScript,
  line-budget and seven focused service-worker/harness tests passed. Clean npm install reports 38
  moderate and one high audit finding, retained for explicit dependency review.
- No production deployment, DNS mutation, email send or Oracle write occurred. Recommended next action:
  review the branch/PR, then separately authenticate the desired manual Gmail send-as provider before
  changing DNS.
## 2026-10-29 - WED-296 owner-authorized Wedding release (Codex, complete)

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

Release outcome:

- The exact clean candidate `518a106fdf2c8253144175d7ab591e51e47db1a7` passed the full readiness verifier with digest `656705c72756eadbe221d624c0726fb513f391c978a562cc8607b8a7a950d5d8` and was deployed to Oracle.
- Policy V2 and the quotation extraction, recommendation, clarification, closure and approved vendor-response capabilities are enabled. Vendor mail, sender-mask and ingress remain false; a provider-observed live bounce/complaint remains an independent WED-286 prerequisite.
- Synchronous post-deploy machine proof passed homeserver/backup service checks, backup verification and a restore drill at 78% disk use. `https://omnyid.com/workspace/` returned HTTP 200. Anonymous `/healthz` requires a session token and was not misreported as a public 200.
- Evidence and rollback boundaries are recorded in `Documents/verification/wed-296-oracle-release-2026-10-29.md`; its post-release commit is not the deployed application SHA.

Next: begin WED-290 generic database definitions, switching and creation from the post-release audit commit. Preserve the existing Database compatibility contract and do not introduce a parallel run-sheet store.
## 2026-10-29 - WED-290 generic database registry and lifecycle (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch `agent/codex/WED-290`, based on post-release audit commit `9ca731d3755437d077e98f58b96298536f75735e`.

- Added account-scoped deterministic projection for canonical database definitions and archive/restore events, plus AFP writers and contract builders for create, rename and lifecycle changes.
- Database now has a mobile-friendly switcher and New database flow. Blank creation works without a wedding plan; `wedding_runsheet.v1` appears only with an accessible plan reference and creates only a profile definition at this stage.
- Every row, revision, schema update, import and first-row write uses the selected stable `database_id`. Legacy records remain available under a visible Legacy database and are not rewritten.
- Archive and restore use large explicit confirmation actions. Archived databases remain selectable, read-only and restorable. Rename is durable through a new definition revision.
- Extracted header, creation/lifecycle dialogs and record/import editors; `DatabaseView.tsx` is under 800 lines and every new file is under 999 lines.
- Verification passed: TypeScript, 18 focused database tests, source/Wedding line budgets, all 2,014 Wedding tests and the production UI build. The build emitted only the existing large-chunk warning.
- No production deployment, data migration, wedding row projection or email-relay change occurred. Oracle still runs the WED-296 source candidate; this WED-290 slice is local and committed only.

Next: begin WED-291 incremental Wedding run-sheet projection from this contract, keeping generic databases unchanged and projecting from the existing wedding ledger rather than copying it.
## 2026-10-29 - WED-291 deterministic run-sheet projector core (Codex, in progress)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch `agent/codex/WED-291`, based on WED-290 commit `7746d988ba9b44f1908331aa77c66130ca8bf2c3`.

- Added a pure, zero-model-call Wedding run-sheet projection planner. It selects only sources for the requested wedding plan, maps changed AFP message IDs to stable logical items, builds bounded source-linked rows, fingerprints fact packets, skips identical replays and proposes a versioned checkpoint receipt.
- Changed structured sources append a canonical create or revision; an explicitly detached user row is never overwritten. When a changed source disappears, its projected row becomes stale and needs confirmation rather than being deleted.
- Added a canonical projection-receipt builder and focused coverage for source scope, replay idempotency, one-source isolation, detached rows, stale handling and zero model calls.
- WED-291 intentionally remains open. The next slice must add one authenticated server command that locks the definition/checkpoint, validates account and plan scope, writes the record batch plus receipt in one Postgres transaction, and returns the saved explanation. Only that command may advance the durable cursor.
- Focused verification passed: TypeScript, 11 projector/contract tests and both line budgets. No server, schema, UI invocation, production deployment or model call changed in this first slice.

## 2026-10-29 - WED-297 Wedding Animal Quiz AFP handoff and run-sheet promotion (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch `agent/codex/WED-297`, released source SHA `e668e4b92ede40d68d2141696001e16405303e87` from detached checkout `C:\Users\ozans\AppData\Local\Temp\omnyid-wed297-release-e668e4b`.

- Extended the existing explicit quiz handoff instead of creating a parallel backend. The authenticated Wedding planner now persists validated quiz facts through its canonical `/send` AFP path as private preference, intake and deal-breaker events. Budget comfort/stretch, guests, location/timeframe, venue/style, priorities, values, family context and deal-breakers are bounded; names and raw answers never leave the browser through this path.
- Added compatibility for the stated `omnyid.wedding.coupleBrief.v1` payload, reducing the full object to the same minimal schema. Existing planner facts are not overwritten. All emitted messages have deterministic logical IDs, partial failures retain the source payload, and replay is safe because message insertion is ID-idempotent.
- Made the mounted Wedding profile owner react to an import request fired after it mounted, closing the signed-in deep-link race.
- Added a responsive, approval-first run-sheet preview to the Wedding marketing home. WED-291 remains in progress for the atomic server batch/checkpoint command and UI invocation; the public copy is deliberately labelled preview.
- Verification passed on candidate `e668e4b`: TypeScript; 10 focused import/static tests; Wedding site, CSP and quiz-engine smoke; both line budgets; all 2,023 Wedding tests; and the production UI build. The build emitted only the existing large-chunk warning.
- Deployed the exact clean candidate with simulated data excluded and the existing Oracle environment preserved. Five changed source/static files match Oracle byte-for-byte. Public Wedding home, quiz and versioned quiz asset return HTTP 200 and expose the new run-sheet/handoff markers.
- The guarded deployment's full detached audit completed remotely with exit 0, backup verification pass, restore drill pass, runtime-script integrity pass and no failure step. Its local polling wrapper stalled after completion and was stopped; a fresh read-only collector produced the committed `status=pass` proof with restore deliberately skipped rather than repeated.
- The designated `casper.wu01@gmail.com` test-account password file now receives HTTP 401 `credentials`; no secret was printed and no password/account mutation was attempted. Authenticated browser acceptance is therefore not claimed, while unit, integration-contract, production build, source hash and live route evidence pass.

Next: resume WED-291 with the authenticated transactional run-sheet projection endpoint. Do not treat the marketing preview or the pure projector as proof that automatic row population is complete.
## 2026-10-29 - WED-291 atomic wedding run-sheet projector (Codex, complete)

Changed:

- Added the authenticated, account/plan-scoped run-sheet projection load and commit API plus content-light checkpoint/idempotency tables.
- Mounted automatic zero-model structured projection in the existing Database view, expanded milestone/supplier/logistics/circulation selectors, preserved detached rows, marked unresolved sources stale, and made profile creation idempotent per wedding plan.
- Kept implementation bodies in focused files under the line budget; `DatabaseView.tsx`, `src/db.rs` and `src/server/mod.rs` received thin integration only.

Evidence:

- Exact clean code candidate `c1ee49a03a50507080f2172f431b49847169ed58` passed six focused Rust tests, a live disposable pgvector/Postgres rollback/concurrency/retry test, 19 focused frontend tests, typecheck, both line budgets, all 2,027 Wedding tests and the production UI build.
- Detailed evidence: `Documents/verification/WED-291-ATOMIC-RUNSHEET-PROJECTION-2026-10-29.md`.
- No deployment or hosted sharing/transport flag change occurred.

Next:

- Continue WED-292 from this completed dependency: define a generic Database profile toolbar plug-in and pure time/override rules, then mount day/status/conflict controls and safe mobile editing without special-casing ordinary databases.

## 2026-10-29 - WED-298 public home and Wedding production regression repair (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch `agent/codex/WED-298`, based on `f078dc99cef0b920d4982e75cf5458cd093341d7`.

- The public-root HTML on Oracle matched the repository. The apparent homepage replacement was a reset-only `docs/tailwind.css`: Tailwind was invoked from `solid-ui` while the config scanned `./*.html`. The config now resolves from its own directory, the complete static stylesheet is rebuilt and cache-versioned, and CSP smoke asserts representative responsive utilities and a non-trivial build size.
- Add-task and task-row ownership now share one contact-backed picker. `+ Add contact` reveals a compact wedding-role/contact form, updates the same local contact/helper projections, and writes the canonical private AFP contact event when account persistence is available.
- Vendor reminders reject and grey past dates, persist today/future dates to AFP even for legacy cards without relational IDs, and treat the relational PATCH as compatibility-only. `Close follow-up` has an explicit permanent-removal warning, writes an AFP dismissal lifecycle event and removes the card from Today and Response Queue. Review alternatives opens Vendors in place.
- Wedding import feedback explains review/parser status, links to Documents, can be dismissed and expires after ten seconds. Documents use vendor-specific comparison/search titles, selection scrolls and focuses the detail, and full Markdown is rendered through the existing sanitizer with table styling.
- The existing sprout persona and view customizer are visible in Wedding again. Wedding Home labels are Today, navigation-card hover no longer moves or scales at boundaries, and the upload tooltip has an unclipped high stacking context.
- Production signup diagnosis found legacy Gmail OAuth returning HTTP 400 and SMTP auth failing. The existing protected Oracle Cloudflare token returned HTTP 200 from the Email Sending suppressions API. Transactional delivery now prefers the platform provider, can use independently configured SMTP before Resend, and never reports success without provider acceptance. The minimal Oracle compose profile now passes the missing vendor-mail Cloudflare account ID.
- Pre-freeze checks passed: TypeScript, source/Wedding line budgets, focused lifecycle/action/release tests, seven SMTP-out Rust tests, CSP/home static smoke and the production UI build. One full Wedding run had 2,039/2,040 pass; the sole failure was the newly added test expecting `_reminder_set` instead of the established `_reminder` event, and the corrected focused test passes. The exact clean candidate must rerun the complete suite before deployment.
- Generated local screenshots remain untracked under `solid-ui/artifacts/` and must not be staged. No secret value was printed or committed. Policy V2 remains at its existing production setting; this task does not alter rollout criteria.

Release outcome:

- Exact clean application SHA `fb1eb49d3e06ccc77ac7d499cf76c591f6538740` passed TypeScript, 2,041 Wedding tests, source/Wedding line budgets, CSP/static-home smoke, Compose parse, the production UI build and seven SMTP-out Rust tests.
- Oracle preflight and post-deploy machine proof passed, including the isolated restore drill. Root disk returned from the drill's temporary high-water mark to 81%. Eight representative source hashes match the release checkout.
- `https://omnyid.com/`, the versioned 26,730-byte Tailwind stylesheet and `/workspace/` return HTTP 200. Headless Chromium rendered the restored desktop homepage at exactly viewport width with the intended typography, navigation and briefing card.
- The protected Cloudflare credential/account/from address is now mapped to transactional mail in `.env.oracle`; a timestamped server-side environment backup was made first. The existing unverified controlled account returned the successful check-inbox registration response rather than delivery-unavailable. That proves provider acceptance; independent Gmail receipt was not inspected. Vendor mail, ingress and sender-mask flags remain `false`.
- Detailed release evidence is in `Documents/verification/wed-298-oracle-release-2026-10-29.md`. The following coordination/evidence commit is documentation-only; Oracle runs the application SHA above.

Next: have the user confirm the message arrived in `concensure+testing@gmail.com`, then continue the next dependency-ready wedding/run-sheet task from the post-release audit commit rather than from a stale worktree.

## 2026-10-29 - WED-299 account confirmation and Wedding blog catalogue (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch `agent/codex/WED-299`, based on post-WED-298 audit commit `06c57fe7e086bd72dd84a788592744a8ce77316d`.

- Replaced the generic verification tick with source-aware Wedding and OmnyID welcome experiences. Wedding signups get the community/planning promise and Wedding destination; generic signups get the broader product promise and workspace destination. Both are responsive, keyboard-safe, use optimized local attributed WebP images and expose a pausable eight-second transition. Missing/unknown sources fail closed to generic and invalid tokens do not redirect.
- Registration and resend carry only the bounded source classification. The existing protected transactional provider configuration was not changed because the user confirmed receipt; vendor mail, ingress and sender-mask settings were not enabled.
- Reconciled the live/static and editorial Wedding blog inventories into 40 tracked articles. Every article is mirrored under `Documents/marketing/wedding planning/posts/blog/`, represented in `blog-publication-catalogue.csv`, and has searchable stakeholder, exact six-stage, location-when-relevant and emotion taxonomy. Existing catalogue chips remain the only featured card tags; rich tags appear inside articles and participate in search.
- Exact clean application SHA `1176aa171909ebdadac100bd5d689522479b9c60` passed TypeScript, 2,042 Wedding tests, all Wedding-site smoke suites, both line budgets, the production build, 2 verification-source Rust tests and 7 SMTP-out Rust tests. Initial clean typecheck required the repository's TypeScript SDK dependencies to be installed as well as `solid-ui`; after that it passed.
- Deployed from detached checkout `C:\Users\ozans\AppData\Local\Temp\omnyid-wed299-release-1176aa1` using the existing Oracle environment with simulated data excluded. The deploy's isolated restore drill completed and cleaned its temporary copy; the polling wrapper was stopped after the remote audit process exited, then a fresh read-only proof passed backup/runtime checks with restore deliberately not repeated. Six representative hashes match the candidate.
- Hosted confirmation assets, both images, blog index, new celebrant pages and workspace return HTTP 200. Mobile Chromium found no overflow or console errors and `celebrants` search returned seven cards. Oracle settled at 82% used with 8.2 GB free; 11.47 GB of image data and 6.681 GB of build cache are reclaimable, while `/var/backups/omnyid` is 6.4 GB.

Next: finish WED-293's false-default hosted run-sheet grant lifecycle, expiry/revocation and sign-off acknowledgement boundary. Operationally, schedule reviewed Docker/cache and backup retention because Oracle has adequate headroom now but still carries substantial reclaimable data. WED-286's provider-observed live bounce/complaint evidence remains open and independent of this release.
## 2026-10-29 - WED-300 Wedding interaction stability (Codex, complete and live)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch `agent/codex/WED-300`; exact deployed application commit `9d7543cce53808d4a9cedcd2ae2707bfba19e03c`.

Changed:

- Added the blog catalogue/tagging rule, responsive public Wedding vertical stepper, and task-versus-focus FAQ.
- Repaired custom-task supertags/refresh, contact-backed owner selection, task cost help and user-facing completion copy; removed the redundant Vendors tile.
- Made reminder saving explicit and removed only two exact receipt-bound operator-test follow-ups.
- Replaced zero-fact comparison badges with matched-preference language and removed internal Today queue copy.
- Stopped editor remounts, made the rich-text toolbar react to editor readiness, and added stable attachment capture and confirmation.

Evidence:

- Exact candidate passed typecheck, 2,044 Wedding tests, site smoke, line budget, production build, and 63 Rust database/migration tests.
- Oracle preflight, image build/restart, Caddy smoke, backup verification and post-deploy proof passed. Hosted assets carry the new strings and omit the old internal strings; the exact fixture count is zero.
- Root disk settled at 83% used with 7.8 GB free. External health URLs are authentication-protected; runtime status came from production proof/container evidence.
- Full record: `Documents/verification/wed-300-wedding-interaction-release-2026-10-29.md`.

Remaining:

- Authenticated reminder/task/editor/attachment mutations were not replayed against a real couple merely for release evidence; use ordinary user acceptance if desired.
- The initial isolated restore process exited and removed its temporary containers, but its local proof wrapper stalled afterward. Do not treat that stalled wrapper as a recorded restore pass; the read-only proof rerun passed with the duplicate restore step skipped.

## 2026-10-29 - WED-293 hosted run-sheet grant lifecycle (Codex, implementation complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch `agent/codex/WED-293-hosted`, exact application commit `bc28f8657b229ab52a15f0e728bcb65297260924`.

- Added a false-default hosted-sharing capability over the existing saved-view and AFP record authority. Grants store only a token digest plus bounded owner/view/role/record metadata; the 256-bit token remains in the browser fragment until exchanged in a no-credentials request body.
- Added authenticated create/list/revoke controls, indistinguishable unavailable responses for invalid/expired/revoked links, owner revocation while creation is disabled, read-time deny-by-default projection, and tenant-private AFP grant/view/expiry/revocation audit events.
- Added vendor final-run-sheet acknowledgement and change-request responses with expiry bounds and idempotency, plus an accessible public mobile surface and owner-side state projection.
- Fixed print clipping by moving the preview into normal print flow. A generated multi-page PDF assertion verifies page-one key contacts, repeating headers and unsplit time/title rows.
- The Oracle runtime was not deployed or reconfigured. `OMNYID_WEDDING_RUNSHEET_SHARING_ENABLED` remains false in every checked Compose/environment default.
- Verification passed: disposable-Postgres lifecycle proof; two route-policy and one migration-catalog Rust tests; TypeScript; both line budgets; all 2,047 Wedding tests; production build; four Playwright/Axe/PDF cases at 320px, 375px and 1280px; and all four Compose parses with local placeholder values supplied only for staging's required secrets. The build retains the existing `ResponseQueueView` large-chunk warning.
- WED-286 remains independently open where provider-observed bounce/complaint evidence and the remaining attachment/thread/response-queue work require a dedicated candidate; no mail flag was enabled here.
- Completed a reviewed Oracle cleanup after a fresh inventory. Removed 9.409 GB of build cache, four exact unused homeserver image tags, six explicitly named older backup generations and journal history above 100 MB. Retained all running images, both rollback generations, all named/attached volumes and the newest three backups (`20261029T001242Z`, `20261029T015204Z`, `20261029T030536Z`). Root use fell from 83% (7.8 GB free) to 52% (22 GB free); all nine application containers remained up and `/workspace/` returned HTTP 200. Deleted cache/images can be rebuilt or pulled; deleted old backup generations are not recoverable, with three newer generations retained.
## 2026-10-30 - WED-301 Wedding comparison/search/task-row regression repair (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch `agent/codex/WED-301`, based on post-WED-293 coordination commit `c74db8a12145e119c260cf719504353ed36f97f4`.

- Restored verified vendor-upload photos to comparison cards by recognizing only the bounded public owner-photo route at server directory, search-artifact and saved-card media boundaries. Arbitrary third-party and malformed paths remain rejected.
- Bound master-search suggestion dismissal to the exact submitted query. Results no longer remain covered after submission, while editing the query deliberately reopens relevant suggestions.
- Standardized Wedding Overview task rows with a fixed action column, right-aligned completion action and bottom-aligned shared owner control; the small-screen stack is unchanged.
- Focused verification passed: seven frontend state/static checks, TypeScript and the Rust couple-facing vendor-photo route test. The final WED-294 candidate must still run the complete Wedding/build/line-budget matrix before production deployment.

Next: commit WED-301, branch WED-294 from it and implement deterministic run-sheet conflict/buffer/A2UI help without enabling hosted sharing or adding a model dependency.
## 2026-10-30 - WED-294 deterministic run-sheet intelligence (Codex, implementation complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch `agent/codex/WED-294`, based on WED-301 commit `2ca727b`.

- Added deterministic, evidence-labelled conflicts for owner/vendor overlap, travel, access, curfew, meals, speeches, photos and transport. Missing facts stay explicit unknowns; a false-positive fixture proves unrelated overlapping work is not treated as a conflict.
- Added 15/20-minute transition buffers with affected-row review, source/fingerprint/version/zero-token-cost provenance, explicit suggested-to-approved history and no path to confirmed state.
- Mounted six A2UI-compatible contextual cards in the existing Database run-sheet profile. Their bounded intents are resolved through existing Database revision commands; no parallel schedule or model dependency was introduced.
- Pre-freeze verification passed: TypeScript; 2,056 Wedding tests; focused run-sheet rule, editing, saved-view, readiness and static tests; both line budgets; production build; three responsive Playwright/Axe cases; and multi-page PDF pagination. The print selector was hardened so hidden application content cannot reserve blank pages.
- Every Compose/environment default checked keeps `OMNYID_WEDDING_RUNSHEET_SHARING_ENABLED=false`. WED-293 code is present but remains disabled.

Next: commit the candidate, rerun the release matrix from an exact clean detached checkout, deploy that SHA to Oracle without changing flags, collect hosted hashes/runtime/disk evidence, then add the exact-SHA release record.

## 2026-10-30 - WED-301 and WED-294 Oracle release (Codex, complete and live)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch `agent/codex/WED-294`; exact deployed application commit `b5f493d8d092b16609f6a0cb81ad704b4fafc43a`.

- Vendor comparison media, submitted master-search dismissal and Wedding Overview owner/action alignment are live. Production diagnosis found that most catalogue-backed Google media names had expired. The final endpoint refreshes only an already-catalogued place, validates current media before replacing the stale URL and leaves arbitrary references inaccessible.
- Production proof for an expired row returned HTTP 200, `image/jpeg`, 136094 bytes, replaced the stale reference and left zero copies of that old URL. A syntactically valid uncatalogued reference returned HTTP 404.
- WED-294's deterministic conflict/buffer projector and six A2UI context cards are live in the existing Database run-sheet profile. No model call or parallel schedule store was added.
- Exact-candidate checks passed: TypeScript, both line budgets, Wedding-site smoke, 2,056 Wedding tests, production build, Oracle staging self-test and eight focused Google Places/photo Rust tests. Post-deploy Oracle production proof passed, ten representative deployed source hashes match and both hosted run-sheet bundle markers are present.
- The first final upload lost its SSH connection before extraction and changed no container. The idempotent retry uploaded successfully. Its preflight backup check was transiently unhealthy, but the mandatory post-deploy backup/runtime proof passed.
- `OMNYID_WEDDING_RUNSHEET_SHARING_ENABLED`, `OMNYID_VENDOR_MAIL_ENABLED`, `OMNYID_VENDOR_SENDER_MASK_ENABLED` and `OMNYID_VENDOR_MAIL_INGRESS_ENABLED` remain `false`. Oracle root disk is 69% used with 14 GB free.
- Detailed evidence: `Documents/verification/wed-301-wed-294-oracle-release-2026-10-30.md`. The coordination commit after the application SHA is documentation-only and is not a new deployed candidate.

Next: WED-295 should harden run-sheet distribution readiness and operational review without weakening WED-293's false-default grant boundary. Independently, WED-286 still needs provider-observed bounce/complaint evidence before any vendor-mail transport flag can be enabled. Splitting the inherited 1.66 MB `ResponseQueueView` bundle is the highest-value frontend performance follow-up.

## 2026-10-30 - WED-295 run-sheet recovery and rollout hardening (Codex, complete and live)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch `agent/codex/WED-295`; exact deployed application commit `27bb198aece93a71999bbe4f386fd5ae2f71030c`. Clean release checkout: `C:\Users\ozans\AppData\Local\Temp\omnyid-wed295-release-27bb198`.

- Deterministically collapses legacy, replayed and duplicate projected rows while preserving detached/manual rows and all generic-database behavior.
- Adds bounded 80-write checkpoint-chained rebuilds, one fresh conflict retry and a no-write `Review rebuild` command.
- Adds a sanitized 72-hour account/database/plan-scoped offline snapshot. It is visibly read-only, carries its last-sync time and excludes private notes, contacts and source provenance.
- Adds content-free, zero-model/token/cost telemetry plus 205-source and 500-generic-row performance/regression fixtures.
- Adds outsider, wrong-plan and cross-tenant refusal evidence, 200% text-zoom/focus/forced-colour coverage, and a false-default hosted-shadow verifier.
- Exact candidate passed TypeScript, 27 generic Database tests, 2,063 Wedding tests, line budgets, production build, five Playwright/Axe/PDF checks, five Rust route tests and two real disposable-Postgres scenarios.
- Oracle preflight, image build/replacement, Caddy smoke, backup verification and the isolated restore drill passed. Eight deployed source hashes match and the hosted Database bundle includes the recovery controls. A stalled local audit poller was stopped only after the remote audit exited 0; a fresh read-only proof also passed.
- Hosted shadow: the correct API-origin open and acknowledge requests returned 404; grants and acknowledgements remained 0; no external delivery occurred. Run-sheet sharing and all three vendor-mail flags remain explicitly false.
- Oracle root storage settled at 73% used with about 13 GB free. Full evidence: `Documents/verification/wed-295-runsheet-hardening-release-2026-10-30.md`.

The application SHA above is the production candidate. The following coordination/evidence commit is documentation-only. Do not enable hosted sharing or vendor-mail flags as part of a routine deployment.

Next: split the inherited approximately 1.66 MB `ResponseQueueView` bundle to improve Wedding Today/response first-load performance. WED-286's provider-observed bounce/complaint evidence remains an independent activation prerequisite for vendor mail.

## 2026-10-30 - WED-302 Wedding response payload split (Codex, complete and live)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch `agent/codex/WED-302`; exact deployed UI application commit `823bf7a0aa85301bf039bc7feac203ef94d5ed20`.

- Kept `ResponseQueueView` route-lazy and moved the Wedding workspace, intake wizard and rich-response renderer behind explicit feature boundaries. No AFP state, action handler or backend contract moved.
- Added accessible loading announcements and a local error boundary so a deferred module failure does not collapse the entire planner.
- Core response feature output fell from 1,660,630 bytes / about 452 KB gzip to 876,101 bytes / about 249 KB gzip. Workspace, intake and rich-response code now build separately.
- Exact clean candidate passed typecheck, 2,065 Wedding tests, both line budgets and the production build.
- Deployed only the UI service from the clean checkout; Oracle preflight, Caddy/workspace smoke and post-deploy backup/restore proof passed. All four hosted feature chunks returned HTTP 200 at expected sizes.
- Run-sheet sharing and all three vendor-mail flags remain false. Oracle root storage is 73% used with about 13 GB free.
- Full evidence: `Documents/verification/wed-302-response-payload-release-2026-10-30.md`.

Next: measure and split the remaining approximately 750 KB Wedding workspace by menu-owned secondary surfaces, or return to WED-286 for provider-observed bounce/complaint evidence. Do not enable vendor mail until that evidence is complete.

## 2026-10-30 - WED-303 Wedding RSVP specification and shared projection slice (Codex, in progress)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch `agent/codex/WED-303`, based on `f119f48ee96a44117b52eba3c60966af86cf794f`.

- Converted the user's RSVP feature direction into `Documents/design/wedding planner/RSVP/wedding-rsvp-spec.md` and a dependency-ordered `wedding-rsvp-tasks.md` covering canonical response events, secure capabilities, controlled setup, public mobile response, reconciliation, reminders, exports and rollout evidence.
- Implemented WED-303A on the current AFP guest graph. Event invitations now round-trip response source, viewed/responded/locked time, prior status and revision. Persisted guest profiles now rehydrate contact, meal, dietary and accessibility values that were previously dropped.
- Guest tracking preserves multiple event invitations per person and derives one deterministic lifecycle/provenance/privacy summary. The existing Guests card and Wedding Home guest tile consume that summary; manual changes remain on the existing AFP writer and are labelled couple-entered.
- New guest profiles containing private logistics default to couple-only. No public RSVP route, capability, provider send or production flag was added or enabled.
- Exact clean code commit `5f9a3409c03ec6bf1086f4ebd3412fe7c9f131ab` passed TypeScript, both line budgets, all 2,069 Wedding tests and the production build. The verification worktree is `C:\Users\ozans\AppData\Local\Temp\omnyid-wed303-verify-5f9a340`. The public guest flow and WED-303B onward remain open.

Next: continue WED-303B with a versioned canonical response event and server-side scope/idempotency validation. Do not build a second guest store, and do not enable a public RSVP capability until WED-303C security evidence exists.

## 2026-10-30 - WED-303B authoritative couple-response slice (Codex, implemented)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch `agent/codex/WED-303`; exact clean code commit `b110d7e7eed583c51b857139376de47cbc51a19e`.

- Added the authenticated `/wedding/rsvp/responses` command. It resolves the invitation only inside the signed-in account's tenant ledger and validates wedding/workspace, person, event, lock and expected revision before writing.
- The command serializes per-invitation changes, returns exact idempotent replays without another append, rejects changed-key replays and stale revisions, and atomically appends a versioned response plus a visible consequence receipt.
- Public attendance and private answers are separate. The server accepts no private plaintext; the optional field must be a bounded whitespace-free `encrypted:v1:` envelope. No public capability, invitation token, email send or rollout flag was added.
- Existing guest status changes now call the authoritative command. Responses project back into the existing invitation identity, so Guest View and the Wedding Home guest tile continue to consume one shared guest graph. New guests still use the existing household/profile/invitation writer.
- Exact candidate evidence: TypeScript passed; both line-budget tests passed; all 2,070 Wedding tests passed; six Rust adversarial route tests passed; production build passed. New files are 999 lines or fewer. No deployment was requested or performed.
- Preserved unrelated untracked evidence at `artifacts/oracle-production-proof-wed298-fb1eb49/` and `solid-ui/artifacts/`.

Next: finish WED-303B with disposable-Postgres cross-tenant, changed-replay and concurrent-stale-write evidence, then implement WED-303C digest-only public RSVP capabilities with random tokens, expiry, revocation, event/household scope and false-default availability. Do not expose a public response surface before that evidence exists.
## 2026-10-31 - WED-303E-H protected guest flow and RSVP operations (Codex, in progress)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch
`agent/codex/WED-303`; exact clean code candidate
`4f6fafc6c15d2ecf7605ead4de7acd91920ba1ae` before this coordination commit.

Changed:

- Added explicit confirmation-gated household link creation. Tokens are 256-bit,
  digest-only at rest and shown once; revoke and expiry remain server-authoritative.
- Added a browser-generated X25519 couple key. IndexedDB retains a non-extractable
  private key while only the public key and key ID enter the RSVP setup AFP object.
- Added `/workspace/rsvp.html`, which clears the fragment token immediately,
  renders only the named invitation scope, encrypts sensitive answers for the
  couple and submits per-person revisions through the canonical response command.
- Public submission rechecks capability scope inside the write transaction,
  validates controlled and required questions, rejects plaintext private fields,
  and prevents revoke/submit races, replay and stale writes.
- Added shared RSVP operations over the existing guest ledger: seating/catering
  reconciliation without mutating vendor commitments, late-lock exceptions,
  deterministic approval-required reminder drafts, couple CSV, and previewed
  caterer/venue CSV with an AFP approval receipt and minimum-necessary defaults.

Evidence:

- Exact candidate passed production build, TypeScript, both line budgets, all
  Wedding site/security smoke checks and all 2,081 Wedding tests.
- Six Playwright scenarios pass at 320, 375 and 1280 pixels, including 200%
  zoom, keyboard focus recovery, slow loading and Axe serious/critical checks.
- Thirteen focused Rust tests pass against local disposable PostgreSQL, including
  cross-tenant/forged references, exact replay, one-winner concurrency and
  capability revocation. The embedded migration-catalog test passes.
- Disposable RSVP test users and schemas returned to `0|0`. No production flag
  changed, nothing was deployed, and the pre-existing artifact directories were
  not committed.

Remaining:

- Extend canonical invitation entitlements for named/unnamed plus-ones and child
  age/seat/meal detail; do not bolt these onto a browser-only guest record.
- Connect reminder approval to the existing provider receipt lifecycle and add
  correction/revocation events for exported vendor briefs.
- Keep `OMNYID_WEDDING_RSVP_PUBLIC_ENABLED` false until hosted accessibility,
  couple/guest usability, flags-off shadow and allowlisted pilot evidence exist.
## 2026-10-31 - WED-303 RSVP entitlement, audit and reconciliation completion (Codex, in progress)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch
`agent/codex/WED-303`; current code candidate
`c8a6c1ea61c7b67af47b4756b51a2abe2b9417ee` before this coordination commit.

Changed:

- Modelled named and unnamed plus-ones and children as separate canonical AFP
  household guests and event invitations, including child age band, seat and meal
  requirements. Public capabilities and response events preserve only those
  bounded entitlement facts.
- Added false-default RSVP reminder contact permission. Only explicit, valid
  email contacts can produce candidates; declined/complete households, quiet
  hours and accepted/delivered receipts are respected. Exact recipient/content
  approval is durable but explicitly does not send or claim provider acceptance.
- Added export history with linked corrections and future-use revocations. The
  UI states that an already-downloaded file cannot be recalled.
- Made accessibility answers always optional, added deterministic follow-up
  candidates for configured missing details, bounded A2UI setup/reconciliation
  intents and one-source count agreement checks across Wedding surfaces.
- Added a 320-pixel Guest card fixture; its first run found four WCAG contrast
  failures, which were corrected before the final Axe pass.

Evidence:

- TypeScript, both line budgets, all 2,088 Wedding tests and production build
  pass.
- Focused Guest/People Playwright and Axe pass at 320 and 1280 pixels.
- Seventeen focused RSVP ledger/reminder tests pass. The previously run 13
  RSVP Rust tests pass against real local PostgreSQL after the entitlement
  backend changes.
- Unrelated untracked production-proof directories remain untouched. Nothing
  was deployed and `OMNYID_WEDDING_RSVP_PUBLIC_ENABLED` remains false.

Remaining:

- Do not expose a client-authored provider receipt. Add a server-authoritative
  send adapter only if it can reload the exact approved AFP event in the signed-
  in tenant, reserve one idempotency key, enforce the RSVP send flag and write
  provider accepted/delivered/failed/retry decisions separately.
- Then freeze a new full SHA and run hosted accessibility, couple/guest
  usability, flags-off shadow, allowlisted pilot and exact deployed-SHA/rollback
  evidence before enabling public collection.
## 2026-10-31 - WED-303 provider lifecycle and WED-304 mobile release (Codex)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch
`agent/codex/WED-303`. Application SHA
`eff62d1c44d3140d9fa2edae04cc4cbfcd65ba21` is live on Oracle.

Changed:

- Completed the false-default server-authoritative RSVP reminder provider
  lifecycle, including exact approval rehydration, idempotency reservation,
  accepted/delivered/failed/retry AFP events and protected Caddy routing.
- Replaced generic decision approval with `Open shortlist` / `Search vendors`
  and the existing in-place Vendor surface.
- Renamed mobile Timeline to Plan, made contributions reproject immediately,
  and repaired narrow Today, Overview and Vendor layouts/filter rails.
- Corrected the Oracle staging manifest to include `solid-ui/rsvp.html`; the
  earlier candidate failed before replacement, then the corrected candidate
  built and deployed cleanly.

Evidence:

- Exact-SHA typecheck, 2,089 Wedding tests, production build, both line
  budgets, staging self-test, 16 RSVP Rust tests and five Playwright/Axe cases
  passed.
- Hosted workspace and Wedding routes return 200; the unauthenticated RSVP
  reminder status route reaches the backend and returns 401. Backup/runtime
  proof passes. Disk is 74% with about 12 GB free.
- Public RSVP, RSVP reminder provider send and all vendor-mail flags remain
  false or unset with false defaults.
- Full record:
  `Documents/verification/wed-303-wed-304-rsvp-mobile-release-2026-10-31.md`.

Remaining:

- WED-303 public rollout still needs hosted couple/guest accessibility and
  usability, a new rollback drill and an allowlisted cohort. No code blocker
  remains for those controlled gates.
## 2026-10-31 - WED-303 hosted RSVP shadow and restore drill (Codex)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch
`agent/codex/WED-303`. Application SHA `eff62d1c44d3140d9fa2edae04cc4cbfcd65ba21`
remains live; Caddy/static release `65b12a3a3d764b560b9e95948df1e201c9eb7472`
is live.

Changed and verified:

- The hosted guest RSVP shadow passes six accepting, declining, validation,
  zoom, privacy and responsive scenarios with no serious/critical Axe finding.
- The first run exposed a Google Fonts CSP mismatch. `65b12a3` adds only the
  already-configured stylesheet host to workspace/reset `connect-src` and adds
  a security regression check. The live rerun has no CSP or page error.
- Exact-candidate typecheck, 2,089 Wedding tests, line budgets, Wedding-site
  security suite, production build and production Caddy validation pass.
- A fresh isolated Oracle restore drill passes. Disk returned to 74% with
  about 12 GB free. All RSVP/vendor delivery flags remain false or false by
  default; no message, capability or invitation was sent.

Remaining:

- The authenticated couple-side usability check and allowlisted pilot remain
  open. The authorized test account's saved credential returned HTTP 401, so
  no pass was claimed and no password reset/account mutation was attempted.
- Evidence: `Documents/verification/wed-303-rsvp-hosted-shadow-2026-10-31.md`.

## 2026-11-01 - WED-307 account isolation, Family households and Policy V2 release (Codex)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch
`agent/codex/WED-307`. Exact application SHA
`b353d47122fe8aa15885ae4fdc64a81aaec69b41` is live on Oracle.

Changed:

- Added a pre-hydration authenticated-account boundary and reload path so a
  second account on one browser cannot inherit ambiguous Wedding decisions,
  tasks, contacts, budget contributors or persona-adjacent state.
- Refused unowned legacy contact/profile adoption for authenticated accounts.
- Stacked Plan action content on mobile and gave the explanatory copy adequate
  width and height.
- Continued the canonical Family Boundaries projection with disclosure focus,
  household attention rows and AFP successor edits for family group, invitation
  allocation and request deadline.
- Kept ranking Policy V2 enabled and verified its versioned policy fingerprint
  in the hosted production bundle.

Evidence:

- Exact-SHA typecheck, both line budgets, focused isolation/family/policy tests,
  all 2,105 Wedding tests and production build pass.
- Hosted workspace and assets return 200 and contain the account boundary,
  Policy V2 true value, household editor and mobile spacing rule.
- Oracle inspection of the recreated Casper account found a fresh account ID,
  zero onboarding rows and zero persona rows; the prior carry-over was browser
  state, not retained server profile data.
- Production homeserver is running with zero restarts. Manifest and backup
  verification passed.
- Full evidence:
  `Documents/verification/wed-307-account-isolation-family-households-policy-v2-2026-11-01.md`.

Operational caveat:

- The post-deploy restore drill was stopped by its safety preflight because it
  needed about 0.34 GiB more free disk. Root is 84% used with 7.2 GiB free;
  Docker reports substantial reclaimable image/build cache. Do not claim a
  passing restore proof until a reviewed safe prune and rerun succeeds.

Remaining:

- Continue the broader WED-306 Family Boundaries roadmap with structured rule
  precedence, server-authoritative grants, atomic request decisions, connected
  reconciliation and restricted-helper rollout evidence. Do not introduce a
  parallel guest or household store.

## 2026-11-01 - WED-308 Family governance foundation and proactive Runbook design (Codex)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch
`agent/codex/WED-308`. Started from documentation SHA
`8bb33709a5b0d289baaae97f93f82f530dd8445f`; the live Oracle application remains
`b353d47122fe8aa15885ae4fdc64a81aaec69b41` because this slice was not requested
for deployment.

Changed:

- Extended the canonical Wedding boundary AFP contract with typed family groups,
  structured rule scope/effect/authority/version fields, complete request states,
  household/request revisions and policy-version references.
- Added deterministic household split/merge/archive previews, effective-rule
  precedence/conflict projection, request impact previews and minimum-necessary
  helper projections.
- Replaced browser-created request decisions with a server-authoritative route.
  Approved named add-guest requests recheck policy and household revisions,
  allocation and duplicates, then atomically write the household successor,
  guest, unsent invitation draft, request successor, decision and impact receipt.
- Added migration 0128 for digest-only expiring/revocable helper grants and
  idempotency receipts. Helper access is false by default via
  `OMNYID_WEDDING_BOUNDARY_HELPERS_ENABLED`; helpers can view scoped summaries
  and propose a named guest, never approve.
- Added `Documents/design/runbooks/per-user-proactive-runbooks-spec.md` and
  `per-user-proactive-runbooks-tasks.md`. They reuse current proactive ingress,
  Watcher, State Synthesizer, autonomy/policy, provenance, outcome memory,
  approvals and A2UI rather than creating parallel infrastructure.

Verification:

- `npm run typecheck`: passed.
- Focused Family Boundaries native tests: 27 passed.
- `cargo test --lib server::wedding_boundary_routes::tests -- --nocapture`: 3
  passed after the final helper-contract narrowing.
- `npm run test:wedding`: 2,112 passed.
- `npm run test:line-budget`: 2 passed.
- `npm run build`: passed.
- Planning readiness: evaluation, planning library, parser boundaries, migration
  catalog, SDK, typecheck/line budgets, Wedding tests, production build, focused
  browser accessibility and Oracle Compose structure passed. Overall remains
  blocked because disposable Postgres/ClamAV endpoints and the supplied human
  review directory were absent; no release pass is claimed.

Operational notes:

- `cargo clean -p omnyid-homeserver` removed 25.8 GiB of reproducible local Rust
  build output after C: reached 0.2 GiB free. C: had about 16.9 GiB free after
  verification.
- Docker Desktop reported that it could not start, so no disposable Postgres
  migration application was run. The embedded migration-catalog check passed.
- Preserve the pre-existing untracked Oracle proof and `solid-ui/artifacts`
  directories; they are not part of WED-308.

Remaining:

- Complete server split/merge/archive commands, non-add request mutations,
  delegated Planner/RSVP roles, two-partner partial approvals, per-projector
  reconciliation, bulk operations and the restricted hosted helper rollout.
- Implement WED-308 Runbooks from the dependency-ordered task document after
  freezing this documentation candidate; begin with contracts, per-user seeding,
  existing-event adapter and pure matcher.

## 2026-11-01 - WED-309 OAuth, Quiz v2 and Family Boundaries command slice (Codex)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch
`agent/codex/WED-308`, starting SHA
`dcbe97eff14f2b62a582fe76d340db3f831d9528`.

Changed:

- Fixed the Google first-login loop by adopting the first authenticated session
  in place. Only replacement of an already authenticated account now triggers
  the isolation reload.
- Rebuilt the Wedding Animal Quiz from the supplied DOCX as a deterministic
  six-dimension, eight-archetype v2 flow. It emits private bounded AFP answer,
  result and consent evidence and pre-fills reviewable qualitative Wedding
  onboarding suggestions without fabricating hard wedding facts.
- Added the Step 1 quiz prompt and linked editorial/live quiz surfaces; reconciled
  the mandatory blog publication catalogue.
- Added tenant-private, revision-checked and idempotent household split, merge,
  archive and bounded bulk commands; explicit remove/plus-one/invitation/contact
  request mutations; and configurable two-distinct-partner approval.
- Added minimum-necessary delegated Planner and RSVP-guest capability presets.
  Hosted delegated/helper routes remain disabled and are not claimed complete.

Verification on the working candidate:

- `npm run typecheck`: passed.
- `npm run test:wedding`: 2,116 passed.
- `npm run test:wedding-site`: website, CSP, quiz v2, account confirmation and
  blog catalogue smoke tests passed.
- `npm run test:line-budget`: 2 passed; all new files remain below 999 lines.
- `npm run build`: passed.
- `cargo test --lib server::wedding_boundary_routes -j1 -- --nocapture`: 4 passed.
- `cargo test --test wedding_boundary_postgres -j1 -- --test-threads=1
  --nocapture`: 2 passed against disposable local PostgreSQL.
- Disposable ClamAV live suite: clean file, harmless EICAR and unavailable
  fail-closed cases all passed; the temporary scanner was stopped and removed.

Not performed:

- No Oracle deployment or production flags were changed in this turn.
- Hosted Google completion still needs an authorised browser smoke on a deployed
  exact candidate.
- Still open: authenticated delegated Planner/RSVP routes, encrypted private-note
  mutation, simultaneous last-seat contention, representative grant revocation,
  group plus-one exceptions, per-projector receipts, helper UI and controlled
  hosted rollout evidence. Keep helper capabilities false-default.

## 2026-11-01 - WED-309B delegated Family Boundaries enforcement (Codex)

Continued in `C:\Users\ozans\Desktop\projects\OmnyID-WED-286` from
`ff2385d4a43bf34b7a4ee4ef4330d1555d24fbe8`.

Changed:

- Added migration 0129 for authenticated delegated grants and opaque mutable
  encrypted private notes. Both tables cascade with account deletion; AFP remains
  the domain history and carries redacted note references only.
- Added owner-created Planner and RSVP-guest grants. Opening and proposing require
  an authenticated exact delegate account, live expiry/revocation, the global
  false-default flag and an owner ID allowlist. Proposals are pending requests;
  delegates cannot approve them.
- Added minimum-necessary Planner household and RSVP self-invitation projections.
  Private notes and unrelated guest/contact data are not returned.
- Serialized household-capacity approvals, added group plus-one policy with named
  exceptions, and revoked household helper/former-representative grants when the
  representative changes.
- Added encrypted note save/read/remove API contracts with optimistic versions,
  idempotency and no ciphertext in AFP events.

Verification on the working candidate:

- Disposable PostgreSQL Family Boundary integration: 4 passed, covering tenant
  isolation, idempotency/stale revisions, two-partner approval, non-add mutation,
  delegate scope/outsider refusal/forged approval, revocation, expiry, deletion
  cascade, ciphertext isolation, group exceptions and simultaneous last-seat
  contention.
- Focused Rust boundary tests: 7 passed.
- Embedded migration catalogue: 1 passed.
- `npm run typecheck`: passed.
- `npm run test:wedding`: 2,116 passed.
- `npm run test:line-budget`: 2 passed; substantive files remain below 999 lines.
- `npm run build`: passed.

Still open:

- No deployment or rollout flag change was requested. Both helper and delegate
  capabilities remain false-default.
- Build delegate/helper management UI, projector acknowledgements, sent-invite
  policy previews and removal-after-RSVP handling; complete field-by-field privacy,
  accessibility/usability and exact-hosted flags-off evidence before any cohort.

## 2026-11-01 - WED-310 RSVP completion and Oracle release (Codex)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch
`agent/codex/WED-308`. Exact application candidate
`eb398ebfecaec6a0277d7fe634e6c97198b44afe` is live on Oracle.

Completed:

- Reconciled the two apparently open RSVP gates to retained evidence: WED-303
  contains the hosted guest accessibility/usability run, and WED-305 contains
  both the authenticated fresh-account check and controlled one-account RSVP
  pilot with replay, revocation and exact rollback. No duplicate production
  RSVP was created.
- Verified the clean exact candidate with typecheck, 2,116 Wedding tests, both
  line budgets, production build, migration catalogue, 13 real
  disposable-Postgres RSVP tests and four Family Boundary database scenarios.
- Deployed from
  `C:\Users\ozans\AppData\Local\Temp\omnyid-wed310-release-eb398eb` with
  simulated data excluded. Selected release-defining local and Oracle source
  hashes match, and migration 0129 is present.
- Hosted workspace, RSVP and Quiz routes return 200. Public RSVP and reminder
  provider sending are false, the RSVP pilot list is empty, and Family helper
  and delegate flags remain unset/false-default.
- Safely pruned unused Docker builder cache before and after build. The initial
  restore proof safety-blocked on capacity and was not claimed as passing; after
  reclaiming 4.87 GB, backup verification and the isolated restore drill both
  passed. Oracle root usage is 79% with about 9.4 GB free.

Evidence:

- `Documents/verification/wed-310-rsvp-release-2026-11-01.md`.
- Ignored machine artifact:
  `artifacts/oracle-production-proof-wed310-eb398eb/postdeploy/`.

Remaining:

- WED-309/WED-308 Family Boundaries work continues with delegate/helper
  management UI, per-projector acknowledgement, sent-invitation impact preview,
  restricted-field audit and a separately authorised rollout cohort. Keep both
  Family rollout flags false until those criteria pass.
- The historical Oracle `release-manifest.json` does not update with current
  source identity. Add a generated release version endpoint/manifest in a
  future operational slice; this release uses clean-checkout SHA plus matching
  deployed-source hashes instead.

## 2026-11-01 - WED-311 Family connected-impact reconciliation (Codex)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch
`agent/codex/WED-308`, implementation commit
`2941e25585649744537e0f8d5069ecb886c42252`.

Changed:

- Passed the current impact review confirmation into the server decision and
  idempotency fingerprint. A helper-authored request can no longer pre-authorise
  removal after a sent or accepted invitation.
- Removing an accepted guest writes archived guest/invitation successors while
  preserving the immutable RSVP response and stable invitation ID.
- Decision and household impact receipts now name connected updates and record
  actor, causation, expected versions, reconciliation reference and explicit
  no-send/no-attendance/no-spend guarantees without copying private content.
- Added deterministic versioned rule-change preview for sent invitations and
  explicit field allowlists for Planner, helper and RSVP-guest projections.
- Moved add-guest mutation code into the bounded mutation module, reducing the
  main route from 995 to 877 lines; every changed source remains below 999 lines.

Verification:

- `npm run typecheck`: passed.
- `npm run test:wedding`: 2,117 passed.
- `npm run test:line-budget`: 2 passed.
- `npm run build`: passed.
- `cargo test --lib server::wedding_boundary_routes -j1 -- --nocapture`: 8 passed.
- Final-candidate `cargo test --test wedding_boundary_postgres -j1 --
  --test-threads=1 --nocapture`: 5 passed against a disposable PostgreSQL 18
  tmpfs instance. It covered accepted-RSVP removal, household split after RSVP,
  exact replay, stable invitation/history retention, tenant scope and restricted
  projections. The disposable container and data were removed after the run.

Not performed:

- No Oracle deployment or production environment change. The live application
  remains `eb398ebfecaec6a0277d7fe634e6c97198b44afe` from WED-310.
- Family helper and authenticated delegate rollout flags remain false-default.

Remaining:

- WED-311 stays in progress: mount versioned rule supersede/archive commands in
  the Couple UI and connect household split/merge/archive/bulk management to the
  existing server command surface.
- Then build delegate/helper grant management UI, projector acknowledgements,
  restricted-data usability/accessibility evidence and a separately authorised
  allowlisted cohort before either Family rollout flag can be enabled.

## 2026-11-01 - WED-311 Family rule and household command completion (Codex)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch
`agent/codex/WED-308`, exact implementation commit
`9943b7657c682d285675afddcc10c771d082f6e2`.

Completed:

- Added the authenticated, tenant-scoped `/wedding/boundaries/rules/commands`
  route for versioned archive and replacement. It locks and revalidates the
  current rule, requires current confirmation for sent/accepted invitation
  effects, retains earlier versions and returns the original response on retry.
- Added privacy-safe aggregate rule impact receipts with actor, causation,
  expected version, affected stable references, connected projection updates
  and explicit no-send/no-attendance/no-spend/no-private-copy guarantees.
- Mounted Replace rule and Archive rule in the Couple Family Boundaries surface
  with plain-language deterministic impact review.
- Mounted household split, merge and empty archive over the existing
  server-authoritative household command route, including stable member
  selection, expected revisions and impact confirmation.
- Added focused mobile/source assertions and a real disposable-Postgres rule
  scenario covering elevated confirmation, exact retry, archive/replacement
  versions and private-field exclusion. No new file exceeds 999 lines.

Exact-candidate verification:

- `npm run typecheck`: passed.
- `npm run test:wedding`: 2,117 passed.
- `npm run test:line-budget`: 2 passed.
- `npm run build`: passed.
- `cargo test --lib server::wedding_boundary_routes -j1 -- --nocapture`: 10 passed.
- Disposable PostgreSQL 18 + pgvector rule command: 1 passed.
- Disposable PostgreSQL existing Family Boundary suite: 5 passed.
- The disposable container and its tmpfs data were removed.

Not performed:

- No Oracle deployment, hosted cohort or environment change. Production remains
  application SHA `eb398ebfecaec6a0277d7fe634e6c97198b44afe`.
- `OMNYID_WEDDING_BOUNDARY_HELPERS_ENABLED` and
  `OMNYID_WEDDING_BOUNDARY_DELEGATES_ENABLED` remain false-default.

Recommended next action:

- Continue the broader Family roadmap with owner-facing helper/delegate grant
  management, projector acknowledgement receipts and the accessibility/usability
  matrix. Authorise a narrow allowlisted cohort only after those checks pass.

## 2026-11-01 - WED-315 connected Wedding projection repairs (Codex)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`, branch
`agent/codex/WED-315`, implementation commit
`585979fa793470b461c97047c66beacd03590b8a`.

Completed:

- Unified task-row action labels with the same canonical completion projection
  used by To-do, Done and All, and added an independent six-stage filter plus a
  visible stage tag on every task.
- Allowed free-text vendor comparisons without a selected category. Lifecycle
  results now open their best matching canonical Documents artifact, and map
  guidance is actionable.
- Fixed mobile decision swipes so the keyed card actually advances, normalized
  confirmed onboarding dates, made Add date an inline calendar action and filled
  the active journey-stage marker.
- Defaulted RSVP host labels from couple profile names, added icon-backed in-place
  guest response filters and unlocked Seating from the canonical guest-row count.
- Investigated retained vendors and contacts against WED-307 and focused account
  boundary tests. No destructive purge was justified or performed.

Verification at the exact implementation SHA:

- `npm run typecheck`: passed.
- `npm run test:wedding`: 2,140 passed.
- `npm run test:line-budget`: 2 passed.
- `npm run build`: passed.
- Focused account/projection tests: 25 passed.
- Focused Playwright browser matrix: 10 passed, including 320/375 px, 200% zoom,
  Axe, task/budget, People, home and visible decision-card swipe behavior.
- Disposable PostgreSQL Family isolation matrix: 7 passed with both rollout
  switches exercised as false by default and narrowly enabled in-test. The
  disposable container and tmpfs data were removed.

Evidence:

- `Documents/verification/synthetic-usability-2026-11-01.md` records the supplied
  synthetic rollout protocol, evidence and limitations. It does not claim that
  synthetic personas pass human comprehension or controlled external cohort gates.

Not performed:

- No Oracle deployment or production environment change was requested.
- No Family helper/delegate rollout switch was enabled in a hosted environment.

Recommended next action:

- Run the remaining real-human comprehension sessions and a separately authorised
  controlled cohort. Extend isolation assurance with explicit two-owner cross-grant
  swaps and normalize or document the outsider household-command status contract.

## 2026-11-02 - WED-316 Oracle operations, landing foundations and Quiz v2 (Codex)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-316`, branch
`agent/codex/WED-316`. Oracle currently runs exact clean commit
`10250f2033c666ca33fcffc98aa6608c7d9e076c`.

Completed and live on Oracle:

- Staging writes the full source SHA to both `SOURCE_COMMIT` and the existing
  `oracle-runtime-manifest.json`; deployment verifies both before and after upload.
- Revoked the unsupported legacy watcher registrations. Daemon registration
  liveness continues, while unchanged pulse metrics no longer append heartbeat
  history. A fresh 15-second check held at exactly 500,001 rows.
- Scheduled bounded cleanup leaves no rate-limit row older than 48 hours and no
  curator audit row older than seven days. The former curator skip loop continues
  to shrink rather than refill its audit table.
- Preserved detached deployment commit `53450ed` on
  `archive/oracle-deploy-53450ed-20260928` before removing its temporary worktree.
- Safely pruned 4.931 GB of unused Docker builder cache. Current root usage is
  84%, with 7.3 GB free. Old image tags remain because some back live staging
  containers.

Implemented locally after that release:

- Wedding landing phases 0 and 1: unsupported claims and hotlinks removed,
  claims ledger, §11-scoped visual tokens, four contextual entry modes, safe
  intent/campaign propagation, keyboard operation and in-place demos.
- Quiz v2 deterministic content/scoring/comparison/persistence, adaptive question
  order, early result, correction/deletion/export, complete image provenance,
  bounded WebP assets and new Elephant/Beaver imagery.
- Quiz-to-workspace import is false-default: the intake shows the exact private,
  editable suggestions and only dispatches the AFP import after the couple presses
  `Bring these into my plan`. It does not infer a budget amount, guest count, date,
  booking or contact permission.
- Editorial Quiz copy and the publication catalogue are reconciled, and an honest
  two-phase pilot protocol is recorded.

Verification on the current local candidate:

- `npm run typecheck`: passed.
- `npm run test:wedding`: 2,140 passed.
- `npm run test:wedding-site`: passed.
- `npm run test:line-budget`: 2 passed.
- `npm run build`: passed.
- Focused Quiz/account tests: 13 passed.
- Landing/Quiz Playwright mobile and desktop matrix: 11 passed, including Axe and
  horizontal-overflow checks.
- `cargo check`: passed.

Release boundary:

- The landing/Quiz files are not deployed yet. WLP-02 (Binder), WLP-03
  (first-party measurement), QZ-09/QZ-11 knowledge/planning projections and QZ-13
  measurement remain open.
- The supplied privacy patch truthfully describes those still-open features, so it
  has not been applied or published. Apply it to the final candidate only after
  WLP-02 and WLP-03 are implemented, then ship all of them atomically.
- Quiz image diversity owner acceptance, image-blocked use, Lighthouse mobile 90,
  the final privacy walkthrough and the pilot remain release evidence, not inferred
  passes.

Evidence:

- `Documents/verification/wed-316-oracle-provenance-retention-2026-11-02.md`
- `Documents/verification/wedding-animal-quiz-v2-pilot-protocol.md`

## 2026-11-02: WED-316 Binder and first-party measurement slice

Implemented after the landing/Quiz core candidate:

- Added additive migrations 0131 and 0132 for privacy-minimised Binder delivery
  receipts and cookie-free Wedding site measurement.
- Added an enumeration-safe Binder API with one-email-per-address-per-24-hours,
  hashed double-opt-in confirmation, multipart Cloudflare/Resend delivery, strict
  body/rate/honeypot controls, operator listing and 12-month retention.
- Added a false-default Binder section to the landing page. The reviewed PDFs stay
  outside Git; their source paths and exact SHA-256 values are recorded beside the
  versioned cover asset.
- Added a false-default `/wedding/e` endpoint and deferred browser transport. Event,
  property, path and attribution values are closed and bounded; GPC/DNT and known
  bots exit before rate limiting; no IP, user agent, name, email, form content or
  quiz answer enters the measurement tables. Sessions expire after 14 months.
- Integrated the supplied privacy-page content with the newer live privacy copy,
  preserving hosted-AI and processor disclosures while adding truthful Binder,
  measurement, Quiz and 48-hour rate-limit retention sections.

Verification:

- `cargo check`: passed.
- Binder route unit tests: 3 passed.
- Measurement route unit tests: 3 passed.
- Fresh disposable-Postgres Binder and measurement tests: 2 passed; the exact test
  database was dropped and its absence verified.
- `npm run typecheck`: passed.
- `npm run test:wedding`: 2,140 passed.
- `npm run test:wedding-site`: passed.
- `npm run test:line-budget`: 2 passed.
- Wedding marketing Playwright matrix: 11 passed at mobile and desktop sizes.
- `npm run build`: passed.

Release boundary:

- Nothing in this slice is deployed. Both release flags remain false-default.
- Before Binder enablement, hot-sync the two reviewed PDFs by exact recorded hash,
  then prove actual receipt and working links in one Gmail and one Outlook mailbox.
- Quiz import/suggestion measurement remains coupled to QZ-09/QZ-11 authenticated
  workspace actions. Image diversity owner review, Lighthouse/image-blocked checks,
  final Quiz acceptance and the controlled pilot remain open.
## 2026-11-02: WED-318 Family release and vendor-side candidate

Released Family access from the clean WED-317 worktree at exact SHA
`5f1539e657a0cb7e8fa51943f42d9ed2fd77726b`. Oracle `SOURCE_COMMIT` and
`oracle-runtime-manifest.json` match. The recreated homeserver has helper/delegate switches enabled
and the owner-approved explicit `*` cohort. A bounded production proof passes with the backup
verified; the full disposable restore drill was skipped because current free disk is below its
calculated restore requirement.

Implemented in WED-318, still false-default:

- secure Gmail-command operational alias relay using the existing Cloudflare ingress HMAC,
  first-header DMARC evidence, exact sender/alias lists, ClamAV, one external destination, encrypted
  routing state, durable replay reservation, operator BCC and provider Message-ID reply correlation;
- private missing-listing proposal that reuses ownership proof and requires operator publication;
- itemised vendor quote draft with tax, expiry, conditions, private notes and exact couple preview;
- removal of the unsafe one-sided `Book` writer in favour of `Review booking terms`.

Verification passed: Worker 8; relay provider 4; relay server 3; listing validation 2; migration
catalogue 1; ownership API 2; claim 4; photo 3; quotation library 33; portal contract 7; response
contract 9; Wedding UI 2,147; focused vendor UI/state 14; TypeScript; production build; line budget.
The listing proposal HTTP test compiled but could not run because local Docker and its disposable
Postgres/ClamAV endpoints were unavailable. Do not substitute Oracle for this test.

Open boundaries: do not enable the relay before the dedicated token/key and controlled provider,
BCC and bidirectional reply proof; do not enable listing proposal before disposable-Postgres HTTP
evidence; two-sided vendor-confirmed booking and connected reconciliation remain WED-318G.

Evidence: `Documents/verification/wed-318-family-release-and-vendor-relay-2026-11-02.md`.

## 2026-11-02: WED-318 secure alias relay and membership-email release candidate

Implemented in the isolated `agent/codex/WED-318` worktree, pending the clean-SHA
hosted release:

- restricted the operational alias relay to the sole Gmail operator
  `concensure@gmail.com` and the six exact aliases `hello@`, `info@`, `wedding@`,
  `privacy@`, `support@` and `admin@omnyid.com`; an untrusted sender can never
  invoke the `To:` command and instead follows the bounded inbound-forward path;
- added the ClamAV container dependency, encrypted relay-thread state, durable
  replay reservation, operator BCC and provider Message-ID correlation while
  retaining false-default enablement until the hosted scanner and routing proof;
- added eight deterministic wedding-journey email templates from the reviewed
  schedule. Only the wedding-origin welcome is connected to a live trigger;
  the remaining templates are reusable policy-bound outputs, not an unreviewed
  autonomous schedule;
- bound the verification experience to the server-created verification token so
  client input cannot convert a generic registration into Wedding onboarding;
- proved the production Binder HTML consumes its server-generated confirmation
  URL and cannot emit the design preview's sample token;
- integrated the 14-post reviewed blog batch and local covers without importing
  the excluded Animal Quiz card or its grid restructuring;
- hardened the disposable full-account harness against the primary checkout,
  unsafe databases, dirty candidates and invisible Wedding-template seed values.

Local evidence before freezing the candidate: Worker 8, Wedding UI 2,147,
Wedding site/catalogue, line budget, TypeScript and production UI build passed.
Focused Rust verification passed for verification-source 3, lifecycle mail 3,
relay planning 4, provider boundary 4, Binder 3 and migration catalogue 1. The
clean disposable full-account run is the remaining pre-release check. Oracle is
pre-provisioned with the dedicated secret,
the exact alias/operator lists and the relay flag false; no routing rule has been
enabled yet. Hosted enablement must use a clean exact SHA and record matching
runtime provenance.

The first clean full-account attempt at `7a389281cf5d45d6f5f5203b27665257f39c6526`
reached the real UI but displayed first-login UI over the Family card. A second
attempt proved the deeper issue: the harness was logging in at generic
`/workspace/` even though its accounts were registered with a Wedding source.
The journey now uses the actual `?source=wedding` marketing handoff and asserts
that neither the generic tour nor Agent Personality wizard obscures the planner.
That run then exposed the product race behind the original empty-household
finding: while the default Wedding launch was refreshing, selecting another plan
queued only a boolean, so completion refreshed the old plan a second time. The
queue now retains the newest navigation intent and refreshes that exact plan.
The full journey must be rerun from the successor clean commit.

## 2026-11-02: WED-318 hosted relay, Binder and blog release

Released from the clean detached worktree
`C:\Users\ozans\AppData\Local\Temp\omnyid-wed318-release-c12bb30` at exact
application SHA `c12bb3006556a254b1f1cb630cc4905a76b6b2ec`. Oracle `SOURCE_COMMIT` and
`oracle-runtime-manifest.json` match. The synchronous bounded production proof passed with backup
verification; the restore drill was intentionally skipped for disk headroom. Root storage was 92%
used with 3.9 GB free after release.

Completed:

- Enabled the secure operational alias relay for the sole command sender
  `concensure@gmail.com` and the six exact aliases `hello`, `info`, `wedding`, `privacy`, `support`
  and `admin` at `omnyid.com`. `noreply` and the disabled catch-all remain outside it.
- Rotated and synchronized a dedicated Worker/server HMAC secret without printing it. The relay
  encryption key and provider token remain file-backed secrets. A signed controlled command
  produced one provider-accepted AFP event and one attempt; exact replay was suppressed. Hosted
  ClamAV accepted a clean sample and detected EICAR.
- Fixed the Oracle Compose contract so the Binder flag reaches the homeserver. Hot-synced the two
  reviewed PDFs after deploy and verified their recorded hashes and HTTP 200 responses. A controlled
  Binder request recorded `sent`, one attempt and a delivery timestamp.
- Published the reviewed 14-post blog batch and its catalogue/search metadata without importing the
  excluded Animal Quiz card/grid work. Every new article URL returned HTTP 200.
- Kept seven non-welcome lifecycle emails as deterministic, consent-aware templates only. The
  verified Wedding welcome remains the sole live trigger; no generic autonomous scheduler was added.
- The clean disposable full-account harness passed real registration/login, two isolated couples,
  Family household/helper/delegate/revoke journeys and cross-couple denial. The disposable
  PostgreSQL missing-listing proposal test passed once Docker was available.

External observations still recommended:

- Check the controlled Gmail mailbox for the relay copy/BCC and verify reply-in-thread behavior.
- Open the Binder delivery and press its real confirmation button. Provider acceptance and backend
  persistence passed, but this session cannot independently observe the mailbox UI.

Open product work: connect the remaining lifecycle-email AFP eligibility producers and pre-send
suppression queries; complete two-sided vendor-confirmed booking with atomic booking/budget/task/
decision reconciliation; keep missing-listing publication operator-reviewed until rollout approval.
## 2026-11-02 - WED-319 budget authority and lead-magnet first slice (Codex, in progress)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-319`, branch
`agent/codex/WED-319`; starting SHA
`e459ddfe730293641f8f3a89eb2c8a221c1857c2`; exact tested implementation SHA
`a689a0274f0b1f0a8e8a29dda1081b24bcb76b12`.

- Confirmed the reported budget defect: the former seven displayed midpoints totalled 120%. Added
  `wedding-budget-model.v1.json` with explicit targets totalling 100%, a generated public copy and a
  parity test. Workspace guidance, its information tip and the published budget guide now explain
  that planning bands are non-additive and bundled venue/catering costs are counted once.
- Added the first public Budget Reality Check. Its deterministic engine balances to the exact entered
  amount, moves up to three priorities without crossing category floors, and shows 25 conditional
  missing-cost questions without invented amounts. Results remain local and can be printed or
  downloaded; continuation uses an allowlisted registration source.
- Added shared lead-magnet envelope/storage and mobile/print primitives. No analytics or network call
  was added to the tool.
- Recorded the capability audit at
  `Documents/verification/wed-319-lead-magnet-capability-audit-2026-11-02.md`: the six stages already
  exist; timing still has multiple authorities; `/wedding/understanding` is retained and already sends
  one complete image batch only after submit; only venue (178) and photographer (93) clear the new
  50-populated-style-tag threshold in the hosted corpus.
- Recommended benchmarking `gemini-3.5-flash-lite` for a future low-cost image-provider adapter. The
  current Anthropic route remains unchanged until structured-output quality, privacy and cost tests
  pass.
- Verification: `npm ci --ignore-scripts`; Solid UI typecheck passed; 2,151 Wedding tests passed;
  both line-budget tests passed; production build passed; Wedding static-site and CSP smoke passed;
  eight public budget/magnet tests and seven focused workspace budget/style tests passed.
- Remaining work is intentionally dependency-ordered: consolidated import consent/profile registry,
  existing-AFP writers, quote decoder, shot-list builder, one task/lead-time catalogue and Countdown
  parity, then the licensed style library and optional explicitly submitted image reflection.

## 2026-11-03 - WED-320 RSVP, projection and LP-01 verification (Codex)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-319`, branch
`agent/codex/WED-320`, starting SHA `a239cac`.

- Replaced the wedding-understanding provider call with the exact server-side OpenRouter model
  `google/gemini-3.5-flash-lite`; calls remain explicit complete-batch submissions and never expose
  the API key to the browser.
- Kept RSVP on the existing authenticated/public capability routes and AFP ledger. Guests/RSVP now
  appear together in the Guests hub, while helpers have a separate `Who is helping` destination.
  Existing RSVP replay, tenant-isolation, rotation, revocation and concurrency tests pass against
  disposable PostgreSQL 18.
- Persisted one false-default admin-study consent field used by both onboarding and Documents.
  Contributors and contacts remain possible assignees, but adding one does not reassign tasks.
- Hid Setup Check from every non-operator account, moved Upload Files to a right-aligned accessible
  expanding plus control, aligned Timeline controls, and retained exact artifact selection for
  `View File`.
- Sanitized Maps previews and ignored unrelated Brave snippets. Vendor lifecycle filters now expand
  a vendor brief, AFP activity, conversation context and selectable related documents in place.
- Recorded LP-01 evidence in
  `Documents/verification/wed-320-lead-magnet-capability-audit-2026-11-02.md`. Generic task email
  reminders, shifting every task after a wedding-date change, four proposed document subtypes and a
  shared profile/provenance registry remain gated. Batch 2 should continue with LP-02 rather than
  duplicating existing planner routes.
- Fixed the disposable harness for PostgreSQL 18's version-specific data layout by mounting tmpfs at
  `/var/lib/postgresql`, not at the old data subdirectory.
- The reported relay 550 occurs before OmnyID parses `To:`. Live SPF includes Cloudflare and DMARC is
  `p=reject`; the Worker correctly trusts only Cloudflare's first DMARC result. Commands must use the
  actual Gmail From identity `concensure@gmail.com`, with recipient `hello@omnyid.com`, then
  `To: concensure+test@gmail.com` as the first body line. Do not use Gmail send-as
  `hello@omnyid.com` and do not weaken DMARC.
- Verification passed: Solid UI typecheck; 2,157 Wedding tests; production build; Wedding site/CSP,
  Quiz, confirmation and blog smokes; both line-budget tests; 10 RSVP response-route tests; 3 RSVP
  capability-route tests; migration catalogue; 4 operator-relay Rust tests; and 8 Worker tests.

Next action: freeze the successor commit, deploy from a clean detached worktree, apply migration
0135, verify exact Oracle runtime provenance and hosted health, then begin LP-02.

Deployment follow-up: application SHA `9f3d02fad114c1ffc12dc0f3b6865519c6012a6b` built and started
successfully, migration 0135 applied, and direct production proof passed with the restore drill
skipped for disk headroom. The hosted audit then found no OpenRouter variable in `.env.oracle`.
The successor release adds a default `/run/secrets/openrouter_api_key` Compose contract and teaches
the existing secret migration/sync tools about `OPENROUTER_API_KEY_FILE`; deploy that successor after
promoting the locally supplied key as a mode-600 remote secret.

Hosted follow-up found and fixed one additional edge-routing defect: authenticated login passed, but
`/wedding/rsvp/capabilities/status` returned the static-site 404 because only RSVP reminders were
proxied. Caddy now sends `/wedding/rsvp/capabilities*` and `/wedding/rsvp/responses` to the existing
homeserver routes, with deploy-time assertions for both staged and running configurations. A bounded
hosted Wedding Understanding request successfully returned the exact structured reflection contract
through `google/gemini-3.5-flash-lite`; no submitted content was persisted.

## 2026-11-03 - WED-321 public journey and run-sheet repair (Codex, ready)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-319`, branch
`agent/codex/WED-321`; implementation commit `6250f42`.

- Corrected Wedding landing copy and added visible visit-scoped phase feedback; recorded why the
  three unbuilt Batch 2 magnets must not receive launch posts yet.
- Added four licensed, local sub-60 KB photographer-choice images; moved the public roadmap to Q4,
  marked the email gateway tester-only, and bounded the trial runner with visible busy/error states
  plus a 12-second server fallback.
- Replaced the density-labelled UI with a real 10-step root font-size scale, portalled database
  dialogs, and kept run-sheet context actions on typed A2UI intents. Links now reveal/highlight rows
  in place on mobile and desktop; explicit fixed milestones and empty day-of records can be added.
- Passed: typecheck; production build; 2,162 Wedding tests; site/CSP/Quiz/confirmation/blog smokes;
  line budgets; 21 focused run-sheet/font tests; five run-sheet Playwright viewports/zoom/print tests;
  and four Rust trial-runner tests. Repository-wide `cargo fmt --check` remains pre-existingly noisy
  outside this slice; the touched Rust hunk is rustfmt-shaped.
- Oracle Docker builder cache only was pruned (4.367 GB), moving root use from 94% to 84% before
  release. No image, container, volume, backup, database or source data was removed.

## 2026-11-03 - WED-322 Batch 2 foundation and workspace repair (Codex, candidate)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-319`, branch
`agent/codex/WED-322`, based on deployed SHA `439770531a476cfc643a8f25514b2b8464f6f7eb`.

- Added one versioned 36-field public-magnet profile/provenance registry, a generated static parity
  copy, declared-writer enforcement, bounded history, conflict handling, edit/remove/export controls
  and Budget magnet prefill/write-through. Data remains browser-local until explicit account handoff.
- Extended the existing Wedding artifact projection with the proposed Batch 2 subtypes. No parallel
  document store or premature launch route was added.
- Replaced the foreign setup banner with a readable setup checklist whose date action opens and saves
  an inline calendar. Increased the workspace root font scale, made model status depend on a usable
  inference backend, added a read-only Chrome/Edge built-in-AI fallback, and collapsed suggestions on
  execution.
- Discover can open the existing automation controls in place. Contacts now has a concise empty state
  and a primary/secondary action hierarchy. Older accounts missing a Master Agent instance recover by
  lazy provisioning rather than remaining in a fleet-error loop.
- Passed: Solid UI typecheck; 2,163 Wedding tests; production build; Wedding static/CSP/quiz/account
  confirmation/blog catalogue tests; seven magnet-profile tests; focused workspace, browser-AI,
  artifact, search and fleet tests; line budgets; the focused Rust fleet-route test; and full
  `cargo check --lib`.
- Repository-wide `cargo fmt --check` remains pre-existingly noisy outside this slice; the touched
  Rust hunk is rustfmt-shaped. Countdown catalogue/date parity, the reviewed invitation phrase set and
  the licensed palette corpus remain genuine Batch 2 publication gates, so their launch posts remain
  unpublished.

Deployment follow-up: application SHA `ef3045e26765f0adecfd75a3f855256070375800` was rebuilt from
the clean detached worktree `C:\temp\omnyid-oracle-deploy-ef3045e` and deployed to Oracle. The first
image export correctly failed closed when the disk reached 99%; no service transition occurred. A
safe builder-cache prune removed 4.3 GB, and the previously authorised backup retention was applied:
17 older snapshots were removed while the three newest 2 November recovery points were retained.
`/var/backups/omnyid` fell from 15 GB to 2.1 GB before deployment. The retry built and recreated the
UI, homeserver, backup and Caddy services. `SOURCE_COMMIT` and `oracle-runtime-manifest.json` both name
the full SHA; the workspace returns HTTP 200 with CSP and no-cache headers. Independent production
proof passed with homeserver and backup running, runtime scripts intact, and the fresh 3 November
backup internally verified. The restore drill was skipped. Root usage was 76% after the fresh backup.
## 2026-11-03 - WED-323 actionable decisions and Batch 2 intake bridge (Codex, candidate)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-319`, branch
`agent/codex/WED-323`, based on deployed application SHA
`ef3045e26765f0adecfd75a3f855256070375800` and its evidence-only successor `433bf08`.

- Removed the Wedding-home planning-basics card. The actual intake/setup authorities remain
  available where they belong.
- Pending-RSVP decision cards now use `Message guest` and reveal an in-place, editable email and
  contextual multi-paragraph draft. The draft includes invitation timing when known, why the reply
  matters and a warm attendance note; contact phone/roles/notes are available on request. Saving,
  exact-content approval, provider submission, quiet hours and replay suppression reuse the existing
  RSVP AFP and server routes.
- Vendor search no longer overrides pointer/focus selection, restoring normal caret placement,
  double-click word selection, triple-click browser selection and drag selection.
- Transport/access decisions no longer inherit a total-wedding-budget label. The recommendation
  reads saved location/route evidence when present, names the exact transport allocation, and creates
  an honest verification brief when evidence is missing. Hen-night recommendations use saved
  atmosphere/priorities to generate a readable activity-format brief. Both expand in place and use
  the existing Documents artifact projection.
- Continued Batch 2 LP-04 without adding a parallel store: the existing public magnet profile can
  now be reviewed in onboarding with provenance chips and per-fact toggles; sensitive facts are off
  by default and accepted facts prefill the existing intake fields before normal confirmation.
- Verification passed: Solid UI typecheck; 2,170 Wedding tests; Wedding site/CSP/quiz/account/blog/
  magnet smokes; both line-budget tests; focused interaction/research/RSVP/profile tests; production
  build. No source file exceeds 999 lines.

Still open in Batch 2: complete LP-04/LP-05 mappings for constructs beyond the present intake fields,
cross-device result-file import, the reconciled Countdown catalogue, reviewed invitation wording
library and licensed palette corpus. Those are not represented as published capabilities.

Deployment follow-up: exact application SHA
`1421f07d83d444dacbe527f7e165ab80c56e652f` was rebuilt and retested from clean detached worktree
`C:\temp\omnyid-wed323-release-1421f07`, then deployed to Oracle. The deploy wrapper became locally
idle after its hosted workspace smoke, after all remote transitions and a fresh verified backup had
completed; it was stopped locally only. The repository production-proof command was then run
independently with the restore drill skipped and passed. Oracle `SOURCE_COMMIT` and
`oracle-runtime-manifest.json` match the full SHA, the deployed Wedding workspace asset contains the
new decision UI, `/workspace/` returns HTTP 200, all configured services are up, and the fresh
`20261103T043008Z` backup is internally verified. Root use is 78%, with 9.9 GB free.

## 2026-11-03 - WED-324 bounded decision research, Wedding GEO and Batch 2 import (Codex)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-319`, branch
`agent/codex/WED-324`, application commit `5bb45a740aba6398305620688e4656c6c833843e`,
based on WED-323 release-evidence commit `cf28491d8648b2f3e189767e5bd400e4c32d3135`.

- Limited recommendation enrichment to the current ranked decision and its immediate successor.
  Linked saved reports now replace generic recommendation copy when present; vendor search/shortlist,
  RSVP message, readable report and ordinary task actions open in place. Ordinary task opening retains
  the existing owner and assignment surface.
- Added only non-visible Wedding landing retrieval infrastructure: `en-AU`, canonical/OpenGraph/Twitter
  metadata, question/direct-answer semantics on the four existing JavaScript stage contexts, a
  deterministic public sitemap, explicit Caddy handlers and a crawler policy that keeps private and
  operational paths out. Visible landing-page body content and unsupported entity/ABN schema were not
  changed.
- Continued Batch 2 LP-07 by accepting an exported shared Wedding profile or supported Budget Reality
  Check JSON through the existing intake review. Sensitive facts remain off by default; the existing
  intake is still the only account confirmation and AFP-write authority.
- Passed Solid UI typecheck; 13 focused decision/profile tests; all 2,174 Wedding tests; production
  build; Wedding website, CSP, quiz, account-confirmation, blog and magnet smokes; both line-budget
  checks; sitemap regeneration idempotence; and `git diff --check`. No Rust source changed.
- Remaining Batch 2 work includes per-tool mappings for the unfinished magnets, explicit reconciliation
  choices when imported facts conflict with confirmed account facts, and the signed-in Add-to-plan
  variant. This slice was not deployed because the user did not request a release in this turn.

## 2026-11-03 - WED-325 binder, bounded funded inference and trial release (Codex)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-319`, branch
`agent/codex/WED-325`. Exact deployed application SHA:
`dcd68fe7bcc725fc65116e5b406c7fa5361a0bb9`; clean release worktree:
`C:\Users\ozans\AppData\Local\Temp\omnyid-wed325-release-dcd68fe`.

- Made the Wedding Day Binder email field and consent interactive in initial HTML; only sending waits
  for capability readiness. Deferred non-critical landing scripts and lazy-loaded the binder image.
- Added one shared OpenRouter funded-inference authority using `openai/gpt-5-mini`, a transactionally
  reserved global weekly pool clamped to USD 50, provider usage receipts, privacy routing, bounded
  outputs and feature-specific request limits. Oracle's minimal and full compose profiles explicitly
  pass the false-default funding and Wedding policy settings; the secret remains file-backed.
- Added authenticated, cached research for only the active and next Wedding decision while preserving
  existing vendor, RSVP, report and assignment surfaces.
- Repaired the anonymous Python trial: duplicate submits are suppressed, obsolete operator panels are
  absent, and travel requests get a useful day-by-day answer with map and month-aware weather guidance
  without invented flights or times. The hosted synthetic Sydney request completed through OpenRouter,
  produced a provider ID and recorded USD 0.001641 actual cost.
- Added a rate-limited fixed-recipient Contact modal/route for `hello@omnyid.com`; it is not an open
  relay. Continued Batch 2 by making imported/current Wedding fact conflicts explicit and keeping the
  current intake authoritative unless the user opts to replace it.
- Verification: `cargo check --lib`; focused funded-inference/contact/trial Rust tests; Solid UI
  typecheck; all 2,174 Wedding tests; Wedding site/CSP/quiz/account/blog/magnet smokes; focused Batch 2
  tests; production build; line budgets; compose validation; hosted binder/contact/trial smokes.
  Oracle `SOURCE_COMMIT` and `oracle-runtime-manifest.json` match the application SHA. Independent
  production proof passed with homeserver/backup running and the latest backup internally verified;
  restore drill was skipped. Root use was 83% in proof (about 8.8 GB free immediately before it).
- Remaining autonomous Batch 2 work: tool-specific mappings for magnets not yet backed by their final
  deterministic assets, signed-in Add-to-plan variants, the reconciled Countdown catalogue, reviewed
  invitation wording library and licensed palette corpus. Do not publish gated claims before those
  underlying assets and handoffs are complete.

## 2026-11-03 - WED-326 Binder email completion and Batch 2 signed-in handoff (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-319`, branch
`agent/codex/WED-326`, based on WED-325 release-evidence commit `760fe2a`. Exact deployed
application SHA `08656091e9ed2d952ed761cc65106b68d186a2bd`; clean release checkout
`C:\Users\ozans\AppData\Local\Temp\omnyid-wed326-release2-0865609`.

- Binder POST responses now include the fillable and print downloads plus a clear `Continue in
  OmnyID Wedding` path. The landing page reveals all three immediately after submission while the
  email uses the same canonical URLs. Provider acceptance, recent dedupe and delivery-unavailable
  states have honest, distinct copy.
- Failed email attempts no longer enter the 24-hour successful-send dedupe window. A short pending
  window still suppresses concurrent duplicate requests.
- Binder and Wedding-source registration mail include the same three compact, secondary venue-quote
  articles. Generic OmnyID registration mail is unchanged.
- Continued Batch 2 LP-07: the live Budget Reality Check CTA checks the existing session and becomes
  `Add to your plan` for signed-in visitors; signed-out visitors keep the established consented
  registration/import path.
- Passed locally: focused Rust Binder, registration-source and reading-list tests; Solid UI
  typecheck; 2,175 Wedding tests; Wedding website/CSP/quiz/account/blog/magnet tests; line budgets;
  production UI build; `git diff --check`. Docker Desktop was unreachable, so the opt-in disposable
  Postgres Binder retry test was not run in this local candidate.
- Hosted evidence: Oracle `SOURCE_COMMIT` and `oracle-runtime-manifest.json` match the full SHA; the
  public root and both Binder PDFs return 200; Binder is enabled; the live landing contains the
  immediate-download and continuation UI; and one controlled Binder request returned
  `downloads_ready` with `provider_accepted`. This proves provider acceptance, not inbox receipt.
- Fresh production proof and backup verification pass. The immediately preceding detached proof
  also completed its restore drill successfully. ClamAV became unhealthy when a signature refresh
  left `clamd` defunct; a targeted container restart restored its configured healthcheck. All
  production services are running. Root disk is 85% used with 7.1 GiB free.
- Remaining Batch 2 gates are unchanged: the reconciled Countdown catalogue, reviewed invitation
  wording library and licensed/diversity-reviewed palette corpus must exist before those tools or
  their launch claims are published.

## 2026-11-03 - WED-327 stable Wedding controls and crawlable public foundations (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-319`, branch
`agent/codex/WED-327`. Exact deployed application SHA
`5a6ce9032e33c2fd80c8224b215d6be2c93d646c`; clean release checkout
`C:\Users\ozans\AppData\Local\Temp\omnyid-wed327-release3-5a6ce90`.

- Removed Upload-files hover reflow/flicker and added an in-context explanation that saved
  contributions increase the available Wedding budget while retaining their conditions.
- Removed public Binder readiness and AFP implementation language. Added deterministic `en-AU`,
  canonical, OpenGraph/Twitter and JSON-LD coverage across 68 Wedding pages; articles identify
  Casper Wu and publication dates. Standalone sitemap landing pages now self-canonicalise.
- Added direct home links to three quote guides, a localized two-part hero/facts table, a textual
  calculator method and exact 100-percent model, and an explicit illustrative label on the mock
  Harbour Room card. The root site now includes a Wedding-couple use case.
- Replaced the JavaScript-only public vendor starting state with database-backed initial HTML and
  individual LocalBusiness pages. Server rendering intentionally excludes imported photos until
  licence evidence is reviewed. A Docker packaging regression was caught remotely, fixed and given
  a static regression assertion before the successful release.
- Root routing now preserves `/`, permanently redirects duplicate/legal aliases and returns 404 for
  arbitrary paths. A hosted smoke caught the first strict-fallback root regression; the corrected
  Caddyfile was validated by Oracle Caddy before the final release.
- Continued Batch 2 only with bounded aggregate profile-import measurement. It accepts counts, not
  Wedding facts or free text. Countdown catalogue reconciliation, reviewed invitation wording and
  licensed/diversity-reviewed palette assets remain the next autonomous publication dependencies.
- Exact-candidate evidence: all 2,176 Wedding tests, typecheck, line budgets, Wedding site/CSP/blog/
  magnet/budget tests, six focused Rust tests and production build pass. Hosted checks confirm the
  public schema/canonicals, server-rendered directory and vendor detail, calculator method, root
  Wedding use case, 200/308/404 routing, and full runtime SHA. Independent production proof passes;
  the latest backup is internally verified and the redundant restore drill was skipped after the
  deploy wrapper's post-proof became locally idle. Oracle root is 86% used with 6.4 GiB free.

## 2026-11-04 - WED-328 token rotation, public metadata contract and Growth Panel plan (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-319`, branch
`agent/codex/WED-328`, based on clean evidence commit
`b8e06fe1d067544c3ca3d7e94a036f2ba9677c5d`.
The clean implementation candidate is
`52e9a5acbe25981279641d0bcc3fb3731202851d`; all evidence below was rerun against
that exact commit.

- Replaced the revoked Cloudflare Email Routing credential with the user-provided
  `omnyid_email_routing` token without printing or committing it. Non-mutating probes verified token,
  account and zone visibility for routing addresses, Workers scripts, sending suppressions, routing
  rules, Worker routes and DNS. The Downloads source was removed after installing an ACL-restricted
  gitignored local secret and the existing root-owned `0600` Oracle runtime secret. The running
  homeserver sees the replacement file; no restart or Cloudflare state mutation was needed.
- Updated the Oracle secret-sync plan so transactional mail, vendor mail, operator relay and the
  generic Email Routing consumer share the existing canonical runtime secret rather than creating
  stale per-consumer copies. Its self-test resolves one upload and one runtime path.
- Extended deterministic public metadata reconciliation beyond Wedding to all indexable root pages
  in the sitemap. Added the repository policy and a 73-route smoke test for locale, self-canonical,
  social metadata and page-appropriate JSON-LD. Wedding site, CSP, account, blog, quiz and magnet
  checks remain green.
- Continued Batch 2 with a versioned canonical six-stage/task catalogue. The 20 existing workspace
  tasks now carry catalogue provenance and the journey projection consumes the same authority.
  `WEDDING_COUNTDOWN_PUBLICATION_READY` remains false: vendor timing coverage, reviewed Australian
  legal copy, invitation wording and licensed/diversity-reviewed palette assets remain open.
- Added implementation-ready Growth Panel specification and dependency-ordered tasks under
  `Documents/marketing/analytics`. The recommended isolated implementation is branch
  `agent/codex/GROWTH-001` in `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, based on the final
  clean WED-328 commit, with Codex/GPT-6 Astra high as implementer and an independent architecture/
  privacy review.
- Evidence: token capability probes and local/Oracle/runtime digest equality passed without storing
  the digest; secret-sync self-test passed; three catalogue tests, all 2,179 Wedding tests, public
  site tests, typecheck, line budgets, `git diff --check` and the production UI build passed.
- No application deployment was requested or performed. Oracle application provenance remains
  `5a6ce9032e33c2fd80c8224b215d6be2c93d646c`; only the file-backed Cloudflare control credential was
  rotated in place.

## 2026-11-04 - WED-329 shared Countdown catalogue and public checklist (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-WED-319`, branch
`agent/codex/WED-329`, based on clean WED-328 coordination commit
`e6bbd421c0747ee737008ca5b84f53536c74f56c`.

- Replaced the partial manual Countdown gate with a 65-task, six-stage catalogue covering 14 plan
  foundations, all 31 existing supplier categories and the 20 previously emitted workspace tasks.
  The vendor decision pipeline now reads the same lead-time authority; a generator writes the public
  JSON and parity tests reject drift.
- Rechecked federal NOIM guidance using the Attorney-General's Department Get married and NOIM pages
  plus section 42 of the Marriage Act 1961. The planner reminder moves to three months before the
  ceremony while retaining the one-month latest and 18-month earliest legal boundaries. The public
  tool contains no unverified state-specific lodgement claim and identifies itself as planning aid,
  not legal advice.
- Added `/wedding/wedding-planning-checklist-australia.html`: exact-date planning, current stage,
  next five actions, full stage checklist, compressed-plan Catch up now, local completion, print,
  `.ics`, privacy-bounded hash sharing and consented Wedding-workspace continuation. The Wedding home
  links to it and the sitemap/public metadata contract includes it.
- Exact application SHA `415fe21dc4a35bb944781580273d5ed2ad1346f2` passed generator/parity,
  vendor-lead-time, legal, public engine and site tests; all 2,180 Wedding tests, 74-page public
  metadata checks, typecheck, both line budgets and a clean production build. It was built and
  deployed from detached checkout
  `C:\Users\ozans\AppData\Local\Temp\omnyid-wed329-release-415fe21`.
- Oracle `SOURCE_COMMIT` and `oracle-runtime-manifest.json` both name the full application SHA. The
  hosted checklist and generated catalogue return 200; the latter reports `wedding-catalogue.v1`,
  publication readiness true, 65 tasks, 31 vendor timing categories and three official legal
  sources. Runtime proof passes with the fresh backup verified and the restore drill explicitly
  skipped. A separate full proof correctly found the disposable restore drill capacity-blocked:
  Oracle root use is 90 percent with about 4.9 GB free, while the drill requires about 8.2 GB.
  No production data was deleted to manufacture a pass. Evidence is recorded in
  `Documents/verification/wed-329-countdown-oracle-release-2026-11-04.md`.
- This closes the autonomous Countdown publication dependency. It does not fabricate the separate
  human reviews required for the invitation wording library or the palette image/professional brief
  corpus. Those surfaces remain unpublished until their documented reviews exist.

## 2026-11-04 - GROWTH-00 event and KPI contracts (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/GROWTH-001`, frozen base
`8291a0c59be5217c49871db3c8f04cb68401b8d4`.

- Added executable `growth-events.v1` and `growth-kpis.v1` definitions over the existing public
  measurement, auth, Wedding AFP and Stripe billing authorities. Each event is direct, derived or
  explicitly absent; Binder download and refunds are not fabricated from weaker source facts.
- Activation v1 contains exactly saved intake plan, meaningful saved budget decision, selected
  vendor follow-up and resolved decision. Login, page/home views, Quiz completion, partner joins and
  generated/unsaved AI output are excluded. Acquisition increments once per canonical Wedding.
- Growth metadata is allowlisted and carries no names, emails, phones, guest/dietary/access facts,
  message/quote text, budget amount, user ID or Wedding ID.
- Same-session attribution may use the existing opaque visit. Persistent cross-session attribution
  is false-default, requires explicit opt-in and no GPC/DNT, expires within 30 days and deletes the
  link on revocation. Raw anonymous measurement has a 30-day target that GROWTH-01 must implement;
  linked-projection retention remains disabled pending privacy-impact approval. Historic campaign
  attribution stays unavailable where no touch exists.
- Source audit: `Documents/verification/growth-00-source-contract-audit-2026-11-04.md`. Verification:
  seven focused Rust tests pass, `cargo check --lib` passes, both line-budget tests pass, and no new
  file exceeds 999 lines. Next dependency-ready work is GROWTH-01 replay-safe measurement and
  bounded raw-row cleanup.

## 2026-11-04 - GROWTH-01 replay-safe public measurement (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/GROWTH-001`, feature commit
`e25b8525290569dca713a268ce5966eb7eb731e1`.

- Added `public-measurement.v1` with stable client event IDs, acknowledged retry, replay-safe
  `sendBeacon`, composite `(visit_id,event_id)` persistence and strict path/property/body bounds.
- Root `/` now uses the existing first-party endpoint and shares one session-only visit/landing
  snapshot with Wedding. GPC/DNT, known-bot suppression and the no-third-party boundary remain.
- Replaced the former 14-month raw cleanup with a 30-day, four-by-1,000 batched session deletion;
  event rows cascade. A tmpfs pgvector test proved migration, exact replay, a distinct same-visit
  event and retention cleanup.
- Browser replay smoke, 10 focused measurement tests, seven Growth contract tests, migration
  parity, `cargo check --lib`, both line-budget tests, public-site/CSP tests and 74-page metadata
  checks passed. Evidence is in
  `Documents/verification/growth-01-public-measurement-evidence-2026-11-04.md`.
- The user-pruned Oracle now has about 16 GB free at 64 percent use. The previously blocked WED-329
  independent restore drill was rerun and passed with backup verification and runtime-script
  integrity also passing. GROWTH-01 itself is committed but not deployed.
- Next dependency-ready work is GROWTH-02 consent-aware same-session attribution and canonical
  Wedding identity linkage. Persistent cross-session attribution remains false-default pending its
  separate approved consent state.
# 2026-11-04 - GROWTH-02 same-session acquisition linkage (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/GROWTH-001`, feature commit
`b4cbff5dfeeb9254a448e8f4430025954f9d848c`.

- New password, Google and Apple accounts can carry the existing opaque same-session visit; no
  campaign field is accepted from the client. The server resolves the touch from its first-party
  measurement row, creates one user link and attaches only that user's first Wedding plan.
- Database uniqueness and update predicates prevent another user from claiming the visit or the
  Wedding association from being swapped. Existing login and partner acceptance cannot increment
  acquisition. Touch/link rows expire or cascade within 30 days.
- Deterministic first-touch and last-non-direct functions preserve paid/search/social touches across
  later direct visits and keep unknown distinct. Persistent cross-session browser identity stays
  disabled pending an approved explicit-consent state and remains blocked by GPC/DNT.
- Two browser-state tests, 12 focused Growth tests including a disposable tmpfs pgvector case,
  migration-catalog parity, Solid typecheck, `cargo check --lib` and both line budgets pass.
  Evidence: `Documents/verification/growth-02-acquisition-linkage-evidence-2026-11-04.md`.
- Not deployed. The next dependency-ready slice is GROWTH-03: project activation and meaningful
  activity derived from exact approved AFP source kinds without projecting private values/content.
# 2026-11-04 - GROWTH-03 AFP activation projection (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/GROWTH-001`, feature commit
`4c330a693b7ceae8afcf4c8f46d708e42385b714`.

- Added a cursor-based `activation-v1` projector over the private tenant AFP ledger. It accepts only
  exact persisted intake, meaningful budget decision, selected vendor follow-up and durable decision
  resolution shapes. Insert-time projection is best-effort and the first onboarding authorisation
  rewinds/reconciles bounded history for crash/order recovery.
- One tenant-scoped Wedding and one first activation are stored. Qualifying source messages count
  once per Wedding/Sydney calendar day; a budget decision can emit both typed source events without
  inflating the daily action count. Projection rows contain source IDs/counts, never private values.
- Generated/unsaved/passive/partner-acceptance events, content/subtype mismatches, deleted sources
  and unauthorised cross-tenant sources fail closed. Delegated partner work recorded in the same
  unified Wedding ledger contributes without creating another acquisition.
- Three pure classifier tests, a real disposable tmpfs pgvector test with all 139 migrations,
  16 focused Growth tests, migration parity, `cargo check --lib` and both line-budget tests pass.
  Evidence: `Documents/verification/growth-03-activation-projection-evidence-2026-11-04.md`.
- Not deployed. The next independent P0 slices are GROWTH-04 signed payment/refund reconciliation
  and GROWTH-05 manual spend/Meta CSV import; GROWTH-06 rollups depends on both.

# 2026-11-04 - Worktree retirement and GROWTH-04 payment progress (Codex, in progress)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/GROWTH-001`, base SHA
`c5b2ee0f144e3a21d0a6505e26c2e8af76d872a4`.

- Storage cleanup reclaimed roughly 280 GB of duplicated Cargo output; C: had 316.9 GB free after
  cleanup. `CARGO_TARGET_DIR` is persisted as `C:\cargo-target`, `C:\temp\wt` is the required new
  throwaway-worktree root, and `AGENTS.md` records both rules.
- A verified all-refs recovery bundle is at
  `C:\temp\omnyid-retirement-20261104\omnyid-all-refs-before-retirement.bundle`. Dirty disposable
  checkout evidence and the staged ritzy-child patch are beside it. Thirty-six disposable/retired
  worktrees and 91 merged/stale local branches were removed. The active WED-319 and Growth trees,
  the latest WED-329 release checkout, and every dirty feature worktree were preserved.
- `C:\temp\omnyid-artifacts-before-2026-10-04.zip` contains 9,220 superseded artifact files; the
  newest complete run per evidence family and all tracked artifacts remain in the repository.
  `.kilo`, `.secrets/oracle-backup-archive` and per-worktree Cargo targets were removed as requested.
- GROWTH-04 now has a `payment-v1` classifier and rebuildable projection. Checkout binds a
  tenant-owned Wedding and resolved Stripe price to the Session and PaymentIntent. Only live paid
  Wedding success qualifies; cumulative `charge.refunded` events reconcile partial/full state by
  PaymentIntent. Replays cannot double revenue, and test/unbound/mismatched events fail closed.
- Added first-purchase/30-day maturity summary and append-only variable-cost revisions.
  Profitability is typed incomplete when tax or any fixed/rate/service input is missing.
- Passed: 19 Growth tests, 21 billing tests, migration-catalog parity, `cargo check --lib`, Solid
  line budgets, large-file line-neutrality, new-file line limits and diff checks. Evidence is in
  `Documents/verification/growth-04-payment-projection-progress-2026-11-04.md`.
- Still open: the implemented real Postgres case did not run because Docker Desktop repeatedly
  returned `Docker Desktop is unable to start`. The unidentified stale localhost listener was not
  used. Do not mark GROWTH-04 done until a fresh tmpfs `omnyid_test` container applies all 140
  migrations and passes the focused scenario. Nothing was deployed and no Stripe action occurred.

# 2026-11-04 - GROWTH-04 closed and GROWTH-05 spend import complete (Codex)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/GROWTH-001`, GROWTH-05 base SHA
`733f394d7464ba8caeb9159fa7472cd10b943cc6`.

- Docker recovered. A fresh loopback-only `pgvector/pgvector:pg16` tmpfs container applied all 141
  migrations and passed both GROWTH-04 payment/refund and GROWTH-05 spend replay/correction cases.
  PostgreSQL aggregate promotion found by the real test was corrected with explicit exact
  `BIGINT` minor-unit casts. The disposable container was removed.
- GROWTH-05 adds immutable spend receipt/row/correction/audit storage and operator-only preview,
  commit, one-row manual and correction routes. Commit always reparses bounded CSV server-side.
- Stable file/row digests prevent duplicate spend; mixed aggregation grains require an explicit
  exact-grain selection; source currency and reviewed AUD conversion metadata remain separate;
  corrections are append-only and cannot make effective spend negative.
- Passed: 23 Growth tests, route bounds/formula safety, both real database scenarios, migration
  parity, `cargo check --lib`, line budgets, file limits and diff checks. Evidence:
  `Documents/verification/growth-04-payment-projection-progress-2026-11-04.md` and
  `Documents/verification/growth-05-spend-import-evidence-2026-11-04.md`.
- No Meta API, Stripe API, production database or Oracle deployment was used. Next dependency is
  GROWTH-06 KPI/cohort/rollup over completed acquisition, activation, payment and spend sources.

# 2026-11-04 - GROWTH-06 pure KPI slice (Codex, in progress)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/GROWTH-001`, base SHA `9e44301e106f7da21ba14beb48951d710e53ef2d`.

- Added exact Sydney-time daily/trailing/previous windows and DST transition proof.
- Added typed KPI states, exact cost/rate arithmetic, maturity handling, weekly days-one-to-seven
  cohorts and first-party/Meta landing-view separation.
- Four focused tests pass. Evidence:
  `Documents/verification/growth-06-kpi-engine-progress-2026-11-04.md`.
- Still open: migration-backed daily rollups, incremental checkpoint/full rebuild parity, complete
  current/previous KPI assembly and disposable database verification. Do not mark GROWTH-06 done.
## 2026-11-04 - GROWTH-06 deterministic KPI rollups (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/GROWTH-001`; implementation based on `6d40083664edc16e67b156baf64231fad6c18873`.

- Added migration-backed, content-free Sydney daily rollups with incremental checkpointing and
  late spend/payment correction replay.
- Added six typed current/previous KPI outputs and preserved maturity, completeness and exact
  first-party versus Meta landing-view boundaries.
- Five KPI tests, migration parity and a real disposable pgvector rebuild/incremental equality
  fixture pass. The first `rustc` test link crashed with Windows `STATUS_ACCESS_VIOLATION`; the
  same build and tests passed with incremental compilation disabled. The database container was
  removed.
- Nothing was deployed. Next: GROWTH-07 authenticated operator API.
## 2026-11-04 - GROWTH-07 authenticated Growth API (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/GROWTH-001`; based on GROWTH-06 SHA
`ec0b1af7dc9d51c3e2df1127c5fd0adddc6ae983`.

- Added false-default, operator-only overview/campaign/cohort/benchmark/quality/export routes over
  content-free Growth sources. Bounds, source coverage, exact definitions and export audit are
  server enforced.
- Disposable Postgres aggregate SQL and real-router 401/403/200/400/disabled-404 evidence pass;
  the container was removed. Nothing was enabled or deployed.
- Next: GROWTH-08 in the existing operator Usage shell.
## 2026-11-04 - GROWTH-08 existing-shell dashboard (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/GROWTH-001`; based on GROWTH-07 SHA
`d606eb60a5e6ed9282b8488c4329d007f6b31f4c`.

- Added a server-driven five-tab Growth panel to the existing Cost/Usage shell, with typed KPI
  states, lazy details, responsive cards/tables and no client-side recalculation.
- Typecheck, production build, state tests and 375px Chromium focus/overflow/axe proof pass. The
  pre-existing large Cost Dashboard file is smaller after helper extraction.
- Nothing was enabled or deployed. Next: GROWTH-09 revisioned targets, diagnostics and export UI.

## 2026-11-04 - GROWTH-09 targets, diagnostics and audited export (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/GROWTH-001`; based on GROWTH-08 SHA
`7670b0b07bfd72118f3da3423e25588d41572658`.

- Added append-only operator target revisions, server-owned KPI units/directions, maturity
  diagnostics, dedicated Growth admin audit receipts and authenticated formula-safe CSV download.
- The existing operator panel now shows targets without inventing verdicts, flags small samples and
  supports a revision rationale/effective date flow.
- Fresh disposable Postgres real-router proof, migration parity, state tests, 375px Playwright,
  typecheck and the production build pass. Evidence:
  `Documents/verification/growth-09-targets-export-2026-11-04.md`.
- No feature flag was enabled and nothing was deployed. Next: GROWTH-10 clean-SHA disposable
  end-to-end shadow and release controls.

## 2026-11-04 - GROWTH-10 disposable full-stack candidate (Codex, review)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/GROWTH-001`; implementation SHA
`3c8648238e6a9027ae3f4ef794c145b440d849a3`.

- Added the guarded disposable stack, shared synthetic seeder and real-browser Growth journey.
- The clean SHA built the homeserver and production UI, then passed flag-off no-write, access
  isolation, exact funnel/campaign reconciliation, duplicate import, 375px overflow/focus and axe
  checks against a loopback-only tmpfs Postgres database. Cleanup completed.
- Evidence: `Documents/verification/growth-10-full-stack-shadow-2026-11-04.md`.
- No Oracle release or flag change occurred. Hosted false-default/runtime/rollback evidence remains
  a deployment-stage review item. Production stays false-default.
- WED-330 is registered next to reconcile the Wedding fit assessment against current capabilities.

## 2026-11-04 - WED-330 Wedding fit reconciliation (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/WED-330`, based on GROWTH evidence commit `494d9b2`.

- Reconciled both 4 November Wedding research reports against current code. The detailed accepted,
  already-present and deliberately-unclaimed matrix is in
  `Documents/verification/wed-330-fit-assessment-reconciliation-2026-11-04.md`.
- Removed the unsupported pricing popularity badge and undefined monthly draft limit. Replaced
  Sydney-only coverage copy with truthful NSW-first wording and suitability caveats.
- Added an explicitly fictional, original replanning example that connects guest-count, minimum
  spend, deposit evidence, tasks and approval-gated outreach without posing as a customer result.
- The public workspace preview now exposes the existing guest/RSVP/seating projection and the
  feature grid exposes existing scoped collaborators. NOIM copy is qualified as reminders rather
  than legal lodgement.
- Passed: public-site/CSP/metadata/blog/magnet/countdown checks, 2,183 Wedding tests, typecheck,
  line budgets, production build, and two iPhone-sized Chromium interaction/overflow/axe checks.
  The browser test found and drove an AA contrast correction for warning pills.
- Nothing was deployed. GROWTH-10 remains at review only because hosted flag-off provenance and
  rollback observation are not interchangeable with the completed local disposable proof.
# 2026-11-05 - WED-331 Wedding interaction repairs (Codex, review)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/WED-331`, implementation commit
`d5031bf6578d81b69c4ea2bc0e971326f5ef8167`.

- Fixed the public Australian checklist's rejected result schema. A real 375px Chromium journey now
  enters a future date, builds the countdown, reports no page error and keeps the result visible.
- Narrowed the desktop rail and workspace offset, moved upload help below its stable button, removed
  Inspiration as a separate destination, embedded the existing Inspiration/vision projection below
  Plan, and grouped Documents plus operator-only Setup checks under one More control.
- Calendar reconnection now distinguishes missing provider configuration from the existing
  recent-sign-in security gate and offers a fresh sign-in path; the server gate was not weakened.
- Current and next decision tasks request the existing bounded funded research. Loading/failure copy
  no longer presents a generic recommendation as fact. The final-guest-count decision uses
  couple-facing choices, an `approve_act` card, and writes both the scoped AFP approval and task
  completion; Guests reprojects the approved count.
- The couple follow-up surface can issue the existing secure quotation-response capability for an
  active vendor-scoped grant. This lets an unclaimed vendor reply without an OmnyID account while
  retaining expiry, revocation, one-time exchange and tenant/thread isolation.
- The existing public quote-analysis article/tool remains discoverable. Its previously dropped
  false-default compose flag is now passed to the homeserver, but no production activation was made.
- Verification: typecheck and production build pass; public Wedding/CSP/metadata checks pass; both
  line budgets pass; all 2,190 Wedding tests pass; the quote-study consent/signature/report tests
  pass; and the disposable quotation-capability HTTP suite passes both tenant-bound one-time and
  no-secret-logging cases. Nothing has been deployed from this commit yet; production still reports
  WED-329. Next action is an exact-SHA clean release build, hosted dependency check, and either keep
  quote study disabled or prove one synthetic upload/deletion before enabling it.

# 2026-11-05 - WED-331 Oracle release and quote-study S3 regression (Codex, in progress)

- Exact candidate `6a3501364bd8bf5f42b03315a1beafbcb95f99b1` was built from clean detached
  worktree `C:\temp\wt\omnyid-wed331-release-6a35013` and released to Oracle. Hosted
  `SOURCE_COMMIT` and `oracle-runtime-manifest.json` match it. Core services run; backup verification
  and the restore drill passed. A hosted 375px Chromium journey built a future-date Countdown with
  no page error.
- Quote-study dependency checks found mounted OpenRouter and SeaweedFS credentials and reachable
  ClamAV/SeaweedFS services. The first consented fictional quote returned 502 before issuing a
  receipt. Logs identified an AWS SDK panic while constructing the shared S3 client because its
  service config did not set a behaviour version. The feature flag was immediately restored to
  `false`; no study submission or undeleted synthetic object was created.
- `src/daemon_runtime.rs` now selects the current AWS SDK behaviour version. New isolated regression
  `tests/seaweedfs_client_config.rs` constructs the same client and would catch the hosted panic.
  The regression passes, as do all three quote-study consent/type/conservative-report unit tests.
- Next action: create a new candidate commit, repeat the clean exact-SHA build and guarded Oracle
  deployment, then enable the flag only long enough to prove a completed synthetic analysis and
  receipt-authorised deletion. Keep it disabled if that proof does not pass.

# 2026-11-05 - WED-331 quote-study provider contract follow-up (Codex, in progress)

- Exact candidate `39b1ce9c2c5b7d9d8dbb8407df3912a7eecdaba7` passed clean Wedding CI/build,
  the SeaweedFS regression and quote-route tests, then shipped with matching Oracle provenance.
  Backup verification and the full restore drill passed.
- A consented fictional upload then passed ClamAV, private SeaweedFS storage and receipt creation.
  Receipt-authorised deletion succeeded immediately. Model analysis returned unavailable because
  OpenRouter reported that no `openai/gpt-5-mini` endpoint supports every requested parameter.
  The feature was returned to `false` after the synthetic object was deleted.
- OpenRouter's model registry confirms the model supports structured output and
  `max_completion_tokens`, but not `temperature`. The route no longer sends that unsupported field;
  it retains `require_parameters: true` and `data_collection: deny`. A direct hosted request with
  the corrected contract returns 200 with a provider request ID. All four route tests pass.
- Next action: commit the provider-contract correction, repeat the exact-SHA release, and require a
  completed analysis plus successful immediate deletion before leaving the public feature enabled.

# 2026-11-05 - WED-331 completed Oracle release (Codex)

- Application SHA `b27a735f7d7f5e623fd6d72689867b29c49eada9` was built from a clean detached
  checkout and released to Oracle. Hosted `SOURCE_COMMIT` and `oracle-runtime-manifest.json` match.
  All core services run; backup verification, runtime-script integrity and the full restore drill
  pass at 81 percent root use.
- The public Countdown passed a hosted 375px Chromium future-date submission. The quote article
  loaded without browser errors, reported ready and enabled its explicit Analyse action. The
  no-account quotation response portal returns 200.
- Hosted quote analysis is enabled. A consented fictional venue quote passed ClamAV and private
  SeaweedFS storage, returned `completed` with normalized evidence, inclusions, exclusions, missing
  terms, escalation risks, confidence and validity fields, and was then deleted using its private
  receipt credential. The latest database record is `deleted` with its storage key cleared; zero
  non-deleted study rows were created in the proof window.
- Final exact-SHA evidence: typecheck, line budgets, 74-page public metadata/CSP/site checks, all
  2,190 Wedding tests, production UI build, the SeaweedFS construction regression and four
  quote-study route tests pass. This handoff/task update is coordination-only and intentionally does
  not replace the tested production application SHA.

# 2026-11-05 - WED-332 ready for exact-SHA Oracle release (Codex)

- Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
  `agent/codex/WED-332`; production still reports WED-331 application SHA
  `b27a735f7d7f5e623fd6d72689867b29c49eada9` until this candidate is released.
- Funded decision research now has an explicit moving current-and-next window. Assigning an active
  task saves the existing AFP responsibility event, emails its newest task-specific research, and
  adds a recipient-tenant A2UI/AFP handoff when the contact email belongs to another OmnyID account.
  Delivery is rate-limited and idempotent, receipts retain only the email digest, and no Wedding
  workspace access is granted.
- The selected/current planning stage uses the same amber as In progress task rails; future stages
  have close dashed outlines. Seating's Add attending guests action opens and focuses Guest RSVP
  quick actions, including a useful empty-list state.
- Passed: 2,194 Wedding tests, typecheck, focused UI tests, line budgets, production build, three
  focused Rust tests, migration-catalog parity and disposable pgvector migration application. The
  next action is a clean detached exact-SHA build/deploy, hosted provenance/health verification,
  then WED-333 Invite Proposals specification and implementation.

# 2026-11-05 - WED-332 completed Oracle release (Codex)

- Application SHA `bc7ca659fe4421a3d7dd1d8fc65b1d40485eec5d` was built from clean detached
  checkout `C:\temp\wt\omnyid-wed332-release-bc7ca65` and is live on Oracle. `SOURCE_COMMIT` and
  `oracle-runtime-manifest.json` match, and migration 0144 exists in production.
- The first restore preflight found a 300 MB capacity shortfall after the image build. Pruning only
  4.85 GB of unused Docker builder cache reduced root use from 85 to 75 percent. A repeated full
  proof passed backup verification, runtime-script integrity and the isolated restore drill.
- Evidence is in
  `Documents/verification/wed-332-assignment-research-release-2026-11-05.md`. The detached audit's
  remote report and exit marker completed, although its local PowerShell poller had to be stopped;
  investigate that poll-return bug separately. WED-333 can now start from this coordination state.

# 2026-11-05 - WED-333 Invite Proposals first slice live (Codex, in progress)

- Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
  `agent/codex/WED-333`; application SHA
  `8adf56f328d13873a0bfba90bcdab3ecc9ce6aae` is live on Oracle.
- The existing Wedding Home vendor card now switches in place between Find vendors and Invite
  Proposals. Invite Proposals projects a reusable brief from the same ledger, caps the current
  comparison shortlist at five, previews field-level sharing and saves a private AFP/A2UI draft.
  Budget and phone default off; saving is explicitly non-external and cannot set Enquired.
- The supplied guidance was converted to a spec and dependency-ordered task plan under
  `Documents/design/wedding planner/Invite proposals/`. It explicitly reuses search, outreach,
  quote intelligence, Documents, lifecycle, booking and no-account response authorities.
- A clean exact-SHA checkout passed typecheck, six focused tests, both line budgets, all 2,200
  Wedding tests and the production build. Oracle provenance matches, workspace returns HTTP 200,
  backup verification and restore drill pass. Only 7.3 GB of unused builder cache was pruned after
  the first restore preflight found insufficient free space; root use is now 74%.
- Still open: recipient eligibility, conversion to the existing permission-fingerprinted outreach
  flow, partial-batch idempotency, structured vendor responses, comparison/booking closure and the
  allowlisted multi-recipient rollout. These remain false-default; do not infer send authority from
  the now-live private-draft UI.

# 2026-11-05 - WED-334 vendor search and lifecycle repair candidate (Codex, in progress)

- Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
  `agent/codex/WED-334`, based on WED-333 coordination SHA `e17b4a793297a28bdc05bc93a8524bcfb5a40305`.
- Category selection no longer replaces visible search wording. Freeform style and scale descriptors
  such as rustic, country and micro wedding are retained and merged with saved Wedding preferences
  for provider search and evidence-backed ranking.
- A completed comparison suppresses the readiness-only notice and is brought into view. Lifecycle
  rows retain About and Conversation history; the companion surface now uses one vendor photo and
  Message, Quote and Booking tabs, including explicit drafts, original quote links, normalized quote
  analysis, another-received-quote comparison, booking context and terms.
- Passed: typecheck, 23 focused state/source tests, all 2,206 Wedding tests, public Wedding checks,
  both line budgets, and a 320/390/1280 Chromium journey with query-preservation, overflow and axe
  checks. Production build, exact-SHA release and hosted proof are still pending.
- WED-333 should resume from the eventual WED-334 release coordination SHA; do not reintroduce a
  proposal-specific inbox or lifecycle store.

# 2026-11-05 - WED-334 vendor search and lifecycle repair live (Codex, complete)

- Application SHA `04357129a4f407ad9974976f66ff6d0ac33ffd8e` was built from clean detached
  checkout `C:\temp\wt\omnyid-wed334-release-0435712` and released to Oracle. Hosted
  `SOURCE_COMMIT` and `oracle-runtime-manifest.json` match it; the public workspace returned HTTP
  200.
- Exact-SHA evidence passes typecheck, both line budgets, the 74-page public Wedding metadata/CSP
  suite, all 2,206 Wedding tests and the production build. The earlier 320/390/1280 Chromium checks
  cover query preservation, overflow and axe findings.
- The initial post-deploy restore drill lacked 1.58 GiB of headroom after the cold image build. Only
  6.605 GB of unused Docker builder cache was removed; no volumes, backups, running images or
  application data were touched. The repeated full proof passes manifest verification, runtime
  script integrity, backup verification and the isolated restore drill at 75 percent root use.
- Evidence is in
  `Documents/verification/wed-334-vendor-search-lifecycle-release-2026-11-05.md`. Resume WED-333
  from this coordination commit and keep proposal delivery false-default until IP-03/IP-04 are
  complete.

# 2026-11-05 - WED-333 Invite Proposals eligibility slice (Codex, in progress)

- Fast-forwarded `agent/codex/WED-333` through the completed WED-334 release coordination commit.
- The authenticated Wedding vendor-directory response now includes its existing claim status and
  verified agent-link identifier. Verified linked vendors are no longer omitted merely because
  they do not publish a phone number or email address.
- Invite Proposals classifies shortlist recipients as verified OmnyID vendor, verified business
  email, scoped no-account vendor link or ineligible. Inactive, disputed, opted-out,
  category-mismatched, explicitly interstate and no-channel records are disabled with a
  couple-facing reason.
- No external route, approval request or send was added. IP-03 still needs the server-side recheck
  and per-wedding/vendor/destination rate limits; IP-04 remains blocked on that work.
- Passed: 10 focused state/UI tests, typecheck, both line budgets, all 2,210 Wedding tests and two
  focused Rust directory tests. The first shared-target Rust compile took 16m47s; later focused
  tests reused it and completed in seconds.

# 2026-11-05 - WED-333 approval pilot and WED-335 Wedding blog candidate (Codex)

- Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
  `agent/codex/WED-333`. The final SHA will be recorded after the two commits.
- Invite Proposals now has server-side tenant and eligibility rechecks, quota-free preview,
  bounded approval-time rate limits, an exact-content batch fingerprint, stable per-vendor
  Message-IDs, sent-mail reconciliation and idempotent partial retry. Accepted sends reuse the
  existing AFP outreach, Enquired and follow-up projections; delivery remains false-default and
  allowlisted.
- The Wedding blog index reveals cards on first load. The new Australian wedding-songs article is
  catalogued, filtered, cross-linked and in the sitemap with inspected image descriptions and
  full-width readable article content.
- Passed before commit: Invite Proposals Rust unit/API integration and frontend tests, typecheck,
  all 2,212 Wedding tests, production build and line budgets; Wedding website, catalogue, metadata
  and CSP tests; and a 390x844 Chromium index/filter/article/overflow check.

# 2026-11-05 - WED-333 / WED-335 Oracle release complete (Codex)

- Application SHA `223951015609f9f41ec100f8b9538dfaf002f136` was tested and deployed from
  clean detached checkout `C:\temp\wt\omnyid-wed333-release-2239510`.
- Oracle `SOURCE_COMMIT` and `oracle-runtime-manifest.json` match. Migration 0145 exists and the
  public blog index and wedding-songs article both return HTTP 200 through Cloudflare.
- The cold build cache left insufficient restore headroom. Only 4.944 GB of unused Docker builder
  cache was removed, returning root use to 79 percent; no images, volumes, backups or application
  data were removed. The repeated synchronous proof passed backup verification and the isolated
  restore drill.
- Evidence: `Documents/verification/wed-333-wed-335-release-2026-11-05.md`. Invite Proposals stays
  false-default and allowlisted; do not treat this pilot implementation as general availability.

# 2026-11-05 - WED-336 persona, Wedding subtasks and weekly report candidate (Codex, review)

- Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
  `agent/codex/WED-336`, based on `7aa9727ca733ae705cd42fd828de267485d4ed5a`.
- Users can minimise Sprout and restore it in mobile-friendly Agent Settings. Persona images are
  cropped client-side and revalidated server-side with account-scoped persistence.
- Expanded Wedding tasks expose deterministic or user-added child tasks. Children retain owner,
  consult, due-date, completion, explicit research and removal actions while remaining excluded
  from the top-level queue and automatic funded research. The duplicate officiant catalogue entry
  is removed; the authorised celebrant and NOIM tasks remain.
- A false-default Monday report sends the prior Sydney week's aggregate registration, activation,
  engagement, public performance/interruption, Oracle disk and credential-expiry metadata to the
  fixed operator address. Its database receipt makes provider attempts idempotent across replicas.
- Passed on the working source: 2,214 Wedding tests, focused UI/state tests, public Wedding checks,
  typecheck, both line budgets, production build, cargo check, focused Rust tests, migration-catalog
  parity and an authenticated disposable-pgvector API test that proved migration 0146's two tables
  and persona image column. Next: commit, rebuild from a clean exact-SHA checkout, deploy, confirm
  runtime provenance/migration and distinguish provider acceptance from inbox delivery.

# 2026-11-05 - WED-336 Oracle release complete (Codex)

- Application SHA `81b99015fa94712a85d3c2c8d0e9c4ea7b2cb06e` was deployed from clean
  checkout `C:\temp\wt\omnyid-wed336-release-81b9901`; hosted `SOURCE_COMMIT` and
  `oracle-runtime-manifest.json` match.
- Migration 0146 is present. Sprout visibility, bounded persona images, parent-linked Wedding
  subtasks, explicit-only child research and the celebrant-only catalogue are live.
- The initial weekly attempt exposed a Compose contract gap and an expired Google OAuth/SMTP
  fallback. The final candidate passes the reviewed Cloudflare transactional account and
  file-backed token into the homeserver. The retried 2 November report has exactly one `accepted`
  receipt for `concensure@gmail.com`; this proves provider acceptance, not inbox reading.
- Exact-SHA production proof passes backup verification and the isolated restore drill. The cold
  build first raised root use to 91 percent; only unused builder cache and five explicit old `/tmp`
  release artifacts were removed. No volumes, backups, images in use or application data were
  deleted. Final root use is 82 percent with 8.2 GB available.
- Evidence: `Documents/verification/wed-336-persona-subtasks-weekly-report-release-2026-11-05.md`.
  Credential-expiry dates remain blank until verified provider dates are available.

# 2026-11-05 - WED-338 category proposal opportunity candidate (Codex)

- Worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`; branch:
  `agent/codex/WED-338`; clean released coordination base:
  `f058e6fdbf41d2520471b06b0d3b123c97f81bd9`.
- Invite Proposals now projects the canonical wedding date, newest relevant location/guest facts and
  category allocation, edits each through its existing authority, and uses the full mobile width.
  The recipient picker is replaced by a category opportunity and Proposals follows Enquired in the
  Wedding vendor lifecycle filters.
- Verified claimed vendors see only category/service-area matches. Unclaimed vendors can use a
  digest-only, expiring, revocable, non-indexable capability. Responses create one tenant-private
  AFP Documents artifact; replay creates no duplicate. Publish/close lifecycle is also recorded in
  private AFP while migration 0148 provides routing and privacy-bounded aggregate metrics.
- Passed before commit: typecheck; production build; 2,217 Wedding tests; both line budgets; cargo
  check; two focused Rust unit tests; migration-catalog parity; and a fresh disposable-pgvector API
  proof covering cross-tenant denial, token hashing, noindex headers, replay suppression, private AFP
  response/lifecycle events, aggregate admin metrics and revocation.
- Remaining action: commit, rebuild from a clean exact-SHA release checkout, deploy migration 0148
  and application to Oracle, then verify runtime provenance, health, UI assets, route headers and
  current backup/restore evidence. Keep the existing Invite Proposals rollout flag and account
  allowlist; this change does not authorize general availability or unsolicited vendor email.

# 2026-11-06 - WED-338 category proposal opportunities live (Codex, complete)

- Application SHA `50837982047f4b197c31928fca5538c29517c79a` was tested from clean
  checkout `C:\temp\wt\omnyid-wed338-release-5083798` and released to Oracle.
  Hosted `SOURCE_COMMIT` and `oracle-runtime-manifest.json` match; migration 0148 is applied.
- Date, location, guests and category budget now use canonical editable Wedding projections. The
  recipient picker is replaced by a category opportunity; `Proposals` follows `Enquired`; eligible
  claimed vendors and secure no-account capabilities feed one tenant-private AFP response flow.
- The final release also forwards the false-default rollout controls through Compose and proxies all
  four proposal route families through Caddy. Hosted unauthenticated couple/vendor/admin checks
  return 401 and a malformed capability returns 404. Production is limited to three known
  operator/test accounts, not general availability.
- Exact candidate checks pass typecheck, both line budgets, 2,219 Wedding tests, public-site checks
  and the production build. Unchanged Rust source passes cargo check, focused route/migration tests
  and disposable-pgvector tenant/token/replay/revocation/AFP proof.
- ClamAV's long-running container had lost `clamd` while retaining `freshclam`; restarting only that
  container restored healthy scanning. Cold builds consumed restore headroom, so only unused Docker
  builder cache was pruned. Final backup verification and isolated restore pass at 79 percent root
  use. Evidence: `Documents/verification/wed-338-invite-proposal-opportunities-release-2026-11-06.md`.

# 2026-11-06 - WED-339 mobile decisions and unconventional venues candidate (Codex)

- Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
  `agent/codex/WED-339`, based on `a4e1ed9ad7d343d0341c7edd73c938a3953298c7`.
- Mobile Today now gives its decision deck the available viewport above the shorter safe-area nav.
  Gesture guidance appears above the first card only, mobile omits the desktop Decision focus title,
  and a previous Today scroll cannot leave the focused deck off-screen.
- The current and immediate-next decisions alone receive funded research. Supplier decisions reuse
  the existing live search and Ranking Policy V2 to prepare exactly three options. A downward swipe
  saves the present top option as preferred without sending an enquiry; if evidence is still loading,
  it opens the in-place shortlist instead of approving a generic fallback.
- Added reproducible WeddingNSW and Wedlockers/Urban List prerequisites plus the cumulative
  unconventional-venue import: 57 new rows and 20 non-overwriting enrichments. A disposable database
  accepted the ordered load twice and produced boat 13, warehouse 12, museum 8, gallery 5, library 2,
  entertainment 15, botanical 15 and zoo/aquarium 8. WILD LIFE Sydney Zoo's wedding offer was
  rechecked against its current official page; unpublished capacity and pricing remain caveated.
- Working-source checks pass: typecheck, public Wedding checks, both line budgets, all 2,222 Wedding
  tests, the production UI build, the focused source checks, the 375 x 812 Chromium vertical-swipe
  journey and all 70 focused Rust vendor-search tests against `C:\cargo-target`.
- Candidate `10dd2b25c4d4e991fbdbfa4592eab14a4229b6b7` reached Oracle and passed hosted runtime,
  backup verification and isolated restore after pruning only unused builder cache. WeddingNSW
  committed. The following Wedlockers transaction safely rolled back when a generated ID collided
  with an existing canonical slug owner (`The Rise Canoe Grounds`). The operator SQL now maps such
  evidence to the canonical row and skips only genuinely absent enrichment targets. A disposable
  database accepted the corrected prerequisite twice with one canonical venue and two attached
  attributes. Freeze a replacement candidate, repeat exact-SHA build/deploy evidence, then apply the
  three ordered data loads and verify production category counts before marking WED-339 complete.
- Replacement application SHA `13387ff029dd044e26a463975c3fcc2ac35f882a` is live with matching
  `SOURCE_COMMIT`; hosted runtime, backup verification and isolated restore pass. The ordered loads and
  a second unconventional replay completed, producing 57 new rows and the reviewed WILD LIFE evidence.
  Hosted counts revealed six tag-only enrichments still used staged IDs rather than canonical slug owners.
  `build_sql.py` and its generated cumulative SQL now resolve canonical ID first and stable slug second.
  A disposable database with alternate staged IDs produces the exact expected eight category totals after
  two replays. Freeze one final candidate containing that generator fix, deploy it, replay only the
  cumulative unconventional SQL, verify hosted exact counts, and remove the release-specific SQL stage.

## 2026-11-06 - WED-339 completed and released (Codex)

- Final application SHA `6a6dc45def278938a06fcbb85574d255a1bb3877` was built from clean detached
  checkout `C:\temp\wt\omnyid-wed339-release-6a6dc45` and deployed to Oracle.
  `SOURCE_COMMIT` and `oracle-runtime-manifest.json` both match the full SHA.
- Exact candidate passed typecheck, both source-size budgets, public Wedding/security checks, all 2,222
  Wedding tests and the production UI build. The focused mobile journey and 70 focused Rust search tests
  passed on the feature candidate; subsequent commits changed only import resolution and generated SQL.
- Authenticated hosted runtime proof, backup verification and isolated restore all pass. Only unused Docker
  builder cache was pruned after the release (4.8 GB); root use is 82% with 8.0 GB free.
- The cumulative unconventional import was replayed twice on production after the ordered prerequisites.
  It is idempotent, contains 57 new rows and yields exact counts: boat 13, botanical 15, entertainment 15,
  gallery 5, library 2, museum 8, warehouse 12 and zoo/aquarium 8.
- WILD LIFE Sydney Zoo carries current official wedding evidence and remains marked verify-before-booking
  for price, availability and current capacity. Release-specific SQL stages were removed.
- Evidence: `Documents/verification/wed-339-mobile-decisions-unconventional-venues-release-2026-11-06.md`.
  Remaining product/data-hardening opportunities are in
  `Documents/issues/wedding planner/2026-11-06-wedding-planner-strengthening-report.md`.
# 2026-11-06 - WED-340 limited-date specials Phase 1 start (Codex)

- Continued from clean WED-339 coordination commit `5af62704d32fce647b5c552b1fe509ca20b692c5`
  in `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch `agent/codex/WED-340`.
- Added the requested reuse-first spec and dependency-ordered task plan under
  `Documents/design/wedding planner/firsttable experience for vendors.md/`.
- Existing authorities to reuse are documented: vendor directory/photos/rooms/coordinates, couple
  availability evidence, Ranking Policy V2, secure proposal/quotation capabilities, masked enquiry
  delivery, referral links, AFP lifecycle and Leaflet/OSM rendering.
- Added false-default migration `0149_wedding_vendor_limited_specials`: scoped offers and slots,
  ciphertext-only private pricing, digest-only grants/sessions, idempotent enquiry links and
  content-light events. Applying it creates no live offer.
- Added pure `wedding_vendor_special_offer` policy for approved effective pricing, unknown mandatory
  costs, substantiated savings, top-three-only detail projection, fresh/stale discovery, enquiry vs
  hold semantics, hold expiry, reconfirmation and optimistic revision checks.
- Verification: six focused Rust policy tests pass; embedded migration catalogue parity passes; the
  initial policy source is 584 lines. Disposable PostgreSQL execution is not yet evidence because Docker Desktop reported it
  could not start and remained unavailable after one hidden 60-second start attempt.
- No release, production migration, vendor publication or external send occurred. Next action: restore
  Docker, run migration 0149 twice with constraint assertions, then implement verified-vendor commands.

# 2026-11-07 - WED-340 verified-vendor command slice (Codex)

- Continued from clean feature commit `705f057d73196c620dfbae31f6972f1391f6bd77` in
  `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001` on `agent/codex/WED-340`.
- Migration 0149 now stores a bounded idempotency key and date-specific maximum capacity, minimum
  spend, indicative per-head price, inclusions and public conditions. Offer values remain defaults.
- Added a false-default, account-allowlisted route module that reuses verified listing ownership for
  list/create/publish/pause/withdraw/reconfirm and slot hold/booked/pause/withdraw/reconfirm commands.
  All writes use vendor scoping, expected revisions, idempotency and content-light versioned events.
- Vendor preview accepts a guest count and returns the approved indicative total and capacity fit.
  Pricing never consumes the couple's budget. Exact couple-facing date details remain top-three gated.
- Pausing preserves active holds; withdrawal refuses an active hold; enquiry is still not a hold.
- Verification: 13 focused Rust policy/route tests, `cargo check --lib` and embedded migration-catalog
  parity pass. New source files remain below 1,000 lines; the policy is 698 lines. `git diff --check` passes.
  Docker Desktop still cannot start, so migration replay and swapped-vendor API proof are not
  claimed. No deployment, production migration, active offer or external send occurred.
- Next: replay migration 0149 twice in disposable PostgreSQL, add cross-vendor route tests, then build
  the expiring management capability and couple top-three discovery projection.

# 2026-11-07 - WED-340 secure management-link slice (Codex)

- Continued from clean feature commit `5c2bad754a224891ae8e33f040cef9d51b1fb262` in
  `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001` on `agent/codex/WED-340`.
- Extracted publish, offer-state and slot-state mutations into shared services.
  Claimed vendors and management capabilities now use one state machine,
  optimistic revisions, idempotency and content-light event records.
- Added verified-owner/operator link issue, rotation and revocation plus public
  exchange/read/command routes. Secrets have 256 bits of entropy, live only in
  the URL fragment and one response, and are stored as HMAC-SHA-256 digests.
  Exchange is one-time and creates a 30-minute HttpOnly/Strict cookie with a
  separate CSRF token. Scope is derived from the grant, never the request.
- Added a mobile vendor management projection for the single bound offer and
  its date-specific capacity, minimum spend, per-head guidance, inclusions and
  explicit publish/pause/reconfirm/withdraw/booked actions. It grants no account
  access and clears the fragment after exchange.
- Passed 20 focused Rust tests, all 2,224 Wedding tests, two focused frontend
  contract tests, TypeScript typecheck, both line budgets, the production UI
  build, `cargo check --lib`, migration-catalog parity and `git diff --check`.
  The first final `cargo check` invocation hit a Windows rustc access violation
  with no source diagnostic; the exact immediate retry passed. Docker Desktop
  remains unavailable, so real
  disposable-Postgres replay, concurrent exchange and swapped-vendor HTTP proof
  are not claimed. Nothing was deployed or enabled.
- Next: restore Docker for the missing adversarial database proof, then add the
  Ranking Policy V2 top-three discovery projection and Limited Specials map.

# 2026-11-07 - WED-340 safe search-evidence slice (Codex)

- Continued from clean commit `2c7174d14b10895184d55addfdae1af12722616d`
  in `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001` on
  `agent/codex/WED-340`.
- Extended the existing vendor-search request with an exact selected date and
  parsed guest count. The server checks active, approved, fresh slots and hard
  guest/capacity limits, then attaches only a generic vendor-confirmed opening
  to matching directory sources behind a separate false-default allowlist.
- Ranking Policy V2 treats that signal as actionable availability and gives a
  user-facing reason. No offer/slot ID, package title, price, inclusion,
  condition or wider calendar is serialized before top-three selection.
- Passed all 2,225 Wedding tests, TypeScript typecheck, both line budgets,
  production UI build, `cargo check --lib` and `git diff --check`.
- The focused Rust unit-test command was stopped after prolonged Windows code
  generation exceeded 6 GB; the production module passes cargo check, while
  its two new pure tests are authored but not claimed executed. Docker-backed
  query execution is still open.
- Next: build an authenticated private/no-store discovery projection that
  invokes canonical server ranking and returns exact effective price and terms
  for only its current top three; then add the accessible Limited Specials
  list/map surface.

# 2026-11-07 - WED-340 exact-date Limited Specials map slice (Codex)

- Continued in `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001` on
  `agent/codex/WED-340` from clean commit
  `a634710d6e8eac94f3fe6f3ce632b38b33d05e17`.
- Added the third `Limited Specials` vendor mode. Date and category filters use
  the canonical wedding date as a non-mutating default; geolocation is only
  requested after an explicit action and otherwise remains centred on Sydney.
- The authenticated, rate-limited, private/no-store endpoint returns at most 48
  exact-date markers. Only coordinate-backed vendors and licence-receipted live
  owner photos qualify. Offer/slot IDs, price, inclusions, conditions and wider
  date inventory are absent.
- Pointer hover/focus shows the complete venue name without clipping. Selecting
  a marker or accessible list item opens one card below the map with photo,
  description, tags, aggregate review evidence, freshness, a wedding-month
  calendar marking only the searched date, and an Enquire action that reuses
  the existing vendor search/outreach flow.
- Added the pinned Leaflet 1.9.4 runtime. Passed focused UI contracts, all 2,227
  Wedding tests, TypeScript typecheck, both line budgets, production build,
  `cargo check --lib` using `C:\cargo-target`, and `git diff --check`.
- Still open: server-authoritative top-three exact commercial detail/price,
  map clustering, disposable-Postgres query execution, cross-tenant HTTP proof
  and hosted rollout. Nothing was deployed or enabled.

# 2026-11-07 - WED-340 bounded map feasibility and clustering slice (Codex)

- Continued from clean commit `961b5d39ae7974c4243b39052e81118fb2afd031`
  in `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001` on
  `agent/codex/WED-340`.
- Limited Specials now sends location, radius and canonical guest count to the
  authenticated discovery route. The server validates coordinate pairs,
  bounds radius and guest values, excludes hard capacity failures and applies
  the distance filter before returning markers.
- The server returns only a rounded approximate distance. The map adds
  zoom-aware count clusters while preserving circular photo markers, complete
  individual venue names, keyboard list selection and the existing detail
  card. Cluster state is presentation-only and does not broaden disclosure.
- Passed all 2,227 Wedding tests, focused Limited Specials contracts,
  TypeScript typecheck, both line budgets, production build, `cargo check
  --lib` with `C:\cargo-target`, and `git diff --check`.
- Docker Desktop reports that it cannot start, so disposable-Postgres query
  execution and adversarial cross-tenant HTTP evidence remain unclaimed.
  Server-authoritative top-three commercial detail and hosted false-default
  rollout also remain open. Nothing was deployed or enabled.

# 2026-11-07 - WED-340 server-ranked top-three commercial reveal (Codex)

- Continued from clean commit `8d703c3811a847e4ca4b86a3cdc95450e3b79048`
  in `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001` on
  `agent/codex/WED-340`.
- The authenticated discovery endpoint now accepts its privacy-sensitive
  filters in a JSON POST body. It computes approved exact-date price guidance
  internally and runs a bounded Policy V2 stage over availability, distance,
  category-budget fit, preference facets and review evidence.
- Unknown dimensions use a neutral prior. Only three server-selected vendors
  receive package summary, date-specific capacity, minimum spend, per-head
  guidance, indicative total, inclusions, exclusions, conditions and
  couple-facing rank reasons. Marker rows and all other candidates still omit
  commercial terms and all output omits offer/slot identifiers.
- The selected venue card shows the exact guidance only for a current top-three
  result, explains unknown mandatory costs and otherwise states that full terms
  remain gated. Price derives only from vendor-approved terms, never the
  couple's budget.
- Passed five focused Rust rank/privacy tests after one Windows rustc access-
  violation retry, focused frontend contracts, TypeScript typecheck, all 2,227
  Wedding tests, both line budgets, production build, `cargo check --lib` with
  `C:\cargo-target`, and `git diff --check`.
- Docker Desktop remains unavailable, so disposable-Postgres SQL execution and
  adversarial cross-tenant HTTP proof are not claimed. Enquiry revalidation,
  slot-envelope linkage, lifecycle automation, portal/admin UI and hosted
  false-default rollout remain open. Nothing was deployed or enabled.

# 2026-11-08 - WED-340/WED-341 release candidate (Codex)

- Continued in `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001` on
  `agent/codex/WED-340` from `f39e43d43d0ebc6c91d5beb08a10839572baec3d`.
- Completed the false-default Limited Specials implementation: shared claimed
  and link-vendor mutations, date terms and holds, bounded maintenance,
  server-ranked top-three commercial reveal, pre-send revision recheck,
  existing enquiry/AFP-thread reuse, outcome projection, and aggregate-only
  operator metrics. No public cohort is enabled merely by deploying it.
- Added the reviewed 35-florist import, guarded the existing Best Buds category
  move to `Florist`, and committed the modular vendor crawler with safety and
  provenance instructions. The cumulative SQL passed two disposable pgvector
  replays without overwriting operator or vendor-reply evidence.
- Extended the existing expiring household RSVP capability to optionally ask
  each named guest for essential contact details. The couple can open a native
  reviewed email draft to the saved guest address. The public capability never
  returns that saved email or phone; guest-entered bounded values append to the
  same tenant AFP guest-profile projection.
- Passed TypeScript typecheck, both line budgets, public Wedding smoke checks,
  all 2,230 Wedding tests, production UI build, `cargo check --lib`, 28 focused
  Limited Specials Rust tests, and three independent disposable-pgvector RSVP
  isolation/replay/concurrency proofs. Exact clean-SHA release, production
  florist load, Oracle provenance and hosted false-default smoke are next.

# 2026-11-08 - WED-340/WED-341 released false-default (Codex)

- Application SHA `77c1b05e059d0a0113e7a6c7d1f83dadd63ec48d` was built and tested from clean
  detached checkout `C:\temp\wt\omnyid-wed340-release-77c1b05`, then deployed to
  Oracle. `SOURCE_COMMIT` and `oracle-runtime-manifest.json` match the full SHA.
- Production schema contains migrations 0150/0151. Hosted smoke confirms both
  Limited Specials flags are false, both allowlists are empty, there are zero
  offers and anonymous discovery is refused with an empty 404. No cohort or
  vendor offer was activated by the release.
- Production contains exactly 35 reviewed florist imports and 151 source
  attributes. The corrected cumulative SQL was replayed twice. Best Buds lives
  in `wedding_vendor_seed_details`, where its guarded category is now `Florist`;
  the generator and future operator SQL target that canonical authority.
- Canonical production proof passed manifest and script integrity, backup
  verification and an isolated restore drill. The prior detached Windows
  poller failed to consume a successful completion marker, so the proof was
  repeated synchronously and emitted canonical JSON/Markdown evidence.
- Before the proof, `/var/backups/omnyid` held 28 complete generations (19 GB).
  Every deletion target was resolved beneath that exact directory; the three
  newest generations were retained and 25 older generations removed. Root
  disk use fell to 48% with about 24 GB free. No volume or running image was
  removed.
- A required Limited Specials capability pepper was generated only on Oracle
  in a root-owned 0600 file and was not printed or copied locally. ClamAV was
  restarted after its pre-existing unhealthy socket state and is healthy.
- WED-340/WED-341 autonomous implementation is complete. Keep the rollout
  false-default until a real participating-vendor pilot plus feature-specific
  security/privacy/accessibility, legal-copy and vendor/couple acceptance are
  recorded; those are activation gates, not code-release blockers.
# 2026-11-08 - WED-342 Limited Specials reliability release candidate (Codex)

- Continued from clean `67dfa78f09d61848bb1081c653365b2aafcf0b7b` in
  `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001` on `agent/codex/WED-340`.
- Reduced the mobile Wedding tab bar while retaining 44px targets. Vendor decisions now queue rather
  than drop overlapping current/next searches, use the canonical category parser, and keep the card
  in a truthful loading or failed state until the correlated Ranking Policy V2 result is projected.
- Reconciled the 2026-11-08 Limited Specials audit. Major fixes cover production routing, reusable
  bounded staff links, map/rank/calendar accuracy, expiry warnings, safe edits and reconfirmation,
  reason-audited reopening of cancelled bookings, unknown mandatory costs, date-specific approved
  enquiries and transient idempotent linkage retry. Deliberate security/product boundaries are
  recorded in `Documents/verification/WED-342-limited-specials-audit-disposition-2026-11-08.md`.
- Passed: 40 focused frontend tests, 28 focused Rust tests, `cargo check --lib`, typecheck, both line
  budgets, all 2,231 Wedding tests, the production UI build, Caddy validation and the real Chromium
  mobile swipe journey. The first browser attempt was infrastructure-only (missing updated Chromium);
  after installing the matching Playwright browser, the journey passed.
- No production flag or allowlist was enabled. Next: commit, build/deploy from a clean exact-SHA
  release checkout, verify Oracle provenance and health, then record hosted false-default Growth and
  Limited Specials evidence.
## 2026-11-08 - WED-343 evidence-first specials and quote comparison (Codex, complete)

- Continued in `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001` on
  `agent/codex/WED-343` from deployed SHA
  `e8a1057593cfccd26798ea1769b3caca7e0d68a5`.
- Replaced the dense selected Limited Special detail with a reusable card that
  shows one representative photo, vendor and locality, capacity/service
  coverage, price basis and certainty, dated availability source/freshness,
  one factual couple-fit reason, explicit unknowns, and clear View details,
  Save and Prepare enquiry actions.
- Availability labels distinguish calendar-open evidence, event-specific
  vendor confirmation, temporary hold and confirmed booking. The public
  discovery result remains calendar evidence only; no hold or booking is
  inferred.
- Added AFP-backed shared-shortlist reactions: interested, favourite,
  concerned with a bounded reason, and need more information. Favourites reuse
  the existing lifecycle filter instead of a parallel list.
- The existing vendor Quote tab now renders normalized quote intelligence and
  a removable comparison of up to three received quotes. Meaningful
  differences are highlighted, unknowns remain explicit, and extracted price
  and inclusion cells open the canonical source artifact for checking or
  correction.
- Passed TypeScript typecheck, 23 focused tests, both line budgets, all 2,234
  Wedding tests, production UI build and `git diff --check`. No rollout flag,
  allowlist or production data was changed.
## 2026-11-08 - WED-344 vendor adoption, availability evidence and RSVP Loom (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/WED-344`, based on clean WED-343 SHA
`ede9be0c9308e18d793b5534b6e0d106889efa45`.

- The operator Limited Specials dashboard now shows recent claim status/date,
  generated links, unique exchanged-link visits and new-account signups
  attributed per vendor. Operators can select a vendor with an existing
  availability offer and generate its private link plus a browser-local QR.
- Vendor link and portal controls use one state machine for calendar open,
  direct vendor confirmation, 48-hour hold and confirmed booking. Search
  evidence and couple labels preserve the distinction; older issued links keep
  their legacy confirm action.
- Protected RSVP links accept an optional validated Loom greeting, expose it
  safely to that household, include it in the couple's reviewed email draft,
  and suggest earlier owner-scoped Loom links. Mobile vendor categories now
  start with Venue, Photographer and `See all`.
- Added migration 0152 and focused static contracts. Tests passed: `cargo
  check --lib`; 28 Limited Specials Rust tests; seven RSVP capability Rust
  tests; migration-catalog test; TypeScript; production Vite build; 2,238
  Wedding tests; seven focused UI contracts; two line-budget tests. One first
  Rust retry hit a Windows compiler illegal-instruction before tests; a clean
  non-incremental retry passed all 28 tests.
- No deployment was requested in WED-344. Phase 10 still needs a real
  participating-vendor hosted pilot and external acceptance evidence; feature
  flags and allowlists must remain false-default until that authority exists.
## 2026-11-10 - WED-351 quote controls and Limited Specials repair (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/WED-351`; exact deployed application SHA
`4277e50bdfc7775a881439719d7357a133097fac`. Clean release checkout:
`C:\temp\wt\omnyid-wed351-release-4277e50`.

- Coupled the public quote HTML, CSS, engine and controller with one asset
  version, hid the honeypot in HTML, and repaired analysis, clear, source
  selection, line-item and comparison interactions.
- Missing core prices now remain unknown. Hosted Chromium confirms the page
  does not show A$0 or `undefined`, protects component subtotals, and works at
  mobile and desktop widths.
- Limited Specials now loads OpenStreetMap tiles under a narrow CSP, applies
  filter drafts only on **Update map**, expands all categories, and opens the
  existing reviewed date-enquiry composer and sharing controls in place.
- Exact-SHA `npm run test:wedding:ci` passes all 2,249 tests and the production
  build passes with a 12 GiB Node heap. Local and hosted browser smoke pass.
- Oracle `SOURCE_COMMIT` and runtime manifest match. The pre-existing ClamAV
  scanning daemon was unhealthy while its updater remained alive; restarting
  only that stateless scanner restored healthy status before Caddy/homeserver
  start. Final production and backup proof passes (restore drill skipped), at
  81% root/var use. Evidence:
  `Documents/verification/wed-351-quote-specials-repair-2026-11-10.md`.
## 2026-11-10 - WED-352 protected vendor proposal feeds and Wedding database projections (Codex, complete)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/WED-352`; exact deployed application SHA
`ce0cada97dd6e2fe4c17da4c6a8ca08947050dc0`. Clean release checkout:
`C:\temp\wt\omnyid-wed352-release-ce0cada`.

- Added operator- and claimant-issued vendor lead feeds for Invite Proposals.
  Links are listing-bound, 256-bit/digest-only, 30-day, rotating, revocable,
  rate-limited and re-authorised on each request. Vendors need no account to
  view matching published briefs or privately return a proposal, suitable date
  or notify-couple request.
- Extended the existing tenant-private response projection rather than adding a
  parallel lead store. Notify requests are explicitly tagged for downstream
  planner handling; available dates remain evidence rather than bookings.
- The operator dashboard now exposes the requested support list of submitted
  intents and their shared email/date/location/guest context, plus vendor link
  generation/revocation. It does not query unrelated private wedding content.
- Database now opens an account-scoped, read-only Wedding plan on Budget and
  projects Budget, Timeline and Seating from the same AFP ledger. Custom
  databases and the run-sheet profile are unchanged.
- Tests passed: Rust check; disposable-Postgres route integration; TypeScript;
  eight focused UI tests; two line-budget tests; 2,252 Wedding tests; and the
  production UI build. The first direct focused Node command omitted the repo's
  alias hook and failed resolution; the standard hooked command passed all
  eight tests.
- The first hosted candidate exposed missing privacy headers on rejected bearer
  errors. That edge was fixed with route-level security middleware and a
  regression assertion, then a new clean exact-SHA candidate was deployed.
- Hosted proof: invalid tokens return 404 with no-store/no-referrer/noindex;
  migration 0154 schema exists; all required services run; `SOURCE_COMMIT` and
  runtime manifest match; backup verification and restore drill pass; root and
  `/var` use are 79%. The first deploy wrapper's detached Windows SSH poll
  remained attached after its remote audit had already passed; the superseding
  release used direct proof and completed normally.
- Evidence:
  `Documents/verification/wed-352-vendor-proposal-feeds-and-wedding-database-2026-11-10.md`.
## 2026-11-10 - WED-353 account-safe Wedding setup and planner usability (Codex, release candidate)

Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
`agent/codex/WED-353`, based on `0c47c9280584dc49ed685b798a71212c131d436b`.

- Wedding setup now opens its date picker twelve months ahead, offers adaptive
  Australian location and budget suggestions, and starts an otherwise unknown
  guest count at 20 with accessible ten-person step controls.
- Authenticated diary state no longer adopts an unscoped browser diary. Private
  rich-text diary notes now persist to the account AFP ledger while retaining
  an account-scoped offline mirror; the existing login boundary continues to
  remove ambiguous Wedding, decisions, contacts, contributor, and persona
  browser state before a newly authenticated account is projected.
- Limited Specials now adopts known date/guest facts reactively, calculates the
  flexible window as wedding date plus 30 days, centres in place with browser
  geolocation, carries the actual vendor photo into the reviewed draft, and
  keeps the selected venue image compact. The redundant primary review action
  is hidden from that already-open review surface.
- Approved directory-vendor enquiries can use the platform sender without a
  personal Gmail connection. The authenticated, rate-limited endpoint permits
  only the active vendor directory address and refuses an edited recipient,
  preserving the existing explicit preview and AFP draft/sent receipts.
- Rich-text alignment controls now use familiar line icons, remain in one
  horizontally scrollable row, and have larger touch targets. Contacts Add
  reveals and scrolls to its existing account-backed form.
- Wedding defaults to a 10% larger scale without overriding S/M/L/XL, with
  normal word wrapping. The session menu shows the sign-in email; only Wedding
  profiles see its upgrade card. `concensure@gmail.com` alone gets the admin
  dashboard rail action and defaults to the consolidated existing Usage/admin
  dashboard after login.
- Verification: TypeScript typecheck passes; focused account, Diary,
  DecisionOS, font, Limited Specials and routing tests pass (42/42); the full
  Wedding state suite passes (2,252/2,252); `cargo check --all-targets` passes;
  all 11 focused vendor-outreach Rust tests pass; and the production Vite build
  passes. Freeze this documentation commit as a new exact-SHA candidate, then
  deploy only from its clean detached release checkout and verify hosted
  provenance and health.
# 2026-11-10 — WED-355 release candidate (Codex)

- Continued from deployed SHA `bf49b6c7aa94a04835e01af783b02aa283380b72` in `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001` on `agent/codex/WED-355`.
- Namespaced Wedding task/budget/date/guest/helper/selection/menu/projection fallback state by authenticated account, preventing shared starter identifiers from carrying progress between couples.
- Added a fail-closed Gmail alpha approval request: signed-in users receive an explanation, the server records the request and notifies `admin@omnyid.com`, and OAuth URL/callback paths require `approved` status.
- Added account-scoped General/Wedding/Study lens switching. Wedding entry defaults to the reduced Wedding lens, keeps breadcrumbs, exposes Wedding destinations plus Calendar/Database/Diary, and lets users opt into non-admin advanced views. Admin remains General with direct Growth/admin and cost actions; vendor entry still uses the dedicated portal.
- Vendor lifecycle chips now hide zero counts; categories are ordered Venue, Planner, Photographer, Celebrant then More; canonical category constraints retain typed prose and musicians map to the directory `band` category; small evidenced categories can show fewer than three cards. Search progress reuses the project robot glyph at text height.
- Verification passed: TypeScript, line budgets, 2,255 Wedding tests, focused Gmail/account tests, Rust `cargo check --all-targets`, and the Gmail route unit test. Docker Desktop was unavailable at its named pipe, so disposable-Postgres execution remains to be repeated from the clean release/Oracle environment before final evidence.

# 2026-11-10 — WED-355 released (Codex)

- Released implementation SHA `69061a7647fd9d252b6d3c60dbb2fb15b201acab` from the clean detached checkout `C:\temp\wt\omnyid-wed355-release-69061a7`.
- Exact-SHA frontend build and Oracle deploy preflight/post-deploy proof passed. Oracle `SOURCE_COMMIT` and `oracle-runtime-manifest.json` both match the implementation SHA.
- Production migration `0156_gmail_alpha_access_requests` is recorded once; the table exists with `owner_user_id` as the account boundary and the expected request/review fields. Unauthenticated approval-request and OAuth URL calls return 401.
- All seven long-running Oracle services reported `running` after deployment. No simulated data was included or inserted.
- Docker Desktop remained unavailable locally. Production table/migration inspection supplied hosted persistence evidence without creating a request; an authenticated UI request remains an optional operator acceptance test because it intentionally sends mail to `admin@omnyid.com`.

# 2026-11-10 — WED-356 released (Codex)

- Worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`; branch:
  `agent/codex/WED-356`. Released implementation SHA:
  `e2a1e816367c02570000ed2eab1445ee1696f805`; clean detached release checkout:
  `C:\temp\wt\omnyid-wed356-release-e2a1e81`.
- Removed the redundant Limited Specials no-match prose and all-category
  action while preserving its reviewed directory enquiry route. Approved
  first-party and proxied directory photos now survive comparison-card
  projection.
- Replaced the text favourite action with an accessible outline/filled heart
  over the vendor image. Non-zero vendor activity filters now sit under a
  distinct My activity label with tinted status indicators and count badges;
  zero-count filters remain hidden.
- Removed decision queue prose and moved Show Me Why to a separate lower-right
  question control. Wedding task assignment no longer refreshes the whole
  workspace.
- Added in-place Budget, Guests and Seating notes to Wedding Overview. They
  persist as account-scoped AFP notes, render immediately in Up Next, and are
  available to the existing Notes projection.
- Audited the vendor management portal task plan. VMP-01 through VMP-06 meet
  the first-release boundary. VMP-07 through VMP-09 remain truthfully deferred
  P1 work: publication revisions, resource/bulk calendar editing, and vendor
  teams/entitlements.
- Verification passed: TypeScript; line budgets; focused card, note, media,
  Limited Specials and portal tests; full Wedding suite (2,262/2,262); clean
  exact-SHA Vite production build; Oracle preflight and post-deploy proof.
  Production `SOURCE_COMMIT` and `oracle-runtime-manifest.json` match the
  released SHA. The workspace and changed hosted assets return 200 and contain
  the expected controls/copy; the removed sentence is absent. Backup verify
  and restore drill passed. No simulated data was included. Root and `/var`
  usage are 80%.
- Evidence: `Documents/verification/wed-356-wedding-card-refinement-2026-11-10.md`
  and `C:\temp\wt\proofs\wed356-e2a1e81\postdeploy`.

# 2026-11-11 — WED-357 release candidate (Codex)

- Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
  `agent/codex/WED-357`, based on deployed evidence SHA
  `ad55eb4a721a9dd4ca3458395a8a36bd853ae8ac`.
- Vendor category chips now use category-specific icons and Musicians uses its
  canonical query. Desktop no longer shows the redundant Wedding Home return.
  Vendor lifecycle booking terms exclude duplicate search/comparison notes;
  rendered research contacts open the recorded website, existing enquiry
  composer, dial target and an in-place OpenStreetMap address surface.
- Decision recommendations use the actual top vendor and comparison context.
  Show Me Why remains lower-right but is smaller and baseline-aligned.
- Date, budget and guest setup are account-derived decisions, with date and
  budget first, and the decision surface is first on Today. The separate setup
  checklist was removed.
- RSVP missing meal/details and changed-response alerts open in place. Seating
  tables move with animation-frame updates; guests render around tables and
  can be dropped between seats or onto another table with snap feedback.
- Vision, Today layout, custom planning items, important details and seating
  helper state now include the active Wedding account namespace. Optional
  Today photo cards are account-scoped, browser-compressed, contain-fit,
  reorderable and resizable. The Wedding upgrade panel is opaque for contrast.
- Verification before freeze: TypeScript passes; line budgets pass; focused
  account, setup, photo, vendor evidence and contact-action tests pass; full
  Wedding suite passes 2,265/2,265. Rust and production build verification must
  run from the clean exact-SHA release checkout after the implementation commit.
- The vendor portal's reviewed first-release authority remains VMP-01 through
  VMP-06. VMP-07 publication revisions, VMP-08 named-resource/bulk calendars
  and VMP-09 teams/entitlements remain explicit P1 work; this candidate does
  not add browser-only controls that falsely imply those server authorities.

# 2026-11-11 — WED-357 Oracle release (Codex)

- Frozen implementation SHA: `2eabb74290945029eded686ccbb950da332b2ea5`.
  The release was built and deployed only from clean detached worktree
  `C:\temp\wt\omnyid-wed357-release-2eabb74`.
- Exact-candidate verification passed: production Vite build, focused Rust
  vendor-directory regression, TypeScript, line budgets, public Wedding site
  and CSP smoke tests, and 2,267/2,267 Wedding tests. The focused regression
  caught and corrected a case-sensitive test expectation before release.
- Oracle preflight and post-deploy proof passed. Production `SOURCE_COMMIT`
  and `oracle-runtime-manifest.json` both contain the full frozen SHA. The
  workspace returns 200, its deployed Wedding workspace chunk returns 200 and
  contains the new account-scoped photo-card and inline OpenStreetMap behavior.
  The runtime CSP permits Nominatim and the OpenStreetMap frame.
- Backup verification and restore drill passed. No simulated data and no local
  environment file were uploaded. Root and `/var` usage were 80% at proof time.
- Evidence: `Documents/verification/wed-357-wedding-vendor-planning-surfaces-2026-11-11.md`
  and `C:\temp\wt\proofs\wed357-2eabb74\postdeploy`.
- The vendor portal first-release scope is live. VMP-07 field-level publication
  revisions, VMP-08 named-resource/bulk calendar editing and VMP-09 vendor
  teams/notification preferences/entitlements remain explicit P1 follow-ons.

# 2026-11-11 — WED-358 release candidate (Codex)

- Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
  `agent/codex/WED-358`, based on deployed evidence SHA
  `863ecc687f30682960c04442c31d65b8718ddb06`.
- VMP-07 now has revisioned draft/accepted vendor publication, field visibility,
  retained public values during description moderation, an operator review
  queue, and accepted-snapshot projections across directory, search, photos and
  Limited Specials.
- VMP-08 extends canonical vendor rooms into named resources and reuses the
  existing offer/slot calendar for bounded date-range edits. Server-side stale
  revision, resource ownership and confirmed-booking guards protect bulk work.
- VMP-09 adds verified-email vendor team membership with scoped server roles,
  mandatory operational notification delivery plus optional preferences, and
  canonical Founding/Pro entitlement guards that preserve vendor data on
  downgrade.
- Audit events are idempotent and content-light. They do not copy descriptions,
  contacts, messages or prices out of canonical stores.
- Verification passes: TypeScript, line budgets, 4/4 focused frontend portal
  tests, 2,268/2,268 Wedding tests, production Vite build, Rust library check
  and 7/7 focused Rust portal tests. Docker was unavailable for disposable
  Postgres, so the additive migration and its tables must be verified during
  the clean exact-SHA Oracle release.
- Evidence: `Documents/verification/wed-358-vendor-management-portal-2026-11-11.md`.

# 2026-11-11 — WED-358 Oracle release (Codex)

- Frozen implementation SHA `51eacb09afbc297080e4aa573dcc0036eb2f9230`
  was built from clean detached checkout
  `C:\temp\wt\omnyid-wed358-release-51eacb0` and is live on Oracle.
- Exact-SHA TypeScript, focused portal tests, Vite production build and Rust
  library check passed locally. The Linux release build passed on Oracle. The
  seven focused Rust portal tests passed locally before freeze; a repeated
  Windows test-binary link hit toolchain `STATUS_ACCESS_VIOLATION`/
  `STATUS_ILLEGAL_INSTRUCTION`, while assertions did not fail.
- The first activation exposed a pre-existing ClamAV daemon failure: its
  signature updater had been OOM-killed while the outer container remained
  unhealthy. ClamAV was restarted to healthy, then the already-built exact-SHA
  services were activated without rebuilding.
- Recovered production proof passed: homeserver running, backup verification
  pass and restore drill pass. `SOURCE_COMMIT` and the runtime manifest match
  the frozen SHA. Migration 0157 is recorded; all four new portal tables and
  five owner-profile publication columns exist. Anonymous portal/admin calls
  are refused and the hosted vendor bundle contains the new controls.
- Evidence: `Documents/verification/wed-358-vendor-management-portal-2026-11-11.md`
  and `C:\temp\wt\proofs\wed358-51eacb0\postdeploy-recovered`.

# 2026-11-11 — WED-359 celebrant consultation implementation (Codex)

- Worktree `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`, branch
  `agent/codex/WED-359`, base SHA
  `90bca017bfee60a183ea6dc04d0e53267b769cef`.
- Added `celebrant-consultations-spec.md` and dependency-ordered tasks from the
  canonical `celebrant.md` brief. The design reuses verified vendor profiles,
  owner photos, portal roles, Wedding-date availability and the existing lead
  authority rather than creating a second vendor CRM/calendar.
- Migration 0158 adds vendor-keyed pilot verification, recurring/exception
  consultation windows, bounded live sessions, provider verification sessions,
  callback/scheduled requests, an active-slot uniqueness guard and content-light
  lifecycle events. Raw phones are encrypted; phone/token lookups use HMAC
  digests; codes are never persisted.
- Backend routes add a false-default public list, Twilio Verify start/check,
  atomic immediate/scheduled requests, status/outcome capabilities, vendor
  settings/windows/live/request commands, and operator register verification.
  Callback numbers are revealed only by the authenticated Accept command.
- Frontend adds a celebrant-only Phone consultations panel inside the existing
  vendor Availability section, and a public `talk-to-a-celebrant.html` page with
  truthful empty/live/next-time states, first-available or selected routing,
  phone verification and outcome reporting. The directory and celebrant decision
  surface link to it.
- Passed: Cargo library check; scoped Rust formatting; Solid TypeScript; Vite
  production build; 3/3 focused celebrant frontend/contract tests; line-budget
  tests; public Wedding website smoke; public JS syntax. The focused Rust test linker twice
  crashed in the Windows toolchain (`STATUS_PRIVILEGED_INSTRUCTION`, then
  `STATUS_ACCESS_VIOLATION`) without an assertion/compiler error. Docker Desktop
  was unreachable, so migration 0158 has not had a disposable-Postgres run.
- Still open by design: extend the existing no-login calendar capability with
  consultation-only scope; automatically retry another live celebrant when a
  first-available request is passed; create a canonical post-call hiring enquiry
  after explicit approval; expose one-off exceptions/rescheduling in UI; run a
  Twilio sandbox and hosted Postgres/concurrency test; operator-review the Sydney
  pilot cohort; keep the rollout flag false until that evidence passes.

# 2026-11-11 — WED-359 reliability hardening (Codex)

- First-available requests now move atomically to another eligible live
  celebrant after a pass or expired acceptance hold; specifically selected
  celebrants are never silently substituted.
- The existing vendor Availability portal now supports one-off open/unavailable
  dates and proposing a new consultation time. The visitor can accept or decline
  that proposal through the original opaque request capability.
- The public directory links celebrant cards to the callback page and the page
  provides explicit post-call Save/Ask next actions without silently converting
  a private consultation into a sales lead.
- Passed locally: TypeScript, production Vite build, Cargo library check, 3/3
  focused celebrant tests, 2/2 line-budget tests, 2,271/2,271 Wedding tests,
  public Wedding smoke, public metadata smoke and public JavaScript syntax.
- Oracle inspection found the encryption-key file authority but no celebrant
  rollout flag/token pepper or Twilio Verify credentials. The exact-SHA release
  can ship dormant code and migration 0158, but the callback flag must remain
  false until controlled provider and connected-call evidence exists.
- Evidence: `Documents/verification/wed-359-celebrant-consultations-2026-11-11.md`.

# 2026-11-11 — WED-359 celebrant profiles and scoped management links (Codex)

- Continued in `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001` on
  `agent/codex/WED-359` from deployed SHA
  `c56d8041990ceaddefd13bab0ba36cd616edf8bb`.
- Used the approved vendor crawler against all 16 imported official URLs. All
  fetched/extracted successfully. Fifteen are genuine celebrant services;
  Enzo Weddings Hunter Valley is corrected to `Venue`. Reviewed evidence and
  own-word profile batches are under the dated celebrant-enrichment folder;
  raw crawler caches are ignored.
- Added migration 0159, integrated directory cards/detail pages, dynamic
  category filtering, truthful consultation states and authorised-photo
  placeholders. No scraped testimonial, price, availability or unlicensed
  image is presented as fact.
- Added admin generation/QR/revocation and a no-login, expiring management
  capability scoped to one celebrant's consultation windows and live state.
  Rotation/revocation consume sessions; callback requests, private phones,
  account access and other vendors are outside the capability.
- Local passes: Cargo library check; scoped management contracts 3/3; existing
  consultation contracts 4/4; Solid TypeScript; Vite production build; line
  budgets 2/2; public Wedding and metadata smoke; public JS syntax. Docker was
  unavailable, so exact-SHA Oracle migration execution is the database proof.
- Next: freeze a commit, verify/build from a clean detached worktree, deploy
  that exact SHA, prove migration/profile/table counts and all 15 hosted profile
  URLs, then record the runtime manifest/SOURCE_COMMIT match.

# 2026-11-11 — WED-359 celebrant directory release evidence (Codex)

- Released implementation SHA
  `1263c8a67c7512864ef20de515cfba857da07cd6` from clean detached checkout
  `C:\temp\wt\omnyid-wed359-release-1263c8a` to Oracle.
- Oracle `SOURCE_COMMIT` and `oracle-runtime-manifest.json` both contain that
  full SHA. The homeserver is running and the hosted directory endpoint returns
  fifteen Celebrant records. The category directory and all fifteen individual
  profile URLs return HTTP 200 with the expected profile content.
- Migration 0159 is recorded. Production contains fifteen Celebrant rows,
  fifteen `celebrant_profile` evidence blocks and fifteen pilot-profile rows;
  all celebrant management grant/session/event tables exist. Enzo Weddings
  Hunter Valley is `Venue`, not misrepresented as a celebrant.
- Anonymous access to the admin management route is refused and an invalid
  public capability exchange is refused. The hosted vendor bundle contains the
  private consultation-availability controls. The capability pepper is
  configured; its value was never printed.
- The first proof attempt found the restore-drill free-space margin about
  78 MB short. Only inactive Docker build cache was pruned (4.824 GB); no
  containers, volumes, current images or user data were removed. Disk use is
  now 75% with roughly 12 GB free.
- A fresh detached Oracle proof job completed with `STATUS=pass`, homeserver and
  backup service running, manifest verification passed, backup verification
  passed, restore drill passed, and `FAILURE_STEP=none`. The local wrapper kept
  polling after the remote job had written exit code 0; that stale local wrapper
  was stopped without touching the completed remote proof or runtime.
- Local verification passed before freeze: Cargo library check; scoped
  management contracts 3/3; consultation contracts 4/4; Solid TypeScript;
  Vite production build; line budgets 2/2; 2,271/2,271 Wedding tests; public
  Wedding and metadata smoke; directory JavaScript syntax. A repeated clean
  Windows test-binary link hit the known MSVC `STATUS_ACCESS_VIOLATION`; the
  same exact implementation tests had already passed in the task worktree and
  the Oracle Linux release build passed.
- WED-359 is left in review because callback activation, controlled Twilio
  evidence, disposable-Postgres concurrency proof and canonical post-call
  enquiry creation remain deliberately gated. The completed directory/profile
  and single-celebrant calendar-authority slice is live.

# 2026-11-11 — WED-359 call and operator-metric hardening (Codex)

- Continued in `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001` on
  `agent/codex/WED-359` from release-evidence SHA
  `7633397008fe34043e79d60be1fce1797538d945`.
- Added one shared phone-target policy in Rust and Solid: Australian national
  mobile and landline numbers become E.164 `tel:+61…` targets while the UI keeps
  readable formatting. Invalid or incomplete local numbers are not guessed.
  Accepted callback numbers use a tap-sized call action and explain that the
  native phone/calling app opens before the person places the call.
- Added operator-only 30-, 90- and 365-day Wedding commercial-funnel evidence:
  distinct activated wedding plans, current/fresh vendor availability,
  availability-maintenance vendor-days, and venue enquiries with delivery or
  acknowledgement evidence. Drafts and provider `accepted` events are excluded;
  no message body, phone, visitor cookie or new user identifier is collected.
- Migration 0160 adds partial/query indexes only. The measures remain projections
  over the existing activation, availability and enquiry authorities.
- Passed locally: Cargo library check; focused Rust contract compilation; Solid
  TypeScript; phone URI tests 2/2; production Vite build; line budgets 2/2.
  Running the Rust test binaries on this Windows host still crashes inside the
  MSVC `rustc` process (`STATUS_ACCESS_VIOLATION`, including while compiling
  `tokio`) without a source diagnostic. Re-run them on Linux in the clean
  exact-SHA release and prove migration 0160 plus hosted E.164 links before
  closing the hardening slice.

# 2026-11-11 — WED-359 call-hardening Oracle release (Codex)

- Released implementation SHA
  `ffa7415279de30549e3f3f0c3c1e6ab94bb0a194` from clean detached checkout
  `C:\temp\wt\omnyid-wed359-release-ffa7415`.
- Oracle `SOURCE_COMMIT` and `oracle-runtime-manifest.json` match that full
  SHA. Migration 0160 is recorded and all five supporting funnel indexes are
  present.
- Every one of the fifteen hosted celebrant detail pages returns HTTP 200 and
  exposes its published Australian phone action as a portable `tel:+61…` URI.
  The visible number remains readable. Malformed/incomplete numbers are not
  guessed by the shared Rust/Solid policy.
- The admin panel now uses canonical, content-free 30/90/365-day projections
  for qualified wedding plans, fresh/maintained availability and venue
  enquiries proven delivered or acknowledged. Drafts and provider acceptance
  do not count. Anonymous access to the admin route is masked with 404.
- Exact-SHA TypeScript, focused phone tests, line budgets, Vite production
  build, Cargo library check and Linux release build passed. Windows Rust test
  execution remains affected by the host MSVC `rustc` access violation; the
  focused test sources compile and no source assertion failed.
- The first post-deploy restore preflight needed 8.0 GB but found 6.6 GB. Only
  inactive Docker builder cache was pruned, recovering about 4.9 GB. No
  volumes, active images, databases or user files were touched. The repeated
  production proof passed backup verification and the isolated restore drill;
  root use is 77% with roughly 11 GB free.
- Proof artefacts:
  `C:\temp\wt\proofs\wed359-ffa7415-postdeploy`. Keep the callback feature
  false-default until controlled Twilio verification, a connected Sydney call,
  canonical post-call enquiry creation and disposable-Postgres concurrency
  evidence are complete. A signed-in admin browser acceptance of the metrics
  panel is also still explicit; no admin credential was copied into automation.

# 2026-11-11 — WED-360 review-system contracts and schema foundation (Codex)

- Implementation commit: `c07c9f098c8cb378caf460a46bdc4f1812c7d738` on
  `agent/codex/WED-360` in `C:\temp\wt\omnyid-wed360`.
- Started `agent/codex/WED-360` in `C:\temp\wt\omnyid-wed360` from
  `48234988561f8b16284e72e65fa65b1ae06f2c8b` so review work consumes the live
  celebrant/vendor lineage without modifying the dirty primary checkout.
- Added an extension-first specification and dependency-ordered task document
  under `Documents/design/wedding planner/review/`. They map authentication,
  wedding identity, vendors, evidence, moderation, publishing, directory,
  DecisionOS, quote/availability and analytics to their existing authorities.
- Added `src/wedding_reviews.rs`: typed review subjects/experiences,
  verification and lifecycle states, truthful aggregate eligibility, sparse
  score policy, half-up one-decimal arithmetic, AFP supertags and content-light
  audit key validation.
- Added migration 0161 for canonical control metadata, AFP revision pointers,
  purgeable evidence references, invitation capabilities, moderation,
  publications, vendor replies and events. Partner submissions deduplicate on
  the canonical wedding/subject tuple rather than owner account.
- Verification: 9/9 review policy unit tests and 4/4 independent migration/
  privacy contract tests pass. The repository-wide `cargo fmt --check` still
  reports extensive pre-existing differences; only new Rust files were
  formatted. Docker Desktop was unavailable, so migration execution against a
  disposable Postgres remains open and no deployment occurred.
- Next: run migration 0161 on disposable Postgres, then implement authenticated
  draft/revision AFP writeback with expected-revision/idempotency receipts and
  cross-partner/cross-tenant tests. Do not surface `Read the couple's story`
  until an actual separately permissioned story exists.
# 2026-11-12 — WED-360 private revision and evidence slice (Codex)

- Continued in `C:\temp\wt\omnyid-wed360` on `agent/codex/WED-360` from
  `766a733f21e4ce8c3159959284133cd97cc4e0b0`.
- Added false-default authenticated draft/submission writeback at
  `/wedding/reviews/revisions`. It reuses onboarding ownership, canonical
  vendors, tenant-private AFP storage, rate limits and relay notifications.
- Added content-light command receipts, expected-revision locking and stable
  AFP message IDs. Duplicate actor/retry keys converge; partner contributions
  lock the same canonical wedding/subject review rather than adding a rating.
- Drafts can remain incomplete. Submission requires the applicable rating and
  audience policy plus meaningful authored text. Enquiry/tour feedback can be
  drafted privately but cannot be submitted as a public pilot review.
- Added `/wedding/reviews/{review_id}/evidence`, which links an author's current
  revision to an existing attachment in that same tenant. The row holds only a
  purgeable reference with the 90-day pilot expiry.
- Verification at exact SHA `b15ada659c152d1b8eeea74634337a8289c6c919` plus
  subsequent draft-policy commits: Cargo library check passed; 15/15 review
  policy/revision tests, 2/2 evidence tests and 8/8 independent contracts pass.
  Docker Desktop remains unavailable, so migration 0161 execution and true
  concurrent HTTP/Postgres proof are still open. No deployment occurred.
- Next: run disposable-Postgres migration/concurrency proof, then add operator
  evidence access/audit and the expiry purge worker before building the couple
  status/history UI. `Read the couple's story` remains explicitly deferred.

# 2026-11-12 — WED-360 author proof deletion boundary (Codex)

- Continued in `C:\temp\wt\omnyid-wed360` on `agent/codex/WED-360` from
  `aa0c8282865ec3b075a076c476bb0da16af76642`.
- Added an authenticated author command that can schedule only evidence linked
  by that author to that review, and only for `author_withdrawal` or
  `privacy_request`. Cross-partner attempts return the same unavailable result
  as a missing reference.
- The command deliberately does not add another evidence reader. It reuses the
  existing purge-scheduled state; the bounded operator executor remains the
  only physical object/attachment deletion path.
- `cargo check --lib` and `cargo check --tests` pass with the shared
  `C:\cargo-target`. The focused Windows Rust test binary again failed inside
  `rustc` with `STATUS_ILLEGAL_INSTRUCTION`, before any test assertion. A
  mistaken attempt to invoke the Rust contract source with Node produced only a
  JavaScript syntax error and is not product evidence.
- Next: prove the new author/partner assertions in the disposable-Postgres
  real-router test on Linux, then implement claim-specific eligibility. The
  review rollout flag remains false and no deployment occurred.
# 2026-11-12 — WED-360 claim-specific review eligibility (Codex)

- Continued in `C:\temp\wt\omnyid-wed360` on `agent/codex/WED-360` from
  `caf454635536a1824e4da5a760dde99f27da1b4c`.
- Added migration 0163 and an operator-only, false-default eligibility command.
  Evidence can be accepted/rejected only after that operator recently opened
  it for `eligibility` or `evidence`; retries converge through a request hash,
  idempotency key and expected verification version.
- The deterministic evaluator truthfully limits signals: canonical run-sheet
  activity can verify planner activity, enquiry/tour evidence cannot verify a
  booking, and a wedding-held claim requires both a wholly past event month
  and accepted post-event delivery proof. Probable duplicates become a private
  `conflicted` assessment and expose no source identifiers publicly.
- Verification: `cargo check --lib` and `cargo check --tests` pass using shared
  `C:\cargo-target`; a small exact-source harness passes 14/14 review-policy
  tests. Migrations 0161–0163 applied to disposable pgvector/PostgreSQL 18 and
  accepted a versioned `verified_wedding_held` transition/event. Full Windows
  unit/integration test linking again fails inside rustc with
  `STATUS_ACCESS_VIOLATION`, before assertions, so the expanded real-router
  eligibility assertion still requires Linux execution.
- Remaining: author status/correction/withdrawal UI and API, moderation and
  publication, vendor reply/reporting, public aggregates, invitations,
  analytics and the false-default hosted rollout. Do not enable or deploy the
  review feature before those gates are complete.

# 2026-11-12 — WED-360 author lifecycle backend (Codex)

- Continued in `C:\temp\wt\omnyid-wed360` from eligibility commit
  `282d33b0ce4f1cbd985ead45fdc07d7ae51f87f7`.
- Added migrations 0164–0165 and false-default authenticated endpoints for an
  author's review list, metadata-only status/history and idempotent withdrawal.
  Access requires both account wedding ownership and authorship/ownership of
  the review; an uninvolved partner gets the same unavailable response as a
  missing review.
- Withdrawal hides the current publication and review in one transaction,
  emits a content-light event/receipt and accelerates only that actor's linked
  proof purge. Corrections create a new private AFP revision, reset current
  verification and use `edit_pending` without overwriting a prior moderated
  public snapshot.
- `cargo check --lib` and `cargo check --tests` pass using `C:\cargo-target`.
  Disposable PostgreSQL 18 applied migrations 0161–0165, exercised the exact
  status aggregate SQL and accepted withdrawal plus edit-pending receipt
  constraints. The 14 exact-source policy tests remain green. Full Windows
  test binary linking still fails inside rustc with the existing access
  violation; run `tests/wedding_review_api.rs` on Linux before release.
- Remaining: author-facing form/status UI, operator moderation/publication,
  vendor reply/report, public aggregates and DecisionOS projection,
  invitations, analytics/accessibility and hosted false-default/pilot proof.
# 2026-11-12 — WED-360 audited moderation and public projection (Codex)

- Continued in `C:\temp\wt\omnyid-wed360` on `agent/codex/WED-360` from
  `a4d9263a60b8210ebc3447ca665faf86a447da67`.
- Added migration 0166, an operator moderation queue, bounded/audited preview,
  reasoned idempotent publish/reject/restrict/restore commands and a narrow DB
  reader for the exact tenant-private AFP revision. The operator cannot alter
  narrative; public snapshots omit account, contact, evidence and private
  duplicate fields.
- Added a rate-limited public vendor-review projection. It reads only current
  publications, keeps booking/resource reviews out of the wedding-held score,
  and derives count and one-decimal half-up average from exactly the same
  eligible rating set. Withdrawal/restriction disappear immediately because
  the projection has no parallel cache.
- Verification: Cargo library and all test targets check; the exact policy
  harness passes 14/14; disposable PostgreSQL 18 accepted migrations 0161–0166
  and a synthetic moderation access/decision/publication/receipt transaction.
  A focused test-binary run again failed inside Windows `rustc` with
  `STATUS_ACCESS_VIOLATION` before assertions; run the expanded real-router
  journey on Linux before release.
- Remaining: author form/status UI; report/appeal intake; vendor attributed
  reply/report; directory/profile/comparison and DecisionOS surfaces;
  invitations; analytics/accessibility; false-default hosted proof. The new
  run-sheet database-view request should consume the existing projection and
  source authorities, not introduce a second schedule ledger.
## 2026-11-12 - WED-360 vendor boundary/public UI and WED-362 living run-sheet preview (Codex, in progress)

Worktree `C:\temp\wt\omnyid-wed360`, branch `agent/codex/WED-360`, based on
implementation commit `a05468de6d3b28db916d23492f866715d765cbc3`.

- Migration 0167 adds content-light vendor report, command-receipt, reply access
  and reply moderation records. Vendor reply/report bodies stay in the acting
  member's private AFP schema. Verified vendor permissions are reused; vendor
  routes cannot update review publications or moderation decisions.
- The operator queue includes open report reasons/counts. Reply publication or
  rejection requires an audited exact-revision preview; resolving a report does
  not itself suppress a review.
- Couples get an authenticated neutral review form with an initially unselected
  rating, separate private/public actions, exact public preview, author-only
  correction loading and immediate withdrawal. Public directory/profile UI
  derives zero/sparse/full states and attributed replies from the canonical
  publication route without changing search order.
- Database now shows a reactive master run-sheet sequence directly above its
  editable grid. It reads the existing source-linked projected rows and focuses
  the canonical record/revision context; it is not another checklist/store.
- Pass: `cargo check --lib`, `git diff --check`, both new public JS syntax
  checks, and a TypeScript diagnostic filtered to the changed review/run-sheet
  files. Full TypeScript remains blocked by pre-existing missing `qrcode` and
  `zod/v3` dependencies plus quotation typing errors. The focused Rust lib-test
  link again ended in the known Windows rustc `STATUS_ACCESS_VIOLATION` before
  assertions. Docker Desktop was unavailable, so migration 0167 still needs
  disposable PostgreSQL execution.
- Still open before release: invitation/reminder capability and suppression,
  author event-history rendering, direct capability-link exchange, author
  appeals, comparison/DecisionOS review evidence, content-free analytics,
  accessibility/browser coverage, Linux real-router tests, hosted false-default
  evidence and pilot approval. Nothing in this slice has been deployed.

## 2026-11-12 - WED-363 celebrant and public Quote Intelligence release (Codex)

- Released implementation SHA
  `46fb900eb4204715f3bb164c4ebe5b4c971571ed` from clean detached checkout
  `C:\temp\wt\omnyid-wed363-release-46fb900`. The dirty QA checkout was used
  only as diagnostic evidence; no old-worktree artifact or wholesale diff was
  merged or built.
- Dashboard reload/export authentication now accepts the canonical cookie or
  bearer session. Officiant aliases resolve to the Celebrant category. Disabled
  vendor consultation/quotation panels settle into bounded unavailable states.
- Claimed listings no longer leak unpublished seeded contact fields. Until the
  real platform enquiry launches, public celebrant profiles clearly say so and
  offer only published direct email and/or portable `tel:+61...` calling.
- The public quote article now uses the canonical source-grounded, no-retention
  Quote Intelligence extractor and hands off to the deterministic comparison
  tool. The OpenRouter-funded runtime is enabled with its existing abuse limits,
  usage ledger and hard USD 50 weekly cap.
- Verification passed: Rust checks; 2,273 Wedding tests; public-site/CSP/
  metadata tests; TypeScript; Vite; both quote Playwright journeys; a real
  hosted extraction with exact evidence and an explicit missing whole-package
  amount; hosted direct-contact behavior; full-SHA provenance; backup verify;
  and isolated restore drill.
- Oracle's existing ClamAV updater had been OOM-killed and left health stale.
  A controlled scanner restart recovered it. Only inactive Docker builder
  cache and dangling images were pruned to make room for the restore drill; no
  volume, database, backup or user file was removed. Final root use is 81%.
- Evidence:
  `Documents/verification/wed-363-celebrant-quote-journey-2026-11-12.md` and
  `C:\temp\wt\proofs\wed363-46fb900\postdeploy-exact-image-remote`.
- WED-360 review rollout remains false-default. Continue its remaining
  invitations, appeals, DecisionOS/comparison evidence and controlled pilot
  gates independently of this released hardening slice.
# WED-364 release candidate — 2026-11-12

- Worktree: `C:/temp/wt/omnyid-wed360`; branch: `agent/codex/WED-360`.
- Fixed TXT-only public Quote Intelligence readiness and added a real mobile
  browser regression that proves no upload occurs before explicit analysis.
- Replaced hard-coded admin-email UI checks with the authenticated server
  `operator` authority and passed the Wedding signup source through password,
  Google and Apple registration so new Wedding accounts receive `couple`.
- Reconciled the cross-account privacy report: planner vendor projection omits
  raw contacts/notes/evidence; two operator commands authenticate before body
  parsing; shared Wedding plans use explicit revocable memberships; contacts
  remain private unless individually selected, encrypted and granted.
- Co-owner invite acceptance persists the canonical Wedding navigation scope;
  the dashboard merges only exact plan/workspace AFP records. Review reads,
  writes and uniqueness are also canonical-owner scoped.
- Review correction, withdrawal, history and vendor-detail entry are connected.
  The public review pilot remains false-default; review invitations, author
  appeal, DecisionOS citation, content-free analytics and the five-venue pilot
  are still tracked as later gated work in the review task document.
- Evidence: `cargo check --lib`, `cargo check --tests`, `npm run typecheck`,
  2,275 Wedding tests, public Wedding site suite, Vite production build and the
  quote article Playwright smoke passed. Windows linked Rust tests still hit
  the known rustc `STATUS_ACCESS_VIOLATION`; Docker Desktop was unavailable, so
  migration 0168 must be executed and inspected by the clean Oracle release.

# 2026-11-12 — WED-364 Oracle release (Codex)

- Released the account-boundary implementation in
  `d558272771336cabf6b924ac2f874c0888dc5b8f`, followed by static cache-safe
  article SHA `e5e55825fc084eaff7644eafe62f687089a232ad`. The latter changes only the
  public article's analyser asset URL and reused the already-proven container
  images.
- Oracle migration 0168 is present: explicit Wedding memberships, expiring
  partner invites and selected-contact grants. The three relations were
  inspected in production. `admin@omnyid.com` is in the server operator
  allowlist; no admin login was used for verification.
- The ordinary hosted quote article passed Playwright at 390 px: selecting a
  TXT file enables Analyse quote, sends nothing before the click, submits once
  after the click and renders source-grounded output. A versioned script URL
  avoids the stale four-hour Cloudflare object; the configured token did not
  have cache-purge authority and no broader permission was added.
- Full Oracle production proof passed backup verification and the isolated
  restore drill. The cold build temporarily raised root use to 92%; only 5.247
  GB of inactive Docker builder cache was removed. No active image, volume,
  database, backup or user file was removed. Final root use is 81% with about
  8.5 GB free.
- WED-364 is complete. WED-360's public review pilot remains independently
  false-default; its invitation, author-appeal, DecisionOS citation, aggregate
  analytics and controlled five-venue rollout gates are not implied by this
  release.

# 2026-11-12 — WED-365 bulk celebrant onboarding completion candidate (Codex)

- Worktree: `C:/temp/wt/omnyid-wed360`; branch:
  `agent/codex/WED-360`. Build and deploy only the clean exact commit produced
  from this candidate.
- Migration 0169 adds content-light outreach, explicit consultation
  participation, callback-phone confirmation and bounded capability scopes.
  It is registered in the canonical migration catalogue.
- The existing operator panel now handles official-register decisions,
  outreach/follow-up/opt-out, funnel exceptions, once-only scoped links and QR
  codes, and duplicate-safe unpublished listing previews. Opt-out revokes
  active grants/sessions and prevents link reissue.
- The no-account mobile flow supports accept, pause, decline and recovery.
  Public consultation projection requires accepted participation plus verified
  register status; going live additionally requires the claimed phone and the
  owner's explicit private callback-phone confirmation. Wedding-date calendar
  authority remains independent and is reported in the capability manifest.
- Pass: Solid TypeScript; Rust library check; six management contract tests;
  disposable PostgreSQL migration plus real-router concurrent batch creation,
  once-only plaintext proof, opt-out revocation and blocked reissue. The
  disposable container was removed after testing.
- The co-branded Binder task remains deliberately deferred until separate
  publication and asset-rights review. It does not block calendar onboarding.

# 2026-11-12 — WED-360 review completion and WED-365 coworking start (Codex)

- Worktree: `C:/temp/wt/omnyid-wed360`; branch:
  `agent/codex/WED-360`. Latest implementation commit before this coordination
  update: `ca56277f62e2ad441bc96c83f229cdf136dc7ba2`.
- Completed the remaining implementable review operations: neutral/idempotent
  invitations, one seven-day reminder, authenticated open/decline/opt-out,
  author-only appeal and status, operator appeal resolution, bounded dated
  DecisionOS observations and content-free operator metrics. A co-owner cannot
  withdraw or appeal another person's authored review.
- Added and extended the canonical couple-coworking specification/task set
  rather than creating a parallel system. Migration 0171 and `WeddingScope`
  provide canonical owner/plan/workspace/member/role/revision authority.
  Partner invitations are owner-only, capped at one active co-owner and
  serialised during acceptance. The UI now explains the personal-data
  boundary and provides real member, revoke and leave controls.
- Hardening found a production-relevant migration defect: 0170 replaced the
  event-kind constraint without retaining `eligibility_decided`. Forward
  migration 0172 restores the cumulative vocabulary for already-upgraded
  databases. Disposable PostgreSQL applied 0172, accepted an
  `eligibility_decided` event and exposed the complete repaired constraint.
- Verification passed: `npm run typecheck`; `cargo check --lib`; 17 focused
  celebrant, vendor-portal and collaboration tests; migration 0172 execution
  and constraint inspection. The real-router review test executed through the
  repaired eligibility path and then exposed a stale list-count assertion,
  which is now ID-based.
- Verification not claimed: the final linked Rust rerun. Windows `rustc`
  repeatedly exits with `STATUS_ACCESS_VIOLATION`; two Docker retries under
  the current 3.8-GiB allocation exited inside LLVM with SIGILL/SIGSEGV. This
  is an infrastructure gate, not a green test. Hosted exact-SHA review pilot,
  accessibility/full-account evidence and the five-venue rollout remain open.
- Vendor management VMP-01 through VMP-09 and the bulk celebrant calendar-link
  workflow were audited as already implemented; no duplicate portal or
  calendar authority was introduced. The co-branded Binder remains an
  intentional P2 deferral pending publication and asset-rights review.

# 2026-11-15 — WED-365 mobile startup and invitation lifecycle hardening (Codex)

- Worktree: `C:/temp/wt/omnyid-wed360`; branch:
  `agent/codex/WED-360`; verified implementation SHA before this coordination
  commit: `0f93c88ae50fe6c75667281e9eb5009c62d14574`.
- Mobile Wedding startup now resolves the signed-in account's onboarding state
  and canonical Wedding projection before choosing one initial surface.
  Returning couples no longer flash intake; genuinely new Wedding accounts
  still receive intake; refresh failure shows retry rather than guessing.
- The existing Wedding typography token enlarges root type by 1.1 before the
  first render and is also applied synchronously during a no-reload auth
  handoff. No transform/late zoom is used, so layout is designed at the larger
  scale from the start. Operators retain the general presentation.
- Partner invitation history now gives the owner bounded pending, accepted,
  revoked and expired states without retaining the invited email in the
  response. Expired links are explicitly shown as granting no access;
  co-owners cannot read owner invitation history.
- Passed on the exact implementation SHA: `npm run typecheck`; 17 focused
  Wedding startup, collaboration and font tests; `npm run build`;
  `CARGO_TARGET_DIR=C:\\cargo-target cargo check --lib`; and linked
  `cargo test --test wedding_partner_sharing_api -- --nocapture` against the
  disposable test database (`1 passed`).
- Remaining work is external evidence rather than another local review-system
  implementation: hosted exact-SHA false-default proof, accessibility/full-
  account evidence and the controlled five-venue review pilot. `Read the
  couple's story` remains deliberately deferred until a real separately
  permissioned story exists. The co-branded Binder likewise remains deferred
  for publication and asset-rights review.
## 2026-11-16 - WED-367 quote, operator, import and in-place Wedding hardening (Codex, released)

Worktree `C:\temp\wt\omnyid-wed360`, branch `agent/codex/WED-360`.
Application commit `cd03631160efab96c0eab635f09dddf41f7f750c` was built and
released from clean detached checkout
`C:\temp\wt\omnyid-wed367-release-cd03631`.

- Hosted Quote Intelligence keeps model-first structured extraction and now
  falls back to exact-source deterministic fields when the provider is down or
  malformed. It never promotes a component into a grand total and retains the
  USD 50 weekly cutoff. Public burst/day limits are 5 and 10 respectively.
- Authenticated session authority is refreshed from the server after mount;
  server-confirmed operators arrive at the admin dashboard and a Wedding deep
  link cannot overwrite that choice.
- Up-next notes can be removed in place using account-scoped AFP tombstones.
  Existing-list imports require an explicit planning kind and reuse the
  canonical budget, guest/seating, vendor, timeline and Documents projections.
  Seating decisions mount the existing canvas below the still-visible task
  assignment controls. Vendor search examples rotate as placeholders only.
- `concensure@gmail.com` was deleted through the supported full-account route.
  The route reported profile/ledger deletion and storage release; production
  checks found zero matching users and zero tenant schemas. Its operator entry
  was removed, and the running homeserver reports only `admin@omnyid.com` in
  `OMNYID_ADMIN_EMAILS`. This did not alter separately configured operational
  report recipients.
- Local evidence: TypeScript passes; 45 focused Wedding tests pass; four Rust
  quote-route tests pass; the 390 px browser quote journey reads a TXT file,
  sends exactly one request only after Analyse and renders grounded output;
  public-site smoke and the production UI build pass. The full Wedding suite
  is 2,289/2,290 with only the same unrelated
  `wedding-lead-magnet-import-state.test.ts` rejection assertion already
  recorded by WED-366.

- Hosted evidence: `SOURCE_COMMIT` and `oracle-runtime-manifest.json` both
  contain the full application SHA; the authenticated production proof passes;
  core containers are running and ClamAV, Postgres, Electric and SeaweedFS are
  healthy. A real synthetic quote returned source-grounded
  `quote-extraction.v2` from `openai/gpt-5-mini` with
  `retained_by_omnyid=false`. The UI image contains the explicit list-kind,
  rotating example and operator-dashboard code. Production user and tenant
  schema counts for `concensure@gmail.com` are zero.
- The normal deployment wrapper became idle after successful container
  rotation and HTTP 200 workspace smoke, with no child or remote proof process.
  It was stopped locally; the project production-proof script was then run
  directly in bounded no-restore mode and passed. No production service was
  interrupted by stopping the idle wrapper.

Recommended next action: no additional WED-367 implementation. The one
unrelated lead-magnet assertion should be diagnosed under its own task rather
than mixed into this released slice.
## 2026-11-16 - WED-368 ranked celebrant consultation approval and public articles (Codex, release candidate)

Worktree `C:\temp\wt\omnyid-wed360`, branch `agent/codex/WED-360`, based on
`294300d702a26ccb3b2d247737de18e1748dca02`.

- Connected the existing Ranking Policy V2, Celebrant consultation, scoped
  capability-link, claimed-vendor, Calendar and transactional-email authorities.
  Only the current top three Celebrant cards request vendor-scoped published
  ten-minute slots. A couple verifies the callback phone through Twilio and the
  selected time remains pending until that claimed Celebrant approves it.
- Approval atomically changes request state and writes the vendor and requesting
  account Calendar entries. Confirmation email is attempted after commit and its
  sent/failed outcome is retained independently. Content-light lifecycle events
  never contain the phone number or bearer link.
- The unauthenticated management link remains single-vendor and exposes only
  total/awaiting/accepted counts plus sign-in and account-creation paths. Names,
  request times and approval controls require authenticated access to that claimed
  vendor. Existing fresh wedding-date availability remains a Ranking V2 factor.
- Selectively imported the fifteen requested articles and eight missing licensed
  assets from the dirty old checkout into this lineage. Reconciled cards, taxonomy,
  publication catalogue, metadata and sitemap. Hardened reconciliation so an
  editorial archive can fill a missing article but cannot overwrite a newer live
  article.
- Verification: 25 focused Celebrant/ranking tests pass; all public Wedding site
  checks pass for 93 sitemap pages; TypeScript, Rust library check and the production
  Vite build pass. The full Wedding suite is 2,291/2,292 with the same unrelated
  lead-magnet import-state rejection documented in WED-366/WED-367. The aggregate
  CI wrapper also reports pre-existing line-budget drift in untouched `src/db.rs`
  and `src/server/mod.rs`; the focused Wedding line budget passes. Migration 0174
  was applied successfully with the dependent consultation migrations to local
  PostgreSQL.
- Production readiness check (values never printed): Oracle currently has the
  feature flag false and has none of the consultation pepper, Twilio Account SID,
  Twilio Auth Token or Twilio Verify Service SID settings. Release the code
  false-default, but do not claim verified phone scheduling is operational or turn
  the flag on until those secrets are supplied through root-readable secret files.

Recommended next action: supply the three Twilio values and a generated consultation
pepper through the existing Oracle secret-file mechanism, enable the feature, then
run one controlled phone verification, pending-request, claimed-vendor approval,
email receipt and two-Calendar browser journey before widening the cohort.
## 2026-11-16 - WED-369 mobile onboarding and budget polish (Codex, release candidate)

Worktree `C:\temp\wt\omnyid-wed360`, branch `agent/codex/WED-369`, based on the
exact WED-368 production SHA `f7bca68c27651e1e5f586f348b5c093c3488036a`.

- Removed phone font-size controls and the generic outer workspace frame; fixed duplicate phone
  viewport/tab-bar padding that cut off the decision action. Sprout is hidden by default on phones
  and can be restored explicitly in Agent Settings with an account-scoped device preference.
- The remembered-answer onboarding card now appears only with real supported handoff facts. The
  atmosphere cards are image-first and full-width on phones, location suggestions close after a
  choice, the date calendar is viewport bounded, skip occupies its own row, and vow/relationship
  examples are couple-facing.
- Budget tabs have explicit phone back/forward controls. Forecast copy flows vertically. Every
  category exposes an editable deterministic starting amount based on the canonical 100% guidance,
  entered total and bounded saved preference signals; rounded amounts reconcile exactly to total.
- Evidence: TypeScript typecheck and Vite production build pass; 13 focused tests pass; the Budget
  hub Playwright journey passes at 320px and 1280px including both scroll arrows. The broad Wedding
  suite is 2293/2294 with only the pre-existing lead-magnet import rejection assertion failing. The
  global line-budget suite still reports only its pre-existing `src/server/mod.rs` and `src/db.rs`
  overages; the focused Wedding 1000-line budget passes.

Recommended next action: freeze this branch commit, deploy only from a clean detached exact-SHA
worktree, then record hosted `SOURCE_COMMIT`, runtime manifest and phone asset evidence.
## 2026-11-16 - WED-370 ranked Celebrant slot-first enquiry (Codex, release candidate)

Worktree `C:\temp\wt\omnyid-wed360`, branch `agent/codex/WED-370`, based on the
WED-369 production SHA `ed1331bc6826e555e21a424d93ae09e7b94b7e73`.
Application commit `ecd7bbc3c4a2c7055a3bdcb8e1aa21fe4246b96f` contains the implementation.

- A current top-three Celebrant card's Enquire action now reveals the selected
  celebrant's vendor-scoped slots first. The panel is not rendered speculatively
  for unrelated comparison cards.
- Confirming a slot regenerates the canonical editable vendor outreach draft and
  includes the exact Australia/Sydney consultation time in its subject, body and
  AFP provenance. It does not send the message or create a booking.
- The existing Twilio verification, pending request, claimed-vendor approval,
  atomic two-calendar update and separate confirmation-email outcome remain in
  place. Missing slots and missing verification configuration fail visibly.
- A dedicated Twilio Verify service was created from the credentials supplied in
  the ignored local environment. The account credential, service ID and generated
  consultation pepper are file-backed under the local secret store; no secret was
  printed or committed.
- Verification: focused Celebrant tests 5/5; Solid UI typecheck passes; production
  UI build passes; broad Wedding suite 2,294/2,295 with only the unrelated,
  pre-existing lead-magnet rejection assertion failing.

Recommended next action: release the resulting coordination commit from a clean
detached checkout, sync the four secret files to Oracle, enable the false-default
consultation flag, then prove the hosted vendor-scoped endpoint reports phone
verification configured without disclosing a secret or phone number.

## 2026-11-16 - WED-371 account-isolated Wedding startup and Wedding Sprout (Codex, release candidate)

Worktree `C:\temp\wt\omnyid-wed360`, branch `agent/codex/WED-371`, based on the
exact WED-370 production SHA `2adbf4052217a271c19a1f657eb1147bc672b1dd`.

- Fixed the likely older-iOS planner crash by supporting both modern and legacy
  `MediaQueryList` listener APIs. The generic Wedding error boundary is no longer
  triggered merely because Safari lacks `addEventListener` on that object.
- Account-scoped mobile triage and desktop deferrals by authenticated user as well
  as workspace; reset the module-level mobile mode for accounts without a saved
  preference. Existing server deletion drops the tenant schema and user row, so
  recreating an email receives a fresh identity rather than its former ledger.
- `Set a wedding budget` now opens the real Animal Quiz link and editable Budget
  tracker below the decision card. It no longer routes to the separate empty
  Decision Queue. The list-type selector appears only after pressing Upload.
- Unknown-cost tasks require a selected vendor or quote-like vendor artifact and
  name that vendor. A date-only decision cannot produce `Verify unknown costs for
  <date>`.
- Sprout is now Wedding-first when the Wedding lens is active. The authenticated
  Wedding-only endpoint reuses the funded inference usage ledger, daily limit and
  hard weekly cap. Deterministic routing constrains actions to Wedding views. A
  parsed budget amount is staged in account-scoped storage and visibly prefilled
  for review; nothing is silently saved or sent. All persona and display tools
  remain available behind a secondary control.
- Evidence: `cargo check --lib` passes using `C:\cargo-target`; TypeScript passes;
  production Vite build passes; 42 focused tests pass; all Wedding tests are
  2299/2300 with only the previously documented lead-magnet rejection assertion
  failing. A Rust lib-test link attempt hit a Windows rustc access violation, so
  the successful library compile and pure route tests are recorded separately.

Recommended next action: commit this candidate, deploy only from a clean detached
checkout of that exact SHA, then use machine-generated production proof plus
read-only hosted checks to confirm `SOURCE_COMMIT`, health, funded-AI policy and
the vendor-scoped Celebrant endpoint/Twilio readiness. A real SMS receipt still
requires an explicitly supplied controlled phone number.

### WED-371 account-isolation audit addendum

- A read-only production audit of the recreated `concensure@gmail.com` account
  found one current account row, no private AFP reference to the cake task and no
  completed Wedding-task event. The cake wording was generated from the common
  preparation catalogue, not inherited from another user's tenant schema.
- The overview's next-action projection now finishes account setup in a stable
  order: wedding date, numeric budget, guest list, then the earliest genuine
  timeline item. A generic cake or vendor task can no longer displace those
  first-account actions merely because it has a calculated due date.
- The focused overview suite is 20/20 and TypeScript still passes. Release this
  addendum only from a new clean exact-SHA checkout; do not reuse the earlier
  `971ebf2219c2bbf19cb23a43edea2af2c171fcf9` release evidence.
## 2026-11-16 - WED-372 RSVP projection and unified Celebrant availability link (Codex, release candidate)

Worktree `C:\temp\wt\omnyid-wed372`, branch `agent/codex/WED-372`, based on exact
production SHA `9124790ea81935c00f55b6c95f40ef07be164eeb`.

- RSVP guest-facing names reactively project the existing onboarding `Your names`
  planning field unless the couple has edited or saved a different label. Event
  names remain free text with common datalist choices. An explicit unticked
  cultural/community planning checkbox adds the requested culturally specific
  event choices and records/removes the existing private Vision/Inspiration
  preference; the app does not infer identity or select an event.
- The couple's Celebrant consultation surface now polls the existing public status
  receipt every five seconds within a bounded lifetime and changes to approved or
  terminal state without a reload.
- Newly generated Celebrant management links now grant two separately checked
  scopes in one vendor-specific, short-lived session. Consultation windows retain
  their existing authority. Wedding-date evidence reuses the canonical Limited
  Specials offer/slot/event tables with optimistic revisions, 48-hour holds,
  freshness, idempotency and vendor scoping. Older links remain consultation-only.
- The management-link UI has distinct wedding-date and consultation sections and
  never exposes couple request details. The admin invitation and QR surface now
  explain that the single link opens both calendars. The claimed-vendor portal has
  a responsive `How it works` navigation item covering enquiry, quote, tour, hold,
  contract and consultation state changes.
- Vendor-source authentication persists only a validated same-origin vendor return
  path, tolerates blocked browser storage and returns OAuth users to the existing
  vendor portal rather than the couple Wedding lens.
- `wedding/user-guide.html` contains an accessible five-step couple process diagram
  and distinguishes requesting a call, vendor approval, notification/Calendar
  projection and wedding-date availability.
- Verification: `cargo check --lib` passed; the six-test
  `wedding_celebrant_management_contract` passed; TypeScript and the production Vite
  build passed; 18 focused RSVP/Celebrant/vendor/guide tests passed; the full public
  site suite passed, including metadata for 93 sitemap pages. Full Wedding tests are
  2302/2303 with only the unchanged `wedding-lead-magnet-import-state.test.ts`
  rejection assertion failing. The global line-budget check still reports only the
  two unchanged baseline overages in `src/server/mod.rs` and `src/db.rs`.
- No new database migration is needed: migrations 0149 and 0169 already provide the
  canonical date-slot authority and the two allowed Celebrant grant scopes.

Next action: commit this candidate, build/deploy from a clean detached checkout of
that exact SHA, then verify hosted provenance, the public guide, vendor bundle,
unauthenticated security boundary and runtime health.
## 2026-11-18 - WED-374 Sprout rollout, projected databases and persona artwork (Codex)

Worktree `C:\temp\wt\omnyid-wed374`, branch `agent/codex/WED-374`, based on
production SHA `9a5ab87ccad1cccc263b4dc8c1066e3c85bb3eb9`.

- Diagnosed the hosted Sprout failure as missing explicit routing, audit-receipt
  and daily-limit controls. The OpenAI secret remains file-mounted and was not
  printed or moved into Git. The gitignored release environment now enables the
  Wedding-only route at six authenticated requests per account/day; the shared
  USD 50 weekly funded-inference cutoff remains enforced.
- Extended the existing Database registry rather than creating another data
  store. Run sheet, Budget, Timeline, Guest list and Seating are focused views
  of the same account-scoped Wedding ledger. The selector offers only missing
  projections and removes an Add option after its definition is created.
- Added guest-list projection, bounded SVG and print/PDF exports, email handoff
  through the user's mail client, and explicit AFP sharing to an entered agent
  ID. External copies are labelled for review and the source database remains
  private.
- Installed the twelve supplied original SVG persona assets. Built-in template
  artwork now appears in Templates, installed Mine entries and the FAB; custom
  persona images and the emoji fallback are preserved. Added small icons to
  Plan actions and Inspiration controls.
- Evidence: TypeScript and production Vite build pass; 20 focused Database,
  Wedding projection and persona tests pass; three Rust Wedding-assistant
  policy/scope tests pass. The focused 1000-line Wedding budget passes. The
  global line-budget retains the two unchanged baseline failures in
  `src/server/mod.rs` and `src/db.rs`.

Next action: commit, create a clean detached checkout of the exact SHA, rebuild,
deploy with the guarded Oracle helper, then verify runtime provenance, the three
non-secret Sprout controls, public persona assets and hosted route boundaries.

## 2026-11-18 - WED-375 Runbook implementation foundation (Codex, continuation required)

Worktree `C:/temp/wt/omnyid-runbooks`, branch `agent/codex/WED-375`.
Frozen application candidate: `26d2e33c6a8de8bb829a0c2e378c4377daf3b5a5`.
Verification checkout: `C:/temp/wt/omnyid-runbooks-verify-43d7c830`, detached
at the frozen candidate (the directory name reflects its earlier checkout).

Located WED-308's design and dependency plan in `Documents/design/runbooks`;
the actual design commit is `dcbe97eff14f2b62a582fe76d340db3f831d9528`.
All implementation boxes were previously open. Continued from current application
base `5536b83b2f9d2f58488a075f383c24f8f4f73d6c` to preserve later fixes.
Read-only Oracle inspection returned that same source marker and no runbook
settings. No deployment or remote publication occurred. The primary dirty
checkout and other implementation branches were not changed.

Changed: six new `src/runbook*.rs` modules, exports in `src/lib.rs`,
`tests/runbook_foundation.rs`, the dependency plan and coordination records.
Strict contracts reject unknown fields/enums, oversized/bad definitions,
unallowlisted tools/follow-ups, unbounded/forward input selectors, invalid
completion steps and terminal reopening. Private runtime AFP parsers/builders
cover definitions, instances, traces and epistemic questions. Public metadata
is exact and content-light. Definition projection rejects wrong recipients,
parents, forks, missing versions, stale edits and reopened archives. Typed
matching preserves stable priority/specificity/version/ID order, owner-bound
hashes, group dedupe and five event slots even on retries. The stored-event
adapter requires the trusted database partition and omits raw bodies/credentials.

Verification:
- Original 10-test whole-crate integration run passed at
  `06f6df31912dc71dda7d58c110bb92340e64aaf0` (not evidence for later code).
- All 15 tests pass for the frozen final source in an isolated source harness.
  It loads the six actual production modules and unchanged test file, with the
  actual AFPMessage struct/default_protocol function extracted verbatim from
  message.rs. This verifies the new logic, not whole-application integration.
  Harness, binary, test stdout and SHA-256 manifest are under
  `C:/temp/runbook-verification-26d2e33c/`.
- Changed Rust formatting, diff whitespace and file budgets pass; the largest
  new file is the 565-line integration test, and source files are at most 280 lines.
- Pinned Rust 1.94 full test/build and cargo check attempts crashed inside rustc
  with STATUS_ACCESS_VIOLATION / STATUS_PRIVILEGED_INSTRUCTION, including with
  incremental compilation off and per-package debug information disabled.
  The installed Rust 1.95 full library check, normal 15-test integration target
  and library build all completed successfully on the frozen final SHA. Commands:
  `cargo +1.95.0 check --lib -j 8`,
  `cargo +1.95.0 test --test runbook_foundation -j 8 --config 'profile.test.package.omnyid-homeserver.debug=0'`,
  `cargo +1.95.0 build --lib -j 8 --config 'profile.dev.package.omnyid-homeserver.debug=0'`.
  All used CARGO_TARGET_DIR=C:/cargo-target and CARGO_INCREMENTAL=0.
  The normal integration run supersedes the narrower harness result. The
  project's Rust 1.94 pin is unchanged and its compiler faults remain a caveat.
- GitHub queries returned no deployments and only unrelated March main CI
  failures. No CI authority exists for this unpublished task branch. No PR was
  created because this local lineage was not published; cross-review is pending.

Remaining: this is the contract and pure planning foundation, not a working
runbook runtime. The registry builds successor proposals and the matcher builds
shadow decisions; neither claims atomic writes or exactly-once dispatch. No
new routes, daemon hooks, execution flags, model calls or tool calls exist.
Implement starter templates and atomic owner-private seed/successor storage next,
then continue stages 3–17 in dependency order: complete adapters, durable locks,
bounded evidence, existing authority/approvals, execution, epistemic resume,
model budgets, scheduled AFP events, provenance/outcomes, APIs/A2UI, erasure and
rollout. Do not use the pruning private-snapshot API for append-only histories.
User intent remains continuation of the remaining Runbook implementation.

## 2026-11-18 — WED-375: durable starter setup and authenticated definition management

Implementation worktree: `C:/temp/wt/omnyid-runbooks`.
Branch: `agent/codex/WED-375`.
Frozen, verified source: `ad782b25676e68f8ac4faab6760b195a9df46745`.
Clean verification worktree: `C:/temp/wt/omnyid-runbooks-verify-43d7c830`.
Documentation commits after that candidate are not separate build candidates.

Changed:
- Twelve immutable disabled starter definitions, reviewed transform-operation
  enums and bounded required-fact declarations. These are workflow definitions;
  their operations still need the later executor/evidence implementation.
- `src/runbook_store.rs` encrypts and server-signs definitions in the existing
  owner-private AFP messages table. Owner advisory transactions serialize setup,
  reads and successor writes; stale/foreign parents conflict. Exact edit retry
  IDs return the original revision. Setup preserves edits, disable and archive.
- `src/server/runbook_routes.rs` adds authenticated, rate-limited setup/list,
  starter catalogue, successor edit, explicit export and upgrade-preview routes.
  Responses are no-store. `OMNYID_RUNBOOK_MANAGEMENT_ENABLED` defaults off and
  cannot start execution. Enable/disable/archive use normal successor edits.
- Existing account erasure drops the entire private history. Reads/writes require
  the account row and never recreate a deleted schema. No parallel table/cache.
- Exports/wiring in `src/lib.rs` and `src/server/mod.rs`; foundation fixture updated
  for the new step fields; new `tests/runbook_storage_postgres.rs`.

Verification on the frozen source (not the dirty implementation worktree):
- `cargo +1.95.0 check --lib -j 8` completed.
- `cargo +1.95.0 test --test runbook_foundation --test runbook_storage_postgres -j 2 --config 'profile.test.package.omnyid-homeserver.debug=0' --config 'profile.test.package.omnyid-homeserver.codegen-units=16'`
  completed: 15 foundation tests plus starter validation and the live PostgreSQL
  lifecycle/authenticated-route integration scenario (17 total; no skip).
- `cargo +1.95.0 build --lib -j 2 --config 'profile.dev.package.omnyid-homeserver.debug=0' --config 'profile.dev.package.omnyid-homeserver.codegen-units=16'`
  completed. All commands used CARGO_TARGET_DIR=C:/cargo-target and
  CARGO_INCREMENTAL=0. Toplevel, HEAD and clean status were checked before each.
- PostgreSQL: dedicated local `pgvector/pgvector:pg17` container
  `omnyid-runbook-wed375-pg`, localhost port 55475, database `omnyid_test`.
  Tests cover competing setup/edit transactions, exact retry after later edits,
  stale/foreign parent rejection, two owners, ciphertext-only storage, wrong
  keys, disabled flags, authentication, owner injection, upgrade preview/apply,
  archive terminality, signed-metadata forgery and real account/schema erasure.
- Initial Rust 1.95 test code generation with default codegen units crashed with
  STATUS_ACCESS_VIOLATION. The reduced-parallelism retry above succeeded. Prior
  pinned Rust 1.94 compiler faults remain unresolved; no toolchain pin changed.
- Focused formatting, diff whitespace and file-size checks completed; new source
  files are below 999 lines, and the new database test is 372 lines.
- GitHub has no deployments and only unrelated old main failures. No CI run for
  this unpublished candidate, no PR and no deployment. The task lineage remains
  local; cross-review/publication is still pending.

Next: implement durable dispatch receipts and instance/step compare-and-append
transactions, then complete stored-event adapters and bounded evidence before
connecting ingress or the daemon. Continue existing authority/approval, executor,
epistemic resume, model-budget, scheduling, outcome/provenance and A2UI stages.
First-run UI integration is also pending; only its selected-starter setup API
exists. Do not describe the engine or the remaining runbook tasks as complete.
The task stays in_progress. No execution flag or live event hook was enabled.

## 2026-11-18 — WED-375: durable dispatch, local-step receipts and wait resolution

Implementation: `C:/temp/wt/omnyid-runbooks`, branch `agent/codex/WED-375`.
Frozen source: `c811b1aceda5eb1c3d26232f6ea85ad09066c805`.
Verification: `C:/temp/wt/omnyid-runbooks-verify-43d7c830` at that exact SHA.

`src/runbook_runtime.rs` reads an event ID from the authenticated/daemon owner's
existing afp_messages partition. Under the existing owner transaction, it
normalizes the event, freezes matched/suppressed decisions in a private receipt,
and appends at most five instance roots. Duplicate delivery returns that same
plan; changed normalized input conflicts. Definition changes affect new events,
not already-bound instance definitions or prior dispatch receipts.

The runtime stores append-only instance histories, commits local read/transform
result traces and instance advancement atomically, and returns the original
trace for an exact retry. Changed input/output, stale revisions, disabled
definitions, unsupported step kinds and terminal advancement fail closed.
Cancel and timeout append terminal revisions and resolution AFP events. Waits
store a follow-up due time and a separate later `wait_expires_at`; reaching the
delivery time is not an expiry. There is no generic resume API that could bypass
approval or epistemic input authority. No actual tool/model execution is added.

Files: new runtime and PostgreSQL runtime test; shared encrypted record codec
extended in runbook_store; wait-expiry contract/validation in runbook_contract
and runbook_afp; lib export and foundation fixture updated. All new files are
below 999 lines. Runtime public methods are internal application library APIs,
not newly exposed HTTP endpoints; trusted callers must supply owner context.

Verification completed on the final frozen candidate: all 18 tests passed, including both live PostgreSQL scenarios; no test was skipped. Test command:
`cargo +1.95.0 test --test runbook_foundation --test runbook_storage_postgres --test runbook_runtime_postgres -j 2 --config 'profile.test.package.omnyid-homeserver.debug=0' --config 'profile.test.package.omnyid-homeserver.codegen-units=16'`.
Use CARGO_TARGET_DIR=C:/cargo-target and CARGO_INCREMENTAL=0, with
TEST_DATABASE_URL pointing at the dedicated local omnyid-runbook-wed375-pg
container, port 55475, omnyid_test database. Do not use another running database.
The earlier b9a41fa4 candidate reached the runtime scenario but failed an overly
broad test assertion that forbade opaque AFP reference IDs anywhere in a row.
The final test checks encrypted content and excludes these references from
searchable metadata while preserving standard AFP references. The final source
also separates expiry from follow-up due time and tests that boundary.

No live hook, deployment, frontend change or PR. GitHub still exposes only the
old unrelated main CI failure and no deployments; this task branch is local.
Remaining work includes full event adapters/hooks, bounded evidence, authority,
remaining step kinds, retry/cooldown policy, approval and epistemic resume,
model budgets, timer delivery, outcomes, activity/A2UI, retention and rollout.
Account deletion continues to use the existing private-schema erasure boundary.
The remaining-task count is **83 unchecked checklist items**, with **34 of 117
complete** (nine additional items completed this session). This counts checklist
items, not equally sized effort estimates. Next priority: bounded evidence and
existing authority integration before broadening supported step kinds or wiring
live ingress. The full remaining list is in
Documents/design/runbooks/per-user-proactive-runbooks-tasks.md.

The library build also completed on the same clean source SHA:
`cargo +1.95.0 build --lib -j 2 --config 'profile.dev.package.omnyid-homeserver.debug=0' --config 'profile.dev.package.omnyid-homeserver.codegen-units=16'`.
The verification commands printed toplevel, exact HEAD and clean status before
running. Focused rustfmt/diff checks completed. No toolchain pin changed. The
dedicated database container was stopped after verification; no worktree was
deleted. Subsequent documentation commits do not change the frozen code SHA.

## WED-375 evidence continuation - 2026-11-18

Implementation worktree: C:/temp/wt/omnyid-runbooks
Branch: agent/codex/WED-375
Frozen source: 44b4117562634eaac2e10314aa346fbc29c6daa6
Clean verification worktree: C:/temp/wt/omnyid-runbooks-verify-43d7c830

Added src/runbook_evidence.rs and tests/runbook_evidence_postgres.rs, exported
in src/lib.rs and made the store encryption key crate-visible to the resolver.
Exact message/private-message/snapshot references use owner scope, account and
row locks, header-first reads, Watcher relevance before decryption and hard
count/decrypt/byte budgets. No history/query fallback. Packets return included
items and hashes, omissions, missing facts and existing fresh snapshot/handoff
data. Unsupported entity kinds are explicit omissions. No authority is granted.

Commands printed toplevel, full HEAD and clean status before each verification.
Rust +1.95.0, CARGO_TARGET_DIR=C:/cargo-target, CARGO_INCREMENTAL=0, two jobs,
package debug=0 and codegen-units=16 were used; repository pin unchanged.
All 19 tests completed with zero failures:
`cargo +1.95.0 test --test runbook_foundation --test runbook_storage_postgres
 --test runbook_runtime_postgres --test runbook_evidence_postgres -j 2
 --config 'profile.test.package.omnyid-homeserver.debug=0'
 --config 'profile.test.package.omnyid-homeserver.codegen-units=16'`.
TEST_DATABASE_URL targeted only disposable omnyid_test on localhost:55475.
The library build completed on the same clean source commit:
`cargo +1.95.0 build --lib -j 2
 --config 'profile.dev.package.omnyid-homeserver.debug=0'
 --config 'profile.dev.package.omnyid-homeserver.codegen-units=16'`.
Focused rustfmt and git diff --check completed. The disposable container
omnyid-runbook-wed375-pg was stopped. No worktree was deleted.

Checklist: 38 complete, 79 unchecked out of 117 (four completed this turn).
Remaining evidence work: entity adapters/account budgets, frozen runtime step
selector binding and encrypted packet receipts. Then existing authority/tool
intersection and approval AFP integration, before broader step execution or
live hooks. No PR/cross-review or deployment: branch is local and available
GitHub status still exposes unrelated old main CI and no deployments.
Documentation commits follow the verified source and do not change its code.
The first documentation command hit a Windows default-encoding read error
before appending this handoff; UTF-8 append repaired the documentation step.

## WED-375 read executor continuation - 2026-11-18

Worktree: C:/temp/wt/omnyid-runbooks; branch agent/codex/WED-375.
Frozen source: 51407f514eecc683fac3695c9005d731f4c72b76
Verification worktree: C:/temp/wt/omnyid-runbooks-verify-43d7c830.

Added src/runbook_read.rs and exported it in src/lib.rs; extended encrypted
record validation in src/runbook_store.rs. Refactored resolver and local step
persistence into transaction-aware internal helpers in src/runbook_evidence.rs
and src/runbook_runtime.rs. Added a PostgreSQL runtime scenario in
 tests/runbook_runtime_postgres.rs. Evidence now commits atomically with its
read trace and next revision using frozen selectors and a saved private receipt.
Retries return original evidence and reject changed request parameters. Tests
cover concurrent calls, invalid-budget rollback, undeclared snapshot refs,
foreign ownership, encryption, source changes, terminal retry and event drift.

Before tests/build, commands printed the verification path, full SHA above
and clean status. With CARGO_TARGET_DIR=C:/cargo-target, CARGO_INCREMENTAL=0,
Rust +1.95.0, -j 2, package debug=0 and codegen-units=16:
`cargo +1.95.0 test --test runbook_foundation --test runbook_storage_postgres
 --test runbook_runtime_postgres --test runbook_evidence_postgres -j 2
 --config 'profile.test.package.omnyid-homeserver.debug=0'
 --config 'profile.test.package.omnyid-homeserver.codegen-units=16'`
completed all 20 tests. The disposable TEST_DATABASE_URL targeted omnyid_test
on localhost:55475. `cargo +1.95.0 build --lib -j 2
 --config 'profile.dev.package.omnyid-homeserver.debug=0'
 --config 'profile.dev.package.omnyid-homeserver.codegen-units=16'`
also completed. Focused rustfmt and diff checks completed; Rust pin unchanged.
Disposable container omnyid-runbook-wed375-pg stopped after verification.
No worktrees deleted. Documentation commits follow the verified source.

Recorded the existing regression inventory in the task document; 39 of 117
items complete, 78 unchecked. Read execution completes part of the larger
all-step executor checkbox, which correctly remains open. Reviewed existing
capability records, approval modes, autonomy overrides and global proactivity
limits; policy integration was not implemented and remains the next task.
Other prerequisites: entity-specific refs, account read/decrypt budget,
remaining deterministic steps, epistemic escalation, approval/resume, timers,
models, UI and rollout. No PR or deployment. GitHub still shows the old unrelated
main CI failure and an empty deployment list; no current-branch remote checks.

## WED-375 five policy tasks completed - 2026-11-18

Implementation worktree: C:/temp/wt/omnyid-runbooks
Branch: agent/codex/WED-375
Frozen source: 5c539bbc2fcdad46f539824eb581588e15e481ca
Verification worktree: C:/temp/wt/omnyid-runbooks-verify-43d7c830

Completed stage 8 items 1, 2, 3, 5 and 6 as announced: policy intersections,
existing autonomy reuse, consequential-action approval boundaries, durable
policy-denial handling and adversarial tests. Item 4 (existing action/approval
AFP emission) stays open until the executor provides a validated exact action
payload. No second approval queue or live execution was introduced.

Files: src/runbook_authority.rs, src/lib.rs, src/runbook_store.rs, src/db.rs,
tests/runbook_authority.rs, tests/runbook_authority_postgres.rs and coordination/
checklist docs. Frozen tool identity intersects latest restrictions, one owner
connection, approval mode and existing account policy. Denials fail the instance
with an encrypted trace/receipt; permitted proposals wait for review. Historical
receipts never execute or resume actions. No LLM policy override path exists.
A newer definition cannot expand a frozen observe-only/draft-only ceiling.

An initial 921389a0 candidate passed four pure policy tests but its PostgreSQL
scenario found existing helper queries targeting nonexistent tables. Corrected
the helpers to heuristic_autonomy_overrides and user_proactivity_config, matching
migrations 0047/0048, without adding tables. Existing account deletion now removes
those settings because these older tables have no user foreign keys. The main
checkout had no db.rs modifications; only the isolated task worktree was changed.

The final source above completed 25 tests with zero failures, including capability
revocation, foreign ownership, forged tool claims, injected source/connection
instructions, excessive autonomy, terminal/review receipt replay, concurrent
policy checks, latest-definition revocation, frozen ceiling preservation,
owner settings roundtrip/isolation, encrypted audit records and account erasure.
Before each test/build, commands printed the verification toplevel, full HEAD
and clean status. Environment: CARGO_TARGET_DIR=C:/cargo-target,
CARGO_INCREMENTAL=0, disposable TEST_DATABASE_URL on localhost:55475/omnyid_test.
`cargo +1.95.0 test --test runbook_foundation --test runbook_storage_postgres
 --test runbook_runtime_postgres --test runbook_evidence_postgres
 --test runbook_authority --test runbook_authority_postgres -j 2
 --config 'profile.test.package.omnyid-homeserver.debug=0'
 --config 'profile.test.package.omnyid-homeserver.codegen-units=16'`
completed, as did the library build:
`cargo +1.95.0 build --lib -j 2
 --config 'profile.dev.package.omnyid-homeserver.debug=0'
 --config 'profile.dev.package.omnyid-homeserver.codegen-units=16'`.
The Rust pin remains unchanged. Focused rustfmt/diff checks completed. New source
and test files are 385, 158 and 320 lines, respectively; db.rs changed by four
query fixes and six erasure lines, with no global formatting. The dedicated
omnyid-runbook-wed375-pg container was stopped after verification. No worktree
was deleted. Documentation commits follow the verified source SHA.

Checklist now has 44 complete and 73 unchecked items out of 117, exactly five
more complete. Next: validated action payloads and existing approval AFP emission,
then current-policy revalidation and exact approved-input resume at dispatch.
No provider execution or approval-card route is enabled by this preflight.
Other remaining work is unchanged: entity/account budgets, other executor steps,
models, timers, outcomes, UI and rollout. No PR/cross-review or deployment was
performed. GitHub queries showed only the old unrelated main CI failure and
an empty deployment list; local verification is not remote CI evidence.

## WED-375 ten input/scheduling items completed - 2026-11-18

Implementation worktree: C:/temp/wt/omnyid-runbooks
Branch: agent/codex/WED-375
Frozen source: fc20e2f156bdbfd34d1b8bddfa67ec4c74b405d9
Verification worktree: C:/temp/wt/omnyid-runbooks-verify-43d7c830

Completed exactly ten selected checklist items: stage 10 items 1,2,4,5,6 and
stage 12 items 1,3,4,5,6. Checklist: 54 complete / 63 remaining / 117 total.
The UI question projection and shared-daemon wake-up hook remain unchecked.

Added src/runbook_control.rs, src/runbook_input.rs, src/runbook_schedule.rs and
tests/runbook_controls_postgres.rs; narrowly integrated src/lib.rs,
src/runbook_store.rs and src/runbook_runtime.rs. Questions derive missing facts
from frozen requirements and the saved bounded packet. One immutable question
pauses the current step; typed owner-authenticated answer events must match the
open question, exact fields, schema, instance, revision and deadline. Answers,
Answered successors and resume commit atomically; duplicates are rejected.
Expiry and cancellation append terminal question successors. Supplied answers
remain separately attributed data for future executor consumption, not authority.

Waits now atomically append AFP schedules with stable cancellation keys, source
refs, causation, due time and separate expiry. Frozen and latest declarations
constrain creation/rescheduling/delivery. The bounded due-scan API supplies hints;
it starts no scheduler. Delivery revalidates and atomically emits one follow-up,
Wait trace and next instance revision. Repeated delivery returns its historical
receipt without reopening terminal state. Cancellation, expiry and rescheduling
append successors, retaining original schedule records. All new records use
existing private encryption/signatures, owner transactions and account erasure.

Initial source f7ecf964ebcdd40cca723741f93ded57205c4939 compiled the library but
new tests failed compilation because deletion fixture calls omitted email and
agent IDs. Corrected those test calls in the frozen source above. Re-ran all
seven focused test targets and required library build at that exact SHA.
Commands printed git toplevel, full HEAD and clean status before each test/build.
Environment: CARGO_TARGET_DIR=C:/cargo-target, CARGO_INCREMENTAL=0,
TEST_DATABASE_URL on dedicated localhost:55475/omnyid_test. Rust +1.95.0 used;
the project Rust pin was not changed.

`cargo +1.95.0 test --test runbook_foundation --test runbook_storage_postgres
 --test runbook_runtime_postgres --test runbook_evidence_postgres
 --test runbook_authority --test runbook_authority_postgres
 --test runbook_controls_postgres -j 2
 --config 'profile.test.package.omnyid-homeserver.debug=0'
 --config 'profile.test.package.omnyid-homeserver.codegen-units=16'`
completed 30 tests, zero failures. Includes all previous 25 regressions plus
new schema, question/answer/isolation, expiry, schedule lifecycle/concurrency/
erasure and declaration-revocation scenarios. `cargo +1.95.0 build --lib -j 2
 --config 'profile.dev.package.omnyid-homeserver.debug=0'
 --config 'profile.dev.package.omnyid-homeserver.codegen-units=16'` completed.
Focused rustfmt, diff checks and new-file line counts were checked; new source
files are 67, 407 and 553 lines, and the new test file is 567 lines.

No frontend or public routes changed; full frontend/legacy-unit suites were not
run for this internal backend batch. No deployment, hosted verification or PR/
cross-review. GitHub queries returned only old unrelated main CI failure
23703104075 and an empty deployment list; local evidence is not remote CI.
Next: existing Decision Queue question projection and authenticated input/activity
routes, shared daemon hook, then remaining deterministic executors and exact
approval integration. Account-level evidence budgets, model steps, provenance,
outcomes, starter end-to-end coverage and rollout remain open. Execution flags
remain off; no user/provider action or live timer delivery was enabled.
Documentation commits follow the frozen source; no worktree was deleted.

Dedicated disposable container omnyid-runbook-wed375-pg stopped after verification.

## WED-375 API, events, completion and security review - 2026-11-18

Implementation: C:/temp/wt/omnyid-runbooks, branch agent/codex/WED-375.
Frozen source: 152d6f38980245bee25d39814f35b45bb00cec19.
Verification: C:/temp/wt/omnyid-runbooks-verify-43d7c830, clean detached at source.
Seven additional checklist items completed: stage 4 items 1/2/6, stage 9 item 4,
stage 14 item 1, stage 16 item 1, stage 17 item 2. Total 61 complete, 56 remaining.

Changes: new runbook_activity.rs and runbook_complete.rs; extended event adapter,
contract/validation, focused server/runbook_routes.rs and module declarations.
New tests/runbook_api_postgres.rs and runbook_event_adapter.rs; controls and
foundation tests extended. Documentation adds runbook-threat-model.md.
Owner-authenticated detail/activity/cancel/answer routes retain default-off
management, rate/body limits and no-store. Projections omit raw evidence/answers.
No start/complete/provider route. Answering resumes ledger state only.
Completion derives predicates from committed prior traces, checks required facts,
and atomically records success/failure; missing outputs cannot become success.
Event adapters preserve bounded refs, urgency and causation, use native Watcher
contracts, and isolate private delivered events from untrusted public claims.
Older dispatch hashes may conflict when newly recognized fields are present;
fail closed and require explicit reviewed migration/restart before live rollout.

Verification commands printed toplevel, full SHA and clean status. Environment:
CARGO_TARGET_DIR=C:/cargo-target; CARGO_INCREMENTAL=0; disposable TEST_DATABASE_URL
on localhost:55475/omnyid_test. Rust +1.95.0; repository toolchain pin unchanged.
`cargo +1.95.0 test --test runbook_foundation --test runbook_storage_postgres
 --test runbook_runtime_postgres --test runbook_evidence_postgres
 --test runbook_authority --test runbook_authority_postgres
 --test runbook_controls_postgres --test runbook_event_adapter
 --test runbook_api_postgres -j 2
 --config 'profile.test.package.omnyid-homeserver.debug=0'
 --config 'profile.test.package.omnyid-homeserver.codegen-units=16'`
completed 33 tests, zero failures. Library build at the same SHA completed:
`cargo +1.95.0 build --lib -j 2
 --config 'profile.dev.package.omnyid-homeserver.debug=0'
 --config 'profile.dev.package.omnyid-homeserver.codegen-units=16'`.
Focused rustfmt, diff checks and all runbook file counts checked; maximum 620
lines, with no material expansion of existing oversized shared modules.

Security audit is NOT passing. `cargo audit --json` returned six dependency
advisories; registry/yanked checks timed out. A no-fetch/no-yanked rerun preserved
results in C:/temp/wt/runbook-audit-152d6f38.json. See the threat model for exact
advisories and fetched database commit. Five additional warnings were reported.
Cargo.toml and Cargo.lock are unchanged by this batch. Dependency remediation/
applicability review and complete registry checks remain a release blocker;
the security-scan task stays unchecked. No runbook source modules log inputs.

No frontend changes: full frontend/accessibility/legacy unit suites were not
run. No PR review, hosted verification or deployment. GitHub still returned only
old unrelated main failure 23703104075 and no deployments. Local tests are not
remote CI evidence. Next: dependency-security triage alongside existing UI/daemon
integration; exact tool approval/dispatch and typed outputs remain prerequisite
work before enabling execution. Shared budgets, models, provenance, outcomes,
retention, starter end-to-end cases and rollout are still open. No live execution
flags enabled. Documentation commits follow the frozen source; no worktrees removed.

Dedicated disposable container omnyid-runbook-wed375-pg stopped after verification.

## WED-375 envelope query indexes — 2026-11-18

Implementation: C:/temp/wt/omnyid-runbooks, agent/codex/WED-375.
Frozen source: df5a7dc59fccfec179cf5631f69b5aa7826b0034.
Verification: C:/temp/wt/omnyid-runbooks-verify-43d7c830, clean detached at that SHA.
Changes: src/db.rs adds two required private-message envelope indexes; existing
bootstrap repairs schemas missing them. src/runbook_store.rs emits only applicable
bound predicates for kind/id/thread reads. tests/runbook_storage_postgres.rs
simulates an existing schema missing both indexes, verifies repair and repeated
bootstrap, then exercises the full encrypted definition lifecycle and erasure.
No new mutable data authority, cache or encrypted content projection exists.

Validation: all nine focused runbook integration targets (33 tests) completed
with exit 0. Library build completed with exit 0. Both ran after explicit
toplevel/HEAD/clean-status checks using Rust 1.95, C:/cargo-target, incremental
off, two jobs, package debug=0 and codegen-units=16. The pinned 1.94 toolchain
remains unchanged because of the previously documented host compiler crash.
No frontend changes; frontend/full application suites were not run. No new source
file was introduced; db.rs grew by five lines only. git diff --check is clean.
Checklist now 62 complete, 55 remaining of 117.

Limitations: indexes upgrade on the established bootstrap path with a fresh Db
handle, not during runbook reads. Large tenant tables may experience write locks
during index creation; assess sizes and migration timing before production rollout.
No performance benchmark or production query-plan claim is made.
Existing six dependency advisories remain unresolved; audit was not repeated
because Cargo manifests/lockfile are unchanged. GitHub returned only unrelated
main CI failure 23703104075 and no deployment records; no CI for this local
candidate, PR review, hosted checks or deployment were performed. Execution remains
disconnected and management default-off. Next: immutable definition cache design
with erasure handling, typed deterministic executor outputs, then existing UI and
daemon integration; preserve authority and shared-budget gates.
Documentation follows the frozen source commit. No worktrees removed.

## WED-375: ten hooks and UI items — 2026-11-18

Implementation worktree: C:/temp/wt/omnyid-runbooks, agent/codex/WED-375.
Frozen source: 7842bcc236bf93c1d282188a88d4c7b447721fad.
Verification worktree: C:/temp/wt/omnyid-runbooks-verify-43d7c830, clean detached
at that exact source. Documentation commits follow the verified source.

Completed checklist items (10): stage 2 selected starter first-run setup;
stage 4 passive HTTP and daemon/Watcher post-persistence hooks (2);
stage 10 Decision Queue question projection; stage 12 shared daemon wake path;
stage 14 semantic A2UI kinds, reused UI surfaces/primitives, consequence labels,
mobile/zoom/keyboard/screen-reader states, and explicit private export (5).
Totals: 72 complete, 45 remaining of 117. No source execution flag enabled.

Implementation:
- src/runbook_hooks.rs adds bounded, allowlisted, default-off adapters. Passive
  HTTP persists event_type and a reviewed reference-only projection into the
  existing daemon ledger. The central daemon insert hook re-reads owner storage
  for matching; repeated inserts use existing dispatch receipts.
- src/daemon_runtime.rs reuses health-maintenance wake/timer passes for waits.
  No independent scheduler or tool/model execution is introduced.
- src/runbook_activity.rs provides bounded instance/activity projections and
  semantic views. src/server/runbook_routes.rs adds listing and narrow
  enable/disable successor requests without normal UI fetching raw definitions.
- RunbookPanel, RunbookQuestionCard and runbookState integrate with AgentFleetView,
  DecisionQueueView and A2UIRenderer. Reuse DialogShell, EmptyState, toast and
  existing navigation. Typed answers, stale errors, export confirmation, account
  changes and session expiry are handled without raw backend errors or answers
  leaking into summaries. Semantic cards reload authenticated state.
- src/db.rs acquires users AccessExclusive before tenant DDL in account erasure.
  PostgreSQL logs proved a users/tenant agent_task_queue FK lock inversion during
  concurrent erasure; the fixed parallel suite and explicit concurrent erase pass.
  This lock is already required by dropping tenant FK constraints but is acquired
  earlier now; measure its account-wide blocking duration before deployment.
- src/server/mod.rs mounts existing production proactive routes in the test router.
  Tests live in runbook_api_postgres.rs, runbook_hooks_postgres.rs, frontend
  runbook-state.test.ts and the runbook-controls Playwright fixture/config/spec.

Final verification on the frozen SHA:
- Rust 1.95.0, CARGO_TARGET_DIR=C:/cargo-target, incremental off, -j 2,
  profile.test.package.omnyid-homeserver.debug=0 and codegen-units=16:
  runbook_foundation, runbook_storage_postgres, runbook_runtime_postgres,
  runbook_evidence_postgres, runbook_authority, runbook_authority_postgres,
  runbook_controls_postgres, runbook_event_adapter, runbook_api_postgres and
  runbook_hooks_postgres: 34 tests, exit 0, ordinary parallel test execution.
- cargo +1.95.0 build --lib with matching dev package settings: exit 0.
  Pinned toolchain unchanged; 1.95 remains the documented workaround for the host
  1.94 compiler crash.
- SDK npm ci then npm run build; frontend npm ci (lockfile unchanged), npx tsc
  --noEmit and npm run build: exit 0. Vite emitted existing responsive-screen and
  large-chunk warnings; this is a local production build, not a deployment.
- 49 Node tests passed across runbook state, A2UI content, four Fleet state suites,
  Decision Queue model/navigation/presentation and continuity navigation.
  Command uses --import ./tests/node-ts-specifier-hooks.mjs --experimental-strip-types.
- npx playwright test --config playwright.runbooks.config.ts: seven scenarios
  passed, including 320/375/1280 px, 200% zoom, axe serious/critical checks,
  confirmations/focus restoration, answer/cancel requests, stale errors,
  confirmed downloads, aborted exports on account/session change, flag-off hiding,
  and expired-session request-loop prevention.
- git diff --check clean. New source/test files are at most 205 lines.
  Global npm run test:line-budget remains failing: server/mod.rs 45,733 vs 45,717
  limit (baseline 45,732); db.rs 18,045 vs 17,986 (baseline 18,038). The focused
  Wedding file budget passes. No baseline inflation or unrelated extraction done.

Intermediate failures were resolved: a test moved-value error; missing proactive
route in the test router; cold Vite startup timeout; missing built local SDK for
Node integration tests; and the actual parallel erasure deadlock. Final source
was reverified after corrections; earlier evidence is superseded.

Remaining limitations: event-hook failures retain the source but need redelivery
or explicit internal retry; no automatic backlog recovery was added. Daemon
delivery is eventual at the maintenance cadence, with throughput/fairness review
required for large allowlists or persistent failing records. Stored definitions
contain user-authored text: explicit exports omit storage/provider credentials,
evidence and answers, but users should review authored text before sharing.
Existing six dependency advisories remain open; manifests/lockfiles unchanged,
so the prior audit was not rerun. Full legacy unit suites and full Wedding suites
were not run: focused affected frontend and backend tests were used; comprehensive
rollout gates remain unchecked. No remote CI for this local candidate, PR review,
hosted verification or deployment. GitHub returned old unrelated main failure
23703104075 and no deployments. No worktrees deleted.

Next: immutable definition caching with erasure semantics; typed entity and
shared-budget integration; deterministic executor/tool schema/approval contracts;
bounded models, provenance/outcome memory, retention and end-to-end starters.
Keep the flags off until the remaining rollout prerequisites and security review.
Dedicated disposable database container omnyid-runbook-wed375-pg stopped after verification.


## WED-375: ten more items, privacy and outcome memory (2026-11-18)

Implementation worktree: C:/temp/wt/omnyid-runbooks, branch agent/codex/WED-375.
Frozen source SHA: b15d44920be2dd6c03de5adff5168186e94c722f.
Verification worktree: C:/temp/wt/omnyid-runbooks-verify-43d7c830, clean detached
at that exact source SHA. Base remains 5536b83b2f9d2f58488a075f383c24f8f4f73d6c.
Documentation completion is a separate commit; do not build/deploy from primary.

Completed ten checklist items; 82 complete, 35 remaining of 117. Added:
- runbook_cache.rs and store/registry integration: bounded store-lifetime parsed
  definitions keyed by owner/version/full verified envelope hash, successor
  invalidation, owner/ledger/signature/decryption checks before every cache use.
- runbook_privacy.rs and evidence integration: exact typed document/task private
  AFP resolution, pre-body metadata/type/byte checks and persistent 128 source
  decrypt attempts per account per UTC day across all Runbooks. Failed decrypts
  charge allowance. Evidence Debug redacts bodies/references; logs remain fixed.
- runbook_provenance.rs: existing shared provenance builder/content, private
  companion records committed with current local, policy, wait and complete
  traces. Shared proactive_provenance.rs only adds stable source deduplication.
  Full actual tool/model/approval provenance stays unchecked until its executors
  supply real output and validated approval evidence; no grant is inferred.
- runbook_outcome.rs and authenticated outcomes route: immutable owner-bound
  acceptance/dismissal/regret receipts, one shared proactive_outcomes projection
  row per trace, exact retry suppression, regret without sample inflation,
  30-day shared feedback/cooldown/family ranking. Only verified Runbook receipts
  influence this runtime; generic proactive heuristic claims are ignored.
  Acceptance never changes the instance revision/state or grants approval.
- db.rs deletion list now includes behavioral_memory and proactive_outcomes.
  The new erasure test exposed their missing FK/cleanup; existing users-first
  lock order is retained. No extra lines added to the oversized file.
- Tests: new runbook_privacy_outcome_postgres.rs; expanded API route abuse cases;
  evidence test expectation reflects supported document references. No UI source.

Final exact-SHA verification (toplevel/HEAD/clean status printed before commands):
- Rust 1.95.0, CARGO_TARGET_DIR=C:/cargo-target, incremental off, -j 2,
  profile.test.package.omnyid-homeserver.debug=0, codegen-units=16:
  cargo test --test runbook_foundation --test runbook_storage_postgres
  --test runbook_runtime_postgres --test runbook_evidence_postgres
  --test runbook_authority --test runbook_authority_postgres
  --test runbook_controls_postgres --test runbook_event_adapter
  --test runbook_api_postgres --test runbook_hooks_postgres
  --test runbook_privacy_outcome_postgres: all 39 tests passed, exit 0.
  Includes concurrent erase/step/delivery races and new quota/cache/provenance/
  feedback/owner isolation tests against disposable local omnyid_test port 55475.
- cargo +1.95.0 build --lib -j 2 with matching dev package settings: exit 0.
  Pinned Rust toolchain unchanged; 1.95 remains the host compiler workaround.
- npm run test:line-budget: exit 1, same two pre-existing overages:
  src/server/mod.rs 45,733 vs 45,717; src/db.rs 18,045 vs 17,986.
  Focused Wedding line budget passes; new files max 493 lines. No budget inflation.
- cargo +1.95.0 audit --no-yanked --json: exit 1. Advisory DB refresh completed,
  latest DB commit 233155b4025b854c68a4b199c0e32d7fd53291a2 (2026-11-17).
  Six vulnerabilities: ammonia 4.2.4 RUSTSEC-2026-0533; crypto-bigint 0.5.5
  RUSTSEC-2026-0387; libsqlite3-sys 0.30.1 RUSTSEC-2026-0459;
  pulldown-cmark 0.13.4 RUSTSEC-2026-0414/0433; rsa 0.9.10 RUSTSEC-2023-0071.
  Also three unmaintained and two unsound warnings. Evidence:
  C:/temp/wt/runbook-audit-b15d4492.json. No dependencies changed. Registry/yanked
  checks excluded; scan execution complete does NOT mean security gate passing.
- git diff --check clean. Frontend source is unchanged, so frontend typecheck,
  production build and browser suites were not repeated. Comprehensive legacy
  Rust/Wedding suites and hosted gates remain separate unfinished checklist items.

Intermediate failures resolved before final verification: API test variable
shadowed a saved definition; erasure left the behavioral-memory counter behind.
The initial candidate 466c45890e6f4addedb5bee597fa45a699eb800c is superseded.

Limits/next action: store-lifetime cache deliberately does not avoid authorized
ledger reads or persist plaintext across requests. Shared decrypt reservations
use a second committed connection while holding the owner transaction; pool
exhaustion fails closed. Counter is Runbook source-evidence allowance, not an
invented global Watcher/token budget. Unsupported entity/provider IDs remain
omissions. Outcomes are API-backed; no new feedback UI was added. Retention,
actual deterministic tool/approval dispatch, bounded model execution and full
starter end-to-end cases remain. Keep rollout flags off and address dependency
advisories/line-budget failures before release/security review. No PR review,
remote CI for this candidate, hosted test or deployment. GitHub query returned
old unrelated main failure 23703104075 and no deployment records. No worktrees
were removed. Source commits and this handoff are available for the next review.
Dedicated disposable database container omnyid-runbook-wed375-pg stopped after verification.
