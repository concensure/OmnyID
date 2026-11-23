# Planning Assistant — Developer Guide

## Overview

The planning assistant is a **manager-led, stateful, tool-rich** feature that answers goal-oriented queries with ranked interactive cards rather than raw prose. It is not a travel planner — it is a general-purpose assistant for any planning query ("best way to get to X", "what time should I leave for Y", "compare these options").

**Design target:** _"A manager-led, stateful, tool-rich consumer planning assistant with deterministic scaffolding, narrow hidden specialists, progressive autonomy, and an interactive results surface that exposes assumptions and trade-offs."_

---

## Architecture

```
User query
    │
    ▼
POST /ui/planning
    │
    ├─ assumption_delta? ──► Fast-path (skip intent parser, re-compose only)
    │
    └─ Normal path:
         │
         ▼
    1. Intent & Constraint Parser   ← sees ALL tool hints (1-liner each, low tokens)
         │  returns: goal, constraints, tools_needed[]
         ▼
    2. Preference Modeller          ← merges prior session assumptions with new constraints
         │
         ▼
    3. Live Conditions Analyser     ← calls selected tools (or returns stub notices)
         │
         ▼
    4. Response / UI Planner        ← full tool schemas injected ONLY here, for selected tools
         │  returns: PlanningResult (ranked options, assumptions, comparison table)
         ▼
    AFP planning:result message
         │
         ├─ stored in tenant-local AFP thread
         └─ returned as PlanningQueryResponse → PlanningCardRenderer
```

### Progressive Autonomy Levels

| Level | Use | Example |
|---|---|---|
| `silent` | Read-only queries | Weather, calendar read, route lookup |
| `soft_confirm` | Reversible actions | Save preference, pin a destination |
| `hard_confirm` | Irreversible actions | Bookings, payments, sending messages |

All current planning tools run at `silent` level.

---

## Tool Registry

### File location

```
src/planning_tools.md
```

This file is **embedded at compile time** via `include_str!()` — zero runtime I/O. Add a tool, recompile, and it is automatically available to the LLM.

### Format

```markdown
## <tool_id>
hint: <one-liner ≤15 words — shown to EVERY intent parser call>
schema:
  <function signature and return type — shown ONLY when this tool is selected>
  <can be multi-line>
api_key_env: ENV_VAR_NAME        ← optional; read from environment at runtime
backup_api_key_env: BACKUP_VAR   ← optional backup key
status: stub | live
```

### Progressive Disclosure — how it works

The LLM never sees all tool schemas at once. Disclosure happens in two phases:

**Phase 1 — Intent parser (every query):**
The intent parser's system prompt includes only the `hint:` line for each tool. This costs ~1 token per tool regardless of how many tools are registered. The parser returns `tools_needed: ["tool_id", ...]`.

```
Available tools:
  - maps_directions: Driving, transit, walking or cycling routes with real-time travel times
  - weather_forecast: Current weather and short-range forecast (up to 48 h)
  - calendar_read: Read upcoming calendar events to check schedule conflicts
  ...
```

**Phase 2 — Compose step (only for selected tools):**
The full `schema:` block is injected into the system prompt only for the tools the intent parser selected. If the query is about routes and weather, only those two schemas appear.

```
Tool contracts for selected tools:
[maps_directions [stub — use best general knowledge, set confidence medium/low]]
  maps_directions(origin: str, destination: str, ...) -> RouteResult
  ...
[weather_forecast [live]]
  weather_forecast(location: str, hours_ahead: int = 3) -> WeatherResult
  ...
```

### Adding a new tool

1. Add a new `## tool_id` section to `src/planning_tools.md`.
2. Write a short `hint:` (shown every call — keep it tight).
3. Write the full `schema:` block (shown only when selected).
4. Set `status: stub`.
5. Recompile — the LLM now knows the tool exists.
6. Wire the real API call in `analyse_conditions()` in `src/planning_session.rs`.
7. Change `status: live` and add the key to `.env`.

### Tool security — API keys

**Never put API keys directly in `planning_tools.md`.** The file is embedded in the binary and committed to git.

Use the `api_key_env:` field instead:

```markdown
## my_tool
hint: ...
schema:
  ...
api_key_env: PLANNING_MY_TOOL_KEY
status: live
```

Then set the real key in your local `.env` file (gitignored):

```env
PLANNING_MY_TOOL_KEY=your-secret-key-here
```

And add a placeholder to `.env.example` (committed):

```env
PLANNING_MY_TOOL_KEY=
```

The Rust runtime reads `std::env::var("PLANNING_MY_TOOL_KEY")` inside `analyse_conditions()`. The env var name is **never injected into LLM prompts** — the parser strips `api_key_env:` lines from the schema text.

**Naming convention:** `PLANNING_<TOOL_ID_UPPERCASE>_KEY`

---

## AFP Message Types

All planning messages use `type: "planning"` with the following subtypes:

| Subtype | When | Stored |
|---|---|---|
| `result` | After every successful planning query | Yes — tenant-local |
| `assumption_change` | When user edits a Context Strip assumption | Yes — audit trail |
| `query` | Intent of a new planning query (future) | Optional |
| `followup` | Follow-up chip or text (future) | Optional |

### planning:result shape

```json
{
  "type": "planning",
  "subtype": "result",
  "content": {
    "summary": "3 routes found for your 6:30 PM trip",
    "goal": "Get from Parramatta to Sydney CBD by 7pm",
    "options": [
      {
        "title": "Train — T1 Western Line",
        "description": "Depart 6:35 PM, arrive 7:02 PM Central.",
        "rationale": "Fastest option, no tolls, reliable timetable.",
        "metric_label": "Travel time",
        "metric_value": "27 min",
        "confidence": "medium",
        "risk_flags": [],
        "follow_up_chips": ["Leave 20 mins later", "Avoid peak hour"]
      }
    ],
    "assumptions": [
      { "key": "priority", "label": "Priority", "value": "Fastest", "editable": true }
    ],
    "comparison_headers": ["Option", "Time", "Cost", "Transfers"],
    "comparison_rows": [{ "label": "Train", "values": ["27 min", "$4.50", "0"] }],
    "unresolved": [],
    "correlation_id": "01J...",
    "goal": "..."
  },
  "views": [{ "format": "planning_result", "priority": 10 }],
  "metadata": { "store": true, "autonomy": "silent" }
}
```

### planning:assumption_change shape

```json
{
  "type": "planning",
  "subtype": "assumption_change",
  "content": { "key": "priority", "value": "Cheapest" },
  "metadata": { "store": true, "autonomy": "silent" }
}
```

---

## Session State

Session state is maintained **client-side** and forwarded with every follow-up request. The backend never stores session state between requests — it reasons over the forwarded state. This keeps the backend stateless and avoids session storage bloat.

```typescript
// Client stores after each response:
setSessionState({
  goal: resp.goal,
  thread_id: resp.thread_id,
  correlation_id: resp.correlation_id,
  assumptions: resp.assumptions,
  constraints: Object.fromEntries(resp.assumptions.map(a => [a.key, a.value])),
  evidence: {},
  unresolved: resp.unresolved,
});
```

### Iterative follow-ups

Every follow-up posts `session_state` + `thread_id` alongside the new query. The intent parser receives the prior goal and constraints as context, so it correctly interprets partial follow-ups like _"Leave 20 mins later"_ without re-establishing the full intent.

### Assumption fast-path

When the user edits a Context Strip field, the frontend posts `assumption_delta: { key, value }` instead of `query`. The backend:

1. Merges the delta into the prior session state (no LLM call).
2. Re-runs only the compose step.
3. Stores a `planning:assumption_change` AFP message for the audit trail.
4. Returns an updated `PlanningQueryResponse`.

This saves one full LLM round-trip per assumption edit.

---

## Frontend Components

### PlanningView (`solid-ui/src/components/PlanningView.tsx`)

The main stateful view. Manages:
- `history` — alternating query bubbles and result cards
- `sessionState` — forwarded to backend on every request
- `threadId` — links AFP messages in the same session
- `submit(text)` — natural-language query or follow-up
- `submitAssumptionChange(key, value)` — structured assumption edit fast-path

### PlanningCardRenderer (`solid-ui/src/components/renderers/PlanningCardRenderer.tsx`)

Renders a `planning:result` AFP message. Sub-components:

| Component | Purpose |
|---|---|
| `OptionCard` | Ranked result card with rank badge, metric pill, confidence badge, rationale, risk flags, follow-up chips |
| `CopyButton` | Top-right of each card; copies card content to clipboard |
| `AssumptionsStrip` | Editable Context Strip; calls `onAssumptionChange` on blur/Enter |
| `ComparisonTable` | Optional comparison table (shown when 3+ options exist) |
| `ConfidenceBadge` | Green/yellow/grey badge for high/medium/low confidence |

**Props:**
- `onFollowUp(text)` — called when a chip is tapped; posts as natural language
- `onAssumptionChange(key, value)` — called when an assumption is edited; posts as structured delta

### ViewDispatcher integration

Planning results rendered via the AFP thread view (not the planning panel) use `ViewDispatcher`. It routes `format: "planning_result"` → `PlanningCardRenderer` without `onAssumptionChange` (read-only in thread context).

---

## Wiring a Live Tool — Step-by-Step

### 1. Register the tool

In `src/planning_tools.md`:

```markdown
## my_api
hint: One-line description of what this tool does (≤15 words)
schema:
  my_api(param1: str, param2: int = 5) -> MyResult
  MyResult: { field1: str, field2: int, items: [str] }
  provider: My API Provider (https://example.com)
api_key_env: PLANNING_MY_API_KEY
status: stub
```

### 2. Add key to environment

`.env` (local, gitignored):
```env
PLANNING_MY_API_KEY=your-real-key
```

`.env.example` (committed):
```env
PLANNING_MY_API_KEY=
```

### 3. Call the API in analyse_conditions()

In `src/planning_session.rs`, inside `analyse_conditions()`:

```rust
for tool in selected_tools {
    if tool.stub { /* existing stub path */ continue; }

    match tool.id.as_str() {
        "my_api" => {
            let key = tool.api_key_env.as_deref()
                .and_then(|var| std::env::var(var).ok())
                .unwrap_or_default();
            if key.is_empty() { continue; }

            // Call the real API, parse the response, insert into evidence.
            let result = call_my_api(&key, &parsed.constraints).await;
            evidence.insert("my_api".to_string(), serde_json::to_value(result).unwrap_or_default());
        }
        _ => {}
    }
}
```

### 4. Change status to live

```markdown
status: live
```

The compose step will now receive the real API output in the evidence block. Confidence for options using this tool can be set to `"high"`.

---

## Confidence Labels

| Label | Meaning | When to use |
|---|---|---|
| `high` | Backed by live data from a wired tool | Tool is `status: live` and returned data |
| `medium` | General knowledge, stub tool selected | Tool is `status: stub` or data is partial |
| `low` | Estimate only, no supporting data | No relevant tool was selected |

The LLM is instructed: _"Use 'high' confidence only when backed by live data."_ The compose step receives stub status notices in the evidence block so the LLM can set confidence correctly even for stub tools.

---

## Policy & Safety

The `planning_query` task type is registered in `src/policy_engine.rs`:

- **Masks:** `private`, `team`, `public`
- **Capabilities:** `web_search`, `read_calendar`, `summarise`, `plan`

All current planning tools run at `silent` autonomy (read-only). Before adding a tool that writes data:

1. Set its autonomy level to `soft_confirm` (reversible) or `hard_confirm` (irreversible).
2. Add a confirmation gate in `analyse_conditions()` before calling it.
3. Emit an AFP `approval_request` message and wait for user decision.

---

## Key Files

| File | Purpose |
|---|---|
| `src/planning_tools.md` | Tool registry — add APIs here |
| `src/planning_session.rs` | Orchestration loop, tool loading, AFP composition |
| `src/policy_engine.rs` | Task type registration, capability masks |
| `src/message.rs` | AFP constants for planning message types |
| `src/server/mod.rs` | `ui_planning_http()` HTTP handler |
| `src/server/types.rs` | Request/response types including `AssumptionDelta` |
| `solid-ui/src/components/PlanningView.tsx` | Stateful planning chat surface |
| `solid-ui/src/components/renderers/PlanningCardRenderer.tsx` | AFP result card renderer |
| `solid-ui/src/components/ViewDispatcher.tsx` | AFP format → renderer routing |
| `solid-ui/src/lib/api.ts` | `submitPlanningQuery()` + TypeScript types |
| `.env.example` | Env var reference including planning tool keys |
