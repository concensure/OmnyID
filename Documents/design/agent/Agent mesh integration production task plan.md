# Agent Mesh Integration and Production Closure Task Plan

Status: ready for implementation planning
Prepared: 2026-10-08
Task family: `AGM`
Direction source: [Agent mesh integration spec.md](Agent%20mesh%20integration%20spec.md)

The source spec is architectural direction, not verified truth. Every file path, symbol, schema,
line number, migration number, operational assumption, and production-state claim must be checked
against the task branch and the live machine authority before it is used.

## 1. Required outcome

Deliver one production release in which:

1. Background Watcher events, proactive suggestions, State Synthesizer output, projection output,
   topology links, and Master Agent continuity reads use an explicit, tested storage contract.
2. Background agents have real callers, bounded wake-up rules, enforced write policies, visible
   failures, observable heartbeats, and replay-safe behavior.
3. The user can configure and audit proactivity from an accessible mobile-first settings surface.
4. Existing data is cut over without silently losing active suggestions or continuity state.
5. Large legacy files do not grow; new behavior lives in focused modules.
6. The current task ledger and worktree are reconciled. No task remains inaccurately
   `in_progress`, no intended source change remains uncommitted, and no generated file or secret is
   committed merely to make Git look clean.
7. The integrated release is merged, deployed to a real staging authority, promoted to Oracle
   production, and verified live against the exact release SHA.
8. PARA continues to work at its existing level. PARA is a compatibility lane, not a feature
   expansion and not a release blocker unless this work causes a regression.

Internal design documents and test evidence are not public runtime assets. "Deployed" means that
the release commit containing the application changes is live; internal files must remain blocked
by the production static-file guard.

## 2. Executor model and cost policy

Use **`gpt-6-astra` with `medium` reasoning** as the primary coding model for every AGM task.

This is the best accuracy/cost default for a long, cross-cutting change involving Rust, Postgres,
TypeScript, SolidJS, daemons, migrations, and production operations. OpenAI describes GPT-6 Astra
as its highest-intelligence model for demanding reasoning, coding, and professional work, and notes
that it can use fewer output tokens per task despite a higher per-token price:
[Using GPT-6](https://developers.openai.com/api/docs/guides/latest-model).

Cost controls:

- Stay at `medium` for discovery, implementation, tests, documentation, and routine fixes.
- Temporarily use `high` only for a bounded review of storage cutover, tenant isolation,
  migration/rollback safety, security boundaries, or a failed production gate. Return to `medium`
  after the review.
- Do not use `xhigh`, `max`, or `ultra` by default. They require a recorded reason in the task
  handoff.
- Do not repeatedly rerun broad suites after they pass. Rerun focused checks after a focused edit,
  then run each required release gate once on the final candidate SHA.
- Use one agent by default. Delegate or create subagents only when the user explicitly authorizes
  it and file ownership is disjoint.

## 3. Verified baseline on 2026-10-08

This baseline is evidence for planning, not a promise that it will still be true when a task is
claimed.

### Repository and delivery state

- Planning began from commit `e36c1bc` on `agent/codex/WED-175`; the planning branch is
  `agent/codex/AGM-00`.
- `git status --porcelain` reported 448 untracked entries and no tracked modifications. The entries
  include source, design documents, generated artifacts, backups, tool configuration, test output,
  and a file named `Runpod api.txt` that must be treated as a potential secret until inspected by a
  safe secret-scanning workflow.
- Local `main` was 256 commits ahead of and one commit behind `origin/main`. Do not force-push or
  infer that local history is the production release line.
- `.agent/TASKS.yaml` contained seven `in_progress` tasks: `UX-MFH-01`, `WED-146`, `DEV-001`,
  `WED-142`, `WED-143`, `WED-150`, and `WED-153`. It also used the undeclared lifecycle status
  `completed` for four newer tasks.
- The GitHub Actions history visible through `gh` contained old failing runs for `origin/main` and
  no deployment records. Oracle deployment evidence currently lives in local scripts/artifacts and
  `.agent/HANDOFF.md`, not GitHub Deployments.
- The latest handoff says WED-153/WED-174 reached Oracle, WED-175 did not. It also says Oracle disk
  usage was 91% and the remote environment did not set `OMNYID_ENV=production`. Both are release
  blockers until freshly verified and corrected through the reviewed configuration path.
- No real staging environment was identified. Runtime staging scripts are packaging steps, not a
  staging deployment authority.

### Current implementation facts

- `src/agent_store.rs`, `src/proactive_suggestion_store.rs`,
  `src/agent_event_pipeline.rs`, `src/state_synthesizer_daemon.rs`,
  `src/daemon_write_policy.rs`, and `src/daemon_heartbeat.rs` do not yet exist.
- `Db::store_private_message` writes to the tenant `"user_<id>".messages` table with
  `ON CONFLICT (id) DO NOTHING`; `Db::upsert_private_message` is a separate mutating path.
- `Db::store_private_snapshot_message` currently upserts and prunes snapshots.
- Continuity readers still query `public.messages`; projection and several operational readers use
  `public.afp_messages`; proactive suggestion lifecycle methods still use
  `public.proactive_suggestions`.
- `suggestion_resolution` is not registered in `src/message.rs` or the TypeScript SDK.
- There are two `internal_event_dispatcher_loop` implementations. The spawn in `server/mod.rs`
  currently resolves to the local implementation unless imports prove otherwise.
- The IMAP implementation is `src/gateway/imap_sync.rs`, not `src/imap_sync.rs`.
- `DaemonKind` and `allowed_message_types` already live in `src/knowledge_curator.rs`. System
  registration enumerates six daemon kinds in `src/daemon_registry.rs`.
- UI daemon presets and palette entries live in
  `solid-ui/src/lib/workflowGraphTypes.ts`. No matching `DAEMON_PRESETS` contract was found in
  `typescript-sdk/src/workflows.ts`; add SDK surface only if the fresh audit finds a real consumer.
- Migration `0081_daemon_heartbeat_retention.sql` already exists. Heartbeat work must extend rather
  than duplicate that policy.
- The latest numbered runtime migration is currently `0100_wedding_vendor_rooms.sql`. Calculate the
  next number at implementation time; never reserve `0101` based only on this document.
- Both an external `solid-ui/src/components/DailyBriefingBar.tsx` and an inline function named
  `DailyBriefingBar` in `DecisionOSHomeView.tsx` exist. Verify imports and behavior before deleting
  either.
- The cited large files are substantially over 1,000 lines: `db.rs` 17,928,
  `server/mod.rs` 45,651, `proactive_routes.rs` 13,794, `continuity_routes.rs` 8,685,
  `dashboard_routes.rs` 5,323, `state_synthesizer.rs` 4,099, `curator_runtime.rs` 2,370,
  `AgentSettingsView.tsx` 3,619, `api.ts` 8,816, and `src/gateway/imap_sync.rs` 1,392.

## 4. Corrections to the direction spec

These corrections are mandatory unless new evidence overturns them.

1. **No blind no-backfill cutover.** Before retiring `proactive_suggestions` reads, count active
   production rows and choose an operator-approved cutover: one-time additive conversion,
   bounded dual-read with idempotent materialization, or explicit expiry. Active user state must
   not disappear because the direction spec says "no backfill".
2. **Do not require `rg proactive_suggestions src` to be empty.** Response field names and historic
   migrations may legitimately retain the term. The gate is zero runtime SQL dependence on the
   legacy table after cutover, plus an explicit decision for operational cleanup scripts.
3. **Do not add a second policy source.** Either move `DaemonKind::allowed_message_types` behind
   `daemon_write_policy` or make it delegate there. There must be one enforceable allowlist.
4. **Do not duplicate heartbeat retention.** Reuse migration 0081, existing
   `daemon_heartbeats`, and current metrics wherever their semantics fit.
5. **Do not assume the TypeScript SDK owns daemon palette data.** The UI currently owns it.
   Introduce a shared SDK contract only if this reduces real duplication and has a consumer.
6. **Do not treat line numbers as contracts.** Resolve symbols with `rg` on each task branch.
7. **Do not treat runtime staging as deployed staging.** A staging gate needs a URL/environment,
   deployed SHA, health/readiness, migration result, and smoke evidence. If no environment exists,
   create one or obtain an explicit user decision before promotion.
8. **Do not commit every untracked path.** Secrets, credentials, caches, build outputs, backup
   payloads, local tool state, and generated proof directories must be ignored, relocated, or
   preserved outside Git. Clean means zero unexplained entries, not zero judgment.
9. **Do not claim production from a handoff note.** Production truth comes from the deployment
   mechanism, runtime health, and an exact live SHA/version signal.
10. **Do not let PARA expansion delay the mesh.** Preserve its routes and run a smoke test. New PARA
    features belong to a separate task unless required to repair a regression caused here.

## 5. Program-wide rules

- Follow `AGENTS.md`: one owner per `in_progress` task, task branches, PR review boundaries,
  machine-owned verification, and a HANDOFF entry per task.
- Fetch before branching. Reconcile the one remote-only `main` commit without rewriting shared
  history.
- Never use a dirty primary worktree as the release source. Use a clean task worktree and create a
  release-candidate worktree from the reviewed integration SHA.
- Preserve tenant isolation. Every agent-store query must derive and validate the tenant table via
  existing helpers; never accept a table/schema identifier directly from request input.
- AFP evolution is additive. Readers tolerate absent optional fields before writers rely on them.
- Agent-derived state is append-only in the hot path. Resolution and supersession are parented
  messages. Archive/retention is the only reviewed physical-removal path.
- Writes are idempotent by stable semantic key or message id. Retry tests are required.
- GET routes are read-only. Bootstrap freshness work may invoke an explicit bounded command path,
  but it must not hide mutations inside a normal list endpoint.
- Errors on durable writes are never swallowed. Routes return contextual 5xx receipts; daemon
  passes record structured errors and continue only where safe.
- New modules must stay under their budgets. Any touched file already above 1,000 lines must have
  a non-positive net line delta, measured against its merge base.
- No new npm package, new color token, `!important`, or broad formatter rewrite without a separate
  recorded decision.
- Migrations are additive, transactional where Postgres permits, restart-safe, and rehearsed on a
  production-shaped copy before staging.
- Never print, commit, or copy secret values into task artifacts. Secret scanning records paths and
  rule names only.

## 6. Dependency map

```text
AGM-00 repository/task/release intake
  -> AGM-01 verified contracts and cutover ADR
       -> AGM-02 tenant agent store + AFP contract
            -> AGM-03 daemon write policy + visible errors
            -> AGM-04 suggestion lifecycle + legacy cutover
            -> AGM-05 append-only supersession + retention
                 -> AGM-06 shared event pipeline
                 -> AGM-07 State Synthesizer daemon/bootstrap
                      -> AGM-08 projection gate and honest status
                 -> AGM-09 shared heartbeat/operations path
            AGM-04 + AGM-08 -> AGM-10 proactive controls UI/API cleanup
  AGM-03..10 -> AGM-11 E2E, security, performance, and observability closure
  AGM-11 -> AGM-12 integration, ledger closure, and clean release candidate
  AGM-12 -> AGM-13 staging deploy, soak, and rollback rehearsal
  AGM-13 -> AGM-14 production canary, promotion, proof, and final closure

AGM-PARA-01 compatibility smoke runs with AGM-11 and AGM-13; it is off the critical path unless it
finds a regression introduced by AGM work.
```

Tasks may be implemented as separate PRs, but production must use one reviewed integration SHA that
is a descendant of every required task commit.

---

## AGM-00 - Repository, task, and release intake

Branch: `agent/codex/AGM-00`
Depends on: none

### Work

1. Fetch `origin`, record local/remote ancestry, and identify the actual release base. Do not merge
   or rebase shared branches until the branch owner and commit graph are understood.
2. Inventory every `.agent/TASKS.yaml` entry. For the seven current `in_progress` items, inspect
   their branches, commits, handoffs, tests, and production ancestry:
   - if implementation is already integrated, verify it and move it through review to `done`;
   - if it is incomplete, finish it before AGM production promotion;
   - if it has been superseded, record the superseding commit and close it honestly;
   - do not merely rename `in_progress` to make the count zero.
3. Replace undeclared `completed` statuses with the allowed lifecycle value `done` only after their
   acceptance evidence and production ancestry are verified.
4. Produce a machine-readable worktree manifest for all untracked paths with one disposition:
   `commit_source`, `commit_documentation`, `generated_ignore`, `secret_relocate`,
   `external_archive`, `delete_with_owner_approval`, or `needs_owner_decision`.
5. Run secret scanning before opening or staging suspicious files. Treat `Runpod api.txt`, env-like
   files, credentials, private keys, database dumps, backups, and tool configs as sensitive.
6. Add narrow `.gitignore` rules for reproducible outputs and local state. Do not use a broad rule
   that hides source or documents.
7. Commit intended files in coherent history. Relocate secrets to an existing ignored secret path
   or external secret manager. Preserve user-owned unknown files until their owner decides.
8. Record the current production SHA, Oracle disk/capacity report, backup status, deployed migration
   set, and strict production-env status from live authorities.

### Gate

- The task ledger is valid YAML and uses only declared lifecycle statuses.
- Every prior `in_progress` task has a documented evidence-backed path to completion in this
  release train.
- The untracked manifest accounts for every status entry and no secret value appears in Git diff,
  logs, or artifacts.
- Release base and production base are identified without force-push or history loss.

## AGM-01 - Verify storage, ownership, and cutover contracts

Branch: `agent/codex/AGM-01`
Depends on: AGM-00

### Work

1. Trace every producer and reader for the message families named in the direction spec. Generate a
   checked matrix containing producer, store, encryption mode, retention class, reader, route,
   tenant boundary, and current production row count.
2. Trace all `store_message`, `store_private_message`, `upsert_private_message`,
   `store_private_snapshot_message`, and `insert_daemon_afp_message` call sites. Record why any
   agent-owned type remains public.
3. Verify Master orchestrator storage for `projection` and `temporal_projection` rather than
   assuming those results are persisted.
4. Inspect production counts and recent samples by type without exporting decrypted user content.
5. Decide and record:
   - canonical hot store per message family;
   - supersession identity and chain-head rules;
   - active-suggestion cutover policy;
   - archive and expiry policy;
   - public/federated exceptions;
   - encryption and selective-decryption behavior;
   - rollback behavior while old and new readers coexist.
6. Add one ADR entry to `.agent/DECISIONS.md`. Any intentional departure from the direction spec
   must be explicit.

### Gate

- The matrix has no unknown producer, reader, or production-data disposition.
- A rollback-safe suggestion cutover is approved; active rows cannot silently vanish.
- Tenant isolation, encryption, retention, and public-message exceptions have testable contracts.

## AGM-02 - Canonical tenant agent store and AFP schema

Branch: `agent/codex/AGM-02`
Depends on: AGM-01

### Files

- New `src/agent_store.rs`, target at most 400 lines.
- `src/message.rs`, `src/lib.rs`, focused DB modules/tests, and TypeScript schema files.
- Thin call-site changes in current readers/writers; no growth in large files.

### Work

1. Reuse existing private-table helpers. Add only missing queries to the focused module.
2. Implement typed operations for list-by-types, latest chain head, semantic equality/no-op, insert
   with parent linkage, and snapshot staleness. Return explicit outcomes such as `Stored`,
   `Unchanged`, and `Rejected`.
3. Include `parent_id`, `from_agent`, references, retention metadata, and timestamps in the common
   read shape. Do not silently narrow the shape expected by existing callers.
4. Register `suggestion_resolution` and any missing existing types in Rust and TypeScript schemas.
   Use optional additive content fields and validate outcome enums.
5. Repoint continuity, synthesizer, projection-objective, topology-neighborhood, outcome-source,
   and Master-output paths only after contract tests pin their old response shapes.
6. Add tests for tenant separation, invalid tenant identifiers, ordering, subtype filtering,
   identical-content skip, parent linkage, concurrent retries, encrypted/private content, and
   `metadata.store:false`.

### Gate

- No named agent reader uses the wrong physical store.
- Two users with identical message ids cannot read or supersede each other's data.
- Retry and concurrency tests produce one logical head with valid lineage.
- Large-file line deltas are non-positive.

## AGM-03 - Daemon write policy, curator loop prevention, and visible errors

Branch: `agent/codex/AGM-03`
Depends on: AGM-02

### Work

1. Create one policy authority, preferably `src/daemon_write_policy.rs` at most 200 lines. Refactor
   `DaemonKind::allowed_message_types` to delegate to it or move the data completely.
2. Enforce the policy inside the canonical store so callers cannot bypass it accidentally.
3. Update curator queue eligibility to reject derived/daemon-produced message families and daemon
   identities. Keep user-facing watcher alerts eligible only if the ADR explicitly requires it.
4. Replace swallowed durable-write errors in the scoped paths with structured logs and explicit
   route/pass outcomes. Required fields: daemon kind, user id or privacy-safe hash, message id,
   AFP type, operation, and remediation reason.
5. Add a metric for rejected writes and failed durable writes. Do not include message content in
   labels.
6. Tests must prove every daemon's allowed and rejected types and prove a derived message cannot
   re-enter the curator indefinitely.

### Gate

- There is one allowlist source.
- Out-of-policy writes fail closed, create no row, and emit bounded telemetry.
- A storage failure cannot be reported as success by an HTTP route or daemon pass.

## AGM-04 - AFP-native proactive suggestion lifecycle and safe cutover

Branch: `agent/codex/AGM-04`
Depends on: AGM-02, AGM-03

### Files

- New `src/proactive_suggestion_store.rs`, target at most 350 lines.
- Focused migrations/cutover command if AGM-01 requires them.
- Thin changes in `db.rs`, dashboard/proactive routes, SDK response schemas, and operations scripts.

### Work

1. Implement list-active, active headers, active-by-heuristic, resolve, and idempotent resolution
   over tenant AFP messages.
2. Define active state by the latest valid resolution child. Handle duplicate, conflicting, late,
   expired, and missing-parent resolutions deterministically.
3. Preserve outcome/EMA updates, but make suggestion resolution and outcome recording one explicit
   transactional operation or a recoverable two-step workflow with reconciliation.
4. Execute the approved legacy cutover. If using dual-read, add an end date and telemetry; do not
   leave a permanent split-brain path.
5. Move persistence out of GET handlers. Suggestion creation belongs to the event/synthesis command
   path.
6. Update cleanup/inventory scripts so they report the new store correctly while retaining safe
   handling of any legacy table.
7. Add migration/cutover tests using active, dismissed, duplicate, expired, and malformed legacy
   rows.

### Gate

- Active suggestions before cutover remain visible after cutover according to the ADR.
- Accept/dismiss is idempotent and replay-safe.
- GET suggestion and bootstrap routes perform no durable writes.
- Runtime SQL no longer depends on the legacy table after the bounded cutover ends.

## AGM-05 - Append-only derived state and archive retention

Branch: `agent/codex/AGM-05`
Depends on: AGM-02, AGM-01

### Work

1. Convert synthesizer snapshots and topology-link updates from upsert/prune behavior to immutable
   insertion with stable semantic identities and `parent_id` chains.
2. Readers select one deterministic head per semantic identity and detect forks. Do not conceal a
   fork by timestamp alone; emit reconciliation telemetry.
3. Keep generic DB prune/upsert methods if other product domains use them. Remove them only after a
   repository-wide caller audit.
4. Extend the existing archive path to archive superseded derived messages older than the approved
   retention window while preserving heads, unresolved evidence, legal holds, and restore ability.
5. Reuse existing retention classes and migration 0081 where applicable.
6. Test unchanged snapshots, changed snapshots, chain linkage, fork handling, archive selection,
   restore, and head preservation.

### Gate

- Agent hot paths issue no UPDATE/DELETE against derived message content.
- Only the reviewed archive/expiry path physically removes or archives eligible records.
- Restoring an archive reconstructs valid chains and current heads.

## AGM-06 - Shared event pipeline and real Watcher runtime callers

Branch: `agent/codex/AGM-06`
Depends on: AGM-03, AGM-04, AGM-05

### Files

- New `src/agent_event_pipeline.rs`, target at most 600 lines.
- Thin adapters in passive-event, `src/gateway/imap_sync.rs`, and internal-event dispatch.

### Work

1. Define a typed pipeline input/outcome and one ordered path: validate/dedupe, persist event,
   watcher enrichment/scoring, budgeted escalation, proactive engine, provenance, store, notify.
2. Inventory watcher and engine heuristic registries. Assign each heuristic one owner and add a
   uniqueness test over heuristic ids.
3. Move behavior from the large passive-event route without rewriting semantics. Make the handler
   a thin authentication/validation adapter.
4. Route eligible IMAP events through the pipeline after current email/planner enrichment.
5. Resolve the duplicate `internal_event_dispatcher_loop`; retain one implementation and test that
   the spawned loop is the retained one.
6. Add event-id/idempotency behavior so HTTP retries, IMAP replay, and internal redelivery cannot
   produce duplicate logical suggestions.
7. Apply queue bounds, timeouts, cancellation, per-user fairness, and backpressure. Never let one
   tenant monopolize the loop.

### Gate

- HTTP, IMAP, and internal fixtures traverse the same pipeline and produce equivalent AFP bundles.
- Duplicate delivery produces one logical result.
- No heuristic id is evaluated twice for one event.
- Load tests demonstrate bounded memory/queue growth and per-user fairness.

## AGM-07 - State Synthesizer daemon and bounded bootstrap freshness

Branch: `agent/codex/AGM-07`
Depends on: AGM-04, AGM-05, AGM-06

### Work

1. Add Background Watcher and State Synthesizer daemon kinds, display names, registration,
   serialization, policy, and UI palette support. Reconcile existing production registrations
   without duplicating daemon rows.
2. Create `src/state_synthesizer_daemon.rs`, target at most 300 lines. Subscribe before scanning,
   persist a cursor, honor shutdown, debounce per user, apply jitter/backoff, and recover after
   restart.
3. A pass reads canonical unresolved state, synthesizes once, persists promoted suggestions, emits
   a handoff, and requests projection only when the handoff contract escalates.
4. Implement bootstrap freshness through an explicit bounded command/service call. Coalesce
   concurrent opens for the same user. Timeout returns existing data with an honest stale marker;
   it must not claim refresh success.
5. Decide the fate of `synthesize_para_overview` from callers and tests. Delete it if redundant;
   otherwise wire it once. This is not permission to expand PARA.
6. Add tests for debounce, stale/fresh boundaries, concurrent bootstrap, restart/cursor recovery,
   idle backoff, shutdown, and one user's failure not blocking another.

### Gate

- A qualifying watcher event yields a fresh snapshot within the documented SLO.
- Fresh bootstrap does not synthesize; stale concurrent bootstrap runs at most once per user.
- Daemon restart does not replay completed work into duplicates.

## AGM-08 - Projection budget gate, fallback, and truthful status

Branch: `agent/codex/AGM-08`
Depends on: AGM-07

### Work

1. Route HTTP and daemon projection requests through one service.
2. Permit the Master/LLM path only when the handoff escalates and budget, configuration, and a
   usable Master instance exist.
3. Store heuristic projection/temporal projection fallback in the canonical tenant store when the
   LLM path is unavailable and fallback is safe.
4. Return typed statuses that describe completed effects: `queued_llm`, `heuristic_stored`,
   `unchanged`, `skipped`, or `failed`, each with a stable reason code.
5. Ensure queued work has a durable job/correlation id and eventual outcome; never return queued
   for work that was dropped.
6. Test no key, exhausted budget, missing Master, LLM success, LLM failure/fallback, duplicate
   request, and storage failure.

### Gate

- Every status maps to observable state and a correlation id where asynchronous.
- No-LLM staging creates a readable heuristic projection.
- Budget exhaustion never triggers a paid call.

## AGM-09 - Shared daemon heartbeat and operational visibility

Branch: `agent/codex/AGM-09`
Depends on: AGM-03, AGM-07

### Work

1. Create one heartbeat helper, target at most 200 lines, and adapt every system daemon to it.
2. Distinguish ephemeral relay presence, durable short-retention AFP status, and the existing
   relational heartbeat/metrics row. Define which is authoritative for readiness.
3. Rate-limit durable heartbeats and reuse the existing retention policy. Idle passes still update
   liveness without unbounded AFP growth.
4. Include daemon version/release SHA, pass outcome, lag/cursor age, and bounded error counts. Do
   not include private message content.
5. Update `/readyz` and the daemon panel to distinguish starting, healthy, degraded, stale, and
   intentionally disabled.
6. Test rate limits, expiry, clock skew, restart, stale detection, and readiness behavior.

### Gate

- Every registered daemon has a live status on staging.
- Idle operation stays within the documented row-growth budget.
- A deliberately stopped synthesizer becomes stale and affects readiness according to policy.

## AGM-10 - Mobile proactive controls and API cleanup

Branch: `agent/codex/AGM-10`
Depends on: AGM-04, AGM-08, AGM-09

### Work

1. Add focused proactive-controls component, state, and API modules within the source spec's line
   budgets. Mount them in Agent Settings with minimal changes to the large view.
2. Implement level, pack, per-heuristic autonomy, effective cap explanation, save/error receipt,
   and recent-action audit behavior against verified current routes.
3. Use pessimistic or reversible optimistic updates. Roll back failed toggles and never show an
   unpersisted autonomy change as saved.
4. At widths 360, 390, and 640 pixels verify no horizontal scroll, at least 44px targets,
   safe-area behavior, keyboard operation, focus restoration, screen-reader names, reduced motion,
   and 200% zoom.
5. Trace both DailyBriefingBar implementations before cleanup. Remove only dead code and update
   Vite/manual chunk configuration if necessary.
6. Move continuity API helpers into a focused module where practical; otherwise make non-growing
   route corrections in `api.ts`. Normalize every new projection status.
7. Preserve existing desktop navigation and all PARA routes.

### Gate

- Settings persist across reload and failure states are honest.
- Automated accessibility/viewport tests pass at the target widths.
- No large UI file has positive net line growth; no new package/color/`!important` is introduced.

## AGM-11 - Integrated E2E, security, performance, and observability closure

Branch: `agent/codex/AGM-11`
Depends on: AGM-03 through AGM-10

### Work

1. Add an opt-in Postgres E2E lane that drives passive email -> shared pipeline -> watcher or
   suggestion -> synthesizer -> projection fallback -> bootstrap/list -> accept/dismiss -> resolved
   snapshot. Assert the physical store and tenant boundary at every hop.
2. Add restart/replay E2E coverage and a cutover fixture containing realistic legacy suggestion
   states.
3. Add authorization tests for cross-tenant ids, parent ids, outcome ids, daemon identities, and
   admin/ops routes. Run existing secret/static-file guards.
4. Measure query count and latency for pipeline, synthesis, bootstrap, and list-active at realistic
   row counts. Add indexes only from measured query plans.
5. Add metrics/traces for pipeline outcomes, queue lag, synth duration, projection path, policy
   rejection, store failure, cutover fallback, and daemon freshness. Labels must be bounded.
6. Add or verify a runtime version signal containing release SHA, build time, environment, and
   schema version. This may consume DEV-003 if implemented; do not create a competing endpoint.
7. Run the required matrix on the final task SHA:
   - `cargo fmt --check`
   - `cargo check`
   - `cargo test --lib`
   - focused DB E2E with `OMNYID_RUN_DB_SMOKE=1`
   - relevant integration tests including `api_flows`
   - TypeScript SDK typecheck, build, and tests
   - Solid UI typecheck, line-budget test, focused unit tests, production build, and browser tests
   - deployment-script self-tests and static-file security checks

### Gate

- All required checks have machine artifacts tied to the exact SHA.
- There is no unresolved high/critical security finding or unbounded performance regression.
- Version, health, readiness, metrics, and logs are sufficient to prove and diagnose deployment.

## AGM-PARA-01 - PARA compatibility lane (non-priority)

Branch: may be folded into AGM-11 if no code changes are needed.
Depends on: AGM-07, AGM-10

### Work and gate

- Smoke existing PARA navigation, list/load, create/update, and any continuity overview already in
  production.
- Verify agent mesh messages do not leak into PARA lists unless an existing documented projection
  puts them there.
- Do not redesign PARA, add synthesis features, or delay AGM for pre-existing PARA defects.
- If AGM causes a regression, fix it before staging. Record unrelated defects as separate proposed
  tasks.

## AGM-12 - Integration, task-ledger closure, and clean release candidate

Branch: `agent/codex/AGM-12`
Depends on: AGM-11 and AGM-PARA-01 smoke

### Work

1. Merge reviewed AGM PRs in dependency order into a release integration branch. Resolve conflicts
   from the current in-progress wedding/coordination tasks by consuming their reviewed commits,
   never by reimplementing or overwriting them.
2. Re-run the full release matrix once on the integration SHA.
3. Reconcile every task that was `in_progress` at AGM-00. The release cannot advance while any has
   uncommitted implementation, an unreviewed branch, or a false status.
4. Re-run the worktree manifest. Commit intended source/docs/data through reviewed commits; add
   precise ignores for generated output; relocate secrets; obtain owner decisions for unknowns.
5. Merge to `main` through a PR. Fetch again, verify ancestry, create an annotated release tag, and
   push branch/tag without force.
6. Build immutable artifacts/images from the merged release SHA, not from a dirty working tree.

### Gate

- `git status --porcelain` is empty in the release worktree and no stash contains release work.
- No task remains `in_progress` or `review` without an explicit user-approved exclusion. Under the
  requested closure, the default is to finish and include all seven baseline in-progress tasks.
- `main`, tag, artifact/image labels, migration manifest, and test artifacts identify one SHA.
- Internal documents remain excluded from public static delivery.

## AGM-13 - Staging deployment, soak, and rollback rehearsal

Branch: `agent/codex/AGM-13` or an operations PR
Depends on: AGM-12

### Work

1. Establish or select a real staging environment with production-equivalent Postgres features,
   tenant schemas, daemon processes, encryption/secret wiring, and operational endpoints.
2. Take and verify a pre-deploy backup. Rehearse migrations and rollback/restore on the staging
   copy.
3. Deploy the immutable release artifact. Record deployment id, environment, SHA, schema version,
   start/end time, and operator.
4. Run health/readiness, runtime version, login, dashboard bootstrap, mesh E2E, daemon freshness,
   proactive controls, cross-tenant denial, PARA smoke, and static-file guard checks.
5. Run an observation window long enough to exercise debounce, idle heartbeat, expiry, restart, and
   retry behavior. Default minimum: 24 hours for the new background mesh unless the user approves a
   shorter emergency release window.
6. Perform a rollback rehearsal and prove service/data recovery, then redeploy the candidate and
   repeat smoke checks.

### Gate

- Staging authority reports the exact release SHA and all gates pass.
- No unexplained policy rejection, queue growth, suggestion duplication, readiness flap, or tenant
  leak appears during the observation window.
- Rollback and re-promotion are both demonstrated from machine evidence.

## AGM-14 - Oracle production canary, promotion, and final closure

Branch: `agent/codex/AGM-14` or an operations PR
Depends on: AGM-13

### Preconditions

- Oracle disk/capacity preflight passes with safe headroom for upload, image build, backup, and
  restore. Do not bypass the disk gate.
- The remote environment satisfies the strict production startup policy, including
  `OMNYID_ENV=production`, secret-file resolution, secure storage, integrations, and readiness
  requirements.
- A fresh verified backup and a recent successful restore proof exist.
- The production deployment source is the immutable staged SHA.

### Work

1. Run the repository's production go/no-go and deployment preflight against fresh evidence.
2. Deploy through `scripts/deploy-oracle.ps1` or its reviewed successor with post-deploy proof
   enabled. Do not use skip flags to turn a failed gate green.
3. Start with a bounded canary tenant/account. Verify the complete agent-mesh flow, daemon health,
   storage location, resolution, projection fallback, controls, and audit trail.
4. Watch errors, latency, queue lag, DB growth, policy rejections, and readiness through the canary
   window. Roll back on the documented thresholds.
5. Promote to the intended production population. Run `/healthz`, `/readyz`, runtime version,
   authenticated login/bootstrap, one real critical mesh flow, PARA smoke, and public/static-file
   checks.
6. Run Oracle production proof, backup verification, and the required restore evidence. Compare the
   live SHA and schema version to the release tag.
7. Update `.agent/TASKS.yaml`, `.agent/HANDOFF.md`, and release notes with links/paths to machine
   evidence. Do not hand-write health as passing in project-state docs.
8. From a fresh clone of the tag, confirm there is no missing migration, source asset, generated
   dependency, or undocumented manual production patch.

### Final definition of done

- All AGM tasks and the seven baseline in-progress tasks are `done` with evidence, or the user has
  explicitly changed the release scope. None remains silently in progress.
- All intended source, docs, migrations, tests, and operational scripts are committed and merged.
- The release worktree is clean. Secrets and generated artifacts are safely excluded, not committed.
- The exact reviewed release SHA is present in `main`, the release tag, staged artifact, and live
  production runtime.
- Production health/readiness and the authenticated mesh smoke are successful after promotion.
- Rollback remains available, backup/restore evidence is current, and no manual-only production
  change is missing from Git.
- Internal documentation is not publicly served.

## 7. Release evidence bundle

The final handoff must identify, without embedding secrets:

- task/PR/commit map for AGM and reconciled baseline tasks;
- worktree-disposition manifest and secret-scan summary;
- final Git status, main SHA, tag, artifact digest, staging SHA, and production SHA;
- migration plan, applied schema version, cutover counts, and rollback result;
- test/build artifacts tied to the release SHA;
- staging deployment record, observation-window metrics, and rollback rehearsal;
- Oracle preflight, deployment, health/readiness, authenticated smoke, backup, and restore proof;
- known residual risks, owner, due date, and alert/rollback threshold.

Conversation claims, copied terminal snippets without a SHA, and manually edited `PASS` text are not
release evidence.

## 8. Out of scope

- New PARA features or a PARA redesign.
- Browser Action Optimizer expansion.
- Heuristic threshold personalization beyond preserving current behavior and feedback contracts.
- Destructive removal of legacy production tables in the same release. Stop using them first;
  removal requires a later retention window and a separately approved migration.
- Committing private backups, raw production data, credentials, local IDE/agent state, or generated
  build/test output.
