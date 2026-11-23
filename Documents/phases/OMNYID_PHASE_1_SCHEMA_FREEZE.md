# Omnyid Phase 1 Schema Freeze

## Phase 1: AFP v1 Hardening

Status: completed

Purpose: define one canonical AFP v1 message contract that every implementation layer must conform to.

## Why This Phase Comes First

The current repo has drift between:

- `proto/afp.proto`
- `src/message.rs`
- `template.json`
- Python SDK models
- TypeScript SDK models
- gateway assumptions
- UI rendering assumptions

No serious hardening can happen until the message contract is frozen.

## Canonical AFP v1 Message

AFP v1 is append-only, thread-based, signed, and encryption-aware.

### Required Fields

- `protocol`
  - type: string
  - value: `afp-v1`

- `id`
  - type: string
  - semantics: globally unique message identifier

- `thread_id`
  - type: string
  - semantics: stable conversation or page identifier

- `from`
  - type: string
  - semantics: sender Agent ID

- `to`
  - type: array of strings
  - semantics: recipient Agent IDs or gateway-resolved recipients

- `timestamp`
  - type: RFC 3339 datetime string

- `type`
  - type: string
  - semantics: message kind or typed action event

- `content`
  - type: object
  - semantics: primary structured payload

- `signature`
  - type: string
  - semantics: detached or embedded signature metadata

### Optional Fields

- `parent_id`
  - type: string
  - semantics: explicit message parent where thread-local event ancestry matters

- `encryption`
  - type: object
  - semantics: encryption envelope metadata, key wrapping details, algorithm identifiers

- `views`
  - type: array of objects
  - semantics: sender-provided render hints for email, notion, database, calendar, graph, system

- `references`
  - type: array of reference objects
  - semantics: backlinks, cross-thread links, attachment links, knowledge edges

- `attachments`
  - type: array of attachment objects
  - semantics: encrypted attachment descriptors, not plaintext blobs

- `store_in_relational`
  - type: boolean
  - semantics: opt-in indexing or relational projection hint, never a server-side plaintext requirement

## Canonical View Object

Each `views[]` entry:

- `format`: string
- `content`: object
- `priority`: integer, default `0`

Supported initial formats:

- `email`
- `notion`
- `database`
- `calendar`
- `graph`
- `system`

## Canonical Reference Object

Each `references[]` entry:

- `type`: string
- `target`: string
- `label`: optional string
- `metadata`: optional object

Initial reference use cases:

- page backlinks
- cited thread links
- attachment references
- relation edges for graph rendering

## Canonical Attachment Object

Each `attachments[]` entry:

- `id`: string
- `name`: string
- `mime_type`: string
- `size_bytes`: integer
- `storage`: object
- `encryption`: object
- `sha256`: optional string

Storage object fields:

- `provider`
- `bucket`
- `object_key`

## Canonical Type Families

Message `type` values should fall into families:

- human or agent authored content
  - `task_update`
  - `block_update`
  - `email_incoming`
  - `email_outgoing`

- typed actions
  - `action_label`
  - `action_star`
  - `action_archive`
  - `action_move`
  - `action_share`
  - `action_forward`
  - `action_summarise`

- future integration events
  - `integration_stripe_charge`
  - `integration_expedia_booking`
  - `integration_notion_update`

## Canonical Identity Rules

- Agent ID format remains product-flexible, but current canonical form is:
  - `agent:<identity>@<domain>`
- Product-facing branding is Omnyid.
- Protocol-facing branding remains AFP v1.

## Privacy Boundary

The canonical privacy boundary for AFP v1 is:

- server may store ciphertext plus minimal metadata
- server must not require plaintext `content` in the default private mode
- summaries and embeddings must be user-side or trusted local-runtime derived by default
- attachment plaintext never lands in object storage without client-side encryption

## Conformance Rules

Every implementation must follow these rules:

- Python, TypeScript, Rust, JSON schema, and UI assumptions use the same field names
- `from` is canonical on the wire
- `content` stays object-shaped at the application layer
- `views`, `references`, and `attachments` are first-class optional fields
- unknown fields must be ignored safely, not dropped destructively

## Immediate Phase 1 Follow-Ons

1. Update `template.json` to match this freeze.
2. Update Rust message and proto structures to include the frozen optional fields.
3. Update TypeScript SDK to match Python SDK field coverage.
4. Refactor server and DB assumptions around plaintext `content`.
5. Add serialization tests against this frozen contract.

## Progress Completed

- [template.json](/c:/Users/joes/Desktop/projects/Agenton/template.json) now reflects the frozen JSON schema baseline.
- [proto/afp.proto](/c:/Users/joes/Desktop/projects/Agenton/proto/afp.proto) now includes `parent_id`, `views`, `references`, `attachments`, and `store_in_relational`.
- [src/message.rs](/c:/Users/joes/Desktop/projects/Agenton/src/message.rs) now reflects the same optional AFP fields on the Rust application model.
- [typescript-sdk/src/index.ts](/c:/Users/joes/Desktop/projects/Agenton/typescript-sdk/src/index.ts) now matches the Python SDK’s low-level message plus high-level action model.
- [postgres/init.sql](/c:/Users/joes/Desktop/projects/Agenton/postgres/init.sql) now persists `parent_id`, `views`, `references`, `attachments`, and `store_in_relational`.
- [src/db.rs](/c:/Users/joes/Desktop/projects/Agenton/src/db.rs) and [src/sync_worker.rs](/c:/Users/joes/Desktop/projects/Agenton/src/sync_worker.rs) now follow the frozen message shape more closely.
- [src/server.rs](/c:/Users/joes/Desktop/projects/Agenton/src/server.rs) now has a coherent HTTP plus gRPC runtime path against the converged AFP contract.
- `cargo check` now passes for the Rust backend after build script, crate-structure, server, DB, and gateway cleanup.
- stale protocol-facing docs and examples have been updated in [README.md](/c:/Users/joes/Desktop/projects/Agenton/README.md), [sdk.py](/c:/Users/joes/Desktop/projects/Agenton/sdk.py), and [ui/index.html](/c:/Users/joes/Desktop/projects/Agenton/ui/index.html).
- `cargo test --lib` now passes with AFP contract round-trip coverage in [src/server.rs](/c:/Users/joes/Desktop/projects/Agenton/src/server.rs).

## Phase 1 Exit Notes

Phase 1 is complete enough to move forward.

The remaining unresolved work now belongs to Phase 2 and beyond:

- remove placeholder cryptographic behavior
- eliminate plaintext-first assumptions from storage and summarization
- tighten discovery trust and signing semantics
- expand contract tests beyond round-trip serialization
