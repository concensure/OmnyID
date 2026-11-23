# Composite Intent — Dependency-Ordered Task List

## Status: Active — 2026-05-16
## Design Reference: composite_intent_design.md

---

Tasks are ordered so every task only depends on tasks above it.
Each task notes its blocking dependencies explicitly.

---

## Phase 1 — Foundation (no dependencies)

### T1 · composite_intent module
**File:** `src/composite_intent.rs`
**Depends on:** nothing
**Blocks:** T4, T5, T6

Implement:
- `is_composite_query(query: &str) -> bool`
  - Score keyword buckets: weather, document, digest, external-tool, budget
  - Return true if ≥2 buckets fire
- `parse_weather_locations(query: &str) -> Vec<(String, u8)>`
  - Split on `" and "` after weather stopword removal
  - Return vec of `(city, days)` tuples
- `composite_intents_present(query: &str) -> Vec<DetectedIntent>`
  - Returns enum variants for each bucket that fired
  - Used by orchestration prompt injection (Phase 3)

LOCS header required. Stability: draft. Guard: editable.

---

### T2 · notion_gateway stub
**File:** `src/gateway/notion_gateway.rs`
**Depends on:** nothing
**Blocks:** T7

Implement:
- `pub struct NotionConfig { token: String, database_id: String }`
- `pub struct NotionPageRef { page_id: String, url: String }`
- `pub async fn post_page(cfg: &NotionConfig, title: &str, markdown: &str) -> Result<NotionPageRef>`
  - POST to `https://api.notion.com/v1/pages`
  - Auth: `Authorization: Bearer {token}`
  - Content-Type: `application/json`
  - Body: Notion block format (paragraph per line)
- `pub async fn append_block(cfg: &NotionConfig, page_id: &str, markdown: &str) -> Result<()>`
  - PATCH to `https://api.notion.com/v1/blocks/{page_id}/children`

Source config from `OMNYID_NOTION_TOKEN` and `OMNYID_NOTION_DATABASE_ID` env vars.
Return stub `Ok(NotionPageRef { page_id: "stub".into(), url: "".into() })` until real keys are set.

LOCS header required. Stability: draft. Guard: editable.

---

### T3 · slack_gateway stub
**File:** `src/gateway/slack_gateway.rs`
**Depends on:** nothing
**Blocks:** T7

Implement:
- `pub struct SlackConfig { webhook_url: String }`
- `pub async fn post_message(cfg: &SlackConfig, channel: Option<&str>, text: &str) -> Result<()>`
  - POST JSON `{ "text": "...", "channel": "..." }` to webhook URL
  - Source from `OMNYID_SLACK_WEBHOOK_URL` env var
  - No-op when env var is unset (return Ok(()))

LOCS header required. Stability: draft. Guard: editable.

---

## Phase 2 — Integration wiring (depends on Phase 1)

### T4 · Update search_workflows.rs
**File:** `src/server/search_workflows.rs`
**Depends on:** T1
**Blocks:** T5

Changes:
- Make `weather_query_details` `pub(crate)` (currently `pub(super)`)
- Re-export `parse_weather_locations` from `composite_intent` via a thin wrapper
  or call it directly in mod.rs
- No logic changes to existing `weather_query_details` — keep backward compat

---

### T5 · Update server/mod.rs — composite guard
**File:** `src/server/mod.rs`
**Depends on:** T1, T4
**Blocks:** T6

Changes in `ui_command_http`:

1. Import `crate::composite_intent::{is_composite_query, parse_weather_locations}`

2. Before the digest early-return block, add:
```rust
let composite = opt_user.is_some() && is_composite_query(trimmed_query);
```

3. Wrap each specialized early-return with `if !composite { … }`:
```rust
if !composite {
    if digest_query_requested(trimmed_query) { … return; }
}
if !composite {
    if let Some((loc, days)) = weather_query_details(trimmed_query) { … return; }
}
if !composite {
    if let Some(details) = budget_query_details(trimmed_query) { … return; }
}
```

4. Add multi-location weather handler AFTER the single-location guard:
```rust
if !composite {
    let locs = parse_weather_locations(trimmed_query);
    if locs.len() >= 2 {
        // parallel fetch + aggregate
    }
}
```
Note: single-location queries still use `weather_query_details` (existing path).

5. Composite queries fall through to LLM routing. The existing LLM prompt
   already includes "orchestrate" intent — no prompt change needed.

---

### T6 · tool_dispatch module
**File:** `src/tool_dispatch.rs`
**Depends on:** T1, T2, T3
**Blocks:** T7

Implement:
- `pub enum DispatchResult { Handled(String), NotHandled }`
- `pub async fn try_dispatch(task: &PlannedTask, state: &Arc<AppState>, user_id: &str) -> DispatchResult`
  - Pattern match on `task.content` (lowercased):
    - Weather pattern: contains city + ("weather"|"forecast"|"temperature") → `ingest_weather_for_user`
    - Notion pattern: contains "notion" → `notion_gateway::post_page`
    - Slack pattern: contains "slack" → `slack_gateway::post_message`
    - Budget pattern: contains "budget"|"projection" → `ingest_budget_projection_for_user`
  - Returns `NotHandled` when no pattern matches

LOCS header required. Stability: draft. Guard: editable.

---

## Phase 3 — Orchestrator integration (depends on Phase 2)

### T7 · Wire tool_dispatch into master_orchestrator.rs
**File:** `src/master_orchestrator.rs`
**Depends on:** T6
**Blocks:** nothing

Changes in `execute_task` (the per-task async closure):

```rust
// Before the LLM inference call:
let dispatch_result = crate::tool_dispatch::try_dispatch(&task, &state, &user_id).await;
if let DispatchResult::Handled(output) = dispatch_result {
    prior_results.lock().await.insert(task.id.clone(), output.clone());
    // store success AgentTask status
    continue; // skip LLM call
}
// Existing LLM path follows…
```

This makes orchestrated sub-tasks capable of calling real APIs instead of
always delegating to the LLM.

---

## Phase 4 — Module registration (depends on T2, T3, T6)

### T8 · gateway/mod.rs
**File:** `src/gateway/mod.rs`
**Depends on:** T2, T3

Add:
```rust
pub mod notion_gateway;
pub mod slack_gateway;
```

---

### T9 · lib.rs
**File:** `src/lib.rs`
**Depends on:** T1, T6

Add:
```rust
pub mod composite_intent;
pub mod tool_dispatch;
```

---

## Phase 5 — LOCS enforcement (no code dependencies)

### T10 · LOCS skill capsule
**File:** `.skillcapsule/locs-file-writer.md`
**Depends on:** nothing

Skill capsule that instructs Claude to write LOCS-compliant Rust files for this
project. Must include the exact header format, stability levels, and the
validate-before-commit workflow.

---

### T11 · CLAUDE.md LOCS enforcement section
**File:** `CLAUDE.md`
**Depends on:** T10

Add a "New File Rules" section that:
- Specifies exact LOCS header format for Rust files
- Specifies LOCS frontmatter format for Markdown files
- Lists the `locs validate` step as mandatory before staging
- References the skill capsule

---

## Completion Checklist

- [ ] T1 `composite_intent.rs` — unit tests for `is_composite_query` and `parse_weather_locations`
- [ ] T2 `notion_gateway.rs` — compiles, returns stub Ok
- [ ] T3 `slack_gateway.rs` — compiles, returns stub Ok
- [ ] T4 `search_workflows.rs` — visibility change only, existing tests still pass
- [ ] T5 `server/mod.rs` — composite guard blocks, multi-location weather path
- [ ] T6 `tool_dispatch.rs` — unit test: weather pattern dispatches correctly
- [ ] T7 `master_orchestrator.rs` — dispatch called before LLM in execute_task
- [ ] T8 `gateway/mod.rs` — new mods declared
- [ ] T9 `lib.rs` — new top-level mods declared
- [ ] T10 skill capsule created
- [ ] T11 CLAUDE.md updated
- [ ] `cargo check` passes on all modified crates
