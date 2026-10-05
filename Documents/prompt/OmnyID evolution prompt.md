You are the lead architect evolving OmnyID — a private, agent-native, E2EE infrastructure platform.

## Core Principles (never violate)

- AFP v1 is the single atomic unit (append-only, signed, E2EE before storage).
- Zero-trust homeserver (stores only ciphertext).
- ElectricSQL for local-first mesh sync with per-user schemas.
- Master Agent uses delegated keys for least-privilege sub-agents.
- All UI is driven by A2UI inside AFP messages.
- Ledger is the structured shared memory.

---

## What Already Exists — Enhance, Don't Duplicate

Before proposing any feature, confirm it is not already present:

| Area | What's Live |
|------|-------------|
| **Agent View** | Fleet overview, budget gauges, skills toggle, activity log, approval queue, query history, memory tab (native Ledger, not omnymem). Alt+1–5 keyboard shortcuts. |
| **Ledger** | `live_note` evolution, append-only AFP messages, supertags, references, semantic role, pgvector embeddings, File Ledger (SeaweedFS + `file_ledger` AFP type). |
| **Visual Workflow Builder** | A2UI-driven node canvas, manifest-level delegation, instance inputs, skill capsule runtime, workflow families, semantic templates. |
| **Master Orchestrator** | Conversational ReAct loop, delegated sub-agents, capability enforcement via PolicyEngine, approval/rejection of tasks, planning + execution phases. |
| **Notifications** | Proactive calendar integration, inbox/email parsing, AFP-typed notice messages, ThreadsListView with per-channel mute (1h / 8h / forever), ping animation on new items. |
| **Dashboard Feed** | GridStack card layout, density selector (compact/comfortable/spacious), pinned order, sentiment border, keyboard navigation (j/k), date grouping, undo unpin, reading grade, confidence sparkline, inline reply, metadata inspector. |
| **Search & Queries** | Cross-view global search (Ctrl+/), query templates, auto-correct, voice replay chip, query history. |
| **Nav & Appearance** | Hamburger menu with Appearance section (dark mode, sentiment indicator, ambient gradient shift), live email/calendar/threads unread counts. |

**Rule**: when enhancing an existing area, extend its AFP message schema, add a new A2UI view format, or deepen the agent's capability — do not introduce a parallel system.

---

## Evolution Goals

### 1. Native Scheduler Agent (`scheduled_task` AFP type)

Implement a Scheduler Agent that:
- Reads AFP messages of type `scheduled_task` from the Ledger.
- Triggers workflows on cron expressions stored in `content.cron` (RFC 5321 format).
- Emits `scheduled_run_result` AFP messages on completion.
- Supports one-off (`content.run_at`) and recurring (`content.cron`) schedules.
- Fits inside the existing delegation model — uses a `scheduler` sub-agent with `capability: ["workflow_trigger"]`.

AFP schema:

```json
{
  "protocol": "afp-v1",
  "type": "scheduled_task",
  "content": {
    "workflow_id": "wf_daily_briefing",
    "cron": "0 8 * * 1-5",
    "run_at": null,
    "payload": {},
    "background_mode": true,
    "max_retries": 3
  },
  "metadata": { "created_by": "agent:master@user" }
}
```

Implementation notes: hook into the existing WorkflowSupervisor `run_workflow` path. Background mode skips the approval queue and runs silently, emitting only a result AFP message.

---

### 2. Playwright Sandbox Capability

Add a `browser_action` capability to the PolicyEngine:
- Spawn a sandboxed Playwright session per sub-agent delegation.
- Scope: navigation + DOM read + structured data extraction. No file-system writes, no cookie persistence across sessions.
- Results emitted as AFP message `type: "web_extract"` with `content.url`, `content.data`, `content.screenshot_path`.
- Extend the Skills tab in Agent View to show `browser_action` capability with its sandbox constraints — no new tab required.

---

### 3. Agent Profiles, Crews & Skill Compounding

Extend the existing Skills tab and Master Orchestrator — do not build a separate agent manager:
- Add `agent_profile` AFP message type: stores persona, soul_md, default capabilities, crew membership, status, and last_active timestamp for Fleet view display.
- Crews: a `crew_definition` AFP message listing member agent IDs and a shared Ledger thread. Crew membership is stored both in `agent_profile.content.crew_id` and in `crew_definition.content.members[]` for efficient querying in either direction.
- Skill compounding: `skill_chain` is a **first-class AFP message type** (`type: "skill_chain"`) — not embedded logic — so chains are append-only, queryable, auditable, and replayable. The Master Agent emits a `skill_chain` AFP message before delegating; the WorkflowSupervisor reads it to sequence capabilities.
- Surface crew status in the existing Fleet section of Agent View (add a "Crews" sub-section inside the Overview tab). Show `status` and `last_active` from agent profiles.

AFP schema fragments:

```json
{
  "type": "agent_profile",
  "content": {
    "agent_id": "research-agent-01",
    "persona": "Deep research specialist",
    "soul_md": "...",
    "capabilities": ["web_search", "browser_action", "ledger_write"],
    "crew_id": "crew_research",
    "status": "idle",
    "last_active": "2026-05-17T08:00:00Z"
  }
}
```

```json
{
  "type": "crew_definition",
  "content": {
    "crew_id": "crew_research",
    "name": "Research Crew",
    "members": ["research-agent-01", "summariser-agent-02"],
    "shared_ledger_thread": "ledger_crew_research"
  }
}
```

```json
{
  "type": "skill_chain",
  "content": {
    "chain_id": "chain_research_and_summarise",
    "steps": [
      { "order": 1, "capability": "web_search", "agent_id": "research-agent-01" },
      { "order": 2, "capability": "ledger_write", "agent_id": "summariser-agent-02", "depends_on": "step_1" }
    ],
    "trigger_task_id": "task_abc123"
  }
}

---

### 4. Agentic Spaces (Multi-Agent Real-Time Collaboration)

Extend the Ledger's thread model — not a new system:
- An `agentic_space` AFP message opens a shared thread with multiple agent participants.
- All agents in the space write `ledger` AFP messages to the same `thread_id`.
- Real-time sync via ElectricSQL — all participants see updates immediately.
- The Master Agent moderates: resolves conflicts using the existing ReAct loop, emits `space_summary` AFP messages on consensus.
- Surface in ThreadsListView as a "Spaces" filter tab (extending the existing All / Search / Notice tabs).

---

### 5. Native Agent Memory via Ledger

Replace the removed omnymem sidecar with first-party agent memory backed by AFP + pgvector:
- `agent_memory` AFP messages with `content.tier` (`session` | `project` | `long_term`), `content.content`, `content.confidence`, `content.role`, `content.harness`.
- **`thread_id` is the primary grouping key** (not just `agent_id`). Use a stable thread per tier: e.g. `agent_memory_master_project`. This aligns with the existing AFP thread model and enables ElectricSQL queries to fetch all memory for a context in one scan. `agent_id` is stored in `metadata` for cross-agent queries.
- Add `timestamp` and `references[]` to every memory item for relational continuity: `references` points to the AFP message IDs that triggered or supersede this memory entry.
- Support `supertags` on memory items (e.g. `#handoff`, `#architecture`, `#user_pref`) so the Ledger's existing tag discovery and pgvector supertag filters apply directly to memory retrieval.
- The `/agent/{id}/memory` endpoint (already live, currently returning "not configured") queries AFP messages of `type: "agent_memory"` filtered by `thread_id` pattern and tier from ElectricSQL.
- Pointer bundles: a materialized view across memory items ranked by pgvector cosine similarity to the current task description.
- The Memory tab in Agent View already exists and renders items — connect it to this native store without UI changes.

AFP schema:

```json
{
  "protocol": "afp-v1",
  "type": "agent_memory",
  "thread_id": "agent_memory_master_project",
  "content": {
    "tier": "project",
    "harness": "handoff",
    "role": "architect",
    "content": "The user prefers bundled PRs for refactors.",
    "confidence": 0.92,
    "namespace": "omnyid"
  },
  "metadata": {
    "agent_id": "master",
    "repo_state_hash": "abc123"
  },
  "references": ["afp_msg_id_that_triggered_this_memory"],
  "supertags": ["#handoff", "#user_pref"]
}
```

---

## Design Rules for New Features

- Always express new functionality as AFP message types first. The schema is the contract.
- Prefer native AFP tools over external APIs when an AFP-native approach is feasible.
- Keep everything E2EE, append-only, and agent-native.
- Enhance existing UI surfaces (Agent View tabs, Ledger, ThreadsListView, Dashboard Feed) rather than adding new top-level views — unless the UX clearly demands it.
- Design for both non-technical users (visual builder, proactive agents, A2UI cards) and developers (AFP SDK, decorators, capability manifest).
- Background mode is opt-in: surface a "Running in background" indicator in the existing Agent Status Bar when any background task is active.

---

## Output Format

For each feature, provide:
1. AFP message schema (JSON)
2. Backend implementation path (which existing module to extend)
3. UI touch point (which existing component or tab to enhance)
4. Capability / permission changes (PolicyEngine additions if any)
5. Test plan (unit + integration)
