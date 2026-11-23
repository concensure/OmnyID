# OmnyID Agent Filesystem Integration Plan

## Status

Date: 16/04/2026

This document defines a lightweight integration plan for an agent-facing "filesystem" abstraction in OmnyID.

The abstraction is not a new storage system.

It is an API layer over existing OmnyID primitives:

- AFP append-only threads remain the source of truth
- ElectricSQL remains the local-first sync and query substrate
- end-to-end encryption remains the default storage boundary
- delegation keys remain the authority boundary for sub-agents

The purpose is to make the Master Agent and delegated sub-agents cheaper, simpler, and more reliable to implement by exposing high-level thread operations instead of repeated low-level AFP scans.

Implementation status on 16/04/2026:

- roadmap updated with the explicit filesystem milestone and note-thread deferral
- Master Agent now emits explicit `agent:plan` messages during conversational planning and replanning
- long-thread compression now appends `agent:workflow_summary` AFP messages
- authenticated workspace filesystem endpoints now expose thread read, thread summary lookup, and grep-style search
- Python SDK now exposes `read_thread`, `get_thread_summary`, `grep_thread`, `append_plan`, and `append_summary`
- note-thread filesystem migration remains deferred until note taxonomy, curator behavior, and UI separation are designed together

## 1. Design Position

The following framing is correct and should guide implementation:

- the "filesystem" is an abstraction layer on top of AFP + ElectricSQL
- agents operate on named thread handles, tags, summaries, and ledgers
- the abstraction does not replace AFP messages, notes, or ElectricSQL
- every write still becomes an AFP message
- every read still resolves from AFP-backed local state or derived indexes

In practical terms:

- `read_thread("ledger_research")` should resolve to the latest materialized state of an AFP-backed thread
- `list_by_tag("#Trips")` should resolve through AFP-backed tag metadata or derived indexes
- `grep("battery", thread_id)` should query local synced AFP content, not remote plaintext
- `update_ledger(...)` should append new AFP messages rather than mutate prior ones

This should be treated exactly like a filesystem API over immutable log-backed storage.

## 2. Goals

- reduce token waste from repeated thread reconstruction
- make orchestration code easier to write and test
- preserve AFP append-only semantics
- preserve E2EE-before-storage
- preserve ElectricSQL local-first sync
- make delegated sub-agents work from bounded high-level context instead of raw AFP fetch loops

## 3. Non-Goals

- no second source of truth beside AFP
- no mutable document store outside AFP
- no plaintext-first cache that bypasses encryption policy
- no breaking AFP schema migration requirement for initial rollout
- no requirement that user-facing notes and orchestration state share the same UI surface

## 4. Core Abstraction

Introduce an internal agent-facing "workspace filesystem" layer with the following conceptual entities:

1. `thread_handle`
2. `ledger`
3. `tag_view`
4. `thread_summary`
5. `search_result`
6. `delegated_context_snapshot`

These are not raw storage records.

They are resolved views over AFP messages and derived local indexes.

## 5. Proposed Agent Operations

Phase 1 should expose only a narrow set of operations.

### Read operations

- `read_thread(handle_or_thread_id, mode="latest" | "summary" | "window")`
- `list_by_tag(tag, limit, cursor)`
- `grep(query, thread_id=None, tag=None, limit=20)`
- `get_thread_summary(thread_id)`
- `resolve_handle(handle)`

### Write operations

- `update_ledger(handle_or_thread_id, patch, intent, parent_id=None)`
- `append_plan(thread_id, plan_payload)`
- `append_summary(thread_id, summary_payload)`
- `append_tag_update(thread_id, add_tags=[], remove_tags=[])`

### Delegation operations

- `spawn_sub_agent(..., isolated_context=true|false, context_mode="summary" | "window" | "full")`
- `build_context_snapshot(thread_id, budget_hint, include_plan=true, include_summary=true)`

## 6. Mapping to Current OmnyID Components

The new layer should sit on top of existing repository seams.

### AFP message taxonomy

Current alignment already exists for:

- `agent` + subtype `plan`
- `agent` + subtype `step`
- `agent` + subtype `result`
- `agent` + subtype `workflow_summary`
- existing note-like and knowledge messages

The filesystem layer should prefer existing AFP types where possible rather than introducing a parallel taxonomy immediately.

### Master Agent loop

The Python master loop already keeps `current_plan`, emits canonical `agent` subtypes, and compresses context.

Integration target:

- formalize plan emission at loop start and at major replans
- replace ad hoc in-memory-only compression with persisted AFP summary messages when appropriate
- use filesystem read helpers instead of repeated low-level thread polling for internal reasoning context

### Delegation

Rust already supports:

- `AgentDelegation`
- `allowed_capabilities`
- `outbound_allowlist`
- optional `context_snapshot`

Integration target:

- make context loading explicit through the filesystem layer
- optionally add `isolated_context` as an auditable delegation flag
- prefer prebuilt snapshots over sub-agent callback fetches

### Notes and curator surfaces

The existing note APIs are narrower than the proposed abstraction.

Implication:

- do not force all orchestration state into current note APIs in Phase 1
- treat `ledger` as a note-family subtype with persistent shared-memory semantics
- keep user-visible ledger UX and orchestration-specific ledger UX separable
- only add explicit AFP note subtypes later if needed for a stable user-visible note/thread model

## 7. Recommended Rollout

## Phase 1: Agent plan + summary hardening

Scope:

- emit explicit `agent:plan` messages from the Master Agent
- persist long-thread summaries as AFP messages
- expose `read_thread`, `get_thread_summary`, and `append_plan`

Why first:

- highest token-efficiency gain
- preserves current AFP design
- low integration risk

Implementation points:

- `python-sdk/afp/master.py`
- `src/agent_template.rs`
- `src/message.rs`
- `src/summarizer.rs`

## Phase 2: Workspace filesystem read API

Scope:

- add an internal service/module that resolves thread handles, tags, summaries, and grep-style search from local synced state
- provide one consistent API used by Master Agent and sub-agents

Why second:

- creates one clean orchestration surface
- avoids duplicated AFP query logic across agents

Implementation points:

- server-side local query helpers
- TypeScript/Python SDK helpers where useful
- derived indexes backed by ElectricSQL-friendly query patterns

## Phase 3: Delegation isolation hardening

Scope:

- add `isolated_context` if required
- define exact behavior for snapshot-only or snapshot-first sub-agents
- attach summary + plan + relevant windowed thread slice at delegation time

Why third:

- meaningful token savings
- strengthens least-privilege delegation
- depends on Phase 1 and 2 abstractions

## Phase 4: Ledger taxonomy hardening

Scope:

- formalize `type: "note"` + `subtype: "ledger"` as the persistent shared-memory note primitive
- keep user-visible notes and orchestration notes separable
- decide curator/indexing behavior for orchestration-specific note threads

Why later:

- current repo note APIs are not yet broad enough for this to be "lightweight"
- this is the only part of the proposal with moderate schema and UI implications

## 8. API and Schema Guidance

The initial implementation should prefer compatibility over taxonomy expansion.

Recommended rule set:

- use existing `agent:plan` for planning state
- use existing `agent:result` and `agent:workflow_summary` for completion and compression outputs
- store summary messages append-only
- expose thread handles in metadata rather than requiring a new AFP top-level contract immediately

Example metadata fields:

- `handle`
- `materialized_view_kind`
- `summary_scope`
- `summary_window`
- `isolated_context`

These should remain optional in Phase 1 so older clients continue to work.

## 9. Materialization Model

Reads should resolve through a materialized local view, not by rebuilding every thread from scratch each time.

Recommended model:

1. AFP messages remain canonical history
2. ElectricSQL-synced local tables provide fast indexed reads
3. derived summaries and tag indexes accelerate common operations
4. agent APIs read from materialized state first
5. agent APIs can fall back to raw AFP thread windows only when necessary

This keeps the mental model consistent:

- AFP is the log
- ElectricSQL is the local substrate
- the workspace filesystem is the agent API

## 10. Security and Privacy Constraints

- no operation should require plaintext server-side storage beyond already-approved runtime boundaries
- delegated sub-agents should receive only the minimum summary/window needed
- grep/search should operate on local synced content within the user's trust boundary
- summary AFP messages must obey the same storage and encryption policy as the source thread
- any `isolated_context` mode must be enforced server-side, not only hinted to the model

## 11. Success Criteria

The integration is successful when all of the following are true:

- the Master Agent emits explicit plan messages before multi-step execution
- long-running threads can be resumed from summaries instead of full replay
- delegated sub-agents usually start from `context_snapshot` rather than fetching raw thread history
- orchestration code paths use a shared high-level thread API
- AFP remains the single source of truth
- no major UI or note-model breakage is required for the first rollout

## 12. Concrete Next Steps

1. add explicit `agent:plan` emission to the Python Master Agent conversational loop
2. define one append-only summary AFP payload shape and connect it to `summarizer.rs`
3. add a small internal workspace filesystem module exposing `read_thread`, `get_thread_summary`, and `grep`
4. route delegation snapshot construction through that module
5. postpone broader ledger rollout UX until note taxonomy, curator behavior, and UI separation are proven together

## 13. Final Recommendation

Proceed with the filesystem abstraction as an agent API layer over AFP + ElectricSQL.

Do not present it internally as a replacement for AFP.

The strongest low-risk sequence is:

1. plan messages
2. append-only summaries
3. shared thread read/search/snapshot helpers
4. delegation isolation hardening
5. optional broader ledger UX rollout later

That sequence preserves OmnyID's core AFP design while making orchestration materially more efficient and easier to extend.
