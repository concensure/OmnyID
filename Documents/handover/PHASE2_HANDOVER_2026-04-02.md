# OmnyID Workflow Builder — Implementation Handover
**Date:** 2026-04-02  
**Prepared for:** Incoming LLM implementation session  
**Project root:** `c:\Users\ozans\Desktop\projects\Agenton`  
**Test count at handover:** 365 passing, 0 failing (`cargo test --lib`)

---

## 1. What This Project Is

OmnyID is a Rust/SolidJS homeserver. The core product under active development is a **visual workflow builder** — a graph-based runtime where users compose, deploy, and trigger automated agent workflows. The backend is in `src/` (Rust/Axum), the frontend in `solid-ui/` (SolidJS/TypeScript), the DB layer in `src/db.rs`, and supporting Python SDKs in `python-sdk/afp/`.

**Key technology stack:**
- Rust + Axum (HTTP), SQLx + PostgreSQL, Tokio async runtime
- SolidJS + TypeScript frontend, Zod schemas in `typescript-sdk/src/workflows.ts`
- AFP (Agent Function Protocol) — the internal message contract between all nodes
- Migrations in `postgres/migrations/` — applied at boot via `MIGRATIONS` const in `src/db.rs`

---

## 2. Plan Documents

| Document | Path | Status |
|---|---|---|
| Visual Workflow Builder Plan | `Documents/specs/OMNYID_VISUAL_WORKFLOW_BUILDER_PLAN.md` | Active — Phase 2 items 6–19 next |
| Template & Workflow Dependency Plan | `Documents/specs/OMNYID_TEMPLATE_AND_WORKFLOW_DEPENDENCY_PLAN.md` | **All 8 steps complete** |
| Subagent Template Spec | `Documents/specs/OMNYID_SUBAGENT_TEMPLATE_SPEC.md` | Reference |

**Always update the plan document with completion milestones** when finishing a task. The convention is:

```
N. item text — **complete 2026-XX-XX**: brief description of what was implemented and key identifiers (function names, migration names, test count)
```

---

## 3. Current Implementation State

### Completed (as of 2026-04-02)

All of the following are working and tested:

| Area | Key files | Notes |
|---|---|---|
| WorkflowSupervisor, IrBranchScheduler | `src/workflow_supervisor.rs` | Phase 2 items 1–4 |
| Graph compiler, node registry, connector adapters | `src/server.rs` (search `workflow_connector_adapter`, `compile_workflow_graph_to_ir`) | Phase 3 |
| Trigger registration (deploy/rollback) | `src/server.rs` `workflow_action_http` deploy branch | Writes per-node `WorkflowTriggerRegistrationRecord` |
| Trigger hardening (replay nonce, SHA-256 dedup) | `src/server.rs` `trigger_replay_nonce`, `check_and_claim_replay_nonce` | Migration 0028 |
| Trigger trust boundary / HMAC dispatch | `src/server.rs` `generate_trigger_dispatch_token`, `verify_trigger_dispatch_token` | ±300s window, constant-time |
| Trigger observability records | `src/db.rs` `write_trigger_observation` | Per-tenant `workflow_trigger_observations` table |
| Cron trigger scheduler | `src/server.rs` `cron_scheduler_loop` | 30s delay, 60s cadence; migration 0025 cron field |
| Webhook ingress | `src/server.rs` `webhook_ingress_http` | `POST /ingest/webhook/{registration_id}`; migration 0029 |
| Email trigger dispatcher | `src/server.rs` `email_trigger_dispatcher_loop` | 45s delay, 60s cadence; migration 0030 |
| File-drop watcher + dispatcher | `src/server.rs` `file_drop_watcher_loop` | 60s delay; polls `OMNYID_FILE_WATCH_DIR`; migration 0031 |
| Internal event dispatcher | `src/server.rs` `internal_event_dispatcher_loop` | 90s delay; `POST /ingest/internal/{event_type}`; migration 0032 |
| Wait/resume durable records | `src/db.rs` `append_workflow_wait_resume_record` | Per-tenant `workflow_wait_resume` table |
| Wait/resume background worker | `src/server.rs` `start_workflow_wait_resume_worker` | 15s cadence; processes due timer/hybrid records |
| Run continuation after resume | `src/server.rs` `continue_workflow_run_after_resume` | Called by worker and approval decision handler |
| Human approval decision path | `src/server.rs` `workflow_wait_resume_decision_http` | `POST /workflows/{id}/runs/{run_id}/wait-resume/{wait_id}/decision` |
| Multi-pause follow-up records | `src/server.rs` `append_followup_wait_resume_records_for_run` | Called after each resume to derive next wait |
| Full builder UI (WorkflowsView) | `solid-ui/src/components/WorkflowsView.tsx` | Phase 4, all 10 items |
| Preset + custom node system | `python-sdk/afp/` | Phase 5 + 6 |
| DB refactor + section headers | `src/db.rs` (18 headers), `src/server.rs` (28 headers) | Phase 2 item 20 |

### MIGRATIONS array
Currently 32 entries (`[(&str, &str, &str); 32]`). The count assertion test is at the bottom of `src/server.rs` in the `tests` module — **update this when adding new migrations**. Pattern:

```rust
// In src/db.rs — update the array size literal AND append entries:
pub const MIGRATIONS: [(&str, &str, &str); 32] = [
    ...
    ("0032_internal_event_queue", "...", include_str!("../postgres/migrations/0032_internal_event_queue.sql")),
];

// In src/server.rs tests module — update the count:
assert_eq!(crate::db::MIGRATIONS.len(), 32, "MIGRATIONS array must have exactly 32 entries");
```

---

## 4. What Is Next — Phase 2 Items 6–9

These are the next **unimplemented** items from `Documents/specs/OMNYID_VISUAL_WORKFLOW_BUILDER_PLAN.md`. Items 10–19 have substantial implementation already in place (see Section 5). Items 6–9 have NO implementation yet.

### Item 6 — Durable Delayed-Continuation Execution

> A workflow can pause after an event and resume at a future time without losing state.

**The gap:** The IR compiler (`workflow_wait_resume_contract` at `src/server.rs:14318`) generates wait/resume descriptors for trigger nodes that have a `delay` config. The `resume_origin_template` it emits contains `"scheduled_for": "{{scheduled_for}}"` — a template placeholder, not a real timestamp.

The function `workflow_wait_resume_records_for_run` (at `src/server.rs:16688`) explicitly filters this out:

```rust
let scheduled_for = descriptor
    .get("resume_origin_template")
    ...
    .filter(|value| !value.contains("{{"))   // ← templates are REJECTED
    .map(str::to_string);
```

This means `WorkflowWaitResumeRecord.scheduled_for` is always `None` for delayed triggers, so `list_due_workflow_wait_resume_records` never picks them up as due.

**What to implement:**

1. In `workflow_wait_resume_records_for_run`, resolve the `{{scheduled_for}}` template:
   - `delay_kind = "fixed_duration"` → `scheduled_for = now + delay_seconds` (read `delay.delay_seconds` from descriptor)
   - `delay_kind = "after_event_time"` → `scheduled_for = trigger_fired_at + delay_seconds` (use run's `started_at`)
   - `delay_kind = "fixed_datetime"` → `scheduled_for = delay.delay_until` (a literal ISO datetime from config)

2. The `WorkflowWaitResumeRecord.scheduled_for` field is `Option<String>` — write the computed RFC3339 timestamp there.

3. The existing `list_due_workflow_wait_resume_records` in `src/db.rs:2821` already queries `scheduled_for <= $2`. No DB changes needed — once `scheduled_for` is populated, the worker picks it up automatically.

4. The existing `start_workflow_wait_resume_worker` (15s cadence) and `process_due_workflow_wait_resume_records_for_user` already call `continue_workflow_run_after_resume`. No changes there.

5. The `delay` config object comes from the graph node's `config.delay` field — shape (from `typescript-sdk/src/workflows.ts`):
   ```typescript
   delay: z.object({
     delay_kind: z.enum(['fixed_duration', 'after_event_time', 'fixed_datetime']),
     delay_seconds: z.number().optional(),
     delay_until: z.string().optional(),  // ISO datetime for fixed_datetime kind
   })
   ```

6. Add unit tests: one per `delay_kind`, verifying that `scheduled_for` is a real ISO timestamp rather than `None` or a template string.

**Watch out for:** The `delay` object in the descriptor comes from `workflow_wait_resume_contract` which copies it directly from the node config. Access it as `descriptor.get("delay")`. The descriptor is inside `ir_snapshot["wait_resume_descriptors"][n]`.

---

### Item 7 — First-Class Hybrid Trigger Orchestration

> Combinations like schedule-plus-condition, event-then-delay, and event-plus-approval-plus-time are compiled and executed explicitly rather than improvised through ad hoc node hacks.

**The gap:** The compiler partially models hybrid triggers. `workflow_wait_resume_contract` sets `resume_family = "hybrid"` for trigger nodes with `trigger_family = "hybrid"`. But the hybrid composition type (e.g. `schedule_plus_condition`, `event_then_delay`) is not currently interpreted or validated — it falls through to the same execution path as a plain timer.

**What to implement:**

1. In `compile_workflow_graph_to_ir` (`src/server.rs`), when a trigger node has `trigger_family = "hybrid"`:
   - Read `node.config.hybrid.composition_type` (one of: `schedule_plus_condition`, `event_then_delay`, `event_plus_approval`, `event_plus_approval_plus_time`)
   - Emit a structured `hybrid_descriptor` in the IR manifest for that trigger node that explicitly captures both halves of the composition
   - The IR manifest should include: `composition_type`, `primary_trigger` (the schedule/event leg), `secondary_trigger` (the delay/approval leg), `guard_condition` (optional)

2. In `workflow_wait_resume_contract`, propagate the `composition_type` into the wait/resume descriptor so the resume worker knows which leg it's resuming.

3. In `validate_workflow_graph_json`, add validation that hybrid nodes have a valid `composition_type` and that both legs are properly configured.

4. The frontend `TriggerNode` panel already has a `composition_type` selector in the hybrid sub-panel (`solid-ui/src/components/WorkflowsView.tsx`) — this is already wired to the graph node config.

---

### Item 8 — Policy-Aware Trigger Execution

> Mask, approval, auth, egress, and budget checks applied before trigger-fired runs are allowed to continue.

**The gap:** All five dispatcher loops (`cron_scheduler_tick`, `email_trigger_dispatcher_tick`, `file_drop_trigger_dispatcher_tick`, `internal_event_dispatcher_tick`, `webhook_ingress_http`) call their respective `fire_*_trigger_workflow_run` functions with no policy check. Any registered trigger fires unconditionally.

**What to implement:**

1. Add a `workflow_trigger_policy_check` function in `src/server.rs`:
   ```rust
   fn workflow_trigger_policy_check(
       reg: &WorkflowTriggerRegistrationRecord,
       activation_kind: &str,
   ) -> Result<(), String>
   ```
   Initial checks (keep lightweight — add full policy engine in a later pass):
   - **status gate**: registration must be `"registered"` (already enforced by the DB query `WHERE registration_status = 'registered'`, but double-check here)
   - **budget gate**: if `reg.descriptor_json` contains `"budget_limit_cents"`, check against the user's current spend (placeholder: always pass unless limit is 0)
   - **egress gate**: if `reg.descriptor_json` contains `"egress_allowed": false`, block the run

2. Call `workflow_trigger_policy_check` inside each `fire_*_trigger_workflow_run` function **before** the replay nonce claim. If it returns `Err`, return that error without claiming the nonce (so replays remain possible after policy is relaxed).

3. Add unit tests covering the status gate and budget gate.

---

### Item 9 — AFP Contracts End-to-End for Trigger Initiation

> Capability-node communication for trigger initiation, delayed continuation, and downstream execution moves through AFP contracts end to end rather than ad hoc payload shapes.

**The gap:** The `fire_*_trigger_workflow_run` functions write `WorkflowRunRecord` with a `timeline_json` that is constructed entirely in Rust. The AFP message type and families are set in IR manifests (`"afp_message_type": "agent"`, etc.) but the **timeline step** for the trigger initiation event does not embed an actual AFP `agent:trigger_initiation` message — it uses ad hoc JSON shapes.

**What to implement:**

1. In each `fire_*_trigger_workflow_run` function, when constructing the initial timeline step for the trigger node, wrap the trigger event in a proper AFP `agent:trigger_initiation` message shape:
   ```json
   {
     "type": "agent",
     "subtype": "trigger_initiation",
     "role": "assistant",
     "content": { ... trigger payload ... },
     "metadata": {
       "trigger_kind": "...",
       "activation_id": "...",
       "via": "..."
     }
   }
   ```
   The AFP subtype constants are defined in `src/message.rs` — add `trigger_initiation` if not already present (check `grep -n "trigger_initiation" src/message.rs`).

2. For delayed continuation resume, the `apply_wait_resume_to_run_record` function (search in `src/server.rs`) should add an `agent:wake_result` AFP step to the timeline.

3. For approval resume, `workflow_wait_resume_decision_http` should add an `agent:approval_granted` or `agent:approval_rejected` AFP step.

---

## 5. Items 10–19 — Status and Gaps

These items have backend infrastructure already implemented. The plan does not mark them as complete. Verify each and mark them complete once confirmed.

| Item | Status | What Exists | Gap (if any) |
|---|---|---|---|
| 10. Wait/resume records per run | Implemented | `workflow_wait_resume_records_for_run` at `src/server.rs:16688` | Blocked by item 6 — `scheduled_for` is never populated for timer waits |
| 11. Due-wake dispatch processor | Implemented | `workflow_wait_resume_wake_dispatch_plan` + `process_due_workflow_wait_resume_records_for_user` | None known |
| 12. Background wait/resume poller | Implemented | `start_workflow_wait_resume_worker` at `src/server.rs:17766` (15s cadence) | None known |
| 13. Advance to run-state transitions | Implemented | `continue_workflow_run_after_resume` called by worker | None known |
| 14. Approval through wait/resume model | Implemented | `workflow_wait_resume_decision_http` at `src/server.rs:18305` | None known |
| 15. Continue execution after resume | Implemented | `continue_workflow_run_after_resume` at `src/server.rs:17172` | None known |
| 16. Multi-pause follow-up records | Implemented | `append_followup_wait_resume_records_for_run` at `src/server.rs:17667` | None known |
| 17. Second-pass waits as first-class | Implemented | `workflow_wait_resume_status_after_run_resume` → `"continued_to_new_wait"` | None known |
| 18. Expose wait chain in run detail | Implemented | `GET /workflows/{id}/runs/{run_id}/wait-resume` (`workflow_wait_resume_http`) | None known |
| 19. Wait-chain visibility in run history | **Unknown** | WorkflowsView.tsx — check for pause/resume badges in run history cards | **Verify in frontend** |
| 20. Refactor WorkflowsView/server/db | **Complete** | See plan doc milestone; extracted helper files in `solid-ui/src/lib/` | Done |

---

## 6. Key File Map

Read these files before starting any task:

| File | Purpose | Notes |
|---|---|---|
| `src/server.rs` | All HTTP routes, all trigger dispatchers, workflow run machinery | 31,600+ lines — use section comment headers to navigate |
| `src/db.rs` | All DB methods, MIGRATIONS const | 5,800+ lines — section headers at ~30 locations |
| `src/workflow_supervisor.rs` | WorkflowSupervisor, IrBranchScheduler, `run_from_ir` | Supervisor runtime |
| `src/message.rs` | AFP message types, subtype constants, metadata helpers | Add new AFP subtypes here |
| `src/gateway/imap_sync.rs` | Mail sync loops, `enqueue_email_event` | Email trigger hook |
| `solid-ui/src/components/WorkflowsView.tsx` | Full builder UI | ~5,000+ lines |
| `solid-ui/src/lib/api.ts` | All frontend API client functions | Add new endpoints here |
| `solid-ui/src/lib/workflowGraphTypes.ts` | Extracted type constants | Shared graph types |
| `solid-ui/src/lib/workflowRunAnalysis.ts` | Extracted analysis functions | Pure run analysis |
| `solid-ui/src/lib/workflowDeploymentHelpers.ts` | Extracted deployment helpers | Pure deploy helpers |
| `typescript-sdk/src/workflows.ts` | All Zod schemas, workflow defaults, utility functions | Source of truth for graph shape |
| `postgres/migrations/` | SQL migration files 0001–0032 | Always create the next sequential number |
| `Documents/specs/OMNYID_VISUAL_WORKFLOW_BUILDER_PLAN.md` | Primary plan document | Update with milestones after each task |

---

## 7. Critical Invariants — Do Not Break These

1. **MIGRATIONS array size must match the literal.** `pub const MIGRATIONS: [(&str, &str, &str); 32]` — the number in the type must match the count of entries. There is a test that asserts this:
   ```
   assert_eq!(crate::db::MIGRATIONS.len(), 32, "MIGRATIONS array must have exactly 32 entries");
   ```
   Update both the const declaration **and** the test assertion whenever adding a migration.

2. **Replay nonce before every dispatcher fire.** Every `fire_*_trigger_workflow_run` function must call `check_and_claim_replay_nonce` before persisting the run. Never skip this — it prevents double-firing when dispatchers overlap.

3. **Non-fatal pattern for dispatchers.** All `fire_*` calls inside dispatcher ticks must be wrapped in `if let Err(e) = ... { warn!(...); }` — a single user's failure must not block other users or prevent the queue entry from being marked dispatched.

4. **`metadata.store: false` enforcement.** `src/db.rs` `store_message` and `store_private_message` early-return without SQL insert when `metadata.store: false` is set. Do not bypass this.

5. **Tenant schema isolation.** Per-user tables live in `"{tenant_schema}".table_name`. Never query tenant tables with a literal schema — always use `tenant_workflow_trigger_registrations_table(user_id)` and similar helpers. New per-tenant tables must be bootstrapped in `ensure_tenant_schema`.

6. **`cargo check` and `cargo test --lib` must pass clean.** Run both before declaring a task complete. The warning `trigger_next_retry_at is never used` is pre-existing and acceptable.

---

## 8. Common Patterns

### Adding a new trigger dispatcher

Follow the email dispatcher pattern (`fire_email_trigger_workflow_run` / `email_trigger_dispatcher_tick` / `email_trigger_dispatcher_loop`):

1. DB: `list_due_{kind}_trigger_registrations_for_user` — queries tenant table for `trigger_family='event' AND trigger_kind='{kind}' AND registration_status='registered'`
2. DB: `enqueue_{kind}_trigger_event`, `list_pending_{kind}_trigger_events`, `mark_{kind}_trigger_dispatched` on a `public.{kind}_trigger_queue` global table
3. Server: `fire_{kind}_trigger_workflow_run` — load deployment → replay nonce → persist run → write observation → write wait-resume records
4. Server: `{kind}_trigger_dispatcher_tick` — read queue → for each event × user × registration → fire → mark dispatched
5. Server: `{kind}_dispatcher_loop` — staggered initial delay → 60s cadence → `tokio::spawn` at startup
6. Startup wiring: add spawn block after the last existing dispatcher spawn

### Adding a DB migration

```
postgres/migrations/0033_{name}.sql  ← next sequential number
```
In `src/db.rs`:
- Increment array size: `pub const MIGRATIONS: [(&str, &str, &str); 33]`
- Append: `("0033_{name}", "Description", include_str!("../postgres/migrations/0033_{name}.sql"))`

In `src/server.rs` tests:
- Add: `assert!(versions.contains(&"0033_{name}"), "MIGRATIONS must include 0033_{name}");`
- Update count: `assert_eq!(crate::db::MIGRATIONS.len(), 33, ...);`

### Section header style for new code blocks in server.rs / db.rs

```rust
// ── New feature name ──────────────────────────────────────────────────────────
```

---

## 9. Recommended Implementation Order for Next Session

Start with **Phase 2 item 6** (delayed-continuation execution) because:
- It unblocks items 10, 11, 12, 13 — the wait/resume worker exists but cannot pick up timer waits until `scheduled_for` is populated
- It is self-contained to `src/server.rs` — no new migrations needed
- It has a clear, bounded fix (resolve the `{{scheduled_for}}` template at record-creation time)

Then **item 8** (policy check) because it is low-risk and cross-cuts all dispatchers in a uniform way.

Then **item 7** (hybrid orchestration) because it requires IR compiler changes and some graph validation extensions.

Then **item 9** (AFP contracts) because it touches the AFP message shape and may require additions to `src/message.rs`.

Then verify items 10–19 and mark each complete (or fix gaps) in the plan document.

---

## 10. How to Start a Session

```bash
# Verify the build is clean
cargo check

# Run all tests
cargo test --lib

# Navigate the plan document
# Primary plan: Documents/specs/OMNYID_VISUAL_WORKFLOW_BUILDER_PLAN.md
# Look for items WITHOUT "— complete" markers in Phase 2
```

The memory file at `C:\Users\ozans\.claude\projects\c--Users-ozans-Desktop-projects-Agenton\memory\project_workflow_builder_progress.md` is read automatically at the start of each Claude Code session and contains the same status summary.

---

## 11. Contextual Notes

- **No live PostgreSQL in CI.** All DB-backed tests use mock patterns or are integration tests that require a real DB. The `cargo test --lib` suite runs unit tests only — these do not need a DB.
- **Startup loop stagger offsets (in use):** cron=30s, email=45s, file_drop=60s, internal_event=90s. If adding another dispatcher, use 105s or higher.
- **`ulid::Ulid::new().to_string().to_lowercase()`** is the ID generation pattern throughout. Prefixes: `wftrig_` (trigger registration), `wfrun_` (run), `wfwait_` (wait/resume), `wftobs_` (trigger observation), `eml_` (email event), `fdrop_` (file drop event), `ievt_` (internal event).
- **The `trigger_next_retry_at` function** in `src/server.rs` is currently unused (dead code warning). It will be needed when implementing retry logic in the dispatcher error paths (post-item 8).
- **WorkflowTriggerRegistrationRecord.descriptor_json** is `serde_json::Value` (not `Option<String>`). Access it directly with `.get("field_name")`.
- **`list_user_ids()`** in `db.rs` is used by all cross-tenant dispatchers to iterate every user. It returns an empty vec on error — dispatchers handle this gracefully.
