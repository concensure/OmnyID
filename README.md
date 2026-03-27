# Omnyid - AFP v1 Reference Implementation

Omnyid is a private, self-hosted, agent-first personal workspace built around AFP v1:

- one signed, structured message model for email, notes, actions, and views
- one shared AFP thread history used by both the human inbox surface and the agent inbox code path
- direct agent-to-agent relay by Agent ID over AFP with end-to-end encryption by default
- a Rust homeserver with WebTransport-first public transport, WebSocket fallback, and internal gRPC
- Python and TypeScript SDKs with 1 to 3 line agent flows
- a config-driven UI that renders AFP threads as multiple views

The current Oracle preview deployment also includes:

- a protected `omnyid.com` homepage served from [docs](/c:/Users/ozans/Desktop/projects/Agenton/docs)
- email/password Agent ID creation
- Google OAuth popup sign-in
- a seeded private dashboard with test agents, messages, and logs

Important product boundary:

- agent-to-agent communication does not require Gmail, IMAP, or email routing
- Gmail and custom mailbox linking are optional human inbox bridges only
- Cloudflare Email Routing is only relevant if you want human email for `@omnyid.com` forwarded into a real mailbox such as Gmail

## Current Status

Phases 0.5 through 13 are now complete or have concrete implementation artifacts.

Phase 0.5 is complete and audited.

Phase 1 is complete:

- canonical AFP v1 schema frozen
- Rust backend passes `cargo check`
- Rust AFP contract tests pass
- Python and TypeScript SDKs converge on the same contract shape

Phase 2 and Phase 3 are complete:

- deterministic Ed25519 signing and verification landed
- signed ingress is enforced by default unless dev mode explicitly allows unsigned traffic
- a real `omnyid-envelope-v1` XChaCha20-Poly1305 content envelope now exists
- the Python SDK can encrypt before send and decrypt after fetch when `OMNYID_ENCRYPTION_KEY_HEX` is configured
- the TypeScript SDK can now sign, encrypt before send, and decrypt after fetch using the same env conventions
- both SDKs now support recipient-wrapped content keys when peer public keys are known
- AgentCards can now be signed by the homeserver and verified by SDK discovery helpers
- inbound SMTP-to-AFP conversion can now sign and encrypt generated messages when Omnyid keys are configured
- standard self-host deployment defaults now require signed and encrypted traffic
- encrypted messages now avoid plaintext storage by default when a supported encryption envelope is present
- the homeserver now exposes `/healthz` and `/readyz`, and message persistence is idempotent on replay
- the backend now uses a tracked embedded migration baseline aligned with Docker bootstrap
- the homeserver now exposes `/metricsz` with non-plaintext operational counters
- the server and outbound gateway now emit metadata-only tracing spans for transport and delivery flows
- the same AFP thread can now safely carry human-ingested email and agent-emitted follow-up history
- the homeserver now exposes a bidirectional realtime relay path at `/relay/ws`
- both SDKs now expose relay subscription helpers, thread-scoped subscriptions, and WebSocket send with HTTP fallback
- the TypeScript SDK now includes WebTransport-first transport planning with WebSocket and HTTP fallback
- the TypeScript SDK now also exposes a WebTransport-capable `openThreadSubscription(...)` realtime helper with WebSocket fallback
- the Python SDK now follows the same transport-capability policy and includes a real `aioquic`-backed WebTransport send path plus transport-aware thread watching
- the homeserver now exposes a real WebTransport relay listener backed by QUIC when cert and key paths are configured
- the repo now includes a built-in development certificate generator for WebTransport bootstrapping
- internal gRPC is now disabled by default and intended only for private service use
- mail sync is now modeled as OAuth-first for Gmail/Outlook with custom IMAP credentials only as fallback
- mail sync now persists checkpoint/status state so the gateway can evolve toward restart-safe provider workers
- Gmail inbound sync now uses the real Gmail API to list recent message ids, fetch raw RFC822 payloads, convert them into AFP messages, and persist checkpointed progress
- custom-domain inbound sync now performs real IMAP inbox fetches with checkpointed UID tracking before converting raw RFC822 payloads into AFP messages
- inbound email replies now preserve SMTP threading hints and can rejoin existing AFP threads on ingest
- outbound AFP email intents now flow through a shared provider-aware gateway dispatch path after durable message storage
- outbound Gmail delivery now uses real OAuth token exchange plus Gmail API send, and custom-domain fallback now uses real SMTP delivery via `lettre`

Phase 4 is complete:

- Agent ID parsing now exists across Rust, Python, and TypeScript surfaces
- a working Agent ID spec now exists in `OMNYID_AGENT_ID_SPEC.md`
- AgentCard verification now rejects malformed Agent IDs
- AgentCards now carry rotation-oriented `key_id` metadata
- SDK discovery now requires valid rotation metadata on AgentCards
- `/.well-known/afp-delegation` is now env-backed instead of hardcoded
- both SDKs now follow delegated discovery before resolving `agent-card`, while preserving requested-domain authority
- both SDKs now support explicit discovery trust modes, defaulting to `strict`
- the Caddy and discovery deployment baseline is now templated and documented

Phases 5 through 7 are complete:

- Phase 5: shared-thread reply flow across the outbound gateway and both SDKs; RFC-aware inbound parsing and durable outbound delivery receipts
- Phase 6: SDK examples demonstrate reply, shared-thread fetch, and verified discovery
- Phase 7: typed UI thread surface and renderer-oriented workspace shell; realtime relay refresh; metadata-first encrypted attachment previews; Solid-based unified app shell in `solid-ui`

Phase 8 is complete:

- integration capability and action audit contract in `src/integration.rs`
- approval queue for risky agent actions persisted back into AFP thread history via `/actions/decision`
- risky outbound email actions gated behind approval
- signed API request framework in `src/gateway/rest_adapter.rs`: Ed25519-signed `X-Agent-Id`, `X-Agent-Timestamp`, `X-Agent-Signature` headers on every outbound HTTP/GraphQL call
- `POST /actions/execute` endpoint validates `ApprovalMode`, executes the action, and stores intent and result AFP audit messages in-thread
- `execute_capability()` SDK helper available in Python and TypeScript SDKs

Phase 9 has the server-side shape contract complete; client-side ElectricSQL wiring is the remaining step:

- sync slice, conflict mode, and device bootstrap contract in `src/local_sync.rs`
- `GET /sync/shapes` returns `SliceShapeDescriptor` items (table + where clause) clients use to configure their Electric subscriptions
- `GET /sync/bootstrap` returns a full device bootstrap bundle including sync endpoint
- per-device sync policy registry persisted in Postgres; dashboard generates downloadable bootstrap bundles for desktop, mobile, and watch
- **instant edge updates require wiring an Electric server into the Docker stack and adding client-side PGLite subscription — that step is not yet complete**

Phase 10 is complete:

- personalization event, LoRA artifact, and weekly local training contract in `src/personalization.rs`
- `POST /personalization/event` stores feedback signals (approved, rejected, edited, ignored) per-agent
- `GET /personalization/stats` returns signal counts and active LoRA artifact ID for training-readiness checks
- LoRA training job runs locally on user-owned data only; no plaintext leaves the device

Phase 11 is complete:

- `scripts/omnyid-backup.sh`: pg_dump + gzip + MinIO mirror + manifest + 30-day retention prune
- `scripts/omnyid-restore.sh`: drop/recreate DB + pg_restore from MinIO archive
- `scripts/omnyid-upgrade.sh`: backup → pull → build → restart → healthcheck loop
- `docker-compose.oracle.minimal.yml` includes a `backup` service on a daily 02:00 UTC cron

Phase 12 is complete:

- `postgres/migrations/0016_billing.sql`: `billing_subscriptions` and `billing_events` tables
- `POST /billing/webhook`: HMAC-SHA256 Stripe signature verification, idempotent event recording, subscription upsert
- `GET /billing/status`: returns current plan and status for an account
- billing event storage is idempotent via `UNIQUE (stripe_event_id)` to safely absorb Stripe retries

Phase 13 is complete:

- `.github/workflows/ci.yml`: four-job CI pipeline — `rust` (fmt + clippy + test), `typescript-sdk` (typecheck), `solid-ui` (build), `audit` (cargo-audit)
- 8 exhaustive property-style parse tests for the relay protocol in `src/relay.rs`
- 112 unit tests passing across all modules

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
- the project-local SDK environment lives at [python-sdk/.venv](/c:/Users/ozans/Desktop/projects/Agenton/python-sdk/.venv)
- the bootstrap script is [setup-python-sdk.ps1](/c:/Users/ozans/Desktop/projects/Agenton/scripts/setup-python-sdk.ps1)

## Consumer Privacy Onboarding

- privacy/product strategy: [OMNYID_CONSUMER_PRIVACY_STRATEGY.md](/c:/Users/ozans/Desktop/projects/Agenton/OMNYID_CONSUMER_PRIVACY_STRATEGY.md)
- Windows local/BYOC installer wizard: [install-omnyid-private.ps1](/c:/Users/ozans/Desktop/projects/Agenton/scripts/install-omnyid-private.ps1)
- macOS/Linux local/BYOC installer wizard: [install-omnyid-private.sh](/c:/Users/ozans/Desktop/projects/Agenton/scripts/install-omnyid-private.sh)
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
- a new Solid-based unified app shell now lives in [solid-ui](/C:/Users/ozans/Desktop/projects/Agenton/solid-ui), with a glass-panel search, dashboard, and Python runner experience instead of only the landing-page control surface
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
