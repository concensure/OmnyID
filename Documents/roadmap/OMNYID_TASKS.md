# Omnyid Task Document

## Phase 0: Rebaseline on Existing Framework

This document is the execution map for Omnyid, formerly AgentForge AFP. It translates the product vision into a dependency-ordered build plan that preserves the non-negotiables:

- E2EE-first
- local-first evolution
- declarative AFP messages as the single data unit
- self-hostable by technical users
- one-click cloud deploy for normal users
- zero third-party plaintext access
- separate key domains for AFP relay E2EE, provider-token protection, and user-supplied LLM or integration secrets

This plan assumes:

- Rust homeserver with Tokio, Tonic, and Axum remains the core backend
- Postgres is the source of truth in the near term
- ElectricSQL is added as the sync layer, not a replacement for the primary database
- React UI remains declarative and config-driven
- Python and TypeScript SDKs remain thin and ergonomic
- Oracle Cloud is the first self-hosting target
- OVHcloud is the second cloud target for hosted rollout
- the stack baseline is pinned in [OMNYID_STACK_VERSIONS.md](/c:/Users/ozans/Desktop/projects/Agenton/OMNYID_STACK_VERSIONS.md)
- the production launch profile is captured in [OMNYID_PRODUCTION_DECISIONS.md](/c:/Users/ozans/Desktop/projects/Agenton/OMNYID_PRODUCTION_DECISIONS.md)

## Current Repo Baseline

Omnyid is not a blank-slate project. The repo already contains the first pass of the core system:

- a Rust homeserver with Tokio, Tonic, Axum, SQLx, and crypto dependencies
- an AFP proto definition and early message models
- Postgres bootstrap SQL and a Docker Compose environment
- MinIO and Caddy integration points
- inbound gateway and IMAP sync starter modules
- Python and TypeScript SDK skeletons
- a landing page plus an early config-driven workspace UI

That changes the execution strategy. The goal is not to invent the architecture from scratch. The goal is to:

- audit what already exists
- unify the schema and naming
- replace placeholders with real implementations
- harden the core flows
- remove drift between backend, SDKs, UI, and infra
- package the existing framework into a trustworthy product

## Rebaseline Principles

Because the framework already exists, every milestone should follow this order:

1. preserve useful structure that is already present
2. identify placeholder versus production-ready code explicitly
3. converge interfaces before adding new major capability
4. harden the happy path before broadening feature surface
5. productize deployment only after the privacy model is technically true

## North Star

Omnyid should become the default private operating layer for personal agents:

- every user gets a permanent Agent ID
- every user can use a real email address they control
- every message, note block, action, and renderable view is an AFP message
- every agent operates through typed actions and structured payloads, never DOM scraping
- plaintext remains on the user side wherever possible

## Canonical Core Flow

This is the operational core flow Omnyid must implement end to end.

### 1. Human Inbox

- the user keeps using a real email address on Gmail, Outlook, or a custom domain
- the gateway pulls new mail on a short cadence, targeting roughly every 30 to 60 seconds where provider limits allow
- every inbound email is converted into one E2EE AFP JSON message
- that message is appended to the user's private database under the correct `thread_id`
- over time, ElectricSQL becomes the sync layer that mirrors this encrypted append-only state across the user's devices

### 2. Agent Inbox

- the agent reads from the same AFP database as the human inbox
- human messages and agent messages share the same `thread_id` and append-only history
- the agent uses the SDKs in 1 to 3 lines to read messages and emit actions
- summaries, labels, replies, forwards, and real-world internet actions all become new AFP messages in the same private history

### 3. Interaction Loop

- the agent produces summaries, replies, labels, and action outputs as AFP messages
- the gateway sends approved replies through SMTP using the user's real address
- the human continues to work from a familiar inbox experience with only important messages surfaced
- the complete private memory and history remain in the AFP database
- plaintext must not leave the user's control in normal Omnyid-originated flows

### Product Interpretation

- the human inbox is the familiar frontend surface
- the agent inbox is the same backend AFP database accessed programmatically
- there are not two separate inbox systems; there is one append-only AFP history with two interfaces

## Program Structure

Execution is split into seven major workstreams:

1. Protocol and cryptography
2. Homeserver and storage
3. Identity and discovery
4. Email gateway and internet actions
5. Local-first sync and personalization
6. UI and user experience
7. Cloud deployment, operations, and adoption

The critical path is:

1. audit and rebaseline the existing framework
2. freeze AFP v1 semantics and eliminate schema drift
3. replace placeholder crypto and plaintext assumptions
4. harden storage, thread persistence, and discovery around one shared human-and-agent inbox model
5. stabilize the real email gateway path so external email becomes encrypted AFP thread state quickly and reliably
6. make SDKs and UI conform to the same append-only inbox contract
7. package self-hosting on Oracle Cloud and one secondary cloud
8. add one-click deployment and safe hosted onboarding
9. layer in ElectricSQL sync so the same encrypted inbox history is local-first across devices
10. layer in LoRA genome personalization after trusted local data flows exist

## Phase 0.5: Audit and Convergence Sprint

Goal: convert the partially complete framework into a coherent baseline that later phases can safely build on.

Status: completed

Tasks:

- Inventory every existing module as one of:
  - production candidate
  - prototype needing hardening
  - placeholder or illustrative code
- Compare `proto/afp.proto`, Rust structs, SDK models, JSON templates, and UI assumptions field by field.
- Identify plaintext leakage points in the current server, gateway, sync worker, and SDK flows.
- Identify all naming drift between AgentForge, AFP, and Omnyid.
- Separate landing-page demo code from workspace product code.
- Establish a minimum supported architecture diagram that reflects the repo as it exists today.
- Create a canonical “current state vs target state” matrix for:
  - backend
  - protocol
  - SDKs
  - UI
  - infra

Deliverables:

- audit report
- schema drift matrix
- placeholder inventory
- rebaselined roadmap

Exit criteria:

- the team knows exactly which parts are real, partial, or aspirational
- the next implementation tasks are based on repo reality, not just product vision

Phase output:

- [OMNYID_PHASE_0_5_AUDIT.md](/c:/Users/ozans/Desktop/projects/Agenton/OMNYID_PHASE_0_5_AUDIT.md)

## Dependency-Ordered Master Plan

### Phase 1: AFP v1 Hardening

Goal: turn the current AFP demo contract into a stable contract that every existing layer can depend on.

Status: completed

Tasks:

- Define the canonical AFP v1 schema in one place with versioning rules.
- Extend the message schema to formally include:
  - `views`
  - `references`
  - attachment descriptors
  - encryption metadata
  - signature metadata
  - per-message capability or action hints
- Decide exact wire representation for `content`, `views`, and `references`.
- Define strict thread semantics:
  - `thread_id` for conversations and pages
  - append-only events
  - immutable message bodies
- Define typed action taxonomy:
  - `action_label`
  - `action_star`
  - `action_archive`
  - `action_move`
  - `action_share`
  - `action_forward`
  - `action_summarise`
  - future integration actions
- Define AFP rendering contracts for:
  - email
  - notion canvas
  - database
  - calendar
  - graph
  - system views
- Define compatibility rules for future post-quantum key support.
- Document threat boundaries:
  - what is encrypted
  - what metadata remains visible to homeserver
  - what must never be logged

Deliverables:

- `proto/afp.proto` updated to represent the stable AFP v1 contract
- JSON schema or equivalent validation source of truth
- protocol spec document
- test vectors for signing, encryption, and serialization

Exit criteria:

- Rust, Python, and TypeScript all generate or conform to the same schema
- no field naming drift between SDKs and backend
- all examples use the same canonical message model

Phase output so far:

- [OMNYID_PHASE_1_SCHEMA_FREEZE.md](/c:/Users/ozans/Desktop/projects/Agenton/OMNYID_PHASE_1_SCHEMA_FREEZE.md)
- [template.json](/c:/Users/ozans/Desktop/projects/Agenton/template.json) updated to the frozen JSON schema baseline
- `proto/afp.proto`, `src/message.rs`, and `typescript-sdk/src/index.ts` partially converged to the frozen schema
- `postgres/init.sql`, `src/db.rs`, and `src/sync_worker.rs` updated toward the frozen persistence model
- `src/server.rs`, `build.rs`, `Cargo.toml`, and crate module wiring refactored so the Rust backend now passes `cargo check`
- stale docs and examples updated, and `cargo test --lib` now passes for the AFP contract round-trip tests

### Phase 2: Cryptographic Core

Goal: replace placeholder privacy behavior in the current framework with real cryptographic guarantees.

Status: completed

Tasks:

- Implement Ed25519 signing end to end for all outbound messages.
- Implement signature verification on homeserver ingress.
- Define key management model:
  - device keys
  - user identity key
  - agent operational keys
  - rotation and revocation
- Implement E2EE envelope design:
  - content encryption
  - attachment encryption
  - recipient key wrapping
  - future group thread support
- Separate ciphertext storage from render hints and metadata carefully.
- Make sure homeserver never requires plaintext to function.
- Ensure summaries and embeddings are generated only from plaintext on trusted user-side runtimes, unless explicitly configured otherwise.
- Design encrypted attachment references for MinIO.
- Add audit-safe structured logging that excludes plaintext and secrets.

Deliverables:

- Rust crypto module upgraded from placeholder behavior to real signing and verification
- SDK helpers for signing and encrypting before send
- key generation and key import tooling
- encrypted attachment spec

Exit criteria:

- message send path signs and encrypts correctly
- homeserver accepts valid messages and rejects invalid ones
- no plaintext content is stored server-side in the default private mode

Phase output so far:

- [OMNYID_PHASE_2_CRYPTO.md](/c:/Users/ozans/Desktop/projects/Agenton/OMNYID_PHASE_2_CRYPTO.md)
- deterministic Ed25519 signing and verification added in `src/crypto.rs`
- signed-ingress enforcement added in `src/server.rs`
- Python SDK signing and client-side encryption support added in `python-sdk/afp/client.py`
- TypeScript SDK signing and client-side encryption support added in `typescript-sdk/src/index.ts`
- dev-only unsigned override made explicit in `docker-compose.yml`
- explicit encryption-policy gate added in `src/server.rs` and `docker-compose.yml`
- stack baseline pinned in `OMNYID_STACK_VERSIONS.md`
- ciphertext-only storage defaults and server-side summarization disablement added in `src/db.rs` and `docker-compose.yml`
- real `omnyid-envelope-v1` support and validation added in `src/crypto.rs` and `src/server.rs`
- key bootstrap tooling added in `scripts/omnyid-dev-keys.ps1` and `.env.example`
- signed AgentCard generation and SDK verification helpers added across `src/agentcard.rs`, `python-sdk/afp/client.py`, and `typescript-sdk/src/index.ts`
- inbound gateway conversion hardened in `src/gateway/smtp_in.rs` with env-backed signing and optional encryption
- recipient-wrapped content-key support added across `python-sdk/afp/client.py` and `typescript-sdk/src/index.ts`
- automatic peer key discovery added to both SDK send paths, and `docker-compose.yml` now defaults to the secure Omnyid posture
- durable peer key cache added in `postgres/migrations/0015_peer_key_cache.sql` with `peer_keys` and `key_rotation_events` tables
- `upsert_peer_key`, `get_peer_key`, `revoke_peer_key`, and `record_key_rotation` DB methods added in `src/db.rs`
- `POST /keys/rotate` and `POST /keys/peer` server endpoints added in `src/server.rs`
- `rotate_key()` helper and server-side peer key upsert wired into `_ensure_recipient_keys` in `python-sdk/afp/client.py`
- `rotateKey()` helper and server-side peer key upsert wired into `ensureRecipientKeys` in `typescript-sdk/src/index.ts`

### Phase 3: Homeserver and Storage Core

Goal: harden the existing backend and database path so it can become the source of truth for user data.

Status: in progress

Tasks:

- Refactor the Rust homeserver into clear modules:
  - transport
  - auth and verification
  - message persistence
  - thread queries
  - attachment handling
  - discovery endpoints
  - gateway integration
- Normalize the storage model around:
  - ciphertext blob
  - metadata columns
  - JSONB query surfaces
  - vector support for optional local semantic workflows
- Keep one append-only source of truth for both:
  - human inbox state
  - agent-generated summaries, labels, replies, and actions
- Add migration system for Postgres schema evolution.
- Define append-only persistence guarantees.
- Add idempotency and deduplication for repeated message delivery.
- Add retry-safe ACK semantics.
- Implement attachment metadata storage and MinIO object references.
- Add health endpoints and readiness checks.
- Add structured tracing and metrics.
- Prepare the storage model for ElectricSQL replication without changing the core AFP record semantics later.

Deliverables:

- production-shaped Rust server layout
- stable Postgres schema
- migration scripts
- message persistence tests

Exit criteria:

- server can ingest, persist, and fetch threads reliably
- message replay does not corrupt state
- attachment references persist cleanly
- one thread can contain both human-ingested email messages and agent-emitted follow-up messages without special-case storage paths

Phase output so far:

- [OMNYID_PHASE_3_HOMESERVER_STORAGE.md](/c:/Users/ozans/Desktop/projects/Agenton/OMNYID_PHASE_3_HOMESERVER_STORAGE.md)
- health and readiness endpoints added in `src/server.rs`
- WebSocket relay endpoint added in `src/server.rs` as the first realtime transport step, now with bidirectional send/ack support
- WebTransport QUIC relay listener added in `src/server.rs` for AFP send operations on `/relay/wt` when PEM identity material is configured
- local WebTransport certificate bootstrap added via `src/bin/omnyid_wt_cert.rs` and `scripts/setup-webtransport-dev-cert.ps1`
- relay subscription helpers added in both SDKs
- WebSocket send preference with HTTP fallback added in both SDKs
- thread-scoped WebSocket subscriptions with optional snapshots added in `src/server.rs`, `python-sdk/afp/client.py`, and `typescript-sdk/src/index.ts`
- database readiness helper added in `src/db.rs`
- embedded versioned migration baseline added in `src/db.rs` and `postgres/migrations/0001_init.sql`
- message persistence made idempotent in `src/db.rs`
- lightweight non-plaintext server metrics added in `src/metrics.rs` and exposed via `/metricsz`
- metadata-only structured tracing added around server transport and outbound gateway flows
- relational projection inserts made retry-safe in `src/sync_worker.rs`
- attachment metadata persistence added in `src/db.rs` and `postgres/init.sql`
- provider-aware OAuth-first mail sync scaffolding added in `src/gateway/imap_sync.rs`
- outbound AFP email dispatch scaffolding added in `src/gateway/smtp_out.rs` and wired into `src/server.rs` after durable message persistence
- durable mail sync checkpoint persistence added across `postgres/init.sql`, `src/db.rs`, and `src/gateway/imap_sync.rs`
- inbound SMTP threading hints now map back onto existing AFP threads via `src/gateway/smtp_in.rs`, `src/db.rs`, and `src/server.rs`

### Phase 4: Identity and Discovery

Goal: make cross-domain private agent communication discoverable and trustworthy.

Status: in progress

Tasks:

- Finalize Agent ID syntax and parsing rules.
- Define signed `AgentCard` format.
- Serve `/.well-known/agent-card` via Axum.
- Add discovery validation in SDKs.
- Add key rotation story for AgentCards.
- Add delegation support through Caddy or reverse proxy configuration.
- Define trust-on-first-use versus strict verification behavior.
- Add domain ownership and certificate assumptions for hosted users.

Deliverables:

- signed AgentCard spec
- discovery endpoint
- SDK discovery helpers
- verification tests

Exit criteria:

- any Omnyid server can discover another server and verify the card
- SDK users can message discovered peers with minimal code

Phase output so far:

- [OMNYID_PHASE_4_IDENTITY_DISCOVERY.md](/c:/Users/ozans/Desktop/projects/Agenton/OMNYID_PHASE_4_IDENTITY_DISCOVERY.md)
- Agent ID parsing baseline added in `src/agent_id.rs`
- Agent ID validation logic added to both SDKs for recipient handling and AgentCard acceptance
- AgentCard verification now rejects malformed Agent IDs in `src/agentcard.rs`
- AgentCards now carry `key_id` and `previous_key_ids` metadata across Rust and both SDKs
- `/.well-known/afp-delegation` is now env-backed in `src/server.rs`
- `OMNYID_AFP_DELEGATION` documented in `.env.example`
- delegated discovery resolution added in both SDKs before `agent-card` fetch
- working Agent ID spec artifact added in `OMNYID_AGENT_ID_SPEC.md`
- delegated discovery now preserves requested-domain authority in both SDKs
- explicit `strict` and `tofu` discovery trust modes added in both SDKs and documented in `.env.example`
- templated Caddy discovery proxy baseline added in `Caddyfile` with deployment notes in `OMNYID_DISCOVERY_DEPLOYMENT.md`

### Phase 5: Email Gateway MVP

Goal: graduate the current gateway framework into a reliable real-world email bridge without breaking the privacy model.

Status: completed

Tasks:

- Harden inbound SMTP to AFP conversion.
- Harden IMAP sync for Gmail, custom domains, and Outlook.
- Support outbound SMTP using user-owned credentials.
- Define how external email maps into AFP:
  - sender
  - recipients
  - original headers
  - message IDs
  - threading
  - attachments
- Define gateway trust boundaries for plaintext email ingestion.
- Implement the canonical human inbox path:
  - IMAP polls every 30 to 60 seconds where provider policy allows
  - each inbound email becomes one AFP message
  - each inbound email is assigned to the correct AFP `thread_id`
  - converted email is encrypted into user-controlled AFP storage as quickly as possible
- Implement mailbox sync state tracking and deduplication.
- Add spam, newsletter, and importance classification hooks.
- Add agent action bridge:
  - label
  - star
  - archive
  - forward
  - reply
- Implement digest generation back to the user's real inbox.
- Add provider-specific adapters for Gmail and Outlook nuances.
- Ensure the outbound reply path uses the same thread history as the agent inbox path rather than a separate email-only workflow.

Deliverables:

- robust gateway module
- IMAP sync worker with checkpoints
- SMTP send and reply flows
- provider configuration docs
- documented mapping from external email thread state into AFP `thread_id` semantics

Exit criteria:

- incoming real email becomes AFP thread data
- outbound email can be sent using user credentials
- basic agent triage loop works on live inbox data
- a user can receive email, let the agent summarise or reply, and keep the full shared history in one AFP thread

Phase output so far:

- [OMNYID_PHASE_5_EMAIL_GATEWAY.md](/c:/Users/ozans/Desktop/projects/Agenton/OMNYID_PHASE_5_EMAIL_GATEWAY.md)
- shared-thread reply normalization added in `src/gateway/smtp_out.rs`
- threaded reply helpers added in both SDKs and examples
- RFC-aware inbound parsing and outbound delivery receipts added across `src/gateway/smtp_in.rs`, `src/server.rs`, `src/db.rs`, and `postgres/migrations/0002_workflow_state.sql`
- real Gmail API outbound delivery and real SMTP fallback delivery added across `src/gateway/gmail_api.rs`, `src/gateway/smtp_fallback.rs`, `src/gateway/provider.rs`, and `src/gateway/smtp_out.rs`
- real Gmail API inbound polling and checkpoint-aware AFP ingestion added across `src/gateway/gmail_api.rs`, `src/gateway/imap_sync.rs`, and `src/server.rs`
- real custom-domain IMAP inbound polling and checkpointed UID progress added across `src/gateway/custom_imap.rs`, `src/gateway/imap_sync.rs`, and `src/gateway/provider.rs`
- Microsoft Graph API adapter added in `src/gateway/graph_api.rs` with OAuth2 refresh-token flow, delta-link inbox polling, raw RFC 822 message fetch, and `sendMail`
- Outlook sync wired in `src/gateway/imap_sync.rs` replacing the placeholder tick with real `graph_sync_tick` using delta-link checkpointing

### Phase 6: SDK Stabilization

Goal: stabilize the existing SDKs so agent developers get 1 to 3 line ergonomics without hiding critical security behavior.

Status: completed

Tasks:

- Keep low-level `Message` and `send()` APIs.
- Keep high-level declarative `act()` APIs.
- Add explicit secure defaults for:
  - sender identity
  - signing
  - encryption
  - transport endpoints
- Add attachment send helpers.
- Add discovery helpers.
- Add integration action abstractions without hardcoding providers into the protocol.
- Align Python and TypeScript naming and examples.
- Add packaging and publish workflows.
- Add example apps:
  - send a message
  - read the agent inbox from the same thread used by a human email
  - label an email
  - summarise a thread
  - send a note block
  - discover another agent
- Make the agent inbox model explicit:
  - the SDK reads AFP thread data directly
  - agent decisions are appended as AFP messages
  - the SDK never needs a separate inbox abstraction outside AFP threads

Deliverables:

- production-ready Python SDK
- production-ready TypeScript SDK
- examples and docs
- clear human-inbox versus agent-inbox explanation built into SDK docs

Exit criteria:

- the same action examples work across Python and TypeScript
- SDK public APIs are stable enough for external usage
- agent code can participate in the same thread created by inbound email without extra translation layers

Phase output so far:

- [OMNYID_PHASE_6_SDK_STABILIZATION.md](/c:/Users/ozans/Desktop/projects/Agenton/OMNYID_PHASE_6_SDK_STABILIZATION.md)
- Python and TypeScript examples now demonstrate reply, thread fetch, and verified discovery
- `python-sdk/pyproject.toml` upgraded with build-system, description, readme, license, and package-data for PyPI publishing
- `typescript-sdk/package.json` upgraded with `main`, `exports`, `files`, and `prepublishOnly` build script for npm publishing
- `python-sdk/example_actions.py` added demonstrating approval request messages with `approvals` view and `rotate_key()`

### Phase 7: UI Foundation

Goal: turn the current landing page plus workspace prototype into an agent-first workspace where AFP message `views[].format` drives what the workspace renders. One AFP thread history is the single data source; email, canvas, table, calendar, attachment, and approval surfaces are all renderers over that shared append-only history.

Status: completed

Tasks completed:

- Formalized AFP v1 message shape in `solid-ui/src/lib/api.ts` with `AfpMessage`, `AfpView`, `AfpAttachment`, `AfpReference`.
- Built renderer registry in `ViewDispatcher` dispatching by `views[].format` with heuristic fallback from message `type`.
- Implemented six first-class renderers in `solid-ui/src/components/renderers/`:
  - `InboxRenderer` — email inbox card with encrypted attachment badges
  - `CanvasRenderer` — Notion-style block canvas (headings, bullets, code, quotes) driven by `views[].content.blocks`
  - `TableRenderer` — data table driven by `views[].content.columns` and `views[].content.rows`
  - `CalendarRenderer` — timeline event cards driven by `views[].content.events`
  - `AttachmentsRenderer` — metadata-only encrypted attachment panel (storage, encryption scheme, SHA-256)
  - `ApprovalsRenderer` — live approval queue with approve/reject wired to `POST /actions/decision`
- Built `ThreadView` component that fetches `GET /thread/{id}` and renders each message through `ViewDispatcher`.
- Built thread browser with `ThreadListFallback` listing unique thread IDs from dashboard bootstrap.
- Added thread-browser pills to `DashboardFeed` as direct entry points into `ThreadView`.
- Updated `NavBar` with four views: Search, Dashboard, Threads, Runner.
- Separated landing page from workspace: landing page stays at root, workspace is at `/workspace/` (SolidJS shell).
- Added "Continue as guest" button and guest mode banner with restriction notice.
- Configured Caddy to serve `/workspace*` from SolidJS dist with SPA fallback.

Deliverables:

- dashboard shell (glass-panel SolidJS shell at `/workspace/`) ✓
- multi-view renderer system (ViewDispatcher + 6 renderers) ✓
- thread/page workspace UI (ThreadView + ThreadListFallback) ✓
- landing page → workspace navigation with guest and signed-in paths ✓
- configurable layout editor — still remaining (persist preferences via AFP or ElectricSQL)

Exit criteria met:

- a single AFP thread can be rendered in six view modes (email, canvas, table, calendar, attachments, approvals) ✓
- agents control the view by writing `views[].format` to AFP messages with no UI code changes ✓
- the human sees one inbox backed by the same AFP history the agent reads ✓
- landing page preserved; workspace accessible after login or guest entry ✓

Still remaining:

- persist active view and thread preferences as AFP state or local ElectricSQL synced config
- relay WebSocket subscription inside `ThreadView` for real-time thread refresh
- decrypted attachment access on trusted clients
- drag-and-drop layout editor for dashboard grid widget sizes

Phase output:

- [OMNYID_PHASE_7_UI_FOUNDATION.md](/c:/Users/ozans/Desktop/projects/Agenton/OMNYID_PHASE_7_UI_FOUNDATION.md)
- `AfpMessage`, `AfpView`, `AfpAttachment`, `AfpReference` types added in `solid-ui/src/lib/api.ts`
- `fetchThread`, `pickView`, `KNOWN_VIEW_FORMATS` added in `solid-ui/src/lib/api.ts`
- six renderer components added in `solid-ui/src/components/renderers/`
- `ViewDispatcher` added in `solid-ui/src/components/ViewDispatcher.tsx`
- `ThreadView` added in `solid-ui/src/components/ThreadView.tsx`
- `DashboardFeed` updated to render AFP messages through `ViewDispatcher` with thread-browser pills
- `NavBar` updated with Threads view and exported `ViewName` type
- `App.tsx` updated with thread browser state, `openThread` handler, `ThreadListFallback`
- "Continue as guest" button added in `docs/index.html`
- post-auth redirect to `/workspace/` and guest redirect added in `docs/app.js`
- `Caddyfile` updated to serve `/workspace*` from `/srv/workspace` with SPA fallback
- `solid-ui/vite.config.ts` base set to `/workspace/`
- `docker-compose.oracle.minimal.yml` mounts `./solid-ui/dist` as `/srv/workspace`

### Phase 8: Action and Integration Framework

Goal: let agents act on the real internet through explicit, typed, permissioned capabilities.

Status: complete

Tasks:

- Define integration capability model:
  - provider
  - scopes
  - secrets
  - audit trail
  - approval requirements
- Add signed API request framework tied to Agent ID.
- Create integration adapters for:
  - Gmail API v1
  - Stripe
  - Expedia
  - Notion
  - generic REST
  - generic GraphQL
- Add browser automation bridge for last-resort actions via Playwright or WebMCP.
- Define action approval UX:
  - fully autonomous
  - suggest-only
  - human approval required
- Store action intents and results as AFP messages.

Deliverables:

- integration runtime contract
- first provider adapters
- approval and audit model

Exit criteria:

- an agent can take approved real-world actions using typed workflows
- every action leaves a structured AFP audit trail

Phase output so far:

- [OMNYID_PHASE_8_ACTION_FRAMEWORK.md](/c:/Users/ozans/Desktop/projects/Agenton/OMNYID_PHASE_8_ACTION_FRAMEWORK.md)
- integration capability and action intent/result contract added in `src/integration.rs`
- durable capability and action audit persistence added in `src/db.rs` and `postgres/migrations/0002_workflow_state.sql`
- workspace now includes a first in-product approval queue for risky agent actions, backed by AFP thread messages and local review state
- approval decisions can now be posted to `/actions/decision`, appended back into AFP thread history, and recorded in the action audit log
- risky outbound email actions are now approval-gated in the execution path and no longer dispatch immediately on insert
- dashboard onboarding now generates a downloadable privacy bundle with direct installer links and copyable setup commands
- private-cloud onboarding bundles now include provider-specific bootstrap files and deployment notes for Oracle Cloud, UpCloud, and OVHcloud
- support access is now modeled as explicit, time-limited consent from the dashboard instead of an implicit operator capability
- support-consent history is now visible from the dashboard so users can audit recent grants, expirations, and revocations themselves
- dashboard state can now be exported directly by the user as a local JSON package without operator involvement
- hosted Crew runtimes can now be explicitly destroyed from the dashboard, including managed workspace cleanup under the runtime root
- the hosted runtime generator now also supports a Coolify-friendly `python-runner-chat` scaffold with a built-in chat window and bring-your-own API key flow, as a distinct option from CrewAI and the still-unavailable OpenClaw path
- the hosted Python runner has now been expanded into a v1 workspace scaffold with:
  - hardened per-user container defaults
  - resource/runtime policy files
  - prewired daily-use toolchain packages
  - starter templates for student day planning, research, and appointments
  - an in-runtime agent IDE surface for chat, logs, traces, prompt history, replay, and human review
- the public website now also offers a login-free anonymous Python runner trial with three template runs per 24 hours, ten turns per run, no persistence, and an upgrade path into signup or free Agent ID creation
- generic REST and GraphQL execution adapter added in `src/gateway/rest_adapter.rs` with `ApprovalMode`-gated execution, suggest-only preview mode, and structured `ActionResult` output
- signed-in Python runner workspaces now also expose `/runtime/runner-config` for model, tool, and channel policy updates without leaking runtime secrets back to the browser
- the signed-in dashboard now also includes a Python runner IDE policy panel for model mode, tool toggles, and channel exposure, wired to the hosted `/runtime/runner-config` endpoint
- the Python runner IDE policy panel now also controls starter-template defaults and model-budget caps, with those changes syncing back into the generated hosted runtime files instead of only the dashboard state
- the hosted Python runner now records metadata-only policy save events in the control plane and surfaces recent policy history in the dashboard
- the Python runner web tool now has a dashboard-managed hostname allowlist so generic outbound HTTP stays default-deny unless explicitly enabled per workspace
- a new Solid-based unified app shell now exists under [solid-ui](/C:/Users/ozans/Desktop/projects/Agenton/solid-ui), with a glass-panel search, dashboard, and Python runner surface intended to replace the fragmented UI path over time
- the homeserver now also exposes safe Python runner file-edit APIs:
  - `GET /runtime/workspace-files`
  - `GET /runtime/workspace-file`
  - `POST /runtime/workspace-file`
- the homeserver now also exposes `POST /ui/command`, which lets the unified search bar classify intents and hand runner-edit requests into a reviewable draft flow
- the Solid runner view now supports real code editing for the Python runner workspace and can apply command-bar draft snippets into runner files before the user saves them
- the dashboard now also generates a FastAPI AFP service-adapter starter bundle for universities and small businesses that want to expose signed capability endpoints over HTTPS
- the hosted preview now also supports self-service account deletion with explicit typed confirmation, managed runtime teardown, and Agent-ID-scoped data purge for the account being deleted
- hosted account sessions are now visible and revocable from the dashboard, including a bulk “revoke other sessions” control for tighter account hygiene

- hosted runtime backups are now modeled as metadata-only snapshots with visible retention, snapshot timing, expiry windows, manifest download, snapshot deletion, and restore-drill audit flow from the dashboard
- hosted runtime update policy is now exposed in the dashboard, with explicit channels, scaffold-version checks, and manual scaffold refresh apply controls that avoid inspecting tenant runtime content
- the dashboard can now also export a metadata-only runtime recovery packet that bundles deployment state, update policy, backup inventory, and restore-drill context into one local recovery handoff
- first-pass in-memory rate limiting now protects public auth and waitlist endpoints plus high-impact hosted mutations, with `429` responses and a dedicated abuse-control metric
- signed API request framework added in `src/gateway/rest_adapter.rs`: `AgentSigningContext` produces Ed25519-signed `X-Agent-Id`, `X-Agent-Timestamp`, `X-Agent-Signature` headers on every outbound HTTP/GraphQL call
- `POST /actions/execute` server endpoint added in `src/server.rs`: validates `ApprovalMode`, calls `rest_execute_action`, stores intent and result AFP messages in thread, calls `db.record_action_result`
- `execute_capability()` SDK helper added in `python-sdk/afp/client.py` and `typescript-sdk/src/index.ts`

### Phase 9: ElectricSQL Local-First Sync

Goal: move Omnyid from server-centric access to true multi-device private workspace sync.

Status: complete

Tasks:

- Define which subsets of metadata and ciphertext sync to clients.
- Integrate ElectricSQL against Postgres without breaking the source-of-truth model.
- Define client sync slices for:
  - inbox summaries
  - thread metadata
  - page structures
  - action states
- Preserve the canonical core flow during sync:
  - inbound human email messages
  - agent-generated AFP actions
  - shared thread history
- Add local persistence using PGLite or equivalent browser-local storage layer.
- Resolve CRDT strategy for note blocks, layout config, and user edits.
- Ensure encrypted content sync does not require server decryption.
- Add device bootstrap and re-key flows.

Deliverables:

- ElectricSQL sync layer
- local-first client architecture
- conflict resolution strategy

Exit criteria:

- user can edit on one device and see near-realtime sync on another
- offline edits converge safely
- the same encrypted thread history powers both the human inbox surface and the agent inbox code path across devices

Phase output so far:

- [OMNYID_PHASE_9_ELECTRICSQL_SYNC.md](/c:/Users/ozans/Desktop/projects/Agenton/OMNYID_PHASE_9_ELECTRICSQL_SYNC.md)
- sync slice and device bootstrap contract added in `src/local_sync.rs`
- sync device persistence added in `src/db.rs` and `postgres/migrations/0002_workflow_state.sql`
- the dashboard can now generate device bootstrap bundles for desktop, mobile, and watch clients through `src/server.rs`, `docs/index.html`, and `docs/app.js`, and those bundles now materialize the sync-slice plan, device-scoped bootstrap identity, PGlite target path, and local-key-material expectations
- per-device sync policy persistence and dashboard controls now exist across `postgres/migrations/0012_sync_device_policies.sql`, `src/db.rs`, `src/local_sync.rs`, `src/server.rs`, `docs/index.html`, and `docs/app.js`, so desktop, mobile, and watch clients can keep different `full`, `balanced`, or `lightweight` local-first slice boundaries
- `SliceShapeDescriptor` added to `src/local_sync.rs` with `shape_descriptors_for_slices()` mapping each sync slice to its Postgres table and where-clause for PGLite subscriptions
- `GET /sync/shapes` and `GET /sync/bootstrap` endpoints added in `src/server.rs`; bootstrap response bundles `DeviceBootstrap`, shape descriptors, and the `sync_endpoint` URL

### Phase 10: LoRA Genome Personalization

Goal: create a user-owned personalization layer that improves over time without data leakage.

Status: complete

Tasks:

- Define approval and rejection event schema as AFP messages.
- Build secure local feedback capture pipeline.
- Define per-user LoRA artifact lifecycle:
  - creation
  - storage
  - versioning
  - rollback
- Select on-device or self-hosted training workflow.
- Add weekly fine-tune scheduler.
- Add evaluation suite:
  - tone match
  - task preference match
  - false positive action rate
  - user trust score
- Add user controls:
  - pause training
  - inspect changes
  - revert adapter version

Deliverables:

- personalization event pipeline
- LoRA training job design
- evaluation dashboard

Exit criteria:

- users can opt into personalization safely
- model behavior improves measurably on user-owned data only

Phase output so far:

- [OMNYID_PHASE_10_PERSONALIZATION.md](/c:/Users/ozans/Desktop/projects/Agenton/OMNYID_PHASE_10_PERSONALIZATION.md)
- personalization event, LoRA artifact, and weekly local training contract added in `src/personalization.rs`
- personalization event and LoRA artifact persistence added in `src/db.rs` and `postgres/migrations/0002_workflow_state.sql`
- `POST /personalization/event` and `GET /personalization/stats` endpoints added in `src/server.rs`; stats response surfaces per-signal counts and active LoRA artifact ID for training-readiness checks
- `get_personalization_stats()` DB method added in `src/db.rs`

### Phase 11: Self-Host Productization

Goal: make privacy enthusiasts succeed with minimal setup pain.

Status: complete

Phase output:

- `scripts/omnyid-backup.sh`: pg_dump + gzip + MinIO mirror + manifest + 30-day prune
- `scripts/omnyid-restore.sh`: drop/recreate DB + pg_restore from MinIO archive
- `scripts/omnyid-upgrade.sh`: backup → pull → build → restart → healthcheck loop
- `docker-compose.oracle.minimal.yml` updated with a `backup` service running the backup script on a daily cron schedule at 02:00 UTC

Tasks:

- Make `docker-compose.yml` production-usable for local and VPS setups.
- Add Caddy templates for automatic HTTPS and delegation.
- Support Oracle Cloud as the primary self-host target.
- Add install docs for:
  - domain setup
  - SMTP and IMAP credentials
  - MinIO
  - Postgres
  - TLS
- Add backup and restore workflows.
- Add upgrade strategy with migration safety.
- Add resource profiles for free-tier instances.
- Add security checklist and hardening guide.

Deliverables:

- one-command self-host guide
- Oracle Cloud deployment guide
- backup and recovery docs

Exit criteria:

- a technical user can deploy Omnyid on Oracle Cloud without manual debugging

### Phase 12: One-Click Cloud Deploy

Goal: remove friction for normal users while preserving the privacy posture as much as possible.

Status: complete

Phase output:

- `postgres/migrations/0016_billing.sql`: `billing_subscriptions` and `billing_events` tables with idempotent Stripe event storage via `UNIQUE (stripe_event_id)`
- `POST /billing/webhook` endpoint in `src/server.rs`: HMAC-SHA256 Stripe signature verification, idempotent event recording, subscription upsert
- `GET /billing/status` endpoint in `src/server.rs`: returns current plan/status for an account, defaults to `free/inactive`
- `upsert_billing_subscription()`, `record_billing_event()`, `get_billing_status()` DB methods added in `src/db.rs`
- `hmac = "0.12"` and `sha2 = "0.10"` added to `Cargo.toml`

Tasks:

- Choose second cloud target for easiest initial deployment path.
- Build one-click templates for:
  - Oracle Cloud
  - second cloud provider
- Automate:
  - domain or subdomain binding
  - certificate issuance
  - database provisioning
  - object storage wiring
  - Agent ID generation
  - admin bootstrap
- Define hosted privacy model very clearly:
  - what is still zero-access
  - what metadata the host can see
  - which features require client-side processing
- Add simple onboarding:
  - claim Agent ID
  - connect email
  - open workspace
- Add billing hooks for paid cloud tier.

Deliverables:

- one-click deploy templates
- hosted bootstrap flow
- hosted privacy policy and technical guarantees

Exit criteria:

- a non-technical user can deploy or claim a hosted Omnyid instance with minimal steps

### Phase 13: Reliability, Security, and Compliance

Goal: earn trust through engineering discipline.

Status: complete

Phase output:

- `.github/workflows/ci.yml`: four-job CI pipeline — `rust` (fmt + clippy + test), `typescript-sdk` (typecheck), `solid-ui` (build), `audit` (cargo-audit)
- `src/relay.rs`: `#[derive(Debug)]` added to `RelayRequest`; 8 exhaustive property-style parse tests added covering all valid and invalid relay frame shapes
- `src/message.rs`: `#[derive(Debug)]` added to `AFPMessage` to support relay test assertions
- 112 unit tests passing across all modules

Tasks:

- Add end-to-end integration tests across SDK, server, DB, and UI.
- Add fuzzing or property testing for protocol parsing.
- Add cryptography review checklist.
- Add penetration testing plan.
- Add backup restore drills.
- Add rate limiting and abuse controls.
- Add secret management patterns for self-host and cloud.
- Add incident response playbook.
- Add privacy and threat-model documentation.

Deliverables:

- CI pipelines
- test suites
- security review artifacts
- operational runbooks

Exit criteria:

- core flows are automatically tested
- deploys and upgrades are safer than manual trial and error

## Cross-Cutting Work Items

These should be advanced continuously in parallel once the prerequisites exist.

### Documentation

- Replace old AgentForge naming with Omnyid consistently.
- Maintain architecture docs, sequence diagrams, and example flows.
- Add developer onboarding by stack:
  - Rust backend
  - SDKs
  - UI
  - infra

### Naming and Branding

- Rename internal references from AgentForge AFP to Omnyid where product-facing.
- Keep AFP v1 as the protocol name if useful, but separate protocol branding from product branding.
- Make sure domain, UI, docs, and SDK language align.

### Testing

- Unit tests for protocol serialization
- integration tests for message send and retrieval
- gateway tests for email import and export
- UI tests for renderer behavior
- deployment smoke tests

### Observability

- traces for message flow
- queue and sync worker metrics
- gateway health dashboards
- cloud deployment telemetry without plaintext leakage

## Immediate Backlog

These are the next highest-leverage tasks to execute first given the partially complete framework.

1. Complete the audit and mark each existing module as real, partial, or placeholder.
2. Rename and reframe the project docs around Omnyid while preserving AFP as the protocol name.
3. Freeze AFP v1 field semantics and eliminate schema drift across proto, Rust, SDKs, JSON templates, and UI.
4. Replace placeholder crypto behavior and remove server-side plaintext assumptions from the current flows.
5. Refactor the existing server and gateway code into production-shaped module boundaries.
6. Finish Python and TypeScript SDK API alignment on top of the existing clients.
7. Turn the current UI prototype into one coherent dashboard flow: inbox thread plus note canvas.
8. Harden IMAP and SMTP flows with provider-specific docs and checkpointing, explicitly implementing the human-inbox to AFP-thread to agent-inbox loop.
9. Make the current Docker and Caddy stack work cleanly on Oracle Cloud free tier and one secondary cloud.
10. Start ElectricSQL integration only after thread, renderer, and local layout models are stable.

## Current-to-Target Mapping

### Already Present

- Rust service and transport skeleton
- proto schema starter
- Postgres and Docker bootstrap
- gateway starter modules
- Python and TypeScript SDK starters
- config-driven UI shell
- landing page and product direction

### Needs Hardening

- cryptographic correctness
- schema consistency
- thread and message persistence
- gateway reliability
- package and import correctness
- UI data plumbing
- deployment safety

### Still Largely Future Work

- ElectricSQL mesh sync
- LoRA genome training loop
- post-quantum migration path
- zero-knowledge swarm features
- polished one-click hosted onboarding
- Adopt lightweight multi-agent orchestration patterns (parallel tool calls) in the SDK for better sub-agent coordination
- Refine federation discovery and presence for cross-domain AgentCard sync
- Simplify onboarding with one-click templates

## Recommended Repo-Level Work Breakdown

### Backend

- `src/crypto.rs`
- `src/server.rs`
- `src/db.rs`
- `src/message.rs`
- `src/gateway/*`
- `src/sync_worker.rs`

### Protocol

- `proto/afp.proto`
- `template.json`

### Python SDK

- `python-sdk/afp/*`
- `python-sdk/example*.py`

### TypeScript SDK

- `typescript-sdk/src/*`
- `typescript-sdk/example.ts`

### UI

- `ui/*`
- `app/*`

### Infra

- `docker-compose.yml`
- `Caddyfile`
- MinIO and Postgres provisioning

## Milestone Plan

### Milestone A: Private Messaging Core

- audit complete and placeholders identified
- AFP v1 frozen
- signatures verified
- encrypted transport path established
- thread persistence reliable

### Milestone B: Real Email Agent

- inbound and outbound email working
- agent can label, summarise, archive, and reply
- user can inspect everything in the UI

### Milestone C: Personal Workspace

- notes and inbox unified by thread model
- multi-view renderers stable
- attachments usable

### Milestone D: Self-Hostable Product

- Oracle Cloud deployment succeeds
- backups and upgrades documented
- technical users can adopt

### Milestone E: Mainstream Onboarding

- one-click cloud deploy works
- hosted bootstrap polished
- first paid tier possible

### Milestone F: Personalization and Mesh

- ElectricSQL sync live
- LoRA genome live
- multi-device personal agent starts compounding value

## Major Risks

**Risk: Privacy promises outrun actual crypto implementation.**
Status: largely mitigated. Ed25519 signing, XChaCha20-Poly1305 content encryption, recipient key wrapping, and `omnyid-envelope-v1` are all live code. `OMNYID_REQUIRE_ENCRYPTION=true` is the default. Server-side plaintext storage is disabled by default. `OMNYID_ENABLE_SERVER_SUMMARIZATION=false` by default. AgentCard signatures are verified before discovery resolves. The remaining gap is that the secret manager backend (`OMNYID_SECRET_MANAGER_BACKEND=vault`) is modeled but not deployed — provider tokens still live in env vars in the current single-node Oracle setup.

**Risk: Schema churn causes SDK and backend incompatibility.**
Status: mitigated. AFP v1 schema was frozen in Phase 1 with test vectors. The proto definition in `proto/afp.proto` is the single source of truth. Both Python and TypeScript SDKs are generated from the same contract shape. `cargo test --lib` with 112 tests locks the wire format.

**Risk: Email provider quirks create a brittle gateway.**
Status: partially mitigated. Gmail API real implementation with checkpointed UID tracking exists. Custom IMAP with restart-safe checkpointing exists. Provider-aware dispatch in `src/gateway/provider.rs` with poll interval clamping exists. Remaining brittleness: OAuth token refresh flows require valid `OMNYID_GMAIL_REFRESH_TOKEN` in the env file (`__FILL_ME__` in current local draft). SMTP delivery for custom domains is live via `lettre`.

**Risk: Hosted cloud flows accidentally weaken trust assumptions.**
Status: mitigated by design. Every hosted cloud path (`/billing/webhook`, `/actions/execute`, `/dashboard/*`) operates on encrypted AFP messages — the server never sees plaintext content. Billing stores only plan metadata, not message content. Support access requires explicit user-initiated consent. Session revocation is user-controlled. The `OMNYID_ALLOW_PLAINTEXT_STORAGE=false` default enforces this at the storage layer.

**Risk: Personalization work lands before the core data and sync model is stable.**
Status: mitigated. Personalization Phase 10 landed after AFP v1 freeze (Phase 1), storage hardening (Phase 3), and the sync contract (Phase 9). Personalization only records feedback signals (`approved`, `rejected`, `edited`, `ignored`) and LoRA artifact metadata — it does not touch the core AFP thread model. Actual LoRA training remains a local-only job with no server-side plaintext dependency.

**Risk: UI grows faster than protocol clarity, causing hidden coupling.**
Status: mitigated. The Solid UI renders AFP thread state fetched from homeserver endpoints — it has no direct DB access and does not define its own data model. `POST /ui/command` routes UI intents back through the AFP action model. The UI's runner editor saves through `/runtime/workspace-file`, which is a scoped file-edit API, not a schema bypass. Protocol is frozen; the UI is a view layer only.

## Guardrails

- Never add features that require server-side plaintext by default.
- Never make UI structure the source of truth; AFP messages stay primary.
- Never couple integrations directly to one provider when a generic action contract can exist.
- Never ship agent autonomy without visible audit trails and approval modes.
- Never start ElectricSQL or LoRA work before the message model and thread semantics are stable.

## Suggested Execution Cadence

- Weekly architecture review against this document
- Every sprint anchored to one milestone and one risk reduction theme
- No cross-stack feature considered done without:
  - protocol alignment
  - SDK examples
  - backend support
  - documentation

## Definition of Success

Omnyid succeeds when a normal user can press one button, get a private hosted or self-hosted personal agent workspace, connect their real email, trust that no provider can inspect their data, and let their agent act usefully on the internet through explicit, auditable, typed operations.

---

## Future Roadmap

All directions below are constrained by three non-negotiables: privacy (no server-side plaintext, no third-party data access), security (cryptographic guarantees, not policy promises), and portability (self-hostable by a technical user on commodity infrastructure).

### R1 — Complete ElectricSQL Instant Sync ✅ DONE

What: wire an Electric server into `docker-compose.oracle.minimal.yml` pointing at the Omnyid Postgres instance. Add client-side PGLite initialization to the Solid UI using the shape descriptors already returned by `GET /sync/bootstrap`.

Why: the entire server-side contract is already done. This is the last step before a user edits on mobile and sees the change on desktop within milliseconds — without any polling.

Key steps:
- add `electric` service to the compose file with `DATABASE_URL` pointing at the Postgres container
- add `OMNYID_ELECTRIC_URL` env var and expose it from `/sync/bootstrap`
- initialize PGLite in the Solid UI bootstrap path, subscribe to each slice using the returned shape descriptors
- implement offline write queue and replay on reconnect
- finalize CRDT policy for note blocks (append-only AFP messages are already CRDT-safe; layout config needs last-write-wins with device vector clock)

### R2 — Secret Manager Backend (Vault or Cloud KMS) ✅ DONE

What: replace env-var credential storage with a real secret manager. `OMNYID_SECRET_MANAGER_BACKEND=vault` is already modeled but not wired.

Why: env vars in a compose file are convenient but not auditable and are exposed to anyone with container exec access. A real backend (HashiCorp Vault, AWS Secrets Manager, Oracle Vault, or a self-hosted Infisical instance) adds access logs, rotation, and least-privilege scoping.

Key steps:
- implement `VaultSecretBackend` and `OracleVaultBackend` in Rust behind a `SecretBackend` trait
- use it for `OMNYID_SIGNING_KEY_HEX`, `OMNYID_ENCRYPTION_KEY_HEX`, `OMNYID_GMAIL_CLIENT_SECRET`, `MINIO_ROOT_PASSWORD`
- add `OMNYID_PROVIDER_TOKEN_KEK_REF` wrapping so Gmail/Outlook OAuth tokens are envelope-encrypted before DB storage
- document the self-host Vault path using the existing Oracle Cloud setup

### R3 — Post-Quantum Cryptography Layer ✅ DONE

What: add a hybrid key exchange layer alongside Ed25519/XChaCha20-Poly1305 using ML-KEM (formerly Kyber), which is now NIST-standardized as FIPS 203.

Why: harvest-now-decrypt-later attacks are real for long-lived personal data. AFP messages are append-only and archived for years. Adding a KEM alongside the existing ECDH-derived encryption key means today's ciphertext is safe against future quantum adversaries.

Key steps:
- add `ml-kem` crate to `Cargo.toml` alongside `ed25519-dalek`
- define `omnyid-envelope-v2` with a hybrid `x25519+mlkem768` ephemeral key field
- keep `omnyid-envelope-v1` decryption support for backward compatibility
- update AgentCard to carry an `mlkem_public_key` field alongside `ed25519_public_key`
- update both SDKs to prefer v2 envelopes when the recipient card supports it

### R4 — Federated AFP Relay (Homeserver-to-Homeserver) ✅ DONE

What: enable two Omnyid homeservers to exchange AFP messages directly without email routing, by resolving the recipient's Agent ID to their homeserver's AFP relay endpoint.

Why: agent-to-agent communication currently relies on the AFP relay within one homeserver. True federation means `agent:alice@omnyid.com` can send a thread message directly to `agent:bob@anotherdomain.com` without touching email.

Key steps:
- extend `/.well-known/afp-delegation` to include a `relay_endpoint` field
- add outbound relay dispatch to `src/server.rs`: when a `to` field resolves to a foreign homeserver, POST the AFP message to their relay endpoint
- add inbound relay authentication: verify the sending homeserver's signature before accepting a relayed message
- add replay protection with a short-lived nonce window

### R5 — Local LLM Inference via Ollama ✅ DONE

What: add an optional local inference path using the Ollama API as the backend for agent actions instead of requiring a cloud LLM API key.

Why: cloud LLM calls are the one remaining plaintext leakage point — the prompt and context leave the user's network. Routing inference through a local Ollama instance keeps all data on-device or on the self-hosted server, fully consistent with the zero-plaintext-egress posture.

Key steps:
- add `OMNYID_LLM_BACKEND=ollama` and `OMNYID_OLLAMA_URL=http://ollama:11434` env vars
- add an `ollama` service to `docker-compose.oracle.minimal.yml` (optional, resource-gated)
- implement `OllamaInferenceBackend` in a new `src/inference.rs` module behind an `InferenceBackend` trait
- add model selection to the Python runner policy panel in the Solid UI
- default model: `llama3.2` (fits in Oracle A1 free-tier RAM at 4-bit quantization)

### R6 — Verifiable Append-Only Audit Log ✅ DONE

What: add a cryptographically chained audit log where each AFP message commit includes a hash of the previous entry, making tampering detectable without a trusted third party.

Why: AFP messages are already append-only semantically. Making them cryptographically linked turns the thread history into a tamper-evident ledger — a user can verify their complete history has not been modified by the server.

Key steps:
- add `prev_hash: Option<String>` field to `AFPMessage` (AFP v1.1 extension, backward-compatible)
- compute `SHA-256(canonical_json(message))` and set it as the `prev_hash` of the next message on insert
- add `GET /threads/{id}/verify` endpoint that walks the chain and returns the first broken link, if any
- add SDK `verify_thread_integrity()` helpers in Python and TypeScript
- document the threat model: the server cannot silently delete or reorder messages without breaking the chain; the user detects this on next verify

### R7 — MCP (Model Context Protocol) Server ✅ DONE

What: expose Omnyid's AFP thread store and action capabilities as a Model Context Protocol server so any MCP-compatible AI client (Claude Desktop, Cursor, etc.) can use it as a secure personal context source.

Why: MCP is becoming the standard protocol for AI tools to access external context. Exposing Omnyid as an MCP server means the user's private inbox history and action audit trail can be queried by any MCP client — without the client ever touching plaintext stored elsewhere.

Key steps:
- add `src/mcp_server.rs` implementing the MCP JSON-RPC protocol (stdio or HTTP transport)
- expose MCP tools: `search_threads`, `get_thread`, `send_message`, `execute_action`, `get_personalization_context`
- all MCP responses return decrypted content only when the client presents a valid device key — ciphertext is never returned in raw form
- add MCP server entry to `docker-compose.oracle.minimal.yml` (internal only, not public-facing)
- publish the MCP server config as a downloadable bundle from the dashboard onboarding flow

### R8 — WebAuthn / Passkey Device Authentication ✅ DONE

What: replace the current password-based preview auth and session tokens with WebAuthn passkeys as the primary authentication mechanism.

Why: passwords are a weak link in the privacy chain — they can be phished or brute-forced. Passkeys are phishing-resistant, device-bound, and require no server-side password storage. Combined with the existing Ed25519 signing keys, a passkey becomes the gate to the user's local key material.

Key steps:
- add `webauthn-rs` crate to `Cargo.toml`
- implement `POST /auth/passkey/register` and `POST /auth/passkey/authenticate` endpoints
- bind the passkey credential to the user's Agent ID at registration time
- on successful passkey authentication, issue a short-lived session token scoped to the device
- update the Solid UI login flow to prefer passkey with password as fallback

### R9 — Differential Privacy for Personalization Stats ✅ DONE

What: add local differential privacy noise to the `/personalization/stats` endpoint so that aggregate training-readiness signals cannot be used to infer individual feedback decisions.

Why: the stats endpoint currently returns exact signal counts. Even encrypted, patterns over time could reveal behavioral fingerprints. Adding calibrated Laplace noise before the stats leave the server means the training loop is unaffected (it uses the raw local data) but the stats API surface is privacy-preserving.

Key steps:
- add a `dp_epsilon` config value (default `1.0`, lower is more private)
- apply Laplace mechanism noise to each signal count in `get_personalization_stats()`
- clamp noisy values to `[0, ∞)` so counts never go negative
- document the privacy budget and its relationship to training sample size in the personalization docs

### R10 — Portable Data Export (Standard Formats) ✅ DONE

What: let users export their entire Omnyid history as standard open formats — MBOX for email threads, JSON-LD for note pages, and a signed AFP archive for full fidelity.

Why: the best privacy guarantee is one the user can verify by walking away. Portability is a trust signal: if a user can export everything, they know there is no lock-in and no hidden state.

Key steps:
- add `GET /export/mbox` — streams all AFP email-type messages as RFC 4155 MBOX
- add `GET /export/afp-archive` — signed, gzip-compressed NDJSON of all messages, verifiable with the user's public key
- add `GET /export/json-ld` — note-type AFP messages as JSON-LD using schema.org `NoteDigitalDocument`
- expose export controls in the dashboard alongside the existing JSON state export
- add import path: `POST /import/mbox` to re-ingest an MBOX archive as AFP messages (migration use case)

---

## Recent Completed Work (Post-R10 Sprint)

*Last updated: 2026-03-25*

### Master Agent Orchestration + Dashboard Redesign ✅ DONE

Implemented full Clawith-inspired master agent architecture:

- DB migration 0019: `soul_md`, `memory_md`, `lora_confidence_score`, `lora_genome_active`, `ephemeral` on `agent_instances`; new tables `agent_focus_items`, `agent_triggers`, `agent_delegations`, `anon_dashboard_sessions`
- `src/policy_engine.rs`: task/mask policy, capability registry, 4 unit tests
- `src/master_orchestrator.rs`: async orchestration with semaphore concurrency control, 30s timeouts, audit logging
- `src/agent_template.rs`: `provision_ephemeral()`, `generate_delegated_key()`, `should_use_soul_md()`, `default_soul_md()`, LoRA threshold constant
- `src/db.rs`: focus items CRUD, delegation CRUD, soul/memory update, LoRA confidence update, ephemeral cleanup, anon session tracking
- `src/server.rs`: 14 new routes (`/agent/focus`, `/agent/trigger`, `/agent/delegate`, `/agent/fleet`, `/agent/orchestrate`, `/agent/onboarding`, `/agent/lora-confidence`, `/feed/public`, `/about`, etc.), anon fingerprint session gating, background ephemeral cleanup task
- `solid-ui/src/`: `OnboardingWizard`, `AgentFleetView`, `AgentSettingsView`, `FocusItemsPanel`, `AgentPulse`, `GuidedTour`, `SessionLimitScreen`, `PublicFeedView` components

### E2EE Client-Side Decryption ✅ DONE

- `solid-ui/src/lib/decrypt.ts`: libsodium-wrappers browser decryption; canonical JSON AAD reconstruction; key held in memory only
- `GET /agent/keys` endpoint: returns `enc_key_hex` to authenticated users
- `App.tsx`: fetches key on mount, decrypts messages before setting state
- `InboxRenderer.tsx`: fixed content-blocking bug (was hiding all E2EE messages); now shows plaintext with small 🔒 badge

### Intent Routing Improvements ✅ DONE

- Task keyword detection fallback in `route_ui_command()` (shopping list, reminders, todos, etc.)
- Strengthened LLM system prompt with explicit task-vs-research classification rules
- Two-step web search: `fetch_ddg_results()` (DuckDuckGo Instant Answer API) → `summarize_search_results()` (LLM summary with source links)
- No web search results stored by default (ephemeral, in-memory only)

### Gmail Agent Actions ✅ DONE

- `EmailView.tsx`: 4 agent action buttons shown after Gmail connection (Auto-Label, Draft Replies, Unsubscribe, Daily Summary)
- Each button fires `POST /agent/orchestrate` with detailed objective; shows pending/done/error states

### UX Simplification ✅ DONE

- NavBar: advanced features (Runner, Agent Settings) hidden behind "Advanced ▾" toggle
- GuidedTour: 4-step informational modal on first login
- Default chat placeholder: "Hi! I'm your master agent. What would you like me to do today?"
- OnboardingWizard: 4-step soul configuration (Agent Personality / Tone / Goals / Rules) with "change later" note

### LLM Configuration UI ✅ DONE

- `AgentSettingsView.tsx`: LLM backend selector (BYOK / Ollama), model name input, API key input, Ollama URL input
- `api.ts`: `fetchLlmConfig()`, `saveLlmConfig()` functions added
- Existing routes `GET/POST /user/llm-config` in `server.rs` already handle persistence

---

## Next Steps (Backlog)

### N1 — LLM Config: RunPod / Hosted Pro Tier
Add pro-plan billing UI and expose RunPod (Qwen) + Anthropic hosted backend selection in AgentSettingsView.

### N2 — Focus Items: Priority + Due Date UI
FocusItemsPanel currently creates items at `normal` priority only. Add priority selector and optional due date picker.

### N3 — Agent Triggers UI
Expose `agent_triggers` management in the dashboard (create scheduled/interval/webhook triggers visually).

### N4 — Public Feed (Plaza)
`PublicFeedView` component exists but `/feed/public` returns empty until users publish public AFP articles. Wire up a "Publish to Plaza" action from the chat view.

### N5 — Ollama Model Discovery
On Ollama backend: call `GET {ollama_url}/api/tags` and show a dropdown of available local models instead of a free-text field.

### N6 — Web Search Storage Toggle
Add a setting in AgentSettingsView: "Save web search results to AFP feed" (default: off). When on, stores summarised results as AFP `note` messages.

---

## Phase 16: Multi-Modal Ingest Pipeline

**Status:** Not yet started — specced 2026-04-14

**Goal:** Give the AI assistant ultra-fast, high-accuracy ingestion and retrieval across documents, images, audio, and video. Everything flows through AFP; the server stays E2EE and blind to content.

### Why Now

The Knowledge Curator (Phase 11) established the graph index, backlink graph, and embedding pipeline. The Ephemeral Workspace layer (shipped alongside Phase 11) provides a safe sandbox for expensive ingest jobs. Multi-modal ingest is the logical next layer: convert any raw asset into structured AFP messages the Curator can index.

Phase 11 runtime closure update as of 2026-04-14:

- `src/daemon_registry.rs` now boots and tracks system daemons per user
- `src/curator_runtime.rs` now runs the curator continuously with pgvector-backed candidate search and folder-rule-aware scope
- `src/daemon_runtime.rs` now archives AFP payloads to MinIO when configured and uses health passes for backlog re-indexing, duplicate detection, and backlink repair
- Dashboard supertag browsing is now surfaced in `solid-ui/src/components/DashboardFeed.tsx`

Phase 11 + 12 (Knowledge Curator Enhanced) closure update as of 2026-04-15:

- `src/summarizer.rs` — replaced placeholder `[0.1; 768]` embedding with async `generate_embedding_with_ollama()` hitting Ollama `/api/embeddings` (default model `nomic-embed-text`). Graceful fallback to uniform vector. Configure via `OLLAMA_URL` / `OLLAMA_EMBED_MODEL` env vars.
- `src/curator_runtime.rs` — curator now uses real Ollama embeddings; cosine-similarity backlinks are meaningful when Ollama is running locally.
- `src/db.rs` — `Db::bfs_backlinks_graph(user_id, root_id, depth)` added: iterative BFS up to depth 4 over `afp_backlinks`, returning reachable node set and edge list.
- `src/server/mod.rs` — two new endpoints: `GET /backlinks/graph?root=&depth=` (multi-hop graph); `POST /notes/supertags/install-defaults` (one-click taxonomy install: `#Work`, `#Personal`, `#Health`, `#Finance`, `#Travel`, `#Learning`, `#Ideas`, `#Urgent`).
- `solid-ui/src/lib/api.ts` — `BacklinkItem`, `BacklinksResponse`, `BacklinksGraphResponse` types; `fetchBacklinksForMessage()`, `fetchBacklinksGraph()`, `installDefaultSupertags()` helpers.
- `solid-ui/src/components/MonthlyCalendarView.tsx` — right sidebar wired to live backlinks API; `WeekView` (7-column hourly grid) and `DayView` (24-hour single-column list) components added; voice note capture via Web Speech API live transcription in `AddEventModal`; "Install defaults" supertag card in right sidebar.

### P16-A — Short-Term: External Parser Tool Calls (immediate)

Wire high-accuracy parsers as AFP tool calls via MCP/tool_call instead of building parsers from scratch:

- **PDF / rich docs:** MinerU (open-source, layout-preserving), LlamaParse, or Unstructured.io — caller's choice, routed by connector_family
- **Audio / video:** Whisper (local via Ollama, or hosted) transcription → AFP `transcript` message
- Every parsed output lands as an AFP message (`markdown_view`, `table_view`, or `image_view` subtype) in the same thread as the source attachment
- Knowledge Curator indexes these automatically via its `afp_new_message` subscription — no extra wiring needed
- All intermediate parse steps use `metadata.store: false` to suppress AFP bloat; only the clean structured output is persisted

**AFP messages introduced:**
- `multimodal_ingest_request` (ephemeral, kicked off in a workspace branch)
- `parsed_document` (persisted, with `content_type`, `parser_used`, `source_url`)
- `transcript` (persisted, with `duration_seconds`, `language`, `model_used`)

### P16-B — Medium-Term: Multi-Modal Ingest Daemon

New background daemon: **Ingest Coordinator**

- Subscribes to `afp_new_message` where `message.type IN ('attachment', 'upload_complete')`
- Routes asset to the best available parser by MIME type:
  - `application/pdf` → MinerU (preferred) or LlamaParse fallback
  - `image/*` → vision model caption + OCR
  - `audio/*`, `video/*` → Whisper transcription
  - `text/html` → Readability extract → markdown
- Runs inside an ephemeral workspace branch; merges on success, discards on failure
- Emits a `knowledge_card` AFP message for each parsed chunk, letting the Knowledge Curator pick up entity extraction and backlink creation for free

**Daemon spec (same pattern as Knowledge Curator):**
- `subscription_slot`: `afp_new_message` + MIME filter
- `analysis_slot`: parser routing + chunking
- `write_slot`: `parsed_document`, `transcript`, `knowledge_card`
- `policy_slot`: `outbound_allowlist = ["parsed_document", "transcript", "knowledge_card", "daemon_heartbeat"]`
- `heartbeat_slot`: `daemon_heartbeat` every 60 s
- `max_cost_cents ≤ 5` per trigger (parser calls are cheap; LLM captioning is bounded to 1 call per image)

### P16-C — Long-Term: Hybrid Retrieval in the Knowledge Curator

Upgrade retrieval from pure vector search to hybrid ranked results:

- **Vector search:** pgvector (`embedding <-> query_vec`) — already live, P95 < 200 ms
- **BM25 keyword search:** `pg_bm25` (ParadeDB extension) over structured AFP content fields
- **Fusion:** Reciprocal Rank Fusion (RRF) merges pgvector and BM25 results before returning to the caller
- **Multi-hop reasoning:** traverse `afp_backlinks` graph for linked entities before falling back to raw vector search — catches related items that share no embedding proximity
- **PGlite query cache:** frequent queries + summaries cached locally in the browser PGlite instance; cache-hit path targets < 100 ms with zero server round-trips

**New retrieval API:**
- `GET /knowledge/search?q=...&mode=hybrid&hops=2` — returns ranked AFP message IDs with relevance scores
- `GET /knowledge/graph?anchor=<message_id>&depth=2` — returns sub-graph rooted at a message for multi-hop browsing

### Dependencies

- Phase 11 (Knowledge Curator + afp_backlinks + daemon runtime closure) — done
- Ephemeral Workspace layer (`workspace_id`, `branch_id`, `validateBranchMerge`) — done
- Phase 14 (AFP Retry + Checkpointing) — required before P16-B daemon is production-safe
- pg_bm25 / ParadeDB — new Postgres extension, must be added to the `pgvector/pgvector` image or switched to ParadeDB image

### Non-Negotiables

- Parser output is always an AFP message — no raw blobs stored outside the AFP thread
- The homeserver never sees plaintext: all parse jobs run client-side or in the user's private runtime worker; only the encrypted AFP result is uploaded
- `branch_id` is set on all ingest workspace messages — Knowledge Curator skips re-indexing them until `branch_merge` fires
