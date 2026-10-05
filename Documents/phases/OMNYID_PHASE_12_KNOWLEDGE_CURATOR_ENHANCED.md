# OmnyID Phase 12: Enhanced Knowledge Curator — Autonomous, Scoped, Token-Efficient

## Status: Partially implemented — 2026-04-15

**Implemented in this session:**
- Item 2b (tiered pipeline): noise filter, token budget gate, per-message backlink override wired into `process_source_message`
- Item 3 (folder rules): already present from Phase 11 runtime; `load_backlink_override()` adds the per-message layer above folder rules
- Item 4 (per-note control): `backlink_override` AFP type + `POST /notes/{message_id}/backlink-override` endpoint
- Item 6 (supertag suggestion): `apply_supertag_definitions()` applies user-authored keyword rules before LLM; `GET /notes/supertags` exposes top-N for UI
- Item 6c (custom supertag definition): migration 0037 adds `afp_supertag_definitions` table
- Backlink graph API: `GET /notes/backlinks/{message_id}`
- 7 new unit tests; 448 total passing

**Still remaining (Phase 13 scope):**
- Items 1, 5 (daemon registry, email gateway daemon): already complete from Phase 11 runtime
- Item 6b (supertag browsing strip in DashboardFeed): already present from Phase 11 runtime
- Item 7 (default taxonomy onboarding): one-click install UI + batch `supertag_definition` write
- Item 8 graph traversal: BFS multi-hop `/backlinks/graph?root=&depth=` endpoint
- Real embedding model in `summarizer.rs` (currently returns stub `[0.1; 768]`)
- LoRA personalisation from accept/reject `tag_update` feedback

## Purpose

Phase 11 established the schema, contract layer, and AFP message types for the Knowledge Curator daemon. Phase 12 wires it all together into a running system. The design principle is:

> **Autonomous by default. LLM only when it earns its cost. User always in control.**

This means the curator runs entirely without token burn for most backlink decisions (pure vector arithmetic), uses LLM calls only for summary/tag generation on substantive messages, and respects user-defined rules at every level without needing extra inference to interpret them.

---

## Dependency Map

Phase 12 builds directly on Phase 11 foundations. Do not start Phase 12 items until these Phase 11 items are confirmed present:

| Phase 11 artifact | Required by |
|---|---|
| Migration 0033 (`daemon_registrations`, `afp_backlinks`, `afp_knowledge_cards`) | All of Phase 12 |
| `src/knowledge_curator.rs` (types, `CuratorPolicy`, `BacklinkRecord`) | Items 1, 2, 3 |
| `src/policy_engine.rs` (existing) | Item 1 |
| `src/gateway/imap_sync.rs` (IMAP watcher) | Item 5 |

---

## Implementation Order

### Item 1 — Daemon Registry (`src/daemon_registry.rs`)

**What:** A lifecycle manager for all registered daemons. Handles spawn, revoke, heartbeat polling, and status queries. No daemon runs without being registered here first.

**API surface:**

```rust
pub async fn spawn_daemon(db: &Db, manifest: DaemonManifest) -> Result<DaemonRegistration>
pub async fn revoke_daemon(db: &Db, daemon_id: &str) -> Result<()>
pub async fn record_heartbeat(db: &Db, daemon_id: &str, metrics: DaemonHeartbeatMetrics) -> Result<()>
pub async fn get_active_daemons(db: &Db, user_id: &str) -> Result<Vec<DaemonRegistration>>
pub async fn daemon_health_check(db: &Db) -> Result<Vec<StaleHeartbeatWarning>>
```

**Bootstrap:** On server start, call `daemon_registry::ensure_system_daemons_registered()` which checks `daemon_registrations` for existing active daemons per user, spawning only the ones not already registered. This is idempotent.

**REST endpoints** (add to `src/server.rs`):
- `GET /daemons` — list active daemons for authenticated user
- `POST /daemons/{daemon_id}/revoke` — revoke a daemon (Master Agent only)
- `GET /daemons/{daemon_id}/heartbeat` — last heartbeat metrics

Implementation update (2026-04-15):
- These endpoints now exist in `src/server/mod.rs`
- The current UI surface for them lives in `solid-ui/src/components/DaemonPanel.tsx` inside Agent Settings

---

### Item 2 — Knowledge Curator Processing Loop

#### 2a. Trigger Subscription

The curator subscribes to the internal event bus already wired in `src/server.rs` (`internal_event_dispatcher_loop`). No new infrastructure needed — reuse `InternalEventKind::AfpNewMessage` as the trigger.

```rust
// In src/server.rs, extend internal_event_dispatcher_loop:
InternalEventKind::AfpNewMessage => {
    let msg_id = event.payload.get("message_id")...;
    knowledge_curator_state().lock().await
        .enqueue_trigger(CuratorTrigger::NewMessage { message_id: msg_id });
}
```

The curator processes its queue asynchronously in a background Tokio task. **No synchronous blocking of the message-insert path.**

#### 2b. Tiered Processing Pipeline

Every incoming AFP message goes through a two-phase pipeline. The key design goal: **most messages never hit the LLM at all**.

```
Phase A — Fast Lane (no LLM, < 50ms target)
  │
  ├── [FILTER] Message classification
  │     Skip if: type is daemon_heartbeat, sync_error, archived_notice
  │     Skip if: content matches noise fingerprint (newsletter, receipt, OTP, calendar invite)
  │     → Noise fingerprint = simple heuristics (sender pattern, subject keywords, message length < 80 chars)
  │
  ├── [EMBED] Compute embedding
  │     Check embedding cache (Postgres: afp_knowledge_cards WHERE source_id = msg_id)
  │     If cached and model_version matches current → reuse; else compute via inference.rs
  │
  ├── [SCOPE] Build search scope from folder_rules
  │     Read active folder_rule AFP message for msg.folder_id (cached in memory, TTL 5 min)
  │     Derive: allowed_folder_ids, required_tags, excluded_folder_ids, time_window_days
  │     Default scope: same folder + global + last 60 days
  │
  ├── [SEARCH] pgvector similarity query (scoped)
  │     SELECT source_id, similarity
  │     FROM afp_knowledge_cards
  │     WHERE user_id = $1
  │       AND folder_id = ANY($allowed_folders)
  │       AND created_at > NOW() - INTERVAL '$days days'
  │     ORDER BY embedding <=> $query_vec
  │     LIMIT 10
  │     → Returns candidates with cosine similarity scores
  │
  ├── [SCORE] Multi-signal scoring
  │     final_score = 0.6 * semantic_sim
  │                 + 0.25 * entity_overlap_jaccard
  │                 + 0.15 * thread_reference_bonus
  │     threshold = folder_rule.backlink_threshold ?? global_default (0.78)
  │
  └── [BACKLINK] Create backlink_update AFP messages for score >= threshold
        No LLM. Pure vector arithmetic + entity matching.
        Creates bidirectional backlink_update pair per match.
        Writes to afp_backlinks derived index.

Phase B — Slow Lane (LLM, only for substantive messages)
  │
  ├── [QUALIFY] Skip Phase B entirely if:
  │     - message already has a knowledge_card (idempotent check)
  │     - message length < 200 chars after stripping quoted text
  │     - message type is in [action_reply, action_forward] with no body delta
  │     - noise_score from Phase A filter > 0.7
  │
  ├── [SUPERTAG PREP] Before calling LLM, build context cheaply:
  │     1. Fetch user's top-50 most-used supertags from afp_knowledge_cards (cached, TTL 10 min)
  │     2. Check if any existing supertag rules (folder_rule.tag_suggestions) match current folder
  │     3. Build a short "existing taxonomy" string to include in prompt
  │     → This biases the LLM toward reusing known tags, cutting output variety
  │
  ├── [LLM CALL] Single, short structured prompt:
  │     Input: message body (truncated to 1200 tokens max), existing taxonomy hint
  │     Output schema: { summary: string, supertags: string[], entities: string[] }
  │     Model: fastest available (haiku-class); no chain-of-thought
  │     Max output tokens: 300
  │
  └── [CARD] Write knowledge_card AFP message with LLM output
        Store embedding alongside card for future similarity queries
        Update afp_knowledge_cards table
```

#### 2c. Micro-Batching

Emails from the same thread arriving within a 3-second window are deduped before triggering curator processing. Only the latest message in the burst is processed; earlier messages in the same burst are recorded as `already_covered_by` references pointing to the processed message.

Implementation: a small `HashMap<thread_id, (message_id, Instant)>` buffer inside the curator state.

#### 2d. Rate Limiting

Enforced against `CuratorPolicy`:
- Max 500 Phase A runs per hour per user (hard cap, returns `CuratorStatus::RateLimited`)
- Max LLM token budget per day: from `CuratorPolicy.max_tokens_per_day` (default: 50,000)
- If daily token budget is at 80%, Phase B is skipped until the next UTC day window
- Rate limit state is stored in `curator_run_audit` (query: `SUM(tokens_used) WHERE created_at > NOW() - INTERVAL '1 day'`)

---

### Item 3 — Folder Rules Enforcement

#### 3a. Reading Folder Rules

Folder rules are stored as AFP messages of type `folder_rule`. The curator reads them via a memory cache:

```rust
struct FolderRuleCache {
    rules: HashMap<String, (FolderRuleContent, Instant)>,  // folder_id → (rule, cached_at)
    ttl: Duration,  // 5 minutes
}
```

On cache miss: query AFP messages WHERE `type = 'folder_rule' AND metadata->>'folder_id' = $1 AND user_id = $2` ORDER BY created_at DESC LIMIT 1.

Implementation update (2026-04-15):
- The runtime currently applies folder rules deterministically from the latest `folder_rule` message
- `tag_suggestions` feed supertag suggestion
- `backlink_rules` currently supports practical string controls for backlink suppression (`do not link`, `never link`, `disable backlinks`, `suppress backlinks`) and threshold hints (`0.82`, `strict`, `loose`, `aggressive`)

#### 3b. Scope Computation

```rust
fn compute_search_scope(
    msg: &AfpMessage,
    rule: Option<&FolderRuleContent>,
    default_days: u32,
) -> SearchScope {
    let allowed_folders = rule
        .and_then(|r| r.backlink_scope_folders.as_ref())
        .cloned()
        .unwrap_or_else(|| vec![msg.folder_id.clone(), "global".into()]);

    let time_window_days = rule
        .and_then(|r| r.time_window_days)
        .unwrap_or(default_days);  // default_days from CuratorPolicy (30–90 range)

    let required_tags = rule
        .and_then(|r| r.required_backlink_tags.as_ref())
        .cloned()
        .unwrap_or_default();

    let excluded_folders = rule
        .and_then(|r| r.excluded_backlink_folders.as_ref())
        .cloned()
        .unwrap_or_default();

    SearchScope { allowed_folders, excluded_folders, required_tags, time_window_days }
}
```

The folder rule is applied at query time (SQL WHERE clause), not as a post-filter. This keeps the pgvector scan tight.

#### 3c. Creating Folder Rules (User-Facing)

**UI surface (add to `solid-ui/src/components/FolderSidebar.tsx`):**

Right-click on any folder → context menu → "Set Folder Rules". Opens a `FolderRulesPanel` slide-over with:
- Backlink scope: "Only within this folder" / "This folder + global" / "All folders" / "Custom…"
- Required tags filter (multi-select from existing supertags)
- Excluded folders (multi-select)
- Time window: 30 / 60 / 90 days slider
- Backlink confidence threshold: 0.65 / 0.75 / 0.85 slider
- Summary style: Auto / Bullets / Paragraph / None

Save writes a new `folder_rule` AFP message (append-only). The most recent one wins.

**REST endpoint:** `POST /folders/{folder_id}/rules` — accepts `FolderRuleContent`, wraps in AFP message, persists.

---

### Item 4 — Per-Note and Per-Thread Backlink Control

#### 4a. Per-Note Instructions via Chatbox

When a user types into the note/email chatbox, the Action Framework already handles the message. Add a new intent classifier for backlink instructions:

```
Patterns that trigger backlink override:
- "link this to ..."        → creates explicit backlink_rules AFP message
- "do not link this ..."    → creates suppression backlink_rules AFP message
- "connect this with ..."   → creates explicit backlink_rules AFP message
```

These are parsed by a regex pre-pass (no LLM needed for most cases):

```rust
fn try_parse_backlink_instruction(text: &str) -> Option<BacklinkInstruction> {
    let lower = text.to_lowercase();
    if lower.starts_with("link this to") || lower.starts_with("connect this") {
        Some(BacklinkInstruction::Explicit { target_hint: extract_target(text) })
    } else if lower.starts_with("do not link") || lower.starts_with("never link") {
        Some(BacklinkInstruction::Suppress)
    } else {
        None
    }
}
```

When a `BacklinkInstruction::Suppress` is stored as a `backlink_rules` AFP message, the curator checks it before writing any backlinks for that message — and skips entirely if found.

When `BacklinkInstruction::Explicit` is stored, the curator performs a targeted search for the hinted target (using entity extraction on the hint text + a scoped pgvector query) and creates the backlink regardless of confidence threshold.

#### 4b. Global / Thread-Level Override

A `backlink_rules` AFP message can be scoped to:
- A specific `thread_id` (highest priority, overrides folder rules)
- A `tag` (applies to all messages with that supertag)
- Global (user-level default)

**UI entry point:** In the thread view header or the note editing toolbar, a "Backlink Rules" button opens a `BacklinkRulesPanel` (similar to FolderRulesPanel but scoped to the thread).

**REST endpoint:** `POST /threads/{thread_id}/backlink-rules` — accepts `BacklinkRuleContent`, writes AFP message.

**Priority order (curator respects this strictly):**
1. Per-message `BacklinkInstruction` (chatbox override)
2. Per-thread `backlink_rules` AFP message
3. Folder-level `folder_rule`
4. Global user defaults from `CuratorPolicy`

---

### Item 5 — Email Gateway Promoted to Daemon

Wrap the existing workers in `src/gateway/` into the daemon lifecycle:

```rust
// src/gateway/mod.rs — add:
pub async fn start_email_gateway_daemon(
    db: Arc<Db>,
    registry: Arc<DaemonRegistry>,
    user_id: String,
) -> Result<()> {
    let reg = registry.spawn_daemon(&db, DaemonManifest {
        kind: DaemonKind::EmailGateway,
        user_id: user_id.clone(),
        allowed_message_types: vec![
            "email_incoming", "email_outgoing", "action_reply", "action_forward", "daemon_heartbeat"
        ],
        ..Default::default()
    }).await?;

    // Run existing workers under this daemon identity
    tokio::spawn(imap_sync_loop(db.clone(), reg.daemon_id.clone(), user_id.clone()));
    tokio::spawn(smtp_dispatch_loop(db.clone(), reg.daemon_id.clone(), user_id.clone()));
    tokio::spawn(heartbeat_loop(db.clone(), reg.daemon_id.clone(), Duration::from_secs(300)));

    Ok(())
}
```

**Trigger to curator:** After `imap_sync.rs` writes an `email_incoming` AFP message, it fires `InternalEventKind::AfpNewMessage` on the internal event bus. This is the hook that kicks Phase A of the curator pipeline.

---

### Item 6 — Supertag Suggestion UI

#### 6a. Supertag Pills in Note/Email View

In `solid-ui/src/components/NoteView.tsx` (and `EmailView.tsx`), add a supertag section below the message body:

```
[Suggested tags]  #Work  #ProjectX  #Decision  [+ Add your own]
```

- **Suggested tags** come from the associated `knowledge_card` AFP message (`metadata.supertags`)
- Each pill has two states: suggested (outline style) / accepted (filled style)
- Clicking a suggested pill accepts it and writes a `tag_update` AFP message
- "Dismiss" (✕) on a pill rejects the suggestion and writes a `tag_update` AFP message with `action: "reject"`
- "Add your own" opens an inline input with autocomplete from the user's existing supertag taxonomy

Accept/reject feedback is stored in `tag_update` AFP messages and consumed by the curator for LoRA personalisation tracking (Phase 13 scope).

#### 6b. Supertag Browsing in DashboardFeed

Add a supertag filter strip above the DashboardFeed message list:

```
All  |  #Work  #ProjectX  #Finance  #Health  ...  [+ New Supertag]
```

- Tags shown are the user's top-N by usage count (from `afp_knowledge_cards.supertags` frequency)
- Clicking a tag filters the feed to messages whose `knowledge_card` includes that supertag
- "+ New Supertag" opens a `NewSupertag` panel (see §6c)

**REST endpoint:** `GET /supertags?user_id={id}&limit=20` — returns tag frequency list.

#### 6c. Custom Supertag Definition

The "+ New Supertag" panel lets the user define a supertag with:
- **Name** (e.g. `#Finance`)
- **Auto-apply rules** (keyword list: if message contains "invoice", "budget", "price" → auto-apply)
- **Folder scope** (apply only within specific folders)

Saved as a new AFP message type `supertag_definition` (add to Phase 11 schema). The curator reads active `supertag_definition` messages on startup and applies them as pre-computed rules during Phase B supertag assignment — before calling the LLM.

**Migration addition** (append to 0033 or new 0036):
```sql
CREATE TABLE afp_supertag_definitions (
    definition_id  TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES afp_accounts(user_id),
    tag_name       TEXT NOT NULL,
    keywords       TEXT[] NOT NULL DEFAULT '{}',
    folder_scope   TEXT[] NOT NULL DEFAULT '{}',  -- empty = all folders
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    afp_message_id TEXT NOT NULL
);
CREATE INDEX afp_supertag_def_user_idx ON afp_supertag_definitions(user_id);
```

---

### Item 7 — Recommended Default Supertag Taxonomy

On first user login (or via Settings → "Set Up Knowledge Tags"), offer the default taxonomy as a one-click install:

**Core hierarchy (always available):**
- `#Work` / `#Personal` / `#Health` / `#Finance` / `#Travel` / `#Learning` / `#Projects`

**Universal sub-tags under each:**
- `#Action` / `#Decision` / `#Waiting` / `#Idea` / `#Reference`
- `#High` / `#Medium` / `#Low`
- `#2026` / `#Q2` (current year/quarter, auto-generated at onboarding)

Accepted taxonomy is written as a batch of `supertag_definition` AFP messages during onboarding. This seeds the curator's tag reuse bias immediately, so Phase B LLM calls will already have a rich existing taxonomy to suggest from on day one.

---

### Item 8 — Backlink Graph API

**New REST endpoints:**

```
GET  /threads/{thread_id}/backlinks          → list direct backlinks for a thread
GET  /messages/{message_id}/backlinks        → list backlinks for a specific message
GET  /backlinks/graph?root={message_id}&depth=2  → BFS traversal up to N hops
POST /messages/{message_id}/backlinks        → manually create a backlink (explicit_ref kind)
DELETE /backlinks/{backlink_id}              → soft-delete (sets status=removed, never hard deletes)
```

`GET /backlinks/graph` powers the knowledge graph visualisation in `KnowledgeGraphView.tsx`. It uses the `afp_backlinks` derived index for traversal — never scans raw `backlink_update` AFP history for graph queries.

---

## Token Budget Summary

| Operation | LLM tokens per message | Condition |
|---|---|---|
| Phase A (backlink only) | 0 | All substantive messages |
| Phase B (card + tags) | ~200–300 output tokens | Only for messages passing quality filter |
| Phase B skipped (noise) | 0 | Newsletters, OTPs, transactional receipts |
| Phase B skipped (budget) | 0 | Daily token budget > 80% consumed |
| Explicit target search | 0 | Regex-parsed chatbox instructions |
| Folder rule read | 0 | Cached in memory, TTL 5 min |

**Estimated steady-state burn:** for a typical user receiving 50 emails/day, assuming ~30% pass the quality filter into Phase B:
- Phase B calls: ~15/day × 250 tokens avg = **~3,750 tokens/day** (well within the 50K default cap)
- Phase A runs: ~50/day = **0 tokens**

---

## Validation Targets

- `cargo test --lib` passes with new tests in `daemon_registry.rs` and curator processing loop
- `npm run typecheck` in `solid-ui/` passes after FolderRulesPanel and supertag UI additions
- Integration test: email arrives → AFP message created → curator triggered → `afp_backlinks` row written within 500ms (Phase A only)
- Integration test: substantive email → `knowledge_card` AFP message written with non-empty `supertags`
- Integration test: folder rule suppressing cross-folder backlinks → no `afp_backlinks` rows outside allowed scope
- Integration test: chatbox "do not link this" → `backlink_rules` AFP written → curator skips backlink for that message

---

## What Was in Phase 11 (Already Done)

- Migration 0033: all tables exist
- `src/knowledge_curator.rs`: contract types, `CuratorPolicy`, `BacklinkRecord`
- TypeScript SDK: daemon node, subscription trigger, curator presets
- `WorkflowsView.tsx`: daemon visual treatment, policy validation
- Partial: `index_backlink_update()` in `src/server.rs` for writing to derived graph on message insert

## Still Remaining After Phase 12 (Phase 13 Scope)

- LoRA personalisation from accept/reject feedback on `tag_update` messages
- Archive daemon (`src/archive_daemon.rs`) with SeaweedFS integration
- Health daemon (`src/health_daemon.rs`) with idle detection
- Relational sync daemon promotion (`src/sync_worker.rs`)
- Deep maintenance insight generation (sliding 30-day window, `type: insight` messages)
- Merge suggestion approval flow in UI
- Minimap live rendering in workflow builder canvas
