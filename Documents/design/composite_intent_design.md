# Composite Intent & Tool Use Design

## Status: Draft — 2026-05-16

---

## 1. Problem Statement

The master agent **cannot** currently answer these query classes correctly:

| Query | Expected | Actual |
|---|---|---|
| "weather in LA and New York" | Parallel weather for 2 cities | Weather for one city (last `in X` match only) |
| "write me a document then check weather" | Document created + weather fetched | Weather only (early-return fires, document ignored) |
| "Summarise the information and upload to Notion then write a Slack message" | Orchestrated 3-step tool chain | Error or LLM stub (Notion/Slack not integrated) |

---

## 2. Root Causes

### 2.1 Single-location weather parser
`weather_query_details()` in `server/search_workflows.rs` uses `rfind(" in ")` — finds the **last** occurrence of "in" and treats the remainder as the one location. Queries like "weather in LA and New York" produce location `"New York"` only.

### 2.2 Early-return handlers consume composite queries
`ui_command_http` checks digest → weather → budget in sequence. Each check `return`s immediately on a match, so "write me a document then check weather" hits the weather guard and returns — the document intent is silently dropped.

### 2.3 No tool dispatch in the orchestrator
When a query classifies as `"orchestrate"`, `spawn_orchestration_run()` calls `MasterOrchestrator::plan_and_run()`. Task execution calls the LLM for every task type, but there is no dispatch path to actual capability functions (weather API, Notion, Slack, budget). The orchestrator is LLM-only; it cannot invoke built-in tools.

### 2.4 Notion and Slack integrations do not exist
The `integration.rs` framework defines `IntegrationCapability` contracts, but Notion and Slack have no concrete gateway implementations. The `gateway/` folder has Gmail, Graph (Outlook), IMAP, SMTP — not Notion or Slack.

---

## 3. Solution Architecture

### 3.1 Composite Intent Detection Layer

A new module `src/composite_intent.rs` exposes:

```rust
pub fn is_composite_query(query: &str) -> bool
pub fn parse_weather_locations(query: &str) -> Vec<(String, u8)>
pub fn composite_intents_present(query: &str) -> Vec<DetectedIntent>
```

**`is_composite_query`** — returns `true` when the query contains signals for more than one intent category (e.g., weather + note, digest + weather). Implemented by scoring keyword buckets:
- weather bucket: "weather", "forecast", "temperature", "rain"
- document bucket: "write", "document", "note", "draft", "create"
- digest bucket: "digest", "summarize", "summarise", "tldr"
- external tool bucket: "notion", "slack", "upload", "post to"
- budget bucket: "budget", "projection", "income", "expenses"

If two or more buckets fire → composite.

**`parse_weather_locations`** — splits on " and " after stripping temporal and weather stopwords, extracts each city segment independently. Handles "weather in LA and New York" → `[("LA", 7), ("New York", 7)]`.

### 3.2 Guard: Skip early-return handlers on composite queries

In `ui_command_http`, wrap every specialized early-return block with:

```rust
if !is_composite_query(trimmed_query) {
    if let Some((loc, days)) = weather_query_details(trimmed_query) { … return; }
}
```

Composite queries flow through to LLM intent routing (classified as `"orchestrate"` or given multi-step handling).

### 3.3 Multi-location weather aggregation

When `parse_weather_locations` returns >1 location, run `ingest_weather_for_user` for each in parallel (tokio::join), merge results into a single `UiCommandResponse` with multiple `preview_message` entries (or a combined AFP artifact).

### 3.4 Tool Dispatch Registry in the Orchestrator

A new module `src/tool_dispatch.rs` maps task `content` patterns to built-in capability functions:

```rust
pub enum DispatchResult {
    Handled(String),   // task output text
    NotHandled,        // fall through to LLM
}

pub async fn try_dispatch(task: &PlannedTask, state: &Arc<AppState>, user_id: &str) -> DispatchResult
```

Dispatch rules (priority order):
1. Task content contains weather city → call `ingest_weather_for_user`
2. Task content contains "notion" + action → call `notion_gateway::post_page`
3. Task content contains "slack" + message → call `slack_gateway::post_message`
4. Task content contains budget signals → call `ingest_budget_projection_for_user`
5. Otherwise → `NotHandled` (LLM handles it)

`MasterOrchestrator::execute_task` calls `try_dispatch` first; only calls LLM if `NotHandled`.

### 3.5 Notion Gateway (stub → production path)

`src/gateway/notion_gateway.rs` — sends authenticated REST calls to the Notion API:
- `post_page(token, database_id, title, content) -> Result<NotionPageRef>`
- `append_block(token, page_id, markdown) -> Result<()>`

Config sourced from user integration record (`integration.rs` `ActionIntent` store) or env var `OMNYID_NOTION_TOKEN`.

### 3.6 Slack Gateway (stub → production path)

`src/gateway/slack_gateway.rs` — sends messages via Slack Incoming Webhooks or Bot API:
- `post_message(webhook_url_or_token, channel, text) -> Result<()>`

Config from integration record or env var `OMNYID_SLACK_WEBHOOK_URL`.

---

## 4. Data Flow — Composite Query

```
User: "weather in LA and New York"
│
├─ is_composite_query() → false (single intent, multi-location)
├─ weather_query_details() → None (not composite, but still single)
├─ parse_weather_locations() → [("LA", 7), ("New York", 7)]
├─ parallel: ingest_weather(LA) + ingest_weather(New York)
└─ merge → UiCommandResponse { bullets: [LA result, NY result] }

User: "write me a document then check weather in Sydney"
│
├─ is_composite_query() → true (document bucket + weather bucket)
├─ skip early-return handlers
├─ LLM intent → "orchestrate"
├─ spawn_orchestration_run()
│   ├─ plan_objective() → tasks: [write_document, weather_sydney]
│   ├─ execute_task(write_document) → LLM generates document text
│   └─ execute_task(weather_sydney) → try_dispatch → ingest_weather("Sydney")
└─ aggregated OrchestratorResult → UiCommandResponse

User: "Summarise and upload to Notion then post to Slack"
│
├─ is_composite_query() → true (external tool bucket fires)
├─ skip early-return handlers
├─ LLM intent → "orchestrate"
├─ spawn_orchestration_run()
│   ├─ plan_objective() → tasks: [summarize, notion_upload, slack_post]
│   ├─ execute_task(summarize) → LLM summarizes thread context
│   ├─ execute_task(notion_upload) → try_dispatch → notion_gateway::post_page(summary)
│   └─ execute_task(slack_post) → try_dispatch → slack_gateway::post_message(summary)
└─ aggregated result
```

---

## 5. Module Inventory

| Module | Path | Purpose |
|---|---|---|
| `composite_intent` | `src/composite_intent.rs` | Query classification, multi-location parsing |
| `tool_dispatch` | `src/tool_dispatch.rs` | Built-in tool routing for orchestrator tasks |
| `notion_gateway` | `src/gateway/notion_gateway.rs` | Notion REST API client |
| `slack_gateway` | `src/gateway/slack_gateway.rs` | Slack webhook/bot API client |

Modified:
- `src/server/search_workflows.rs` — multi-location parser
- `src/server/mod.rs` — composite guard around early-return handlers, multi-location weather aggregation
- `src/master_orchestrator.rs` — `try_dispatch` call in `execute_task`
- `src/gateway/mod.rs` — register new gateways
- `src/lib.rs` — register new top-level modules

---

## 6. Non-Goals (this phase)

- Slack OAuth flow (use webhook URL from env or integration record)
- Notion database schema discovery (caller provides `database_id`)
- Multi-turn clarification for ambiguous composite queries
- Tool call streaming (results are returned after all tasks complete)
