# Handoff

This file is for agent commentary, session notes, and coordination details.
It is not project truth. Keep durable facts in `.agent/PROJECT_STATE.md`, task
ownership in `.agent/TASKS.yaml`, and architecture decisions in
`.agent/DECISIONS.md`.

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
