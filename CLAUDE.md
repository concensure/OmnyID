# OmnyID — Claude Code Harness

This file is the authoritative development harness for the OmnyID project.
It overrides any generic Claude defaults and is read at the start of every session.

---

## Shared Project State (Claude + Codex)

Claude and Codex work from the same agent session protocol and `.agent/`
project ledger. Before doing any non-trivial work:

1. Read `AGENTS.md`.
2. Read `.agent/PROJECT_STATE.md` for concise current facts and the authority map.
3. Read `.agent/TASKS.yaml` for task lifecycle, owner, branch, dependencies,
   file scope, and acceptance criteria.
4. Read `.agent/DECISIONS.md` for durable architecture and coordination decisions.
5. Read `.agent/HANDOFF.md` for agent commentary and session handoff notes.
6. Inspect git status, recent git log, relevant other-agent commits,
   CI/build/deployment status where available, and file ownership overlap.

Build, test, staging, deployment, and production health status are
machine-owned. Do not manually write `Build: PASS`, `Tests: PASS`,
`Staging: PASS`, or `Production: HEALTHY` into project-state docs; read those
from GitHub Actions, GitHub Checks, GitHub Deployments/environments, or runtime
monitoring.

---

## Project Overview

OmnyID is a privacy-first, local-first, agent-native personal workspace built on AFP v1.
Three active sub-projects live in this monorepo:

| Sub-project | Path | Language | Role |
|---|---|---|---|
| Homeserver | `src/` + `Cargo.toml` | Rust | AFP relay, crypto, gRPC, WebTransport |
| Dashboard | `solid-ui/` | SolidJS + TypeScript | User-facing dashboard UI |
| TypeScript SDK | `typescript-sdk/src/` | TypeScript | AFP message authoring + agent flows |

Supporting directories: `postgres/migrations/`, `proto/`, `python-sdk/`, `runtime-templates/`, `scripts/`.

---

## Non-Negotiable Principles (from README + DESIGN_SYSTEM.md)

These 12 principles govern every technical decision. Violating them is never acceptable:

1. **E2EE-First** — Encryption on sender device before transmission. Homeserver sees only ciphertext.
2. **Local-First** — ElectricSQL (PGlite) is the primary store. No unnecessary network round-trips.
3. **Agent-Native** — Design from the autonomous agent perspective. Humans are secondary users.
4. **Immutable / Append-Only** — The message log is never mutated. Use references, backlinks, or new messages.
5. **Atomic** — Every piece of data is a self-contained AFP message. No fragmented records.
6. **Declarative** — Agents express intent via AFP; the UI decides rendering.
7. **Extensible** — New capabilities via optional fields, subtypes, and views. Never break the schema.
8. **Interoperable** — AFP bridges to A2A, MCP, OpenAI function calling via thin adapters.
9. **Backward Compatible** — `afp-v1` is a contract. All new fields must be optional.
10. **User-Owned** — Core is open-source and self-hostable. No vendor lock-in.
11. **Performance-Aware** — Local-first + pgvector + thread-scoped queries. Keep P95 < 500ms.
12. **Minimal & Simple** — Fewer required fields, lower cognitive load. Fight scope creep.

---

## File & Code Rules (rule.md enforced)

- **Max 1000 lines per file** — refactor before exceeding; split into focused modules
- **No file rewrites** unless it is genuinely simpler than editing
- **No new files** unless they serve a clear, lasting purpose
- 2-space indent, 100-char line limit, no trailing whitespace
- `camelCase` for functions/variables, `PascalCase` for components/types, `UPPER_SNAKE_CASE` for constants
- Comments only for *why*, never *what* — code is self-documenting
- No dead code, no unused imports, no `console.log` left in
- Error messages must include: what failed, why, how to fix

---

## AFP Message Rules

These rules apply to every change touching AFP messages, schemas, or types:

- **Never add required fields** to `MessageSchema` (index.ts) — existing messages must always parse
- **Never mutate** an existing AFP message — write a new one with `parent_id` reference
- **branch_id present** → Knowledge Curator must skip re-indexing this message
- **ephemeral: true** → only valid when `workspace_id` is also set
- **merge_policy** default is `"dedup"` — never silently overwrite without explicit `"overwrite"`
- All new AFP message types must be added to the relevant daemon's `outbound_allowlist` policy

---

## Build & Verify Commands

Run these before declaring any task done. Use `/dev` skill for a guided checklist.

### TypeScript SDK
```bash
cd typescript-sdk && npx tsc --noEmit        # type-check only
```

### Solid-UI (Dashboard)
```bash
cd solid-ui && npx tsc --noEmit              # type-check
cd solid-ui && npm run build                 # production build — REQUIRED before deploy
```

### Rust Homeserver
```bash
cargo check                                  # fast syntax + type check
cargo test                                   # run tests
cargo build --release                        # full build (slow, use only when needed)
```

### Database
```bash
# Migrations are applied by the homeserver on startup via postgres/migrations/
# Naming: NNNN_description.sql  (four-digit zero-padded, snake_case)
# Next migration number: check postgres/migrations/ and increment
```

---

## Workflow: Making Changes

### Before writing any code
1. Read the relevant file(s) — never assume structure
2. Check if an existing abstraction already covers the need
3. Confirm the change is AFP-compatible (see AFP Message Rules above)

### Solid-UI changes
- Components live in `solid-ui/src/components/` — one primary export per file, max 1000 lines
- Shared types live in `solid-ui/src/lib/` — `api.ts` for API types, `workflowGraphTypes.ts` for canvas types
- Use existing CSS tokens from `tailwind.config.cjs` and `index.css` — do not invent new color values
- Design system tokens: `primary` (#31568e), `on-surface` (#1a1c1b), `outline` (#737781) — see `docs/DESIGN_SYSTEM.md`
- Wedding-surface components (WeddingVendorQuoteReplyCard and siblings) are exempt from CLAUDE.md's primary/on-surface/outline token restriction — they use a separate wedding brand, specified in `docs/DESIGN_SYSTEM.md` section 11: Deep Teal `#0F5F5A` primary, Warm Porcelain `#FAF7F2` page and button text, Ink Blue `#274B77` secondary, white cards with a `#E8E2D9` border and 8-12px radius (no pills). Tokens live in `tailwind.config.cjs`; the older rose/plum `wedding-accent` tokens are being migrated. Do not revert wedding colors back toward the blue primary tokens.
- Animations: use `view-enter`, `card-hover`, `glass-button`, `animate-fade-in`, `animate-slide-down`
- Glass surfaces: `.glass-surface` (main panels), `.glass-card` (inner cards)

### TypeScript SDK changes
- `typescript-sdk/src/index.ts` — AFP core message schema + crypto helpers (keep it the AFP contract)
- `typescript-sdk/src/workflows.ts` — all workflow/preset/blueprint/daemon definitions
- Adding a new preset: update `PresetNodeKindSchema`, `PRESETS`, `DEFAULT_PRESET_STARTER_BLUEPRINTS`, `PRESET_DEFAULT_TRIGGER_CONFIGS`, and `PRESET_KEYWORDS`
- Adding a new daemon: also update `DAEMON_PRESETS`, `DAEMON_PALETTE_ENTRIES` in `solid-ui/src/lib/workflowGraphTypes.ts`

### Rust homeserver changes
- `src/server/` — HTTP + WebTransport routing (axum)
- `src/db.rs` — all database queries (sqlx)
- `src/message.rs` — AFP message validation and storage
- `src/crypto.rs` — Ed25519 signing, ChaCha20-Poly1305 encryption
- New API endpoint: add route in `src/server/`, handler function, sqlx query, and migrate schema if needed
- New migration: `postgres/migrations/NNNN_description.sql` — always additive, never DROP without user confirmation

### New AFP message types
1. Define type string (e.g. `workspace_create`) — use `snake_case`
2. Add to relevant daemon `outbound_allowlist` in `workflows.ts`
3. Add to relevant `output_contract.allowed_types` in the blueprint
4. Add a renderer or handler in `solid-ui/src/components/ViewDispatcher.tsx` if the UI needs to show it

---

## Daemon Development Rules

Background daemons (Knowledge Curator, Email Gateway, etc.) follow strict rules:

- Every daemon **must** have a `policy` node with explicit `outbound_allowlist`
- Every daemon **must** have a `heartbeat_slot` emitting `daemon_heartbeat`
- Daemon blueprint total cost: `max_cost_cents ≤ 10` per trigger (curator), `0` for sync/archive
- `health_maintenance` and `knowledge_curator` are the only daemons that may write `branch_create`/`branch_merge`
- The Knowledge Curator skips any message where `branch_id` is set (prevents circular re-indexing)
- `backlink_update` messages must remain lightweight audit events. Backlink browsing/search should read from the derived graph index (`afp_backlinks` and optional in-memory `derived_graph` state), not by filtering raw AFP history
- Internal Master Agent chatter should default to `metadata.store: false` unless it materially affects replay, user trust, approval, or final outcome understanding

---

## Branch & Merge Rules (Ephemeral Workspace)

- `workspace_id` scopes a message to a copy-on-write workspace — never touches main log
- `ephemeral: true` = disposable on workspace TTL (only valid with `workspace_id`)
- `branch_id` = agent-driven branch — merged back via `branch_merge` + `validateBranchMerge()`
- **All three guardrails** must pass before `branch_merge`:
  1. Curator lock must be inactive
  2. `merge_policy: "manual"` → emit approval AFP message first
  3. `merge_policy: "dedup"` (default) → skip if identical content already in main thread

---

## Deployment (Oracle Cloud)

**Production host:** `152.67.110.187` (omnyid.com), SSH user `ubuntu`, key `~/.ssh/oracle-omnyid.key`
**Remote dir:** `/home/ubuntu/omnyid/`
**Compose file:** `docker-compose.oracle.minimal.yml`
**Env file:** `.env.oracle` (on server) — source of truth is `oracle-cloud.local.env` plus local `.secrets/` file-backed secret material in the project root

### Deploy checklist (always run in this order)
1. `cd solid-ui && npm run build` — build UI assets
2. `npx tsc --noEmit` (both `solid-ui/` and `typescript-sdk/`) — zero type errors
3. `cargo check` — Rust compiles cleanly
4. Run `/dev deploy` skill — syncs archive to Oracle and runs `docker compose up -d --build`

### Never deploy if
- `npm run build` fails
- Either `tsc --noEmit` has errors
- `cargo check` has errors
- A migration is pending but not yet applied on the server

### Recovering a broken deploy
```bash
ssh -i ~/.ssh/oracle-omnyid.key ubuntu@152.67.110.187
cd /home/ubuntu/omnyid
docker compose --env-file .env.oracle -f docker-compose.oracle.minimal.yml logs --tail=50
```

---

## Commit & PR Standards

- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`
- Max 50 chars for subject line
- One logical change per commit — no "misc fixes"
- Never commit `.env*`, `oracle-cloud.local.env`, `runpod.env`, `*.key`, or `.secrets/`
- Branch from `main`, PR back to `main`, squash merge

---

## What NOT to do

- Do not add `required` fields to AFP `MessageSchema` — breaks all existing clients
- Do not rewrite `WorkflowsView.tsx` — it is intentionally large and refactoring would break the canvas
- Do not use `!important` in CSS — use Tailwind utility specificity correctly
- Do not run `docker compose down -v` unless explicitly asked — it destroys data volumes
- Do not push to `main` without a build passing
- Do not invent new Tailwind color values — use the design system tokens
- Do not add a third-party npm package without confirming it saves > 100 lines
- Do not silence errors with empty catch blocks — log and rethrow with context
