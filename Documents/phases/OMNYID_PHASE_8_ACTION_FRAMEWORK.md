# Omnyid Phase 8 Action and Integration Framework

## Phase 8: Action and Integration Framework

Status: in progress

Purpose: define how agents take auditable real-world actions without hardcoding one provider into AFP itself.

## What Was Landed

### Integration Runtime Contract

- [src/integration.rs](/c:/Users/joes/Desktop/projects/Agenton/src/integration.rs) now defines:
  - `ApprovalMode`
  - `IntegrationTransport`
  - `IntegrationCapability`
  - `ActionIntent`
  - `ActionResult`
- The contract keeps provider, scope, approval, secret references, and audit result structure explicit.

### Shared Audit Shape

- `IntegrationCapability::audit_message_type()` now produces a consistent provider-and-operation message type shape such as `action_stripe_charge`.
- The tests in [src/integration.rs](/c:/Users/joes/Desktop/projects/Agenton/src/integration.rs) keep the action contract grounded in the same shared `thread_id` history used by inbox and workspace flows.

### Durable Capability And Audit Tables

- [postgres/migrations/0002_workflow_state.sql](/c:/Users/joes/Desktop/projects/Agenton/postgres/migrations/0002_workflow_state.sql) now adds:
  - `integration_capabilities`
  - `action_audit_log`
- [src/db.rs](/c:/Users/joes/Desktop/projects/Agenton/src/db.rs) now includes:
  - `upsert_integration_capability(...)`
  - `record_action_result(...)`

### Reviewable Action Approval Surface

- [ui/components/ApprovalQueue.tsx](/c:/Users/joes/Desktop/projects/Agenton/ui/components/ApprovalQueue.tsx) now gives the workspace a first in-product review queue for risky agent actions.
- [ui/schema.ts](/c:/Users/joes/Desktop/projects/Agenton/ui/schema.ts) now derives approval items directly from AFP thread messages using `approval_mode`, action status, and risky action heuristics for reply, forward, payment, booking, and destructive operations.
- [ui/config.json](/c:/Users/joes/Desktop/projects/Agenton/ui/config.json) now exposes a dedicated `approvals` section in the workspace.
- [src/server.rs](/c:/Users/joes/Desktop/projects/Agenton/src/server.rs) now exposes `POST /actions/decision`, which appends an `action_approval_decision` AFP message to the same thread and records a matching audit entry.
- The workspace queue now posts approval decisions to that route, so review actions are no longer browser-only state.
- Risky outbound message types such as `email_outgoing`, `action_reply`, and `action_forward` are now held in a pending state until approval exists, and approved decisions can trigger the execution path from the same thread history.

### Consent And Runtime Lifecycle Controls

- [src/server.rs](/c:/Users/joes/Desktop/projects/Agenton/src/server.rs) now exposes:
  - `GET /dashboard/support-access`
  - `POST /dashboard/support-access`
  - `GET /dashboard/support-access/history`
  - `GET /dashboard/runtime-backups`
  - `POST /dashboard/runtime-backups`
  - `POST /runtime/destroy`
  - `POST /dashboard/account/delete`
- [src/db.rs](/c:/Users/joes/Desktop/projects/Agenton/src/db.rs) now persists and lists support-consent grants, including recent history for user-visible audit.
- [src/metrics.rs](/c:/Users/joes/Desktop/projects/Agenton/src/metrics.rs) now tracks `rate_limited_requests_total` so abuse-control visibility exists without logging request content.
- [src/server.rs](/c:/Users/joes/Desktop/projects/Agenton/src/server.rs) now also scaffolds a Coolify-friendly `python-runner-chat` runtime with a lightweight built-in chat window and bring-your-own API key env flow, alongside the existing CrewAI runtime path.
- [src/server.rs](/c:/Users/joes/Desktop/projects/Agenton/src/server.rs) and the `runtime-templates/python-runner-chat` scaffold now push that hosted Python runner closer to a real non-technical "Zapier for agents" path with:
  - sandbox/resource defaults
  - starter templates
  - preinstalled daily-use toolchain packages
  - runtime policy files
  - a richer in-runtime IDE surface for chat, traces, prompt history, replay, and review queue
- [src/server.rs](/c:/Users/joes/Desktop/projects/Agenton/src/server.rs) now also exposes anonymous `python-runner` trial endpoints with strict no-persistence limits and an upgrade handoff into signup or `Agent ID only`.
- [src/server.rs](/c:/Users/joes/Desktop/projects/Agenton/src/server.rs) now also exposes `GET/POST /runtime/runner-config` so the signed-in Python runner can read and update model, tool, and channel policy without exposing full runtime secrets.
- [docs/index.html](/c:/Users/joes/Desktop/projects/Agenton/docs/index.html) and [docs/app.js](/c:/Users/joes/Desktop/projects/Agenton/docs/app.js) now also expose that Python runner policy surface in-product, so signed-in users can manage model mode, enabled tools, and channel exposure from the dashboard rather than dropping into generated files.
- that in-product Python runner policy surface now also manages starter-template defaults plus per-run token caps and daily/monthly spend caps, and syncs those settings back into both `runtime_policy.json` and `agent_profile.json` for the generated hosted runtime.
- the hosted control plane now also records metadata-only Python runner policy save events and shows recent policy history in the dashboard, preserving auditability without surfacing tenant content.
- the Python runner policy surface now also manages the web tool hostname allowlist, so default-deny outbound HTTP can be selectively opened per workspace instead of being hardcoded.
- [src/server.rs](/c:/Users/joes/Desktop/projects/Agenton/src/server.rs) now also generates a FastAPI AFP service-adapter starter bundle for universities and small businesses, giving them a lightweight path to expose signed capability endpoints over HTTPS.
- [src/server.rs](/c:/Users/joes/Desktop/projects/Agenton/src/server.rs) and [src/db.rs](/c:/Users/joes/Desktop/projects/Agenton/src/db.rs) now also expose hosted runtime update policy, scaffold-version checks, and manual scaffold refresh apply controls without requiring tenant-content inspection.
- [src/server.rs](/c:/Users/joes/Desktop/projects/Agenton/src/server.rs) now also exposes a metadata-only runtime recovery packet export so users can take away one local handoff containing runtime deployment state, update policy, backup inventory, and restore-drill context.
- The hosted dashboard now lets the user:
  - open a temporary support window
  - revoke it immediately
  - review recent consent history
  - set hosted runtime backup retention
  - create metadata-only hosted runtime snapshots
  - review snapshot timing and expiry without pulling runtime file contents into the central dashboard
  - download snapshot manifests directly
  - delete hosted metadata snapshots without operator help
  - run restore drills from a selected snapshot so backup recovery practice becomes a user-visible audit trail
  - save a hosted runtime update policy, check scaffold-version drift, and apply scaffold-only hosted updates
  - export a metadata-only runtime recovery packet for local safekeeping before a real recovery event
  - explicitly destroy the hosted Crew runtime and remove its managed workspace under the OmnyID runtime root
  - explicitly delete the hosted account with typed confirmation, including managed runtime teardown and server-side Agent-ID-scoped history purge for that account
  - review active hosted-account sessions and revoke stale sessions or all other sessions without operator intervention
- [src/server.rs](/c:/Users/joes/Desktop/projects/Agenton/src/server.rs) now also applies first-pass in-memory rate limiting to public signup/auth flows and high-impact hosted mutations such as runtime deploy/destroy, support-access changes, backup writes, restore drills, and account deletion.

## Still Remaining In Phase 8

- real provider adapters for Gmail API v1, Microsoft Graph, Stripe, Expedia, Notion, and generic REST/GraphQL
- approval policy enforcement across SDKs and broader execution workers beyond the current outbound email path
- secret storage, token refresh, and execution worker plumbing
- action execution and result persistence as first-class AFP messages

## Notes

Phase 8 now has a code-level contract for typed integrations, which is the right boundary before wiring real provider adapters.

### Unified Command Bar And Runner Editing

- [src/server.rs](/c:/Users/joes/Desktop/projects/Agenton/src/server.rs) now also exposes safe Python runner workspace editing routes:
  - `GET /runtime/workspace-files`
  - `GET /runtime/workspace-file`
  - `POST /runtime/workspace-file`
- [src/server.rs](/c:/Users/joes/Desktop/projects/Agenton/src/server.rs) now also exposes `POST /ui/command`, which lets the unified search bar classify dashboard, search, and Python-runner edit intent.
- The new Solid shell in [solid-ui](/C:/Users/joes/Desktop/projects/Agenton/solid-ui) uses those routes to pivot command-bar code requests into a review-required Python-runner draft flow instead of silently mutating runtime code.
