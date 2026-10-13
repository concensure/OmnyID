# RELAY-00: Wedding Vendor Email Relay Decisions

Date: 2026-10-13

## Accepted transport and address decisions

- Inbound mail remains on Cloudflare Email Routing. The existing catch-all will
  eventually invoke a dedicated, versioned Email Worker; it must not forward
  wedding mail to Gmail or any human mailbox.
- The canonical product-facing mask is
  `<name-one>-<name-two>-<year>@mail.omnyid.com`. This supersedes the earlier
  apex-address example in the proposed specification, at the owner's explicit
  direction, and preserves the apex for existing OmnyID addresses.
- Cloudflare Email Sending is the primary outbound provider. Resend is a
  fallback provider only. Neither provider is a silent substitute for a
  user's Gmail OAuth credentials, Gmail SMTP credentials, or another personal
  mailbox.
- Relay configuration is isolated under `OMNYID_VENDOR_MAIL_*`. Secrets use
  file-backed `*_FILE` references and are synchronized by the existing Oracle
  secret-sync workflow. Secrets, raw provider payloads, and correspondence
  plaintext are never committed.
- Live relay sending is disabled by default and remains disabled until the
  security, webhook-verification, and provider-readiness gates in RELAY-14
  have passed.

## Temporary legacy Gmail transport

On 2026-10-14 the owner directed that the existing Gmail wiring remain the
live transport while the Cloudflare Email Routing API is unavailable. This is
a temporary continuity decision, not a change to the accepted relay design:

- Existing general and wedding follow-up mail continues through the already
  deployed Gmail configuration. No new relay path is enabled and no Gmail
  credential is copied into `OMNYID_VENDOR_MAIL_*` configuration.
- Cloudflare routing, DNS, MX/SPF, catch-all, Worker, and Resend settings are
  unchanged. In particular, this decision does not authorize a Gmail
  forwarder for the future mask domain.
- The relay configuration and AFP contracts may be developed disabled, but
  must fail closed until the Cloudflare inventory, gateway-capsule boundary,
  authenticated ingress, and independent security review are complete.
- The future relay still uses `@mail.omnyid.com`, Cloudflare Email Sending as
  primary outbound transport, and Resend only as its provider fallback. A
  later cutover requires an explicit release decision and machine evidence.

## Cloudflare control-plane safety gate

Before changing any Email Routing rule or DNS record, save all of the
following for zone `1e9906283b35a7537f3f4345a2c4083e`:

1. `GET /zones/{zone_id}/email/routing/rules`;
2. `GET /zones/{zone_id}/email/routing/rules/catch_all` (the exact JSON is
   the rollback input for a `PUT`);
3. `GET /zones/{zone_id}/email/routing`;
4. `GET /accounts/{account_id}/email/routing/addresses`;
5. the DNS export.

The capture script is `scripts/capture-cloudflare-email-routing-inventory.ps1`.
It writes a dedicated rollback payload and never prints the API token.

The token supplied on 2026-10-13 verifies for ordinary zone/account reads,
but Cloudflare's Email Routing rules endpoint still returns error `10000`.
No routing or DNS mutation has therefore been made. The required token must
allow Email Routing Rules read/edit and Email Sending edit for the relevant
resources before work continues at the Cloudflare control plane.

## Provider-event endpoints (after authenticated gateway implementation)

- Cloudflare Worker inbound: `https://api.omnyid.com/integrations/vendor-email/cloudflare/inbound`
- Resend event webhook: `https://api.omnyid.com/integrations/vendor-email/resend/events`

Resend should subscribe only to sent, delivered, delayed, bounced, complained,
and failed delivery events. Open/click tracking events are intentionally out
of scope for the wedding relay privacy model.

## Ownership and remaining release gates

The account owner must name the DNS owner, Cloudflare/provider-account owner,
privacy reviewer, independent security reviewer, and production approver
before live traffic is enabled. The gateway key/KMS boundary, quarantine
lifetime, collision-word vocabulary, native-AFP default, and post-wedding
archive policy also require recorded approval.
