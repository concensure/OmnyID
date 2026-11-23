# OmnyID — Task Backlog

---

## Proactive Agent — Phase P1 + P2 (from PROACTIVE_AGENT_ROADMAP.md)

### PA-001 — P1.1 AFP passive-event schema ✓
**Implemented:**
- `src/message.rs` — added `AFP_TYPE_PASSIVE_EVENT`, 10 passive-event subtypes, `AfpPassiveEventContent` struct
- `src/message.rs` — added `AFP_TYPE_PROACTIVE_SUGGESTION`, `AFP_TYPE_PROACTIVE_ACTION_TAKEN`, `AfpProactiveSuggestionContent` struct (P5.1)

### PA-002 — P1.2 Passive event ingestion endpoint ✓
**Implemented:**
- `src/server/proactive_routes.rs` — `POST /events/passive` stores AFP passive_event (no LLM) and immediately runs heuristic evaluator
- Returns `{ status, event_afp_id, suggestions_emitted, suggestion_ids }`

### PA-003 — P1.3 Event timestamp index ✓
**Implemented:**
- `postgres/migrations/0045_proactive.sql` — partial index `idx_messages_passive_event_ts` on `messages(timestamp) WHERE type='passive_event'`

### PA-004 — P1.4 Workflow state AFP integration ✓
**Implemented:**
- `src/server/mod.rs` — `emit_workflow_passive_event_nonblocking()` fires after every terminal workflow run
- Emits `passive_event` AFP for `workflow_completed` / `workflow_failed` states, then runs heuristic evaluator

### PA-005 — P2.1 Heuristic rule schema ✓
**Implemented:**
- `postgres/migrations/0045_proactive.sql` — `proactive_heuristics` table
- `postgres/migrations/0045_proactive.sql` — `behavioral_memory` table (P3.1)
- `postgres/migrations/0045_proactive.sql` — `proactive_outcomes` table (P3.3)
- `postgres/migrations/0045_proactive.sql` — `proactive_token_log` table (P4.4)

### PA-006 — P2.2 Built-in heuristics seed ✓
**Implemented:**
- `src/proactive_engine.rs` — `builtin_heuristics()` returns 5 heuristics:
  1. `meeting-follow-up`: calendar_event_completed + client tag → draft follow-up
  2. `invoice-delay`: calendar_event_completed + client tag → invoice draft
  3. `workflow-failure-notify`: workflow_failed → view failure details
  4. `deep-work-protect`: deep_work_session_started → enable focus mode
  5. `stalled-thread`: email_thread_idle (≥48h) → follow up on thread

### PA-007 — P2.3 Rule evaluator ✓
**Implemented:**
- `src/proactive_engine.rs` — `evaluate()` pure function, no LLM, zero token cost
- `conditions_satisfied()` supports exact match and numeric threshold checks
- 4 unit tests covering all 5 heuristics
- `src/server/proactive_routes.rs` — evaluator runs synchronously on every `POST /events/passive`

### PA-008 — P3.1, P3.3, P3.4 Memory + outcome APIs ✓
**Implemented:**
- `src/db.rs` — `upsert_behavioral_memory()`, `list_behavioral_memory()`, `record_proactive_outcome()`, `heuristic_acceptance_rates()`, `list_proactive_suggestions()`
- `src/server/proactive_routes.rs` — `POST /proactive/outcomes`, `GET /proactive/suggestions`, `GET /memory/context`

### PA-009 — Pre-existing compile error fixes ✓
**Fixed:**
- `src/server/mod.rs:2984` — `preview_message` undefined in "mixed" intent branch; added `orchestration_preview_message()` call
- `src/server/mod.rs:7718` — `rec["id"]` on `SavedWorkflowRecord` struct; changed to `rec.workflow_id.clone()`
- `src/master_orchestrator.rs:939` — `PlannedTask` missing `depends_on` and `execution_group` fields; added defaults
- `src/server/mod.rs:7843/7845` — borrow-after-move for `agent_id`/`thread_id`; cloned before the move

### PA-010 — P3.2 Temporal memory materialized view ✓
**Implemented:**
- `postgres/migrations/0046_temporal_summary.sql` — `temporal_summary` materialized view; per (event_type, entity_id): last_seen_at, event_count, avg_frequency_hours, decay-weighted recency_score (half-life 72h); CONCURRENTLY refresh every 30 min via pg_cron if installed
- `src/db/migration_catalog.rs` — registered 0044, 0045, 0046 migrations (array size 40 → 43)
- `src/db.rs` — `query_temporal_summary(limit)` query method
- `src/server/proactive_routes.rs` — `GET /memory/context` now includes `temporal_summary` field

### PA-011 — P4.1–P4.4 Selective LLM Activation Gate ✓
**Implemented:**
- `src/proactive_llm_gate.rs` — new module:
  - P4.1: `should_invoke_llm()` — pure function; skips LLM when confidence ≥ 0.85 or no template placeholders
  - P4.2: `build_context_prompt()` — ≤ 400-token context-compressed prompt (behavioral + temporal context injection)
  - P4.3: `validate_llm_suggestion()` — parses and validates LLM JSON output; strips code fences; falls back to template on failure
  - P4.4: `check_token_budget()` / `run_llm_gate()` — daily token cap per heuristic (default 200 tokens/day)
  - 6 unit tests
- `src/db.rs` — `daily_token_usage()`, `log_proactive_token_usage()` methods for P4.4 tracking
- `src/server/mod.rs` — `build_inference_backend()` made `pub(super)` for proactive_routes access
- `src/server/proactive_routes.rs` — LLM gate runs after heuristic evaluation on every `POST /events/passive`; falls back to template on any LLM failure

### PA-012 — P2.4 Heuristic confidence feedback ✓
**Implemented:**
- `src/proactive_engine.rs` — `apply_confidence_feedback()`: adjusts heuristic confidence_threshold based on acceptance rates; disables heuristics with 0% acceptance over ≥ 10 outcomes
- `src/server/proactive_routes.rs` — `ingest_passive_event_http` now fetches acceptance rates and applies feedback before evaluating heuristics

### PA-013 — P5.2 DashboardFeed proactive suggestion card ✓
**Implemented:**
- `solid-ui/src/lib/api.ts` — `recordProactiveOutcome()`, `listProactiveSuggestions()` API helpers
- `solid-ui/src/components/DashboardFeed.tsx` — `ProactiveSuggestionCard` component (amber/violet/rose accent border by urgency, confidence chip, "Do it" + "Dismiss" buttons, action_afp_payload forwarding, outcome recording on both actions)
- Card border variant for `proactive_suggestion` type wired into the existing sentiment border-class logic

---

## Previous tasks (all implemented)

All items below have been implemented. See commit history for details.

---

## Security / Email Infrastructure

### TASK-001 — SpamAssassin spam filtering ✓
**Implemented:**
- `spamassassin` service added to `docker-compose.yml` (port 783, localhost-only)
- `src/gateway/spam_filter.rs` — async SPAMC/1.5 client over TCP; configurable via `SPAMASSASSIN_HOST` and `SPAM_THRESHOLD` env vars; returns `Ok(None)` when not configured so the gate is skipped gracefully
- `src/gateway/smtp_in.rs` — spam gate runs first in `handle_incoming_email()`, returns `Err(...)` on score ≥ threshold
- `homeserver` env: `SPAMASSASSIN_HOST: spamassassin:783`, `SPAM_THRESHOLD: 5.0`

---

### TASK-002 — ClamAV attachment scanning ✓
**Implemented:**
- `clamav` service added to `docker-compose.yml` (port 3310, localhost-only) with healthcheck
- `src/gateway/clamav.rs` — async clamd INSTREAM protocol client; configurable via `CLAMD_HOST`; returns `Ok(None)` when not configured
- `src/gateway/smtp_in.rs` — AV gate runs after spam gate; scans the full raw MIME email (covers all parts and attachments in one pass)
- `homeserver` env: `CLAMD_HOST: clamav:3310`

---

### TASK-003 — Upgrade to real Noise Protocol (E2EE) ✓
**Implemented:**
- `snow = "0.9"` added to `Cargo.toml`
- `src/noise_channel.rs` — `Noise_XX_25519_ChaChaPoly_BLAKE2s` pattern; `NoiseKeypair::generate()`, `NoiseHandshake` (initiator + responder), `NoiseTransport` (encrypt/decrypt); 2 tests (round-trip + tamper detection)
- Existing `crypto.rs` symmetric encryption retained for AFP message content storage; Noise handles relay session transport

---

## Testing

### TASK-004 — Complete end-to-end happy path test ✓
**Implemented:**
- `src/server/mod.rs` `handle_gateway_email` — now returns `thread_id` alongside `afp_id` in the response JSON
- `tests/api_flows.rs` `email_ingested_message_is_fetchable_as_thread` — POST to `/gateway/email` → assert `status=processed` + extract `thread_id` → GET `/thread/{thread_id}` → assert message array is non-empty and contains the ingested message with correct `type`, `subtype`, and `thread_id`

---

## Documentation

### TASK-005 — AFP message flow architecture doc ✓
**Implemented:**
- `docs/architecture.md` — full ASCII flow diagram (gateway → homeserver → Postgres → ElectricSQL → SolidJS UI), AFP message field table, encryption model, AgentCard discovery, Noise relay, infrastructure service table, and key source file index

---

## Developer Experience

### TASK-006 — Containerise Solid UI in docker-compose ✓
**Implemented:**
- `solid-ui/Dockerfile` — multi-stage build: node:22-alpine builds `dist/`, alpine:3.20 seeds the shared `ui-dist` volume and exits
- `docker-compose.yml` `ui` service — init container pattern (`restart: "no"`), mounts `ui-dist:/srv/workspace`
- `docker-compose.yml` `caddy` service — mounts `ui-dist:/srv/workspace:ro`, `depends_on: ui (service_completed_successfully)`
- `docker-compose.yml` `ui-dist` named volume added
- No Caddyfile changes needed — Caddy already serves `/srv/workspace` via `file_server`
- `docker compose up` is now a complete one-command demo with no separate npm step

---
