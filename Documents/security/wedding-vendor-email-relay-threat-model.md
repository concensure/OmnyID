# Wedding Vendor Email Relay Threat Model (draft)

Date: 2026-10-14

Status: draft; independent security review is required before any relay is
enabled. This document does not approve Cloudflare routing, DNS, Worker,
Resend, or production email changes.

## Trust boundaries and controls

| Boundary | Main risk | Required control and owner |
| --- | --- | --- |
| Internet sender to Cloudflare Worker | spoofed or oversized mail | signed, timestamped Worker envelope; raw digest; replay store; MIME limits. Platform security owner. |
| Worker to gateway | replay, substitution, raw-content logging | TLS plus rotating shared secret or mTLS; nonce bound to recipient, digest and expiry; content-free logs. Gateway owner. |
| Gateway to AFP ledger | plaintext or cross-tenant writes | exact active-mask and selected-vendor resolution before parsing; encrypted AFP only; opaque sidecars. Gateway owner. |
| Provider callbacks | forged delivery/bounce events | provider signature verification, event-ID dedupe, bounded error codes. Provider owner. |
| Browser to relay API | tenant enumeration and unauthorized reads | session/CSRF protection, server-side owner resolution, indistinguishable not-found/forbidden results. Application owner. |
| Gateway plaintext memory | compromise or accidental retention | short-lived buffers, no raw payload queues/traces, best-effort zeroization, incident rotation. Security owner. |
| Encrypted objects and export | key loss or unintended disclosure | per-object encryption, owner-authorized streams, client-side export decrypt, deletion/key-destruction workflow. Privacy owner. |

## Threats that must fail closed

- Friendly mask guessing does not authenticate a person or select a tenant.
- Forged, stale, altered, duplicate, unknown-mask, inactive-mask, and
  unselected-sender inbound deliveries are rejected or quarantined without an
  AFP message.
- Duplicate sends use an AFP-bound idempotency key and a provider receipt; no
  retry may create another external delivery after a known accepted receipt.
- MIME nesting, decompression bombs, tracking pixels, executable/polyglot
  attachments, prompt injection, and remote-content loads are treated as
  untrusted input and cannot trigger automatic send, booking, payment, or link
  execution.
- Bounces and complaints are deduplicated and suppress unsafe automatic retry.
- Partner access expiry, identity/mask confusion, deletion failure, provider
  credential compromise, and gateway-key loss require explicit incident and
  rotation procedures before launch.
- A vendor cannot claim an arbitrary sender address. Connected-mailbox use is
  bound to the authenticated vendor owner and current OAuth connection; an
  OmnyID vendor mask is bound to one verified listing owner through an opaque
  internal identity. Reclaiming a listing archives the previous identity.
- Apex aliases such as `privacy`, `hello`, `support`, `admin`, `noreply`, and
  `wedding` are reserved. The existing explicit routes must remain ahead of a
  future catch-all, and an unknown or archived vendor mask must fail closed.

## Honest privacy language

Use: “Emails to this vendor are sent from your dedicated OmnyID wedding
address. Their replies appear in your Response Queue. OmnyID never connects to
or reads your personal inbox.”

Do not call ordinary Internet email end-to-end encrypted. The sending
provider, receiving vendor mail system, Cloudflare routing/Worker, and isolated
gateway are plaintext processing boundaries before content is encrypted for
the planner ledger.

## Residual risks and release blockers

Providers and vendors can access ordinary email content in transit or at rest
within their respective systems. A friendly address is public and enumerable;
rate limits reduce abuse but do not make it secret. Deletion cannot retract a
message already delivered to a vendor.

Before enablement, the named security reviewer must approve the gateway key
design, ingress authentication/replay defense, attachment isolation,
authorization tests, retention/deletion procedure, incident response, and
credential rotation runbook. The privacy reviewer must approve the customer
copy and retention policy.
