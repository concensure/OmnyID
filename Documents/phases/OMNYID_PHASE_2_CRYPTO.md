# Omnyid Phase 2 Crypto and Privacy Hardening

## Phase 2: Cryptographic Core

Status: in progress

Purpose: replace silent demo assumptions with explicit signing and privacy boundaries.

## Stable Stack Baseline

Phase 2 now assumes the version baseline documented in [OMNYID_STACK_VERSIONS.md](/c:/Users/ozans/Desktop/projects/Agenton/OMNYID_STACK_VERSIONS.md).

Current pinned baseline:

- Rust `1.94.0`
- Rust edition `2024`
- Python `3.14.3`
- Node.js `22.22.1` LTS
- TypeScript `5.9.x`

## What Was Landed

### Deterministic Ed25519 Message Signatures

- [src/crypto.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/crypto.rs) now defines a deterministic signable payload for AFP messages.
- The signature format is now:
  - `ed25519:<public_key_hex>:<signature_b64>`
- The signature excludes the `signature` field itself and signs a canonicalized payload:
  - stable field order
  - sorted JSON keys
  - stable array serialization

### Homeserver Verification Boundary

- [src/server.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/server.rs) now verifies any message carrying a verifiable Ed25519 signature.
- Unsigned messages are rejected by default.
- A dev-only escape hatch now exists:
  - `OMNYID_ALLOW_INSECURE_UNSIGNED=true`

### Explicit Encryption Policy Gate

- [src/server.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/server.rs) now supports a server policy gate:
  - `OMNYID_REQUIRE_ENCRYPTION=true`
- When enabled, the server rejects messages that do not carry an encryption envelope.
- This does not complete E2EE yet, but it creates a real enforcement hook for the next phase of envelope hardening.

### Ciphertext-Only Default Storage Path

- [src/db.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/db.rs) now defaults to ciphertext-only storage behavior when an encryption envelope is present.
- By default:
  - `OMNYID_ALLOW_PLAINTEXT_STORAGE=false`
  - `OMNYID_ENABLE_SERVER_SUMMARIZATION=false`
- In that mode:
  - encrypted messages do not persist plaintext `content`
  - the server stores an explicit ciphertext-only placeholder in the `content` column
  - server-side summary and embedding generation are skipped

This is a meaningful privacy improvement, but it still does not make Omnyid fully E2EE by default because the encrypted path is not yet the universal default across every client and gateway path.

This is explicitly a development transition mechanism, not the desired production posture.

### First Real Omnyid Envelope Format

- [src/crypto.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/crypto.rs) now defines a real `omnyid-envelope-v1` content envelope using `xchacha20poly1305-ietf`.
- The envelope format now carries:
  - `scheme`
  - `algorithm`
  - `nonce`
  - `ciphertext`
- [src/server.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/server.rs) now validates that non-empty encryption envelopes match the supported Omnyid v1 shape.
- [src/db.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/db.rs) now only treats supported Omnyid v1 envelopes as ciphertext-bearing storage inputs.

This is the first real encrypted content path in the repo. It is still symmetric-key based and not yet recipient-wrapped, so it is a major Phase 2 step, not the final architecture target.

### Python SDK Signing Support

- [python-sdk/afp/client.py](/c:/Users/ozans/Desktop/projects/Agenton/python-sdk/afp/client.py) now supports Ed25519 signing when a signing key is configured.
- [python-sdk/pyproject.toml](/c:/Users/ozans/Desktop/projects/Agenton/python-sdk/pyproject.toml) now includes `pynacl`.
- The SDK reads `OMNYID_SIGNING_KEY_HEX` or accepts `signing_key_hex` directly.

### Python SDK Client-Side Encryption Path

- [python-sdk/afp/client.py](/c:/Users/ozans/Desktop/projects/Agenton/python-sdk/afp/client.py) now supports client-side content encryption and client-side thread decryption.
- When `OMNYID_ENCRYPTION_KEY_HEX` is configured, the Python SDK can:
  - encrypt `content` before sending
  - replace plaintext on the wire with an encrypted placeholder
  - decrypt thread payloads after fetch
- `OMNYID_ENCRYPT_BY_DEFAULT` controls whether the Python SDK should automatically encrypt every message when a key is available.

### TypeScript SDK Secure Defaults

- [typescript-sdk/src/index.ts](/c:/Users/ozans/Desktop/projects/Agenton/typescript-sdk/src/index.ts) now mirrors the Python SDK secure path.
- The TypeScript SDK can now:
  - sign messages with `OMNYID_SIGNING_KEY_HEX`
  - encrypt `content` before send with `OMNYID_ENCRYPTION_KEY_HEX`
  - decrypt thread payloads after fetch
- [typescript-sdk/package.json](/c:/Users/ozans/Desktop/projects/Agenton/typescript-sdk/package.json) now includes the crypto dependency and a `typecheck` script.
- [typescript-sdk/tsconfig.json](/c:/Users/ozans/Desktop/projects/Agenton/typescript-sdk/tsconfig.json) was added so this path is validated explicitly.

### Recipient-Wrapped Content Keys

- Both SDKs now support recipient-oriented key distribution on top of `omnyid-envelope-v1`.
- [python-sdk/afp/client.py](/c:/Users/ozans/Desktop/projects/Agenton/python-sdk/afp/client.py) can now:
  - cache peer public keys from verified AgentCards
  - read `OMNYID_RECIPIENT_KEYS_JSON`
  - generate a random per-message content key
  - wrap that content key to each known recipient with `curve25519-sealedbox-v1`
- [typescript-sdk/src/index.ts](/c:/Users/ozans/Desktop/projects/Agenton/typescript-sdk/src/index.ts) now mirrors the same recipient-wrapped envelope behavior.

This does not fully finish the key-management story, but it is the first step beyond a single shared symmetric key and toward real multi-recipient private messaging.

### Key Bootstrap Tooling

- [scripts/omnyid-dev-keys.ps1](/c:/Users/ozans/Desktop/projects/Agenton/scripts/omnyid-dev-keys.ps1) now generates development signing and encryption keys in Omnyid env format.
- [.env.example](/c:/Users/ozans/Desktop/projects/Agenton/.env.example) now documents the expected secure env variables.

### Signed AgentCard Discovery Path

- [src/agentcard.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/agentcard.rs) now signs AgentCards with the same Ed25519 seed format used elsewhere in Omnyid.
- [src/server.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/server.rs) now serves AgentCards from env-backed identity values instead of a hardcoded demo signature.
- [python-sdk/afp/client.py](/c:/Users/ozans/Desktop/projects/Agenton/python-sdk/afp/client.py) now includes `discover_verified()` and AgentCard verification helpers.
- [typescript-sdk/src/index.ts](/c:/Users/ozans/Desktop/projects/Agenton/typescript-sdk/src/index.ts) now includes `discoverVerified()` and AgentCard verification helpers.

### Gateway Path Hardening

- [src/gateway/smtp_in.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/gateway/smtp_in.rs) no longer emits fake signatures or server-side summary side effects.
- Inbound SMTP-to-AFP conversion now:
  - signs gateway-produced messages when `OMNYID_SIGNING_KEY_HEX` is configured
  - encrypts gateway-produced `content` when `OMNYID_ENCRYPTION_KEY_HEX` is configured
  - emits Omnyid references back to the original SMTP message ID
- [.env.example](/c:/Users/ozans/Desktop/projects/Agenton/.env.example) and [docker-compose.yml](/c:/Users/ozans/Desktop/projects/Agenton/docker-compose.yml) now document gateway identity env values.

### Automatic Peer Key Discovery

- Both SDKs now try to discover missing peer keys automatically from the recipient domain before sending encrypted messages.
- [python-sdk/afp/client.py](/c:/Users/ozans/Desktop/projects/Agenton/python-sdk/afp/client.py) now resolves unknown recipients through verified `/.well-known/agent-card` discovery during `send()`.
- [typescript-sdk/src/index.ts](/c:/Users/ozans/Desktop/projects/Agenton/typescript-sdk/src/index.ts) now mirrors the same automatic discovery behavior.
- If a recipient key cannot be discovered and no fallback shared key is configured, the secure send path now fails closed instead of silently falling back to plaintext.

### Secure Deployment Defaults

- [docker-compose.yml](/c:/Users/ozans/Desktop/projects/Agenton/docker-compose.yml) now reflects the secure Omnyid default posture:
  - `OMNYID_ALLOW_INSECURE_UNSIGNED=false`
  - `OMNYID_REQUIRE_ENCRYPTION=true`
  - `OMNYID_ENCRYPT_BY_DEFAULT=true`
- The compose stack now expects signing and encryption material from the environment instead of defaulting to an insecure local posture.

### Dev Environment Posture

- [docker-compose.yml](/c:/Users/ozans/Desktop/projects/Agenton/docker-compose.yml) now sets:
  - `OMNYID_ALLOW_INSECURE_UNSIGNED: "true"`
  - `OMNYID_REQUIRE_ENCRYPTION: "false"`
  - `OMNYID_ENCRYPT_BY_DEFAULT: "false"`
  - `OMNYID_ENCRYPTION_KEY_HEX: ""`

This keeps the local stack usable while the rest of the clients and gateway paths are being upgraded.

## Current Privacy Boundary

### Better Than Before

- signatures are now deterministic and verifiable
- the server no longer silently treats unsigned traffic as normal if dev mode is off
- the trust boundary is explicit in configuration
- encrypted message storage now avoids plaintext persistence by default
- server-side summarization is off by default

### Still Not Final

- external email itself is not end-to-end encrypted from the outside sender into Omnyid
- recipient wrapping exists in the SDKs, but durable peer-key caching and rotation are still minimal
- unencrypted messages can still persist plaintext when server policy allows them
- discovery verification is now available, but it still depends on deployers configuring real identity env values

## Are User Messages E2EE By Default?

For Omnyid-originated messages sent through the SDKs on the standard secure deployment path: effectively yes.

For the platform as a whole: not universally yet.

Current Omnyid behavior is:

- messages can be signed
- signatures can be verified by the homeserver
- an encryption requirement can be enforced by policy
- encrypted messages can avoid plaintext storage by default
- both SDKs now have real client-side encrypted content paths
- both SDKs can now wrap per-message content keys to known recipients
- the inbound gateway can now sign and encrypt too
- both SDKs now auto-discover peer keys before send and fail closed if secure encryption cannot be established
- but external email ingress is not E2EE from the original external sender, and recipient key lifecycle management is not complete yet

So Omnyid-originated user messages are now on an E2EE-by-default path in the SDKs when the secure deployment defaults are in place.

Scope clarification:

- for Omnyid agent relay, the meaningful E2EE path is AFP messaging between Omnyid-speaking agents and the homeserver
- ordinary SMTP or IMAP email from outside senders is not expected to be truly end-to-end encrypted in that same way
- external email can still become encrypted AFP state after Omnyid ingests it, but that does not make the original external email hop itself E2EE

## Immediate Remaining Work

1. move Rust-generated or SDK-generated signed messages onto every mainline client path
2. connect recipient wrapping to durable peer key caching, rotation, and revocation
3. tighten AgentCard deployment defaults so signed discovery is on by default in standard environments
4. make non-Omnyid email ingress clearly separated from true E2EE Omnyid-originated messaging
5. move summary and embedding generation to trusted local runtimes only

## Phase 2 Validation So Far

- deterministic Rust sign and verify tests added in [src/crypto.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/crypto.rs)
- server-side signed-ingress checks integrated in [src/server.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/server.rs)
- server-side encryption-policy checks integrated in [src/server.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/server.rs)
- real envelope encryption and decryption tests added in [src/crypto.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/crypto.rs)
- AgentCard signing and verification tests added in [src/agentcard.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/agentcard.rs)
- gateway signing and encryption tests added in [src/gateway/smtp_in.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/gateway/smtp_in.rs)
- `cargo check` passes on the pinned Rust `1.94.0` baseline
- `cargo test --lib` passes with 19 tests on the pinned Rust `1.94.0` baseline
- ciphertext-only storage defaults and summarization-disable defaults integrated in [src/db.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/db.rs)
- `npm run typecheck` passes in [typescript-sdk](/c:/Users/ozans/Desktop/projects/Agenton/typescript-sdk)
