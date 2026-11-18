# Per-User Proactive Runbooks — Development Tasks

Design task: WED-308
Implementation task: WED-375
Order: dependency order
Rule: reuse the proactive/Watcher/Synthesizer/policy/approval stack; do not create a parallel event, authority, memory, or UI system.


## Original hooks/UI checkpoint — 2026-11-18 (later continuations below)

Worktree: `C:/temp/wt/omnyid-runbooks`, branch `agent/codex/WED-375`.
Original design commit: `dcbe97eff14f2b62a582fe76d340db3f831d9528`.
Application base: `5536b83b2f9d2f58488a075f383c24f8f4f73d6c`; Oracle's
`SOURCE_COMMIT` returned this same SHA during read-only inspection. No
`OMNYID_RUNBOOK*` settings were present in the deployed environment file.
The newer application base deliberately supersedes the original WED-308 base
so later production fixes remain in the implementation lineage.

The strict contracts, validation, runtime AFP encoders/parsers, definition history
projection, typed matcher and bounded persisted-event adapter are implemented.
Immutable starters and authenticated management now use encrypted, signed AFP
records in the existing per-user private messages table. Setup and edits run
under an owner transaction lock, preserve existing definitions, and reject stale
or foreign parents. Exact edit retries return their original revision. Upgrade
previews never write; applying one uses the normal successor boundary.

Management routes require OMNYID_RUNBOOK_MANAGEMENT_ENABLED=true (default off):
GET /runbooks, GET /runbooks/starters, POST /runbooks/setup,
PUT /runbooks/{id}/definition, GET /runbooks/{id}/export and
GET /runbooks/{id}/upgrade-preview. Enable, disable and archive are validated
successor definitions. Normal listing returns summaries; explicit export returns
only the typed definition and its revision reference, with no storage keys or
provider credentials. Responses are no-store. Fleet now offers starter selection, enable/disable successor controls, activity,
cancellation and confirmed explicit export. Decision Queue hosts inline questions.
Normal controls use summary endpoints, including GET /runbooks/instances and
POST /runbooks/{id}/enabled, without fetching raw definitions.

The frozen hooks/UI source candidate is `7842bcc236bf93c1d282188a88d4c7b447721fad`.
All 34 focused integration tests and the library build completed in the clean exact-SHA worktree
`C:/temp/wt/omnyid-runbooks-verify-43d7c830` using Rust 1.95, two jobs,
16 package codegen units, incremental compilation off and package debug info
disabled. The project toolchain pin is unchanged; see the final handoff evidence.
TypeScript, 49 frontend state/navigation tests, seven browser scenarios (including
320/375 px, 200% zoom, axe serious/critical checks, focus, session expiry and export
races), the AFP SDK build and production frontend build also completed.
The global line-budget gate still reports two oversized existing Rust files:
server/mod.rs 45,733/45,717 and db.rs 18,045/17,986. This batch adds one and seven
lines respectively. New source/test files are below 999 lines. Checklist: 72
complete, 45 remaining of 117.

The twelve starters specify reviewed transform operations, required facts and
explicit approval steps. Their executor implementations are still pending.
The pure matcher now feeds a durable dispatcher that reads the owner's existing
AFP event ledger, freezes matched/suppressed decisions in an encrypted receipt,
and appends instance roots atomically. Duplicate delivery returns the original
plan, including after definition changes. Changed normalized input conflicts.
New events observe current definitions; instances retain their original version.

Instance history, local read/transform result receipts, cancellation and wait
expiry are implemented under the owner transaction lock. Exact step retries
return their prior trace; changed inputs/outputs conflict. A wait's follow-up
delivery time is distinct from its expiry deadline. Current disable/archive
state blocks start and advancement. The local-result API is a persistence boundary for trusted executor code.
The new internal `execute_read` path binds frozen definition selectors to
owner-scoped evidence, encrypts the resulting receipt and advances atomically.
It does not grant tool authority or wire live ingress.

Hooks now connect authenticated persisted passive events and the existing daemon
AFP insert boundary to deterministic matching. Both event matching and shared
maintenance follow-up delivery are default-off and require an explicit account
allowlist. The passive bridge preserves event_type and only projects reviewed
fields/references, excluding raw bodies and mail context. Hooks never start a
tool/model executor; management cannot start execution. Remaining work includes
immutable definition caching, typed entity resolution/shared budgets, general
step execution/retries, approval emission/resume, models, provenance/outcomes,
retention, end-to-end starters and rollout. Hook failures currently require
redelivery or explicit internal retry; production throughput/fairness and
account-erasure lock duration require review before rollout.

Existing regression locations include src/proactive_engine.rs,
src/background_watcher.rs, src/background_watcher_runtime.rs,
src/proactive_heuristics_extended.rs, src/autonomy_policy.rs,
src/proactive_provenance.rs, src/proactive_outcome_memory.rs,
src/state_synthesizer_contract.rs, src/server/approval_surfaces.rs and
src/server/proactive_routes/proactive_companion_storage.rs. Do not use the
pruning store_private_snapshot_message API for append-only runbook records.

Contract details: v1 requires a final `complete` step and at least one success
criterion. Inputs are bounded selectors (`event.source_refs`, `event.entity_refs`,
`state.snapshot_ref`, or an earlier `steps.<id>.output_refs`). Model steps require
schema identifiers and explicit token/cost limits. Epistemic answer schemas use a
reviewed enum rather than arbitrary executable JSON schema. Runtime AFP content
is private plaintext **before** the existing private storage/encryption boundary;
a `private` metadata flag is not encryption or authorization.


Latest checkpoint: seven additional items complete; **61 complete, 56 remaining**.
Authenticated GET /runbooks/{id} returns summary detail; GET
/runbooks/instances/{id}/activity projects status, trace links and question state.
POST /runbooks/instances/{id}/cancel and /answers reuse revision-safe runtime
transactions, deriving owner from authentication. Activity excludes raw evidence,
supplied answers and definition bodies. No start, complete or provider endpoint
is exposed; supplying an answer does not execute a step.

Event normalization now preserves bounded refs, optional reviewed urgency and
causation and handles actual Watcher alert/resolution builders. Resolution events
without confidence retain unknown confidence (0.0). Delivered internal follow-ups
normalize only through the signed/encrypted private-store path; public claims of
that type remain rejected. Newly recognized fields can conflict with old saved
dispatch hashes; do not rewrite receipts to hide the mismatch.

The internal Complete executor requires the frozen prior-step sequence, completed
traces and required facts. It evaluates every criterion against derived
instance.outputs.<step_id>.{status,output_hash,output_refs}; unavailable business
outputs fail closed. It records success/failure atomically and returns prior
traces on exact retry. This does not complete the broader all-step executor item.

The [threat model](runbook-threat-model.md) records controls, evidence and remaining
rollout gates. All current runbook source/test files are below 999 lines; the
largest is 620. Dependency audit reported six advisories and five warnings in
unchanged dependencies, plus timed-out registry/yanked checks. The security-scan
checkbox remains open; this is not a clean security result. No deployment or PR
review was performed.

## 0. Freeze and inventory

- [ ] Create the implementation worktree from the reviewed WED-308 documentation commit and record its full 40-character SHA.
- [x] Confirm the exact production SHA and current rollout flags before implementation.
- [x] Inventory active work that overlaps proactive routes, AFP message contracts, daemon scheduling, approval surfaces, A2UI, or migrations.
- [x] Record current tests for passive-event ingestion, Watcher, heuristic packs, autonomy, provenance, outcomes, State Synthesizer, approval cards, and account erasure.
- [x] Keep all runbook execution flags false by default.

Regression inventory (recorded, not a claim that all suites ran this turn):

| Area | Existing regression location |
| --- | --- |
| Passive ingestion | `src/server/proactive_routes.rs::tests`, including `passive_event_route_sanitizes_message_construction_failures` |
| Watcher | `src/background_watcher.rs::tests`, `src/background_watcher_runtime.rs::tests` |
| Heuristic evaluation/packs | `src/proactive_engine.rs::tests` evaluates built-in heuristics; `src/proactive_heuristics_extended.rs` has no dedicated inline test module, a coverage gap for rollout |
| Autonomy | `src/autonomy_policy.rs::tests` |
| Provenance | `src/proactive_provenance.rs::tests` |
| Outcomes | `src/proactive_outcome_memory.rs::tests` |
| Synthesis | `src/state_synthesizer.rs::tests`, `src/state_synthesizer_contract.rs::tests` |
| Approval cards | `src/server/approval_surfaces.rs::tests` |
| Erasure | `tests/runbook_storage_postgres.rs`, `tests/runbook_runtime_postgres.rs`, `tests/runbook_evidence_postgres.rs` exercise `Db::delete_user_account_and_data`; private tenant persistence is also covered in `src/db/tenant_roundtrip.rs` |

The latest batch ran ten runbook integration targets (34 tests), not
all listed legacy unit suites. Later integrations must run the affected suites
from a clean frozen worktree. A filtered unit-suite command is
`cargo +1.95.0 test --lib <module_name>::tests` with the documented test-profile
settings and disposable database when required.

## 1. Contract and validation module

Depends on: 0

- [x] Add `src/runbook_contract.rs` with typed `RunbookDefinition`, trigger/filter, bounded step, success criterion, escalation, instance, trace, and epistemic escalation contracts.
- [x] Define reviewed enums for step kinds, filter operators, instance states, max autonomy, and escalation reasons; reject unknown values.
- [x] Enforce definition size, step count, per-step input, retry, follow-up, tool, and evidence limits.
- [x] Validate that every emitted follow-up type is declared and every tool step uses the definition allowlist.
- [x] Validate state transitions and prohibit terminal-state reopening.
- [x] Add AFP builders/parsers that preserve standard envelope fields, `parent_id`, references, supertags, searchable metadata, and private-content separation.
- [x] Add round-trip, malformed input, unknown field, oversized definition, invalid transition, and private-field leakage tests.

## 2. Immutable starter templates and per-user seeding

Depends on: 1

- [x] Add `src/runbook_starter_pack.rs`; keep immutable code templates separate from mutable user definitions.
- [x] Implement at least the twelve starter runbooks specified in the spec with deterministic steps and explicit approval boundaries.
- [x] Copy selected starter definitions into each user's AFP ledger during first-run setup; never query one global mutable definition row as runtime truth.
- [x] Make seeding idempotent by `(owner, starter_pack_version, runbook_id)`.
- [x] Do not overwrite a user-edited or disabled definition when a starter pack changes; offer a successor preview instead.
- [x] Add tests for first seed, repeat seed, user edit preservation, disable preservation, pack upgrade, and two-user isolation.

## 3. Per-user registry projection

Depends on: 1, 2

- [x] Add `src/runbook_registry.rs` to read the latest non-superseded definition per runbook from the authenticated user's private ledger.
- [x] Scope every query by derived owner and reject caller-supplied cross-user references.
- [x] Build indexes/projections from AFP metadata only where possible; do not create an independent mutable definition source of truth. (Envelope-only type/id and type/thread/id indexes; required bootstrap upgrades existing schemas. No copied content or secondary authority.)
- [x] Support enable, disable, supersede, archive, export, and validated import as AFP successor events.
- [x] Cache only immutable parsed definitions by owner/version/hash and invalidate on a successor event.
- [x] Add tests for version ordering, archive, stale edit conflicts, forged owner, forged parent, cache invalidation, and account erasure. (No cache is used; fresh reads observe each committed successor.)

## 4. Existing-event adapter

Depends on: 1

- [x] Add a normalized proactive-event adapter over stored `passive_event`, Watcher alert/resolution, workflow, vendor, document, wedding, and internal due-event AFP kinds.
- [x] Preserve source and entity references, confidence, urgency, occurrence time, and causation without copying raw bodies.
- [x] Add a small post-persistence dispatcher hook to `proactive_routes.rs`; keep substantive logic out of that already-large file.
- [x] Add the same hook at the reviewed background-Watcher/daemon boundary for events that do not pass through the HTTP route.
- [x] Make event normalization idempotent and reject events that are not owned by the current daemon partition.
- [x] Add tests for email, calendar, Watcher, vendor quote, RSVP, task, workflow failure, scheduled follow-up, malformed, and cross-tenant events.

## 5. Pure matcher and dedupe

Depends on: 3, 4

- [x] Add `src/runbook_matcher.rs` with zero-model typed filter evaluation.
- [x] Implement stable ordering: priority descending, specificity descending, version descending, runbook ID ascending.
- [x] Select the first match per dedupe group plus independent definitions, capped at five instances per event.
- [x] Compute `instance_key = sha256(owner,event,definition,version)` and suppress retries with the same key.
- [x] Record matched/suppressed results as content-light AFP audit events.
- [x] Reuse relevant exact/range condition semantics from `proactive_engine.rs` without coupling execution to `ProactiveHeuristic`.
- [x] Add tests for correct match, no match, stable ties, dedupe group, duplicate delivery, cap, disabled/superseded definition, and user isolation.

## 6. Instance store and state machine

Depends on: 1, 5

- [x] Add `src/runbook_runtime.rs` with append-only instance revisions and one dedicated AFP thread per instance.
- [x] Enforce the documented transition graph under an owner/instance advisory lock or equivalent transaction boundary.
- [ ] Make every step idempotent on owner, instance, step, and input hash.
- [x] Return prior trace/response on exact retry and a reviewable conflict on changed inputs. (Supported local steps; other step kinds fail closed pending executor integration.)
- [ ] Bound retries and apply existing cooldown signals after repeated failures.
- [x] Add cancel and timeout resolution events rather than deleting waits or instances.
- [x] Add concurrency tests for duplicate dispatch, two workers advancing one step, stale revision, retry, cancel, timeout, and terminal state.

## 7. Structure-first evidence packets

Depends on: 4, 6

- [x] Add `src/runbook_evidence.rs` that resolves only typed source/entity references and bounded query limits.
- [x] Reuse State Synthesizer snapshots and `SynthesizerToMasterHandoff` where relevant instead of synthesizing a parallel state model.
- [x] Reuse current metadata relevance/decrypt-budget rules before reading encrypted content.
- [x] Record included refs, omitted categories, missing required fields, snapshot ref, hashes, and confidence.
- [x] Reject unbounded history/RAG requests in a definition.
- [x] Add tests for reference-only retrieval, bounded counts, missing records, private records, decrypt budget, stale synthesis, and cross-user refs.

Evidence continuation: `runbook_evidence.rs` resolves explicit `message:`,
`private_message:` and `snapshot:` IDs under owner/account and record locks.
Exact private `document:` (parsed_document AFP) and `task:` references are now
type checked before body access. Other entity kinds remain explicit omissions;
there is no provider-ID search or link chasing.
Headers precede body reads; existing Watcher relevance gates encrypted reads.
Caller budgets have hard caps of 32 references/decrypt attempts, 64 KiB per
record and 256 KiB total fetched content/ciphertext. Attempts consume budget
including decryption failures. Missing/foreign records are indistinguishable.
Fresh State Synthesizer snapshots reuse the existing content and handoff types;
stale snapshots and mismatched handoffs are omitted. Packet hashes, per-item
hashes and explicit omissions/missing fields are returned to trusted executor
code. Packet content is private data and conveys no authority. Encrypted packet persistence and frozen runtime read-step binding now commit
atomically with the trace and next instance revision. Exact request retries
return the original saved packet even after source mutation or cancellation.
Changed retry parameters conflict. No external execution is enabled. Source
evidence decrypts additionally reserve a persistent account-wide quota of 128
attempts per UTC day before body access; failed decrypts still consume allowance.
This quota is shared across Runbooks, while Watcher metadata relevance and
per-request limits remain in force. Internal signed ledger validation is distinct
from source-content retrieval.

## 8. Policy, tools, and approval integration

Depends on: 6, 7

- [x] Add `src/runbook_authority.rs` to intersect definition tools, step tools, connected capabilities, account policy, and existing autonomy decisions.
- [x] Reuse `ProactiveAutonomyTier`, `AutonomyDecision`, `proactive_policy`, and per-user overrides; do not add runbook-specific ambient authority.
- [x] Treat external messages, spend, booking, publication, destructive action, and irreversible mutation as hard approval boundaries unless existing policy explicitly permits the exact action.
- [x] Emit the existing action/approval AFP contract so `approval_surfaces.rs` and DecisionOS render it without a second queue.
- [x] On policy denial, append a trace and fail or escalate; never ask an LLM to overrule policy.
- [x] Add adversarial tests for unallowlisted tools, forged capability IDs, prompt-injected tools, excessive autonomy, approval replay, revoked capability, and cross-tenant execution.

Policy implementation checkpoint: `RunbookRuntime::check_tool_policy` loads the
frozen Tool step and intersects it with the latest definition restrictions,
one unambiguous healthy/unrevoked owner connection, existing capability approval
mode, global proactivity level and the existing override table using
`runbook:<runbook_id>` keys. Missing, foreign, ambiguous, revoked and suggestion-only
capabilities fail closed. Definition edits cannot widen a frozen autonomy ceiling.

The pure decision reuses ProactiveAutonomyTier, AutonomyDecision and proactive_policy.
Only reviewed read/draft capability names avoid the consequential classification;
all other tools require hard approval. Even reviewed capabilities currently stop
at review because action schemas, dispatch and approval resume are not integrated.
A policy receipt is an audit record, never an authorization token. Denials append
an encrypted Denied trace and fail the instance; review appends a Waiting trace
and transitions to AwaitingApproval. Both changes commit atomically with an
encrypted receipt. Exact retries return that receipt without executing or
reopening anything. No model is asked to override policy.

The fifth selected item is adversarial tests, before the approval-card item:
existing action/approval AFP emission remains unchecked until a validated exact
action payload can be rendered and resumed. No new approval queue was added.
The existing Db account-policy getters/setters now target the actual migration
0047/0048 tables (`heuristic_autonomy_overrides`, `user_proactivity_config`);
account deletion also removes those owner settings, which lack foreign keys.

## 9. Deterministic executor

Depends on: 6–8

- [x] Implement `read`, `transform`, `tool`, `emit`, `wait`, `approval`, and `complete` steps without an LLM.
- [x] Validate tool input/output schemas and reject unknown fields. (Bounded closed contracts, exact canonical grant preparation and structured-result validation; six schema and four PostgreSQL boundary tests. External dispatch remains separate.)
- [ ] Reuse existing capability/tool dispatch and AFP result persistence.
- [x] Check success criteria deterministically before completing an instance.
- [ ] Store each meaningful step as `runbook_step_trace` with input/output refs and provenance.
- [ ] Add tests for every deterministic step, tool failure, schema failure, success criteria failure, and partial retry.

## 10. Epistemic escalation and resume

Depends on: 6, 7

- [x] Detect required facts missing from the bounded evidence packet.
- [x] Emit one `epistemic_escalation` with what is missing, what was tried, why it matters, an exact question, answer schema, and expiry.
- [x] Project through the existing Decision Queue/A2UI input card rather than a new modal system.
- [x] Resume only from a typed `runbook_input_supplied` AFP event linked to the open escalation.
- [x] Reject wrong user, wrong instance, duplicate answer, invalid schema, late answer, and terminal instance.
- [x] Add missing-info, resume, timeout, malformed answer, and user-isolation tests.

Epistemic implementation checkpoint: the internal `request_missing_input` API
compares frozen step requirements against the saved bounded evidence packet.
One encrypted question is stored per owner/instance/step, with exact missing
fields, attempted refs, reason, question, scalar schema and bounded expiry.
`supply_input` atomically persists a typed `runbook_input_supplied` event, an
Answered successor and a Running revision at the same paused step. Exact field
sets and schemas are required; foreign, duplicate, stale, late and terminal
answers fail closed. Answers remain attributed data exposed by `supplied_inputs`,
never authority. Expiry/cancellation append successors and cannot reopen state.
The Decision Queue/A2UI adapter now reloads authenticated questions and posts typed answers. End-to-end executor wiring remains open.

## 11. Bounded model steps and cost controls

Depends on: 7–10

- [x] Add `src/runbook_llm_step.rs` for only `classify`, `reason`, and `draft` step kinds.
- [ ] Resolve inference through the current user BYOK/shared model ladder; do not read API keys directly in the runbook runtime.
- [ ] Start with `gpt-6-luna` low/medium for bounded frequent tasks and permit policy-controlled `gpt-6.1-sol` medium escalation only after acceptance criteria fail.
- [x] Require structured output schema for classification/reasoning and AFP draft objects for draft steps.
- [x] Use reusable cached prompt prefixes, source references, strict evidence limits, and generate only on meaningful input changes.
- [x] Record model, prompt version, tokens, cost, approval state, revision, input/output hashes, and source refs in the step trace/provenance.
- [x] Enforce account/runbook/instance budgets with graceful pause or simpler-model fallback; never silently exceed budget.
- [x] Add mocked-provider tests for valid output, invalid schema, timeout, provider failure, cost ceiling, cached prefix, unchanged-input suppression, and escalation.

## 12. Follow-up event scheduling

Depends on: 4, 6, 9

- [x] Represent waits and scheduled follow-ups as AFP events with due time, cancellation key, causation, instance, and source refs.
- [x] Reuse the existing daemon/Watcher wake-up path rather than starting one scheduler per runbook.
- [x] Enforce the definition's declared `follow_up_events` list before writing.
- [x] Make delivery and resume idempotent; repeated daemon scans must not duplicate a step.
- [x] Resolve cancel/reschedule by successor events, preserving the original schedule.
- [x] Add due, not-due, cancel, reschedule, duplicate scan, undeclared event, and account-deletion tests.

Scheduling implementation checkpoint: `wait`/`schedule_wait` persist an
append-only encrypted `runbook_schedule` with due time, expiry, cancellation
key, instance/step, source refs and causation. Creation, rescheduling and delivery
intersect frozen and latest declared event types. `due_schedules` returns bounded
hints for the shared maintenance daemon hook; it starts no independent timers.
`deliver_follow_up` rechecks state and time under the owner lock, then atomically
appends one `runbook_follow_up`, completed Wait trace and next instance revision.
Exact delivery retries return the original receipt; stale scans cannot resume a
rescheduled or cancelled wait. Cancellation, expiry and rescheduling preserve
original AFP records and append successors. Tests cover due/not-due, concurrency,
revocation, stale rescheduling, timeout, encrypted storage and account erasure.
The existing health-maintenance wake/timer path now runs a bounded opt-in pass
(up to 20 due records per allowlisted account, ten seconds per pass). Delivery
rechecks current owner/state/revision/policy. Flags remain off; no deployment
or live delivery was enabled. Account erasure now acquires the users lock before
tenant DDL to prevent the parallel-erasure deadlock found by the control tests.

## 13. Provenance and outcome memory

Depends on: 6, 8, 9, 11

- [ ] Reuse `build_action_provenance_record_afp` for actionable traces and hash definition, trigger, evidence packet, tool/model output, and approval.
- [x] Extend the proactive provenance adapter only where shared metadata is missing; do not create a competing provenance format.
- [x] Record outcomes under `runbook:<runbook_id>:<step_id>` and reuse proactive outcome/cooldown/priority functions.
- [x] Keep family-level feedback cautious; acceptance never grants authority or bypasses approval.
- [x] Add provenance hash, source dedupe, acceptance, dismissal, cooldown, retry-regret, and no-authority-escalation tests.

Provenance/outcome continuation: current read/local transform, policy, wait and
completion traces now append private shared `provenance_record/action` companions
atomically. Frozen definition/trigger/evidence and input/output hashes, revision,
model/cost fields and explicit absent approval are recorded. The first item stays
open for actual tool/model results and validated approval evidence when those
executors land. Shared source deduplication is reused without a new provenance
format. Immutable accepted/dismissed/regretted receipts project transactionally
into existing proactive outcomes; exact retries and regrets count each trace once.
Shared feedback functions suppress/cool down exact steps, cautiously rank families
and never grant execution authority. Owner-bound routes reject foreign traces and
unknown fields. Outcome memory is bounded to 30 days for feedback; immutable
receipts remain immutable until account erasure. The opt-in derived projection
retention policy is described in the latest continuation below.

## 14. API and A2UI projections

Depends on: 3, 6, 8, 10, 12

- [x] Add focused `src/server/runbook_routes.rs` endpoints for list/detail, enable/disable, validated successor edit, instance activity, cancel, and escalation answer.
- [x] Derive owner from authentication on every endpoint and rate-limit writes.
- [x] Add semantic A2UI kinds for definition, instance, step trace summary, approval link, and epistemic question.
- [x] Reuse current activity/fleet, Decision Queue, settings controls, badges, timeline, confirmation, toast, and failure-state primitives.
- [x] Use consequence-specific action labels and expose evidence/provenance in user-facing language.
- [x] Ensure mobile 320/375 px reflow, 200% zoom, keyboard focus restoration, screen-reader names, and colour-independent states.
- [x] Keep raw definitions/secrets out of normal UI; advanced export is explicit and redacted.

## 15. Starter runbook integration tests

Depends on: 2, 5–14

- [x] `no_reply_followup`: idle event -> bounded context -> draft -> approval -> permitted follow-up event.
- [x] `calendar_conflict`: conflicting events -> alternatives -> epistemic question when priority is missing.
- [ ] `vendor_quote_received`: quote event -> one normalization -> Documents/response projection -> separate booking approval.
- [x] `quote_missing_items`: normalized gaps -> exact questions -> no send before approval.
- [x] `budget_threshold`: changed commitment -> category/total projection -> no invented target or spend.
- [x] `wedding_task_deadline`: due task -> correct owner/context -> no duplicate decision task.
- [x] `rsvp_non_response`: permission check -> reminder draft -> no send if permission absent.
- [x] `runsheet_change`: timing diff -> affected viewers -> no publish before approval.
- [x] General workflow/file/info-gap runbooks behave as specified.

## 16. Security, privacy, retention, and erasure

Depends on: 1–15

- [x] Threat-model forged events, malicious definitions, prompt injection, capability escalation, cross-tenant refs, replay, timer abuse, and private-content leakage.
- [x] Verify encrypted/private content follows current storage and decrypt-budget rules.
- [x] Keep operational logs content-light and redact model/tool inputs.
- [x] Add retention for derived traces/projections without deleting immutable evidence that policy requires to retain.
- [x] Extend account deletion to definitions, instances, traces, waits, receipts, caches, and projections. (Existing private-schema erasure verified for all currently persisted runbook types; no separate caches/projections exist.)
- [x] Run dependency/security scans and targeted route abuse tests.

## 17. Verification and rollout

Depends on: 1–16

- [ ] Run Rust unit/integration tests, migration checks, all relevant proactive/Watcher/Synthesizer/approval tests, frontend typecheck, line budget, full Wedding tests where wedding runbooks are enabled, production build, and accessibility checks.
- [x] Verify every new source file is below 999 lines and no existing oversized file is materially bloated.
- [ ] Run flags-off hosted shadow matching and compare expected definition/match counts without executing instances.
- [ ] Run an internal allowlist with deterministic steps only and inspect duplicate, policy-denial, stale, and cross-tenant metrics.
- [ ] Enable draft-only model steps after representative Luna-versus-Sol evaluation passes.
- [ ] Enable approval-gated tools only after security/privacy review and provider/sandbox evidence.
- [ ] Keep reversible action rollout separate and require objective acceptance, undo, error, and cost criteria.
- [ ] Freeze the exact candidate SHA; all evidence, build manifests, and deployment records must name it.

## Completion definition

This work is complete only when event-to-instance dispatch is deterministic and per-user, missing information pauses visibly, no tool can exceed existing authority, follow-ups are AFP events, all outcomes and costs are auditable, and A2UI projections use the same underlying ledger state. A starter pack existing in code is not completion unless it is copied into and isolated within each user's ledger.


Verification continuation (2026-11-18): source
`b15d44920be2dd6c03de5adff5168186e94c722f` in the clean verification worktree
passed all 39 focused Runbook Rust tests and the library build with Rust 1.95.0.
The ten items above are closed: checklist 82 complete, 35 remaining of 117.
The security-scan checkbox records execution, not a clean security gate:
`cargo audit --no-yanked --json` refreshed the advisory database and exited 1
with six existing advisories and five warnings. Registry/yanked checks were
excluded. Route tests cover unauthenticated/foreign requests, unknown fields,
invalid outcome enums and duplicate/stale mutations. The global line budget
still fails on unchanged counts in server/mod.rs and db.rs; no baseline raised.
No frontend source changed, no external executor enabled and no deployment done.
Full tool/model/approval provenance remains open despite the verified companion
records for current runtime paths; retention and wider rollout checks remain open.


## Deterministic review and retention continuation — 2026-11-18

Source `a9ed13670a74829387dcc8e9892ac61f818a4a9b` was verified in clean detached
`C:/temp/wt/omnyid-runbooks-verify-43d7c830`: all 46 focused Runbook Rust tests
and the library build completed using Rust 1.95.0, one job, 16 package codegen
units, package debug off and incremental off. The preceding candidate's compiler
crashed with Windows STATUS_ACCESS_VIOLATION; the final candidate completed.
The global line-budget check still reports only the two existing unchanged
server/mod.rs and db.rs overages. Dependencies did not change; the prior six
advisories/five warnings remain unresolved. No frontend or execution rollout.

Eight deterministic transforms now cover reply review, integer budget exposure,
task dependencies, reminder permission, commitment evidence, workflow retries,
import status and missing facts. They consume frozen evidence plus accepted
same-step answers; unrelated instructions are excluded. Missing/conflicting or
malformed facts fail closed. No conclusion grants sending, spending, retrying,
publishing or release authority. Output receipts, provenance, trace and revision
advance atomically. Concurrent exact retries, subsequent source mutation,
definition revocation, cross-owner access and encrypted storage are covered.
Calendar, quote review/gaps and runsheet transforms remain unavailable pending
existing domain projection integration. The all-step and full-starter checkboxes
remain open: the integration fixture deliberately omits Emit and uses an explicit
trace-completion criterion, so it is not full starter acceptance.

Derived outcome projections expire after 30 days only with verified private
owner receipts, at most 100 per pass; recent regret extends retention. Tests
exercise 101 expired rows across batches, unproven generic rows and other owners,
and confirm immutable private evidence remains. OMNYID_RUNBOOK_RETENTION_ENABLED
is default-off, account-allowlisted and reuses shared maintenance. Private traces,
evidence, approvals and dedupe receipts remain until account erasure. Histories
above 4096 receipts fail closed pending archival/index work.

Checklist: **83 complete, 34 remaining of 117**. SEO static integration was
released separately at 7aaa3b4ee42c0e890d587e72d59f68845525ee5b; this Runbook
candidate has not been deployed and all execution flags remain off.


## Private review emission continuation — 2026-11-18

Source `2e0583563cdaaba505c8c50638eaf35f5e9ecd7e`, clean verification worktree
`C:/temp/wt/omnyid-runbooks-verify-43d7c830`: all 47 focused Rust tests and the
library build completed with Rust 1.95.0, one job, package debug off, 16 package
codegen units and incremental off. TypeScript, 10 focused frontend tests, eight
browser scenarios and the production frontend build completed. Browser coverage
includes 320/375 px, 200% zoom, serious/critical axe checks, escaped review text,
no execution controls, and account-change clearing. The initial Rust attempt at
6eb2931f failed inside the compiler with STATUS_ILLEGAL_INSTRUCTION; final source
completed. A direct Node invocation lacked the repository's TS import hook;
rerunning with tests/node-ts-specifier-hooks.mjs completed all 10 frontend tests.

The dedicated Emit adapter consumes the preceding frozen transform receipt and
appends a standard proactive_suggestion, emission receipt, provenance, trace and
instance revision in one owner transaction. It emits no action/approval payload.
A forced trace collision proves rollback after suggestion insertion. Concurrent
replays return one encrypted suggestion; stale/foreign requests and fresh work
after disable are rejected. The public local-result API still cannot emit.
Completion derives review_ref only from an actual hash-matching stored review.

Unmodified enabled budget, task-deadline and file-review starter copies now reach
completion in disposable-Postgres integration tests. Budget calculations retain
integer category/total projections and reject absent targets/mixed currencies;
reviews authorise no spend. Task reviews preserve the recorded task/owner context
and create no task/action/approval records. Activity exposes bounded derived
review summaries in the existing Fleet/Decision Queue Runbook controls; evidence
and answers remain private. The grouped general-workflow/file/info-gap item stays
open because workflow approval and information-gap full acceptance remain open.

Checklist: **85 complete, 32 remaining of 117**. The general deterministic-step,
approval contract, tools, model, full provenance and rollout items remain open.
No Runbook deployment or flag change. Existing six dependency advisories/five
warnings and two unchanged line-budget overages remain. Remote PR/CI remains
unavailable because origin/main has unrelated open-source history; no push made.


## 2026-11-18 continuation: stored quotation review dependency

Frozen source `1509438f2aa32adb1ec06fe1dcf763c94f0bb0c3` was verified in the clean worktree
`C:/temp/wt/omnyid-runbooks-verify-43d7c830`: 48 focused Rust tests and library build
completed. First compiler attempt hit STATUS_ACCESS_VIOLATION; same-source retry
completed. No frontend changes or deployment.

ReviewStoredQuote consumes the exact referenced normalized quote in the frozen
owner evidence packet, validates the existing quotation contract and preserves
its material fingerprint. Missing/ambiguous evidence, wrong context/schema,
invalid dates and oversized quotations fail closed. The unchanged vendor starter
completes through one encrypted standard AFP review with no booking/payment
permission. Full Documents/response projection and separate booking approval
remain unimplemented in this path, so the vendor checklist item stays open.

Checklist unchanged: **85 complete, 32 remaining of 117**.


## 2026-11-18 continuation: quote category-gap assessment

Frozen source `26d3d5531ec33669d11c72b782f3a4b5d1589c4c`, verified in the clean worktree
`C:/temp/wt/omnyid-runbooks-verify-43d7c830`: all 51 focused Rust tests and the
library build completed. FindQuoteGaps now consumes the saved normalized quotation
and existing category registry, with bounded alias-resolved required categories,
source paths, evidence uncertainty and quote/registry fingerprints. Up to three
internal questions use registry templates. Recorded category presence does not
certify commercial completeness or authorize sending/booking.

The unchanged quote_missing_items starter advances to Draft and cannot skip it
through review emission or completion. Concurrent replay and source mutation are
covered by Postgres tests. Full draft/approval/provider acceptance remains open,
so checklist counts stay **85 complete, 32 remaining of 117**. No rollout changes.

## 2026-11-18 continuation: five bounded model-step implementation tasks

Frozen source `cbd753ebb56a45c2252cb273a5bde9b5ec175d6c` completed all 57 focused Rust tests and
the library build in clean worktree `C:/temp/wt/omnyid-runbooks-verify-43d7c830`.
The five checked items are the classify/reason/draft executor, strict structured
and AFP draft outputs, reusable prefixes/bounded evidence/unchanged-input replay,
model usage/hash/source provenance, and mocked-provider coverage.

The executor accepts only a verified preceding Transform receipt. It commits an
owner-private reservation before calling an injected provider and atomically saves
result, trace, provenance and any instance advance after rechecking current state.
Same owner/instance/step/frozen input retries return the saved receipt; uncertain
crash-interrupted calls stay pending reconciliation. Cancellation, disable and
erasure cannot be overridden by a late response. Draft AFP envelopes are server
owned, private, approval-required and nested in the encrypted result receipt.
No action/approval event is published. Completion checks the actual applied receipt.

Requests use stable owner/schema/model cache keys and bounded evidence; actual
provider cache effectiveness has not been measured. Usage is recorded per attempt;
timeout/provider-error usage is marked unknown with its reserved ceiling, rather
than claimed as known zero. Only well-formed low-confidence results may escalate
once when policy, retry and remaining step budget allow. No real provider calls
were made. The live BYOK/shared ladder, production model policy, account/runbook/
instance-wide budgets and rollout/evaluation tasks remain open.

Final verification used Rust +1.95.0, -j1, incremental off, C:/cargo-target,
package debug=0/codegen-units=8 and RUST_MIN_STACK=67108864. Earlier compiler
attempts hit Windows access violations, a stack overflow and 0x80000004; final
same-source retry completed. Line budget still reports only the unchanged
server/mod.rs and db.rs overages. Frontend/dependencies unchanged; no deployment.
Unrelated origin/main history still prevents an appropriate PR/CI run.

Checklist: **90 complete, 27 remaining of 117**.


## 2026-11-18 continuation: six aggregate-budget implementation items

Completed six implementation items within the aggregate-budget parent task:
strict default-off owner policies; durable three-scope reservations; conservative
usage settlement; visible pause and guarded resume; concurrency/deletion/replay
safeguards; and adversarial regression coverage. This closes one of the original
117 checklist entries, not six parent entries: **91 complete, 26 remaining**.

The private ledger now enforces UTC-day account and per-Runbook spending plus
lifetime instance spending. Reservations include possible escalation before a
provider is called. Actual usage settles the reservation; failures/cancellation
still count, uncertain calls retain their ceiling across midnight, and provider
ceiling violations block further spending pending reconciliation. Configuration
changes never reset usage. Missing configuration means zero spending authority.

Budget exhaustion persists WaitingForBudget without a model call. Activity shows
bounded totals, the UI labels the pause, and internal resume requires current
revision, enablement and sufficient capacity. Execution rechecks under the owner
lock. No public configuration/resume route or live inference has been enabled.
Legacy reservations without budget bindings require reconciliation before new
spending; existing result replay remains available without another provider call.

Frozen source `17e49657698f3d325570931b80569fc2e99ac211` was verified in clean worktree
`C:/temp/wt/omnyid-runbooks-verify-43d7c830`: 63 focused Rust tests across 16
binaries, library build, TypeScript, 11 focused UI tests, all eight Playwright
scenarios and frontend production build completed. Final Rust compilation first
crashed with STATUS_ACCESS_VIOLATION; the same-source retry completed. Line budget
still reports only the two unchanged server/mod.rs and db.rs overages. The
unrelated origin/main history still blocks appropriate PR/CI integration.

Owner BYOK/shared ladder integration, production model/evaluation policy,
approval/tool execution, remaining starter flows and hosted rollout remain open.
No deployment, live provider calls, migrations or dependency changes occurred.


## Starter reviews and existing approval projection — 2026-11-18

Frozen source: `19873160bb5bdf65964c0ecee972c7574ab0d89d`, verified in the clean
`C:/temp/wt/omnyid-runbooks-verify-43d7c830` checkout. This batch closes six existing
entries, not six subdivisions of one entry: **97 complete, 20 remaining of 117**.

- Existing action/approval AFP emission uses the shared approval surface builder,
  audit projection and Decision Queue summary. Action, waiting trace, provenance,
  revision and replay receipt commit atomically. Private previews show the actual
  proposal; draft bodies are absent from the audit table. Cancellation withdraws
  pending reviews. Owner isolation, stale requests and latest disablement are tested.
- Calendar conflicts use bounded offset-aware event times and travel buffers.
  Missing priority pauses for an owner answer; alternatives preserve that priority
  and are checked against every supplied event. External availability is unverified.
- Quote-gap Draft output must exactly reproduce the existing registry questions.
  Altered questions fail schema acceptance and cannot produce an approval proposal.
- RSVP reminder Draft execution requires pending attendance and recorded permission
  before any provider call or reservation. Accepted/declined and unpermitted cases stop.
- Runsheet differences use existing projection snapshots, matching scope and checked
  record revision history. Optional start/end/duration fields remain explicit; affected
  viewer references grant no access and no publishing occurs.
- Workflow failures prepare a review without retrying; quarantined files remain
  untrusted; generic information gaps ask an allowlisted fact question and require
  its owner-bound answer before emission/completion.

Local evidence: 72 Rust tests in 17 binaries; library build; TypeScript; 11 UI tests;
nine browser scenarios including proposal preview, mobile/accessibility and account
switch; frontend production build. The disposable Postgres suite also exercises
concurrent replay, invalid/cross-scope histories, denied drafts and exact questions.
The unchanged line-budget overages remain server/mod.rs 45733/45717 and db.rs
18045/17986; Vite has the existing screen/chunk warnings. No migrations changed.

The approval-emission checkbox covers emission and rendering only. The earlier
note grouping emission with resume is superseded in that respect: validated
approval consumption/resume remains part of the open deterministic executor and
full authority/provenance work. These proposals do not authorize external actions.
Provider tests use mocks; live owner inference resolution, approved tool execution,
no-reply follow-up, Documents integration and hosted rollout remain open. No deploy.


## Approval continuation checkpoint — 2026-11-19

Six bounded implementation subtasks completed: strict private decision records;
atomic approve/reject and exact replay; authenticated existing action-endpoint
integration; approved private emission/follow-up/completion with decision-bound
provenance; confirmed Decision Queue controls; adversarial runtime/API/browser
tests. This closes one parent checklist entry, `no_reply_followup`, rather than
six parent entries: **98 complete, 19 remaining of 117**.

The starter test covers idle event, frozen bounded context, mock Draft, exact
human approval, private emission, permitted scheduled event and completion.
Concurrent decision retries return one receipt; stale, foreign, mismatched,
cancelled and disabled approvals fail. Rejection remains possible after disable.
A missing audit projection rolls back the decision, trace and instance writes.
No external sending or live provider was used. General tool execution, inference
integration, full provenance/tool coverage and hosted rollout remain open.

Frozen candidate: `d8ebd36dbe2e53d1a83dcd7bbb9a85f9fa97e6af` in
`C:/temp/wt/omnyid-runbooks-verify-43d7c830`. See the latest canonical handoff for
verification results and unresolved repository release gates.


## Tool contract preparation — 2026-11-19 (verification incomplete)

Candidate `96ce14bdfe5797a5733b1ad20743d1f68af42ec9` adds closed bounded schemas
for tool inputs and structured outputs, plus exact capability preparation in the
existing dispatcher. See `tool-contract-boundary.md` for the supported subset,
limits and authority boundaries. The existing execution-registry method returns
an empty list; no fallback or external execution was enabled.

Six isolated schema tests pass against the candidate source. Full Cargo checks
and tests crash inside Windows rustc, also reproduced on the prior verified
candidate. Selection tests and full build verification remain incomplete. No
parent checklist entry is closed: **98 complete / 19 remaining of 117**.


## Canonical tool preparation — 2026-11-19

Four bounded prerequisites are implemented: credential-free canonical registry
projection; exact owner/account/schema snapshot binding; live snapshot
revalidation; and adversarial PostgreSQL coverage. These complete the schema
validation parent item together with the prior contract work, not four parent
items: **99 complete / 18 remaining of 117**.

Frozen candidate: `9c9eda70785c8a53098ef70f327c1d4d01073f49`. All 84 tests across
19 integration binaries passed on Linux Rust 1.94.1 with global test debug
information disabled. This includes the previous batch's six schema tests and
four new canonical registry tests. See the latest canonical handoff for build
evidence and environment limitations. Preparation calls no providers; the
legacy dispatcher registry remains empty. Durable approved dispatch, AFP result
persistence, transport bounds and crash reconciliation are still required.


## Bounded tool transport — 2026-11-19

Four more subtasks: exact bounded MCP requests; total deadline and response-byte
limits with redirects/retries disabled; correlated strict JSON receipts with
schema checks and honest unknown outcomes; adversarial transport coverage.
Candidate `fbe1e671ed14df8fc6fb7468c3816d1a781c4460` passes 92 integration tests in
20 binaries, including seven local socket tests and one added registry/schema
receipt test. See canonical handoff for build evidence. No production executor
calls this opt-in client. Durable action authority, reservation and authenticated
AFP result persistence remain open, so the parent count is unchanged:
**99 complete / 18 remaining of 117**.


## Durable tool lifecycle — 2026-11-19

The deterministic backend step implementation parent closes: **100 complete /
17 remaining of 117**. Tool execution now has an exact request proposal, separate
approval decision, durable one-shot reservation, and atomic signed/encrypted
private result, trace and provenance. Completion requires its saved applied
receipt. Cancellation, stale grants, aborted calls, failed persistence and
unknown outcomes cannot silently authorize another attempt.

Candidate `489b13f11968dced83a13e085dc619e00ff76771` passes 101 integration tests in
21 binaries, including nine new lifecycle tests using disposable PostgreSQL and
loopback providers. See canonical handoff for build evidence and limitations.
The tool executor is a trusted backend seam with explicit arguments; authenticated
routes/queue, live credential adapter, evidence-to-argument projection, provider
AFP projection and unknown-outcome reconciliation remain integration work. No
live provider, production rollout or additional parent closure is claimed.


## Authenticated exact tool review — 2026-11-19

Owner-authenticated proposal, historical retrieval and approval/rejection routes
now bridge the durable backend lifecycle. Both management and separate default-off
review flags are required. Approval uses the existing recent-session policy;
rejection remains possible with an older valid session after grant revocation.
Unknown JSON fields and cross-owner access are rejected, responses are no-store,
and these routes never invoke a provider. Candidate
`211386468b4f6db1b82aec67411d68c7316fb889` passes 102 tests in 21 integration
binaries, including the new HTTP boundary scenario. See canonical handoff for
build evidence. Queue UI, live account-bound adapter and rollout remain open;
parent checklist stays **100 complete / 17 remaining of 117**.
