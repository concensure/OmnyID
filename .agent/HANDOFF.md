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
- `git diff --check` (pass; CRLF conversion warnings only)

Unresolved problems:

- M3 photo-admin add/replace/provenance lifecycle has not yet been proven in
  this pass; the comparison renderer has the truthful fallback only.
- M6 still needs durable resolution/deferral successor wiring so a resolved
  quote deterministically leaves DecisionOS.
- Full build, complete wedding suite, full Rust suite, CI/deployment checks,
  and Oracle production smoke remain outstanding. Do not deploy this checkpoint.
- Existing line-budget failures remain baseline defects; neither cap was raised.

Recommended next action:

- Complete the existing photo-admin lifecycle and quote resolution successor,
  then run M7's full verification matrix before an Oracle deployment.
