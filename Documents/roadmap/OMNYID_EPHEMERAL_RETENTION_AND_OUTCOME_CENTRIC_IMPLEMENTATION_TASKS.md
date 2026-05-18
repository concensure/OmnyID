# OmnyID Ephemeral Retention and Outcome-Centric Implementation Tasks

## Purpose

This document tracks the implementation work needed to make three design claims true in code:

1. low-value internal agent steps stay off the hot path via `metadata.store: false`
2. low-value internal history can be archived or removed from active indexes with user approval
3. the hidden agent runtime operates outcome-centrically while the UI continues to expose stable human-facing nodes

It is dependency ordered. Earlier steps unblock later steps.

---

## Current Status

### Already implemented

- `metadata.store: false` is enforced server-side in `src/message.rs` and `src/db.rs`
- lightweight `backlink_update` messages now feed a derived backlink index:
  - in-memory curator projection in `src/knowledge_curator.rs`
  - persisted `afp_backlinks` upsert path in `src/db.rs`
  - ingestion hook in `src/server/mod.rs`
- human-facing preset nodes already exist in the builder and server preset expansion paths:
  - `Email Guardian`
  - `Research Assistant`
  - `Content Publisher`
- `src/workflow_supervisor.rs` already contains a hidden runtime-node model (`GoalIntake`, `Plan`, `Executor`, `Reflection`, `CapabilityRouter`, `CustomNodeBuilder`)

### Partially implemented

- `metadata.store: false` exists as a persistence mechanism, but there is not yet a codified policy that automatically classifies low-value Master Agent messages as ephemeral
- archive export and MinIO backup exist, but there is no user-approved curator cleanup flow for low-value internal messages
- workflow supervisor/runtime nodes exist, but the system is not yet fully wired so the Master Agent consistently executes through an outcome-centric planner/reflection loop instead of older responsibility-shaped paths

### Not yet implemented

- user-facing approval flow for curator archival / active-index cleanup of low-value internal messages
- active-index pruning rules for low-value internal messages
- cold-path lifecycle that moves old internal-heavy message history out of the hot query path while preserving auditability
- explicit outcome-centric compiler/runtime policy for hidden nodes, with stable human-facing builder nodes mapped onto it end to end

---

## Dependency-Ordered Tasks

## Phase 1: Classify Ephemeral Internal Messages

### Task 1.1: Define message-value classification contract

- Add a shared classification schema for internal AFP messages:
  - `high_value`
  - `user_visible`
  - `approval_relevant`
  - `replay_required`
  - `low_value_internal`
- Store the classification in AFP metadata for internal agent/runtime messages
- Ensure classification does not break existing AFP clients

Primary files:

- `src/message.rs`
- `typescript-sdk/src/index.ts`
- `python-sdk/afp/*` where internal messages are emitted

### Task 1.2: Auto-apply `metadata.store: false` to low-value internal steps

- Add policy helpers so intermediate reflections, temporary plans, retry chatter, and transient coordination messages default to `store: false`
- Keep final decisions, approval gates, durable tool results, and user-visible actions persisted
- Add regression tests proving high-value messages still persist

Primary files:

- `src/message.rs`
- `src/db.rs`
- `src/workflow_supervisor.rs`
- `python-sdk/afp/master.py`

### Task 1.3: Surface persistence intent in traces

- Expose whether a runtime message was persisted or intentionally ephemeral in run traces / inspector data
- Make this visible in workflow run detail so operators can tell the difference between “not stored by design” and “missing”

Primary files:

- `src/server/mod.rs`
- `solid-ui/src/components/WorkflowsView.tsx`

---

## Phase 2: Curator Cleanup and Active-Index Pruning

### Task 2.1: Define low-value cleanup candidate rules

- Teach the Knowledge Curator how to identify low-value internal messages for archival / active-index removal
- Candidate rules should use:
  - message classification from Phase 1
  - age
  - whether a later durable checkpoint supersedes the message
  - whether the message is referenced by a surviving durable result

Primary files:

- `src/knowledge_curator.rs`
- `src/server/mod.rs`

### Task 2.2: Add curator cleanup proposal objects

- Add a new internal cleanup proposal shape that lists:
  - candidate message ids
  - reason
  - expected hot-path reduction
  - whether only active-index removal or full archival is proposed
- Keep cleanup proposals auditable

Primary files:

- `src/knowledge_curator.rs`
- `src/db.rs`

### Task 2.3: Build user approval flow for cleanup

- Add an approval path before the curator archives or de-indexes low-value internal messages
- Approval UI should allow:
  - approve all
  - reject
  - inspect candidates

Primary files:

- `src/server/mod.rs`
- `solid-ui/src/components/WorkflowsView.tsx`
- any inbox / dashboard approval surfaces already used for workflow approval

### Task 2.4: Implement active-index pruning

- Remove approved low-value messages from hot-path indexes while preserving audit traceability
- Ensure backlink and search indexes are updated safely
- Keep archive/export paths intact

Primary files:

- `src/db.rs`
- `src/server/mod.rs`
- `src/knowledge_curator.rs`

---

## Phase 3: Cold Storage Lifecycle for Internal-Heavy History

### Task 3.1: Separate hot-path eligibility from archival eligibility

- Define rules for when a message:
  - stays fully hot
  - remains stored but leaves the active index
  - moves to cold storage
- Preserve replay/export semantics

Primary files:

- `src/db.rs`
- `src/export.rs`
- `postgres/migrations/*` if schema changes are needed

### Task 3.2: Add internal-message archival worker path

- Build archival flow for approved low-value internal messages using existing archive/cold-storage infrastructure
- Persist metadata stubs needed for audit/history
- Ensure restore path can bring archived messages back if needed

Primary files:

- `src/server/mod.rs`
- `src/db.rs`
- `scripts/omnyid-backup.sh`
- `scripts/omnyid-restore.sh`

### Task 3.3: Keep queries off the cold path by default

- Update search/thread/runtime query paths so archived low-value internal messages do not slow normal interaction
- Add explicit “include archived history” modes for forensic/audit views only

Primary files:

- `src/server/mod.rs`
- `src/db.rs`
- `solid-ui/src/components/*` relevant search/run detail views

---

## Phase 4: Outcome-Centric Hidden Runtime

### Task 4.1: Define outcome-centric runtime contract

- Hidden nodes should be framed and executed around desired outcomes, not rigid responsibilities
- Add explicit outcome fields to node planning/execution contracts where missing:
  - expected outcome
  - success criteria
  - fallback / replan trigger

Primary files:

- `src/workflow_supervisor.rs`
- `src/master_orchestrator.rs`
- `python-sdk/afp/master.py`

### Task 4.2: Route preset nodes through outcome-centric hidden nodes

- Ensure human-facing nodes such as `Email Guardian`, `Research Assistant`, and `Content Publisher` compile into hidden runtime graphs that remain flexible internally
- Preserve stable UI labels while allowing adaptive internal execution

Primary files:

- `src/server/mod.rs`
- `src/workflow_supervisor.rs`
- `solid-ui/src/components/WorkflowsView.tsx`

### Task 4.3: Remove remaining responsibility-shaped fallbacks

- Audit remaining monolithic or fixed-task-list execution paths
- Replace them with outcome-driven planning/reflection/replan logic
- Keep compatibility shims only where required during migration

Primary files:

- `python-sdk/afp/master.py`
- `src/master_orchestrator.rs`
- `src/workflow_supervisor.rs`

### Task 4.4: Expose user-trustable stable surface

- Confirm the builder and inspector continue to present fixed-looking human-facing nodes
- Keep hidden runtime complexity out of the default non-technical UI
- Add operator/developer inspection mode for hidden node execution only where useful

Primary files:

- `solid-ui/src/components/WorkflowsView.tsx`
- preset-expansion logic in `src/server/mod.rs`

---

## Phase 5: Validation

### Task 5.1: Add test coverage for selective persistence

- Tests for:
  - low-value internal messages default to `store: false`
  - important checkpoints persist
  - final retry result contains enough history to preserve auditability

### Task 5.2: Add test coverage for cleanup and archival

- Tests for:
  - cleanup proposal generation
  - approval required before pruning
  - active-index pruning leaves archive/export intact
  - archived messages stay off default hot-path queries

### Task 5.3: Add test coverage for outcome-centric runtime

- Tests for:
  - preset nodes compile to hidden runtime graphs
  - hidden runtime can adapt step count while preserving expected outcome
  - stable human-facing nodes remain unchanged in the builder surface

---

## Recommended Execution Order

1. Phase 1
2. Phase 4.1
3. Phase 4.2
4. Phase 2
5. Phase 3
6. Phase 4.3
7. Phase 4.4
8. Phase 5

Reason:

- selective persistence classification is the foundation for cleanup and archival
- outcome-centric hidden-node contract should be settled before broad runtime migration
- cleanup and cold storage should not be built on top of undefined message-value semantics

---

## Done Criteria

This work is complete when all of the following are true:

- low-value internal runtime chatter is automatically emitted with `metadata.store: false`
- durable checkpoints remain sufficient for replay, approval, and user trust
- curator cleanup of low-value internal messages requires user approval
- hot-path indexes exclude approved low-value internal history by default
- archived internal-heavy history is recoverable but not on the default hot path
- human-facing builder nodes remain stable and understandable
- hidden runtime execution is demonstrably outcome-centric rather than fixed-responsibility centric
