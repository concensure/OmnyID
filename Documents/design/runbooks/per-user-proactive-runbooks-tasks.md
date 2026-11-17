# Per-User Proactive Runbooks — Development Tasks

Design task: WED-308
Implementation task: WED-375
Order: dependency order
Rule: reuse the proactive/Watcher/Synthesizer/policy/approval stack; do not create a parallel event, authority, memory, or UI system.


## Implementation checkpoint — 2026-11-18

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
provider credentials. Responses are no-store. No frontend control or first-run
screen is wired yet; the setup endpoint copies the user's selected starters.

The frozen evidence source candidate is `44b4117562634eaac2e10314aa346fbc29c6daa6`.
All 19 focused integration tests and the library build completed in the clean exact-SHA worktree
`C:/temp/wt/omnyid-runbooks-verify-43d7c830` using Rust 1.95, two jobs,
16 package codegen units, incremental compilation off and package debug info
disabled. The project toolchain pin is unchanged; see the final handoff evidence.

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
state blocks start and advancement. This is a persistence boundary for trusted
executor code, not a tool executor, evidence resolver or authority grant.

Stages 4–17 remain open except for checked items below. Complete adapters,
remaining step-kind execution, bounded evidence, authority/approval integration,
retries/cooldowns, model budgets, timer delivery/resume, outcomes, activity/A2UI
and rollout remain unfinished. No live ingress, scheduler or daemon hook is
connected. The management API cannot start execution.

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

## 0. Freeze and inventory

- [ ] Create the implementation worktree from the reviewed WED-308 documentation commit and record its full 40-character SHA.
- [x] Confirm the exact production SHA and current rollout flags before implementation.
- [x] Inventory active work that overlaps proactive routes, AFP message contracts, daemon scheduling, approval surfaces, A2UI, or migrations.
- [ ] Record current tests for passive-event ingestion, Watcher, heuristic packs, autonomy, provenance, outcomes, State Synthesizer, approval cards, and account erasure.
- [x] Keep all runbook execution flags false by default.

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
- [ ] Copy selected starter definitions into each user's AFP ledger during first-run setup; never query one global mutable definition row as runtime truth.
- [x] Make seeding idempotent by `(owner, starter_pack_version, runbook_id)`.
- [x] Do not overwrite a user-edited or disabled definition when a starter pack changes; offer a successor preview instead.
- [x] Add tests for first seed, repeat seed, user edit preservation, disable preservation, pack upgrade, and two-user isolation.

## 3. Per-user registry projection

Depends on: 1, 2

- [x] Add `src/runbook_registry.rs` to read the latest non-superseded definition per runbook from the authenticated user's private ledger.
- [x] Scope every query by derived owner and reject caller-supplied cross-user references.
- [ ] Build indexes/projections from AFP metadata only where possible; do not create an independent mutable definition source of truth.
- [x] Support enable, disable, supersede, archive, export, and validated import as AFP successor events.
- [ ] Cache only immutable parsed definitions by owner/version/hash and invalidate on a successor event.
- [x] Add tests for version ordering, archive, stale edit conflicts, forged owner, forged parent, cache invalidation, and account erasure. (No cache is used; fresh reads observe each committed successor.)

## 4. Existing-event adapter

Depends on: 1

- [ ] Add a normalized proactive-event adapter over stored `passive_event`, Watcher alert/resolution, workflow, vendor, document, wedding, and internal due-event AFP kinds.
- [ ] Preserve source and entity references, confidence, urgency, occurrence time, and causation without copying raw bodies.
- [ ] Add a small post-persistence dispatcher hook to `proactive_routes.rs`; keep substantive logic out of that already-large file.
- [ ] Add the same hook at the reviewed background-Watcher/daemon boundary for events that do not pass through the HTTP route.
- [x] Make event normalization idempotent and reject events that are not owned by the current daemon partition.
- [ ] Add tests for email, calendar, Watcher, vendor quote, RSVP, task, workflow failure, scheduled follow-up, malformed, and cross-tenant events.

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

- [ ] Add `src/runbook_evidence.rs` that resolves only typed source/entity references and bounded query limits.
- [x] Reuse State Synthesizer snapshots and `SynthesizerToMasterHandoff` where relevant instead of synthesizing a parallel state model.
- [ ] Reuse current metadata relevance/decrypt-budget rules before reading encrypted content.
- [x] Record included refs, omitted categories, missing required fields, snapshot ref, hashes, and confidence.
- [x] Reject unbounded history/RAG requests in a definition.
- [x] Add tests for reference-only retrieval, bounded counts, missing records, private records, decrypt budget, stale synthesis, and cross-user refs.

Evidence continuation: `runbook_evidence.rs` resolves explicit `message:`,
`private_message:` and `snapshot:` IDs under owner/account and record locks.
Unsupported entity kinds are reported without querying or following links.
Headers precede body reads; existing Watcher relevance gates encrypted reads.
Caller budgets have hard caps of 32 references/decrypt attempts, 64 KiB per
record and 256 KiB total fetched content/ciphertext. Attempts consume budget
including decryption failures. Missing/foreign records are indistinguishable.
Fresh State Synthesizer snapshots reuse the existing content and handoff types;
stale snapshots and mismatched handoffs are omitted. Packet hashes, per-item
hashes and explicit omissions/missing fields are returned to trusted executor
code. Packet content is private data and conveys no authority. No packet
persistence or runtime read-step binding is connected yet. The two open items
above retain entity-specific resolution and account-level budget integration.

## 8. Policy, tools, and approval integration

Depends on: 6, 7

- [ ] Add `src/runbook_authority.rs` to intersect definition tools, step tools, connected capabilities, account policy, and existing autonomy decisions.
- [ ] Reuse `ProactiveAutonomyTier`, `AutonomyDecision`, `proactive_policy`, and per-user overrides; do not add runbook-specific ambient authority.
- [ ] Treat external messages, spend, booking, publication, destructive action, and irreversible mutation as hard approval boundaries unless existing policy explicitly permits the exact action.
- [ ] Emit the existing action/approval AFP contract so `approval_surfaces.rs` and DecisionOS render it without a second queue.
- [ ] On policy denial, append a trace and fail or escalate; never ask an LLM to overrule policy.
- [ ] Add adversarial tests for unallowlisted tools, forged capability IDs, prompt-injected tools, excessive autonomy, approval replay, revoked capability, and cross-tenant execution.

## 9. Deterministic executor

Depends on: 6–8

- [ ] Implement `read`, `transform`, `tool`, `emit`, `wait`, `approval`, and `complete` steps without an LLM.
- [ ] Validate tool input/output schemas and reject unknown fields.
- [ ] Reuse existing capability/tool dispatch and AFP result persistence.
- [ ] Check success criteria deterministically before completing an instance.
- [ ] Store each meaningful step as `runbook_step_trace` with input/output refs and provenance.
- [ ] Add tests for every deterministic step, tool failure, schema failure, success criteria failure, and partial retry.

## 10. Epistemic escalation and resume

Depends on: 6, 7

- [ ] Detect required facts missing from the bounded evidence packet.
- [ ] Emit one `epistemic_escalation` with what is missing, what was tried, why it matters, an exact question, answer schema, and expiry.
- [ ] Project through the existing Decision Queue/A2UI input card rather than a new modal system.
- [ ] Resume only from a typed `runbook_input_supplied` AFP event linked to the open escalation.
- [ ] Reject wrong user, wrong instance, duplicate answer, invalid schema, late answer, and terminal instance.
- [ ] Add missing-info, resume, timeout, malformed answer, and user-isolation tests.

## 11. Bounded model steps and cost controls

Depends on: 7–10

- [ ] Add `src/runbook_llm_step.rs` for only `classify`, `reason`, and `draft` step kinds.
- [ ] Resolve inference through the current user BYOK/shared model ladder; do not read API keys directly in the runbook runtime.
- [ ] Start with `gpt-6-luna` low/medium for bounded frequent tasks and permit policy-controlled `gpt-6.1-sol` medium escalation only after acceptance criteria fail.
- [ ] Require structured output schema for classification/reasoning and AFP draft objects for draft steps.
- [ ] Use reusable cached prompt prefixes, source references, strict evidence limits, and generate only on meaningful input changes.
- [ ] Record model, prompt version, tokens, cost, approval state, revision, input/output hashes, and source refs in the step trace/provenance.
- [ ] Enforce account/runbook/instance budgets with graceful pause or simpler-model fallback; never silently exceed budget.
- [ ] Add mocked-provider tests for valid output, invalid schema, timeout, provider failure, cost ceiling, cached prefix, unchanged-input suppression, and escalation.

## 12. Follow-up event scheduling

Depends on: 4, 6, 9

- [ ] Represent waits and scheduled follow-ups as AFP events with due time, cancellation key, causation, instance, and source refs.
- [ ] Reuse the existing daemon/Watcher wake-up path rather than starting one scheduler per runbook.
- [ ] Enforce the definition's declared `follow_up_events` list before writing.
- [ ] Make delivery and resume idempotent; repeated daemon scans must not duplicate a step.
- [ ] Resolve cancel/reschedule by successor events, preserving the original schedule.
- [ ] Add due, not-due, cancel, reschedule, duplicate scan, undeclared event, and account-deletion tests.

## 13. Provenance and outcome memory

Depends on: 6, 8, 9, 11

- [ ] Reuse `build_action_provenance_record_afp` for actionable traces and hash definition, trigger, evidence packet, tool/model output, and approval.
- [ ] Extend the proactive provenance adapter only where shared metadata is missing; do not create a competing provenance format.
- [ ] Record outcomes under `runbook:<runbook_id>:<step_id>` and reuse proactive outcome/cooldown/priority functions.
- [ ] Keep family-level feedback cautious; acceptance never grants authority or bypasses approval.
- [ ] Add provenance hash, source dedupe, acceptance, dismissal, cooldown, retry-regret, and no-authority-escalation tests.

## 14. API and A2UI projections

Depends on: 3, 6, 8, 10, 12

- [ ] Add focused `src/server/runbook_routes.rs` endpoints for list/detail, enable/disable, validated successor edit, instance activity, cancel, and escalation answer.
- [x] Derive owner from authentication on every endpoint and rate-limit writes.
- [ ] Add semantic A2UI kinds for definition, instance, step trace summary, approval link, and epistemic question.
- [ ] Reuse current activity/fleet, Decision Queue, settings controls, badges, timeline, confirmation, toast, and failure-state primitives.
- [ ] Use consequence-specific action labels and expose evidence/provenance in user-facing language.
- [ ] Ensure mobile 320/375 px reflow, 200% zoom, keyboard focus restoration, screen-reader names, and colour-independent states.
- [ ] Keep raw definitions/secrets out of normal UI; advanced export is explicit and redacted.

## 15. Starter runbook integration tests

Depends on: 2, 5–14

- [ ] `no_reply_followup`: idle event -> bounded context -> draft -> approval -> permitted follow-up event.
- [ ] `calendar_conflict`: conflicting events -> alternatives -> epistemic question when priority is missing.
- [ ] `vendor_quote_received`: quote event -> one normalization -> Documents/response projection -> separate booking approval.
- [ ] `quote_missing_items`: normalized gaps -> exact questions -> no send before approval.
- [ ] `budget_threshold`: changed commitment -> category/total projection -> no invented target or spend.
- [ ] `wedding_task_deadline`: due task -> correct owner/context -> no duplicate decision task.
- [ ] `rsvp_non_response`: permission check -> reminder draft -> no send if permission absent.
- [ ] `runsheet_change`: timing diff -> affected viewers -> no publish before approval.
- [ ] General workflow/file/info-gap runbooks behave as specified.

## 16. Security, privacy, retention, and erasure

Depends on: 1–15

- [ ] Threat-model forged events, malicious definitions, prompt injection, capability escalation, cross-tenant refs, replay, timer abuse, and private-content leakage.
- [ ] Verify encrypted/private content follows current storage and decrypt-budget rules.
- [ ] Keep operational logs content-light and redact model/tool inputs.
- [ ] Add retention for derived traces/projections without deleting immutable evidence that policy requires to retain.
- [x] Extend account deletion to definitions, instances, traces, waits, receipts, caches, and projections. (Existing private-schema erasure verified for all currently persisted runbook types; no separate caches/projections exist.)
- [ ] Run dependency/security scans and targeted route abuse tests.

## 17. Verification and rollout

Depends on: 1–16

- [ ] Run Rust unit/integration tests, migration checks, all relevant proactive/Watcher/Synthesizer/approval tests, frontend typecheck, line budget, full Wedding tests where wedding runbooks are enabled, production build, and accessibility checks.
- [ ] Verify every new source file is below 999 lines and no existing oversized file is materially bloated.
- [ ] Run flags-off hosted shadow matching and compare expected definition/match counts without executing instances.
- [ ] Run an internal allowlist with deterministic steps only and inspect duplicate, policy-denial, stale, and cross-tenant metrics.
- [ ] Enable draft-only model steps after representative Luna-versus-Sol evaluation passes.
- [ ] Enable approval-gated tools only after security/privacy review and provider/sandbox evidence.
- [ ] Keep reversible action rollout separate and require objective acceptance, undo, error, and cost criteria.
- [ ] Freeze the exact candidate SHA; all evidence, build manifests, and deployment records must name it.

## Completion definition

This work is complete only when event-to-instance dispatch is deterministic and per-user, missing information pauses visibly, no tool can exceed existing authority, follow-ups are AFP events, all outcomes and costs are auditable, and A2UI projections use the same underlying ledger state. A starter pack existing in code is not completion unless it is copied into and isolated within each user's ledger.
