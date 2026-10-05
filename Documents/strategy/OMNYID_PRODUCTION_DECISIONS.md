# Omnyid Production Decisions

> Status note as of Wednesday, August 26, 2026: this document defines production posture defaults, not the live operator verdict. For current audited readiness and promotion state, defer to `docs/COMMERCIAL_READINESS_STATUS.md` and the `artifacts/*-current` readiness artifacts. The current audited commercial status is `ready` with promotion gate `go`.

## Production Profile

These decisions are now the default production posture for Omnyid unless explicitly revised.

## Domains and Topology

- Main domain: `omnyid.com`
- Hosted homeserver subdomain: `cloud.omnyid.com`
- Public API and relay subdomain: `api.omnyid.com`
- WebTransport subdomain: `wt.omnyid.com`
- Subdomains are the production standard.
- Discovery should remain domain-authoritative through `/.well-known/...` plus delegation where needed.

## Hosting Targets

- Primary self-host reference: Oracle Cloud
- Secondary hosted target: OVHcloud
- Public hosted Omnyid will use cloud secret management rather than plain environment-only secret handling.

## Email Launch Scope

- Launch provider scope:
  - Gmail
  - custom IMAP/SMTP
- OAuth is the preferred path.
- Direct IMAP/SMTP credentials remain fallback for custom domains only.
- Refresh tokens may be stored server-side when:
  - encrypted at rest
  - wrapped with user-scoped key material where possible
  - treated as separate from AFP message encryption keys

This token decision must not weaken:

- bring-your-own LLM API key support
- agent-relay E2EE
- three separate key domains are required:
  - AFP relay signing and E2EE keys
  - provider-token wrapping keys
  - user LLM and integration secret keys

## Transport

- Public production direction:
  - WebTransport primary target
  - WebSocket fallback
- gRPC remains internal and is not the main public SDK transport.
- QUIC-capable ingress on UDP `443` is required for the WebTransport path.
- Internal gRPC is disabled by default in production and, when enabled, should bind to loopback or a private service network only.

## Security Posture

- Agent relay E2EE is mandatory in production.
- Insecure modes remain local-development only.
- Scheduled key rotation target: 90 days
- Emergency rotation support is required.
- Hosted/cloud production uses a secret manager.

## Attachments

- SeaweedFS is the attachment storage baseline.
- Default production attachment limit: 25 MB

## Launch Product Priorities

1. inbox triage
2. thread detail
3. action approvals
4. richer workspace canvas

## Integration Scope For Launch

- Gmail or Outlook actions matching the chosen provider path
- generic REST
- Notion or Stripe

Initial integration count should stay intentionally small.

## LLM Backends

Three backends are supported per-user via `POST /user/llm-config`:

| Backend | Value | Plan | Notes |
|---|---|---|---|
| `hosted` | Anthropic claude-haiku (platform key) | Pro | Platform absorbs cost; $9/mo plan |
| `byok` | Any Anthropic-compatible key (user-supplied) | Free | User provides key; no platform cost |
| `ollama` | Local Ollama instance | Free | No external calls |
| `runpod` | QWEN 3.5 on RunPod (platform-hosted) | Pro | `Qwen/Qwen3.5-35B-A3B`; endpoint `sdr11n90qjwjy2` |

Agent-to-agent communication always uses AFP over WebTransport/WebSocket. LLM backend selection is only for inference. Gmail/IMAP is only for human inbox ingestion using the user's own OAuth token, not server-level SMTP.

## Approval Defaults

Autonomous by default:

- summarise
- label
- star
- archive

Approval required by default:

- send or reply externally
- payments
- bookings
- destructive API actions

## Personalization

- LoRA personalization is post-launch.
- It should not delay the first production release.

## Deployment Model

- Single-user homeserver first
- Minimal metadata visible to the host
- Strong privacy guarantees take priority over rapid multi-tenant expansion
