# Per-User Proactive Runbooks — Development Tasks

Task: WED-308
Order: dependency order
Rule: reuse the proactive/Watcher/Synthesizer/policy/approval stack; do not create a parallel event, authority, memory, or UI system.

## 0. Freeze and inventory

- [ ] Create the implementation worktree from the reviewed WED-308 documentation commit and record its full 40-character SHA.
- [ ] Confirm the exact production SHA and current rollout flags before implementation.
- [ ] Inventory active work that overlaps proactive routes, AFP message contracts, daemon scheduling, approval surfaces, A2UI, or migrations.
- [ ] Record current tests for passive-event ingestion, Watcher, heuristic packs, autonomy, provenance, outcomes, State Synthesizer, approval cards, and account erasure.
- [ ] Keep all runbook execution flags false by default.

## 1. Contract and validation module

Depends on: 0

- [ ] Add `src/runbook_contract.rs` with typed `RunbookDefinition`, trigger/filter, bounded step, success criterion, escalation, instance, trace, and epistemic escalation contracts.
- [ ] Define reviewed enums for step kinds, filter operators, instance states, max autonomy, and escalation reasons; reject unknown values.
- [ ] Enforce definition size, step count, per-step input, retry, follow-up, tool, and evidence limits.
- [ ] Validate that every emitted follow-up type is declared and every tool step uses the definition allowlist.
- [ ] Validate state transitions and prohibit terminal-state reopening.
- [ ] Add AFP builders/parsers that preserve standard envelope fields, `parent_id`, references, supertags, searchable metadata, and private-content separation.
- [ ] Add round-trip, malformed input, unknown field, oversized definition, invalid transition, and private-field leakage tests.

## 2. Immutable starter templates and per-user seeding

Depends on: 1

- [ ] Add `src/runbook_starter_pack.rs`; keep immutable code templates separate from mutable user definitions.
- [ ] Implement at least the twelve starter runbooks specified in the spec with deterministic steps and explicit approval boundaries.
- [ ] Copy selected starter definitions into each user's AFP ledger during first-run setup; never query one global mutable definition row as runtime truth.
- [ ] Make seeding idempotent by `(owner, starter_pack_version, runbook_id)`.
- [ ] Do not overwrite a user-edited or disabled definition when a starter pack changes; offer a successor preview instead.
- [ ] Add tests for first seed, repeat seed, user edit preservation, disable preservation, pack upgrade, and two-user isolation.

## 3. Per-user registry projection

Depends on: 1, 2

- [ ] Add `src/runbook_registry.rs` to read the latest non-superseded definition per runbook from the authenticated user's private ledger.
- [ ] Scope every query by derived owner and reject caller-supplied cross-user references.
- [ ] Build indexes/projections from AFP metadata only where possible; do not create an independent mutable definition source of truth.
- [ ] Support enable, disable, supersede, archive, export, and validated import as AFP successor events.
- [ ] Cache only immutable parsed definitions by owner/version/hash and invalidate on a successor event.
- [ ] Add tests for version ordering, archive, stale edit conflicts, forged owner, forged parent, cache invalidation, and account erasure.

## 4. Existing-event adapter

Depends on: 1

- [ ] Add a normalized proactive-event adapter over stored `passive_event`, Watcher alert/resolution, workflow, vendor, document, wedding, and internal due-event AFP kinds.
- [ ] Preserve source and entity references, confidence, urgency, occurrence time, and causation without copying raw bodies.
- [ ] Add a small post-persistence dispatcher hook to `proactive_routes.rs`; keep substantive logic out of that already-large file.
- [ ] Add the same hook at the reviewed background-Watcher/daemon boundary for events that do not pass through the HTTP route.
- [ ] Make event normalization idempotent and reject events that are not owned by the current daemon partition.
- [ ] Add tests for email, calendar, Watcher, vendor quote, RSVP, task, workflow failure, scheduled follow-up, malformed, and cross-tenant events.

## 5. Pure matcher and dedupe

Depends on: 3, 4

- [ ] Add `src/runbook_matcher.rs` with zero-model typed filter evaluation.
- [ ] Implement stable ordering: priority descending, specificity descending, version descending, runbook ID ascending.
- [ ] Select the first match per dedupe group plus independent definitions, capped at five instances per event.
- [ ] Compute `instance_key = sha256(owner,event,definition,version)` and suppress retries with the same key.
- [ ] Record matched/suppressed results as content-light AFP audit events.
- [ ] Reuse relevant exact/range condition semantics from `proactive_engine.rs` without coupling execution to `ProactiveHeuristic`.
- [ ] Add tests for correct match, no match, stable ties, dedupe group, duplicate delivery, cap, disabled/superseded definition, and user isolation.

## 6. Instance store and state machine

Depends on: 1, 5

- [ ] Add `src/runbook_runtime.rs` with append-only instance revisions and one dedicated AFP thread per instance.
- [ ] Enforce the documented transition graph under an owner/instance advisory lock or equivalent transaction boundary.
- [ ] Make every step idempotent on owner, instance, step, and input hash.
- [ ] Return prior trace/response on exact retry and a reviewable conflict on changed inputs.
- [ ] Bound retries and apply existing cooldown signals after repeated failures.
- [ ] Add cancel and timeout resolution events rather than deleting waits or instances.
- [ ] Add concurrency tests for duplicate dispatch, two workers advancing one step, stale revision, retry, cancel, timeout, and terminal state.

## 7. Structure-first evidence packets

Depends on: 4, 6

- [ ] Add `src/runbook_evidence.rs` that resolves only typed source/entity references and bounded query limits.
- [ ] Reuse State Synthesizer snapshots and `SynthesizerToMasterHandoff` where relevant instead of synthesizing a parallel state model.
- [ ] Reuse current metadata relevance/decrypt-budget rules before reading encrypted content.
- [ ] Record included refs, omitted categories, missing required fields, snapshot ref, hashes, and confidence.
- [ ] Reject unbounded history/RAG requests in a definition.
- [ ] Add tests for reference-only retrieval, bounded counts, missing records, private records, decrypt budget, stale synthesis, and cross-user refs.

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
- [ ] Derive owner from authentication on every endpoint and rate-limit writes.
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
- [ ] Extend account deletion to definitions, instances, traces, waits, receipts, caches, and projections.
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
