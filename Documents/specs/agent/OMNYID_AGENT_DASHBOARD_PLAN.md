# OmnyID Native Agent Dashboard — Implementation Plan

**Date:** 2026-05-08  
**Status:** Planning  
**Scope:** Native SolidJS agent management UI (budget, skills, activity, memory)

---

## 1. Motivation

OmnyID already has deep agent infrastructure — `cost_oracle.rs` with three-axis budgets (USD, API calls, tokens), `agent_template.rs` with per-agent capability slices and monthly billing caps, and a full task/approval queue. None of this is surfaced in a cohesive management UI.

The result: operators have to use raw API calls or grep logs to understand what agents are doing, what they've spent, and which capabilities are enabled. A native dashboard solves this without any third-party dependency.

---

## 2. What Already Exists

### Server-side (working today)

| Endpoint | Purpose |
|---|---|
| `GET /agent/me` | Agent card for the authenticated agent |
| `GET /agent/tasks` | All pending/in-progress tasks |
| `GET /agent/tasks/{id}` | Task detail |
| `POST /agent/tasks/{id}/approve` | Approve a pending task |
| `POST /agent/tasks/{id}/reject` | Reject a pending task |
| `GET /agent/fleet` | All agents in the fleet |
| `GET /agent/keys` | Registered agent keys |
| `GET /agent/priority-rules` | Priority routing rules |
| `GET /user/llm-config` | LLM backend + monthly budget config |
| `POST /user/llm-config` | Update LLM config |
| `GET /billing/status` | Billing tier and spend |
| `GET /agent/eval/results` | Evaluation scores |
| `GET /agent/training/lora-status` | LoRA training status |

### Budget model (`cost_oracle.rs`)

Per-run budget: `max_cost_usd`, `max_api_calls`, `max_llm_tokens`, `soft_limit_ratio`  
Per-agent billing: `monthly_budget_cents`, `usage_cents_current_month` (in `agent_template.rs`)  
Enforcement: hard stop at budget exhaustion, soft warning at `soft_limit_ratio` (default 80%)

### Capability slices (`agent_template.rs`)

Template capabilities include: `template_email_read`, `template_email_send`, `template_web_research`, `template_calendar_read`. Each agent has a resolved capability slice from its delegation chain. Capabilities can be expanded or restricted per delegation.

---

## 3. Feature Scope

### Phase A — Agent Overview (read-only, 1–2 days)

**`/workspace/agents`** — new route in solid-ui

Components:
- **AgentFleetList**: cards for each agent in `/agent/fleet` — ID, status (active/degraded/halted), model backend, last-seen timestamp
- **AgentCard**: click-through to per-agent detail
- **TaskQueueBadge**: count of pending approval tasks with pulse indicator

API calls: `GET /agent/fleet`, `GET /agent/tasks?status=pending`

No new server endpoints needed.

---

### Phase B — Budget Management (read + write, 1 day)

**`/workspace/agents/{id}/budget`** — sub-route or drawer

Components:
- **BudgetGauge**: three horizontal progress bars (USD / API calls / tokens), colour-coded at soft/hard limits
- **BudgetEditor**: inline form to adjust `max_cost_usd`, `max_api_calls`, `max_llm_tokens`, `soft_limit_ratio`
- **MonthlyCapEditor**: edit `monthly_budget_cents` from LLM config endpoint
- **SpendHistory**: sparkline of daily spend over last 30 days (requires new endpoint — see §4)

New endpoint needed:
```
GET /agent/{id}/spend-history?days=30
→ { date: string, cost_usd: f64, api_calls: u32, tokens: u64 }[]
```

---

### Phase C — Skills / Capabilities Management (read + write, 1–2 days)

**`/workspace/agents/{id}/skills`**

Components:
- **CapabilityList**: all capabilities in the agent's current slice, toggle enabled/disabled
- **CapabilityDetail**: description, approval requirement (none/always/risk-based), outbound allowlist
- **DelegationChainView**: tree showing which capabilities came from which delegation

New endpoint needed:
```
PATCH /agent/{id}/capabilities
body: { capability_id: string, enabled: bool }[]
→ { updated: string[] }
```

Note: capability changes must create an AFP audit message so the change is traceable in the thread log.

---

### Phase D — Activity Feed (read-only, 1 day)

**`/workspace/agents/{id}/activity`**

Components:
- **ActivityTimeline**: scrollable list of recent AFP messages authored by this agent — type icon, timestamp, thread link, cost
- **ApprovalQueue**: pending tasks grouped by risk level (read from `/agent/tasks?status=pending`)
- **EvalScoreCard**: latest eval scores from `/agent/eval/results` with trend arrow

No new endpoints needed for the basic version.

---

### Phase E — Memory View (read-only MVP, 1 day — requires omnymem, see §6)

**`/workspace/agents/{id}/memory`**

Components:
- **MemoryTierTabs**: session / project / long-term tabs
- **MemoryItemList**: each item with confidence score, type badge (fact/task/decision/lesson/execution), status (active/stale/review_needed)
- **MemoryItemDetail**: full content, citations, valid window, repo-state binding
- **PromotionQueue**: items proposed for tier promotion, approve/reject buttons

Requires HTTP sidecar (omnymem) — see §6. OmnyID homeserver proxies read requests:
```
GET /agent/{id}/memory?tier=project&limit=20
→ proxied to omnymem GET /v1/retrieve
```

---

## 4. New Server Endpoints Summary

| Endpoint | Method | Notes |
|---|---|---|
| `/agent/{id}/spend-history` | GET | Daily spend aggregation from cost_oracle table |
| `/agent/{id}/capabilities` | PATCH | Capability slice update, creates AFP audit message |
| `/agent/{id}/memory` | GET | Proxy to omnymem retrieve (Phase E only) |

---

## 5. Component Architecture

All new components live in `solid-ui/src/components/agents/`:

```
agents/
  AgentFleetList.tsx       # Phase A
  AgentCard.tsx            # Phase A
  BudgetGauge.tsx          # Phase B
  BudgetEditor.tsx         # Phase B
  SpendHistory.tsx         # Phase B
  CapabilityList.tsx       # Phase C
  CapabilityDetail.tsx     # Phase C
  DelegationChainView.tsx  # Phase C
  ActivityTimeline.tsx     # Phase D
  ApprovalQueue.tsx        # Phase D
  EvalScoreCard.tsx        # Phase D
  MemoryTierTabs.tsx       # Phase E (omnymem)
  MemoryItemList.tsx       # Phase E (omnymem)
  MemoryItemDetail.tsx     # Phase E (omnymem)
  PromotionQueue.tsx       # Phase E (omnymem)
```

New route file: `solid-ui/src/routes/agents.tsx` — top-level layout  
Sub-routes via solid-router nested under `/workspace/agents`

---

## 6. Routing Changes (solid-ui)

Add to the workspace router:
```
/workspace/agents                   → AgentFleetList
/workspace/agents/:id               → AgentCard (detail)
/workspace/agents/:id/budget        → BudgetGauge + BudgetEditor
/workspace/agents/:id/skills        → CapabilityList
/workspace/agents/:id/activity      → ActivityTimeline
/workspace/agents/:id/memory        → MemoryTierTabs (Phase E)
```

Navigation entry: add "Agents" to the workspace sidebar alongside "Threads", "Workflows", "Notes".

---

## 7. Phased Delivery

| Phase | Scope | Dependencies | Effort |
|---|---|---|---|
| A | Agent overview (fleet list + task badge) | None | 1 day |
| B | Budget management (gauges + editor) | New spend-history endpoint | 2 days |
| C | Skills / capabilities CRUD | New capabilities PATCH endpoint | 2 days |
| D | Activity feed + approval queue | None (uses existing endpoints) | 1 day |
| E | Memory view | omnymem sidecar running (see §6 in omnymem plan) | 2 days |

Total without Phase E: ~6 days  
Total with Phase E: ~8 days

---

## 8. Design Constraints

- All state is derived from AFP messages — no local state that diverges from the append-only log
- Capability changes must produce an AFP `audit` message (same pattern as key rotation)
- Budget edits should show current spend before confirming, with a HITL gate if the new limit is lower than current spend
- Memory view is read-only in the MVP — promote/reject flows follow the omnymem protocol, not a direct DB write

---

## 9. Success Criteria

- Operator can see all agents, their status, and pending approvals without touching the CLI
- Budget limits are adjustable from the UI and take effect within one request cycle
- Capability enable/disable produces an auditable AFP event
- No third-party analytics or monitoring SaaS required — all data comes from the homeserver + optional omnymem sidecar
