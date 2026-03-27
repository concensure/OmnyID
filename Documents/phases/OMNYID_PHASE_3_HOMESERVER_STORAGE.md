# Omnyid Phase 3 Homeserver and Storage Core

## Phase 3: Homeserver and Storage Core

Status: in progress

Purpose: harden the backend and persistence layer so Omnyid can behave like a reliable source of truth instead of a prototype transport.

## What Was Landed

### Health and Readiness Endpoints

- [src/server.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/server.rs) now exposes:
  - `/healthz`
  - `/readyz`
  - `/metricsz`
- `/healthz` reports process liveness.
- `/readyz` now performs a real database readiness check before reporting ready.
- `/metricsz` now exposes non-plaintext JSON counters for message ingest, replay, relay usage, and gateway activity.
- [src/db.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/db.rs) now includes a database `healthcheck()` helper for that path.
- [src/metrics.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/metrics.rs) now provides the in-process metrics registry used by the homeserver.

### Structured Tracing

- [src/server.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/server.rs) now emits metadata-only tracing spans for:
  - HTTP send
  - thread fetch
  - gateway email ingestion
  - relay socket handling
  - relay client requests
  - durable message storage
- [src/gateway/smtp_out.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/gateway/smtp_out.rs) now emits metadata-only spans around outbound delivery attempts.
- These traces intentionally carry routing and delivery metadata such as thread ids, message ids, message types, and providers rather than plaintext content.

### Realtime Relay Foundation

- [src/server.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/server.rs) now exposes `/relay/ws`.
- New AFP writes are broadcast over a WebSocket relay channel as lightweight event notifications.
- This is the first transport-side bridge away from request/response-only delivery and toward the lower-latency relay model the product needs.
- [python-sdk/afp/client.py](/c:/Users/ozans/Desktop/projects/Agenton/python-sdk/afp/client.py) now exposes `relay_events()` for async relay consumption.
- [typescript-sdk/src/index.ts](/c:/Users/ozans/Desktop/projects/Agenton/typescript-sdk/src/index.ts) now exposes `subscribeRelay(...)` for UI and agent consumers.
- The relay is now bidirectional:
  - clients can send AFP messages over `/relay/ws`
  - the server returns explicit `ack` or `error` frames
  - both SDKs can prefer this WebSocket send path while keeping HTTP fallback during rollout
- The relay now supports thread-scoped subscriptions:
  - clients can subscribe to one `thread_id`
  - the server can send an initial `thread_snapshot`
  - subsequent relay events can be filtered to that one shared AFP thread
- [python-sdk/afp/client.py](/c:/Users/ozans/Desktop/projects/Agenton/python-sdk/afp/client.py) now exposes `watch_thread(...)`.
- [typescript-sdk/src/index.ts](/c:/Users/ozans/Desktop/projects/Agenton/typescript-sdk/src/index.ts) now exposes `subscribeThread(...)`.
- [typescript-sdk/src/index.ts](/c:/Users/ozans/Desktop/projects/Agenton/typescript-sdk/src/index.ts) now also exposes `openThreadSubscription(...)` for transport-aware realtime thread watching that can prefer WebTransport and fall back to WebSocket.
- [src/server.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/server.rs) now also exposes `/transport/capabilities`.
- That endpoint reports the public transport rollout posture:
  - WebTransport as the intended primary public path
  - WebSocket as the current realtime fallback
  - HTTP send as a compatibility fallback
- [src/metrics.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/metrics.rs) now tracks transport capability checks so rollout behavior stays observable.
- Internal gRPC is now disabled by default and only starts when `OMNYID_ENABLE_INTERNAL_GRPC=true`.
- The default internal bind is loopback via `127.0.0.1:50051`, which aligns better with the internal-only transport policy.
- [src/server.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/server.rs) now also starts a real WebTransport relay listener when:
  - `OMNYID_ENABLE_WEBTRANSPORT=true`
  - `OMNYID_WEBTRANSPORT_CERT_PATH` points to a PEM certificate
  - `OMNYID_WEBTRANSPORT_KEY_PATH` points to a PEM private key
- The WebTransport relay currently handles AFP `send` operations over QUIC on `/relay/wt`, using the same message validation, signing enforcement, encryption enforcement, storage path, and ack/error frame model as the WebSocket relay.
- The WebTransport relay now also supports thread subscription streams, emitting newline-delimited AFP relay events for one `thread_id` over a long-lived QUIC stream.
- [src/metrics.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/metrics.rs) now also tracks WebTransport session count separately from generic relay connections.
- [src/bin/omnyid_wt_cert.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/bin/omnyid_wt_cert.rs) and [setup-webtransport-dev-cert.ps1](/c:/Users/ozans/Desktop/projects/Agenton/scripts/setup-webtransport-dev-cert.ps1) now provide a built-in local certificate bootstrap path for QUIC relay testing.

### OAuth-First Mail Sync Scaffolding

- [src/gateway/imap_sync.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/gateway/imap_sync.rs) now models mail sync as provider-aware configuration instead of a generic placeholder loop.
- The current scaffolding now distinguishes:
  - Gmail via OAuth-first configuration
  - Outlook via OAuth-first configuration
  - custom domains via direct IMAP credentials as fallback
- Poll cadence is now explicitly constrained into the intended 30 to 60 second range at the config layer.
- [postgres/init.sql](/c:/Users/ozans/Desktop/projects/Agenton/postgres/init.sql) now defines a `mail_sync_checkpoints` table.
- [src/db.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/db.rs) now exposes an upsert helper for mail sync checkpoint state.
- [src/gateway/imap_sync.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/gateway/imap_sync.rs) now records per-provider, per-account sync status on every scheduler tick, which gives the gateway a durable foothold for later checkpointed Gmail, Outlook, and IMAP workers.

This is still scaffolding, not the finished sync engine, but it moves the repo toward the intended product behavior and away from app-password-first assumptions.

### Inbound Email Thread Resolution

- [src/gateway/smtp_in.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/gateway/smtp_in.rs) now carries `Message-Id`, `In-Reply-To`, and `References` into AFP metadata instead of only preserving the current SMTP message id.
- [src/db.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/db.rs) now exposes a lookup helper that can resolve existing AFP messages by external email reference ids.
- [src/server.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/server.rs) now uses that lookup during `/gateway/email` ingestion so inbound replies can rejoin the existing AFP `thread_id` and inherit a sensible `parent_id`.

This moves Omnyid closer to the intended shared inbox model: external email reply chains are now much more likely to remain one thread for both the human and the agent instead of fragmenting into fresh AFP threads.

### AFP-Driven Outbound Mail Dispatch

- [src/gateway/provider.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/gateway/provider.rs) now exposes shared inbound and outbound provider resolution helpers so the gateway uses one source of truth for Gmail, Outlook, and custom-domain fallback behavior.
- [src/gateway/smtp_out.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/gateway/smtp_out.rs) now converts outbound AFP messages into a normalized gateway request model.
- The outbound gateway currently recognizes:
  - `email_outgoing`
  - `action_forward`
- [src/server.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/server.rs) now attempts outbound gateway dispatch immediately after a new AFP message is durably stored, which keeps outbound email tied to the same append-only AFP thread history rather than a separate email-only queue.
- Dispatch currently remains provider-aware placeholder delivery, but the execution boundary is now correctly shaped around shared AFP thread state.

This closes an important architectural gap: agent-emitted outbound email intents now flow through the same persisted thread model that humans and agents already share.

### Replay-Safe Persistence

- [src/db.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/db.rs) now stores messages idempotently with `ON CONFLICT (id) DO NOTHING`.
- [src/db.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/db.rs) now applies embedded versioned migrations at startup.
- [postgres/migrations/0001_init.sql](/c:/Users/ozans/Desktop/projects/Agenton/postgres/migrations/0001_init.sql) is now the tracked schema baseline.
- [init.sql](/c:/Users/ozans/Desktop/projects/Agenton/postgres/init.sql) now bootstraps fresh Docker Postgres instances into the same tracked `omnyid_schema_migrations` version history.
- This means duplicate delivery attempts no longer create repeated message rows.
- [src/sync_worker.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/sync_worker.rs) now uses `ON CONFLICT (id) DO NOTHING` for invoice projection writes too.

This is the first concrete step toward retry-safe ACK semantics and replay-safe downstream projection behavior.

### Attachment Metadata Persistence

- [postgres/init.sql](/c:/Users/ozans/Desktop/projects/Agenton/postgres/init.sql) now defines a first-class `attachments` table.
- [src/db.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/db.rs) now persists attachment metadata rows when a new message with attachments is stored.
- Attachment metadata now has a relational home for:
  - `message_id`
  - `thread_id`
  - `mime_type`
  - `size_bytes`
  - storage reference JSON
  - encryption reference JSON

This does not replace AFP message attachment descriptors. It complements them so later MinIO and query workflows do not need to scrape attachment state back out of message JSON alone.

## Current Homeserver Baseline

The current backend now has:

- converged AFP v1 message validation
- signed and encrypted ingress enforcement hooks
- one append-only AFP history that can hold both human-ingested and agent-emitted messages under the same `thread_id`
- ciphertext-aware storage behavior
- health and readiness endpoints
- non-plaintext `/metricsz` operational counters
- metadata-only tracing spans for transport and gateway flows
- WebSocket relay broadcast plus bidirectional send/ack transport
- thread-scoped relay subscriptions with optional thread snapshots
- real QUIC/WebTransport relay ingress for AFP send operations
- idempotent primary message persistence
- tracked embedded schema migrations plus Docker bootstrap alignment
- retry-safe invoice projection inserts
- relational attachment metadata persistence
- provider-aware OAuth-first mail sync configuration scaffolding
- durable mail sync checkpoint persistence
- inbound email thread resolution from SMTP reply headers
- AFP-message-driven outbound email dispatch scaffolding

## Still Remaining In Phase 3

- extract cleaner server module boundaries for transport, auth, persistence, discovery, and gateway handling
- add additional migrations beyond the `0001_init` baseline as schema evolution continues
- expand the WebTransport relay from send-only QUIC ingress to thread subscription and push-style event delivery
- replace mail placeholder loops with real Gmail API v1, Microsoft Graph, and IMAP checkpointed sync workers
- replace outbound placeholder delivery with real Gmail API v1, Microsoft Graph, and SMTP transport adapters
- add attachment metadata persistence and MinIO reference flow
- connect attachment metadata persistence to actual MinIO object lifecycle operations
- add more message persistence and replay behavior tests
- expand the new metrics surface and add richer tracing spans for thread/query/gateway paths

## Validation So Far

- `cargo check` passes
- `cargo test --lib` passes with 37 tests

## Notes

Phase 3 is not complete yet, but the homeserver is now materially safer to run under orchestration because readiness, replay behavior, and outbound gateway boundaries are more explicit than before. The storage model is also aligned with the product requirement that the human inbox and the agent inbox are two interfaces over the same AFP thread history, not two separate stores.
