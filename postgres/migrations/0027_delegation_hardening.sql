-- Migration 0027: Delegation Hardening — Phase 2 items 25–27
-- Adds per-node capability validation, outbound allowlist, and context snapshot
-- to the AgentDelegation record so policy enforcement is structural, not advisory.

-- allowed_capabilities: the intersection of the node's configured capabilities
-- and the global PolicyEngine set, resolved at delegation-issuance time.
ALTER TABLE agent_delegations
    ADD COLUMN IF NOT EXISTS allowed_capabilities JSONB NOT NULL DEFAULT '[]';

-- outbound_allowlist: URL host allowlist extracted from the compiled IR node
-- manifest at delegation time. rest_adapter checks every outbound call against
-- this list before any HTTP execution or Ed25519 signing.
ALTER TABLE agent_delegations
    ADD COLUMN IF NOT EXISTS outbound_allowlist JSONB NOT NULL DEFAULT '[]';

-- context_snapshot: optional pre-loaded context handed to the sub-agent so it
-- does not need round-trip AFP callbacks. Contains AFP thread slice, prior step
-- results, node system/instruction prompts, and a token-budget hint.
ALTER TABLE agent_delegations
    ADD COLUMN IF NOT EXISTS context_snapshot JSONB;
