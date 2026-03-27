# Omnyid Agent ID Spec

## Status

Working baseline

## Canonical Shape

An Omnyid Agent ID uses this form:

`agent:<localpart>@<domain>`

Example:

`agent:alice.ops@omnyid.ai`

## Rules

- the value must start with the literal prefix `agent:`
- `<localpart>` must be non-empty
- `<domain>` must be non-empty
- `<localpart>` currently allows ASCII letters, digits, `.`, `_`, `-`, and `+`
- `<domain>` is validated as DNS-like labels joined by `.`
- domain labels must not be empty
- domain labels must not begin or end with `-`
- domain labels currently allow only ASCII letters, digits, and `-`

## Current Validation Scope

This baseline is now implemented in:

- Rust homeserver identity parsing
- Python SDK recipient and AgentCard validation
- TypeScript SDK recipient and AgentCard validation

## Discovery Expectations

- the requested discovery domain is the authority for the Agent ID domain
- delegated discovery may move the fetch location for `/.well-known/agent-card`
- delegated discovery does not change the expected Agent ID domain
- a discovered AgentCard should still carry an `agent_id` whose domain matches the originally requested domain

## Delegation Baseline

- SDKs may follow `/.well-known/afp-delegation`
- non-local development may delegate only to `https://...` targets
- localhost development may use `http://...` or `https://...` delegation targets

## Discovery Trust Modes

- `strict`
  - default mode
  - discovered AgentCards must belong to the originally requested domain
  - cached keys must continue to match on later discoveries
- `tofu`
  - trust on first use
  - discovered AgentCards may be accepted on first encounter even when delegation changes the fetch location
  - once a key is cached for an Agent ID, later discoveries must match that cached key

## Future Work

- promote this baseline into a fully versioned protocol artifact
- define canonical normalization rules
- build on the current AgentCard `key_id` and `previous_key_ids` metadata with fuller rotation and revocation semantics
- define hosted and federated delegation trust modes
