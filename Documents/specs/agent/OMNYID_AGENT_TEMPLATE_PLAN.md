# Omnyid Default Agent Template — Design and Implementation Plan

## 1. Vision

Every Omnyid account gets one personal agent at signup. The agent is not a chatbot — it is a proactive digital surrogate that executes intent, maintains transparency, and preserves privacy at every step.

The agent operates exclusively through AFP v1 messages so its entire history is append-only, end-to-end encrypted, and auditable. It speaks to services through the existing typed capability contract (`IntegrationCapability` + `ActionIntent` + `ActionResult`), so every external action leaves a structured audit trail.

---

## 2. Agent Behavior Specification

### 2.1 Core Behaviors

| Behavior | Description | AFP Mapping |
|----------|-------------|-------------|
| **Inbox Triage** | Categorize and prioritize incoming AFP messages by type, sender, and urgency | `type: agent_triage` |
| **Intent Execution** | Accept a natural language goal, decompose it into ordered typed action steps | `type: agent_plan` → `action_*` |
| **Conflict Detection** | Watch for scheduling/priority overlaps and surface options | `type: agent_conflict` |
| **Research Synthesis** | Query APIs and web surfaces; return a single structured result | `type: agent_research` |
| **Human-in-the-Loop Gate** | Financial (>$50 by default), legal, or health actions pause for user approval | `ApprovalMode::HumanApprovalRequired` |
| **Identity Masking** | Use ephemeral `agent:task-{ulid}@omnyid.com` identifiers on third-party calls | n/a |
| **Transparency Log** | Every reasoning step logged as a `type: agent_step` AFP message in the task thread | append-only |

### 2.2 Priority Rules Schema

Users define their priority logic as JSON. The agent evaluates these before acting:

```json
{
  "rules": [
    { "type": "financial_threshold",   "amount_usd": 50,         "action": "require_approval" },
    { "type": "legal_health_always",                              "action": "require_approval" },
    { "type": "calendar_priority",     "order": ["work", "family", "social"] },
    { "type": "communication_filter",  "keywords": ["invoice", "urgent", "contract"], "action": "notify_immediately" },
    { "type": "transit_preference",    "preference": "aisle_seat, morning_departure" },
    { "type": "loyalty_program",       "provider": "gmail_calendar", "program_id": "" }
  ]
}
```

### 2.3 Default System Prompt

```
You are {agent_name}, a personal agent for {display_name}.

You operate under the AFP v1 protocol. Every action you take must produce an AFP message.

Principles:
- PROACTIVE: Anticipate needs from context, not only explicit commands.
- TRANSPARENT: Log every reasoning step as an AFP message so the user can audit it.
- PRIVACY-FIRST: Use ephemeral identifiers on third-party calls. Never expose the user's real identity unless they explicitly permit it.
- GATED: For financial actions above the user's threshold, legal decisions, and health decisions — always pause and emit an agent_approval_request AFP message before proceeding.
- SYNTHESIZING: Gather from multiple sources and return one structured result, not raw data.
- PRIORITY-AWARE: Always consult the user's priority_rules before resolving conflicts.

Capabilities you may use:
- email_triage: categorize and summarize incoming messages
- research: web and API synthesis
- calendar_conflict: detect and propose resolutions
- action_execute: run typed capability contracts via /actions/execute
- personalization: learn from user feedback (approved, rejected, edited, ignored)

Communication rules:
- Every response is an AFP message in the correct task thread.
- For multi-step tasks: emit one agent_plan message, then one agent_step per step, then one agent_result.
- Never store plaintext sensitive data in message content.
```

### 2.4 Capability Defaults

The template ships with four pre-wired capabilities, all set to `SuggestOnly` by default. The user upgrades individual ones to `Autonomous` or `HumanApprovalRequired` from the dashboard.

| Capability ID | Operation | Default Mode |
|--------------|-----------|--------------|
| `template_email_read` | Read and triage inbox | SuggestOnly |
| `template_email_send` | Send on behalf of user | HumanApprovalRequired |
| `template_web_research` | Search and synthesize | Autonomous |
| `template_calendar_read` | Read calendar context | SuggestOnly |

---

## 3. LLM Backend Options

### 3.1 Tiers

| Tier | How it works | Cost | Privacy |
|------|-------------|------|---------|
| **Hosted** (`hosted`) | Omnyid routes calls through a shared API key managed by the platform | $9/month prepay; usage tracked per account; hard-cap enforced | Prompts leave the server to the LLM provider |
| **BYOK** (`byok`) | User provides their own API key (encrypted with user's OMNYID_ENCRYPTION_KEY before DB storage) | $0 platform fee; user pays provider directly | Same as hosted but under user's own account |
| **Local Ollama** (`ollama`) | Agent calls the user's own Ollama instance at a configured URL | $0; user provides hardware | Inference never leaves user network — highest privacy |

### 3.2 Usage Enforcement (Hosted Tier)

- A `llm_usage_log` row is inserted for every inference call with `tokens_input`, `tokens_output`, and `cost_cents`
- The `user_llm_config.monthly_budget_cents` cap is checked before each call; if exceeded, the request fails with a `budget_exceeded` AFP error message
- Reset at the start of each calendar month
- Billing tier maps to the existing `billing_subscriptions` table: plan `pro` ($9/mo) enables the hosted LLM feature

### 3.3 Model Defaults

| Backend | Default model |
|---------|--------------|
| Hosted | `claude-sonnet-4-6` (Anthropic API) |
| BYOK OpenAI | `gpt-4o-mini` |
| BYOK Anthropic | `claude-haiku-4-5` |
| Ollama | `llama3.2` |

---

## 4. Data Architecture

### 4.1 New Tables

**`agent_instances`** — one row per user account, created at signup
```
id TEXT PK
owner_user_id TEXT → users(id)
agent_id TEXT (AFP Agent ID, e.g. agent:alice-agent@omnyid.com)
name TEXT
status TEXT (provisioning | active | paused | error)
system_prompt TEXT
priority_rules_json JSONB
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**`agent_task_queue`** — active and completed agent tasks
```
id TEXT PK
owner_user_id TEXT → users(id)
agent_instance_id TEXT → agent_instances(id)
thread_id TEXT (AFP thread for this task)
status TEXT (pending | planning | executing | awaiting_approval | completed | failed | cancelled)
intent TEXT (the user's natural language goal)
plan_json JSONB (decomposed steps)
result_json JSONB
error TEXT
priority TEXT (high | normal | low)
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**`user_llm_config`** — LLM backend choice per user
```
id TEXT PK
owner_user_id TEXT → users(id) UNIQUE
backend TEXT (hosted | byok | ollama)
provider TEXT (anthropic | openai | ollama)
model TEXT
encrypted_api_key TEXT (null for hosted; encrypted for byok)
ollama_url TEXT (null unless ollama backend)
monthly_budget_cents INT (default 900 for hosted = $9)
usage_cents_current_month INT (default 0)
usage_reset_at DATE
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

**`llm_usage_log`** — per-call usage audit
```
id TEXT PK
owner_user_id TEXT → users(id)
agent_task_id TEXT
model TEXT
tokens_input INT
tokens_output INT
cost_cents INT
recorded_at TIMESTAMPTZ
```

### 4.2 Row Level Security

All four new tables get PostgreSQL RLS with `FORCE ROW LEVEL SECURITY` so even the superuser app role cannot read another user's rows without explicitly setting the session variable.

**Pattern:**
```sql
ALTER TABLE agent_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_instances FORCE ROW LEVEL SECURITY;
CREATE POLICY rls_agent_instances ON agent_instances
  FOR ALL USING (owner_user_id = current_setting('app.current_user_id', true));
```

**Rust pattern** — new `Db::with_user_context` helper:
```rust
pub async fn with_user_context<F, Fut, T>(
    &self, user_id: &str, f: F
) -> Result<T, sqlx::Error>
where F: FnOnce(sqlx::pool::PoolConnection<sqlx::Postgres>) -> Fut,
      Fut: Future<Output = Result<T, sqlx::Error>>,
{
    let mut conn = self.pool.acquire().await?;
    sqlx::query("SET LOCAL \"app.current_user_id\" = $1")
        .bind(user_id).execute(&mut *conn).await?;
    f(conn).await
}
```

In practice, since SET LOCAL requires a transaction, the agent-task endpoints wrap their DB calls in an explicit `BEGIN ... COMMIT` with the context set inside.

---

## 5. AFP Integration

### 5.1 Thread Naming

Every agent task gets its own AFP thread:
- Task thread: `agent-task:{task_ulid}`
- Activity feed thread: `agent-activity:{agent_instance_id}` (one per agent, rolling)
- Approval request thread: `agent-approval:{task_ulid}:{step_index}`

### 5.2 Message Types

| AFP `type` | Emitted by | Meaning |
|-----------|-----------|---------|
| `agent_provisioned` | Server at signup | Agent instance created |
| `agent_plan` | Agent on new intent | Step-by-step plan for the goal |
| `agent_step` | Agent per step | One execution step with reasoning |
| `agent_research_result` | Agent | Synthesized data from web/API calls |
| `agent_approval_request` | Agent | Paused; waiting for human gate |
| `agent_result` | Agent | Task complete with outcome |
| `agent_conflict_detected` | Agent | Two events/requirements clash |
| `agent_triage` | Agent | Inbox categorization result |

### 5.3 Approval Loop

1. Agent emits `agent_approval_request` in the task thread
2. Task status → `awaiting_approval`
3. User POSTs to `/agent/tasks/{id}/approve` or `/agent/tasks/{id}/reject`
4. Server updates task status and appends `agent_approval_granted` or `agent_approval_rejected` AFP message
5. Agent resumes or cancels

---

## 6. API Surface

### New Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/agent/provision` | Create agent instance for authenticated user (idempotent; called at signup) |
| `GET` | `/agent/me` | Get my agent instance + active task count |
| `POST` | `/agent/intent` | Submit a natural language goal → creates a task |
| `GET` | `/agent/tasks` | List tasks (status filter, limit) |
| `GET` | `/agent/tasks/{id}` | Get task detail with plan and steps |
| `POST` | `/agent/tasks/{id}/approve` | Approve a pending approval gate |
| `POST` | `/agent/tasks/{id}/reject` | Reject a pending approval gate |
| `POST` | `/agent/tasks/{id}/cancel` | Cancel an active task |
| `PUT` | `/agent/priority-rules` | Update user's priority logic JSON |
| `GET` | `/agent/priority-rules` | Get current priority rules |
| `POST` | `/user/llm-config` | Set LLM backend (hosted/byok/ollama) |
| `GET` | `/user/llm-config` | Get current config + this-month usage |

---

## 7. Signup Provisioning Flow

When a new user account is created (email+password or Google OAuth), the server automatically:

1. Generates an Agent ID: `agent:{username}-agent@omnyid.com`
2. Inserts a row into `agent_instances` with `status = active`
3. Inserts a `user_llm_config` row with `backend = hosted` and `monthly_budget_cents = 0` (free tier, no LLM until plan upgrade)
4. Inserts a row into `managed_agents` (existing table) linking the agent to the user
5. Emits an `agent_provisioned` AFP message in the activity thread
6. Returns the agent instance in the auth response

---

## 8. Account Isolation Guarantees

All new endpoints require a valid session token. The user's `user_id` from the session is the isolation key — it is injected into every query via the `SET LOCAL "app.current_user_id"` context, and the RLS policy enforces it at the Postgres layer independently of the application logic.

An attacker who bypasses the application layer but can execute arbitrary SQL against the app's DB user still cannot read another user's rows because `FORCE ROW LEVEL SECURITY` applies to the app DB role too.

---

## 9. Implementation Phases

| Phase | Files | Task |
|-------|-------|------|
| A | `postgres/migrations/0017_agent_template.sql` | Tables + RLS policies |
| B | `src/agent_template.rs` | Template definition, task model, LLM config types |
| C | `src/db.rs` | `provision_agent`, `get_agent_instance`, `create_agent_task`, `list_agent_tasks`, `get_agent_task`, `update_agent_task_status`, `upsert_llm_config`, `get_llm_config`, `record_llm_usage`, `check_llm_budget`, `update_user_priority_rules`, `get_user_priority_rules` |
| D | `src/server.rs` | New agent + LLM config endpoints; call `provision_agent` in the existing signup handler |
| E | `src/lib.rs` | `pub mod agent_template;` |
