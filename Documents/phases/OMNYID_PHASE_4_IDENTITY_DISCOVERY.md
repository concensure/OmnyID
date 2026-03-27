# Omnyid Phase 4 Identity and Discovery

## Phase 4: Identity and Discovery

Status: in progress

Purpose: make Omnyid identities and well-known discovery surfaces trustworthy enough for cross-domain agent messaging.

## What Was Landed

### Agent ID Parsing Baseline

- [src/agent_id.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/agent_id.rs) now defines the first explicit Agent ID parser.
- [python-sdk/afp/client.py](/c:/Users/ozans/Desktop/projects/Agenton/python-sdk/afp/client.py) now validates Agent IDs before recipient caching, recipient selection, domain derivation, and AgentCard acceptance.
- [typescript-sdk/src/index.ts](/c:/Users/ozans/Desktop/projects/Agenton/typescript-sdk/src/index.ts) now validates Agent IDs before recipient caching, recipient selection, domain derivation, and AgentCard acceptance.
- [OMNYID_AGENT_ID_SPEC.md](/c:/Users/ozans/Desktop/projects/Agenton/OMNYID_AGENT_ID_SPEC.md) now captures the working Agent ID contract in one repo-level spec artifact.
- The current parser accepts the `agent:<localpart>@<domain>` shape and validates:
  - required `agent:` prefix
  - non-empty localpart
  - non-empty domain
  - conservative ASCII-safe localpart characters
  - DNS-like domain labels

This turns Agent ID handling from an informal string convention into a real code-level contract.

### AgentCard Validation Tightening

- [src/agentcard.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/agentcard.rs) now rejects malformed `agent_id` values during verification.
- `AgentCard::from_env()` now normalizes `OMNYID_AGENT_ID` through the parser instead of trusting arbitrary input.
- AgentCards now carry:
  - `key_id`
  - `previous_key_ids`
- Rust and both SDKs now include those fields in the AgentCard signature payload, which makes key rotation metadata part of the verified discovery surface.
- Python and TypeScript SDK verification now require valid `key_id` and `previous_key_ids` values before accepting a discovered AgentCard.

This means signed discovery is now anchored to a minimally validated identity format rather than a free-form string.

### Env-Backed Delegation Surface

- [src/server.rs](/c:/Users/ozans/Desktop/projects/Agenton/src/server.rs) now serves `/.well-known/afp-delegation` from `OMNYID_AFP_DELEGATION` instead of a hardcoded placeholder.
- [.env.example](/c:/Users/ozans/Desktop/projects/Agenton/.env.example) now documents that delegation setting for deployers.
- [Caddyfile](/c:/Users/ozans/Desktop/projects/Agenton/Caddyfile) is now templated around `OMNYID_DOMAIN` and `ACME_EMAIL` instead of static placeholder domains.
- [OMNYID_DISCOVERY_DEPLOYMENT.md](/c:/Users/ozans/Desktop/projects/Agenton/OMNYID_DISCOVERY_DEPLOYMENT.md) now captures the current reverse-proxy and hosted discovery assumptions.
- [python-sdk/afp/client.py](/c:/Users/ozans/Desktop/projects/Agenton/python-sdk/afp/client.py) now resolves delegated discovery before fetching `/.well-known/agent-card`.
- [typescript-sdk/src/index.ts](/c:/Users/ozans/Desktop/projects/Agenton/typescript-sdk/src/index.ts) now resolves delegated discovery before fetching `/.well-known/agent-card`.
- Both SDKs now enforce a stricter delegated discovery baseline:
  - non-local delegation targets must resolve to `https://...`
  - localhost development can still use `http://...`
  - the discovered AgentCard must still belong to the originally requested domain
- Both SDKs now expose explicit discovery trust modes:
  - `strict` by default
  - `tofu` for trust-on-first-use behavior with key pinning after first discovery
- [.env.example](/c:/Users/ozans/Desktop/projects/Agenton/.env.example) now documents `OMNYID_DISCOVERY_TRUST_MODE`.

This is a small but important step toward deployable cross-domain discovery rather than repo-only demo behavior.

## Current Identity Baseline

The current identity and discovery layer now has:

- signed AgentCards
- signed AgentCards with rotation-oriented `key_id` metadata
- SDK verification that enforces rotation metadata presence
- SDK-side AgentCard verification helpers
- SDK-side delegated discovery resolution helpers
- stricter delegated discovery policy that preserves requested-domain authority
- explicit `strict` versus `tofu` discovery trust behavior in both SDKs
- a parsed Agent ID baseline across Rust, Python, and TypeScript
- env-backed `/.well-known/agent-card`
- env-backed `/.well-known/afp-delegation`
- templated reverse-proxy assumptions for public discovery
- verification tests for AgentCard signatures and malformed Agent IDs

## Still Remaining In Phase 4

- keep the new Agent ID spec artifact aligned with implementation as the protocol evolves
- document the signed AgentCard format as a true protocol surface
- build revocation and rotation policy on top of the new `key_id` metadata
- refine and test the new trust-mode behavior against real hosted and federated deployment scenarios
- keep the new reverse-proxy deployment notes aligned with real Oracle Cloud and hosted bootstrap flows
- keep delegated discovery target validation aligned with deployment assumptions

## Validation So Far

- `cargo check` passes
- `cargo test --lib` passes with 42 tests

## Notes

Phase 4 is not complete yet, but Omnyid identity is now materially less ad hoc than before. The codebase has moved from “signed card plus placeholder strings” to “signed card plus parsed Agent ID plus env-backed delegation,” which is a safer foundation for federation and hosted deployments.
