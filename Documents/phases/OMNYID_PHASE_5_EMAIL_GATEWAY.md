# Omnyid Phase 5 Email Gateway MVP

## Phase 5: Email Gateway MVP

Status: in progress

Purpose: make the shared human-inbox to AFP-thread to agent-inbox loop reliable enough to support live mailbox workflows.

## What Was Landed

### Shared Reply Path

- [src/gateway/smtp_out.rs](/c:/Users/joes/Desktop/projects/Agenton/src/gateway/smtp_out.rs) now recognizes `action_reply` alongside `email_outgoing` and `action_forward`.
- Outbound gateway normalization now preserves:
  - `to`
  - `subject`
  - `body`
  - `in_reply_to`
  - `references`
- This keeps reply intent in the same shared AFP thread rather than forcing a separate email-only workflow.

### Threaded Reply Helpers In Both SDKs

- [python-sdk/afp/client.py](/c:/Users/joes/Desktop/projects/Agenton/python-sdk/afp/client.py) now exposes `reply(...)`.
- [typescript-sdk/src/index.ts](/c:/Users/joes/Desktop/projects/Agenton/typescript-sdk/src/index.ts) now exposes `reply(...)`.
- [python-sdk/example.py](/c:/Users/joes/Desktop/projects/Agenton/python-sdk/example.py) and [typescript-sdk/example.ts](/c:/Users/joes/Desktop/projects/Agenton/typescript-sdk/example.ts) now show the threaded reply path explicitly.

### Provider Boundary Baseline

- [src/gateway/provider.rs](/c:/Users/joes/Desktop/projects/Agenton/src/gateway/provider.rs) remains the single provider-resolution surface for Gmail, Outlook, and custom-domain fallback.
- [src/gateway/imap_sync.rs](/c:/Users/joes/Desktop/projects/Agenton/src/gateway/imap_sync.rs) now uses the real Gmail API path to list recent messages, fetch raw RFC822 payloads, convert them through the gateway parser, and store them through the shared server persistence path while updating durable checkpoints.
- [src/gateway/custom_imap.rs](/c:/Users/joes/Desktop/projects/Agenton/src/gateway/custom_imap.rs) now provides a real custom-domain IMAP fallback worker that logs in over IMAPS, tracks checkpointed UIDs, fetches recent raw RFC822 messages, and feeds them through the same AFP persistence path.
- [src/gateway/smtp_in.rs](/c:/Users/joes/Desktop/projects/Agenton/src/gateway/smtp_in.rs) and [src/server.rs](/c:/Users/joes/Desktop/projects/Agenton/src/server.rs) already preserve inbound threading references so agent replies can target the correct external thread state.
- Hosted deployment assumptions are now captured in [OMNYID_CLOUD_SETUP_NOTES.md](/c:/Users/joes/Desktop/projects/Agenton/OMNYID_CLOUD_SETUP_NOTES.md), including secret handling and later Oracle Cloud or OVHcloud access requirements.

### Real Outbound Delivery Paths

- [src/gateway/gmail_api.rs](/c:/Users/joes/Desktop/projects/Agenton/src/gateway/gmail_api.rs) now performs Google OAuth refresh-token exchange and sends outbound email through the real Gmail API `users.messages.send` path using a base64url-encoded MIME message.
- [src/gateway/gmail_api.rs](/c:/Users/joes/Desktop/projects/Agenton/src/gateway/gmail_api.rs) now also lists recent Gmail message ids and fetches raw RFC822 payloads for inbound sync.
- [src/gateway/smtp_fallback.rs](/c:/Users/joes/Desktop/projects/Agenton/src/gateway/smtp_fallback.rs) now performs real SMTP fallback delivery using `lettre` with STARTTLS and env-backed credentials.
- [src/gateway/smtp_out.rs](/c:/Users/joes/Desktop/projects/Agenton/src/gateway/smtp_out.rs) now dispatches through those real provider helpers instead of logging placeholder delivery success.
- [src/gateway/provider.rs](/c:/Users/joes/Desktop/projects/Agenton/src/gateway/provider.rs) now also carries `OMNYID_GMAIL_USER_ID`, `FROM_ADDRESS`, and SMTP credential material as part of the resolved gateway config.

### RFC-Aware Inbound Parsing And Delivery Receipts

- [src/gateway/smtp_in.rs](/c:/Users/joes/Desktop/projects/Agenton/src/gateway/smtp_in.rs) now uses `mail-parser` before falling back to raw header splitting.
- Incoming subject, sender, recipients, message ids, reply ids, references, and preferred body text are now extracted from a real RFC-aware parser.
- [postgres/migrations/0002_workflow_state.sql](/c:/Users/joes/Desktop/projects/Agenton/postgres/migrations/0002_workflow_state.sql) now adds `outbound_email_receipts`.
- [src/db.rs](/c:/Users/joes/Desktop/projects/Agenton/src/db.rs) now persists outbound delivery attempt receipts.
- [src/server.rs](/c:/Users/joes/Desktop/projects/Agenton/src/server.rs) now records queued and failed outbound delivery attempts after gateway dispatch.

## Current Gateway Baseline

The gateway now has:

- inbound email to AFP conversion with preserved threading metadata
- durable checkpoint rows for sync workers
- provider-aware auth mode selection
- real Gmail API inbound polling with checkpoint-aware recent-message ingestion
- real custom-domain IMAP inbound polling with checkpointed UID tracking
- outbound email normalization for direct sends, forwards, and replies
- real Gmail OAuth token exchange and Gmail API outbound send
- real STARTTLS SMTP fallback delivery for custom domains
- RFC-aware inbound message parsing with normalized message ids
- durable outbound delivery receipt persistence
- SDK-level reply ergonomics that still append to the same AFP thread history

## Still Remaining In Phase 5

- replace placeholder Outlook workers with real Microsoft Graph adapters
- add digest generation back to the user inbox as a first-class AFP-to-email bridge
- persist provider-specific sync cursors and outbound delivery receipts
- implement attachment ingress and outbound attachment dispatch
- add live gateway integration tests across inbound conversion, thread mapping, and outbound reply delivery

## Validation So Far

- `cargo test --lib` passes with 43 tests
- `npm run typecheck` passes in `typescript-sdk`

## Notes

Phase 5 is not complete yet, but the gateway now behaves more like production infrastructure: it parses real message structure, keeps threading metadata cleaner, persists outbound delivery state, and can now actually send mail through Gmail OAuth or custom SMTP fallback instead of only logging placeholder dispatch.
