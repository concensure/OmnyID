# Omnyid Phase 0.5 Audit Report

## Phase 0.5: Audit and Convergence Sprint

Status: completed

Purpose: establish a truthful baseline for the existing Omnyid repository so future implementation work is driven by reality, not by aspirational architecture alone.

## Executive Summary

The repository already contains the right major surfaces for Omnyid:

- Rust homeserver
- AFP proto and message models
- Postgres and Docker setup
- SMTP and IMAP gateway starters
- Python and TypeScript SDKs
- early UI and product landing page

The core conclusion is:

- the architecture direction is strong
- the implementation is still mostly prototype-grade
- the highest current risk is interface drift and placeholder privacy behavior
- the project should now move into a hardening and convergence phase, not a feature expansion phase

## Classification Matrix

### Production Candidate

- [python-sdk/afp/client.py](/c:/Users/ozans/Desktop/projects/Agenton/python-sdk/afp/client.py)
  Notes: now has a coherent transport plus declarative action layer and is one of the strongest foundations in the repo.

- [ui/App.tsx](/c:/Users/ozans/Desktop/projects/Agenton/ui/App.tsx)
  Notes: still early, but structurally points in the right direction for a config-driven multi-view workspace.

### Partial / Needs Hardening

- [proto/afp.proto](/c:/Users/ozans/Desktop/projects/Agenton/proto/afp.proto)
- [src/message.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/message.rs)
- [src/db.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/db.rs)
- [typescript-sdk/src/index.ts](/c:/Users/ozans/Desktop/projects/Agenton/typescript-sdk/src/index.ts)
- [docker-compose.yml](/c:/Users/ozans/Desktop/projects/Agenton/docker-compose.yml)
- [Caddyfile](/c:/Users/ozans/Desktop/projects/Agenton/Caddyfile)

### Placeholder / Illustrative

- [src/server.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/server.rs)
- [src/gateway/smtp_in.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/gateway/smtp_in.rs)
- [src/gateway/imap_sync.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/gateway/imap_sync.rs)
- [src/crypto.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/crypto.rs)
- [ui/index.html](/c:/Users/ozans/Desktop/projects/Agenton/ui/index.html)
- [template.json](/c:/Users/ozans/Desktop/projects/Agenton/template.json)

## What Exists Today

### Backend

- A Rust service stack is selected correctly.
- Tonic, Axum, SQLx, and crypto crates are already declared.
- The DB layer already expresses the intended append-only thread store direction.
- Docker includes Postgres, MinIO, homeserver, and Caddy.

### SDKs

- Python SDK already exposes a strong ergonomic shape:
  - low-level `Message`
  - high-level `Action`
  - one-method action flow via `act()`
- TypeScript SDK exists but lags behind the Python SDK materially.

### UI

- The product has both:
  - a vision/marketing landing page
  - an early workspace shell
- The workspace direction matches the architecture brief: config-driven and multi-view oriented.

## Key Findings

### 1. Schema Drift Is the Biggest Immediate Problem

The protocol is not represented consistently across the stack.

Examples:

- [proto/afp.proto](/c:/Users/ozans/Desktop/projects/Agenton/proto/afp.proto) does not include `views`, `references`, attachments, or richer encryption metadata.
- [src/message.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/message.rs) also lacks those fields.
- [src/gateway/smtp_in.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/gateway/smtp_in.rs) tries to construct `views`, which do not exist on the current Rust message struct.
- [template.json](/c:/Users/ozans/Desktop/projects/Agenton/template.json) expects fields like `attachments` and `parent_id` that are not represented in the proto.
- [python-sdk/afp/client.py](/c:/Users/ozans/Desktop/projects/Agenton/python-sdk/afp/client.py) already models `views`, while [typescript-sdk/src/index.ts](/c:/Users/ozans/Desktop/projects/Agenton/typescript-sdk/src/index.ts) does not.

Impact:

- compile risk
- runtime incompatibility risk
- documentation confusion
- impossible-to-enforce privacy boundaries

### 2. Privacy Claims Outrun the Current Implementation

The repo says privacy-first and E2EE-first, but the implementation still contains placeholder behavior.

Examples:

- [src/crypto.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/crypto.rs) explicitly describes demo encryption and returns JSON-wrapped base64 instead of a real encrypted envelope.
- [src/db.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/db.rs) stores parsed `content_json` and generates summaries and embeddings server-side, which conflicts with the desired ciphertext-only homeserver boundary.
- [docker-compose.yml](/c:/Users/ozans/Desktop/projects/Agenton/docker-compose.yml) contains demo credentials and plaintext service assumptions.

Impact:

- the product promise is ahead of the technical boundary
- hosted-mode trust assumptions cannot yet be defended

### 3. The Rust Homeserver Is Architectural Scaffolding, Not Yet a Reliable Service

[src/server.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/server.rs) is a design sketch more than production code.

Observed issues:

- invalid top-level statements
- duplicate imports
- missing functions and missing imports
- placeholder routes
- mixed gRPC and HTTP assembly without a complete runtime path

Impact:

- the backend must be refactored before the project can meaningfully harden the happy path

### 4. The Gateway Layer Has the Right Product Shape but Not Yet the Right Operational Shape

The email bridge direction is excellent, but current files are mostly illustrative.

Examples:

- [src/gateway/smtp_in.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/gateway/smtp_in.rs) mixes parsing, summarization, action logic, and reply logic in a single demo path.
- [src/gateway/imap_sync.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/gateway/imap_sync.rs) is hardcoded to Gmail and lacks login, checkpointing, and dedupe.

Impact:

- this is the right place to build next, but it must be separated into ingest, normalize, persist, and act phases

### 5. The Python SDK Is Ahead of the Rest of the Stack

The Python SDK is now one of the clearest expressions of the intended product API.

Strengths:

- declarative actions
- low-level message access
- proper aliasing for `from`
- helper methods aligned with product direction

Gap:

- server and TypeScript SDK still need to converge toward the same contract

### 6. UI Direction Is Good, But It Is Still a Shell

The UI is appropriately split between landing-page positioning and workspace experimentation.

Current state:

- [ui/App.tsx](/c:/Users/ozans/Desktop/projects/Agenton/ui/App.tsx) expresses the right config-driven layout idea
- renderer depth is not yet there
- no real backend-connected thread flow is present
- [ui/index.html](/c:/Users/ozans/Desktop/projects/Agenton/ui/index.html) is still a simple fetch-and-dump prototype

Impact:

- UI work should continue only once the protocol and thread retrieval path are made trustworthy

## Current State vs Target State

### Protocol

Current:

- minimal AFP proto and template drift

Target:

- one canonical AFP v1 schema with shared semantics across every layer

### Crypto

Current:

- signing and encryption demos

Target:

- real signing, verifiable envelopes, ciphertext-first storage, clear metadata boundary

### Backend

Current:

- scaffold with useful direction but incomplete runtime assembly

Target:

- reliable ingest, persistence, query, discovery, health, and gateway orchestration

### Gateway

Current:

- product-shape prototype

Target:

- real provider-backed email bridge with checkpointing, dedupe, and structured actions

### SDKs

Current:

- Python stronger than TypeScript

Target:

- API parity across both SDKs

### UI

Current:

- shell and concept validation

Target:

- usable inbox-plus-workspace dashboard driven by AFP thread data

### Infra

Current:

- good composition concept with insecure demo defaults

Target:

- self-hostable, documented, privacy-defensible deployment path

## Critical Risks

1. Schema drift between proto, Rust, SDKs, JSON schema, and UI assumptions.
2. Plaintext storage and server-side summarization contradicting the long-term privacy model.
3. Demo code being mistaken for production-capable backend behavior.
4. Hosted deployment arriving before the cryptographic boundary is defensible.

## Recommended Next Phase

Phase 1 should begin with convergence and hardening, not expansion.

Priority order:

1. Freeze AFP v1 semantics.
2. Refactor Rust message, proto, and DB types into one coherent contract.
3. Remove placeholder crypto paths and define the real privacy boundary.
4. Refactor the homeserver into compiling, testable module boundaries.
5. Align TypeScript SDK with the Python SDK.

## Phase 0.5 Deliverables Completed

- current-state audit
- module classification
- schema drift identification
- privacy-boundary gap identification
- recommended priority order for Phase 1
