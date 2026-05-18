# Omnyid Phase 11: Knowledge Curator, Background Daemons, and Visual Workflow Builder

## Phase 11: Persistent Intelligence Layer

Status: in progress

Purpose: establish the background daemon architecture that makes OmnyID a continuously-learning, self-organising knowledge system — and give users a fully-featured visual node workflow builder to wire daemons, agents, and integrations without writing code.

---

## Dependency Order

The items below are ordered so each block depends only on what came before it.

1. **Database schema** — daemon registration, curator event, backlink, knowledge card, and cold-storage index tables (`0033_knowledge_curator_daemons.sql`)
2. **Knowledge Curator Rust contract** — `src/knowledge_curator.rs` defines the event-driven curator lifecycle, backlink graph types, and supertag schema
3. **Daemon registry + policy enforcement** — `src/daemon_registry.rs` manages spawn/revoke lifecycle; `src/policy_engine.rs` already exists and is extended for daemon-scoped delegated keys
4. **Email Gateway Daemon** — extends the existing `src/gateway/` workers into a continuously-running watched daemon
5. **Relational Sync Worker** — extends `src/sync_worker.rs` to monitor `store_in_relational` AFP flags
6. **Archive & Cold Storage Daemon** — new `src/archive_daemon.rs` monitors `archive_after` / `expires_at` flags
7. **Health & Maintenance Daemon** — new `src/health_daemon.rs` runs embedding re-indexing and duplicate detection during idle windows
8. **TypeScript SDK workflow extensions** — new daemon primitive node kind, subscription trigger, and curator preset blueprints
9. **Visual Workflow Builder enhancements** — daemon node visual treatment, minimap, curator palette entry, node type icons

---

## Architecture: Daemon Pattern

All background sub-agents follow the same invariant pattern to keep the Master Agent in control.

```
Master Agent
  │
  ├── spawn_daemon(DaemonManifest { kind, delegated_scope, policy_key_id })
  │     └── Daemon gets a short-lived delegated key scoped only to its allowed AFP message types
  │
  ├── Daemon runs event loop via ElectricSQL real-time subscription
  │     └── On each AFP message arrival → process → write new AFP messages (append-only)
  │
  └── Master Agent can revoke daemon key at any time → daemon stops immediately
```

**Invariants every daemon must obey:**
- Operates only on AFP messages (reads and writes through the AFP layer)
- Never mutates existing messages (append-only; E2EE preserved)
- Never stores plaintext if the message payload is encrypted
- Delegated key scoped to specific `allowed_message_types` list — policy engine rejects anything outside scope
- Reports health heartbeat as an AFP message of type `daemon_heartbeat`

---

## 1. Knowledge Curator Agent

### Purpose
Continuously transforms every new piece of information in the user's AFP database into structured, connected, searchable knowledge — with zero manual effort.

### Step-by-Step Workflow

#### Step 1 — Trigger
A new AFP message arrives (via email gateway, note creation, tool result, workflow output, etc.).
ElectricSQL's real-time change-stream subscription (`sync_slice: inbox_summaries`) fires immediately.
The Curator is notified via an internal `afp_new_message` event.

#### Step 2 — Fast Initial Analysis
The Curator reads the incoming AFP message and extracts:
- Key named entities (people, organisations, locations, concepts)
- Existing `references` and `metadata` headers
- Message `type` and `subtype` for routing logic
- Embedding vector (1536-d) for pgvector similarity search

#### Step 3 — Backlink Creation
The Curator queries pgvector for the top-K most similar existing messages (cosine similarity > 0.82 threshold).
For each match it creates two new AFP messages:
- `backlink_update` from the new message → existing match
- `backlink_update` from the existing match → new message (cross-reference)

These AFP writes are intentionally lightweight audit records. The living bidirectional graph is maintained as a derived index over time:
- Postgres `afp_backlinks` is the fast traversal/search path
- an optional in-memory `derived_graph` inside the Knowledge Curator can mirror new edges in real time

Normal backlink browsing/search reads from the derived index, not by filtering raw `backlink_update` history.

Backlink AFP messages carry:
```json
{
  "type": "backlink_update",
  "subtype": "semantic_similarity",
  "references": ["<source_id>", "<target_id>"],
  "metadata": {
    "user_id": "<user_id>",
    "backlink_id": "<backlink_id>",
    "similarity_score": 0.91,
    "match_reason": "entity_overlap",
    "curator_run_id": "<run_id>"
  }
}
```

#### Step 4 — Summary & Supertag Generation
The Curator calls the local LLM (via `src/inference.rs`) with a structured prompt to produce:
- `metadata.summary` — a 2–4 sentence high-quality summary
- `metadata.supertags` — array of relevant supertags (e.g. `["#ProjectX", "#Travel2026"]`)
- `metadata.knowledge_card` — a structured JSON representation of the content

These are stored as a new AFP message of type `knowledge_card`:
```json
{
  "type": "knowledge_card",
  "references": ["<source_message_id>"],
  "metadata": {
    "summary": "...",
    "supertags": ["#ProjectX"],
    "entities": ["ACME Corp", "Alice"],
    "knowledge_card": { "title": "...", "body": "...", "facts": [...] },
    "curator_run_id": "<run_id>"
  }
}
```

#### Step 5 — Storage as New AFP Messages
All curator outputs are written as **new AFP messages** — the source message is never mutated.
This keeps the knowledge base immutable, auditable, and replayable.

#### Step 6 — Periodic Deep Maintenance (idle window)
Triggered by the Health & Maintenance Daemon when CPU/network usage is low:
- Re-evaluates older messages for new connections (sliding 30-day window)
- Generates higher-level "Insight" messages: `type: insight`, e.g. _"You have been researching solid-state batteries for 3 weeks — here's the emerging picture"_
- Proposes merge candidates (near-duplicate cards) as `type: merge_suggestion` for user approval
- Re-computes embeddings for messages whose embedding version is behind current model

### Policy & Guardrail Integration

The Knowledge Curator's delegated key is scoped to:
```
allowed_message_types: [
  "backlink_update",
  "knowledge_card",
  "insight",
  "merge_suggestion",
  "daemon_heartbeat"
]
```

The policy engine (`src/policy_engine.rs`) enforces:
- Rate limiting: max 500 curator events per hour per user
- Cost cap: max LLM tokens per day configurable in user preferences
- E2EE: if source message is encrypted, knowledge card is encrypted with the same key material
- Approval gate: `merge_suggestion` messages require explicit user approval before any consolidation occurs

---

## 2. Email Gateway Daemon

### Purpose
Continuously monitors IMAP for new emails, converts them to AFP messages, and delivers outgoing AFP messages as real emails.

### How it Fits Into the Daemon Pattern
The existing `src/gateway/imap_sync.rs` and `src/gateway/smtp_out.rs` workers are promoted into a persistent daemon:

```
EmailGatewayDaemon
  ├── IMAP watcher loop (polling interval: 60s, configurable)
  │     └── new email → parse RFC822 → create AFP message (type: email_incoming)
  │     └── update checkpoint row in postgres
  ├── SMTP dispatch loop (driven by AFP message subscription)
  │     └── new AFP message with type: email_outgoing → deliver via Gmail API or SMTP fallback
  └── Heartbeat AFP message every 5 minutes
```

**Delegated scope:**
```
allowed_message_types: [
  "email_incoming",
  "email_outgoing",
  "action_reply",
  "action_forward",
  "daemon_heartbeat"
]
```

**Policy guardrails:**
- Outbound email must pass the approval queue if `approval_mode: human_approval_required` is set on the node
- Maximum recipients per email enforced by policy engine
- DKIM-signed outbound to prevent spoofing

---

## 3. Relational Sync Worker

### Purpose
Monitors AFP messages flagged `store_in_relational: true` and syncs their structured fields to conventional Postgres tables for fast SQL queries, reporting, and ACID-safe workflows.

### Behavior
The existing `src/sync_worker.rs` is extended:

```
RelationalSyncWorker
  ├── ElectricSQL subscription on AFP messages WHERE metadata->>'store_in_relational' = 'true'
  ├── For each new qualifying message:
  │     └── extract typed fields from metadata
  │     └── upsert into the appropriate relational table (receipts, contacts, calendar_events, etc.)
  └── Keeps relational views as derived, disposable data — source of truth remains AFP
```

**Delegated scope:** read-only on AFP messages; write access to designated relational tables only.

**Guardrail:** sync operations are idempotent. If a relational upsert fails, it retries with exponential backoff up to 3 times, then creates a `sync_error` AFP message for observability — never silently discards.

---

## 4. Archive & Cold Storage Daemon

### Purpose
Checks `archive_after` or `expires_at` metadata flags on AFP messages and moves aged messages to MinIO cold storage, keeping lightweight index rows in Postgres for search.

### Behavior

```
ArchiveDaemon
  ├── Periodic scan (runs every 6 hours) for AFP messages WHERE:
  │     metadata->>'archive_after' < NOW()  OR  metadata->>'expires_at' < NOW()
  ├── For each qualifying message:
  │     └── upload encrypted ciphertext blob to MinIO (preserves E2EE — never decrypts)
  │     └── replace Postgres row with an archive index stub (keeps id, thread_id, type, timestamps, embedding vector)
  │     └── create AFP message type: archived_notice with reference to stub
  └── Cold retrieval: on user access to archived message, streaming download from MinIO, decrypt client-side
```

**Delegated scope:**
```
allowed_message_types: ["archived_notice", "daemon_heartbeat"]
```
Read access to AFP messages; write access to MinIO bucket only (scoped by tenant).

**Policy guardrail:** archived messages are never deleted without explicit user confirmation. The daemon only moves, never destroys.

---

## 5. Health & Maintenance Daemon

### Purpose
Runs during idle periods to maintain embedding quality, detect duplicates, trigger curator deep maintenance, and report system health back to the Master Agent.

### Behavior

```
HealthDaemon
  ├── Idle detection: triggers when system load < 20% for 5+ consecutive minutes
  ├── Tasks (executed in priority order):
  │     1. Embedding re-indexing (re-embed messages using latest model version)
  │     2. Duplicate detection (pgvector cosine > 0.97 → create merge_suggestion AFP message)
  │     3. Graph cleanup (remove dangling backlinks for deleted/archived messages)
  │     4. Trigger Knowledge Curator deep maintenance for the last 30 days
  │     5. Generate system health insight AFP message for Master Agent
  └── Heartbeat AFP message every 10 minutes with health metrics
```

**Delegated scope:**
```
allowed_message_types: [
  "merge_suggestion",
  "insight",
  "system_health",
  "daemon_heartbeat"
]
```

**Policy guardrails:**
- Never runs during active user sessions without consent
- CPU throttled to 25% max during maintenance window
- All maintenance actions are audited as AFP messages

---

## 6. Visual Agent Node Workflow Builder — Design Specification

### Overview
The Visual Workflow Builder in `solid-ui/src/components/WorkflowsView.tsx` is extended to support the daemon architecture natively. Users can:
- Drag daemon node types onto the canvas alongside ephemeral workflow nodes
- See daemon nodes visually distinguished (pulsing border, persistent badge)
- Wire daemon subscriptions as edge sources into regular workflow nodes
- Configure daemon policy directly from the node panel

### New Node Kinds (additions to PRIMITIVES)

| Kind | Role | Visual |
|---|---|---|
| `daemon` | Persistent background sub-agent | Purple pulsing border, infinity icon |
| `subscription` | ElectricSQL change-stream trigger | Sky blue, bolt icon |

### New Preset Kinds (additions to PRESETS)

| Preset | Template | Description |
|---|---|---|
| `knowledge_curator` | `daemon_loop` | Auto-curates backlinks, summaries, supertags |
| `email_gateway` | `daemon_loop` | IMAP/SMTP email gateway daemon |
| `relational_sync` | `daemon_loop` | Syncs AFP flags to Postgres tables |
| `archive_cold_storage` | `daemon_loop` | Moves aged messages to MinIO |
| `health_maintenance` | `daemon_loop` | Idle-period embedding and graph cleanup |

### New Subagent Template

A new `daemon_loop` template is added to `SubagentTemplateIdSchema`:

```
daemon_loop
  ├── subscription_slot   → accepts: trigger, subscription
  ├── analysis_slot       → accepts: agent, tool
  ├── write_slot          → accepts: transform, tool
  ├── policy_slot         → accepts: policy (required — every daemon needs a guardrail)
  └── heartbeat_slot      → accepts: tool (writes daemon_heartbeat AFP message)
```

### Visual Canvas Enhancements

#### Node Visual Treatment by Kind

| Kind | Border colour | Background | Icon glyph |
|---|---|---|---|
| `trigger` | Teal | `bg-teal-50` | ▶ |
| `agent` | Indigo | `bg-indigo-50` | ✦ |
| `daemon` | Violet (animated pulse) | `bg-violet-50` | ∞ |
| `subscription` | Sky | `bg-sky-50` | ⚡ |
| `condition` | Amber | `bg-amber-50` | ⟨⟩ |
| `transform` | Slate | `bg-slate-50` | ⇄ |
| `tool` | Emerald | `bg-emerald-50` | ⚙ |
| `delegation` | Cyan | `bg-cyan-50` | ↗ |
| `policy` | Rose | `bg-rose-50` | 🛡 |
| `approval` | Amber | `bg-amber-50` | ✓ |
| `merge` | Purple | `bg-purple-50` | ⊕ |
| `termination` | Gray | `bg-gray-100` | ■ |

#### Minimap
A collapsible minimap panel (bottom-right corner of canvas, 160×90px) renders a scaled-down view of the full graph so users can navigate large workflows. Viewport rectangle is drawn with a semi-transparent box. Clicking the minimap pans the canvas to the corresponding position.

#### Daemon Palette Section
The node palette sidebar gains a **Daemons** section above Presets, showing the five daemon presets as draggable tiles with their icons, descriptions, and policy-scope summaries.

#### Subscription Trigger in Trigger Picker
The trigger kind picker gains a new family: **subscription** with source kinds:
- `electric_sql_change` — fires on ElectricSQL shape change
- `afp_new_message` — fires when a new AFP message arrives matching a filter
- `afp_flag_set` — fires when a metadata flag transitions to true

### Policy & Guardrail Canvas Integration

Daemon nodes always require a connected `policy` node (enforced by workflow validation):
```
Error: Daemon node "<label>" must have an outbound edge to a policy node.
```

The compile step (`handleCompile`) checks that every daemon node in the graph has:
1. A `policy` node downstream or upstream
2. An `allowed_message_types` list in its policy config (non-empty)
3. A heartbeat slot connected to a `tool` node with `capability_id: daemon_heartbeat`

These checks are surfaced as AFP-contract gaps in the compiled manifest inspector.

---

## Database Tables (migration 0033)

```sql
-- Daemon registrations: one row per active daemon per user
CREATE TABLE daemon_registrations (
  daemon_id         TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES afp_accounts(user_id),
  daemon_kind       TEXT NOT NULL,  -- 'knowledge_curator' | 'email_gateway' | ...
  workflow_id       TEXT,           -- NULL for system daemons
  delegated_key_id  TEXT NOT NULL,
  allowed_message_types TEXT[] NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'active', -- 'active' | 'paused' | 'revoked'
  last_heartbeat_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at        TIMESTAMPTZ
);

-- Backlink graph: edges created by the Knowledge Curator
CREATE TABLE afp_backlinks (
  backlink_id  TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES afp_accounts(user_id),
  source_id    TEXT NOT NULL,  -- AFP message id
  target_id    TEXT NOT NULL,  -- AFP message id
  link_kind    TEXT NOT NULL,  -- 'semantic_similarity' | 'entity_overlap' | 'explicit_ref'
  similarity   REAL,
  entities     TEXT[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  curator_run_id TEXT
);
CREATE INDEX afp_backlinks_source_idx ON afp_backlinks(user_id, source_id);
CREATE INDEX afp_backlinks_target_idx ON afp_backlinks(user_id, target_id);

-- Knowledge cards: structured curator outputs
CREATE TABLE afp_knowledge_cards (
  card_id        TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES afp_accounts(user_id),
  source_id      TEXT NOT NULL,  -- AFP message id this card summarises
  summary        TEXT,
  supertags      TEXT[] NOT NULL DEFAULT '{}',
  entities       TEXT[] NOT NULL DEFAULT '{}',
  card_json      JSONB NOT NULL DEFAULT '{}',
  embedding      VECTOR(1536),
  model_version  TEXT NOT NULL DEFAULT 'unknown',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  curator_run_id TEXT
);
CREATE INDEX afp_knowledge_cards_source_idx ON afp_knowledge_cards(user_id, source_id);

-- Curator run audit: one row per curator processing event
CREATE TABLE curator_run_audit (
  run_id           TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES afp_accounts(user_id),
  daemon_id        TEXT NOT NULL REFERENCES daemon_registrations(daemon_id),
  source_message_id TEXT NOT NULL,
  backlinks_created INT NOT NULL DEFAULT 0,
  cards_created    INT NOT NULL DEFAULT 0,
  tokens_used      INT NOT NULL DEFAULT 0,
  duration_ms      INT,
  status           TEXT NOT NULL DEFAULT 'completed', -- 'completed' | 'failed' | 'skipped'
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Archive index: stub rows kept after cold-storage migration
CREATE TABLE afp_archive_index (
  message_id   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES afp_accounts(user_id),
  thread_id    TEXT NOT NULL,
  message_type TEXT NOT NULL,
  archived_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  minio_key    TEXT NOT NULL,
  embedding    VECTOR(1536),
  metadata_stub JSONB NOT NULL DEFAULT '{}'
);
```

---

## What Was Landed in This Phase

- Phase 11 design document (this file) capturing the full architecture in dependency order
- Migration 0033: daemon_registrations, afp_backlinks, afp_knowledge_cards, curator_run_audit, afp_archive_index
- `src/knowledge_curator.rs`: Knowledge Curator Rust event contract
- TypeScript SDK: `daemon` primitive node kind, `subscription` trigger family, `daemon_loop` template, five daemon presets
- `workflowGraphTypes.ts`: extended PRIMITIVES and PRESETS with daemon types, node colour registry, minimap types
- `WorkflowsView.tsx`: daemon node visual treatment, node icons by kind, minimap panel, daemon palette section, daemon validation checks in compile path

## Still Remaining After Phase 11 → Completed in Phase 12

See `OMNYID_PHASE_12_KNOWLEDGE_CURATOR_ENHANCED.md` for the full spec and what was implemented.

Phase 12 delivered (2026-04-15):
- Noise filter (`is_noise_message`) — OTP / newsletter / transactional skipping
- Token budget gate — Phase B (knowledge card) skipped when daily LLM usage ≥ 80%
- Per-message / per-thread backlink override (`backlink_override` AFP type in `message.rs`)
- `load_backlink_override()` in curator respects user chatbox overrides at highest priority
- `apply_supertag_definitions()` pulls user-authored keyword rules before LLM suggestion
- `GET /notes/backlinks/{message_id}` — backlink graph REST endpoint
- `POST /notes/{message_id}/backlink-override` — stores chatbox-parsed override as AFP message
- `GET /notes/supertags` — top-N supertag frequency for DashboardFeed filter and NoteView autocomplete
- `Db::list_top_supertags()` — db method backing the endpoint
- Migration 0037: `afp_supertag_definitions` table with GIN index on keywords
- `BacklinkOverrideContent`, `SupertagDefinitionContent`, `AFP_TYPE_BACKLINK_OVERRIDE`, `AFP_TYPE_SUPERTAG_DEFINITION` added to `message.rs`
- 7 new unit tests for noise filter (448 total passing)

## Phase 11 Runtime Closure Update

Implemented in the 2026-04-14 runtime pass:

- `src/daemon_registry.rs` now handles daemon registration bootstrap, lookup, revoke, and heartbeat inspection
- `src/curator_runtime.rs` now runs a live Knowledge Curator loop that backfills missing `knowledge_card` rows, performs pgvector similarity lookups on tenant AFP messages, and persists backlink updates plus curator audit rows
- `src/daemon_runtime.rs` now performs MinIO-backed archival when object storage is configured, with local filesystem fallback only when MinIO env is absent
- Health maintenance now performs real backlog re-index/backfill work, reciprocal backlink repair, pgvector duplicate detection, and emits maintenance insight AFP messages
- `solid-ui/src/components/DashboardFeed.tsx` now exposes a supertag filter for browsing `knowledge_card` output by tag
- `solid-ui/src/components/DaemonPanel.tsx` now exposes daemon inspection and revoke controls in Agent Settings

Closed from the earlier critical gap list:

- daemon lifecycle support
- actual curator processing loop
- pgvector similarity queries in daemon maintenance
- folder-rule-aware curator scope
- supertag suggestion/filter UI in the dashboard

## Validation Targets

- `cargo test --lib` should pass with all new tests in `knowledge_curator.rs`
- `npm run typecheck` in `typescript-sdk` should pass with new schema additions
- Workflow compile step should reject daemon nodes without a connected policy node
