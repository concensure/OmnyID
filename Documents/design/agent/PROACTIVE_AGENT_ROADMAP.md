# Proactive Agent Roadmap
**Objective:** Make the master agent proactively anticipate user needs, maintain situational continuity, and surface timely suggestions — without a continuous LLM loop — by extending existing AFP messages, a2ui, visual workflow builder, and planning agent.

**Guiding principle (from proactive agent.md):** Hierarchical activation, not continuous reasoning.
- Layer 1 (passive events) costs near-zero.
- Layer 2 (heuristic engine) costs nothing per trigger.
- Layer 3 (memory) provides context without re-deriving it.
- Layer 4 (LLM) fires only when ambiguity or synthesis is genuinely needed.

---

## Dependency Map

```
P1 — Event Infrastructure
 └─ P2 — Behavioral Heuristic Engine
     └─ P3 — Memory System Extensions
         └─ P4 — Selective LLM Activation
             └─ P5 — a2ui Proactive Surface  ←─ P2 (also feeds here)
                 └─ P6 — Workflow Integration
                     └─ P7 — Trust & Control
```

---

## Phase P1 — Passive Event Infrastructure (Layer 1)
*No LLM. Pure event ingestion: timestamps, embeddings, state transitions.*

### P1.1 — AFP passive-event schema
Extend AFP `type` enum with:
- `calendar_event_created`, `calendar_event_starting_soon`, `calendar_event_completed`
- `email_received`, `email_thread_idle` (no reply in N hours)
- `workflow_completed`, `workflow_failed`, `workflow_node_stalled`
- `deep_work_session_started`, `deep_work_session_ended` (keyboard/idle heuristics)

Each event carries: `source`, `entity_id`, `timestamp`, `confidence`, `metadata`.
**Depends on:** existing AFP schema — add new `type` variants to `AfpMessage`.

### P1.2 — Passive event ingestion endpoint
New API route: `POST /events/passive`
- Accepts AFP passive-event payloads
- No LLM invocation
- Stores directly to AFP message store
- Returns 202 Accepted immediately

**Depends on:** P1.1

### P1.3 — Event timestamp index
Add `event_at` column (indexed) to AFP messages table.
Add lightweight embedding column (512-dim) for semantic deduplication — populated asynchronously via small embedding model (not the main LLM).

**Depends on:** P1.1, P1.2

### P1.4 — Workflow state change AFP integration
When a workflow run completes / fails / stalls, the workflow engine automatically emits a `workflow_completed` / `workflow_failed` AFP message via the existing `handleWorkflowPatch` path.

**Depends on:** existing workflow engine, P1.1

---

## Phase P2 — Behavioral Heuristic Engine (Layer 2)
*Pure rule evaluation. Most proactive behaviour lives here — not in the LLM.*

### P2.1 — Heuristic rule schema
New SQL table: `proactive_heuristics`
```sql
id TEXT PRIMARY KEY,
name TEXT,
trigger_event_type TEXT,     -- e.g. "calendar_event_completed"
conditions JSONB,             -- { "meeting_tag": "client", "follow_up_within_hours": 12 }
action_template JSONB,        -- AFP message to emit if triggered
confidence_threshold REAL,    -- 0.0–1.0
enabled BOOLEAN DEFAULT TRUE,
created_at TIMESTAMPTZ
```
**Depends on:** P1.1

### P2.2 — Built-in heuristics seed
Ship 5 built-in heuristics on first run:
1. **meeting-follow-up**: `calendar_event_completed` + tag=client → no AFP follow-up within 12h → queue "Draft follow-up?" suggestion
2. **invoice-delay**: `calendar_event_completed` + client-meeting → no invoice AFP within 24h → queue "Invoice ready to draft"
3. **workflow-failure-notify**: `workflow_failed` → emit proactive_suggestion with run details
4. **deep-work-protect**: `deep_work_session_started` → suppress non-urgent AFP for session duration
5. **stalled-thread**: `email_thread_idle` (48h no reply) → surface "Follow up on thread?"

**Depends on:** P2.1

### P2.3 — Rule evaluator (Rust, sync, no LLM)
A lightweight rule evaluation loop in the backend:
- Runs after each `POST /events/passive` (or on a 60s polling loop for idle checks)
- Evaluates matching heuristics against event
- If conditions satisfied AND confidence ≥ threshold: emit a `proactive_suggestion` AFP message
- Token cost: zero

**Depends on:** P2.1, P2.2

### P2.4 — Heuristic confidence from outcomes
Over time, heuristic confidence adjusts based on user acceptance rate (see P3.3 Outcome Memory). A heuristic that is always dismissed lowers its own `confidence_threshold` or disables automatically.

**Depends on:** P2.3, P3.3

---

## Phase P3 — Memory System Extensions (Layer 3)
*Operational dynamics, not just facts. Separates into four memory kinds.*

### P3.1 — Behavioral memory store
New SQL table: `behavioral_memory`
```sql
id TEXT PRIMARY KEY,
pattern_key TEXT,              -- e.g. "delays_invoicing_after_meetings"
evidence_count INTEGER,
last_observed_at TIMESTAMPTZ,
confidence REAL,
metadata JSONB                 -- raw pattern detail
```
Populated by the heuristic evaluator and outcome memory (P3.3).

**Depends on:** P2.3

### P3.2 — Temporal memory
Existing AFP messages serve as the temporal event log.
Add a `temporal_summary` materialized view: for each entity type, compute:
- last seen timestamp
- average frequency
- decay-weighted recency score

Refreshed on a schedule (e.g. every 30 min), not on every query.

**Depends on:** P1.3

### P3.3 — Outcome memory
New SQL table: `proactive_outcomes`
```sql
suggestion_id TEXT,           -- AFP message ID of the proactive_suggestion
accepted BOOLEAN,             -- user clicked "do it" vs dismissed
outcome_afp_id TEXT,          -- resulting action AFP message (if accepted)
created_at TIMESTAMPTZ
```
Outcome memory feeds back into P2.4 confidence adjustment and P4.1 activation decisions.

**Depends on:** P2.3, P5.1 (needs the proactive surface to emit acceptance events)

### P3.4 — Memory read API
`GET /memory/context?event_types[]=...&limit=N`
Returns a compact JSON slice of relevant behavioral + temporal memory for the current event context. Used by Layer 4 as context injection rather than full history replay.

**Depends on:** P3.1, P3.2, P3.3

---

## Phase P4 — Selective LLM Activation (Layer 4)
*The LLM fires only when heuristics cannot resolve ambiguity or wording quality matters.*

### P4.1 — Activation decision function
Before any LLM call from the heuristic engine, evaluate:
- Does the heuristic template produce a complete, unambiguous AFP message? → skip LLM
- Is the confidence score above the "auto-generate" threshold (configurable, default 0.85)? → skip LLM
- Does the action require synthesis, personalised wording, or planning? → invoke LLM

Decision is a pure function of the heuristic output + confidence. No additional LLM needed for the decision itself.

**Depends on:** P2.3, P3.4

### P4.2 — Context-compressed LLM prompt
When LLM is invoked, inject:
- Relevant `behavioral_memory` patterns (P3.1) as bullet-point context
- Temporal summary (P3.2) for the event's entities
- The heuristic action template as a starting point

Max prompt overhead: ~400 tokens. LLM fills in the human-quality wording or resolves ambiguity, then returns a structured `proactive_suggestion` AFP payload.

**Depends on:** P4.1, P3.4

### P4.3 — Structured LLM output schema
LLM response is always validated against the `proactive_suggestion` AFP schema (JSON Schema enforced).
If validation fails, fall back to the template from P4.2 rather than surfacing raw LLM output.

**Depends on:** P4.2, P5.1

### P4.4 — Token budget tracking
Each LLM activation logs token usage to a `proactive_token_log` table.
Daily budget per heuristic is configurable (default: 200 tokens/day).
If budget exceeded, that heuristic falls back to template-only mode for the day.

**Depends on:** P4.2

---

## Phase P5 — a2ui Proactive Surface
*Proactive suggestions appear through existing AFP/a2ui pipeline without a new UI branch.*

### P5.1 — `proactive_suggestion` AFP message type
Extend `AfpMessage` with:
```ts
type: "proactive_suggestion",
metadata: {
  heuristic_id: string,
  confidence: number,          // 0–1
  urgency: "low" | "medium" | "high",
  action_label: string,        // "Draft follow-up"
  action_afp_payload?: object, // pre-built payload to execute if accepted
  dismiss_reason?: string      // filled on dismissal for outcome memory
}
```
**Depends on:** existing AFP schema

### P5.2 — DashboardFeed proactive card rendering
`proactive_suggestion` messages render as a distinct card variant in DashboardFeed:
- Light amber/violet accent border to visually separate from reactive responses
- Confidence chip (uses existing 16d confidence meter bar)
- "Do it" button → posts `action_afp_payload` to `/ui/command` and records acceptance (P3.3)
- "Dismiss" button → records dismissal with optional reason picker
- Cards are collapsed by default (uses 16a default-collapsed pattern)

**Depends on:** P5.1, existing DashboardFeed component

### P5.3 — a2ui push path
Extend the existing a2ui polling or SSE endpoint to include `proactive_suggestion` messages that were emitted since last poll.
No new websocket connection needed — piggyback on the existing dashboard bootstrap or AFP polling refresh.

**Depends on:** P5.1, existing a2ui layer

### P5.4 — Proactive suggestions thread in ThreadsListView
If multiple proactive suggestions share an `entity_id` (e.g. all about "client-X meeting"), group them into a thread labelled "Agent suggestions — [entity name]".
Uses existing ThreadsListView thread grouping.

**Depends on:** P5.2, existing ThreadsListView

---

## Phase P6 — Workflow Integration
*Proactive agents trigger and inform the visual workflow builder and planning agent.*

### P6.1 — Behavioral heuristic trigger node kind
Add `trigger_family: "behavioral_heuristic"` to WorkflowsView trigger nodes.
Config fields: `heuristic_id` (selects which heuristic fires this workflow), `min_confidence`.
When heuristic fires and confidence ≥ threshold, the workflow is started automatically.

**Depends on:** P2.3, existing WorkflowsView trigger node

### P6.2 — Planning agent behavioral context injection
When the planning agent builds a plan, it reads the latest `behavioral_memory` slice (P3.4) for the current user context.
Example: user has a "delays admin after meetings" pattern → planning agent pre-inserts an "Admin block" task after any scheduled meeting in the plan.

**Depends on:** P3.4, existing planning agent

### P6.3 — Dry-run preview for proactive actions
Before any proactive action auto-executes (confidence < 0.95), render a dry-run preview panel in the workflow canvas.
The panel shows: what would execute, affected nodes, estimated duration, and a "Confirm" / "Edit" / "Cancel" choice.
Maps to enhancement 17m.

**Depends on:** P5.2, P6.1, existing WorkflowsView canvas

---

## Phase P7 — Trust & Control
*The user controls what the agent does automatically. Trust is earned incrementally.*

### P7.1 — Confidence-gated autonomy levels
Three autonomy tiers per heuristic:
- **Ask always** (confidence < 0.7): surface suggestion, require explicit confirmation
- **Notify then act** (0.7–0.9): show dismissible toast, execute after 30s timeout
- **Auto-execute** (> 0.9): act immediately, log to audit trail, surface "Undone?" chip

Tiers are user-adjustable per heuristic in Agent Settings.

**Depends on:** P5.2, P7.2

### P7.2 — Proactive action audit log
Every autonomous action creates an AFP message of type `proactive_action_taken` with:
- heuristic that triggered it
- inputs used
- output AFP payload
- timestamp + token cost

Visible in DashboardFeed under a "Autonomous actions" filter chip.

**Depends on:** P2.3, P5.1

### P7.3 — Per-heuristic settings in Agent Settings view
AgentSettingsView gains a "Proactive behaviour" section:
- Toggle each built-in heuristic on/off
- Set autonomy tier per heuristic
- View acceptance rate and token spend per heuristic (from P3.3 + P4.4)
- "Reset patterns" button clears behavioral memory for a heuristic

**Depends on:** P2.2, P3.3, P4.4, P7.1

---

## Implementation Order Summary

| # | Phase | Gate | Rough Size |
|---|-------|------|-----------|
| 1 | P1.1–P1.4 | None | Small (schema + endpoint) |
| 2 | P2.1–P2.3 | P1 complete | Medium (rule engine) |
| 3 | P3.1–P3.4 | P2.3 done | Medium (DB tables + view) |
| 4 | P5.1–P5.2 | P1.1 done | Small (AFP type + card) |
| 5 | P4.1–P4.4 | P3.4 + P5.1 | Medium (LLM gate) |
| 6 | P2.4 | P3.3 + P5.2 | Small (feedback loop) |
| 7 | P5.3–P5.4 | P5.2 done | Small |
| 8 | P6.1–P6.3 | P2.3 + P5.2 | Medium |
| 9 | P7.1–P7.3 | P6 done | Medium |

---

## What We Are NOT Building
- A continuous background LLM reasoning loop
- A separate proactive agent branch or workflow system
- New websocket infrastructure (use existing a2ui path)
- A separate memory database (extend existing PostgreSQL schema)

The entire system runs through AFP messages, existing a2ui, and the visual workflow builder.
