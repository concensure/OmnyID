# Calculus Inspired Agent Behaviour Task Plan

## Summary

This task plan converts the "Calculus inspired agent behaviour" direction into a dependency-ordered implementation sequence that fits the current OmnyID codebase.

It does **not** assume a greenfield redesign. It assumes the existing OmnyID shapes remain primary:

- AFP v1 remains the only atomic unit
- Ledger remains append-only and message-first
- Master Agent remains the only durable orchestrator
- A2UI remains the only user-facing output layer
- existing families such as `knowledge_link`, `state_snapshot`, `watcher_alert`, `smart_suggestion`, `file_ledger`, and `browser_task` are **extended**, not replaced, except where a misleading overloaded family needs a clearer additive counterpart

This plan differs from a strict reading of the prompt in one important way: where the repo already has a working or partially working AFP family for a concern, the plan extends that family instead of introducing a new one.

## Current Repo Checkpoint

The repo is no longer at the earlier "contract drift / stale test fixture" stage. As of the current implementation checkpoint:

- `relation_link` is implemented as the generic relation family while legacy `knowledge_link` remains readable
- lightweight `provenance_record` support exists in AFP
- explicit `parent_id` lineage is wired for browser-task follow-up messages and decision outcome chains
- `state_snapshot` now carries additive watcher-derived continuity signals and compact continuity metrics
- `state_snapshot` now also carries derivative-style heuristic scores for velocity, urgency, context switching, queue pressure, and follow-up drift
- synthesizer handoff escalation now uses bounded derivative thresholds instead of raw queue presence alone
- the Rust suite is green again (`cargo test` passes), so remaining work is feature development rather than test-debt cleanup

That changes the practical next step: the project should now bias toward watcher/synthesizer/projection feature work rather than more schema migration work.

## Existing-System Guardrails

- do not break or remove existing `knowledge_link` readers or stored data
- do not replace `state_snapshot` with a parallel continuity snapshot type
- do not replace `watcher_alert` / `smart_suggestion` with a second proactive-output family
- do not create a second durable orchestrator beside Master Agent
- do not move user-facing logic outside A2UI
- do not introduce plaintext-only side channels for traces, provenance, or cognition
- use `parent_id` explicitly for lineage when a message is a follow-up action, result, or audit artifact
- use additive schema evolution first; old messages must remain readable

## Current Implementation Anchors

| Concern | Existing touchpoints | Implementation direction |
| --- | --- | --- |
| Watcher heuristics and runtime | `src/background_watcher.rs`, `src/background_watcher_runtime.rs`, `src/background_watcher_heuristics.rs` | Extend watcher output and escalation contracts rather than replacing the watcher loop. |
| State synthesis and homepage continuity | `src/state_synthesizer.rs`, `src/state_synthesizer_contract.rs`, `src/state_snapshot.rs` | Treat these as the core substrate for derivative/state outputs. |
| Topology / relationship memory | `src/entity_extractor.rs`, `src/ledger_ingestion_agent.rs`, `src/topology_retrieval.rs` | Add a generic `relation_link` family for user-facing and agent-facing topology while keeping `knowledge_link` readable for legacy and knowledge-curation-specific flows. |
| Projection / proactive suggestion layer | `src/projection_agent.rs`, `src/proactive_engine.rs`, `src/server/proactive_routes.rs` | Extend current suggestion flow with stronger derivative inputs and provenance. |
| Browser / action execution | `src/browser_automation.rs`, `src/cli_executor.rs`, workflow trace surfaces | Use explicit `parent_id` lineage and optional `provenance_record` artifacts for auditable execution. |
| Audit / provenance | `src/workflow_trace_events.rs`, `src/message.rs`, optional `src/provenance_record.rs` | Keep workflow traces and provenance records complementary, not duplicative. |
| A2UI / continuity surfaces | `solid-ui` continuity/dashboard/renderer surfaces | Reuse existing decision/homepage surfaces before creating any new UI class. |

## Contract Decisions

These are the contract-level decisions this plan assumes.

### 1. Reuse existing AFP families where the name remains semantically honest

- `relation_link` becomes the generic topology / relation family
- `knowledge_link` remains valid for existing knowledge-curation / extraction-origin flows and legacy stored messages
- `state_snapshot` remains the durable synthesized continuity snapshot
- `watcher_alert` and `smart_suggestion` remain the primary proactive user-facing outputs
- `browser_task` remains the browser execution family
- `file_ledger` remains the structured file-memory family

`knowledge_link` is not a good long-term generic relation name for OmnyID because raw AFP `type` values are surfaced in filterable UI and operational tooling. Using `knowledge_link` as the one universal relation family would misleadingly imply that all relation edges are "knowledge" artifacts. The migration rule is therefore additive:

- introduce `relation_link` for generic typed relations and topology edges
- keep `knowledge_link` readable and queryable during migration
- teach retrieval and filters to handle both until old producers are retired

### 2. Add only one new optional audit family

- `provenance_record` may be added as a lightweight optional AFP type for compact action provenance
- it does not replace workflow trace events
- it does not replace the original action or result message

### 3. Make lineage explicit with `parent_id`

Use `parent_id` for:

- request -> progress/result/block/unblock execution chains
- decision -> outcome record chains
- action/result -> provenance_record audit chains
- snapshot / ledger evolution chains where a new message supersedes or follows the previous one

## Delivery Phases

Each phase is shippable and should be implemented in order.

## Phase 0. Baseline Normalization

### Objective

Create one coherent map of the existing cognitive-continuity system before broad changes.

### Tasks

1. Audit and document the current behavior split among:
   - Background Watcher
   - State Synthesizer
   - Projection Agent
   - Master Agent
   - topology retrieval
   - browser / tool execution

2. Normalize terminology across docs and code.
   - "derivative layer" should map to State Synthesizer behavior, not a new agent name
   - "integral layer" should map to Knowledge Curator / topology accumulation behavior, not a new family
   - "kinetic / strategic layer" should map to Projection + Master orchestration behavior

3. Define the minimum lineage rule set.
   - when `parent_id` is required
   - when `parent_id` is optional
   - when a compact `provenance_record` should be emitted

### Acceptance criteria

- the implementation map is explicit enough that future task work does not duplicate existing families
- prompt terminology and repo terminology are aligned

## Phase 1. AFP Contract Tightening

Depends on: Phase 0

### Objective

Strengthen message contracts so the continuity system can operate with richer metadata-first reasoning and explicit audit lineage.

### Tasks

4. Add `relation_link` and keep `knowledge_link` backward compatible.
   - `relation_link` is the generic typed relation family
   - `knowledge_link` remains valid for legacy and knowledge-curation-origin messages
   - both families share compatible content fields where practical
   - retrieval must read both during migration

5. Extend `state_snapshot` additively.
   - add derivative-oriented confidence and freshness notes where needed
   - preserve current homepage-briefing semantics

6. Extend `watcher_alert` / `smart_suggestion` metadata.
   - add fields for heuristic provenance, escalation level, and suppression rationale

7. Add optional `provenance_record` AFP support.
   - compact hashes
   - actor
   - action label/type
   - source refs
   - confidence
   - context payload

8. Standardize parent-chain rules in action families.
   - browser-task families
   - tool-call families
   - outcome diary families
   - any future sensitive automation result family

### Current implementation progress

- Task 4 is implemented for the current migration path:
  - `relation_link` exists in the AFP contract
  - legacy `knowledge_link` remains readable
  - Rust retrieval reads both families
  - TypeScript SDK exposes shared relation-link content schema
- Task 7 is implemented as a minimal optional layer:
  - `provenance_record` exists as a lightweight additive AFP family
  - current implementation is intentionally compact and audit-oriented rather than a second trace system
- Task 8 is implemented for the current action path:
  - explicit `parent_id` lineage is already wired for browser-task follow-up messages, decision outcome records, and optional `provenance_record` audit messages
- Rust verification is restored:
  - `cargo test` passes
  - the remaining work is no longer blocked by unrelated compile or fixture failures

### Acceptance criteria

- richer schemas are additive
- old messages remain readable
- action lineage is explicit rather than inferred ad hoc

## Phase 2. Watcher As State Streamer

Depends on: Phase 1

### Objective

Make Background Watcher behave more like a low-overhead state-streamer without replacing its current heuristic-first role.

### Tasks

9. Define normalized watcher signal packets.
   - timestamps
   - message type / kind
   - supertags
   - thread_id
   - freshness
   - urgency hints
   - decrypt-needed flag

10. Add sliding-window aggregation inputs.
   - rolling recent events
   - burst detection
   - topic repetition
   - thread reactivation
   - calendar deadline proximity

11. Add watcher suppression / escalation metadata.
   - why an event was suppressed
   - why an event was escalated
   - whether escalation was due to risk, ambiguity, or user preference

12. Route high-value watcher output into synthesizer-friendly envelopes.
   - do not let Watcher generate heavyweight continuity summaries itself

### Acceptance criteria

- Watcher stays cheap and metadata-first
- Watcher becomes a better source of structured continuity signals

## Phase 3. State Synthesizer As Derivative + State Operator

Depends on: Phase 2

### Objective

Extend the existing State Synthesizer into the primary derivative/state layer.

### Tasks

13. Define the derivative feature set over existing signals.
   - activity velocity
   - urgency acceleration
   - context switching rate
   - unresolved queue pressure
   - follow-up drift

14. Implement EMA-based state change scoring.
   - use metadata-first signals where possible
   - allow selective deeper reasoning only when thresholds are crossed

15. Extend `state_snapshot` generation rules.
   - Daily Briefing
   - Decision Queue
   - Context Panel
   - confidence notes
   - freshness / staleness semantics

16. Add bounded escalation from synthesizer to Master Agent.
   - only escalate when synthesis indicates action, ambiguity, or risk

### Current implementation progress

- Task 13 is implemented in the current additive form:
  - `state_snapshot.continuity_metrics` now includes derivative-style heuristic scores
  - current scores cover activity velocity, urgency acceleration, context switching, unresolved queue pressure, and follow-up drift
- Task 14 is implemented for the current production path:
  - derivative scores are smoothed through the `ema_state` substrate where prior snapshot state exists
  - scoring remains metadata-first and only escalates into heavier reasoning through bounded handoff thresholds
- Task 15 is implemented for the current homepage continuity path:
  - `state_snapshot` carries Daily Briefing, Decision Queue, Context Panel, confidence notes, staleness, continuity metrics, watcher signals, prepared context, and prepared draft handoffs
- Task 16 is implemented for the current handoff path:
  - `build_synthesizer_handoff` now escalates from bounded derivative thresholds
  - default surface selection now uses derivative pressure and drift, not only queue presence
  - browser action candidates stay bounded and only appear on escalated paths

### Acceptance criteria

- State Synthesizer produces a coherent derivative-aware continuity snapshot
- homepage continuity remains calm and bounded

## Phase 4. Knowledge Curator As Integral + Topology Operator

Depends on: Phase 1
Recommended after: Phase 3 has begun

### Objective

Make long-term integration and neighborhood retrieval more mathematically consistent without replacing current retrieval infrastructure.

### Tasks

17. Extend `relation_link` ingestion and topology retrieval.
   - richer relation labels
   - continuity-oriented groupings
   - stronger typed neighborhoods
   - preserve mixed operation with legacy `knowledge_link`

18. Add topological neighborhood retrieval rules.
   - same thread
   - same project / area / resource
   - same open question
   - same entity cluster
   - same follow-up chain

19. Add decay and resurfacing heuristics.
   - power-law or staged decay
   - resurfacing by unresolvedness, recurrence, or user-declared importance

20. Integrate `file_ledger` into the same neighborhood substrate.
   - file summaries
   - relation refs
   - retrieval-friendly metadata

### Current implementation progress

- Task 17 is implemented for the current migration path:
  - ingestion emits `relation_link` membership/topology edges
  - coarse extraction artifacts still emit `knowledge_link`
  - topology retrieval already accepts both families during migration
- Task 18 is implemented for the current continuity retrieval path:
  - topology retrieval already groups by same thread and same relationship
  - topology retrieval now adds `same_follow_up_chain` via explicit `parent_id`
  - topology retrieval now adds PARA-style `same_project`, `same_area`, and `same_resource` groupings from existing supertags
  - topology retrieval also groups shared objects/entities, source messages, source attachments, file paths, file-ledger links, and open-question refs
- Task 19 is implemented for the current retrieval path:
  - `topology_decay` ranks freshness, confidence, follow-up chains, unresolvedness, recurrence-style links, and declared importance cues
  - dormant linked context can resurface as `reactivated` without overwhelming fresher context
- Task 20 is implemented for the current file-memory path:
  - `file_ledger` messages participate through ledger refs, file-path refs, file-entry supertags, and retrieval-friendly metadata
- Relation-family migration itself is now effectively complete for the current topology path
- the remaining Phase 4 risk is calibration against larger real workspaces, not core substrate completeness

### Acceptance criteria

- topology retrieval feels like an extension of current memory, not a new memory system
- long-term continuity can be explained through links and neighborhoods

## Phase 5. Projection + Master As Kinetic / Strategic Layer

Depends on: Phases 3 and 4

### Objective

Use derivative and topology outputs to improve anticipation and strategy without creating a second planner.

### Tasks

21. Define projection inputs from watcher + synthesizer + topology.
   - short-horizon urgency
   - repeated unresolved patterns
   - upcoming risk windows
   - habit or health drift

22. Extend suggestion emission using existing families.
   - `watcher_alert` for sharper interventions
   - `smart_suggestion` for gentle, low-cognitive-load nudges

23. Add Master-Agent decision policies over proactive outputs.
   - surface now
   - defer
   - suppress
   - ask approval
   - delegate browser/tool action

24. Make strategic outputs lineage-aware.
   - suggestions should reference their upstream snapshot / watcher / source messages
   - emit `provenance_record` for sensitive or action-driving outputs when warranted

### Current implementation progress

- Task 21 is implemented for the current projection path:
  - `projection_agent` uses the latest synthesized `state_snapshot`, watcher/task/pattern/temporal context, and topology neighborhoods derived from snapshot source refs
- Task 22 is implemented additively:
  - proactive outputs continue using existing `watcher_alert`, `smart_suggestion`, and `proactive_suggestion` families rather than a second planner output family
- Task 23 is implemented for proactive suggestions:
  - `proactive_policy` assigns `surface_now`, `defer`, `suppress`, `ask_approval`, or `background_only`
  - runtime suggestions carry strategic, surface, approval, and autonomy metadata
- Task 24 is implemented for action-driving proactive suggestions:
  - `proactive_bundle` builds suggestion-plus-companion AFP bundles
  - `proactive_provenance` emits parented `provenance_record` companions for `ask_approval` and `surface_now` suggestions
  - `server/proactive_routes` stores companion provenance AFPs after storing the proactive suggestion

### Acceptance criteria

- Projection remains anticipatory rather than noisy
- Master stays the only durable orchestrator

## Phase 6. Provenance And Trust Surfaces

Depends on: Phases 1, 3, and 5

### Objective

Turn raw lineage and audit data into a useful trust surface for users.

### Tasks

25. Standardize `provenance_record` emission policy.
   - browser result
   - tool result
   - sensitive recommendation
   - high-stakes state transition

26. Add provenance summaries to A2UI surfaces.
   - "based on 3 sources"
   - confidence text
   - source chips / source refs
   - compact audit explanation

27. Connect workflow trace and provenance UX.
   - traces remain detailed execution evidence
   - provenance remains compact user-facing justification

### Acceptance criteria

- provenance improves trust without overwhelming the user
- provenance and workflow traces do not compete semantically

## Phase 7. Validation, Rollout, And Backward Compatibility

Depends on: all prior phases

### Objective

Ship the calculus-inspired evolution without breaking current continuity behavior.

### Tasks

28. Validate schema compatibility.
   - old `knowledge_link`
   - new `relation_link`
   - old `state_snapshot`
   - old watcher outputs
   - old browser/task outputs

29. Validate privacy budget behavior.
   - metadata-first retrieval
   - selective decryption
   - bounded escalation

30. Validate UX calmness.
   - no homepage overload
   - no duplicate proactive messages
   - no provenance spam

31. Roll out by additive-reader-first strategy.
   - update readers
   - emit optional new fields
   - then tighten writer expectations where justified

### Acceptance criteria

- continuity outputs remain simple and explainable
- rollout does not require historical AFP rewrites

## Recommended Implementation Sequence

If work needs to be broken into concrete passes, the most sensible order is:

1. Phase 0 and Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6
7. Phase 7

This is intentionally aligned with existing OmnyID implementation seams so the project evolves by extension rather than replacement.

## Immediate Next Passes

Now that Phases 3-5 are functionally wired, the most sensible concrete next passes are:

1. Broader A2UI continuity signal treatment
   - proactive suggestion cards now show compact provenance/policy footer summaries from the existing `provenance_record` path
   - home queue surfaces now show compact watcher-signal chips for urgency, escalation, suppression, decrypt-needed, and source-count context
   - home queue surfaces now show compact continuity trend bars from smoothed `state_snapshot` metrics, with watcher-signal fallback

2. Calibration and scale validation
   - compact trend state now exposes calibration readiness from snapshot sample history, watcher fallback, stable/variable/spiky sample volatility review, and sparse mixed-history metric coverage
   - topology retrieval now bounds large shared-neighborhood fan-out while preserving fresh project context under result limits
   - projection anchor selection now prioritizes active queue/watch context before broad snapshot sources in large workspaces
   - test derivative thresholds, topology resurfacing, and proactive policies against larger real workspaces before personalizing thresholds
   - keep reader compatibility and metadata-first behavior

3. End-to-end provenance validation
   - pure bundle/provenance tests now verify action-driving suggestions produce exactly one parented companion record with source refs, policy context, and canonical input hash coverage
   - pure bundle/provenance tests now confirm defer, suppress, and background-only suggestions do not produce provenance spam
   - route storage adapter tests now verify generated companion provenance AFPs survive conversion to storable AFP messages with parent/content/store semantics intact
   - an opt-in live database smoke test now stores a generated proactive suggestion plus companion provenance record through the public message store when `OMNYID_RUN_DB_SMOKE=1`
   - local opt-in smoke now passes against compose Postgres at `postgres://afp:afp@127.0.0.1:5432/afp`; remaining validation is threshold/resurfacing calibration against larger real workspaces

## Phase 3-5 Release Sign-Off

Current status: production-ready locally, with larger-workspace calibration still required before changing thresholds or personalization.

- Phase 3 now has derivative-aware `state_snapshot` metrics, watcher signals, EMA smoothing, confidence notes, prepared context/draft handoffs, and bounded synthesizer escalation.
- Phase 4 now has mixed `knowledge_link` / `relation_link` topology retrieval, follow-up-chain grouping, PARA grouping, object/entity grouping, source-message and source-attachment grouping, open-question grouping, file-ledger/file-path participation, and decay/resurfacing ranking.
- Phase 5 now has snapshot-first projection objectives, topology-neighborhood projection context, proactive strategic policy, approval/surface policy metadata, suggestion bundles, parented `provenance_record` companions, and runtime storage for action-driving proactive provenance.
- Wedding planner projection queue and PersonalOS projection adapters now reuse the generic continuity projection state instead of carrying separate queue/ranking logic.
- verification status: focused Rust provenance/bundle/storage tests, broader Rust tests, typecheck, focused continuity trend tests with larger-history calibration coverage, wedding UI tests, and local opt-in Postgres smoke are green after these passes.

Release validation commands already exercised locally:

- `cargo test --lib`
- `cargo test proactive_bundle --lib`
- `cargo test proactive_provenance --lib`
- `cargo test proactive_companion_storage --lib`
- `$env:OMNYID_RUN_DB_SMOKE='1'; $env:DATABASE_URL='postgres://afp:afp@127.0.0.1:5432/afp'; cargo test local_postgres_proactive_bundle_persists_suggestion_and_companion_provenance --lib`
- `node --import ./tests/node-ts-specifier-hooks.mjs --experimental-strip-types --test tests/decisionos-continuity-trend-state.test.ts`
- `npm run typecheck`
- `npm run test:wedding`

What remains incomplete or calibration-sensitive:

- thresholds and resurfacing weights now have conservative UI calibration visibility plus sample-volatility, sparse-coverage, bounded topology fan-out, and active-anchor prioritization review, but still need tuning against larger real-world workspaces
- A2UI now has compact proactive provenance/policy summaries, watcher-signal chips, and continuity trend bars
- escalation uses bounded thresholds, but those thresholds are still static and not yet personalized by user profile or longer-horizon behavioral calibration
- opt-in live database smoke coverage passed against local compose Postgres; rerun against the deployed Postgres path before final release sign-off if that differs from local compose
