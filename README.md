# Omnyid - AFP v1 Reference Implementation

Omnyid is a private, self-hosted, agent-native personal workspace built around AFP v1:

- one signed, structured message model for email, notes, actions, and views
- one shared AFP thread history used by both the human inbox surface and the agent inbox code path
- direct agent-to-agent relay by Agent ID over AFP with end-to-end encryption by default
- a Rust homeserver with WebTransport-first public transport, WebSocket fallback, and internal gRPC
- Python and TypeScript SDKs with 1 to 3 line agent flows
- a config-driven UI that renders AFP threads as multiple views

## Coordination

Every agent session starts with [AGENTS.md](AGENTS.md), then reads the
canonical `.agent/` project ledger:

- [.agent/PROJECT_STATE.md](.agent/PROJECT_STATE.md) keeps concise current facts and the authority map.
- [.agent/TASKS.yaml](.agent/TASKS.yaml) owns task lifecycle, owners, branches, dependencies, and file scopes.
- [.agent/DECISIONS.md](.agent/DECISIONS.md) records durable architecture decisions.
- [.agent/HANDOFF.md](.agent/HANDOFF.md) is for agent commentary and session handoff notes.

Build, test, deployment, and production health verdicts are machine-owned by
GitHub Actions, GitHub Checks, GitHub Deployments/environments, and runtime
monitoring. Agents should not hand-enter PASS or HEALTHY claims in project
state.

Design & Technical Principles of the OmnyID Project

Zero-Trust / E2EE-First
Encryption happens on the sender’s device before any message is transmitted or stored. Homeservers (even your own cloud instance) only ever see ciphertext. This is the single most important principle.

Local-First
The primary data store is ElectricSQL (Postgres + PGlite) running on the user’s own devices. Most operations (reading recent messages, running agents) happen locally without network round-trips.

Agent-Native / Agent-Centric
Every design decision starts from the perspective of autonomous agents with their own cryptographic Agent ID. Humans are secondary users of the same system.

Immutable / Append-Only
The message log is strictly append-only. Past messages cannot be altered or deleted. This provides perfect history and auditability. Backlink relationships are replayable from lightweight AFP `backlink_update` messages, but normal traversal and search use a separate derived graph index rather than scanning raw audit messages.

Atomic
Every piece of data, UI view, tool call, note, or email is a single self-contained AFP message. There are no separate tables or fragmented records.

Declarative
Agents describe intent and desired outcome (via AFP messages and the views array) rather than imperatively manipulating the UI or storage. The receiver (SolidJS dashboard) decides final rendering.

Extensible
The protocol uses a small set of required fields plus optional metadata, subtype, and views arrays. New capabilities can be added without breaking existing messages or clients.
Interoperable

AFP is designed to be bridged to other protocols (A2A, MCP, OpenAI function calling) via thin adapters. It does not require the world to adopt AFP exclusively.

Backward Compatible
The protocol is explicitly versioned (afp-v1). Future versions will maintain forward compatibility for all v1 messages. Optional fields ensure old clients can still read new messages.

User-Owned / Self-Hostable
The entire core (protocol, homeserver, SDKs) is open-source and runs completely on user-controlled hardware. No vendor lock-in is required.

Performance-Aware
Local-first design + thread-scoped queries + pgvector indexing + time-based partitioning ensure the system remains responsive even at billions of messages.

Minimal & Simple
The protocol and SDKs deliberately minimize required fields and cognitive load. Optional metadata keeps normal messages clean while allowing advanced features when needed.

These 12 principles are the foundation of every technical decision made in the project. They are not aspirational — they are actively enforced in the code, schemas, and SDKs that have already been published in the OmnyID repository.

## Rust hygiene boundary

The Rust repo currently uses a split quality boundary:

- correctness gate: `cargo check --quiet` plus `cargo test --lib`
- integration gate: `tests/api_flows.rs` runs separately when `TEST_DATABASE_URL` is set
- startup policy gate: production env-policy tests verify the homeserver refuses unsafe production flags and dev/default DB settings
- hygiene gate: no regression against the checked-in fmt/clippy baseline

The local scripts, artifact formats, and CI behavior are documented in [docs/RUST_HYGIENE.md](docs/RUST_HYGIENE.md).

## Production env contract

When the homeserver runs with `OMNYID_ENV=production` (or `APP_ENV`, `ENVIRONMENT`, `RUST_ENV`, `NODE_ENV` set to `production`/`prod`), startup now fails closed unless the deployment satisfies these minimum requirements:

- `DATABASE_URL` must be set to a non-default production database; dev defaults like `postgres://afp:afp@postgres:5432/afp` are rejected
- `OMNYID_ALLOW_INSECURE_UNSIGNED` must remain unset or false
- `OMNYID_ALLOW_PLAINTEXT_STORAGE` must remain unset or false
- `OMNYID_DELEGATION_MASTER_KEY_HEX` must be a real 32-byte hex key and cannot be the all-zeros placeholder
- `OMNYID_SESSION_SECRET` or `OMNYID_SESSION_SECRET_FILE` must be configured so session-backed auth and OAuth flows can boot safely
- file-backed secrets such as `OMNYID_SESSION_SECRET_FILE` must point to existing non-blank files; relative paths are resolved from the supplied env file directory during preflight
- if any Stripe self-serve billing env vars are present, production must also provide a valid Stripe secret key, webhook secret, Pro price id, and workspace return URL base
- simulator rollout flags must be valid booleans, and promotion/sampling cannot be enabled for a simulator surface that is explicitly disabled

This is a deployment safety boundary, not a feature flag. It exists to prevent a production environment from booting with local-dev security settings that would otherwise only fail later at runtime.

You can preflight the current shell env or a candidate env file before rollout:

- Bash: `bash scripts/startup-policy-check.sh`
- Bash with env file: `bash scripts/startup-policy-check.sh .env.production`
- PowerShell: `./scripts/startup-policy-check.ps1`
- PowerShell with env file: `./scripts/startup-policy-check.ps1 -EnvFile .env.production`
- Bash post-deploy verify: `bash scripts/verify-deployment.sh`
- PowerShell post-deploy verify: `./scripts/verify-deployment.ps1`
- PowerShell Oracle runtime-only stage: `./scripts/stage-oracle-runtime.ps1 -OutputDir C:\temp\omnyid-oracle-runtime`
- Bash local release rehearsal: `bash scripts/release-readiness.sh .env.production`
- PowerShell local release rehearsal: `./scripts/release-readiness.ps1 -EnvFile .env.production`
- Bash release rehearsal with artifact: `bash scripts/release-readiness.sh .env.production artifacts/release-readiness`
- PowerShell release rehearsal with artifact: `./scripts/release-readiness.ps1 -EnvFile .env.production -OutDir artifacts/release-readiness`
- Bash release rehearsal with backup verification: `bash scripts/release-readiness.sh .env.production artifacts/release-readiness /path/to/backup_dir`
- PowerShell release rehearsal with backup verification: `./scripts/release-readiness.ps1 -EnvFile .env.production -OutDir artifacts/release-readiness -BackupDir C:\path\to\backup_dir`
- Bash deployment rehearsal with live verify: `bash scripts/deployment-rehearsal.sh .env.production artifacts/deployment-rehearsal /path/to/backup_dir https://api.omnyid.example https://app.omnyid.example/workspace/`
- PowerShell deployment rehearsal with live verify: `./scripts/deployment-rehearsal.ps1 -EnvFile .env.production -OutDir artifacts/deployment-rehearsal -BackupDir C:\path\to\backup_dir -BaseUrl https://api.omnyid.example -WorkspaceUrl https://app.omnyid.example/workspace/`

The operator rollout procedure is documented in [docs/PRODUCTION_ROLLOUT_RUNBOOK.md](docs/PRODUCTION_ROLLOUT_RUNBOOK.md).

`release-readiness` now checks the full local stack:

- Rust backend correctness
- TypeScript SDK typecheck, build, and continuity export tests
- `solid-ui` typecheck, local-router tests, and production build
- production startup-policy preflight when an env file is supplied
- deployment-ops self-test and optional backup verification

Oracle packaging note:

- `scripts/stage-oracle-runtime.ps1` creates a runtime-only deployment tree for Oracle Cloud
- it stages runtime code, compose files, selected ops scripts, docs served by Caddy, and the small simulated-data fixture `benchmarks/sample.jsonl`
- it intentionally excludes local build output and residue such as `target`, `artifacts`, `training_data`, `.git`, `.dev-launch`, and SDK `node_modules`
- `scripts/deploy-oracle.ps1` now rewrites uploaded `*_FILE` env values onto container-visible `/run/secrets/...` paths and syncs the referenced local secret files into the remote `.secrets` directory automatically

Composio note:

- the TypeScript SDK path is valid, but production still depends on a real `COMPOSIO_API_KEY` or `COMPOSIO_API_KEY_FILE`
- `/readyz` treats a configured but invalid Composio key as not ready, and current official examples initialize `Composio` with an API key before `create(userId, ...)`

Operational readiness note:

- `/readyz` now fails closed on misconfigured Gmail OAuth, Composio, or Stripe self-serve billing
- Stripe self-serve readiness requires a valid `OMNYID_STRIPE_SECRET_KEY`, `OMNYID_STRIPE_WEBHOOK_SECRET`, a valid Pro price id, and a workspace return URL base such as `OMNYID_WORKSPACE_BASE_URL`

The current Oracle preview deployment also includes:

- a protected `omnyid.com` homepage served from [docs](/OmnyID/docs)
- email/password Agent ID creation
- Google OAuth popup sign-in
- a seeded private dashboard with test agents, messages, and logs

Important product boundary:

- agent-to-agent communication does not require Gmail, IMAP, or email routing
- Gmail and custom mailbox linking are optional human inbox bridges only


## Current Status

This README is not the authority for release, deployment, or production-health
verdicts. Use the root coordination files for human-readable project state and
the checked artifacts or external systems for operator verdicts:

- `artifacts/production-go-no-go-current/production-go-no-go.json`
- `artifacts/commercial-readiness-snapshot-current/commercial-readiness-snapshot.json`
- `artifacts/oracle-production-proof-current/oracle-production-proof.json`
- `artifacts/personalos-readiness-audit-current/personalos-readiness-audit.json`

For the current Oracle remediation flow and readiness commands, see:

- [docs/COMMERCIAL_READINESS_STATUS.md](docs/COMMERCIAL_READINESS_STATUS.md)
- [docs/PRODUCTION_ROLLOUT_RUNBOOK.md](docs/PRODUCTION_ROLLOUT_RUNBOOK.md)
- [Documents/deployment/OMNYID_ORACLE_DEPLOYMENT.md](Documents/deployment/OMNYID_ORACLE_DEPLOYMENT.md)

Implemented areas already present in the repo include:

- `.github/workflows/ci.yml`: four-job CI pipeline — `rust` (fmt + clippy + test), `typescript-sdk` (typecheck), `solid-ui` (build), `audit` (cargo-audit)
- 8 exhaustive property-style parse tests for the relay protocol in `src/relay.rs`

Knowledge Curator additions already present in the repo include:

- `GET /backlinks/graph?root={id}&depth={n}` — BFS multi-hop backlink graph traversal, depth clamped to 4; returns node set + edge list
- `POST /notes/supertags/install-defaults` — one-click install of 8 default supertag definitions (`#Work`, `#Personal`, `#Health`, `#Finance`, `#Travel`, `#Learning`, `#Ideas`, `#Urgent`)
- Real Ollama embedding model replaces placeholder `[0.1; 768]` in the Knowledge Curator pipeline; configure with `OLLAMA_URL` and `OLLAMA_EMBED_MODEL` env vars; defaults to `nomic-embed-text` at `127.0.0.1:11434`
- Calendar View Week and Day views added alongside the existing Month grid
- Calendar right sidebar wired to live backlinks API with direction, similarity score, and entity chips
- Voice note capture in the calendar event modal via Web Speech API live transcription

## Quick Start

```bash
docker compose up --build
```

## Dev Keys

```bash
powershell -ExecutionPolicy Bypass -File scripts/omnyid-dev-keys.ps1
```

Copy the generated values into your local `.env` or deployment environment so the default secure Omnyid posture has the keys it needs.

## WebTransport Dev Cert

```bash
powershell -ExecutionPolicy Bypass -File scripts/setup-webtransport-dev-cert.ps1
```

That generates gitignored development PEM files under `secrets/dev-webtransport` and prints the `OMNYID_WEBTRANSPORT_*` env vars needed to bring up the QUIC relay locally.

For Python local development, point `OMNYID_WEBTRANSPORT_CA_CERTS` at the generated certificate or set `OMNYID_WEBTRANSPORT_INSECURE=true` only in local-dev if you need to bypass certificate validation temporarily.

## Rust Check

```bash
cargo check
cargo test --lib
```

## Python SDK Demo

```bash
cd python-sdk
..\scripts\setup-python-sdk.ps1
.\.venv\Scripts\python.exe example.py
```

Python status:

- Python 3.14.3 is the pinned stable runtime
- the project-local SDK environment lives at [python-sdk/.venv](OmnyID/python-sdk/.venv)
- the bootstrap script is [setup-python-sdk.ps1](OmnyID/scripts/setup-python-sdk.ps1)

## Consumer Privacy Onboarding

- privacy/product strategy: [OMNYID_CONSUMER_PRIVACY_STRATEGY.md](/OMNYID_CONSUMER_PRIVACY_STRATEGY.md)
- Windows local/BYOC installer wizard: [install-omnyid-private.ps1](/OmnyID/scripts/install-omnyid-private.ps1)
- macOS/Linux local/BYOC installer wizard: [install-omnyid-private.sh](/OmnyID/scripts/install-omnyid-private.sh)
- dashboard onboarding bundle now provides a personalized plan, direct installer links, and a copyable install command after setup is saved
- private-cloud bundles now include provider-specific bootstrap files and deployment notes for Oracle Cloud, UpCloud, and OVHcloud
- support access is disabled by default and can only be granted as a temporary, user-initiated consent window from the dashboard
- support-consent history is visible in-product so users can audit when access was opened, expired, or revoked
- the dashboard now also supports self-service JSON export of account state, onboarding, support-consent state, runtime metadata, and recent AFP activity
- hosted Crew runtimes can now be explicitly destroyed from the dashboard, removing the hosted workspace under the managed runtime root instead of leaving orphaned state behind
- the dashboard now also offers a Coolify-friendly `Python runner + chat window` runtime path with bring-your-own API key support, separate from CrewAI and the still-unavailable OpenClaw track
- the hosted Python runner path is now a fuller v1 scaffold with sandbox/resource policy defaults, a prewired daily-use toolchain (`requests`, `beautifulsoup4`, `playwright`, `stripe`, `google-api-python-client`, `ollama`, `chromadb`, `duckdb`), runtime policy files, starter templates, and an in-runtime agent IDE surface for chat, traces, prompt history, replay, and review queue
- the public website now also exposes an anonymous `Python runner` trial with three template runs per 24 hours, ten turns per run, no persistence, and a direct upgrade handoff into signup or `Agent ID only`
- the hosted control plane now exposes `/runtime/runner-config` so signed-in Python runner workspaces can read and update model, tool, and channel policy without exposing runtime secrets
- the signed-in dashboard now includes a dedicated Python runner policy panel so users can tune model mode, enabled tools, and exposure channels from the control plane instead of editing the generated runtime files directly
- that Python runner policy panel now also supports starter-template defaults plus per-run token caps and daily/monthly spend caps, and syncs those changes back into the hosted runtime policy and agent profile files
- the control plane now also records metadata-only Python runner policy save events and shows recent policy history in-product, so users can audit hosted runner changes without exposing tenant secrets or runtime content
- the Python runner policy panel now also lets users configure the web tool allowlist directly, keeping generic HTTP access default-deny unless a workspace owner explicitly permits hostnames
- a new Solid-based unified app shell now lives in [solid-ui](/OmnyID/solid-ui), with a glass-panel search, dashboard, and Python runner experience instead of only the landing-page control surface
- the backend now also exposes `GET /runtime/workspace-files`, `GET/POST /runtime/workspace-file`, and `POST /ui/command` so the unified search bar can route Python-runner edit intents into a safe, per-user runner editor
- the Solid runner view can now load editable Python runner workspace files, save them through the homeserver, and apply review-required command-bar drafts into code before the user confirms the save
- the dashboard now also provides a downloadable FastAPI AFP service-adapter starter so universities and small businesses can wrap existing systems behind signed capability endpoints without rewriting their core portal or CRM
- the hosted preview now also exposes a self-service account deletion path that tears down the managed runtime, purges Agent-ID-scoped server history for that account, and requires explicit typed confirmation
- active hosted-account sessions are now visible in the dashboard, with self-service revocation for stale sessions and a one-click “revoke other sessions” control

- hosted runtime backups are now exposed as metadata-only snapshots with visible retention policy, snapshot timing, expiry windows, manifest download, snapshot deletion, and restore-drill audit controls from the dashboard
- hosted runtime update policy is now exposed in-product, with explicit channels, scaffold-version checks, and manual scaffold refresh apply controls that avoid inspecting tenant runtime content
- the dashboard can now also export a metadata-only runtime recovery packet that combines deployment state, update policy, backup inventory, and restore-drill context into one local recovery handoff
- public auth/waitlist endpoints and high-impact hosted mutations now have first-pass in-memory rate limiting with `429` responses and a dedicated abuse-control metric
- the dashboard can now also generate device bootstrap bundles for desktop, mobile, and watch local-first clients, including sync-slice plans, PGlite targets, and local-key-material expectations for future ElectricSQL replication
- hosted accounts now also maintain a per-device sync policy registry so desktop, mobile, and watch clients can keep distinct `full`, `balanced`, or `lightweight` local-first slice boundaries instead of sharing one generic sync profile

Example local-first setup on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-omnyid-private.ps1 -Mode local -LaunchLocal
```

Example local-first setup on macOS/Linux:

```bash
bash scripts/install-omnyid-private.sh local
```

That script creates a per-user privacy bundle with:

- generated Agent ID
- Ed25519 signing key and public key
- encryption key
- isolated env file
- tenant manifest
- cloud-init scaffold for later BYOC hosting
- preflight machine or deployment report with rough install-time estimate
- a privacy posture that keeps support access off unless the user explicitly opens a short-lived support window

The installers are intentionally split by platform because local OpenClaw and CrewAI setup differs between Windows and macOS/Linux.

## Key Documents

- `CLOUDFLARE_EMAIL_ROUTING_SETUP.md`
- `OMNYID_TASKS.md`
- `OMNYID_PHASE_0_5_AUDIT.md`
- `OMNYID_PHASE_1_SCHEMA_FREEZE.md`
- `OMNYID_PHASE_2_CRYPTO.md`
- `OMNYID_PHASE_3_HOMESERVER_STORAGE.md`
- `OMNYID_PHASE_4_IDENTITY_DISCOVERY.md`
- `OMNYID_PHASE_5_EMAIL_GATEWAY.md`
- `OMNYID_PHASE_6_SDK_STABILIZATION.md`
- `OMNYID_PHASE_7_UI_FOUNDATION.md`
- `OMNYID_PHASE_8_ACTION_FRAMEWORK.md`
- `OMNYID_PHASE_9_ELECTRICSQL_SYNC.md`
- `OMNYID_PHASE_10_PERSONALIZATION.md`
- `OMNYID_AGENT_ID_SPEC.md`
- `OMNYID_DISCOVERY_DEPLOYMENT.md`
- `OMNYID_CLOUD_SETUP_NOTES.md`
- `OMNYID_ORACLE_DEPLOYMENT.md`
- `OMNYID_MACOS_VALIDATION.md`
- `OMNYID_WEBTRANSPORT_DEPLOYMENT.md`
- `OMNYID_PRODUCTION_DECISIONS.md`
- `OMNYID_STACK_VERSIONS.md`
